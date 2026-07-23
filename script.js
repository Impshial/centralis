const THEME_STORAGE_KEY = "centralis-theme";
const THEME_SNAPSHOT_STORAGE_KEY = "centralis-theme-snapshot";
const THEME_MENU_STORAGE_KEY = "centralis-theme-menu";
const DEFAULT_THEME_ID = "centralis";
const THEME_SOURCE_COLOR_KEYS = ["page", "surface", "field", "text", "muted", "border", "primary", "secondary", "success", "danger"];
const DEFAULT_HEADER_THEME_IDS = ["centralis", "nebula", "deep-archive", "signal", "palette-7", "palette-28", "palette-64", "palette-103"];
const MAX_HEADER_THEME_OPTIONS = 8;
const BUILTIN_THEME_REGISTRY = [
  {
    id: "centralis",
    label: "Centralis",
    scheme: "dark",
    colors: {
      page: "#0c1115",
      surface: "#121a1f",
      field: "#121212",
      text: "#edf4f5",
      muted: "#a9b7bd",
      border: "#304149",
      primary: "#78d5c8",
      secondary: "#5146b8",
      success: "#4fd18b",
      danger: "#ff6b6b"
    }
  },
  {
    id: "nebula",
    label: "Nebula",
    scheme: "dark",
    colors: {
      page: "#0a0d18",
      surface: "#121629",
      field: "#0d1222",
      text: "#eef2ff",
      muted: "#aeb8d6",
      border: "#33415f",
      primary: "#7dd3fc",
      secondary: "#a78bfa",
      success: "#6ee7b7",
      danger: "#fb7185"
    }
  },
  {
    id: "deep-archive",
    label: "Deep Archive",
    scheme: "dark",
    colors: {
      page: "#091111",
      surface: "#111d1c",
      field: "#0b1515",
      text: "#edf7f4",
      muted: "#a7bbb5",
      border: "#2c4541",
      primary: "#94d2bd",
      secondary: "#577590",
      success: "#80ed99",
      danger: "#ef476f"
    }
  },
  {
    id: "signal",
    label: "Signal",
    scheme: "dark",
    colors: {
      page: "#080b0f",
      surface: "#101820",
      field: "#0a1118",
      text: "#f4f7fb",
      muted: "#a8b6c2",
      border: "#2d3e4b",
      primary: "#30e3ca",
      secondary: "#ffb703",
      success: "#38d996",
      danger: "#ff4d5e"
    }
  }
];
const SEEDED_IMPORTED_THEMES = [
  { id: "palette-7", label: "Clay Sage", scheme: "dark", paletteColors: ["#c7522a", "#cb6036", "#cf6e41", "#d68a58", "#dea66f", "#e5c185", "#f0daa5", "#fbf2c4", "#dae0b8", "#b8cdab"] },
  { id: "palette-28", label: "Prairie Haze", scheme: "dark", paletteColors: ["#f1ddbf", "#cabead", "#a29e9a", "#525e75", "#657980", "#78938a", "#85a78e", "#92ba92", "#aeccae", "#c9ddc9"] },
  { id: "palette-64", label: "Canyon Sage", scheme: "dark", paletteColors: ["#a85633", "#cf6e41", "#d37c4d", "#d68a58", "#dea66f", "#e5c185", "#f0daa5", "#fbf2c4", "#dae0b8", "#b8cdab"] },
  { id: "palette-103", label: "Velvet Carnival", scheme: "dark", paletteColors: ["#241642", "#a15d6d", "#e28269", "#f1ad79", "#600b5f", "#664c76", "#23348c", "#9527ae", "#c97c73", "#53091e"] }
];
let THEME_REGISTRY = [...BUILTIN_THEME_REGISTRY];
let themeLibraryLoaded = false;
let themeMenuThemeIds = [...DEFAULT_HEADER_THEME_IDS];

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(value) {
  if (!isValidHexColor(value)) return null;
  const hex = value.trim().slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => clampNumber(Math.round(channel), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function mixHexColors(first, second, amount = 0.5) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  if (!a || !b) return first;
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount
  });
}

function getColorProfile(value) {
  const rgb = hexToRgb(value) || { r: 18, g: 26, b: 31 };
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    if (max === g) hue = (b - r) / delta + 2;
    if (max === b) hue = (r - g) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return {
    value: value.trim().toLowerCase(),
    hue,
    saturation,
    lightness,
    luminance: getRelativeLuminance(value)
  };
}

function hueDistance(hue, target) {
  const distance = Math.abs(hue - target);
  return Math.min(distance, 360 - distance);
}

function pickBestColor(profiles, scoreFn, fallbackIndex = 0) {
  return [...profiles].sort((a, b) => scoreFn(b) - scoreFn(a))[0]?.value || profiles[fallbackIndex]?.value || "#78d5c8";
}

function deriveThemeColorsFromPalette(colors = []) {
  const validColors = colors.filter(isValidHexColor).map((color) => color.trim().toLowerCase());
  const fallback = BUILTIN_THEME_REGISTRY[0].colors;
  if (!validColors.length) {
    return { ...fallback };
  }
  while (validColors.length < 10) {
    validColors.push(validColors[validColors.length - 1] || fallback.primary);
  }
  const profiles = validColors.map(getColorProfile).sort((a, b) => a.luminance - b.luminance);
  const darkest = profiles[0]?.value || fallback.page;
  const secondDarkest = profiles[1]?.value || darkest;
  const thirdDarkest = profiles[2]?.value || secondDarkest;
  const lightest = profiles[profiles.length - 1]?.value || fallback.text;
  const secondLightest = profiles[profiles.length - 2]?.value || lightest;
  const border = pickBestColor(
    profiles,
    (color) => (1 - Math.abs(color.luminance - 0.18)) * 2 + (1 - color.saturation),
    2
  );
  const muted = pickBestColor(
    profiles,
    (color) => (1 - Math.abs(color.luminance - 0.58)) * 1.5 + (1 - color.saturation) * 0.8,
    profiles.length - 2
  );
  const primary = pickBestColor(
    profiles,
    (color) => color.saturation * 2 + (1 - Math.abs(color.luminance - 0.42)),
    Math.floor(profiles.length / 2)
  );
  const secondary = pickBestColor(
    profiles,
    (color) => color.saturation * 1.6 + hueDistance(color.hue, getColorProfile(primary).hue) / 180 + (1 - Math.abs(color.luminance - 0.34)),
    Math.floor(profiles.length / 2)
  );
  const success = pickBestColor(
    profiles,
    (color) => (1 - hueDistance(color.hue, 145) / 180) * 2 + color.saturation + (1 - Math.abs(color.luminance - 0.45)),
    Math.floor(profiles.length / 2)
  );
  const danger = pickBestColor(
    profiles,
    (color) => {
      const warmScore = Math.max(1 - hueDistance(color.hue, 0) / 180, 1 - hueDistance(color.hue, 24) / 180, 1 - hueDistance(color.hue, 335) / 180);
      return warmScore * 2 + color.saturation + (1 - Math.abs(color.luminance - 0.45));
    },
    Math.floor(profiles.length / 2)
  );

  return {
    page: darkest,
    surface: mixHexColors(secondDarkest, thirdDarkest, 0.35),
    field: secondDarkest,
    text: lightest,
    muted: muted || secondLightest,
    border,
    primary,
    secondary,
    success,
    danger
  };
}

function themeFromPalette({ id, label, scheme = "dark", colors, paletteColors }) {
  const rawColors = Array.isArray(paletteColors) ? paletteColors : colors;
  const theme = normalizeTheme({
    id,
    label,
    scheme,
    colors: Array.isArray(rawColors) ? deriveThemeColorsFromPalette(rawColors) : colors
  });
  if (Array.isArray(rawColors)) {
    theme.paletteColors = rawColors.slice(0, 10).map((color) => color.trim().toLowerCase());
  }
  return theme;
}

function dedupeThemes(themes) {
  const seen = new Set();
  return themes.map((theme) => {
    const normalized = normalizeTheme(theme);
    if (Array.isArray(theme.paletteColors)) {
      normalized.paletteColors = theme.paletteColors.slice(0, 10);
    }
    return normalized;
  }).filter((theme) => {
    if (!theme.id || seen.has(theme.id)) return false;
    seen.add(theme.id);
    return true;
  });
}

function normalizeThemeId(themeId) {
  if (themeId === "dark" || themeId === "light") {
    return DEFAULT_THEME_ID;
  }
  return THEME_REGISTRY.some((theme) => theme.id === themeId) ? themeId : DEFAULT_THEME_ID;
}

function getThemeById(themeId) {
  const normalizedId = normalizeThemeId(themeId);
  return THEME_REGISTRY.find((theme) => theme.id === normalizedId) || THEME_REGISTRY[0];
}

function isValidHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function hexToRgbString(value) {
  if (!isValidHexColor(value)) return "18 26 31";
  const hex = value.trim().slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ].join(" ");
}

