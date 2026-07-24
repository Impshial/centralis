import OpenAI from "npm:openai@^6.1.0";
import { getResponseOutputText, TEXT_MODEL } from "../_shared/openai-config.ts";
import {
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

const TARGET_FORMATS: Record<string, string> = {
  markdown: "Markdown",
  html: "HTML",
  "plain-text": "Plain Text",
  json: "JSON",
  yaml: "YAML",
  xml: "XML",
  csv: "CSV",
  tsv: "TSV",
  "sql-inserts": "SQL Inserts",
  "sql-schema": "SQL Schema",
  outline: "Outline",
  "bullet-list": "Bullet List",
  "numbered-list": "Numbered List",
  summary: "Summary",
  custom: "Custom",
};

const CUSTOM_CONVERTER_INSTRUCTIONS = [
  "Convert the provided source using the following custom instructions:",
  "",
  "The source is raw text. Preserve the meaning and useful structure.",
  "",
  "Return only the converted output. Do not explain the conversion. Do not add markdown fences unless the requested output format itself is Markdown.",
  "",
  "If the source is ambiguous, make the smallest reasonable inference needed to produce the requested format.",
].join("\n");

function normalizeInputMode(value: unknown) {
  return value === "raw" ? "raw" : "wysiwyg";
}

function cleanInput(value: unknown) {
  return String(value || "").trim();
}

function normalizeInstructions(value: unknown) {
  if (typeof value === "undefined") return undefined;
  return String(value ?? "");
}

function stripCodeFences(value: string) {
  const text = value.trim();
  const match = text.match(/^```[a-z0-9_-]*\s*([\s\S]*?)\s*```$/i);
  return (match ? match[1] : text).trim();
}

function targetInstructions(targetFormat: string) {
  switch (targetFormat) {
    case "markdown":
      return "Return valid Markdown that preserves headings, paragraphs, emphasis, links, quotes, lists, code, and tables when present.";
    case "html":
      return "Return an HTML fragment only. Do not include a full document, script tags, style tags, event handlers, markdown fences, or commentary.";
    case "plain-text":
      return "Return clean plain text with readable paragraph breaks and no markup.";
    case "json":
      return "Return valid JSON only. Infer a practical object or array shape from the source. Do not include markdown fences.";
    case "yaml":
      return "Return valid YAML only. Infer a practical structure from the source. Do not include markdown fences.";
    case "xml":
      return "Return well-formed XML only, using a sensible root element. Do not include markdown fences.";
    case "csv":
      return "Return CSV only. Include a header row when tabular fields can be inferred. Quote fields when needed.";
    case "tsv":
      return "Return tab-separated values only. Include a header row when tabular fields can be inferred.";
    case "sql-inserts":
      return "Return SQL INSERT statements only. Infer a sensible snake_case table name and columns from the source. Quote strings safely and use NULL when needed.";
    case "sql-schema":
      return "Return SQL DDL only. Infer sensible snake_case table and column names, practical SQL data types, and CREATE TABLE statements from the source. Include a primary key only when clearly appropriate. Do not include INSERT statements, markdown fences, or commentary.";
    case "outline":
      return "Return a concise hierarchical outline using indented levels.";
    case "bullet-list":
      return "Return a concise bullet list only.";
    case "numbered-list":
      return "Return a concise numbered list only.";
    case "summary":
      return "Return a concise plain-text summary only.";
    case "custom":
      return "Return only the converted output.";
    default:
      return "Return only the converted output.";
  }
}

function buildDefaultInstructions(input: {
  inputMode: string;
  targetFormat: string;
  targetLabel: string;
}) {
  if (input.targetFormat === "custom") {
    return CUSTOM_CONVERTER_INSTRUCTIONS;
  }

  const sourceDescription = "The source is raw text. Preserve the meaning and useful structure.";

  return [
    `Convert the provided source into ${input.targetLabel}.`,
    sourceDescription,
    targetInstructions(input.targetFormat),
    "Return only the converted output. Do not explain the conversion. Do not add markdown fences unless the requested output format itself is Markdown.",
    "If the source is ambiguous, make the smallest reasonable inference needed to produce the requested format.",
  ].join("\n\n");
}

function buildPrompt(input: {
  inputMode: string;
  targetFormat: string;
  targetLabel: string;
  source: string;
  instructions?: string;
}) {
  const instructions = typeof input.instructions === "string"
    ? input.instructions
    : buildDefaultInstructions({
      inputMode: input.inputMode,
      targetFormat: input.targetFormat,
      targetLabel: input.targetLabel,
    });

  return [
    instructions,
    `Source:\n${input.source}`,
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
    const inputMode = normalizeInputMode(body.inputMode);
    const targetFormat = String(body.targetFormat || "").trim();
    const targetLabel = TARGET_FORMATS[targetFormat];
    const input = cleanInput(body.input);
    const instructions = normalizeInstructions(body.instructions);

    if (!targetLabel) {
      return jsonResponse({ error: "Unsupported conversion target." }, 400);
    }

    if (!input) {
      return jsonResponse({ error: "Input text is required." }, 400);
    }

    if (input.length > 40000) {
      return jsonResponse({ error: "Input is too long to convert at once. Please shorten it and try again." }, 413);
    }

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const response = await openai.responses.create({
      model: TEXT_MODEL,
      input: [
        {
          role: "system",
          content: "You are a precise text conversion engine. Return only the requested converted output with no commentary.",
        },
        {
          role: "user",
          content: buildPrompt({
            inputMode,
            targetFormat,
            targetLabel,
            source: input,
            instructions,
          }),
        },
      ],
      max_output_tokens: 5000,
    });

    const output = stripCodeFences(getResponseOutputText(response));
    if (!output) {
      return jsonResponse({ error: "The conversion returned no output." }, 502);
    }

    return jsonResponse({ output });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not convert text."), 500);
  }
});
