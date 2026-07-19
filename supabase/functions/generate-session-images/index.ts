import {
  createAdminClient,
  createImageGenerationKey,
  createSignedStorageUrl,
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
  uploadImageBytes,
} from "../_shared/image-storage.ts";
import {
  base64ToBytes,
  getImageGenerationUser,
  IMAGE_GENERATION_BUCKET,
  requireImageGenerationSession,
  serializeImageGenerationAsset,
} from "../_shared/image-generation.ts";
import { normalizeVeniceImageSettings } from "../_shared/venice-image-models.ts";

const VENICE_BASE_URL = "https://api.venice.ai/api/v1/image";

function titleFromPrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "New Generation";
  const maxLength = 64;
  if (normalized.length <= maxLength) return normalized;
  const truncated = normalized.slice(0, maxLength - 1);
  const lastWord = truncated.lastIndexOf(" ");
  return `${(lastWord > 24 ? truncated.slice(0, lastWord) : truncated).trim()}...`;
}

function serializeProviderError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error || "Generation failed.") };
  const source = error as Record<string, unknown>;
  return {
    name: typeof source.name === "string" ? source.name : undefined,
    message: typeof source.message === "string" ? source.message : undefined,
    status: typeof source.status === "number" ? source.status : undefined,
    raw: source.raw ?? source.body ?? source.error ?? null,
  };
}

async function loadReferenceBase64(assets: Array<Record<string, unknown>>) {
  const bucket = IMAGE_GENERATION_BUCKET();
  return Promise.all(assets.map(async (asset) => {
    const key = String(asset.storage_key || "");
    const url = await createSignedStorageUrl({ bucket, key, expiresIn: 900 });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load reference image ${asset.original_filename || key}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    return btoa(binary);
  }));
}

async function loadReferenceFiles(assets: Array<Record<string, unknown>>) {
  const bucket = IMAGE_GENERATION_BUCKET();
  return Promise.all(assets.map(async (asset, index) => {
    const key = String(asset.storage_key || "");
    const url = await createSignedStorageUrl({ bucket, key, expiresIn: 900 });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load reference image ${asset.original_filename || key}.`);
    const contentType = String(asset.content_type || response.headers.get("content-type") || "image/png");
    const filename = String(asset.original_filename || `reference-${index + 1}.png`);
    return {
      filename,
      contentType,
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  }));
}

async function veniceRequest(path: string, payload: Record<string, unknown>, expectJson: boolean) {
  const response = await fetch(`${VENICE_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv("VENICE_API_KEY")}`,
      "Content-Type": "application/json",
      Accept: expectJson ? "application/json" : "image/png,application/octet-stream",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const raw = await response.json().catch(async () => ({ text: await response.text().catch(() => "") }));
    const error = new Error(typeof raw?.message === "string" ? raw.message : `Venice returned HTTP ${response.status}.`);
    Object.assign(error, { status: response.status, raw });
    throw error;
  }
  if (expectJson) return await response.json();
  return new Uint8Array(await response.arrayBuffer());
}

async function openAiRequest(path: string, body: BodyInit, isMultipart = false) {
  const response = await fetch(`https://api.openai.com/v1/images${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv("OPENAI_API_KEY")}`,
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
    },
    body,
  });
  const rawText = await response.text();
  let raw: unknown = rawText;
  try { raw = rawText ? JSON.parse(rawText) : {}; } catch (_) { /* retain text response */ }
  if (!response.ok) {
    const message = raw && typeof raw === "object" && "error" in raw && typeof (raw as { error?: { message?: unknown } }).error?.message === "string"
      ? String((raw as { error: { message: string } }).error.message)
      : `OpenAI returned HTTP ${response.status}.`;
    const error = new Error(message);
    Object.assign(error, { status: response.status, raw });
    throw error;
  }
  return raw as { data?: Array<{ b64_json?: string }> };
}

function buildOpenAiPayload(settings: ReturnType<typeof normalizeVeniceImageSettings>, prompt: string) {
  const payload: Record<string, unknown> = {
    model: "gpt-image-2",
    prompt,
    n: settings.n,
    size: settings.size,
    quality: settings.quality || "auto",
    output_format: settings.format,
    background: settings.background || "auto",
    moderation: settings.moderation,
  };
  if (settings.format === "jpeg" || settings.format === "webp") payload.output_compression = settings.compression ?? 90;
  return payload;
}

async function openAiEditRequest(settings: ReturnType<typeof normalizeVeniceImageSettings>, prompt: string, references: Array<Record<string, unknown>>) {
  const form = new FormData();
  const payload = buildOpenAiPayload(settings, prompt);
  for (const [key, value] of Object.entries(payload)) form.set(key, String(value));
  const files = await loadReferenceFiles(references);
  files.forEach((file) => form.append("image[]", new Blob([file.bytes], { type: file.contentType }), file.filename));
  return openAiRequest("/edits", form, true);
}

