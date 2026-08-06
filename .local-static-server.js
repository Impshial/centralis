const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const modelLogPath = path.join(root, "logs", "roleplayer-model.log");

function loadLocalEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnv();

const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";
const featherlessBaseUrl = (process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1").replace(/\/+$/, "");
const featherlessApiKey = process.env.FEATHERLESS_API_KEY || "";
const featherlessDefaultMaxTokens = Number(process.env.FEATHERLESS_MAX_TOKENS || 220);
const featherlessDefaultTemperature = Number(process.env.FEATHERLESS_TEMPERATURE || 0.8);
const featherlessDefaultTopP = Number(process.env.FEATHERLESS_TOP_P || 0.92);
const featherlessPreferredModels = [
  process.env.FEATHERLESS_MODEL,
  process.env.FEATHERLESS_VIBE_FALLBACK_MODEL,
  "anthracite-org/magnum-v4-9b",
  "huihui-ai/Qwen2.5-Coder-32B-Instruct-abliterated"
].filter(Boolean);
const featherlessDefaultModel = featherlessPreferredModels[0];
const featherlessStopSequences = [
  "<|im_end|>",
  "<|im_start|>",
  "<|endoftext|>",
  "</s>"
];
const openAiImageBaseUrl = "https://api.openai.com/v1/images";
const veniceImageBaseUrl = "https://api.venice.ai/api/v1/image";
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function writeNdjson(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

function appendPhysicalModelLog(entry) {
  try {
    fs.mkdirSync(path.dirname(modelLogPath), { recursive: true });
    fs.appendFileSync(modelLogPath, `${JSON.stringify({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry
    })}\n`, "utf8");
  } catch (error) {
    console.warn("Could not append Roleplayer model log:", error);
  }
}

function parseFeatherlessStreamLine(line) {
  const trimmedLine = String(line || "").trim();
  if (!trimmedLine || !trimmedLine.startsWith("data:")) {
    return null;
  }

  const trimmed = trimmedLine.replace(/^data:\s*/, "").trim();
  if (!trimmed || trimmed === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    throw new Error(`Featherless returned an invalid stream chunk: ${trimmed.slice(0, 120)}`);
  }
}

function extractFeatherlessText(payload) {
  const choice = payload?.choices?.[0] || {};
  const candidates = [
    choice.delta?.content,
    choice.delta?.text,
    choice.message?.content,
    choice.text,
    payload.content,
    payload.text,
    payload.response
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
  }
  return "";
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (_error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function requireFeatherlessKey() {
  if (!featherlessApiKey) {
    throw new Error("FEATHERLESS_API_KEY is required. Add it to .env or set it in PowerShell before starting npm run dev.");
  }
}

function featherlessHeaders(extraHeaders = {}) {
  requireFeatherlessKey();
  return {
    "Authorization": `Bearer ${featherlessApiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://127.0.0.1:4173/roleplayer.html",
    "X-Title": "Centralis Roleplayer",
    ...extraHeaders
  };
}

function requireOpenAiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for GPT Image 2.");
  }
}

function requireVeniceKey() {
  if (!process.env.VENICE_API_KEY) {
    throw new Error("VENICE_API_KEY is required for Nano Banana Pro fallback.");
  }
}

function isCapacityError(status, message) {
  const text = String(message || "").toLowerCase();
  return status === 429
    || text.includes("temporarily at capacity")
    || text.includes("capacity")
    || text.includes("concurrency limit")
    || text.includes("concurrent requests")
    || text.includes("over limit");
}

async function fetchFeatherless(pathname, init = {}, timeoutMs = Number(process.env.FEATHERLESS_TIMEOUT_MS || 120000)) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${featherlessBaseUrl}${pathname}`, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Featherless did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function cleanChatPayload(body) {
  const model = String(body.model || "").trim();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const cleanedMessages = messages
    .map((message) => ({
      role: String(message?.role || "").trim(),
      content: String(message?.content || "").trim()
    }))
    .filter((message) => ["system", "user", "assistant"].includes(message.role) && message.content)
    .slice(-32);

  if (!model) {
    throw new Error("model is required.");
  }
  if (!cleanedMessages.length) {
    throw new Error("At least one chat message is required.");
  }

  return { model, messages: cleanedMessages };
}

function parseJsonFromModelText(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Featherless returned an empty character draft.");
  try {
    return JSON.parse(raw);
  } catch (_error) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("Featherless did not return valid JSON for the character draft.");
  }
}

function parseImageBase64List(payload, providerName) {
  const candidates = Array.isArray(payload?.data)
    ? payload.data.map((image) => image?.b64_json || image?.base64 || image?.image).filter(Boolean)
    : Array.isArray(payload?.images)
      ? payload.images.filter(Boolean)
      : [];
  const base64 = String(candidates[0] || "").trim();
  if (!base64) throw new Error(`${providerName} did not return image data.`);
  return base64.replace(/^data:image\/[a-z0-9+.-]+;base64,/i, "");
}

function buildCharacterImagePrompt(character) {
  const parts = [
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
    parts
  ].join("\n").trim();
}

async function callOpenAiCharacterImage(prompt) {
  requireOpenAiKey();
  const response = await fetch(`${openAiImageBaseUrl}/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: "1440x2560",
      quality: "medium",
      output_format: "png",
      moderation: "low"
    })
  });
  const payload = await response.json().catch(async () => ({ text: await response.text().catch(() => "") }));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `OpenAI returned HTTP ${response.status}.`);
  }
  return {
    base64: parseImageBase64List(payload, "OpenAI"),
    contentType: "image/png",
    provider: "openai",
    model: "gpt-image-2"
  };
}

async function callVeniceCharacterImage(prompt) {
  requireVeniceKey();
  const response = await fetch(`${veniceImageBaseUrl}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      model: "nano-banana-pro",
      prompt,
      format: "png",
      variants: 1,
      return_binary: false,
      hide_watermark: true,
      safe_mode: false,
      aspect_ratio: "9:16",
      resolution: "2K",
      style_preset: "Hyperrealism"
    })
  });
  const payload = await response.json().catch(async () => ({ text: await response.text().catch(() => "") }));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error?.message || payload?.error || `Venice returned HTTP ${response.status}.`);
  }
  return {
    base64: parseImageBase64List(payload, "Venice"),
    contentType: "image/png",
    provider: "venice",
    model: "nano-banana-pro"
  };
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
    "name",
    "short_description",
    "description",
    "core_identity",
    "personality",
    "appearance",
    "background",
    "speech_style",
    "scenario",
    "behavior_instructions",
    "drift_guardrails",
    "system_prompt",
    "first_message"
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
  return values
    .map((value) => String(value || "").trim())
    .find(Boolean) || "";
}

