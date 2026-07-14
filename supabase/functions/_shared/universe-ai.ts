import { createAdminClient, getEnv } from "./image-storage.ts";
import { TEXT_MODEL } from "./openai-config.ts";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const MAX_MESSAGE_LENGTH = 12000;
const MAX_HISTORY_MESSAGES = 24;

type AppUser = {
  id: number;
  clerk_user_id: string;
};

type UniverseRecord = {
  id: string;
  user_id: number;
  name: string;
  description: string | null;
};

type ElementTypeRecord = {
  id: string;
  name: string;
};

type ElementRecord = {
  id: string;
  name: string;
  description: string | null;
  element_type_id: string | null;
};

type ElementLinkRecord = {
  id: string;
  source_element_id: string | null;
  target_element_id: string | null;
  label: string | null;
};

type UniverseContext = {
  universe: UniverseRecord;
  elementTypesById: Map<string, ElementTypeRecord>;
  elements: ElementRecord[];
  links: ElementLinkRecord[];
};

export function getUniverseAiModel() {
  return Deno.env.get("UNIVERSE_AI_MODEL") || TEXT_MODEL;
}

export function cleanUniverseId(value: unknown) {
  return String(value || "").trim();
}

export function cleanUserMessage(value: unknown) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function serializeSource(source: Record<string, unknown> | null) {
  if (!source) {
    return null;
  }

  return {
    universe_id: source.universe_id,
    sync_status: source.sync_status || "dirty",
    sync_error: source.sync_error || "",
    last_synced_at: source.last_synced_at || null,
    updated_at: source.updated_at || null,
  };
}

export function serializeChat(chat: Record<string, unknown> | null) {
  if (!chat) {
    return null;
  }

  return {
    id: chat.id,
    universe_id: chat.universe_id,
    title: chat.title || "AI Expert",
    updated_at: chat.updated_at || null,
  };
}

export function serializeMessages(messages: Array<Record<string, unknown>> = []) {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    citations: message.citations || [],
    created_at: message.created_at,
  }));
}

export async function getAppUser(authUserId: string): Promise<AppUser> {
  const { data, error } = await createAdminClient()
    .from("users")
    .select("id,clerk_user_id")
    .eq("clerk_user_id", authUserId)
    .single();

  if (error || !data) {
    throw error || new Error("Centralis user profile was not found.");
  }

  return data as AppUser;
}

export async function loadUniverseContext(supabase: ReturnType<typeof createAdminClient>, universeId: string, appUserId: number): Promise<UniverseContext> {
  const { data: universe, error: universeError } = await supabase
    .from("universes")
    .select("id,user_id,name,description")
    .eq("id", universeId)
    .eq("user_id", appUserId)
    .maybeSingle();

  if (universeError || !universe) {
    throw universeError || new Error("Universe was not found.");
  }

  const [elementResponse, linkResponse, typeResponse] = await Promise.all([
    supabase
      .from("elements")
      .select("id,name,description,element_type_id")
      .eq("universe_id", universeId)
      .eq("user_id", appUserId)
      .order("name", { ascending: true }),
    supabase
      .from("element_links")
      .select("id,source_element_id,target_element_id,label")
      .eq("universe_id", universeId)
      .order("created_at", { ascending: true }),
    supabase
      .from("element_types")
      .select("id,name")
      .eq("user_id", appUserId)
      .order("name", { ascending: true }),
  ]);

  if (elementResponse.error) throw elementResponse.error;
  if (linkResponse.error) throw linkResponse.error;
  if (typeResponse.error) throw typeResponse.error;

  const elementTypesById = new Map<string, ElementTypeRecord>();
  (typeResponse.data || []).forEach((type) => {
    if (type.id) {
      elementTypesById.set(String(type.id), {
        id: String(type.id),
        name: String(type.name || "Untitled Type"),
      });
    }
  });

  return {
    universe: universe as UniverseRecord,
    elementTypesById,
    elements: (elementResponse.data || []) as ElementRecord[],
    links: (linkResponse.data || []) as ElementLinkRecord[],
  };
}

function markdownEscape(value: unknown) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function getElementTypeName(element: ElementRecord, context: UniverseContext) {
  return element.element_type_id
    ? context.elementTypesById.get(String(element.element_type_id))?.name || "Unknown Type"
    : "No Type";
}

