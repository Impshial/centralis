import OpenAI from "npm:openai@^6.1.0";
import {
  createAdminClient,
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

type GeneratedPlanet = {
  name?: string;
  type?: string;
  habitability?: string;
  mass_earth?: number | null;
  radius_earth?: number | null;
  density_g_cm3?: number | null;
  gravity_ms2?: number | null;
  orbital_distance_au?: number | null;
  orbital_period_days?: number | null;
  rotation_period_hours?: number | null;
  escape_velocity_kms?: number | null;
  day_length_hours?: number | null;
  surface_temperature_k?: number | null;
  atmosphere?: string | null;
  water_presence?: string | null;
  magnetosphere?: string | null;
  climate?: string | null;
  orbital_eccentricity?: number | null;
  axial_tilt_degrees?: number | null;
  rings?: boolean;
  moon_count?: number;
  visual_appearance?: string | null;
  description?: string | null;
};

const PLANET_LETTERS = "bcdefghijklmnopqrstuvwxyz".split("");
const SYSTEM_PREFIXES = ["SU", "VJ", "KN", "ZN", "AR", "CY", "LX", "OR"];

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

function isAsteroidBelt(planet: GeneratedPlanet) {
  return String(planet.type || "").toLowerCase().includes("asteroid");
}

function normalizeHabitability(planet: GeneratedPlanet) {
  if (isAsteroidBelt(planet)) return "Not-applicable";
  const type = String(planet.type || "").toLowerCase();
  if (type.includes("gas") || type.includes("jovian")) return "Gas Giant";

  const raw = text(planet.habitability);
  const normalized = String(raw || "").toLowerCase();
  if (raw && !["non-applicable", "not applicable", "n/a", "unknown"].includes(normalized)) {
    return raw;
  }

  const temp = Number(planet.surface_temperature_k);
  if (Number.isFinite(temp)) {
    if (temp > 320) return "Too Hot";
    if (temp < 240) return "Too Cold";
  }
  if (!text(planet.atmosphere) || String(planet.atmosphere || "").toLowerCase().includes("none")) {
    return "No Atmosphere";
  }
  return "Not Habitable";
}

function createSystemCode() {
  const prefix = SYSTEM_PREFIXES[Math.floor(Math.random() * SYSTEM_PREFIXES.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${prefix}-${digits}${letter}`;
}

function planetCountFromPreference(preference: unknown) {
  const textValue = String(preference || "").trim();
  if (!textValue || textValue === "random") {
    return Math.floor(1 + Math.random() * 12);
  }
  if (textValue === "few") {
    return Math.floor(1 + Math.random() * 4);
  }
  if (textValue === "moderate") {
    return Math.floor(3 + Math.random() * 5);
  }
  if (textValue === "many") {
    return Math.floor(6 + Math.random() * 7);
  }
  return clampInt(textValue, 1, 12, 6);
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

function buildPrompt(options: { systemCode: string; starType: string; planetCount: number }) {
  return [
    "Generate a scientifically plausible fictional star system as strict JSON.",
    "Return exactly one JSON object with keys: system, star, planets.",
    `System catalog code: ${options.systemCode}.`,
    `Star type preference: ${options.starType || "realistic random main sequence"}.`,
    `Create ${options.planetCount} orbiting bodies. Include asteroid belts as planets with type \"Asteroid Belt\" when plausible.`,
    "Use catalog designations for planet names like '<system code> b', '<system code> c'.",
    "Keep values plausible for the star spectral type and orbital distance.",
    "Determine moon_count now for each planet based on its type, mass, and orbit. Asteroid belts must have moon_count 0.",
    "This moon_count is the exact intended moon total later used by the Generate Details action.",
    "For habitability, use one of: Potentially Habitable, Too Hot, Too Cold, Gas Giant, No Atmosphere, Not Habitable, Not-applicable.",
    "Use Gas Giant for gas giants. Use Not-applicable only for asteroid belts. Do not use Non-applicable.",
    "No markdown, no comments, no prose outside JSON.",
    "JSON shape:",
    JSON.stringify({
      system: {
        description: "One concise paragraph.",
        age_gyr: 5,
        galactic_position: "Short fictional position.",
      },
      star: {
        spectral_type: "G2V",
        stellar_class: "Main Sequence",
        mass_solar: 1,
        radius_solar: 1,
        luminosity_solar: 1,
        temperature_k: 5778,
        metallicity_feh: 0,
        rotational_velocity_kms: 2,
        magnetic_activity: "Moderate",
        age_gyr: 5,
        evolutionary_stage: "Main Sequence",
        habitable_zone_inner_au: 0.95,
        habitable_zone_outer_au: 1.4,
        description: "Short visual/physical summary.",
      },
      planets: [{
        name: `${options.systemCode} b`,
        type: "Rocky Terrestrial",
        habitability: "Too Hot",
        mass_earth: 0.7,
        radius_earth: 0.9,
        density_g_cm3: 5.1,
        gravity_ms2: 8.2,
        orbital_distance_au: 0.4,
        orbital_period_days: 90,
        rotation_period_hours: 26,
        escape_velocity_kms: 10,
        day_length_hours: 26,
        surface_temperature_k: 450,
        atmosphere: "Thin carbon dioxide",
        water_presence: "None",
        magnetosphere: "Weak",
        climate: "Arid volcanic",
        orbital_eccentricity: 0.04,
        axial_tilt_degrees: 17,
        rings: false,
        moon_count: 0,
        visual_appearance: "Short image-free visual description.",
        description: "One concise paragraph.",
      }],
    }),
  ].join("\n");
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const appUserId = await getAppUserId(req);
    const body = await req.json().catch(() => ({}));
    const systemCode = createSystemCode();
    const planetCount = planetCountFromPreference(body.planetCount);
    const starType = text(body.starType, "Random realistic main sequence") || "Random realistic main sequence";
    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You create scientifically plausible fictional star systems for a worldbuilding app. Respond only with valid JSON.",
        },
        { role: "user", content: buildPrompt({ systemCode, starType, planetCount }) },
      ],
    });

    const generated = parseJson(completion.choices[0]?.message?.content || "{}");
    const supabase = createAdminClient();

    const planets = Array.isArray(generated.planets) ? generated.planets.slice(0, planetCount) as GeneratedPlanet[] : [];
    if (!planets.length) {
      planets.push({
        name: `${systemCode} b`,
        type: "Rocky Terrestrial",
        habitability: "Unknown",
        description: "A generated terrestrial world awaiting further detail.",
      });
    }
    const asteroidBeltCount = planets.filter(isAsteroidBelt).length;
    const star = generated.star || {};
    const system = generated.system || {};
    const systemAge = numberOrNull(system.age_gyr) ?? numberOrNull(star.age_gyr);

    const { data: systemRow, error: systemError } = await supabase
      .from("stellar_systems")
      .insert({
        user_id: appUserId,
        name: systemCode,
        catalog_code: systemCode,
        description: text(system.description),
        star_count: 1,
        planet_count: planets.length - asteroidBeltCount,
        asteroid_belt_count: asteroidBeltCount,
        age_gyr: systemAge,
        galactic_position: text(system.galactic_position),
      })
      .select("*")
      .single();
    if (systemError) throw systemError;

    const { data: starRow, error: starError } = await supabase
      .from("stellar_stars")
      .insert({
        user_id: appUserId,
        system_id: systemRow.id,
        name: systemCode,
        designation: `${systemCode} Primary`,
        spectral_type: text(star.spectral_type, "G2V"),
        stellar_class: text(star.stellar_class, "Main Sequence"),
        mass_solar: numberOrNull(star.mass_solar),
        radius_solar: numberOrNull(star.radius_solar),
        luminosity_solar: numberOrNull(star.luminosity_solar),
        temperature_k: intOrNull(star.temperature_k),
        metallicity_feh: numberOrNull(star.metallicity_feh),
        rotational_velocity_kms: numberOrNull(star.rotational_velocity_kms),
        magnetic_activity: text(star.magnetic_activity),
        age_gyr: numberOrNull(star.age_gyr) ?? systemAge,
        evolutionary_stage: text(star.evolutionary_stage, "Main Sequence"),
        habitable_zone_inner_au: numberOrNull(star.habitable_zone_inner_au),
        habitable_zone_outer_au: numberOrNull(star.habitable_zone_outer_au),
        description: text(star.description),
      })
      .select("*")
      .single();
    if (starError) throw starError;

    const planetRows = planets.map((planet, index) => {
      const designation = `${systemCode} ${PLANET_LETTERS[index] || index + 1}`;
      return {
        user_id: appUserId,
        system_id: systemRow.id,
        star_id: starRow.id,
        name: text(planet.name, designation),
        designation,
        planet_number: index + 1,
        type: text(planet.type, "Rocky Terrestrial"),
        habitability: normalizeHabitability(planet),
        mass_earth: numberOrNull(planet.mass_earth),
        radius_earth: numberOrNull(planet.radius_earth),
        density_g_cm3: numberOrNull(planet.density_g_cm3),
        gravity_ms2: numberOrNull(planet.gravity_ms2),
        orbital_distance_au: numberOrNull(planet.orbital_distance_au),
        orbital_period_days: numberOrNull(planet.orbital_period_days),
        rotation_period_hours: numberOrNull(planet.rotation_period_hours),
        escape_velocity_kms: numberOrNull(planet.escape_velocity_kms),
        day_length_hours: numberOrNull(planet.day_length_hours),
        surface_temperature_k: intOrNull(planet.surface_temperature_k),
        atmosphere: text(planet.atmosphere),
        water_presence: text(planet.water_presence),
        magnetosphere: text(planet.magnetosphere),
        climate: text(planet.climate),
        orbital_eccentricity: numberOrNull(planet.orbital_eccentricity),
        axial_tilt_degrees: numberOrNull(planet.axial_tilt_degrees),
        rings: Boolean(planet.rings),
        moon_count: clampInt(planet.moon_count, 0, 20, 0),
        visual_appearance: text(planet.visual_appearance),
        description: text(planet.description),
      };
    });

    const { data: insertedPlanets, error: planetsError } = await supabase
      .from("stellar_planets")
      .insert(planetRows)
      .select("*");
    if (planetsError) throw planetsError;

    return jsonResponse({ system: systemRow, star: starRow, planets: insertedPlanets || [] });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate stellar system."), 500);
  }
});
