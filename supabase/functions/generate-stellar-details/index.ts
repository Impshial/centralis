import OpenAI from "npm:openai@^6.1.0";
import {
  createAdminClient,
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

function text(value: unknown, fallback: string | null = null) {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function intOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function isAsteroidBelt(planet: Record<string, unknown>) {
  return String(planet.type || "").toLowerCase().includes("asteroid");
}

function parseJson(textValue: string) {
  try {
    return JSON.parse(textValue);
  } catch (_error) {
    const start = textValue.indexOf("{");
    const end = textValue.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(textValue.slice(start, end + 1));
    }
    throw new Error("OpenAI did not return valid JSON.");
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

function buildMoonsPrompt(planet: Record<string, unknown>, star: Record<string, unknown> | null, moonCount: number) {
  return [
    "Generate scientifically accurate moon data as strict JSON.",
    "Return exactly one JSON object with key moons.",
    `Planet designation: ${planet.designation || planet.name}.`,
    `Planet type: ${planet.type || "Unknown"}.`,
    `Planet mass Earth: ${planet.mass_earth || "unknown"}.`,
    `Planet radius Earth: ${planet.radius_earth || "unknown"}.`,
    `Planet orbital distance AU: ${planet.orbital_distance_au || "unknown"}.`,
    `Planet surface temperature K: ${planet.surface_temperature_k || "unknown"}.`,
    `Star spectral type: ${star?.spectral_type || "unknown"}.`,
    `Generate exactly ${moonCount} moons.`,
    "Use diverse plausible moon types, such as captured asteroids, rocky moons, icy moons, volcanic moons, and ocean moons when appropriate.",
    "Use catalog designations like '<planet designation>-I', '<planet designation>-II'.",
    "No markdown, no comments, no prose outside JSON.",
    "JSON shape:",
    JSON.stringify({
      moons: [{
        name: `${planet.designation || "Planet"}-I`,
        type: "Icy Moon",
        mass_lunar: 0.2,
        radius_lunar: 0.4,
        density_g_cm3: 2.1,
        orbital_distance_km: 180000,
        orbital_period_days: 8.4,
        rotation_period_days: 8.4,
        surface_temperature_k: 120,
        atmosphere: "None (vacuum)",
        water_presence: "Subsurface ice",
        geological_activity: "Low",
        magnetosphere: "None",
        habitability: "Potential subsurface microbial niche",
        lifeform_count: 0,
        visual_appearance: "Concise visual description.",
        description: "One concise paragraph.",
      }],
    }),
  ].join("\n");
}

function buildLifeformsPrompt(body: Record<string, unknown>) {
  return [
    "Generate 3 scientifically plausible alien lifeforms for this planet as strict JSON.",
    `- Name: ${body.designation || body.name || "Unknown"}`,
    `- Type: ${body.type || "Unknown"}`,
    `- Surface temperature: ${body.surface_temperature_k || "Unknown"} K`,
    `- Atmosphere: ${body.atmosphere || "None"}`,
    `- Water presence: ${body.water_presence || "None"}`,
    `- Gravity: ${body.gravity_ms2 || "Unknown"} m/s2`,
    "Create diverse lifeforms adapted to these conditions.",
    "Use full taxonomic style classification from kingdom to species.",
    "Use species as a Latin-style epithet prefixed with D-.",
    "Use biome values from: Ocean, Atmosphere, Underground, Surface, Ice, Volcanic.",
    "Use locomotion values from: Swimming, Flying, Gliding, Crawling, Burrowing, Sessile.",
    "Use diet values from: Photosynthetic, Chemosynthetic, Herbivore, Carnivore, Filter Feeder, Decomposer.",
    "Use reproductiveMethod values from: Binary Fission, Budding, Spores, Egg Laying, Live Birth, Broadcast Spawning.",
    "Use thermalRegulation as Ectothermic or Endothermic.",
    "No markdown, no comments, no prose outside JSON.",
    "JSON shape:",
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

async function generateJson(openai: OpenAI, system: string, prompt: string, temperature = 0.4) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });
  return parseJson(completion.choices[0]?.message?.content || "{}");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const appUserId = await getAppUserId(req);
    const body = await req.json().catch(() => ({}));
    const systemId = text(body.systemId);
    if (!systemId) return jsonResponse({ error: "systemId is required." }, 400);

    const supabase = createAdminClient();
    const { data: system, error: systemError } = await supabase
      .from("stellar_systems")
      .select("*")
      .eq("id", systemId)
      .eq("user_id", appUserId)
      .maybeSingle();
    if (systemError) throw systemError;
    if (!system) return jsonResponse({ error: "Star system was not found." }, 404);

    const [{ data: star, error: starError }, { data: planets, error: planetsError }] = await Promise.all([
      supabase
        .from("stellar_stars")
        .select("*")
        .eq("system_id", system.id)
        .eq("user_id", appUserId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("stellar_planets")
        .select("*")
        .eq("system_id", system.id)
        .eq("user_id", appUserId)
        .order("planet_number", { ascending: true }),
    ]);
    if (starError) throw starError;
    if (planetsError) throw planetsError;

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    let moonsInserted = 0;
    let lifeformsInserted = 0;
    let planetsSkipped = 0;

    for (const planet of planets || []) {
      if (isAsteroidBelt(planet)) {
        planetsSkipped += 1;
        continue;
      }

      const planetMoonCount = clampInt(planet.moon_count, 0, 20, 0);
      if (planetMoonCount > 0) {
        const { count, error: countError } = await supabase
          .from("stellar_moons")
          .select("id", { count: "exact", head: true })
          .eq("planet_id", planet.id)
          .eq("user_id", appUserId);
        if (countError) throw countError;

        if (!count) {
          const generated = await generateJson(
            openai,
            "You are an expert planetary scientist generating scientifically accurate moon data. Respond with valid JSON only.",
            buildMoonsPrompt(planet, star, planetMoonCount),
          );
          const moons = Array.isArray(generated.moons) ? generated.moons.slice(0, planetMoonCount) : [];
          const moonRows = moons.map((moon: Record<string, unknown>, index: number) => {
            const designation = `${planet.designation || planet.name}-${ROMAN[index] || index + 1}`;
            return {
              user_id: appUserId,
              system_id: planet.system_id,
              planet_id: planet.id,
              name: text(moon.name, designation),
              designation,
              moon_number: index + 1,
              type: text(moon.type, "Moon"),
              mass_lunar: numberOrNull(moon.mass_lunar),
              radius_lunar: numberOrNull(moon.radius_lunar),
              density_g_cm3: numberOrNull(moon.density_g_cm3),
              orbital_distance_km: numberOrNull(moon.orbital_distance_km),
              orbital_period_days: numberOrNull(moon.orbital_period_days),
              rotation_period_days: numberOrNull(moon.rotation_period_days),
              surface_temperature_k: intOrNull(moon.surface_temperature_k),
              atmosphere: text(moon.atmosphere),
              water_presence: text(moon.water_presence),
              geological_activity: text(moon.geological_activity),
              magnetosphere: text(moon.magnetosphere),
              habitability: text(moon.habitability),
              lifeform_count: clampInt(moon.lifeform_count, 0, 50, 0),
              visual_appearance: text(moon.visual_appearance),
              description: text(moon.description),
            };
          });
          if (moonRows.length) {
            const { data, error } = await supabase.from("stellar_moons").insert(moonRows).select("id");
            if (error) throw error;
            moonsInserted += data?.length || 0;
          }
        }
      }

      if (planet.habitability === "Potentially Habitable") {
        const { count, error: countError } = await supabase
          .from("stellar_lifeforms")
          .select("id", { count: "exact", head: true })
          .eq("planet_id", planet.id)
          .eq("user_id", appUserId);
        if (countError) throw countError;

        if (!count) {
          const generated = await generateJson(
            openai,
            "You are an expert astrobiologist generating scientifically plausible alien lifeforms. Respond with valid JSON only.",
            buildLifeformsPrompt(planet),
            0.9,
          );
          const lifeforms = Array.isArray(generated.lifeforms) ? generated.lifeforms.slice(0, 3) : [];
          const lifeformRows = lifeforms.map((lifeform: Record<string, unknown>, index: number) => {
            const fallbackDesignation = `GQ9-${planet.designation || planet.name}-${String(index + 1).padStart(3, "0")}`;
            const genus = text(lifeform.genus);
            const species = text(lifeform.species);
            return {
              user_id: appUserId,
              system_id: planet.system_id,
              planet_id: planet.id,
              moon_id: null,
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
          if (lifeformRows.length) {
            const { data, error } = await supabase.from("stellar_lifeforms").insert(lifeformRows).select("id");
            if (error) throw error;
            lifeformsInserted += data?.length || 0;
            const { error: updateError } = await supabase
              .from("stellar_planets")
              .update({ lifeform_count: data?.length || 0, updated_at: new Date().toISOString() })
              .eq("id", planet.id)
              .eq("user_id", appUserId);
            if (updateError) throw updateError;
          }
        }
      }
    }

    return jsonResponse({
      systemId: system.id,
      moonsInserted,
      lifeformsInserted,
      planetsSkipped,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate planetary details."), 500);
  }
});
