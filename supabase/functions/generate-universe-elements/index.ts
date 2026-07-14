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

type AllowedElementType = {
  id?: unknown;
  name?: unknown;
};

type ExistingElement = {
  id?: unknown;
  name?: unknown;
  element_type_name?: unknown;
  description?: unknown;
};

type SourceElement = ExistingElement & {
  nodeId?: unknown;
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

function cleanTempId(value: unknown, fallback: string) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || fallback;
}

function cleanCount(value: unknown) {
  const count = Math.round(Number(value || 12));
  if (!Number.isFinite(count)) return 12;
  return Math.min(50, Math.max(1, count));
}

function cleanDensity(value: unknown) {
  const density = String(value || "balanced").toLowerCase();
  return ["sparse", "balanced", "dense"].includes(density) ? density : "balanced";
}

function cleanAllowedTypes(value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item: AllowedElementType) => ({
      id: cleanString(item?.id, 120),
      name: cleanString(item?.name, 120),
    }))
    .filter((item) => item.name)
    .slice(0, 80);
}

function cleanExistingElements(value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item: ExistingElement) => ({
      id: cleanString(item?.id, 120),
      name: cleanString(item?.name, 180),
      element_type_name: cleanString(item?.element_type_name, 120),
      description: truncate(item?.description, 500),
    }))
    .filter((item) => item.id && item.name)
    .slice(0, 120);
}

function cleanSourceElement(value: unknown) {
  const row = value && typeof value === "object" ? value as SourceElement : null;
  if (!row) return null;
  const source = {
    id: cleanString(row.id, 120),
    name: cleanString(row.name, 180),
    element_type_name: cleanString(row.element_type_name, 120),
    description: truncate(row.description, 1200),
  };
  return source.id && source.name ? source : null;
}

function getLinkLimit(count: number, density: string) {
  const ratio = {
    sparse: 0.25,
    balanced: 0.5,
    dense: 1,
  }[density] || 0.5;
  return Math.max(0, Math.ceil(count * ratio));
}

function isUsefulLinkLabel(value: string) {
  const label = value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!label) return false;
  const weakLabels = new Set([
    "associated with",
    "branches to",
    "connected to",
    "connects to",
    "has connection to",
    "influences",
    "is associated with",
    "is connected to",
    "is linked to",
    "leads to",
    "linked to",
    "relates to",
    "related to",
    "ties to",
  ]);
  return !weakLabels.has(label);
}

function cleanGeneratedPayload(payload: unknown, count: number, density: string) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const elements = (Array.isArray(record.elements) ? record.elements : [])
    .map((item, index) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        temp_id: cleanTempId(row.temp_id || row.tempId || row.id, `generated-${index + 1}`),
        name: cleanString(row.name, 200),
        description: cleanString(row.description, 4000),
        element_type_name: cleanString(row.element_type_name || row.elementTypeName || row.type, 120),
      };
    })
    .filter((item) => item.name && item.description)
    .slice(0, count);

  const links = (Array.isArray(record.links) ? record.links : [])
    .map((item, index) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        id: cleanTempId(row.id, `link-${index + 1}`),
        source: cleanString(row.source || row.source_id || row.source_temp_id || row.source_existing_id || row.source_name, 200),
        target: cleanString(row.target || row.target_id || row.target_temp_id || row.target_existing_id || row.target_name, 200),
        label: cleanString(row.label || row.relationship, 120),
      };
    })
    .filter((item) => item.source && item.target && item.source !== item.target && isUsefulLinkLabel(item.label))
    .slice(0, getLinkLimit(elements.length || count, density));

  return { elements, links };
}