function summarizeVibe(vibe) {
  const pairs = Object.entries(vibe || {})
    .map(([key, value]) => [titleCaseWords(key).toLowerCase(), String(value || "").trim()])
    .filter(([, value]) => value)
    .slice(0, 8);
  if (!pairs.length) return "an original adult roleplay premise";
  return pairs.map(([key, value]) => `${key}: ${value}`).join("; ");
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
  const vibeTags = Object.values(vibe || {})
    .join(",")
    .split(/[,;\n]/);
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
  completed.short_description = firstMeaningfulText(
    completed.short_description,
    existingCharacter?.short_description,
    `Adult roleplay character built around ${vibeSummary}.`
  );
  completed.description = firstMeaningfulText(
    completed.description,
    existingCharacter?.description,
    `${name} is an adult, 18+, designed for a vivid roleplay premise built from ${vibeSummary}. They have enough contradiction, motive, and texture to sustain an ongoing scene without taking control of the user.`
  );
  completed.core_identity = firstMeaningfulText(
    completed.core_identity,
    existingCharacter?.core_identity,
    `${name} is an adult, 18+, whose core identity centers on ${vibeSummary}.`
  );
  completed.personality = firstMeaningfulText(
    completed.personality,
    existingCharacter?.personality,
    `Expressive, internally consistent, responsive to tension, and grounded by clear wants, boundaries, habits, and emotional tells.`
  );
  completed.appearance = firstMeaningfulText(
    completed.appearance,
    existingCharacter?.appearance,
    `Adult presentation with visual details that reflect the premise: posture, styling, expression, and small environmental cues should all support ${vibeSummary}.`
  );
  completed.background = firstMeaningfulText(
    completed.background,
    existingCharacter?.background,
    `${name}'s background explains why the current roleplay situation matters, while leaving room for discovery during the session.`
  );
  completed.speech_style = firstMeaningfulText(
    completed.speech_style,
    existingCharacter?.speech_style,
    `Natural, character-specific dialogue with distinct rhythm, emotional subtext, and no narration of the user's thoughts, actions, or decisions.`
  );
  completed.scenario = firstMeaningfulText(
    completed.scenario,
    existingCharacter?.scenario,
    `The scene begins around ${vibeSummary}, with ${name} present and active while the user's response remains completely open.`
  );
  completed.behavior_instructions = firstMeaningfulText(
    completed.behavior_instructions,
    existingCharacter?.behavior_instructions,
    "Never speak, act, decide, feel, or think for the user. Portray only the character, NPCs when necessary, and the surrounding world."
  );
  completed.drift_guardrails = firstMeaningfulText(
    completed.drift_guardrails,
    existingCharacter?.drift_guardrails,
    "Preserve this character's adult baseline, motivations, boundaries, voice, and relationship premise unless major session events justify gradual change."
  );
  completed.system_prompt = firstMeaningfulText(
    completed.system_prompt,
    existingCharacter?.system_prompt,
    `You are ${name}, an adult fictional roleplay character. Stay in character, follow the scenario and guardrails, and never control the user's dialogue, actions, feelings, thoughts, perceptions, or choices.`
  );
  completed.first_message = firstMeaningfulText(
    completed.first_message,
    existingCharacter?.first_message,
    `${name} is already in the scene, the atmosphere shaped by ${vibeSummary}. They make the first move in character, leaving clear space for the user to respond without being described or controlled.`
  );
  completed.tags = Array.isArray(completed.tags) && completed.tags.length
    ? completed.tags
    : tagListFromVibe(vibe, existingCharacter);
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
    throw new Error("AI Vibe can generate adult fictional taboo themes, but not underage, animal, trafficking, exploitation, non-consent, coercive sexual violence, or real-person sexualized content.");
  }
}

