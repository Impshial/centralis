import {
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getAppUser } from "../_shared/chat-storage.ts";
import {
  getFileExtension,
  MAX_UNIVERSE_SOURCE_DOCUMENT_BYTES,
  SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS,
} from "../_shared/source-documents.ts";
import {
  asRecord,
  cleanText,
  cleanupDocumentVectorStore,
  runDocumentFileSearchJson,
  uploadOpenAiSourceFile,
} from "../_shared/source-canon-review.ts";
import {
  attachFileToVectorStore,
  createOpenAiVectorStore,
  waitForVectorStoreFile,
} from "../_shared/universe-ai.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let vectorStoreId = "";
  let fileId = "";

  try {
    const authUser = await getAuthUser(req);
    await getAppUser(authUser.id);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name) {
      return jsonResponse({ error: "Choose a source document to upload." }, 400);
    }

    const extension = getFileExtension(file.name);
    if (!SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS.has(extension)) {
      return jsonResponse({ error: "Unsupported file type. Upload PDF, text, Markdown, HTML, RTF, Word, CSV/TSV, JSON, YAML, or XML files." }, 400);
    }

    if (file.size <= 0 || file.size > MAX_UNIVERSE_SOURCE_DOCUMENT_BYTES) {
      return jsonResponse({ error: "Source documents must be between 1 byte and 25 MB." }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    fileId = await uploadOpenAiSourceFile({
      bytes,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
    });
    vectorStoreId = await createOpenAiVectorStore("Pending Universe Source", authUser.id);
    await attachFileToVectorStore(vectorStoreId, fileId);
    await waitForVectorStoreFile(vectorStoreId, fileId);

    const result = await runDocumentFileSearchJson({
      vectorStoreId,
      system: [
        "You extract new-universe metadata from uploaded fictional source material for Centralis.",
        "Return only valid JSON with keys: name, description.",
        "The name should be a concise universe title inferred from the document.",
        "The description should summarize the core premise, setting, tone, and important worldbuilding signals.",
      ].join("\n"),
      prompt: [
        "Read the attached source document and extract a proposed universe name and description.",
        "Return exactly one JSON object with keys: name and description.",
        "If the document has an explicit title, prefer that as the name.",
        "If no explicit title exists, infer a short, memorable name from recurring people, places, factions, or concepts.",
        "Do not invent details that are not supported by the source document.",
      ].join("\n\n"),
      maxOutputTokens: 1800,
    });

    const record = asRecord(result);
    const source = {
      name: cleanText(record.name || record.universe_name || record.title, 120),
      description: cleanText(record.description || record.universe_description || record.summary, 8000),
      original_filename: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
    };

    if (!source.name && !source.description) {
      throw new Error("OpenAI could not extract a usable universe name or description from that source.");
    }

    return jsonResponse({ source });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not extract universe details from source document."), 500);
  } finally {
    if (vectorStoreId || fileId) {
      await cleanupDocumentVectorStore(vectorStoreId, fileId);
    }
  }
});