export function buildUniverseCanonDocument(context: UniverseContext) {
  const elementById = new Map(context.elements.map((element) => [String(element.id), element]));
  const sortedElements = [...context.elements].sort((left, right) => {
    const leftType = getElementTypeName(left, context);
    const rightType = getElementTypeName(right, context);
    return leftType.localeCompare(rightType) || String(left.name || "").localeCompare(String(right.name || ""));
  });

  const lines = [
    `# Universe: ${markdownEscape(context.universe.name) || "Untitled Universe"}`,
    "",
    `Universe ID: ${context.universe.id}`,
    "",
    "## Overview",
    "",
    markdownEscape(context.universe.description) || "No universe description has been defined.",
    "",
    "## Elements",
    "",
  ];

  if (!sortedElements.length) {
    lines.push("No elements have been created yet.", "");
  } else {
    sortedElements.forEach((element) => {
      lines.push(
        `### ${markdownEscape(element.name) || "Untitled Element"}`,
        "",
        `Element ID: ${element.id}`,
        `Element Type: ${getElementTypeName(element, context)}`,
        "",
        "Description:",
        markdownEscape(element.description) || "No description has been defined.",
        "",
      );
    });
  }

  lines.push("## Relationships", "");

  const usefulLinks = context.links.filter((link) => link.source_element_id || link.target_element_id);
  if (!usefulLinks.length) {
    lines.push("No element relationships have been defined yet.", "");
  } else {
    usefulLinks.forEach((link) => {
      const source = link.source_element_id ? elementById.get(String(link.source_element_id)) : null;
      const target = link.target_element_id ? elementById.get(String(link.target_element_id)) : null;
      const sourceName = source?.name || "Universe";
      const targetName = target?.name || "Universe";
      const label = markdownEscape(link.label) || "links to";
      lines.push(`- ${sourceName} ${label} ${targetName}.`);
    });
    lines.push("");
  }

  lines.push(
    "## Canon Use Rules",
    "",
    "- Treat this document as the current authoritative Centralis canon for this universe.",
    "- If a fact is not present here, it has not been defined yet.",
    "- Element IDs are stable references; names and descriptions are user-facing canon.",
    "- Relationship labels describe directed canvas links from source to target.",
    "",
  );

  return lines.join("\n");
}

export async function hashText(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function openAiRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${getEnv("OPENAI_API_KEY")}`);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${OPENAI_API_BASE}${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const nestedError = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
    throw new Error(String(nestedError?.message || record.error || record.message || `OpenAI request failed with ${response.status}.`));
  }

  return payload as Record<string, unknown>;
}

export async function createOpenAiVectorStore(universeName: string, universeId: string) {
  const payload = await openAiRequest("/vector_stores", {
    method: "POST",
    body: JSON.stringify({
      name: `Centralis Universe: ${universeName || universeId}`,
    }),
  });

  const id = String(payload.id || "");
  if (!id) {
    throw new Error("OpenAI did not return a vector store ID.");
  }
  return id;
}

export async function uploadOpenAiCanonFile(filename: string, content: string) {
  const formData = new FormData();
  formData.set("purpose", "assistants");
  formData.set("file", new File([content], filename, { type: "text/markdown" }));

  const payload = await openAiRequest("/files", {
    method: "POST",
    body: formData,
  });

  const id = String(payload.id || "");
  if (!id) {
    throw new Error("OpenAI did not return a file ID.");
  }
  return id;
}

export async function attachFileToVectorStore(vectorStoreId: string, fileId: string) {
  await openAiRequest(`/vector_stores/${encodeURIComponent(vectorStoreId)}/files`, {
    method: "POST",
    body: JSON.stringify({ file_id: fileId }),
  });
}

export async function waitForVectorStoreFile(vectorStoreId: string, fileId: string) {
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const payload = await openAiRequest(`/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`);
    const status = String(payload.status || "");
    if (status === "completed") {
      return;
    }
    if (["failed", "cancelled", "expired"].includes(status)) {
      throw new Error(`OpenAI file indexing ${status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 + attempt * 250));
  }

  throw new Error("OpenAI file indexing timed out.");
}

export async function removeOpenAiFile(vectorStoreId: string, fileId: string) {
  if (!fileId) return;

  await openAiRequest(`/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  }).catch((error) => {
    console.warn("Could not detach old OpenAI file from vector store:", error);
  });

  await openAiRequest(`/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  }).catch((error) => {
    console.warn("Could not delete old OpenAI file:", error);
  });
}