function getRelativeLuminance(value) {
  if (!isValidHexColor(value)) return 0;
  const hex = value.trim().slice(1);
  const channels = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]
    .map((part) => Number.parseInt(part, 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function getReadableTextColor(background) {
  return getRelativeLuminance(background) > 0.55 ? "#001018" : "#ffffff";
}

function getContrastRatio(first, second) {
  const firstLuminance = getRelativeLuminance(first);
  const secondLuminance = getRelativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function getReadableColorForBackground(background, preferred, minimumRatio = 4.5) {
  if (isValidHexColor(preferred) && getContrastRatio(background, preferred) >= minimumRatio) {
    return preferred.trim();
  }
  const darkText = "#001018";
  const lightText = "#ffffff";
  return getContrastRatio(background, darkText) > getContrastRatio(background, lightText) ? darkText : lightText;
}

function ensureThemeReadability(colors) {
  const safeColors = { ...colors };
  const surface = safeColors.surface || safeColors.page || "#121a1f";
  safeColors.text = getReadableColorForBackground(surface, safeColors.text, 4.5);
  if (!isValidHexColor(safeColors.muted) || getContrastRatio(surface, safeColors.muted) < 3) {
    safeColors.muted = mixHexColors(surface, safeColors.text, 0.68);
  }
  if (!isValidHexColor(safeColors.border) || getContrastRatio(surface, safeColors.border) < 1.35) {
    safeColors.border = mixHexColors(surface, safeColors.text, 0.22);
  }
  if (!isValidHexColor(safeColors.primary) || getContrastRatio(surface, safeColors.primary) < 2.2) {
    safeColors.primary = getReadableColorForBackground(surface, safeColors.primary, 2.2);
  }
  return safeColors;
}

function normalizeTheme(themeInput) {
  const candidate = typeof themeInput === "object" && themeInput ? themeInput : getThemeById(themeInput);
  const fallback = THEME_REGISTRY[0];
  const colors = candidate.colors || {};
  const hasRequiredColors = THEME_SOURCE_COLOR_KEYS.every((key) => isValidHexColor(colors[key]));
  if (!candidate.id || !candidate.label || !["dark", "light"].includes(candidate.scheme) || !hasRequiredColors) {
    return fallback;
  }
  return {
    id: String(candidate.id),
    label: String(candidate.label),
    scheme: candidate.scheme,
    colors: ensureThemeReadability(THEME_SOURCE_COLOR_KEYS.reduce((themeColors, key) => {
      themeColors[key] = colors[key].trim();
      return themeColors;
    }, {}))
  };
}

THEME_REGISTRY = dedupeThemes([
  ...BUILTIN_THEME_REGISTRY,
  ...SEEDED_IMPORTED_THEMES.map(themeFromPalette)
]);
const PREPAINT_THEME = window.__CENTRALIS_PREPAINT_THEME__;
if (PREPAINT_THEME) {
  THEME_REGISTRY = dedupeThemes([...THEME_REGISTRY, PREPAINT_THEME]);
}

function applyTheme(themeInput, { persist = true } = {}) {
  const theme = normalizeTheme(themeInput || localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME_ID);
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.colorScheme = theme.scheme;
  root.style.colorScheme = theme.scheme;
  THEME_SOURCE_COLOR_KEYS.forEach((key) => {
    root.style.setProperty(`--theme-${key}`, theme.colors[key]);
  });
  const primaryButtonText = getReadableColorForBackground(theme.colors.primary, "", 4.5);
  const primaryButtonHover = mixHexColors(theme.colors.primary, primaryButtonText, 0.18);
  const primaryButtonHoverBorder = mixHexColors(theme.colors.primary, primaryButtonText, 0.28);
  root.style.setProperty("--node-surface-rgb", hexToRgbString(theme.colors.surface));
  root.style.setProperty("--theme-primary-hover", primaryButtonHover);
  root.style.setProperty("--theme-primary-hover-border", primaryButtonHoverBorder);
  root.style.setProperty("--primary-button-text", primaryButtonText);
  root.style.setProperty("--primary-button-hover-bg", primaryButtonHover);
  root.style.setProperty("--primary-button-hover-border", primaryButtonHoverBorder);
  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    localStorage.setItem(THEME_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      id: theme.id,
      label: theme.label,
      scheme: theme.scheme,
      colors: theme.colors
    }));
  }
  window.centralisCurrentTheme = theme;
  return theme;
}

applyTheme(PREPAINT_THEME || localStorage.getItem(THEME_STORAGE_KEY), { persist: false });

window.CENTRALIS_THEME_REGISTRY = THEME_REGISTRY;
window.centralisApplyTheme = applyTheme;
window.centralisNormalizeThemeId = normalizeThemeId;

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
        <a href="universe-builder.html" role="menuitem"><ph-planet weight="duotone" aria-hidden="true"></ph-planet><span>Universe Builder</span></a>
        <a href="stellar-architect.html#systems" role="menuitem"><ph-sparkle weight="duotone" aria-hidden="true"></ph-sparkle><span>Stellar Architect</span></a>
        <a href="chronicle.html" role="menuitem"><ph-file-text weight="duotone" aria-hidden="true"></ph-file-text><span>Chronicle</span></a>
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
        <a href="movie-tracker.html" role="menuitem"><ph-film-slate weight="duotone" aria-hidden="true"></ph-film-slate><span>Movie Tracker</span></a>
        <a href="chat-repository.html" role="menuitem"><ph-chats-circle weight="duotone" aria-hidden="true"></ph-chats-circle><span>Chat Repository</span></a>
        <a href="image-generation.html" role="menuitem"><ph-image-square weight="duotone" aria-hidden="true"></ph-image-square><span>Image Generation</span></a>
        <a href="episode-roulette.html" role="menuitem"><ph-dice-five weight="duotone" aria-hidden="true"></ph-dice-five><span>Episode Roulette</span></a>
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
        <a href="calendar.html" role="menuitem"><ph-calendar-blank weight="duotone" aria-hidden="true"></ph-calendar-blank><span>Calendar</span></a>
        <a href="todo.html" role="menuitem"><ph-check-square-offset weight="duotone" aria-hidden="true"></ph-check-square-offset><span>ToDo</span></a>
        <a href="useful-things.html" role="menuitem"><ph-wrench weight="duotone" aria-hidden="true"></ph-wrench><span>Useful Things</span></a>
      </div>
    </div>

  </nav>

  <div class="header-actions">
    <div class="menu-wrap header-theme-menu">
      <button class="icon-button header-theme-button menu-trigger" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Theme">
        <ph-palette weight="duotone" aria-hidden="true"></ph-palette>
      </button>
      <div class="dropdown-menu align-right" role="menu" aria-label="Theme">
        <div data-header-theme-options></div>
        <hr>
        <button type="button" role="menuitem" data-open-theme-selector>
          <ph-sliders-horizontal weight="duotone" aria-hidden="true"></ph-sliders-horizontal>
          <span>Theme Selector</span>
        </button>
      </div>
    </div>
    <div class="menu-wrap user-menu">
      <button class="icon-button user-button menu-trigger" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="User profile">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M4 21a8 8 0 0 1 16 0"></path>
        </svg>
      </button>
      <div class="dropdown-menu align-right" role="menu">
        <div class="user-menu-email"><ph-user-circle weight="duotone" aria-hidden="true"></ph-user-circle><span data-user-menu-email>Loading account...</span></div>
        <hr>
        <button type="button" role="menuitem"><ph-identification-card weight="duotone" aria-hidden="true"></ph-identification-card><span>Account</span></button>
        <a href="settings.html" role="menuitem"><ph-gear-six weight="duotone" aria-hidden="true"></ph-gear-six><span>Settings</span></a>
        <hr>
        <button type="button" role="menuitem" data-sign-out><ph-sign-out weight="duotone" aria-hidden="true"></ph-sign-out><span>Sign Out</span></button>
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
loadThemeMenuFromLocalStorage();
renderHeaderThemeMenu();
syncThemeOptionExports();
syncThemeSelects();

function syncUserMenuEmail(user = window.centralisCurrentAppUser) {
  document.querySelectorAll("[data-user-menu-email]").forEach((element) => {
    element.textContent = user?.email || "Signed in";
  });
}

function syncThemeSelects(themeId = window.centralisCurrentTheme?.id || DEFAULT_THEME_ID) {
  const normalizedThemeId = normalizeThemeId(themeId);
  document.querySelectorAll("[data-header-theme-option]").forEach((button) => {
    const isActive = button.dataset.headerThemeOption === normalizedThemeId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-checked", isActive ? "true" : "false");
  });
}

function getThemeMenuThemes() {
  const validIds = normalizeThemeMenuIds(themeMenuThemeIds);
  return validIds.map(getThemeById).filter(Boolean);
}

function normalizeThemeMenuIds(ids, { fillDefaults = false } = {}) {
  const sourceIds = Array.isArray(ids) ? ids : [];
  const seen = new Set();
  const normalized = [];
  sourceIds.forEach((id) => {
    const themeId = normalizeThemeId(id);
    if (!seen.has(themeId) && THEME_REGISTRY.some((theme) => theme.id === themeId)) {
      seen.add(themeId);
      normalized.push(themeId);
    }
  });
  if (fillDefaults) {
    DEFAULT_HEADER_THEME_IDS.forEach((id) => {
      if (normalized.length >= MAX_HEADER_THEME_OPTIONS) return;
      if (!seen.has(id) && THEME_REGISTRY.some((theme) => theme.id === id)) {
        seen.add(id);
        normalized.push(id);
      }
    });
  }
  return normalized.slice(0, MAX_HEADER_THEME_OPTIONS);
}

function saveThemeMenuToLocalStorage(ids = themeMenuThemeIds) {
  themeMenuThemeIds = normalizeThemeMenuIds(ids);
  localStorage.setItem(THEME_MENU_STORAGE_KEY, JSON.stringify(themeMenuThemeIds));
}

function loadThemeMenuFromLocalStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(THEME_MENU_STORAGE_KEY) || "[]");
    themeMenuThemeIds = normalizeThemeMenuIds(parsed.length ? parsed : DEFAULT_HEADER_THEME_IDS, { fillDefaults: !parsed.length });
  } catch {
    themeMenuThemeIds = normalizeThemeMenuIds(DEFAULT_HEADER_THEME_IDS, { fillDefaults: true });
  }
}

