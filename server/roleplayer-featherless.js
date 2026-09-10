const FEATHERLESS_DEFAULT_MODEL = "anthracite-org/magnum-v4-9b";
const FEATHERLESS_PREFERRED_MODELS = [
  FEATHERLESS_DEFAULT_MODEL
];
const FEATHERLESS_STOP_SEQUENCES = [
  "<|im_end|>",
  "<|im_start|>",
  "<|endoftext|>",
  "</s>"
];
const DEFAULT_MAX_IMAGE_BASE64_BYTES = 4_000_000;

function httpError(message, status = 500, details = null) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function requiredEnv(name, aliases = []) {
  const value = [name, ...aliases]
    .map((key) => String(process.env[key] || "").trim())
    .find(Boolean);
  if (!value) throw httpError(`Missing required environment variable: ${name}.`, 500);
  return value;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function featherlessBaseUrl() {
  return String(process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1").replace(/\/+$/, "");
}

function preferredModels() {
  return [
    process.env.FEATHERLESS_MODEL,
    process.env.FEATHERLESS_VIBE_FALLBACK_MODEL,
    ...FEATHERLESS_PREFERRED_MODELS
  ].map((value) => String(value || "").trim()).filter((value, index, values) => value && values.indexOf(value) === index);
}

function sendJson(response, status, body) {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function writeNdjson(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

function parseAuthorization(request) {
  const header = String(request.headers?.authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) {
    throw httpError("You must be signed in to use Roleplayer AI.", 401);
  }
  const token = header.slice(7).trim();
  if (!token) throw httpError("You must be signed in to use Roleplayer AI.", 401);
  return token;
}

function supabaseUrl() {
  return requiredEnv("SUPABASE_URL")
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "")
    .replace(/\/auth\/v1$/i, "");
}

function supabasePublishableKey() {
  return requiredEnv("SUPABASE_PUBLISHABLE_KEY", ["SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"]);
}

function supabaseSecretKey() {
  return requiredEnv("SUPABASE_SECRET_KEY", ["SUPABASE_SERVICE_ROLE_KEY"]);
}

async function responsePayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { text };
  }
}

async function fetchAuthUser(accessToken, apiKey) {
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await responsePayload(response);
  if (!response.ok || !payload?.id) {
    throw httpError(payload?.msg || payload?.message || "Supabase rejected the current auth session.", 401);
  }
  return payload;
}

async function requireRoleplayerAdmin(request) {
  const accessToken = parseAuthorization(request);
  const authKeys = [supabasePublishableKey(), supabaseSecretKey()]
    .filter((value, index, values) => value && values.indexOf(value) === index);
  let authUser = null;
  let authError = null;

  for (const apiKey of authKeys) {
    try {
      authUser = await fetchAuthUser(accessToken, apiKey);
      break;
    } catch (error) {
      authError = error;
    }
  }
  if (!authUser) throw authError || httpError("You must be signed in to use Roleplayer AI.", 401);

  const secretKey = supabaseSecretKey();
  const response = await fetch(
    `${supabaseUrl()}/rest/v1/users?select=id,admin&clerk_user_id=eq.${encodeURIComponent(authUser.id)}&limit=1`,
    {
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json"
      }
    }
  );
  const payload = await responsePayload(response);
  if (!response.ok) {
    throw httpError(payload?.message || payload?.error || "Could not verify the Centralis account.", response.status || 500);
  }
  const appUser = Array.isArray(payload) ? payload[0] : null;
  if (!appUser) throw httpError("Centralis user profile was not found.", 403);
  if (appUser.admin !== true) throw httpError("Roleplayer is restricted to Centralis administrators.", 403);
  return { authUser, appUser };
}

function featherlessHeaders(request, extraHeaders = {}) {
  const apiKey = requiredEnv("FEATHERLESS_API_KEY");
  const deploymentUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  const requestOrigin = String(request.headers?.origin || "").trim();
  const referer = requestOrigin || (deploymentUrl ? `https://${deploymentUrl}` : "https://centralis.app");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": referer,
    "X-Title": "Centralis Roleplayer",
    ...extraHeaders
  };
}

