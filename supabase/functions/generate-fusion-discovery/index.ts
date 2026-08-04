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
  "product",
  "material",
  "machine",
  "tool",
  "chemical",
  "biological organism",
  "food",
  "structural component",
  "industrial process",
  "real-world system",
];

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
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
  if (!fields.description) fields.description = firstCleanText(record, DESCRIPTION_KEYS, 260);
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
    description: cleanText(record.description, 180),
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
      "Every result must meaningfully inherit recognizable traits, materials, mechanisms, uses, or constraints from both parents.",
      `The result must be an identifiable ${PRODUCT_TYPES.join(", ")}, or similar concrete real-world object or system.`,
      "Avoid abstractions, magic, jokes, lore, names made by simply concatenating parent names, and unchanged parent items.",
      "For Reality Level Real, the result must already exist in the real world.",
      "For Reality Level Real, do not invent a new product. Choose the closest established product, material, food, tool, machine, organism, substance, or system that meaningfully relates to both parents.",
      "For Reality Level Real, reject generic composites, vague kits, generic workstations, and names formed mainly by joining parent words.",
      "For later reality levels, increase creative freedom gradually while staying physically or biologically coherent.",
      "The name must be concise and natural. The description must be one sentence with a concrete function and a specific contribution from both parents.",
      "Traits must be an array of 3 to 6 concise primary characteristics, such as uses, mechanisms, materials, constraints, or domains. Do not use filler traits.",
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
      `Reality Level: ${realityLevel}`,
      `Target Level: ${targetLevel}`,
      realityLevel === "Real" ? "Level 0 rule: return an already-known real item or established product category, not a newly invented fusion." : "",
      options.fallbackMode ? "Fallback mode: the real-world overlap was weak. Allow one small near-future or lightly fantastical push, but keep the result concrete, usable, and recognizably inherited from both parents. Do not use magic, generic kits, generic workstations, or parent-name mashups." : "",
      ...parentLines,
    ].filter(Boolean).join("\n");
  }

  static forcedSynthesisPrompt(parents: FusionParent[]) {
    return [
      "The previous Fusion attempts failed. Create one stronger result now.",
      "Do not return a placeholder, draft, prototype, processor, engine, device, kit, workstation, or parent-name hyphenation.",
      "Do not use the phrase \"physical traits\" or say the item performs a \"combined function\".",
      "Use the parents' traits as design constraints, not just their names.",
      "The result may take one small fantastical or near-future leap, but it must feel like a concrete named object someone could picture, build, buy, patent, eat, wear, install, or use.",
      "Return exactly one JSON object with keys: name, description, traits.",
      PromptBuilder.userPrompt(parents, { realityOverride: "Speculative", fallbackMode: true }),
    ].join("\n\n");
  }

  static repairPrompt(parents: FusionParent[], rawResponse: string) {
    return [
      "Convert the previous Fusion model response into exactly one JSON object with keys: name, description, traits.",
      "Never return an empty object. Never return null. If the previous response is empty, create a concrete fallback result from the parents.",
      "Do not add extra keys. Do not use markdown.",
      "Preserve the intended concrete result if it obeys the rules. If the previous response omitted one field, infer the missing field from the parents.",
      "The description must be one sentence with a concrete function and a specific contribution from both parents.",
      "Traits must be an array of 3 to 6 concise primary characteristics.",
      PromptBuilder.userPrompt(parents),
      `Previous response: ${rawResponse.slice(0, 1500)}`,
    ].join("\n\n");
  }
}

function singularize(value: string) {
  return value.replace(/ies$/i, "y").replace(/s$/i, "");
}

