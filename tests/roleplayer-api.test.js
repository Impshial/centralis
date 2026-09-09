"use strict";

const { after, afterEach, before, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");

const statusHandler = require("../api/featherless/status");
const modelsHandler = require("../api/featherless/models");
const chatHandler = require("../api/featherless/chat");
const characterVibeHandler = require("../api/featherless/character-vibe");
const characterImageHandler = require("../api/featherless/character-image");
const chatStreamHandler = require("../api/featherless/chat-stream-json");

const TEST_ENV = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  SUPABASE_SECRET_KEY: "secret-test-key",
  FEATHERLESS_API_KEY: "featherless-test-key",
  FEATHERLESS_BASE_URL: "https://featherless.test/v1",
  OPENAI_API_KEY: "openai-test-key"
};
const ENV_KEYS = [
  ...Object.keys(TEST_ENV),
  "SUPABASE_PUBLISHABLE_KEYS",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FEATHERLESS_MODEL",
  "FEATHERLESS_VIBE_FALLBACK_MODEL"
];

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;
const originalConsoleError = console.error;

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = new Map();
    this.headersSent = false;
    this.writableEnded = false;
    this.chunks = [];
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  flushHeaders() {
    this.headersSent = true;
  }

  write(chunk) {
    this.headersSent = true;
    this.chunks.push(Buffer.from(String(chunk)));
    return true;
  }

  end(chunk) {
    if (chunk !== undefined) this.write(chunk);
    this.headersSent = true;
    this.writableEnded = true;
  }

  on() {
    return this;
  }

  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }

  json() {
    return JSON.parse(this.text());
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function request(method, body, headers = {}) {
  return {
    method,
    headers: {
      authorization: "Bearer roleplayer-access-token",
      origin: "https://centralis.test",
      ...headers
    },
    ...(body === undefined ? {} : { body }),
    on() {
      return this;
    }
  };
}

function installAdminFetch(upstream) {
  const calls = [];
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });

    if (url === "https://supabase.test/auth/v1/user") {
      assert.equal(init.headers.apikey, TEST_ENV.SUPABASE_PUBLISHABLE_KEY);
      assert.equal(init.headers.Authorization, "Bearer roleplayer-access-token");
      return jsonResponse({ id: "supabase-auth-user" });
    }

    if (url.startsWith("https://supabase.test/rest/v1/users?")) {
      assert.match(url, /clerk_user_id=eq\.supabase-auth-user/);
      assert.equal(init.headers.apikey, TEST_ENV.SUPABASE_SECRET_KEY);
      assert.equal(init.headers.Authorization, `Bearer ${TEST_ENV.SUPABASE_SECRET_KEY}`);
      return jsonResponse([{ id: "centralis-user", admin: true }]);
    }

    return upstream(url, init);
  };
  return calls;
}

function upstreamCalls(calls) {
  return calls.filter(({ url }) => url.startsWith(TEST_ENV.FEATHERLESS_BASE_URL));
}

before(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, TEST_ENV);
});

beforeEach(() => {
  global.fetch = async (input) => {
    throw new Error(`Unexpected fetch: ${String(input)}`);
  };
  console.error = () => {};
});

afterEach(() => {
  global.fetch = originalFetch;
  console.error = originalConsoleError;
});

after(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test("status authenticates an admin and verifies the Featherless plan", async () => {
  const calls = installAdminFetch(async (url, init) => {
    assert.equal(url, "https://featherless.test/v1/plan");
    assert.equal(init.headers.Authorization, `Bearer ${TEST_ENV.FEATHERLESS_API_KEY}`);
    return jsonResponse({ id: "test-plan", concurrency: 1 });
  });
  const response = new MockResponse();

  await statusHandler(request("GET"), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    baseUrl: TEST_ENV.FEATHERLESS_BASE_URL,
    provider: "featherless"
  });
  assert.equal(upstreamCalls(calls).length, 1);
});