async function fetchFeatherless(request, pathname, init = {}, timeoutMs = envNumber("FEATHERLESS_TIMEOUT_MS", 120000)) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${featherlessBaseUrl()}${pathname}`, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw httpError(`Featherless did not respond within ${Math.round(timeoutMs / 1000)} seconds.`, 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return request.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw httpError("Request body is too large.", 413);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw httpError("Request body must be valid JSON.", 400);
  }
}

function providerErrorMessage(payload, status, provider = "Featherless") {
  return payload?.error?.message
    || payload?.error
    || payload?.message
    || `${provider} returned HTTP ${status}.`;
}

function cleanChatPayload(body) {
  const model = String(body?.model || "").trim();
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const cleanedMessages = messages
    .map((message) => ({
      role: String(message?.role || "").trim(),
      content: String(message?.content || "").trim()
    }))
    .filter((message) => ["system", "user", "assistant"].includes(message.role) && message.content)
    .slice(-32);
  if (!model) throw httpError("model is required.", 400);
  if (!cleanedMessages.length) throw httpError("At least one chat message is required.", 400);
  return { model, messages: cleanedMessages };
}

function normalizeFeatherlessModel(model) {
  return {
    name: String(model?.id || model?.name || "").trim(),
    modified_at: null,
    size: null,
    context_length: typeof model?.context_length === "number" ? model.context_length : null,
    max_completion_tokens: typeof model?.max_completion_tokens === "number" ? model.max_completion_tokens : null,
    status: String(model?.status || "").trim() || null,
    available_on_current_plan: typeof model?.available_on_current_plan === "boolean"
      ? model.available_on_current_plan
      : null
  };
}

function isEligibleFeatherlessModel(model) {
  const name = String(model?.id || model?.name || "").trim();
  const status = String(model?.status || "").trim().toLowerCase();
  const planAvailable = model?.available_on_current_plan;
  if (!name) return false;
  return (!status || status === "active") && planAvailable !== false;
}

async function handleStatus(request, response) {
  try {
    const providerResponse = await fetchFeatherless(request, "/plan", {
      headers: featherlessHeaders(request)
    }, envNumber("FEATHERLESS_HEALTH_TIMEOUT_MS", 10000));
    if (!providerResponse.ok) {
      const payload = await responsePayload(providerResponse);
      return sendJson(response, 200, {
        ok: false,
        baseUrl: featherlessBaseUrl(),
        provider: "featherless",
        error: providerErrorMessage(payload, providerResponse.status)
      });
    }
    return sendJson(response, 200, { ok: true, baseUrl: featherlessBaseUrl(), provider: "featherless" });
  } catch (error) {
    return sendJson(response, 200, {
      ok: false,
      baseUrl: featherlessBaseUrl(),
      provider: "featherless",
      error: error.message || "Featherless is not reachable."
    });
  }
}

async function handleModels(request, response) {
  try {
    const requestedPageSize = Math.round(envNumber("FEATHERLESS_MODELS_PER_PAGE", 1000));
    const params = new URLSearchParams({
      available_on_current_plan: "true",
      conversational: "true",
      status: "active",
      per_page: String(Math.max(1, Math.min(1000, requestedPageSize))),
      sort: process.env.FEATHERLESS_MODELS_SORT || "-popularity"
    });
    if (process.env.FEATHERLESS_MODELS_QUERY) params.set("q", process.env.FEATHERLESS_MODELS_QUERY);
    const providerResponse = await fetchFeatherless(request, `/models?${params.toString()}`, {
      headers: featherlessHeaders(request)
    }, envNumber("FEATHERLESS_HEALTH_TIMEOUT_MS", 10000));
    const payload = await responsePayload(providerResponse);
    if (!providerResponse.ok) {
      return sendJson(response, 200, {
        models: [],
        error: providerErrorMessage(payload, providerResponse.status)
      });
    }
    const models = Array.isArray(payload.data)
      ? payload.data
        .filter((model) => isEligibleFeatherlessModel(model))
        .map(normalizeFeatherlessModel)
      : [];
    const preferredNames = preferredModels();
    for (const modelId of preferredNames.slice().reverse()) {
      const existingIndex = models.findIndex((model) => model.name === modelId);
      if (existingIndex === -1) continue;
      const [preferredModel] = models.splice(existingIndex, 1);
      models.unshift(preferredModel);
    }
    return sendJson(response, 200, { models });
  } catch (error) {
    return sendJson(response, 200, {
      models: [],
      error: error.message || "Could not load Featherless models."
    });
  }
}

function chatCompletionBody(model, messages, stream) {
  return {
    model,
    messages,
    stream,
    max_tokens: envNumber("FEATHERLESS_MAX_TOKENS", 220),
    temperature: envNumber("FEATHERLESS_TEMPERATURE", 0.8),
    top_p: envNumber("FEATHERLESS_TOP_P", 0.92),
    stop: FEATHERLESS_STOP_SEQUENCES,
    chat_template_kwargs: { enable_thinking: false }
  };
}

async function handleChat(request, response) {
  const body = await readJsonBody(request);
  const { model, messages } = cleanChatPayload(body);
  const providerResponse = await fetchFeatherless(request, "/chat/completions", {
    method: "POST",
    headers: featherlessHeaders(request),
    body: JSON.stringify(chatCompletionBody(model, messages, false))
  });
  const payload = await responsePayload(providerResponse);
  if (!providerResponse.ok) {
    throw httpError(providerErrorMessage(payload, providerResponse.status), providerResponse.status || 502);
  }
  const text = String(payload.choices?.[0]?.message?.content || "").trim();
  if (!text) throw httpError("Featherless did not return a text response.", 502);
  return sendJson(response, 200, {
    text,
    model,
    metadata: {
      model: payload.model || model,
      id: payload.id,
      finish_reason: payload.choices?.[0]?.finish_reason || null,
      usage: payload.usage || null,
      provider: "featherless"
    }
  });
}

function parseFeatherlessStreamLine(line) {
  const raw = String(line || "").trim();
  if (!raw || !raw.startsWith("data:")) return null;
  const data = raw.replace(/^data:\s*/, "").trim();
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch (_error) {
    throw httpError(`Featherless returned an invalid stream chunk: ${data.slice(0, 120)}`, 502);
  }
}

function extractFeatherlessText(payload) {
  const choice = payload?.choices?.[0] || {};
  const candidates = [
    choice.delta?.content,
    choice.delta?.text,
    choice.message?.content,
    choice.text,
    payload?.content,
    payload?.text,
    payload?.response
  ];
  return candidates.find((candidate) => typeof candidate === "string" && candidate) || "";
}

async function handleChatStream(request, response) {
  const body = await readJsonBody(request);
  const { model, messages } = cleanChatPayload(body);
  const controller = new AbortController();
  const streamTimeoutMs = envNumber("FEATHERLESS_STREAM_TIMEOUT_MS", envNumber("OLLAMA_STREAM_TIMEOUT_MS", 240000));
  let timeout = null;
  let streamComplete = false;
  let streamTimedOut = false;
  let streamedText = "";
  const resetTimeout = () => {
    if (timeout) clearTimeout(timeout);
    if (streamTimeoutMs > 0) {
      timeout = setTimeout(() => {
        streamTimedOut = true;
        controller.abort();
      }, streamTimeoutMs);
    }
  };
  resetTimeout();
  const abortUpstream = () => controller.abort();
  if (request.signal?.aborted) abortUpstream();
  else request.signal?.addEventListener?.("abort", abortUpstream, { once: true });
  request.on?.("aborted", abortUpstream);
  response.on?.("close", () => {
    if (!streamComplete) controller.abort();
  });

  try {
    const providerResponse = await fetch(`${featherlessBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: featherlessHeaders(request),
      signal: controller.signal,
      body: JSON.stringify(chatCompletionBody(model, messages, true))
    });
    if (!providerResponse.ok) {
      const payload = await responsePayload(providerResponse);
      throw httpError(providerErrorMessage(payload, providerResponse.status), providerResponse.status || 502);
    }
    if (!providerResponse.body) throw httpError("Featherless did not return a streaming response.", 502);

    response.statusCode = 200;
    response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    response.setHeader("Cache-Control", "no-store, no-transform");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    const reader = providerResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalMetadata = null;
    let firstUnrecognizedPayload = null;

    const processLine = (line) => {
      const payload = parseFeatherlessStreamLine(line);
      if (!payload) return;
      if (payload.error) throw httpError(payload.error.message || payload.error || "Featherless stream failed.", 502);
      const delta = extractFeatherlessText(payload);
      if (delta) {
        streamedText += delta;
        writeNdjson(response, { type: "delta", text: delta });
      } else if (!firstUnrecognizedPayload) {
        firstUnrecognizedPayload = payload;
      }
      const finishReason = payload.choices?.[0]?.finish_reason || null;
      if (finishReason) {
        finalMetadata = {
          model: payload.model || model,
          id: payload.id,
          finish_reason: finishReason,
          usage: payload.usage || null,
          provider: "featherless"
        };
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resetTimeout();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach(processLine);
    }
    buffer += decoder.decode();
    buffer.split(/\r?\n/).filter((line) => line.trim()).forEach(processLine);

    if (!streamedText && firstUnrecognizedPayload) {
      writeNdjson(response, {
        type: "debug",
        warning: "Featherless streamed chunks, but Centralis did not find text in the expected fields.",
        sample: firstUnrecognizedPayload
      });
    }
    writeNdjson(response, {
      type: "done",
      model,
      metadata: finalMetadata || { model, provider: "featherless" }
    });
    streamComplete = true;
    response.end();
  } catch (error) {
    const message = streamTimedOut
      ? "Featherless stream timed out while waiting for more text."
      : error.message || "Could not stream chat message from Featherless.";
    if (response.headersSent) {
      writeNdjson(response, { type: "error", error: message });
      streamComplete = true;
      response.end();
      return;
    }
    throw httpError(message, error.status || (streamTimedOut ? 504 : 500));
  } finally {
    if (timeout) clearTimeout(timeout);
    request.signal?.removeEventListener?.("abort", abortUpstream);
  }
}

