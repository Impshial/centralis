import {
  corsHeaders,
  createAdminClient,
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getAppUser } from "../_shared/chat-storage.ts";
import { TEXT_MODEL } from "../_shared/openai-config.ts";
import {
  asRecord,
  cleanTempId,
  cleanText,
  cleanupDocumentVectorStore,
  createDocumentVectorStore,
  loadOwnedSourceDocument,
} from "../_shared/source-canon-review.ts";
import {
  getFileExtension,
  readUniverseSourceDocumentObject,
} from "../_shared/source-documents.ts";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const MAX_DIRECT_TEXT_SOURCE_BYTES = 750 * 1024;
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

function sseHeaders() {
  return {
    ...corsHeaders,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
  };
}

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
}

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

function canAnalyzeSourceAsDirectText(document: Record<string, unknown>) {
  const filename = String(document.original_filename || document.display_name || "");
  const extension = getFileExtension(filename);
  const fileSize = Number(document.file_size || 0);
  return DIRECT_TEXT_SOURCE_EXTENSIONS.has(extension) && fileSize > 0 && fileSize <= MAX_DIRECT_TEXT_SOURCE_BYTES;
}

function decodeSourceText(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function normalizeIdKey(value: string) {
  return cleanTempId(value, "").toLowerCase();
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

function parseOpenAiStreamEvent(block: string) {
  const lines = block.split(/\r?\n/);
  let eventType = "";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  const data = dataLines.join("\n").trim();
  if (!data || data === "[DONE]") return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data);
  } catch (_error) {
    return { eventType, payload: { type: eventType, text: data } };
  }
  return { eventType, payload };
}

function buildPrompt(options: {
  universe: Record<string, unknown>;
  document: Record<string, unknown>;
  allowedTypes: Array<{ id: string; name: string }>;
  sourceText?: string;
}) {
  const lines = [
    "Analyze the source document and stream source-backed Centralis Universe Builder elements as newline-delimited JSON.",
    "Output one compact JSON object per line. Do not output a JSON array, Markdown, code fences, headings, prose, or commentary.",
    "Each line must have exactly these keys: temp_id, name, description, element_type_name, parent, parent_label.",
    "Do not impose a fixed count. Return as many strong source-supported elements as the document justifies.",
    "Use only the allowed element type names provided below.",
    "Each element must have exactly one primary parent.",
    "The parent must be either the literal value \"universe\" or a temp_id that you already emitted on a previous line.",
    "Emit broad parent/container concepts before their children.",
    "Only top-level elements should use parent \"universe\".",
    "Do not emit a Universe element just to represent the base setting, story world, or root universe; the existing root Universe node already does that.",
    "Use parent \"universe\" when an element should attach to the root Universe node.",
    "Only emit an element with type Universe when the source explicitly includes multiple physical universes, parallel universes, a multiverse, nested universes, or discovered alternate universes distinct from the root setting.",
    "parent_label must be a concrete relationship label such as contains, founded, rules, inhabits, protects, created, records, splintered from, commands, supplies, or worships.",
    "Do not invent details not present or strongly implied by the source.",
    "Descriptions should be concise but useful: usually one to three sentences.",
    `Universe name: ${cleanText(options.universe.name, 200) || "Untitled Universe"}`,
    cleanText(options.universe.description, 4000)
      ? `Universe description: ${cleanText(options.universe.description, 4000)}`
      : "No universe description is available.",
    `Source document: ${cleanText(options.document.display_name || options.document.original_filename, 240) || "Source document"}`,
    `Allowed element types:\n${options.allowedTypes.map((type) => `- ${type.name}`).join("\n")}`,
  ];

  if (options.sourceText) {
    lines.push("Source document text:", options.sourceText);
  } else {
    lines.push("Use the attached source document from file search.");
  }

  return lines.join("\n\n");
}