test("models returns the provider catalog with preferred models first", async () => {
  const calls = installAdminFetch(async (url) => {
    if (url.startsWith("https://featherless.test/v1/models?")) {
      return jsonResponse({
        data: [
          { id: "catalog/model", context_length: 8192 },
          { id: "anthracite-org/magnum-v4-9b", context_length: 4096 }
        ]
      });
    }
    if (url.startsWith("https://featherless.test/v1/models/")) {
      const id = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
      return jsonResponse({ id, context_length: 16384 });
    }
    throw new Error(`Unexpected upstream URL: ${url}`);
  });
  const response = new MockResponse();

  await modelsHandler(request("GET"), response);

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.deepEqual(payload.models.map((model) => model.name), [
    "anthracite-org/magnum-v4-9b",
    "huihui-ai/Qwen2.5-Coder-32B-Instruct-abliterated",
    "catalog/model"
  ]);
  assert.equal(payload.models[0].context_length, 16384);
  assert.equal(upstreamCalls(calls).length, 3);
});

test("chat proxies a cleaned non-streaming completion", async () => {
  const calls = installAdminFetch(async (url, init) => {
    assert.equal(url, "https://featherless.test/v1/chat/completions");
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "model/test");
    assert.equal(body.stream, false);
    assert.deepEqual(body.messages, [
      { role: "system", content: "Stay in character." },
      { role: "user", content: "Hello." }
    ]);
    return jsonResponse({
      id: "completion-1",
      model: "model/test",
      choices: [{ message: { content: "Welcome back." }, finish_reason: "stop" }],
      usage: { total_tokens: 12 }
    });
  });
  const response = new MockResponse();

  await chatHandler(request("POST", {
    model: "model/test",
    messages: [
      { role: "system", content: " Stay in character. " },
      { role: "tool", content: "ignored" },
      { role: "user", content: " Hello. " }
    ]
  }), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    text: "Welcome back.",
    model: "model/test",
    metadata: {
      model: "model/test",
      id: "completion-1",
      finish_reason: "stop",
      usage: { total_tokens: 12 },
      provider: "featherless"
    }
  });
  assert.equal(upstreamCalls(calls).length, 1);
});

test("character-vibe returns a complete generated character draft", async () => {
  const generatedCharacter = {
    name: "Aria Vale",
    short_description: "An adult navigator with a taste for danger.",
    description: "Aria is an adult navigator charting strange frontiers.",
    core_identity: "An adult explorer who prizes freedom and honesty.",
    personality: "Quick-witted, curious, and quietly loyal.",
    appearance: "Weathered flight jacket, silver compass, alert eyes.",
    background: "A veteran of remote expeditions and failed rescue missions.",
    speech_style: "Dry humor with precise, economical phrasing.",
    scenario: "Aria meets the user beside a disabled starship.",
    behavior_instructions: "Never speak, act, decide, feel, or think for the user.",
    drift_guardrails: "Preserve Aria's established motives and voice.",
    system_prompt: "Portray Aria consistently and leave all user choices open.",
    first_message: "Aria taps the cracked navigation display. “You picked an interesting night to arrive.”",
    tags: ["adult", "science fiction", "adventure"]
  };
  const calls = installAdminFetch(async (url, init) => {
    assert.equal(url, "https://featherless.test/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "model/test");
    assert.equal(body.stream, false);
    assert.match(body.messages[1].content, /Fun and dangerous/);
    return jsonResponse({
      id: "vibe-1",
      model: "model/test",
      choices: [{ message: { content: JSON.stringify(generatedCharacter) }, finish_reason: "stop" }]
    });
  });
  const response = new MockResponse();

  await characterVibeHandler(request("POST", {
    model: "model/test",
    vibe: { general_vibe: "Fun and dangerous" },
    existingCharacter: {}
  }), response);

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.deepEqual(payload.character, generatedCharacter);
  assert.equal(payload.model, "model/test");
  assert.equal(payload.fallbackUsed, false);
  assert.deepEqual(payload.attempts, [{ model: "model/test", status: "complete" }]);
  assert.equal(upstreamCalls(calls).length, 1);
});

test("character-image requests a compressed production-safe portrait", async () => {
  const calls = installAdminFetch(async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/images/generations");
    assert.equal(init.headers.Authorization, `Bearer ${TEST_ENV.OPENAI_API_KEY}`);
    const body = JSON.parse(init.body);
    assert.equal(body.model, "gpt-image-2");
    assert.equal(body.size, "1024x1536");
    assert.equal(body.output_format, "jpeg");
    assert.equal(body.output_compression, 82);
    return jsonResponse({ data: [{ b64_json: "cG9ydHJhaXQ=" }] });
  });
  const response = new MockResponse();

  await characterImageHandler(request("POST", {
    character: {
      name: "Aria Vale",
      short_description: "An adult navigator."
    }
  }), response);

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.image.base64, "cG9ydHJhaXQ=");
  assert.equal(payload.image.contentType, "image/jpeg");
  assert.equal(payload.image.provider, "openai");
  assert.deepEqual(payload.attempts, [{ provider: "openai", model: "gpt-image-2", status: "complete" }]);
  assert.equal(calls.filter(({ url }) => url === "https://api.openai.com/v1/images/generations").length, 1);
});