function parseOpenAiImages(result: { data?: Array<{ b64_json?: string }> }, settings: ReturnType<typeof normalizeVeniceImageSettings>) {
  const base64s = Array.isArray(result.data)
    ? result.data.map((image) => image?.b64_json).filter((image): image is string => typeof image === "string" && image.length > 0)
    : [];
  if (!base64s.length) throw new Error("OpenAI did not return image data.");
  const contentType = settings.format === "jpeg" ? "image/jpeg" : `image/${settings.format}`;
  return base64s.map((base64) => ({ bytes: base64ToBytes(base64), contentType }));
}

function buildVeniceGeneratePayload(settings: ReturnType<typeof normalizeVeniceImageSettings>, prompt: string) {
  const payload: Record<string, unknown> = {
    model: settings.model,
    prompt,
    format: settings.format,
    variants: settings.n,
    return_binary: false,
    // Venice safe mode is enabled by default. "Low" is the requested lower
    // moderation setting and maps to the provider's explicit false value.
    safe_mode: settings.moderation !== "low",
  };
  if (settings.aspectRatio) payload.aspect_ratio = settings.aspectRatio;
  if (settings.resolution) payload.resolution = settings.resolution;
  return payload;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  let messageId = "";
  let supabase: ReturnType<typeof createAdminClient> | null = null;
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json();
    const sessionId = String(body.sessionId || "").trim();
    const prompt = String(body.prompt || "").trim();
    if (!sessionId || !prompt) return jsonResponse({ error: "A session and prompt are required." }, 400);
    if (prompt.length > 32000) return jsonResponse({ error: "Prompts may not exceed 32,000 characters." }, 400);
    const session = await requireImageGenerationSession(sessionId, appUser.id);
    const settings = normalizeVeniceImageSettings((body.settings || session.active_settings || {}) as Record<string, unknown>);
    if (prompt.length > settings.maxPromptCharacters) {
      return jsonResponse({
        error: `${settings.modelLabel} supports prompts up to ${settings.maxPromptCharacters.toLocaleString()} characters. Please shorten the current prompt.`,
      }, 400);
    }
    supabase = createAdminClient();

    const pendingCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: activeGeneration, error: activeGenerationError } = await supabase
      .from("image_generation_messages").select("id").eq("session_id", sessionId).eq("user_id", appUser.id)
      .eq("role", "user").eq("status", "pending").gte("created_at", pendingCutoff).limit(1).maybeSingle();
    if (activeGenerationError) throw activeGenerationError;
    if (activeGeneration) return jsonResponse({ error: "An image generation is already in progress for this session.", pending_message_id: activeGeneration.id }, 409);

    const referenceIds = Array.isArray(body.referenceAssetIds) ? body.referenceAssetIds.map(String).filter(Boolean) : [];
    const { data: selectedAssets, error: selectedAssetsError } = referenceIds.length
      ? await supabase.from("image_generation_assets").select("*").eq("session_id", sessionId).eq("user_id", appUser.id).in("id", referenceIds)
      : { data: [], error: null };
    if (selectedAssetsError) throw selectedAssetsError;
    const references = [...(selectedAssets || [])];
    if (body.useLastGenerated) {
      const { data: lastGenerated, error: lastError } = await supabase
        .from("image_generation_assets").select("*").eq("session_id", sessionId).eq("user_id", appUser.id)
        .eq("asset_kind", "output").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lastError) throw lastError;
      if (lastGenerated && !references.some((asset) => asset.id === lastGenerated.id)) references.unshift(lastGenerated);
    }
    if (references.length && !settings.supportsReferences) return jsonResponse({ error: `${settings.modelLabel} does not support reference images.` }, 400);
    if (references.length > settings.maxReferences) return jsonResponse({ error: `Select no more than ${settings.maxReferences} reference images for ${settings.modelLabel}.` }, 400);
    if (references.length && settings.n !== 1) return jsonResponse({ error: "Reference-image edits return one image per request." }, 400);
    if (settings.provider === "openai" && settings.quality === "high") {
      return jsonResponse({
        error: "High-quality GPT Image 2 outputs run through the Vercel image route. Refresh the page and try again.",
      }, 400);
    }

    const endpoint = references.length ? "edits" : "generations";
    const snapshot = { ...settings, endpoint, reference_count: references.length };
    const { data: pendingMessage, error: pendingError } = await supabase.from("image_generation_messages").insert({
      session_id: sessionId, user_id: appUser.id, role: "user", content: prompt, status: "pending", endpoint,
      settings_snapshot: snapshot, reference_asset_ids: references.map((asset) => asset.id),
    }).select("*").single();
    if (pendingError || !pendingMessage) throw pendingError || new Error("Could not save the prompt.");
    messageId = pendingMessage.id;

    if (String(session.title || "").trim().toLowerCase() === "new generation") {
      const { error: titleError } = await supabase.from("image_generation_sessions")
        .update({ title: titleFromPrompt(prompt), active_settings: snapshot, updated_at: new Date().toISOString() })
        .eq("id", sessionId).eq("user_id", appUser.id);
      if (titleError) throw titleError;
    } else {
      const { error: settingsError } = await supabase.from("image_generation_sessions")
        .update({ active_settings: snapshot, updated_at: new Date().toISOString() }).eq("id", sessionId).eq("user_id", appUser.id);
      if (settingsError) throw settingsError;
    }

    // Session history is persisted for the interface, but it is deliberately
    // not sent to Venice. Image models can otherwise blend earlier requests
    // into the newest image, and Flux 2 Pro has a 3,000-character prompt cap.
    const compiledPrompt = prompt;
    let generated: Array<{ bytes: Uint8Array; contentType: string }> = [];
    if (settings.provider === "openai") {
      const result = references.length
        ? await openAiEditRequest(settings, compiledPrompt, references)
        : await openAiRequest("/generations", JSON.stringify(buildOpenAiPayload(settings, compiledPrompt)));
      generated = parseOpenAiImages(result, settings);
    } else if (references.length) {
      if (!settings.editModelId) throw new Error(`${settings.modelLabel} does not have a configured Venice edit model.`);
      const images = await loadReferenceBase64(references);
      const bytes = images.length === 1
        ? await veniceRequest("/edit", { model: settings.editModelId, prompt: compiledPrompt, image: images[0] }, false)
        : await veniceRequest("/multi-edit", { modelId: settings.editModelId, prompt: compiledPrompt, images }, false);
      generated = [{ bytes: bytes as Uint8Array, contentType: "image/png" }];
    } else {
      const result = await veniceRequest("/generate", buildVeniceGeneratePayload(settings, compiledPrompt), true) as { images?: unknown };
      const base64s = Array.isArray(result.images) ? result.images.filter((image): image is string => typeof image === "string" && image.length > 0) : [];
      if (!base64s.length) throw new Error("Venice did not return image data.");
      generated = base64s.map((base64) => ({ bytes: base64ToBytes(base64), contentType: settings.format === "jpeg" ? "image/jpeg" : `image/${settings.format}` }));
    }

    const { data: stillPending, error: stillPendingError } = await supabase.from("image_generation_messages")
      .select("status").eq("id", messageId).eq("user_id", appUser.id).maybeSingle();
    if (stillPendingError) throw stillPendingError;
    if (stillPending?.status !== "pending") return jsonResponse({ error: "This image generation was cancelled." }, 409);

    const assets = [];
    for (let index = 0; index < generated.length; index += 1) {
      const image = generated[index];
      const id = crypto.randomUUID();
      const extension = image.contentType === "image/jpeg" ? "jpg" : image.contentType === "image/webp" ? "webp" : "png";
      const key = createImageGenerationKey("output", id, extension);
      await uploadImageBytes({ bytes: image.bytes, key, contentType: image.contentType });
      const { data, error } = await supabase.from("image_generation_assets").insert({
        id, session_id: sessionId, message_id: messageId, user_id: appUser.id, asset_kind: "output", storage_key: key,
        original_filename: `${id}.${extension}`, content_type: image.contentType, byte_size: image.bytes.byteLength,
        sort_order: index, generation_settings: snapshot,
      }).select("*").single();
      if (error || !data) throw error || new Error("Could not save generated image metadata.");
      assets.push(await serializeImageGenerationAsset(data));
    }
    const { data: assistantMessage, error: assistantError } = await supabase.from("image_generation_messages").insert({
      session_id: sessionId, user_id: appUser.id, role: "assistant", content: `Generated ${assets.length} image${assets.length === 1 ? "" : "s"}.`,
      status: "completed", endpoint, settings_snapshot: snapshot,
    }).select("*").single();
    if (assistantError) throw assistantError;
    await supabase.from("image_generation_messages").update({ status: "completed" }).eq("id", messageId).eq("status", "pending");
    const { data: finalSession } = await supabase.from("image_generation_sessions").select("*").eq("id", sessionId).single();
    return jsonResponse({ session: finalSession, userMessage: { ...pendingMessage, status: "completed" }, assistantMessage, assets });
  } catch (error) {
    console.error(error);
    const errorDetails = serializeProviderError(error);
    if (supabase && messageId) await supabase.from("image_generation_messages").update({
      status: "failed", error_message: error instanceof Error ? error.message : "Generation failed.", error_details: errorDetails,
    }).eq("id", messageId).eq("status", "pending");
    return jsonResponse({ ...describeError(error, "Could not generate session images."), error_details: errorDetails }, 500);
  }
});
