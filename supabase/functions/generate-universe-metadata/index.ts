import OpenAI from "npm:openai@^6.1.0";
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

function buildPrompt(input: {
  genre: string;
  name: string;
  description: string;
}) {
  return [
    "Create metadata for a new Centralis Universe Builder universe.",
    "Return exactly one JSON object with keys: name and description.",
    "The name must be evocative, concise, and suitable for a fictional universe or setting.",
    "The description must be one vivid paragraph that establishes the premise, tone, central tensions, and worldbuilding hooks.",
    "Do not include markdown, comments, extra keys, or prose outside JSON.",
    input.genre && input.genre !== "Random"
      ? `Genre prompt helper: ${input.genre}. Use this as inspiration, not as a stored field.`
      : "Genre prompt helper: Random. Choose a coherent genre direction yourself.",
    input.name ? `User-provided name seed: ${input.name}` : "No user-provided name seed.",
    input.description ? `User-provided description seed: ${input.description}` : "No user-provided description seed.",
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

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You create concise, usable fictional universe metadata for a worldbuilding app. Respond only with valid JSON.",
      prompt: buildPrompt({ genre, name, description }),
      maxOutputTokens: 900,
    });

    const generated = parseJson(generatedText || "{}");
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
