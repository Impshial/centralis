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
  cleanTempId,
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

const UNIT_TYPES = new Set(["act", "sequence", "scene"]);

function asArray(value: unknown, limit = 160) {
  return (Array.isArray(value) ? value : []).slice(0, limit);
}

function cleanUnitType(value: unknown) {
  const type = cleanText(value, 40).toLowerCase().replace(/[^a-z_]+/g, "_");
  return UNIT_TYPES.has(type) ? type : "scene";
}

function normalizeProject(raw: Record<string, unknown>, fallbackTitle: string) {
  const project = asRecord(raw.project || raw);
  return {
    title: cleanText(project.title || project.name || raw.title || raw.name, 180) || fallbackTitle,
    genre: cleanText(project.genre || raw.genre, 120),
    format: "screenplay",
    logline: cleanText(project.logline || raw.logline, 1000),
    premise: cleanText(project.premise || project.summary || raw.premise || raw.summary, 6000),
    target_length: cleanText(project.target_length || project.targetLength || raw.target_length || raw.targetLength, 120),
    notes: cleanText(project.notes || raw.notes, 8000),
  };
}

function normalizeUnits(rawUnits: unknown) {
  const tempIds = new Set<string>();
  return asArray(rawUnits, 140).map((item, index) => {
    const record = asRecord(item);
    const title = cleanText(record.title || record.name, 180) || `Story Unit ${index + 1}`;
    let tempId = cleanTempId(record.temp_id || record.tempId || record.id, `unit-${index + 1}`);
    while (tempIds.has(tempId)) {
      tempId = `${tempId}-${index + 1}`;
    }
    tempIds.add(tempId);
    const beats = asArray(record.beats, 24)
      .map((beat) => cleanText(beat, 500))
      .filter(Boolean);
    return {
      temp_id: tempId,
      parent_temp_id: cleanTempId(record.parent_temp_id || record.parentTempId || "", ""),
      unit_type: cleanUnitType(record.unit_type || record.unitType || record.type),
      title,
      summary: cleanText(record.summary || record.synopsis || record.advice, 5000),
      purpose: cleanText(record.purpose, 1800),
      conflict: cleanText(record.conflict, 1800),
      outcome: cleanText(record.outcome, 1800),
      story_time: cleanText(record.story_time || record.storyTime, 300),
      emotional_tone: cleanText(record.emotional_tone || record.emotionalTone || record.tone, 300),
      beats,
      sort_order: Number.isFinite(Number(record.sort_order ?? record.sortOrder))
        ? Math.max(0, Math.round(Number(record.sort_order ?? record.sortOrder)))
        : (index + 1) * 100,
    };
  }).filter((unit) => unit.title || unit.summary);
}

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
      return jsonResponse({ error: "Choose a manuscript document to upload." }, 400);
    }

    const extension = getFileExtension(file.name);
    if (!SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS.has(extension)) {
      return jsonResponse({ error: "Unsupported file type. Upload PDF, text, Markdown, HTML, RTF, Word, CSV/TSV, JSON, YAML, or XML files." }, 400);
    }

    if (file.size <= 0 || file.size > MAX_UNIVERSE_SOURCE_DOCUMENT_BYTES) {
      return jsonResponse({ error: "Manuscript documents must be between 1 byte and 25 MB." }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    fileId = await uploadOpenAiSourceFile({
      bytes,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
    });
    vectorStoreId = await createOpenAiVectorStore("Pending Arc Manuscript Breakdown", authUser.id);
    await attachFileToVectorStore(vectorStoreId, fileId);
    await waitForVectorStoreFile(vectorStoreId, fileId);

    const result = await runDocumentFileSearchJson({
      vectorStoreId,
      system: [
        "You break source manuscripts into Arc Studio planning outlines for adaptation.",
        "You do not write screenplay pages, script prose, sluglines, dialogue blocks, finished scenes, or finished narration.",
        "Return only valid JSON. The output is planning guidance, not a written script.",
      ].join("\n"),
      prompt: [
        "Read the attached manuscript or story document and create a faithful adaptation outline for a movie/screenplay project.",
        "Return exactly one JSON object with keys: project and units.",
        "project must include: title, genre, format, logline, premise, target_length, notes. format must be screenplay.",
        "units must be an array of acts, optional sequences, and scenes. Each unit must include: temp_id, parent_temp_id, unit_type, title, summary, purpose, conflict, outcome, story_time, emotional_tone, beats, sort_order.",
        "Allowed unit_type values are: act, sequence, scene.",
        "Use parent_temp_id to nest scenes under acts or sequences.",
        "Preserve the source story order, major events, character intent, and causal flow.",
        "The summary for each unit should explain what should happen, how the scene or act might be approached visually or dramatically, and adaptation advice.",
        "Beats must be short planning beats only. Do not include dialogue, screenplay formatting, sluglines, page prose, or completed scene text.",
        "Prefer a practical outline: 3-5 acts when appropriate, optional sequences only when they improve clarity, and enough scenes to cover the story without filler.",
        "Do not invent unsupported story facts. If something is unclear, describe it as an adaptation note or uncertainty.",
      ].join("\n\n"),
      maxOutputTokens: 9000,
      reasoningEffort: "high",
    });

    const record = asRecord(result);
    const project = normalizeProject(record, file.name.replace(/\.[^.]+$/, ""));
    const units = normalizeUnits(record.units || record.outline || record.scenes);
    if (!project.title && !units.length) {
      throw new Error("OpenAI could not extract a usable Arc outline from that manuscript.");
    }

    return jsonResponse({
      source: {
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
      },
      project,
      units,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not break down manuscript for Arc Studio."), 500);
  } finally {
    if (vectorStoreId || fileId) {
      await cleanupDocumentVectorStore(vectorStoreId, fileId);
    }
  }
});
