import OpenAI from "npm:openai@^6.1.0";
import { generateJsonText } from "../_shared/openai-config.ts";
import {
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

const MAX_SOURCE_CHARACTERS = 180000;

function truncateSource(value: unknown) {
  const text = String(value || "").trim();
  if (text.length <= MAX_SOURCE_CHARACTERS) return text;
  return [
    text.slice(0, Math.floor(MAX_SOURCE_CHARACTERS * 0.72)),
    "\n\n<!-- CENTRALIS_TRUNCATED_MIDDLE: source was too large for one model request. Preserve selector reasoning from visible structure. -->\n\n",
    text.slice(-Math.floor(MAX_SOURCE_CHARACTERS * 0.28)),
  ].join("");
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

function cleanSelector(value: unknown, maxLength = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMode(value: unknown) {
  const mode = String(value || "").trim();
  return ["auto", "selector", "first", "second", "none"].includes(mode) ? mode : "auto";
}

function cleanSpeaker(value: unknown, fallback: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || fallback;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function cleanTextEntry(value: unknown) {
  const entry = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const side = String(entry.side || "").trim() === "user" ? "user" : "others";
  const speaker = cleanSpeaker(entry.speaker, side === "user" ? "Adam" : "Others");
  const text = String(entry.text || entry.content || entry.message || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, 12000);
  if (!text) return null;
  return { side, speaker, text };
}

function buildHtmlPrompt(source: string) {
  return [
    "You are helping Centralis Chat Repository parse an unknown HTML chat export.",
    "Centralis will generate the final HTML locally. You must not return generated transcript HTML.",
    "Your job is only to inspect the supplied HTML and answer the parsing questions as JSON.",
    "",
    "Centralis needs to extract chronological message entries. Each entry needs:",
    "- messageSelector: a CSS selector that matches each message row/turn/container in order.",
    "- contentSelector: optional CSS selector inside each message container that contains only the message text/body. Return empty string if the whole message container should be used.",
    "- userMode: one of auto, selector, first, second, none.",
    "- userSelector: CSS selector/class used to identify the user's own messages when userMode is selector. Return empty string otherwise.",
    "- userSpeaker: short speaker label for the user's own messages.",
    "- othersSpeaker: short speaker label for non-user messages.",
    "- confidence: number from 0 to 1.",
    "- notes: concise explanation of why the selectors were chosen.",
    "",
    "Important rules:",
    "- Prefer stable semantic selectors over brittle generated class names.",
    "- If the same message content exists in nested elements, choose the selector that matches the outer message row, not every paragraph.",
    "- If author role attributes exist, prefer those.",
    "- If messages alternate but no role markers exist, use userMode first or second.",
    "- If you cannot identify the user's side, use userMode none.",
    "- Do not include markdown. Return exactly one JSON object.",
    "",
    "Examples:",
    "1. For `<div class=\"message-item reverse\"><div class=\"text\">Hi</div></div><div class=\"message-item\"><div class=\"text\">Hello</div></div>` return:",
    `{"messageSelector":".message-item","contentSelector":".text","userMode":"selector","userSelector":".reverse","userSpeaker":"Adam","othersSpeaker":"Others","confidence":0.98,"notes":"message-item repeats and reverse marks user messages."}`,
    "2. For `<article data-message-author-role=\"user\"><div class=\"markdown\">Hi</div></article><article data-message-author-role=\"assistant\"><div class=\"markdown\">Hello</div></article>` return:",
    `{"messageSelector":"[data-message-author-role]","contentSelector":".markdown","userMode":"selector","userSelector":"[data-message-author-role='user']","userSpeaker":"Adam","othersSpeaker":"Assistant","confidence":0.98,"notes":"author role attribute identifies message side."}`,
    "3. For `<li class=\"bubble mine\"><p>Hi</p></li><li class=\"bubble theirs\"><p>Hello</p></li>` return:",
    `{"messageSelector":".bubble","contentSelector":"","userMode":"selector","userSelector":".mine","userSpeaker":"Adam","othersSpeaker":"Others","confidence":0.9,"notes":"bubble repeats and mine marks user messages."}`,
    "",
    "HTML to inspect:",
    source,
  ].join("\n");
}

function buildJsonPrompt(source: string) {
  return [
    "You are helping Centralis Chat Repository parse an unknown JSON chat export.",
    "Centralis will generate the final HTML locally. You must not return generated transcript HTML.",
    "Your job is only to inspect the supplied JSON and answer the extraction questions as JSON.",
    "",
    "Centralis needs to extract chronological message entries. Return exactly one JSON object with:",
    "- sourceType: exactly \"json\".",
    "- messagePath: dot path to the array of message objects. Use * when all children should be traversed, for example conversations.0.messages or data.threads.*.messages.",
    "- textPath: dot path inside each message object for the message text/content.",
    "- rolePath: optional dot path inside each message object for role/sender/author type.",
    "- speakerPath: optional dot path inside each message object for display speaker name.",
    "- userRoleValues: array of role/sender values that mean the user's own messages.",
    "- othersRoleValues: array of role/sender values that mean non-user, assistant, model, character, or other messages.",
    "- userSpeaker: short speaker label for the user's own messages.",
    "- othersSpeaker: short speaker label for non-user messages.",
    "- confidence: number from 0 to 1.",
    "- notes: concise explanation of why the paths were chosen.",
    "",
    "Important rules:",
    "- Do not choose paths to metadata, summaries, prompt settings, model names, or timestamps as message text.",
    "- Prefer arrays named messages, turns, entries, transcript, conversation, history, or chat when they contain chronological objects.",
    "- If content is an array of parts, choose the path to that array or the nested text field that contains readable text.",
    "- If there are multiple conversations, choose the main chronological message array, not a sidebar list or index.",
    "- If the input is JSONL, treat each line after metadata as one message record and use messagePath as empty string.",
    "- Common JSONL chat exports may use fields like mes for content, is_user for user side, name for speaker, send_date for timestamp, and swipes as alternate message drafts.",
    "- Prefer mes/current selected content over swipes unless the file clearly indicates a chosen swipe should replace it.",
    "- If you cannot identify roles, return empty rolePath and empty role value arrays.",
    "- Do not include markdown. Return exactly one JSON object.",
    "",
    "Examples:",
    "1. For `{ \"messages\": [{\"role\":\"user\",\"content\":\"Hi\"},{\"role\":\"assistant\",\"content\":\"Hello\"}] }` return:",
    `{"sourceType":"json","messagePath":"messages","textPath":"content","rolePath":"role","speakerPath":"","userRoleValues":["user"],"othersRoleValues":["assistant"],"userSpeaker":"Adam","othersSpeaker":"Assistant","confidence":0.99,"notes":"messages is the chronological array and role/content are direct fields."}`,
    "2. For `{ \"chat\": { \"turns\": [{\"from\":\"me\",\"body\":\"Hi\"},{\"from\":\"character\",\"body\":\"Hello\"}] } }` return:",
    `{"sourceType":"json","messagePath":"chat.turns","textPath":"body","rolePath":"from","speakerPath":"from","userRoleValues":["me"],"othersRoleValues":["character"],"userSpeaker":"Adam","othersSpeaker":"Character","confidence":0.95,"notes":"chat.turns contains the ordered dialogue and from identifies the side."}`,
    "3. For `{ \"data\": { \"conversation\": [{\"author\":{\"role\":\"user\",\"name\":\"Adam\"},\"parts\":[\"Hi\"]}] } }` return:",
    `{"sourceType":"json","messagePath":"data.conversation","textPath":"parts","rolePath":"author.role","speakerPath":"author.name","userRoleValues":["user"],"othersRoleValues":["assistant","model","character"],"userSpeaker":"Adam","othersSpeaker":"Others","confidence":0.9,"notes":"conversation contains message records and parts contains text."}`,
    "4. For JSONL like `{\"user_name\":\"You\",\"character_name\":\"Dungeon\"}\\n{\"name\":\"Dungeon\",\"is_user\":false,\"mes\":\"Hello\"}\\n{\"name\":\"You\",\"is_user\":true,\"mes\":\"Hi\"}` return:",
    `{"sourceType":"json","messagePath":"","textPath":"mes","rolePath":"is_user","speakerPath":"name","userRoleValues":[true],"othersRoleValues":[false],"userSpeaker":"Adam","othersSpeaker":"Dungeon","confidence":0.97,"notes":"Each JSONL message line has mes content and is_user marks the side; the first metadata line has no mes and should be ignored."}`,
    "",
    "JSON to inspect:",
    source,
  ].join("\n");
}

function buildTextPrompt(source: string) {
  return [
    "You are helping Centralis Chat Repository parse a plain text or Markdown chat transcript.",
    "Centralis will generate the final HTML locally. You must not return generated transcript HTML.",
    "Your job is to extract chronological chat entries as JSON.",
    "",
    "Return exactly one JSON object with:",
    "- sourceType: exactly \"text\".",
    "- entries: an array of chronological message objects.",
    "- Each entry must have side, speaker, and text.",
    "- side must be exactly \"user\" for the user's own messages or \"others\" for assistant, character, bot, narrator, system, or other messages.",
    "- speaker should be a short display name such as Adam, You, Assistant, Character, Narrator, or the character name found in the transcript.",
    "- text should contain only the message body, preserving paragraph breaks and Markdown emphasis when useful.",
    "- confidence: number from 0 to 1.",
    "- notes: concise explanation of how the transcript was split.",
    "",
    "Important rules:",
    "- Preserve chronological order.",
    "- Do not invent missing messages.",
    "- Do not include titles, summaries, front matter, file metadata, timestamps, or separators as standalone chat messages unless they are clearly part of a message body.",
    "- Recognize common patterns like `User: text`, `Assistant: text`, `You: text`, `Character: text`, Markdown headings, blockquotes, chat logs separated by blank lines, and role labels.",
    "- If messages are alternating but speaker labels are missing, infer side conservatively and explain that in notes.",
    "- Do not include markdown outside the JSON object.",
    "",
    "Examples:",
    "1. For `You: Hi\\nAssistant: Hello` return:",
    `{"sourceType":"text","entries":[{"side":"user","speaker":"Adam","text":"Hi"},{"side":"others","speaker":"Assistant","text":"Hello"}],"confidence":0.98,"notes":"Colon-prefixed speaker labels split the transcript."}`,
    "2. For Markdown `## You\\nI enter the room.\\n\\n## Dungeon Master\\nThe door closes.` return:",
    `{"sourceType":"text","entries":[{"side":"user","speaker":"Adam","text":"I enter the room."},{"side":"others","speaker":"Dungeon Master","text":"The door closes."}],"confidence":0.95,"notes":"Markdown headings identify each message speaker."}`,
    "",
    "Text or Markdown to inspect:",
    source,
  ].join("\n");
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
    const requestedSourceType = String(body.sourceType || (body.json ? "json" : body.text ? "text" : "html")).toLowerCase();
    const sourceType = ["json", "text"].includes(requestedSourceType) ? requestedSourceType : "html";
    const source = truncateSource(sourceType === "json" ? body.json : sourceType === "text" ? body.text : body.html);
    if (!source) {
      return jsonResponse({ error: `${sourceType} is required.` }, 400);
    }

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const generatedText = await generateJsonText(openai, {
      system: sourceType === "json"
        ? "You analyze JSON chat exports and return only valid JSON extraction instructions."
        : sourceType === "text"
          ? "You extract chat transcript entries from text or Markdown and return only valid JSON."
          : "You analyze HTML chat exports and return only valid JSON parsing instructions.",
      prompt: sourceType === "json" ? buildJsonPrompt(source) : sourceType === "text" ? buildTextPrompt(source) : buildHtmlPrompt(source),
      maxOutputTokens: sourceType === "text" ? 8000 : 900,
    });

    const generated = parseJson(generatedText || "{}");
    const result = sourceType === "text"
      ? {
        sourceType: "text",
        entries: Array.isArray(generated.entries)
          ? generated.entries.map(cleanTextEntry).filter(Boolean).slice(0, 300)
          : [],
        confidence: Math.max(0, Math.min(1, Number(generated.confidence || 0))),
        notes: String(generated.notes || "").replace(/\s+/g, " ").trim().slice(0, 1000),
        truncated: source.length >= MAX_SOURCE_CHARACTERS,
      }
      : sourceType === "json"
      ? {
        sourceType: "json",
        messagePath: cleanSelector(generated.messagePath),
        textPath: cleanSelector(generated.textPath),
        rolePath: cleanSelector(generated.rolePath),
        speakerPath: cleanSelector(generated.speakerPath),
        userRoleValues: cleanStringArray(generated.userRoleValues),
        othersRoleValues: cleanStringArray(generated.othersRoleValues),
        userSpeaker: cleanSpeaker(generated.userSpeaker, "Adam"),
        othersSpeaker: cleanSpeaker(generated.othersSpeaker, "Others"),
        confidence: Math.max(0, Math.min(1, Number(generated.confidence || 0))),
        notes: String(generated.notes || "").replace(/\s+/g, " ").trim().slice(0, 1000),
        truncated: source.length >= MAX_SOURCE_CHARACTERS,
      }
      : {
        sourceType: "html",
        messageSelector: cleanSelector(generated.messageSelector),
        contentSelector: cleanSelector(generated.contentSelector),
        userMode: cleanMode(generated.userMode),
        userSelector: cleanSelector(generated.userSelector),
        userSpeaker: cleanSpeaker(generated.userSpeaker, "Adam"),
        othersSpeaker: cleanSpeaker(generated.othersSpeaker, "Others"),
        confidence: Math.max(0, Math.min(1, Number(generated.confidence || 0))),
        notes: String(generated.notes || "").replace(/\s+/g, " ").trim().slice(0, 1000),
        truncated: source.length >= MAX_SOURCE_CHARACTERS,
      };

    if (sourceType === "text" && (!("entries" in result) || !result.entries.length)) {
      return jsonResponse({ error: "OpenAI did not extract any text entries.", analysis: result }, 502);
    }
    if (sourceType === "json" && (!("messagePath" in result) || !("textPath" in result) || !result.textPath)) {
      return jsonResponse({ error: "OpenAI did not identify JSON message and text paths.", analysis: result }, 502);
    }
    if (sourceType === "html" && (!("messageSelector" in result) || !result.messageSelector)) {
      return jsonResponse({ error: "OpenAI did not identify a message selector.", analysis: result }, 502);
    }
    if ("userMode" in result && result.userMode === "selector" && !result.userSelector) {
      result.userMode = "auto";
    }

    return jsonResponse(result);
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not analyze chat log layout."), 500);
  }
});
