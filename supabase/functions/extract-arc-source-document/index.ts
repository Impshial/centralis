import {
  createCentralisStorageMetadata,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getAppUser } from "../_shared/chat-storage.ts";
import { createGenerationJob } from "../_shared/generation-jobs.ts";
import {
  createArcManuscriptJobDocumentKey,
  deleteUniverseSourceDocumentObject,
  getFileExtension,
  MAX_UNIVERSE_SOURCE_DOCUMENT_BYTES,
  SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS,
  uploadUniverseSourceDocumentObject,
} from "../_shared/source-documents.ts";
import { cleanText } from "../_shared/source-canon-review.ts";

const MAX_OUTLINE_UNITS = 36;
const FORMAT_LABELS: Record<string, string> = {
  novel: "Novel",
  short_story: "Short Story",
  series: "Series",
  screenplay: "Screenplay",
  tv_episode: "TV Episode",
  custom: "Undecided (custom)",
};

function cleanFormat(value: unknown) {
  const format = cleanText(value, 40).toLowerCase().replace(/[^a-z_]+/g, "_");
  return FORMAT_LABELS[format] ? format : "";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let uploadedKey = "";

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const formData = await req.formData();
    const file = formData.get("file");
    const format = cleanFormat(formData.get("format"));
    if (!format) {
      return jsonResponse({ error: "Select a Format before uploading a manuscript." }, 400);
    }
    if (!(file instanceof File) || !file.name) {
      return jsonResponse({ error: "Choose a manuscript document to upload." }, 400);
    }

    const extension = getFileExtension(file.name);
    if (!SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS.has(extension)) {
      return jsonResponse({ error: "Unsupported file type. Upload PDF, text, Markdown, HTML, RTF, Word, CSV/TSV, JSON, YAML, or XML files." }, 400);
    }

    if (file.size <= 0 || file.size > MAX_UNIVERSE_SOURCE_DOCUMENT_BYTES) {
      return jsonResponse({ error: "Manuscript documents must be between 1 byte and 25 MB." }, 400);
    }

    const sourceId = crypto.randomUUID();
    uploadedKey = createArcManuscriptJobDocumentKey({
      authUserId: authUser.id,
      jobId: sourceId,
      filename: file.name,
    });
    await uploadUniverseSourceDocumentObject({
      bytes: new Uint8Array(await file.arrayBuffer()),
      key: uploadedKey,
      contentType: file.type || "application/octet-stream",
      metadata: createCentralisStorageMetadata({
        module: "Arc Studio",
        context: `Arc Manuscript Breakdown: ${file.name}`,
        note: `Format: ${FORMAT_LABELS[format]}`,
      }),
    });

    const job = await createGenerationJob({
      userId: appUser.id,
      module: "arc_studio",
      jobType: "manuscript_outline",
      sourceType: "manuscript",
      sourceId,
      sourceLabel: file.name,
      prompt: `Break down manuscript as ${FORMAT_LABELS[format]} outline guidance.`,
      parameters: {
        format,
        storage_key: uploadedKey,
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
        max_outline_units: MAX_OUTLINE_UNITS,
      },
      progressLabel: "Queued manuscript",
    });

    return jsonResponse({
      job: {
        id: job.id,
        status: job.status,
        progress_label: job.progress_label || "Queued manuscript",
        source_label: job.source_label,
      },
    }, 202);
  } catch (error) {
    if (uploadedKey) {
      await deleteUniverseSourceDocumentObject(uploadedKey).catch((cleanupError) => {
        console.error("Could not roll back queued Arc manuscript upload:", cleanupError);
      });
    }
    console.error(error);
    return jsonResponse(describeError(error, "Could not queue manuscript breakdown for Arc Studio."), 500);
  }
});
