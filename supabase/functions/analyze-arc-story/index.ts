import OpenAI from "npm:openai@^6.1.0";
import { generateJsonText } from "../_shared/openai-config.ts";
import {
  createAdminClient,
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

type ArcUnit = Record<string, unknown>;
type ArcThread = Record<string, unknown>;
type ArcSetup = Record<string, unknown>;
type ArcUnitLink = Record<string, unknown>;
type ArcElementState = Record<string, unknown>;

function cleanText(value: unknown, maxLength = 4000) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function parseJson(textValue: string) {
  try {
    return JSON.parse(textValue);
  } catch (_error) {
    const start = textValue.indexOf("{");
    const end = textValue.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(textValue.slice(start, end + 1));
    throw new Error("OpenAI did not return valid JSON.");
  }
}

function asArray(value: unknown, limit = 80) {
  return (Array.isArray(value) ? value : []).slice(0, limit);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stableKey(prefix: string, index: number, label: string) {
  const clean = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${prefix}-${index + 1}${clean ? `-${clean}` : ""}`;
}

function normalizeAnalysis(raw: unknown) {
  const record = asRecord(raw);
  const diagnostics = asArray(record.diagnostics, 50).map((item, index) => {
    const issue = asRecord(item);
    const type = cleanText(issue.type, 80).toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "story_note";
    const severity = cleanText(issue.severity, 40).toLowerCase();
    const title = cleanText(issue.title, 180) || "Story note";
    return {
      key: cleanText(issue.key, 120) || stableKey(type, index, title),
      type,
      severity: ["info", "low", "medium", "high"].includes(severity) ? severity : "medium",
      title,
      description: cleanText(issue.description, 1400),
      unit_ids: asArray(issue.unit_ids || issue.unitIds, 12).map((id) => cleanText(id, 80)).filter(Boolean),
      thread_ids: asArray(issue.thread_ids || issue.threadIds, 8).map((id) => cleanText(id, 80)).filter(Boolean),
      element_ids: asArray(issue.element_ids || issue.elementIds, 8).map((id) => cleanText(id, 80)).filter(Boolean),
      suggestion: cleanText(issue.suggestion, 1400),
      apply_kind: cleanText(issue.apply_kind || issue.applyKind, 80),
      proposed_changes: asRecord(issue.proposed_changes || issue.proposedChanges),
    };
  });

  return {
    summary: cleanText(record.summary, 2000) || "Story analysis complete.",
    diagnostics,
  };
}

async function getAppUserId(supabase: ReturnType<typeof createAdminClient>, clerkUserId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Could not find Centralis app user.");
  return data.id as number;
}

function summarizeUnits(units: ArcUnit[]) {
  return units.map((unit) => ({
    id: unit.id,
    parent_unit_id: unit.parent_unit_id,
    type: unit.unit_type,
    title: unit.title,
    status: unit.status,
    summary: cleanText(unit.summary, 900),
    purpose: cleanText(unit.purpose, 700),
    conflict: cleanText(unit.conflict, 700),
    outcome: cleanText(unit.outcome, 700),
    pov_element_id: unit.pov_element_id,
    location_element_id: unit.location_element_id,
    story_time: unit.story_time,
    chronology_sort: unit.chronology_sort,
    starts_at: unit.starts_at,
    ends_at: unit.ends_at,
    timeline_label: unit.timeline_label,
    emotional_tone: unit.emotional_tone,
    beats: asArray(unit.beats, 16),
    sort_order: unit.sort_order,
  }));
}

function buildPrompt(input: {
  project: Record<string, unknown>;
  units: ArcUnit[];
  threads: ArcThread[];
  threadUnits: Record<string, unknown>[];
  characterArcs: Record<string, unknown>[];
  arcStages: Record<string, unknown>[];
  setups: ArcSetup[];
  unitLinks: ArcUnitLink[];
  elementStates: ArcElementState[];
  elements: Record<string, unknown>[];
  scope: string;
  instructions: string;
}) {
  return [
    "Analyze this Arc Studio story project. Arc Studio is a planning tool, not a manuscript editor.",
    "Return exactly one JSON object: {\"summary\":\"...\",\"diagnostics\":[{\"key\":\"...\",\"type\":\"...\",\"severity\":\"info|low|medium|high\",\"title\":\"...\",\"description\":\"...\",\"unit_ids\":[\"...\"],\"thread_ids\":[\"...\"],\"element_ids\":[\"...\"],\"suggestion\":\"...\",\"apply_kind\":\"none|unit_edit|unit_link|element_state|thread_note\",\"proposed_changes\":{}}]}",
    "Focus on useful reviewable story intelligence: dropped threads, missing payoffs, orphaned payoffs, weak or missing scene purpose, unclear causality, chronology conflicts, repeated scene functions, pacing clusters, continuity state contradictions, and arc stages that do not connect to scenes.",
    "Do not rewrite the story. Do not invent canon as fact. Suggestions must be optional and reviewable.",
    "Prefer concrete diagnostics tied to unit_ids, thread_ids, or element_ids when possible. Use severity high only for likely structural blockers.",
    `Analysis scope: ${input.scope || "project"}.`,
    input.instructions ? `User instructions:\n${input.instructions}` : "No additional user instructions.",
    `Project:\n${JSON.stringify({
      id: input.project.id,
      title: input.project.title,
      logline: input.project.logline,
      premise: input.project.premise,
      genre: input.project.genre,
      format: input.project.format,
      status: input.project.status,
    })}`,
    `Units:\n${JSON.stringify(summarizeUnits(input.units))}`,
    `Threads:\n${JSON.stringify(input.threads)}`,
    `Thread unit links:\n${JSON.stringify(input.threadUnits)}`,
    `Character arcs:\n${JSON.stringify(input.characterArcs)}`,
    `Arc stages:\n${JSON.stringify(input.arcStages)}`,
    `Setups and payoffs:\n${JSON.stringify(input.setups)}`,
    `Cause/effect links:\n${JSON.stringify(input.unitLinks)}`,
    `Element continuity states:\n${JSON.stringify(input.elementStates)}`,
    `Linked Chronicle element previews:\n${JSON.stringify(input.elements.map((element) => ({
      id: element.id,
      name: element.name,
      description: cleanText(element.description, 500),
      universe_id: element.universe_id,
    })))}`,
  ].join("\n\n");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabase = createAdminClient();
  let reportId = "";

  try {
    const authUser = await getAuthUser(req);
    const appUserId = await getAppUserId(supabase, authUser.id);
    const body = await req.json().catch(() => ({}));
    const projectId = cleanText(body.project_id || body.projectId, 80);
    const scope = cleanText(body.scope, 80) || "project";
    const instructions = cleanText(body.instructions, 3000);
    if (!projectId) return jsonResponse({ error: "project_id is required." }, 400);

    const { data: project, error: projectError } = await supabase
      .from("arc_projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", appUserId)
      .eq("deleted", false)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return jsonResponse({ error: "Project not found." }, 404);

    const { data: report, error: reportError } = await supabase
      .from("arc_diagnostic_reports")
      .insert({
        project_id: projectId,
        user_id: appUserId,
        scope,
        instructions,
        status: "running",
      })
      .select("id")
      .single();
    if (reportError) throw reportError;
    reportId = report.id;

    const [units, threads, threadUnits, characterArcs, arcStages, setups, unitLinks, elementStates, unitElements] = await Promise.all([
      supabase.from("arc_units").select("*").eq("project_id", projectId).eq("user_id", appUserId).eq("deleted", false).order("sort_order", { ascending: true }),
      supabase.from("arc_threads").select("*").eq("project_id", projectId).eq("user_id", appUserId).eq("deleted", false).order("sort_order", { ascending: true }),
      supabase.from("arc_thread_units").select("*").eq("project_id", projectId).eq("user_id", appUserId).order("sort_order", { ascending: true }),
      supabase.from("arc_character_arcs").select("*").eq("project_id", projectId).eq("user_id", appUserId).eq("deleted", false).order("created_at", { ascending: true }),
      supabase.from("arc_arc_stages").select("*").eq("project_id", projectId).eq("user_id", appUserId).order("sort_order", { ascending: true }),
      supabase.from("arc_setups_payoffs").select("*").eq("project_id", projectId).eq("user_id", appUserId).order("created_at", { ascending: true }),
      supabase.from("arc_unit_links").select("*").eq("project_id", projectId).eq("user_id", appUserId).order("created_at", { ascending: true }),
      supabase.from("arc_element_states").select("*").eq("project_id", projectId).eq("user_id", appUserId).order("created_at", { ascending: true }),
      supabase.from("arc_unit_elements").select("element_id").eq("project_id", projectId).eq("user_id", appUserId),
    ]);
    for (const response of [units, threads, threadUnits, characterArcs, arcStages, setups, unitLinks, elementStates, unitElements]) {
      if (response.error) throw response.error;
    }

    const elementIds = [...new Set([
      ...(unitElements.data || []).map((row) => row.element_id),
      ...(elementStates.data || []).map((row) => row.element_id),
    ].filter(Boolean))];
    const elements = elementIds.length
      ? await supabase.from("elements").select("id,name,description,universe_id").in("id", elementIds).eq("user_id", appUserId).eq("deleted", false)
      : { data: [], error: null };
    if (elements.error) throw elements.error;

    const prompt = buildPrompt({
      project,
      units: units.data || [],
      threads: threads.data || [],
      threadUnits: threadUnits.data || [],
      characterArcs: characterArcs.data || [],
      arcStages: arcStages.data || [],
      setups: setups.data || [],
      unitLinks: unitLinks.data || [],
      elementStates: elementStates.data || [],
      elements: elements.data || [],
      scope,
      instructions,
    });

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You return strict JSON for reviewable story-structure diagnostics. Return only valid JSON.",
      prompt,
      maxOutputTokens: 4500,
    });
    const analysis = normalizeAnalysis(parseJson(generatedText || "{}"));

    const { error: updateError } = await supabase
      .from("arc_diagnostic_reports")
      .update({
        status: "complete",
        summary: analysis.summary,
        diagnostics: analysis.diagnostics,
      })
      .eq("id", reportId)
      .eq("user_id", appUserId);
    if (updateError) throw updateError;

    return jsonResponse({ report_id: reportId, ...analysis });
  } catch (error) {
    console.error(error);
    if (reportId) {
      await supabase
        .from("arc_diagnostic_reports")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", reportId);
    }
    return jsonResponse(describeError(error, "Could not analyze Arc Studio project."), 500);
  }
});