function isRetryableModelError(status, payload, message) {
  const code = String(payload?.error?.code || payload?.code || "").trim().toLowerCase();
  const text = String(message || "").toLowerCase();
  return status === 429
    || status === 503
    || ["model_not_found", "model_unavailable", "no_valid_executor"].includes(code)
    || text.includes("temporarily at capacity")
    || text.includes("capacity")
    || text.includes("concurrency limit")
    || text.includes("concurrent requests")
    || text.includes("over limit")
    || text.includes("not available for inference")
    || text.includes("model is not available")
    || text.includes("model not found")
    || text.includes("unknown model")
    || text.includes("no valid executor")
    || text.includes("model is cold")
    || text.includes("not ready for inference")
    || (status === 403 && (text.includes("gated") || text.includes("subscription tier") || text.includes("current plan")));
}

function parseJsonFromModelText(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Featherless returned an empty character draft.");
  try {
    return JSON.parse(raw);
  } catch (_error) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("Featherless did not return valid JSON for the character draft.");
  }
}

function cleanGeneratedCharacterDraft(value) {
  const draft = value && typeof value === "object" ? value : {};
  const source = draft.character && typeof draft.character === "object"
    ? draft.character
    : draft.draft && typeof draft.draft === "object"
      ? draft.draft
      : draft;
  const aliases = {
    short_description: ["shortDescription", "short_description", "summary"],
    core_identity: ["coreIdentity", "core_identity", "identity"],
    speech_style: ["speechStyle", "speech_style", "voice"],
    behavior_instructions: ["behaviorInstructions", "behavior_instructions", "behavior"],
    drift_guardrails: ["driftGuardrails", "drift_guardrails", "guardrails"],
    system_prompt: ["systemPrompt", "system_prompt", "prompt"],
    first_message: ["firstMessage", "first_message", "opening_message", "openingMessage", "starter", "first_scene"]
  };
  const fields = [
    "name", "short_description", "description", "core_identity", "personality", "appearance", "background",
    "speech_style", "scenario", "behavior_instructions", "drift_guardrails", "system_prompt", "first_message"
  ];
  const result = {};
  for (const field of fields) {
    const keys = aliases[field] || [field];
    const value = keys.map((key) => source[key]).find((item) => String(item || "").trim());
    result[field] = String(value || "").trim();
  }
  result.tags = Array.isArray(source.tags)
    ? source.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 12)
    : String(source.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  return result;
}

