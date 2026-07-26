import { FICTIONAL_NAMING_PROMPT_SECTION } from "./fictional-naming-rules.ts";

export function text(value: unknown, fallback: string | null = null) {
  const result = String(value ?? "").trim();
  return result || fallback;
}

export function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function integerOrNull(value: unknown) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : null;
}

export function parseJson(textValue: string) {
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

export function isAsteroidBelt(body: Record<string, unknown> | null | undefined) {
  return String(body?.type || "").toLowerCase().includes("asteroid");
}

export function rosterRange(value: unknown) {
  const key = text(value, "core");
  if (key === "small") return { key, label: "Small founding team", min: 3, max: 5 };
  if (key === "large") return { key, label: "Large settlement staff", min: 11, max: 20 };
  return { key: "core", label: "Core operating crew", min: 6, max: 10 };
}

export function pickRosterCount(value: unknown) {
  const range = rosterRange(value);
  const min = Math.max(1, Math.min(20, range.min));
  const max = Math.max(min, Math.min(20, range.max));
  return min + Math.floor(Math.random() * (max - min + 1));
}

function bodyTypeName(kind: "planet" | "moon", body: Record<string, unknown>) {
  if (kind === "planet" && isAsteroidBelt(body)) return "asteroid belt";
  return kind;
}

export function bodyContextLines(kind: "planet" | "moon", body: Record<string, unknown>) {
  return [
    `Target body type: ${bodyTypeName(kind, body)}.`,
    `Name: ${body.name || body.designation || "Unknown"}.`,
    `Class/type: ${body.type || "Unknown"}.`,
    `Description: ${body.description || body.visual_appearance || "Unknown"}.`,
    `Atmosphere: ${body.atmosphere || "None"}.`,
    `Water presence: ${body.water_presence || "None"}.`,
    `Surface temperature: ${body.surface_temperature_k || "Unknown"} K.`,
    kind === "planet" ? `Gravity: ${body.gravity_ms2 || "Unknown"} m/s2.` : "",
    kind === "planet" ? `Orbital distance: ${body.orbital_distance_au || "Unknown"} AU.` : `Orbital distance: ${body.orbital_distance_km || "Unknown"} km from parent planet.`,
    `Orbital period: ${body.orbital_period_days || "Unknown"} days.`,
    `Hazards or activity: ${body.geological_activity || body.magnetosphere || body.climate || "Unknown"}.`,
  ].filter(Boolean);
}

export function lifeformSummary(lifeforms: Record<string, unknown>[] = []) {
  if (!lifeforms.length) return "No known lifeforms.";
  return lifeforms
    .slice(0, 12)
    .map((lifeform) => `- ${lifeform.name || lifeform.designation || "Unnamed"}: ${lifeform.description || lifeform.species_name || lifeform.kingdom || "known non-sentient organism"}`)
    .join("\n");
}

export function colonySummary(colonies: Record<string, unknown>[] = []) {
  if (!colonies.length) return "No existing colonies.";
  return colonies
    .slice(0, 12)
    .map((colony) => `- ${colony.name || "Unnamed colony"}: ${colony.location_type || colony.settlement_type || "unknown location"}; ${colony.description || colony.industry || ""}`)
    .join("\n");
}

export function buildColonyPrompt(options: {
  body: Record<string, unknown>;
  kind: "planet" | "moon";
  existingColonies?: Record<string, unknown>[];
  existingLifeforms?: Record<string, unknown>[];
  instructions?: string | null;
}) {
  const userInstructions = text(options.instructions);
  return [
    "Generate one scientifically plausible human colony for this Stellar Architect body.",
    "The colony may be on the surface, underground, under water/ice, in orbit, in a Lagrange location, attached to an asteroid, inside a sealed industrial habitat, or any other scientifically logical free-text location.",
    "Choose location_type as concise free text. Do not use a fixed enum. Choose location_notes that explain why the location is plausible.",
    "Use gravity, atmosphere, temperature, radiation, resources, orbit, hazards, habitability, and colony purpose to choose the location logically.",
    "Do not introduce sentient alien civilizations, alien ruins, alien artifacts, trade with native intelligences, indigenous politics, or native governments.",
    "The AI may hard-code colony generation around existing lifeform data if appropriate, but should generally be agnostic to life on a celestial body.",
    FICTIONAL_NAMING_PROMPT_SECTION,
    "",
    "Target body context:",
    ...bodyContextLines(options.kind, options.body),
    "",
    "Existing colonies on this body:",
    colonySummary(options.existingColonies || []),
    "",
    "Known lifeform data, if any:",
    lifeformSummary(options.existingLifeforms || []),
    userInstructions ? `\nAdditional overriding instructions from the user:\n${userInstructions}` : "",
    "",
    "Return valid JSON only with this exact shape:",
    JSON.stringify({
      colony: {
        name: "Colony name",
        locationType: "Free-text location type, e.g. Subsurface cryovolcanic research base",
        locationNotes: "Why this location is scientifically logical for this body.",
        foundedYear: 3375,
        organization: "Responsible human organization or consortium",
        settlementType: "Research outpost, mining habitat, industrial station, refuge, observatory, etc.",
        population: 84,
        primaryBiome: "Free-text environmental setting",
        localHazards: "Radiation, vacuum, thermal stress, quakes, dust, storms, etc.",
        energySources: "Likely power sources",
        waterSource: "Likely water or volatile source",
        industry: "Primary work or purpose",
        foodProduction: "How food is supplied or grown",
        housing: "Habitat structure",
        supplyStatus: "Stable, dependent, fragile, isolated, expanding, etc.",
        governmentType: "Internal administration or command structure",
        defensiveStructures: "Safety and hazard protection, not military unless justified",
        communication: "How it communicates with the system",
        researchFocus: "Scientific or industrial focus",
        description: "Two to four grounded sentences describing the colony and its daily reality.",
      },
    }),
  ].filter(Boolean).join("\n");
}

export function buildColonistsPrompt(options: {
  colony: Record<string, unknown>;
  body: Record<string, unknown> | null;
  kind: "planet" | "moon" | "unknown";
  count: number;
  existingColonists?: Record<string, unknown>[];
  instructions?: string | null;
}) {
  const userInstructions = text(options.instructions);
  const existing = options.existingColonists?.length
    ? options.existingColonists.slice(0, 20).map((colonist) => `- ${colonist.name || "Unnamed"}: ${colonist.role || colonist.department || "crew"}`).join("\n")
    : "No existing colonists.";
  return [
    `Generate ${options.count} human NPC colonists for this Stellar Architect colony.`,
    "Colonists are human only. Do not create aliens, sentient native beings, alien hybrids, or indigenous politics.",
    "Make the roster useful for storytelling and operations: mix roles, ages, personalities, conflicts, skills, and responsibilities.",
    "Do not duplicate existing colonists.",
    FICTIONAL_NAMING_PROMPT_SECTION,
    "",
    "Colony context:",
    `Name: ${options.colony.name || "Unknown colony"}.`,
    `Location type: ${options.colony.location_type || options.colony.settlement_type || "Unknown"}.`,
    `Location notes: ${options.colony.location_notes || "Unknown"}.`,
    `Purpose/industry: ${options.colony.industry || options.colony.research_focus || "Unknown"}.`,
    `Description: ${options.colony.description || "Unknown"}.`,
    "",
    "Parent body context:",
    options.body ? bodyContextLines(options.kind === "moon" ? "moon" : "planet", options.body).join("\n") : "Unknown parent body.",
    "",
    "Existing colonists:",
    existing,
    userInstructions ? `\nAdditional overriding instructions from the user:\n${userInstructions}` : "",
    "",
    "Return valid JSON only with this exact shape:",
    JSON.stringify({
      colonists: [{
        name: "Human name",
        age: 38,
        gender: "Free text",
        nationality: "Free text",
        role: "Colony role",
        department: "Operations department",
        specialization: "Useful specialty",
        personalityTraits: "Brief traits",
        background: "Brief background",
        currentAssignment: "Current responsibility",
        personalConflict: "Practical conflict or tension",
        physicalDescription: "Short grounded appearance",
        biography: "Two to three sentences.",
      }],
    }),
  ].filter(Boolean).join("\n");
}
