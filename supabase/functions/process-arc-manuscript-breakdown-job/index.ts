import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getAppUser } from "../_shared/chat-storage.ts";
import { updateGenerationJob } from "../_shared/generation-jobs.ts";
import { readUniverseSourceDocumentObject } from "../_shared/source-documents.ts";
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
const DEFAULT_MAX_OUTLINE_UNITS = 36;
const FORMAT_GUIDANCE: Record<string, { label: string; prompt: string }> = {
  novel: {
    label: "Novel",
    prompt: "Create a novel outline with chapters and scenes. Emphasize point of view, prose pacing, interiority, chapter turns, scene purpose, and adaptation advice for writing the story as prose.",
  },
  short_story: {
    label: "Short Story",
    prompt: "Create a short story outline with only the essential turns. Emphasize compression choices, emotional arc, escalation, scene economy, and the ending pressure.",
  },
  series: {
    label: "Series",
    prompt: "Create a series outline with installment or season-level movements where useful. Emphasize recurring threads, episode/book shape, long-range payoffs, and what each unit contributes to the larger arc.",
  },
  screenplay: {
    label: "Screenplay",
    prompt: "Create a screenplay planning outline with acts, optional sequences, and scenes. Emphasize visual action, dramatic turns, cinematic staging, and adaptation advice. Do not write sluglines or dialogue.",
  },
  tv_episode: {
    label: "TV Episode",
    prompt: "Create a TV episode outline with teaser/acts/scenes where useful. Emphasize act breaks, episode engine, A/B stories, escalation, and what each scene needs to accomplish on screen.",
  },
  custom: {
    label: "Undecided (custom)",
    prompt: "Create flexible story-outline guidance. Call out where format decisions remain open and provide practical adaptation advice without assuming one final medium.",
  },
};

function asArray(value: unknown, limit = DEFAULT_MAX_OUTLINE_UNITS) {
  return (Array.isArray(value) ? value : []).slice(0, limit);
}

function cleanUnitType(value: unknown) {
  const type = cleanText(value, 40).toLowerCase().replace(/[^a-z_]+/g, "_");
  return UNIT_TYPES.has(type) ? type : "scene";
}

function normalizeProject(raw: Record<string, unknown>, fallbackTitle: string, selectedFormat: string) {
  const project = asRecord(raw.project || raw);
  return {
    title: cleanText(project.title || project.name || raw.title || raw.name, 180) || fallbackTitle,
    genre: cleanText(project.genre || raw.genre, 120),
    format: selectedFormat,
    logline: cleanText(project.logline || raw.logline, 1000),
    premise: cleanText(project.premise || project.summary || raw.premise || raw.summary, 6000),
    target_length: cleanText(project.target_length || project.targetLength || raw.target_length || raw.targetLength, 120),
    notes: cleanText(project.notes || raw.notes, 8000),
  };
}

