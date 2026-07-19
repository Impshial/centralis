const crypto = require("crypto");

const OPENAI_IMAGE_MODEL = "gpt-image-2";
const IMAGE_GENERATION_BUCKET = () => requiredEnv("IDRIVE_E2_BUCKET");
const ACTIVE_GENERATION_WINDOW_MS = 20 * 60 * 1000;
const MAX_PROMPT_CHARACTERS = 32000;
const MAX_REFERENCES = 16;
const MAX_OUTPUTS = 10;

function json(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function requiredEnv(name, aliases = []) {
  const value = [name, ...aliases].map((key) => process.env[key]).find(Boolean);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getSupabaseUrl() {
  return requiredEnv("SUPABASE_URL")
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "")
    .replace(/\/auth\/v1$/i, "");
}

function getSupabasePublishableKey() {
  return requiredEnv("SUPABASE_PUBLISHABLE_KEY", ["SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"]);
}

function getSupabaseSecretKey() {
  return requiredEnv("SUPABASE_SECRET_KEY", ["SUPABASE_SERVICE_ROLE_KEY"]);
}

function getStorageEndpoint() {
  const endpoint = requiredEnv("IDRIVE_E2_ENDPOINT", ["IDRIVE_ENDPOINT"]).replace(/\/+$/, "");
  return endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
}

function safeTitle(prompt) {
  const normalized = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "New Generation";
  if (normalized.length <= 64) return normalized;
  const truncated = normalized.slice(0, 63);
  const lastWord = truncated.lastIndexOf(" ");
  return `${(lastWord > 24 ? truncated.slice(0, lastWord) : truncated).trim()}...`;
}

function parseAuthorization(req) {
  const header = req.headers.authorization || "";
  if (!header.toLowerCase().startsWith("bearer ")) throw new Error("Missing authorization header.");
  return header.slice(7).trim();
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...options,
    headers: {
      apikey: getSupabaseSecretKey(),
      Authorization: `Bearer ${getSupabaseSecretKey()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = text;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.details || `Supabase returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.raw = payload;
    throw error;
  }
  return payload;
}

async function fetchAuthUser(accessToken, apiKey, label) {
  const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    const error = new Error(payload?.msg || payload?.message || "Supabase rejected the current auth session.");
    error.status = response.status;
    error.raw = { source: label, payload };
    throw error;
  }
  return payload;
}

async function getAuthUser(accessToken) {
  const attempts = [
    ["publishable", getSupabasePublishableKey()],
    ["secret", getSupabaseSecretKey()],
  ];
  const errors = [];
  for (const [label, apiKey] of attempts) {
    try {
      return await fetchAuthUser(accessToken, apiKey, label);
    } catch (error) {
      errors.push({
        source: label,
        status: error.status || null,
        message: error.message,
        raw: error.raw || null,
      });
    }
  }
  const authError = new Error("You must be signed in to generate images.");
  authError.status = 401;
  authError.raw = { auth_validation_errors: errors };
  throw authError;
}

async function getAppUser(authUserId) {
  const rows = await supabaseFetch(`/rest/v1/users?select=id,clerk_user_id&clerk_user_id=eq.${encodeURIComponent(authUserId)}&limit=1`);
  if (!Array.isArray(rows) || !rows[0]) throw new Error("Centralis user profile was not found.");
  return rows[0];
}

async function getSession(sessionId, userId) {
  const rows = await supabaseFetch(`/rest/v1/image_generation_sessions?select=*&id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${userId}&limit=1`);
  if (!Array.isArray(rows) || !rows[0]) throw new Error("Image generation session was not found.");
  return rows[0];
}