function buildPrompt(input: {
  universe: { name: string; description: string };
  sourceElement: { id: string; name: string; element_type_name: string; description: string } | null;
  allowedTypes: Array<{ id: string; name: string }>;
  existingElements: Array<{ id: string; name: string; element_type_name: string; description: string }>;
  count: number;
  density: string;
  instructions: string;
}) {
  const densityGuidance = {
    sparse: "Create roughly 0.2 to 0.3 relationships per generated element. Only the most obvious concrete connections should exist.",
    balanced: "Create roughly 0.4 to 0.6 relationships per generated element. Prefer fewer, stronger connections over a busy graph.",
    dense: "Create roughly 0.8 to 1 relationship per generated element. Dense still means curated and concrete, not everything connected to everything.",
  }[input.density] || "Create a balanced set of meaningful relationships.";

  return [
    "Generate Centralis Universe Builder worldbuilding elements.",
    "Return exactly one JSON object with keys: elements and links.",
    "Use only the allowed element type names provided below. If the requested idea needs a type, choose the closest allowed type.",
    "Each generated element must have: temp_id, name, description, element_type_name.",
    FICTIONAL_NAMING_PROMPT_SECTION,
    "Descriptions should be substantial and useful for worldbuilding: aim for 3 to 5 detailed sentences per element, roughly 80 to 140 words when appropriate.",
    "Each description should include concrete setting details, role/purpose, conflicts or tensions, notable traits, and at least one story or worldbuilding hook. Avoid vague summaries and avoid filler.",
    "Links are optional. Each included link must have: source, target, label.",
    "Link direction is parent/source/upstream cause -> child/target/downstream result. The target is the child node and will receive the connection on its left side in the canvas.",
    "Every generated element should have one incoming parent link. The parent may be the literal value \"universe\", the literal value \"source\", an existing element ID, or another generated temp_id. Do not make a generated node point back to its parent just to phrase the label naturally.",
    "Only create a link when the relationship is concrete, direct, and legible from the two node descriptions plus the link label. Do not create links for broad theme, tone, category, mood, vague influence, or hidden backstory.",
    "The link label must explain the relationship by itself as a specific verb phrase or short predicate, such as 'funds', 'guards', 'records evidence for', 'shelters fugitives from', 'manufactures', 'commands', 'rivals', 'enforces', 'supplies', 'was founded by', or 'contests jurisdiction with'.",
    "Do not use vague labels such as 'related to', 'connected to', 'linked to', 'associated with', 'influences', 'branches to', or 'leads to'.",
    "If explaining why two nodes are linked would require an extra paragraph, do not link them directly. Instead, either omit the link or create an intermediary element that makes the relationship visible.",
    input.sourceElement
      ? "Include at least one clear source-to-generated anchor link from the literal value \"source\" to the most central generated element when any elements are generated. Additional source links are allowed only when concrete and visible."
      : "Include at least one clear universe-to-generated anchor link from the literal value \"universe\" to the most central generated element when any elements are generated. Additional universe links are allowed only when concrete and visible.",
    "Generated components should not float without any path back to the generation source. If a subgroup has no concrete relationship to the source, create an intermediary element that explains the connection or omit that subgroup. Do not return orphan generated nodes.",
    input.sourceElement
      ? "For link source/target, use generated temp_id values, existing element IDs, the literal value \"source\" for the source element, or the literal value \"universe\"."
      : "For link source/target, use generated temp_id values, existing element IDs, or the literal value \"universe\".",
    "Do not include markdown, comments, extra prose, or keys outside the JSON object.",
    `Generate up to ${input.count} elements. Prefer fewer high-quality elements over filler if fewer make better sense.`,
    input.sourceElement
      ? "Design the generated element set as a logical branching cloud outward from the source element. Generated elements should expand, support, oppose, inhabit, explain, descend from, belong to, or otherwise meaningfully relate to the source element. Use the longer descriptions to make each branch feel specific and usable immediately."
      : "Design the generated element set as a logical expanding cloud outward from the Universe node: related ideas should be near each other conceptually, but not every element needs a direct connection. Use the longer descriptions to make each element feel specific and usable immediately.",
    input.sourceElement
      ? "Do not connect every generated element directly to the source. Use a few source-to-generated links only when the source description and generated node description make that relationship visible. Use generated-to-generated links only for concrete chains, clusters, and outward branches."
      : "Links should be selective and meaningful rather than exhaustive.",
    `Relationship density: ${input.density}. ${densityGuidance}`,
    `Universe name: ${input.universe.name}`,
    input.universe.description ? `Universe description: ${input.universe.description}` : "No universe description is available.",
    input.sourceElement
      ? `Source element to expand:\n- ID: ${input.sourceElement.id}; Type: ${input.sourceElement.element_type_name || "Unknown"}; Name: ${input.sourceElement.name}; Description: ${input.sourceElement.description || "None"}`
      : "No source element is selected; generate from the universe as a whole.",
    `Allowed element types:\n${input.allowedTypes.map((type) => `- ${type.name}`).join("\n")}`,
    input.existingElements.length
      ? `Existing elements for context and optional linking:\n${input.existingElements.map((element) => `- ID: ${element.id}; Type: ${element.element_type_name || "Unknown"}; Name: ${element.name}; Description: ${element.description || "None"}`).join("\n")}`
      : "No existing elements are available yet.",
    input.instructions ? `User instructions:\n${input.instructions}` : "No extra user instructions.",
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
    const sourceElement = cleanSourceElement(body.sourceElement);
    const allowedTypes = cleanAllowedTypes(body.allowedElementTypes);
    if (!allowedTypes.length) {
      return jsonResponse({ error: "At least one allowed element type is required." }, 400);
    }

    const existingElements = cleanExistingElements(body.existingElements);
    const count = cleanCount(body.count);
    const density = cleanDensity(body.relationshipDensity);
    const instructions = truncate(body.instructions, 4000);
    const prompt = buildPrompt({
      universe,
      sourceElement,
      allowedTypes,
      existingElements,
      count,
      density,
      instructions,
    });

    if (body.previewOnly === true) {
      return jsonResponse({
        prompt,
        request: {
          universe,
          sourceElement,
          allowedElementTypes: allowedTypes,
          existingElements,
          count,
          relationshipDensity: density,
          linkLimit: getLinkLimit(count, density),
          instructions,
        },
      });
    }

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You generate structured fictional worldbuilding elements for a private universe-building app. Respond only with valid JSON.",
      prompt,
      maxOutputTokens: Math.min(7500, 1200 + count * 260),
    });

    const generated = cleanGeneratedPayload(parseJson(generatedText || "{}"), count, density);
    if (!generated.elements.length) {
      return jsonResponse({ error: "OpenAI did not return usable generated elements." }, 502);
    }

    return jsonResponse(generated);
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate universe elements."), 500);
  }
});
