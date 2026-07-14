const CENTRALIS_HEADER_MARKUP = `
  <a class="brand" href="index.html" aria-label="Centralis home">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <rect x="5" y="5" width="14" height="14" rx="2"></rect>
        <path d="M9 5v14"></path>
        <path d="M5 10h14"></path>
      </svg>
    </span>
    <span>Centralis</span>
  </a>

  <nav class="category-nav" aria-label="Primary categories">
    <div class="menu-wrap">
      <button class="category-button menu-trigger" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="World building">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M3.6 9h16.8"></path>
          <path d="M3.6 15h16.8"></path>
          <path d="M12 3a15 15 0 0 1 0 18"></path>
          <path d="M12 3a15 15 0 0 0 0 18"></path>
        </svg>
        <span>World Building</span>
      </button>
      <div class="dropdown-menu" role="menu">
        <a href="universe-builder.html" role="menuitem">Universe Builder</a>
        <a href="stellar-architect.html#systems" role="menuitem">Stellar Architect</a>
        <a href="chronicle.html" role="menuitem">Chronicle</a>
      </div>
    </div>

    <div class="menu-wrap">
      <button class="category-button menu-trigger" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Entertainment">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="6" width="16" height="12" rx="2"></rect>
          <path d="M8 21h8"></path>
          <path d="M12 18v3"></path>
          <path d="m10 10 5 2-5 2z"></path>
        </svg>
        <span>Entertainment</span>
      </button>
      <div class="dropdown-menu" role="menu">
        <a href="movie-tracker.html" role="menuitem">Movie Tracker</a>
        <a href="chat-repository.html" role="menuitem">Chat Repository</a>
        <button type="button" role="menuitem">Episode Roulette</button>
      </div>
    </div>

    <div class="menu-wrap">
      <button class="category-button menu-trigger" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Utilities">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-5.1 5.1a2.1 2.1 0 0 0 3 3l5.1-5.1a4 4 0 0 0 5.4-5.4l-2.6 2.6-3-3z"></path>
        </svg>
        <span>Utilities</span>
      </button>
      <div class="dropdown-menu" role="menu">
        <a href="calendar.html" role="menuitem">Calendar</a>
        <a href="useful-things.html" role="menuitem">Useful Things</a>
        <button type="button" role="menuitem">Tool Two</button>
        <button type="button" role="menuitem">Tool Three</button>
      </div>
    </div>

    <div class="menu-wrap">
      <button class="category-button menu-trigger" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Settings">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"></path>
        </svg>
        <span>Settings</span>
      </button>
      <div class="dropdown-menu" role="menu">
        <button type="button" role="menuitem">Preferences</button>
        <button type="button" role="menuitem">Privacy</button>
        <button type="button" role="menuitem">Shortcuts</button>
      </div>
    </div>
  </nav>

  <div class="header-actions">
    <button class="icon-button theme-toggle" type="button" aria-label="Switch to dark mode">
      <svg class="sun-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2"></path>
        <path d="M12 20v2"></path>
        <path d="m4.93 4.93 1.41 1.41"></path>
        <path d="m17.66 17.66 1.41 1.41"></path>
        <path d="M2 12h2"></path>
        <path d="M20 12h2"></path>
        <path d="m6.34 17.66-1.41 1.41"></path>
        <path d="m19.07 4.93-1.41 1.41"></path>
      </svg>
      <svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5z"></path>
      </svg>
    </button>

    <div class="menu-wrap user-menu">
      <button class="icon-button user-button menu-trigger" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="User profile">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M4 21a8 8 0 0 1 16 0"></path>
        </svg>
      </button>
      <div class="dropdown-menu align-right" role="menu">
        <button type="button" role="menuitem">Profile</button>
        <button type="button" role="menuitem">Account</button>
        <button type="button" role="menuitem">Notifications</button>
        <button type="button" role="menuitem" data-sign-out>Sign Out</button>
      </div>
    </div>
  </div>
`;

function renderCentralisHeader() {
  document.querySelectorAll(".site-header").forEach((header) => {
    header.innerHTML = CENTRALIS_HEADER_MARKUP;
  });
}

renderCentralisHeader();

const menuTriggers = document.querySelectorAll(".menu-trigger");
const themeToggle = document.querySelector(".theme-toggle");
const modalOpeners = document.querySelectorAll("[data-open-modal]");
const modalClosers = document.querySelectorAll("[data-close-modal]");
const appShell = document.querySelector(".app-shell");
const authLanding = document.querySelector(".auth-landing");
const authForm = document.querySelector(".auth-form");
const authStatus = document.querySelector("[data-auth-status]");
const universeStatus = document.querySelector("[data-universe-status]");
const deleteUniverseStatus = document.querySelector("[data-delete-universe-status]");
const universeList = document.querySelector("[data-universe-list]");
const universeBuilderCount = document.querySelector("[data-universe-count]");
const universeBuilderSearch = document.querySelector("[data-universe-search]");
const universeBuilderStatus = document.querySelector("[data-universe-builder-status]");
const homeChronicleList = document.querySelector("[data-home-chronicle-list]");
const homeChatLogList = document.querySelector("[data-home-chat-log-list]");
const homeUniverseCount = document.querySelector("[data-home-universe-count]");
const homeChronicleCount = document.querySelector("[data-home-chronicle-count]");
const homeChatLogCount = document.querySelector("[data-home-chat-log-count]");
const googleAuthButton = document.querySelector("[data-auth-google]");
const signOutButtons = document.querySelectorAll("[data-sign-out]");
const createUniverseButtons = document.querySelectorAll("[data-create-universe]");
const universeNameLabel = document.querySelector("[data-universe-name-label]");
const universeNameInput = document.querySelector("[data-universe-name-input]");
const universeDescriptionLabel = document.querySelector("[data-universe-description-label]");
const universeDescriptionInput = document.querySelector("[data-universe-description-input]");
const universeAiToggle = document.querySelector("[data-universe-ai-toggle]");
const universeAiGenreField = document.querySelector("[data-universe-ai-genre-field]");
const universeAiGenreSelect = document.querySelector("[data-universe-ai-genre]");
const universeAiMultiToggle = document.querySelector("[data-universe-ai-multi-toggle]");
const universeAiCountInput = document.querySelector("[data-universe-ai-count]");
const universeGenerationOverlay = document.querySelector("[data-universe-generation-overlay]");
const universeGenerationOverlayLabel = document.querySelector("[data-universe-generation-overlay-label]");
const universeAiReviewModal = document.getElementById("universe-ai-review-modal");
const universeAiReviewText = document.querySelector("[data-universe-ai-review-text]");
const universeAiReviewStatus = document.querySelector("[data-universe-ai-review-status]");
const universeAiReviewCancelButtons = document.querySelectorAll("[data-universe-ai-review-cancel]");
const universeAiGenerateAgainButton = document.querySelector("[data-universe-ai-generate-again]");
const universeAiFinalizeButton = document.querySelector("[data-universe-ai-finalize]");
const universeAiMultiReviewModal = document.getElementById("universe-ai-multi-review-modal");
const universeAiIdeasList = document.querySelector("[data-universe-ai-ideas-list]");
const universeAiSelectAll = document.querySelector("[data-universe-ai-select-all]");
const universeAiMultiReviewStatus = document.querySelector("[data-universe-ai-multi-review-status]");
const universeAiMultiReviewCancelButtons = document.querySelectorAll("[data-universe-ai-multi-review-cancel]");
const universeAiMultiCreateButton = document.querySelector("[data-universe-ai-multi-create]");
const universeViewModeButtons = document.querySelectorAll("[data-universe-view-mode]");
let universeAiReviewDraft = null;
let universeAiMultiReviewDrafts = [];
let universeBuilderUniverses = [];
let universeBuilderPrimaryImages = new Map();
const UNIVERSE_TABLE = "universes";
const DEFAULT_ELEMENT_TYPES_TABLE = "default_element_types";
const DEFAULT_ELEMENT_TYPE_TEMPLATES_TABLE = "default_element_type_templates";
const DEFAULT_ELEMENT_TEMPLATE_SECTIONS_TABLE = "default_element_template_sections";
const DEFAULT_ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE = "default_element_type_template_fields";
const ELEMENT_TYPES_TABLE = "element_types";
const ELEMENT_TYPE_TEMPLATES_TABLE = "element_type_templates";
const ELEMENT_TEMPLATE_SECTIONS_TABLE = "element_template_sections";
const ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE = "element_type_template_fields";
const ELEMENTS_TABLE = "elements";
const ELEMENT_LINKS_TABLE = "element_links";
const SUPABASE_TIMEOUT_MS = 15000;
const EDGE_FUNCTION_TIMEOUT_MS = 60000;
const HOMEPAGE_ICON_READY_TIMEOUT_MS = 1200;
const HOME_SECTION_CACHE_PREFIX = "centralis-home-section-v2";
const UNIVERSE_BUILDER_VIEW_MODE_KEY = "centralis-universe-builder-view-mode";
const DEFAULT_UNIVERSE_POSITION = { x: 120, y: 120 };
const DEFAULT_UNIVERSE_FORMAT = {
  fmt_stroke_color: "#3b82f6",
  fmt_stroke_width: 2,
  fmt_stroke_style: "solid",
  fmt_path_type: "step",
  fmt_node_bg_opacity: 1,
  fmt_node_border_width: 2,
  fmt_node_image_placement: "side",
  fmt_node_layout_gap: 12
};
const UNIVERSE_AI_GENRES = [
  "Random",
  "Action/Adventure",
  "Alternate History",
  "Apocalyptic",
  "Comedy",
  "Contemporary",
  "Cosmic Horror",
  "Crime",
  "Cyberpunk",
  "Dark Fantasy",
  "Detective",
  "Drama",
  "Dystopian",
  "Epic Fantasy",
  "Espionage",
  "Fairy Tale",
  "Fantasy",
  "Folklore",
  "Gaslamp Fantasy",
  "Gothic Horror",
  "Gothic Romance",
  "Hard Science Fiction",
  "Heroic Fantasy",
  "Historical",
  "Historical Fantasy",
  "Historical Fiction",
  "Historical Romance",
  "Horror",
  "Literary Fiction",
  "Low Fantasy",
  "Magical Realism",
  "Martial Arts",
  "Military Science Fiction",
  "Mystery",
  "Mythic Fantasy",
  "Paranormal",
  "Political Intrigue",
  "Post-Apocalyptic",
  "Psychological Horror",
  "Psychological Thriller",
  "Romance",
  "Satire",
  "Science Fantasy",
  "Science Fiction",
  "Science Fiction Horror",
  "Slice of Life",
  "Space Opera",
  "Steampunk",
  "Superhero",
  "Survival",
  "Sword and Sorcery",
  "Techno-Thriller",
  "Thriller",
  "Time Travel",
  "Tragedy",
  "Urban Fantasy",
  "Weird Fiction",
  "Western",
  "Young Adult"
];
let activeModal = null;
let supabaseClient = null;
let currentAppUser = null;
let currentUserSettings = null;
let profileLoadPromise = null;
let elementTypeSeedPromise = null;
let pendingUniverseDelete = null;
let homepageIconReadyPromise = null;