function ensureAdultCharacterMarker(character) {
  const text = [
    character.description,
    character.core_identity,
    character.background,
    character.scenario
  ].join(" ").toLowerCase();
  if (/\b(18\+|adult|grown|late-20s|late 20s|20s|30s|40s|50s|older)\b/.test(text)) {
    return character;
  }
  character.core_identity = character.core_identity
    ? `${character.core_identity} They are an adult, 18+.`
    : "They are an adult, 18+.";
  return character;
}

function validateGeneratedCharacterDraft(character) {
  const requiredFields = [
    "name",
    "short_description",
    "description",
    "core_identity",
    "personality",
    "appearance",
    "background",
    "speech_style",
    "scenario",
    "behavior_instructions",
    "drift_guardrails",
    "system_prompt",
    "first_message"
  ];
  const missing = requiredFields.filter((field) => !String(character?.[field] || "").trim());
  if (missing.length) {
    throw new Error(`Featherless returned an incomplete character draft. Missing: ${missing.join(", ")}.`);
  }
  if (!Array.isArray(character.tags) || !character.tags.length) {
    throw new Error("Featherless returned an incomplete character draft. Missing: tags.");
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

function normalizeFeatherlessModel(model) {
  return {
    name: String(model?.id || model?.name || "").trim(),
    modified_at: null,
    size: null,
    context_length: typeof model?.context_length === "number" ? model.context_length : null,
    max_completion_tokens: typeof model?.max_completion_tokens === "number" ? model.max_completion_tokens : null
  };
}

function fallbackFeatherlessModels() {
  return featherlessPreferredModels.map((name) => ({
    name,
    modified_at: null,
    size: null,
    context_length: null,
    max_completion_tokens: null
  }));
}

async function fetchFeatherlessModelDetail(modelId) {
  if (!modelId) return null;
  try {
    const detailResponse = await fetchFeatherless(`/models/${encodeURIComponent(modelId)}`, {
      headers: featherlessHeaders()
    }, Number(process.env.FEATHERLESS_HEALTH_TIMEOUT_MS || 10000));
    if (!detailResponse.ok) return { name: modelId, modified_at: null, size: null, context_length: null, max_completion_tokens: null };
    const detail = await detailResponse.json().catch(() => ({}));
    const normalized = normalizeFeatherlessModel(detail);
    return normalized.name ? normalized : { name: modelId, modified_at: null, size: null, context_length: null, max_completion_tokens: null };
  } catch (_error) {
    return { name: modelId, modified_at: null, size: null, context_length: null, max_completion_tokens: null };
  }
}

function normalizeModelRoutePathname(pathname) {
  return pathname.replace(/^\/api\/featherless\//, "/api/ollama/");
}

async function handleModelRoute(request, response, pathname) {
  const modelPathname = normalizeModelRoutePathname(pathname);

  if (modelPathname === "/api/ollama/status" && request.method === "GET") {
    try {
      const healthTimeoutMs = Number(process.env.FEATHERLESS_HEALTH_TIMEOUT_MS || 10000);
      const featherlessResponse = await fetchFeatherless("/models?per_page=1", {
        headers: featherlessHeaders()
      }, healthTimeoutMs);
      if (!featherlessResponse.ok) {
        const payload = await featherlessResponse.json().catch(() => ({}));
        sendJson(response, 200, {
          ok: true,
          baseUrl: featherlessBaseUrl,
          provider: "featherless",
          warning: payload.error?.message || payload.error || `Featherless model catalog returned HTTP ${featherlessResponse.status}.`
        });
        return;
      }
      sendJson(response, 200, { ok: true, baseUrl: featherlessBaseUrl, provider: "featherless" });
    } catch (error) {
      sendJson(response, 200, { ok: false, baseUrl: featherlessBaseUrl, error: error.message || "Featherless is not reachable." });
    }
    return;
  }

  if (modelPathname === "/api/ollama/models" && request.method === "GET") {
    try {
      const params = new URLSearchParams({
        available_on_current_plan: "true",
        conversational: "true",
        status: "active",
        per_page: String(Number(process.env.FEATHERLESS_MODELS_PER_PAGE || 100)),
        sort: process.env.FEATHERLESS_MODELS_SORT || "-popularity"
      });
      if (process.env.FEATHERLESS_MODELS_QUERY) {
        params.set("q", process.env.FEATHERLESS_MODELS_QUERY);
      }
      const featherlessResponse = await fetchFeatherless(`/models?${params.toString()}`, {
        headers: featherlessHeaders()
      }, Number(process.env.FEATHERLESS_HEALTH_TIMEOUT_MS || 10000));
      const payload = await featherlessResponse.json().catch(() => ({}));
      if (!featherlessResponse.ok) {
        sendJson(response, 200, {
          models: fallbackFeatherlessModels(),
          error: payload.error?.message || payload.error || `Featherless returned HTTP ${featherlessResponse.status}. Using configured model fallback.`
        });
        return;
      }
      const models = Array.isArray(payload.data)
        ? payload.data.map(normalizeFeatherlessModel).filter((model) => model.name)
        : [];
      const preferredModels = await Promise.all(featherlessPreferredModels.map(fetchFeatherlessModelDetail));
      for (const preferredModel of preferredModels.filter((model) => model?.name).reverse()) {
        const existingIndex = models.findIndex((model) => model.name === preferredModel.name);
        if (existingIndex === -1) {
          models.unshift(preferredModel);
        } else {
          models.splice(existingIndex, 1);
          models.unshift(preferredModel);
        }
      }
      sendJson(response, 200, { models });
    } catch (error) {
      sendJson(response, 200, {
        models: fallbackFeatherlessModels(),
        error: `${error.message || "Could not load Featherless models."} Using configured model fallback.`
      });
    }
    return;
  }

  if (modelPathname === "/api/ollama/chat" && request.method === "POST") {
    let logRequest = null;
    try {
      const body = await readJsonBody(request);
      const { model, messages } = cleanChatPayload(body);
      logRequest = {
        endpoint: modelPathname,
        providerEndpoint: "/chat/completions",
        model,
        messages,
        stream: false
      };

      const featherlessResponse = await fetchFeatherless("/chat/completions", {
        method: "POST",
        headers: featherlessHeaders(),
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          max_tokens: featherlessDefaultMaxTokens,
          temperature: featherlessDefaultTemperature,
          top_p: featherlessDefaultTopP,
          stop: featherlessStopSequences,
          chat_template_kwargs: {
            enable_thinking: false
          }
        })
      });
      const payload = await featherlessResponse.json().catch(() => ({}));
      if (!featherlessResponse.ok) {
        const error = payload.error?.message || payload.error || `Featherless returned HTTP ${featherlessResponse.status}.`;
        appendPhysicalModelLog({
          type: "featherless.chat",
          status: "error",
          request: logRequest,
          responseStatus: featherlessResponse.status,
          error
        });
        sendJson(response, featherlessResponse.status, { error });
        return;
      }
      const text = String(payload.choices?.[0]?.message?.content || "").trim();
      if (!text) {
        appendPhysicalModelLog({
          type: "featherless.chat",
          status: "error",
          request: logRequest,
          responseStatus: 502,
          response: payload,
          error: "Featherless did not return a text response."
        });
        sendJson(response, 502, { error: "Featherless did not return a text response." });
        return;
      }
      const result = {
        text,
        model,
        metadata: {
          model: payload.model || model,
          id: payload.id,
          finish_reason: payload.choices?.[0]?.finish_reason || null,
          usage: payload.usage || null,
          provider: "featherless"
        }
      };
      appendPhysicalModelLog({
        type: "featherless.chat",
        status: "complete",
        request: logRequest,
        responseStatus: featherlessResponse.status,
        response: result
      });
      sendJson(response, 200, result);
    } catch (error) {
      appendPhysicalModelLog({
        type: "featherless.chat",
        status: "error",
        request: logRequest,
        error: error.message || "Could not send chat message to Featherless."
      });
      sendJson(response, 500, { error: error.message || "Could not send chat message to Featherless." });
    }
    return;
  }

  if (modelPathname === "/api/ollama/character-vibe" && request.method === "POST") {
    let logRequest = null;
    try {
      const body = await readJsonBody(request);
      const model = String(body.model || featherlessDefaultModel || "").trim();
      const vibe = body.vibe && typeof body.vibe === "object" ? body.vibe : {};
      const existingCharacter = body.existingCharacter && typeof body.existingCharacter === "object" ? body.existingCharacter : {};
      if (!model) {
        throw new Error("No Featherless model is configured for AI Vibe.");
      }
      if (!Object.values(vibe).some((value) => String(value || "").trim())) {
        throw new Error("At least one AI Vibe note is required.");
      }
      assertAdultLegalFictionBoundary(vibe);

      const messages = [
        {
          role: "system",
          content: "You generate adult fictional roleplay character drafts as strict JSON for Centralis. Follow the user's adult legal fiction boundary exactly."
        },
        {
          role: "user",
          content: buildCharacterVibePrompt(vibe, existingCharacter)
        }
      ];
      const vibeModels = [
        model,
        ...featherlessPreferredModels
      ].filter((item, index, list) => item && list.indexOf(item) === index);
      const attempts = [];
      logRequest = {
        endpoint: pathname,
        providerEndpoint: "/chat/completions",
        model,
        fallbackModels: vibeModels.slice(1),
        messages,
        stream: false
      };

      let payload = null;
      let responseStatus = 0;
      let usedModel = "";
      for (let index = 0; index < vibeModels.length; index += 1) {
        const attemptModel = vibeModels[index];
        const featherlessResponse = await fetchFeatherless("/chat/completions", {
          method: "POST",
          headers: featherlessHeaders(),
          body: JSON.stringify({
            model: attemptModel,
            messages,
            stream: false,
            max_tokens: Number(process.env.FEATHERLESS_VIBE_MAX_TOKENS || 1400),
            temperature: Number(process.env.FEATHERLESS_VIBE_TEMPERATURE || 0.88),
            top_p: Number(process.env.FEATHERLESS_VIBE_TOP_P || 0.94),
            stop: featherlessStopSequences,
            chat_template_kwargs: {
              enable_thinking: false
            }
          })
        }, Number(process.env.FEATHERLESS_TIMEOUT_MS || 120000));
        const attemptPayload = await featherlessResponse.json().catch(() => ({}));
        responseStatus = featherlessResponse.status;
        if (featherlessResponse.ok) {
          payload = attemptPayload;
          usedModel = attemptModel;
          attempts.push({ model: attemptModel, status: "complete" });
          break;
        }

        const error = attemptPayload.error?.message || attemptPayload.error || `Featherless returned HTTP ${featherlessResponse.status}.`;
        attempts.push({ model: attemptModel, status: "error", responseStatus: featherlessResponse.status, error });
        if (!isCapacityError(featherlessResponse.status, error) || index === vibeModels.length - 1) {
          appendPhysicalModelLog({
            type: "featherless.character_vibe",
            status: "error",
            request: logRequest,
            responseStatus: featherlessResponse.status,
            error,
            attempts
          });
          sendJson(response, featherlessResponse.status, { error, attempts });
          return;
        }
      }

      const text = String(payload.choices?.[0]?.message?.content || "").trim();
      let parsed = {};
      let repairNote = "";
      try {
        parsed = parseJsonFromModelText(text);
      } catch (error) {
        repairNote = error.message || "Featherless did not return valid JSON for the character draft.";
      }
      if (parsed.error) {
        const error = String(parsed.error || "AI Vibe could not generate that character safely.").trim();
        appendPhysicalModelLog({
          type: "featherless.character_vibe",
          status: "blocked",
          request: logRequest,
          responseStatus: 422,
          response: parsed,
          error,
          attempts
        });
        sendJson(response, 422, { error, attempts });
        return;
      }

      const character = ensureAdultCharacterMarker(completeGeneratedCharacterDraft(
        cleanGeneratedCharacterDraft(parsed),
        vibe,
        existingCharacter
      ));
      assertAdultLegalFictionBoundary(character);
      validateGeneratedCharacterDraft(character);
      const result = {
        character,
        model: usedModel || model,
        requestedModel: model,
        fallbackUsed: Boolean(usedModel && usedModel !== model),
        attempts,
        metadata: {
          model: payload.model || usedModel || model,
          id: payload.id,
          finish_reason: payload.choices?.[0]?.finish_reason || null,
          usage: payload.usage || null,
          provider: "featherless"
        },
        repairNote: repairNote || null
      };
      appendPhysicalModelLog({
        type: "featherless.character_vibe",
        status: "complete",
        request: logRequest,
        responseStatus,
        response: result
      });
      sendJson(response, 200, result);
    } catch (error) {
      appendPhysicalModelLog({
        type: "featherless.character_vibe",
        status: "error",
        request: logRequest,
        error: error.message || "Could not generate character vibe."
      });
      const message = error.message || "Could not generate character vibe.";
      const status = message.includes("required")
        ? 400
        : message.startsWith("AI Vibe can generate adult fictional taboo themes")
          ? 422
          : 500;
      sendJson(response, status, { error: message });
    }
    return;
  }

  if (modelPathname === "/api/ollama/character-image" && request.method === "POST") {
    let logRequest = null;
    const attempts = [];
    try {
      const body = await readJsonBody(request);
      const character = body.character && typeof body.character === "object" ? body.character : {};
      const hasPromptSource = ["short_description", "description", "appearance"]
        .some((field) => String(character[field] || "").trim());
      if (!hasPromptSource) {
        throw new Error("Add a short description, description, or appearance before generating an image.");
      }

      const prompt = buildCharacterImagePrompt(character);
      logRequest = {
        endpoint: pathname,
        prompt,
        openai: {
          model: "gpt-image-2",
          size: "1440x2560",
          quality: "medium",
          moderation: "low",
          format: "png"
        },
        veniceFallback: {
          model: "nano-banana-pro",
          size: "1440x2560",
          resolution: "2K",
          aspect_ratio: "9:16",
          format: "png",
          style_preset: "Hyperrealism",
          moderation: "low"
        }
      };

      let generated = null;
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
          throw veniceError;
        }
      }

      const result = {
        image: generated,
        prompt,
        attempts
      };
      appendPhysicalModelLog({
        type: "roleplayer.character_image",
        status: "complete",
        request: logRequest,
        response: {
          provider: generated.provider,
          model: generated.model,
          contentType: generated.contentType,
          base64Length: generated.base64.length,
          attempts
        }
      });
      sendJson(response, 200, result);
    } catch (error) {
      appendPhysicalModelLog({
        type: "roleplayer.character_image",
        status: "error",
        request: logRequest,
        error: error.message || "Could not generate character image.",
        attempts
      });
      sendJson(response, error.message?.startsWith("Add a short description") ? 400 : 500, {
        error: error.message || "Could not generate character image.",
        attempts
      });
    }
    return;
  }

  if (modelPathname === "/api/ollama/chat-stream-json" && request.method === "POST") {
    const controller = new AbortController();
    const streamTimeoutMs = Number(process.env.OLLAMA_STREAM_TIMEOUT_MS || 600000);
    let streamTimedOut = false;
    let streamComplete = false;
    let timeout = null;
    let logRequest = null;
    let streamedText = "";
    const resetStreamTimeout = () => {
      if (timeout) clearTimeout(timeout);
      if (streamTimeoutMs > 0) {
        timeout = setTimeout(() => {
          streamTimedOut = true;
          controller.abort();
        }, streamTimeoutMs);
      }
    };
    resetStreamTimeout();
    request.on("aborted", () => controller.abort());
    response.on("close", () => {
      if (!streamComplete) {
        controller.abort();
      }
    });

    try {
      const body = await readJsonBody(request);
      const { model, messages } = cleanChatPayload(body);
      logRequest = {
        endpoint: modelPathname,
        providerEndpoint: "/chat/completions",
        model,
        messages,
        stream: true
      };
      const featherlessResponse = await fetch(`${featherlessBaseUrl}/chat/completions`, {
        method: "POST",
        headers: featherlessHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: featherlessDefaultMaxTokens,
          temperature: featherlessDefaultTemperature,
          top_p: featherlessDefaultTopP,
          stop: featherlessStopSequences,
          chat_template_kwargs: {
            enable_thinking: false
          }
        })
      });

      if (!featherlessResponse.ok) {
        const payload = await featherlessResponse.json().catch(() => ({}));
        const error = payload.error?.message || payload.error || `Featherless returned HTTP ${featherlessResponse.status}.`;
        appendPhysicalModelLog({
          type: "featherless.chat_stream_json",
          status: "error",
          request: logRequest,
          responseStatus: featherlessResponse.status,
          error
        });
        sendJson(response, featherlessResponse.status, { error });
        return;
      }
      if (!featherlessResponse.body) {
        appendPhysicalModelLog({
          type: "featherless.chat_stream_json",
          status: "error",
          request: logRequest,
          responseStatus: 502,
          error: "Featherless did not return a streaming response."
        });
        sendJson(response, 502, { error: "Featherless did not return a streaming response." });
        return;
      }

      response.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no"
      });

      const reader = featherlessResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalMetadata = null;
      let extractedAnyText = false;
      let firstUnrecognizedPayload = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        resetStreamTimeout();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const payload = parseFeatherlessStreamLine(line);
          if (!payload) continue;
          if (payload.error) {
            throw new Error(payload.error.message || payload.error || "Featherless stream failed.");
          }
          const delta = extractFeatherlessText(payload);
          if (delta) {
            extractedAnyText = true;
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
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const lines = buffer.split(/\r?\n/).filter((line) => line.trim());
        for (const line of lines) {
          const payload = parseFeatherlessStreamLine(line);
          if (!payload) continue;
          if (payload.error) {
            throw new Error(payload.error.message || payload.error || "Featherless stream failed.");
          }
          const delta = extractFeatherlessText(payload);
          if (delta) {
            extractedAnyText = true;
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
        }
      }
      if (!finalMetadata) {
          finalMetadata = {
            model,
            provider: "featherless"
          };
      }
      if (!extractedAnyText && firstUnrecognizedPayload) {
        writeNdjson(response, {
          type: "debug",
          warning: "Featherless streamed chunks, but Centralis did not find text in the expected fields.",
          sample: firstUnrecognizedPayload
        });
      }
      appendPhysicalModelLog({
        type: "featherless.chat_stream_json",
        status: "complete",
        request: logRequest,
        responseStatus: 200,
        response: {
          text: streamedText,
          model,
          metadata: finalMetadata || { model },
          debugSample: !extractedAnyText && firstUnrecognizedPayload ? firstUnrecognizedPayload : null
        }
      });
      writeNdjson(response, { type: "done", model, metadata: finalMetadata || { model } });
      streamComplete = true;
      response.end();
    } catch (error) {
      appendPhysicalModelLog({
        type: "featherless.chat_stream_json",
        status: "error",
        request: logRequest,
        response: streamedText ? { partialText: streamedText } : null,
        error: streamTimedOut ? "Featherless stream timed out while waiting for more text." : error.message || "Could not stream chat message from Featherless."
      });
      if (!response.headersSent) {
        sendJson(response, error.message?.includes("required") ? 400 : 500, { error: streamTimedOut ? "Featherless stream timed out while waiting for more text." : error.message || "Could not stream chat message from Featherless." });
      } else {
        writeNdjson(response, {
          type: "error",
          error: streamTimedOut ? "Featherless stream timed out while waiting for more text." : error.message || "Could not stream chat message from Featherless."
        });
        streamComplete = true;
        response.end();
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    return;
  }

  if (modelPathname === "/api/ollama/chat-stream" && request.method === "POST") {
    const controller = new AbortController();
    const streamTimeoutMs = Number(process.env.OLLAMA_STREAM_TIMEOUT_MS || 600000);
    let streamTimedOut = false;
    let streamComplete = false;
    let timeout = null;
    let logRequest = null;
    let streamedText = "";
    const resetStreamTimeout = () => {
      if (timeout) clearTimeout(timeout);
      if (streamTimeoutMs > 0) {
        timeout = setTimeout(() => {
          streamTimedOut = true;
          controller.abort();
        }, streamTimeoutMs);
      }
    };
    resetStreamTimeout();
    request.on("aborted", () => controller.abort());
    response.on("close", () => {
      if (!streamComplete) {
        controller.abort();
      }
    });

    try {
      const body = await readJsonBody(request);
      const { model, messages } = cleanChatPayload(body);
      logRequest = {
        endpoint: modelPathname,
        providerEndpoint: "/chat/completions",
        model,
        messages,
        stream: true
      };
      const featherlessResponse = await fetch(`${featherlessBaseUrl}/chat/completions`, {
        method: "POST",
        headers: featherlessHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: featherlessDefaultMaxTokens,
          temperature: featherlessDefaultTemperature,
          top_p: featherlessDefaultTopP,
          stop: featherlessStopSequences,
          chat_template_kwargs: {
            enable_thinking: false
          }
        })
      });

      if (!featherlessResponse.ok) {
        const payload = await featherlessResponse.json().catch(() => ({}));
        const error = payload.error?.message || payload.error || `Featherless returned HTTP ${featherlessResponse.status}.`;
        appendPhysicalModelLog({
          type: "featherless.chat_stream",
          status: "error",
          request: logRequest,
          responseStatus: featherlessResponse.status,
          error
        });
        sendJson(response, featherlessResponse.status, { error });
        return;
      }
      if (!featherlessResponse.body) {
        appendPhysicalModelLog({
          type: "featherless.chat_stream",
          status: "error",
          request: logRequest,
          responseStatus: 502,
          error: "Featherless did not return a streaming response."
        });
        sendJson(response, 502, { error: "Featherless did not return a streaming response." });
        return;
      }

      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no"
      });

      const reader = featherlessResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        resetStreamTimeout();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const payload = parseFeatherlessStreamLine(line);
          if (!payload) continue;
          if (payload.error) {
            throw new Error(payload.error.message || payload.error || "Featherless stream failed.");
          }
          const delta = extractFeatherlessText(payload);
          if (delta) {
            streamedText += delta;
            response.write(delta);
          }
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const lines = buffer.split(/\r?\n/).filter((line) => line.trim());
        for (const line of lines) {
          const payload = parseFeatherlessStreamLine(line);
          if (!payload) continue;
          if (payload.error) {
            throw new Error(payload.error.message || payload.error || "Featherless stream failed.");
          }
          const delta = extractFeatherlessText(payload);
          if (delta) {
            streamedText += delta;
            response.write(delta);
          }
        }
      }
      appendPhysicalModelLog({
        type: "featherless.chat_stream",
        status: "complete",
        request: logRequest,
        responseStatus: 200,
        response: {
          text: streamedText,
          model
        }
      });
      streamComplete = true;
      response.end();
    } catch (error) {
      appendPhysicalModelLog({
        type: "featherless.chat_stream",
        status: "error",
        request: logRequest,
        response: streamedText ? { partialText: streamedText } : null,
        error: streamTimedOut ? "Featherless stream timed out while waiting for more text." : error.message || "Could not stream chat message from Featherless."
      });
      if (!response.headersSent) {
        sendJson(response, error.message?.includes("required") ? 400 : 500, { error: streamTimedOut ? "Featherless stream timed out while waiting for more text." : error.message || "Could not stream chat message from Featherless." });
      } else {
        if (streamTimedOut) {
          response.write("\n\n[Stream stopped: Featherless did not send more text before the local timeout.]");
        }
        streamComplete = true;
        response.end();
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    return;
  }

  sendJson(response, 404, { error: "Unknown model route." });
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${host}:${port}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);

  if (pathname.startsWith("/api/ollama/") || pathname.startsWith("/api/featherless/")) {
    await handleModelRoute(request, response, pathname);
    return;
  }

  const filePath = path.resolve(root, `.${pathname}`);

  if (!filePath.startsWith(root)) {
    send(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      send(response, 404, "Not found");
      return;
    }
    send(response, 200, body, types[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  });
}).listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}/`);
});
