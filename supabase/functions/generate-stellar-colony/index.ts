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
  buildColonyPrompt,
  buildColonistsPrompt,
  integerOrNull,
  isAsteroidBelt,
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
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Centralis user profile was not found.");
  return Number(data.id);
}

function sourceTypeForBody(kind: "planet" | "moon", body: Record<string, unknown>) {
  if (kind === "planet" && isAsteroidBelt(body)) return "stellar_asteroid_belt";
  return kind === "planet" ? "stellar_planet" : "stellar_moon";
}

async function assertNoActiveJob(
  supabase: ReturnType<typeof createAdminClient>,
  userId: number,
  sourceType: string,
  sourceId: string,
) {
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("id,status")
    .eq("user_id", userId)
    .eq("module", "stellar_architect")
    .eq("job_type", "colony")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .in("status", ["queued", "running"])
    .limit(1);
  if (error) throw error;
  if (data?.length) {
    throw new Error("A colony generation is already in progress for this body.");
  }
}

function colonyRow(input: {
  generated: Record<string, unknown>;
  userId: number;
  body: Record<string, unknown>;
  planetId: string | null;
  moonId: string | null;
}) {
  const colony = input.generated;
  return {
    user_id: input.userId,
    system_id: input.body.system_id,
    planet_id: input.planetId,
    moon_id: input.moonId,
    name: text(colony.name, `${input.body.name || input.body.designation || "Body"} Colony`),
    location_type: text(colony.locationType || colony.location_type),
    location_notes: text(colony.locationNotes || colony.location_notes),
    founded_year: integerOrNull(colony.foundedYear || colony.founded_year),
    organization: text(colony.organization),
    settlement_type: text(colony.settlementType || colony.settlement_type),
    population: integerOrNull(colony.population),
    primary_biome: text(colony.primaryBiome || colony.primary_biome),
    local_hazards: text(colony.localHazards || colony.local_hazards),
    energy_sources: text(colony.energySources || colony.energy_sources),
    water_source: text(colony.waterSource || colony.water_source),
    industry: text(colony.industry),
    food_production: text(colony.foodProduction || colony.food_production),
    housing: text(colony.housing),
    supply_status: text(colony.supplyStatus || colony.supply_status),
    government_type: text(colony.governmentType || colony.government_type),
    defensive_structures: text(colony.defensiveStructures || colony.defensive_structures),
    communication: text(colony.communication),
    research_focus: text(colony.researchFocus || colony.research_focus),
    description: text(colony.description),
  };
}

