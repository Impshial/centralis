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

function text(value: unknown, fallback: string | null = null) {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isAsteroidBelt(body: Record<string, unknown>) {
  return String(body.type || "").toLowerCase().includes("asteroid");
}

function parseJson(textValue: string) {
  try {
    return JSON.parse(textValue);
  } catch (_error) {
    const cleaned = textValue.replace(/```json\n?|\n?```/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (_secondError) {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(cleaned.slice(start, end + 1));
      }
      throw new Error("OpenAI did not return valid JSON.");
    }
  }
}

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

function buildLifeformsPrompt(
  body: Record<string, unknown>,
  kind: "planet" | "moon",
  count: number,
  existingLifeforms: Record<string, unknown>[] = [],
) {
  const existingSummary = existingLifeforms.length
    ? existingLifeforms
      .slice(0, 12)
      .map((lifeform) => `- ${lifeform.name || lifeform.designation || "Unnamed"}: ${lifeform.species_name || lifeform.species || lifeform.kingdom || "unknown species"}`)
      .join("\n")
    : "None yet.";
  return [
    `Generate ${count} scientifically plausible alien lifeforms for this ${kind}.`,
    `- Name: ${body.designation || body.name || "Unknown"}`,
    `- Type: ${body.type || "Unknown"}`,
    `- Surface temperature: ${body.surface_temperature_k || "Unknown"} K`,
    `- Atmosphere: ${body.atmosphere || "None"}`,
    `- Water presence: ${body.water_presence || "None"}`,
    `- Gravity: ${kind === "planet" ? `${body.gravity_ms2 || "Unknown"} m/s2` : "Unknown"}`,
    "",
    "Existing lifeforms on this body:",
    existingSummary,
    "",
    "Create diverse lifeforms adapted to these conditions.",
    "If existing lifeforms are listed, create new distinct organisms that could share the same ecosystem without duplicating them.",
    "Use these constraints:",
    "- designation: Alphanumeric catalog code like GQ9-[BodyName]-A001.",
    "- kingdom: Animalia, Plantae, Fungi, Protista, Archaea, or Bacteria.",
    "- species must be a Latin-style epithet prefixed with D-.",
    "- biome: Ocean, Atmosphere, Underground, Surface, Ice, or Volcanic.",
    "- locomotion: Swimming, Flying, Gliding, Crawling, Burrowing, or Sessile.",
    "- diet: Photosynthetic, Chemosynthetic, Herbivore, Carnivore, Filter Feeder, or Decomposer.",
    "- reproductiveMethod: Binary Fission, Budding, Spores, Egg Laying, Live Birth, or Broadcast Spawning.",
    "- thermalRegulation: Ectothermic or Endothermic.",
    "Make lifeforms scientifically plausible given the environmental conditions.",
    "Return valid JSON only with this shape:",
    JSON.stringify({
      lifeforms: [{
        designation: `GQ9-${body.designation || body.name || "BODY"}-A001`,
        name: "Common catalog name",
        kingdom: "Animalia",
        phylum: "Free-form scientific phylum",
        class: "Free-form scientific class",
        order: "Free-form scientific order",
        family: "Free-form scientific family",
        genus: "Latin-style genus",
        species: "D-example",
        biome: "Ocean",
        bodyType: "Radially symmetric",
        locomotion: "Swimming",
        sizeM: 1.2,
        diet: "Filter Feeder",
        skinColor: "Deep blue with luminescent stripes",
        reproductiveMethod: "Broadcast Spawning",
        sensoryType: "Electroreception",
        thermalRegulation: "Ectothermic",
        description: "2-3 sentence description of appearance and behavior.",
      }],
    }),
  ].join("\n");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const appUserId = await getAppUserId(req);
    const body = await req.json().catch(() => ({}));
    const planetId = text(body.planetId);
    const moonId = text(body.moonId);
    const count = Math.min(8, Math.max(1, Math.round(Number(body.count) || 3)));
    if (!planetId && !moonId) return jsonResponse({ error: "planetId or moonId is required." }, 400);
    if (planetId && moonId) return jsonResponse({ error: "Generate lifeforms for one body at a time." }, 400);

    const supabase = createAdminClient();
    const table = planetId ? "stellar_planets" : "stellar_moons";
    const id = planetId || moonId;
    const { data: sourceBody, error: sourceError } = await supabase
      .from(table)
      .select("*")
      .eq("id", id)
      .eq("user_id", appUserId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!sourceBody) return jsonResponse({ error: "Stellar body was not found." }, 404);
    if (planetId && isAsteroidBelt(sourceBody)) {
      return jsonResponse({ error: "Lifeforms cannot be generated for asteroid belts." }, 400);
    }

    const existingQuery = supabase
      .from("stellar_lifeforms")
      .select("*")
      .eq("user_id", appUserId)
      .order("name", { ascending: true });
    if (planetId) existingQuery.eq("planet_id", planetId);
    if (moonId) existingQuery.eq("moon_id", moonId);
    const { data: existingLifeforms, error: existingError } = await existingQuery;
    if (existingError) throw existingError;
    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You are an expert astrobiologist generating scientifically plausible alien lifeforms. Respond with valid JSON only.",
      prompt: buildLifeformsPrompt(sourceBody, planetId ? "planet" : "moon", count, existingLifeforms || []),
      temperature: 0.9,
      maxOutputTokens: 3000,
    });

    const generated = parseJson(generatedText || "{}");
    const lifeforms = Array.isArray(generated.lifeforms) ? generated.lifeforms.slice(0, count) : [];
    const rows = lifeforms.map((lifeform: Record<string, unknown>, index: number) => {
      const fallbackDesignation = `GQ9-${sourceBody.designation || sourceBody.name}-${String(index + 1).padStart(3, "0")}`;
      const genus = text(lifeform.genus);
      const species = text(lifeform.species);
      return {
        user_id: appUserId,
        system_id: sourceBody.system_id,
        planet_id: planetId || null,
        moon_id: moonId || null,
        designation: text(lifeform.designation, fallbackDesignation),
        name: text(lifeform.name, text(lifeform.designation, fallbackDesignation)),
        species_name: text(lifeform.species_name, genus && species ? `${genus} ${species}` : species),
        kingdom: text(lifeform.kingdom),
        phylum: text(lifeform.phylum),
        class_name: text(lifeform.class),
        taxonomic_order: text(lifeform.order),
        family: text(lifeform.family),
        genus,
        species,
        habitat: text(lifeform.habitat, text(lifeform.biome)),
        biome: text(lifeform.biome),
        body_type: text(lifeform.bodyType),
        scale: lifeform.sizeM === undefined || lifeform.sizeM === null ? null : `${lifeform.sizeM} m`,
        size_m: numberOrNull(lifeform.sizeM),
        diet: text(lifeform.diet),
        locomotion: text(lifeform.locomotion),
        skin_color: text(lifeform.skinColor),
        reproduction: text(lifeform.reproductiveMethod),
        reproductive_method: text(lifeform.reproductiveMethod),
        sensory: text(lifeform.sensoryType),
        thermal_regulation: text(lifeform.thermalRegulation),
        description: text(lifeform.description),
      };
    });

    const { data: insertedLifeforms, error: insertError } = rows.length
      ? await supabase.from("stellar_lifeforms").insert(rows).select("*")
      : { data: [], error: null };
    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from(planetId ? "stellar_planets" : "stellar_moons")
      .update({
        lifeform_count: (existingLifeforms?.length || 0) + (insertedLifeforms?.length || 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", appUserId);
    if (updateError) throw updateError;

    return jsonResponse({
      inserted: insertedLifeforms?.length || 0,
      existing: existingLifeforms?.length || 0,
      lifeforms: insertedLifeforms || [],
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate lifeforms."), 500);
  }
});
