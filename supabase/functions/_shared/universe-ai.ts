import { createAdminClient, getEnv } from "./image-storage.ts";
import { TEXT_MODEL } from "./openai-config.ts";
import { FICTIONAL_NAMING_PROMPT_SECTION } from "./fictional-naming-rules.ts";

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

export function serializeProposal(proposal: Record<string, unknown> | null) {
  if (!proposal) {
    return null;
  }

  return {
    id: proposal.id,
    type: proposal.proposal_type,
    payload: proposal.payload || {},
    status: proposal.status || "pending",
    created_at: proposal.created_at || null,
    updated_at: proposal.updated_at || null,
    finalized_at: proposal.finalized_at || null,
  };
}

export function serializeMessages(
  messages: Array<Record<string, unknown>> = [],
  proposals: Array<Record<string, unknown>> = [],
) {
  const proposalsByMessage = new Map<string, Array<Record<string, unknown>>>();
  proposals.forEach((proposal) => {
    const assistantMessageId = String(proposal.assistant_message_id || "");
    if (!assistantMessageId) return;
    if (!proposalsByMessage.has(assistantMessageId)) {
      proposalsByMessage.set(assistantMessageId, []);
    }
    proposalsByMessage.get(assistantMessageId)?.push(proposal);
  });

  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    citations: message.citations || [],
    proposals: (proposalsByMessage.get(String(message.id || "")) || [])
      .map((proposal) => serializeProposal(proposal))
      .filter(Boolean),
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

export async function loadAiProposals(
  supabase: ReturnType<typeof createAdminClient>,
  chatId: string,
  appUserId: number,
) {
  const { data, error } = await supabase
    .from("universe_ai_proposals")
    .select("id,universe_id,chat_id,user_id,source_user_message_id,assistant_message_id,proposal_type,payload,status,created_at,updated_at,finalized_at")
    .eq("chat_id", chatId)
    .eq("user_id", appUserId)
    .order("created_at", { ascending: true });

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
    "You may propose new Centralis element drafts when the user explicitly asks to create, add, make, generate, or save elements, but those drafts are only reviewable proposals.",
    "Never claim that you changed, created, deleted, finalized, or saved Centralis records. The user must review and finalize proposals in the app.",
    "Do not include machine-readable JSON in the visible chat reply; answer naturally and mention that drafts can be reviewed when appropriate.",
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

function parseJsonObject(textValue: string) {
  try {
    return JSON.parse(textValue);
  } catch (_error) {
    const start = textValue.indexOf("{");
    const end = textValue.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(textValue.slice(start, end + 1));
    }
    throw new Error("OpenAI did not return valid proposal JSON.");
  }
}

function cleanProposalString(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function truncateProposalText(value: unknown, maxLength: number) {
  const text = cleanProposalString(value, maxLength + 40);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 16)).trimEnd()}... [truncated]`;
}

function cleanProposalTempId(value: unknown, fallback: string) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || fallback;
}

function isTruthyProposalFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  return ["true", "yes", "1", "propose", "create"].includes(text);
}

export function shouldConsiderElementProposal(message: string) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;

  const creationIntent = /\b(create|generate|make|add|draft|build|propose|prepare|save)\b/.test(text);
  const elementIntent = /\b(element|elements|node|nodes|character|characters|person|people|place|places|city|cities|location|locations|region|regions|faction|factions|organization|organizations|creature|creatures|species|artifact|artifacts|object|objects|event|events|conflict|conflicts|family|families|structure|structures|magic system|technology|technologies|law|laws|culture|cultures)\b/.test(text);
  const appIntent = /\b(centralis|canvas|universe builder|review|finalize)\b/.test(text);
  return creationIntent && (elementIntent || appIntent);
}

function getAllowedElementTypeNames(context: UniverseContext) {
  return [...context.elementTypesById.values()]
    .map((type) => cleanProposalString(type.name, 120))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function buildProposalExistingElements(context: UniverseContext, limit = 120) {
  return context.elements.slice(0, limit).map((element) => ({
    id: String(element.id || ""),
    name: cleanProposalString(element.name, 180) || "Untitled Element",
    element_type_name: getElementTypeName(element, context),
    description: truncateProposalText(element.description, 650),
  }));
}

function isUsefulProposalLinkLabel(value: string) {
  const label = value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!label) return false;
  const weakLabels = new Set([
    "associated with",
    "branches to",
    "connected to",
    "connects to",
    "has connection to",
    "influences",
    "is associated with",
    "is connected to",
    "is linked to",
    "leads to",
    "linked to",
    "relates to",
    "related to",
    "ties to",
  ]);
  return !weakLabels.has(label);
}

function cleanElementProposalPayload(payload: unknown, context: UniverseContext, latestUserMessage: string, assistantReply: string) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const shouldPropose = isTruthyProposalFlag(record.should_propose ?? record.shouldPropose);
  if (!shouldPropose) {
    return null;
  }

  const allowedTypes = getAllowedElementTypeNames(context);
  const fallbackType = allowedTypes[0] || "";
  const rawElements = Array.isArray(record.elements) ? record.elements : [];
  const elements = rawElements
    .map((item, index) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        temp_id: cleanProposalTempId(row.temp_id || row.tempId || row.id, `generated-${index + 1}`),
        name: cleanProposalString(row.name, 200),
        description: cleanProposalString(row.description, 4000),
        element_type_name: cleanProposalString(row.element_type_name || row.elementTypeName || row.type || fallbackType, 120),
      };
    })
    .filter((element) => element.name && element.description)
    .slice(0, 12);

  if (!elements.length) {
    return null;
  }

  const links = (Array.isArray(record.links) ? record.links : [])
    .map((item, index) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const source = cleanProposalString(row.source || row.source_id || row.source_temp_id || row.source_existing_id || row.source_name, 200);
      const target = cleanProposalString(row.target || row.target_id || row.target_temp_id || row.target_existing_id || row.target_name, 200);
      return {
        id: cleanProposalTempId(row.id, `link-${index + 1}`),
        source,
        target,
        label: cleanProposalString(row.label || row.relationship, 120),
      };
    })
    .filter((link) => link.source && link.target && link.source !== link.target && isUsefulProposalLinkLabel(link.label))
    .slice(0, Math.max(1, Math.ceil(elements.length * 0.75)));

  return {
    elements,
    links,
    meta: {
      source: "ai_expert",
      user_message: truncateProposalText(latestUserMessage, 1000),
      assistant_reply: truncateProposalText(assistantReply, 1000),
    },
  };
}

function buildElementProposalPrompt(options: {
  context: UniverseContext;
  latestUserMessage: string;
  assistantReply: string;
}) {
  const allowedTypes = getAllowedElementTypeNames(options.context);
  const existingElements = buildProposalExistingElements(options.context);
  return [
    "Decide whether the user's latest message should create reviewable Centralis Universe Builder element drafts.",
    "Return exactly one JSON object with this shape:",
    `{"should_propose":true|false,"elements":[{"temp_id":"generated-1","name":"Name","description":"Description","element_type_name":"Allowed Type Name"}],"links":[{"source":"universe or existing element id or generated temp_id","target":"generated temp_id or existing element id","label":"specific relationship"}]}`,
    "If the user is only asking a question, brainstorming without asking to create app records, discussing options, or asking for advice, return {\"should_propose\":false,\"elements\":[],\"links\":[]}.",
    "If the user asks to create, add, generate, make, draft, build, or save elements/nodes/items in Centralis, return should_propose true with draft elements.",
    "These are proposals only. Do not imply they are already saved.",
    "Use only the allowed element type names. Choose the closest allowed type when the user asks for a specific kind of thing.",
    FICTIONAL_NAMING_PROMPT_SECTION,
    "Descriptions should be substantial and usable: 3 to 5 detailed sentences, roughly 80 to 140 words when appropriate.",
    "Each description should include concrete setting details, role/purpose, conflicts or tensions, notable traits, and at least one story or worldbuilding hook.",
    "Links are optional but useful. Link direction is parent/source/upstream cause -> child/target/downstream result. The target is the child node and receives the connection on its left side in the canvas.",
    "Only create links when the relationship is concrete, direct, and legible from the two node descriptions plus the link label.",
    "Use specific labels such as 'funds', 'guards', 'records evidence for', 'shelters fugitives from', 'manufactures', 'commands', 'rivals', 'enforces', 'supplies', 'was founded by', or 'contests jurisdiction with'.",
    "Do not use vague labels such as 'related to', 'connected to', 'linked to', 'associated with', 'influences', 'branches to', or 'leads to'.",
    "Use source or target value \"universe\" for the universe root. Use existing element IDs for existing elements. Use generated temp_id values for generated elements.",
    "Prefer 1 to 6 draft elements unless the user clearly asks for more. Never return more than 12.",
    `Universe name: ${options.context.universe.name || "Untitled Universe"}`,
    options.context.universe.description ? `Universe description: ${options.context.universe.description}` : "No universe description is available.",
    `Allowed element types:\n${allowedTypes.map((name) => `- ${name}`).join("\n") || "- No element types available"}`,
    existingElements.length
      ? `Existing elements for context and optional linking:\n${existingElements.map((element) => `- ID: ${element.id}; Type: ${element.element_type_name || "Unknown"}; Name: ${element.name}; Description: ${element.description || "None"}`).join("\n")}`
      : "No existing elements are available yet.",
    `Latest user message:\n${options.latestUserMessage}`,
    `Visible assistant reply already shown to the user:\n${options.assistantReply}`,
  ].join("\n\n");
}

export async function sendUniverseElementProposalRequest(options: {
  context: UniverseContext;
  vectorStoreId: string;
  latestUserMessage: string;
  assistantReply: string;
}) {
  const response = await openAiRequest("/responses", {
    method: "POST",
    body: JSON.stringify({
      model: getUniverseAiModel(),
      instructions: "You produce strict JSON for reviewable Centralis element proposals. Return only JSON with no markdown or commentary.",
      input: [{
        role: "user",
        content: buildElementProposalPrompt({
          context: options.context,
          latestUserMessage: options.latestUserMessage,
          assistantReply: options.assistantReply,
        }),
      }],
      tools: [{
        type: "file_search",
        vector_store_ids: [options.vectorStoreId],
        max_num_results: 10,
      }],
      text: {
        format: { type: "json_object" },
      },
      max_output_tokens: 5000,
    }),
  });

  const text = extractOpenAiResponseText(response);
  if (!text) {
    return null;
  }

  return cleanElementProposalPayload(
    parseJsonObject(text),
    options.context,
    options.latestUserMessage,
    options.assistantReply,
  );
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
