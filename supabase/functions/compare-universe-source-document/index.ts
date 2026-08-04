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
  buildSourceReviewCanonContext,
  cleanText,
  cleanupDocumentVectorStore,
  createDocumentVectorStore,
  loadOwnedSourceDocument,
  runDocumentFileSearchJson,
} from "../_shared/source-canon-review.ts";

function normalizeConflicts(value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((item, index) => {
    const row = asRecord(item);
    return {
      title: cleanText(row.title, 200) || `Conflict ${index + 1}`,
      conflict_type: cleanText(row.conflict_type || row.conflictType || row.type, 80) || "canon_conflict",
      canon_summary: cleanText(row.canon_summary || row.canonSummary || row.canon, 3000),
      document_summary: cleanText(row.document_summary || row.documentSummary || row.document, 3000),
      suggested_merge: cleanText(row.suggested_merge || row.suggestedMerge || row.merge, 3000),
      sort_order: index,
    };
  }).filter((item) => item.canon_summary || item.document_summary).slice(0, 30);
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
    if (!universeId || !documentId) {
      return jsonResponse({ error: "universeId and documentId are required." }, 400);
    }

    const supabase = createAdminClient();
    const document = await loadOwnedSourceDocument(supabase, { universeId, documentId, appUserId: appUser.id });
    const { context, canonDocument } = await buildSourceReviewCanonContext(supabase, universeId, appUser.id);
    const docVector = await createDocumentVectorStore(document, context.universe.name, universeId);
    vectorStoreId = docVector.vectorStoreId;
    fileId = docVector.fileId;

    const documentTitle = String(document.display_name || document.original_filename || "Source document");
    const result = await runDocumentFileSearchJson({
      vectorStoreId,
      system: "You compare uploaded fictional source material against established Centralis canon. Return only valid JSON.",
      prompt: [
        "Compare the attached source document to the current canon below.",
        "Return exactly one JSON object with keys: document_summary, new_information_summary, conflicts.",
        "conflicts must be an array of objects with keys: title, conflict_type, canon_summary, document_summary, suggested_merge.",
        "Only report true factual or continuity conflicts. Do not report harmless extra detail as conflict.",
        "Summarize new information that could become source canon, even if there are no conflicts.",
        `Source document title: ${documentTitle}`,
        "Current canon:",
        canonDocument.slice(0, 65000),
      ].join("\n\n"),
      maxOutputTokens: 8000,
    });

    const record = asRecord(result);
    const conflicts = normalizeConflicts(record.conflicts);
    const { data: review, error: reviewError } = await supabase
      .from("universe_source_canon_reviews")
      .insert({
        universe_id: universeId,
        source_document_id: documentId,
        user_id: appUser.id,
        status: "conflicts_ready",
        document_summary: cleanText(record.document_summary || record.documentSummary, 5000),
        new_information_summary: cleanText(record.new_information_summary || record.newInformationSummary, 5000),
      })
      .select("id,universe_id,source_document_id,user_id,status,document_summary,new_information_summary,created_at,updated_at")
      .single();

    if (reviewError || !review) throw reviewError || new Error("Could not save source review.");

    let savedConflicts: unknown[] = [];
    if (conflicts.length) {
      const { data, error } = await supabase
        .from("universe_source_canon_conflicts")
        .insert(conflicts.map((conflict) => ({
          ...conflict,
          review_id: review.id,
          universe_id: universeId,
          user_id: appUser.id,
        })))
        .select("id,review_id,title,conflict_type,canon_summary,document_summary,suggested_merge,decision,accepted_text,sort_order");
      if (error) throw error;
      savedConflicts = data || [];
    }

    return jsonResponse({
      review,
      document: {
        id: document.id,
        display_name: document.display_name,
        original_filename: document.original_filename,
        mime_type: document.mime_type,
        file_size: document.file_size,
      },
      conflicts: savedConflicts,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not compare source document to canon."), 500);
  } finally {
    await cleanupDocumentVectorStore(vectorStoreId, fileId);
  }
});