window.centralisScriptVersion = "centralis-header-1";
console.warn("Centralis script loaded", window.centralisScriptVersion);

if (window.supabase && window.CENTRALIS_SUPABASE_CONFIG) {
  const { url, publishableKey } = window.CENTRALIS_SUPABASE_CONFIG;
  supabaseClient = window.supabase.createClient(url, publishableKey);
  window.centralisSupabase = supabaseClient;
} else {
  console.warn("Supabase client was not initialized.");
}

function setAuthStatus(message, type) {
  if (!authStatus) {
    return;
  }

  authStatus.textContent = message || "";
  authStatus.classList.toggle("is-error", type === "error");
  authStatus.classList.toggle("is-success", type === "success");
}

function setUniverseStatus(message, type) {
  if (!universeStatus) {
    return;
  }

  universeStatus.textContent = message || "";
  universeStatus.classList.toggle("is-error", type === "error");
  universeStatus.classList.toggle("is-success", type === "success");
}

function setDeleteUniverseStatus(message, type) {
  if (!deleteUniverseStatus) {
    return;
  }

  deleteUniverseStatus.textContent = message || "";
  deleteUniverseStatus.classList.toggle("is-error", type === "error");
  deleteUniverseStatus.classList.toggle("is-success", type === "success");
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `universe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlurb(description, maxLength = 120) {
  if (!description) {
    return "No description yet.";
  }

  const trimmed = description.trim();
  const safeMaxLength = Math.max(24, Number(maxLength) || 120);
  return trimmed.length > safeMaxLength ? `${trimmed.slice(0, safeMaxLength - 3)}...` : trimmed;
}

function formatShortDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function setHomeCount(element, count, noun) {
  if (!element) return;
  element.textContent = count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function setUniverseBuilderCount(visibleCount, totalCount = visibleCount) {
  if (!universeBuilderCount) return;
  const noun = totalCount === 1 ? "universe" : "universes";
  if (visibleCount === totalCount) {
    universeBuilderCount.textContent = totalCount === 1 ? "1 universe" : `${totalCount} universes`;
    return;
  }
  universeBuilderCount.textContent = `${visibleCount} of ${totalCount} ${noun}`;
}

function setUniverseBuilderStatus(message, type = "") {
  if (!universeBuilderStatus) return;
  universeBuilderStatus.textContent = message || "";
  universeBuilderStatus.classList.toggle("is-error", type === "error");
  universeBuilderStatus.classList.toggle("is-success", type === "success");
}

function getUniverseBuilderSearchTerm() {
  return String(universeBuilderSearch?.value || "").trim().toLowerCase();
}

function universeMatchesSearch(universe, searchTerm) {
  if (!searchTerm) return true;
  return [
    universe.name,
    universe.description,
  ].some((value) => String(value || "").toLowerCase().includes(searchTerm));
}

function getUniverseBuilderViewMode() {
  if (document.body.dataset.page !== "universe-builder") {
    return "card";
  }
  return localStorage.getItem(UNIVERSE_BUILDER_VIEW_MODE_KEY) === "list" ? "list" : "card";
}

function applyUniverseBuilderViewMode(mode = getUniverseBuilderViewMode()) {
  const safeMode = mode === "list" ? "list" : "card";
  if (document.body.dataset.page === "universe-builder") {
    localStorage.setItem(UNIVERSE_BUILDER_VIEW_MODE_KEY, safeMode);
  }
  universeViewModeButtons.forEach((button) => {
    const isActive = button.dataset.universeViewMode === safeMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  if (universeList) {
    universeList.classList.toggle("is-list-view", safeMode === "list");
    universeList.classList.toggle("is-card-view", safeMode !== "list");
  }
}

function getHomeSectionCacheKey(section) {
  if (!currentAppUser?.id) {
    return null;
  }

  return `${HOME_SECTION_CACHE_PREFIX}:${currentAppUser.id}:${section}`;
}

function readHomeSectionCache(section) {
  const key = getHomeSectionCacheKey(section);
  if (!key) {
    return null;
  }

  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!cached?.html) {
      sessionStorage.removeItem(key);
      return null;
    }

    return cached;
  } catch (error) {
    sessionStorage.removeItem(key);
    return null;
  }
}

function writeHomeSectionCache(section, listElement, countElement) {
  const key = getHomeSectionCacheKey(section);
  if (!key || !listElement) {
    return;
  }

  try {
    sessionStorage.setItem(key, JSON.stringify({
      createdAt: Date.now(),
      html: listElement.innerHTML,
      countText: countElement?.textContent || "",
    }));
  } catch (error) {
    console.warn("Could not cache homepage section:", error);
  }
}

function restoreHomeSectionCache(section, listElement, countElement, afterRestore) {
  const cached = readHomeSectionCache(section);
  if (!cached?.html || !listElement) {
    return false;
  }

  listElement.innerHTML = cached.html;
  if (countElement) {
    countElement.textContent = cached.countText || "";
  }
  afterRestore?.();
  return true;
}

function normalizeObjectImages(images = []) {
  if (!Array.isArray(images) || !images.length) {
    return [];
  }

  return [...images].sort((left, right) => {
    if (Boolean(left.is_primary) !== Boolean(right.is_primary)) {
      return left.is_primary ? -1 : 1;
    }
    return Number(left.sort_order || 0) - Number(right.sort_order || 0);
  });
}

async function fetchPrimaryImagesByObjectId(objectIds) {
  const uniqueObjectIds = [...new Set((objectIds || []).filter(Boolean))];
  if (!uniqueObjectIds.length || !supabaseClient) {
    return new Map();
  }

  try {
    const { data, error } = await supabaseClient.functions.invoke("list-object-images", {
      body: { objectIds: uniqueObjectIds },
    });
    if (error) {
      throw error;
    }

    const imagesByObjectId = new Map();
    for (const image of data?.images || []) {
      const list = imagesByObjectId.get(image.object_id) || [];
      list.push(image);
      imagesByObjectId.set(image.object_id, list);
    }

    return new Map([...imagesByObjectId.entries()].map(([objectId, images]) => [
      objectId,
      normalizeObjectImages(images)[0],
    ]));
  } catch (error) {
    console.warn("Could not load homepage card images:", error);
    return new Map();
  }
}

function getHomeCardImageClass(image) {
  return image?.image_url ? " home-card-with-image" : "";
}

function getHomeCardImageStyle(image) {
  if (!image?.image_url) {
    return "";
  }

  return ` style="--home-card-image: url('${escapeHtml(image.image_url)}')"`;
}

function toggleHomeSection(button) {
  const panel = button.closest(".home-panel");
  const body = panel?.querySelector("[data-home-section-body]");
  if (!panel || !body) return;

  const isExpanded = button.getAttribute("aria-expanded") !== "false";
  const label = button.querySelector(".sr-only");
  const title = panel.querySelector("h2")?.textContent?.trim() || "section";
  button.setAttribute("aria-expanded", String(!isExpanded));
  panel.classList.toggle("is-collapsed", isExpanded);
  body.hidden = isExpanded;
  if (label) {
    label.textContent = `${isExpanded ? "Expand" : "Collapse"} ${title}`;
  }
}

function isSameDocumentLink(anchor) {
  if (!anchor?.href) {
    return false;
  }

  const targetUrl = new URL(anchor.href, window.location.href);
  return targetUrl.origin === window.location.origin
    && targetUrl.pathname === window.location.pathname
    && targetUrl.search === window.location.search
    && targetUrl.hash === window.location.hash;
}

function createUniverseDeleteMenu(universe) {
  return `
    <div class="card-menu-wrap">
      <button class="node-kebab card-kebab" type="button" aria-label="Universe actions" aria-expanded="false" aria-haspopup="menu" data-universe-menu-button>
        <ph-dots-three-vertical weight="bold" aria-hidden="true"></ph-dots-three-vertical>
      </button>
      <div class="node-menu card-menu" role="menu" hidden>
        <button class="danger-menu-item" type="button" role="menuitem" data-delete-universe data-universe-id="${escapeHtml(universe.id)}" data-universe-name="${escapeHtml(universe.name || "Untitled Universe")}">Delete Universe</button>
      </div>
    </div>
  `;
}

function getReadableError(error) {
  return error?.message || error?.details || error?.hint || "Unknown error";
}

async function parseFunctionError(response, fallback) {
  try {
    const payload = await response.json();
    return payload?.error || payload?.message || fallback;
  } catch {
    return fallback;
  }
}

async function callCentralisFunction(name, body, label) {
  if (!supabaseClient) {
    throw new Error("Supabase is not available yet. Refresh the page and try again.");
  }

  const { data, error } = await withTimeout(supabaseClient.auth.getSession(), "Loading auth session");
  if (error || !data.session?.access_token) {
    throw error || new Error("You need to be logged in before using AI generation.");
  }

  const config = window.CENTRALIS_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) {
    throw new Error("Supabase configuration is missing.");
  }

  const response = await withTimeout(fetch(`${config.url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: config.publishableKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  }), label, EDGE_FUNCTION_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(await parseFunctionError(response, `${label} failed.`));
  }

  return response.json();
}

function isSchemaColumnError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.code === "PGRST204" || message.includes("schema cache") || message.includes("could not find");
}

