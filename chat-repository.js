const chatRepositorySupabase = window.centralisSupabase;
const CHAT_VIEW_KEY = "centralis-chat-repository-view";
const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;
const CHAT_SEARCH_DEBOUNCE_MS = 250;
const CHAT_IMAGE_PROMPT_MAX_LENGTH = 3900;
const CHAT_IMAGE_TEXT_MAX_LENGTH = 2600;
const CHAT_RAW_IMPORT_INSTRUCTIONS_KEY = "centralis-chat-raw-import-instructions";
const CHAT_RAW_METADATA_TEXT_MAX_LENGTH = 14000;
const CHAT_DEEP_LINK_PARAMS = ["chatLogId", "chat"];
const VALID_CHAT_VIEWS = new Set(["card", "wide", "list"]);
const RAW_CHAT_ALLOWED_TAGS = new Set(["p", "br", "em", "i", "strong", "b", "ul", "ol", "li", "blockquote"]);
const DEFAULT_RAW_IMPORT_INSTRUCTIONS = [
  "Adam is the left-side/user speaker.",
  "Create a concise story title and a spoiler-light summary.",
  "If adult content is present, keep the title and summary non-graphic and focused on story, character dynamics, stakes, and emotional tone.",
  "Do not generate HTML. Centralis will handle layout.",
].join("\n");

const chatRepositoryState = {
  appUser: null,
  chatLogs: [],
  view: VALID_CHAT_VIEWS.has(localStorage.getItem(CHAT_VIEW_KEY))
    ? localStorage.getItem(CHAT_VIEW_KEY)
    : "card",
  readerObjectUrl: "",
  editorObjectUrl: "",
  rawImportObjectUrl: "",
  sourceEditor: null,
  modalTrigger: null,
  uploading: false,
  saving: false,
  deleting: false,
  readingChatLogId: "",
  editingChatLogId: "",
  editorPreviewTimer: 0,
  searchQuery: "",
  searchTimer: 0,
  reindexing: false,
  deepLinkedChatLogOpened: false,
  generatingImageIds: new Set(),
  uploadingImage: false,
  rawImporting: false,
  rawImportGeneratedHtml: "",
  rawImportParsed: null,
  imagePromptRequest: null,
};

const chatEls = {
  grid: document.querySelector("[data-chat-log-grid]"),
  count: document.querySelector("[data-chat-log-count]"),
  status: document.querySelector("[data-chat-repository-status]"),
  search: document.querySelector("[data-chat-search]"),
  viewButtons: [...document.querySelectorAll("[data-chat-view]")],
  uploadOpen: document.querySelector("[data-open-chat-upload]"),
  uploadModal: document.getElementById("chat-upload-modal"),
  uploadForm: document.querySelector("[data-chat-upload-form]"),
  uploadStatus: document.querySelector("[data-chat-upload-status]"),
  uploadSubmit: document.querySelector("[data-chat-upload-submit]"),
  uploadClosers: [...document.querySelectorAll("[data-close-chat-upload]")],
  rawImportOpen: document.querySelector("[data-open-chat-raw-import]"),
  rawImportModal: document.getElementById("chat-raw-import-modal"),
  rawImportHtml: document.querySelector("[data-chat-raw-html]"),
  rawImportInstructions: document.querySelector("[data-chat-raw-instructions]"),
  rawImportGenerateImage: document.querySelector("[data-chat-raw-generate-image]"),
  rawImportParse: document.querySelector("[data-chat-raw-import-parse]"),
  rawImportSave: document.querySelector("[data-chat-raw-import-save]"),
  rawImportStatus: document.querySelector("[data-chat-raw-status]"),
  rawImportReview: document.querySelector("[data-chat-raw-review]"),
  rawImportTitle: document.querySelector("[data-chat-raw-title]"),
  rawImportSummary: document.querySelector("[data-chat-raw-summary]"),
  rawImportCounts: document.querySelector("[data-chat-raw-counts]"),
  rawImportPreview: document.querySelector("[data-chat-raw-preview]"),
  rawImportClosers: [...document.querySelectorAll("[data-close-chat-raw-import]")],
  readerModal: document.getElementById("chat-reader-modal"),
  readerTitle: document.querySelector("[data-chat-reader-title]"),
  readerEdit: document.querySelector("[data-chat-reader-edit]"),
  readerStatus: document.querySelector("[data-chat-reader-status]"),
  readerFrame: document.querySelector("[data-chat-reader-frame]"),
  readerClosers: [...document.querySelectorAll("[data-close-chat-reader]")],
  editorModal: document.getElementById("chat-editor-modal"),
  editorTitle: document.querySelector("[data-chat-editor-title]"),
  editorTitleInput: document.querySelector("[data-chat-editor-title-input]"),
  editorSummaryInput: document.querySelector("[data-chat-editor-summary-input]"),
  editorSource: document.querySelector("[data-chat-editor-source]"),
  editorPreview: document.querySelector("[data-chat-editor-preview]"),
  editorStatus: document.querySelector("[data-chat-editor-status]"),
  editorSave: document.querySelector("[data-chat-editor-save]"),
  editorGenerateImage: document.querySelector("[data-chat-editor-generate-image]"),
  editorUploadImage: document.querySelector("[data-chat-editor-upload-image]"),
  editorImageInput: document.querySelector("[data-chat-editor-image-input]"),
  editorImageSection: document.querySelector("[data-chat-editor-image-section]"),
  editorImagePreview: document.querySelector("[data-chat-editor-image-preview]"),
  editorViewImage: document.querySelector("[data-chat-editor-view-image]"),
  editorDeleteImage: document.querySelector("[data-chat-editor-delete-image]"),
  editorClosers: [...document.querySelectorAll("[data-close-chat-editor]")],
  imagePromptModal: document.getElementById("chat-image-prompt-modal"),
  imagePromptTitle: document.querySelector("[data-chat-image-prompt-title]"),
  imagePromptSubtitle: document.querySelector("[data-chat-image-prompt-subtitle]"),
  imagePromptForm: document.querySelector("[data-chat-image-prompt-form]"),
  imagePromptText: document.querySelector("[data-chat-image-prompt-text]"),
  imagePromptStatus: document.querySelector("[data-chat-image-prompt-status]"),
  imagePromptSubmit: document.querySelector("[data-chat-image-prompt-submit]"),
  imagePromptClosers: [...document.querySelectorAll("[data-close-chat-image-prompt]")],
};

function escapeChatHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getChatError(error) {
  return error?.message || error?.error || error?.details || "Unknown error";
}

function showChatToast(message, type = "") {
  const container = document.querySelector(".chronicle-toast-stack") || document.createElement("div");
  if (!container.isConnected) {
    container.className = "chronicle-toast-stack";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "true");
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "chronicle-toast";
  toast.classList.toggle("is-error", type === "error");
  toast.classList.toggle("is-success", type === "success");
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("is-hiding");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, type === "error" ? 5200 : 3400);
}

function setChatStatus(message, type) {
  if (!chatEls.status) return;
  chatEls.status.textContent = message || "";
  chatEls.status.classList.toggle("is-error", type === "error");
  chatEls.status.classList.toggle("is-success", type === "success");
}

function setUploadStatus(message, type) {
  if (!chatEls.uploadStatus) return;
  chatEls.uploadStatus.textContent = message || "";
  chatEls.uploadStatus.classList.toggle("is-error", type === "error");
  chatEls.uploadStatus.classList.toggle("is-success", type === "success");
}

function setRawImportStatus(message, type) {
  if (!chatEls.rawImportStatus) return;
  chatEls.rawImportStatus.textContent = message || "";
  chatEls.rawImportStatus.classList.toggle("is-error", type === "error");
  chatEls.rawImportStatus.classList.toggle("is-success", type === "success");
}

function setReaderStatus(message, type) {
  if (!chatEls.readerStatus) return;
  chatEls.readerStatus.textContent = message || "";
  chatEls.readerStatus.classList.toggle("is-error", type === "error");
}

function setEditorStatus(message, type) {
  if (!chatEls.editorStatus) return;
  chatEls.editorStatus.textContent = message || "";
  chatEls.editorStatus.classList.toggle("is-error", type === "error");
  chatEls.editorStatus.classList.toggle("is-success", type === "success");
}

function setImagePromptStatus(message, type) {
  if (!chatEls.imagePromptStatus) return;
  chatEls.imagePromptStatus.textContent = message || "";
  chatEls.imagePromptStatus.classList.toggle("is-error", type === "error");
  chatEls.imagePromptStatus.classList.toggle("is-success", type === "success");
}

async function waitForChatAppUser() {
  if (window.centralisCurrentAppUser) return window.centralisCurrentAppUser;
  if (window.centralisGetCurrentAppUser) {
    return window.centralisGetCurrentAppUser();
  }
  return null;
}

function formatChatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatChatSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeChatImages(images = []) {
  if (!Array.isArray(images) || !images.length) {
    return [];
  }

  return [...images].sort((left, right) => {
    if (Boolean(left.is_primary) !== Boolean(right.is_primary)) {
      return left.is_primary ? -1 : 1;
    }
    return Number(left.sort_order || 0) - Number(right.sort_order || 0)
      || String(left.created_at || "").localeCompare(String(right.created_at || ""));
  });
}

async function fetchPrimaryChatImages(chatLogIds) {
  const objectIds = [...new Set((chatLogIds || []).filter(Boolean))];
  if (!objectIds.length || !chatRepositorySupabase?.functions) {
    return new Map();
  }

  const { data, error } = await chatRepositorySupabase.functions.invoke("list-object-images", {
    body: { objectIds },
  });
  if (error) {
    throw error;
  }

  const imagesByObjectId = new Map();
  for (const image of data?.images || []) {
    const images = imagesByObjectId.get(image.object_id) || [];
    images.push(image);
    imagesByObjectId.set(image.object_id, images);
  }

  return new Map([...imagesByObjectId.entries()].map(([objectId, images]) => [
    objectId,
    normalizeChatImages(images)[0],
  ]));
}

