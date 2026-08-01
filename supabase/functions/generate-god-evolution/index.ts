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
import { getImageGenerationUser } from "../_shared/image-generation.ts";
import { createGenerationJob, updateGenerationJob } from "../_shared/generation-jobs.ts";

const STATUSES = new Set(["thriving", "stable", "specialized", "vulnerable", "declining", "endangered", "unstable", "extinct"]);

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseJson(textValue: string) {
  try {
    return JSON.parse(textValue);
  } catch (error) {
    const start = textValue.indexOf("{");
    const end = textValue.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(textValue.slice(start, end + 1));
      } catch (_sliceError) {
        throw error;
      }
    }
    throw error;
  }
}

async function parseJsonWithRepair(openai: OpenAI, textValue: string, originalError: unknown) {
  try {
    return parseJson(textValue);
  } catch (_error) {
    const repairedText = await generateJsonText(openai, {
      system: "You repair malformed JSON. Return only one valid JSON object. Do not add markdown or explanation.",
      prompt: [
        "Repair this malformed God Engine evolution JSON so it parses cleanly.",
        "Preserve the same object shape and as much data as possible.",
        "If the JSON is truncated, close incomplete strings/arrays/objects and keep only complete species records.",
        `Parser error: ${originalError instanceof Error ? originalError.message : String(originalError || "Invalid JSON")}`,
        "Malformed JSON:",
        textValue.slice(0, 60000),
      ].join("\n\n"),
      maxOutputTokens: 12000,
    });
    return parseJson(repairedText || "{}");
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown, limit = 20) {
  return (Array.isArray(value) ? value : [])
    .map((item) => typeof item === "string" ? item.trim() : item)
    .filter(Boolean)
    .slice(0, limit);
}

function cleanInt(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Math.round(Number(value));
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function cleanStepYears(value: unknown, totalSteps: number) {
  const rows = Array.isArray(value) ? value : [];
  return Array.from({ length: totalSteps }, (_, index) => cleanInt(rows[index], 1000000, 1000000, 5000000));
}

function cleanTempId(value: unknown, fallback: string) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || fallback;
}

function createId() {
  return crypto.randomUUID();
}

function normalizeStatus(value: unknown) {
  const status = cleanText(value, 40).toLowerCase().replace(/\s+/g, "_");
  return STATUSES.has(status) ? status : "stable";
}

function normalizeNameKey(value: unknown) {
  return cleanText(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nameLooksBroken(value: unknown) {
  const name = cleanText(value, 180);
  return !name
    || /^\[object object\]$/i.test(name)
    || /^descendant\s+\d+$/i.test(name)
    || /^unnamed\s+species$/i.test(name)
    || /^new\s+species$/i.test(name);
}

const FALLBACK_DISPLAY_NAMES = [
  "Velucris auralis",
  "Neritha vespera",
  "Mirexa lucens",
  "Orryma littoralis",
  "Salicor opalina",
  "Dorsava marina",
  "Pelagran noctis",
  "Vespria limnalis",
  "Calthera brumae",
  "Rillora tenebris",
  "Mucyra silens",
  "Auralith minor",
  "Fenestris alba",
  "Cyrtella viridis",
  "Nacreon velaris",
  "Umbrellis lenta",
  "Tethyra glacis",
  "Molluvera radians",
  "Lucivaga profunda",
  "Ephyrella cineris",
];

function collectNameKeys(values: unknown[]) {
  const keys = new Set<string>();
  for (const value of values) {
    const row = asRecord(value);
    for (const candidate of [row.name, row.scientific_name, row.scientificName]) {
      const key = normalizeNameKey(candidate);
      if (key) keys.add(key);
    }
  }
  return keys;
}

function fallbackName(index: number, usedNames: Set<string>) {
  for (let offset = 0; offset < FALLBACK_DISPLAY_NAMES.length; offset += 1) {
    const candidate = FALLBACK_DISPLAY_NAMES[(index + offset) % FALLBACK_DISPLAY_NAMES.length];
    if (!usedNames.has(normalizeNameKey(candidate))) return candidate;
  }
  return `Novasoma ${index + 1}`;
}

function enforceUniqueNames(species: ReturnType<typeof cleanSpecies>[], existingSpecies: unknown[]) {
  const usedNames = collectNameKeys(existingSpecies);
  return species.map((item, index) => {
    const currentKey = normalizeNameKey(item.name);
    if (nameLooksBroken(item.name) || usedNames.has(currentKey)) {
      const scientificKey = normalizeNameKey(item.scientific_name);
      if (!nameLooksBroken(item.scientific_name) && !usedNames.has(scientificKey)) {
        item.name = item.scientific_name;
      } else {
        item.name = fallbackName(index, usedNames);
      }
    }
    const finalKey = normalizeNameKey(item.name);
    if (finalKey) usedNames.add(finalKey);
    if (!item.scientific_name) item.scientific_name = item.name;
    return item;
  });
}

function cleanSpecies(value: unknown, index: number, totalSteps: number, stepYears: number[]) {
  const row = asRecord(value);
  const status = normalizeStatus(row.status);
  const stepIndex = cleanInt(row.step_index ?? row.stepIndex, Math.min(totalSteps, index + 1), 1, totalSteps);
  const parentTempId = cleanText(row.parent_temp_id || row.parentTempId, 100);
  const yearsSinceParent = cleanInt(row.years_since_parent || row.yearsSinceParent, stepYears[Math.max(0, stepIndex - 1)] || 1000000, 1000000, 5000000);
  return {
    temp_id: cleanTempId(row.temp_id || row.tempId || row.id, `descendant-${index + 1}`),
    parent_temp_id: parentTempId || null,
    branch_group: cleanText(row.branch_group || row.branchGroup, 80) || "main",
    name: cleanText(row.name, 180) || `Descendant ${index + 1}`,
    scientific_name: cleanText(row.scientific_name || row.scientificName, 180),
    classification: cleanText(row.classification, 180),
    category: cleanText(row.category, 120),
    status,
    can_evolve: status !== "extinct" && row.can_evolve !== false && row.canEvolve !== false,
    step_index: stepIndex,
    depth_index: stepIndex,
    years_since_parent: yearsSinceParent,
    elapsed_years: stepYears.slice(0, stepIndex).reduce((sum, years) => sum + years, 0),
    sort_order: cleanInt(row.sort_order ?? row.sortOrder, index, 0, 999),
    overview: cleanText(row.overview, 2400),
    habitat: cleanText(row.habitat, 400),
    ecology: asRecord(row.ecology),
    reproduction: asRecord(row.reproduction),
    population_condition: asRecord(row.population_condition || row.populationCondition),
    newly_evolved_traits: asArray(row.newly_evolved_traits || row.newlyEvolvedTraits, 4),
    complete_traits: asRecord(row.complete_traits || row.completeTraits),
    inherited_traits: asArray(row.inherited_traits || row.inheritedTraits, 16),
    lost_traits: asArray(row.lost_traits || row.lostTraits, 10),
    potential_trait_hints: asArray(row.potential_trait_hints || row.potentialTraitHints, 8),
    pressures: asArray(row.pressures, 10),
    visual_genome: asRecord(row.visual_genome || row.visualGenome),
    image_prompt: cleanText(row.image_prompt || row.imagePrompt, 2000),
    extinction_cause: cleanText(row.extinction_cause || row.extinctionCause, 1000),
    evolution_reason: cleanText(row.evolution_reason || row.evolutionReason, 1000),
  };
}

function normalizeTimeline(species: ReturnType<typeof cleanSpecies>[], totalSteps: number, stepYears: number[]) {
  const byId = new Map(species.map((item) => [item.temp_id, item]));
  for (const item of species) {
    if (item.step_index < 1) item.step_index = 1;
    if (item.step_index > totalSteps) item.step_index = totalSteps;
    item.depth_index = item.step_index;
    item.years_since_parent = stepYears[Math.max(0, item.step_index - 1)] || item.years_since_parent;
    item.elapsed_years = stepYears.slice(0, item.step_index).reduce((sum, years) => sum + years, 0);
  }
  return species.filter((item) => !item.parent_temp_id || byId.has(item.parent_temp_id));
}

function cleanPayload(payload: unknown, branchOnly = false, existingSpecies: unknown[] = []) {
  const record = asRecord(payload);
  const totalSteps = branchOnly ? 1 : cleanInt(record.total_steps || record.totalSteps, 3, 2, 5);
  const stepYears = cleanStepYears(record.step_years || record.stepYears, totalSteps);
  const species = enforceUniqueNames((Array.isArray(record.species) ? record.species : [])
    .map((item, index) => cleanSpecies(item, index, totalSteps, stepYears))
    .filter((item) => item.name)
    .slice(0, branchOnly ? 2 : 18)
    .map((item) => branchOnly ? {
      ...item,
      parent_temp_id: null,
      step_index: 1,
      depth_index: 1,
      years_since_parent: stepYears[0],
      elapsed_years: stepYears[0],
    } : item), existingSpecies);
  return {
    total_steps: totalSteps,
    step_years: stepYears,
    total_years: stepYears.reduce((sum, years) => sum + years, 0),
    summary: cleanText(record.summary, 1800),
    environment_shift: asRecord(record.environment_shift || record.environmentShift),
    species: normalizeTimeline(species, totalSteps, stepYears),
  };
}

function creatureNamingRules(parentSpecies: unknown) {
  const parent = asRecord(parentSpecies);
  const previousName = cleanText(parent.name, 180) || "Unnamed parent species";
  const previousTaxonomy = [
    cleanText(parent.scientific_name || parent.scientificName, 180),
    cleanText(parent.classification, 180),
    cleanText(parent.category, 120),
  ].filter(Boolean).join(" | ") || "No previous taxonomy recorded.";
  return [
    "CREATURE NAMING RULES",
    "Give each creature a natural-sounding biological name. The name should feel like something that emerged through ordinary language, taxonomy, regional usage, or historical convention. A name is a label, not a compressed description of every visible trait.",
    "Do not default to fantasy-style names formed by combining two descriptive nouns followed by an ecological role, such as Glassfrill Creeper, Reefveil Grazer, Siltmantle Lurker, Rootglass Walker, or similar constructions.",
    "Before generating each name, internally choose one naming style: single-word common name; simple common name using one modifier and one ordinary zoological noun; habitat/geographic/historical/folkloric name; resemblance/color/texture/local-usage name; Latinized fictional scientific binomial; or common name paired with a scientific binomial.",
    "Naming-style distribution target across a batch: 25% single-word common names, 30% simple two-word common names, 15% habitat/geographic/historical/folkloric names, 10% coined but pronounceable names, and 20% scientific binomials or common-name/binomial combinations.",
    "Batch diversity requirements: do not reuse a word, root, prefix, suffix, or naming structure used by another recently generated creature. No more than one third of names may contain a compound word. Do not use the same grammatical pattern for consecutive names.",
    "Avoid repeatedly ending names with occupational or behavioral nouns such as Creeper, Walker, Grazer, Lurker, Drifter, Sifter, Clasper, Settler, Hunter, or Stalker.",
    "Prefer familiar, understated names over dramatic or poetic ones. Do not invent unnecessary words such as veil, glass, shadow, root, mantle, or gill merely to make a name sound exotic.",
    "Evolutionary continuity: minor evolutionary changes do not automatically require a new common name. Closely related organisms may retain the same common-name root. Members of the same genus must share the same scientific genus name. Change the species epithet only when a distinct species has formed. A descendant's name should sometimes reflect its ancestry rather than only its newest trait.",
    `The previous organism in this lineage was named: ${previousName}`,
    `Its scientific classification was: ${previousTaxonomy}`,
    "For each descendant, decide internally whether the evolutionary change represents a variant of the same species, a subspecies, a new species within the same genus, or a new genus. Preserve the existing name and taxonomy whenever the biological change is not large enough to justify renaming it.",
    "If using a common name plus binomial, put the common name in name and the binomial in scientific_name. If using a scientific name alone, put the binomial in both name and scientific_name.",
    "The name field must contain only the selected display name, not an explanation of the naming style.",
  ].join("\n");
}

async function saveEvolutionResult(input: {
  appUserId: number;
  evolutionId: string;
  parentSpecies: Record<string, unknown>;
  evolution: ReturnType<typeof cleanPayload>;
  novelty: number;
  pressures: string[];
  adaptationBias: string;
  customEvolutionTraits: string[];
}) {
  const supabase = createAdminClient();
  const parentId = cleanText(input.parentSpecies.id, 120);
  if (!input.evolutionId || !parentId) throw new Error("Missing evolution or parent species id.");

  const eventId = createId();
  const totalSteps = input.evolution.total_steps;
  const stepYears = input.evolution.step_years;
  const totalYears = input.evolution.total_years;
  const { error: eventError } = await supabase.from("god_evolution_events").insert({
    id: eventId,
    evolution_id: input.evolutionId,
    user_id: input.appUserId,
    parent_species_id: parentId,
    total_steps: totalSteps,
    step_years: stepYears,
    total_years: totalYears,
    novelty: input.novelty,
    environmental_pressures: input.pressures,
    adaptation_bias: input.adaptationBias || null,
    custom_evolution_traits: input.customEvolutionTraits,
    custom_evolution_trait: input.customEvolutionTraits[0] || null,
    summary: input.evolution.summary || null,
    environment_shift: input.evolution.environment_shift || {},
    generated_payload: input.evolution,
  });
  if (eventError) throw eventError;

  const idByTemp = new Map<string, string>();
  const baseDepth = cleanInt(input.parentSpecies.depth_index ?? input.parentSpecies.step_index, 0, 0, 999);
  const baseElapsedYears = Math.max(0, Number(input.parentSpecies.elapsed_years || 0));
  const parentX = Number(input.parentSpecies.position_x || 80);
  const parentY = Number(input.parentSpecies.position_y || 80);

  const rows = input.evolution.species.map((item, index) => {
    const id = createId();
    idByTemp.set(item.temp_id, id);
    const relativeStep = Math.max(1, Number(item.step_index || index + 1));
    const elapsedYears = baseElapsedYears + stepYears.slice(0, relativeStep).reduce((sum, value) => sum + value, 0);
    const yearsSinceParent = cleanInt(item.years_since_parent, stepYears[Math.max(0, relativeStep - 1)] || 1000000, 0, 5000000);
    return {
      id,
      evolution_id: input.evolutionId,
      user_id: input.appUserId,
      parent_species_id: item.parent_temp_id ? null : parentId,
      origin_event_id: eventId,
      branch_group: item.branch_group || "main",
      name: item.name || `Descendant ${index + 1}`,
      scientific_name: item.scientific_name || null,
      classification: item.classification || cleanText(input.parentSpecies.classification, 180) || null,
      category: item.category || cleanText(input.parentSpecies.category, 120) || null,
      status: item.status || "stable",
      can_evolve: item.status !== "extinct" && item.can_evolve !== false,
      step_index: baseDepth + relativeStep,
      depth_index: baseDepth + relativeStep,
      sort_order: index,
      position_x: parentX + relativeStep * 420,
      position_y: parentY + (index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? 460 : -460)),
      years_since_parent: yearsSinceParent,
      elapsed_years: elapsedYears,
      overview: item.overview || "",
      habitat: item.habitat || cleanText(input.parentSpecies.habitat, 400) || "",
      ecology: Object.keys(item.ecology || {}).length ? item.ecology : asRecord(input.parentSpecies.ecology),
      reproduction: Object.keys(item.reproduction || {}).length ? item.reproduction : asRecord(input.parentSpecies.reproduction),
      population_condition: item.population_condition || {},
      newly_evolved_traits: item.newly_evolved_traits || [],
      complete_traits: Object.keys(item.complete_traits || {}).length ? item.complete_traits : asRecord(input.parentSpecies.complete_traits),
      inherited_traits: item.inherited_traits || [],
      lost_traits: item.lost_traits || [],
      potential_trait_hints: item.potential_trait_hints || [],
      pressures: [],
      adaptation_bias: null,
      custom_evolution_traits: [],
      custom_evolution_trait: null,
      novelty: input.novelty,
      visual_genome: Object.keys(item.visual_genome || {}).length ? item.visual_genome : asRecord(input.parentSpecies.visual_genome),
      image_prompt: item.image_prompt || cleanText(input.parentSpecies.image_prompt, 2000) || "",
      extinction_cause: item.extinction_cause || null,
      evolution_reason: item.evolution_reason || input.evolution.summary || "",
    };
  });

  rows.forEach((row, index) => {
    const source = input.evolution.species[index];
    if (source.parent_temp_id && idByTemp.has(source.parent_temp_id)) {
      row.parent_species_id = idByTemp.get(source.parent_temp_id) || row.parent_species_id;
    }
  });

  const { data: inserted, error: insertError } = await supabase
    .from("god_species")
    .insert(rows)
    .select("*");
  if (insertError) throw insertError;
  if (!inserted?.length) throw new Error("Evolution generated, but no descendant species were saved.");
  return { eventId, speciesRows: inserted };
}

function buildPrompt(input: {
  evolutionName: string;
  worldSummary: string;
  parentSpecies: unknown;
  branchOnly: boolean;
  existingSpecies: unknown[];
  novelty: number;
  pressures: string[];
  adaptationBias: string;
  customEvolutionTraits: string[];
  randomSeed: string;
}) {
  return [
    "Generate a God Engine evolution from the selected parent species.",
    "Return exactly one JSON object with keys: total_steps, step_years, total_years, summary, environment_shift, species.",
    input.branchOnly
      ? "Branch-only mode is active because the selected parent already has descendants. total_steps must be exactly 1. Generate exactly 1 or 2 species, and every species must be a direct new side branch from the selected existing parent with parent_temp_id null and step_index 1."
      : "total_steps must be an integer from 2 to 5. step_years must contain exactly total_steps integers, one for each generated evolutionary step, and each value must be between 1000000 and 5000000 years. total_years must be the sum of step_years.",
    "step_years must contain exactly total_steps integers, one for each generated evolutionary step, and each value must be between 1000000 and 5000000 years. total_years must be the sum of step_years.",
    "Each species item must have: temp_id, parent_temp_id, branch_group, name, scientific_name, classification, category, status, can_evolve, step_index, years_since_parent, overview, habitat, ecology, reproduction, population_condition, newly_evolved_traits, complete_traits, inherited_traits, lost_traits, potential_trait_hints, pressures, visual_genome, image_prompt, extinction_cause, evolution_reason.",
    input.branchOnly
      ? "Do not continue or rewrite any existing descendants. Create only new alternative branches from the selected parent."
      : "The first descendant should use parent_temp_id null because it descends directly from the selected existing parent. Later descendants must use another generated temp_id.",
    input.branchOnly
      ? "Each branch-only descendant should represent a plausible alternate path starting from this species at the same point in time."
      : "Choose a varied evolutionary topology. The response may be a straight line, a short burst, a single side branch, multiple branches, an extinct dead end, or an uneven set of branch depths. Do not force every branch to continue to the final step.",
    input.branchOnly
      ? "Branch-only mode should always create side-branch alternatives, not a continuation of the existing trunk."
      : "Randomness requirement: avoid repeating the same structure between calls. Vary total species count, branch timing, branch count, survival outcomes, and whether evolution remains unbranched. The number of species returned should commonly range from 2 to 9, rarely up to 14, and should not default to 5.",
    "A branch may stop before total_steps because it remains a side lineage, stagnates, becomes isolated, goes extinct, or simply is not the focus of this generated interval. Living branch tips may end at different step_index values.",
    "For a branch, give the branch starter and its descendants a consistent branch_group. branch_group is metadata only; do not use it to imply any branch is the main trunk.",
    "Use the corresponding step_years value as years_since_parent for species at that step. Step indexes may skip some branches; they only need to be plausible relative milestones.",
    "Do not produce the same topology every time. Avoid the pattern: one direct descendant, then two branches, then one continuation from each branch.",
    `Random topology seed for this call: ${input.randomSeed}. Use it to vary total_steps, total species count, branching timing, branch count, branch depth, and survival outcomes.`,
    "Every generated species name must be unique across existing species and this response. Do not reuse any exact existing name, even on a different branch.",
    creatureNamingRules(input.parentSpecies),
    "LINEAGE CONTINUITY RULES",
    "The selected parent species is the immediate ancestor. Base every descendant on that parent's complete_traits, habitat, ecology, reproduction, visual_genome, overview, and image_prompt.",
    "Do not reset descendants to primitive, larval, aquatic, bottom-feeding, worm-like, slug-like, or limbless forms unless the selected parent already has those traits or the generated lineage explicitly evolves toward that state through plausible intermediate steps.",
    "Preserve the parent's core body plan by default: limb count and limb placement, posture, locomotion strategy, respiratory mode, major sensory organs, mouth/feeding apparatus, reproductive strategy, scale, and primary habitat must remain recognizable unless a listed newly_evolved_trait or lost_trait explains the change.",
    "Major reversals such as losing functional legs, leaving land for water, becoming sessile, abandoning air breathing, or collapsing into a simpler body form require strong environmental pressure, clear evolutionary advantage, biological cost, and must be listed in lost_traits and evolution_reason.",
    "Evolution can reduce, specialize, or repurpose structures, but it must not read as de-evolution or as a different unrelated creature. Descendants should look like modified relatives of the parent, not new creatures generated from scratch.",
    "complete_traits must include physical_description for every descendant: a concise but complete natural-language description of the creature's visible body plan, silhouette, head/front end, body covering, limbs/appendages, eyes/sensory organs, mouthparts, tail/rear end, coloration, size, posture, and locomotion.",
    "complete_traits must include an anatomy object for every descendant with explicit visible bookkeeping: eye_count, eye_arrangement, limb_count, limb_pairs, limb_type, digits_per_limb_or_pad_count, tail_present, tail_description, body_axis, posture, symmetry, mouthparts, respiratory_structures, body_covering, approximate_size, and notes.",
    "For complete_traits.anatomy, inherit the parent's values by default. Change counts such as eye_count, limb_count, digit/pad count, or tail_present only when newly_evolved_traits, lost_traits, and evolution_reason explicitly explain the anatomical change.",
    "For complete_traits.physical_description, start from the parent's physical description if present and update only the visible changes that evolved in this step. Do not replace it with a generic description.",
    "For complete_traits, carry forward all parent traits that remain true. Only remove or rewrite a parent trait when lost_traits and evolution_reason explicitly justify it.",
    "For visual_genome and image_prompt, preserve the parent's visible family resemblance and appendage logic. Add new visible traits on top of the inherited body plan.",
    "image_prompt must describe only the creature and natural scene. It must explicitly avoid text, titles, labels, diagrams, inset panels, arrows, callouts, trait lists, scientific poster layouts, field guide pages, cutaways, cross-sections, and multi-view sheets.",
    "Evolution should be biologically plausible but imaginative. Radical novelty can be strange, but every trait needs origin, advantage, cost, and failure risk in the text fields.",
    "Use statuses only from: thriving, stable, specialized, vulnerable, declining, endangered, unstable, extinct.",
    "Newly evolved traits must list only 2 to 3 changes that appeared during that time step.",
    "Potential trait hints must be broad future directions, not exact guaranteed outcomes.",
    "Keep generated text concise: overview, habitat, evolution_reason, extinction_cause, and image_prompt should each be no more than 80 words.",
    "Keep object fields compact. Do not write long paragraphs, repeated trait explanations, or verbose nested records.",
    "The visual_genome must inherit and modify the parent visual genome so descendants look related.",
    "Do not include game stats, points, currencies, manual upgrade language, markdown, comments, or extra keys.",
    `Evolution project: ${input.evolutionName || "Untitled Evolution"}`,
    input.worldSummary ? `World/environment summary: ${input.worldSummary}` : "No world summary.",
    `Novelty 0-100: ${input.novelty}.`,
    input.pressures.length ? `Custom environmental pressures: ${input.pressures.join(", ")}` : "No custom environmental pressures; determine pressures automatically.",
    input.adaptationBias ? `Adaptation bias: ${input.adaptationBias}` : "No custom adaptation bias; determine biological systems automatically.",
    input.customEvolutionTraits.length
      ? `Custom evolutionary traits to incorporate somewhere in the next evolution, if biologically plausible. Treat these as user guidance, not guaranteed commands:\n${input.customEvolutionTraits.map((trait, index) => `${index + 1}. ${trait}`).join("\n")}`
      : "No custom evolutionary trait guidance.",
    `Selected parent species JSON:\n${JSON.stringify(input.parentSpecies).slice(0, 7000)}`,
    input.existingSpecies.length ? `Existing species names for continuity:\n${JSON.stringify(input.existingSpecies).slice(0, 5000)}` : "No other species context.",
  ].join("\n\n");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let jobId = "";
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const branchOnly = body.branchOnly === true;
    const parentSpecies = asRecord(body.parentSpecies);
    const parentSpeciesId = cleanText(parentSpecies.id, 120);
    const parentSpeciesName = cleanText(parentSpecies.name, 180) || "Unnamed species";
    const evolutionId = cleanText(body.evolutionId, 120);
    const existingSpecies = Array.isArray(body.existingSpecies) ? body.existingSpecies.slice(0, 80) : [];
    const novelty = cleanInt(body.novelty, 50, 0, 100);
    const pressures = asArray(body.environmentalPressures, 3).map((item) => cleanText(item, 80));
    const adaptationBias = cleanText(body.adaptationBias, 80);
    const customEvolutionTraits = asArray(body.customEvolutionTraits, 12)
      .map((item) => cleanText(item, 1000))
      .filter(Boolean);
    const legacyCustomTrait = cleanText(body.customEvolutionTrait, 1000);
    if (legacyCustomTrait && !customEvolutionTraits.length) customEvolutionTraits.push(legacyCustomTrait);
    const randomSeed = cleanText(body.randomSeed, 120) || crypto.randomUUID();
    const prompt = buildPrompt({
      evolutionName: cleanText(body.evolutionName, 180),
      worldSummary: cleanText(body.worldSummary, 3000),
      parentSpecies,
      branchOnly,
      existingSpecies,
      novelty,
      pressures,
      adaptationBias,
      customEvolutionTraits,
      randomSeed,
    });
    const job = await createGenerationJob({
      userId: appUser.id,
      module: "god_engine",
      sourceType: branchOnly ? "god_species_branch_evolution" : "god_species_evolution",
      sourceId: parentSpeciesId || null,
      sourceLabel: parentSpeciesName,
      prompt,
      model: "gpt-5",
      parameters: {
        evolution_id: evolutionId,
        parent_species_id: parentSpeciesId,
        parent_species_name: parentSpeciesName,
        branch_only: branchOnly,
      },
      progressLabel: branchOnly ? "Generating branch evolution" : "Generating evolution",
    });
    jobId = job.id;
    await updateGenerationJob(jobId, {
      status: "running",
      progressLabel: branchOnly ? "Evolving branch options" : "Evolving species timeline",
    });

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You generate strict JSON for varied, biologically plausible fictional evolution trees. Return only valid JSON.",
      prompt,
      maxOutputTokens: 12000,
    });

    let parsedPayload: unknown;
    try {
      parsedPayload = parseJson(generatedText || "{}");
    } catch (error) {
      await updateGenerationJob(jobId, {
        status: "running",
        progressLabel: "Repairing evolution JSON",
      });
      parsedPayload = await parseJsonWithRepair(openai, generatedText || "{}", error);
    }
    const evolution = cleanPayload(parsedPayload, branchOnly, existingSpecies);
    if (!evolution.species.length) {
      await updateGenerationJob(jobId, {
        status: "failed",
        progressLabel: "Evolution failed",
        errorMessage: "OpenAI did not return usable descendants.",
      });
      return jsonResponse({ error: "OpenAI did not return usable descendants." }, 502);
    }
    await updateGenerationJob(jobId, {
      status: "running",
      progressLabel: "Saving descendants",
    });
    const saved = await saveEvolutionResult({
      appUserId: appUser.id,
      evolutionId,
      parentSpecies,
      evolution,
      novelty,
      pressures,
      adaptationBias,
      customEvolutionTraits,
    });
    await updateGenerationJob(jobId, {
      status: "completed",
      progressLabel: branchOnly ? "Branch evolution saved" : "Evolution saved",
    });
    return jsonResponse({ evolution, jobId, eventId: saved.eventId, speciesRows: saved.speciesRows });
  } catch (error) {
    console.error(error);
    await updateGenerationJob(jobId, {
      status: "failed",
      progressLabel: "Evolution failed",
      errorMessage: error instanceof Error ? error.message : String(error || "Could not evolve this species."),
      errorDetails: describeError(error, "Could not evolve this species."),
    }).catch(() => null);
    return jsonResponse(describeError(error, "Could not evolve this species."), 500);
  }
});
