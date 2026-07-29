const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const modelLogPath = path.join(root, "logs", "local-chat-model.log");

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
    console.warn("Could not append Local Chat model log:", error);
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
    "HTTP-Referer": "http://127.0.0.1:4173/local-chat.html",
    "X-Title": "Centralis Local Chat",
    ...extraHeaders
  };
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