function titleCaseWords(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s']/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function firstMeaningfulText(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function summarizeVibe(vibe) {
  const pairs = Object.entries(vibe || {})
    .map(([key, value]) => [titleCaseWords(key).toLowerCase(), String(value || "").trim()])
    .filter(([, value]) => value)
    .slice(0, 8);
  return pairs.length ? pairs.map(([key, value]) => `${key}: ${value}`).join("; ") : "an original adult roleplay premise";
}

function nameFromVibe(vibe, existingCharacter) {
  const explicit = firstMeaningfulText(existingCharacter?.name, vibe?.name_vibe);
  if (explicit) return titleCaseWords(explicit).slice(0, 80) || "Unnamed Roleplayer";
  const concept = firstMeaningfulText(
    vibe?.general_vibe,
    vibe?.relationship_to_user,
    vibe?.scenario_vibe,
    vibe?.background_vibe,
    vibe?.speech_vibe,
    vibe?.other
  );
  const title = titleCaseWords(concept);
  return title ? `${title} Character`.slice(0, 80) : "Original Roleplayer Character";
}

function tagListFromVibe(vibe, existingCharacter) {
  const existingTags = Array.isArray(existingCharacter?.tags)
    ? existingCharacter.tags
    : String(existingCharacter?.tags || "").split(",");
  const vibeTags = Object.values(vibe || {}).join(",").split(/[,;\n]/);
  const tags = [...existingTags, ...vibeTags]
    .map((tag) => titleCaseWords(tag).toLowerCase())
    .filter((tag) => tag && tag.length <= 40);
  return [...new Set(tags)].slice(0, 8);
}

