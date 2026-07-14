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

function cleanTitle(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function cleanSummary(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function buildPrompt(input: {
  instructions: string;
  chatText: string;
  totalEntryCount: number;
  userEntryCount: number;
  othersEntryCount: number;
}) {
  return [
    "Create metadata for a Centralis Chat Repository import.",
    "Return exactly one JSON object with keys: title and summary.",
    "The title must be concise, story-like, and 80 characters or fewer when possible.",
    "If the title introduces or reshapes any fictional proper name, apply the naming rules below.",
    FICTIONAL_NAMING_PROMPT_SECTION,
    "The summary must be spoiler-light, non-graphic, and focused on setup, character dynamics, stakes, mood, and emotional tone.",
    "If sexual or explicit content appears, do not describe it graphically; summarize only its narrative relevance in neutral terms.",
    "Do not include markdown, HTML, comments, or prose outside JSON.",
    `Entry counts: ${input.totalEntryCount} chronological entries, ${input.userEntryCount} Adam/user entries, ${input.othersEntryCount} others entries.`,
    input.instructions ? `User import instructions:\n${input.instructions}` : "",
    `Chat transcript excerpt:\n${input.chatText}`,
  ].filter(Boolean).join("\n\n");
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
    const chatText = truncate(body.chatText, 14000);
    if (!chatText) {
      return jsonResponse({ error: "chatText is required." }, 400);
    }

    const totalEntryCount = Math.max(0, Math.round(Number(body.totalEntryCount || 0)));
    const userEntryCount = Math.max(0, Math.round(Number(body.userEntryCount || 0)));
    const othersEntryCount = Math.max(0, Math.round(Number(body.othersEntryCount || 0)));
    const instructions = truncate(body.instructions, 4000);
    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: "You create safe, concise metadata for private story-like chat logs. Respond only with valid JSON.",
      prompt: buildPrompt({
        instructions,
        chatText,
        totalEntryCount,
        userEntryCount,
        othersEntryCount,
      }),
      maxOutputTokens: 700,
    });

    const generated = parseJson(generatedText || "{}");
    const title = cleanTitle(generated.title);
    const summary = cleanSummary(generated.summary);
    if (!title || !summary) {
      return jsonResponse({ error: "OpenAI did not return a title and summary." }, 502);
    }

    return jsonResponse({ title, summary });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate chat log metadata."), 500);
  }
});