function normalizeStreamElement(
  value: unknown,
  options: {
    index: number;
    allowedTypeNames: Set<string>;
    emittedIds: Set<string>;
    universeName: string;
  },
) {
  const row = asRecord(value);
  const typeName = cleanText(row.element_type_name || row.elementTypeName || row.type, 120);
  const name = cleanText(row.name, 200);
  const description = cleanText(row.description || row.summary, 4000);
  const tempId = cleanTempId(row.temp_id || row.tempId || row.id, `source-element-${options.index + 1}`);
  const rawParent = cleanText(row.parent || row.parent_temp_id || row.parentTempId, 120);
  const parent = rawParent.toLowerCase() === "universe"
    ? "universe"
    : cleanTempId(rawParent, "");
  const parentLabel = cleanText(row.parent_label || row.parentLabel || row.relationship || row.label, 120) || "contains";

  if (!name) throw new Error("Skipped a streamed element without a name.");
  if (!description) throw new Error(`Skipped "${name}" because it had no description.`);
  if (!options.allowedTypeNames.has(typeName.toLowerCase())) {
    throw new Error(`Skipped "${name}" because "${typeName || "Unknown"}" is not an allowed element type.`);
  }
  if (isRedundantRootUniverseElement({ name, typeName, universeName: options.universeName })) {
    throw new Error(`Skipped redundant root Universe element "${name}" because the root Universe node already represents this setting.`);
  }
  if (!parent) throw new Error(`Skipped "${name}" because it had no parent.`);
  if (parent !== "universe" && !options.emittedIds.has(normalizeIdKey(parent))) {
    throw new Error(`Accepted "${name}", but its parent "${parent}" was not emitted earlier; it will fall back if needed.`);
  }

  return {
    temp_id: tempId,
    name,
    description,
    element_type_name: typeName,
    parent,
    parent_label: parentLabel,
  };
}

