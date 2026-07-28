import OpenAI from "npm:openai@^6.1.0";
import { createGenerationJob, updateGenerationJob } from "../_shared/generation-jobs.ts";
import { generateJsonText, TEXT_MODEL } from "../_shared/openai-config.ts";
import {
  createAdminClient,
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  buildColonistsPrompt,
  integerOrNull,
  parseJson,
  pickRosterCount,
  rosterRange,
  text,
} from "../_shared/stellar-generation.ts";

async function getAppUserId(req: Request) {
  const authUser = await getAuthUser(req);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", authUser.id)
    .eq("deleted", false)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Centralis user profile was not found.");
  return Number(data.id);
}

async function assertNoActiveJob(supabase: ReturnType<typeof createAdminClient>, userId: number, colonyId: string) {
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("id,status")
    .eq("user_id", userId)
    .eq("module", "stellar_architect")
    .eq("job_type", "colonists")
    .eq("source_type", "stellar_colony")
    .eq("source_id", colonyId)
    .eq("deleted", false)
    .in("status", ["queued", "running"])
    .limit(1);
  if (error) throw error;
  if (data?.length) throw new Error("A colonist generation is already in progress for this colony.");
}

function colonistRows(input: {
  generated: Record<string, unknown>[];
  userId: number;
  colony: Record<string, unknown>;
  existingCount: number;
  count: number;
}) {
  return input.generated.slice(0, input.count).map((colonist, index) => ({
    user_id: input.userId,
    system_id: input.colony.system_id,
    colony_id: input.colony.id,
    name: text(colonist.name, `Colonist ${input.existingCount + index + 1}`),
    role: text(colonist.role),
    department: text(colonist.department),
    age: integerOrNull(colonist.age),
    gender: text(colonist.gender),
    nationality: text(colonist.nationality),
    physical_description: text(colonist.physicalDescription || colonist.physical_description),
    specialization: text(colonist.specialization),
    primary_role: text(colonist.currentAssignment || colonist.current_assignment || colonist.role),
    personality: text(colonist.personalityTraits || colonist.personality_traits),
    temperament: text(colonist.temperament),
    biography: text(colonist.biography || colonist.background),
    profile: {
      background: text(colonist.background),
      currentAssignment: text(colonist.currentAssignment || colonist.current_assignment),
      personalConflict: text(colonist.personalConflict || colonist.personal_conflict),
      beliefs: text(colonist.beliefs),
      goals: text(colonist.goals),
      fears: text(colonist.fears),
      secrets: text(colonist.secrets),
    },
  }));
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let jobId: string | null = null;

  try {
    const appUserId = await getAppUserId(req);
    const body = await req.json().catch(() => ({}));
    const colonyId = text(body.colonyId);
    const instructions = text(body.instructions);
    const selectedRosterRange = rosterRange(body.rosterRange);
    const count = pickRosterCount(selectedRosterRange.key);
    if (!colonyId) return jsonResponse({ error: "colonyId is required." }, 400);

    const supabase = createAdminClient();
    const { data: colony, error: colonyError } = await supabase
      .from("stellar_colonies")
      .select("*")
      .eq("id", colonyId)
      .eq("user_id", appUserId)
      .eq("deleted", false)
      .maybeSingle();
    if (colonyError) throw colonyError;
    if (!colony) return jsonResponse({ error: "Colony was not found." }, 404);

    await assertNoActiveJob(supabase, appUserId, colonyId);

    const bodyTable = colony.moon_id ? "stellar_moons" : "stellar_planets";
    const bodyId = colony.moon_id || colony.planet_id;
    const { data: parentBody, error: parentError } = bodyId
      ? await supabase.from(bodyTable).select("*").eq("id", bodyId).eq("user_id", appUserId).eq("deleted", false).maybeSingle()
      : { data: null, error: null };
    if (parentError) throw parentError;

    const { data: existingColonists, error: existingError } = await supabase
      .from("stellar_colonists")
      .select("*")
      .eq("user_id", appUserId)
      .eq("colony_id", colonyId)
      .eq("deleted", false)
      .order("name", { ascending: true });
    if (existingError) throw existingError;

    const prompt = buildColonistsPrompt({
      colony,
      body: parentBody,
      kind: colony.moon_id ? "moon" : "planet",
      count,
      existingColonists: existingColonists || [],
      instructions,
    });

    const job = await createGenerationJob({
      userId: appUserId,
      module: "stellar_architect",
      jobType: "colonists",
      sourceType: "stellar_colony",
      sourceId: String(colonyId),
      sourceLabel: String(colony.name || "Colony"),
      prompt,
      model: TEXT_MODEL,
      parameters: { rosterRange: selectedRosterRange.key, count },
      progressLabel: "Queued colonist generation",
    });
    jobId = job.id;
    await updateGenerationJob(jobId, { status: "running", progressLabel: "Generating colonists" });

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You are a hard science fiction NPC roster generator. Return valid JSON only.",
      prompt,
      temperature: 0.85,
      maxOutputTokens: 3600,
    });
    const generated = parseJson(generatedText || "{}");
    const rows = colonistRows({
      generated: Array.isArray(generated.colonists) ? generated.colonists : [],
      userId: appUserId,
      colony,
      existingCount: existingColonists?.length || 0,
      count,
    });
    const { data: insertedColonists, error: insertError } = rows.length
      ? await supabase.from("stellar_colonists").insert(rows).select("*")
      : { data: [], error: null };
    if (insertError) throw insertError;

    const { error: colonyUpdateError } = await supabase
      .from("stellar_colonies")
      .update({
        colonist_count: (existingColonists?.length || 0) + (insertedColonists?.length || 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", colonyId)
      .eq("user_id", appUserId)
      .eq("deleted", false);
    if (colonyUpdateError) throw colonyUpdateError;

    await updateGenerationJob(jobId, { status: "completed", progressLabel: "Colonists generated" });
    return jsonResponse({
      inserted: insertedColonists?.length || 0,
      colonists: insertedColonists || [],
    });
  } catch (error) {
    console.error(error);
    const details = describeError(error, "Could not generate colonists.");
    await updateGenerationJob(jobId, { status: "failed", progressLabel: "Colonist generation failed", errorMessage: details.error, errorDetails: details }).catch(() => null);
    const message = details.error || "Could not generate colonists.";
    const status = message.includes("already in progress") ? 409 : 500;
    return jsonResponse(details, status);
  }
});