function withTimeout(promise, label, timeoutMs = SUPABASE_TIMEOUT_MS) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function fetchAllRows(table, {
  select = "*",
  filters,
  order,
  label,
  pageSize = 1000
} = {}) {
  const rows = [];
  let start = 0;

  while (true) {
    let query = supabaseClient
      .from(table)
      .select(select, { count: "exact" });

    if (typeof filters === "function") {
      query = filters(query);
    }

    if (order) {
      const orders = Array.isArray(order) ? order : [order];
      orders.forEach((orderRule) => {
        query = query.order(orderRule.column, {
          ascending: orderRule.ascending !== false,
          foreignTable: orderRule.foreignTable
        });
      });
    }

    const end = start + pageSize - 1;
    const { data, error, count } = await withTimeout(
      query.range(start, end),
      `${label || `Loading ${table}`} (${start + 1}-${end + 1})`
    );

    if (error) {
      return { data: rows, error };
    }

    rows.push(...(data || []));

    if (typeof count === "number" && rows.length >= count) {
      return { data: rows, error: null, count };
    }

    if (!data || data.length < pageSize) {
      return { data: rows, error: null, count };
    }

    start += pageSize;
  }
}

async function fetchAllRowsById(table, {
  select = "*",
  filters,
  label,
  pageSize = 1000
} = {}) {
  const rows = [];
  let lastId = null;

  while (true) {
    let query = supabaseClient
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .limit(pageSize);

    if (typeof filters === "function") {
      query = filters(query);
    }

    if (lastId) {
      query = query.gt("id", lastId);
    }

    const { data, error } = await withTimeout(
      query,
      `${label || `Loading ${table}`} (${rows.length + 1}+)`
    );

    if (error) {
      return { data: rows, error };
    }

    if (!data?.length) {
      return { data: rows, error: null };
    }

    rows.push(...data);
    lastId = data[data.length - 1].id;

    if (data.length < pageSize) {
      return { data: rows, error: null };
    }
  }
}

async function insertRowsResiliently(table, rows, {
  select,
  label
} = {}) {
  let query = supabaseClient
    .from(table)
    .insert(rows);

  if (select) {
    query = query.select(select);
  }

  const { data, error } = await withTimeout(
    query,
    `${label || `Creating ${table}`} (${rows.length} rows)`
  );

  if (!error) {
    return {
      data: data || [],
      error: null,
      insertedCount: Array.isArray(data) && data.length ? data.length : rows.length,
      failedRows: []
    };
  }

  if (isSchemaColumnError(error)) {
    return {
      data: [],
      error,
      insertedCount: 0,
      failedRows: []
    };
  }

  if (rows.length === 1) {
    console.warn(`${label || `Creating ${table}`} skipped one row.`, {
      error,
      row: rows[0]
    });
    return {
      data: [],
      error: null,
      insertedCount: 0,
      failedRows: [{ row: rows[0], error }]
    };
  }

  const midpoint = Math.ceil(rows.length / 2);
  const left = await insertRowsResiliently(table, rows.slice(0, midpoint), { select, label });
  const right = await insertRowsResiliently(table, rows.slice(midpoint), { select, label });

  return {
    data: [...left.data, ...right.data],
    error: null,
    insertedCount: left.insertedCount + right.insertedCount,
    failedRows: [...left.failedRows, ...right.failedRows]
  };
}

async function insertRowsInBatches(table, rows, {
  select,
  label,
  batchSize = 250,
  resilient = false
} = {}) {
  const insertedRows = [];
  const failedRows = [];
  let insertedCount = 0;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);

    const result = resilient
      ? await insertRowsResiliently(table, batch, { select, label })
      : await insertRowsResiliently(table, batch, { select, label });

    if (result.error) {
      return { data: insertedRows, error: result.error, insertedCount, failedRows };
    }

    insertedRows.push(...(result.data || []));
    failedRows.push(...(result.failedRows || []));
    insertedCount += result.insertedCount || 0;

    if (result.failedRows?.length && !resilient) {
      return {
        data: insertedRows,
        error: result.failedRows[0].error,
        insertedCount,
        failedRows
      };
    }
  }

  return { data: insertedRows, error: null, insertedCount, failedRows };
}

function getAuthUrlMessage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("error_description")) {
    return params.get("error_description");
  }

  if (params.get("error")) {
    return params.get("error");
  }

  if (window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get("error_description")) {
      return hashParams.get("error_description");
    }

    if (hashParams.get("error")) {
      return hashParams.get("error");
    }
  }

  return "";
}

