import OpenAI from "npm:openai@^6.1.0";
import { generateJsonText, TEXT_MODEL } from "./openai-config.ts";
import {
  createAdminClient,
  getEnv,
} from "./image-storage.ts";
import {
  attachFileToVectorStore,
  buildUniverseCanonDocument,
  createOpenAiVectorStore,
  hashText,
  loadUniverseContext,
  uploadOpenAiCanonFile,
  waitForVectorStoreFile,
} from "./universe-ai.ts";
import { readUniverseSourceDocumentObject } from "./source-documents.ts";

const OPENAI_API_BASE = "https://api.openai.com/v1";

export function cleanText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function parseJsonObject(textValue: string) {
  try {
    return JSON.parse(textValue);
  } catch (_error) {
    const start = textValue.indexOf("{");
    const end = textValue.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(textValue.slice(start, end + 1));
    }
    throw new Error("OpenAI did not return valid JSON.");
  }
}

export function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function cleanTempId(value: unknown, fallback: string) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || fallback;
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
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_error) {
    payload = { error: text };
  }
  if (!response.ok) {
    const record = asRecord(payload);
    const nested = asRecord(record.error);
    throw new Error(String(nested.message || record.error || record.message || `OpenAI request failed with ${response.status}.`));
  }
  return asRecord(payload);
}

export async function loadOwnedSourceDocument(
  supabase: ReturnType<typeof createAdminClient>,
  options: { universeId: string; documentId: string; appUserId: number },
) {
  const { data, error } = await supabase
    .from("universe_source_documents")
    .select("id,universe_id,user_id,storage_key,original_filename,display_name,mime_type,file_size,created_at")
    .eq("id", options.documentId)
    .eq("universe_id", options.universeId)
    .eq("user_id", options.appUserId)
    .single();

  if (error || !data) {
    throw error || new Error("Source document was not found.");
  }
  return data as Record<string, unknown>;
}

export async function createDocumentVectorStore(document: Record<string, unknown>, universeName: string, universeId: string) {
  const storageKey = String(document.storage_key || "");
  if (!storageKey) throw new Error("Source document storage key is missing.");

  const bytes = await readUniverseSourceDocumentObject(storageKey);
  const filename = String(document.original_filename || "source-document.txt");
  const contentType = String(document.mime_type || "application/octet-stream");
  const formData = new FormData();
  formData.set("purpose", "assistants");
  formData.set("file", new File([bytes], filename, { type: contentType }));

  const filePayload = await openAiRequest("/files", {
    method: "POST",
    body: formData,
  });
  const fileId = String(filePayload.id || "");
  if (!fileId) throw new Error("OpenAI did not return a source document file ID.");

  const vectorStoreId = await createOpenAiVectorStore(`${universeName || "Universe"} Source Review`, universeId);
  await attachFileToVectorStore(vectorStoreId, fileId);
  await waitForVectorStoreFile(vectorStoreId, fileId);

  return { fileId, vectorStoreId };
}

export async function cleanupDocumentVectorStore(vectorStoreId: string, fileId: string) {
  if (vectorStoreId) {
    await openAiRequest(`/vector_stores/${encodeURIComponent(vectorStoreId)}`, {
      method: "DELETE",
    }).catch((error) => console.warn("Could not delete temporary source document vector store:", error));
  }
  if (fileId) {
    await openAiRequest(`/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
    }).catch((error) => console.warn("Could not delete temporary source document file:", error));
  }
}

export async function runDocumentFileSearchJson(options: {
  vectorStoreId: string;
  system: string;
  prompt: string;
  maxOutputTokens?: number;
}) {
  const payload = await openAiRequest("/responses", {
    method: "POST",
    body: JSON.stringify({
      model: TEXT_MODEL,
      instructions: options.system,
      input: options.prompt,
      tools: [{
        type: "file_search",
        vector_store_ids: [options.vectorStoreId],
        max_num_results: 20,
      }],
      text: {
        format: { type: "json_object" },
        verbosity: "medium",
      },
      reasoning: { effort: "high" },
      max_output_tokens: options.maxOutputTokens || 6000,
    }),
  });

  const output = Array.isArray(payload.output) ? payload.output : [];
  const text = output
    .flatMap((item) => Array.isArray(asRecord(item).content) ? asRecord(item).content as unknown[] : [])
    .map((content) => String(asRecord(content).text || ""))
    .filter(Boolean)
    .join("\n")
    || String(payload.output_text || "");

  return parseJsonObject(text || "{}");
}

export async function buildSourceReviewCanonContext(
  supabase: ReturnType<typeof createAdminClient>,
  universeId: string,
  appUserId: number,
) {
  const context = await loadUniverseContext(supabase, universeId, appUserId);
  const canonDocument = buildUniverseCanonDocument(context);
  const contentHash = await hashText(canonDocument);
  return { context, canonDocument, contentHash };
}

export async function generateElementsFromReviewedSource(options: {
  documentTitle: string;
  universeName: string;
  canonDocument: string;
  acceptedNotes: Array<{ title: string; body: string }>;
  allowedTypes: Array<{ name: string }>;
  existingElements: Array<{ id: string; name: string; element_type_name: string; description: string }>;
  newInformationSummary: string;
}) {
  const prompt = [
    "Generate reviewable Centralis Universe Builder element suggestions from accepted source canon notes.",
    "Return exactly one JSON object with keys: elements and links.",
    "Each element must have: temp_id, name, description, element_type_name.",
    "Links are optional. Each link must have: source, target, label. Source/target may be generated temp_id, existing element id, or universe.",
    "Suggest only genuinely new elements that are not already represented in existing canon.",
    "Prefer fewer high-value elements over duplicates or filler.",
    `Universe: ${options.universeName || "Untitled Universe"}`,
    `Source document: ${options.documentTitle}`,
    `Allowed element types:\n${options.allowedTypes.map((type) => `- ${type.name}`).join("\n")}`,
    options.existingElements.length
      ? `Existing elements:\n${options.existingElements.map((element) => `- ID: ${element.id}; Type: ${element.element_type_name || "Unknown"}; Name: ${element.name}; Description: ${element.description || "None"}`).join("\n")}`
      : "No existing elements are available yet.",
    `New information summary:\n${options.newInformationSummary || "No summary provided."}`,
    `Accepted source canon notes:\n${options.acceptedNotes.map((note) => `- ${note.title}: ${note.body}`).join("\n") || "No accepted conflict notes."}`,
    "Current canon excerpt for duplicate checking:",
    options.canonDocument.slice(0, 30000),
  ].join("\n\n");

  const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
  const generatedText = await generateJsonText(openai, {
    system: "You generate concise, structured fictional worldbuilding element drafts for review. Return only valid JSON.",
    prompt,
    maxOutputTokens: 6500,
  });
  return parseJsonObject(generatedText || "{}");
}
