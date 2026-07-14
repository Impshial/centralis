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

type ExistingElement = {
  id?: unknown;
  name?: unknown;
  element_type_name?: unknown;
  description?: unknown;
};

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

function cleanString(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanExistingElements(value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item: ExistingElement) => ({
      id: cleanString(item?.id, 120),
      name: cleanString(item?.name, 180),
      element_type_name: cleanString(item?.element_type_name, 120),
      description: truncate(item?.description, 420),
    }))
    .filter((item) => item.id && item.name)
    .slice(0, 80);
}

function buildPrompt(input: {
  universe: { name: string; description: string };
  elementType: { id: string; name: string };
  existingElements: Array<{ id: string; name: string; element_type_name: string; description: string }>;
  name: string;
  description: string;
}) {
  return [
    "Create metadata for one Centralis Universe Builder element.",
    "Return exactly one JSON object with keys: name and description.",
    `The element type is locked and must remain: ${input.elementType.name}. Do not change, rename, or suggest another type.`,
    "Generate only the element name and description. Do not generate Chronicle fields, module fields, relationships, images, markdown, comments, or extra keys.",
    "The name should be concise, specific, and usable as a node title.",
    FICTIONAL_NAMING_PROMPT_SECTION,
    "The description should be one vivid, useful worldbuilding paragraph that explains this element's role, hooks, tensions, and how it belongs in the universe.",
    "Avoid duplicating existing elements. If user-provided seed text exists, preserve its intent and use it to steer the result.",
    `Universe name: ${input.universe.name}`,
    input.universe.description ? `Universe description: ${input.universe.description}` : "No universe description is available.",
    input.name ? `User-provided name seed: ${input.name}` : "No user-provided name seed.",
    input.description ? `User-provided description seed: ${input.description}` : "No user-provided description seed.",
    input.existingElements.length
      ? `Existing elements for continuity and duplicate avoidance:\n${input.existingElements.map((element) => `- Type: ${element.element_type_name || "Unknown"}; Name: ${element.name}; Description: ${element.description || "None"}`).join("\n")}`
      : "No existing elements are available yet.",
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
    const universe = {
      name: cleanString(body.universe?.name, 200) || "Untitled Universe",
      description: truncate(body.universe?.description, 4000),
    };
    const elementType = {
      id: cleanString(body.elementType?.id, 120),
      name: cleanString(body.elementType?.name, 120),
    };
    if (!elementType.id || !elementType.name) {
      return jsonResponse({ error: "A selected element type is required." }, 400);
    }

    const existingElements = cleanExistingElements(body.existingElements);
    const name = truncate(body.name, 200);
    const description = truncate(body.description, 4000);
    const prompt = buildPrompt({ universe, elementType, existingElements, name, description });

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You create concise, usable fictional worldbuilding element metadata for a private universe-building app. Respond only with valid JSON.",
      prompt,
      maxOutputTokens: 900,
    });

    const generated = parseJson(generatedText || "{}");
    const generatedName = cleanString(generated.name, 200);
    const generatedDescription = cleanString(generated.description, 4000);

    if (!generatedName || !generatedDescription) {
      return jsonResponse({ error: "OpenAI did not return a name and description." }, 502);
    }

    return jsonResponse({
      name: generatedName,
      description: generatedDescription,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate element metadata."), 500);
  }
});