function syncThemeOptionExports() {
  window.CENTRALIS_THEME_REGISTRY = THEME_REGISTRY;
  window.centralisThemeOptions = THEME_REGISTRY.map((theme) => ({ id: theme.id, label: theme.label, scheme: theme.scheme }));
  window.dispatchEvent(new CustomEvent("centralis:themes-changed", {
    detail: { themes: window.centralisThemeOptions, menuThemeIds: [...themeMenuThemeIds] }
  }));
}

function renderHeaderThemeMenu() {
  themeMenuThemeIds = normalizeThemeMenuIds(themeMenuThemeIds, { fillDefaults: !themeMenuThemeIds.length });
  document.querySelectorAll("[data-header-theme-options]").forEach((container) => {
    container.innerHTML = getThemeMenuThemes().map((theme) => `
      <button type="button" role="menuitemradio" aria-checked="false" data-header-theme-option="${escapeHtml(theme.id)}">
        <span class="theme-menu-swatch" aria-hidden="true" style="--swatch-primary: ${escapeHtml(theme.colors.primary)}; --swatch-secondary: ${escapeHtml(theme.colors.secondary)};"></span>
        <span>${escapeHtml(theme.label)}</span>
      </button>
    `).join("");
  });
  syncThemeSelects();
}

function normalizeThemeRow(row) {
  if (!row) return null;
  const theme = normalizeTheme({
    id: row.theme_key || row.id,
    label: row.name || row.label,
    scheme: row.scheme || "dark",
    colors: row.theme_colors || row.colors || deriveThemeColorsFromPalette(row.palette_colors || row.paletteColors || [])
  });
  if (Array.isArray(row.palette_colors)) {
    theme.paletteColors = row.palette_colors.slice(0, 10).map((color) => String(color).trim().toLowerCase());
  }
  return theme.id === DEFAULT_THEME_ID && (row.theme_key || row.id) !== DEFAULT_THEME_ID ? null : theme;
}

function normalizePaletteRecord(record) {
  if (!record || !Array.isArray(record.colors)) return null;
  const id = `palette-${record.id}`;
  return themeFromPalette({
    id,
    label: record.name || `Palette ${record.id}`,
    scheme: "dark",
    paletteColors: record.colors
  });
}

async function loadImportedThemeAsset() {
  try {
    const response = await fetch("assets/theme-palettes.json?v=theme-selector-1", { cache: "force-cache" });
    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data.palettes) ? data.palettes : []).map(normalizePaletteRecord).filter(Boolean);
  } catch (error) {
    console.warn("Could not load theme palette asset.", error);
    return [];
  }
}

async function loadThemesFromDatabase() {
  if (!supabaseClient) return [];
  try {
    const { data, error } = await withTimeout(supabaseClient
      .from("themes")
      .select("theme_key,name,scheme,palette_colors,theme_colors,source,owner_user_id")
      .order("source", { ascending: true })
      .order("name", { ascending: true }), "Loading themes");
    if (error) throw error;
    return (data || []).map(normalizeThemeRow).filter(Boolean);
  } catch (error) {
    console.warn("Theme table is not available yet.", error);
    return [];
  }
}

async function loadUserThemeMenuFromDatabase() {
  if (!supabaseClient || !currentAppUser?.id) return false;
  try {
    const { data, error } = await withTimeout(supabaseClient
      .from("user_theme_menu_items")
      .select("theme_key,position")
      .eq("user_id", currentAppUser.id)
      .order("position", { ascending: true }), "Loading theme menu");
    if (error) throw error;
    if (Array.isArray(data) && data.length) {
      themeMenuThemeIds = normalizeThemeMenuIds(data.map((item) => item.theme_key));
      saveThemeMenuToLocalStorage(themeMenuThemeIds);
    }
    return true;
  } catch (error) {
    console.warn("Theme menu table is not available yet.", error);
    return false;
  }
}

async function saveUserThemeMenuToDatabase(ids = themeMenuThemeIds) {
  if (!supabaseClient || !currentAppUser?.id) return;
  const normalizedIds = normalizeThemeMenuIds(ids);
  const { error: deleteError } = await withTimeout(supabaseClient
    .from("user_theme_menu_items")
    .delete()
    .eq("user_id", currentAppUser.id), "Clearing theme menu");
  if (deleteError) throw deleteError;
  if (!normalizedIds.length) return;
  const rows = normalizedIds.map((themeKey, index) => ({
    user_id: currentAppUser.id,
    theme_key: themeKey,
    position: index
  }));
  const { error: insertError } = await withTimeout(supabaseClient
    .from("user_theme_menu_items")
    .insert(rows), "Saving theme menu");
  if (insertError) throw insertError;
}

async function loadThemeLibrary({ refresh = false } = {}) {
  if (themeLibraryLoaded && !refresh) return THEME_REGISTRY;
  const importedThemes = await loadImportedThemeAsset();
  const databaseThemes = await loadThemesFromDatabase();
  THEME_REGISTRY = dedupeThemes([
    ...BUILTIN_THEME_REGISTRY,
    ...SEEDED_IMPORTED_THEMES.map(themeFromPalette),
    PREPAINT_THEME,
    ...importedThemes,
    ...databaseThemes
  ]);
  loadThemeMenuFromLocalStorage();
  await loadUserThemeMenuFromDatabase();
  renderHeaderThemeMenu();
  syncThemeOptionExports();
  themeLibraryLoaded = true;
  return THEME_REGISTRY;
}

let themeSelectorState = {
  isOpen: false,
  savedThemeId: DEFAULT_THEME_ID,
  savedMenuIds: [...DEFAULT_HEADER_THEME_IDS],
  draftMenuIds: [...DEFAULT_HEADER_THEME_IDS],
  previewThemeId: DEFAULT_THEME_ID,
  showSelectedOnly: false,
  searchTerm: ""
};