function completeGeneratedCharacterDraft(character, vibe, existingCharacter) {
  const completed = { ...character };
  const vibeSummary = summarizeVibe(vibe);
  const name = firstMeaningfulText(completed.name, existingCharacter?.name, nameFromVibe(vibe, existingCharacter));
  completed.name = name;
  completed.short_description = firstMeaningfulText(completed.short_description, existingCharacter?.short_description, `Adult roleplay character built around ${vibeSummary}.`);
  completed.description = firstMeaningfulText(completed.description, existingCharacter?.description, `${name} is an adult, 18+, designed for a vivid roleplay premise built from ${vibeSummary}. They have enough contradiction, motive, and texture to sustain an ongoing scene without taking control of the user.`);
  completed.core_identity = firstMeaningfulText(completed.core_identity, existingCharacter?.core_identity, `${name} is an adult, 18+, whose core identity centers on ${vibeSummary}.`);
  completed.personality = firstMeaningfulText(completed.personality, existingCharacter?.personality, "Expressive, internally consistent, responsive to tension, and grounded by clear wants, boundaries, habits, and emotional tells.");
  completed.appearance = firstMeaningfulText(completed.appearance, existingCharacter?.appearance, `Adult presentation with visual details that reflect the premise: posture, styling, expression, and small environmental cues should all support ${vibeSummary}.`);
  completed.background = firstMeaningfulText(completed.background, existingCharacter?.background, `${name}'s background explains why the current roleplay situation matters, while leaving room for discovery during the session.`);
  completed.speech_style = firstMeaningfulText(completed.speech_style, existingCharacter?.speech_style, "Natural, character-specific dialogue with distinct rhythm, emotional subtext, and no narration of the user's thoughts, actions, or decisions.");
  completed.scenario = firstMeaningfulText(completed.scenario, existingCharacter?.scenario, `The scene begins around ${vibeSummary}, with ${name} present and active while the user's response remains completely open.`);
  completed.behavior_instructions = firstMeaningfulText(completed.behavior_instructions, existingCharacter?.behavior_instructions, "Never speak, act, decide, feel, or think for the user. Portray only the character, NPCs when necessary, and the surrounding world.");
  completed.drift_guardrails = firstMeaningfulText(completed.drift_guardrails, existingCharacter?.drift_guardrails, "Preserve this character's adult baseline, motivations, boundaries, voice, and relationship premise unless major session events justify gradual change.");
  completed.system_prompt = firstMeaningfulText(completed.system_prompt, existingCharacter?.system_prompt, `You are ${name}, an adult fictional roleplay character. Stay in character, follow the scenario and guardrails, and never control the user's dialogue, actions, feelings, thoughts, perceptions, or choices.`);
  completed.first_message = firstMeaningfulText(completed.first_message, existingCharacter?.first_message, `${name} is already in the scene, the atmosphere shaped by ${vibeSummary}. They make the first move in character, leaving clear space for the user to respond without being described or controlled.`);
  completed.tags = Array.isArray(completed.tags) && completed.tags.length ? completed.tags : tagListFromVibe(vibe, existingCharacter);
  if (!completed.tags.length) completed.tags = ["adult", "roleplay", "original"];
  return completed;
}

function assertAdultLegalFictionBoundary(value) {
  const text = JSON.stringify(value || {}).toLowerCase();
  const boundaryPatterns = [
    /\b(underage|minor|child|kid|toddler|preteen|teen|teenager|teenage)\b/,
    /\b(high school|middle school|schoolgirl|schoolboy|loli|shota)\b/,
    /\b(under\s*18|younger than\s*18|(?:[0-9]|1[0-7])\s*year\s*old|(?:[0-9]|1[0-7])-year-old)\b/,
    /\b(bestiality|zoophilia|animal sex|sex with animals?)\b/,
    /\b(trafficking|sex slave|sexual exploitation|exploitative sex)\b/,
    /\b(rape|rapist|non[-\s]?consensual|forced sex|coerced sex|sexual coercion)\b/,
    /\b(real person|celebrity|public figure)\b.*\b(sex|sexual|nude|naked|erotic)\b/
  ];
  if (boundaryPatterns.some((pattern) => pattern.test(text))) {
    throw httpError("AI Vibe can generate adult fictional taboo themes, but not underage, animal, trafficking, exploitation, non-consent, coercive sexual violence, or real-person sexualized content.", 422);
  }
}

