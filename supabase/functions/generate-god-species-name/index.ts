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

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function buildPrompt(input: {
  name: string;
  previousName: string;
  previousScientificName: string;
  classification: string;
  category: string;
  habitat: string;
  overview: string;
  completeTraits: unknown;
}) {
  return [
    "Generate a Latinized fictional scientific binomial for a God Engine species after the user renamed its common/display name.",
    "Return exactly one JSON object with keys: scientific_name, rationale.",
    "scientific_name must be a plausible Latinized binomial: Genus species. It should be pronounceable, understated, and biological rather than fantasy-styled.",
    "Use the renamed display name as the strongest naming signal, but also respect the organism's anatomy, habitat, classification, and previous taxonomy.",
    "If the previous scientific name is a valid binomial and the rename still describes the same genus-level organism, preserve the genus and create a better species epithet.",
    "If the renamed display name implies a different common convention but not a different biological genus, do not invent a new genus.",
    "Do not use placeholder names such as Species manualis, Manualis organismus, Userdefined, Starterus, Creatura, or anything derived from 'manual starter'.",
    "Do not include markdown, explanations outside JSON, authorship, taxonomic ranks, parentheses, or extra keys.",
    `New display name: ${input.name}`,
    input.previousName ? `Previous display name: ${input.previousName}` : "No previous display name.",
    input.previousScientificName ? `Previous scientific name: ${input.previousScientificName}` : "No previous scientific name.",
    input.classification ? `Classification: ${input.classification}` : "No classification.",
    input.category ? `Category: ${input.category}` : "No category.",
    input.habitat ? `Habitat: ${input.habitat}` : "No habitat.",
    input.overview ? `Overview: ${input.overview}` : "No overview.",
    `Complete traits: ${JSON.stringify(input.completeTraits || {})}`,
  ].join("\n\n");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const name = cleanText(body.name, 180);
    if (!name) return jsonResponse({ error: "A species name is required." }, 400);

    const species = asRecord(body.species);
    const prompt = buildPrompt({
      name,
      previousName: cleanText(species.name, 180),
      previousScientificName: cleanText(species.scientific_name || species.scientificName, 180),
      classification: cleanText(species.classification, 180),
      category: cleanText(species.category, 120),
      habitat: cleanText(species.habitat, 400),
      overview: cleanText(species.overview, 1000),
      completeTraits: asRecord(species.complete_traits || species.completeTraits),
    });

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You generate strict JSON for fictional biological taxonomy. Return only valid JSON.",
      prompt,
      maxOutputTokens: 450,
    });
    const parsed = asRecord(parseJson(generatedText || "{}"));
    const scientificName = cleanText(parsed.scientific_name || parsed.scientificName, 180);
    if (!/^[A-Z][a-z]+ [a-z][a-z-]+$/.test(scientificName)) {
      throw new Error("AI returned an invalid scientific binomial.");
    }

    return jsonResponse({
      scientific_name: scientificName,
      rationale: cleanText(parsed.rationale, 500),
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate species scientific name."), 500);
  }
});