function ensureThemeSelectorModals() {
  if (!document.getElementById("theme-selector-modal")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="modal-backdrop theme-selector-backdrop" id="theme-selector-modal" hidden>
        <div class="modal-dialog theme-selector-dialog" role="dialog" aria-modal="true" aria-labelledby="theme-selector-title">
          <header class="theme-selector-header">
            <div>
              <p class="settings-eyebrow">Appearance</p>
              <h2 id="theme-selector-title">Theme Selector</h2>
              <p>Choose the palettes shown in the header theme menu.</p>
            </div>
            <button class="modal-close" type="button" data-theme-selector-cancel aria-label="Close theme selector">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </button>
          </header>
          <div class="theme-selector-toolbar">
            <span data-theme-selector-count>0 / ${MAX_HEADER_THEME_OPTIONS} selected</span>
            <label class="theme-selector-search" for="theme-selector-search-input">
              <span class="sr-only">Search themes</span>
              <input id="theme-selector-search-input" type="search" placeholder="Search themes..." data-theme-selector-search autocomplete="off">
            </label>
            <label class="theme-selector-filter">
              <input type="checkbox" data-theme-selected-filter>
              <span class="theme-selector-checkbox-ui" aria-hidden="true"></span>
              <span>Show selected only</span>
            </label>
            <button class="secondary-action" type="button" data-create-custom-theme>
              <ph-plus weight="bold" aria-hidden="true"></ph-plus>
              <span>Create Palette</span>
            </button>
          </div>
          <div class="theme-selector-list" data-theme-selector-list></div>
          <footer class="theme-selector-footer">
            <p class="form-status" data-theme-selector-status role="status" aria-live="polite"></p>
            <div class="theme-selector-actions">
              <button class="secondary-action" type="button" data-theme-selector-cancel>Cancel</button>
              <button class="primary-action" type="button" data-theme-selector-save>Save</button>
            </div>
          </footer>
        </div>
      </div>
      <div class="modal-backdrop theme-selector-backdrop" id="custom-theme-modal" hidden>
        <div class="modal-dialog custom-theme-dialog" role="dialog" aria-modal="true" aria-labelledby="custom-theme-title">
          <header class="theme-selector-header">
            <div>
              <p class="settings-eyebrow">Appearance</p>
              <h2 id="custom-theme-title">Create Palette</h2>
              <p>Save a custom 10-color palette for your account.</p>
            </div>
          </header>
          <div class="custom-theme-body">
            <label class="form-field" for="custom-theme-name">
              <span>Palette Name</span>
              <input id="custom-theme-name" type="text" data-custom-theme-name maxlength="80" placeholder="My Palette">
            </label>
            <label class="form-field" for="custom-theme-base">
              <span>Base Palette</span>
              <select id="custom-theme-base" data-custom-theme-base></select>
            </label>
            <div class="custom-theme-colors" data-custom-theme-colors></div>
          </div>
          <footer class="theme-selector-footer">
            <p class="form-status" data-custom-theme-status role="status" aria-live="polite"></p>
            <div class="theme-selector-actions">
              <button class="secondary-action" type="button" data-custom-theme-cancel>Cancel</button>
              <button class="primary-action" type="button" data-custom-theme-save>Save</button>
            </div>
          </footer>
        </div>
      </div>
    `);
  }
}

function getPaletteColorsForTheme(theme) {
  if (Array.isArray(theme.paletteColors)) return theme.paletteColors;
  return THEME_SOURCE_COLOR_KEYS.map((key) => theme.colors[key]);
}

function setThemeSelectorStatus(message = "", type = "") {
  const status = document.querySelector("[data-theme-selector-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", type === "error");
  status.classList.toggle("is-success", type === "success");
}

function renderThemeSelectorList() {
  const list = document.querySelector("[data-theme-selector-list]");
  const count = document.querySelector("[data-theme-selector-count]");
  if (!list || !count) return;
  const selected = new Set(themeSelectorState.draftMenuIds);
  const selectedCount = selected.size;
  const filter = document.querySelector("[data-theme-selected-filter]");
  if (filter) {
    filter.checked = themeSelectorState.showSelectedOnly;
  }
  const searchInput = document.querySelector("[data-theme-selector-search]");
  if (searchInput) {
    searchInput.value = themeSelectorState.searchTerm;
  }
  count.textContent = `${selectedCount} / ${MAX_HEADER_THEME_OPTIONS} selected`;
  const searchTerm = themeSelectorState.searchTerm.trim().toLowerCase();
  const baseThemes = themeSelectorState.showSelectedOnly
    ? THEME_REGISTRY.filter((theme) => selected.has(theme.id))
    : THEME_REGISTRY;
  const visibleThemes = searchTerm
    ? baseThemes.filter((theme) => theme.label.toLowerCase().includes(searchTerm))
    : baseThemes;
  list.innerHTML = visibleThemes.map((theme) => {
    const isChecked = selected.has(theme.id);
    const isPreviewed = normalizeThemeId(themeSelectorState.previewThemeId) === theme.id;
    const disabled = !isChecked && selectedCount >= MAX_HEADER_THEME_OPTIONS;
    const paletteColors = getPaletteColorsForTheme(theme);
    return `
      <article class="theme-selector-row ${isPreviewed ? "is-previewed" : ""}" data-theme-selector-row="${escapeHtml(theme.id)}">
        <label class="theme-selector-check">
          <input type="checkbox" data-theme-menu-checkbox="${escapeHtml(theme.id)}" ${isChecked ? "checked" : ""} ${disabled ? "disabled" : ""}>
          <span class="theme-selector-checkbox-ui" aria-hidden="true"></span>
          <span class="theme-selector-check-label">${escapeHtml(theme.label)}</span>
        </label>
        <button class="theme-selector-preview" type="button" data-theme-preview="${escapeHtml(theme.id)}">
          ${paletteColors.map((color) => `
            <span class="theme-selector-swatch" title="${escapeHtml(color)}" style="--theme-selector-color: ${escapeHtml(color)};"></span>
          `).join("")}
        </button>
      </article>
    `;
  }).join("");
  if (!visibleThemes.length) {
    list.innerHTML = `
      <div class="theme-selector-empty">
        <p>No matching palettes.</p>
        <span>${themeSelectorState.showSelectedOnly ? "Adjust the search or uncheck \"Show selected only\"." : "Adjust the search to find another palette."}</span>
      </div>
    `;
  }
}

function previewTheme(themeId) {
  const theme = applyTheme(themeId, { persist: false });
  themeSelectorState.previewThemeId = theme.id;
  syncThemeSelects(theme.id);
  renderThemeSelectorList();
}

async function openThemeSelector() {
  ensureThemeSelectorModals();
  await loadThemeLibrary();
  themeSelectorState = {
    isOpen: true,
    savedThemeId: window.centralisCurrentTheme?.id || DEFAULT_THEME_ID,
    savedMenuIds: normalizeThemeMenuIds(themeMenuThemeIds),
    draftMenuIds: normalizeThemeMenuIds(themeMenuThemeIds),
    previewThemeId: window.centralisCurrentTheme?.id || DEFAULT_THEME_ID,
    showSelectedOnly: false,
    searchTerm: ""
  };
  renderThemeSelectorList();
  setThemeSelectorStatus("");
  document.getElementById("theme-selector-modal").hidden = false;
  document.body.classList.add("centralis-modal-open");
}

function cancelThemeSelector() {
  if (!themeSelectorState.isOpen) return;
  const restoredTheme = applyTheme(themeSelectorState.savedThemeId, { persist: false });
  themeMenuThemeIds = normalizeThemeMenuIds(themeSelectorState.savedMenuIds);
  renderHeaderThemeMenu();
  syncThemeSelects(restoredTheme.id);
  document.getElementById("theme-selector-modal").hidden = true;
  document.body.classList.remove("centralis-modal-open");
  themeSelectorState.isOpen = false;
}

async function saveThemeSelector() {
  const saveButton = document.querySelector("[data-theme-selector-save]");
  const selectedIds = normalizeThemeMenuIds(themeSelectorState.draftMenuIds);
  if (!selectedIds.length) {
    setThemeSelectorStatus("Select at least one palette for the header menu.", "error");
    return;
  }
  saveButton.disabled = true;
  setThemeSelectorStatus("Saving theme selection...");
  try {
    const theme = applyTheme(themeSelectorState.previewThemeId);
    themeMenuThemeIds = selectedIds;
    saveThemeMenuToLocalStorage(selectedIds);
    renderHeaderThemeMenu();
    syncThemeSelects(theme.id);
    if (supabaseClient && currentAppUser?.id) {
      await updateCurrentUserSettings({ theme: theme.id });
      await saveUserThemeMenuToDatabase(selectedIds);
    }
    setThemeSelectorStatus("Theme selection saved.", "success");
    document.getElementById("theme-selector-modal").hidden = true;
    document.body.classList.remove("centralis-modal-open");
    themeSelectorState.isOpen = false;
  } catch (error) {
    console.error(error);
    setThemeSelectorStatus(error.message || "Could not save theme selection.", "error");
  } finally {
    saveButton.disabled = false;
  }
}

function setCustomThemeStatus(message = "", type = "") {
  const status = document.querySelector("[data-custom-theme-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", type === "error");
  status.classList.toggle("is-success", type === "success");
}

function renderCustomThemeFields(baseThemeId = themeSelectorState.previewThemeId) {
  const baseSelect = document.querySelector("[data-custom-theme-base]");
  const colorsContainer = document.querySelector("[data-custom-theme-colors]");
  if (!baseSelect || !colorsContainer) return;
  baseSelect.innerHTML = THEME_REGISTRY.map((theme) => `<option value="${escapeHtml(theme.id)}">${escapeHtml(theme.label)}</option>`).join("");
  baseSelect.value = normalizeThemeId(baseThemeId);
  const baseTheme = getThemeById(baseSelect.value);
  const paletteColors = getPaletteColorsForTheme(baseTheme);
  colorsContainer.innerHTML = paletteColors.slice(0, 10).map((color, index) => `
    <label class="custom-theme-color">
      <span>Color ${index + 1}</span>
      <input type="color" value="${escapeHtml(color)}" data-custom-theme-color="${index}">
      <code>${escapeHtml(color)}</code>
    </label>
  `).join("");
}

function openCustomThemeModal() {
  ensureThemeSelectorModals();
  document.querySelector("[data-custom-theme-name]").value = "";
  renderCustomThemeFields();
  setCustomThemeStatus("");
  document.getElementById("custom-theme-modal").hidden = false;
  document.body.classList.add("centralis-modal-open");
}

function closeCustomThemeModal() {
  const modal = document.getElementById("custom-theme-modal");
  if (modal) modal.hidden = true;
  if (themeSelectorState.isOpen) {
    document.body.classList.add("centralis-modal-open");
  }
}

async function saveCustomTheme() {
  const nameInput = document.querySelector("[data-custom-theme-name]");
  const saveButton = document.querySelector("[data-custom-theme-save]");
  const name = nameInput?.value?.trim() || "";
  const paletteColors = [...document.querySelectorAll("[data-custom-theme-color]")].map((input) => input.value);
  if (!name) {
    setCustomThemeStatus("Enter a palette name.", "error");
    return;
  }
  if (paletteColors.length !== 10 || !paletteColors.every(isValidHexColor)) {
    setCustomThemeStatus("Choose 10 valid colors.", "error");
    return;
  }
  saveButton.disabled = true;
  setCustomThemeStatus("Saving palette...");
  try {
    const themeKey = `custom-${crypto.randomUUID()}`;
    const theme = themeFromPalette({
      id: themeKey,
      label: name,
      scheme: "dark",
      paletteColors
    });
    if (supabaseClient && currentAppUser?.id) {
      const { error } = await withTimeout(supabaseClient
        .from("themes")
        .insert({
          theme_key: theme.id,
          owner_user_id: currentAppUser.id,
          source: "custom",
          name: theme.label,
          scheme: theme.scheme,
          palette_colors: paletteColors,
          theme_colors: theme.colors
        }), "Saving custom palette");
      if (error) throw error;
    }
    THEME_REGISTRY = dedupeThemes([...THEME_REGISTRY, { ...theme, paletteColors }]);
    if (themeSelectorState.draftMenuIds.length < MAX_HEADER_THEME_OPTIONS) {
      themeSelectorState.draftMenuIds = normalizeThemeMenuIds([...themeSelectorState.draftMenuIds, theme.id]);
    }
    previewTheme(theme.id);
    renderHeaderThemeMenu();
    syncThemeOptionExports();
    closeCustomThemeModal();
    renderThemeSelectorList();
    setThemeSelectorStatus("Custom palette added. Save to keep it selected.", "success");
  } catch (error) {
    console.error(error);
    setCustomThemeStatus(error.message || "Could not save custom palette.", "error");
  } finally {
    saveButton.disabled = false;
  }
}

const menuTriggers = document.querySelectorAll(".menu-trigger");
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
const homeStatus = document.querySelector("[data-home-status]");
const homeRefreshed = document.querySelector("[data-home-refreshed]");
const homeStatCards = document.querySelectorAll("[data-home-stat]");
const homeUpcomingList = document.querySelector("[data-home-upcoming-events]");
const homeUpcomingCount = document.querySelector("[data-home-upcoming-count]");
const homeModuleGrid = document.querySelector("[data-home-module-grid]");
const homeTodoSummary = document.querySelector("[data-home-todo-summary]");
const homeSourceDocumentList = document.querySelector("[data-home-source-document-list]");
const homeSourceDocumentCount = document.querySelector("[data-home-source-document-count]");
const googleAuthButton = document.querySelector("[data-auth-google]");
const signOutButtons = document.querySelectorAll("[data-sign-out]");
const createUniverseButtons = document.querySelectorAll("[data-create-universe]");
const sourceDocumentsModal = document.getElementById("universe-source-documents-modal");
const sourceDocumentsForm = document.querySelector("[data-source-documents-form]");
const sourceDocumentsStatus = document.querySelector("[data-source-documents-status]");
const sourceDocumentsSubmit = document.querySelector("[data-source-documents-submit]");
const sourceDocumentsClosers = document.querySelectorAll("[data-source-documents-close]");
const sourceDocumentsUniverseName = document.querySelector("[data-source-documents-universe-name]");
const sourceDocumentsList = document.querySelector("[data-source-documents-list]");
const sourceDocumentsCount = document.querySelector("[data-source-documents-count]");
const currentUniverseDocumentsButtons = document.querySelectorAll("[data-open-current-universe-documents]");
const universeNameLabel = document.querySelector("[data-universe-name-label]");
const universeNameInput = document.querySelector("[data-universe-name-input]");
const universeDescriptionLabel = document.querySelector("[data-universe-description-label]");
const universeDescriptionInput = document.querySelector("[data-universe-description-input]");
const universeAiToggle = document.querySelector("[data-universe-ai-toggle]");
const universeAiGenreField = document.querySelector("[data-universe-ai-genre-field]");
const universeAiGenreSelect = document.querySelector("[data-universe-ai-genre]");
const universeAiMultiToggle = document.querySelector("[data-universe-ai-multi-toggle]");
const universeAiCountInput = document.querySelector("[data-universe-ai-count]");
const universeAiCountField = document.querySelector("[data-universe-ai-count-field]");
const universeGenerationOverlay = document.querySelector("[data-universe-generation-overlay]");
const universeGenerationOverlayLabel = document.querySelector("[data-universe-generation-overlay-label]");
const universeAiReviewModal = document.getElementById("universe-ai-review-modal");
const universeAiReviewName = document.querySelector("[data-universe-ai-review-name]");
const universeAiReviewDescription = document.querySelector("[data-universe-ai-review-description]");
const universeAiReviewGenre = document.querySelector("[data-universe-ai-review-genre]");
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
const UNIVERSE_SOURCE_DOCUMENTS_TABLE = "universe_source_documents";
const SUPABASE_TIMEOUT_MS = 15000;
const EDGE_FUNCTION_TIMEOUT_MS = 60000;
const HOMEPAGE_ICON_READY_TIMEOUT_MS = 1200;
const HOME_SECTION_CACHE_PREFIX = "centralis-home-section-v3";
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
let activeSourceDocumentsUniverse = null;
let sourceDocumentsUploading = false;

window.centralisScriptVersion = "documents-ui-1";
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

function formatDocumentType(mimeType, filename = "") {
  const extension = String(filename || "").split(".").pop()?.toUpperCase() || "";
  if (extension && extension.length <= 5) {
    return extension;
  }
  return String(mimeType || "Document").replace(/^application\//, "").replace(/^text\//, "").toUpperCase();
}

function getSourceDocumentTitle(document) {
  return document?.display_name || document?.original_filename || "Untitled document";
}

function setSourceDocumentsStatus(message, type = "") {
  if (!sourceDocumentsStatus) return;
  sourceDocumentsStatus.textContent = message || "";
  sourceDocumentsStatus.classList.toggle("is-error", type === "error");
  sourceDocumentsStatus.classList.toggle("is-success", type === "success");
}

function setHomeCount(element, count, noun) {
  if (!element) return;
  element.textContent = count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function formatCompactNumber(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat(undefined, {
    notation: number >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(number);
}

function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

function getRecentCutoff(days = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

function isRecentDate(value, days = 14) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date >= getRecentCutoff(days);
}

function setHomeStatus(message) {
  if (!homeStatus) return;
  homeStatus.textContent = message || "";
}

function setHomeRefreshed(date = new Date()) {
  if (!homeRefreshed) return;
  homeRefreshed.textContent = `Updated ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function getHomeStatCard(key) {
  return [...homeStatCards].find((card) => card.dataset.homeStat === key);
}

function setHomeStat(key, value, detail, { isError = false } = {}) {
  const card = getHomeStatCard(key);
  if (!card) return;
  const valueElement = card.querySelector("[data-home-stat-value]");
  const detailElement = card.querySelector("[data-home-stat-detail]");
  if (valueElement) valueElement.textContent = value;
  if (detailElement) detailElement.textContent = detail;
  card.classList.toggle("is-error", isError);
}

function setHomeStatsLoading() {
  homeStatCards.forEach((card) => {
    const valueElement = card.querySelector("[data-home-stat-value]");
    const detailElement = card.querySelector("[data-home-stat-detail]");
    if (valueElement) valueElement.textContent = "...";
    if (detailElement) detailElement.textContent = "Loading...";
    card.classList.remove("is-error");
  });
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

function getUniverseGenreIconName(universe) {
  const text = `${universe?.name || ""} ${universe?.description || ""}`.toLowerCase();
  const matches = [
    { icon: "ph-castle-turret", words: ["fantasy", "magic", "mage", "dragon", "kingdom", "realm", "fae", "sorcery"] },
    { icon: "ph-rocket-launch", words: ["sci-fi", "science fiction", "space", "starship", "galaxy", "cyber", "alien", "planet", "stellar"] },
    { icon: "ph-detective", words: ["mystery", "detective", "noir", "crime", "investigation", "murder"] },
    { icon: "ph-ghost", words: ["horror", "haunted", "ghost", "curse", "demon", "eldritch", "nightmare"] },
    { icon: "ph-scroll", words: ["historical", "ancient", "empire", "dynasty", "medieval", "renaissance"] },
    { icon: "ph-heart", words: ["romance", "love", "relationship"] },
    { icon: "ph-mask-happy", words: ["comedy", "satire", "whimsical"] },
    { icon: "ph-sword", words: ["adventure", "quest", "warrior", "battle"] },
    { icon: "ph-city", words: ["urban", "city", "municipal", "metropolis"] },
    { icon: "ph-tree-evergreen", words: ["nature", "wilderness", "forest", "wild"] },
  ];
  return matches.find((match) => match.words.some((word) => text.includes(word)))?.icon || "ph-globe-hemisphere-west";
}

function renderSourceDocumentRows(documents = [], { isHomepage = false } = {}) {
  if (!documents.length) {
    return '<p class="empty-state">No documents uploaded yet.</p>';
  }

  return documents.map((document) => {
    const universeName = document.universe_name || document.universes?.name || "";
    const href = `universe-canvas.html?universe_id=${encodeURIComponent(document.universe_id || "")}&documents=1`;
    const tagName = isHomepage ? "a" : "div";
    const hrefAttribute = isHomepage ? ` href="${href}"` : "";
    return `
      <${tagName} class="${isHomepage ? "home-source-document-card" : "source-document-row"}"${hrefAttribute}>
        <span class="${isHomepage ? "home-chronicle-icon" : "source-document-icon"}" aria-hidden="true"><ph-file-arrow-up weight="duotone"></ph-file-arrow-up></span>
        <span class="${isHomepage ? "home-chronicle-main" : "source-document-main"}">
          <strong>${escapeHtml(getSourceDocumentTitle(document))}</strong>
          <span>${escapeHtml([
            universeName,
            formatDocumentType(document.mime_type, document.original_filename),
            formatFileSize(document.file_size),
            formatShortDate(document.created_at),
          ].filter(Boolean).join(" - "))}</span>
          ${!isHomepage && document.display_name ? `<em>${escapeHtml(document.original_filename || "")}</em>` : ""}
        </span>
      </${tagName}>
    `;
  }).join("");
}

async function loadUniverseSourceDocuments(universeId) {
  if (!sourceDocumentsList || !sourceDocumentsCount || !supabaseClient || !universeId) {
    return;
  }

    sourceDocumentsList.innerHTML = '<p class="empty-state">Loading documents...</p>';
  sourceDocumentsCount.textContent = "Loading...";

  try {
    const { data, error } = await supabaseClient.functions.invoke("list-universe-source-documents", {
      body: { universeId },
    });
    if (error) throw error;

    const documents = data?.documents || [];
    setHomeCount(sourceDocumentsCount, documents.length, "document");
    sourceDocumentsList.innerHTML = renderSourceDocumentRows(documents);
  } catch (error) {
    sourceDocumentsCount.textContent = "Error";
    sourceDocumentsList.innerHTML = `<p class="empty-state is-error">Could not load documents: ${getReadableError(error)}</p>`;
  }
}

function openSourceDocumentsDialog(universe) {
  if (!sourceDocumentsModal || !universe?.id) {
    return;
  }

  activeSourceDocumentsUniverse = universe;
  if (sourceDocumentsUniverseName) {
    sourceDocumentsUniverseName.textContent = universe.name || "Untitled Universe";
  }
  sourceDocumentsForm?.reset();
  setSourceDocumentsStatus("");
  openModal(sourceDocumentsModal);
  loadUniverseSourceDocuments(universe.id);
}

function getCurrentUniverseForDocuments() {
  const params = new URLSearchParams(window.location.search);
  const universeId = params.get("universe_id") || sessionStorage.getItem("centralis-current-universe-id");
  if (!universeId) {
    return null;
  }
  const title = document.querySelector("[data-universe-title]")?.textContent?.trim();
  return {
    id: universeId,
    name: title && title !== "Universe Canvas" ? title : "Current Universe",
  };
}

function closeSourceDocumentsDialog() {
  if (sourceDocumentsUploading) {
    return;
  }

  activeSourceDocumentsUniverse = null;
  sourceDocumentsForm?.reset();
  setSourceDocumentsStatus("");
  closeModal();
}

async function uploadUniverseSourceDocument(event) {
  event.preventDefault();
  if (!activeSourceDocumentsUniverse?.id || !sourceDocumentsForm || sourceDocumentsUploading) {
    return;
  }
  if (!supabaseClient) {
    setSourceDocumentsStatus("Supabase is not available yet. Refresh the page and try again.", "error");
    return;
  }

  const formData = new FormData(sourceDocumentsForm);
  const file = formData.get("file");
  if (!(file instanceof File) || !file.name) {
    setSourceDocumentsStatus("Choose a document to upload.", "error");
    return;
  }

  formData.set("universeId", activeSourceDocumentsUniverse.id);
  sourceDocumentsUploading = true;
  if (sourceDocumentsSubmit) sourceDocumentsSubmit.disabled = true;
  sourceDocumentsClosers.forEach((button) => { button.disabled = true; });
  setSourceDocumentsStatus("Uploading document...");

  try {
    const { data, error } = await supabaseClient.functions.invoke("upload-universe-source-document", {
      body: formData,
    });
    if (error) throw error;

    sourceDocumentsForm.reset();
    setSourceDocumentsStatus(`Uploaded "${getSourceDocumentTitle(data?.document)}".`, "success");
    await loadUniverseSourceDocuments(activeSourceDocumentsUniverse.id);
    if (document.body.dataset.page === "home") {
      await loadRecentSourceDocuments();
    }
  } catch (error) {
    setSourceDocumentsStatus(`Could not upload document: ${getReadableError(error)}`, "error");
  } finally {
    sourceDocumentsUploading = false;
    if (sourceDocumentsSubmit) sourceDocumentsSubmit.disabled = false;
    sourceDocumentsClosers.forEach((button) => { button.disabled = false; });
  }
}

function getMetricTotal(result) {
  return Number(result?.total || 0);
}

function getMetricRecent(result) {
  return Number(result?.recent || 0);
}

function formatEventTime(event) {
  if (!event?.start_time) {
    return "No start time";
  }

  const start = new Date(event.start_time);
  if (!Number.isFinite(start.getTime())) {
    return "No start time";
  }

  if (event.is_all_day) {
    return `${formatShortDate(event.start_time)} - All day`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(start);
}

async function fetchHomeUniversesMetric() {
  const { data, error, count } = await withTimeout(supabaseClient
    .from(UNIVERSE_TABLE)
    .select("id,updated_at,opened_at", { count: "exact" })
    .eq("user_id", currentAppUser.id), "Loading universe overview");

  if (error) throw error;

  const rows = data || [];
  const total = count ?? rows.length;
  const recent = rows.filter((universe) => isRecentDate(universe.opened_at || universe.updated_at)).length;
  setHomeStat("universes", formatCompactNumber(total), `${recent} ${pluralize(recent, "recent update")}`);
  return { total, recent };
}

async function fetchHomeChronicleMetric() {
  const { data, error, count } = await withTimeout(supabaseClient
    .from(ELEMENTS_TABLE)
    .select("id,updated_at", { count: "exact" })
    .eq("user_id", currentAppUser.id), "Loading Chronicle overview");

  if (error) throw error;

  const rows = data || [];
  const total = count ?? rows.length;
  const recent = rows.filter((element) => isRecentDate(element.updated_at)).length;
  setHomeStat("chronicle", formatCompactNumber(total), `${recent} ${pluralize(recent, "recent update")}`);
  return { total, recent };
}

async function fetchHomeChatLogMetric() {
  const { data, error, count } = await withTimeout(supabaseClient
    .from("chat_logs")
    .select("id,file_size,updated_at,created_at", { count: "exact" })
    .eq("user_id", currentAppUser.id)
    .is("deleted_at", null), "Loading chat log overview");

  if (error) throw error;

  const rows = data || [];
  const total = count ?? rows.length;
  const recent = rows.filter((chatLog) => isRecentDate(chatLog.updated_at || chatLog.created_at)).length;
  const totalSize = rows.reduce((sum, chatLog) => sum + Number(chatLog.file_size || 0), 0);
  setHomeStat("chat-logs", formatCompactNumber(total), `${formatFileSize(totalSize)} stored`);
  return { total, recent, totalSize };
}

async function fetchHomeCalendarMetric() {
  const calendarsResponse = await withTimeout(supabaseClient
    .from("calendars")
    .select("id,name,color")
    .eq("user_id", currentAppUser.id)
    .eq("is_visible", true), "Loading calendar list");

  if (calendarsResponse.error) throw calendarsResponse.error;

  const calendars = calendarsResponse.data || [];
  const calendarIds = calendars.map((calendar) => calendar.id).filter(Boolean);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  let eventsResponse = { data: [], count: 0 };
  if (calendarIds.length) {
    eventsResponse = await withTimeout(supabaseClient
      .from("events")
      .select("id,title,start_time,end_time,is_all_day,calendar_id,status,color", { count: "exact" })
      .in("calendar_id", calendarIds)
      .gte("start_time", now)
      .order("start_time", { ascending: true })
      .limit(5), "Loading upcoming calendar events");
  }

  if (eventsResponse.error) throw eventsResponse.error;

  const tasksResponse = await withTimeout(supabaseClient
    .from("todo_tasks")
    .select("id,title,due_date,status,priority,category", { count: "exact" })
    .eq("user_id", currentAppUser.id)
    .not("due_date", "is", null)
    .gte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(5), "Loading upcoming tasks");

  if (tasksResponse.error) throw tasksResponse.error;

  const events = eventsResponse.data || [];
  const tasks = tasksResponse.data || [];
  const total = events.length + tasks.length;
  const calendarsById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const items = [
    ...events.map((event) => ({
      type: "event",
      sortDate: event.start_time,
      event,
    })),
    ...tasks.map((task) => ({
      type: "task",
      sortDate: `${task.due_date}T00:00:00`,
      task,
    })),
  ].sort((first, second) => new Date(first.sortDate) - new Date(second.sortDate)).slice(0, 5);
  const nextItem = items[0];
  setHomeStat("calendar", formatCompactNumber(total), nextItem ? `Next: ${formatShortDate(nextItem.sortDate)}` : "Nothing upcoming");
  return { total, recent: items.length, events, tasks, items, calendarsById };
}

async function fetchHomeTodoMetric() {
  const { data, error, count } = await withTimeout(supabaseClient
    .from("todo_tasks")
    .select("id,status,due_date,updated_at,created_at", { count: "exact" })
    .eq("user_id", currentAppUser.id), "Loading ToDo overview");

  if (error) throw error;

  const rows = data || [];
  const total = count ?? rows.length;
  const open = rows.filter((task) => task.status !== "completed").length;
  const scheduled = rows.filter((task) => task.due_date).length;
  if (homeTodoSummary) {
    homeTodoSummary.textContent = total
      ? `${open} open - ${scheduled} scheduled`
      : "No tasks yet. Start a list in ToDo.";
  }
  return { total, open, scheduled };
}

async function fetchHomeMovieMetric() {
  const { data, error, count } = await withTimeout(supabaseClient
    .from("movies")
    .select("id,downloaded,updated_at,created_at", { count: "exact" })
    .eq("user_id", currentAppUser.id), "Loading movie overview");

  if (error) throw error;

  const rows = data || [];
  const total = count ?? rows.length;
  const downloaded = rows.filter((movie) => movie.downloaded).length;
  const recent = rows.filter((movie) => isRecentDate(movie.updated_at || movie.created_at)).length;
  setHomeStat("movies", formatCompactNumber(total), `${downloaded} downloaded`);
  return { total, downloaded, recent };
}

async function fetchHomeImageMetric() {
  const { data, error, count } = await withTimeout(supabaseClient
    .from("image_generation_sessions")
    .select("id,updated_at,created_at", { count: "exact" })
    .eq("user_id", currentAppUser.id), "Loading image generation overview");

  if (error) throw error;

  const rows = data || [];
  const total = count ?? rows.length;
  const recent = rows.filter((session) => isRecentDate(session.updated_at || session.created_at)).length;
  setHomeStat("images", formatCompactNumber(total), `${recent} ${pluralize(recent, "recent session")}`);
  return { total, recent };
}

function renderHomeUpcomingEvents(calendarMetric) {
  if (!homeUpcomingList) return;

  const items = calendarMetric?.items || [];
  const calendarsById = calendarMetric?.calendarsById || new Map();
  if (homeUpcomingCount) {
    setHomeCount(homeUpcomingCount, calendarMetric?.total || 0, "item");
  }

  if (!items.length) {
    homeUpcomingList.innerHTML = `
      <p class="empty-state">No upcoming events or tasks. <a href="calendar.html">Open Calendar</a> to plan what is next.</p>
    `;
    return;
  }

  homeUpcomingList.innerHTML = items.map((item) => {
    if (item.type === "task") {
      const task = item.task;
      return `
        <a class="home-upcoming-event is-task" href="todo.html">
          <span class="home-upcoming-date">Task - ${escapeHtml(formatShortDate(item.sortDate))}</span>
          <strong>${escapeHtml(task.title || "Untitled Task")}</strong>
          <span>${escapeHtml(task.category || "ToDo")}</span>
        </a>
      `;
    }
    const event = item.event;
    const calendar = calendarsById.get(event.calendar_id);
    return `
      <a class="home-upcoming-event" href="calendar.html">
        <span class="home-upcoming-date">${escapeHtml(formatEventTime(event))}</span>
        <strong>${escapeHtml(event.title || "Untitled Event")}</strong>
        <span>${escapeHtml(calendar?.name || "Calendar")}</span>
      </a>
    `;
  }).join("");
}

function renderHomeModules(metrics = {}) {
  if (!homeModuleGrid) return;

  const modules = [
    {
      title: "Universe Builder",
      href: "universe-builder.html",
      icon: "ph-planet",
      detail: `${getMetricTotal(metrics.universes)} ${pluralize(getMetricTotal(metrics.universes), "universe")}`,
    },
    {
      title: "Chronicle",
      href: "chronicle.html",
      icon: "ph-file-text",
      detail: `${getMetricTotal(metrics.chronicle)} ${pluralize(getMetricTotal(metrics.chronicle), "element")}`,
    },
    {
      title: "Chat Repository",
      href: "chat-repository.html",
      icon: "ph-chats-circle",
      detail: `${getMetricTotal(metrics.chatLogs)} ${pluralize(getMetricTotal(metrics.chatLogs), "log")}`,
    },
    {
      title: "Calendar",
      href: "calendar.html",
      icon: "ph-calendar-blank",
      detail: `${getMetricTotal(metrics.calendar)} upcoming`,
    },
    {
      title: "ToDo",
      href: "todo.html",
      icon: "ph-check-square-offset",
      detail: `${metrics.todos?.open || 0} open`,
    },
    {
      title: "Movie Tracker",
      href: "movie-tracker.html",
      icon: "ph-film-slate",
      detail: `${metrics.movies?.downloaded || 0} downloaded`,
    },
    {
      title: "Stellar Architect",
      href: "stellar-architect.html#systems",
      icon: "ph-sparkle",
      detail: "Systems lab",
    },
    {
      title: "Image Generation",
      href: "image-generation.html",
      icon: "ph-image-square",
      detail: `${getMetricRecent(metrics.images)} recent`,
    },
    {
      title: "Useful Things",
      href: "useful-things.html",
      icon: "ph-wrench",
      detail: "Text, math, generators",
    },
  ];

  homeModuleGrid.innerHTML = modules.map((module) => `
    <a class="home-module-card" href="${module.href}">
      <span class="home-module-icon" aria-hidden="true"><${module.icon} weight="duotone"></${module.icon}></span>
      <span>
        <strong>${escapeHtml(module.title)}</strong>
        <em>${escapeHtml(module.detail)}</em>
      </span>
      <ph-arrow-right weight="bold" aria-hidden="true"></ph-arrow-right>
    </a>
  `).join("");
}

async function loadHomeDashboardOverview() {
  if (document.body.dataset.page !== "home" || !supabaseClient || !currentAppUser) {
    return;
  }

  setHomeStatus("Checking workspace totals and upcoming work...");
  setHomeRefreshed();
  setHomeStatsLoading();
  if (homeUpcomingList) {
    homeUpcomingList.innerHTML = '<p class="empty-state">Loading upcoming events...</p>';
  }
  if (homeUpcomingCount) {
    homeUpcomingCount.textContent = "Loading...";
  }
  if (homeModuleGrid) {
    homeModuleGrid.innerHTML = '<p class="empty-state">Loading modules...</p>';
  }

  const metricLoaders = {
    universes: fetchHomeUniversesMetric,
    chronicle: fetchHomeChronicleMetric,
    chatLogs: fetchHomeChatLogMetric,
    calendar: fetchHomeCalendarMetric,
    movies: fetchHomeMovieMetric,
    images: fetchHomeImageMetric,
    todos: fetchHomeTodoMetric,
  };
  const metricEntries = await Promise.all(Object.entries(metricLoaders).map(async ([key, loader]) => {
    try {
      return [key, await loader()];
    } catch (error) {
      console.warn(`Could not load ${key} homepage metric:`, error);
      const statKeyByMetric = {
        chatLogs: "chat-logs",
        images: "images",
      };
      setHomeStat(statKeyByMetric[key] || key, "Error", getReadableError(error), { isError: true });
      if (key === "todos" && homeTodoSummary) {
        homeTodoSummary.textContent = "Could not load tasks.";
      }
      if (key === "calendar") {
        if (homeUpcomingCount) homeUpcomingCount.textContent = "Error";
        if (homeUpcomingList) {
          homeUpcomingList.innerHTML = `<p class="empty-state is-error">Could not load upcoming events: ${getReadableError(error)}</p>`;
        }
      }
      return [key, { total: 0, recent: 0, error }];
    }
  }));

  const metrics = Object.fromEntries(metricEntries);
  if (!metrics.calendar?.error) {
    renderHomeUpcomingEvents(metrics.calendar);
  }
  renderHomeModules(metrics);
  setHomeStatus("Overview ready. Recent work is listed below.");
  setHomeRefreshed();
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

function createUniverseDeleteMenu(universe, { includeSourceDocuments = false } = {}) {
  return `
    <div class="card-menu-wrap">
      <button class="node-kebab card-kebab" type="button" aria-label="Universe actions" aria-expanded="false" aria-haspopup="menu" data-universe-menu-button>
        <ph-dots-three-vertical weight="bold" aria-hidden="true"></ph-dots-three-vertical>
      </button>
      <div class="node-menu card-menu" role="menu" hidden>
        ${includeSourceDocuments ? `<button type="button" role="menuitem" data-open-source-documents data-universe-id="${escapeHtml(universe.id)}" data-universe-name="${escapeHtml(universe.name || "Untitled Universe")}">Documents</button>` : ""}
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
      "ph-calendar-blank",
      "ph-film-slate",
      "ph-image-square",
      "ph-sparkle",
      "ph-wrench",
      "ph-dice-five",
      "ph-user-circle",
      "ph-identification-card",
      "ph-gear-six",
      "ph-bell",
      "ph-sign-out",
      "ph-sliders-horizontal",
      "ph-shield-check",
      "ph-keyboard",
      "ph-file-arrow-up",
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

async function getCurrentUserSettings() {
  if (currentUserSettings) {
    return currentUserSettings;
  }

  const appUser = await getCurrentAppUser();
  if (!appUser?.id) {
    return null;
  }

  currentUserSettings = await ensureUserSettings(appUser.id);
  return currentUserSettings;
}

async function updateCurrentUserSettings(updates = {}) {
  if (!supabaseClient || !updates || typeof updates !== "object") {
    throw new Error("User settings are not available.");
  }

  const appUser = await getCurrentAppUser();
  const settings = await getCurrentUserSettings();
  if (!appUser?.id || !settings?.id) {
    throw new Error("Sign in to update your settings.");
  }

  const { data, error } = await withTimeout(supabaseClient
    .from("user_settings")
    .update(updates)
    .eq("id", settings.id)
    .eq("user_id", appUser.id)
    .select()
    .single(), "Saving user settings");

  if (error || !data) {
    throw error || new Error("Could not save user settings.");
  }

  currentUserSettings = data;
  applyUserSettings(data);
  window.dispatchEvent(new CustomEvent("centralis:user-settings-changed", {
    detail: { settings: data }
  }));
  return data;
}

function applyUserSettings(settings) {
  const theme = applyTheme(settings?.theme || localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME_ID);
  syncThemeSelects(theme.id);
}

function publishCurrentAppUserChange() {
  window.centralisCurrentAppUser = currentAppUser;
  syncUserMenuEmail(currentAppUser);
  window.dispatchEvent(new CustomEvent("centralis:current-user-changed", {
    detail: { user: currentAppUser }
  }));
}

async function prepareSignedInUser(authUser) {
  if (profileLoadPromise) {
    return withTimeout(profileLoadPromise, "Loading user profile");
  }

  profileLoadPromise = (async () => {
    currentAppUser = await ensureUserProfile(authUser);
    publishCurrentAppUserChange();
    currentUserSettings = await ensureUserSettings(currentAppUser.id);
    startElementTypeLibrarySeed(currentAppUser.id);
    applyUserSettings(currentUserSettings);
    await loadThemeLibrary({ refresh: true });
    applyUserSettings(currentUserSettings);
    const homepageDataPromise = Promise.all([
      loadHomeDashboardOverview(),
      loadRecentSourceDocuments(),
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
    openRequestedSourceDocumentsFromUrl();
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
    const iconName = getUniverseGenreIconName(universe);
    return `
    <article class="universe-card-wrap">
      <a class="universe-card${getHomeCardImageClass(image)}" href="universe-canvas.html?universe_id=${encodeURIComponent(universe.id)}"${getHomeCardImageStyle(image)}>
        ${isNew ? '<span class="universe-new-badge">New</span>' : ""}
        <span class="card-icon" aria-hidden="true">
          <${iconName} weight="duotone"></${iconName}>
        </span>
        <span class="universe-card-copy">
          <strong>${escapeHtml(universe.name || "Untitled Universe")}</strong>
          ${!isBuilderPage ? `<span class="home-card-meta">Updated ${escapeHtml(formatShortDate(universe.updated_at || universe.opened_at))}</span>` : ""}
          <span class="universe-card-description-short">${escapeHtml(createBlurb(universe.description))}</span>
          <span class="universe-card-description-long">${escapeHtml(createBlurb(universe.description, 420))}</span>
        </span>
      </a>
      ${createUniverseDeleteMenu(universe, { includeSourceDocuments: false })}
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

async function loadRecentSourceDocuments() {
  if (!homeSourceDocumentList || !supabaseClient || !currentAppUser) {
    return;
  }

  const restoredFromCache = restoreHomeSectionCache("source-documents", homeSourceDocumentList, homeSourceDocumentCount);
  if (!restoredFromCache) {
    homeSourceDocumentList.innerHTML = '<p class="empty-state">Loading documents...</p>';
    if (homeSourceDocumentCount) homeSourceDocumentCount.textContent = "Loading...";
  }

  try {
    const { data, error } = await withTimeout(supabaseClient
      .from(UNIVERSE_SOURCE_DOCUMENTS_TABLE)
      .select("id,universe_id,original_filename,display_name,mime_type,file_size,created_at,updated_at,universes(name)")
      .eq("user_id", currentAppUser.id)
      .order("created_at", { ascending: false })
      .limit(8), "Loading recent documents");

    if (error) {
      homeSourceDocumentList.innerHTML = `<p class="empty-state is-error">Could not load documents: ${getReadableError(error)}</p>`;
      if (homeSourceDocumentCount) homeSourceDocumentCount.textContent = "Error";
      return;
    }

    const documents = (data || []).map((document) => ({
      ...document,
      universe_name: document.universes?.name || "Untitled Universe",
    }));
    setHomeCount(homeSourceDocumentCount, documents.length, "document");
    homeSourceDocumentList.innerHTML = renderSourceDocumentRows(documents, { isHomepage: true });
    writeHomeSectionCache("source-documents", homeSourceDocumentList, homeSourceDocumentCount);
  } catch (error) {
    homeSourceDocumentList.innerHTML = `<p class="empty-state is-error">Could not load documents: ${getReadableError(error)}</p>`;
    if (homeSourceDocumentCount) homeSourceDocumentCount.textContent = "Error";
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
            <span>${escapeHtml(universe?.name || "Standalone Element")} - ${escapeHtml(formatShortDate(element.updated_at))}</span>
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
window.centralisGetUserSettings = getCurrentUserSettings;
window.centralisUpdateUserSettings = updateCurrentUserSettings;
syncThemeOptionExports();

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
    await showSignedInApp();
    prepareSignedInUser(data.session.user).catch((profileError) => {
      console.error(profileError);
      setAuthStatus(`Login worked, but loading your profile failed: ${getReadableError(profileError)}`, "error");
    });
    cleanAuthUrl();
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

function openRequestedSourceDocumentsFromUrl() {
  if (document.body.dataset.page !== "universe-canvas" || !sourceDocumentsModal) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("documents") !== "1" || !sourceDocumentsModal.hidden) {
    return;
  }

  const universe = getCurrentUniverseForDocuments();
  if (!universe) {
    return;
  }

  openSourceDocumentsDialog(universe);
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

  universeList.querySelectorAll("[data-open-source-documents]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeUniverseCardMenus();
      openSourceDocumentsDialog({
        id: button.dataset.universeId,
        name: button.dataset.universeName
      });
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

function resetNewUniverseForm() {
  const form = document.querySelector(".universe-form");
  if (!form) return;

  form.reset();
  if (universeAiGenreSelect) {
    universeAiGenreSelect.value = "Random";
  }
  if (universeAiCountInput) {
    universeAiCountInput.value = "3";
  }
  setUniverseStatus("");
  syncUniverseAiFields();
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

  if (activeModal.id === "new-universe-modal") {
    resetNewUniverseForm();
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
  if (universeAiCountField) {
    universeAiCountField.hidden = !isEnabled || !universeAiMultiToggle?.checked;
  }
  if (universeNameLabel) {
    universeNameLabel.innerHTML = isEnabled ? "Name <em>(optional)</em>" : "Name";
  }
  if (universeNameInput) {
    universeNameInput.placeholder = isEnabled
      ? "Optional — leave blank and AI will create one"
      : "e.g. The Andromeda Expanse";
    universeNameInput.required = false;
  }
  if (universeDescriptionLabel) {
    universeDescriptionLabel.innerHTML = "Description <em>(optional)</em>";
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

function setUniverseAiReviewText(generatedUniverse) {
  if (!universeAiReviewName || !universeAiReviewDescription) return;
  const genre = String(generatedUniverse?.genre || "AI-selected genre").trim() || "AI-selected genre";
  universeAiReviewDraft = {
    name: String(generatedUniverse?.name || "").trim(),
    genre,
    description: String(generatedUniverse?.description || "").trim()
  };
  universeAiReviewName.value = universeAiReviewDraft.name;
  universeAiReviewDescription.value = universeAiReviewDraft.description;
  if (universeAiReviewGenre) {
    universeAiReviewGenre.textContent = genre;
  }
}

function openUniverseAiReviewDialog(generatedUniverse) {
  const newUniverseModal = document.getElementById("new-universe-modal");
  if (!universeAiReviewModal || !universeAiReviewName || !universeAiReviewDescription) return;

  setUniverseAiReviewText(generatedUniverse);
  setUniverseAiReviewStatus("");
  document.body.classList.add("centralis-modal-open");

  if (newUniverseModal) {
    newUniverseModal.hidden = true;
  }
  activeModal = universeAiReviewModal;
  universeAiReviewModal.hidden = false;
  requestAnimationFrame(() => universeAiReviewName.focus({ preventScroll: true }));
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
    requestAnimationFrame(() => universeAiReviewName?.focus({ preventScroll: true }));
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
  if (!universeAiReviewName || !universeAiReviewDescription) return;
  const button = universeAiFinalizeButton;
  if (button) {
    button.disabled = true;
  }

  try {
    const name = String(universeAiReviewName.value || "").trim();
    const description = String(universeAiReviewDescription.value || "").trim();
    if (!name) {
      setUniverseAiReviewStatus("Generated universe must include a non-empty name.", "error");
      universeAiReviewName.focus();
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

sourceDocumentsForm?.addEventListener("submit", uploadUniverseSourceDocument);
sourceDocumentsClosers.forEach((button) => {
  button.addEventListener("click", closeSourceDocumentsDialog);
});
sourceDocumentsModal?.addEventListener("click", (event) => {
  if (event.target === sourceDocumentsModal) {
    closeSourceDocumentsDialog();
  }
});
currentUniverseDocumentsButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const universe = getCurrentUniverseForDocuments();
    if (!universe) {
      setSourceDocumentsStatus("Open a universe before managing documents.", "error");
      return;
    }
    openSourceDocumentsDialog(universe);
  });
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

    setAuthStatus("Redirecting to Google login...");

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("index.html", window.location.origin).href,
        queryParams: {
          prompt: "select_account"
        }
      }
    });

    if (error) {
      setAuthStatus(error.message, "error");
      return;
    }
  });
}

document.addEventListener("click", async (event) => {
  const themeButton = event.target.closest("[data-header-theme-option]");
  if (themeButton) {
    const themeId = normalizeThemeId(themeButton.dataset.headerThemeOption);
    const previousThemeId = window.centralisCurrentTheme?.id || DEFAULT_THEME_ID;
    const theme = applyTheme(themeId);
    syncThemeSelects(theme.id);
    closeMenus();

    if (!supabaseClient) {
      return;
    }

    const appUser = await getCurrentAppUser();
    if (!appUser?.id) {
      return;
    }

    try {
      await updateCurrentUserSettings({ theme: theme.id });
    } catch (error) {
      console.error(error);
      const restoredTheme = applyTheme(previousThemeId);
      syncThemeSelects(restoredTheme.id);
    }
    return;
  }

  if (event.target.closest("[data-open-theme-selector]")) {
    await openThemeSelector();
    return;
  }

  if (event.target.closest("[data-theme-selector-cancel]")) {
    cancelThemeSelector();
    return;
  }

  if (event.target.closest("[data-theme-selector-save]")) {
    await saveThemeSelector();
    return;
  }

  if (event.target.closest("[data-create-custom-theme]")) {
    openCustomThemeModal();
    return;
  }

  if (event.target.closest("[data-custom-theme-cancel]")) {
    closeCustomThemeModal();
    return;
  }

  if (event.target.closest("[data-custom-theme-save]")) {
    await saveCustomTheme();
    return;
  }

  const previewButton = event.target.closest("[data-theme-preview]");
  if (previewButton) {
    previewTheme(previewButton.dataset.themePreview);
  }
});

document.addEventListener("change", (event) => {
  const selectedFilter = event.target.closest("[data-theme-selected-filter]");
  if (selectedFilter) {
    themeSelectorState.showSelectedOnly = selectedFilter.checked;
    renderThemeSelectorList();
    return;
  }

  const checkbox = event.target.closest("[data-theme-menu-checkbox]");
  if (checkbox) {
    const themeId = normalizeThemeId(checkbox.dataset.themeMenuCheckbox);
    const selected = new Set(themeSelectorState.draftMenuIds);
    if (checkbox.checked && selected.size >= MAX_HEADER_THEME_OPTIONS && !selected.has(themeId)) {
      checkbox.checked = false;
      setThemeSelectorStatus(`Choose up to ${MAX_HEADER_THEME_OPTIONS} palettes.`, "error");
      return;
    }
    if (checkbox.checked) {
      selected.add(themeId);
    } else {
      selected.delete(themeId);
    }
    themeSelectorState.draftMenuIds = normalizeThemeMenuIds([...selected]);
    setThemeSelectorStatus("");
    renderThemeSelectorList();
    return;
  }

  const baseSelect = event.target.closest("[data-custom-theme-base]");
  if (baseSelect) {
    renderCustomThemeFields(baseSelect.value);
    return;
  }

  const colorInput = event.target.closest("[data-custom-theme-color]");
  if (colorInput) {
    const label = colorInput.closest(".custom-theme-color");
    const code = label?.querySelector("code");
    if (code) code.textContent = colorInput.value;
  }
});

document.addEventListener("input", (event) => {
  const themeSearch = event.target.closest("[data-theme-selector-search]");
  if (themeSearch) {
    themeSelectorState.searchTerm = themeSearch.value;
    renderThemeSelectorList();
  }
});

signOutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }

    currentAppUser = null;
    currentUserSettings = null;
    publishCurrentAppUserChange();
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
