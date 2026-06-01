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

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

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

function likelyMoonCount(planet: Record<string, unknown>) {
  const type = String(planet.type || "").toLowerCase();
  const mass = Number(planet.mass_earth || 0);
  if (type.includes("asteroid")) return 0;
  if (type.includes("gas") || type.includes("jovian")) return Math.floor(4 + Math.random() * 8);
  if (mass > 3) return Math.floor(1 + Math.random() * 4);
  if (mass > 0.2) return Math.floor(Math.random() * 3);
  return 0;
}

function buildPrompt(planet: Record<string, unknown>, moonCount: number) {
  return [
    "Generate scientifically plausible moons as strict JSON.",
    "Return exactly one JSON object with key moons.",
    `Planet designation: ${planet.designation || planet.name}.`,
    `Planet type: ${planet.type || "Unknown"}.`,
    `Planet mass Earth: ${planet.mass_earth || "unknown"}.`,
    `Planet orbital distance AU: ${planet.orbital_distance_au || "unknown"}.`,
    `Generate ${moonCount} moons. If zero, return {\"moons\":[]}.`,
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
        visual_appearance: "Concise description.",
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
    const body = await req.json();
    const planetId = text(body.planetId);
    if (!planetId) {
      return jsonResponse({ error: "planetId is required." }, 400);
    }

    const supabase = createAdminClient();
    const { data: planet, error: planetError } = await supabase
      .from("stellar_planets")
      .select("*")
      .eq("id", planetId)
      .eq("user_id", appUserId)
      .maybeSingle();
    if (planetError) throw planetError;
    if (!planet) return jsonResponse({ error: "Planet was not found." }, 404);

    const moonCount = clampInt(body.moonCount, 0, 12, likelyMoonCount(planet));
    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You create scientifically plausible moon data for a fictional star-system builder. Respond only with valid JSON.",
      prompt: buildPrompt(planet, moonCount),
    });

    const generated = parseJson(generatedText || "{}");
    const moons = Array.isArray(generated.moons) ? generated.moons.slice(0, moonCount) : [];

    const { error: deleteError } = await supabase
      .from("stellar_moons")
      .delete()
      .eq("planet_id", planet.id)
      .eq("user_id", appUserId);
    if (deleteError) throw deleteError;

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

    let insertedMoons: unknown[] = [];
    if (moonRows.length) {
      const { data, error } = await supabase
        .from("stellar_moons")
        .insert(moonRows)
        .select("*");
      if (error) throw error;
      insertedMoons = data || [];
    }

    const { error: updateError } = await supabase
      .from("stellar_planets")
      .update({ moon_count: insertedMoons.length, updated_at: new Date().toISOString() })
      .eq("id", planet.id)
      .eq("user_id", appUserId);
    if (updateError) throw updateError;

    return jsonResponse({ planetId: planet.id, moons: insertedMoons });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate moons."), 500);
  }
});