function normalizeSettings(raw = {}) {
  const n = Number(raw.n || 1);
  if (!Number.isInteger(n) || n < 1 || n > MAX_OUTPUTS) throw new Error(`Output count must be between 1 and ${MAX_OUTPUTS} for GPT Image 2.`);
  const format = String(raw.format || "png").toLowerCase();
  if (!["png", "jpeg", "webp"].includes(format)) throw new Error("Output format must be PNG, JPEG, or WebP.");
  const quality = String(raw.quality || "auto").toLowerCase();
  if (!["auto", "low", "medium", "high"].includes(quality)) throw new Error("Quality must be Auto, Low, Medium, or High.");
  if (quality !== "high") throw new Error("This endpoint only handles GPT Image 2 High quality generations.");
  const moderation = String(raw.moderation || "low").toLowerCase();
  if (!["auto", "low"].includes(moderation)) throw new Error("Moderation must be Auto or Low.");
  const background = String(raw.background || "auto").toLowerCase();
  if (!["auto", "opaque"].includes(background)) throw new Error("Background must be Auto or Opaque.");
  const compression = Number(raw.compression ?? 90);
  if (!Number.isInteger(compression) || compression < 0 || compression > 100) throw new Error("Compression must be a whole number between 0 and 100.");
  let size = String(raw.size || "auto").toLowerCase();
  const allowedSizes = new Set(["auto", "1024x1024", "1024x1536", "1536x1024", "1536x864", "2560x1440", "1440x2560", "3840x2160", "2160x3840"]);
  if (size === "custom") {
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > 3840 || height > 3840 || width % 16 || height % 16 || (width * height) < 655360 || (width * height) > 8294400 || Math.max(width, height) / Math.min(width, height) > 3) {
      throw new Error("Custom GPT Image 2 dimensions must be multiples of 16, within 16-3840 pixels, use a maximum 3:1 aspect ratio, and contain 655,360-8,294,400 pixels.");
    }
    size = `${width}x${height}`;
  } else if (!allowedSizes.has(size)) {
    throw new Error("Unsupported size for GPT Image 2.");
  }
  return {
    provider: "openai",
    model: OPENAI_IMAGE_MODEL,
    modelLabel: "GPT Image 2",
    maxPromptCharacters: MAX_PROMPT_CHARACTERS,
    n,
    size,
    format,
    moderation,
    quality,
    background,
    compression,
    maxReferences: MAX_REFERENCES,
    supportsReferences: true,
    editModelId: null,
    aspectRatio: null,
    resolution: null,
  };
}

function buildOpenAiPayload(settings, prompt) {
  const payload = {
    model: OPENAI_IMAGE_MODEL,
    prompt,
    n: settings.n,
    size: settings.size,
    quality: settings.quality,
    output_format: settings.format,
    background: settings.background,
    moderation: settings.moderation,
  };
  if (settings.format === "jpeg" || settings.format === "webp") payload.output_compression = settings.compression;
  return payload;
}

async function openAiJson(path, body, isMultipart = false) {
  const response = await fetch(`https://api.openai.com/v1/images${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
    },
    body,
  });
  const text = await response.text();
  let payload = text;
  try { payload = text ? JSON.parse(text) : {}; } catch (_) { /* keep text */ }
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.raw = payload;
    throw error;
  }
  return payload;
}

function hashHex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function signingKey(secret, date, region, service) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function amzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, shortDate: iso.slice(0, 8) };
}

function encodeKey(key) {
  return String(key).split("/").map(encodeURIComponent).join("/");
}

async function signedStorageFetch(method, key, body = null, contentType = "") {
  const bucket = IMAGE_GENERATION_BUCKET();
  const endpoint = getStorageEndpoint();
  const region = process.env.IDRIVE_E2_REGION || "us-east-1";
  const accessKey = requiredEnv("IDRIVE_E2_ACCESS_KEY_ID");
  const secretKey = requiredEnv("IDRIVE_E2_SECRET_ACCESS_KEY");
  const path = `/${bucket}/${encodeKey(key)}`;
  const url = `${endpoint}${path}`;
  const bodyBuffer = body ? Buffer.from(body) : Buffer.alloc(0);
  const payloadHash = hashHex(bodyBuffer);
  const { amzDate, shortDate } = amzDates();
  const host = new URL(endpoint).host;
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(contentType ? { "content-type": contentType } : {}),
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((name) => `${name}:${headers[name]}\n`).join("");
  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${shortDate}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hashHex(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(secretKey, shortDate, region, "s3"), stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: authorization,
    },
    body: method === "GET" ? undefined : bodyBuffer,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Storage ${method} failed for ${key}: HTTP ${response.status}${text ? ` ${text.slice(0, 180)}` : ""}`);
  }
  return response;
}

