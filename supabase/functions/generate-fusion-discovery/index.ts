import OpenAI from "npm:openai@^6.1.0";
import { generateJsonText } from "../_shared/openai-config.ts";
import {
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

type FusionParent = {
  id: string;
  name: string;
  description?: string;
  traits?: string[];
  level: number;
};

const REALITY_LEVELS = ["Real", "Near Future", "Speculative", "Advanced", "Science Fantasy"];
const MAX_LEVEL = 5;
const PRODUCT_TYPES = [
  "instrument",
  "material",
  "machine",
  "process",
  "sensor",
  "biological system",
  "industrial component",
  "field apparatus",
  "adaptive tool",
  "lab specimen",
];

function cleanText(value: unknown, maxLength: number) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return Number.isFinite(maxLength) ? cleaned.slice(0, maxLength) : cleaned;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isPrimitiveText(value: unknown) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function firstCleanText(record: Record<string, unknown>, keys: string[], maxLength: number) {
  for (const key of keys) {
    if (!isPrimitiveText(record[key])) continue;
    const value = cleanText(record[key], maxLength);
    if (value) return value;
  }
  return "";
}

const NAME_KEYS = ["name", "item_name", "itemName", "result", "title", "object", "objectName", "resultName", "discoveryName", "fusionName"];
const DESCRIPTION_KEYS = ["description", "desc", "summary", "one_sentence_description", "oneSentenceDescription", "details", "overview", "function", "purpose", "use"];
const TRAIT_KEYS = ["traits", "primary_traits", "primaryTraits", "characteristics", "features", "attributes", "properties"];

function cleanTraits(value: unknown, parents: FusionParent[] = []) {
  const rawValues = Array.isArray(value) ? value : isPrimitiveText(value) ? String(value).split(/[,;|]/) : [];
  const blocked = /\b(fusion|hybrid|combination|combined|useful traits|tangible item|generic)\b/i;
  const traits = rawValues
    .map((trait) => cleanText(trait, 42).replace(/[.!?]+$/g, ""))
    .filter((trait) => trait.length >= 3 && !blocked.test(trait));
  const unique = [...new Map(traits.map((trait) => [trait.toLowerCase(), trait])).values()];
  if (unique.length >= 3) return unique.slice(0, 6);

  const parentWords = parents.flatMap((parent) => [
    ...getParentKeywords(parent),
    ...(parent.traits || []),
  ]);
  const derived = [...unique, ...parentWords]
    .map((trait) => cleanText(String(trait).toLowerCase(), 42))
    .filter((trait) => trait.length >= 3 && !blocked.test(trait));
  return [...new Map(derived.map((trait) => [trait.toLowerCase(), trait])).values()].slice(0, 6);
}

function deriveTraits(name: string, description: string, value: unknown, parents: FusionParent[]) {
  const direct = cleanTraits(value, parents);
  if (direct.length >= 3) return direct.slice(0, 6);
  const stopWords = new Set([
    "with", "from", "that", "uses", "into", "level", "object", "ordinary", "supply",
    "concrete", "combined", "function", "parent", "parents", "item", "items", "perform",
  ]);
  const keywords = `${name} ${description}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));
  const parentTraits = parents.flatMap((parent) => [
    ...(parent.traits || []),
    ...getParentKeywords(parent),
  ]);
  return [...new Map([...direct, ...parentTraits, ...keywords].map((trait) => [cleanText(trait, 42).toLowerCase(), cleanText(trait, 42)])).values()]
    .filter(Boolean)
    .slice(0, 6);
}

function traitsFromRecord(record: Record<string, unknown>) {
  for (const key of TRAIT_KEYS) {
    const traits = cleanTraits(record[key]);
    if (traits.length) return traits;
  }
  return [];
}

function extractFusionFields(value: unknown, fields = { name: "", description: "", traits: [] as string[] }, depth = 0) {
  if (depth > 6 || (fields.name && fields.description && fields.traits.length >= 3)) return fields;
  if (Array.isArray(value)) {
    for (const item of value) {
      extractFusionFields(item, fields, depth + 1);
      if (fields.name && fields.description && fields.traits.length >= 3) break;
    }
    return fields;
  }

  const record = asRecord(value);
  if (!Object.keys(record).length) return fields;
  if (!fields.name) fields.name = firstCleanText(record, NAME_KEYS, 80);
  if (!fields.description) fields.description = firstCleanText(record, DESCRIPTION_KEYS, Infinity);
  if (fields.traits.length < 3) fields.traits = traitsFromRecord(record);

  const preferredKeys = ["result", "item", "discovery", "output", "generated", "data", "payload", "attributes", "metadata", "properties", "content", "message"];
  for (const key of preferredKeys) {
    if (!(key in record)) continue;
    extractFusionFields(record[key], fields, depth + 1);
    if (fields.name && fields.description && fields.traits.length >= 3) return fields;
  }

  for (const value of Object.values(record)) {
    if (!value || (typeof value !== "object" && !Array.isArray(value))) continue;
    extractFusionFields(value, fields, depth + 1);
    if (fields.name && fields.description && fields.traits.length >= 3) return fields;
  }

  return fields;
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

function parseJsonSafe(textValue: string) {
  try {
    return parseJson(textValue);
  } catch (_error) {
    return null;
  }
}

function cleanParent(value: unknown): FusionParent {
  const record = asRecord(value);
  return {
    id: cleanText(record.id, 120),
    name: cleanText(record.name, 80),
    description: cleanText(record.description, Infinity),
    traits: cleanTraits(record.traits),
    level: Math.max(0, Math.min(999, Number(record.level) || 0)),
  };
}

function realityLevelFor(level: number) {
  if (level <= 0) return REALITY_LEVELS[0];
  if (level === 1) return REALITY_LEVELS[1];
  if (level <= 3) return REALITY_LEVELS[2];
  if (level <= 6) return REALITY_LEVELS[3];
  return REALITY_LEVELS[4];
}

function getParentKeywords(parent: FusionParent) {
  const stopWords = new Set([
    "bag", "box", "sack", "jar", "roll", "tube", "folded", "gallon", "five", "coiled", "live",
    "of", "and", "the", "with", "camping", "can", "kit", "cylinder", "brick", "block",
  ]);
  return parent.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));
}

class PromptBuilder {
  static systemPrompt() {
    return [
      "You generate strict JSON for Fusion, a discovery game about combining objects.",
      "Return exactly one JSON object with keys: name, description, traits.",
      "Make every Fusion result inventive, concrete, and a little uncanny, but usually grounded in understandable technical language.",
      "Do not get stuck trying to be strictly realistic. If needed, invent a speculative material, mechanism, interface, process, organism, sensor, or industrial use.",
      "The only hard rule is that the result must contain recognizable DNA from both parent items.",
      "For level 2+ results, focus on the two immediate parent items as complete things.",
      "Do not list or acknowledge older ancestor items unless they are still directly relevant to the new result.",
      "It is fine for a higher-level result to transcend its original ingredients and become a cleaner new concept.",
      "Borrow a concrete material, behavior, shape, use, environment, failure mode, measurement property, or physical constraint from each parent.",
      `The result should feel like a speculative ${PRODUCT_TYPES.join(", ")}, or similarly tangible technical oddity.`,
      "Prefer material science, biotech, sensors, chemistry, manufacturing, energy systems, control systems, microscopy, field equipment, or procedural jargon.",
      "Use fantasy only as a last resort, and keep it quiet: no ghosts, curses, prophecy, mythic forces, dream logic, or cosmic grandiosity.",
      "The invented mechanism must still have internal cause-and-effect: parent A changes parent B in a specific way, and parent B changes parent A in a specific way.",
      "Avoid bland names like Generic Fusion, Rulebound Chimera, Ritual Object, Prototype, Processor, Engine, Device, Vessel, Module, Kit, or Workstation.",
      "Avoid phrases like stable result, combined function, physical traits, fusion-world object, clear cause-and-effect rule, impossible dimension, guilt, hidden seams, ghosts, oracle, beast, moon, crown, comet, witchlight, or haunted.",
      "The name must be concise and grounded-evocative, like something from a lab drawer, field manual, patent index, or maintenance log.",
      "The description must be one sentence that explicitly names both parents and explains how both are present.",
      "Traits must be an array of 3 to 6 concise primary characteristics. At least one trait should come from each parent.",
      "Do not include markdown, commentary, alternate options, or extra fields.",
    ].join("\n");
  }

  static userPrompt(parents: FusionParent[], options: { realityOverride?: string; fallbackMode?: boolean } = {}) {
    const targetLevel = Math.max(parents[0].level, parents[1].level) + 1;
    const realityLevel = options.realityOverride || realityLevelFor(Math.max(parents[0].level, parents[1].level));
    const parentLines = parents.map((parent, index) => {
      if (parent.level === 0) return `Parent ${index + 1}: ${parent.name}`;
      const traits = (parent.traits || []).length ? `\nTraits:\n- ${(parent.traits || []).join("\n- ")}` : "";
      return `Parent ${index + 1}\nName: ${parent.name}\nDescription: ${parent.description || "No description stored."}${traits}`;
    });
    return [
      `Reality Flavor: ${realityLevel}`,
      `Target Level: ${targetLevel}`,
      "Make Shit Up rule: every pair must produce a result. Never refuse. Never say no valid fusion exists.",
      "Default tone: speculative engineering, material science, biotech, field equipment, lab process, or technical anomaly.",
      "The result must contain something recognizable from both parent items, not just their names.",
      "If either parent is already a generated Fusion item, treat it as a complete object; do not unpack all older ancestors unless the result needs them.",
      options.fallbackMode ? "Fallback mode: be more specific and picturable, but stay mostly grounded. Use unknown materials, adaptive machinery, biological mechanisms, measurement effects, or industrial procedures. Do not use generic categories, parent-name mashups, ghosts, curses, prophecies, dream logic, or cosmic scale." : "",
      ...parentLines,
    ].filter(Boolean).join("\n");
  }

  static forcedSynthesisPrompt(parents: FusionParent[]) {
    return [
      "The previous Fusion attempt was too bland or failed quality checks. Return one stronger technical result now.",
      "Do not look for an established real-world answer.",
      "Invent a speculative mechanism that makes the two parents transform each other through material behavior, sensing, chemistry, biology, pressure, heat, vibration, signal processing, contamination, calibration, or tooling.",
      "Do not return a placeholder, draft, prototype, processor, engine, device, generic vessel, generic rig, generic module, generic kit, generic workstation, ritual object, rulebound chimera, or parent-name-only hyphenation.",
      "Do not use the phrase \"physical traits\" or say the item performs a \"combined function\".",
      "Do not use phrases like stable result, fusion-world object, clear cause-and-effect rule, ghosts, impossible dimension, prophecy, haunted, or cosmic.",
      "Present the result as true inside Fusion's speculative rules.",
      "Use the parents as causal ingredients. Each parent must visibly contribute something.",
      "The result must feel like something someone could picture as an object, specimen, material, machine, sensor, tool, process, field apparatus, or industrial anomaly.",
      "Return exactly one JSON object with keys: name, description, traits.",
      PromptBuilder.userPrompt(parents, { realityOverride: "Speculative", fallbackMode: true }),
    ].join("\n\n");
  }

  static repairPrompt(parents: FusionParent[], rawResponse: string) {
    return [
      "Convert the previous Fusion model response into exactly one JSON object with keys: name, description, traits.",
      "Never return an empty object. Never return null. If the previous response is empty, create a grounded speculative result from the parents.",
      "Do not add extra keys. Do not use markdown.",
      "Preserve the intended concrete result if it obeys the rules. If the previous response omitted one field, infer the missing field from the parents.",
      "The description must be one sentence that explicitly names both parents and makes both parents visibly matter.",
      "Traits must be an array of 3 to 6 concise primary characteristics, with at least one trait from each parent.",
      PromptBuilder.userPrompt(parents, { realityOverride: "Speculative", fallbackMode: true }),
      `Previous response: ${rawResponse.slice(0, 1500)}`,
    ].join("\n\n");
  }
}

function singularize(value: string) {
  return value.replace(/ies$/i, "y").replace(/s$/i, "");
}

function titleWord(value: string) {
  return value.replace(/(^|[-\s])[a-z]/g, (match) => match.toUpperCase());
}

function lastMeaningfulWord(value: string) {
  const stopWords = new Set(["bag", "box", "sack", "jar", "roll", "tube", "folded", "gallon", "five", "coiled", "live", "of", "and", "the", "with", "camping"]);
  const words = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
  return singularize(words[words.length - 1] || "device");
}

function parentEssence(parent: FusionParent) {
  return getParentKeywords(parent)[0] || lastMeaningfulWord(parent.name);
}

function hashText(value: string) {
  return Math.abs(value.split("").reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) | 0, 7));
}

function parentSignalWords(parent: FusionParent) {
  return [
    ...getParentKeywords(parent),
    lastMeaningfulWord(parent.name),
    ...extractConcepts(parent).slice(0, 2),
  ]
    .map((word) => singularize(cleanText(word, 32).toLowerCase()))
    .filter((word) => word.length > 3);
}

function hasParentSignal(text: string, parent: FusionParent) {
  const normalized = text.toLowerCase();
  return parentSignalWords(parent).some((word) => normalized.includes(word));
}

function extractConcepts(parent: FusionParent) {
  const stopWords = new Set([
    "about", "above", "across", "after", "allow", "also", "being", "between", "carried", "common",
    "distinctive", "everyday", "feature", "features", "from", "into", "made", "major", "object",
    "objects", "other", "physical", "properties", "serving", "special", "supporting", "through",
    "used", "uses", "using", "with", "within", "provides", "providing", "produces", "creating",
    "stable", "result", "clear", "cause", "effect", "rule", "beverage", "drink", "food",
  ]);
  const nameConcepts = [
    lastMeaningfulWord(parent.name),
    ...getParentKeywords(parent),
  ]
    .map(singularize)
    .filter((word) => word.length > 3 && !stopWords.has(word));
  const values = [
    parent.description || "",
    ...(parent.traits || []),
  ];
  const words = values
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(singularize)
    .filter((word) => word.length > 3 && !stopWords.has(word));
  const unique = [...new Map([...nameConcepts, ...words].map((word) => [word, word])).values()];
  return unique.length ? unique.slice(0, 5) : [parentEssence(parent)];
}

function improvisedDiscovery(parents: FusionParent[]) {
  const level = Math.max(parents[0].level, parents[1].level) + 1;
  const index = hashText(`${parents[0].name}|${parents[1].name}|${level}`);
  const firstConcepts = extractConcepts(parents[0]);
  const secondConcepts = extractConcepts(parents[1]);
  const first = firstConcepts[0];
  const second = secondConcepts[0];
  const interactions = [
    { verb: "calibrates against", noun: "Gauge", trait: "calibrated response", effect: "turning the second parent's behavior into a readable change in the first parent's structure" },
    { verb: "plates onto", noun: "Coating", trait: "reactive surface layer", effect: "forming a thin functional layer that carries both parent signatures" },
    { verb: "filters through", noun: "Membrane", trait: "selective permeability", effect: "letting only the shared operating condition pass through the new material" },
    { verb: "stabilizes inside", noun: "Matrix", trait: "stabilized composite", effect: "locking both parent behaviors into a controlled internal pattern" },
    { verb: "indexes", noun: "Assay", trait: "diagnostic readout", effect: "converting contact between the parents into a measurable signal" },
    { verb: "compresses into", noun: "Pellet", trait: "pressure-formed body", effect: "packing both parent materials into a dense usable form" },
    { verb: "routes through", noun: "Regulator", trait: "flow regulation", effect: "using one parent's constraint to control the other's movement or release" },
    { verb: "etches onto", noun: "Substrate", trait: "etched interface", effect: "engraving the first parent's pattern into the second parent's surface" },
    { verb: "cultures within", noun: "Bioreactor", trait: "controlled growth", effect: "making the second parent sustain a repeatable version of the first parent's behavior" },
    { verb: "anneals with", noun: "Laminate", trait: "layered reinforcement", effect: "bonding both parent contributions into a heat-set layered material" },
    { verb: "charges through", noun: "Cell", trait: "stored output", effect: "turning the parents' mismatch into a small stored release of energy or motion" },
    { verb: "maps across", noun: "Array", trait: "distributed sensing", effect: "spreading both parent behaviors across repeated readable points" },
  ];
  const modifiers = [
    "Adaptive",
    "Microcellular",
    "Phase-Locked",
    "Cryo-Set",
    "Sintered",
    "Bioactive",
    "Pressure",
    "Fluorescent",
    "Indexed",
    "Porous",
    "Resonant",
    "Thermal",
  ];
  const interaction = interactions[index % interactions.length];
  const modifier = modifiers[Math.floor(index / interactions.length) % modifiers.length];
  const names = [
    `${titleWord(first)}-${titleWord(second)} ${interaction.noun}`,
    `${modifier} ${titleWord(first)} ${interaction.noun}`,
    `${titleWord(second)} ${modifier} ${interaction.noun}`,
    `${titleWord(first)} ${titleWord(second)} ${interaction.noun}`,
  ];
  const name = cleanText(names[index % names.length], 48);
  return {
    name,
    description: cleanText(`${name} forms when the ${first} properties of ${parents[0].name} ${interaction.verb} the ${second} properties of ${parents[1].name}, ${interaction.effect}.`, Infinity),
    traits: [
      interaction.trait,
      `${first} interface`,
      `${second} interface`,
      `${parents[0].name} input`,
      `${parents[1].name} input`,
    ],
  };
}

class ValidationService {
  static validate(result: unknown, parents: FusionParent[], parentLevel: number) {
    const extracted = extractFusionFields(result);
    const name = cleanText(extracted.name, 48);
    const description = cleanText(extracted.description, Infinity);
    const traits = cleanTraits(extracted.traits, parents);
    if (!name || !description) {
      const keys = Object.keys(asRecord(result)).slice(0, 12).join(", ") || "none";
      throw new Error(`The AI returned JSON without both name and description. Top-level keys: ${keys}.`);
    }
    const normalizedName = name.toLowerCase();
    const parentNames = parents.map((parent) => parent.name.toLowerCase());
    if (parentNames.includes(normalizedName)) {
      throw new Error("Generated discovery duplicated a parent item.");
    }
    if (/\b(prototype|processor|engine|device)\b/i.test(name) && /\b(physical traits|combined function|uses the .* and .*)\b/i.test(description)) {
      throw new Error("Generated discovery was a placeholder fallback.");
    }
    if (/\bprototype\b/i.test(name) && parents.every((parent) => normalizedName.includes(lastMeaningfulWord(parent.name)))) {
      throw new Error("Generated discovery was a parent-name placeholder.");
    }
    if (description.split(/\s+/).length < 6) {
      throw new Error("Generated discovery description was too thin.");
    }
    if (/\binvented\b/i.test(description)) {
      throw new Error("Generated discovery admitted it was invented.");
    }
    const combinedSignalText = `${name} ${description} ${traits.join(" ")}`;
    if (/\b(rulebound chimera|ritual object|stable result|combined function|physical traits|fusion-world object|clear cause-and-effect rule|providing traits|beverage traits)\b/i.test(combinedSignalText)) {
      throw new Error("Generated discovery used bland fallback language.");
    }
    if (!parents.every((parent) => hasParentSignal(combinedSignalText, parent))) {
      throw new Error("Generated discovery did not preserve both parent identities.");
    }
    if (parentLevel === 0) {
      const combinedText = `${name} ${description}`.toLowerCase();
      if (/\b(useful traits|tangible item|practical workshop kit|combines useful|generic|fusion|hybrid|combination|combined|beyond either parent alone)\b/i.test(combinedText)) {
        throw new Error("Generated discovery was too vague for a level 0 recipe.");
      }
      if (/\b(vessel|rig|array|harness|module|apparatus|manifold|condenser|lattice|cradle|relay|chamber)\b/i.test(name)) {
        throw new Error("Generated discovery used a generic invented form for a level 0 recipe.");
      }
      if (/\bkit\b/i.test(name) && !/\b(first aid kit|tool kit|repair kit|sewing kit|meal kit|test kit|resin kit)\b/i.test(name)) {
        throw new Error("Generated discovery invented a generic kit for a level 0 recipe.");
      }
      if (/\bworkstation\b/i.test(name) && !/\b(computer workstation|audio workstation|welding workstation|laboratory workstation|kitchen workstation)\b/i.test(name)) {
        throw new Error("Generated discovery invented a generic workstation for a level 0 recipe.");
      }
      const traitText = traits.join(" ").toLowerCase();
      if (parents.some((parent) => getParentKeywords(parent).some((word) => /\b(transfer|control|channel)\b/i.test(traitText) && traitText.includes(word)))) {
        throw new Error("Generated discovery traits were generic parent-transfer filler.");
      }
    }
    const sharedParentWords = parents.map((parent) => {
      const words = parent.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
      return words.some((word) => description.toLowerCase().includes(word) || normalizedName.includes(word));
    });
    if (parentLevel === 0 && sharedParentWords.filter(Boolean).length === 0 && /\b(fusion|hybrid|combination|combined)\b/i.test(`${name} ${description}`)) {
      throw new Error("Generated discovery was too generic.");
    }
    return { name, description, traits: deriveTraits(name, description, traits, parents) };
  }
}

async function generateDiscovery(openai: OpenAI, parents: FusionParent[]) {
  const generatedText = await generateJsonText(openai, {
    system: PromptBuilder.systemPrompt(),
    prompt: PromptBuilder.userPrompt(parents, { realityOverride: "Speculative", fallbackMode: true }),
    maxOutputTokens: 280,
    timeoutMs: 18000,
  });
  return {
    raw: generatedText || "",
    parsed: parseJsonSafe(generatedText || ""),
  };
}

async function generateSpeculativeFallbackDiscovery(openai: OpenAI, parents: FusionParent[]) {
  const generatedText = await generateJsonText(openai, {
    system: PromptBuilder.systemPrompt(),
    prompt: PromptBuilder.userPrompt(parents, { realityOverride: "Speculative", fallbackMode: true }),
    maxOutputTokens: 300,
    timeoutMs: 14000,
  });
  return {
    raw: generatedText || "",
    parsed: parseJsonSafe(generatedText || ""),
  };
}

async function repairDiscovery(openai: OpenAI, parents: FusionParent[], rawResponse: string) {
  const repairedText = await generateJsonText(openai, {
    system: PromptBuilder.systemPrompt(),
    prompt: PromptBuilder.repairPrompt(parents, rawResponse),
    maxOutputTokens: 260,
    timeoutMs: 10000,
  });
  return parseJson(repairedText || "{}");
}

async function forceSynthesisDiscovery(openai: OpenAI, parents: FusionParent[]) {
  const generatedText = await generateJsonText(openai, {
    system: PromptBuilder.systemPrompt(),
    prompt: PromptBuilder.forcedSynthesisPrompt(parents),
    maxOutputTokens: 300,
    timeoutMs: 14000,
  });
  return {
    raw: generatedText || "",
    parsed: parseJsonSafe(generatedText || ""),
  };
}

async function generateValidatedDiscovery(openai: OpenAI, parents: FusionParent[], options: { speculative?: boolean; repairJson?: boolean } = {}) {
  const generated = options.speculative
    ? await generateSpeculativeFallbackDiscovery(openai, parents)
    : await generateDiscovery(openai, parents);
  if (!generated.parsed) {
    if (!options.repairJson) throw new Error("OpenAI did not return valid Fusion JSON.");
    const repaired = await repairDiscovery(openai, parents, generated.raw);
    return ValidationService.validate(repaired, parents, parents[0].level);
  }
  return ValidationService.validate(generated.parsed, parents, parents[0].level);
}

async function generateFastFallbackDiscovery(openai: OpenAI, parents: FusionParent[]) {
  const forced = await forceSynthesisDiscovery(openai, parents);
  if (!forced.parsed) return improvisedDiscovery(parents);
  return ValidationService.validate(forced.parsed, parents, parents[0].level);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const parents = (Array.isArray(body.parents) ? body.parents : []).map(cleanParent).slice(0, 2);
    if (parents.length !== 2 || parents.some((parent) => !parent.id || !parent.name)) {
      return jsonResponse({ error: "Two parent items are required." }, 400);
    }
    if (parents[0].id === parents[1].id) {
      return jsonResponse({ error: "Cannot fuse an item with itself." }, 400);
    }
    if (parents[0].level !== parents[1].level) {
      return jsonResponse({ error: "Fusion version 1 only supports same-level recipes." }, 400);
    }
    if (parents[0].level >= MAX_LEVEL) {
      return jsonResponse({ error: "Level 5 is the current Fusion discovery limit." }, 400);
    }

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    let lastError: unknown = null;
    try {
      return jsonResponse(await generateValidatedDiscovery(openai, parents, { repairJson: true }));
    } catch (error) {
      lastError = error;
    }
    try {
      return jsonResponse(await generateFastFallbackDiscovery(openai, parents));
    } catch (error) {
      lastError = error;
    }
    console.warn("Using improvised Fusion fallback:", lastError);
    return jsonResponse(improvisedDiscovery(parents));
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate Fusion discovery."), 500);
  }
});