function cleanAuthUrl() {
  if (!window.location.search && !window.location.hash) {
    return;
  }

  const authParamNames = new Set([
    "access_token",
    "code",
    "error",
    "error_code",
    "error_description",
    "expires_at",
    "expires_in",
    "provider_token",
    "refresh_token",
    "token_type",
    "type"
  ]);
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  let removedAuthParam = false;

  authParamNames.forEach((name) => {
    if (searchParams.has(name)) {
      searchParams.delete(name);
      removedAuthParam = true;
    }

    if (hashParams.has(name)) {
      hashParams.delete(name);
      removedAuthParam = true;
    }
  });

  if (!removedAuthParam) {
    return;
  }

  const queryString = searchParams.toString();
  const hashString = hashParams.toString();
  const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${hashString ? `#${hashString}` : ""}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function waitForHomepageIcons() {
  if (document.body.dataset.page !== "home") {
    return Promise.resolve();
  }

  if (!homepageIconReadyPromise) {
    const iconNames = [
      "ph-arrow-right",
      "ph-planet",
      "ph-chats-circle",
      "ph-file-text",
      "ph-dots-three-vertical",
      "ph-caret-up",
    ];
    const iconPromises = iconNames.map((name) => customElements.whenDefined(name).catch(() => null));
    const timeoutPromise = new Promise((resolve) => {
      window.setTimeout(resolve, HOMEPAGE_ICON_READY_TIMEOUT_MS);
    });

    homepageIconReadyPromise = Promise.race([
      Promise.all(iconPromises),
      timeoutPromise,
    ]);
  }

  return homepageIconReadyPromise;
}

async function revealHomeElement(element) {
  if (!element) return;
  await waitForHomepageIcons();
  element.hidden = false;
}

async function showSignedInApp() {
  if (authLanding) {
    authLanding.hidden = true;
  }

  await revealHomeElement(appShell);
}

async function showSignedOutLanding() {
  if (document.body.dataset.authRequired === "true") {
    window.location.href = "index.html";
    return;
  }

  if (appShell) {
    appShell.hidden = true;
  }

  await revealHomeElement(authLanding);
}

async function ensureUserProfile(authUser) {
  if (!supabaseClient || !authUser) {
    return null;
  }

  const displayName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || null;
  const avatarUrl = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const { data: existingUser, error: findError } = await withTimeout(supabaseClient
    .from("users")
    .select("*")
    .eq("clerk_user_id", authUser.id)
    .maybeSingle(), "Loading user profile");

  if (findError) {
    throw findError;
  }

  if (existingUser) {
    const { data: updatedUser, error: updateError } = await withTimeout(supabaseClient
      .from("users")
      .update({
        email: authUser.email,
        display_name: displayName,
        avatar_url: avatarUrl,
        timezone,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingUser.id)
      .select()
      .single(), "Updating user profile");

    if (updateError) {
      throw updateError;
    }

    return updatedUser;
  }

  const { data: newUser, error: createError } = await withTimeout(supabaseClient
    .from("users")
    .insert({
      clerk_user_id: authUser.id,
      email: authUser.email,
      display_name: displayName,
      avatar_url: avatarUrl,
      timezone
    })
    .select()
    .single(), "Creating user profile");

  if (createError) {
    throw createError;
  }

  return newUser;
}

async function ensureUserSettings(userId) {
  if (!supabaseClient || !userId) {
    return null;
  }

  const { data: existingSettings, error: findError } = await withTimeout(supabaseClient
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle(), "Loading user settings");

  if (findError) {
    throw findError;
  }

  if (existingSettings) {
    return existingSettings;
  }

  const { data: newSettings, error: createError } = await withTimeout(supabaseClient
    .from("user_settings")
    .insert({ user_id: userId })
    .select()
    .single(), "Creating user settings");

  if (createError) {
    throw createError;
  }

  return newSettings;
}

function applyUserSettings(settings) {
  if (!settings?.theme) {
    return;
  }

  document.body.classList.toggle("dark-mode", settings.theme === "dark");
  localStorage.setItem("centralis-theme", settings.theme);
  updateThemeLabel();
}

async function prepareSignedInUser(authUser) {
  if (profileLoadPromise) {
    return withTimeout(profileLoadPromise, "Loading user profile");
  }

  profileLoadPromise = (async () => {
    currentAppUser = await ensureUserProfile(authUser);
    window.centralisCurrentAppUser = currentAppUser;
    currentUserSettings = await ensureUserSettings(currentAppUser.id);
    startElementTypeLibrarySeed(currentAppUser.id);
    applyUserSettings(currentUserSettings);
    const homepageDataPromise = Promise.all([
      loadUniverseCards(),
      loadRecentChronicleElements(),
      loadRecentChatLogs()
    ]);
    if (document.body.dataset.page === "home") {
      homepageDataPromise.catch((error) => {
        console.warn("Could not refresh homepage data:", error);
      });
    } else {
      await homepageDataPromise;
    }
    return currentAppUser;
  })();

  try {
    return await profileLoadPromise;
  } finally {
    profileLoadPromise = null;
  }
}

function startElementTypeLibrarySeed(userId) {
  if (!userId || elementTypeSeedPromise) {
    return elementTypeSeedPromise;
  }

  elementTypeSeedPromise = ensureUserElementTypeLibrary(userId)
    .catch((error) => {
      console.error("Could not finish element type library seeding:", error);
      window.centralisElementTypeSeedError = error;
    })
    .finally(() => {
      elementTypeSeedPromise = null;
    });
  return elementTypeSeedPromise;
}

function renderUniverseCards(data, primaryImagesByObjectId, { isBuilderPage = false } = {}) {
  if (!universeList) return;

  const allUniverses = Array.isArray(data) ? data : [];
  const searchTerm = isBuilderPage ? getUniverseBuilderSearchTerm() : "";
  const visibleUniverses = searchTerm
    ? allUniverses.filter((universe) => universeMatchesSearch(universe, searchTerm))
    : allUniverses;

  universeList.classList.toggle("is-list-view", isBuilderPage && getUniverseBuilderViewMode() === "list");
  universeList.classList.toggle("is-card-view", !isBuilderPage || getUniverseBuilderViewMode() !== "list");
  setUniverseBuilderCount(visibleUniverses.length, allUniverses.length);

  if (!visibleUniverses.length) {
    universeList.innerHTML = searchTerm
      ? '<p class="empty-state">No matching universes.</p>'
      : '<p class="empty-state">No universes yet.</p>';
    return;
  }

  universeList.innerHTML = visibleUniverses.map((universe) => {
    const image = primaryImagesByObjectId.get(universe.id);
    const isNew = isBuilderPage && !universe.opened_at;
    return `
    <article class="universe-card-wrap">
      <a class="universe-card${getHomeCardImageClass(image)}" href="universe-canvas.html?universe_id=${encodeURIComponent(universe.id)}"${getHomeCardImageStyle(image)}>
        ${isNew ? '<span class="universe-new-badge">New</span>' : ""}
        <span class="card-icon" aria-hidden="true">
          <ph-planet weight="duotone"></ph-planet>
        </span>
        <span class="universe-card-copy">
          <strong>${escapeHtml(universe.name || "Untitled Universe")}</strong>
          <span class="universe-card-description-short">${escapeHtml(createBlurb(universe.description))}</span>
          <span class="universe-card-description-long">${escapeHtml(createBlurb(universe.description, 420))}</span>
        </span>
      </a>
      ${createUniverseDeleteMenu(universe)}
    </article>
  `;
  }).join("");
  bindUniverseCardMenus();
}

async function loadUniverseCards() {
  if (!universeList || !supabaseClient || !currentAppUser) {
    return;
  }

  const isBuilderPage = document.body.dataset.page === "universe-builder";
  const restoredFromCache = !isBuilderPage && restoreHomeSectionCache("universes", universeList, homeUniverseCount, bindUniverseCardMenus);
  if (!restoredFromCache) {
    universeList.innerHTML = '<p class="empty-state">Loading universes...</p>';
    if (homeUniverseCount) homeUniverseCount.textContent = "Loading...";
  }

  try {
    let query = supabaseClient
      .from(UNIVERSE_TABLE)
      .select("id,name,description,updated_at,opened_at")
      .eq("user_id", currentAppUser.id)
      .order("updated_at", { ascending: false });
    if (!isBuilderPage) {
      query = query.limit(8);
    }
    const { data, error } = await withTimeout(query, "Loading universes");

    if (error) {
      universeList.innerHTML = `<p class="empty-state is-error">Could not load universes: ${getReadableError(error)}</p>`;
      if (homeUniverseCount) homeUniverseCount.textContent = "Error";
      if (universeBuilderCount) universeBuilderCount.textContent = "Error";
      setUniverseBuilderStatus(`Could not load universes: ${getReadableError(error)}`, "error");
      return;
    }

    const universes = data || [];
    setHomeCount(homeUniverseCount, universes.length, "universe");
    setUniverseBuilderStatus("");

    const primaryImagesByObjectId = universes.length
      ? await fetchPrimaryImagesByObjectId(universes.map((universe) => universe.id))
      : new Map();

    if (isBuilderPage) {
      universeBuilderUniverses = universes;
      universeBuilderPrimaryImages = primaryImagesByObjectId;
    }

    renderUniverseCards(universes, primaryImagesByObjectId, { isBuilderPage });
    if (!isBuilderPage) {
      writeHomeSectionCache("universes", universeList, homeUniverseCount);
    }
  } catch (error) {
    universeList.innerHTML = `<p class="empty-state is-error">Could not load universes: ${getReadableError(error)}</p>`;
    if (homeUniverseCount) homeUniverseCount.textContent = "Error";
    if (universeBuilderCount) universeBuilderCount.textContent = "Error";
    setUniverseBuilderStatus(`Could not load universes: ${getReadableError(error)}`, "error");
  }
}

async function loadRecentChronicleElements() {
  if (!homeChronicleList || !supabaseClient || !currentAppUser) {
    return;
  }

  const restoredFromCache = restoreHomeSectionCache("chronicle", homeChronicleList, homeChronicleCount);
  if (!restoredFromCache) {
    homeChronicleList.innerHTML = '<p class="empty-state">Loading Chronicle elements...</p>';
    if (homeChronicleCount) homeChronicleCount.textContent = "Loading...";
  }

  try {
    const { data, error } = await withTimeout(supabaseClient
      .from(ELEMENTS_TABLE)
      .select("id,name,description,universe_id,updated_at,element_type_id")
      .eq("user_id", currentAppUser.id)
      .order("updated_at", { ascending: false })
      .limit(8), "Loading recent Chronicle elements");

    if (error) {
      homeChronicleList.innerHTML = `<p class="empty-state is-error">Could not load Chronicle elements: ${getReadableError(error)}</p>`;
      if (homeChronicleCount) homeChronicleCount.textContent = "Error";
      return;
    }

    if (!data?.length) {
      homeChronicleList.innerHTML = '<p class="empty-state">No Chronicle elements yet.</p>';
      setHomeCount(homeChronicleCount, 0, "element");
      writeHomeSectionCache("chronicle", homeChronicleList, homeChronicleCount);
      return;
    }

    setHomeCount(homeChronicleCount, data.length, "element");

    const universeIds = [...new Set(data.map((element) => element.universe_id).filter(Boolean))];
    let universesById = new Map();
    if (universeIds.length) {
      const universeResponse = await withTimeout(supabaseClient
        .from(UNIVERSE_TABLE)
        .select("id,name")
        .in("id", universeIds), "Loading Chronicle universe names");
      if (!universeResponse.error) {
        universesById = new Map((universeResponse.data || []).map((universe) => [universe.id, universe]));
      }
    }

    const primaryImagesByObjectId = await fetchPrimaryImagesByObjectId(data.map((element) => element.id));

    homeChronicleList.innerHTML = data.map((element) => {
      const universe = universesById.get(element.universe_id);
      const image = primaryImagesByObjectId.get(element.id);
      const href = element.universe_id
        ? `chronicle-editor.html#universe/${encodeURIComponent(element.universe_id)}/element/${encodeURIComponent(element.id)}`
        : `chronicle-editor.html#element/${encodeURIComponent(element.id)}`;
      return `
        <a class="home-chronicle-card${getHomeCardImageClass(image)}" href="${href}"${getHomeCardImageStyle(image)}>
          <span class="home-chronicle-icon" aria-hidden="true"><ph-file-text weight="duotone"></ph-file-text></span>
          <span class="home-chronicle-main">
            <strong>${escapeHtml(element.name || "Untitled Element")}</strong>
            <span>${escapeHtml(universe?.name || "Standalone Element")}</span>
            <em>${escapeHtml(createBlurb(element.description))}</em>
          </span>
        </a>
      `;
    }).join("");
    writeHomeSectionCache("chronicle", homeChronicleList, homeChronicleCount);
  } catch (error) {
    homeChronicleList.innerHTML = `<p class="empty-state is-error">Could not load Chronicle elements: ${getReadableError(error)}</p>`;
    if (homeChronicleCount) homeChronicleCount.textContent = "Error";
  }
}

async function loadRecentChatLogs() {
  if (!homeChatLogList || !supabaseClient || !currentAppUser) {
    return;
  }

  const restoredFromCache = restoreHomeSectionCache("chat-logs", homeChatLogList, homeChatLogCount);
  if (!restoredFromCache) {
    homeChatLogList.innerHTML = '<p class="empty-state">Loading chat logs...</p>';
    if (homeChatLogCount) homeChatLogCount.textContent = "Loading...";
  }

  try {
    const { data, error } = await withTimeout(supabaseClient
      .from("chat_logs")
      .select("id,title,summary,file_size,created_at,updated_at")
      .eq("user_id", currentAppUser.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(8), "Loading recent chat logs");

    if (error) {
      homeChatLogList.innerHTML = `<p class="empty-state is-error">Could not load chat logs: ${getReadableError(error)}</p>`;
      if (homeChatLogCount) homeChatLogCount.textContent = "Error";
      return;
    }

    if (!data?.length) {
      homeChatLogList.innerHTML = '<p class="empty-state">No chat logs yet.</p>';
      setHomeCount(homeChatLogCount, 0, "log");
      writeHomeSectionCache("chat-logs", homeChatLogList, homeChatLogCount);
      return;
    }

    setHomeCount(homeChatLogCount, data.length, "log");
    const primaryImagesByObjectId = await fetchPrimaryImagesByObjectId(data.map((chatLog) => chatLog.id));

    homeChatLogList.innerHTML = data.map((chatLog) => {
      const image = primaryImagesByObjectId.get(chatLog.id);
      return `
      <a class="home-chat-log-card${getHomeCardImageClass(image)}" href="chat-repository.html?chatLogId=${encodeURIComponent(chatLog.id)}"${getHomeCardImageStyle(image)}>
        <span class="home-chronicle-icon" aria-hidden="true"><ph-chats-circle weight="duotone"></ph-chats-circle></span>
        <span class="home-chronicle-main">
          <strong>${escapeHtml(chatLog.title || "Untitled Chat Log")}</strong>
          <span>${escapeHtml(formatShortDate(chatLog.updated_at || chatLog.created_at))} · ${escapeHtml(formatFileSize(chatLog.file_size))}</span>
          <em>${escapeHtml(createBlurb(chatLog.summary))}</em>
        </span>
      </a>
    `;
    }).join("");
    writeHomeSectionCache("chat-logs", homeChatLogList, homeChatLogCount);
  } catch (error) {
    homeChatLogList.innerHTML = `<p class="empty-state is-error">Could not load chat logs: ${getReadableError(error)}</p>`;
    if (homeChatLogCount) homeChatLogCount.textContent = "Error";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getCurrentAppUser() {
  if (currentAppUser) {
    return currentAppUser;
  }

  if (profileLoadPromise) {
    return profileLoadPromise;
  }

  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await withTimeout(supabaseClient.auth.getSession(), "Loading auth session");
  if (error || !data.session?.user) {
    return null;
  }

  return prepareSignedInUser(data.session.user);
}

window.centralisGetCurrentAppUser = getCurrentAppUser;

function getCatalogTypeId(template) {
  return template.default_element_type_id ?? template.element_type_id ?? template.type_id ?? null;
}

function getCatalogTemplateId(record) {
  return record.default_template_id ?? record.template_id ?? null;
}

function getCatalogSectionId(record) {
  return record.default_section_id ?? record.section_id ?? null;
}

function normalizeLibraryKey(value) {
  return String(value || "").trim().toLowerCase();
}

function makeTemplateKey(elementTypeId, name) {
  return `${elementTypeId || ""}::${normalizeLibraryKey(name)}`;
}

function makeSectionKey(templateId, name) {
  return `${templateId || ""}::${normalizeLibraryKey(name)}`;
}

function getFieldIdentity(field) {
  return normalizeLibraryKey(field.field_key || field.label || field.name || field.id);
}

function makeFieldKey(templateId, field) {
  return `${templateId || ""}::${getFieldIdentity(field)}`;
}

const ALLOWED_TEMPLATE_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "multi_select",
  "checkbox",
  "url",
  "image",
  "rich_text",
  "relationship"
]);

function createTemplateFieldKey(field) {
  const source = field.field_key || field.label || field.name || field.id || "field";
  const key = String(source)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || "field";
}

function normalizeTemplateFieldType(fieldType) {
  const normalizedType = String(fieldType || "textarea").trim().toLowerCase();
  return ALLOWED_TEMPLATE_FIELD_TYPES.has(normalizedType) ? normalizedType : "textarea";
}

async function ensureUserElementTypeLibrary(userId) {
  if (!supabaseClient || !userId) {
    return;
  }

  const { data, error } = await withTimeout(supabaseClient
    .rpc("ensure_user_element_type_library", { p_user_id: userId }), "Seeding user element type library");

  if (error) {
    throw error;
  }

  return data;

  const { data: defaultTypes, error: defaultTypesError } = await withTimeout(supabaseClient
    .from(DEFAULT_ELEMENT_TYPES_TABLE)
    .select("id,name,description,icon,color")
    .order("name", { ascending: true }), "Loading default element types");

  if (defaultTypesError) {
    throw defaultTypesError;
  }

  if (!defaultTypes?.length) {
    return;
  }

  const { data: existingTypes, error: existingTypesError } = await withTimeout(supabaseClient
    .from(ELEMENT_TYPES_TABLE)
    .select("id,name")
    .eq("user_id", userId), "Checking user element type library");

  if (existingTypesError) {
    throw existingTypesError;
  }

  const typeByName = new Map((existingTypes || []).map((type) => [normalizeLibraryKey(type.name), type]));
  const missingTypes = defaultTypes.filter((type) => !typeByName.has(normalizeLibraryKey(type.name)));

  if (missingTypes.length) {
    const { data: createdTypes, error: createTypesError } = await withTimeout(supabaseClient
      .from(ELEMENT_TYPES_TABLE)
      .insert(missingTypes.map((type) => ({
        user_id: userId,
        name: type.name,
        description: type.description || null,
        icon: type.icon || null,
        color: type.color || "#6366f1"
      })))
      .select("id,name"), "Creating user element types");

    if (createTypesError) {
      throw createTypesError;
    }

    (createdTypes || []).forEach((type) => {
      typeByName.set(normalizeLibraryKey(type.name), type);
    });
  }

  const typeIdByDefaultId = new Map();
  defaultTypes.forEach((defaultType) => {
    const userType = typeByName.get(normalizeLibraryKey(defaultType.name));
    if (userType) {
      typeIdByDefaultId.set(defaultType.id, userType.id);
    }
  });

  const { data: defaultTemplates, error: defaultTemplatesError } = await fetchAllRowsById(DEFAULT_ELEMENT_TYPE_TEMPLATES_TABLE, {
    select: "*",
    label: "Loading default element type templates"
  });

  if (defaultTemplatesError) {
    throw defaultTemplatesError;
  }

  const userTypeIds = [...new Set([...typeIdByDefaultId.values()])];
  const { data: existingTemplates, error: existingTemplatesError } = userTypeIds.length
    ? await fetchAllRowsById(ELEMENT_TYPE_TEMPLATES_TABLE, {
      select: "id,name,element_type_id",
      filters: (query) => query.in("element_type_id", userTypeIds),
      label: "Checking user element type templates"
    })
    : { data: [], error: null };

  if (existingTemplatesError) {
    throw existingTemplatesError;
  }

  const templateByTypeAndName = new Map((existingTemplates || []).map((template) => [
    makeTemplateKey(template.element_type_id, template.name),
    template
  ]));

  const templatesToCreate = (defaultTemplates || [])
    .filter((template) => typeIdByDefaultId.has(getCatalogTypeId(template)))
    .filter((template) => !templateByTypeAndName.has(makeTemplateKey(typeIdByDefaultId.get(getCatalogTypeId(template)), template.name)))
    .map((template) => ({
      element_type_id: typeIdByDefaultId.get(getCatalogTypeId(template)),
      name: template.name,
      description: template.description || null
    }));

  if (templatesToCreate.length) {
    const { data: createdTemplates, error: createTemplatesError } = await withTimeout(supabaseClient
      .from(ELEMENT_TYPE_TEMPLATES_TABLE)
      .insert(templatesToCreate)
      .select("id,name,element_type_id"), "Creating user element type templates");

    if (createTemplatesError) {
      throw createTemplatesError;
    }

    (createdTemplates || []).forEach((template) => {
      templateByTypeAndName.set(makeTemplateKey(template.element_type_id, template.name), template);
    });
  }

  const templateIdByDefaultId = new Map();
  (defaultTemplates || []).forEach((defaultTemplate) => {
    const elementTypeId = typeIdByDefaultId.get(getCatalogTypeId(defaultTemplate));
    const userTemplate = templateByTypeAndName.get(makeTemplateKey(elementTypeId, defaultTemplate.name));
    if (userTemplate) {
      templateIdByDefaultId.set(defaultTemplate.id, userTemplate.id);
    }
  });

  const { data: defaultSections, error: defaultSectionsError } = await fetchAllRowsById(DEFAULT_ELEMENT_TEMPLATE_SECTIONS_TABLE, {
    select: "*",
    label: "Loading default template sections"
  });

  if (defaultSectionsError) {
    throw defaultSectionsError;
  }

  const userTemplateIds = [...new Set([...templateIdByDefaultId.values()])];
  const { data: existingSections, error: existingSectionsError } = userTemplateIds.length
    ? await fetchAllRowsById(ELEMENT_TEMPLATE_SECTIONS_TABLE, {
      select: "id,name,template_id",
      filters: (query) => query.in("template_id", userTemplateIds),
      label: "Checking user template sections"
    })
    : { data: [], error: null };

  if (existingSectionsError) {
    throw existingSectionsError;
  }

  const sectionByTemplateAndName = new Map((existingSections || []).map((section) => [
    makeSectionKey(section.template_id, section.name),
    section
  ]));

  const sectionsToCreate = (defaultSections || [])
    .filter((section) => templateIdByDefaultId.has(getCatalogTemplateId(section)))
    .filter((section) => !sectionByTemplateAndName.has(makeSectionKey(templateIdByDefaultId.get(getCatalogTemplateId(section)), section.name)))
    .map((section) => ({
      template_id: templateIdByDefaultId.get(getCatalogTemplateId(section)),
      name: section.name,
      description: section.description || null,
      sort_order: Number(section.sort_order || 0)
    }));

  if (sectionsToCreate.length) {
    const { data: createdSections, error: createSectionsError } = await withTimeout(supabaseClient
      .from(ELEMENT_TEMPLATE_SECTIONS_TABLE)
      .insert(sectionsToCreate)
      .select("id,name,template_id"), "Creating user template sections");

    if (createSectionsError) {
      throw createSectionsError;
    }

    (createdSections || []).forEach((section) => {
      sectionByTemplateAndName.set(makeSectionKey(section.template_id, section.name), section);
    });
  }

  const sectionIdByDefaultId = new Map();
  (defaultSections || []).forEach((defaultSection) => {
    const templateId = templateIdByDefaultId.get(getCatalogTemplateId(defaultSection));
    const userSection = sectionByTemplateAndName.get(makeSectionKey(templateId, defaultSection.name));
    if (userSection) {
      sectionIdByDefaultId.set(defaultSection.id, userSection.id);
    }
  });

  const { data: defaultFields, error: defaultFieldsError } = await fetchAllRowsById(DEFAULT_ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE, {
    select: "*",
    label: "Loading default template fields"
  });

  if (defaultFieldsError) {
    throw defaultFieldsError;
  }

  const { data: existingFields, error: existingFieldsError } = userTemplateIds.length
    ? await fetchAllRowsById(ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE, {
      select: "*",
      filters: (query) => query.in("template_id", userTemplateIds),
      label: "Checking user template fields"
    })
    : { data: [], error: null };

  if (existingFieldsError) {
    throw existingFieldsError;
  }

  const fieldByTemplateAndIdentity = new Map((existingFields || []).map((field) => [
    makeFieldKey(field.template_id, field),
    field
  ]));

  const mappedDefaultFields = (defaultFields || [])
    .filter((field) => templateIdByDefaultId.has(getCatalogTemplateId(field)));
  const unmappedFieldCount = (defaultFields || []).length - mappedDefaultFields.length;
  const fieldsToCreate = mappedDefaultFields
    .filter((field) => !fieldByTemplateAndIdentity.has(makeFieldKey(templateIdByDefaultId.get(getCatalogTemplateId(field)), field)))
    .map((field) => ({
      template_id: templateIdByDefaultId.get(getCatalogTemplateId(field)),
      section_id: getCatalogSectionId(field) ? sectionIdByDefaultId.get(getCatalogSectionId(field)) || null : null,
      field_key: createTemplateFieldKey(field),
      label: field.label || field.name || "Untitled Field",
      field_type: normalizeTemplateFieldType(field.field_type),
      description: field.description || field.hint_text || null,
      placeholder: field.placeholder || null,
      default_value: field.default_value || null,
      options: field.options || null,
      is_required: Boolean(field.is_required),
      sort_order: Number(field.sort_order || 0)
    }));

  if ((defaultFields || []).length && !fieldsToCreate.length && !(existingFields || []).length) {
    console.warn("Default template fields were found, but none could be mapped into the user library.", {
      defaultFieldCount: defaultFields.length,
      defaultTemplateMapCount: templateIdByDefaultId.size,
      defaultSectionMapCount: sectionIdByDefaultId.size,
      sampleDefaultField: defaultFields[0]
    });
  }

  let insertedFieldCount = 0;

  if (fieldsToCreate.length) {
    const {
      data: createdFields,
      error: createFieldsError,
      failedRows: failedFieldRows = []
    } = await insertRowsInBatches(ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE, fieldsToCreate, {
      select: "id",
      label: "Creating user template fields",
      resilient: true
    });

    if (createFieldsError) {
      if (!isSchemaColumnError(createFieldsError)) {
        throw createFieldsError;
      }

      console.warn("Rich template field insert used the minimal destination column shape.", createFieldsError);
      const legacyFieldsToCreate = fieldsToCreate.map((field) => ({
        template_id: field.template_id,
        field_key: field.field_key,
        label: field.label,
        field_type: field.field_type,
        section_id: field.section_id || null,
        description: field.description || null,
        sort_order: field.sort_order || 0
      }));
      const {
        data: legacyCreatedFields,
        error: legacyCreateFieldsError,
        failedRows: legacyFailedFieldRows = []
      } = await insertRowsInBatches(ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE, legacyFieldsToCreate, {
        select: "id",
        label: "Creating user template fields",
        resilient: true
      });

      if (legacyCreateFieldsError) {
        throw legacyCreateFieldsError;
      }

      insertedFieldCount = legacyCreatedFields.length || legacyFieldsToCreate.length;
      if (legacyFailedFieldRows.length) {
        console.warn("Some rich template fields could not be seeded with the minimal column shape.", {
          failedFieldCount: legacyFailedFieldRows.length,
          firstFailure: legacyFailedFieldRows[0]
        });
      }
    } else {
      insertedFieldCount = createdFields.length || fieldsToCreate.length;
      if (failedFieldRows.length) {
        console.warn("Some rich template fields could not be seeded.", {
          failedFieldCount: failedFieldRows.length,
          firstFailure: failedFieldRows[0]
        });
      }
    }
  }

  console.info("Rich template field seeding summary", {
    defaultFieldCount: (defaultFields || []).length,
    existingUserFieldCount: (existingFields || []).length,
    fieldsToCreateCount: fieldsToCreate.length,
    insertedFieldCount,
    unmappedFieldCount,
    expectedUserFieldCount: (existingFields || []).length + insertedFieldCount
  });
}

async function deleteUniverseAndChildren(universeId) {
  const deleteSteps = [
    { table: ELEMENT_LINKS_TABLE, column: "universe_id", label: "Deleting universe links" },
    { table: ELEMENTS_TABLE, column: "universe_id", label: "Deleting universe elements" },
    { table: UNIVERSE_TABLE, column: "id", label: "Deleting universe" }
  ];

  for (const step of deleteSteps) {
    const { error } = await withTimeout(supabaseClient
      .from(step.table)
      .delete()
      .eq(step.column, universeId), step.label);

    if (error) {
      throw error;
    }
  }
}

async function refreshAuthView() {
  const authUrlMessage = getAuthUrlMessage();

  if (!supabaseClient) {
    if (document.body.dataset.authRequired === "true" && appShell) {
      await revealHomeElement(appShell);
    } else {
      await showSignedOutLanding();
    }
    setAuthStatus("Supabase is not available yet. Refresh the page and try again.", "error");
    return;
  }

  const { data, error } = await withTimeout(supabaseClient.auth.getSession(), "Loading auth session");
  if (error) {
    if (document.body.dataset.authRequired === "true") {
      window.location.href = "index.html";
      return;
    }

    await showSignedOutLanding();
    if (authUrlMessage) {
      setAuthStatus(authUrlMessage, "error");
      openModal(document.getElementById("auth-modal"));
      cleanAuthUrl();
    }
    return;
  }

  if (data.session) {
    try {
      await prepareSignedInUser(data.session.user);
      await showSignedInApp();
      cleanAuthUrl();
    } catch (profileError) {
      console.error(profileError);
      if (document.body.dataset.authRequired === "true" && appShell) {
        await revealHomeElement(appShell);
      } else {
        await showSignedOutLanding();
      }
      setAuthStatus(`Login worked, but loading your profile failed: ${getReadableError(profileError)}`, "error");
    }
    return;
  }

  if (document.body.dataset.authRequired === "true") {
    window.location.href = "index.html";
    return;
  }

  await showSignedOutLanding();

  if (authUrlMessage) {
    setAuthStatus(authUrlMessage, "error");
    openModal(document.getElementById("auth-modal"));
    cleanAuthUrl();
  }
}

const savedTheme = localStorage.getItem("centralis-theme");
if (savedTheme === "dark") {
  document.body.classList.add("dark-mode");
}

function updateThemeLabel() {
  if (!themeToggle) {
    return;
  }

  const isDark = document.body.classList.contains("dark-mode");
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

function closeMenus(except) {
  menuTriggers.forEach((trigger) => {
    if (trigger !== except) {
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

function closeUniverseCardMenus(except) {
  if (!universeList) {
    return;
  }

  universeList.querySelectorAll("[data-universe-menu-button]").forEach((button) => {
    const menu = button.nextElementSibling;
    if (button !== except) {
      button.setAttribute("aria-expanded", "false");
      if (menu) {
        menu.hidden = true;
      }
    }
  });
}

function openDeleteUniverseDialog(universe) {
  const modal = document.getElementById("delete-universe-modal");
  if (!modal) {
    return;
  }

  pendingUniverseDelete = universe;
  setDeleteUniverseStatus(universe?.name ? `Delete "${universe.name}"?` : "Delete this universe?");
  openModal(modal);
}

function bindUniverseCardMenus() {
  if (!universeList) {
    return;
  }

  closeUniverseCardMenus();

  universeList.querySelectorAll("[data-universe-menu-button]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const menu = button.nextElementSibling;
      const isOpen = button.getAttribute("aria-expanded") === "true";
      closeUniverseCardMenus(button);
      button.setAttribute("aria-expanded", String(!isOpen));
      if (menu) {
        menu.hidden = isOpen;
      }
    });
  });

  universeList.querySelectorAll("[data-delete-universe]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeUniverseCardMenus();
      openDeleteUniverseDialog({
        id: button.dataset.universeId,
        name: button.dataset.universeName
      });
    });
  });
}

menuTriggers.forEach((trigger) => {
  if (trigger.classList.contains("category-button")) {
    const wrap = trigger.closest(".menu-wrap");

    wrap?.addEventListener("mouseenter", () => {
      closeMenus(trigger);
      trigger.setAttribute("aria-expanded", "true");
    });

    wrap?.addEventListener("mouseleave", () => {
      trigger.setAttribute("aria-expanded", "false");
    });

    wrap?.addEventListener("focusout", (event) => {
      if (!wrap.contains(event.relatedTarget)) {
        trigger.setAttribute("aria-expanded", "false");
      }
    });

    trigger.addEventListener("focus", () => {
      closeMenus(trigger);
      trigger.setAttribute("aria-expanded", "true");
    });

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
    });

    return;
  }

  trigger.addEventListener("click", () => {
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    closeMenus(trigger);
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });
});