function ensureAdultCharacterMarker(character) {
  const text = [character.description, character.core_identity, character.background, character.scenario].join(" ").toLowerCase();
  if (/\b(18\+|adult|grown|late-20s|late 20s|20s|30s|40s|50s|older)\b/.test(text)) return character;
  character.core_identity = character.core_identity
    ? `${character.core_identity} They are an adult, 18+.`
    : "They are an adult, 18+.";
  return character;
}

function validateGeneratedCharacterDraft(character) {
  const requiredFields = [
    "name", "short_description", "description", "core_identity", "personality", "appearance", "background",
    "speech_style", "scenario", "behavior_instructions", "drift_guardrails", "system_prompt", "first_message"
  ];
  const missing = requiredFields.filter((field) => !String(character?.[field] || "").trim());
  if (missing.length) throw httpError(`Featherless returned an incomplete character draft. Missing: ${missing.join(", ")}.`, 502);
  if (!Array.isArray(character.tags) || !character.tags.length) {
    throw httpError("Featherless returned an incomplete character draft. Missing: tags.", 502);
  }
}

function buildCharacterVibePrompt(vibe, existingCharacter) {
  return [
    "Create a fictional AI roleplay character draft for Centralis Roleplayer.",
    "Return only strict JSON. Do not include markdown, prose outside JSON, or comments.",
    "",
    "The JSON object must have exactly these keys:",
    "name, short_description, description, core_identity, personality, appearance, background, speech_style, scenario, behavior_instructions, drift_guardrails, system_prompt, first_message, tags.",
    "Every listed key is required and must be non-empty. Do not omit first_message.",
    "tags must be an array of short strings.",
    "first_message must be the character's opening in-character message or scene-setting action, 1 to 3 paragraphs, written by the character/narrator only.",
    "first_message must not include user dialogue, user actions, user thoughts, user feelings, or choices for the user.",
    "",
    "Style goals:",
    "- Build a vivid, internally consistent adult character.",
    "- Socially taboo adult fictional themes are allowed as context, tension, backstory, or relationship framing.",
    "- Do not avoid an adult theme merely because it is socially uncomfortable.",
    "- Keep the template non-explicit; focus on personality, story, relationship context, emotional tension, and roleplay hooks.",
    "- The character must not speak, act, decide, feel, think, notice, or respond for the user.",
    "- Include strong drift guardrails that keep the character grounded in the generated baseline.",
    "",
    "Hard Centralis V1 boundaries:",
    "- Every generated character must be explicitly adult, 18+.",
    "- If age is college-aged, make clear they are an adult college student, 18+.",
    "- Do not generate underage, age-ambiguous, school-minor, childlike sexualized, animal sexual/harm, trafficking, exploitation, non-consent, coercive sexual violence, or real-person sexualization.",
    "- If the user asks for a hard-boundary concept, return JSON with an error key and a concise adult-safe explanation instead of a character draft.",
    "",
    "Existing character form values. Preserve the user's intent and avoid contradicting these:",
    JSON.stringify(existingCharacter || {}, null, 2),
    "",
    "Optional vibe notes from the user:",
    JSON.stringify(vibe || {}, null, 2)
  ].join("\n");
}