test("chat-stream-json translates Featherless SSE into browser NDJSON", async () => {
  const calls = installAdminFetch(async (url, init) => {
    assert.equal(url, "https://featherless.test/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "model/test");
    assert.equal(body.stream, true);
    return new Response([
      'data: {"id":"stream-1","model":"model/test","choices":[{"delta":{"content":"Hello "},"finish_reason":null}]}\n',
      'data: {"id":"stream-1","model":"model/test","choices":[{"delta":{"content":"there."},"finish_reason":"stop"}]}\n',
      "data: [DONE]\n"
    ].join(""), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" }
    });
  });
  const response = new MockResponse();

  await chatStreamHandler(request("POST", {
    model: "model/test",
    messages: [{ role: "user", content: "Begin." }]
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.getHeader("content-type"), "application/x-ndjson; charset=utf-8");
  const records = response.text().trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.type), ["delta", "delta", "done"]);
  assert.equal(records.filter((record) => record.type === "delta").map((record) => record.text).join(""), "Hello there.");
  assert.equal(records.at(-1).metadata.finish_reason, "stop");
  assert.equal(upstreamCalls(calls).length, 1);
});

test("chat-stream-json propagates browser cancellation to Featherless", async () => {
  const clientController = new AbortController();
  let providerSignal = null;
  let markStreamStarted;
  const streamStarted = new Promise((resolve) => {
    markStreamStarted = resolve;
  });
  installAdminFetch(async (url, init) => {
    assert.equal(url, "https://featherless.test/v1/chat/completions");
    providerSignal = init.signal;
    const body = new ReadableStream({
      start(controller) {
        init.signal.addEventListener("abort", () => {
          const error = new Error("The client stopped the response.");
          error.name = "AbortError";
          controller.error(error);
        }, { once: true });
        markStreamStarted();
      }
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" }
    });
  });
  const response = new MockResponse();
  const streamRequest = request("POST", {
    model: "model/test",
    messages: [{ role: "user", content: "Begin." }]
  });
  streamRequest.signal = clientController.signal;

  const handling = chatStreamHandler(streamRequest, response);
  await streamStarted;
  clientController.abort();
  await handling;

  assert.equal(providerSignal.aborted, true);
  const records = response.text().trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(records.at(-1).type, "error");
  assert.match(records.at(-1).error, /client stopped/i);
});

test("requests without a bearer token are rejected before any upstream fetch", async () => {
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    throw new Error("Authentication failure should not make a fetch request.");
  };
  const response = new MockResponse();

  await statusHandler(request("GET", undefined, { authorization: "" }), response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "You must be signed in to use Roleplayer AI." });
  assert.equal(fetchCount, 0);
});

test("method mismatches return 405 and the expected Allow header before auth", async () => {
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    throw new Error("Method mismatch should not make a fetch request.");
  };
  const response = new MockResponse();

  await chatHandler(request("GET", undefined, { authorization: "" }), response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.getHeader("allow"), "POST");
  assert.deepEqual(response.json(), { error: "Method not allowed." });
  assert.equal(fetchCount, 0);
});