document.querySelectorAll(".dropdown-menu button, .dropdown-menu a").forEach((item) => {
  item.addEventListener("click", () => {
    closeMenus();
  });
});

if (document.body.dataset.page === "home") {
  document.querySelectorAll('a[href="index.html"], a[href="./index.html"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      if (isSameDocumentLink(anchor)) {
        event.preventDefault();
        closeMenus();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".menu-wrap")) {
    closeMenus();
  }

  if (!event.target.closest(".card-menu-wrap")) {
    closeUniverseCardMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
    closeUniverseCardMenus();
    closeModal();
  }
});

function openModal(modal) {
  if (!modal) {
    return;
  }

  activeModal = modal;
  modal.hidden = false;
  document.body.classList.add("centralis-modal-open");
  closeMenus();

  const focusTarget = modal.querySelector("input, textarea, button");
  if (focusTarget) {
    focusTarget.focus({ preventScroll: true });
  }
}

function closeModal() {
  if (!activeModal) {
    return;
  }

  if (activeModal.id === "universe-ai-review-modal") {
    closeUniverseAiReviewDialog();
    return;
  }

  if (activeModal.id === "universe-ai-multi-review-modal") {
    closeUniverseAiMultiReviewDialog();
    return;
  }

  if (activeModal.id === "delete-universe-modal") {
    pendingUniverseDelete = null;
    setDeleteUniverseStatus("");
  }

  activeModal.hidden = true;
  activeModal = null;
  document.body.classList.remove("centralis-modal-open");
}

