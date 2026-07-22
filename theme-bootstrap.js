(function () {
  const THEME_STORAGE_KEY = "centralis-theme";
  const THEME_SNAPSHOT_STORAGE_KEY = "centralis-theme-snapshot";
  const COLOR_KEYS = ["page", "surface", "field", "text", "muted", "border", "primary", "secondary", "success", "danger"];
  const FALLBACK_THEME_ID = "centralis";
  const KNOWN_THEMES = {
    centralis: { id: "centralis", label: "Centralis", scheme: "dark", colors: { page: "#0c1115", surface: "#121a1f", field: "#121212", text: "#edf4f5", muted: "#a9b7bd", border: "#304149", primary: "#78d5c8", secondary: "#5146b8", success: "#4fd18b", danger: "#ff6b6b" } },
    nebula: { id: "nebula", label: "Nebula", scheme: "dark", colors: { page: "#0a0d18", surface: "#121629", field: "#0d1222", text: "#eef2ff", muted: "#aeb8d6", border: "#33415f", primary: "#7dd3fc", secondary: "#a78bfa", success: "#6ee7b7", danger: "#fb7185" } },
    "deep-archive": { id: "deep-archive", label: "Deep Archive", scheme: "dark", colors: { page: "#091111", surface: "#111d1c", field: "#0b1515", text: "#edf7f4", muted: "#a7bbb5", border: "#2c4541", primary: "#94d2bd", secondary: "#577590", success: "#80ed99", danger: "#ef476f" } },
    signal: { id: "signal", label: "Signal", scheme: "dark", colors: { page: "#080b0f", surface: "#101820", field: "#0a1118", text: "#f4f7fb", muted: "#a8b6c2", border: "#2d3e4b", primary: "#30e3ca", secondary: "#ffb703", success: "#38d996", danger: "#ff4d5e" } },
    "palette-7": { id: "palette-7", label: "Clay Sage", scheme: "dark", colors: { page: "#c7522a", surface: "#cc653a", field: "#cb6036", text: "#001018", muted: "#412b23", border: "#9f5233", primary: "#fbf2c4", secondary: "#d68a58", success: "#b8cdab", danger: "#dea66f" } },
    "palette-28": { id: "palette-28", label: "Prairie Haze", scheme: "dark", colors: { page: "#525e75", surface: "#6c8284", field: "#657980", text: "#001018", muted: "#23343b", border: "#54696c", primary: "#f1ddbf", secondary: "#525e75", success: "#85a78e", danger: "#f1ddbf" } },
    "palette-64": { id: "palette-64", label: "Canyon Sage", scheme: "dark", colors: { page: "#a85633", surface: "#d07345", field: "#cf6e41", text: "#001018", muted: "#433026", border: "#a85633", primary: "#fbf2c4", secondary: "#d68a58", success: "#b8cdab", danger: "#dea66f" } },
    "palette-103": { id: "palette-103", label: "Velvet Carnival", scheme: "dark", colors: { page: "#241642", surface: "#580a35", field: "#53091e", text: "#f1ad79", muted: "#f1ad79", border: "#a15d6d", primary: "#f1ad79", secondary: "#23348c", success: "#f1ad79", danger: "#f1ad79" } }
  };

  function isValidHexColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
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

  function rgbToHex(rgb) {
    return `#${[rgb.r, rgb.g, rgb.b].map((channel) => Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
  }

  function mixHexColors(first, second, amount) {
    const a = hexToRgb(first);
    const b = hexToRgb(second);
    if (!a || !b) return first;
    return rgbToHex({
      r: a.r + (b.r - a.r) * amount,
      g: a.g + (b.g - a.g) * amount,
      b: a.b + (b.b - a.b) * amount
    });
  }

  function getRelativeLuminance(value) {
    const rgb = hexToRgb(value);
    if (!rgb) return 0;
    const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function getContrastRatio(first, second) {
    const lighter = Math.max(getRelativeLuminance(first), getRelativeLuminance(second));
    const darker = Math.min(getRelativeLuminance(first), getRelativeLuminance(second));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function getReadableColorForBackground(background, preferred, minimumRatio) {
    if (isValidHexColor(preferred) && getContrastRatio(background, preferred) >= minimumRatio) {
      return preferred.trim();
    }
    return getContrastRatio(background, "#001018") > getContrastRatio(background, "#ffffff") ? "#001018" : "#ffffff";
  }

  function isUsableTheme(theme) {
    return theme
      && typeof theme.id === "string"
      && ["dark", "light"].includes(theme.scheme)
      && theme.colors
      && COLOR_KEYS.every((key) => isValidHexColor(theme.colors[key]));
  }

  function getSnapshotTheme() {
    try {
      const savedThemeId = localStorage.getItem(THEME_STORAGE_KEY);
      const snapshot = JSON.parse(localStorage.getItem(THEME_SNAPSHOT_STORAGE_KEY) || "null");
      if (isUsableTheme(snapshot) && (!savedThemeId || snapshot.id === savedThemeId || savedThemeId === "dark" || savedThemeId === "light")) {
        return snapshot;
      }
      if (savedThemeId === "dark" || savedThemeId === "light") return KNOWN_THEMES[FALLBACK_THEME_ID];
      return KNOWN_THEMES[savedThemeId] || KNOWN_THEMES[FALLBACK_THEME_ID];
    } catch (error) {
      return KNOWN_THEMES[FALLBACK_THEME_ID];
    }
  }

  const theme = getSnapshotTheme();
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.colorScheme = theme.scheme;
  root.style.colorScheme = theme.scheme;
  COLOR_KEYS.forEach((key) => root.style.setProperty(`--theme-${key}`, theme.colors[key]));
  const primaryButtonText = getReadableColorForBackground(theme.colors.primary, "", 4.5);
  const primaryButtonHover = mixHexColors(theme.colors.primary, primaryButtonText, 0.18);
  const primaryButtonHoverBorder = mixHexColors(theme.colors.primary, primaryButtonText, 0.28);
  root.style.setProperty("--theme-primary-hover", primaryButtonHover);
  root.style.setProperty("--theme-primary-hover-border", primaryButtonHoverBorder);
  root.style.setProperty("--primary-button-text", primaryButtonText);
  root.style.setProperty("--primary-button-hover-bg", primaryButtonHover);
  root.style.setProperty("--primary-button-hover-border", primaryButtonHoverBorder);
  window.__CENTRALIS_PREPAINT_THEME__ = theme;
})();
