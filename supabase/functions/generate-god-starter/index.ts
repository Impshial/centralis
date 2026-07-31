import OpenAI from "npm:openai@^6.1.0";
import { generateJsonText } from "../_shared/openai-config.ts";
import {
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
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

function asArray(value: unknown, limit = 12) {
  return (Array.isArray(value) ? value : [])
    .map((item) => typeof item === "string" ? item.trim() : item)
    .filter(Boolean)
    .slice(0, limit);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanStarter(payload: unknown, starterKind: string) {
  const record = asRecord(payload);
  const status = cleanText(record.status, 40).toLowerCase() || "stable";
  const allowedStatuses = new Set(["thriving", "stable", "specialized", "vulnerable", "declining", "endangered", "unstable", "extinct"]);
  return {
    name: cleanText(record.name, 180) || (starterKind === "single_cell" ? "First Cell" : "First Organism"),
    scientific_name: cleanText(record.scientific_name || record.scientificName, 180),
    classification: cleanText(record.classification, 180),
    category: cleanText(record.category, 120) || (starterKind === "single_cell" ? "Single-celled organism" : "Simple multicellular organism"),
    status: allowedStatuses.has(status) && status !== "extinct" ? status : "stable",
    can_evolve: true,
    overview: cleanText(record.overview, 2400),
    habitat: cleanText(record.habitat, 400),
    ecology: asRecord(record.ecology),
    reproduction: asRecord(record.reproduction),
    population_condition: asRecord(record.population_condition || record.populationCondition),
    newly_evolved_traits: asArray(record.newly_evolved_traits || record.newlyEvolvedTraits, 4),
    complete_traits: asRecord(record.complete_traits || record.completeTraits),
    inherited_traits: asArray(record.inherited_traits || record.inheritedTraits, 12),
    lost_traits: asArray(record.lost_traits || record.lostTraits, 8),
    potential_trait_hints: asArray(record.potential_trait_hints || record.potentialTraitHints, 8),
    pressures: asArray(record.pressures, 8),
    visual_genome: asRecord(record.visual_genome || record.visualGenome),
    image_prompt: cleanText(record.image_prompt || record.imagePrompt, 2000),
    evolution_reason: cleanText(record.evolution_reason || record.evolutionReason, 1000),
  };
}

function cleanProjectName(payload: unknown, speciesName: string, providedName: string) {
  const record = asRecord(payload);
  return cleanText(record.project_name || record.projectName, 180)
    || providedName
    || `${speciesName || "First Species"} Lineage`;
}

function creatureNamingRules() {
  return [
    "CREATURE NAMING RULES",
    "Give the original creature a natural-sounding biological name. The name should feel like something that emerged through ordinary language, taxonomy, regional usage, or historical convention. A name is a label, not a compressed description of every visible trait.",
    "Do not default to fantasy-style names formed by combining two descriptive nouns followed by an ecological role, such as Glassfrill Creeper, Reefveil Grazer, Siltmantle Lurker, Rootglass Walker, or similar constructions.",
    "Before generating the name, internally choose one naming style: single-word common name; simple common name using one modifier and one ordinary zoological noun; habitat/geographic/historical/folkloric name; resemblance/color/texture/local-usage name; Latinized fictional scientific binomial; or common name paired with a scientific binomial.",
    "Naming-style distribution target: 25% single-word common names, 30% simple two-word common names, 15% habitat/geographic/historical/folkloric names, 10% coined but pronounceable names, and 20% scientific binomials or common-name/binomial combinations.",
    "Prefer familiar, understated names over dramatic or poetic ones. Do not invent unnecessary words such as veil, glass, shadow, root, mantle, or gill merely to make a name sound exotic.",
    "Avoid occupational or behavioral endings such as Creeper, Walker, Grazer, Lurker, Drifter, Sifter, Clasper, Settler, Hunter, or Stalker unless they are the most natural plain-language name.",
    "If using a common name plus binomial, put the common name in name and the binomial in scientific_name. If using a scientific name alone, put the binomial in both name and scientific_name.",
    "The name field must contain only the selected display name, not an explanation of the naming style.",
  ].join("\n");
}

function buildPrompt(input: {
  projectName: string;
  description: string;
  worldSummary: string;
  startingMode: string;
  starterKind: string;
  habitat: string;
  manualNotes: string;
}) {
  const isManual = input.startingMode === "manual" || Boolean(input.manualNotes);
  return [
    "Create the first species for God Engine, a Centralis evolutionary tree module.",
    "Return exactly one JSON object with keys: project_name, name, scientific_name, classification, category, status, overview, habitat, ecology, reproduction, population_condition, newly_evolved_traits, complete_traits, inherited_traits, lost_traits, potential_trait_hints, pressures, visual_genome, image_prompt, evolution_reason.",
    isManual
      ? "Manual starter mode: the user is defining an already-existing organism at any point in its evolutionary timeline. Preserve the user's anatomy, habitat, reproduction, respiration, body covering, limb count, complexity, and implied evolutionary age as authoritative constraints. Do not simplify it into a primitive aquatic cell, larva, grazer, or early ancestor unless the user explicitly asks for that."
      : "The species is the root of a future evolutionary tree. It may be simple, early, and evolvable, but it still needs a distinctive body plan.",
    "If the user describes an organism that has already evolved for millions of years, lives on land, breathes oxygen, lays eggs, has fur, has legs, or has other advanced traits, create exactly that kind of organism as the starter species.",
    "Do not make it extinct. Do not include game stats, currency, levels, points, UI labels, markdown, comments, or extra prose.",
    "Potential trait hints should be broad biological directions, not exact future outcomes.",
    "The visual_genome must describe inherited visual continuity: bodyPlan, symmetry, surface, appendages, coloration, sensoryFeatures, and scale.",
    creatureNamingRules(),
    input.projectName
      ? `User-provided project name: ${input.projectName}`
      : "No project name was provided. Create an evocative concise project_name for this evolutionary tree.",
    input.description ? `Project description: ${input.description}` : "No project description.",
    input.worldSummary ? `World or planet: ${input.worldSummary}` : "No world summary.",
    `Starting mode: ${input.startingMode || "instant"}.`,
    `Starting organism type: ${input.starterKind}.`,
    input.habitat ? `Starting habitat preference: ${input.habitat}` : "Starting habitat can be chosen by the engine.",
    input.manualNotes ? `Manual starter notes to preserve: ${input.manualNotes}` : "No manual starter notes.",
  ].join("\n\n");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const starterKind = cleanText(body.starterKind, 60) || "random";
    const prompt = buildPrompt({
      projectName: cleanText(body.projectName, 180),
      description: cleanText(body.description, 2000),
      worldSummary: cleanText(body.worldSummary, 2000),
      startingMode: cleanText(body.startingMode, 60),
      starterKind,
      habitat: cleanText(body.habitat, 120),
      manualNotes: cleanText(body.manualNotes, 3000),
    });

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You generate strict JSON for biologically plausible fictional starter organisms. Return only valid JSON.",
      prompt,
      maxOutputTokens: 2200,
    });

    const parsed = parseJson(generatedText || "{}");
    const species = cleanStarter(parsed, starterKind);
    return jsonResponse({
      projectName: cleanProjectName(parsed, species.name, cleanText(body.projectName, 180)),
      species,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate starter species."), 500);
  }
});