modalOpeners.forEach((opener) => {
  opener.addEventListener("click", () => {
    openModal(document.getElementById(opener.dataset.openModal));
  });
});

modalClosers.forEach((closer) => {
  closer.addEventListener("click", closeModal);
});

document.querySelectorAll("[data-home-section-toggle]").forEach((button) => {
  button.addEventListener("click", () => toggleHomeSection(button));
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop && backdrop.classList.contains("universe-modal-backdrop")) {
      return;
    }

    if (event.target === backdrop) {
      closeModal();
    }
  });
});

function setUniverseAiReviewStatus(message, type = "") {
  if (!universeAiReviewStatus) return;
  universeAiReviewStatus.textContent = message || "";
  universeAiReviewStatus.classList.toggle("is-error", type === "error");
  universeAiReviewStatus.classList.toggle("is-success", type === "success");
}

function setUniverseAiMultiReviewStatus(message, type = "") {
  if (!universeAiMultiReviewStatus) return;
  universeAiMultiReviewStatus.textContent = message || "";
  universeAiMultiReviewStatus.classList.toggle("is-error", type === "error");
  universeAiMultiReviewStatus.classList.toggle("is-success", type === "success");
}

function setUniverseGenerationBusy(isBusy, label = "Generating Universe") {
  if (universeGenerationOverlay) {
    universeGenerationOverlay.hidden = !isBusy;
  }
  if (universeGenerationOverlayLabel) {
    universeGenerationOverlayLabel.textContent = label;
  }
}

function populateUniverseAiGenreSelect() {
  if (!universeAiGenreSelect || universeAiGenreSelect.options.length) return;
  universeAiGenreSelect.innerHTML = UNIVERSE_AI_GENRES
    .map((genre) => `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`)
    .join("");
  universeAiGenreSelect.value = "Random";
}