function colonistRows(input: {
  generated: Record<string, unknown>[];
  userId: number;
  colony: Record<string, unknown>;
  count: number;
}) {
  return input.generated.slice(0, input.count).map((colonist, index) => ({
    user_id: input.userId,
    system_id: input.colony.system_id,
    colony_id: input.colony.id,
    name: text(colonist.name, `Colonist ${index + 1}`),
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

  let colonyJobId: string | null = null;
  let colonistJobId: string | null = null;

  try {
    const appUserId = await getAppUserId(req);
    const body = await req.json().catch(() => ({}));
    const planetId = text(body.planetId);
    const moonId = text(body.moonId);
    const instructions = text(body.instructions);
    const includeColonists = Boolean(body.includeColonists);
    const selectedRosterRange = rosterRange(body.rosterRange);

    if (!planetId && !moonId) return jsonResponse({ error: "planetId or moonId is required." }, 400);
    if (planetId && moonId) return jsonResponse({ error: "Generate colonies for one body at a time." }, 400);

    const supabase = createAdminClient();
    const sourceKind: "planet" | "moon" = planetId ? "planet" : "moon";
    const sourceTable = planetId ? "stellar_planets" : "stellar_moons";
    const sourceId = String(planetId || moonId);
    const { data: sourceBody, error: sourceError } = await supabase
      .from(sourceTable)
      .select("*")
      .eq("id", sourceId)
      .eq("user_id", appUserId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!sourceBody) return jsonResponse({ error: "Stellar body was not found." }, 404);

    const sourceType = sourceTypeForBody(sourceKind, sourceBody);
    await assertNoActiveJob(supabase, appUserId, sourceType, sourceId);

    let existingColoniesQuery = supabase
      .from("stellar_colonies")
      .select("*")
      .eq("user_id", appUserId)
      .order("name", { ascending: true });
    if (planetId) existingColoniesQuery = existingColoniesQuery.eq("planet_id", planetId);
    if (moonId) existingColoniesQuery = existingColoniesQuery.eq("moon_id", moonId);
    const { data: existingColonies, error: colonyReadError } = await existingColoniesQuery;
    if (colonyReadError) throw colonyReadError;

    let lifeformQuery = supabase
      .from("stellar_lifeforms")
      .select("*")
      .eq("user_id", appUserId)
      .order("name", { ascending: true });
    if (planetId) lifeformQuery = lifeformQuery.eq("planet_id", planetId);
    if (moonId) lifeformQuery = lifeformQuery.eq("moon_id", moonId);
    const { data: existingLifeforms, error: lifeformError } = await lifeformQuery;
    if (lifeformError) throw lifeformError;

    const prompt = buildColonyPrompt({
      body: sourceBody,
      kind: sourceKind,
      existingColonies: existingColonies || [],
      existingLifeforms: existingLifeforms || [],
      instructions,
    });

    const colonyJob = await createGenerationJob({
      userId: appUserId,
      module: "stellar_architect",
      jobType: "colony",
      sourceType,
      sourceId,
      sourceLabel: String(sourceBody.name || sourceBody.designation || "Stellar body"),
      prompt,
      model: TEXT_MODEL,
      parameters: {
        includeColonists,
        rosterRange: selectedRosterRange.key,
      },
      progressLabel: "Queued colony generation",
    });
    colonyJobId = colonyJob.id;
    await updateGenerationJob(colonyJobId, { status: "running", progressLabel: "Generating colony" });

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You are a hard science fiction worldbuilding assistant for Stellar Architect. Return valid JSON only.",
      prompt,
      temperature: 0.8,
      maxOutputTokens: 2600,
    });
    const generated = parseJson(generatedText || "{}");
    const row = colonyRow({
      generated: generated.colony || generated,
      userId: appUserId,
      body: sourceBody,
      planetId: planetId || null,
      moonId: moonId || null,
    });
    const { data: insertedColony, error: insertError } = await supabase
      .from("stellar_colonies")
      .insert(row)
      .select("*")
      .single();
    if (insertError) throw insertError;

    const { error: updateSourceError } = await supabase
      .from(sourceTable)
      .update({
        colony_count: (existingColonies?.length || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId)
      .eq("user_id", appUserId);
    if (updateSourceError) throw updateSourceError;
    await updateGenerationJob(colonyJobId, { status: "completed", progressLabel: "Colony generated" });
    colonyJobId = null;

    let insertedColonists: Record<string, unknown>[] = [];
    if (includeColonists) {
      const count = pickRosterCount(selectedRosterRange.key);
      const colonistPrompt = buildColonistsPrompt({
        colony: insertedColony,
        body: sourceBody,
        kind: sourceKind,
        count,
        existingColonists: [],
        instructions,
      });
      const colonistJob = await createGenerationJob({
        userId: appUserId,
        module: "stellar_architect",
        jobType: "colonists",
        sourceType: "stellar_colony",
        sourceId: String(insertedColony.id),
        sourceLabel: String(insertedColony.name || "Colony"),
        prompt: colonistPrompt,
        model: TEXT_MODEL,
        parameters: { rosterRange: selectedRosterRange.key, count },
        progressLabel: "Queued colonist generation",
      });
      colonistJobId = colonistJob.id;
      await updateGenerationJob(colonistJobId, { status: "running", progressLabel: "Generating colonists" });

      const colonistText = await generateJsonText(openai, {
        system: "You are a hard science fiction NPC roster generator. Return valid JSON only.",
        prompt: colonistPrompt,
        temperature: 0.85,
        maxOutputTokens: 3600,
      });
      const colonistData = parseJson(colonistText || "{}");
      const rows = colonistRows({
        generated: Array.isArray(colonistData.colonists) ? colonistData.colonists : [],
        userId: appUserId,
        colony: insertedColony,
        count,
      });
      const { data: newColonists, error: colonistInsertError } = rows.length
        ? await supabase.from("stellar_colonists").insert(rows).select("*")
        : { data: [], error: null };
      if (colonistInsertError) throw colonistInsertError;
      insertedColonists = newColonists || [];

      const { error: colonyUpdateError } = await supabase
        .from("stellar_colonies")
        .update({
          colonist_count: insertedColonists.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", insertedColony.id)
        .eq("user_id", appUserId);
      if (colonyUpdateError) throw colonyUpdateError;
      await updateGenerationJob(colonistJobId, { status: "completed", progressLabel: "Colonists generated" });
    }

    return jsonResponse({
      colony: insertedColony,
      insertedColonists: insertedColonists.length,
      colonists: insertedColonists,
    });
  } catch (error) {
    console.error(error);
    const details = describeError(error, "Could not generate colony.");
    await updateGenerationJob(colonistJobId, { status: "failed", progressLabel: "Colonist generation failed", errorMessage: details.error, errorDetails: details }).catch(() => null);
    await updateGenerationJob(colonyJobId, { status: "failed", progressLabel: "Colony generation failed", errorMessage: details.error, errorDetails: details }).catch(() => null);
    const message = details.error || "Could not generate colony.";
    const status = message.includes("already in progress") ? 409 : 500;
    return jsonResponse(details, status);
  }
});