function lastMeaningfulWord(value: string) {
  const stopWords = new Set(["bag", "box", "sack", "jar", "roll", "tube", "folded", "gallon", "five", "coiled", "live", "of", "and", "the", "with", "camping"]);
  const words = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
  return singularize(words[words.length - 1] || "device");
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function parentEssence(parent: FusionParent) {
  return cleanTraits(parent.traits, [parent])[0] || getParentKeywords(parent)[0] || lastMeaningfulWord(parent.name);
}

function inventedDiscovery(parents: FusionParent[]) {
  const first = parentEssence(parents[0]);
  const second = parentEssence(parents[1]);
  const level = Math.max(parents[0].level, parents[1].level) + 1;
  const forms = level <= 2
    ? ["Rig", "Vessel", "Array", "Harness", "Module", "Apparatus"]
    : level <= 4
      ? ["Manifold", "Condenser", "Lattice", "Cradle", "Relay", "Chamber"]
      : ["Singularity", "Wellspring", "Crown", "Heart", "Gate", "Halo"];
  const form = forms[Math.abs(`${first}${second}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % forms.length];
  const coreName = `${titleCase(first)} ${titleCase(second)} ${form}`.replace(/\s+/g, " ").slice(0, 48);
  const traits = deriveTraits(coreName, "", [first, second, `${first} transfer`, `${second} control`], parents);
  return {
    name: coreName,
    description: `An invented ${form.toLowerCase()} that channels ${first} through ${second} to create a specific, usable effect beyond either parent alone.`,
    traits,
  };
}

class ValidationService {
  static validate(result: unknown, parents: FusionParent[], parentLevel: number) {
    const extracted = extractFusionFields(result);
    const name = cleanText(extracted.name, 48);
    const description = cleanText(extracted.description, 220);
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
    if (parentLevel === 0) {
      const combinedText = `${name} ${description}`.toLowerCase();
      if (/\b(useful traits|tangible item|practical workshop kit|combines useful|generic|fusion|hybrid|combination|combined)\b/i.test(combinedText)) {
        throw new Error("Generated discovery was too vague for a level 0 recipe.");
      }
      if (/\bkit\b/i.test(name) && !/\b(first aid kit|tool kit|repair kit|sewing kit|meal kit|test kit|resin kit)\b/i.test(name)) {
        throw new Error("Generated discovery invented a generic kit for a level 0 recipe.");
      }
      if (/\bworkstation\b/i.test(name) && !/\b(computer workstation|audio workstation|welding workstation|laboratory workstation|kitchen workstation)\b/i.test(name)) {
        throw new Error("Generated discovery invented a generic workstation for a level 0 recipe.");
      }
      const parentKeywordHits = parents.map((parent) => getParentKeywords(parent).some((word) => normalizedName.includes(word)));
      if (parentKeywordHits.every(Boolean)) {
        throw new Error("Generated discovery name was mainly a joined parent-name composite.");
      }
    }
    const sharedParentWords = parents.map((parent) => {
      const words = parent.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
      return words.some((word) => description.toLowerCase().includes(word) || normalizedName.includes(word));
    });
    if (parentLevel === 0 && sharedParentWords.filter(Boolean).length === 0 && /\b(fusion|hybrid|combination|combined)\b/i.test(`${name} ${description}`)) {
      throw new Error("Generated discovery was too generic.");
    }
    if (parentLevel === 0 && /\b(magic|mythic|spell|soul|dream|fantasy|impossible|teleport|warp)\b/i.test(`${name} ${description}`)) {
      throw new Error("Generated discovery violated the real-world reality level.");
    }
    return { name, description, traits: deriveTraits(name, description, traits, parents) };
  }
}

async function generateDiscovery(openai: OpenAI, parents: FusionParent[]) {
  const generatedText = await generateJsonText(openai, {
    system: PromptBuilder.systemPrompt(),
    prompt: PromptBuilder.userPrompt(parents),
    maxOutputTokens: 380,
  });
  return {
    raw: generatedText || "",
    parsed: parseJsonSafe(generatedText || ""),
  };
}

async function generateSpeculativeFallbackDiscovery(openai: OpenAI, parents: FusionParent[]) {
  const generatedText = await generateJsonText(openai, {
    system: PromptBuilder.systemPrompt(),
    prompt: PromptBuilder.userPrompt(parents, { realityOverride: "Near Future", fallbackMode: true }),
    maxOutputTokens: 400,
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
    maxOutputTokens: 340,
  });
  return parseJson(repairedText || "{}");
}

async function forceSynthesisDiscovery(openai: OpenAI, parents: FusionParent[]) {
  const generatedText = await generateJsonText(openai, {
    system: PromptBuilder.systemPrompt(),
    prompt: PromptBuilder.forcedSynthesisPrompt(parents),
    maxOutputTokens: 420,
  });
  return {
    raw: generatedText || "",
    parsed: parseJsonSafe(generatedText || ""),
  };
}

async function generateValidatedDiscovery(openai: OpenAI, parents: FusionParent[], options: { speculative?: boolean } = {}) {
  const generated = options.speculative
    ? await generateSpeculativeFallbackDiscovery(openai, parents)
    : await generateDiscovery(openai, parents);
  if (!generated.parsed) {
    try {
      const repaired = await repairDiscovery(openai, parents, generated.raw);
      return ValidationService.validate(repaired, parents, parents[0].level);
    } catch (repairError) {
      if (options.speculative || (repairError instanceof Error && /without both name and description|valid JSON/i.test(repairError.message))) {
        const forced = await forceSynthesisDiscovery(openai, parents);
        if (forced.parsed) return ValidationService.validate(forced.parsed, parents, parents[0].level);
        return inventedDiscovery(parents);
      }
      throw repairError;
    }
  }
  try {
    return ValidationService.validate(generated.parsed, parents, parents[0].level);
  } catch (validationError) {
    if (!(validationError instanceof Error) || !/without both name and description/i.test(validationError.message)) {
      throw validationError;
    }
    try {
      const repaired = await repairDiscovery(openai, parents, generated.raw);
      return ValidationService.validate(repaired, parents, parents[0].level);
    } catch (repairError) {
      if (options.speculative || (repairError instanceof Error && /without both name and description|valid JSON/i.test(repairError.message))) {
        const forced = await forceSynthesisDiscovery(openai, parents);
        if (forced.parsed) return ValidationService.validate(forced.parsed, parents, parents[0].level);
        return inventedDiscovery(parents);
      }
      throw repairError;
    }
  }
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return jsonResponse(await generateValidatedDiscovery(openai, parents));
      } catch (error) {
        lastError = error;
      }
    }
    if (parents[0].level === 0 || (lastError instanceof Error && /without both name and description/i.test(lastError.message))) {
      return jsonResponse(await generateValidatedDiscovery(openai, parents, { speculative: true }));
    }
    throw lastError instanceof Error ? lastError : new Error("Could not validate discovery.");
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate Fusion discovery."), 500);
  }
});