function syncUniverseAiFields() {
  const isEnabled = Boolean(universeAiToggle?.checked);
  if (universeAiGenreField) {
    universeAiGenreField.hidden = !isEnabled;
  }
  if (universeAiMultiToggle) {
    universeAiMultiToggle.disabled = !isEnabled;
    if (!isEnabled) {
      universeAiMultiToggle.checked = false;
    }
  }
  if (universeAiCountInput) {
    universeAiCountInput.disabled = !isEnabled || !universeAiMultiToggle?.checked;
  }
  if (universeNameLabel) {
    universeNameLabel.innerHTML = isEnabled ? "Name <em>(optional AI seed)</em>" : "Name";
  }
  if (universeNameInput) {
    universeNameInput.placeholder = isEnabled
      ? "Optional — leave blank and AI will create one"
      : "e.g. The Andromeda Expanse";
    universeNameInput.required = false;
  }
  if (universeDescriptionLabel) {
    universeDescriptionLabel.innerHTML = isEnabled
      ? "Description <em>(optional AI seed)</em>"
      : "Description <em>(optional)</em>";
  }
  if (universeDescriptionInput) {
    universeDescriptionInput.placeholder = isEnabled
      ? "Optional — add premise, mood, characters, factions, or worldbuilding notes to steer AI..."
      : "A brief description of this universe...";
    universeDescriptionInput.required = false;
  }
  if (isEnabled) {
    populateUniverseAiGenreSelect();
  }
}

function getUniverseFormValues(form) {
  const formData = new FormData(form);
  const requestedCount = Math.max(2, Math.min(10, Number.parseInt(String(formData.get("universe-ai-count") || "3"), 10) || 3));
  return {
    useAi: Boolean(formData.get("universe-ai-enabled")),
    multiMode: Boolean(formData.get("universe-ai-enabled")) && Boolean(formData.get("universe-ai-multi")),
    count: requestedCount,
    genre: String(formData.get("universe-genre") || "Random").trim() || "Random",
    name: String(formData.get("universe-name") || "").trim(),
    description: String(formData.get("universe-description") || "").trim()
  };
}

function normalizeGeneratedUniverseIdea(idea) {
  return {
    name: String(idea?.name || "").replace(/\s+/g, " ").trim(),
    genre: String(idea?.genre || idea?.category || "").replace(/\s+/g, " ").trim(),
    description: String(idea?.description || "").replace(/\s+/g, " ").trim()
  };
}

function normalizeGeneratedUniverseIdeas(payload) {
  if (Array.isArray(payload?.ideas)) {
    return payload.ideas.map(normalizeGeneratedUniverseIdea).filter((idea) => idea.name && idea.description);
  }
  const singleIdea = normalizeGeneratedUniverseIdea(payload);
  return singleIdea.name && singleIdea.description ? [singleIdea] : [];
}

function formatUniverseAiReviewText(generatedUniverse) {
  const name = String(generatedUniverse?.name || "").trim();
  const description = String(generatedUniverse?.description || "").trim();
  return [
    `Name: ${name}`,
    "",
    "Description:",
    description
  ].join("\n");
}

function parseUniverseAiReviewText(value) {
  const text = String(value || "").trim();
  const match = text.match(/^Name:\s*(.*?)\s*\n+\s*Description:\s*([\s\S]*)$/i);
  if (!match) {
    return {
      name: "",
      description: text
    };
  }
  return {
    name: String(match[1] || "").trim(),
    description: String(match[2] || "").trim()
  };
}

function setUniverseAiReviewText(generatedUniverse) {
  if (!universeAiReviewText) return;
  universeAiReviewDraft = {
    name: String(generatedUniverse?.name || "").trim(),
    description: String(generatedUniverse?.description || "").trim()
  };
  universeAiReviewText.value = formatUniverseAiReviewText(generatedUniverse);
}

function openUniverseAiReviewDialog(generatedUniverse) {
  const newUniverseModal = document.getElementById("new-universe-modal");
  if (!universeAiReviewModal || !universeAiReviewText) return;

  setUniverseAiReviewText(generatedUniverse);
  setUniverseAiReviewStatus("");
  document.body.classList.add("centralis-modal-open");

  if (newUniverseModal) {
    newUniverseModal.hidden = true;
  }
  activeModal = universeAiReviewModal;
  universeAiReviewModal.hidden = false;
  requestAnimationFrame(() => universeAiReviewText.focus({ preventScroll: true }));
}

function closeUniverseAiReviewDialog() {
  const newUniverseModal = document.getElementById("new-universe-modal");
  if (universeAiReviewModal) {
    universeAiReviewModal.hidden = true;
  }
  universeAiReviewDraft = null;
  setUniverseAiReviewStatus("");
  if (newUniverseModal) {
    newUniverseModal.hidden = false;
    activeModal = newUniverseModal;
    document.body.classList.add("centralis-modal-open");
    requestAnimationFrame(() => {
      newUniverseModal.querySelector("[name=\"universe-name\"]")?.focus({ preventScroll: true });
    });
    return;
  }
  activeModal = null;
  document.body.classList.remove("centralis-modal-open");
}

function renderUniverseAiMultiReview(ideas) {
  if (!universeAiIdeasList) return;
  universeAiIdeasList.innerHTML = ideas.map((idea, index) => `
    <label class="universe-ai-idea-card">
      <input type="checkbox" data-universe-ai-idea-select value="${index}" checked>
      <span class="universe-ai-idea-body">
        <span class="universe-ai-idea-title-row">
          <strong>${escapeHtml(idea.name || "Untitled Universe")}</strong>
          <span class="universe-ai-idea-genre">${escapeHtml(idea.genre || "AI-selected genre")}</span>
        </span>
        <span>${escapeHtml(idea.description || "No description generated.")}</span>
      </span>
    </label>
  `).join("");
  syncUniverseAiSelectAllState();
}

