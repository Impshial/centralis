import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getAppUser } from "../_shared/chat-storage.ts";
import {
  asRecord,
  cleanText,
  cleanupDocumentVectorStore,
  createDocumentVectorStore,
  loadOwnedSourceDocument,
  runDocumentFileSearchJson,
  runSourceTextJson,
} from "../_shared/source-canon-review.ts";
import {
  getFileExtension,
  readUniverseSourceDocumentObject,
} from "../_shared/source-documents.ts";

const DIRECT_TEXT_SOURCE_EXTENSIONS = new Set([
  "csv",
  "htm",
  "html",
  "json",
  "markdown",
  "md",
  "tsv",
  "txt",
  "xml",
  "yaml",
  "yml",
]);
const MAX_DIRECT_TEXT_SOURCE_BYTES = 750 * 1024;

function normalizeAllowedTypes(value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => {
      const row = asRecord(item);
      return {
        id: cleanText(row.id, 120),
        name: cleanText(row.name, 120),
      };
    })
    .filter((item) => item.id && item.name);
}

function normalizeNameKey(value: unknown) {
  return cleanText(value, 240)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .trim();
}

function normalizeRootComparisonKey(value: unknown) {
  return normalizeNameKey(value)
    .replace(/\s+(universe|world|setting)$/, "")
    .trim();
}

function isRedundantRootUniverseElement(options: {
  name: string;
  typeName: string;
  universeName: string;
}) {
  if (normalizeNameKey(options.typeName) !== "universe") return false;
  const nameKey = normalizeNameKey(options.name);
  const rootAliases = new Set([
    "universe",
    "world",
    "setting",
    "story world",
    "base universe",
    "root universe",
    "main universe",
    "primary universe",
    "default universe",
  ]);
  if (rootAliases.has(nameKey)) return true;

  const universeKey = normalizeRootComparisonKey(options.universeName);
  return Boolean(universeKey && normalizeRootComparisonKey(options.name) === universeKey);
}

function normalizeElements(value: unknown, allowedTypeNames: Set<string>, universeName: string) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item, index) => {
      const row = asRecord(item);
      const typeName = cleanText(row.element_type_name || row.elementTypeName || row.type, 120);
      return {
        temp_id: cleanText(row.temp_id || row.tempId || row.id, 120) || `source-element-${index + 1}`,
        name: cleanText(row.name, 200),
        description: cleanText(row.description || row.summary, 4000),
        element_type_name: typeName,
      };
    })
    .filter((item) =>
      item.name &&
      item.description &&
      allowedTypeNames.has(item.element_type_name.toLowerCase()) &&
      !isRedundantRootUniverseElement({
        name: item.name,
        typeName: item.element_type_name,
        universeName,
      })
    );
}

function canAnalyzeSourceAsDirectText(document: Record<string, unknown>) {
  const filename = String(document.original_filename || document.display_name || "");
  const extension = getFileExtension(filename);
  const fileSize = Number(document.file_size || 0);
  return DIRECT_TEXT_SOURCE_EXTENSIONS.has(extension) && fileSize > 0 && fileSize <= MAX_DIRECT_TEXT_SOURCE_BYTES;
}

function decodeSourceText(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let vectorStoreId = "";
  let fileId = "";

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const universeId = cleanText(body.universeId, 120);
    const documentId = cleanText(body.documentId, 120);
    const allowedTypes = normalizeAllowedTypes(body.allowedElementTypes);

    if (!universeId || !documentId) {
      return jsonResponse({ error: "universeId and documentId are required." }, 400);
    }
    if (!allowedTypes.length) {
      return jsonResponse({ error: "At least one element type is required before populating from a source document." }, 400);
    }

    const supabase = createAdminClient();
    const { data: universe, error: universeError } = await supabase
      .from("universes")
      .select("id,user_id,name,description")
      .eq("id", universeId)
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .single();

    if (universeError || !universe) {
      return jsonResponse({ error: "You do not have access to that universe." }, 403);
    }

    const document = await loadOwnedSourceDocument(supabase, { universeId, documentId, appUserId: appUser.id });
    const system = [
      "You extract Centralis Universe Builder element candidates from an uploaded fictional source document.",
      "Return only valid JSON with key: elements.",
      "Each element must have: temp_id, name, description, element_type_name.",
      "Use only the allowed element type names provided by the user.",
    ].join("\n");
    const prompt = [
      "Analyze the source document and return every relevant thing that should become a Universe Builder element.",
      "Relevant things include characters, places, factions, species, artifacts, events, concepts, technologies, locations, organizations, conflicts, cultures, and any other entries that clearly match the allowed element types.",
      "Do not impose a fixed count. Return as many strong source-supported elements as the document justifies.",
      "Do not create links or relationships. Only return elements.",
      "Do not create a Universe element just to represent the base setting, story world, or root universe; the existing root Universe node already does that.",
      "Only create an element with type Universe when the source explicitly includes multiple physical universes, parallel universes, a multiverse, nested universes, or discovered alternate universes distinct from the root setting.",
      "Do not invent details not present or strongly implied by the source.",
      "Descriptions should be concise but useful: usually one to three sentences, enough to identify the element and why it matters.",
      `Universe name: ${universe.name || "Untitled Universe"}`,
      universe.description ? `Universe description: ${universe.description}` : "No universe description is available.",
      `Source document: ${document.display_name || document.original_filename || "Source document"}`,
      `Allowed element types:\n${allowedTypes.map((type) => `- ${type.name}`).join("\n")}`,
    ].join("\n\n");

    let result: unknown;
    if (canAnalyzeSourceAsDirectText(document)) {
      const storageKey = String(document.storage_key || "");
      if (!storageKey) throw new Error("Source document storage key is missing.");
      const bytes = await readUniverseSourceDocumentObject(storageKey);
      result = await runSourceTextJson({
        system,
        prompt,
        sourceText: decodeSourceText(bytes),
        maxOutputTokens: 20000,
        reasoningEffort: "medium",
      });
    } else {
      const docVector = await createDocumentVectorStore(document, String(universe.name || "Universe"), universeId);
      vectorStoreId = docVector.vectorStoreId;
      fileId = docVector.fileId;

      result = await runDocumentFileSearchJson({
        vectorStoreId,
        system,
        prompt,
        maxOutputTokens: 20000,
        reasoningEffort: "medium",
      });
    }

    const allowedTypeNames = new Set(allowedTypes.map((type) => type.name.toLowerCase()));
    const elements = normalizeElements(asRecord(result).elements, allowedTypeNames, String(universe.name || ""));
    if (!elements.length) {
      return jsonResponse({ error: "OpenAI did not return any source elements matching your element types." }, 502);
    }

    return jsonResponse({ elements });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not analyze source document for universe elements."), 500);
  } finally {
    if (vectorStoreId || fileId) {
      await cleanupDocumentVectorStore(vectorStoreId, fileId);
    }
  }
});