async function streamOpenAiText(options: {
  system: string;
  prompt: string;
  vectorStoreId?: string;
  signal: AbortSignal;
  onDelta: (delta: string) => Promise<void>;
}) {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${getEnv("OPENAI_API_KEY")}`);
  headers.set("Content-Type", "application/json");

  const body: Record<string, unknown> = {
    model: TEXT_MODEL,
    instructions: options.system,
    input: options.prompt,
    text: { verbosity: "medium" },
    reasoning: { effort: "medium" },
    max_output_tokens: 20000,
    stream: true,
  };

  if (options.vectorStoreId) {
    body.tools = [{
      type: "file_search",
      vector_store_ids: [options.vectorStoreId],
      max_num_results: 20,
    }];
  }

  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: "POST",
    headers,
    signal: options.signal,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_error) {
      payload = { error: text };
    }
    const record = asRecord(payload);
    const nested = asRecord(record.error);
    throw new Error(String(nested.message || record.error || record.message || `OpenAI request failed with ${response.status}.`));
  }
  if (!response.body) throw new Error("OpenAI did not return a streaming response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleBlock = async (block: string) => {
    const parsed = parseOpenAiStreamEvent(block);
    if (!parsed) return;
    const type = String(parsed.payload.type || parsed.eventType || "");
    if (type === "response.output_text.delta" && typeof parsed.payload.delta === "string") {
      await options.onDelta(parsed.payload.delta);
      return;
    }
    if (type === "response.output_text.done" && typeof parsed.payload.text === "string") {
      return;
    }
    if (type === "error") {
      throw new Error(String(parsed.payload.message || parsed.payload.error || "OpenAI stream failed."));
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      await handleBlock(block);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    await handleBlock(buffer);
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const abortFromClient = () => abortController.abort();
  req.signal.addEventListener("abort", abortFromClient, { once: true });

  const send = async (event: string, data: unknown) => {
    await writer.write(encoder.encode(encodeSse(event, data)));
  };

  (async () => {
    let vectorStoreId = "";
    let fileId = "";
    try {
      const authUser = await getAuthUser(req);
      const appUser = await getAppUser(authUser.id);
      const body = await req.json().catch(() => ({}));
      const universeId = cleanText(body.universeId, 120);
      const documentId = cleanText(body.documentId, 120);
      const allowedTypes = normalizeAllowedTypes(body.allowedElementTypes);
      if (!universeId || !documentId) throw new Error("universeId and documentId are required.");
      if (!allowedTypes.length) throw new Error("At least one element type is required before populating from a source document.");

      await send("status", { message: "Loading source document..." });
      const supabase = createAdminClient();
      const { data: universe, error: universeError } = await supabase
        .from("universes")
        .select("id,user_id,name,description")
        .eq("id", universeId)
        .eq("user_id", appUser.id)
        .eq("deleted", false)
        .single();
      if (universeError || !universe) throw new Error("You do not have access to that universe.");

      const document = await loadOwnedSourceDocument(supabase, { universeId, documentId, appUserId: appUser.id });
      let sourceText = "";
      if (canAnalyzeSourceAsDirectText(document)) {
        const storageKey = String(document.storage_key || "");
        if (!storageKey) throw new Error("Source document storage key is missing.");
        sourceText = decodeSourceText(await readUniverseSourceDocumentObject(storageKey));
        await send("status", { message: "Reading text source..." });
      } else {
        await send("status", { message: "Preparing source document search..." });
        const docVector = await createDocumentVectorStore(document, String(universe.name || "Universe"), universeId);
        vectorStoreId = docVector.vectorStoreId;
        fileId = docVector.fileId;
      }

      const allowedTypeNames = new Set(allowedTypes.map((type) => type.name.toLowerCase()));
      const emittedIds = new Set<string>();
      let lineBuffer = "";
      let acceptedCount = 0;
      let warningCount = 0;
      await send("status", { message: "Generating source elements..." });

      const processLine = async (line: string) => {
        const cleanLine = line.trim();
        if (!cleanLine || cleanLine.startsWith("```")) return;
        let record: unknown;
        try {
          record = JSON.parse(cleanLine);
        } catch (_error) {
          const start = cleanLine.indexOf("{");
          const end = cleanLine.lastIndexOf("}");
          if (start < 0 || end <= start) throw new Error("Skipped malformed streamed element JSON.");
          record = JSON.parse(cleanLine.slice(start, end + 1));
        }

        let element: ReturnType<typeof normalizeStreamElement>;
        try {
          element = normalizeStreamElement(record, {
            index: acceptedCount,
            allowedTypeNames,
            emittedIds,
            universeName: String(universe.name || ""),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.startsWith("Accepted ")) throw error;
          element = normalizeStreamElement(
            { ...asRecord(record), parent: "universe" },
            {
              index: acceptedCount,
              allowedTypeNames,
              emittedIds,
              universeName: String(universe.name || ""),
            },
          );
          warningCount += 1;
          await send("warning", { message });
        }

        let nextId = element.temp_id;
        let suffix = 2;
        while (emittedIds.has(normalizeIdKey(nextId))) {
          nextId = `${element.temp_id}-${suffix}`;
          suffix += 1;
        }
        element.temp_id = nextId;
        emittedIds.add(normalizeIdKey(nextId));
        acceptedCount += 1;
        await send("element", { element });
      };

      await streamOpenAiText({
        system: [
          "You extract source-backed Centralis Universe Builder elements.",
          "Return only newline-delimited JSON objects. No Markdown. No prose.",
        ].join("\n"),
        prompt: buildPrompt({ universe, document, allowedTypes, sourceText }),
        vectorStoreId: vectorStoreId || undefined,
        signal: abortController.signal,
        onDelta: async (delta) => {
          lineBuffer += delta;
          const lines = lineBuffer.split(/\r?\n/);
          lineBuffer = lines.pop() || "";
          for (const line of lines) {
            try {
              await processLine(line);
            } catch (lineError) {
              warningCount += 1;
              await send("warning", { message: lineError instanceof Error ? lineError.message : String(lineError) });
            }
          }
        },
      });

      if (lineBuffer.trim()) {
        try {
          await processLine(lineBuffer);
        } catch (lineError) {
          warningCount += 1;
          await send("warning", { message: lineError instanceof Error ? lineError.message : String(lineError) });
        }
      }

      if (!acceptedCount) throw new Error("OpenAI did not stream any usable source elements matching your element types.");
      await send("done", { elementCount: acceptedCount, warningCount });
    } catch (error) {
      if (!req.signal.aborted) {
        console.error(error);
        await send("error", describeError(error, "Could not stream source document elements."));
      }
    } finally {
      req.signal.removeEventListener("abort", abortFromClient);
      if (vectorStoreId || fileId) {
        await cleanupDocumentVectorStore(vectorStoreId, fileId);
      }
      try {
        await writer.close();
      } catch (_error) {
        // The browser may have already closed the stream.
      }
    }
  })();

  return new Response(stream.readable, { headers: sseHeaders() });
});
