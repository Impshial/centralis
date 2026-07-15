import OpenAI from "npm:openai@^6.1.0";
import { FICTIONAL_NAMING_PROMPT_SECTION } from "../_shared/fictional-naming-rules.ts";
import { generateJsonText } from "../_shared/openai-config.ts";
import {
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

function truncate(value: unknown, maxLength: number) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 20).trimEnd()}... [truncated]`;
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

function cleanName(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function cleanDescription(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function cleanGenre(value: unknown, fallback = "") {
  const genre = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return genre || fallback;
}

function extractIdeas(payload: unknown, fallbackGenre = "") {
  const record = payload as Record<string, unknown>;
  const rawIdeas = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.ideas)
      ? record.ideas
      : Array.isArray(record?.universes)
        ? record.universes
        : Array.isArray(record?.concepts)
          ? record.concepts
          : record?.name || record?.description
            ? [record]
            : [];

  return rawIdeas
    .map((idea: unknown) => {
      const ideaRecord = idea as Record<string, unknown>;
      return {
        name: cleanName(ideaRecord?.name),
        genre: cleanGenre(ideaRecord?.genre || ideaRecord?.category, fallbackGenre),
        description: cleanDescription(ideaRecord?.description),
      };
    })
    .filter((idea: { name: string; genre: string; description: string }) => idea.name && idea.description);
}

function buildPrompt(input: {
  genre: string;
  name: string;
  description: string;
  count: number;
}) {
  const isMultiMode = input.count > 1;
  return [
    "Create metadata for a new Centralis Universe Builder universe.",
    isMultiMode
      ? `Return exactly one JSON object with one key, ideas. ideas must be an array containing exactly ${input.count} objects. Each object must have keys: name, genre, and description.`
      : "Return exactly one JSON object with keys: name and description.",
    isMultiMode ? `Do not return fewer than ${input.count} ideas.` : "",
    "The name must be evocative, concise, and suitable for a fictional universe or setting.",
    input.name
      ? (isMultiMode
        ? "A user-provided name is a required title basis. Every returned idea must use a distinct modified, expanded, or otherwise recognizable variation of that name; do not replace it with unrelated titles. Retain at least one distinctive word or root from the provided name in each title."
        : "A user-provided name is a required title basis. Return a modified, expanded, or otherwise recognizable variation of it as the universe title; do not replace it with an unrelated title. Retain at least one distinctive word or root from the provided name.")
      : "No title basis was provided; create an original title.",
    FICTIONAL_NAMING_PROMPT_SECTION,
    isMultiMode ? "Each genre must be a concise, useful genre label for that idea. If a specific genre helper is provided, use it or a more specific subgenre that fits the idea." : "",
    "Each description must be one vivid paragraph that establishes the premise, tone, central tensions, and worldbuilding hooks.",
    isMultiMode ? "Make the ideas meaningfully different from one another in premise, tone, and worldbuilding focus." : "",
    "Do not include markdown, comments, extra keys, or prose outside JSON.",
    input.genre && input.genre !== "Random"
      ? `Genre prompt helper: ${input.genre}. Use this as inspiration, not as a stored field.`
      : "Genre prompt helper: Random. Choose a coherent genre direction yourself.",
    input.name ? `User-provided title basis: ${input.name}` : "No user-provided title basis.",
    input.description ? `User-provided description guidance: ${input.description}` : "No user-provided description guidance.",
  ].join("\n\n");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const genre = truncate(body.genre || "Random", 120) || "Random";
    const name = truncate(body.name, 200);
    const description = truncate(body.description, 4000);
    const count = Math.max(1, Math.min(10, Number.parseInt(String(body.count || "1"), 10) || 1));

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You create concise, usable fictional universe metadata for a worldbuilding app. Respond only with valid JSON.",
      prompt: buildPrompt({ genre, name, description, count }),
      maxOutputTokens: Math.min(4500, 900 + count * 520),
    });

    const generated = parseJson(generatedText || "{}");
    if (count > 1) {
      const fallbackGenre = genre && genre !== "Random" ? genre : "AI-selected genre";
      const ideas = extractIdeas(generated, fallbackGenre).slice(0, count);

      if (!ideas.length) {
        return jsonResponse({ error: "OpenAI did not return usable universe ideas." }, 502);
      }

      return jsonResponse({
        ideas,
        warning: ideas.length < count
          ? `OpenAI returned ${ideas.length} usable universe ${ideas.length === 1 ? "idea" : "ideas"} instead of ${count}.`
          : undefined,
      });
    }

    const generatedName = cleanName(generated.name);
    const generatedDescription = cleanDescription(generated.description);

    if (!generatedName || !generatedDescription) {
      return jsonResponse({ error: "OpenAI did not return a name and description." }, 502);
    }

    return jsonResponse({
      name: generatedName,
      description: generatedDescription,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate universe metadata."), 500);
  }
});