function normalizeUnits(rawUnits: unknown, maxUnits: number) {
  const tempIds = new Set<string>();
  return asArray(rawUnits, maxUnits).map((item, index) => {
    const record = asRecord(item);
    const title = cleanText(record.title || record.name, 180) || `Story Unit ${index + 1}`;
    let tempId = cleanTempId(record.temp_id || record.tempId || record.id, `unit-${index + 1}`);
    while (tempIds.has(tempId)) tempId = `${tempId}-${index + 1}`;
    tempIds.add(tempId);
    const beats = asArray(record.beats, 12).map((beat) => cleanText(beat, 500)).filter(Boolean);
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

async function processJob(options: { jobId: string; authUserId: string; appUserId: number }) {
  let vectorStoreId = "";
  let fileId = "";
  try {
    const supabase = createAdminClient();
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .select("id,status,parameters")
      .eq("id", options.jobId)
      .eq("user_id", options.appUserId)
      .eq("module", "arc_studio")
      .eq("job_type", "manuscript_outline")
      .eq("deleted", false)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) throw new Error("Manuscript breakdown job was not found.");
    if (job.status === "completed") return;
    if (job.status === "cancelled") throw new Error("Manuscript breakdown was cancelled.");

    const params = asRecord(job.parameters);
    const format = String(params.format || "custom");
    const storageKey = String(params.storage_key || "");
    const filename = String(params.original_filename || "manuscript.txt");
    const contentType = String(params.mime_type || "application/octet-stream");
    const fileSize = Number(params.file_size || 0);
    const maxUnits = Math.min(DEFAULT_MAX_OUTLINE_UNITS, Math.max(12, Number(params.max_outline_units || DEFAULT_MAX_OUTLINE_UNITS)));
    const formatGuidance = FORMAT_GUIDANCE[format] || FORMAT_GUIDANCE.custom;
    if (!storageKey) throw new Error("Stored manuscript key is missing.");

    await updateGenerationJob(options.jobId, { status: "running", progressLabel: "Loading manuscript" });
    const bytes = await readUniverseSourceDocumentObject(storageKey);
    await updateGenerationJob(options.jobId, { status: "running", progressLabel: "Uploading manuscript to AI" });
    fileId = await uploadOpenAiSourceFile({ bytes, filename, contentType });
    await updateGenerationJob(options.jobId, { status: "running", progressLabel: "Indexing manuscript" });
    vectorStoreId = await createOpenAiVectorStore("Pending Arc Manuscript Breakdown", options.authUserId);
    await attachFileToVectorStore(vectorStoreId, fileId);
    await waitForVectorStoreFile(vectorStoreId, fileId);
    await updateGenerationJob(options.jobId, { status: "running", progressLabel: "Building outline" });

    const result = await runDocumentFileSearchJson({
      vectorStoreId,
      system: [
        "You break source manuscripts into Arc Studio planning outlines for adaptation.",
        "You do not write screenplay pages, script prose, sluglines, dialogue blocks, finished scenes, finished narration, or finished book prose.",
        "Return only valid JSON. The output is planning guidance, not a written script or manuscript.",
      ].join("\n"),
      prompt: [
        "Read the attached manuscript or story document and create a faithful adaptation outline.",
        `Selected outline format: ${formatGuidance.label}.`,
        formatGuidance.prompt,
        "Return exactly one JSON object with keys: project and units.",
        `project must include: title, genre, format, logline, premise, target_length, notes. format must be ${format}.`,
        "units must be an array of acts, optional sequences, and scenes. Each unit must include: temp_id, parent_temp_id, unit_type, title, summary, purpose, conflict, outcome, story_time, emotional_tone, beats, sort_order.",
        "Allowed unit_type values are: act, sequence, scene.",
        "Use parent_temp_id to nest scenes under acts or sequences.",
        "Preserve the source story order, major events, character intent, and causal flow.",
        "The summary for each unit should explain what should happen, how the unit might be approached for the selected format, and adaptation advice.",
        "Beats must be short planning beats only. Do not include dialogue, screenplay formatting, sluglines, page prose, or completed scene text.",
        `Return no more than ${maxUnits} outline units. Prefer acts/sequences plus key scenes over exhaustive coverage.`,
        "Do not invent unsupported story facts. If something is unclear, describe it as an adaptation note or uncertainty.",
      ].join("\n\n"),
      maxOutputTokens: 5200,
      maxNumResults: 8,
      reasoningEffort: "low",
    });

    const record = asRecord(result);
    const project = normalizeProject(record, filename.replace(/\.[^.]+$/, ""), format);
    const units = normalizeUnits(record.units || record.outline || record.scenes, maxUnits);
    if (!project.title && !units.length) {
      throw new Error("OpenAI could not extract a usable Arc outline from that manuscript.");
    }

    await updateGenerationJob(options.jobId, { status: "running", progressLabel: "Saving outline" });
    await updateGenerationJob(options.jobId, {
      status: "completed",
      progressLabel: "Ready",
      resultPayload: {
        source: { original_filename: filename, mime_type: contentType, file_size: fileSize, storage_key: storageKey },
        project,
        units,
      },
    });
  } catch (error) {
    console.error(error);
    await updateGenerationJob(options.jobId, {
      status: "failed",
      progressLabel: "Failed",
      errorMessage: error instanceof Error ? error.message : "Could not break down manuscript.",
      errorDetails: describeError(error, "Could not break down manuscript for Arc Studio.") as Record<string, unknown>,
    }).catch((jobError) => console.error(jobError));
  } finally {
    if (vectorStoreId || fileId) await cleanupDocumentVectorStore(vectorStoreId, fileId);
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const jobId = cleanText(body.jobId, 120);
    if (!jobId) return jsonResponse({ error: "jobId is required." }, 400);

    const processing = processJob({ jobId, authUserId: authUser.id, appUserId: appUser.id });
    const runtime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    };
    if (typeof runtime.EdgeRuntime?.waitUntil === "function") {
      runtime.EdgeRuntime.waitUntil(processing);
      return jsonResponse({ ok: true, status: "processing" }, 202);
    }

    await processing;
    return jsonResponse({ ok: true, status: "processed" });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not process manuscript breakdown job."), 500);
  }
});