function syncUniverseAiSelectAllState() {
  if (!universeAiSelectAll || !universeAiIdeasList) return;
  const checkboxes = [...universeAiIdeasList.querySelectorAll("[data-universe-ai-idea-select]")];
  const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  universeAiSelectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
  universeAiSelectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

function openUniverseAiMultiReviewDialog(generatedPayload) {
  const newUniverseModal = document.getElementById("new-universe-modal");
  if (!universeAiMultiReviewModal || !universeAiIdeasList) return;

  const ideas = normalizeGeneratedUniverseIdeas(generatedPayload);
  universeAiMultiReviewDrafts = ideas;
  renderUniverseAiMultiReview(ideas);
  setUniverseAiMultiReviewStatus("");
  document.body.classList.add("centralis-modal-open");

  if (newUniverseModal) {
    newUniverseModal.hidden = true;
  }
  activeModal = universeAiMultiReviewModal;
  universeAiMultiReviewModal.hidden = false;
  requestAnimationFrame(() => {
    universeAiIdeasList.querySelector("[data-universe-ai-idea-select]")?.focus({ preventScroll: true });
  });
}

function closeUniverseAiMultiReviewDialog() {
  const newUniverseModal = document.getElementById("new-universe-modal");
  if (universeAiMultiReviewModal) {
    universeAiMultiReviewModal.hidden = true;
  }
  universeAiMultiReviewDrafts = [];
  setUniverseAiMultiReviewStatus("");
  if (newUniverseModal) {
    newUniverseModal.hidden = false;
    activeModal = newUniverseModal;
    document.body.classList.add("centralis-modal-open");
    requestAnimationFrame(() => {
      newUniverseModal.querySelector("[name=\"universe-name\"]")?.focus({ preventScroll: true });
    });
    return;
  }
  activeModal = null;
  document.body.classList.remove("centralis-modal-open");
}

async function createUniverseRecord({ name, description }, statusSetter) {
  if (!supabaseClient) {
    statusSetter("Supabase is not available yet. Refresh the page and try again.", "error");
    return null;
  }

  let appUser = null;
  try {
    appUser = await getCurrentAppUser();
  } catch (profileError) {
    statusSetter(`Could not load your user profile: ${getReadableError(profileError)}`, "error");
    return null;
  }

  if (!appUser) {
    statusSetter("You need to be logged in before creating a universe.", "error");
    return null;
  }

  const universeId = createId();
  const { error } = await withTimeout(supabaseClient
    .from(UNIVERSE_TABLE)
    .insert({
      id: universeId,
      user_id: appUser.id,
      name,
      description: description || null,
      canvas_position_x: DEFAULT_UNIVERSE_POSITION.x,
      canvas_position_y: DEFAULT_UNIVERSE_POSITION.y,
      ...DEFAULT_UNIVERSE_FORMAT
    })
    , "Creating universe");

  if (error) {
    statusSetter(`Could not create universe: ${getReadableError(error)}`, "error");
    return null;
  }

  return universeId;
}

async function generateUniverseDraft(values) {
  const payload = {
    genre: values.genre,
    name: values.name,
    description: values.description
  };
  if (values.multiMode) {
    payload.count = values.count;
  }
  return callCentralisFunction("generate-universe-metadata", payload, "Generating universe");
}

async function generateUniverseIdeas(values) {
  const targetCount = Math.max(2, Math.min(10, Number.parseInt(String(values.count || "3"), 10) || 3));
  const fallbackGenre = values.genre && values.genre !== "Random" ? values.genre : "AI-selected genre";
  const initialPayload = await generateUniverseDraft({
    ...values,
    multiMode: true,
    count: targetCount
  });
  const ideas = normalizeGeneratedUniverseIdeas(initialPayload)
    .map((idea) => ({ ...idea, genre: idea.genre || fallbackGenre }))
    .slice(0, targetCount);

  while (ideas.length < targetCount) {
    const priorNames = ideas.map((idea) => idea.name).filter(Boolean).join(", ") || "none yet";
    const nextPayload = await generateUniverseDraft({
      ...values,
      multiMode: false,
      count: 1,
      description: [
        values.description,
        `Generate a distinct additional universe idea for option ${ideas.length + 1} of ${targetCount}.`,
        `Do not repeat or closely resemble these already-generated names: ${priorNames}.`
      ].filter(Boolean).join("\n")
    });
    const nextIdeas = normalizeGeneratedUniverseIdeas(nextPayload);
    if (!nextIdeas.length) {
      break;
    }
    ideas.push({ ...nextIdeas[0], genre: nextIdeas[0].genre || fallbackGenre });
  }

  return { ideas: ideas.slice(0, targetCount) };
}

async function regenerateUniverseDraft() {
  const form = document.querySelector(".universe-form");
  if (!form) return;

  const button = universeAiGenerateAgainButton;
  if (button) {
    button.disabled = true;
  }
  if (universeAiFinalizeButton) {
    universeAiFinalizeButton.disabled = true;
  }

  try {
    setUniverseAiReviewStatus("");
    setUniverseGenerationBusy(true, "Generating Universe");
    const generatedUniverse = await generateUniverseDraft({
      ...getUniverseFormValues(form),
      multiMode: false,
      count: 1
    });
    setUniverseAiReviewText(generatedUniverse);
    requestAnimationFrame(() => universeAiReviewText?.focus({ preventScroll: true }));
  } catch (error) {
    setUniverseAiReviewStatus(getReadableError(error), "error");
  } finally {
    setUniverseGenerationBusy(false);
    if (button) {
      button.disabled = false;
    }
    if (universeAiFinalizeButton) {
      universeAiFinalizeButton.disabled = false;
    }
  }
}

async function createUniverseFromForm(form, submitButton) {
  if (!form) {
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  const values = getUniverseFormValues(form);

  try {
    if (values.useAi) {
      setUniverseStatus("Generating universe...");
      setUniverseGenerationBusy(true, values.multiMode ? "Generating Universes" : "Generating Universe");
      const generatedUniverse = values.multiMode
        ? await generateUniverseIdeas(values)
        : await generateUniverseDraft(values);
      setUniverseStatus("");
      if (values.multiMode) {
        const ideas = normalizeGeneratedUniverseIdeas(generatedUniverse);
        if (!ideas.length) {
          throw new Error("AI did not return any usable universe ideas.");
        }
        openUniverseAiMultiReviewDialog({ ideas });
        return;
      }
      openUniverseAiReviewDialog(generatedUniverse);
      return;
    }

    setUniverseStatus("Creating universe...");

    if (!values.name) {
      setUniverseStatus("Name is required.", "error");
      form.querySelector('[name="universe-name"]')?.focus();
      return;
    }

    const universeId = await createUniverseRecord({
      name: values.name,
      description: values.description
    }, setUniverseStatus);

    if (!universeId) return;

    setUniverseStatus("Universe created.", "success");
    window.location.href = `universe-canvas.html?universe_id=${encodeURIComponent(universeId)}`;
  } catch (error) {
    setUniverseStatus(getReadableError(error), "error");
  } finally {
    setUniverseGenerationBusy(false);
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

async function finalizeGeneratedUniverse() {
  if (!universeAiReviewText) return;
  const button = universeAiFinalizeButton;
  if (button) {
    button.disabled = true;
  }

  try {
    const parsed = parseUniverseAiReviewText(universeAiReviewText.value);
    const name = String(parsed?.name || "").trim();
    const description = String(parsed?.description || "").trim();
    if (!name) {
      setUniverseAiReviewStatus("Generated universe text must include a non-empty Name.", "error");
      return;
    }
    universeAiReviewDraft = {
      ...universeAiReviewDraft,
      name,
      description
    };

    setUniverseAiReviewStatus("Creating universe...");
    const universeId = await createUniverseRecord(universeAiReviewDraft, setUniverseAiReviewStatus);
    if (!universeId) return;

    setUniverseAiReviewStatus("Universe created.", "success");
    window.location.href = `universe-canvas.html?universe_id=${encodeURIComponent(universeId)}`;
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function createSelectedGeneratedUniverses() {
  if (!universeAiIdeasList) return;
  const button = universeAiMultiCreateButton;
  if (button) {
    button.disabled = true;
  }

  try {
    const selectedIndexes = [...universeAiIdeasList.querySelectorAll("[data-universe-ai-idea-select]:checked")]
      .map((input) => Number.parseInt(input.value, 10))
      .filter((index) => Number.isInteger(index));
    const selectedIdeas = selectedIndexes
      .map((index) => universeAiMultiReviewDrafts[index])
      .filter((idea) => idea?.name);

    if (!selectedIdeas.length) {
      setUniverseAiMultiReviewStatus("Select at least one universe idea to create.", "error");
      return;
    }

    setUniverseAiMultiReviewStatus("Creating selected universes...");
    for (const idea of selectedIdeas) {
      const createdId = await createUniverseRecord(idea, setUniverseAiMultiReviewStatus);
      if (!createdId) return;
    }

    setUniverseAiMultiReviewStatus("Universes created.", "success");
    window.location.href = "universe-builder.html";
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

populateUniverseAiGenreSelect();
syncUniverseAiFields();
universeAiToggle?.addEventListener("change", syncUniverseAiFields);
universeAiMultiToggle?.addEventListener("change", syncUniverseAiFields);
universeAiCountInput?.addEventListener("input", () => {
  const value = Math.max(2, Math.min(10, Number.parseInt(universeAiCountInput.value || "3", 10) || 3));
  universeAiCountInput.value = String(value);
});
universeAiReviewCancelButtons.forEach((button) => {
  button.addEventListener("click", closeUniverseAiReviewDialog);
});
universeAiMultiReviewCancelButtons.forEach((button) => {
  button.addEventListener("click", closeUniverseAiMultiReviewDialog);
});
universeAiSelectAll?.addEventListener("change", () => {
  if (!universeAiIdeasList) return;
  universeAiSelectAll.indeterminate = false;
  universeAiIdeasList.querySelectorAll("[data-universe-ai-idea-select]").forEach((checkbox) => {
    checkbox.checked = universeAiSelectAll.checked;
  });
});
universeAiIdeasList?.addEventListener("change", (event) => {
  if (event.target?.matches?.("[data-universe-ai-idea-select]")) {
    syncUniverseAiSelectAllState();
  }
});
universeAiGenerateAgainButton?.addEventListener("click", regenerateUniverseDraft);
universeAiFinalizeButton?.addEventListener("click", finalizeGeneratedUniverse);
universeAiMultiCreateButton?.addEventListener("click", createSelectedGeneratedUniverses);
applyUniverseBuilderViewMode();
universeViewModeButtons.forEach((button) => {
  button.addEventListener("click", () => applyUniverseBuilderViewMode(button.dataset.universeViewMode));
});
universeBuilderSearch?.addEventListener("input", () => {
  renderUniverseCards(universeBuilderUniverses, universeBuilderPrimaryImages, { isBuilderPage: true });
});

document.querySelectorAll(".universe-form").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createUniverseFromForm(form, event.submitter);
  });
});

document.querySelector("[data-confirm-delete-universe]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const universe = pendingUniverseDelete;

  if (!universe?.id) {
    closeModal();
    return;
  }

  if (!supabaseClient) {
    setDeleteUniverseStatus("Supabase is not available yet. Refresh the page and try again.", "error");
    return;
  }

  button.disabled = true;
  setDeleteUniverseStatus("Deleting universe...");

  try {
    await deleteUniverseAndChildren(universe.id);
    closeModal();
    await loadUniverseCards();
  } catch (error) {
    setDeleteUniverseStatus(`Could not delete universe: ${getReadableError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
});

createUniverseButtons.forEach((button) => {
  button.addEventListener("click", async (event) => {
    event.preventDefault();

    const form = event.currentTarget.closest("form");
    if (!form) {
      return;
    }

    await createUniverseFromForm(form, event.currentTarget);
  });
});

updateThemeLabel();

if (themeToggle) {
  themeToggle.addEventListener("click", async () => {
    const isDark = document.body.classList.toggle("dark-mode");
    const theme = isDark ? "dark" : "light";
    localStorage.setItem("centralis-theme", isDark ? "dark" : "light");
    updateThemeLabel();

    if (supabaseClient && currentUserSettings) {
      const { error } = await withTimeout(supabaseClient
        .from("user_settings")
        .update({
          theme,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUserSettings.id), "Saving theme preference");

      if (!error) {
        currentUserSettings.theme = theme;
      }
    }
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      setAuthStatus("Supabase is not available yet. Refresh the page and try again.", "error");
      return;
    }

    const formData = new FormData(authForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const mode = event.submitter?.dataset.authMode || "login";

    setAuthStatus(mode === "signup" ? "Creating account..." : "Logging in...");

    const response = mode === "signup"
      ? await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/index.html`
          }
        })
      : await supabaseClient.auth.signInWithPassword({ email, password });

    if (response.error) {
      setAuthStatus(response.error.message, "error");
      return;
    }

    if (mode === "signup" && !response.data.session) {
      setAuthStatus("Account created. Check your email to confirm your login.", "success");
      return;
    }

    try {
      await prepareSignedInUser(response.data.user);
      closeModal();
      await showSignedInApp();
      setAuthStatus("");
    } catch (profileError) {
      console.error(profileError);
      setAuthStatus(`Login worked, but creating your profile/settings failed: ${getReadableError(profileError)}`, "error");
    }
  });
}

if (googleAuthButton) {
  googleAuthButton.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Supabase is not available yet. Refresh the page and try again.", "error");
      return;
    }

    setAuthStatus("Opening Google login...");

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/index.html`,
        queryParams: {
          prompt: "select_account"
        },
        skipBrowserRedirect: true
      }
    });

    if (error) {
      setAuthStatus(error.message, "error");
      return;
    }

    if (!data?.url) {
      setAuthStatus("Google did not return a login URL. Check the Google provider settings in Supabase.", "error");
      return;
    }

    const authWindow = window.open(data.url, "_blank", "noopener,noreferrer");
    if (!authWindow) {
      window.location.href = data.url;
      return;
    }

    setAuthStatus("Google login opened in a new tab. Return here after signing in.", "success");
  });
}

signOutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }

    currentAppUser = null;
    currentUserSettings = null;
    window.location.href = "index.html";
  });
});

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    const sameLoadedUser = session?.user?.id && currentAppUser?.clerk_user_id === session.user.id;
    if (sameLoadedUser && ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"].includes(event)) {
      return;
    }

    if (session) {
      await showSignedInApp();
      window.setTimeout(() => {
        prepareSignedInUser(session.user).catch((profileError) => {
          console.error(profileError);
          setAuthStatus(`Login worked, but loading your profile failed: ${getReadableError(profileError)}`, "error");
        });
      }, 0);
      return;
    }

    if (document.body.dataset.authRequired === "true") {
      window.location.href = "index.html";
      return;
    }

    await showSignedOutLanding();
  });
}

refreshAuthView();