export async function getOrCreateAiSource(
  supabase: ReturnType<typeof createAdminClient>,
  universeId: string,
  appUserId: number,
) {
  const { data: existing, error: existingError } = await supabase
    .from("universe_ai_sources")
    .select("*")
    .eq("universe_id", universeId)
    .eq("user_id", appUserId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return existing as Record<string, unknown>;
  }

  const { data, error } = await supabase
    .from("universe_ai_sources")
    .insert({
      universe_id: universeId,
      user_id: appUserId,
      sync_status: "dirty",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error || new Error("Could not create AI source.");
  }

  return data as Record<string, unknown>;
}

export async function getOrCreateAiChat(
  supabase: ReturnType<typeof createAdminClient>,
  universeId: string,
  appUserId: number,
) {
  const { data: existing, error: existingError } = await supabase
    .from("universe_ai_chats")
    .select("*")
    .eq("universe_id", universeId)
    .eq("user_id", appUserId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return existing as Record<string, unknown>;
  }

  const { data, error } = await supabase
    .from("universe_ai_chats")
    .insert({
      universe_id: universeId,
      user_id: appUserId,
      title: "AI Expert",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error || new Error("Could not create AI chat.");
  }

  return data as Record<string, unknown>;
}

export async function loadAiMessages(
  supabase: ReturnType<typeof createAdminClient>,
  chatId: string,
  appUserId: number,
  options: { limit?: number; ascending?: boolean } = {},
) {
  const limit = options.limit || 200;
  const { data, error } = await supabase
    .from("universe_ai_messages")
    .select("id,role,content,citations,created_at")
    .eq("chat_id", chatId)
    .eq("user_id", appUserId)
    .order("created_at", { ascending: options.ascending !== false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function loadRecentAiMessagesForPrompt(
  supabase: ReturnType<typeof createAdminClient>,
  chatId: string,
  appUserId: number,
) {
  const { data, error } = await supabase
    .from("universe_ai_messages")
    .select("role,content,created_at")
    .eq("chat_id", chatId)
    .eq("user_id", appUserId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (error) {
    throw error;
  }

  return [...(data || [])]
    .reverse()
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export function buildUniverseExpertInstructions(universeName: string) {
  return [
    `You are the dedicated Centralis AI Expert for the fictional universe "${universeName || "Untitled Universe"}".`,
    "Use the attached file-search knowledge base as current canon for this universe.",
    "Before answering factual questions, rely on the retrieved universe canon when available.",
    "Clearly distinguish established canon, reasonable inference, and new suggestions.",
    "Do not invent missing canon and present it as established fact.",
    "If information is absent from the synced canon, say that it has not been defined yet.",
    "Current synced canon supersedes older chat messages.",
    "Help the user brainstorm while preserving continuity.",
    "This v1 chat is read-only: do not claim that you changed, created, deleted, or saved Centralis records.",
  ].join("\n");
}

export function extractOpenAiResponseText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return Array.isArray(record.content) ? record.content : [];
    })
    .map((contentItem) => {
      const record = contentItem && typeof contentItem === "object" ? contentItem as Record<string, unknown> : {};
      return typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function extractOpenAiCitations(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .filter((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return record.type === "file_search_call";
    })
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: record.id || null,
        status: record.status || null,
        queries: record.queries || [],
      };
    });
}

export async function sendUniverseExpertRequest(options: {
  universeName: string;
  vectorStoreId: string;
  messages: Array<{ role: string; content: string }>;
}) {
  const input = options.messages
    .filter((message) => ["user", "assistant"].includes(String(message.role)) && String(message.content || "").trim())
    .map((message) => ({
      role: message.role,
      content: String(message.content),
    }));

  const response = await openAiRequest("/responses", {
    method: "POST",
    body: JSON.stringify({
      model: getUniverseAiModel(),
      instructions: buildUniverseExpertInstructions(options.universeName),
      input,
      tools: [{
        type: "file_search",
        vector_store_ids: [options.vectorStoreId],
        max_num_results: 10,
      }],
      include: ["file_search_call.results"],
    }),
  });

  const text = extractOpenAiResponseText(response);
  if (!text) {
    throw new Error("OpenAI did not return a response.");
  }

  return {
    response,
    text,
    citations: extractOpenAiCitations(response),
  };
}