function presignedStorageUrl(key, expiresIn = 3600) {
  const bucket = IMAGE_GENERATION_BUCKET();
  const endpoint = getStorageEndpoint();
  const region = process.env.IDRIVE_E2_REGION || "us-east-1";
  const accessKey = requiredEnv("IDRIVE_E2_ACCESS_KEY_ID");
  const secretKey = requiredEnv("IDRIVE_E2_SECRET_ACCESS_KEY");
  const path = `/${bucket}/${encodeKey(key)}`;
  const host = new URL(endpoint).host;
  const { amzDate, shortDate } = amzDates();
  const scope = `${shortDate}/${region}/s3/aws4_request`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  });
  const canonicalQuery = [...params.entries()]
    .map(([keyName, value]) => `${encodeURIComponent(keyName)}=${encodeURIComponent(value)}`)
    .sort()
    .join("&");
  const canonicalRequest = ["GET", path, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hashHex(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(secretKey, shortDate, region, "s3"), stringToSign, "hex");
  params.set("X-Amz-Signature", signature);
  return `${endpoint}${path}?${params.toString()}`;
}

function storageKey(kind, id, extension) {
  return `images/image-generation/${kind}/${id}.${extension}`;
}

async function loadReferenceFiles(references) {
  return Promise.all(references.map(async (asset, index) => {
    const response = await signedStorageFetch("GET", asset.storage_key);
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      bytes,
      contentType: asset.content_type || response.headers.get("content-type") || "image/png",
      filename: asset.original_filename || `reference-${index + 1}.png`,
    };
  }));
}

async function callOpenAi(settings, prompt, references) {
  if (!references.length) {
    return openAiJson("/generations", JSON.stringify(buildOpenAiPayload(settings, prompt)));
  }
  const form = new FormData();
  const payload = buildOpenAiPayload(settings, prompt);
  Object.entries(payload).forEach(([key, value]) => form.set(key, String(value)));
  const files = await loadReferenceFiles(references);
  files.forEach((file) => {
    form.append("image[]", new Blob([file.bytes], { type: file.contentType }), file.filename);
  });
  return openAiJson("/edits", form, true);
}

function parseOpenAiImages(result, settings) {
  const base64s = Array.isArray(result?.data)
    ? result.data.map((image) => image?.b64_json).filter(Boolean)
    : [];
  if (!base64s.length) throw new Error("OpenAI did not return image data.");
  const contentType = settings.format === "jpeg" ? "image/jpeg" : `image/${settings.format}`;
  return base64s.map((base64) => ({ bytes: Buffer.from(base64, "base64"), contentType }));
}

function serializeAsset(asset) {
  return {
    ...asset,
    preview_url: asset.storage_key ? presignedStorageUrl(asset.storage_key, 3600) : null,
  };
}