async function handleCharacterVibe(request, response) {
  const body = await readJsonBody(request);
  const model = String(body.model || preferredModels()[0] || "").trim();
  const fallbackModels = Array.isArray(body.fallbackModels)
    ? body.fallbackModels
      .map((candidate) => String(candidate || "").trim())
      .filter((candidate) => candidate && candidate.length <= 300)
      .slice(0, 8)
    : [];
  const vibe = body.vibe && typeof body.vibe === "object" ? body.vibe : {};
  const existingCharacter = body.existingCharacter && typeof body.existingCharacter === "object" ? body.existingCharacter : {};
  if (!model) throw httpError("No Featherless model is configured for AI Vibe.", 400);
  if (!Object.values(vibe).some((value) => String(value || "").trim())) {
    throw httpError("At least one AI Vibe note is required.", 400);
  }
  assertAdultLegalFictionBoundary(vibe);

  const messages = [
    {
      role: "system",
      content: "You generate adult fictional roleplay character drafts as strict JSON for Centralis. Follow the user's adult legal fiction boundary exactly."
    },
    { role: "user", content: buildCharacterVibePrompt(vibe, existingCharacter) }
  ];
  const vibeModels = [model, ...fallbackModels, ...preferredModels()]
    .filter((item, index, values) => item && values.indexOf(item) === index);
  const attempts = [];
  let payload = null;
  let usedModel = "";

  for (let index = 0; index < vibeModels.length; index += 1) {
    const attemptModel = vibeModels[index];
    const providerResponse = await fetchFeatherless(request, "/chat/completions", {
      method: "POST",
      headers: featherlessHeaders(request),
      body: JSON.stringify({
        model: attemptModel,
        messages,
        stream: false,
        max_tokens: envNumber("FEATHERLESS_VIBE_MAX_TOKENS", 1400),
        temperature: envNumber("FEATHERLESS_VIBE_TEMPERATURE", 0.88),
        top_p: envNumber("FEATHERLESS_VIBE_TOP_P", 0.94),
        stop: FEATHERLESS_STOP_SEQUENCES,
        chat_template_kwargs: { enable_thinking: false }
      })
    });
    const attemptPayload = await responsePayload(providerResponse);
    if (providerResponse.ok) {
      payload = attemptPayload;
      usedModel = attemptModel;
      attempts.push({ model: attemptModel, status: "complete" });
      break;
    }
    const message = providerErrorMessage(attemptPayload, providerResponse.status);
    attempts.push({ model: attemptModel, status: "error", responseStatus: providerResponse.status, error: message });
    if (!isRetryableModelError(providerResponse.status, attemptPayload, message)) {
      throw httpError(message, providerResponse.status || 502, { attempts });
    }
  }

  if (!payload) {
    throw httpError("No currently available Featherless model could generate this character.", 503, { attempts });
  }

  const text = String(payload?.choices?.[0]?.message?.content || "").trim();
  let parsed = {};
  let repairNote = "";
  try {
    parsed = parseJsonFromModelText(text);
  } catch (error) {
    repairNote = error.message || "Featherless did not return valid JSON for the character draft.";
  }
  if (parsed.error) throw httpError(String(parsed.error).trim() || "AI Vibe could not generate that character safely.", 422, { attempts });

  const character = ensureAdultCharacterMarker(completeGeneratedCharacterDraft(
    cleanGeneratedCharacterDraft(parsed),
    vibe,
    existingCharacter
  ));
  assertAdultLegalFictionBoundary(character);
  validateGeneratedCharacterDraft(character);
  return sendJson(response, 200, {
    character,
    model: usedModel || model,
    requestedModel: model,
    fallbackUsed: Boolean(usedModel && usedModel !== model),
    attempts,
    metadata: {
      model: payload?.model || usedModel || model,
      id: payload?.id,
      finish_reason: payload?.choices?.[0]?.finish_reason || null,
      usage: payload?.usage || null,
      provider: "featherless"
    },
    repairNote: repairNote || null
  });
}

function parseImageBase64(payload, providerName) {
  const candidates = Array.isArray(payload?.data)
    ? payload.data.map((image) => image?.b64_json || image?.base64 || image?.image).filter(Boolean)
    : Array.isArray(payload?.images)
      ? payload.images.filter(Boolean)
      : [];
  const base64 = String(candidates[0] || "").trim();
  if (!base64) throw httpError(`${providerName} did not return image data.`, 502);
  return base64.replace(/^data:image\/[a-z0-9+.-]+;base64,/i, "");
}

function enforceImageResponseLimit(image) {
  const maxBytes = envNumber("ROLEPLAYER_MAX_IMAGE_BASE64_BYTES", DEFAULT_MAX_IMAGE_BASE64_BYTES);
  if (Buffer.byteLength(image.base64, "utf8") > maxBytes) {
    throw httpError("The generated character image was too large to return safely. Try generating it again.", 502);
  }
  return image;
}

function buildCharacterImagePrompt(character) {
  const details = [
    character?.name ? `Name: ${character.name}` : "",
    character?.short_description ? `Short description: ${character.short_description}` : "",
    character?.description ? `Description: ${character.description}` : "",
    character?.appearance ? `Appearance: ${character.appearance}` : "",
    character?.personality ? `Personality: ${character.personality}` : "",
    character?.background ? `Background: ${character.background}` : "",
    Array.isArray(character?.tags) && character.tags.length ? `Tags: ${character.tags.join(", ")}` : ""
  ].filter(Boolean).join("\n");
  return [
    "Create a hyperrealistic vertical portrait image for this fictional Centralis Roleplayer character.",
    "Use the character details as visual guidance, prioritizing appearance, age, style, vibe, and setting clues.",
    "Show only the character. Do not include text, captions, watermarks, logos, UI, speech bubbles, or multiple panels.",
    "Keep the image non-explicit and clearly adult when age is relevant.",
    "",
    details
  ].join("\n").trim();
}

