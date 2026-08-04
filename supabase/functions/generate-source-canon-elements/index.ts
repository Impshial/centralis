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
  cleanTempId,
  cleanText,
  generateElementsFromReviewedSource,
} from "../_shared/source-canon-review.ts";

const DECISIONS = new Set(["keep_canon", "use_document", "merge"]);

function cleanDecisions(value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((item) => {
    const row = asRecord(item);
    const decision = cleanText(row.decision, 40);
    return {
      conflictId: cleanText(row.conflictId || row.conflict_id || row.id, 120),
      decision: DECISIONS.has(decision) ? decision : "merge",
      acceptedText: cleanText(row.acceptedText || row.accepted_text, 5000),
    };
  }).filter((item) => item.conflictId);
}

function normalizeElements(payload: unknown) {
  const record = asRecord(payload);
  return (Array.isArray(record.elements) ? record.elements : []).map((item, index) => {
    const row = asRecord(item);
    return {
      temp_id: cleanTempId(row.temp_id || row.tempId || row.id, `source-${index + 1}`),
      name: cleanText(row.name, 200),
      description: cleanText(row.description, 4000),
      element_type_name: cleanText(row.element_type_name || row.elementTypeName || row.type, 120),
      sort_order: index,
    };
  }).filter((item) => item.name && item.description).slice(0, 30);
}

function normalizeLinks(payload: unknown, tempIds: Set<string>) {
  const record = asRecord(payload);
  return (Array.isArray(record.links) ? record.links : []).map((item, index) => {
    const row = asRecord(item);
    return {
      id: cleanTempId(row.id, `link-${index + 1}`),
      source: cleanText(row.source || row.source_id || row.source_temp_id, 120),
      target: cleanText(row.target || row.target_id || row.target_temp_id, 120),
      label: cleanText(row.label || row.relationship, 120),
    };
  }).filter((item) => item.source && item.target && item.source !== item.target && item.label && (tempIds.has(item.source) || tempIds.has(item.target))).slice(0, 40);
}

function getRelatedSourceDocument(value: unknown) {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const reviewId = cleanText(body.reviewId, 120);
    const decisions = cleanDecisions(body.decisions);
    if (!reviewId) return jsonResponse({ error: "reviewId is required." }, 400);

    const supabase = createAdminClient();
    const { data: review, error: reviewError } = await supabase
      .from("universe_source_canon_reviews")
      .select("id,universe_id,source_document_id,user_id,status,new_information_summary,universe_source_documents(display_name,original_filename)")
      .eq("id", reviewId)
      .eq("user_id", appUser.id)
      .single();
    if (reviewError || !review) throw reviewError || new Error("Source review was not found.");

    const { data: conflicts, error: conflictsError } = await supabase
      .from("universe_source_canon_conflicts")
      .select("id,title,canon_summary,document_summary,suggested_merge")
      .eq("review_id", reviewId)
      .eq("user_id", appUser.id)
      .order("sort_order", { ascending: true });
    if (conflictsError) throw conflictsError;

    const conflictById = new Map((conflicts || []).map((conflict) => [String(conflict.id), conflict as Record<string, unknown>]));
    const acceptedNotes: Array<{ title: string; body: string; conflictId: string; decision: string }> = [];

    decisions.forEach((decision) => {
      const conflict = conflictById.get(decision.conflictId);
      if (!conflict) return;
      const fallbackText = decision.decision === "keep_canon"
        ? cleanText(conflict.canon_summary, 5000)
        : decision.decision === "use_document"
          ? cleanText(conflict.document_summary, 5000)
          : cleanText(conflict.suggested_merge, 5000);
      acceptedNotes.push({
        title: cleanText(conflict.title, 200) || "Reviewed source conflict",
        body: decision.acceptedText || fallbackText,
        conflictId: decision.conflictId,
        decision: decision.decision,
      });
    });

    for (const note of acceptedNotes) {
      await supabase
        .from("universe_source_canon_conflicts")
        .update({
          decision: note.decision,
          accepted_text: note.body,
          updated_at: new Date().toISOString(),
        })
        .eq("id", note.conflictId)
        .eq("user_id", appUser.id);
    }

    if (acceptedNotes.length) {
      const { error: notesError } = await supabase
        .from("universe_source_canon_notes")
        .insert(acceptedNotes.map((note) => ({
          review_id: reviewId,
          conflict_id: note.conflictId,
          universe_id: review.universe_id,
          source_document_id: review.source_document_id,
          user_id: appUser.id,
          title: note.title,
          body: note.body,
          note_type: "conflict_resolution",
          decision: note.decision,
        })));
      if (notesError) throw notesError;
    }

    const newInfo = cleanText(review.new_information_summary, 5000);
    if (newInfo) {
      const { error: infoNoteError } = await supabase
        .from("universe_source_canon_notes")
        .insert({
          review_id: reviewId,
          universe_id: review.universe_id,
          source_document_id: review.source_document_id,
          user_id: appUser.id,
          title: "New source information",
          body: newInfo,
          note_type: "new_information",
        });
      if (infoNoteError) throw infoNoteError;
    }

    await supabase
      .from("universe_source_canon_reviews")
      .update({ status: "notes_saved", updated_at: new Date().toISOString() })
      .eq("id", reviewId)
      .eq("user_id", appUser.id);

    const { context, canonDocument } = await buildSourceReviewCanonContext(supabase, String(review.universe_id), appUser.id);
    const existingElements = context.elements.map((element) => ({
      id: String(element.id),
      name: String(element.name || ""),
      element_type_name: element.element_type_id ? context.elementTypesById.get(String(element.element_type_id))?.name || "Unknown" : "No Type",
      description: cleanText(element.description, 600),
    }));
    const documentRow = getRelatedSourceDocument(review.universe_source_documents);
    const generated = await generateElementsFromReviewedSource({
      documentTitle: cleanText(documentRow.display_name || documentRow.original_filename, 200) || "Source document",
      universeName: context.universe.name,
      canonDocument,
      acceptedNotes,
      allowedTypes: [...context.elementTypesById.values()].map((type) => ({ name: type.name })),
      existingElements,
      newInformationSummary: newInfo,
    });
    const elements = normalizeElements(generated);
    const tempIds = new Set(elements.map((element) => element.temp_id));
    const links = normalizeLinks(generated, tempIds);
    const linkRowsByTempId = new Map<string, unknown[]>();
    links.forEach((link) => {
      [link.source, link.target].forEach((tempId) => {
        if (!tempIds.has(tempId)) return;
        const rows = linkRowsByTempId.get(tempId) || [];
        rows.push(link);
        linkRowsByTempId.set(tempId, rows);
      });
    });

    if (elements.length) {
      const { error: suggestionError } = await supabase
        .from("universe_source_element_suggestions")
        .insert(elements.map((element) => ({
          review_id: reviewId,
          universe_id: review.universe_id,
          user_id: appUser.id,
          temp_id: element.temp_id,
          name: element.name,
          description: element.description,
          element_type_name: element.element_type_name,
          links: linkRowsByTempId.get(element.temp_id) || [],
          sort_order: element.sort_order,
        })));
      if (suggestionError) throw suggestionError;
    }

    await supabase
      .from("universe_source_canon_reviews")
      .update({
        status: "suggestions_ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", reviewId)
      .eq("user_id", appUser.id);

    return jsonResponse({
      reviewId,
      elements,
      links,
      notesSaved: acceptedNotes.length + (newInfo ? 1 : 0),
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate source canon element suggestions."), 500);
  }
});