function getChatImageStyle(image) {
  return image?.image_url ? ` style="--chat-image-url: url('${escapeChatHtml(image.image_url)}')"` : "";
}

function getChatImageClass(image) {
  return image?.image_url ? " has-chat-image" : "";
}

function openChatImage(image) {
  if (image?.image_url) {
    window.open(image.image_url, "_blank", "noopener,noreferrer");
  }
}

function extractVisibleChatText(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("script, style, noscript, template, svg, canvas").forEach((node) => node.remove());
  return (doc.body?.textContent || doc.documentElement?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateChatPromptText(text, maxLength) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 40).trimEnd()}… [truncated]`;
}

function buildChatImagePrompt(chatLog, html) {
  const summary = String(chatLog?.summary || "").trim();
  const chatText = truncateChatPromptText(extractVisibleChatText(html), CHAT_IMAGE_TEXT_MAX_LENGTH);
  const prompt = [
    "Create a spoiler-safe atmospheric cover image for this saved chat log.",
    "Avoid depicting specific plot twists, final outcomes, reveals, deaths, endings, or surprise identities.",
    "Focus on mood, themes, genre, setting, symbolic imagery, and emotional tone instead of literal spoilery events.",
    summary ? `Summary: ${summary}` : "",
    chatText ? `Non-spoiler chat excerpt for tone and context: ${chatText}` : "",
    "Do not include text, captions, UI, logos, watermarks, or readable words.",
  ].filter(Boolean).join("\n");

  return truncateChatPromptText(prompt, CHAT_IMAGE_PROMPT_MAX_LENGTH);
}

function buildChatImageRequestBody(chatLog, html, promptOverride = "") {
  const body = {
    objectId: chatLog.id,
    objectKind: "chat log",
    elementType: "Chat Repository",
    name: chatLog.title || "Chat Log",
    description: chatLog.summary || "",
    extraPrompt: buildChatImagePrompt(chatLog, html),
  };

  if (String(promptOverride || "").trim()) {
    body.promptOverride = String(promptOverride).trim();
  }

  return body;
}

function buildChatImageFullPrompt(chatLog, html) {
  const body = buildChatImageRequestBody(chatLog, html);
  return [
    "Create a polished concept art image for a Centralis creative repository item.",
    `Subject kind: ${body.objectKind || "object"}.`,
    body.elementType ? `Element type: ${body.elementType}.` : "",
    body.name ? `Name: ${body.name}.` : "",
    body.description ? `Description: ${body.description}.` : "",
    body.extraPrompt ? `Additional direction: ${body.extraPrompt}.` : "",
    "Use a cinematic, richly detailed style. Do not include text, labels, logos, UI, or watermarks.",
  ].filter(Boolean).join("\n");
}

const GENERATED_CHAT_LOG_CSS = `
:root {
  --page: #10131a;
  --page-deep: #090b10;
  --paper: #161b25;
  --paper-raised: #1b2230;
  --ink: #f4f7fb;
  --muted: #aab5c8;
  --faint: #748199;
  --line: #2d374b;
  --other: #8d9cfb;
  --other-soft: rgba(141, 156, 251, 0.14);
  --user: #4bd8b7;
  --user-soft: rgba(75, 216, 183, 0.13);
  --shadow: 0 16px 45px rgba(0, 0, 0, 0.26);
  --radius: 16px;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  min-width: 320px;
  background:
    radial-gradient(circle at 12% 0%, rgba(78, 102, 165, 0.21), transparent 29rem),
    radial-gradient(circle at 86% 12%, rgba(35, 149, 131, 0.12), transparent 28rem),
    var(--page-deep);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.62;
}
.shell {
  width: min(1440px, calc(100% - 40px));
  margin: 0 auto;
  padding: 48px 0 72px;
}
.hero {
  padding: 36px 38px 32px;
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(28, 36, 52, 0.96), rgba(17, 22, 32, 0.94));
  box-shadow: var(--shadow);
}
.eyebrow {
  margin: 0 0 10px;
  color: var(--user);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
h1, h2, p { margin-top: 0; }
h1 {
  max-width: none;
  margin-bottom: 14px;
  font-size: clamp(2.15rem, 5vw, 4.45rem);
  line-height: 0.99;
  letter-spacing: -0.056em;
}
.lede {
  max-width: 70ch;
  margin-bottom: 0;
  color: var(--muted);
  font-size: 1.05rem;
}
.story-summary {
  width: 100%;
  max-width: none;
  margin-top: 26px;
  padding: 19px 20px 20px;
  border: 1px solid rgba(141, 156, 251, 0.30);
  border-radius: var(--radius);
  background: linear-gradient(115deg, rgba(141, 156, 251, 0.14), rgba(31, 42, 63, 0.48));
}
.summary-label {
  display: block;
  margin-bottom: 8px;
  color: var(--other);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}
.story-summary p {
  margin: 0;
  color: #dce4f2;
  font-size: 0.98rem;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 25px;
}
.stat {
  padding: 8px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  background: rgba(9, 13, 20, 0.36);
  font-size: 0.84rem;
  font-weight: 650;
}
.key {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin: 24px 0 28px;
}
.key-card {
  min-height: 78px;
  padding: 17px 19px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(18, 23, 33, 0.68);
}
.key-card strong {
  display: block;
  margin-bottom: 3px;
  font-size: 0.94rem;
}
.key-card p {
  margin: 0;
  color: var(--muted);
  font-size: 0.89rem;
}
.key-card.user strong { color: var(--user); }
.key-card.others strong { color: var(--other); }
.reader {
  position: relative;
  overflow: clip;
  padding: 28px 22px 16px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 24px;
  background: rgba(13, 17, 25, 0.86);
  box-shadow: var(--shadow);
}
.reader-note {
  margin: 0 0 24px;
  color: var(--faint);
  font-size: 0.83rem;
  text-align: center;
}
.story-grid { position: relative; }
.story-grid::before {
  content: "";
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: 50%;
  width: 1px;
  background: linear-gradient(to bottom, transparent, rgba(137, 154, 184, 0.55) 2rem, rgba(137, 154, 184, 0.55) calc(100% - 2rem), transparent);
  transform: translateX(-0.5px);
  pointer-events: none;
}
.phase {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 17px;
  margin: 47px 0 28px;
  padding: 20px 22px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 15px;
  background: linear-gradient(90deg, rgba(92, 111, 170, 0.14), rgba(30, 43, 60, 0.44));
}
.phase:first-child { margin-top: 2px; }
.phase-kicker {
  color: var(--faint);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  line-height: 1.5;
}
.phase h2 {
  margin-bottom: 2px;
  font-size: 1.1rem;
  letter-spacing: -0.015em;
}
.phase p {
  margin-bottom: 0;
  color: var(--muted);
  font-size: 0.91rem;
}
.entry {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px minmax(0, 1fr);
  margin: 18px 0;
}
.number {
  display: grid;
  grid-column: 2;
  grid-row: 1;
  place-items: center;
  align-self: start;
  width: 30px;
  height: 30px;
  margin: 19px auto 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--page-deep);
  color: var(--faint);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.03em;
}
.bubble {
  width: 100%;
  padding: 17px 19px 18px;
  border: 1px solid rgba(255,255,255,0.075);
  border-radius: var(--radius);
  background: var(--paper);
  box-shadow: 0 8px 22px rgba(0,0,0,0.16);
}
.user .bubble {
  grid-column: 1;
  border-top-left-radius: 5px;
  background: linear-gradient(135deg, var(--user-soft), rgba(24, 34, 39, 0.94) 37%);
}
.others .bubble {
  grid-column: 3;
  border-top-right-radius: 5px;
  background: linear-gradient(225deg, var(--other-soft), rgba(24, 29, 43, 0.94) 37%);
}
.bubble-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
  padding-bottom: 9px;
  border-bottom: 1px solid rgba(255,255,255,0.075);
}
.speaker {
  font-size: 0.77rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.others .speaker { color: var(--other); }
.user .speaker { color: var(--user); }
.entry-label {
  flex: 0 0 auto;
  color: var(--faint);
  font-size: 0.70rem;
  font-variant-numeric: tabular-nums;
}
.message-copy {
  color: #e5eaf2;
  overflow-wrap: anywhere;
  font-size: 0.965rem;
}
.message-copy p:last-child { margin-bottom: 0; }
.message-copy em { color: #cad4e5; }
.message-copy strong { color: #ffffff; }
.footer {
  padding: 18px 2px 0;
  color: var(--faint);
  font-size: 0.78rem;
  text-align: center;
}
@media (max-width: 780px) {
  .shell {
    width: min(100% - 24px, 720px);
    padding: 18px 0 42px;
  }
  .hero { padding: 26px 22px 24px; border-radius: 18px; }
  h1 { font-size: clamp(2.3rem, 12vw, 3.5rem); }
  .key { grid-template-columns: 1fr; }
  .reader { padding: 22px 12px 12px; border-radius: 18px; }
  .story-grid::before {
    left: 19px;
    transform: none;
  }
  .phase {
    grid-template-columns: 1fr;
    gap: 5px;
    margin: 34px 0 21px 38px;
    padding: 16px;
  }
  .entry {
    grid-template-columns: 38px minmax(0, 1fr);
    margin: 14px 0;
  }
  .number {
    grid-column: 1;
    width: 28px;
    height: 28px;
    margin-top: 15px;
  }
  .others .bubble, .user .bubble {
    grid-column: 2;
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
  }
  .bubble { padding: 15px 15px 16px; }
  .bubble-header { gap: 8px; }
  .entry-label { font-size: 0.64rem; }
}
@media print {
  :root {
    --page: #ffffff;
    --page-deep: #ffffff;
    --paper: #ffffff;
    --ink: #121821;
    --muted: #485363;
    --faint: #647184;
    --line: #c9d1da;
  }
  body {
    background: #ffffff;
    color: var(--ink);
    font-size: 10pt;
  }
  .shell {
    width: 100%;
    padding: 0;
  }
  .hero, .reader {
    box-shadow: none;
    border-color: #c9d1da;
    background: #ffffff;
  }
  .hero { margin-bottom: 12px; }
  .reader { padding: 12px; }
  .entry { break-inside: avoid; }
  .bubble {
    box-shadow: none;
    background: #ffffff !important;
    border-color: #c9d1da;
  }
  .message-copy, .message-copy em { color: #171b22; }
  .story-grid::before { background: #c9d1da; }
}
`;

function sanitizeRawChatMessage(sourceElement) {
  const clean = document.createElement("div");
  const blockedTags = new Set(["script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "embed", "form", "input", "button"]);

  function appendCleanNode(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tagName = node.tagName.toLowerCase();
    if (blockedTags.has(tagName)) {
      return;
    }
    if (tagName === "br") {
      parent.appendChild(document.createElement("br"));
      return;
    }

    const target = RAW_CHAT_ALLOWED_TAGS.has(tagName)
      ? document.createElement(tagName)
      : parent;
    if (target !== parent) {
      parent.appendChild(target);
    }
    node.childNodes.forEach((child) => appendCleanNode(child, target));
  }

  sourceElement.childNodes.forEach((node) => appendCleanNode(node, clean));
  const text = (clean.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }

  const hasBlock = Boolean(clean.querySelector("p, ul, ol, blockquote"));
  const html = clean.innerHTML.trim();
  return {
    html: hasBlock ? html : `<p>${html}</p>`,
    text,
  };
}

function parseRawChatHtml(rawHtml) {
  const source = String(rawHtml || "").trim();
  if (!source) {
    throw new Error("Paste raw chat HTML before parsing.");
  }

  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes > MAX_CHAT_FILE_BYTES) {
    throw new Error("Raw chat HTML must be 10 MB or smaller.");
  }

  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("script, style, noscript, template, svg, canvas, iframe, object, embed").forEach((node) => node.remove());
  const messageNodes = [...doc.querySelectorAll(".message-item")];
  if (!messageNodes.length) {
    throw new Error("Could not find any .message-item chat entries.");
  }

  const entries = [];
  for (const node of messageNodes) {
    const textElement = node.querySelector(".text") || node;
    const sanitized = sanitizeRawChatMessage(textElement);
    if (!sanitized) continue;
    const side = node.classList.contains("reverse") ? "user" : "others";
    entries.push({
      side,
      speaker: side === "user" ? "Adam" : "Others",
      html: sanitized.html,
      text: sanitized.text,
    });
  }

  if (!entries.length) {
    throw new Error("No non-empty chat messages were found.");
  }

  const userCount = entries.filter((entry) => entry.side === "user").length;
  const othersCount = entries.length - userCount;
  return {
    entries,
    totalCount: entries.length,
    userCount,
    othersCount,
  };
}

function buildRawChatMetadataText(parsed) {
  return truncateChatPromptText(
    parsed.entries
      .map((entry, index) => `${String(index + 1).padStart(3, "0")} ${entry.speaker}: ${entry.text}`)
      .join("\n"),
    CHAT_RAW_METADATA_TEXT_MAX_LENGTH
  );
}

function createFallbackRawMetadata(parsed) {
  return {
    title: "Imported Chat Log",
    summary: `Imported chat log with ${parsed.totalCount} chronological entries, including ${parsed.userCount} Adam entries and ${parsed.othersCount} others entries.`,
  };
}

async function generateRawChatMetadata(parsed, instructions) {
  const response = await getFunctionResponse("generate-chat-log-metadata", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instructions,
      chatText: buildRawChatMetadataText(parsed),
      totalEntryCount: parsed.totalCount,
      userEntryCount: parsed.userCount,
      othersEntryCount: parsed.othersCount,
    }),
  });
  if (!response.ok) {
    throw new Error(await parseFunctionError(response, "Could not generate title and summary."));
  }

  const payload = await response.json();
  return {
    title: String(payload.title || "").trim().slice(0, 200),
    summary: String(payload.summary || "").trim().slice(0, 2000),
  };
}

function buildGeneratedChatLogHtml(parsed, metadata) {
  const title = String(metadata?.title || "Imported Chat Log").trim() || "Imported Chat Log";
  const summary = String(metadata?.summary || createFallbackRawMetadata(parsed).summary).trim();
  const entriesHtml = parsed.entries.map((entry, index) => {
    const entryNumber = String(index + 1).padStart(3, "0");
    return `
          <article class="entry ${entry.side}">
            <span class="number">${entryNumber}</span>
            <section class="bubble">
              <header class="bubble-header">
                <span class="speaker">${escapeChatHtml(entry.speaker)}</span>
                <span class="entry-label">Entry ${entryNumber}</span>
              </header>
              <div class="message-copy">
                ${entry.html}
              </div>
            </section>
          </article>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="description" content="${escapeChatHtml(summary)}">
  <title>${escapeChatHtml(title)} | Two-Sided Transcript</title>
  <style>${GENERATED_CHAT_LOG_CSS}</style>
</head>
<body>
  <main class="shell">
    <section class="hero" data-chatlog-hero>
      <h1>${escapeChatHtml(title)}</h1>
      <section class="story-summary">
        <span class="summary-label">Summary</span>
        <p>${escapeChatHtml(summary)}</p>
      </section>
      <div class="stats" aria-label="Transcript statistics">
        <span class="stat">${parsed.totalCount} chronological entries</span>
        <span class="stat">${parsed.userCount} user entries</span>
        <span class="stat">${parsed.othersCount} others entries</span>
      </div>
    </section>

    <section class="key" aria-label="Transcript key">
      <div class="key-card user">
        <strong>Left: User</strong>
        <p>Adam's dialogue, decisions, actions, and observations from the original reverse-message pattern.</p>
      </div>
      <div class="key-card others">
        <strong>Right: Others</strong>
        <p>Scene description, responses, and dialogue from every other character in the story.</p>
      </div>
    </section>

    <section class="reader" aria-label="Chronological transcript">
      <p class="reader-note">Read downward to follow the story chronologically. Adam's entries appear on the left; everyone else and scene narration appear on the right.</p>
      <div class="story-grid">
        <article class="phase">
          <span class="phase-kicker">Part I</span>
          <div>
            <h2>The Conversation</h2>
            <p>The imported chat log begins here, preserving the original message order.</p>
          </div>
        </article>${entriesHtml}
      </div>
    </section>
    <p class="footer">Generated by Centralis Chat Repository.</p>
  </main>
</body>
</html>`;
}

function escapeChatCssUrl(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "");
}

function normalizeComparableText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findChatHeroElement(doc, chatLog) {
  const title = normalizeComparableText(chatLog?.title);
  const summary = normalizeComparableText(chatLog?.summary).slice(0, 120);
  const selectors = [
    "[data-chatlog-hero]",
    "[data-chat-log-hero]",
    ".chatlog-hero",
    ".chat-log-hero",
    ".log-hero",
    ".export-hero",
    ".story-hero",
    ".conversation-hero",
    ".hero",
    "main > header",
    "main > section:first-of-type",
    "body > header",
    "body > main > section:first-of-type",
    "body > section:first-of-type",
  ];

  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (element && isLikelyChatHeroElement(element, title, summary)) {
      return element;
    }
  }

  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (element && isPlausibleChatHeroElement(element, summary)) {
      return element;
    }
  }

  const candidates = [...doc.querySelectorAll("header, main > section, section, article, div")]
    .filter((element) => isLikelyChatHeroElement(element, title, summary));
  if (!candidates.length) {
    const plausibleCandidates = [...doc.querySelectorAll("header, main > section, section, article")]
      .filter((element) => isPlausibleChatHeroElement(element, summary));
    return plausibleCandidates
      .sort((left, right) => {
        const leftTextLength = normalizeComparableText(left.textContent).length;
        const rightTextLength = normalizeComparableText(right.textContent).length;
        return leftTextLength - rightTextLength;
      })[0] || null;
  }
  return candidates
    .sort((left, right) => {
      const leftTextLength = normalizeComparableText(left.textContent).length;
      const rightTextLength = normalizeComparableText(right.textContent).length;
      return leftTextLength - rightTextLength;
    })[0] || null;
}

function isLikelyChatHeroElement(element, title, summary) {
  const text = normalizeComparableText(element.textContent);
  const headingText = normalizeComparableText(
    [...element.querySelectorAll("h1, h2")]
      .map((heading) => heading.textContent)
      .join(" ")
  );
  const containsTitle = title && (headingText.includes(title) || text.includes(title));
  const containsSummary = text.includes("summary") || (summary && text.includes(summary));
  return Boolean(containsTitle && containsSummary);
}

function isPlausibleChatHeroElement(element, summary) {
  const text = normalizeComparableText(element.textContent);
  const hasHeading = Boolean(element.querySelector("h1, h2"));
  const containsSummary = text.includes("summary") || (summary && text.includes(summary));
  return Boolean(hasHeading && containsSummary);
}

function createReaderHtml(html, chatLog) {
  const imageUrl = chatLog?.primaryImage?.image_url;
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const hero = findChatHeroElement(doc, chatLog);
  if (!hero) {
    return html;
  }

  hero.classList.add("centralis-chat-reader-wide-hero");
  if (imageUrl) {
    hero.classList.add("centralis-chat-reader-image-hero");
    hero.style.setProperty("--centralis-chat-reader-image", `url("${escapeChatCssUrl(imageUrl)}")`);
    const viewLink = doc.createElement("a");
    viewLink.className = "centralis-chat-reader-image-view";
    viewLink.href = imageUrl;
    viewLink.target = "_blank";
    viewLink.rel = "noopener noreferrer";
    viewLink.textContent = "View Image";
    hero.appendChild(viewLink);
  }

  const style = doc.createElement("style");
  style.textContent = `
    .centralis-chat-reader-wide-hero {
      position: relative !important;
      isolation: isolate !important;
      overflow: hidden !important;
    }
    .centralis-chat-reader-wide-hero > * {
      position: relative;
      z-index: 1;
    }
    .centralis-chat-reader-wide-hero > :not(.centralis-chat-reader-image-view),
    .centralis-chat-reader-wide-hero > :not(.centralis-chat-reader-image-view) > *,
    .centralis-chat-reader-wide-hero h1,
    .centralis-chat-reader-wide-hero h2,
    .centralis-chat-reader-wide-hero [class*="title"],
    .centralis-chat-reader-wide-hero [class*="summary"] {
      max-width: none !important;
    }
    .centralis-chat-reader-wide-hero > :not(.centralis-chat-reader-image-view) {
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .centralis-chat-reader-image-hero > :not(.centralis-chat-reader-image-view) {
      padding-right: min(12rem, 18vw) !important;
    }
    .centralis-chat-reader-wide-hero h1,
    .centralis-chat-reader-wide-hero h2 {
      width: 100% !important;
    }
    .centralis-chat-reader-wide-hero [class*="summary"] {
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .centralis-chat-reader-image-hero::before {
      position: absolute;
      inset: 0;
      z-index: -2;
      content: "";
      background-image: var(--centralis-chat-reader-image);
      background-position: center;
      background-size: cover;
      opacity: 0.75;
    }
    .centralis-chat-reader-image-hero::after {
      position: absolute;
      inset: 0;
      z-index: -1;
      content: "";
      background: linear-gradient(180deg, rgb(0 0 0 / 26%), rgb(0 0 0 / 58%));
    }
    .centralis-chat-reader-image-view {
      position: absolute !important;
      top: 1.25rem !important;
      right: 1.25rem !important;
      z-index: 3 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-height: 2.35rem !important;
      padding: 0 1rem !important;
      color: #fff !important;
      background: rgb(0 0 0 / 42%) !important;
      border: 1px solid rgb(255 255 255 / 26%) !important;
      border-radius: 0.65rem !important;
      box-shadow: 0 12px 30px rgb(0 0 0 / 28%) !important;
      font: 700 0.9rem/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      text-decoration: none !important;
      text-shadow: 0 1px 10px rgb(0 0 0 / 72%) !important;
      backdrop-filter: blur(8px);
    }
    .centralis-chat-reader-image-view::before {
      content: "↗";
      margin-right: 0.45rem;
      font-size: 0.85rem;
    }
    .centralis-chat-reader-image-view:hover,
    .centralis-chat-reader-image-view:focus-visible {
      background: rgb(0 0 0 / 58%) !important;
      outline: none !important;
    }
  `;
  (doc.head || doc.documentElement).appendChild(style);

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function renderChatLogs() {
  if (!chatEls.grid) return;

  chatEls.grid.className = `chat-log-grid is-${chatRepositoryState.view}-view`;
  chatEls.viewButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.chatView === chatRepositoryState.view));
  });

  const count = chatRepositoryState.chatLogs.length;
  if (chatEls.count) {
    if (chatRepositoryState.searchQuery) {
      chatEls.count.textContent = count === 1
        ? `1 match for “${chatRepositoryState.searchQuery}”`
        : `${count} matches for “${chatRepositoryState.searchQuery}”`;
    } else {
      chatEls.count.textContent = count === 1 ? "1 chat log" : `${count} chat logs`;
    }
  }

  if (!count) {
    const hasSearch = Boolean(chatRepositoryState.searchQuery);
    chatEls.grid.innerHTML = `
      <div class="chat-repository-empty">
        <ph-${hasSearch ? "magnifying-glass" : "chats-circle"} weight="duotone" aria-hidden="true"></ph-${hasSearch ? "magnifying-glass" : "chats-circle"}>
        <h2>${hasSearch ? "No matching chat logs" : "No chat logs yet"}</h2>
        <p>${hasSearch ? "Try a different word or phrase." : "Upload an HTML chat log to start your repository."}</p>
      </div>
    `;
    return;
  }

  chatEls.grid.innerHTML = chatRepositoryState.chatLogs.map((chatLog) => `
    <article class="chat-log-item${getChatImageClass(chatLog.primaryImage)}" data-chat-log-id="${escapeChatHtml(chatLog.id)}"${getChatImageStyle(chatLog.primaryImage)}>
      <button class="chat-log-open" type="button" data-open-chat-log-id="${escapeChatHtml(chatLog.id)}">
        <span class="chat-log-icon" aria-hidden="true">
          <ph-chat-centered-text weight="duotone"></ph-chat-centered-text>
        </span>
        <span class="chat-log-copy">
          <strong>${escapeChatHtml(chatLog.title)}</strong>
          <span>${escapeChatHtml(chatLog.summary)}</span>
        </span>
        <span class="chat-log-meta">
          <span>${escapeChatHtml(formatChatDate(chatLog.created_at))}</span>
          <span>${escapeChatHtml(formatChatSize(chatLog.file_size))}</span>
        </span>
      </button>
      <span class="chat-log-actions">
        <button class="chat-log-action" type="button" title="Edit chat log" aria-label="Edit ${escapeChatHtml(chatLog.title)}" data-edit-chat-log-id="${escapeChatHtml(chatLog.id)}">
          <ph-pencil-simple weight="bold" aria-hidden="true"></ph-pencil-simple>
        </button>
        <button class="chat-log-action is-danger" type="button" title="Delete chat log" aria-label="Delete ${escapeChatHtml(chatLog.title)}" data-delete-chat-log-id="${escapeChatHtml(chatLog.id)}">
          <ph-trash weight="bold" aria-hidden="true"></ph-trash>
        </button>
      </span>
    </article>
  `).join("");
}

async function loadChatLogs() {
  if (!chatRepositorySupabase || !chatRepositoryState.appUser) return;

  setChatStatus("");
  chatEls.grid.innerHTML = '<p class="empty-state">Loading chat logs...</p>';

  let query = chatRepositorySupabase
    .from("chat_logs")
    .select("id,title,summary,original_filename,mime_type,file_size,created_at,updated_at,search_indexed_at")
    .eq("user_id", chatRepositoryState.appUser.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (chatRepositoryState.searchQuery) {
    query = query.textSearch("search_vector", chatRepositoryState.searchQuery, {
      type: "websearch",
      config: "english",
    });
  }

  const { data, error } = await query;

  if (error) {
    chatRepositoryState.chatLogs = [];
    renderChatLogs();
    setChatStatus(`Could not load chat logs: ${getChatError(error)}`, "error");
    return;
  }

  let chatLogs = data || [];
  if (chatLogs.length) {
    try {
      const primaryImages = await fetchPrimaryChatImages(chatLogs.map((chatLog) => chatLog.id));
      chatLogs = chatLogs.map((chatLog) => ({
        ...chatLog,
        primaryImage: primaryImages.get(chatLog.id) || null,
      }));
    } catch (imageError) {
      console.warn("Could not load chat log images:", imageError);
    }
  }

  chatRepositoryState.chatLogs = chatLogs;
  renderChatLogs();
}

async function reindexMissingChatLogs() {
  if (chatRepositoryState.reindexing || !chatRepositoryState.appUser) return;
  if (!chatRepositoryState.chatLogs.some((chatLog) => !chatLog.search_indexed_at)) return;

  chatRepositoryState.reindexing = true;
  setChatStatus("Updating search index for older chat logs...");

  try {
    let hasMore = true;
    let totalIndexed = 0;
    while (hasMore) {
      const response = await getFunctionResponse("reindex-chat-logs");
      if (!response.ok) {
        throw new Error(await parseFunctionError(response, "Could not update search index."));
      }
      const payload = await response.json();
      totalIndexed += Number(payload.indexed || 0);
      hasMore = Boolean(payload.hasMore);
      if (!payload.indexed) break;
    }

    if (totalIndexed) {
      await loadChatLogs();
      setChatStatus("Search index updated.", "success");
    } else {
      setChatStatus("");
    }
  } catch (error) {
    setChatStatus(`Search index update failed: ${getChatError(error)}`, "error");
  } finally {
    chatRepositoryState.reindexing = false;
  }
}

function lockPageForModal(locked) {
  document.body.classList.toggle("chat-modal-open", locked);
}

function focusableElements(modal) {
  return [...modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden && !element.closest("[hidden]"));
}

function openChatModal(modal, trigger) {
  chatRepositoryState.modalTrigger = trigger || document.activeElement;
  modal.hidden = false;
  lockPageForModal(true);
  window.setTimeout(() => focusableElements(modal)[0]?.focus(), 0);
}

function restoreChatModalFocus() {
  const trigger = chatRepositoryState.modalTrigger;
  chatRepositoryState.modalTrigger = null;
  if (trigger instanceof HTMLElement && trigger.isConnected) {
    trigger.focus();
  }
}

function hasOpenPrimaryChatModal() {
  return [chatEls.uploadModal, chatEls.rawImportModal, chatEls.readerModal, chatEls.editorModal]
    .some((modal) => modal && !modal.hidden);
}

function closeImagePromptModal(result = null) {
  const request = chatRepositoryState.imagePromptRequest;
  chatRepositoryState.imagePromptRequest = null;
  if (chatEls.imagePromptModal) chatEls.imagePromptModal.hidden = true;
  if (chatEls.imagePromptText) chatEls.imagePromptText.value = "";
  setImagePromptStatus("");
  if (!hasOpenPrimaryChatModal()) {
    lockPageForModal(false);
  }
  if (request?.returnFocus instanceof HTMLElement && request.returnFocus.isConnected) {
    request.returnFocus.focus();
  }
  request?.resolve(result);
}

function openImagePromptDialog(prompt, options = {}) {
  if (!chatEls.imagePromptModal || !chatEls.imagePromptText) {
    return Promise.resolve(String(prompt || "").trim());
  }

  if (chatRepositoryState.imagePromptRequest) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    chatRepositoryState.imagePromptRequest = {
      resolve,
      returnFocus: document.activeElement,
    };
    if (chatEls.imagePromptTitle) {
      chatEls.imagePromptTitle.textContent = options.title || "Review Image Prompt";
    }
    if (chatEls.imagePromptSubtitle) {
      chatEls.imagePromptSubtitle.textContent = options.subtitle
        || "Edit the prompt before Centralis generates the image.";
    }
    chatEls.imagePromptText.value = String(prompt || "").trim();
    setImagePromptStatus("");
    chatEls.imagePromptModal.hidden = false;
    lockPageForModal(true);
    window.setTimeout(() => chatEls.imagePromptText?.focus(), 0);
  });
}

async function reviewChatImagePrompt(chatLog, html, options = {}) {
  return openImagePromptDialog(buildChatImageFullPrompt(chatLog, html), options);
}

function closeUploadModal() {
  if (chatRepositoryState.uploading) return;
  chatEls.uploadModal.hidden = true;
  chatEls.uploadForm.reset();
  setUploadStatus("");
  lockPageForModal(false);
  restoreChatModalFocus();
}

function openRawImportModal(trigger) {
  if (chatEls.rawImportInstructions && !chatEls.rawImportInstructions.value.trim()) {
    chatEls.rawImportInstructions.value = localStorage.getItem(CHAT_RAW_IMPORT_INSTRUCTIONS_KEY)
      || DEFAULT_RAW_IMPORT_INSTRUCTIONS;
  }
  resetRawImportReview();
  setRawImportStatus("");
  openChatModal(chatEls.rawImportModal, trigger);
  window.setTimeout(() => chatEls.rawImportHtml?.focus(), 0);
}

function closeRawImportModal() {
  if (chatRepositoryState.rawImporting) return;
  resetRawImportReview();
  setRawImportStatus("");
  if (chatEls.rawImportHtml) chatEls.rawImportHtml.value = "";
  if (chatEls.rawImportGenerateImage) chatEls.rawImportGenerateImage.checked = true;
  chatEls.rawImportModal.hidden = true;
  lockPageForModal(false);
  restoreChatModalFocus();
}

function clearReaderObjectUrl() {
  if (chatRepositoryState.readerObjectUrl) {
    URL.revokeObjectURL(chatRepositoryState.readerObjectUrl);
    chatRepositoryState.readerObjectUrl = "";
  }
  chatEls.readerFrame.removeAttribute("src");
  chatEls.readerFrame.hidden = true;
}

function clearEditorObjectUrl() {
  if (chatRepositoryState.editorObjectUrl) {
    URL.revokeObjectURL(chatRepositoryState.editorObjectUrl);
    chatRepositoryState.editorObjectUrl = "";
  }
  chatEls.editorPreview?.removeAttribute("src");
}

function clearRawImportObjectUrl() {
  if (chatRepositoryState.rawImportObjectUrl) {
    URL.revokeObjectURL(chatRepositoryState.rawImportObjectUrl);
    chatRepositoryState.rawImportObjectUrl = "";
  }
  chatEls.rawImportPreview?.removeAttribute("src");
}

function resetRawImportReview() {
  clearRawImportObjectUrl();
  chatRepositoryState.rawImportGeneratedHtml = "";
  chatRepositoryState.rawImportParsed = null;
  if (chatEls.rawImportReview) chatEls.rawImportReview.hidden = true;
  if (chatEls.rawImportTitle) chatEls.rawImportTitle.value = "";
  if (chatEls.rawImportSummary) chatEls.rawImportSummary.value = "";
  if (chatEls.rawImportCounts) chatEls.rawImportCounts.textContent = "";
  if (chatEls.rawImportSave) chatEls.rawImportSave.disabled = true;
}

function updateRawImportPreview(html) {
  clearRawImportObjectUrl();
  chatRepositoryState.rawImportObjectUrl = URL.createObjectURL(
    new Blob([html], { type: "text/html" })
  );
  if (chatEls.rawImportPreview) {
    chatEls.rawImportPreview.src = chatRepositoryState.rawImportObjectUrl;
  }
}

function renderRawImportReview(parsed, metadata) {
  const html = buildGeneratedChatLogHtml(parsed, metadata);
  chatRepositoryState.rawImportParsed = parsed;
  chatRepositoryState.rawImportGeneratedHtml = html;
  if (chatEls.rawImportReview) chatEls.rawImportReview.hidden = false;
  if (chatEls.rawImportTitle) chatEls.rawImportTitle.value = metadata.title;
  if (chatEls.rawImportSummary) chatEls.rawImportSummary.value = metadata.summary;
  if (chatEls.rawImportCounts) {
    chatEls.rawImportCounts.textContent = `${parsed.totalCount} chronological entries • ${parsed.userCount} Adam entries • ${parsed.othersCount} others entries`;
  }
  if (chatEls.rawImportSave) chatEls.rawImportSave.disabled = false;
  updateRawImportPreview(html);
}

function refreshRawImportGeneratedHtmlFromReview() {
  if (!chatRepositoryState.rawImportParsed) return "";
  const title = chatEls.rawImportTitle?.value.trim() || "Imported Chat Log";
  const summary = chatEls.rawImportSummary?.value.trim() || createFallbackRawMetadata(chatRepositoryState.rawImportParsed).summary;
  const html = buildGeneratedChatLogHtml(chatRepositoryState.rawImportParsed, { title, summary });
  chatRepositoryState.rawImportGeneratedHtml = html;
  updateRawImportPreview(html);
  return html;
}

function renderReaderImage(chatLog) {
  return chatLog?.primaryImage || null;
}

function renderEditorImage(image) {
  if (!chatEls.editorImageSection || !chatEls.editorImagePreview) {
    return;
  }

  const hasImage = Boolean(image?.image_url);
  chatEls.editorImageSection.hidden = !hasImage;
  chatEls.editorImagePreview.style.backgroundImage = hasImage ? `url("${image.image_url.replaceAll('"', "%22")}")` : "";
  if (chatEls.editorViewImage) {
    chatEls.editorViewImage.onclick = () => openChatImage(image);
  }
  if (chatEls.editorDeleteImage) {
    chatEls.editorDeleteImage.disabled = !hasImage;
  }
}

function updateEditorGenerateImageState(chatLogId = chatRepositoryState.editingChatLogId) {
  if (!chatEls.editorGenerateImage) return;
  chatEls.editorGenerateImage.disabled = Boolean(
    chatLogId && chatRepositoryState.generatingImageIds.has(chatLogId)
  );
}

function initializeSourceEditor() {
  if (chatRepositoryState.sourceEditor || !chatEls.editorSource || !window.CodeMirror) {
    return chatRepositoryState.sourceEditor;
  }

  chatRepositoryState.sourceEditor = window.CodeMirror.fromTextArea(chatEls.editorSource, {
    mode: "htmlmixed",
    theme: "material-darker",
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 2,
    indentUnit: 2,
    viewportMargin: 80,
  });
  chatRepositoryState.sourceEditor.on("change", queueEditorPreviewUpdate);
  return chatRepositoryState.sourceEditor;
}

function getEditorSourceValue() {
  return chatRepositoryState.sourceEditor
    ? chatRepositoryState.sourceEditor.getValue()
    : (chatEls.editorSource?.value || "");
}

function setEditorSourceValue(value) {
  if (chatRepositoryState.sourceEditor) {
    chatRepositoryState.sourceEditor.setValue(value || "");
    chatRepositoryState.sourceEditor.setCursor({ line: 0, ch: 0 });
    chatRepositoryState.sourceEditor.scrollTo(0, 0);
    chatRepositoryState.sourceEditor.refresh();
    return;
  }
  chatEls.editorSource.value = value || "";
  chatEls.editorSource.setSelectionRange(0, 0);
  chatEls.editorSource.scrollTop = 0;
}

function focusEditorSourceAtTop() {
  if (chatRepositoryState.sourceEditor) {
    chatRepositoryState.sourceEditor.refresh();
    chatRepositoryState.sourceEditor.setCursor({ line: 0, ch: 0 });
    chatRepositoryState.sourceEditor.scrollTo(0, 0);
    chatRepositoryState.sourceEditor.focus();
    return;
  }
  chatEls.editorSource.focus({ preventScroll: true });
  chatEls.editorSource.scrollTop = 0;
}

function updateEditorPreview() {
  if (!chatEls.editorPreview || !chatEls.editorSource) return;
  clearEditorObjectUrl();
  const html = getEditorSourceValue();
  chatRepositoryState.editorObjectUrl = URL.createObjectURL(
    new Blob([html], { type: "text/html" })
  );
  chatEls.editorPreview.src = chatRepositoryState.editorObjectUrl;
}

function queueEditorPreviewUpdate() {
  window.clearTimeout(chatRepositoryState.editorPreviewTimer);
  chatRepositoryState.editorPreviewTimer = window.setTimeout(updateEditorPreview, 180);
}

function closeReaderModal() {
  clearReaderObjectUrl();
  chatRepositoryState.readingChatLogId = "";
  chatEls.readerModal.hidden = true;
  setReaderStatus("");
  lockPageForModal(false);
  restoreChatModalFocus();
}

function closeEditorModal() {
  if (chatRepositoryState.saving) return;
  window.clearTimeout(chatRepositoryState.editorPreviewTimer);
  clearEditorObjectUrl();
  chatRepositoryState.editingChatLogId = "";
  chatEls.editorModal.hidden = true;
  chatEls.editorTitleInput.value = "";
  chatEls.editorSummaryInput.value = "";
  renderEditorImage(null);
  setEditorSourceValue("");
  setEditorStatus("");
  lockPageForModal(false);
  restoreChatModalFocus();
}

async function getFunctionResponse(name, options = {}) {
  const { data: sessionData, error: sessionError } = await chatRepositorySupabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw sessionError || new Error("You must be signed in.");
  }

  const config = window.CENTRALIS_SUPABASE_CONFIG;
  const headers = {
    Authorization: `Bearer ${sessionData.session.access_token}`,
    apikey: config.publishableKey,
    ...(options.headers || {}),
  };

  return fetch(`${config.url}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: options.body,
  });
}

async function parseFunctionError(response, fallback) {
  try {
    const payload = await response.json();
    return payload?.error || payload?.message || fallback;
  } catch {
    return fallback;
  }
}

async function fetchChatLogHtml(chatLogId) {
  const response = await getFunctionResponse("get-chat-log", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatLogId }),
  });
  if (!response.ok) {
    throw new Error(await parseFunctionError(response, "Could not load chat log."));
  }
  return response.text();
}

function getChatLogById(chatLogId) {
  return chatRepositoryState.chatLogs.find((entry) => entry.id === chatLogId) || null;
}

function getDeepLinkedChatLogId() {
  const params = new URLSearchParams(window.location.search);
  for (const paramName of CHAT_DEEP_LINK_PARAMS) {
    const value = params.get(paramName)?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

async function fetchChatLogMetadata(chatLogId) {
  const { data, error } = await chatRepositorySupabase
    .from("chat_logs")
    .select("id,title,summary,original_filename,mime_type,file_size,created_at,updated_at,search_indexed_at")
    .eq("id", chatLogId)
    .eq("user_id", chatRepositoryState.appUser.id)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    throw error;
  }

  const chatLog = data?.[0] || null;
  if (!chatLog) {
    return null;
  }

  try {
    const primaryImages = await fetchPrimaryChatImages([chatLog.id]);
    return {
      ...chatLog,
      primaryImage: primaryImages.get(chatLog.id) || null,
    };
  } catch (imageError) {
    console.warn("Could not load linked chat log image:", imageError);
    return chatLog;
  }
}

async function resolveChatLogForDeepLink(chatLogId) {
  const existingChatLog = getChatLogById(chatLogId);
  if (existingChatLog) {
    return existingChatLog;
  }

  const linkedChatLog = await fetchChatLogMetadata(chatLogId);
  if (linkedChatLog) {
    chatRepositoryState.chatLogs = [
      linkedChatLog,
      ...chatRepositoryState.chatLogs.filter((entry) => entry.id !== linkedChatLog.id),
    ];
    renderChatLogs();
  }
  return linkedChatLog;
}

async function openDeepLinkedChatLog() {
  if (chatRepositoryState.deepLinkedChatLogOpened) {
    return;
  }

  const chatLogId = getDeepLinkedChatLogId();
  if (!chatLogId) {
    return;
  }

  chatRepositoryState.deepLinkedChatLogOpened = true;
  try {
    const chatLog = await resolveChatLogForDeepLink(chatLogId);
    if (!chatLog) {
      setChatStatus("That chat log could not be found or is no longer available.", "error");
      return;
    }
    await openChatReader(chatLog, null);
  } catch (error) {
    setChatStatus(`Could not open chat log: ${getChatError(error)}`, "error");
  }
}

function setChatLogPrimaryImage(chatLogId, image) {
  chatRepositoryState.chatLogs = chatRepositoryState.chatLogs.map((chatLog) => (
    chatLog.id === chatLogId ? { ...chatLog, primaryImage: image || null } : chatLog
  ));
}

async function refreshChatLogImage(chatLogId) {
  const images = await fetchPrimaryChatImages([chatLogId]);
  const image = images.get(chatLogId) || null;
  setChatLogPrimaryImage(chatLogId, image);
  renderChatLogs();
  return image;
}

async function setChatImagePrimary(image) {
  if (!image?.id) {
    return image || null;
  }

  const response = await getFunctionResponse("set-primary-image", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId: image.id }),
  });
  if (!response.ok) {
    throw new Error(await parseFunctionError(response, "Could not set primary image."));
  }
  return image;
}

async function unlinkChatLogImages(chatLogId, options = {}) {
  if (!chatLogId) {
    return;
  }

  const response = await getFunctionResponse("unlink-object-images", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectId: chatLogId,
      exceptImageId: options.exceptImageId || "",
    }),
  });
  if (!response.ok) {
    throw new Error(await parseFunctionError(response, "Could not remove image association."));
  }
}

async function generateChatLogImage(chatLog, html, options = {}) {
  if (!chatLog?.id || chatRepositoryState.generatingImageIds.has(chatLog.id)) {
    return null;
  }

  chatRepositoryState.generatingImageIds.add(chatLog.id);
  if (chatRepositoryState.editingChatLogId === chatLog.id) {
    updateEditorGenerateImageState(chatLog.id);
  }
  const toast = options.toast !== false;
  if (toast) {
    showChatToast("Generating chat log image...", "success");
  }

  try {
    const promptHtml = html ?? await fetchChatLogHtml(chatLog.id);
    const response = await getFunctionResponse("generate-object-image", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildChatImageRequestBody(chatLog, promptHtml, options.promptOverride)),
    });
    if (!response.ok) {
      throw new Error(await parseFunctionError(response, "Could not generate image."));
    }
    const payload = await response.json();
    if (payload.image) {
      await setChatImagePrimary(payload.image);
      await unlinkChatLogImages(chatLog.id, { exceptImageId: payload.image.id });
    }
    const image = await refreshChatLogImage(chatLog.id);
    setChatLogPrimaryImage(chatLog.id, image);
    renderChatLogs();
    if (chatRepositoryState.editingChatLogId === chatLog.id) {
      renderEditorImage(image);
    }
    if (toast) {
      showChatToast("Chat log image generated.", "success");
    }
    return image;
  } catch (error) {
    if (toast) {
      showChatToast(`Could not generate image: ${getChatError(error)}`, "error");
    }
    throw error;
  } finally {
    chatRepositoryState.generatingImageIds.delete(chatLog.id);
    if (chatRepositoryState.editingChatLogId === chatLog.id) {
      updateEditorGenerateImageState(chatLog.id);
    }
  }
}

async function uploadChatLogImage(chatLogId, file) {
  if (!chatLogId || !(file instanceof File) || chatRepositoryState.uploadingImage) {
    return null;
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  chatRepositoryState.uploadingImage = true;
  const body = new FormData();
  body.append("objectId", chatLogId);
  body.append("file", file);
  try {
    const response = await getFunctionResponse("upload-object-image", { body });
    if (!response.ok) {
      throw new Error(await parseFunctionError(response, "Could not upload image."));
    }
    const payload = await response.json();
    if (payload.image) {
      await setChatImagePrimary(payload.image);
      await unlinkChatLogImages(chatLogId, { exceptImageId: payload.image.id });
    }
    const image = await refreshChatLogImage(chatLogId);
    setChatLogPrimaryImage(chatLogId, image);
    renderChatLogs();
    if (chatRepositoryState.editingChatLogId === chatLogId) {
      renderEditorImage(image);
    }
    return image;
  } finally {
    chatRepositoryState.uploadingImage = false;
  }
}

function createRawImportFilename(title) {
  const slug = String(title || "imported-chat-log")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "imported-chat-log";
  return `${slug}.html`;
}

async function parseRawChatImport() {
  if (chatRepositoryState.rawImporting) return;

  resetRawImportReview();
  const rawHtml = chatEls.rawImportHtml?.value || "";
  const instructions = chatEls.rawImportInstructions?.value.trim() || DEFAULT_RAW_IMPORT_INSTRUCTIONS;
  localStorage.setItem(CHAT_RAW_IMPORT_INSTRUCTIONS_KEY, instructions);

  chatRepositoryState.rawImporting = true;
  if (chatEls.rawImportParse) chatEls.rawImportParse.disabled = true;
  if (chatEls.rawImportSave) chatEls.rawImportSave.disabled = true;
  setRawImportStatus("Parsing raw chat HTML...");

  try {
    const parsed = parseRawChatHtml(rawHtml);
    let metadata = createFallbackRawMetadata(parsed);
    let metadataError = null;
    setRawImportStatus("Generating title and summary...");
    try {
      const generated = await generateRawChatMetadata(parsed, instructions);
      if (generated.title && generated.summary) {
        metadata = generated;
      }
    } catch (error) {
      metadataError = error;
    }

    renderRawImportReview(parsed, metadata);
    if (metadataError) {
      setRawImportStatus(`Parsed successfully. Title and summary need review: ${getChatError(metadataError)}`, "error");
    } else {
      setRawImportStatus("Parsed and generated. Review the title, summary, and preview before saving.", "success");
    }
  } catch (error) {
    setRawImportStatus(getChatError(error), "error");
  } finally {
    chatRepositoryState.rawImporting = false;
    if (chatEls.rawImportParse) chatEls.rawImportParse.disabled = false;
  }
}

async function saveRawChatImport() {
  if (chatRepositoryState.rawImporting || !chatRepositoryState.rawImportParsed) return;

  const title = chatEls.rawImportTitle?.value.trim() || "";
  const summary = chatEls.rawImportSummary?.value.trim() || "";
  if (!title || title.length > 200) {
    setRawImportStatus("Title is required and must be 200 characters or fewer.", "error");
    return;
  }
  if (!summary || summary.length > 2000) {
    setRawImportStatus("Summary is required and must be 2,000 characters or fewer.", "error");
    return;
  }

  const html = refreshRawImportGeneratedHtmlFromReview();
  const byteLength = new TextEncoder().encode(html).byteLength;
  if (!html.trim() || byteLength <= 0 || byteLength > MAX_CHAT_FILE_BYTES) {
    setRawImportStatus("Generated HTML must be non-empty and 10 MB or smaller.", "error");
    return;
  }

  let shouldGenerateImage = Boolean(chatEls.rawImportGenerateImage?.checked);
  let imagePromptOverride = "";
  if (shouldGenerateImage) {
    imagePromptOverride = await reviewChatImagePrompt({ title, summary }, html, {
      subtitle: "Review or revise the image prompt for this parsed chat log. Cancel skips image generation.",
    });
    if (!imagePromptOverride) {
      shouldGenerateImage = false;
    }
  }

  chatRepositoryState.rawImporting = true;
  if (chatEls.rawImportParse) chatEls.rawImportParse.disabled = true;
  if (chatEls.rawImportSave) chatEls.rawImportSave.disabled = true;
  chatEls.rawImportClosers.forEach((button) => { button.disabled = true; });
  setRawImportStatus("Saving generated chat log...");

  try {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("summary", summary);
    formData.append("file", new File([html], createRawImportFilename(title), { type: "text/html" }));

    const response = await getFunctionResponse("upload-chat-log", { body: formData });
    if (!response.ok) {
      throw new Error(await parseFunctionError(response, "Could not save generated chat log."));
    }
    const payload = await response.json();
    chatRepositoryState.chatLogs.unshift(payload.chatLog);
    await loadChatLogs();
    chatRepositoryState.rawImporting = false;
    closeRawImportModal();
    setChatStatus("Generated chat log saved.", "success");
    if (shouldGenerateImage) {
      generateChatLogImage(payload.chatLog, html, { promptOverride: imagePromptOverride }).catch(() => null);
    }
  } catch (error) {
    setRawImportStatus(getChatError(error), "error");
  } finally {
    chatRepositoryState.rawImporting = false;
    if (chatEls.rawImportParse) chatEls.rawImportParse.disabled = false;
    if (chatEls.rawImportSave) chatEls.rawImportSave.disabled = !chatRepositoryState.rawImportParsed;
    chatEls.rawImportClosers.forEach((button) => { button.disabled = false; });
  }
}

async function uploadChatLog(event) {
  event.preventDefault();
  if (chatRepositoryState.uploading) return;

  const formData = new FormData(chatEls.uploadForm);
  const file = formData.get("file");
  const title = String(formData.get("title") || "").trim();
  const summary = String(formData.get("summary") || "").trim();
  let shouldGenerateImage = formData.get("generateImage") === "on";

  if (!(file instanceof File) || !file.name) {
    setUploadStatus("Choose an HTML file.", "error");
    return;
  }
  if (!/\.html?$/i.test(file.name)) {
    setUploadStatus("Only .html or .htm files are supported.", "error");
    return;
  }
  if (file.size <= 0 || file.size > MAX_CHAT_FILE_BYTES) {
    setUploadStatus("The HTML file must be between 1 byte and 10 MB.", "error");
    return;
  }
  if (!title || !summary) {
    setUploadStatus("Title and summary are required.", "error");
    return;
  }

  let htmlForImage = "";
  let imagePromptOverride = "";
  if (shouldGenerateImage) {
    htmlForImage = await file.text();
    imagePromptOverride = await reviewChatImagePrompt({ title, summary }, htmlForImage, {
      subtitle: "Review or revise the image prompt for this uploaded chat log. Cancel skips image generation.",
    });
    if (!imagePromptOverride) {
      shouldGenerateImage = false;
    }
  }

  chatRepositoryState.uploading = true;
  chatEls.uploadSubmit.disabled = true;
  chatEls.uploadClosers.forEach((button) => { button.disabled = true; });
  setUploadStatus("Uploading chat log...");

  try {
    const response = await getFunctionResponse("upload-chat-log", { body: formData });
    if (!response.ok) {
      throw new Error(await parseFunctionError(response, "Could not upload chat log."));
    }
    const payload = await response.json();
    chatRepositoryState.chatLogs.unshift(payload.chatLog);
    await loadChatLogs();
    chatRepositoryState.uploading = false;
    closeUploadModal();
    setChatStatus("Chat log uploaded.", "success");
    if (shouldGenerateImage) {
      generateChatLogImage(payload.chatLog, htmlForImage, { promptOverride: imagePromptOverride }).catch(() => null);
    }
  } catch (error) {
    setUploadStatus(getChatError(error), "error");
  } finally {
    chatRepositoryState.uploading = false;
    chatEls.uploadSubmit.disabled = false;
    chatEls.uploadClosers.forEach((button) => { button.disabled = false; });
  }
}

async function openChatReader(chatLog, trigger) {
  openChatModal(chatEls.readerModal, trigger);
  clearReaderObjectUrl();
  chatRepositoryState.readingChatLogId = chatLog.id;
  chatEls.readerTitle.textContent = chatLog.title || "Chat Log";
  setReaderStatus("Loading chat log...");

  try {
    let readerChatLog = chatLog;
    try {
      const primaryImage = await refreshChatLogImage(chatLog.id);
      readerChatLog = { ...chatLog, primaryImage };
    } catch (imageError) {
      console.warn("Could not refresh chat log image:", imageError);
    }
    renderReaderImage(readerChatLog);

    const response = await getFunctionResponse("get-chat-log", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatLogId: chatLog.id }),
    });
    if (!response.ok) {
      throw new Error(await parseFunctionError(response, "Could not load chat log."));
    }

    const html = await response.text();
    const readerHtml = createReaderHtml(html, readerChatLog);
    chatRepositoryState.readerObjectUrl = URL.createObjectURL(
      new Blob([readerHtml], { type: "text/html" })
    );
    chatEls.readerFrame.src = chatRepositoryState.readerObjectUrl;
    chatEls.readerFrame.hidden = false;
    setReaderStatus("");
    chatEls.readerFrame.focus();
  } catch (error) {
    setReaderStatus(getChatError(error), "error");
  }
}

async function openChatEditor(chatLog, trigger) {
  openChatModal(chatEls.editorModal, trigger);
  initializeSourceEditor();
  window.setTimeout(() => chatRepositoryState.sourceEditor?.refresh(), 0);
  clearEditorObjectUrl();
  chatRepositoryState.editingChatLogId = chatLog.id;
  chatEls.editorTitle.textContent = chatLog.title || "Edit Chat Log";
  chatEls.editorTitleInput.value = chatLog.title || "";
  chatEls.editorSummaryInput.value = chatLog.summary || "";
  setEditorSourceValue("");
  chatEls.editorSave.disabled = true;
  updateEditorGenerateImageState(chatLog.id);
  setEditorStatus("Loading HTML source...");

  try {
    let primaryImage = chatLog.primaryImage || null;
    try {
      primaryImage = await refreshChatLogImage(chatLog.id);
    } catch (imageError) {
      console.warn("Could not refresh chat log image:", imageError);
    }
    renderEditorImage(primaryImage);
    setEditorSourceValue(await fetchChatLogHtml(chatLog.id));
    updateEditorPreview();
    setEditorStatus("");
    chatEls.editorSave.disabled = false;
    focusEditorSourceAtTop();
  } catch (error) {
    setEditorStatus(getChatError(error), "error");
  }
}

function openReaderChatInEditor() {
  const chatLogId = chatRepositoryState.readingChatLogId;
  const chatLog = getChatLogById(chatLogId);
  if (!chatLog) {
    return;
  }

  closeReaderModal();
  openChatEditor(chatLog, chatEls.readerEdit);
}

async function saveChatLogEdit() {
  if (chatRepositoryState.saving || !chatRepositoryState.editingChatLogId) return;

  const title = chatEls.editorTitleInput.value.trim();
  const summary = chatEls.editorSummaryInput.value.trim();
  const html = getEditorSourceValue();
  const byteLength = new TextEncoder().encode(html).byteLength;

  if (!title || title.length > 200) {
    setEditorStatus("Title is required and must be 200 characters or fewer.", "error");
    return;
  }
  if (!summary || summary.length > 2000) {
    setEditorStatus("Summary is required and must be 2,000 characters or fewer.", "error");
    return;
  }
  if (!html.trim() || byteLength <= 0 || byteLength > MAX_CHAT_FILE_BYTES) {
    setEditorStatus("HTML source must be non-empty and 10 MB or smaller.", "error");
    return;
  }

  chatRepositoryState.saving = true;
  chatEls.editorSave.disabled = true;
  chatEls.editorClosers.forEach((button) => { button.disabled = true; });
  setEditorStatus("Saving chat log...");

  try {
    const response = await getFunctionResponse("save-chat-log", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatLogId: chatRepositoryState.editingChatLogId,
        title,
        summary,
        html,
      }),
    });
    if (!response.ok) {
      throw new Error(await parseFunctionError(response, "Could not save chat log."));
    }
    await loadChatLogs();
    chatRepositoryState.saving = false;
    closeEditorModal();
    setChatStatus("Chat log saved.", "success");
  } catch (error) {
    setEditorStatus(getChatError(error), "error");
  } finally {
    chatRepositoryState.saving = false;
    chatEls.editorSave.disabled = false;
    chatEls.editorClosers.forEach((button) => { button.disabled = false; });
  }
}

async function generateImageForOpenEditor() {
  const chatLog = getChatLogById(chatRepositoryState.editingChatLogId);
  if (!chatLog || chatRepositoryState.generatingImageIds.has(chatLog.id)) return;

  const html = getEditorSourceValue();
  const virtualChatLog = {
    ...chatLog,
    title: chatEls.editorTitleInput.value.trim() || chatLog.title,
    summary: chatEls.editorSummaryInput.value.trim() || chatLog.summary,
  };

  try {
    const promptOverride = await reviewChatImagePrompt(virtualChatLog, html, {
      subtitle: "Review or revise the prompt for this chat log image.",
    });
    if (!promptOverride) {
      setEditorStatus("Image generation canceled.");
      return;
    }

    updateEditorGenerateImageState(chatLog.id);
    setEditorStatus("Generating image...");
    const image = await generateChatLogImage(virtualChatLog, html, { promptOverride, toast: true });
    renderEditorImage(image);
    setEditorStatus("Image generated.", "success");
  } catch (error) {
    setEditorStatus(`Could not generate image: ${getChatError(error)}`, "error");
  } finally {
    if (chatRepositoryState.editingChatLogId === chatLog.id) {
      updateEditorGenerateImageState(chatLog.id);
    }
  }
}

async function uploadImageForOpenEditor(file) {
  const chatLogId = chatRepositoryState.editingChatLogId;
  if (!chatLogId || chatRepositoryState.uploadingImage) return;

  if (chatEls.editorUploadImage) chatEls.editorUploadImage.disabled = true;
  setEditorStatus("Uploading image...");
  try {
    const image = await uploadChatLogImage(chatLogId, file);
    renderEditorImage(image);
    setEditorStatus("Image uploaded.", "success");
    showChatToast("Chat log image uploaded.", "success");
  } catch (error) {
    setEditorStatus(`Could not upload image: ${getChatError(error)}`, "error");
  } finally {
    if (chatEls.editorUploadImage) chatEls.editorUploadImage.disabled = false;
    if (chatEls.editorImageInput) {
      chatEls.editorImageInput.value = "";
    }
  }
}

async function deleteImageForOpenEditor() {
  const chatLogId = chatRepositoryState.editingChatLogId;
  if (!chatLogId || chatRepositoryState.uploadingImage || chatRepositoryState.generatingImageIds.has(chatLogId)) return;

  const chatLog = getChatLogById(chatLogId);
  if (!chatLog?.primaryImage?.id) {
    return;
  }

  const confirmed = window.confirm("Remove this image from the chat log? The stored image file will remain in iDrive.");
  if (!confirmed) {
    return;
  }

  if (chatEls.editorDeleteImage) chatEls.editorDeleteImage.disabled = true;
  setEditorStatus("Removing image association...");
  try {
    await unlinkChatLogImages(chatLogId);
    setChatLogPrimaryImage(chatLogId, null);
    renderEditorImage(null);
    renderChatLogs();
    setEditorStatus("Image association removed.", "success");
    showChatToast("Chat log image removed.", "success");
  } catch (error) {
    setEditorStatus(`Could not remove image: ${getChatError(error)}`, "error");
    if (chatEls.editorDeleteImage) chatEls.editorDeleteImage.disabled = false;
  }
}

async function deleteChatLog(chatLog, trigger) {
  if (chatRepositoryState.deleting) return;
  const confirmed = window.confirm(`Delete "${chatLog.title}" from the Chat Repository? The stored HTML file will be kept in iDrive.`);
  if (!confirmed) return;

  chatRepositoryState.deleting = true;
  trigger.disabled = true;
  setChatStatus("Deleting chat log...");

  try {
    const response = await getFunctionResponse("delete-chat-log", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatLogId: chatLog.id }),
    });
    if (!response.ok) {
      throw new Error(await parseFunctionError(response, "Could not delete chat log."));
    }
    chatRepositoryState.chatLogs = chatRepositoryState.chatLogs.filter((entry) => entry.id !== chatLog.id);
    renderChatLogs();
    setChatStatus("Chat log deleted.", "success");
  } catch (error) {
    setChatStatus(getChatError(error), "error");
  } finally {
    chatRepositoryState.deleting = false;
    trigger.disabled = false;
  }
}

function submitImagePrompt(event) {
  event.preventDefault();
  const prompt = chatEls.imagePromptText?.value.trim() || "";
  if (!prompt) {
    setImagePromptStatus("Enter a prompt before generating the image.", "error");
    return;
  }

  closeImagePromptModal(prompt);
}

function handleModalKeydown(event) {
  const openModal = chatEls.imagePromptModal && !chatEls.imagePromptModal.hidden
    ? chatEls.imagePromptModal
    : (!chatEls.readerModal.hidden
    ? chatEls.readerModal
    : (!chatEls.editorModal.hidden
      ? chatEls.editorModal
      : (!chatEls.rawImportModal.hidden
        ? chatEls.rawImportModal
        : (!chatEls.uploadModal.hidden ? chatEls.uploadModal : null))));
  if (!openModal) return;

  if (event.key === "Escape") {
    event.preventDefault();
    if (openModal === chatEls.imagePromptModal) closeImagePromptModal(null);
    else if (openModal === chatEls.readerModal) closeReaderModal();
    else if (openModal === chatEls.editorModal) closeEditorModal();
    else if (openModal === chatEls.rawImportModal) closeRawImportModal();
    else closeUploadModal();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = focusableElements(openModal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

chatEls.viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.chatView;
    if (!VALID_CHAT_VIEWS.has(view)) return;
    chatRepositoryState.view = view;
    localStorage.setItem(CHAT_VIEW_KEY, view);
    renderChatLogs();
  });
});

chatEls.search?.addEventListener("input", () => {
  window.clearTimeout(chatRepositoryState.searchTimer);
  chatRepositoryState.searchTimer = window.setTimeout(() => {
    chatRepositoryState.searchQuery = chatEls.search.value.trim();
    loadChatLogs();
  }, CHAT_SEARCH_DEBOUNCE_MS);
});

chatEls.uploadOpen?.addEventListener("click", (event) => {
  openChatModal(chatEls.uploadModal, event.currentTarget);
});
chatEls.rawImportOpen?.addEventListener("click", (event) => {
  openRawImportModal(event.currentTarget);
});
chatEls.rawImportParse?.addEventListener("click", parseRawChatImport);
chatEls.rawImportSave?.addEventListener("click", saveRawChatImport);
chatEls.rawImportClosers.forEach((button) => button.addEventListener("click", closeRawImportModal));
chatEls.rawImportTitle?.addEventListener("input", () => {
  if (chatRepositoryState.rawImportParsed) refreshRawImportGeneratedHtmlFromReview();
});
chatEls.rawImportSummary?.addEventListener("input", () => {
  if (chatRepositoryState.rawImportParsed) refreshRawImportGeneratedHtmlFromReview();
});
chatEls.rawImportInstructions?.addEventListener("input", () => {
  localStorage.setItem(CHAT_RAW_IMPORT_INSTRUCTIONS_KEY, chatEls.rawImportInstructions.value);
});
chatEls.rawImportHtml?.addEventListener("input", resetRawImportReview);
chatEls.uploadForm?.addEventListener("submit", uploadChatLog);
chatEls.uploadClosers.forEach((button) => button.addEventListener("click", closeUploadModal));
chatEls.readerClosers.forEach((button) => button.addEventListener("click", closeReaderModal));
chatEls.readerEdit?.addEventListener("click", openReaderChatInEditor);
chatEls.editorClosers.forEach((button) => button.addEventListener("click", closeEditorModal));
chatEls.editorSave?.addEventListener("click", saveChatLogEdit);
chatEls.editorGenerateImage?.addEventListener("click", generateImageForOpenEditor);
chatEls.editorUploadImage?.addEventListener("click", () => chatEls.editorImageInput?.click());
chatEls.editorDeleteImage?.addEventListener("click", deleteImageForOpenEditor);
chatEls.imagePromptForm?.addEventListener("submit", submitImagePrompt);
chatEls.imagePromptClosers.forEach((button) => button.addEventListener("click", () => closeImagePromptModal(null)));
chatEls.editorImageInput?.addEventListener("change", () => {
  const file = chatEls.editorImageInput.files?.[0];
  if (file) {
    uploadImageForOpenEditor(file);
  }
});
chatEls.editorSource?.addEventListener("input", () => {
  if (!chatRepositoryState.sourceEditor) queueEditorPreviewUpdate();
});

chatEls.grid?.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-chat-log-id]");
  const editButton = event.target.closest("[data-edit-chat-log-id]");
  const deleteButton = event.target.closest("[data-delete-chat-log-id]");
  const id = openButton?.dataset.openChatLogId
    || editButton?.dataset.editChatLogId
    || deleteButton?.dataset.deleteChatLogId;
  if (!id) return;

  const chatLog = chatRepositoryState.chatLogs.find((entry) => entry.id === id);
  if (!chatLog) return;

  if (editButton) {
    openChatEditor(chatLog, editButton);
  } else if (deleteButton) {
    deleteChatLog(chatLog, deleteButton);
  } else {
    openChatReader(chatLog, openButton);
  }
});

chatEls.uploadModal?.addEventListener("click", (event) => {
  if (event.target === chatEls.uploadModal) closeUploadModal();
});
chatEls.rawImportModal?.addEventListener("click", (event) => {
  if (event.target === chatEls.rawImportModal) closeRawImportModal();
});
chatEls.readerModal?.addEventListener("click", (event) => {
  if (event.target === chatEls.readerModal) closeReaderModal();
});
chatEls.editorModal?.addEventListener("click", (event) => {
  if (event.target === chatEls.editorModal) closeEditorModal();
});
chatEls.imagePromptModal?.addEventListener("click", (event) => {
  if (event.target === chatEls.imagePromptModal) closeImagePromptModal(null);
});
document.addEventListener("keydown", handleModalKeydown);
window.addEventListener("beforeunload", () => {
  clearReaderObjectUrl();
  clearEditorObjectUrl();
  clearRawImportObjectUrl();
});

async function initializeChatRepository() {
  if (!chatRepositorySupabase) {
    setChatStatus("Supabase is not available. Refresh the page and try again.", "error");
    return;
  }

  renderChatLogs();
  try {
    chatRepositoryState.appUser = await waitForChatAppUser();
    if (!chatRepositoryState.appUser) {
      throw new Error("Could not load your Centralis profile.");
    }
    await loadChatLogs();
    await openDeepLinkedChatLog();
    reindexMissingChatLogs();
  } catch (error) {
    setChatStatus(getChatError(error), "error");
  }
}

initializeChatRepository();