async function callOpenAiCharacterImage(prompt) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: "1024x1536",
      quality: "medium",
      output_format: "jpeg",
      output_compression: 82,
      moderation: "low"
    })
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw httpError(providerErrorMessage(payload, response.status, "OpenAI"), response.status || 502);
  return enforceImageResponseLimit({
    base64: parseImageBase64(payload, "OpenAI"),
    contentType: "image/jpeg",
    provider: "openai",
    model: "gpt-image-2"
  });
}

async function callVeniceCharacterImage(prompt) {
  const baseUrl = String(process.env.VENICE_IMAGE_BASE_URL || "https://api.venice.ai/api/v1/image").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("VENICE_API_KEY")}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      model: "nano-banana-pro",
      prompt,
      format: "webp",
      variants: 1,
      return_binary: false,
      hide_watermark: true,
      safe_mode: false,
      aspect_ratio: "9:16",
      resolution: "1K",
      style_preset: "Hyperrealism"
    })
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw httpError(providerErrorMessage(payload, response.status, "Venice"), response.status || 502);
  return enforceImageResponseLimit({
    base64: parseImageBase64(payload, "Venice"),
    contentType: "image/webp",
    provider: "venice",
    model: "nano-banana-pro"
  });
}

async function handleCharacterImage(request, response) {
  const body = await readJsonBody(request);
  const character = body.character && typeof body.character === "object" ? body.character : {};
  const hasPromptSource = ["short_description", "description", "appearance"]
    .some((field) => String(character[field] || "").trim());
  if (!hasPromptSource) {
    throw httpError("Add a short description, description, or appearance before generating an image.", 400);
  }
  const prompt = buildCharacterImagePrompt(character);
  const attempts = [];
  let generated;
  try {
    generated = await callOpenAiCharacterImage(prompt);
    attempts.push({ provider: "openai", model: "gpt-image-2", status: "complete" });
  } catch (openAiError) {
    attempts.push({ provider: "openai", model: "gpt-image-2", status: "error", error: openAiError.message || "OpenAI image generation failed." });
    try {
      generated = await callVeniceCharacterImage(prompt);
      attempts.push({ provider: "venice", model: "nano-banana-pro", status: "complete" });
    } catch (veniceError) {
      attempts.push({ provider: "venice", model: "nano-banana-pro", status: "error", error: veniceError.message || "Venice image generation failed." });
      throw httpError(veniceError.message || "Could not generate character image.", veniceError.status || 500, { attempts });
    }
  }
  return sendJson(response, 200, { image: generated, prompt, attempts });
}

const ROUTES = {
  status: { method: "GET", handler: handleStatus },
  models: { method: "GET", handler: handleModels },
  chat: { method: "POST", handler: handleChat },
  "chat-stream-json": { method: "POST", handler: handleChatStream },
  "character-vibe": { method: "POST", handler: handleCharacterVibe },
  "character-image": { method: "POST", handler: handleCharacterImage }
};

function handlerFor(action) {
  return async function roleplayerFeatherlessHandler(request, response) {
    const route = ROUTES[action];
    if (!route) return sendJson(response, 404, { error: "Unknown Roleplayer AI route." });
    if (String(request.method || "GET").toUpperCase() !== route.method) {
      response.setHeader("Allow", route.method);
      return sendJson(response, 405, { error: "Method not allowed." });
    }
    try {
      await requireRoleplayerAdmin(request);
      return await route.handler(request, response);
    } catch (error) {
      console.error(`Roleplayer ${action} failed:`, error);
      if (response.headersSent) {
        if (!response.writableEnded) response.end();
        return;
      }
      const status = Number(error.status);
      return sendJson(response, status >= 400 && status <= 599 ? status : 500, {
        error: error.message || "Roleplayer AI request failed.",
        ...(error.details ? { details: error.details } : {})
      });
    }
  };
}

module.exports = {
  handlerFor,
  _internal: {
    cleanChatPayload,
    parseFeatherlessStreamLine,
    extractFeatherlessText,
    completeGeneratedCharacterDraft
  }
};