async function insertRow(table, row) {
  const rows = await supabaseFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateRows(table, query, patch) {
  return supabaseFetch(`/rest/v1/${table}${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
}

function providerError(error) {
  if (!error || typeof error !== "object") return { message: String(error || "Generation failed.") };
  return {
    name: error.name,
    message: error.message,
    status: error.status,
    raw: error.raw || null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return json(res, { ok: true, route: "generate-high-image", runtime: "node" });
  }
  if (req.method !== "POST") return json(res, { error: "Method not allowed." }, 405);
  let messageId = "";
  try {
    const token = parseAuthorization(req);
    const authUser = await getAuthUser(token);
    const appUser = await getAppUser(authUser.id);
    const body = await readJsonBody(req);
    const sessionId = String(body.sessionId || "").trim();
    const prompt = String(body.prompt || "").trim();
    if (!sessionId || !prompt) return json(res, { error: "A session and prompt are required." }, 400);
    if (prompt.length > MAX_PROMPT_CHARACTERS) return json(res, { error: "Prompts may not exceed 32,000 characters." }, 400);
    const session = await getSession(sessionId, appUser.id);
    const settings = normalizeSettings(body.settings || session.active_settings || {});

    const pendingCutoff = new Date(Date.now() - ACTIVE_GENERATION_WINDOW_MS).toISOString();
    const activeGeneration = await supabaseFetch(`/rest/v1/image_generation_messages?select=id&session_id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${appUser.id}&role=eq.user&status=eq.pending&created_at=gte.${encodeURIComponent(pendingCutoff)}&limit=1`);
    if (activeGeneration?.[0]) return json(res, { error: "An image generation is already in progress for this session.", pending_message_id: activeGeneration[0].id }, 409);

    const referenceIds = Array.isArray(body.referenceAssetIds) ? body.referenceAssetIds.map(String).filter(Boolean) : [];
    let references = [];
    if (referenceIds.length) {
      references = await supabaseFetch(`/rest/v1/image_generation_assets?select=*&session_id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${appUser.id}&id=in.(${referenceIds.map(encodeURIComponent).join(",")})`);
    }
    if (body.useLastGenerated) {
      const lastRows = await supabaseFetch(`/rest/v1/image_generation_assets?select=*&session_id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${appUser.id}&asset_kind=eq.output&order=created_at.desc&limit=1`);
      const last = lastRows?.[0];
      if (last && !references.some((asset) => asset.id === last.id)) references.unshift(last);
    }
    if (references.length > MAX_REFERENCES) return json(res, { error: `Select no more than ${MAX_REFERENCES} reference images for GPT Image 2.` }, 400);
    if (references.length && settings.n !== 1) return json(res, { error: "Reference-image edits return one image per request." }, 400);

    const endpoint = references.length ? "edits" : "generations";
    const snapshot = { ...settings, endpoint, reference_count: references.length };
    const pendingMessage = await insertRow("image_generation_messages", {
      session_id: sessionId,
      user_id: appUser.id,
      role: "user",
      content: prompt,
      status: "pending",
      endpoint,
      settings_snapshot: snapshot,
      reference_asset_ids: references.map((asset) => asset.id),
    });
    if (!pendingMessage?.id) throw new Error("Could not save the prompt.");
    messageId = pendingMessage.id;

    const sessionPatch = { active_settings: snapshot, updated_at: new Date().toISOString() };
    if (String(session.title || "").trim().toLowerCase() === "new generation") sessionPatch.title = safeTitle(prompt);
    await updateRows("image_generation_sessions", `?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${appUser.id}`, sessionPatch);

    const result = await callOpenAi(settings, prompt, references);
    const generated = parseOpenAiImages(result, settings);
    const stillPending = await supabaseFetch(`/rest/v1/image_generation_messages?select=status&id=eq.${encodeURIComponent(messageId)}&user_id=eq.${appUser.id}&limit=1`);
    if (stillPending?.[0]?.status !== "pending") return json(res, { error: "This image generation was cancelled." }, 409);

    const assets = [];
    for (let index = 0; index < generated.length; index += 1) {
      const image = generated[index];
      const id = crypto.randomUUID();
      const extension = image.contentType === "image/jpeg" ? "jpg" : image.contentType === "image/webp" ? "webp" : "png";
      const key = storageKey("output", id, extension);
      await signedStorageFetch("PUT", key, image.bytes, image.contentType);
      const asset = await insertRow("image_generation_assets", {
        id,
        session_id: sessionId,
        message_id: messageId,
        user_id: appUser.id,
        asset_kind: "output",
        storage_key: key,
        original_filename: `${id}.${extension}`,
        content_type: image.contentType,
        byte_size: image.bytes.byteLength,
        sort_order: index,
        generation_settings: snapshot,
      });
      assets.push(serializeAsset(asset));
    }

    const assistantMessage = await insertRow("image_generation_messages", {
      session_id: sessionId,
      user_id: appUser.id,
      role: "assistant",
      content: `Generated ${assets.length} image${assets.length === 1 ? "" : "s"}.`,
      status: "completed",
      endpoint,
      settings_snapshot: snapshot,
    });
    await updateRows("image_generation_messages", `?id=eq.${encodeURIComponent(messageId)}&status=eq.pending`, { status: "completed" });
    const finalSession = (await supabaseFetch(`/rest/v1/image_generation_sessions?select=*&id=eq.${encodeURIComponent(sessionId)}&limit=1`))?.[0] || session;
    return json(res, { session: finalSession, userMessage: { ...pendingMessage, status: "completed" }, assistantMessage, assets });
  } catch (error) {
    console.error(error);
    const details = providerError(error);
    if (messageId) {
      await updateRows("image_generation_messages", `?id=eq.${encodeURIComponent(messageId)}&status=eq.pending`, {
        status: "failed",
        error_message: error instanceof Error ? error.message : "Generation failed.",
        error_details: details,
      }).catch((updateError) => console.error(updateError));
    }
    return json(res, { error: error.message || "Could not generate high-quality images.", error_details: details }, error.status && error.status >= 400 && error.status < 500 ? error.status : 500);
  }
};
