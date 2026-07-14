(async function initUniverseCanvas() {
  const rootElement = document.getElementById("universe-flow");
  if (!rootElement || !window.React || !window.ReactDOM || !window.ReactFlow) {
    if (rootElement) {
      rootElement.textContent = "React Flow could not be loaded.";
    }
    return;
  }

  const SUPABASE_TIMEOUT_MS = 15000;
  const ELEMENT_EXPORT_FORMAT = "centralis.element-export.v1";
  const RICH_DETAILS_EXPORT_FORMAT = "centralis.rich-details.v1";
  const CHRONICLE_TEMPLATE_SECTION_MODULE_TYPE = "template_section";
  const DEFAULT_NOTE_WIDTH = 260;
  const DEFAULT_NOTE_HEIGHT = 180;
  const DEFAULT_NOTE_BG_COLOR = "#fef3c7";
  const DEFAULT_NOTE_BORDER_COLOR = "#d97706";
  const DEFAULT_NOTE_TEXT_COLOR = "#2f2410";
  const DEFAULT_TRANSFER_OPTIONS = {
    connections: true,
    position: true,
    richDetails: true,
    customFields: true
  };
  const LINK_EDGE_Z_INDEX = 0;
  const params = new URLSearchParams(window.location.search);
  let universeId = params.get("universe_id");
  const titleElement = document.querySelector("[data-universe-title]");

  if (universeId) {
    sessionStorage.setItem("centralis-current-universe-id", universeId);
  } else {
    universeId = sessionStorage.getItem("centralis-current-universe-id");
    if (universeId) {
      window.history.replaceState({}, document.title, `${window.location.pathname}?universe_id=${encodeURIComponent(universeId)}`);
    }
  }

  function withTimeout(promise, label) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} timed out after ${SUPABASE_TIMEOUT_MS / 1000} seconds.`));
      }, SUPABASE_TIMEOUT_MS);
    });

    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
  }

  function createId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `element-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createPreviewText(description) {
    return String(description || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter((line) => !/^#{1,6}\s+/.test(line.trim()))
      .join("\n")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/[#*_~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function createBlurb(description) {
    const trimmed = createPreviewText(description);
    if (!trimmed) {
      return "No description yet.";
    }

    return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
  }

  function normalizeLookupKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function safeFileSlug(value) {
    return String(value || "centralis")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "centralis";
  }

  function downloadJsonFile(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function normalizeImages(images = []) {
    if (!Array.isArray(images) || !images.length) {
      return [];
    }

    const primaryIndex = images.findIndex((image) => image.is_primary);
    if (primaryIndex >= 0) {
      const primaryImage = images[primaryIndex];
      return [
        primaryImage,
        ...images.filter((_, index) => index !== primaryIndex)
      ];
    }

    return images.map((image, index) => ({
      ...image,
      is_primary: index === 0
    }));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCssSafeId(value) {
    const raw = String(value ?? "");
    if (window.CSS?.escape) {
      return window.CSS.escape(raw);
    }
    return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function renderInlineMarkdown(value) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/\n/g, "<br>");
  }

  function normalizeMarkdownPreviewValue(value) {
    return String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, "$1");
  }

  function renderMarkdownDescription(value) {
    const markdown = normalizeMarkdownPreviewValue(value).trim();
    if (!markdown) {
      return '<p class="details-description-text details-description-markdown is-empty">No description yet.</p>';
    }

    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let paragraphLines = [];
    let listType = "";
    let listItems = [];
    let codeLines = null;

    function flushParagraph() {
      const text = paragraphLines.join("\n").trim();
      if (text) {
        blocks.push(`<p>${renderInlineMarkdown(text)}</p>`);
      }
      paragraphLines = [];
    }

    function flushList() {
      if (listType && listItems.length) {
        const items = listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("");
        blocks.push(`<${listType}>${items}</${listType}>`);
      }
      listType = "";
      listItems = [];
    }

    function flushCode() {
      if (codeLines) {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      }
    }

    lines.forEach((line) => {
      if (line.trim().startsWith("```")) {
        if (codeLines) {
          flushCode();
        } else {
          flushParagraph();
          flushList();
          codeLines = [];
        }
        return;
      }

      if (codeLines) {
        codeLines.push(line);
        return;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        return;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length;
        blocks.push(`<h${level}>${renderInlineMarkdown(heading[2].trim())}</h${level}>`);
        return;
      }

      const quote = line.match(/^>\s?(.+)$/);
      if (quote) {
        flushParagraph();
        flushList();
        blocks.push(`<blockquote>${renderInlineMarkdown(quote[1].trim())}</blockquote>`);
        return;
      }

      const unordered = line.match(/^\s*[-*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        const nextListType = unordered ? "ul" : "ol";
        if (listType && listType !== nextListType) {
          flushList();
        }
        listType = nextListType;
        listItems.push((unordered || ordered)[1].trim());
        return;
      }

      flushList();
      paragraphLines.push(line);
    });

    flushParagraph();
    flushList();
    flushCode();

    return `<div class="details-description-text details-description-markdown">${blocks.join("")}</div>`;
  }

  function sanitizeIconName(icon) {
    const clean = String(icon || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return clean || "circle";
  }

  function sanitizeColor(color, fallback = "#64748b") {
    const clean = String(color || "").trim();
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(clean) ? clean : fallback;
  }

  function hexToRgba(color, opacity = 1) {
    const clean = sanitizeColor(color, DEFAULT_NOTE_BG_COLOR).replace("#", "");
    const expanded = clean.length === 3
      ? clean.split("").map((part) => `${part}${part}`).join("")
      : clean.slice(0, 6);
    const red = parseInt(expanded.slice(0, 2), 16);
    const green = parseInt(expanded.slice(2, 4), 16);
    const blue = parseInt(expanded.slice(4, 6), 16);
    const alpha = Math.min(1, Math.max(0.1, Number(opacity || 1)));
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const DEFAULT_UNIVERSE_FORMAT = {
    strokeColor: "#3b82f6",
    strokeWidth: 2,
    strokeStyle: "solid",
    pathType: "step",
    nodeBgOpacity: 1,
    nodeBorderWidth: 2,
    nodeImagePlacement: "side",
    nodeLayoutGap: 12
  };
  const DEFAULT_ELEMENT_TYPE_ICON = "circle";
  const DEFAULT_ELEMENT_TYPE_COLOR = "#6366f1";
  const FALLBACK_PHOSPHOR_ICONS = [
    "airplane", "airplane-in-flight", "anchor", "archive", "armchair", "arrow-bend-down-right",
    "asterisk", "atom", "bank", "bell", "book", "bookmark", "books", "briefcase", "broadcast",
    "bug", "buildings", "calendar", "camera", "campfire", "castle-turret", "cat", "chats",
    "circle", "city", "cloud", "code", "compass", "crown", "cube", "detective", "diamonds-four",
    "door", "dragon", "drop", "factory", "feather", "film-strip", "fire", "flag", "flask",
    "flower", "folder", "gear", "ghost", "globe", "globe-hemisphere-west", "hammer", "heart",
    "hourglass", "house", "image", "island", "key", "leaf", "lightbulb", "lightning",
    "magic-wand", "map-pin", "map-trifold", "mask-happy", "moon", "mountains", "music-note",
    "palette", "park", "paw-print", "planet", "plant", "puzzle-piece", "question", "rocket",
    "scroll", "shield", "shooting-star", "skull", "sparkle", "squares-four", "star", "sword",
    "tent", "tree", "tree-evergreen", "users", "warehouse", "waveform", "wrench"
  ];
  const phosphorIconSearchTerms = new Map();

  function addIconSearchTerms(iconName, terms = []) {
    const cleanName = sanitizeIconName(iconName);
    if (!cleanName) {
      return;
    }
    const existing = phosphorIconSearchTerms.get(cleanName) || cleanName.replaceAll("-", " ");
    phosphorIconSearchTerms.set(cleanName, `${existing} ${terms.filter(Boolean).join(" ")}`.toLowerCase());
  }

  function normalizePhosphorCatalogItem(item) {
    if (!item || typeof item !== "object") {
      return null;
    }

    if (Array.isArray(item)) {
      const name = item.find((value) => typeof value === "string" && /^[a-z0-9-]+$/.test(value));
      const terms = item.flat(Infinity).filter((value) => typeof value === "string");
      return name ? { name, terms } : null;
    }

    const rawName = item.name || item.kebab || item.kebabName || item.slug || item.id;
    const name = typeof rawName === "string" ? rawName : null;
    const terms = [
      item.name,
      item.pascal_name,
      item.pascalName,
      item.category,
      item.categories,
      item.tags,
      item.alias?.name,
      item.alias?.pascal_name,
      item.aliases,
      item.keywords
    ].flat(Infinity).filter((value) => typeof value === "string");

    return name ? { name, terms } : null;
  }

  function collectPhosphorCatalogItems(value, output = [], depth = 0) {
    if (!value || depth > 4) {
      return output;
    }

    if (Array.isArray(value)) {
      const normalized = normalizePhosphorCatalogItem(value);
      if (normalized) {
        output.push(normalized);
        return output;
      }
      value.forEach((item) => collectPhosphorCatalogItems(item, output, depth + 1));
      return output;
    }

    if (typeof value === "object") {
      const normalized = normalizePhosphorCatalogItem(value);
      if (normalized) {
        output.push(normalized);
        return output;
      }
      Object.values(value).forEach((item) => collectPhosphorCatalogItems(item, output, depth + 1));
    }

    return output;
  }
  const TYPE_COLOR_CHOICES = [
    "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#64748b", "#78716c", "#d4a017"
  ];

  function getUniverseFormat(row = {}) {
    const backgroundByName = {
      solid: 1,
      medium: 0.78,
      light: 0.55,
      clear: 0.22
    };
    const gapByName = {
      compact: 8,
      normal: 12,
      spacious: 18
    };
    const bgValue = row.fmt_node_bg_opacity;
    const gapValue = row.fmt_node_layout_gap;

    return {
      strokeColor: sanitizeColor(row.fmt_stroke_color, DEFAULT_UNIVERSE_FORMAT.strokeColor),
      strokeWidth: Number(row.fmt_stroke_width || DEFAULT_UNIVERSE_FORMAT.strokeWidth),
      strokeStyle: ["solid", "dashed", "dotted"].includes(row.fmt_stroke_style) ? row.fmt_stroke_style : DEFAULT_UNIVERSE_FORMAT.strokeStyle,
      pathType: ["step", "curve", "line"].includes(row.fmt_path_type) ? row.fmt_path_type : DEFAULT_UNIVERSE_FORMAT.pathType,
      nodeBgOpacity: typeof bgValue === "string" && backgroundByName[bgValue] ? backgroundByName[bgValue] : Number(bgValue ?? DEFAULT_UNIVERSE_FORMAT.nodeBgOpacity),
      nodeBorderWidth: Number(row.fmt_node_border_width || DEFAULT_UNIVERSE_FORMAT.nodeBorderWidth),
      nodeImagePlacement: ["side", "top", "hidden"].includes(row.fmt_node_image_placement) ? row.fmt_node_image_placement : DEFAULT_UNIVERSE_FORMAT.nodeImagePlacement,
      nodeLayoutGap: typeof gapValue === "string" && gapByName[gapValue] ? gapByName[gapValue] : Number(gapValue ?? DEFAULT_UNIVERSE_FORMAT.nodeLayoutGap)
    };
  }

  function toFormatPayload(format) {
    return {
      fmt_stroke_color: format.strokeColor,
      fmt_stroke_width: format.strokeWidth,
      fmt_stroke_style: format.strokeStyle,
      fmt_path_type: format.pathType,
      fmt_node_bg_opacity: format.nodeBgOpacity,
      fmt_node_border_width: format.nodeBorderWidth,
      fmt_node_image_placement: format.nodeImagePlacement,
      fmt_node_layout_gap: format.nodeLayoutGap,
      updated_at: new Date().toISOString()
    };
  }

  function getStrokeDasharray(style) {
    if (style === "dashed") {
      return "8 6";
    }
    if (style === "dotted") {
      return "2 6";
    }
    return undefined;
  }

  function getReadableError(error) {
    return error?.message || error?.error || error?.details || error?.hint || "Unknown error";
  }

  function getElementOwnerId() {
    return universe.user_id || currentAppUser?.id || window.centralisCurrentAppUser?.id || null;
  }

  async function callEdgeFunction(name, options = {}) {
    if (!window.centralisSupabase || !window.CENTRALIS_SUPABASE_CONFIG) {
      throw new Error("Supabase is not available yet.");
    }

    const { data: sessionData, error: sessionError } = await window.centralisSupabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      throw new Error(sessionError?.message || "You must be signed in to use this feature.");
    }

    const response = await fetch(`${window.CENTRALIS_SUPABASE_CONFIG.url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: window.CENTRALIS_SUPABASE_CONFIG.publishableKey,
        ...(options.headers || {})
      },
      body: options.body
    });
    const responseText = await response.text();
    let data = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch (_error) {
        data = { error: responseText };
      }
    }

    if (!response.ok) {
      throw new Error(getReadableError(data) || `Edge Function returned ${response.status}.`);
    }

    return data;
  }

  let universe = {
    id: universeId || "universe-root",
    name: "Universe Canvas",
    description: "",
    canvas_position_x: 120,
    canvas_position_y: 120,
    ...toFormatPayload(DEFAULT_UNIVERSE_FORMAT)
  };
  let elementTypes = [];
  let elements = [];
  let elementGroups = [];
  let canvasNotes = [];
  let elementLinks = [];
  let imageRows = [];
  let overlayLayers = [];
  let overlayLayerEntries = [];
  let overlayLayerAssignments = [];
  let currentAppUser = window.centralisCurrentAppUser || null;

  if (window.centralisSupabase && universeId) {
    if (!currentAppUser && window.centralisGetCurrentAppUser) {
      try {
        currentAppUser = await window.centralisGetCurrentAppUser();
      } catch (error) {
        console.warn("Could not load the signed-in Centralis user before canvas data.", error);
      }
    }

    const universeResponse = await withTimeout(window.centralisSupabase
      .from("universes")
      .select("id,user_id,name,description,canvas_position_x,canvas_position_y,fmt_stroke_color,fmt_stroke_width,fmt_stroke_style,fmt_path_type,fmt_node_bg_opacity,fmt_node_border_width,fmt_node_image_placement,fmt_node_layout_gap")
      .eq("id", universeId)
      .maybeSingle(), "Loading universe");

    if (universeResponse.error && rootElement) {
      rootElement.textContent = `Could not load universe: ${universeResponse.error.message}`;
      return;
    }

    if (universeResponse.data) {
      universe = universeResponse.data;
      window.centralisSupabase
        .from("universes")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", universe.id)
        .then(({ error }) => {
          if (error) {
            console.warn("Could not mark universe as opened:", error);
          }
        });
    }

    const typeOwnerId = universe.user_id || currentAppUser?.id;
    const safeCanvasQuery = (query, label) => withTimeout(query, label)
      .catch((error) => ({ data: null, error }));
    const [
      typeResponse,
      groupResponse,
      noteResponse,
      elementResponse,
      linkResponse,
      layerResponse
    ] = await Promise.all([
      typeOwnerId
        ? safeCanvasQuery(window.centralisSupabase
          .from("element_types")
          .select("id,name,icon,color")
          .eq("user_id", typeOwnerId)
          .order("name", { ascending: true }), "Loading element types")
        : Promise.resolve({ data: [], error: null }),
      safeCanvasQuery(window.centralisSupabase
        .from("element_groups")
        .select("*")
        .eq("universe_id", universeId)
        .order("created_at", { ascending: true }), "Loading element groups"),
      safeCanvasQuery(window.centralisSupabase
        .from("canvas_notes")
        .select("*")
        .eq("universe_id", universeId)
        .order("created_at", { ascending: true }), "Loading canvas notes"),
      safeCanvasQuery(window.centralisSupabase
        .from("elements")
        .select("id,name,description,position_x,position_y,element_type_id,rich_template_id,group_id,group_position_x,group_position_y")
        .eq("universe_id", universeId)
        .order("created_at", { ascending: true }), "Loading elements"),
      safeCanvasQuery(window.centralisSupabase
        .from("element_links")
        .select("id,source_element_id,target_element_id,label,stroke_color,stroke_width,stroke_style,path_type")
        .eq("universe_id", universeId)
        .order("created_at", { ascending: true }), "Loading element links"),
      safeCanvasQuery(window.centralisSupabase
        .from("universe_layers")
        .select("*")
        .eq("universe_id", universeId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }), "Loading overlay layers")
    ]);

    if (!typeResponse.error) {
      elementTypes = typeResponse.data || [];
    }
    if (!groupResponse.error) {
      elementGroups = groupResponse.data || [];
    } else if (groupResponse.error.code !== "42P01") {
      console.warn("Could not load element groups:", groupResponse.error);
    }
    if (!noteResponse.error) {
      canvasNotes = noteResponse.data || [];
    } else if (noteResponse.error.code !== "42P01") {
      console.warn("Could not load canvas notes:", noteResponse.error);
    }
    if (!elementResponse.error) {
      elements = elementResponse.data || [];
    }
    if (!linkResponse.error) {
      elementLinks = linkResponse.data || [];
    }
    if (!layerResponse.error) {
      overlayLayers = layerResponse.data || [];
    } else if (layerResponse.error.code !== "42P01") {
      console.warn("Could not load overlay layers:", layerResponse.error);
    }

    try {
      const layerIds = overlayLayers.map((layer) => layer.id).filter(Boolean);
      if (layerIds.length) {
        const [entryResponse, assignmentResponse] = await Promise.all([
          withTimeout(window.centralisSupabase
            .from("universe_layer_entries")
            .select("*")
            .in("layer_id", layerIds)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }), "Loading layer entries"),
          withTimeout(window.centralisSupabase
            .from("element_layer_assignments")
            .select("*")
            .eq("universe_id", universeId)
            .in("layer_id", layerIds), "Loading layer assignments")
        ]);

        if (!entryResponse.error) {
          overlayLayerEntries = entryResponse.data || [];
        }
        if (!assignmentResponse.error) {
          overlayLayerAssignments = assignmentResponse.data || [];
        }
      }
    } catch (error) {
      console.warn("Overlay layers are not available yet.", error);
    }

    const imageObjectIds = [universe.id, ...elements.map((element) => element.id)].filter(Boolean);
    if (imageObjectIds.length) {
      try {
        const imageResponse = await withTimeout(callEdgeFunction("list-object-images", {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectIds: imageObjectIds })
        }), "Loading images");

        imageRows = imageResponse.images || [];
      } catch (error) {
        console.error("Could not load image gallery:", error);
      }
    }
  }

  if (titleElement) {
    titleElement.textContent = universe.name || "Universe Canvas";
  }

  const initialUniverseFormat = getUniverseFormat(universe);

  const React = window.React;
  const ReactDOM = window.ReactDOM;
  const Flow = window.ReactFlow;
  const ReactFlowComponent = Flow.default || Flow.ReactFlow;
  const Background = Flow.Background;
  const Controls = Flow.Controls;
  const ControlButton = Flow.ControlButton;
  const Handle = Flow.Handle;
  const NodeResizer = Flow.NodeResizer;
  const Position = Flow.Position;
  const EdgeLabelRenderer = Flow.EdgeLabelRenderer;
  const BaseEdge = Flow.BaseEdge;
  const getBezierPath = Flow.getBezierPath;
  const getSmoothStepPath = Flow.getSmoothStepPath;
  const getStraightPath = Flow.getStraightPath;
  const applyNodeChanges = Flow.applyNodeChanges;
  const applyEdgeChanges = Flow.applyEdgeChanges;

  function isFormEditingTarget(target) {
    const element = target instanceof Element ? target : null;
    return Boolean(element?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
  }

  function useNodeMenu(nodeId) {
    const [menuOpen, setMenuOpen] = React.useState(false);
    const menuRef = React.useRef(null);

    React.useEffect(() => {
      if (!menuOpen) {
        return undefined;
      }

      function handlePointerDown(event) {
        if (!menuRef.current?.contains(event.target)) {
          setMenuOpen(false);
        }
      }

      function handleKeyDown(event) {
        if (event.key === "Escape") {
          setMenuOpen(false);
        }
      }

      function handleCloseMenus(event) {
        if (event.detail?.nodeId !== nodeId) {
          setMenuOpen(false);
        }
      }

      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("centralis:close-node-menus", handleCloseMenus);

      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("centralis:close-node-menus", handleCloseMenus);
      };
    }, [menuOpen, nodeId]);

    function toggleMenu(event) {
      event.stopPropagation();
      setMenuOpen((isOpen) => {
        if (!isOpen) {
          window.dispatchEvent(new CustomEvent("centralis:close-node-menus", {
            detail: { nodeId }
          }));
        }

        return !isOpen;
      });
    }

    return { menuOpen, setMenuOpen, menuRef, toggleMenu };
  }

  function openNodeDetails(nodeId) {
    window.dispatchEvent(new CustomEvent("centralis:view-node-details", {
      detail: { nodeId }
    }));
  }

  function getChronicleEditorUrl(node) {
    const elementId = node?.data?.recordId;
    if (!elementId) {
      return "chronicle.html";
    }
    const elementSegment = encodeURIComponent(elementId);
    const nodeUniverseId = node?.data?.universeId || universeId || "";
    if (nodeUniverseId) {
      return `chronicle-editor.html#universe/${encodeURIComponent(nodeUniverseId)}/element/${elementSegment}`;
    }
    return `chronicle-editor.html#element/${elementSegment}`;
  }

  function UniverseNode(props) {
    const data = props.data;
    const { menuOpen, setMenuOpen, menuRef, toggleMenu } = useNodeMenu(props.id);
    const format = data.format || DEFAULT_UNIVERSE_FORMAT;
    const imageUrl = data.images?.[0]?.image_url;
    const imagePlacement = imageUrl ? format.nodeImagePlacement : "hidden";

    return React.createElement(
      "article",
      {
        className: `universe-flow-node node-image-${imagePlacement}${props.selected ? " is-selected" : ""}`,
        style: {
          "--node-bg-opacity": format.nodeBgOpacity,
          "--node-border-width": `${format.nodeBorderWidth}px`,
          "--node-layout-gap": `${format.nodeLayoutGap}px`
        },
        onDoubleClick: (event) => {
          event.stopPropagation();
          openNodeDetails(props.id);
        }
      },
      React.createElement(Handle, { className: "node-grab node-grab-right", id: "right", type: "source", position: Position.Right }),
      React.createElement(Handle, { className: "node-grab node-grab-left", id: "left", type: "target", position: Position.Left }),
      React.createElement(
        "div",
        { className: "node-menu-wrap nodrag nopan", ref: menuRef },
        React.createElement(
          "button",
          {
            className: "node-kebab",
            type: "button",
            "aria-label": "Universe menu",
            "aria-expanded": menuOpen,
            onClick: toggleMenu
          },
          React.createElement("ph-dots-three-vertical", { weight: "bold", "aria-hidden": "true" })
        ),
        menuOpen && React.createElement(
          "div",
          { className: "node-menu" },
          React.createElement(
            "button",
            {
              type: "button",
              onClick: (event) => {
                event.stopPropagation();
                setMenuOpen(false);
                openNodeDetails(props.id);
              }
            },
            "View Details"
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: (event) => {
                event.stopPropagation();
                setMenuOpen(false);
                window.dispatchEvent(new CustomEvent("centralis:generate-elements", {
                  detail: { nodeId: props.id, universeId: data.recordId }
                }));
              }
            },
            "Generate Elements"
          )
        )
      ),
      imagePlacement === "top" && React.createElement("img", { className: "node-top-image", src: imageUrl, alt: "" }),
      React.createElement(
        "div",
        { className: "node-title-row" },
        imagePlacement === "side" && React.createElement("img", { className: "node-side-image", src: imageUrl, alt: "" }),
        React.createElement(
          "div",
          { className: "node-title-copy" },
          React.createElement("span", { className: "node-kicker" }, "Universe"),
          React.createElement("strong", null, data.name)
        )
      ),
      React.createElement("p", null, createBlurb(data.description))
    );
  }

  function ElementNode(props) {
    const data = props.data;
    const { menuOpen, setMenuOpen, menuRef, toggleMenu } = useNodeMenu(props.id);
    const elementType = data.elementType;
    const layerOverlay = data.layerOverlay || null;
    const color = sanitizeColor(layerOverlay?.color || elementType?.color);
    const typeName = layerOverlay?.label || elementType?.name || "No Type";
    const iconName = sanitizeIconName(elementType?.icon);
    const format = data.format || DEFAULT_UNIVERSE_FORMAT;
    const imageUrl = data.images?.[0]?.image_url;
    const imagePlacement = imageUrl ? format.nodeImagePlacement : "hidden";
    const overlayEntries = layerOverlay?.entries || [];
    const stripeStyle = overlayEntries.length > 1
      ? overlayEntries.map((entry, index) => {
        const start = Math.floor((index / overlayEntries.length) * 100);
        const end = Math.floor(((index + 1) / overlayEntries.length) * 100);
        return `${entry.color} ${start}% ${end}%`;
      }).join(", ")
      : "";
    const layerClass = layerOverlay?.assigned
      ? " is-layer-assigned"
      : layerOverlay?.active
        ? " is-layer-unassigned"
        : "";

    return React.createElement(
      "article",
      {
        className: `element-flow-node node-image-${imagePlacement}${layerClass}${props.selected ? " is-selected" : ""}`,
        style: {
          "--element-color": color,
          "--node-bg-opacity": format.nodeBgOpacity,
          "--node-border-width": `${format.nodeBorderWidth}px`,
          "--node-layout-gap": `${format.nodeLayoutGap}px`,
          "--layer-stripes": stripeStyle ? `linear-gradient(to bottom, ${stripeStyle})` : "var(--element-color)"
        },
        onDoubleClick: (event) => {
          event.stopPropagation();
          openNodeDetails(props.id);
        }
      },
      React.createElement(Handle, { className: "node-grab node-grab-right", id: "right", type: "source", position: Position.Right }),
      React.createElement(Handle, { className: "node-grab node-grab-left", id: "left", type: "target", position: Position.Left }),
      overlayEntries.length > 1 && React.createElement(
        "div",
        { className: "node-layer-chips", "aria-label": `${overlayEntries.length} layer entries` },
        overlayEntries.slice(0, 4).map((entry) => React.createElement("span", {
          key: entry.id,
          style: { "--entry-color": entry.color },
          title: entry.name
        })),
        overlayEntries.length > 4 && React.createElement("small", null, `+${overlayEntries.length - 4}`)
      ),
      React.createElement(
        "div",
        { className: "node-menu-wrap nodrag nopan", ref: menuRef },
        React.createElement(
          "button",
          {
            className: "node-kebab",
            type: "button",
            "aria-label": "Element menu",
            "aria-expanded": menuOpen,
            onClick: toggleMenu
          },
          React.createElement("ph-dots-three-vertical", { weight: "bold", "aria-hidden": "true" })
        ),
        menuOpen && React.createElement(
          "div",
          { className: "node-menu" },
          React.createElement(
            "button",
            {
              type: "button",
              onClick: (event) => {
                event.stopPropagation();
                setMenuOpen(false);
                openNodeDetails(props.id);
              }
            },
            "View Details"
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: (event) => {
                event.stopPropagation();
                setMenuOpen(false);
                window.dispatchEvent(new CustomEvent("centralis:generate-elements", {
                  detail: { nodeId: props.id, elementId: data.recordId }
                }));
              }
            },
            "Generate Elements"
          ),
          React.createElement(
            "button",
            {
              className: "danger-menu-item",
              type: "button",
              onClick: (event) => {
                event.stopPropagation();
                setMenuOpen(false);
                window.dispatchEvent(new CustomEvent("centralis:request-delete-element", {
                  detail: {
                    nodeId: props.id,
                    elementId: data.recordId,
                    name: data.name
                  }
                }));
              }
            },
            "Delete Element"
          )
        )
      ),
      imagePlacement === "top" && React.createElement("img", { className: "node-top-image", src: imageUrl, alt: "" }),
      React.createElement(
        "div",
        { className: "node-title-row" },
        imagePlacement === "side"
          ? React.createElement("img", { className: "node-side-image", src: imageUrl, alt: "" })
          : React.createElement("span", { className: "element-icon", "aria-hidden": "true" }, React.createElement(`ph-${iconName}`, { weight: "duotone" })),
        React.createElement(
          "div",
          { className: "node-title-copy" },
          React.createElement("span", { className: "node-kicker" }, typeName),
          React.createElement("strong", null, data.name)
        )
      ),
      React.createElement("p", null, createBlurb(data.description))
    );
  }

  function GroupNode(props) {
    const data = props.data;
    const collapsed = Boolean(data.collapsed);
    const backgroundColor = sanitizeColor(data.backgroundColor, "#123034");

    return React.createElement(
      "section",
      {
        className: `group-flow-node${props.selected ? " is-selected" : ""}${collapsed ? " is-collapsed" : ""}${data.isDropTarget ? " is-drop-target" : ""}`,
        style: {
          "--group-bg-color": backgroundColor
        },
        onDoubleClick: (event) => {
          event.stopPropagation();
        }
      },
      NodeResizer && !collapsed && React.createElement(NodeResizer, {
        isVisible: true,
        minWidth: 280,
        minHeight: 190,
        handleClassName: "group-resize-handle nodrag nopan",
        lineClassName: "group-resize-line",
        onResize: (_event, params) => {
          window.dispatchEvent(new CustomEvent("centralis:preview-resize-group", {
            detail: {
              groupId: data.recordId,
              width: Math.round(Number(params?.width || data.expandedWidth || 360)),
              height: Math.round(Number(params?.height || data.expandedHeight || 260))
            }
          }));
        },
        onResizeEnd: (_event, params) => {
          window.dispatchEvent(new CustomEvent("centralis:resize-group", {
            detail: {
              groupId: data.recordId,
              width: Math.round(Number(params?.width || data.expandedWidth || 360)),
              height: Math.round(Number(params?.height || data.expandedHeight || 260))
            }
          }));
        }
      }),
      collapsed && React.createElement(Handle, { className: "node-grab node-grab-right", id: "right", type: "source", position: Position.Right, isConnectable: false }),
      collapsed && React.createElement(Handle, { className: "node-grab node-grab-left", id: "left", type: "target", position: Position.Left, isConnectable: false }),
      React.createElement(
        "div",
        { className: "group-flow-header" },
        React.createElement(
          "div",
          { className: "group-flow-title" },
          React.createElement("span", null, "Group"),
          React.createElement("strong", null, data.name || "Untitled Group"),
          React.createElement("small", null, `${Number(data.childCount || 0)} ${Number(data.childCount || 0) === 1 ? "element" : "elements"}`)
        ),
        React.createElement(
          "div",
          { className: "group-flow-actions" },
          React.createElement(
            "button",
            {
              className: "group-toggle nodrag nopan",
              type: "button",
              "aria-label": "Group color",
              title: "Group color",
              onClick: (event) => {
                event.stopPropagation();
                event.currentTarget.nextElementSibling?.click();
              }
            },
            React.createElement("ph-gear-six", { weight: "bold", "aria-hidden": "true" })
          ),
          React.createElement("input", {
            className: "group-color-input nodrag nopan",
            type: "color",
            value: backgroundColor,
            "aria-label": "Group background color",
            onClick: (event) => event.stopPropagation(),
            onChange: (event) => {
              event.stopPropagation();
              window.dispatchEvent(new CustomEvent("centralis:update-group-color", {
                detail: { groupId: data.recordId, color: event.target.value }
              }));
            }
          }),
          React.createElement(
            "button",
            {
              className: "group-toggle nodrag nopan",
              type: "button",
              "aria-label": collapsed ? "Expand group" : "Collapse group",
              title: collapsed ? "Expand group" : "Collapse group",
              onClick: (event) => {
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent("centralis:toggle-group", {
                  detail: { groupId: data.recordId, collapsed: !collapsed }
                }));
              }
            },
            React.createElement(collapsed ? "ph-arrows-out-simple" : "ph-arrows-in-simple", { weight: "bold", "aria-hidden": "true" })
          )
        )
      )
    );
  }

  function NoteNode(props) {
    const data = props.data;
    const collapsed = Boolean(data.collapsed);
    const bgColor = sanitizeColor(data.bgColor, DEFAULT_NOTE_BG_COLOR);
    const borderColor = sanitizeColor(data.borderColor, DEFAULT_NOTE_BORDER_COLOR);
    const textColor = sanitizeColor(data.textColor, DEFAULT_NOTE_TEXT_COLOR);
    const noteRef = React.useRef(null);
    const titleInputRef = React.useRef(null);
    const contentInputRef = React.useRef(null);
    const titleDisplayRef = React.useRef(null);
    const contentDisplayRef = React.useRef(null);
    const latestDraftRef = React.useRef({
      title: data.title || "Note",
      content: data.content || ""
    });
    const [isEditing, setIsEditing] = React.useState(false);
    const [draftTitle, setDraftTitle] = React.useState(data.title || "Note");
    const [draftContent, setDraftContent] = React.useState(data.content || "");

    React.useEffect(() => {
      latestDraftRef.current = {
        title: draftTitle,
        content: draftContent
      };
    }, [draftTitle, draftContent]);

    function fitNoteToContent(persist = false) {
      if (collapsed) {
        return;
      }
      window.requestAnimationFrame(() => {
        const noteElement = noteRef.current;
        if (!noteElement) {
          return;
        }
        const noteRect = noteElement.getBoundingClientRect();
        const desiredHeight = getNoteMinimumHeight();
        if (desiredHeight > noteRect.height + 2) {
          dispatchResize(noteRect.width || DEFAULT_NOTE_WIDTH, desiredHeight, persist);
        }
      });
    }

    function getNoteMinimumHeight() {
      if (collapsed) {
        return 72;
      }
      const titleElement = isEditing ? titleInputRef.current : titleDisplayRef.current;
      const contentElement = isEditing ? contentInputRef.current : contentDisplayRef.current;
      if (!titleElement || !contentElement) {
        return DEFAULT_NOTE_HEIGHT;
      }

      const titleHeight = Math.ceil(titleElement.scrollHeight || titleElement.getBoundingClientRect().height || 28);
      const contentHeight = Math.ceil(contentElement.scrollHeight || contentElement.getBoundingClientRect().height || 0);
      return Math.max(DEFAULT_NOTE_HEIGHT, titleHeight + contentHeight + 40);
    }

    React.useEffect(() => {
      fitNoteToContent(true);
    }, [data.title, data.content, isEditing]);

    React.useEffect(() => {
      if (!isEditing) {
        setDraftTitle(data.title || "Note");
        setDraftContent(data.content || "");
      }
    }, [data.title, data.content, isEditing]);

    function dispatchPatch(patch) {
      window.dispatchEvent(new CustomEvent("centralis:update-note", {
        detail: {
          nodeId: props.id,
          noteId: data.recordId,
          patch
        }
      }));
    }

    function dispatchResize(width, height, persist = false) {
      const nextWidth = Math.round(Number(width || DEFAULT_NOTE_WIDTH));
      const nextHeight = Math.max(getNoteMinimumHeight(), Math.round(Number(height || DEFAULT_NOTE_HEIGHT)));
      window.dispatchEvent(new CustomEvent(persist ? "centralis:resize-note" : "centralis:preview-resize-note", {
        detail: {
          nodeId: props.id,
          noteId: data.recordId,
          width: nextWidth,
          height: nextHeight
        }
      }));
    }

    React.useEffect(() => {
      if (!isEditing) {
        return undefined;
      }

      titleInputRef.current?.focus();
      titleInputRef.current?.select();

      function closeEditMode(event) {
        if (noteRef.current?.contains(event.target)) {
          return;
        }
        setIsEditing(false);
        dispatchPatch({ ...latestDraftRef.current, flush: true });
      }

      function handleEscape(event) {
        if (event.key === "Escape") {
          setIsEditing(false);
          dispatchPatch({ ...latestDraftRef.current, flush: true });
        }
      }

      document.addEventListener("pointerdown", closeEditMode, true);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("pointerdown", closeEditMode, true);
        document.removeEventListener("keydown", handleEscape);
      };
    }, [isEditing]);

    function enterEditMode(event) {
      event.stopPropagation();
      setIsEditing(true);
    }

    function updateTitle(value, flush = false) {
      setDraftTitle(value);
      dispatchPatch({ title: value, flush });
    }

    function updateContent(value, flush = false) {
      setDraftContent(value);
      dispatchPatch({ content: value, flush });
      fitNoteToContent(flush);
    }

    return React.createElement(
      "section",
      {
        ref: noteRef,
        className: `note-flow-node${props.selected ? " is-selected" : ""}${isEditing ? " is-editing" : ""}${collapsed ? " is-collapsed" : ""}`,
        style: {
          "--note-bg-color": bgColor,
          "--note-border-color": borderColor,
          "--note-text-color": textColor,
          backgroundColor: bgColor,
          borderColor,
          color: textColor
        },
        onDoubleClick: enterEditMode
      },
      NodeResizer && !collapsed && React.createElement(NodeResizer, {
        isVisible: true,
        minWidth: 180,
        minHeight: 120,
        handleClassName: "note-resize-handle nodrag nopan",
        lineClassName: "note-resize-line",
        onResize: (_event, params) => dispatchResize(params?.width, params?.height, false),
        onResizeEnd: (_event, params) => dispatchResize(params?.width, params?.height, true)
      }),
      React.createElement(
        "div",
        { className: "note-flow-header" },
        isEditing
          ? React.createElement("input", {
            ref: titleInputRef,
            className: "note-title-input nodrag nopan",
            value: draftTitle,
            "aria-label": "Note title",
            placeholder: "Note",
            onPointerDown: (event) => event.stopPropagation(),
            onDoubleClick: (event) => event.stopPropagation(),
            onChange: (event) => updateTitle(event.target.value),
            onBlur: (event) => updateTitle(event.target.value, true)
          })
          : React.createElement(
            "strong",
            { ref: titleDisplayRef, className: "note-title-display" },
            data.title || "Note"
          ),
        React.createElement(
          "div",
          { className: "note-flow-actions" },
          React.createElement(
            "button",
            {
              className: "note-toggle nodrag nopan",
              type: "button",
              "aria-label": "Note style",
              title: "Note style",
              onClick: (event) => {
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent("centralis:style-note", {
                  detail: { nodeId: props.id }
                }));
              }
            },
            React.createElement("ph-gear-six", { weight: "bold", "aria-hidden": "true" })
          ),
          React.createElement(
            "button",
            {
              className: "note-toggle nodrag nopan",
              type: "button",
              "aria-label": collapsed ? "Expand note" : "Collapse note",
              title: collapsed ? "Expand note" : "Collapse note",
              onClick: (event) => {
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent("centralis:toggle-note", {
                  detail: { nodeId: props.id, noteId: data.recordId, collapsed: !collapsed }
                }));
              }
            },
            React.createElement(collapsed ? "ph-arrows-out-simple" : "ph-arrows-in-simple", { weight: "bold", "aria-hidden": "true" })
          )
        )
      ),
      !collapsed && (isEditing
        ? React.createElement("textarea", {
          ref: contentInputRef,
          className: "note-content-input nodrag nopan",
          value: draftContent,
          "aria-label": "Note content",
          placeholder: "Write a note...",
          onPointerDown: (event) => event.stopPropagation(),
          onDoubleClick: (event) => event.stopPropagation(),
          onChange: (event) => updateContent(event.target.value),
          onBlur: (event) => updateContent(event.target.value, true)
        })
        : React.createElement(
          "p",
          { ref: contentDisplayRef, className: "note-content-display" },
          data.content || "Double-click to edit."
        ))
    );
  }

  function toUniverseNode(row) {
    return {
      id: `universe:${row.id}`,
      type: "universe",
      position: {
        x: Number(row.canvas_position_x ?? 120),
        y: Number(row.canvas_position_y ?? 120)
      },
      data: {
        kind: "universe",
        recordId: row.id,
        name: row.name || "Untitled Universe",
        description: row.description || "",
        format: initialUniverseFormat,
        images: getImagesForObject(row.id)
      },
      draggable: true
    };
  }

  function getGroupChildCount(groupId, elementRows = elements, groupRows = elementGroups) {
    const elementCount = elementRows.filter((row) => row.group_id === groupId).length;
    const groupCount = groupRows.filter((row) => row.parent_group_id === groupId).length;
    return elementCount + groupCount;
  }

  function toGroupNode(row) {
    const parentGroup = row.parent_group_id
      ? elementGroups.find((item) => item.id === row.parent_group_id)
      : null;
    const isNested = Boolean(parentGroup);
    const fallbackX = isNested
      ? Number(row.position_x ?? 320) - Number(parentGroup.position_x ?? 0)
      : Number(row.position_x ?? 320);
    const fallbackY = isNested
      ? Number(row.position_y ?? 160) - Number(parentGroup.position_y ?? 0)
      : Number(row.position_y ?? 160);
    return {
      id: `group:${row.id}`,
      type: "groupNode",
      position: {
        x: Number(isNested ? row.group_position_x ?? fallbackX : row.position_x ?? 320),
        y: Number(isNested ? row.group_position_y ?? fallbackY : row.position_y ?? 160)
      },
      parentId: isNested ? `group:${row.parent_group_id}` : undefined,
      extent: isNested ? "parent" : undefined,
      expandParent: false,
      data: {
        kind: "group",
        recordId: row.id,
        parentGroupId: isNested ? row.parent_group_id : null,
        name: row.name || "Untitled Group",
        description: row.description || "",
        backgroundColor: sanitizeColor(row.background_color, "#123034"),
        collapsed: Boolean(row.is_collapsed),
        childCount: getGroupChildCount(row.id),
        expandedWidth: Number(row.width || 360),
        expandedHeight: Number(row.height || 260)
      },
      style: {
        width: row.is_collapsed ? 260 : Number(row.width || 360),
        height: row.is_collapsed ? 96 : Number(row.height || 260)
      },
      zIndex: isNested ? 0 : -1,
      draggable: true
    };
  }

  function toNoteNode(row) {
    return {
      id: `note:${row.id}`,
      type: "note",
      position: {
        x: Number(row.position_x ?? 520),
        y: Number(row.position_y ?? 220)
      },
      data: {
        kind: "note",
        recordId: row.id,
        title: row.title || "Note",
        content: row.content || "",
        collapsed: Boolean(row.is_collapsed),
        bgColor: sanitizeColor(row.bg_color, DEFAULT_NOTE_BG_COLOR),
        borderColor: sanitizeColor(row.border_color, DEFAULT_NOTE_BORDER_COLOR),
        textColor: sanitizeColor(row.text_color, DEFAULT_NOTE_TEXT_COLOR),
        expandedWidth: Number(row.width || DEFAULT_NOTE_WIDTH),
        expandedHeight: Number(row.height || DEFAULT_NOTE_HEIGHT)
      },
      style: {
        width: row.is_collapsed ? 260 : Number(row.width || DEFAULT_NOTE_WIDTH),
        height: row.is_collapsed ? 72 : Number(row.height || DEFAULT_NOTE_HEIGHT)
      },
      draggable: true
    };
  }

  function toElementNode(row) {
    const elementType = elementTypes.find((type) => type.id === row.element_type_id) || null;
    const group = row.group_id ? elementGroups.find((item) => item.id === row.group_id) : null;
    const isGrouped = Boolean(group);

    return {
      id: `element:${row.id}`,
      type: "element",
      position: {
        x: Number(isGrouped ? row.group_position_x ?? 24 : row.position_x ?? 460),
        y: Number(isGrouped ? row.group_position_y ?? 72 : row.position_y ?? 180)
      },
      parentId: isGrouped ? `group:${row.group_id}` : undefined,
      extent: isGrouped ? "parent" : undefined,
      expandParent: false,
      data: {
        kind: "element",
        recordId: row.id,
        groupId: row.group_id || null,
        name: row.name || "Untitled Element",
        description: row.description || "",
        elementType,
        richTemplateId: row.rich_template_id || null,
        format: initialUniverseFormat,
        images: getImagesForObject(row.id)
      },
      draggable: true
    };
  }

  function sortGroupsByParent(groupRows) {
    const rowsById = new Map(groupRows.map((row) => [row.id, row]));
    const visited = new Set();
    const sorted = [];

    function visit(row) {
      if (!row || visited.has(row.id)) {
        return;
      }
      const parentRow = row.parent_group_id ? rowsById.get(row.parent_group_id) : null;
      if (parentRow) {
        visit(parentRow);
      }
      visited.add(row.id);
      sorted.push(row);
    }

    groupRows.forEach(visit);
    return sorted;
  }

  const initialNodes = [
    toUniverseNode(universe),
    ...sortGroupsByParent(elementGroups).map(toGroupNode),
    ...elements.map(toElementNode),
    ...canvasNotes.map(toNoteNode)
  ];

  function toRecordId(nodeId) {
    return String(nodeId || "").replace(/^(universe|element|group|note):/, "");
  }

  function toNodeId(recordId) {
    const value = String(recordId || "");
    if (value.startsWith("universe:") || value.startsWith("element:")) {
      return value;
    }

    return value === universe.id ? `universe:${value}` : `element:${value}`;
  }

  function isGroupNodeId(nodeId) {
    return String(nodeId || "").startsWith("group:");
  }

  function isNoteNodeId(nodeId) {
    return String(nodeId || "").startsWith("note:");
  }

  function toLinkEdge(link) {
    const format = initialUniverseFormat;
    return {
      id: link.id,
      source: toNodeId(link.source_element_id),
      target: toNodeId(link.target_element_id),
      sourceHandle: "right",
      targetHandle: "left",
      label: link.label || undefined,
      type: "deletable",
      zIndex: LINK_EDGE_Z_INDEX,
      data: {
        recordId: link.id,
        format
      },
      style: {
        stroke: link.stroke_color || format.strokeColor,
        strokeWidth: Number(link.stroke_width || format.strokeWidth),
        strokeDasharray: getStrokeDasharray(link.stroke_style || format.strokeStyle)
      }
    };
  }

  const initialEdges = elementLinks.map(toLinkEdge);

  function getCollapsedGroupIds(nodesToCheck) {
    return new Set(nodesToCheck
      .filter((node) => node.data?.kind === "group" && node.data?.collapsed)
      .map((node) => node.id));
  }

  function getCollapsedAncestorId(node, nodesById, collapsedGroupIds) {
    let parentId = node?.parentId || "";
    while (parentId) {
      if (collapsedGroupIds.has(parentId)) {
        return parentId;
      }
      parentId = nodesById.get(parentId)?.parentId || "";
    }
    return null;
  }

  function getVisibleNodesForGroups(nodesToRender) {
    const collapsedGroupIds = getCollapsedGroupIds(nodesToRender);
    const nodesById = new Map(nodesToRender.map((node) => [node.id, node]));
    return nodesToRender.map((node) => ({
      ...node,
      hidden: getCollapsedAncestorId(node, nodesById, collapsedGroupIds) ? true : node.hidden
    }));
  }

  function getVisibleEdgesForGroups(edgesToRender, nodesToRender) {
    const nodesById = new Map(nodesToRender.map((node) => [node.id, node]));
    const collapsedGroupIds = getCollapsedGroupIds(nodesToRender);
    const proxyKeys = new Set();
    const visibleEdges = [];

    edgesToRender.forEach((edge) => {
      const sourceNode = nodesById.get(edge.source);
      const targetNode = nodesById.get(edge.target);
      const sourceGroupId = getCollapsedAncestorId(sourceNode, nodesById, collapsedGroupIds);
      const targetGroupId = getCollapsedAncestorId(targetNode, nodesById, collapsedGroupIds);

      if (!sourceGroupId && !targetGroupId) {
        visibleEdges.push(edge);
        return;
      }

      if (sourceGroupId && targetGroupId && sourceGroupId === targetGroupId) {
        return;
      }

      const proxySource = sourceGroupId || edge.source;
      const proxyTarget = targetGroupId || edge.target;
      const proxyKey = `${proxySource}->${proxyTarget}:${edge.id}`;
      if (proxyKeys.has(proxyKey)) {
        return;
      }
      proxyKeys.add(proxyKey);
      visibleEdges.push({
        ...edge,
        id: `proxy:${edge.id}:${proxySource}:${proxyTarget}`,
        source: proxySource,
        target: proxyTarget,
        sourceHandle: sourceGroupId ? "right" : edge.sourceHandle,
        targetHandle: targetGroupId ? "left" : edge.targetHandle,
        data: {
          ...edge.data,
          isProxy: true
        },
        selectable: false
      });
    });

    return visibleEdges;
  }

  function sortLayers(items) {
    return [...(items || [])].sort((a, b) => {
      const sortA = Number(a.sort_order ?? 0);
      const sortB = Number(b.sort_order ?? 0);
      if (sortA !== sortB) return sortA - sortB;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function getEntriesForLayer(layerId, entries = overlayLayerEntries) {
    return sortLayers((entries || []).filter((entry) => entry.layer_id === layerId));
  }

  function getAssignmentForElement(elementId, layerId, assignments = overlayLayerAssignments) {
    return (assignments || []).find((assignment) => (
      assignment.element_id === elementId &&
      assignment.layer_id === layerId
    )) || null;
  }

  function getAssignmentsForElement(elementId, layerId, assignments = overlayLayerAssignments) {
    return (assignments || []).filter((assignment) => (
      assignment.element_id === elementId &&
      assignment.layer_id === layerId
    ));
  }

  function getEntryById(entryId, entries = overlayLayerEntries) {
    return (entries || []).find((entry) => entry.id === entryId) || null;
  }

  function applyLayerOverlayToNode(node, activeLayerId, entries, assignments) {
    if (node.data?.kind !== "element") {
      return node;
    }

    if (!activeLayerId) {
      if (!node.data.layerOverlay) return node;
      return {
        ...node,
        data: {
          ...node.data,
          layerOverlay: null
        }
      };
    }

    const nodeAssignments = getAssignmentsForElement(node.data.recordId, activeLayerId, assignments);
    const assignedEntries = nodeAssignments
      .map((assignment) => getEntryById(assignment.entry_id, entries))
      .filter(Boolean);
    const primaryEntry = assignedEntries[0] || null;
    return {
      ...node,
      data: {
        ...node.data,
        layerOverlay: {
          active: true,
          assigned: assignedEntries.length > 0,
          color: primaryEntry?.color || null,
          label: assignedEntries.length > 1 ? `${primaryEntry?.name || "Assigned"} +${assignedEntries.length - 1}` : primaryEntry?.name || "Unassigned",
          entries: assignedEntries.map((entry) => ({
            id: entry.id,
            name: entry.name,
            color: sanitizeColor(entry.color, "#6366f1")
          }))
        }
      }
    };
  }

  function applyLayerOverlayToNodes(nodesToUpdate, activeLayerId, entries, assignments) {
    return nodesToUpdate.map((node) => applyLayerOverlayToNode(node, activeLayerId, entries, assignments));
  }

  function getImagesForObject(objectId) {
    return normalizeImages(imageRows.filter((image) => image.object_id === objectId));
  }

  function getNodeTypeMeta(node) {
    if (node?.data?.kind === "universe") {
      return {
        label: "Universe",
        icon: "globe-hemisphere-west",
        color: sanitizeColor("#78d5c8")
      };
    }
    if (node?.data?.kind === "group") {
      return {
        label: "Group",
        icon: "selection-plus",
        color: sanitizeColor("#78d5c8")
      };
    }

    const elementType = node?.data?.elementType;
    return {
      label: elementType?.name || "No Type",
      icon: sanitizeIconName(elementType?.icon || "circle"),
      color: sanitizeColor(elementType?.color)
    };
  }

  function getDetailsControls() {
    const pane = document.querySelector("[data-details-pane]");
    if (!pane) {
      return null;
    }

    return {
      pane,
      kind: pane.querySelector("[data-details-kind]"),
      title: pane.querySelector("[data-details-title]"),
      titleBlock: pane.querySelector(".details-pane-title-block"),
      content: pane.querySelector("[data-details-content]"),
      closeButton: pane.querySelector("[data-details-close]"),
      actionBar: pane.querySelector(".details-pane-actions"),
      richButton: pane.querySelector("[data-details-rich]"),
      editButton: pane.querySelector("[data-details-edit]"),
      saveButton: pane.querySelector("[data-details-save]"),
      cancelButton: pane.querySelector("[data-details-cancel]"),
      resizer: pane.querySelector("[data-details-resizer]")
    };
  }

  function hideDetailsPane() {
    const controls = getDetailsControls();
    if (controls?.pane) {
      controls.pane.hidden = true;
      clearDetailsPaneAiState(controls);
    }
    document.querySelector(".flow-page")?.style.setProperty("--details-pane-width", "0px");
  }

  function clearDetailsPaneAiState(controls = getDetailsControls()) {
    controls?.pane?.classList.remove("is-ai-chat-pane");
    controls?.content?.classList.remove("is-ai-chat");
    const statusLine = controls?.titleBlock?.querySelector("[data-ai-header-status]");
    statusLine?.remove();
    controls?.pane?.querySelector("[data-ai-popout]")?.remove();
    controls?.actionBar?.querySelector("[data-ai-popout]")?.remove();
  }

  function setDetailsPaneAiStatusLine(controls, text) {
    if (!controls?.titleBlock) {
      return;
    }

    let statusLine = controls.titleBlock.querySelector("[data-ai-header-status]");
    if (!text) {
      statusLine?.remove();
      return;
    }

    if (!statusLine) {
      statusLine = document.createElement("p");
      statusLine.className = "universe-ai-header-status";
      statusLine.dataset.aiHeaderStatus = "";
      controls.titleBlock.appendChild(statusLine);
    }
    statusLine.textContent = text;
  }

  function setDetailsPaneAiPopoutButton(controls, onPopOut) {
    if (!controls?.closeButton) {
      return;
    }

    controls.pane?.querySelector("[data-ai-popout]")?.remove();
    if (!onPopOut) {
      return;
    }

    const button = document.createElement("button");
    button.className = "modal-close universe-ai-popout-button";
    button.type = "button";
    button.dataset.aiPopout = "";
    button.title = "Pop out AI Expert chat";
    button.setAttribute("aria-label", "Pop out AI Expert chat");
    button.innerHTML = '<ph-arrows-out-simple weight="bold" aria-hidden="true"></ph-arrows-out-simple>';
    button.addEventListener("click", onPopOut);
    controls.closeButton.insertAdjacentElement("beforebegin", button);
  }

  function getLinkedNodes(nodeId, currentNodes, currentEdges) {
    const linkedIds = [];
    const seen = new Set();

    currentEdges.forEach((edge) => {
      let linkedId = null;
      if (edge.source === nodeId) {
        linkedId = edge.target;
      } else if (edge.target === nodeId) {
        linkedId = edge.source;
      }

      if (linkedId && !seen.has(linkedId)) {
        seen.add(linkedId);
        linkedIds.push(linkedId);
      }
    });

    return linkedIds
      .map((linkedId) => currentNodes.find((node) => node.id === linkedId))
      .filter(Boolean);
  }

  function renderLinkedNodeCards(linkedNodes) {
    if (!linkedNodes.length) {
      return '<p class="details-empty">No linked nodes yet.</p>';
    }

    return linkedNodes.map((linkedNode) => {
      const meta = getNodeTypeMeta(linkedNode);
      return `
        <button class="linked-node-card" type="button" data-linked-node-id="${escapeHtml(linkedNode.id)}" style="--linked-color: ${escapeHtml(meta.color)}">
          <span class="linked-node-icon" aria-hidden="true">
            <ph-${escapeHtml(meta.icon)} weight="duotone"></ph-${escapeHtml(meta.icon)}>
          </span>
          <span class="linked-node-text">
            <strong>${escapeHtml(linkedNode.data?.name || "Untitled Node")}</strong>
            <span>${escapeHtml(meta.label)}</span>
          </span>
        </button>
      `;
    }).join("");
  }

  function renderDetailsSection(id, title, content) {
    const bodyId = `details-section-${sanitizeIconName(id)}`;
    return `
      <section class="details-section details-view-section">
        <h3 class="details-section-heading">${escapeHtml(title)}</h3>
        <div class="details-section-body" id="${escapeHtml(bodyId)}" data-details-section-body>
          ${content}
        </div>
      </section>
    `;
  }

  function getUniverseAiStatusMeta(state = {}) {
    if (state.loading) {
      return {
        key: "loading",
        label: "Loading",
        description: "Loading the persistent AI Expert discussion..."
      };
    }
    if (state.syncing) {
      return {
        key: "syncing",
        label: "Syncing",
        description: "Building and syncing this universe's canon knowledge source."
      };
    }
    if (state.error || state.source?.sync_status === "error") {
      return {
        key: "error",
        label: "Error",
        description: state.error || state.source?.sync_error || "The AI knowledge source could not be prepared."
      };
    }
    if (state.source?.sync_status === "ready") {
      return {
        key: "ready",
        label: "Ready",
        description: state.source?.last_synced_at
          ? `Knowledge synced ${formatDetailsDate(state.source.last_synced_at)}.`
          : "Knowledge is synced and ready."
      };
    }
    return {
      key: "dirty",
      label: "Needs update",
      description: "The AI needs to sync this universe's current canon before answering."
    };
  }

  function formatDetailsDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "recently";
    }
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function renderAiMessageContent(message) {
    const content = String(message?.content || "");
    if (message?.role === "assistant") {
      return renderMarkdownDescription(content).replace(
        /class="details-description-text details-description-markdown([^"]*)"/,
        'class="universe-ai-response-text details-description-markdown$1"'
      );
    }
    return `<p>${escapeHtml(content).replace(/\n/g, "<br>")}</p>`;
  }

  function getUniverseAiProposalSummary(proposal) {
    const elements = Array.isArray(proposal?.payload?.elements) ? proposal.payload.elements : [];
    const links = Array.isArray(proposal?.payload?.links) ? proposal.payload.links : [];
    const elementCount = elements.length;
    const linkCount = links.length;
    const elementLabel = `${elementCount} ${elementCount === 1 ? "element" : "elements"}`;
    const linkLabel = `${linkCount} ${linkCount === 1 ? "link" : "links"}`;
    return `${elementLabel}${linkCount ? `, ${linkLabel}` : ""}`;
  }

  function getUniverseAiProposalStatusText(status) {
    if (status === "finalized") return "Finalized";
    if (status === "dismissed") return "Dismissed";
    return "Pending review";
  }

  function renderUniverseAiProposalCard(proposal) {
    if (!proposal || proposal.type !== "create_elements") {
      return "";
    }

    const status = String(proposal.status || "pending");
    const isPending = status === "pending";
    return `
      <aside class="universe-ai-proposal-card is-${escapeHtml(status)}" data-ai-proposal-card data-proposal-id="${escapeHtml(proposal.id || "")}">
        <div class="universe-ai-proposal-main">
          <span class="universe-ai-proposal-icon" aria-hidden="true">
            <ph-sparkle weight="duotone"></ph-sparkle>
          </span>
          <div>
            <strong>Proposed Elements</strong>
            <span>${escapeHtml(getUniverseAiProposalSummary(proposal))}</span>
          </div>
        </div>
        <div class="universe-ai-proposal-actions">
          <span class="universe-ai-proposal-status">${escapeHtml(getUniverseAiProposalStatusText(status))}</span>
          ${isPending ? `
            <button class="secondary-action compact-action" type="button" data-ai-review-proposal="${escapeHtml(proposal.id || "")}">Review</button>
            <button class="subtle-icon-action" type="button" data-ai-dismiss-proposal="${escapeHtml(proposal.id || "")}">Dismiss</button>
          ` : ""}
        </div>
      </aside>
    `;
  }

  function renderUniverseAiStatusCard(status, state, isBusy) {
    return `
      <div class="universe-ai-status-card is-${escapeHtml(status.key)}">
        <div>
          <span>Knowledge Status</span>
          <strong>${escapeHtml(status.label)}</strong>
          <p>${escapeHtml(status.description)}</p>
        </div>
        ${status.key !== "ready" ? `
          <button class="secondary-action compact-action" type="button" data-ai-sync${isBusy ? " disabled" : ""}>
            ${state.syncing ? "Syncing..." : "Sync Now"}
          </button>
        ` : ""}
      </div>
    `;
  }

  function getUniverseAiReadyStatusLine(status) {
    return status.key === "ready" ? `${status.label} - ${status.description}` : "";
  }

  function renderUniverseAiChatContent(host, state = {}, actions = {}, options = {}) {
    if (!host) {
      return;
    }
    const status = getUniverseAiStatusMeta(state);
    const isReady = status.key === "ready";
    const isBusy = Boolean(state.loading || state.syncing || state.sending);
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const showStatusCard = status.key !== "ready" || options.forceStatusCard;

    host.innerHTML = `
      <section class="universe-ai-panel">
        ${showStatusCard ? renderUniverseAiStatusCard(status, state, isBusy) : ""}
        <div class="universe-ai-messages" data-ai-messages>
          ${state.loading ? '<p class="details-empty">Loading AI Expert...</p>' : ""}
          ${!state.loading && !messages.length ? '<p class="details-empty">Ask this universe expert about canon, continuity, missing details, or new ideas.</p>' : ""}
          ${messages.map((message) => `
            <article class="universe-ai-message is-${escapeHtml(message.role || "assistant")}">
              <div class="universe-ai-message-body">
                ${renderAiMessageContent(message)}
              </div>
              ${message.role === "assistant" && Array.isArray(message.proposals) ? message.proposals.map(renderUniverseAiProposalCard).join("") : ""}
              ${message.role === "assistant" ? `
                <div class="universe-ai-response-actions">
                  <button class="subtle-icon-action" type="button" data-ai-copy-response title="Copy response">
                    <ph-copy weight="bold" aria-hidden="true"></ph-copy>
                    <span>Copy</span>
                  </button>
                </div>
              ` : ""}
            </article>
          `).join("")}
          ${state.sending ? `
            <article class="universe-ai-message is-assistant is-pending">
              <div class="universe-ai-message-body"><p>Thinking...</p></div>
            </article>
          ` : ""}
        </div>
        <form class="universe-ai-composer" data-ai-chat-form>
          ${state.error ? `<p class="form-status is-error" data-ai-chat-status role="status">${escapeHtml(state.error)}</p>` : ""}
          <div class="universe-ai-composer-row">
            <textarea name="message" rows="1" placeholder="${isReady ? "Ask about this universe..." : "Sync the universe knowledge before chatting."}"${!isReady || isBusy ? " disabled" : ""}></textarea>
            <button class="primary-action compact-action universe-ai-send" type="submit"${!isReady || isBusy ? " disabled" : ""}>
              ${state.sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </section>
    `;

    const messagesHost = host.querySelector("[data-ai-messages]");
    if (messagesHost) {
      messagesHost.scrollTop = messagesHost.scrollHeight;
    }

    host.querySelector("[data-ai-sync]")?.addEventListener("click", () => {
      actions.onSync?.();
    });

    host.querySelectorAll("[data-ai-copy-response]").forEach((button) => {
      button.addEventListener("click", async () => {
        const message = button.closest(".universe-ai-message");
        const text = message?.querySelector(".universe-ai-message-body")?.innerText?.trim() || "";
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          const label = button.querySelector("span");
          if (label) label.textContent = "Copied";
          button.classList.add("is-copied");
          window.setTimeout(() => {
            if (label) label.textContent = "Copy";
            button.classList.remove("is-copied");
          }, 1600);
        } catch (_error) {
          const label = button.querySelector("span");
          if (label) label.textContent = "Copy failed";
          window.setTimeout(() => {
            if (label) label.textContent = "Copy";
          }, 1600);
        }
      });
    });

    const proposalById = new Map(messages.flatMap((message) => Array.isArray(message.proposals) ? message.proposals : [])
      .filter((proposal) => proposal?.id)
      .map((proposal) => [String(proposal.id), proposal]));

    host.querySelectorAll("[data-ai-review-proposal]").forEach((button) => {
      button.addEventListener("click", () => {
        const proposal = proposalById.get(String(button.dataset.aiReviewProposal || ""));
        if (proposal) {
          actions.onReviewProposal?.(proposal);
        }
      });
    });

    host.querySelectorAll("[data-ai-dismiss-proposal]").forEach((button) => {
      button.addEventListener("click", () => {
        const proposal = proposalById.get(String(button.dataset.aiDismissProposal || ""));
        if (proposal) {
          actions.onDismissProposal?.(proposal);
        }
      });
    });

    const textarea = host.querySelector('.universe-ai-composer textarea[name="message"]');
    const resizeComposer = () => {
      if (!textarea) return;
      const computed = window.getComputedStyle(textarea);
      const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
      const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
      const maxHeight = (lineHeight * 8) + paddingTop + paddingBottom;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    };
    resizeComposer();
    textarea?.addEventListener("input", resizeComposer);
    textarea?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    });

    host.querySelector("[data-ai-chat-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = String(new FormData(form).get("message") || "").trim();
      if (message) {
        actions.onSend?.(message);
      }
    });
  }

  function renderUniverseAiChatPane(state = {}, actions = {}) {
    const controls = getDetailsControls();
    if (!controls?.pane || !controls.content) {
      return;
    }

    const status = getUniverseAiStatusMeta(state);
    controls.pane.hidden = false;
    controls.pane.classList.add("is-ai-chat-pane");
    document.querySelector(".flow-page")?.style.setProperty("--details-pane-width", `${controls.pane.getBoundingClientRect().width}px`);
    controls.content.classList.add("is-ai-chat");
    setDetailsPaneAiStatusLine(controls, getUniverseAiReadyStatusLine(status));
    setDetailsPaneAiPopoutButton(controls, actions.onPopOut);
    if (controls.kind) controls.kind.textContent = "AI Expert";
    if (controls.title) controls.title.textContent = universe.name || "Universe Expert";
    [controls.richButton, controls.editButton, controls.cancelButton, controls.saveButton].forEach((button) => {
      if (button) button.hidden = true;
    });

    renderUniverseAiChatContent(controls.content, state, actions);
  }

  function renderImageGallery(images, nodeId) {
    if (!images?.length) {
      return '<p class="details-empty">No images yet.</p>';
    }

    const normalizedImages = normalizeImages(images);
    const primaryImage = normalizedImages[0];
    const primaryIndex = 0;

    return `
      <div class="image-gallery">
        <button class="image-primary" type="button" data-image-primary data-node-id="${escapeHtml(nodeId)}" data-image-id="${escapeHtml(primaryImage.id)}">
          <img src="${escapeHtml(primaryImage.image_url)}" alt="" data-image-primary-img>
          <span data-image-counter>${primaryIndex + 1} / ${images.length}</span>
        </button>
        <div class="image-thumbs" aria-label="Image gallery">
          ${normalizedImages.map((image, index) => `
            <button class="image-thumb${image.id === primaryImage.id ? " is-active" : ""}" type="button" data-image-thumb data-image-id="${escapeHtml(image.id)}" data-image-url="${escapeHtml(image.image_url)}" data-image-index="${index + 1}" aria-label="Show image ${index + 1}">
              <img src="${escapeHtml(image.image_url)}" alt="">
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function setupImageGallery(container) {
    const primaryButton = container.querySelector("[data-image-primary]");
    const primaryImage = container.querySelector("[data-image-primary-img]");
    const counter = container.querySelector("[data-image-counter]");
    const thumbs = container.querySelectorAll("[data-image-thumb]");
    if (!primaryButton || !primaryImage || !thumbs.length) {
      return;
    }

    primaryButton.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("centralis:open-image-viewer", {
        detail: {
          nodeId: primaryButton.dataset.nodeId,
          imageId: primaryButton.dataset.imageId
        }
      }));
    });

    thumbs.forEach((thumb) => {
      thumb.addEventListener("click", () => {
        const url = thumb.dataset.imageUrl;
        if (!url) {
          return;
        }

        primaryImage.src = url;
        primaryButton.dataset.imageId = thumb.dataset.imageId || "";
        if (counter) {
          counter.textContent = `${thumb.dataset.imageIndex} / ${thumbs.length}`;
        }
        thumbs.forEach((currentThumb) => currentThumb.classList.toggle("is-active", currentThumb === thumb));
      });
    });
  }

  const MAX_IMAGE_PROMPT_LENGTH = 2200;

  function clampImagePrompt(prompt, maxLength = MAX_IMAGE_PROMPT_LENGTH) {
    const normalized = String(prompt || "").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength - 74).trimEnd()}\n\n[Prompt shortened to fit the image generation limit.]`;
  }

  function createImagePrompt(node) {
    const meta = getNodeTypeMeta(node);
    const name = node.data?.name || "Untitled Node";
    const description = node.data?.description || "";
    return clampImagePrompt([
      `${name} is a ${meta.label.toLowerCase()} in a universe-building canvas.`,
      description,
      "Create a visually rich, cinematic concept image based on these details."
    ].filter(Boolean).join(" "));
  }

  function createTypeOptionMarkup(type, selectedTypeId) {
    const value = type.id || "";
    const color = sanitizeColor(type.color);
    const iconName = sanitizeIconName(type.icon);
    return `
      <button class="type-picker-option" type="button" data-type-option="true" data-value="${escapeHtml(value)}" role="option" aria-selected="${value === selectedTypeId ? "true" : "false"}">
        <span class="type-picker-swatch" style="--type-color: ${escapeHtml(color)}"></span>
        <span class="type-picker-icon" aria-hidden="true" style="--type-color: ${escapeHtml(color)}">
          <ph-${escapeHtml(iconName)} weight="duotone"></ph-${escapeHtml(iconName)}>
        </span>
        <span>${escapeHtml(type.name)}</span>
      </button>
    `;
  }

  function createDetailsTypePickerMarkup(selectedTypeId) {
    const options = [
      { id: "", name: "No type", icon: "circle", color: "#64748b" },
      ...elementTypes
    ];
    const selectedType = getElementTypeById(selectedTypeId) || options[0];
    const selectedColor = sanitizeColor(selectedType.color);
    const selectedIcon = sanitizeIconName(selectedType.icon);

    return `
      <div class="type-picker" data-details-type-picker>
        <input type="hidden" name="details-element-type" data-details-type-input value="${escapeHtml(selectedType.id || "")}">
        <button class="type-picker-trigger" type="button" data-details-type-trigger aria-expanded="false" aria-haspopup="listbox">
          <span class="type-picker-current">
            <span class="type-picker-swatch" data-details-type-swatch style="--type-color: ${escapeHtml(selectedColor)}"></span>
            <span class="type-picker-icon" data-details-type-icon aria-hidden="true" style="--type-color: ${escapeHtml(selectedColor)}">
              <ph-${escapeHtml(selectedIcon)} weight="duotone"></ph-${escapeHtml(selectedIcon)}>
            </span>
            <span data-details-type-label>${escapeHtml(selectedType.name)}</span>
          </span>
          <ph-caret-down weight="bold" aria-hidden="true"></ph-caret-down>
        </button>
        <div class="type-picker-list" data-details-type-list role="listbox" hidden>
          ${options.map((type) => createTypeOptionMarkup(type, selectedType.id || "")).join("")}
        </div>
      </div>
    `;
  }

  function setupDetailsTypePicker(content) {
    const picker = content.querySelector("[data-details-type-picker]");
    if (!picker) {
      return;
    }

    const input = picker.querySelector("[data-details-type-input]");
    const trigger = picker.querySelector("[data-details-type-trigger]");
    const list = picker.querySelector("[data-details-type-list]");
    const label = picker.querySelector("[data-details-type-label]");
    const swatch = picker.querySelector("[data-details-type-swatch]");
    const icon = picker.querySelector("[data-details-type-icon]");

    function setValue(typeId) {
      const type = getElementTypeById(typeId) || { id: "", name: "No type", icon: "circle", color: "#64748b" };
      const color = sanitizeColor(type.color);
      input.value = type.id || "";
      label.textContent = type.name;
      swatch.style.setProperty("--type-color", color);
      icon.style.setProperty("--type-color", color);
      renderTypeIcon(icon, type.icon);
      list.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      list.querySelectorAll("[data-type-option]").forEach((option) => {
        option.setAttribute("aria-selected", option.dataset.value === input.value ? "true" : "false");
      });
    }

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = list.hidden;
      list.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    list.querySelectorAll("[data-type-option]").forEach((option) => {
      option.addEventListener("click", () => setValue(option.dataset.value || ""));
    });
  }

  function getTemplateFieldLabel(field) {
    return field.label || field.name || field.field_key || "Untitled Field";
  }

  function getTemplateFieldKey(field) {
    return field.field_key || sanitizeIconName(getTemplateFieldLabel(field));
  }

  function getTemplateFieldType(field) {
    return String(field.field_type || "textarea").toLowerCase();
  }

  function isRichTextareaType(type) {
    return ["textarea", "rich_text"].includes(String(type || "").toLowerCase());
  }

  function parseFieldOptions(options) {
    if (!options) {
      return {};
    }
    if (typeof options === "object") {
      return options;
    }
    try {
      return JSON.parse(options);
    } catch {
      return {};
    }
  }

  function getFieldChoices(field) {
    const options = parseFieldOptions(field.options);
    return Array.isArray(options.choices) ? options.choices.map(String) : [];
  }

  function normalizeRichDetailsFieldValue(field, value) {
    const type = getTemplateFieldType(field);
    if (type === "multi_select") {
      if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean).join("\n");
      }
      return String(value ?? "")
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
        .join("\n");
    }
    if (type === "checkbox") {
      if (value === true) return "true";
      if (value === false) return "";
      const clean = String(value ?? "").trim().toLowerCase();
      return ["true", "yes", "1", "on"].includes(clean) ? "true" : "";
    }
    return String(value ?? "").trim();
  }

  function getRichDetailsExportValue(field, value, includeValues) {
    const type = getTemplateFieldType(field);
    if (!includeValues) {
      return type === "multi_select" ? [] : "";
    }
    const cleanValue = String(value ?? "");
    if (type === "multi_select") {
      return cleanValue.split("\n").map((item) => item.trim()).filter(Boolean);
    }
    if (type === "checkbox") {
      return cleanValue === "true";
    }
    return cleanValue;
  }

  function normalizeFieldKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function optionsToLines(options) {
    return getFieldChoices({ options }).join("\n");
  }

  function linesToOptions(value) {
    const choices = String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return choices.length ? { choices } : null;
  }

  function getFieldStoredValue(valuesByFieldId, field) {
    const savedValue = valuesByFieldId.get(field.id)?.value;
    if (savedValue !== undefined && savedValue !== null) {
      return String(savedValue);
    }
    return field.default_value === undefined || field.default_value === null ? "" : String(field.default_value);
  }

  function renderRichFieldValue(field, value, options = {}) {
    const label = getTemplateFieldLabel(field);
    const type = getTemplateFieldType(field);
    const hasValue = hasMeaningfulValue(value);
    const isTextarea = isRichTextareaType(type);
    const wikiClass = options.wiki ? " is-wiki-field" : "";
    let displayValue = hasMeaningfulValue(value) ? value : "--";
    if (type === "checkbox" && hasMeaningfulValue(value)) {
      displayValue = value === "true" ? "Yes" : "No";
    } else if (type === "multi_select") {
      displayValue = String(value).split("\n").filter(Boolean).join(", ");
    }
    const renderedValue = isTextarea && hasValue
      ? renderMarkdownDescription(value)
      : escapeHtml(displayValue);

    return `
      <div class="rich-view-field${isTextarea ? " is-textarea-field" : ""}${wikiClass}" data-template-field-id="${escapeHtml(field.id)}">
        <dt>${escapeHtml(label)}</dt>
        <dd class="${hasValue ? "" : "is-empty"}">${renderedValue}</dd>
      </div>
    `;
  }

  function renderChronicleWikiFields(fields, valuesByFieldId) {
    if (!fields.length) {
      return '<p class="details-empty">No fields in this module.</p>';
    }

    const scalarFields = fields.filter((field) => !isRichTextareaType(getTemplateFieldType(field)));
    const proseFields = fields.filter((field) => isRichTextareaType(getTemplateFieldType(field)));
    return `
      ${scalarFields.length ? `
        <dl class="chronicle-wiki-facts">
          ${scalarFields.map((field) => renderRichFieldValue(field, getFieldStoredValue(valuesByFieldId, field), { wiki: true })).join("")}
        </dl>
      ` : ""}
      ${proseFields.length ? `
        <div class="chronicle-wiki-prose-fields">
          ${proseFields.map((field) => renderRichFieldValue(field, getFieldStoredValue(valuesByFieldId, field), { wiki: true })).join("")}
        </div>
      ` : ""}
    `;
  }

  function renderRichFieldControl(field, value) {
    const fieldId = `rich-field-${escapeHtml(field.id)}`;
    const fieldName = `rich-field:${field.id}`;
    const label = getTemplateFieldLabel(field);
    const type = getTemplateFieldType(field);
    const description = field.description || field.hint_text || "";
    const placeholder = field.placeholder || "";
    const choices = getFieldChoices(field);
    const required = Boolean(field.is_required) ? " required" : "";
    const commonAttrs = `id="${fieldId}" name="${escapeHtml(fieldName)}" placeholder="${escapeHtml(placeholder)}"${required}`;
    let control = "";

    if (type === "text" || type === "url") {
      control = `<input type="${type === "url" ? "url" : "text"}" ${commonAttrs} value="${escapeHtml(value)}">`;
    } else if (type === "number") {
      control = `<input type="number" ${commonAttrs} value="${escapeHtml(value)}">`;
    } else if (type === "date") {
      control = `<input type="date" ${commonAttrs} value="${escapeHtml(value)}">`;
    } else if (type === "checkbox") {
      control = `
        <label class="rich-checkbox-field">
          <input type="checkbox" name="${escapeHtml(fieldName)}" value="true"${value === "true" ? " checked" : ""}>
          <span>${escapeHtml(field.placeholder || "Enabled")}</span>
        </label>
      `;
    } else if (type === "select") {
      control = `
        <select ${commonAttrs}>
          <option value="">Select...</option>
          ${choices.map((choice) => `<option value="${escapeHtml(choice)}"${choice === value ? " selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
        </select>
      `;
    } else if (type === "multi_select") {
      const selected = new Set(value ? value.split("\n").map((item) => item.trim()).filter(Boolean) : []);
      control = `
        <select ${commonAttrs} multiple>
          ${choices.map((choice) => `<option value="${escapeHtml(choice)}"${selected.has(choice) ? " selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
        </select>
      `;
    } else {
      const fallback = ["textarea", "rich_text"].includes(type) ? "" : `<em>Unsupported field type "${escapeHtml(type)}"; saving as text.</em>`;
      control = `${fallback}<textarea ${commonAttrs} rows="5">${escapeHtml(value)}</textarea>`;
    }

    return `
      <label class="form-field rich-template-field${isRichTextareaType(type) ? " is-textarea-field" : ""}" data-template-field-id="${escapeHtml(field.id)}" data-template-field-type="${escapeHtml(type)}">
        <span>${escapeHtml(label)}${field.is_required ? " *" : ""}</span>
        ${description ? `<small>${escapeHtml(description)}</small>` : ""}
        ${control}
      </label>
    `;
  }

  function sortTemplateFields(fields) {
    return [...fields].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0) || getTemplateFieldLabel(left).localeCompare(getTemplateFieldLabel(right)));
  }

  function dedupeTemplateFields(fields = [], templateId = "") {
    const fieldsByIdentity = new Map();
    const duplicateFields = [];

    fields.forEach((field) => {
      const identity = [
        field.template_id || templateId || "",
        field.section_id || "",
        String(field.field_key || getTemplateFieldLabel(field) || field.id || "").trim().toLowerCase()
      ].join("::");

      if (fieldsByIdentity.has(identity)) {
        duplicateFields.push(field);
        return;
      }

      fieldsByIdentity.set(identity, field);
    });

    if (duplicateFields.length) {
      console.warn("Duplicate rich template fields were hidden from rendering.", {
        templateId,
        duplicateCount: duplicateFields.length,
        duplicates: duplicateFields.map((field) => ({
          id: field.id,
          section_id: field.section_id,
          field_key: field.field_key,
          label: field.label
        }))
      });
    }

    return [...fieldsByIdentity.values()];
  }

  function buildRichTemplateSectionModels(sections = [], fields = []) {
    const sectionModels = [...sections]
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0) || String(left.name || "").localeCompare(String(right.name || "")))
      .map((section) => ({
        id: section.id,
        name: section.name || "Untitled Section",
        description: section.description || "",
        fields: []
      }));
    const modelsById = new Map(sectionModels.map((section) => [section.id, section]));
    const unsectionedFields = [];

    fields.forEach((field) => {
      const section = field.section_id ? modelsById.get(field.section_id) : null;
      if (section) {
        section.fields.push(field);
      } else {
        unsectionedFields.push(field);
      }
    });

    sectionModels.forEach((section) => {
      section.fields = sortTemplateFields(section.fields);
    });
    if (unsectionedFields.length) {
      sectionModels.push({
        id: "unsectioned",
        name: "Unsectioned",
        description: "",
        fields: sortTemplateFields(unsectionedFields)
      });
    }

    return sectionModels;
  }

  function renderRichTemplateSections(sections, fields, valuesByFieldId, mode = "view") {
    if (!sections.length && !fields.length) {
      return '<p class="details-empty">No template fields are available for this element type yet.</p>';
    }

    return buildRichTemplateSectionModels(sections, fields).map((section) => `
      <section class="rich-template-section">
        <div class="rich-template-section-header">
          <h3>${escapeHtml(section.name)}</h3>
          ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}
        </div>
        ${section.fields.length ? `
          <${mode === "view" ? "dl" : "div"} class="rich-template-fields">
            ${section.fields
              .map((field) => mode === "view"
                ? renderRichFieldValue(field, getFieldStoredValue(valuesByFieldId, field))
                : renderRichFieldControl(field, getFieldStoredValue(valuesByFieldId, field)))
              .join("")}
          </${mode === "view" ? "dl" : "div"}>
        ` : '<p class="details-empty">No fields in this section yet.</p>'}
      </section>
    `).join("");
  }

  function renderChroniclePreviewModules(data) {
    const modules = data?.modules || [];
    const sectionsById = new Map((data?.sections || []).map((section) => [section.id, section]));
    const valuesByFieldId = new Map((data?.values || []).map((value) => [value.template_field_id, value]));
    const fieldsBySectionId = (data?.fields || []).reduce((map, field) => {
      const key = field.section_id || "";
      const list = map.get(key) || [];
      list.push(field);
      map.set(key, sortTemplateFields(list));
      return map;
    }, new Map());

    if (!modules.length) {
      return '<p class="details-empty">No Chronicle modules assigned.</p>';
    }

    return modules.map((module) => {
      const sectionId = getChronicleModuleSectionId(module);
      const section = sectionsById.get(sectionId);
      const fields = fieldsBySectionId.get(sectionId) || [];
      return `
        <section class="rich-template-section chronicle-preview-module chronicle-wiki-section">
          <div class="rich-template-section-header">
            <h3>${escapeHtml(section?.name || module.title || "Untitled Module")}</h3>
            ${section?.description ? `<p>${escapeHtml(section.description)}</p>` : ""}
          </div>
          ${renderChronicleWikiFields(fields, valuesByFieldId)}
        </section>
      `;
    }).join("");
  }

  function renderCustomFields(customFields = [], mode = "edit") {
    if (mode === "view") {
      if (!customFields.length) {
        return '<p class="details-empty">No custom fields yet.</p>';
      }
      return `
        <dl class="rich-template-fields">
          ${customFields.map((field) => `
            <div class="rich-view-field is-textarea-field">
              <dt>${escapeHtml(field.name || "Untitled Field")}</dt>
              <dd class="${hasMeaningfulValue(field.value) ? "" : "is-empty"}">${escapeHtml(hasMeaningfulValue(field.value) ? field.value : "--")}</dd>
            </div>
          `).join("")}
        </dl>
      `;
    }

    const rows = customFields.length ? customFields : [{ id: "", name: "", value: "" }];
    return rows.map((field) => `
      <div class="custom-field-row" data-custom-field-row data-custom-field-id="${escapeHtml(field.id || "")}">
        <input type="text" name="custom-name" value="${escapeHtml(field.name || "")}" placeholder="Field name">
        <textarea name="custom-value" rows="3" placeholder="Value">${escapeHtml(field.value || "")}</textarea>
        <button class="secondary-action compact-action" type="button" data-remove-custom-field>Remove</button>
      </div>
    `).join("");
  }

  function setDetailsPaneMode(controls, mode) {
    const isEditMode = mode === "edit";
    if (controls.editButton) {
      controls.editButton.hidden = isEditMode;
    }
    if (controls.richButton) {
      controls.richButton.hidden = isEditMode;
    }
    if (controls.saveButton) {
      controls.saveButton.hidden = !isEditMode;
    }
    if (controls.cancelButton) {
      controls.cancelButton.hidden = !isEditMode;
    }
  }

  function renderDetailsPane(nodeId, currentNodes, currentEdges, openNodeDetails, mode) {
    const controls = getDetailsControls();
    if (!controls?.pane || !controls.content) {
      return;
    }
    clearDetailsPaneAiState(controls);

    const node = currentNodes.find((currentNode) => currentNode.id === nodeId);
    if (!node) {
      hideDetailsPane();
      return;
    }

    const meta = getNodeTypeMeta(node);
    const linkedNodes = getLinkedNodes(nodeId, currentNodes, currentEdges);
    const name = node.data?.name || "Untitled Node";
    const description = node.data?.description || "No description yet.";
    const rawDescription = node.data?.description || "";
    const images = node.data?.images || [];

    controls.pane.hidden = false;
    document.querySelector(".flow-page")?.style.setProperty("--details-pane-width", `${controls.pane.getBoundingClientRect().width}px`);
    setDetailsPaneMode(controls, mode);
    if (controls.kind) {
      controls.kind.textContent = meta.label;
    }
    if (controls.title) {
      controls.title.textContent = name;
    }
    if (controls.richButton) {
      controls.richButton.hidden = mode === "edit" || node.data?.kind !== "element";
    }

    if (mode === "edit") {
      const isElement = node.data?.kind === "element";
      controls.content.innerHTML = `
        <form class="details-edit-form" data-details-form>
          <label class="form-field">
            <span>Name</span>
            <input type="text" name="details-name" value="${escapeHtml(name)}" autocomplete="off">
          </label>
          <section class="details-section image-edit-section">
            <h3>Image</h3>
            ${renderImageGallery(images, nodeId)}
            <div class="image-actions">
              <button class="secondary-action image-action-button" type="button" data-generate-image>
                <ph-sparkle weight="bold" aria-hidden="true"></ph-sparkle>
                Generate
              </button>
              <div class="image-upload-row">
                <label class="secondary-action image-action-button" for="details-image-upload">
                  <ph-upload-simple weight="bold" aria-hidden="true"></ph-upload-simple>
                  Upload
                </label>
                <input id="details-image-upload" type="file" accept="image/*" data-image-upload hidden>
                <p class="form-status image-upload-status" data-image-upload-status role="status"></p>
              </div>
            </div>
          </section>
          <label class="form-field">
            <span>Description</span>
            <textarea name="details-description" rows="16" placeholder="Brief description...">${escapeHtml(rawDescription)}</textarea>
          </label>
          <label class="form-field">
            <span>Element Type</span>
            ${isElement ? createDetailsTypePickerMarkup(node.data?.elementType?.id || "") : `
              <button class="type-picker-trigger" type="button" disabled>
                <span class="type-picker-current">
                  <span class="type-picker-swatch" style="--type-color: ${escapeHtml(meta.color)}"></span>
                  <span class="type-picker-icon" aria-hidden="true" style="--type-color: ${escapeHtml(meta.color)}">
                    <ph-${escapeHtml(meta.icon)} weight="duotone"></ph-${escapeHtml(meta.icon)}>
                  </span>
                  <span>${escapeHtml(meta.label)}</span>
                </span>
              </button>
            `}
          </label>
          <p class="form-status" data-details-status role="status"></p>
        </form>
      `;

      setupDetailsTypePicker(controls.content);
      controls.content.querySelector("[data-generate-image]")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("centralis:generate-image", {
          detail: { nodeId, prompt: createImagePrompt(node) }
        }));
      });
      controls.content.querySelector("[data-image-upload]")?.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (file) {
          window.dispatchEvent(new CustomEvent("centralis:upload-image", {
            detail: { nodeId, file }
          }));
        }
      });
      controls.content.querySelector('[name="details-name"]')?.focus();
      setupImageGallery(controls.content);
      return;
    }

    controls.content.innerHTML = `
      <section class="details-section details-view-section">
        <h3 class="details-section-heading">Basics</h3>
        <dl class="details-fields">
          <div>
            <dt>Name</dt>
            <dd>${escapeHtml(name)}</dd>
          </div>
          <div>
            <dt>Element Type</dt>
            <dd>
              <span class="details-type-badge" style="--detail-color: ${escapeHtml(meta.color)}">
                <span class="details-type-icon" aria-hidden="true">
                  <ph-${escapeHtml(meta.icon)} weight="duotone"></ph-${escapeHtml(meta.icon)}>
                </span>
                ${escapeHtml(meta.label)}
              </span>
            </dd>
          </div>
        </dl>
      </section>
      ${renderDetailsSection("images", "Images", renderImageGallery(images, nodeId))}
      ${renderDetailsSection("description", "Description", renderMarkdownDescription(description))}
      ${renderDetailsSection("linked-nodes", "Linked Elements", `
        <div class="linked-node-list">
          ${renderLinkedNodeCards(linkedNodes)}
        </div>
      `)}
    `;

    controls.content.querySelectorAll("[data-linked-node-id]").forEach((button) => {
      button.addEventListener("click", () => openNodeDetails(button.dataset.linkedNodeId));
    });
    setupImageGallery(controls.content);
  }

  function setupDetailsPaneResize() {
    const controls = getDetailsControls();
    if (!controls?.pane || !controls.resizer) {
      return undefined;
    }

    function handlePointerMove(event) {
      const maxWidth = Math.min(760, window.innerWidth - 72);
      const nextWidth = Math.min(maxWidth, Math.max(320, window.innerWidth - event.clientX));
      controls.pane.style.width = `${nextWidth}px`;
      document.querySelector(".flow-page")?.style.setProperty("--details-pane-width", `${nextWidth}px`);
    }

    function handlePointerUp() {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("is-resizing-details");
    }

    function handlePointerDown(event) {
      event.preventDefault();
      document.body.classList.add("is-resizing-details");
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    }

    controls.resizer.addEventListener("pointerdown", handlePointerDown);
    return () => {
      controls.resizer.removeEventListener("pointerdown", handlePointerDown);
      handlePointerUp();
    };
  }

  async function saveNodePosition(_event, node) {
    if (!window.centralisSupabase || !node?.position || !node?.data?.recordId) {
      return;
    }

    const payload = {
      updated_at: new Date().toISOString()
    };

    let tableName = "universes";
    if (node.data.kind === "universe") {
      payload.canvas_position_x = Number(node.position.x);
      payload.canvas_position_y = Number(node.position.y);
    } else if (node.data.kind === "note") {
      tableName = "canvas_notes";
      payload.position_x = Number(node.position.x);
      payload.position_y = Number(node.position.y);
      payload.width = Number(node.style?.width || node.measured?.width || node.width || DEFAULT_NOTE_WIDTH);
      payload.height = Number(node.style?.height || node.measured?.height || node.height || DEFAULT_NOTE_HEIGHT);
    } else if (node.data.kind === "group") {
      tableName = "element_groups";
      if (node.parentId || node.data?.parentGroupId) {
        payload.parent_group_id = node.data.parentGroupId || toRecordId(node.parentId);
        payload.group_position_x = Number(node.position.x);
        payload.group_position_y = Number(node.position.y);
      } else {
        payload.parent_group_id = null;
        payload.group_position_x = null;
        payload.group_position_y = null;
        payload.position_x = Number(node.position.x);
        payload.position_y = Number(node.position.y);
      }
      if (node.style?.width && node.style?.height && !node.data?.collapsed) {
        payload.width = Number(node.style.width);
        payload.height = Number(node.style.height);
      }
    } else {
      tableName = "elements";
      if (node.data.groupId) {
        payload.group_position_x = Number(node.position.x);
        payload.group_position_y = Number(node.position.y);
      } else {
        payload.position_x = Number(node.position.x);
        payload.position_y = Number(node.position.y);
      }
    }

    const { error } = await window.centralisSupabase
      .from(tableName)
      .update(payload)
      .eq("id", node.data.recordId);

    if (error) {
      console.error("Could not save node position:", error);
    }
  }

  function estimateNodeSize(node, format = DEFAULT_UNIVERSE_FORMAT) {
    const hasTopImage = format.nodeImagePlacement === "top" && Boolean(node.data?.images?.length);
    if (node.data?.kind === "note") {
      return {
        width: Number(node.measured?.width || node.width || node.style?.width || DEFAULT_NOTE_WIDTH),
        height: Number(node.measured?.height || node.height || node.style?.height || DEFAULT_NOTE_HEIGHT)
      };
    }
    if (node.data?.kind === "group" && node.style?.width && node.style?.height) {
      return {
        width: Number(node.style.width),
        height: Number(node.style.height)
      };
    }
    const measuredWidth = node.measured?.width || node.width || node.style?.width;
    const measuredHeight = node.measured?.height || node.height || node.style?.height;
    const width = Number(measuredWidth || (node.data?.kind === "universe" ? 280 : node.data?.kind === "group" ? 360 : 236));

    const descriptionLength = String(node.data?.description || "").length;
    const blurbRows = descriptionLength > 92 ? 3 : descriptionLength > 44 ? 2 : 1;
    const baseHeight = node.data?.kind === "universe" ? 106 : 96;
    const imageHeight = hasTopImage ? 92 : 0;
    const estimatedHeight = baseHeight + imageHeight + blurbRows * 18 + Number(format.nodeLayoutGap || 12);
    if (measuredHeight) {
      return { width, height: Math.max(Number(measuredHeight), estimatedHeight) };
    }

    return {
      width,
      height: estimatedHeight
    };
  }

  function getAbsoluteNodePosition(node, nodesById) {
    const position = {
      x: Number(node?.position?.x || 0),
      y: Number(node?.position?.y || 0)
    };
    let parent = node?.parentId ? nodesById.get(node.parentId) : null;
    while (parent) {
      position.x += Number(parent.position?.x || 0);
      position.y += Number(parent.position?.y || 0);
      parent = parent.parentId ? nodesById.get(parent.parentId) : null;
    }
    return position;
  }

  function getLayoutNodes(currentNodes) {
    return currentNodes.filter((node) => node.data?.kind !== "note" && !node.parentId);
  }

  function getLayoutOwnerId(nodeId, nodesById, layoutNodeIds) {
    const node = nodesById.get(nodeId);
    if (!node) {
      return null;
    }
    if (layoutNodeIds.has(node.id)) {
      return node.id;
    }
    let parentId = node.parentId || "";
    while (parentId) {
      if (layoutNodeIds.has(parentId)) {
        return parentId;
      }
      parentId = nodesById.get(parentId)?.parentId || "";
    }
    return null;
  }

  function getLayoutEdges(currentNodes, currentEdges) {
    const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
    const layoutNodeIds = new Set(getLayoutNodes(currentNodes).map((node) => node.id));
    const seenEdges = new Set();
    const layoutEdges = [];

    currentEdges.forEach((edge) => {
      if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
        return;
      }

      const source = getLayoutOwnerId(edge.source, nodesById, layoutNodeIds);
      const target = getLayoutOwnerId(edge.target, nodesById, layoutNodeIds);
      if (!source || !target || source === target) {
        return;
      }

      const key = `${source}->${target}`;
      if (seenEdges.has(key)) {
        return;
      }
      seenEdges.add(key);
      layoutEdges.push({
        id: `layout:${edge.id}:${source}:${target}`,
        source,
        target
      });
    });

    return layoutEdges;
  }

  function getLayoutPosition(node, nodesById) {
    return getAbsoluteNodePosition(node, nodesById);
  }

  function getGroupLayoutBounds(groupNode, childNodes, positionsById, nodesById, format = DEFAULT_UNIVERSE_FORMAT) {
    const padding = 44;
    const headerOffset = 28;
    if (!childNodes.length) {
      return {
        x: Number(groupNode.position?.x || 0),
        y: Number(groupNode.position?.y || 0),
        width: Number(groupNode.style?.width || 360),
        height: Number(groupNode.style?.height || 260)
      };
    }

    const childRects = childNodes.map((node) => {
      const position = positionsById.get(node.id) || getAbsoluteNodePosition(node, nodesById);
      const size = estimateNodeSize(node, format);
      return {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height
      };
    });
    const minX = Math.min(...childRects.map((rect) => rect.x));
    const minY = Math.min(...childRects.map((rect) => rect.y));
    const maxX = Math.max(...childRects.map((rect) => rect.x + rect.width));
    const maxY = Math.max(...childRects.map((rect) => rect.y + rect.height));

    return {
      x: Math.round(minX - padding),
      y: Math.round(minY - padding - headerOffset),
      width: Math.max(280, Math.round(maxX - minX + padding * 2)),
      height: Math.max(190, Math.round(maxY - minY + padding * 2 + headerOffset))
    };
  }

  function getTopLevelLayoutRect(node, format = DEFAULT_UNIVERSE_FORMAT) {
    const size = estimateNodeSize(node, format);
    return {
      id: node.id,
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0),
      width: size.width,
      height: size.height
    };
  }

  function rectsOverlap(left, right, margin = 0) {
    return (
      left.x < right.x + right.width + margin &&
      left.x + left.width + margin > right.x &&
      left.y < right.y + right.height + margin &&
      left.y + left.height + margin > right.y
    );
  }

  function resolveTopLevelLayoutCollisions(nodesToResolve, format = DEFAULT_UNIVERSE_FORMAT) {
    const spacingUnit = Number(format.nodeLayoutGap || 12);
    const margin = Math.max(36, spacingUnit * 3);
    const nextNodes = nodesToResolve.map((node) => ({ ...node }));

    for (let pass = 0; pass < 4; pass += 1) {
      const topLevelRects = nextNodes
        .filter((node) => !node.parentId && node.data?.kind !== "note")
        .map((node) => getTopLevelLayoutRect(node, format))
        .sort((left, right) => left.y - right.y || left.x - right.x);
      let movedAny = false;

      for (let index = 0; index < topLevelRects.length; index += 1) {
        const current = topLevelRects[index];
        for (let compareIndex = 0; compareIndex < index; compareIndex += 1) {
          const previous = topLevelRects[compareIndex];
          if (!rectsOverlap(previous, current, margin)) {
            continue;
          }

          const shiftY = Math.ceil(previous.y + previous.height + margin - current.y);
          if (shiftY <= 0) {
            continue;
          }

          const nodeIndex = nextNodes.findIndex((node) => node.id === current.id);
          if (nodeIndex === -1) {
            continue;
          }
          nextNodes[nodeIndex] = {
            ...nextNodes[nodeIndex],
            position: {
              x: Number(nextNodes[nodeIndex].position?.x || 0),
              y: Number(nextNodes[nodeIndex].position?.y || 0) + shiftY
            }
          };
          current.y += shiftY;
          movedAny = true;
        }
      }

      if (!movedAny) {
        break;
      }
    }

    return nextNodes;
  }

  function nudgeNotesAwayFromLayoutNodes(nodesToResolve, format = DEFAULT_UNIVERSE_FORMAT) {
    const margin = Math.max(28, Number(format.nodeLayoutGap || 12) * 2);
    const nextNodes = nodesToResolve.map((node) => ({ ...node }));
    const layoutRects = nextNodes
      .filter((node) => !node.parentId && node.data?.kind !== "note")
      .map((node) => getTopLevelLayoutRect(node, format));

    nextNodes.forEach((node, index) => {
      if (node.data?.kind !== "note") {
        return;
      }
      const size = estimateNodeSize(node, format);
      let rect = {
        id: node.id,
        x: Number(node.position?.x || 0),
        y: Number(node.position?.y || 0),
        width: size.width,
        height: size.height
      };
      for (let pass = 0; pass < 6; pass += 1) {
        const overlap = layoutRects.find((layoutRect) => rectsOverlap(layoutRect, rect, margin));
        if (!overlap) {
          break;
        }
        rect = {
          ...rect,
          y: Math.round(overlap.y + overlap.height + margin)
        };
      }
      if (rect.y !== Number(node.position?.y || 0)) {
        nextNodes[index] = {
          ...node,
          position: {
            x: Number(node.position?.x || 0),
            y: rect.y
          }
        };
      }
    });

    return nextNodes;
  }

  function applyLayoutPositions(currentNodes, positionsById, format = DEFAULT_UNIVERSE_FORMAT) {
    const nextNodes = currentNodes.map((node) => {
      if (node.parentId) {
        return node;
      }

      return {
        ...node,
        position: positionsById.get(node.id) || node.position
      };
    });

    return nudgeNotesAwayFromLayoutNodes(resolveTopLevelLayoutCollisions(nextNodes, format), format);
  }

  function createColumnAutoLayout(currentNodes, currentEdges, format = DEFAULT_UNIVERSE_FORMAT) {
    const layoutNodes = getLayoutNodes(currentNodes);
    const layoutEdges = getLayoutEdges(currentNodes, currentEdges);
    const nodesById = new Map(layoutNodes.map((node) => [node.id, node]));
    const allNodesById = new Map(currentNodes.map((node) => [node.id, node]));
    const childrenById = new Map(layoutNodes.map((node) => [node.id, []]));
    const indegreeById = new Map(layoutNodes.map((node) => [node.id, 0]));

    layoutEdges.forEach((edge) => {
      if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
        return;
      }
      childrenById.get(edge.source).push(edge.target);
      indegreeById.set(edge.target, (indegreeById.get(edge.target) || 0) + 1);
    });

    childrenById.forEach((children) => {
      children.sort((leftId, rightId) => {
        const left = nodesById.get(leftId)?.position?.y || 0;
        const right = nodesById.get(rightId)?.position?.y || 0;
        return left - right;
      });
    });

    const universeRoot = layoutNodes.find((node) => node.data?.kind === "universe");
    const roots = [
      universeRoot,
      ...layoutNodes.filter((node) => node.id !== universeRoot?.id && !indegreeById.get(node.id))
    ].filter(Boolean);
    const levelsById = new Map();

    function visit(nodeId, level, trail = new Set()) {
      if (trail.has(nodeId)) {
        return;
      }
      const existingLevel = levelsById.get(nodeId);
      if (existingLevel === undefined || level > existingLevel) {
        levelsById.set(nodeId, level);
      }
      const nextTrail = new Set(trail);
      nextTrail.add(nodeId);
      (childrenById.get(nodeId) || []).forEach((childId) => visit(childId, level + 1, nextTrail));
    }

    roots.forEach((root) => visit(root.id, 0));
    layoutNodes.forEach((node) => {
      if (!levelsById.has(node.id)) {
        levelsById.set(node.id, 0);
      }
    });

    const minX = Math.min(...layoutNodes.map((node) => Number(getLayoutPosition(node, allNodesById).x || 0)));
    const minY = Math.min(...layoutNodes.map((node) => Number(getLayoutPosition(node, allNodesById).y || 0)));
    const spacingUnit = Number(format.nodeLayoutGap || 12);
    const columnGap = Math.max(330, 286 + spacingUnit * 7);
    const rowGap = Math.max(58, 42 + spacingUnit * 3);
    const groups = new Map();

    layoutNodes.forEach((node) => {
      const level = levelsById.get(node.id) || 0;
      if (!groups.has(level)) {
        groups.set(level, []);
      }
      groups.get(level).push(node);
    });

    const positionsById = new Map();
    [...groups.entries()]
      .sort(([leftLevel], [rightLevel]) => leftLevel - rightLevel)
      .forEach(([level, levelNodes]) => {
        const sortedNodes = [...levelNodes].sort((left, right) => {
          if (left.data?.kind === "universe") return -1;
          if (right.data?.kind === "universe") return 1;
          return Number(getLayoutPosition(left, allNodesById).y || 0) - Number(getLayoutPosition(right, allNodesById).y || 0);
        });
        let yCursor = minY;
        sortedNodes.forEach((node) => {
          const size = estimateNodeSize(node, format);
          positionsById.set(node.id, {
            x: Math.round((minX + level * columnGap) / 12) * 12,
            y: Math.round(yCursor / 12) * 12
          });
          yCursor += size.height + rowGap;
        });
      });

    return applyLayoutPositions(currentNodes, positionsById, format);
  }

  async function createAutoLayout(currentNodes, currentEdges, format = DEFAULT_UNIVERSE_FORMAT) {
    const Elk = window.ELK || window.ElkConstructor || window.elkjs?.ELK;
    if (!Elk) {
      return createColumnAutoLayout(currentNodes, currentEdges, format);
    }

    const layoutNodes = getLayoutNodes(currentNodes);
    const layoutEdges = getLayoutEdges(currentNodes, currentEdges);
    const allNodesById = new Map(currentNodes.map((node) => [node.id, node]));
    const minX = Math.min(...layoutNodes.map((node) => Number(getLayoutPosition(node, allNodesById).x || 0)));
    const minY = Math.min(...layoutNodes.map((node) => Number(getLayoutPosition(node, allNodesById).y || 0)));
    const spacingUnit = Number(format.nodeLayoutGap || 12);
    const nodeSizes = new Map(layoutNodes.map((node) => [node.id, estimateNodeSize(node, format)]));
    const graph = {
      id: "centralis-universe-layout",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": String(Math.max(48, spacingUnit * 5)),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.max(125, spacingUnit * 10)),
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN"
      },
      children: layoutNodes.map((node) => {
        const size = nodeSizes.get(node.id);
        return {
          id: node.id,
          width: size.width,
          height: size.height
        };
      }),
      edges: layoutEdges
        .filter((edge) => nodeSizes.has(edge.source) && nodeSizes.has(edge.target))
        .map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target]
        }))
    };

    try {
      const layout = await new Elk().layout(graph);
      const layoutChildren = layout.children || [];
      const layoutMinX = layoutChildren.length ? Math.min(...layoutChildren.map((child) => Number(child.x || 0))) : 0;
      const layoutMinY = layoutChildren.length ? Math.min(...layoutChildren.map((child) => Number(child.y || 0))) : 0;
      const positionsById = new Map(layoutChildren.map((child) => [
        child.id,
        {
          x: Math.round((minX + Number(child.x || 0) - layoutMinX) / 12) * 12,
          y: Math.round((minY + Number(child.y || 0) - layoutMinY) / 12) * 12
        }
      ]));

      return applyLayoutPositions(currentNodes, positionsById, format);
    } catch (error) {
      console.error("ELK auto-layout failed, using fallback layout:", error);
      return createColumnAutoLayout(currentNodes, currentEdges, format);
    }
  }

  async function saveNodePositions(nodesToSave) {
    await Promise.all(nodesToSave.map((node) => saveNodePosition(null, node)));
  }

  async function saveGroupSizes(groupsToSave) {
    if (!window.centralisSupabase) {
      return;
    }
    await Promise.all(groupsToSave.map((node) => {
      const width = Number(node.measured?.width || node.width || node.style?.width);
      const height = Number(node.measured?.height || node.height || node.style?.height);
      if (!node.data?.recordId || !width || !height) {
        return Promise.resolve();
      }
      return window.centralisSupabase
        .from("element_groups")
        .update({
          width,
          height,
          updated_at: new Date().toISOString()
        })
        .eq("id", node.data.recordId);
    }));
  }

  function throwFirstSupabaseError(responses) {
    const failedResponse = responses.find((response) => response?.error);
    if (failedResponse?.error) {
      throw failedResponse.error;
    }
  }

  function getElementTypeById(typeId) {
    return elementTypes.find((type) => type.id === typeId) || null;
  }

  async function fetchElementTypes() {
    if (!window.centralisSupabase || !universe?.user_id) {
      return elementTypes;
    }

    const { data, error } = await window.centralisSupabase
      .from("element_types")
      .select("id,name,icon,color")
      .eq("user_id", universe.user_id)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    elementTypes = data || [];
    return elementTypes;
  }

  async function fetchTemplatesForType(elementTypeId) {
    if (!window.centralisSupabase || !elementTypeId) {
      return [];
    }

    const { data, error } = await window.centralisSupabase
      .from("element_type_templates")
      .select("*")
      .eq("element_type_id", elementTypeId)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function persistElementTemplateChoice(node, templateId) {
    if (!window.centralisSupabase || !node?.data?.recordId) {
      return;
    }

    const { error } = await window.centralisSupabase
      .from("elements")
      .update({ rich_template_id: templateId || null, updated_at: new Date().toISOString() })
      .eq("id", node.data.recordId);

    if (error) {
      throw error;
    }

    node.data.richTemplateId = templateId || null;
  }

  function chooseTemplateForNode(node, templates) {
    const modal = document.getElementById("template-choice-modal");
    const list = document.querySelector("[data-template-choice-list]");
    const subtitle = document.querySelector("[data-template-choice-subtitle]");
    const status = document.querySelector("[data-template-choice-status]");
    const cancelButton = document.querySelector("[data-template-choice-cancel]");

    if (!modal || !list) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      let settled = false;
      function cleanup(result) {
        if (settled) return;
        settled = true;
        modal.hidden = true;
        list.removeEventListener("click", handleChoice);
        cancelButton?.removeEventListener("click", handleCancel);
        document.removeEventListener("keydown", handleEscape);
        resolve(result);
      }

      function handleChoice(event) {
        const choice = event.target.closest("[data-template-choice-id]");
        if (!choice) return;
        const template = templates.find((item) => item.id === choice.dataset.templateChoiceId) || null;
        cleanup(template);
      }

      function handleCancel() {
        cleanup(null);
      }

      function handleEscape(event) {
        if (event.key === "Escape") {
          cleanup(null);
        }
      }

      if (subtitle) {
        subtitle.textContent = `Choose the Rich Details template to use for ${node.data?.name || "this element"}.`;
      }
      if (status) {
        status.textContent = "";
        status.classList.remove("is-error", "is-success");
      }
      list.innerHTML = templates.map((template) => `
        <button class="template-choice-card" type="button" data-template-choice-id="${escapeHtml(template.id)}">
          <strong>${escapeHtml(template.name || "Untitled Template")}</strong>
          ${template.description ? `<span>${escapeHtml(template.description)}</span>` : ""}
        </button>
      `).join("");
      modal.hidden = false;
      list.addEventListener("click", handleChoice);
      cancelButton?.addEventListener("click", handleCancel);
      document.addEventListener("keydown", handleEscape);
    });
  }

  function hasMeaningfulValue(value) {
    return String(value ?? "").trim().length > 0;
  }

  async function elementHasRichDetails(elementId) {
    if (!window.centralisSupabase || !elementId) {
      return false;
    }

    const [valueResponse, customResponse, elementResponse] = await Promise.all([
      window.centralisSupabase
        .from("element_template_field_values")
        .select("id,value")
        .eq("element_id", elementId),
      window.centralisSupabase
        .from("element_custom_fields")
        .select("id,name,value")
        .eq("element_id", elementId),
      window.centralisSupabase
        .from("elements")
        .select("rich_template_id")
        .eq("id", elementId)
        .maybeSingle()
    ]);

    if (valueResponse.error) {
      console.error("Could not check rich detail values:", valueResponse.error);
    }
    if (customResponse.error) {
      console.error("Could not check custom fields:", customResponse.error);
    }
    if (elementResponse.error) {
      console.error("Could not check selected rich template:", elementResponse.error);
    }

    return Boolean(elementResponse.data?.rich_template_id
      || (valueResponse.data || []).some((row) => hasMeaningfulValue(row.value))
      || (customResponse.data || []).some((row) => hasMeaningfulValue(row.name) || hasMeaningfulValue(row.value)));
  }

  async function elementHasChronicleModules(elementId) {
    if (!window.centralisSupabase || !elementId) {
      return false;
    }

    const response = await window.centralisSupabase
      .from("chronicle_modules")
      .select("id")
      .eq("element_id", elementId)
      .eq("module_type", CHRONICLE_TEMPLATE_SECTION_MODULE_TYPE)
      .limit(1);

    if (response.error) {
      console.error("Could not check Chronicle modules:", response.error);
      return false;
    }

    return Boolean((response.data || []).length);
  }

  function getChronicleModuleSectionId(module) {
    return module?.data?.section_id || "";
  }

  function getChronicleModuleTemplateId(module) {
    return module?.data?.template_id || "";
  }

  async function fetchChroniclePreviewData(node) {
    if (!window.centralisSupabase || !node?.data?.recordId) {
      return { modules: [], sections: [], fields: [], values: [] };
    }

    const [moduleResponse, valueResponse] = await Promise.all([
      window.centralisSupabase
        .from("chronicle_modules")
        .select("*")
        .eq("element_id", node.data.recordId)
        .eq("module_type", CHRONICLE_TEMPLATE_SECTION_MODULE_TYPE)
        .order("sort_order", { ascending: true }),
      window.centralisSupabase
        .from("element_template_field_values")
        .select("*")
        .eq("element_id", node.data.recordId)
    ]);

    if (moduleResponse.error) {
      throw moduleResponse.error;
    }
    if (valueResponse.error) {
      throw valueResponse.error;
    }

    const modules = (moduleResponse.data || [])
      .filter((module) => getChronicleModuleSectionId(module))
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0) || String(left.title || "").localeCompare(String(right.title || "")));
    const sectionIds = [...new Set(modules.map(getChronicleModuleSectionId).filter(Boolean))];
    const templateIds = [...new Set(modules.map(getChronicleModuleTemplateId).filter(Boolean))];

    if (!sectionIds.length || !templateIds.length) {
      return { modules, sections: [], fields: [], values: valueResponse.data || [] };
    }

    const [sectionResponse, fieldResponse] = await Promise.all([
      window.centralisSupabase
        .from("element_template_sections")
        .select("*")
        .in("id", sectionIds),
      window.centralisSupabase
        .from("element_type_template_fields")
        .select("*")
        .in("template_id", templateIds)
        .in("section_id", sectionIds)
        .order("sort_order", { ascending: true })
    ]);

    if (sectionResponse.error) {
      throw sectionResponse.error;
    }
    if (fieldResponse.error) {
      throw fieldResponse.error;
    }

    const visibleSectionIds = new Set((sectionResponse.data || [])
      .filter((section) => !section.is_hidden)
      .map((section) => section.id));
    const fields = dedupeTemplateFields(fieldResponse.data || [])
      .filter((field) => !field.is_hidden && visibleSectionIds.has(field.section_id));

    return {
      modules: modules.filter((module) => visibleSectionIds.has(getChronicleModuleSectionId(module))),
      sections: sectionResponse.data || [],
      fields,
      values: valueResponse.data || []
    };
  }

  async function fetchRichDetailsData(node) {
    if (!window.centralisSupabase || !node?.data?.recordId) {
      return { template: null, sections: [], fields: [], values: [], customFields: [] };
    }

    const [valueResponse, customResponse] = await Promise.all([
      window.centralisSupabase
        .from("element_template_field_values")
        .select("*")
        .eq("element_id", node.data.recordId),
      window.centralisSupabase
        .from("element_custom_fields")
        .select("*")
        .eq("element_id", node.data.recordId)
        .order("sort_order", { ascending: true })
    ]);

    if (valueResponse.error) {
      throw valueResponse.error;
    }
    if (customResponse.error) {
      throw customResponse.error;
    }

    let template = null;
    let templates = [];
    let sections = [];
    let fields = [];
    const elementTypeId = node.data?.elementType?.id;
    if (elementTypeId) {
      templates = await fetchTemplatesForType(elementTypeId);
      const selectedTemplateId = node.data?.richTemplateId;
      template = selectedTemplateId
        ? templates.find((item) => item.id === selectedTemplateId) || null
        : null;

      if (!template && templates.length === 1) {
        template = templates[0];
        await persistElementTemplateChoice(node, template.id);
      } else if (!template && templates.length > 1) {
        template = await chooseTemplateForNode(node, templates);
        if (template?.id) {
          await persistElementTemplateChoice(node, template.id);
        }
      }

      if (template?.id) {
        const [sectionResponse, fieldResponse] = await Promise.all([
          window.centralisSupabase
            .from("element_template_sections")
            .select("*")
            .eq("template_id", template.id)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          window.centralisSupabase
            .from("element_type_template_fields")
            .select("*")
            .eq("template_id", template.id)
            .order("sort_order", { ascending: true })
        ]);

        if (sectionResponse.error) {
          throw sectionResponse.error;
        }
        if (fieldResponse.error) {
          throw fieldResponse.error;
        }
        const hiddenSectionIds = new Set((sectionResponse.data || [])
          .filter((section) => section.is_hidden)
          .map((section) => section.id));
        sections = (sectionResponse.data || []).filter((section) => !section.is_hidden);
        fields = dedupeTemplateFields(fieldResponse.data || [], template.id)
          .filter((field) => !field.is_hidden && !hiddenSectionIds.has(field.section_id));
      }
    }

    return {
      template,
      templates,
      sections,
      fields,
      values: valueResponse.data || [],
      customFields: customResponse.data || []
    };
  }

  let phosphorIconNamesPromise = null;
  async function getPhosphorIconNames() {
    if (!phosphorIconNamesPromise) {
      phosphorIconNamesPromise = (async () => {
        const names = new Set(FALLBACK_PHOSPHOR_ICONS);

        try {
          const catalogModule = await import("https://esm.sh/@phosphor-icons/core@2.1.1");
          const catalogItems = collectPhosphorCatalogItems(catalogModule.icons || catalogModule.default || catalogModule);
          if (catalogItems.length) {
            catalogItems.forEach((item) => {
              const cleanName = sanitizeIconName(item.name);
              names.add(cleanName);
              addIconSearchTerms(cleanName, item.terms);
            });
            return [...names];
          }
        } catch (error) {
          console.warn("Could not load Phosphor icon metadata catalog.", error);
        }

        try {
          const response = await fetch("https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css");
          if (!response.ok) {
            throw new Error("Could not load Phosphor icon stylesheet.");
          }
          const css = await response.text();
          for (const match of css.matchAll(/\.ph-([a-z0-9-]+):before/g)) {
            if (match[1] && !match[1].includes("regular")) {
              names.add(match[1]);
            }
          }
        } catch (error) {
          console.warn("Could not load Phosphor icon stylesheet.", error);
        }

        return [...names];
      })()
        .then((names) => names
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b)))
        .catch(() => FALLBACK_PHOSPHOR_ICONS);
    }

    return phosphorIconNamesPromise;
  }

  function iconMatchesSearch(icon, query) {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      return true;
    }

    const iconName = String(icon || "").toLowerCase();
    const searchableAliases = phosphorIconSearchTerms.get(iconName) || iconName.replaceAll("-", " ");

    return searchableAliases.includes(cleanQuery);
  }

  function getElementTypePicker() {
    const picker = document.querySelector("[data-element-type-picker]");
    if (!picker) {
      return null;
    }

    return {
      picker,
      input: picker.querySelector("[data-element-type-input]"),
      trigger: picker.querySelector("[data-element-type-trigger]"),
      list: picker.querySelector("[data-element-type-list]"),
      label: picker.querySelector("[data-element-type-label]"),
      swatch: picker.querySelector("[data-element-type-swatch]"),
      icon: picker.querySelector("[data-element-type-icon]")
    };
  }

  function renderTypeIcon(iconTarget, iconName) {
    if (!iconTarget) {
      return;
    }

    iconTarget.innerHTML = "";
    iconTarget.appendChild(document.createElement(`ph-${sanitizeIconName(iconName)}`));
    iconTarget.firstElementChild?.setAttribute("weight", "duotone");
    iconTarget.firstElementChild?.setAttribute("aria-hidden", "true");
  }

  function setElementTypePickerValue(typeId) {
    const controls = getElementTypePicker();
    if (!controls?.input || !controls.trigger) {
      return;
    }

    const type = getElementTypeById(typeId);
    const color = sanitizeColor(type?.color);

    controls.input.value = type?.id || "";
    controls.trigger.setAttribute("aria-expanded", "false");
    if (controls.list) {
      controls.list.hidden = true;
      controls.list.querySelectorAll("[data-type-option]").forEach((option) => {
        option.setAttribute("aria-selected", option.dataset.value === controls.input.value ? "true" : "false");
      });
    }

    if (controls.label) {
      controls.label.textContent = type?.name || "No type";
    }

    if (controls.swatch) {
      controls.swatch.style.setProperty("--type-color", color);
    }

    if (controls.icon) {
      controls.icon.style.setProperty("--type-color", color);
    }

    renderTypeIcon(controls.icon, type?.icon || "circle");
  }

  function closeElementTypePicker() {
    const controls = getElementTypePicker();
    if (!controls?.list || !controls.trigger) {
      return;
    }

    controls.list.hidden = true;
    controls.trigger.setAttribute("aria-expanded", "false");
  }

  function populateElementTypeSelect() {
    const controls = getElementTypePicker();
    if (!controls?.list || !controls.trigger) {
      return null;
    }

    controls.list.innerHTML = "";

    const options = [
      { id: "", name: "No type", icon: "circle", color: "#64748b" },
      ...elementTypes
    ];

    options.forEach((type) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "type-picker-option";
      option.dataset.typeOption = "true";
      option.dataset.value = type.id || "";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", type.id ? "false" : "true");

      const swatch = document.createElement("span");
      swatch.className = "type-picker-swatch";
      swatch.style.setProperty("--type-color", sanitizeColor(type.color));

      const icon = document.createElement("span");
      icon.className = "type-picker-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.style.setProperty("--type-color", sanitizeColor(type.color));
      renderTypeIcon(icon, type.icon);

      const label = document.createElement("span");
      label.textContent = type.name;

      option.append(swatch, icon, label);
      option.addEventListener("click", () => setElementTypePickerValue(type.id || ""));
      controls.list.appendChild(option);
    });

    let typeaheadBuffer = "";
    let typeaheadTimer = null;

    const getSortedTypeaheadTypes = () => elementTypes
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    const selectTypeaheadMatch = (queryText = typeaheadBuffer, { cycle = false } = {}) => {
      const query = String(queryText || "").trim().toLowerCase();
      if (!query) return false;
      const matches = getSortedTypeaheadTypes()
        .filter((type) => String(type.name || "").toLowerCase().startsWith(query));
      if (!matches.length) return false;
      let matchingType = matches[0];
      if (cycle && matches.length > 1) {
        const currentIndex = matches.findIndex((type) => String(type.id || "") === String(controls.input?.value || ""));
        matchingType = matches[(currentIndex + 1) % matches.length];
      }
      if (!matchingType) return false;
      setElementTypePickerValue(matchingType.id || "");
      const selectedOption = [...(controls.list?.querySelectorAll("[data-type-option]") || [])]
        .find((option) => option.dataset.value === String(matchingType.id || ""));
      selectedOption?.scrollIntoView({ block: "nearest" });
      return true;
    };

    const handleTriggerClick = (event) => {
      event.stopPropagation();
      const willOpen = controls.list.hidden;
      controls.list.hidden = !willOpen;
      controls.trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    };

    const handleOutsidePointerDown = (event) => {
      if (!controls.picker.contains(event.target)) {
        closeElementTypePicker();
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeElementTypePicker();
      }
    };

    const handleTypeaheadKeyDown = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.key.length !== 1) {
        return;
      }
      const targetTag = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(targetTag)) {
        return;
      }
      const addModal = document.getElementById("add-element-modal");
      const pickerIsActive = controls.picker.contains(document.activeElement) || !controls.list.hidden;
      if (addModal?.hidden || !pickerIsActive) {
        return;
      }
      event.preventDefault();
      const key = event.key.toLowerCase();
      typeaheadBuffer += key;
      const isRepeatedSingleCharacter = typeaheadBuffer.length > 1
        && [...typeaheadBuffer].every((character) => character === key);
      if (isRepeatedSingleCharacter) {
        typeaheadBuffer = key;
        selectTypeaheadMatch(key, { cycle: true });
      } else if (!selectTypeaheadMatch(typeaheadBuffer)) {
        typeaheadBuffer = key;
        selectTypeaheadMatch(key);
      }
      window.clearTimeout(typeaheadTimer);
      typeaheadTimer = window.setTimeout(() => {
        typeaheadBuffer = "";
      }, 900);
    };

    controls.trigger.addEventListener("click", handleTriggerClick);
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleTypeaheadKeyDown);
    document.addEventListener("keydown", handleEscape);
    setElementTypePickerValue("");

    return () => {
      window.clearTimeout(typeaheadTimer);
      controls.trigger.removeEventListener("click", handleTriggerClick);
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleTypeaheadKeyDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }

  function UniverseFlow() {
    const [nodes, setNodes] = React.useState(initialNodes);
    const [edges, setEdges] = React.useState(initialEdges);
    const [universeFormat, setUniverseFormat] = React.useState(initialUniverseFormat);
    const [layers, setLayers] = React.useState(sortLayers(overlayLayers));
    const [layerEntries, setLayerEntries] = React.useState(sortLayers(overlayLayerEntries));
    const [layerAssignments, setLayerAssignments] = React.useState(overlayLayerAssignments);
    const [activeLayerId, setActiveLayerId] = React.useState(() => {
      const activeLayer = sortLayers(overlayLayers).find((layer) => layer.is_active);
      return activeLayer?.id || "";
    });
    const [layerModeActive, setLayerModeActive] = React.useState(false);
    const [layersManagerLayerId, setLayersManagerLayerId] = React.useState("");
    const [elementTypeVersion, setElementTypeVersion] = React.useState(0);
    const [pendingLink, setPendingLink] = React.useState(null);
    const [pendingDeleteElement, setPendingDeleteElement] = React.useState(null);
    const [canUndo, setCanUndo] = React.useState(false);
    const [canRedo, setCanRedo] = React.useState(false);
    const [detailsNodeId, setDetailsNodeId] = React.useState(null);
    const [detailsMode, setDetailsMode] = React.useState("view");
    const [aiChatOpen, setAiChatOpen] = React.useState(false);
    const [aiChatPopoutOpen, setAiChatPopoutOpen] = React.useState(false);
    const [aiChatState, setAiChatState] = React.useState({
      loading: false,
      syncing: false,
      sending: false,
      source: null,
      chat: null,
      messages: [],
      error: "",
      statusMessage: ""
    });
    const [pendingImageGeneration, setPendingImageGeneration] = React.useState(null);
    const [richDetailsNodeId, setRichDetailsNodeId] = React.useState(null);
    const [richDetailsData, setRichDetailsData] = React.useState(null);
    const [richDetailsMode, setRichDetailsMode] = React.useState("view");
    const [contextMenu, setContextMenu] = React.useState(null);
    const [canvasContextMenu, setCanvasContextMenu] = React.useState(null);
    const [pendingNoteStyle, setPendingNoteStyle] = React.useState(null);
    const [dropTargetGroupId, setDropTargetGroupId] = React.useState("");
    const [historyVersion, setHistoryVersion] = React.useState(0);
    const reactFlowWrapper = React.useRef(null);
    const reactFlowInstance = React.useRef(null);
    const nodesRef = React.useRef(nodes);
    const edgesRef = React.useRef(edges);
    const undoStackRef = React.useRef([]);
    const redoStackRef = React.useRef([]);
    const dragHistoryNodeIdRef = React.useRef("");
    const transferStatusTimerRef = React.useRef(0);
    const universeFormatRef = React.useRef(universeFormat);
    const layersRef = React.useRef(layers);
    const layerEntriesRef = React.useRef(layerEntries);
    const layerAssignmentsRef = React.useRef(layerAssignments);
    const activeLayerIdRef = React.useRef(activeLayerId);
    const dropTargetGroupIdRef = React.useRef("");
    const noteSaveTimersRef = React.useRef(new Map());
    const nodeTypes = React.useMemo(() => ({ universe: UniverseNode, element: ElementNode, groupNode: GroupNode, note: NoteNode }), []);
    const activeLayer = React.useMemo(() => layers.find((layer) => layer.id === activeLayerId) || null, [layers, activeLayerId]);
    const activeLayerEntries = React.useMemo(() => getEntriesForLayer(activeLayerId, layerEntries), [activeLayerId, layerEntries]);
    const visibleLayerId = layerModeActive ? activeLayerId : "";
    const fitCanvasToRenderedNodes = React.useCallback((options = {}) => {
      const instance = reactFlowInstance.current;
      const wrapper = reactFlowWrapper.current;
      const flowNodes = getVisibleNodesForGroups(nodesRef.current).filter((node) => !node.hidden);
      if (!instance || !wrapper || !flowNodes.length) {
        return;
      }

      const viewport = typeof instance.getViewport === "function" ? instance.getViewport() : null;
      const currentZoom = Number(
        (typeof instance.getZoom === "function" ? instance.getZoom() : viewport?.zoom) || 1
      );
      const nodesById = new Map(nodesRef.current.map((node) => [node.id, node]));
      const rects = flowNodes.map((node) => {
        const position = getAbsoluteNodePosition(node, nodesById);
        const domNode = wrapper.querySelector(`.react-flow__node[data-id="${getCssSafeId(node.id)}"]`);
        const domRect = domNode?.getBoundingClientRect();
        const fallbackSize = estimateCanvasNodeSize(node);
        return {
          x: position.x,
          y: position.y,
          width: Math.max(1, Number(domRect?.width || 0) / currentZoom || fallbackSize.width),
          height: Math.max(1, Number(domRect?.height || 0) / currentZoom || fallbackSize.height)
        };
      });
      const minX = Math.min(...rects.map((rect) => rect.x));
      const minY = Math.min(...rects.map((rect) => rect.y));
      const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
      const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
      const bounds = {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY)
      };
      const padding = Number(options.padding ?? 0.06);
      const viewportWidth = Math.max(1, wrapper.clientWidth || wrapper.getBoundingClientRect().width);
      const viewportHeight = Math.max(1, wrapper.clientHeight || wrapper.getBoundingClientRect().height);
      const nextZoom = Math.min(
        2.5,
        Math.max(
          0.08,
          Math.min(
            viewportWidth / (bounds.width * (1 + padding * 2)),
            viewportHeight / (bounds.height * (1 + padding * 2))
          )
        )
      );
      const nextViewport = {
        x: (viewportWidth - bounds.width * nextZoom) / 2 - bounds.x * nextZoom,
        y: (viewportHeight - bounds.height * nextZoom) / 2 - bounds.y * nextZoom,
        zoom: nextZoom
      };

      if (typeof instance.setViewport === "function") {
        instance.setViewport(nextViewport, { duration: Number(options.duration ?? 360) });
      } else {
        instance.fitView?.({ padding, duration: Number(options.duration ?? 360) });
      }
    }, []);

    React.useEffect(() => {
      nodesRef.current = nodes;
    }, [nodes]);

    React.useEffect(() => {
      edgesRef.current = edges;
    }, [edges]);

    React.useEffect(() => {
      universeFormatRef.current = universeFormat;
    }, [universeFormat]);

    React.useEffect(() => {
      layersRef.current = layers;
    }, [layers]);

    React.useEffect(() => {
      layerEntriesRef.current = layerEntries;
    }, [layerEntries]);

    React.useEffect(() => {
      layerAssignmentsRef.current = layerAssignments;
    }, [layerAssignments]);

    React.useEffect(() => {
      activeLayerIdRef.current = activeLayerId;
    }, [activeLayerId]);

    React.useEffect(() => {
      dropTargetGroupIdRef.current = dropTargetGroupId;
    }, [dropTargetGroupId]);

    function cloneCanvasSnapshot(snapshotNodes = nodesRef.current, snapshotEdges = edgesRef.current) {
      return {
        nodes: snapshotNodes.map((node) => ({
          ...node,
          position: { ...(node.position || {}) },
          data: { ...(node.data || {}) },
          style: node.style ? { ...node.style } : node.style
        })),
        edges: snapshotEdges.map((edge) => ({
          ...edge,
          data: edge.data ? { ...edge.data } : edge.data,
          style: edge.style ? { ...edge.style } : edge.style
        }))
      };
    }

    function syncHistoryControls() {
      const undoButton = document.querySelector("[data-undo-canvas]");
      const redoButton = document.querySelector("[data-redo-canvas]");
      const nextCanUndo = undoStackRef.current.length > 0;
      const nextCanRedo = redoStackRef.current.length > 0;
      if (undoButton) {
        undoButton.disabled = !nextCanUndo;
      }
      if (redoButton) {
        redoButton.disabled = !nextCanRedo;
      }
      setCanUndo(nextCanUndo);
      setCanRedo(nextCanRedo);
      setHistoryVersion((version) => version + 1);
    }

    function pushCanvasHistory() {
      undoStackRef.current = [
        ...undoStackRef.current.slice(-49),
        cloneCanvasSnapshot()
      ];
      redoStackRef.current = [];
      syncHistoryControls();
    }

    async function persistCanvasSnapshot(snapshot, previousSnapshot = cloneCanvasSnapshot()) {
      const snapshotNodeIds = new Set(snapshot.nodes.map((node) => node.id));
      const removedElementIds = previousSnapshot.nodes
        .filter((node) => node.data?.kind === "element" && !snapshotNodeIds.has(node.id))
        .map((node) => node.data.recordId)
        .filter(Boolean);
      const removedGroupIds = previousSnapshot.nodes
        .filter((node) => node.data?.kind === "group" && !snapshotNodeIds.has(node.id))
        .map((node) => node.data.recordId)
        .filter(Boolean);
      const removedNoteIds = previousSnapshot.nodes
        .filter((node) => node.data?.kind === "note" && !snapshotNodeIds.has(node.id))
        .map((node) => node.data.recordId)
        .filter(Boolean);
      const snapshotNodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
      const groupUpserts = snapshot.nodes
        .filter((node) => node.data?.kind === "group" && node.data?.recordId)
        .map((node) => {
          const parentGroupId = node.data?.parentGroupId || toRecordId(node.parentId);
          const absolutePosition = getAbsoluteNodePosition(node, snapshotNodesById);
          return {
            id: node.data.recordId,
            universe_id: universe.id,
            name: node.data.name || "Untitled Group",
            description: node.data.description || null,
            parent_group_id: parentGroupId || null,
            group_position_x: parentGroupId ? Math.round(Number(node.position?.x || 0)) : null,
            group_position_y: parentGroupId ? Math.round(Number(node.position?.y || 0)) : null,
            position_x: Math.round(absolutePosition.x),
            position_y: Math.round(absolutePosition.y),
            width: Number(node.data?.collapsed ? node.data?.expandedWidth || node.style?.width || 360 : node.style?.width || 360),
            height: Number(node.data?.collapsed ? node.data?.expandedHeight || node.style?.height || 260 : node.style?.height || 260),
            is_collapsed: Boolean(node.data?.collapsed),
            background_color: sanitizeColor(node.data?.backgroundColor, "#123034"),
            updated_at: new Date().toISOString()
          };
        });
      const elementOwnerId = getElementOwnerId();
      const elementUpserts = snapshot.nodes
        .filter((node) => node.data?.kind === "element" && node.data?.recordId)
        .map((node) => {
          const groupId = node.data?.groupId || null;
          const absolutePosition = getAbsoluteNodePosition(node, snapshotNodesById);
          return {
            id: node.data.recordId,
            user_id: elementOwnerId,
            universe_id: universe.id,
            name: node.data.name || "Untitled Element",
            description: node.data.description || null,
            position_x: Math.round(absolutePosition.x),
            position_y: Math.round(absolutePosition.y),
            element_type_id: node.data.elementType?.id || null,
            rich_template_id: node.data.richTemplateId || null,
            group_id: groupId,
            group_position_x: groupId ? Math.round(Number(node.position?.x || 0)) : null,
            group_position_y: groupId ? Math.round(Number(node.position?.y || 0)) : null,
            updated_at: new Date().toISOString()
          };
        });
      const noteUpserts = snapshot.nodes
        .filter((node) => node.data?.kind === "note" && node.data?.recordId)
        .map((node) => ({
          id: node.data.recordId,
          universe_id: universe.id,
          title: node.data.title || "Note",
          content: node.data.content || null,
          position_x: Math.round(Number(node.position?.x || 0)),
          position_y: Math.round(Number(node.position?.y || 0)),
          width: Number(node.data?.collapsed ? node.data?.expandedWidth || node.style?.width || DEFAULT_NOTE_WIDTH : node.style?.width || node.measured?.width || node.width || DEFAULT_NOTE_WIDTH),
          height: Number(node.data?.collapsed ? node.data?.expandedHeight || node.style?.height || DEFAULT_NOTE_HEIGHT : node.style?.height || node.measured?.height || node.height || DEFAULT_NOTE_HEIGHT),
          is_collapsed: Boolean(node.data?.collapsed),
          bg_color: sanitizeColor(node.data.bgColor, DEFAULT_NOTE_BG_COLOR),
          border_color: sanitizeColor(node.data.borderColor, DEFAULT_NOTE_BORDER_COLOR),
          text_color: sanitizeColor(node.data.textColor, DEFAULT_NOTE_TEXT_COLOR),
          updated_at: new Date().toISOString()
        }));
      const nextEdgeIds = new Set(snapshot.edges
        .filter((edge) => edge.data?.recordId && !String(edge.id).startsWith("proxy:"))
        .map((edge) => edge.data.recordId));
      const removedEdgeIds = previousSnapshot.edges
        .filter((edge) => edge.data?.recordId && !String(edge.id).startsWith("proxy:") && !nextEdgeIds.has(edge.data.recordId))
        .map((edge) => edge.data.recordId);
      if (removedEdgeIds.length) {
        await window.centralisSupabase.from("element_links").delete().in("id", removedEdgeIds);
      }
      if (removedElementIds.length) {
        await window.centralisSupabase.from("elements").delete().in("id", removedElementIds);
      }
      if (removedGroupIds.length) {
        await window.centralisSupabase.from("element_groups").delete().in("id", removedGroupIds);
      }
      if (removedNoteIds.length) {
        await window.centralisSupabase.from("canvas_notes").delete().in("id", removedNoteIds);
      }
      if (groupUpserts.length) {
        await window.centralisSupabase.from("element_groups").upsert(groupUpserts);
      }
      if (elementUpserts.length) {
        if (!elementOwnerId) {
          throw new Error("Could not determine the signed-in user for restored elements.");
        }
        await window.centralisSupabase.from("elements").upsert(elementUpserts);
      }
      if (noteUpserts.length) {
        await window.centralisSupabase.from("canvas_notes").upsert(noteUpserts);
      }
      await saveNodePositions(snapshot.nodes.filter((node) => node.data?.kind === "universe" && node.data?.recordId));
      await Promise.all(snapshot.edges.map((edge) => {
        if (!edge.data?.recordId || String(edge.id).startsWith("proxy:")) {
          return Promise.resolve();
        }
        return window.centralisSupabase
          .from("element_links")
          .upsert({
            id: edge.data.recordId,
            universe_id: universe.id,
            source_element_id: toRecordId(edge.source),
            target_element_id: toRecordId(edge.target),
            label: edge.label || null,
            updated_at: new Date().toISOString()
          });
      }));
    }

    async function restoreCanvasSnapshot(snapshot, targetStackRef, sourceStackRef) {
      if (!snapshot) {
        return;
      }
      const previousSnapshot = cloneCanvasSnapshot();
      targetStackRef.current = [
        ...targetStackRef.current.slice(-49),
        previousSnapshot
      ];
      const restored = cloneCanvasSnapshot(snapshot);
      setNodes(restored.nodes);
      setEdges(restored.edges);
      nodesRef.current = restored.nodes;
      edgesRef.current = restored.edges;
      sourceStackRef.current = sourceStackRef.current.slice(0, -1);
      syncHistoryControls();
      await persistCanvasSnapshot(restored, previousSnapshot);
    }

    async function undoCanvas() {
      if (!undoStackRef.current.length) {
        syncHistoryControls();
        return;
      }
      const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
      await restoreCanvasSnapshot(snapshot, redoStackRef, undoStackRef);
    }

    async function redoCanvas() {
      if (!redoStackRef.current.length) {
        syncHistoryControls();
        return;
      }
      const snapshot = redoStackRef.current[redoStackRef.current.length - 1];
      await restoreCanvasSnapshot(snapshot, undoStackRef, redoStackRef);
    }

    React.useEffect(() => {
      setNodes((currentNodes) => applyLayerOverlayToNodes(currentNodes, visibleLayerId, layerEntries, layerAssignments));
    }, [visibleLayerId, layerEntries, layerAssignments]);

    const syncElementTypes = React.useCallback((nextTypes) => {
      elementTypes = [...nextTypes].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      setElementTypeVersion((version) => version + 1);
      setNodes((currentNodes) => currentNodes.map((node) => {
        if (node.data?.kind !== "element") {
          return node;
        }
        const currentTypeId = node.data.elementType?.id;
        return {
          ...node,
          data: {
            ...node.data,
            elementType: currentTypeId ? getElementTypeById(currentTypeId) : null
          }
        };
      }));
      populateElementTypeSelect();
    }, []);

    function getElementContainerKey(node) {
      if (node?.data?.kind !== "element") {
        return "";
      }
      return node.data.groupId || node.parentId || "ungrouped";
    }

    function normalizeElementSelection(nextNodes, changes = []) {
      const selectedElements = nextNodes.filter((node) => node.selected && node.data?.kind === "element");
      const selectedNodes = nextNodes.filter((node) => node.selected);
      if (!selectedElements.length || selectedNodes.length <= 1) {
        return nextNodes;
      }

      const latestSelectedChange = [...changes]
        .reverse()
        .find((change) => change.type === "select" && change.selected);
      const anchorNode = latestSelectedChange
        ? nextNodes.find((node) => node.id === latestSelectedChange.id)
        : selectedElements[selectedElements.length - 1];
      const anchorContainer = anchorNode?.data?.kind === "element"
        ? getElementContainerKey(anchorNode)
        : getElementContainerKey(selectedElements[selectedElements.length - 1]);

      return nextNodes.map((node) => {
        if (!node.selected) {
          return node;
        }
        if (node.data?.kind === "universe") {
          return {
            ...node,
            selected: anchorContainer === "ungrouped"
          };
        }
        if (node.data?.kind === "note") {
          return node;
        }
        if (node.data?.kind !== "element") {
          return { ...node, selected: false };
        }
        return {
          ...node,
          selected: getElementContainerKey(node) === anchorContainer
        };
      });
    }

    const handleNodesChange = React.useCallback((changes) => {
      setNodes((currentNodes) => {
        const removedElementNodes = changes
          .filter((change) => change.type === "remove")
          .map((change) => currentNodes.find((node) => node.id === change.id))
          .filter((node) => node?.data?.kind === "element" && node.data?.recordId);
        if (removedElementNodes.length) {
          pushCanvasHistory();
          const removedRecordIds = removedElementNodes.map((node) => node.data.recordId);
          deleteElementRecords(removedRecordIds)
            .then(() => {
              setLayerAssignments((currentAssignments) => currentAssignments.filter((assignment) => !removedRecordIds.includes(assignment.element_id)));
              setTransferStatus(`Deleted ${removedElementNodes.length} ${removedElementNodes.length === 1 ? "element" : "elements"}.`, "success");
            })
            .catch((error) => {
              console.error("Could not delete removed nodes:", error);
              setTransferStatus(`Could not delete removed nodes: ${getReadableError(error)}`, "error");
            });
        }

        const changedNodes = normalizeElementSelection(applyNodeChanges(changes, currentNodes), changes);
        const nextNodes = clampGroupedChildPositions(changedNodes);
        const finishedPositionIds = new Set(changes
          .filter((change) => change.type === "position" && change.dragging === false)
          .map((change) => change.id));

        if (finishedPositionIds.size) {
          const movedNodes = nextNodes.filter((node) => finishedPositionIds.has(node.id));
          saveNodePositions(movedNodes);
        }

        return nextNodes;
      });
    }, []);

    const handleNodeDragStart = React.useCallback((_event, node) => {
      if (dragHistoryNodeIdRef.current === node.id) {
        return;
      }
      dragHistoryNodeIdRef.current = node.id;
      pushCanvasHistory();
    }, []);

    const applyUniverseFormat = React.useCallback((format) => {
      setUniverseFormat(format);
      setNodes((currentNodes) => currentNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          format
        }
      })));
      setEdges((currentEdges) => currentEdges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          format
        },
        style: {
          ...edge.style,
          stroke: format.strokeColor,
          strokeWidth: format.strokeWidth,
          strokeDasharray: getStrokeDasharray(format.strokeStyle)
        }
      })));
    }, []);

    const deleteEdge = React.useCallback(async (edgeId) => {
      pushCanvasHistory();
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== edgeId));

      const { error } = await window.centralisSupabase
        .from("element_links")
        .delete()
        .eq("id", edgeId);

      if (error) {
        console.error("Could not delete element link:", error);
      }
    }, []);

    async function deleteElementRecords(recordIds) {
      const ids = [...new Set((recordIds || []).filter(Boolean))];
      if (!ids.length) {
        return { deletedIds: [] };
      }

      const requiredResponses = await Promise.all([
        window.centralisSupabase.from("element_links").delete().in("source_element_id", ids),
        window.centralisSupabase.from("element_links").delete().in("target_element_id", ids)
      ]);
      throwFirstSupabaseError(requiredResponses);

      const optionalResponses = await Promise.allSettled([
        window.centralisSupabase.from("element_layer_assignments").delete().in("element_id", ids),
        window.centralisSupabase.from("element_template_field_values").delete().in("element_id", ids),
        window.centralisSupabase.from("element_custom_fields").delete().in("element_id", ids),
        window.centralisSupabase.from("image_table").delete().in("object_id", ids)
      ]);
      optionalResponses.forEach((result) => {
        const error = result.value?.error || result.reason;
        if (error) {
          console.warn("Optional element cleanup failed:", error);
        }
      });

      const { error } = await window.centralisSupabase
        .from("elements")
        .delete()
        .in("id", ids);

      if (error) {
        throw error;
      }

      const verifyResponse = await window.centralisSupabase
        .from("elements")
        .select("id")
        .in("id", ids);
      if (verifyResponse.error) {
        throw verifyResponse.error;
      }

      const remainingIds = (verifyResponse.data || []).map((row) => row.id);
      if (remainingIds.length) {
        throw new Error(`Element delete was blocked for ${remainingIds.length} row${remainingIds.length === 1 ? "" : "s"}: ${remainingIds.join(", ")}`);
      }

      return { deletedIds: ids };
    }
    const getFormattedEdgePath = React.useCallback((props) => {
      const pathType = props.data?.format?.pathType || DEFAULT_UNIVERSE_FORMAT.pathType;
      const pathInput = {
        sourceX: props.sourceX,
        sourceY: props.sourceY,
        sourcePosition: props.sourcePosition,
        targetX: props.targetX,
        targetY: props.targetY,
        targetPosition: props.targetPosition
      };

      if (pathType === "line" && getStraightPath) {
        return getStraightPath(pathInput);
      }
      if (pathType === "step" && getSmoothStepPath) {
        return getSmoothStepPath(pathInput);
      }
      return getBezierPath(pathInput);
    }, []);
    const edgeTypes = React.useMemo(() => ({
      deletable: function DeletableEdge(props) {
        const [isHovered, setIsHovered] = React.useState(false);
        const pathResult = getFormattedEdgePath(props);
        const edgePath = pathResult[0];
        const labelX = pathResult[1];
        const labelY = pathResult[2];

        return React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "g",
            {
              onMouseEnter: () => setIsHovered(true),
              onMouseLeave: () => setIsHovered(false)
            },
            React.createElement(BaseEdge, {
              id: props.id,
              path: edgePath,
              markerEnd: props.markerEnd,
              style: props.style
            }),
            React.createElement("path", {
              className: "edge-hover-path",
              d: edgePath
            })
          ),
          React.createElement(
            EdgeLabelRenderer,
            null,
            React.createElement(
              "button",
              {
                className: `edge-delete-button nodrag nopan${isHovered ? " is-visible" : ""}`,
                type: "button",
                style: {
                  transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
                },
                "aria-label": "Delete link",
                onMouseEnter: () => setIsHovered(true),
                onMouseLeave: () => setIsHovered(false),
                onClick: (event) => {
                  event.stopPropagation();
                  deleteEdge(props.id);
                }
              },
              React.createElement("span", { "aria-hidden": "true" }, "x")
            )
          )
        );
      }
    }), [deleteEdge, getFormattedEdgePath]);

    const openLinkedNodeDetails = React.useCallback((nodeId) => {
      setNodes((currentNodes) => currentNodes.map((node) => ({
        ...node,
        selected: node.id === nodeId
      })));
      window.dispatchEvent(new CustomEvent("centralis:view-node-details", {
        detail: { nodeId }
      }));
    }, []);

    const fetchUniverseAiChat = React.useCallback(() => callEdgeFunction("get-universe-ai-chat", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ universeId })
    }), []);

    const syncUniverseAiSource = React.useCallback(async () => {
      setAiChatState((current) => ({
        ...current,
        loading: false,
        syncing: true,
        error: "",
        statusMessage: "Syncing universe knowledge..."
      }));

      try {
        await callEdgeFunction("sync-universe-ai-source", {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ universeId })
        });
        const payload = await fetchUniverseAiChat();
        setAiChatState((current) => ({
          ...current,
          loading: false,
          syncing: false,
          source: payload.source || current.source,
          chat: payload.chat || current.chat,
          messages: payload.messages || current.messages,
          error: "",
          statusMessage: "Knowledge synced."
        }));
      } catch (error) {
        setAiChatState((current) => ({
          ...current,
          loading: false,
          syncing: false,
          error: getReadableError(error),
          statusMessage: ""
        }));
      }
    }, [fetchUniverseAiChat]);

    const loadUniverseAiChat = React.useCallback(async (options = {}) => {
      setAiChatState((current) => ({
        ...current,
        loading: true,
        error: "",
        statusMessage: ""
      }));

      try {
        const payload = await fetchUniverseAiChat();
        setAiChatState((current) => ({
          ...current,
          loading: false,
          source: payload.source || null,
          chat: payload.chat || null,
          messages: payload.messages || [],
          error: "",
          statusMessage: ""
        }));

        if (options.syncIfNeeded !== false && payload.source?.sync_status !== "ready") {
          await syncUniverseAiSource();
        }
      } catch (error) {
        setAiChatState((current) => ({
          ...current,
          loading: false,
          syncing: false,
          error: getReadableError(error),
          statusMessage: ""
        }));
      }
    }, [fetchUniverseAiChat, syncUniverseAiSource]);

    const sendUniverseAiMessage = React.useCallback(async (message) => {
      const cleanMessage = String(message || "").trim();
      if (!cleanMessage) {
        return;
      }

      setAiChatState((current) => ({
        ...current,
        sending: true,
        error: "",
        statusMessage: ""
      }));

      try {
        const payload = await callEdgeFunction("send-universe-ai-message", {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            universeId,
            message: cleanMessage
          })
        });
        setAiChatState((current) => ({
          ...current,
          sending: false,
          source: payload.source || current.source,
          chat: payload.chat || current.chat,
          messages: payload.messages || current.messages,
          error: "",
          statusMessage: ""
        }));
      } catch (error) {
        setAiChatState((current) => ({
          ...current,
          sending: false,
          error: getReadableError(error),
          statusMessage: ""
        }));
      }
    }, []);

    const updateAiProposalStatusInState = React.useCallback((proposalId, status) => {
      const cleanProposalId = String(proposalId || "");
      if (!cleanProposalId) return;
      setAiChatState((current) => ({
        ...current,
        messages: (current.messages || []).map((message) => ({
          ...message,
          proposals: Array.isArray(message.proposals)
            ? message.proposals.map((proposal) => (
              String(proposal.id || "") === cleanProposalId
                ? {
                  ...proposal,
                  status,
                  updated_at: new Date().toISOString(),
                  finalized_at: status === "finalized" ? new Date().toISOString() : proposal.finalized_at
                }
                : proposal
            ))
            : message.proposals
        }))
      }));
    }, []);

    const reviewUniverseAiProposal = React.useCallback((proposal) => {
      if (!proposal?.id) return;
      window.dispatchEvent(new CustomEvent("centralis:review-ai-element-proposal", {
        detail: { proposal }
      }));
    }, []);

    const dismissUniverseAiProposal = React.useCallback(async (proposal) => {
      const proposalId = String(proposal?.id || "");
      if (!proposalId || proposal?.status !== "pending") return;
      updateAiProposalStatusInState(proposalId, "dismissed");
      try {
        const { error } = await window.centralisSupabase
          .from("universe_ai_proposals")
          .update({
            status: "dismissed",
            updated_at: new Date().toISOString()
          })
          .eq("id", proposalId)
          .eq("universe_id", universe.id);
        if (error) throw error;
      } catch (error) {
        updateAiProposalStatusInState(proposalId, "pending");
        setAiChatState((current) => ({
          ...current,
          error: `Could not dismiss proposal: ${getReadableError(error)}`
        }));
      }
    }, [updateAiProposalStatusInState]);

    const openUniverseAiPopout = React.useCallback(() => {
      const universeNodeId = nodesRef.current.find((currentNode) => currentNode.data?.kind === "universe")?.id || `universe:${universe.id}`;
      setAiChatPopoutOpen(true);
      setAiChatOpen(false);
      setRichDetailsNodeId(null);
      setRichDetailsData(null);
      setDetailsNodeId(universeNodeId);
      setDetailsMode("view");
    }, []);

    const openChroniclePreview = React.useCallback(async (nodeId) => {
      const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);
      if (!node || node.data?.kind !== "element") {
        return;
      }

      hideDetailsPane();
      setAiChatOpen(false);
      setDetailsNodeId(null);
      setDetailsMode("view");
      setRichDetailsMode("view");
      setRichDetailsNodeId(nodeId);
      setRichDetailsData({ loading: true, error: "", template: null, sections: [], fields: [], values: [], customFields: [] });
      try {
        const data = await fetchChroniclePreviewData(node);
        setRichDetailsData({ loading: false, error: "", ...data });
      } catch (error) {
        setRichDetailsData({ loading: false, error: getReadableError(error), modules: [], sections: [], fields: [], values: [] });
      }
    }, []);

    const runAutoLayout = React.useCallback(async (options = {}) => {
      const { fit = true, sourceNodes = nodesRef.current, persist = true } = options;
      pushCanvasHistory();
      const nextNodes = await createAutoLayout(sourceNodes, edgesRef.current, universeFormatRef.current);
      setNodes(nextNodes);
      nodesRef.current = nextNodes;

      if (fit) {
        window.setTimeout(() => {
          fitCanvasToRenderedNodes({ padding: 0.06, duration: 360 });
        }, 50);
      }

      if (persist) {
        await saveNodePositions(nextNodes);
      }
    }, [fitCanvasToRenderedNodes]);

    const setNodeImages = React.useCallback((nodeId, images, options = {}) => {
      if (!Array.isArray(images)) {
        return;
      }

      const normalizedImages = normalizeImages(images);
      let nextNodes = null;
      setNodes((currentNodes) => {
        nextNodes = currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              images: normalizedImages
            }
          };
        });
        return nextNodes;
      });

      if (options.autoLayoutAfter && nextNodes) {
        window.setTimeout(() => {
          runAutoLayout({ fit: false, sourceNodes: nextNodes });
        }, 60);
      }
    }, [runAutoLayout]);

    const refreshNodeImages = React.useCallback(async (node) => {
      if (!node?.data?.recordId) {
        return;
      }

      const data = await callEdgeFunction("list-object-images", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectIds: [node.data.recordId] })
      });

      setNodeImages(node.id, data.images || [], {
        autoLayoutAfter: universeFormatRef.current.nodeImagePlacement === "top"
      });
    }, [setNodeImages]);

    React.useEffect(() => {
      const modal = document.getElementById("image-viewer-modal");
      const title = document.querySelector("[data-image-viewer-title], #image-viewer-title");
      const frame = document.querySelector("[data-image-viewer-frame]");
      const image = document.querySelector("[data-image-viewer-img]");
      const thumbs = document.querySelector("[data-image-viewer-thumbs]");
      const status = document.querySelector("[data-image-viewer-status]");
      const prevButton = document.querySelector("[data-image-viewer-prev]");
      const nextButton = document.querySelector("[data-image-viewer-next]");
      const openButton = document.querySelector("[data-image-viewer-open]");
      const downloadButton = document.querySelector("[data-image-viewer-download]");
      const deleteButton = document.querySelector("[data-image-viewer-delete]");
      const primaryInput = document.querySelector("[data-image-viewer-primary]");
      const closeButtons = document.querySelectorAll("[data-image-viewer-close]");
      if (!modal || !frame || !image || !thumbs) {
        return undefined;
      }

      let viewerNodeId = null;
      let viewerImages = [];
      let viewerIndex = 0;
      let scale = 1;
      let translateX = 0;
      let translateY = 0;
      let dragStart = null;

      function currentImage() {
        return viewerImages[viewerIndex] || null;
      }

      function applyTransform() {
        image.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        image.classList.add("is-pannable");
      }

      function resetTransform() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        applyTransform();
      }

      function renderViewer() {
        const activeImage = currentImage();
        if (!activeImage) {
          modal.hidden = true;
          return;
        }

        const node = nodesRef.current.find((currentNode) => currentNode.id === viewerNodeId);
        if (title) {
          title.textContent = `${node?.data?.name || "Image"} Image (${viewerIndex + 1} of ${viewerImages.length})`;
        }
        image.src = activeImage.image_url;
        image.alt = "";
        thumbs.innerHTML = viewerImages.map((viewerImage, index) => `
          <button class="image-thumb${index === viewerIndex ? " is-active" : ""}" type="button" data-viewer-thumb="${index}" aria-label="Show image ${index + 1}">
            <img src="${escapeHtml(viewerImage.image_url)}" alt="">
          </button>
        `).join("");
        thumbs.querySelectorAll("[data-viewer-thumb]").forEach((thumb) => {
          thumb.addEventListener("click", () => {
            viewerIndex = Number(thumb.dataset.viewerThumb || 0);
            resetTransform();
            renderViewer();
          });
        });
        if (prevButton) {
          prevButton.disabled = viewerImages.length < 2;
        }
        if (nextButton) {
          nextButton.disabled = viewerImages.length < 2;
        }
        if (primaryInput) {
          primaryInput.checked = Boolean(activeImage.is_primary);
          primaryInput.disabled = Boolean(activeImage.is_primary);
        }
        if (status) {
          status.textContent = "";
          status.classList.remove("is-error", "is-success");
        }
        resetTransform();
      }

      function closeViewer() {
        modal.hidden = true;
        viewerNodeId = null;
        viewerImages = [];
        viewerIndex = 0;
        resetTransform();
      }

      function moveViewer(direction) {
        if (!viewerImages.length) {
          return;
        }

        viewerIndex = (viewerIndex + direction + viewerImages.length) % viewerImages.length;
        renderViewer();
      }

      function handlePrevious() {
        moveViewer(-1);
      }

      function handleNext() {
        moveViewer(1);
      }

      function handleOpenViewer(event) {
        const { nodeId, imageId } = event.detail || {};
        const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);
        const images = normalizeImages(node?.data?.images || []);
        if (!node || !images.length) {
          return;
        }

        viewerNodeId = nodeId;
        viewerImages = images;
        const requestedIndex = images.findIndex((viewerImage) => viewerImage.id === imageId);
        viewerIndex = requestedIndex >= 0 ? requestedIndex : 0;
        modal.hidden = false;
        renderViewer();
      }

      function handleWheel(event) {
        event.preventDefault();
        event.stopPropagation();
        const nextScale = Math.min(4, Math.max(1, scale + (event.deltaY < 0 ? 0.16 : -0.16)));
        if (nextScale === 1) {
          translateX = 0;
          translateY = 0;
        }
        scale = nextScale;
        applyTransform();
      }

      function handlePointerDown(event) {
        event.preventDefault();
        event.stopPropagation();
        image.setPointerCapture(event.pointerId);
        dragStart = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          translateX,
          translateY
        };
      }

      function handlePointerMove(event) {
        if (!dragStart || dragStart.pointerId !== event.pointerId) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        translateX = dragStart.translateX + event.clientX - dragStart.x;
        translateY = dragStart.translateY + event.clientY - dragStart.y;
        applyTransform();
      }

      function handlePointerUp(event) {
        if (dragStart?.pointerId === event.pointerId) {
          event.preventDefault();
          event.stopPropagation();
          dragStart = null;
        }
      }

      function preventImageDrag(event) {
        event.preventDefault();
        event.stopPropagation();
      }

      function handleDownload() {
        const activeImage = currentImage();
        if (!activeImage) {
          return;
        }

        const link = document.createElement("a");
        link.href = activeImage.image_url;
        link.download = `centralis-image-${activeImage.id || Date.now()}.png`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
      }

      function handleOpenImage() {
        const activeImage = currentImage();
        if (!activeImage?.image_url) {
          return;
        }

        window.open(activeImage.image_url, "_blank", "noopener,noreferrer");
      }

      async function handleSetPrimaryImage() {
        const activeImage = currentImage();
        const node = nodesRef.current.find((currentNode) => currentNode.id === viewerNodeId);
        if (!activeImage || !node || activeImage.is_primary) {
          return;
        }

        if (primaryInput) {
          primaryInput.disabled = true;
        }
        if (status) {
          status.textContent = "Setting primary image...";
          status.classList.remove("is-error", "is-success");
        }

        try {
          await callEdgeFunction("set-primary-image", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageId: activeImage.id })
          });
          viewerImages = normalizeImages(viewerImages.map((viewerImage) => ({
            ...viewerImage,
            is_primary: viewerImage.id === activeImage.id
          })));
          viewerIndex = Math.max(0, viewerImages.findIndex((viewerImage) => viewerImage.id === activeImage.id));
          setNodeImages(node.id, viewerImages);
          if (status) {
            status.textContent = "Primary image updated.";
            status.classList.add("is-success");
          }
          renderViewer();
        } catch (error) {
          if (status) {
            status.textContent = `Could not set primary image: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
          if (primaryInput) {
            primaryInput.checked = false;
            primaryInput.disabled = false;
          }
        }
      }

      async function handleDelete() {
        const activeImage = currentImage();
        const node = nodesRef.current.find((currentNode) => currentNode.id === viewerNodeId);
        if (!activeImage || !node || !window.confirm("Delete this image?")) {
          return;
        }

        if (deleteButton) {
          deleteButton.disabled = true;
        }
        if (status) {
          status.textContent = "Deleting image...";
          status.classList.remove("is-error", "is-success");
        }

        try {
          await callEdgeFunction("delete-object-image", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageId: activeImage.id })
          });
          const nextImages = normalizeImages(viewerImages
            .filter((viewerImage) => viewerImage.id !== activeImage.id)
            .map((viewerImage, index, remainingImages) => ({
              ...viewerImage,
              is_primary: remainingImages.length === 1 ? true : viewerImage.is_primary
            })));
          viewerImages = nextImages;
          viewerIndex = Math.min(viewerIndex, Math.max(0, nextImages.length - 1));
          setNodeImages(node.id, nextImages);
          if (!nextImages.length) {
            closeViewer();
          } else {
            renderViewer();
          }
        } catch (error) {
          if (status) {
            status.textContent = `Could not delete image: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
        }

        if (deleteButton) {
          deleteButton.disabled = false;
        }
      }

      window.addEventListener("centralis:open-image-viewer", handleOpenViewer);
      closeButtons.forEach((button) => button.addEventListener("click", closeViewer));
      prevButton?.addEventListener("click", handlePrevious);
      nextButton?.addEventListener("click", handleNext);
      openButton?.addEventListener("click", handleOpenImage);
      downloadButton?.addEventListener("click", handleDownload);
      deleteButton?.addEventListener("click", handleDelete);
      primaryInput?.addEventListener("change", handleSetPrimaryImage);
      frame.addEventListener("wheel", handleWheel, { passive: false });
      image.addEventListener("pointerdown", handlePointerDown);
      image.addEventListener("pointermove", handlePointerMove);
      image.addEventListener("pointerup", handlePointerUp);
      image.addEventListener("pointercancel", handlePointerUp);
      image.addEventListener("dragstart", preventImageDrag);
      return () => {
        window.removeEventListener("centralis:open-image-viewer", handleOpenViewer);
        closeButtons.forEach((button) => button.removeEventListener("click", closeViewer));
        prevButton?.removeEventListener("click", handlePrevious);
        nextButton?.removeEventListener("click", handleNext);
        openButton?.removeEventListener("click", handleOpenImage);
        downloadButton?.removeEventListener("click", handleDownload);
        deleteButton?.removeEventListener("click", handleDelete);
        primaryInput?.removeEventListener("change", handleSetPrimaryImage);
        frame.removeEventListener("wheel", handleWheel);
        image.removeEventListener("pointerdown", handlePointerDown);
        image.removeEventListener("pointermove", handlePointerMove);
        image.removeEventListener("pointerup", handlePointerUp);
        image.removeEventListener("pointercancel", handlePointerUp);
        image.removeEventListener("dragstart", preventImageDrag);
      };
    }, [setNodeImages]);

    React.useEffect(() => {
      const modal = document.getElementById("universe-format-modal");
      const form = document.querySelector("[data-format-form]");
      const status = document.querySelector("[data-format-status]");
      const opener = document.querySelector("[data-open-format-modal]");
      const closers = document.querySelectorAll("[data-close-format-modal]");
      const resetButton = document.querySelector("[data-format-reset]");
      if (!modal || !form || !opener) {
        return undefined;
      }

      function setSegmentValue(name, value) {
        const input = form.querySelector(`[name="${name}"]`);
        const group = form.querySelector(`[data-format-segment="${name}"]`);
        if (input) {
          input.value = String(value);
        }
        group?.querySelectorAll("[data-format-value]").forEach((button) => {
          button.classList.toggle("is-selected", button.dataset.formatValue === String(value));
        });
      }

      function setColorValue(value) {
        const color = sanitizeColor(value, DEFAULT_UNIVERSE_FORMAT.strokeColor);
        const input = form.querySelector('[name="strokeColor"]');
        if (input) {
          input.value = color;
        }
        form.querySelectorAll("[data-format-colors] [data-format-value]").forEach((button) => {
          button.classList.toggle("is-selected", button.dataset.formatValue === color);
        });
      }

      function populateForm(format) {
        setColorValue(format.strokeColor);
        setSegmentValue("strokeWidth", format.strokeWidth);
        setSegmentValue("strokeStyle", format.strokeStyle);
        setSegmentValue("pathType", format.pathType);
        setSegmentValue("nodeBgOpacity", format.nodeBgOpacity);
        setSegmentValue("nodeBorderWidth", format.nodeBorderWidth);
        setSegmentValue("nodeImagePlacement", format.nodeImagePlacement);
        setSegmentValue("nodeLayoutGap", format.nodeLayoutGap);
        if (status) {
          status.textContent = "";
          status.classList.remove("is-error", "is-success");
        }
      }

      function readFormFormat() {
        const formData = new FormData(form);
        return getUniverseFormat({
          fmt_stroke_color: formData.get("strokeColor"),
          fmt_stroke_width: formData.get("strokeWidth"),
          fmt_stroke_style: formData.get("strokeStyle"),
          fmt_path_type: formData.get("pathType"),
          fmt_node_bg_opacity: formData.get("nodeBgOpacity"),
          fmt_node_border_width: formData.get("nodeBorderWidth"),
          fmt_node_image_placement: formData.get("nodeImagePlacement"),
          fmt_node_layout_gap: formData.get("nodeLayoutGap")
        });
      }

      function openFormatModal() {
        populateForm(universeFormat);
        modal.hidden = false;
      }

      function closeFormatModal() {
        modal.hidden = true;
      }

      async function saveFormat(nextFormat) {
        applyUniverseFormat(nextFormat);
        Object.assign(universe, toFormatPayload(nextFormat));
        if (status) {
          status.textContent = "Saving...";
          status.classList.remove("is-error", "is-success");
        }

        try {
          const { error } = await window.centralisSupabase
            .from("universes")
            .update(toFormatPayload(nextFormat))
            .eq("id", universe.id);

          if (error) {
            throw error;
          }

          if (status) {
            status.textContent = "Saved.";
            status.classList.add("is-success");
          }
          if (nextFormat.nodeImagePlacement === "top") {
            const formattedNodes = nodesRef.current.map((node) => ({
              ...node,
              data: {
                ...node.data,
                format: nextFormat
              }
            }));
            await runAutoLayout({ fit: false, sourceNodes: formattedNodes });
          }
        } catch (error) {
          if (status) {
            status.textContent = `Could not save: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
        }
      }

      function handleReset() {
        populateForm(DEFAULT_UNIVERSE_FORMAT);
        saveFormat(DEFAULT_UNIVERSE_FORMAT);
      }

      function handleSegmentClick(event) {
        const button = event.target.closest("[data-format-value]");
        if (!button) {
          return;
        }

        const colorGroup = button.closest("[data-format-colors]");
        const segmentGroup = button.closest("[data-format-segment]");
        if (colorGroup) {
          setColorValue(button.dataset.formatValue);
        } else if (segmentGroup) {
          setSegmentValue(segmentGroup.dataset.formatSegment, button.dataset.formatValue);
        }
        saveFormat(readFormFormat());
      }

      opener.addEventListener("click", openFormatModal);
      closers.forEach((button) => button.addEventListener("click", closeFormatModal));
      resetButton?.addEventListener("click", handleReset);
      form.addEventListener("click", handleSegmentClick);
      return () => {
        opener.removeEventListener("click", openFormatModal);
        closers.forEach((button) => button.removeEventListener("click", closeFormatModal));
        resetButton?.removeEventListener("click", handleReset);
        form.removeEventListener("click", handleSegmentClick);
      };
    }, [applyUniverseFormat, runAutoLayout, universeFormat]);

    React.useEffect(() => {
      const button = document.querySelector("[data-auto-layout]");
      if (!button) {
        return undefined;
      }

      async function handleAutoLayout() {
        button.classList.add("is-busy");
        button.disabled = true;
        try {
          await runAutoLayout({ fit: false });
        } catch (error) {
          console.error("Could not auto-layout canvas:", error);
        } finally {
          button.classList.remove("is-busy");
          button.disabled = false;
        }
      }

      button.addEventListener("click", handleAutoLayout);
      return () => button.removeEventListener("click", handleAutoLayout);
    }, [runAutoLayout]);

    React.useEffect(() => {
      const modal = document.getElementById("element-types-modal");
      const opener = document.querySelector("[data-open-types-modal]");
      const closeButton = document.querySelector("[data-close-types-modal]");
      const addButton = document.querySelector("[data-add-type]");
      const list = document.querySelector("[data-element-types-list]");
      const count = document.querySelector("[data-element-types-count]");
      const editorHost = document.querySelector("[data-type-editor-host]");
      const status = document.querySelector("[data-element-types-status]");
      const templateModal = document.getElementById("template-editor-modal");
      const templateCloseButton = document.querySelector("[data-close-template-editor]");
      const templateTypeLabel = document.querySelector("[data-template-editor-type]");
      const templateList = document.querySelector("[data-wide-template-list]");
      const templateMain = document.querySelector("[data-wide-template-main]");
      const templateStatus = document.querySelector("[data-template-editor-status]");
      const wideAddTemplateButton = document.querySelector("[data-wide-add-template]");
      const templateNestedDialog = document.querySelector("[data-template-nested-dialog]");
      const templateNestedTitle = document.querySelector("[data-template-nested-title]");
      const templateNestedContent = document.querySelector("[data-template-nested-content]");
      if (!modal || !opener || !list || !editorHost) {
        return undefined;
      }

      let activeEditor = null;
      let activeNestedEditor = null;
      let templateEditorTypeId = null;
      let selectedTemplateId = null;
      let templatesByTypeId = new Map();
      let sectionsByTemplateId = new Map();
      let fieldsByTemplateId = new Map();
      let iconPanelOpen = false;
      let colorPanelOpen = false;
      let selectedIcon = DEFAULT_ELEMENT_TYPE_ICON;
      let selectedColor = DEFAULT_ELEMENT_TYPE_COLOR;
      let iconNames = FALLBACK_PHOSPHOR_ICONS;

      function setTypeStatus(message, type) {
        if (!status) {
          return;
        }
        status.textContent = message || "";
        status.classList.toggle("is-error", type === "error");
        status.classList.toggle("is-success", type === "success");
      }

      function setTemplateStatus(message, type) {
        const target = templateStatus || status;
        if (!target) return;
        target.textContent = message || "";
        target.classList.toggle("is-error", type === "error");
        target.classList.toggle("is-success", type === "success");
      }

      function createTypeIconMarkup(iconName, color) {
        const icon = sanitizeIconName(iconName || DEFAULT_ELEMENT_TYPE_ICON);
        const safeColor = sanitizeColor(color || DEFAULT_ELEMENT_TYPE_COLOR);
        return `<span class="element-type-icon" style="--type-color: ${escapeHtml(safeColor)}" aria-hidden="true"><ph-${escapeHtml(icon)} weight="duotone"></ph-${escapeHtml(icon)}></span>`;
      }

      async function refreshTypeTemplateData() {
        const typeIds = elementTypes.map((type) => type.id).filter(Boolean);
        templatesByTypeId = new Map();
        sectionsByTemplateId = new Map();
        fieldsByTemplateId = new Map();
        if (!typeIds.length) {
          return;
        }

        const templateResponse = await window.centralisSupabase
          .from("element_type_templates")
          .select("*")
          .in("element_type_id", typeIds)
          .order("name", { ascending: true });
        if (templateResponse.error) throw templateResponse.error;

        const templates = templateResponse.data || [];
        templates.forEach((template) => {
          const listForType = templatesByTypeId.get(template.element_type_id) || [];
          listForType.push(template);
          templatesByTypeId.set(template.element_type_id, listForType);
        });

        const templateIds = templates.map((template) => template.id).filter(Boolean);
        if (!templateIds.length) {
          return;
        }

        const [sectionResponse, fieldResponse] = await Promise.all([
          window.centralisSupabase
            .from("element_template_sections")
            .select("*")
            .in("template_id", templateIds)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          window.centralisSupabase
            .from("element_type_template_fields")
            .select("*")
            .in("template_id", templateIds)
            .order("sort_order", { ascending: true })
        ]);
        if (sectionResponse.error) throw sectionResponse.error;
        if (fieldResponse.error) throw fieldResponse.error;

        (sectionResponse.data || []).forEach((section) => {
          const listForTemplate = sectionsByTemplateId.get(section.template_id) || [];
          listForTemplate.push(section);
          sectionsByTemplateId.set(section.template_id, listForTemplate);
        });
        (fieldResponse.data || []).forEach((field) => {
          const listForTemplate = fieldsByTemplateId.get(field.template_id) || [];
          listForTemplate.push(field);
          fieldsByTemplateId.set(field.template_id, listForTemplate);
        });
      }

      function refreshNodesForTypeChanges() {
        setNodes((currentNodes) => currentNodes.map((node) => {
          if (node.data?.kind !== "element") return node;
          return {
            ...node,
            data: {
              ...node.data,
              elementType: getElementTypeById(node.data?.elementType?.id)
            }
          };
        }));
      }

      function createNestedEditorMarkup() {
        if (!activeNestedEditor) return "";
        const data = activeNestedEditor.data || {};
        const isEdit = activeNestedEditor.mode === "edit";
        if (activeNestedEditor.kind === "template") {
          return `
            <form class="element-type-editor nested-template-editor" data-template-editor>
              <label class="template-form-field">
                <span>Name</span>
                <input type="text" name="template-name" placeholder="Template name" value="${escapeHtml(data.name || "")}" autocomplete="off">
              </label>
              <label class="template-form-field">
                <span>Description</span>
                <textarea name="template-description" rows="2" placeholder="Template description">${escapeHtml(data.description || "")}</textarea>
              </label>
              <div class="type-editor-actions">
                <button class="secondary-action compact-action" type="button" data-cancel-nested-editor>Cancel</button>
                <button class="primary-action compact-action" type="submit">${isEdit ? "Save" : "Add"}</button>
              </div>
            </form>
          `;
        }

        if (activeNestedEditor.kind === "section") {
          return `
            <form class="element-type-editor nested-template-editor" data-section-editor>
              <label class="template-form-field">
                <span>Name</span>
                <input type="text" name="section-name" placeholder="Section name" value="${escapeHtml(data.name || "")}" autocomplete="off">
              </label>
              <label class="template-form-field">
                <span>Description</span>
                <textarea name="section-description" rows="3" placeholder="Section description">${escapeHtml(data.description || "")}</textarea>
              </label>
              <label class="template-form-field">
                <span>Sort Order</span>
                <input type="number" name="section-sort-order" placeholder="Sort order" value="${escapeHtml(data.sort_order ?? 0)}">
              </label>
              <div class="type-editor-actions">
                <button class="secondary-action compact-action" type="button" data-cancel-nested-editor>Cancel</button>
                <button class="primary-action compact-action" type="submit">${isEdit ? "Save" : "Add"}</button>
              </div>
            </form>
          `;
        }

        const templateSections = sectionsByTemplateId.get(activeNestedEditor.templateId) || [];
        const fieldLabel = activeNestedEditor.mode === "edit" ? getTemplateFieldLabel(data) : "";
        const fieldType = getTemplateFieldType(data);
        const optionsText = optionsToLines(data.options);
        return `
          <form class="element-type-editor nested-template-editor field-template-editor" data-field-editor>
            <div class="template-editor-grid">
              <label class="template-form-field">
                <span>Label</span>
                <input type="text" name="field-label" placeholder="Field label" value="${escapeHtml(fieldLabel)}" autocomplete="off">
              </label>
              <label class="template-form-field">
                <span>Field Key</span>
                <input type="text" name="field-key" placeholder="field_key" value="${escapeHtml(data.field_key || "")}" autocomplete="off">
              </label>
              <label class="template-form-field">
                <span>Field Type</span>
                <select name="field-type">
                  ${["text", "textarea", "rich_text", "number", "date", "checkbox", "select", "multi_select", "url"].map((type) => `<option value="${type}"${fieldType === type ? " selected" : ""}>${type.replace("_", " ")}</option>`).join("")}
                </select>
              </label>
              <label class="template-form-field">
                <span>Section</span>
                <select name="field-section">
                  <option value="">Unsectioned</option>
                  ${templateSections.map((section) => `<option value="${escapeHtml(section.id)}"${section.id === data.section_id ? " selected" : ""}>${escapeHtml(section.name || "Untitled Section")}</option>`).join("")}
                </select>
              </label>
              <label class="template-form-field">
                <span>Sort Order</span>
                <input type="number" name="field-sort-order" placeholder="Sort order" value="${escapeHtml(data.sort_order ?? 0)}">
              </label>
              <label class="template-required-check">
                <input type="checkbox" name="field-required"${data.is_required ? " checked" : ""}>
                Required
              </label>
            </div>
            <label class="template-form-field">
              <span>Description</span>
              <textarea name="field-description" rows="3" placeholder="Description">${escapeHtml(data.description || "")}</textarea>
            </label>
            <label class="template-form-field">
              <span>Placeholder</span>
              <textarea name="field-placeholder" rows="3" placeholder="Placeholder">${escapeHtml(data.placeholder || "")}</textarea>
            </label>
            <label class="template-form-field">
              <span>Default Value</span>
              <textarea name="field-default-value" rows="3" placeholder="Default value">${escapeHtml(data.default_value || "")}</textarea>
            </label>
            <label class="template-form-field">
              <span>Options</span>
              <textarea name="field-options" rows="5" placeholder="Options, one per line">${escapeHtml(optionsText)}</textarea>
            </label>
            <div class="type-editor-actions">
              <button class="secondary-action compact-action" type="button" data-cancel-nested-editor>Cancel</button>
              <button class="primary-action compact-action" type="submit">${isEdit ? "Save" : "Add"}</button>
            </div>
          </form>
        `;
      }

      function renderFieldRows(template, fields = null) {
        const fieldRows = sortTemplateFields(fields || fieldsByTemplateId.get(template.id) || []);
        if (!fieldRows.length) {
          return '<p class="template-empty">No fields yet.</p>';
        }

        return fieldRows.map((field) => `
          <div class="template-child-row field-row${field.is_hidden ? " is-hidden" : ""}" data-field-id="${escapeHtml(field.id)}">
            <span class="template-row-title">${escapeHtml(getTemplateFieldLabel(field))}${field.is_default ? ' <em class="template-default-badge">Default</em>' : ""}${field.is_hidden ? ' <em class="template-hidden-badge">Hidden</em>' : ""}</span>
            <span class="template-row-meta">${escapeHtml(getTemplateFieldType(field))}${field.is_required ? " *" : ""}</span>
            <span class="template-row-order">${escapeHtml(field.sort_order ?? 0)}</span>
            <div class="element-type-actions template-row-actions">
              <button type="button" data-edit-field="${escapeHtml(field.id)}" aria-label="Edit field"><ph-pencil-simple weight="bold" aria-hidden="true"></ph-pencil-simple></button>
              ${field.is_default
                ? `<button type="button" data-toggle-field-hidden="${escapeHtml(field.id)}" aria-label="${field.is_hidden ? "Show" : "Hide"} field"><ph-${field.is_hidden ? "eye" : "eye-slash"} weight="bold" aria-hidden="true"></ph-${field.is_hidden ? "eye" : "eye-slash"}></button>`
                : `<button type="button" data-delete-field="${escapeHtml(field.id)}" aria-label="Delete field"><ph-trash weight="bold" aria-hidden="true"></ph-trash></button>`}
            </div>
          </div>
        `).join("");
      }

      function renderSectionRows(template) {
        const sections = sectionsByTemplateId.get(template.id) || [];
        const fields = fieldsByTemplateId.get(template.id) || [];
        const fieldsBySectionId = new Map();
        const unsectionedFields = [];
        fields.forEach((field) => {
          if (field.section_id) {
            const sectionFields = fieldsBySectionId.get(field.section_id) || [];
            sectionFields.push(field);
            fieldsBySectionId.set(field.section_id, sectionFields);
          } else {
            unsectionedFields.push(field);
          }
        });
        return `
          <div class="template-subgroup">
            <div class="template-subgroup-header">
              <strong>Sections</strong>
              <button class="secondary-action compact-action" type="button" data-add-section="${escapeHtml(template.id)}">Add Section</button>
            </div>
            ${activeNestedEditor?.kind === "section" && activeNestedEditor.mode === "add" && activeNestedEditor.templateId === template.id ? createNestedEditorMarkup() : ""}
            ${sections.length ? sections.map((section) => `
              <div class="template-child-row${section.is_hidden ? " is-hidden" : ""}" data-section-id="${escapeHtml(section.id)}">
                <span class="template-row-title">${escapeHtml(section.name || "Untitled Section")}${section.is_default ? ' <em class="template-default-badge">Default</em>' : ""}${section.is_hidden ? ' <em class="template-hidden-badge">Hidden</em>' : ""}</span>
                <span class="template-row-meta">${escapeHtml(section.description || "")}</span>
                <span class="template-row-order">${escapeHtml(section.sort_order ?? 0)}</span>
                <div class="element-type-actions template-row-actions">
                  <button type="button" data-add-field="${escapeHtml(template.id)}" data-field-section="${escapeHtml(section.id)}" aria-label="Add field to section"><ph-plus weight="bold" aria-hidden="true"></ph-plus></button>
                  <button type="button" data-edit-section="${escapeHtml(section.id)}" aria-label="Edit section"><ph-pencil-simple weight="bold" aria-hidden="true"></ph-pencil-simple></button>
                  ${section.is_default
                    ? `<button type="button" data-toggle-section-hidden="${escapeHtml(section.id)}" aria-label="${section.is_hidden ? "Show" : "Hide"} section"><ph-${section.is_hidden ? "eye" : "eye-slash"} weight="bold" aria-hidden="true"></ph-${section.is_hidden ? "eye" : "eye-slash"}></button>`
                    : `<button type="button" data-delete-section="${escapeHtml(section.id)}" aria-label="Delete section"><ph-trash weight="bold" aria-hidden="true"></ph-trash></button>`}
                </div>
              </div>
              <div class="section-field-list">
                ${renderFieldRows(template, fieldsBySectionId.get(section.id) || [])}
              </div>
            `).join("") : '<p class="template-empty">No sections yet.</p>'}
            ${unsectionedFields.length || (activeNestedEditor?.kind === "field" && activeNestedEditor.mode === "add" && activeNestedEditor.templateId === template.id && !activeNestedEditor.data?.section_id) ? `
              <div class="template-child-row unsectioned-fields-row">
                <span class="template-row-title">Unsectioned</span>
                <span class="template-row-meta">Fields without a section</span>
                <span class="template-row-order"></span>
                <div class="element-type-actions template-row-actions">
                  <button type="button" data-add-field="${escapeHtml(template.id)}" aria-label="Add unsectioned field"><ph-plus weight="bold" aria-hidden="true"></ph-plus></button>
                </div>
              </div>
              <div class="section-field-list">
                ${renderFieldRows(template, unsectionedFields)}
              </div>
            ` : ""}
          </div>
        `;
      }

      function renderTypeList() {
        const sortedTypes = [...elementTypes].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        if (count) {
          count.textContent = `${sortedTypes.length} ${sortedTypes.length === 1 ? "type" : "types"}`;
        }
        list.innerHTML = sortedTypes.map((type) => `
          <div class="element-type-block" data-type-id="${escapeHtml(type.id)}">
            <div class="element-type-row">
              <span class="element-type-expand" aria-hidden="true"></span>
              ${createTypeIconMarkup(type.icon, type.color)}
              <span class="element-type-name">${escapeHtml(type.name)}</span>
              <div class="element-type-actions">
                <button type="button" data-edit-type="${escapeHtml(type.id)}" aria-label="Edit ${escapeHtml(type.name)}"><ph-pencil-simple weight="bold" aria-hidden="true"></ph-pencil-simple></button>
                <button type="button" data-delete-type="${escapeHtml(type.id)}" aria-label="Delete ${escapeHtml(type.name)}"><ph-trash weight="bold" aria-hidden="true"></ph-trash></button>
              </div>
            </div>
          </div>
        `).join("");
      }

      function getSelectedTemplateEditorType() {
        return getElementTypeById(templateEditorTypeId);
      }

      function getSelectedTemplate() {
        const templates = templatesByTypeId.get(templateEditorTypeId) || [];
        return templates.find((template) => template.id === selectedTemplateId) || templates[0] || null;
      }

      function renderWideTemplateEditor() {
        if (!templateList || !templateMain) return;
        const type = getSelectedTemplateEditorType();
        const templates = templatesByTypeId.get(templateEditorTypeId) || [];
        const selectedTemplate = getSelectedTemplate();
        selectedTemplateId = selectedTemplate?.id || null;
        if (templateTypeLabel) {
          templateTypeLabel.textContent = type ? `${type.name} Templates` : "Templates";
        }
        if (wideAddTemplateButton) {
          wideAddTemplateButton.disabled = !type;
        }

        templateList.innerHTML = templates.length ? templates.map((template) => `
          <button class="wide-template-list-item${template.id === selectedTemplateId ? " is-selected" : ""}" type="button" data-select-template="${escapeHtml(template.id)}">
            <strong>${escapeHtml(template.name || "Untitled Template")}</strong>
            <span>${template.is_default ? "Default template" : "Custom template"}</span>
          </button>
        `).join("") : '<p class="template-empty">No templates yet.</p>';

        if (activeNestedEditor?.kind === "template" && activeNestedEditor.mode === "add") {
          renderNestedTemplateDialog();
          templateMain.innerHTML = `
            <div class="wide-template-section">
              <h3>Add Template</h3>
              ${createNestedEditorMarkup()}
            </div>
          `;
          return;
        }

        if (!selectedTemplate) {
          renderNestedTemplateDialog();
          templateMain.innerHTML = '<p class="details-empty">Choose Add to create a template for this type.</p>';
          return;
        }

        const isTemplateEditorOpen = activeNestedEditor?.kind === "template" && activeNestedEditor.templateId === selectedTemplate.id;
        templateMain.innerHTML = `
          <div class="wide-template-selected-header">
            <div>
              <h3>${escapeHtml(selectedTemplate.name || "Untitled Template")} ${selectedTemplate.is_default ? '<em class="template-default-badge">Default</em>' : ""}</h3>
              ${selectedTemplate.description ? `<p>${escapeHtml(selectedTemplate.description)}</p>` : ""}
            </div>
            <div class="wide-template-actions">
              <button class="secondary-action compact-action" type="button" data-duplicate-template="${escapeHtml(selectedTemplate.id)}">Duplicate</button>
              <button class="secondary-action compact-action" type="button" data-edit-template="${escapeHtml(selectedTemplate.id)}">Edit</button>
              ${selectedTemplate.is_default
                ? '<button class="secondary-action compact-action" type="button" disabled>Default</button>'
                : `<button class="secondary-action compact-action danger-action" type="button" data-delete-template="${escapeHtml(selectedTemplate.id)}">Delete</button>`}
            </div>
          </div>
          ${isTemplateEditorOpen ? createNestedEditorMarkup() : ""}
          <div class="wide-template-section">
            ${renderSectionRows(selectedTemplate)}
          </div>
        `;
        renderNestedTemplateDialog();
      }

      function renderNestedTemplateDialog() {
        if (!templateNestedDialog || !templateNestedContent || !templateNestedTitle) return;
        if (!activeNestedEditor || !["section", "field"].includes(activeNestedEditor.kind)) {
          templateNestedDialog.hidden = true;
          templateNestedContent.innerHTML = "";
          return;
        }
        const noun = activeNestedEditor.kind === "section" ? "Section" : "Field";
        templateNestedTitle.textContent = `${activeNestedEditor.mode === "edit" ? "Edit" : "Add"} ${noun}`;
        templateNestedContent.innerHTML = createNestedEditorMarkup();
        templateNestedDialog.hidden = false;
        requestAnimationFrame(() => {
          templateNestedContent.querySelector("input, select, textarea, button")?.focus();
        });
      }

      async function openTemplateEditor(typeId) {
        templateEditorTypeId = typeId;
        activeNestedEditor = null;
        setTemplateStatus("");
        try {
          await refreshTypeTemplateData();
        } catch (error) {
          setTemplateStatus(`Could not load templates: ${getReadableError(error)}`, "error");
        }
        selectedTemplateId = (templatesByTypeId.get(typeId) || [])[0]?.id || null;
        if (templateModal) {
          templateModal.hidden = false;
        }
        renderWideTemplateEditor();
      }

      function closeTemplateEditor() {
        if (templateModal) {
          templateModal.hidden = true;
        }
        if (templateNestedDialog) {
          templateNestedDialog.hidden = true;
        }
        activeNestedEditor = null;
        templateEditorTypeId = null;
        selectedTemplateId = null;
        setTemplateStatus("");
      }

      function renderIconPanel() {
        if (!iconPanelOpen) {
          return "";
        }
        const filterValue = activeEditor?.iconSearch || "";
        const filteredIcons = iconNames
          .filter((icon) => iconMatchesSearch(icon, filterValue))
          .slice(0, filterValue ? 600 : 200);
        const helper = filterValue
          ? `Showing ${filteredIcons.length} matching icons`
          : `Showing first ${filteredIcons.length} - type to search all ${iconNames.length} icons`;
        return `
          <div class="icon-selector">
            <input type="search" data-icon-search placeholder="Search all icons..." value="${escapeHtml(filterValue)}" autocomplete="off">
            <p>${escapeHtml(helper)}</p>
            <div class="icon-grid">
              ${filteredIcons.map((icon) => `<button class="${icon === selectedIcon ? "is-selected" : ""}" type="button" data-pick-icon="${escapeHtml(icon)}" aria-label="${escapeHtml(icon)}"><ph-${escapeHtml(sanitizeIconName(icon))} weight="duotone" aria-hidden="true"></ph-${escapeHtml(sanitizeIconName(icon))}></button>`).join("")}
            </div>
          </div>
        `;
      }

      function renderColorPanel() {
        if (!colorPanelOpen) {
          return "";
        }
        const distinctColors = [...new Set([
          selectedColor,
          ...elementTypes.map((type) => sanitizeColor(type.color, DEFAULT_ELEMENT_TYPE_COLOR)),
          ...TYPE_COLOR_CHOICES
        ])].slice(0, 18);
        return `
          <div class="color-selector">
            <div class="color-grid">
              ${distinctColors.map((color) => `<button class="${color === selectedColor ? "is-selected" : ""}" type="button" data-pick-color="${escapeHtml(color)}" style="--swatch-color: ${escapeHtml(color)}" aria-label="${escapeHtml(color)}"></button>`).join("")}
            </div>
            <label class="color-hex-field">
              <span style="--swatch-color: ${escapeHtml(selectedColor)}"></span>
              <input type="text" data-color-hex value="${escapeHtml(selectedColor)}" maxlength="9" spellcheck="false">
            </label>
          </div>
        `;
      }

      function renderEditor() {
        if (!activeEditor) {
          editorHost.innerHTML = "";
          return;
        }
        const isEdit = activeEditor.mode === "edit";
        editorHost.innerHTML = `
          <form class="element-type-editor" data-type-editor>
            <input type="text" name="type-name" placeholder="Type name" value="${escapeHtml(activeEditor.name || "")}" autocomplete="off">
            <div class="type-editor-controls">
              <button class="secondary-action type-editor-choice" type="button" data-toggle-icon-picker>${createTypeIconMarkup(selectedIcon, selectedColor)} Icon</button>
              <button class="secondary-action type-editor-choice" type="button" data-toggle-color-picker><span class="type-color-dot" style="--type-color: ${escapeHtml(selectedColor)}"></span> Color</button>
            </div>
            ${renderIconPanel()}
            ${renderColorPanel()}
            <div class="type-editor-actions">
              <button class="secondary-action compact-action" type="button" data-cancel-type-editor>Cancel</button>
              <button class="primary-action compact-action" type="submit">${isEdit ? "Save" : "Add"}</button>
            </div>
          </form>
        `;
        const focusSelector = activeEditor.focusTarget === "iconSearch"
          ? "[data-icon-search]"
          : activeEditor.focusTarget === "colorHex"
            ? "[data-color-hex]"
            : '[name="type-name"]';
        const focusTarget = editorHost.querySelector(focusSelector);
        focusTarget?.focus();
        if (focusTarget?.setSelectionRange) {
          const end = focusTarget.value.length;
          focusTarget.setSelectionRange(end, end);
        }
      }

      function openEditor(mode, type = null) {
        activeNestedEditor = null;
        activeEditor = { mode, typeId: type?.id || null, name: type?.name || "", iconSearch: "", focusTarget: "name" };
        selectedIcon = sanitizeIconName(type?.icon || DEFAULT_ELEMENT_TYPE_ICON);
        selectedColor = sanitizeColor(type?.color || DEFAULT_ELEMENT_TYPE_COLOR, DEFAULT_ELEMENT_TYPE_COLOR);
        iconPanelOpen = false;
        colorPanelOpen = false;
        renderEditor();
      }

      function closeEditor() {
        activeEditor = null;
        iconPanelOpen = false;
        colorPanelOpen = false;
        renderEditor();
      }

      async function openTypesModal() {
        modal.hidden = false;
        setTypeStatus("");
        iconNames = await getPhosphorIconNames();
        try {
          await refreshTypeTemplateData();
        } catch (error) {
          setTypeStatus(`Could not load templates: ${getReadableError(error)}`, "error");
        }
        renderTypeList();
      }

      function closeTypesModal() {
        modal.hidden = true;
        closeTemplateEditor();
        closeEditor();
        activeNestedEditor = null;
      }

      function handleAddClick() {
        openEditor("add");
      }

      async function saveType(event) {
        event.preventDefault();
        if (!activeEditor) {
          return;
        }
        const form = event.target;
        const submitButton = form.querySelector('[type="submit"]');
        const name = String(new FormData(form).get("type-name") || "").trim();
        if (!name) {
          setTypeStatus("Type name is required.", "error");
          form.querySelector('[name="type-name"]')?.focus();
          return;
        }
        if (submitButton) {
          submitButton.disabled = true;
        }
        setTypeStatus(activeEditor.mode === "edit" ? "Saving type..." : "Adding type...");
        try {
          if (activeEditor.mode === "edit") {
            const { error } = await window.centralisSupabase
              .from("element_types")
              .update({ name, icon: selectedIcon || DEFAULT_ELEMENT_TYPE_ICON, color: sanitizeColor(selectedColor, DEFAULT_ELEMENT_TYPE_COLOR) })
              .eq("id", activeEditor.typeId)
              .eq("user_id", universe.user_id);
            if (error) throw error;
          } else {
            const { data: createdType, error } = await window.centralisSupabase
              .from("element_types")
              .insert({ user_id: universe.user_id, name, icon: selectedIcon || DEFAULT_ELEMENT_TYPE_ICON, color: sanitizeColor(selectedColor, DEFAULT_ELEMENT_TYPE_COLOR) })
              .select("id")
              .single();
            if (error) throw error;
            const { data: createdTemplate, error: templateError } = await window.centralisSupabase
              .from("element_type_templates")
              .insert({
                element_type_id: createdType.id,
                name: `${name} Template`,
                description: null,
                is_default: false,
                source_default_template_id: null
              })
              .select("id")
              .single();
            if (templateError) {
              throw new Error(`Type was created, but its starter template could not be created. ${getReadableError(templateError)}`);
            }
            const { error: sectionError } = await window.centralisSupabase
              .from("element_template_sections")
              .insert({
                template_id: createdTemplate.id,
                name: "Overview",
                description: null,
                sort_order: 10,
                is_default: false,
                is_hidden: false,
                source_default_section_id: null
              });
            if (sectionError) {
              throw new Error(`Type was created, but its starter template could not be created. ${getReadableError(sectionError)}`);
            }
          }
          const completedMode = activeEditor.mode;
          syncElementTypes(await fetchElementTypes());
          await refreshTypeTemplateData();
          renderTypeList();
          closeEditor();
          refreshNodesForTypeChanges();
          setTypeStatus(completedMode === "edit" ? "Type saved." : "Type added.", "success");
        } catch (error) {
          setTypeStatus(`Could not save type: ${getReadableError(error)}`, "error");
        }
        if (submitButton) {
          submitButton.disabled = false;
        }
      }

      async function deleteType(typeId) {
        const type = getElementTypeById(typeId);
        if (!type || !window.confirm(`Delete "${type.name}"? Elements using this type will be set to No Type.`)) {
          return;
        }
        setTypeStatus("Deleting type...");
        try {
          const { error: updateError } = await window.centralisSupabase
            .from("elements")
            .update({ element_type_id: null, rich_template_id: null, updated_at: new Date().toISOString() })
            .eq("element_type_id", typeId);
          if (updateError) throw updateError;
          const { error: deleteError } = await window.centralisSupabase
            .from("element_types")
            .delete()
            .eq("id", typeId)
            .eq("user_id", universe.user_id);
          if (deleteError) throw deleteError;
          syncElementTypes(await fetchElementTypes());
          await refreshTypeTemplateData();
          renderTypeList();
          closeEditor();
          refreshNodesForTypeChanges();
          setTypeStatus("Type deleted.", "success");
        } catch (error) {
          setTypeStatus(`Could not delete type: ${getReadableError(error)}`, "error");
        }
      }

      function handleEditorClick(event) {
        const iconButton = event.target.closest("[data-toggle-icon-picker]");
        const colorButton = event.target.closest("[data-toggle-color-picker]");
        const cancelButton = event.target.closest("[data-cancel-type-editor]");
        const pickedIcon = event.target.closest("[data-pick-icon]");
        const pickedColor = event.target.closest("[data-pick-color]");
        if (iconButton) {
          iconPanelOpen = !iconPanelOpen;
          colorPanelOpen = false;
          activeEditor.focusTarget = iconPanelOpen ? "iconSearch" : "name";
          renderEditor();
        } else if (colorButton) {
          colorPanelOpen = !colorPanelOpen;
          iconPanelOpen = false;
          activeEditor.focusTarget = colorPanelOpen ? "colorHex" : "name";
          renderEditor();
        } else if (cancelButton) {
          closeEditor();
        } else if (pickedIcon) {
          selectedIcon = sanitizeIconName(pickedIcon.dataset.pickIcon);
          iconPanelOpen = false;
          renderEditor();
        } else if (pickedColor) {
          selectedColor = sanitizeColor(pickedColor.dataset.pickColor, DEFAULT_ELEMENT_TYPE_COLOR);
          renderEditor();
        }
      }

      function handleEditorInput(event) {
        if (!activeEditor) return;
        if (event.target.matches('[name="type-name"]')) {
          activeEditor.name = event.target.value;
          activeEditor.focusTarget = "name";
        } else if (event.target.matches("[data-icon-search]")) {
          activeEditor.iconSearch = event.target.value;
          activeEditor.focusTarget = "iconSearch";
          renderEditor();
        } else if (event.target.matches("[data-color-hex]")) {
          activeEditor.focusTarget = "colorHex";
          const value = event.target.value.trim();
          if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
            selectedColor = value;
          }
        }
      }

      function handleListClick(event) {
        const editButton = event.target.closest("[data-edit-type]");
        const deleteButton = event.target.closest("[data-delete-type]");
        if (editButton) {
          openEditor("edit", getElementTypeById(editButton.dataset.editType));
        } else if (deleteButton) {
          deleteType(deleteButton.dataset.deleteType);
        }
      }

      function handleTemplateEditorClick(event) {
        if (templateNestedDialog && event.target === templateNestedDialog) {
          activeNestedEditor = null;
          renderWideTemplateEditor();
          return;
        }
        const selectTemplateButton = event.target.closest("[data-select-template]");
        const addTemplateButton = event.target.closest("[data-wide-add-template]");
        const editTemplateButton = event.target.closest("[data-edit-template]");
        const deleteTemplateButton = event.target.closest("[data-delete-template]");
        const duplicateTemplateButton = event.target.closest("[data-duplicate-template]");
        const addSectionButton = event.target.closest("[data-add-section]");
        const editSectionButton = event.target.closest("[data-edit-section]");
        const deleteSectionButton = event.target.closest("[data-delete-section]");
        const toggleSectionButton = event.target.closest("[data-toggle-section-hidden]");
        const addFieldButton = event.target.closest("[data-add-field]");
        const editFieldButton = event.target.closest("[data-edit-field]");
        const deleteFieldButton = event.target.closest("[data-delete-field]");
        const toggleFieldButton = event.target.closest("[data-toggle-field-hidden]");
        const cancelNestedButton = event.target.closest("[data-cancel-nested-editor]");

        if (selectTemplateButton) {
          selectedTemplateId = selectTemplateButton.dataset.selectTemplate;
          activeNestedEditor = null;
          renderWideTemplateEditor();
        } else if (addTemplateButton) {
          activeNestedEditor = { kind: "template", mode: "add", typeId: templateEditorTypeId, data: {} };
          renderWideTemplateEditor();
        } else if (editTemplateButton) {
          const template = [...templatesByTypeId.values()].flat().find((item) => item.id === editTemplateButton.dataset.editTemplate);
          activeNestedEditor = { kind: "template", mode: "edit", typeId: template?.element_type_id, templateId: template?.id, data: template || {} };
          renderWideTemplateEditor();
        } else if (deleteTemplateButton) {
          deleteTemplate(deleteTemplateButton.dataset.deleteTemplate);
        } else if (duplicateTemplateButton) {
          duplicateTemplate(duplicateTemplateButton.dataset.duplicateTemplate);
        } else if (addSectionButton) {
          activeNestedEditor = { kind: "section", mode: "add", templateId: addSectionButton.dataset.addSection, data: { sort_order: 0 } };
          renderWideTemplateEditor();
        } else if (editSectionButton) {
          const section = [...sectionsByTemplateId.values()].flat().find((item) => item.id === editSectionButton.dataset.editSection);
          activeNestedEditor = { kind: "section", mode: "edit", templateId: section?.template_id, sectionId: section?.id, data: section || {} };
          renderWideTemplateEditor();
        } else if (deleteSectionButton) {
          deleteSection(deleteSectionButton.dataset.deleteSection);
        } else if (toggleSectionButton) {
          toggleSectionHidden(toggleSectionButton.dataset.toggleSectionHidden);
        } else if (addFieldButton) {
          activeNestedEditor = {
            kind: "field",
            mode: "add",
            templateId: addFieldButton.dataset.addField,
            data: {
              field_type: "textarea",
              section_id: addFieldButton.dataset.fieldSection || "",
              sort_order: 0
            }
          };
          renderWideTemplateEditor();
        } else if (editFieldButton) {
          const field = [...fieldsByTemplateId.values()].flat().find((item) => item.id === editFieldButton.dataset.editField);
          activeNestedEditor = { kind: "field", mode: "edit", templateId: field?.template_id, fieldId: field?.id, data: field || {} };
          renderWideTemplateEditor();
        } else if (deleteFieldButton) {
          deleteField(deleteFieldButton.dataset.deleteField);
        } else if (toggleFieldButton) {
          toggleFieldHidden(toggleFieldButton.dataset.toggleFieldHidden);
        } else if (cancelNestedButton) {
          activeNestedEditor = null;
          renderWideTemplateEditor();
        }
      }

      async function saveNestedEditor(event) {
        event.preventDefault();
        if (!activeNestedEditor) return;
        const form = event.target;
        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        try {
          if (activeNestedEditor.kind === "template") {
            const name = String(new FormData(form).get("template-name") || "").trim();
            const description = String(new FormData(form).get("template-description") || "").trim();
            if (!name) throw new Error("Template name is required.");
            const payload = { name, description: description || null };
            const response = activeNestedEditor.mode === "edit"
              ? await window.centralisSupabase.from("element_type_templates").update(payload).eq("id", activeNestedEditor.templateId)
              : await window.centralisSupabase.from("element_type_templates").insert({ ...payload, element_type_id: activeNestedEditor.typeId, is_default: false }).select("id").single();
            if (response.error) throw response.error;
            if (response.data?.id) {
              selectedTemplateId = response.data.id;
            }
          } else if (activeNestedEditor.kind === "section") {
            const formData = new FormData(form);
            const name = String(formData.get("section-name") || "").trim();
            if (!name) throw new Error("Section name is required.");
            const payload = {
              name,
              description: String(formData.get("section-description") || "").trim() || null,
              sort_order: Number(formData.get("section-sort-order") || 0)
            };
            const response = activeNestedEditor.mode === "edit"
              ? await window.centralisSupabase.from("element_template_sections").update(payload).eq("id", activeNestedEditor.sectionId)
              : await window.centralisSupabase.from("element_template_sections").insert({ ...payload, template_id: activeNestedEditor.templateId, is_default: false });
            if (response.error) throw response.error;
          } else if (activeNestedEditor.kind === "field") {
            const formData = new FormData(form);
            const label = String(formData.get("field-label") || "").trim();
            if (!label) throw new Error("Field label is required.");
            const payload = {
              label,
              field_key: normalizeFieldKey(formData.get("field-key") || label),
              field_type: String(formData.get("field-type") || "textarea"),
              section_id: String(formData.get("field-section") || "") || null,
              description: String(formData.get("field-description") || "").trim() || null,
              placeholder: String(formData.get("field-placeholder") || "").trim() || null,
              default_value: String(formData.get("field-default-value") || "").trim() || null,
              options: linesToOptions(formData.get("field-options")),
              is_required: formData.get("field-required") === "on",
              sort_order: Number(formData.get("field-sort-order") || 0),
              updated_at: new Date().toISOString()
            };
            const response = activeNestedEditor.mode === "edit"
              ? await window.centralisSupabase.from("element_type_template_fields").update(payload).eq("id", activeNestedEditor.fieldId)
              : await window.centralisSupabase.from("element_type_template_fields").insert({ ...payload, template_id: activeNestedEditor.templateId, is_default: false });
            if (response.error) throw response.error;
          }
          await refreshTypeTemplateData();
          activeNestedEditor = null;
          renderTypeList();
          renderWideTemplateEditor();
          setTemplateStatus("Template changes saved.", "success");
        } catch (error) {
          setTemplateStatus(`Could not save template changes: ${getReadableError(error)}`, "error");
        } finally {
          if (submitButton) submitButton.disabled = false;
        }
      }

      async function deleteTemplate(templateId) {
        const template = [...templatesByTypeId.values()].flat().find((item) => item.id === templateId);
        if (template?.is_default) {
          setTemplateStatus("Default templates cannot be deleted. Duplicate it if you want a deletable copy.", "error");
          return;
        }
        if (!template || !window.confirm(`Delete "${template.name}"? Elements using it will lose their selected Rich Details template.`)) return;
        setTemplateStatus("Deleting template...");
        try {
          const clearResponse = await window.centralisSupabase
            .from("elements")
            .update({ rich_template_id: null, updated_at: new Date().toISOString() })
            .eq("rich_template_id", templateId);
          if (clearResponse.error) throw clearResponse.error;
          const deleteResponse = await window.centralisSupabase
            .from("element_type_templates")
            .delete()
            .eq("id", templateId);
          if (deleteResponse.error) throw deleteResponse.error;
          setNodes((currentNodes) => currentNodes.map((node) => node.data?.richTemplateId === templateId
            ? { ...node, data: { ...node.data, richTemplateId: null } }
            : node));
          await refreshTypeTemplateData();
          selectedTemplateId = (templatesByTypeId.get(templateEditorTypeId) || [])[0]?.id || null;
          renderTypeList();
          renderWideTemplateEditor();
          setTemplateStatus("Template deleted.", "success");
        } catch (error) {
          setTemplateStatus(`Could not delete template: ${getReadableError(error)}`, "error");
        }
      }

      async function deleteSection(sectionId) {
        const section = [...sectionsByTemplateId.values()].flat().find((item) => item.id === sectionId);
        if (section?.is_default) {
          setTemplateStatus("Default sections can be hidden, but not deleted.", "error");
          return;
        }
        if (!window.confirm("Delete this section? Its fields will become unsectioned.")) return;
        try {
          const response = await window.centralisSupabase.from("element_template_sections").delete().eq("id", sectionId);
          if (response.error) throw response.error;
          await refreshTypeTemplateData();
          renderWideTemplateEditor();
          setTemplateStatus("Section deleted.", "success");
        } catch (error) {
          setTemplateStatus(`Could not delete section: ${getReadableError(error)}`, "error");
        }
      }

      async function deleteField(fieldId) {
        const field = [...fieldsByTemplateId.values()].flat().find((item) => item.id === fieldId);
        if (field?.is_default) {
          setTemplateStatus("Default fields can be hidden, but not deleted.", "error");
          return;
        }
        if (!window.confirm("Delete this field and its saved values?")) return;
        try {
          const response = await window.centralisSupabase.from("element_type_template_fields").delete().eq("id", fieldId);
          if (response.error) throw response.error;
          await refreshTypeTemplateData();
          renderWideTemplateEditor();
          setTemplateStatus("Field deleted.", "success");
        } catch (error) {
          setTemplateStatus(`Could not delete field: ${getReadableError(error)}`, "error");
        }
      }

      async function toggleSectionHidden(sectionId) {
        const section = [...sectionsByTemplateId.values()].flat().find((item) => item.id === sectionId);
        if (!section) return;
        try {
          const response = await window.centralisSupabase
            .from("element_template_sections")
            .update({ is_hidden: !section.is_hidden })
            .eq("id", sectionId);
          if (response.error) throw response.error;
          await refreshTypeTemplateData();
          renderWideTemplateEditor();
          setTemplateStatus(section.is_hidden ? "Section shown." : "Section hidden.", "success");
        } catch (error) {
          setTemplateStatus(`Could not update section visibility: ${getReadableError(error)}`, "error");
        }
      }

      async function toggleFieldHidden(fieldId) {
        const field = [...fieldsByTemplateId.values()].flat().find((item) => item.id === fieldId);
        if (!field) return;
        try {
          const response = await window.centralisSupabase
            .from("element_type_template_fields")
            .update({ is_hidden: !field.is_hidden, updated_at: new Date().toISOString() })
            .eq("id", fieldId);
          if (response.error) throw response.error;
          await refreshTypeTemplateData();
          renderWideTemplateEditor();
          setTemplateStatus(field.is_hidden ? "Field shown." : "Field hidden.", "success");
        } catch (error) {
          setTemplateStatus(`Could not update field visibility: ${getReadableError(error)}`, "error");
        }
      }

      async function duplicateTemplate(templateId) {
        const template = [...templatesByTypeId.values()].flat().find((item) => item.id === templateId);
        if (!template) return;
        setTemplateStatus("Duplicating template...");
        try {
          const { data: newTemplate, error: templateError } = await window.centralisSupabase
            .from("element_type_templates")
            .insert({
              element_type_id: template.element_type_id,
              name: `${template.name || "Template"} Copy`,
              description: template.description || null,
              is_default: false,
              source_default_template_id: null
            })
            .select("*")
            .single();
          if (templateError) throw templateError;

          const sourceSections = sectionsByTemplateId.get(templateId) || [];
          const sourceFields = fieldsByTemplateId.get(templateId) || [];
          const sectionIdMap = new Map();
          if (sourceSections.length) {
            const { data: newSections, error: sectionError } = await window.centralisSupabase
              .from("element_template_sections")
              .insert(sourceSections.map((section) => ({
                template_id: newTemplate.id,
                name: section.name,
                description: section.description || null,
                sort_order: Number(section.sort_order || 0),
                is_default: false,
                is_hidden: Boolean(section.is_hidden)
              })))
              .select("*");
            if (sectionError) throw sectionError;
            sourceSections.forEach((section, index) => {
              if (newSections?.[index]?.id) {
                sectionIdMap.set(section.id, newSections[index].id);
              }
            });
          }

          if (sourceFields.length) {
            const { error: fieldError } = await window.centralisSupabase
              .from("element_type_template_fields")
              .insert(sourceFields.map((field) => ({
                template_id: newTemplate.id,
                section_id: field.section_id ? sectionIdMap.get(field.section_id) || null : null,
                field_key: field.field_key,
                label: getTemplateFieldLabel(field),
                field_type: getTemplateFieldType(field),
                description: field.description || null,
                placeholder: field.placeholder || null,
                default_value: field.default_value || null,
                options: field.options || null,
                is_required: Boolean(field.is_required),
                sort_order: Number(field.sort_order || 0),
                is_default: false,
                is_hidden: Boolean(field.is_hidden)
              })));
            if (fieldError) throw fieldError;
          }

          await refreshTypeTemplateData();
          selectedTemplateId = newTemplate.id;
          renderTypeList();
          renderWideTemplateEditor();
          setTemplateStatus("Template duplicated.", "success");
        } catch (error) {
          setTemplateStatus(`Could not duplicate template: ${getReadableError(error)}`, "error");
        }
      }

      opener.addEventListener("click", openTypesModal);
      closeButton?.addEventListener("click", closeTypesModal);
      addButton?.addEventListener("click", handleAddClick);
      list.addEventListener("click", handleListClick);
      templateCloseButton?.addEventListener("click", closeTemplateEditor);
      templateModal?.addEventListener("click", handleTemplateEditorClick);
      templateModal?.addEventListener("submit", saveNestedEditor);
      editorHost.addEventListener("click", handleEditorClick);
      editorHost.addEventListener("input", handleEditorInput);
      editorHost.addEventListener("submit", saveType);
      return () => {
        opener.removeEventListener("click", openTypesModal);
        closeButton?.removeEventListener("click", closeTypesModal);
        addButton?.removeEventListener("click", handleAddClick);
        list.removeEventListener("click", handleListClick);
        templateCloseButton?.removeEventListener("click", closeTemplateEditor);
        templateModal?.removeEventListener("click", handleTemplateEditorClick);
        templateModal?.removeEventListener("submit", saveNestedEditor);
        editorHost.removeEventListener("click", handleEditorClick);
        editorHost.removeEventListener("input", handleEditorInput);
        editorHost.removeEventListener("submit", saveType);
      };
    }, [syncElementTypes, elementTypeVersion]);

    React.useEffect(() => {
      const cleanup = populateElementTypeSelect();
      return cleanup || undefined;
    }, [elementTypeVersion]);

    React.useEffect(() => {
      const modal = document.getElementById("add-element-modal");
      const form = document.querySelector("[data-element-form]");
      const status = document.querySelector("[data-element-status]");
      if (!modal) {
        return undefined;
      }

      function closeAddElementModal() {
        modal.hidden = true;
        setPendingLink(null);
        form?.reset();
        setElementTypePickerValue("");
        if (status) {
          status.textContent = "";
          status.classList.remove("is-error", "is-success");
        }
      }

      function handleCloseClick(event) {
        if (event.target.closest("[data-close-modal]")) {
          closeAddElementModal();
        }
      }

      function handleBackdropClick(event) {
        if (event.target === modal && modal.dataset.strictModal === undefined) {
          closeAddElementModal();
        }
      }

      function handleEscape(event) {
        if (event.key === "Escape" && !modal.hidden && modal.dataset.strictModal === undefined) {
          closeAddElementModal();
        }
      }

      modal.addEventListener("click", handleCloseClick);
      modal.addEventListener("click", handleBackdropClick);
      document.addEventListener("keydown", handleEscape);
      return () => {
        modal.removeEventListener("click", handleCloseClick);
        modal.removeEventListener("click", handleBackdropClick);
        document.removeEventListener("keydown", handleEscape);
      };
    }, []);

    React.useEffect(() => {
      const controls = getDetailsControls();
      const closeButton = controls?.closeButton;
      const resizeCleanup = setupDetailsPaneResize();

      function handleCloseDetails() {
        setAiChatOpen(false);
        setDetailsNodeId(null);
        setDetailsMode("view");
      }

      if (closeButton) {
        closeButton.addEventListener("click", handleCloseDetails);
      }

      return () => {
        if (closeButton) {
          closeButton.removeEventListener("click", handleCloseDetails);
        }

        if (resizeCleanup) {
          resizeCleanup();
        }
      };
    }, []);

    React.useEffect(() => {
      const button = document.querySelector("[data-open-ai-expert]");
      if (!button) {
        return undefined;
      }

      function handleOpenAiExpert() {
        setRichDetailsNodeId(null);
        setRichDetailsData(null);
        setDetailsNodeId(null);
        setDetailsMode("view");
        setAiChatPopoutOpen(false);
        setAiChatOpen(true);
      }

      button.addEventListener("click", handleOpenAiExpert);
      return () => {
        button.removeEventListener("click", handleOpenAiExpert);
      };
    }, []);

    React.useEffect(() => {
      if (!aiChatOpen && !aiChatPopoutOpen) {
        return;
      }

      loadUniverseAiChat({ syncIfNeeded: true });
    }, [aiChatOpen, aiChatPopoutOpen, loadUniverseAiChat]);

    React.useEffect(() => {
      function handleAiProposalStatusChanged(event) {
        updateAiProposalStatusInState(event.detail?.proposalId, event.detail?.status);
      }

      window.addEventListener("centralis:ai-proposal-status-changed", handleAiProposalStatusChanged);
      return () => {
        window.removeEventListener("centralis:ai-proposal-status-changed", handleAiProposalStatusChanged);
      };
    }, [updateAiProposalStatusInState]);

    React.useEffect(() => {
      if (!aiChatOpen) {
        return;
      }

      renderUniverseAiChatPane(aiChatState, {
        onSync: syncUniverseAiSource,
        onSend: sendUniverseAiMessage,
        onReviewProposal: reviewUniverseAiProposal,
        onDismissProposal: dismissUniverseAiProposal,
        onPopOut: openUniverseAiPopout
      });
    }, [aiChatOpen, aiChatState, syncUniverseAiSource, sendUniverseAiMessage, reviewUniverseAiProposal, dismissUniverseAiProposal, openUniverseAiPopout]);

    React.useEffect(() => {
      if (!aiChatPopoutOpen) {
        return;
      }

      renderUniverseAiChatContent(document.querySelector("[data-ai-popout-content]"), aiChatState, {
        onSync: syncUniverseAiSource,
        onSend: sendUniverseAiMessage,
        onReviewProposal: reviewUniverseAiProposal,
        onDismissProposal: dismissUniverseAiProposal
      });
    }, [aiChatPopoutOpen, aiChatState, syncUniverseAiSource, sendUniverseAiMessage, reviewUniverseAiProposal, dismissUniverseAiProposal]);

    React.useEffect(() => {
      function handleViewDetails(event) {
        const nodeId = event.detail?.nodeId;
        const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);
        if (!node) {
          return;
        }

        async function routeDetailsOpen() {
          if (node.data?.kind === "element" && await elementHasChronicleModules(node.data.recordId)) {
            openChroniclePreview(nodeId);
            return;
          }

          setRichDetailsNodeId(null);
          setRichDetailsData(null);
          setAiChatOpen(false);
          setDetailsNodeId(nodeId);
          setDetailsMode("view");
        }

        routeDetailsOpen();
      }

      function handleOpenRichDetails(event) {
        if (event.detail?.nodeId) {
          openChroniclePreview(event.detail.nodeId);
        }
      }

      window.addEventListener("centralis:view-node-details", handleViewDetails);
      window.addEventListener("centralis:open-rich-details", handleOpenRichDetails);
      return () => {
        window.removeEventListener("centralis:view-node-details", handleViewDetails);
        window.removeEventListener("centralis:open-rich-details", handleOpenRichDetails);
      };
    }, [openChroniclePreview]);

    React.useEffect(() => {
      const modal = document.getElementById("rich-details-modal");
      const body = document.querySelector("[data-rich-details-body]");
      const title = document.querySelector("[data-rich-details-title]");
      const kind = document.querySelector("[data-rich-details-kind]");
      const status = document.querySelector("[data-rich-details-status]");
      const saveButton = document.querySelector("[data-rich-details-save]");
      const editButton = document.querySelector("[data-rich-details-edit]");
      const cancelButton = document.querySelector("[data-rich-details-cancel]");
      const closeButtons = document.querySelectorAll("[data-rich-details-close]");
      const transferWrap = document.querySelector(".rich-details-transfer-menu");
      const transferTrigger = document.querySelector("[data-rich-details-transfer-trigger]");
      const transferMenu = document.querySelector("[data-rich-details-transfer-menu]");
      if (!modal || !body) {
        return undefined;
      }

      let importInput = document.querySelector("[data-rich-details-import-file]");
      if (!importInput) {
        importInput = document.createElement("input");
        importInput.type = "file";
        importInput.accept = "application/json,.json";
        importInput.hidden = true;
        importInput.dataset.richDetailsImportFile = "";
        document.body.appendChild(importInput);
      }

      const node = nodes.find((currentNode) => currentNode.id === richDetailsNodeId);
      let richStatusTimeoutId = 0;
      function closeRichDetails() {
        modal.hidden = true;
        setRichDetailsNodeId(null);
        setRichDetailsData(null);
        setRichDetailsMode("view");
        window.clearTimeout(richStatusTimeoutId);
        if (status) {
          status.textContent = "";
          status.classList.remove("is-error", "is-success", "is-visible");
        }
      }

      function setRichStatus(message, tone = "") {
        if (!status) {
          return;
        }
        window.clearTimeout(richStatusTimeoutId);
        status.textContent = message || "";
        status.classList.toggle("is-error", tone === "error");
        status.classList.toggle("is-success", tone === "success");
        status.classList.toggle("is-visible", Boolean(message));
        if (message && tone) {
          richStatusTimeoutId = window.setTimeout(() => {
            status.textContent = "";
            status.classList.remove("is-error", "is-success", "is-visible");
          }, tone === "error" ? 5200 : 3200);
        }
      }

      function addCustomFieldRow() {
        const list = body.querySelector("[data-custom-fields-list]");
        if (!list) return;
        const wrapper = document.createElement("div");
        wrapper.innerHTML = renderCustomFields([{ id: "", name: "", value: "" }]);
        list.appendChild(wrapper.firstElementChild);
      }

      function renderRichDetails() {
        if (!richDetailsNodeId || !node) {
          modal.hidden = true;
          return;
        }

        const meta = getNodeTypeMeta(node);
        modal.hidden = false;
        if (title) title.textContent = node.data?.name || "Untitled Node";
        if (kind) kind.textContent = "Chronicle Details";
        if (editButton) {
          editButton.hidden = false;
          editButton.textContent = "Edit in Chronicle";
        }
        if (cancelButton) cancelButton.hidden = true;
        if (saveButton) saveButton.hidden = true;
        if (transferWrap) transferWrap.hidden = true;
        if (richDetailsData?.loading) {
          body.innerHTML = '<p class="details-empty">Loading Chronicle modules...</p>';
          return;
        }
        if (richDetailsData?.error) {
          body.innerHTML = `<p class="form-status is-error">Could not load Chronicle modules: ${escapeHtml(richDetailsData.error)}</p>`;
          return;
        }

        const templateMarkup = renderChroniclePreviewModules(richDetailsData);
        body.innerHTML = `
          <div class="rich-details-form rich-details-view">
            <section class="rich-details-section rich-details-images chronicle-preview-images">
              <div class="rich-section-title-row chronicle-preview-image-header">
                <h3>Images</h3>
                <div class="image-actions">
                  <button class="secondary-action image-action-button" type="button" data-generate-image>
                    <ph-sparkle weight="bold" aria-hidden="true"></ph-sparkle>
                    Generate
                  </button>
                  <div class="image-upload-row">
                    <label class="secondary-action image-action-button" for="rich-details-image-upload">
                      <ph-upload-simple weight="bold" aria-hidden="true"></ph-upload-simple>
                      Upload
                    </label>
                    <input id="rich-details-image-upload" type="file" accept="image/*" data-image-upload hidden>
                  </div>
                </div>
              </div>
              ${renderImageGallery(node.data.images, node.id)}
              <p class="form-status image-upload-status" data-image-upload-status role="status"></p>
            </section>
            <section class="rich-details-section rich-details-basics">
              <dl class="rich-template-fields rich-basics-fields">
                <div class="rich-view-field">
                  <dt>Name</dt>
                  <dd>${escapeHtml(node.data?.name || "Untitled Node")}</dd>
                </div>
                <div class="rich-view-field is-textarea-field">
                  <dt>Description</dt>
                  <dd class="${hasMeaningfulValue(node.data?.description) ? "" : "is-empty"}">${hasMeaningfulValue(node.data?.description) ? renderMarkdownDescription(node.data.description) : "--"}</dd>
                </div>
              </dl>
            </section>
            <section class="rich-details-section">
              <h3>Element Type</h3>
              <div class="rich-type-template-stack">
                <span class="details-type-badge" style="--detail-color: ${escapeHtml(meta.color)}">
                  <span class="details-type-icon" aria-hidden="true">
                    <ph-${escapeHtml(meta.icon)} weight="duotone"></ph-${escapeHtml(meta.icon)}>
                  </span>
                  ${escapeHtml(meta.label)}
                </span>
              </div>
            </section>
            ${templateMarkup}
          </div>
        `;

        setupImageGallery(body);
        body.querySelector("[data-generate-image]")?.addEventListener("click", () => {
          window.dispatchEvent(new CustomEvent("centralis:generate-image", {
            detail: { nodeId: node.id, prompt: createImagePrompt(node), source: "rich-details" }
          }));
        });
        body.querySelector("[data-image-upload]")?.addEventListener("change", (event) => {
          const file = event.target.files?.[0];
          if (file) {
            window.dispatchEvent(new CustomEvent("centralis:upload-image", {
              detail: {
                nodeId: node.id,
                file,
                statusElement: body.querySelector("[data-image-upload-status]")
              }
            }));
          }
        });
      }

      function closeRichTransferMenu() {
        if (!transferMenu || !transferTrigger) return;
        transferMenu.hidden = true;
        transferTrigger.setAttribute("aria-expanded", "false");
      }

      function toggleRichTransferMenu(event) {
        event.stopPropagation();
        if (!transferMenu || !transferTrigger) return;
        const willOpen = transferMenu.hidden;
        transferMenu.hidden = !willOpen;
        transferTrigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
      }

      function getOrderedRichTemplateFields() {
        return buildRichTemplateSectionModels(richDetailsData.sections || [], richDetailsData.fields || [])
          .flatMap((section) => section.fields.map((field) => ({ section, field })));
      }

      function getRichFieldPromptValue(form, field, valuesByFieldId) {
        const type = getTemplateFieldType(field);
        const storedValue = getFieldStoredValue(valuesByFieldId, field);
        const control = form?.querySelector(`[name="rich-field:${CSS.escape(field.id)}"]`);
        if (!control) {
          return type === "multi_select" ? storedValue.split("\n").filter(Boolean).join(", ") : storedValue;
        }
        if (type === "checkbox") {
          return control.checked ? "Yes" : "";
        }
        if (type === "multi_select") {
          return [...control.selectedOptions].map((option) => option.value).filter(Boolean).join(", ");
        }
        return control.value || "";
      }

      function buildRichDetailsImagePrompt(form) {
        function appendPromptPart(parts, nextPart) {
          const text = String(nextPart || "").trim();
          if (!text) {
            return false;
          }
          const candidate = [...parts, text].join("\n\n");
          if (candidate.length > MAX_IMAGE_PROMPT_LENGTH) {
            return false;
          }
          parts.push(text);
          return true;
        }

        const valuesByFieldId = new Map((richDetailsData.values || []).map((value) => [value.template_field_id, value]));
        const description = form?.querySelector('[name="rich-description"]')?.value?.trim() || node.data?.description || "";
        const sectionModels = buildRichTemplateSectionModels(richDetailsData.sections || [], richDetailsData.fields || []);
        const summaryValue = sectionModels.flatMap((section) => section.fields)
          .map((field) => {
            const normalizedLabel = getTemplateFieldLabel(field).trim().toLowerCase();
            const normalizedKey = getTemplateFieldKey(field).trim().toLowerCase();
            return normalizedLabel === "summary" || normalizedKey === "summary"
              ? getRichFieldPromptValue(form, field, valuesByFieldId).trim()
              : "";
          })
          .find(Boolean) || "";
        const promptLines = [];
        appendPromptPart(promptLines, "Create a visually rich, cinematic concept image for a universe-building canvas.");
        appendPromptPart(promptLines, summaryValue || description ? `Description: ${summaryValue || description}` : "");

        sectionModels.forEach((section) => {
          const fieldLines = section.fields
            .map((field) => {
              const label = getTemplateFieldLabel(field);
              const normalizedLabel = label.trim().toLowerCase();
              const normalizedKey = getTemplateFieldKey(field).trim().toLowerCase();
              if (["summary", "importance"].includes(normalizedLabel) || ["summary", "importance"].includes(normalizedKey)) {
                return "";
              }
              if (normalizedLabel.includes("note") || normalizedKey.includes("note")) {
                return "";
              }
              const rawValue = getRichFieldPromptValue(form, field, valuesByFieldId).trim();
              const value = rawValue.length > 700 ? `${rawValue.slice(0, 697).trimEnd()}...` : rawValue;
              return value ? `- ${label}: ${value}` : "";
            })
            .filter(Boolean);
          if (fieldLines.length) {
            appendPromptPart(promptLines, `${section.name || "Details"}:\n${fieldLines.join("\n")}`);
          }
        });

        if (promptLines.join("\n\n").length >= MAX_IMAGE_PROMPT_LENGTH - 180) {
          appendPromptPart(promptLines, "Some rich detail fields were omitted to keep the prompt within the image generation limit.");
        }

        const customFieldLines = [...(form?.querySelectorAll("[data-custom-field-row]") || [])]
          .map((row) => {
            const label = row.querySelector('[name="custom-name"]')?.value?.trim();
            const value = row.querySelector('[name="custom-value"]')?.value?.trim();
            return label && value ? `- ${label}: ${value}` : "";
          })
          .filter(Boolean);
        if (customFieldLines.length) {
          appendPromptPart(promptLines, `Custom details:\n${customFieldLines.join("\n")}`);
        }

        appendPromptPart(promptLines, "Use the details as visual guidance. Avoid UI elements, captions, watermarks, and readable text unless the prompt explicitly asks for them.");
        return clampImagePrompt(promptLines.join("\n\n"));
      }

      function buildRichDetailsSimpleExportPayload() {
        if (!node || !richDetailsData?.template) {
          throw new Error("This element does not have a Rich Details template.");
        }

        const valuesByFieldId = new Map((richDetailsData.values || []).map((value) => [value.template_field_id, value]));
        return {
          format: RICH_DETAILS_EXPORT_FORMAT,
          exported_at: new Date().toISOString(),
          element_id: node.data?.recordId || toRecordId(node.id),
          template_id: richDetailsData.template.id,
          description: node.data?.description || "",
          fields: getOrderedRichTemplateFields().map(({ field }) => ({
            field_key: getTemplateFieldKey(field),
            value: getRichDetailsExportValue(field, getFieldStoredValue(valuesByFieldId, field), true)
          }))
        };
      }

      function buildRichDetailsTemplatePayload() {
        if (!node || !richDetailsData?.template) {
          throw new Error("This element does not have a Rich Details template.");
        }

        return {
          format: RICH_DETAILS_EXPORT_FORMAT,
          exported_at: new Date().toISOString(),
          element: {
            id: node.data?.recordId || toRecordId(node.id),
            name: node.data?.name || "Untitled Node"
          },
          template: {
            id: richDetailsData.template.id,
            name: richDetailsData.template.name || "Rich Details Template"
          },
          description: "",
          fields: getOrderedRichTemplateFields().map(({ section, field }) => {
            const choices = getFieldChoices(field);
            return {
              field_key: getTemplateFieldKey(field),
              label: getTemplateFieldLabel(field),
              field_type: getTemplateFieldType(field),
              section: section.id === "unsectioned" ? "" : section.name,
              description: field.description || "",
              placeholder: field.placeholder || "",
              is_required: Boolean(field.is_required),
              ...(choices.length ? { allowed_values: choices } : {}),
              value: getRichDetailsExportValue(field, "", false)
            };
          })
        };
      }

      function exportRichDetails(includeValues) {
        try {
          const payload = includeValues
            ? buildRichDetailsSimpleExportPayload()
            : buildRichDetailsTemplatePayload();
          const date = new Date().toISOString().slice(0, 10);
          const label = includeValues ? "details" : "template";
          downloadJsonFile(`centralis-rich-${label}-${safeFileSlug(node?.data?.name)}-${date}.json`, payload);
          setRichStatus(includeValues ? "Rich details exported." : "Rich details template downloaded.", "success");
        } catch (error) {
          setRichStatus(getReadableError(error), "error");
        }
      }

      function normalizeRichDetailsImportFields(payload) {
        const isSimplePayload = Object.prototype.hasOwnProperty.call(payload, "element_id")
          || Object.prototype.hasOwnProperty.call(payload, "template_id");
        return (payload.fields || []).map((field) => ({
          field_key: field?.field_key || "",
          label: isSimplePayload ? "" : field?.label || "",
          value: field?.value
        }));
      }

      function getImportedRichDescription(payload) {
        if (Object.prototype.hasOwnProperty.call(payload, "description")) {
          return { present: true, value: String(payload.description || "").trim() };
        }
        if (payload.element && Object.prototype.hasOwnProperty.call(payload.element, "description")) {
          return { present: true, value: String(payload.element.description || "").trim() };
        }
        return { present: false, value: "" };
      }

      async function importRichDetailsPayload(payload) {
        if (!node || !window.centralisSupabase) {
          throw new Error("Rich Details import is not available.");
        }
        if (!payload || payload.format !== RICH_DETAILS_EXPORT_FORMAT || !Array.isArray(payload.fields)) {
          throw new Error("This is not a supported Centralis Rich Details JSON file.");
        }
        if (!richDetailsData?.template) {
          throw new Error("This element does not have a Rich Details template.");
        }

        const currentFieldsByKey = new Map();
        const currentFieldsByLabel = new Map();
        (richDetailsData.fields || []).forEach((field) => {
          currentFieldsByKey.set(normalizeFieldKey(getTemplateFieldKey(field)), field);
          currentFieldsByLabel.set(normalizeFieldKey(getTemplateFieldLabel(field)), field);
        });

        const matchedByFieldId = new Map();
        let skipped = 0;
        normalizeRichDetailsImportFields(payload).forEach((importedField) => {
          const key = normalizeFieldKey(importedField?.field_key);
          const labelKey = normalizeFieldKey(importedField?.label);
          const field = (key && currentFieldsByKey.get(key)) || (labelKey && currentFieldsByLabel.get(labelKey));
          if (!field) {
            skipped += 1;
            return;
          }
          matchedByFieldId.set(field.id, { field, value: normalizeRichDetailsFieldValue(field, importedField?.value) });
        });

        const importedDescription = getImportedRichDescription(payload);
        const now = new Date().toISOString();
        const clearResponses = [];
        const upsertRows = [];
        matchedByFieldId.forEach(({ field, value }) => {
          if (!hasMeaningfulValue(value)) {
            clearResponses.push(window.centralisSupabase
              .from("element_template_field_values")
              .delete()
              .eq("element_id", node.data.recordId)
              .eq("template_field_id", field.id));
            return;
          }
          upsertRows.push({
            element_id: node.data.recordId,
            template_field_id: field.id,
            value,
            updated_at: now
          });
        });

        if (clearResponses.length) {
          throwFirstSupabaseError(await Promise.all(clearResponses));
        }
        if (upsertRows.length) {
          const { error } = await window.centralisSupabase
            .from("element_template_field_values")
            .upsert(upsertRows, { onConflict: "element_id,template_field_id" });
          if (error) throw error;
        }

        if (importedDescription.present) {
          const { error: descriptionError } = await window.centralisSupabase
            .from("elements")
            .update({
              description: importedDescription.value || null,
              updated_at: now
            })
            .eq("id", node.data.recordId);
          if (descriptionError) throw descriptionError;

          setNodes((currentNodes) => currentNodes.map((currentNode) => currentNode.id === node.id
            ? {
                ...currentNode,
                data: {
                  ...currentNode.data,
                  description: importedDescription.value
                }
              }
            : currentNode));
        }

        const nextNode = importedDescription.present
          ? {
              ...node,
              data: {
                ...node.data,
                description: importedDescription.value
              }
            }
          : node;
        const refreshed = await fetchRichDetailsData(nextNode);
        setRichDetailsData({ loading: false, error: "", ...refreshed });
        setRichDetailsMode("view");
        setRichStatus(`Imported ${upsertRows.length} values, cleared ${clearResponses.length}, skipped ${skipped}${importedDescription.present ? ", updated description" : ""}.`, "success");
      }

      async function importRichDetailsFile(file) {
        if (!file) return;
        setRichStatus("Importing rich details...");
        try {
          await importRichDetailsPayload(JSON.parse(await file.text()));
        } catch (error) {
          setRichStatus(`Could not import rich details: ${getReadableError(error)}`, "error");
        } finally {
          if (importInput) {
            importInput.value = "";
          }
        }
      }

      function handleRichTransferMenuClick(event) {
        const importButton = event.target.closest("[data-rich-details-import]");
        const exportButton = event.target.closest("[data-rich-details-export]");
        const templateButton = event.target.closest("[data-rich-details-template]");
        if (!importButton && !exportButton && !templateButton) return;
        closeRichTransferMenu();
        if (importButton) {
          importInput?.click();
        } else if (exportButton) {
          exportRichDetails(true);
        } else if (templateButton) {
          exportRichDetails(false);
        }
      }

      function handleRichTransferOutsideClick(event) {
        if (!transferWrap?.contains(event.target)) {
          closeRichTransferMenu();
        }
      }

      function handleRichTransferKeydown(event) {
        if (event.key === "Escape") {
          closeRichTransferMenu();
        }
      }

      function handleRichImportInputChange(event) {
        importRichDetailsFile(event.target.files?.[0]);
      }

      function showRichEditMode() {
        if (node?.data?.recordId) {
          window.location.href = getChronicleEditorUrl(node);
        }
      }

      function cancelRichEditMode() {
        setRichStatus("");
        setRichDetailsMode("view");
      }

      async function saveRichDetails() {
        const form = body.querySelector("[data-rich-details-form]");
        if (!node || !form || !window.centralisSupabase) return;
        const formData = new FormData(form);
        const name = String(formData.get("rich-name") || "").trim();
        const description = String(formData.get("rich-description") || "").trim();
        const elementTypeId = String(formData.get("details-element-type") || "");
        if (!name) {
          setRichStatus("Name is required.", "error");
          form.querySelector('[name="rich-name"]')?.focus();
          return;
        }

        if (saveButton) {
          saveButton.disabled = true;
        }
        setRichStatus("Saving rich details...");
        try {
          const typeChanged = elementTypeId !== (node.data?.elementType?.id || "");
          const { error: elementError } = await window.centralisSupabase
            .from("elements")
            .update({
              name,
              description: description || null,
              element_type_id: elementTypeId || null,
              rich_template_id: typeChanged ? null : node.data?.richTemplateId || null,
              updated_at: new Date().toISOString()
            })
            .eq("id", node.data.recordId);
          if (elementError) throw elementError;

          const fields = richDetailsData?.fields || [];
          const valueResponses = await Promise.all(fields.map((field) => {
            const fieldType = getTemplateFieldType(field);
            let value = "";
            const control = form.querySelector(`[name="rich-field:${CSS.escape(field.id)}"]`);
            if (fieldType === "checkbox") {
              value = control?.checked ? "true" : "";
            } else if (fieldType === "multi_select") {
              value = control ? [...control.selectedOptions].map((option) => option.value).join("\n") : "";
            } else {
              value = String(control?.value || "").trim();
            }

            if (!hasMeaningfulValue(value)) {
              return window.centralisSupabase
                .from("element_template_field_values")
                .delete()
                .eq("element_id", node.data.recordId)
                .eq("template_field_id", field.id);
            }

            return window.centralisSupabase
              .from("element_template_field_values")
              .upsert({
                element_id: node.data.recordId,
                template_field_id: field.id,
                value,
                updated_at: new Date().toISOString()
              }, { onConflict: "element_id,template_field_id" });
          }));
          throwFirstSupabaseError(valueResponses);

          const customRows = [...form.querySelectorAll("[data-custom-field-row]")];
          const customResponses = await Promise.all(customRows.map((row, index) => {
            const id = row.dataset.customFieldId;
            const customName = String(row.querySelector('[name="custom-name"]')?.value || "").trim();
            const customValue = String(row.querySelector('[name="custom-value"]')?.value || "").trim();
            if (!hasMeaningfulValue(customName) && !hasMeaningfulValue(customValue)) {
              return id
                ? window.centralisSupabase.from("element_custom_fields").delete().eq("id", id)
                : Promise.resolve();
            }

            if (id) {
              return window.centralisSupabase
                .from("element_custom_fields")
                .update({ name: customName || "Untitled Field", value: customValue || null, sort_order: index })
                .eq("id", id);
            }

            return window.centralisSupabase
              .from("element_custom_fields")
              .insert({ element_id: node.data.recordId, name: customName || "Untitled Field", value: customValue || null, sort_order: index });
          }));
          throwFirstSupabaseError(customResponses);

          const deletedCustomFieldIds = [...form.querySelectorAll('[name="deleted-custom-field-id"]')]
            .map((input) => input.value)
            .filter(Boolean);
          if (deletedCustomFieldIds.length) {
            const { error: deleteCustomError } = await window.centralisSupabase
              .from("element_custom_fields")
              .delete()
              .in("id", deletedCustomFieldIds);
            if (deleteCustomError) throw deleteCustomError;
          }

          const nextElementType = getElementTypeById(elementTypeId);
          const nextRichTemplateId = typeChanged ? null : node.data?.richTemplateId || null;
          setNodes((currentNodes) => currentNodes.map((currentNode) => currentNode.id === node.id
            ? {
                ...currentNode,
                data: {
                  ...currentNode.data,
                  name,
                  description,
                  elementType: nextElementType,
                  richTemplateId: nextRichTemplateId
              }
            }
            : currentNode));
          setRichStatus("Rich details saved.", "success");
          setRichDetailsMode("view");
          setRichDetailsData({ loading: false, error: "", ...await fetchRichDetailsData({
            ...node,
            data: {
              ...node.data,
              name,
              description,
              elementType: nextElementType,
              richTemplateId: nextRichTemplateId
            }
          }) });
        } catch (error) {
          setRichStatus(`Could not save rich details: ${getReadableError(error)}`, "error");
        } finally {
          if (saveButton) {
            saveButton.disabled = false;
          }
        }
      }

      renderRichDetails();
      editButton?.addEventListener("click", showRichEditMode);
      cancelButton?.addEventListener("click", cancelRichEditMode);
      saveButton?.addEventListener("click", saveRichDetails);
      transferTrigger?.addEventListener("click", toggleRichTransferMenu);
      transferMenu?.addEventListener("click", handleRichTransferMenuClick);
      importInput?.addEventListener("change", handleRichImportInputChange);
      document.addEventListener("click", handleRichTransferOutsideClick);
      document.addEventListener("keydown", handleRichTransferKeydown);
      closeButtons.forEach((button) => button.addEventListener("click", closeRichDetails));
      return () => {
        window.clearTimeout(richStatusTimeoutId);
        editButton?.removeEventListener("click", showRichEditMode);
        cancelButton?.removeEventListener("click", cancelRichEditMode);
        saveButton?.removeEventListener("click", saveRichDetails);
        transferTrigger?.removeEventListener("click", toggleRichTransferMenu);
        transferMenu?.removeEventListener("click", handleRichTransferMenuClick);
        importInput?.removeEventListener("change", handleRichImportInputChange);
        document.removeEventListener("click", handleRichTransferOutsideClick);
        document.removeEventListener("keydown", handleRichTransferKeydown);
        closeButtons.forEach((button) => button.removeEventListener("click", closeRichDetails));
      };
    }, [richDetailsNodeId, richDetailsData, richDetailsMode, nodes, edges, openChroniclePreview]);


    React.useEffect(() => {
      async function handleUploadImage(event) {
        const { nodeId, file } = event.detail || {};
        const node = nodes.find((currentNode) => currentNode.id === nodeId);
        const status = event.detail?.statusElement || document.querySelector("[data-image-upload-status]");
        if (!node || !file || !window.centralisSupabase) {
          return;
        }

        if (status) {
          status.textContent = "Uploading image...";
          status.classList.remove("is-error", "is-success");
        }

        const body = new FormData();
        body.append("objectId", node.data.recordId);
        body.append("file", file);

        try {
          await callEdgeFunction("upload-object-image", { body });
          await refreshNodeImages(node);
        } catch (error) {
          if (status) {
            status.textContent = `Could not upload image: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
          return;
        }

        if (status) {
          status.textContent = "Image uploaded.";
          status.classList.add("is-success");
        }
      }

      window.addEventListener("centralis:upload-image", handleUploadImage);
      return () => window.removeEventListener("centralis:upload-image", handleUploadImage);
    }, [nodes, refreshNodeImages]);

    React.useEffect(() => {
      const modal = document.getElementById("generate-image-modal");
      const form = document.querySelector("[data-generate-image-form]");
      const promptInput = document.querySelector("[data-generate-image-prompt]");
      const subtitle = document.querySelector("[data-generate-image-subtitle]");
      const status = document.querySelector("[data-generate-image-status]");
      if (!modal || !form || !promptInput) {
        return undefined;
      }

      function closeGenerateModal() {
        modal.hidden = true;
        form.dataset.generating = "false";
        setPendingImageGeneration(null);
        form.reset();
        if (status) {
          status.textContent = "";
          status.classList.remove("is-error", "is-success");
        }
      }

      function handleGenerateRequest(event) {
        const node = nodes.find((currentNode) => currentNode.id === event.detail?.nodeId);
        if (!node) {
          return;
        }

        setPendingImageGeneration({ nodeId: node.id, source: event.detail?.source || "" });
        promptInput.maxLength = MAX_IMAGE_PROMPT_LENGTH;
        promptInput.value = clampImagePrompt(event.detail?.prompt || createImagePrompt(node));
        if (subtitle) {
          subtitle.textContent = event.detail?.source === "rich-details"
            ? `Review or edit the generated image prompt for ${node.data.name || "this node"}.`
            : `Describe the image you want to generate for ${node.data.name || "this node"}.`;
        }
        modal.hidden = false;
        promptInput.focus();
      }

      function handleCloseClick(event) {
        if (event.target.closest("[data-close-generate-image]")) {
          closeGenerateModal();
        }
      }

      function handleBackdropClick(event) {
        event.stopPropagation();
      }

      function handleEscape(event) {
        if (event.key === "Escape" && !modal.hidden) {
          closeGenerateModal();
        }
      }

      async function handleGenerateSubmit(event) {
        event.preventDefault();
        if (form.dataset.generating === "true") {
          return;
        }

        const node = nodes.find((currentNode) => currentNode.id === pendingImageGeneration?.nodeId);
        const submitButton = form.querySelector('[type="submit"]');
        if (!node || !window.centralisSupabase) {
          return;
        }

        form.dataset.generating = "true";
        const meta = getNodeTypeMeta(node);
        const isRichDetailsGeneration = pendingImageGeneration?.source === "rich-details";
        const extraPrompt = clampImagePrompt(promptInput.value);
        closeGenerateModal();
        setDetailsMode("view");
        showCanvasToast("Image generation started. It will finish in the background.", "success");

        try {
          await callEdgeFunction("generate-object-image", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              objectId: node.data.recordId,
              objectKind: node.data.kind,
              elementType: isRichDetailsGeneration ? "" : meta.label,
              name: isRichDetailsGeneration ? "" : node.data.name,
              description: isRichDetailsGeneration ? "" : node.data.description,
              extraPrompt
            })
          });
          await refreshNodeImages(node);
          showCanvasToast(`Image generated for ${node.data.name || "this element"}.`, "success");
        } catch (error) {
          showCanvasToast(`Could not generate image: ${getReadableError(error)}`, "error");
          return;
        }

        if (submitButton) {
          submitButton.disabled = false;
        }
        form.dataset.generating = "false";
      }

      window.addEventListener("centralis:generate-image", handleGenerateRequest);
      modal.addEventListener("click", handleCloseClick);
      modal.addEventListener("click", handleBackdropClick);
      document.addEventListener("keydown", handleEscape);
      form.addEventListener("submit", handleGenerateSubmit);
      return () => {
        window.removeEventListener("centralis:generate-image", handleGenerateRequest);
        modal.removeEventListener("click", handleCloseClick);
        modal.removeEventListener("click", handleBackdropClick);
        document.removeEventListener("keydown", handleEscape);
        form.removeEventListener("submit", handleGenerateSubmit);
      };
    }, [nodes, pendingImageGeneration, refreshNodeImages]);

    React.useEffect(() => {
      const controls = getDetailsControls();
      if (!controls) {
        return undefined;
      }

      function handleEdit() {
        if (detailsNodeId) {
          setDetailsMode("edit");
        }
      }

      function handleCancel() {
        setDetailsMode("view");
      }

      function handleOpenInChronicle() {
        if (detailsNodeId) {
          const node = nodes.find((currentNode) => currentNode.id === detailsNodeId);
          if (node?.data?.kind === "element" && node.data.recordId) {
            const universeSegment = encodeURIComponent(universeId || "");
            const elementSegment = encodeURIComponent(node.data.recordId);
            window.location.href = `chronicle-editor.html#universe/${universeSegment}/element/${elementSegment}`;
          }
        }
      }

      async function handleSave() {
        const node = nodes.find((currentNode) => currentNode.id === detailsNodeId);
        const form = controls.content?.querySelector("[data-details-form]");
        const status = controls.content?.querySelector("[data-details-status]");
        if (!node || !form || !window.centralisSupabase) {
          return;
        }

        const saveButton = controls.saveButton;
        const formData = new FormData(form);
        const name = String(formData.get("details-name") || "").trim();
        const description = String(formData.get("details-description") || "").trim();
        const elementTypeId = String(formData.get("details-element-type") || "");

        if (!name) {
          if (status) {
            status.textContent = "Name is required.";
            status.classList.add("is-error");
          }
          form.querySelector('[name="details-name"]')?.focus();
          return;
        }

        if (saveButton) {
          saveButton.disabled = true;
        }
        if (status) {
          status.textContent = "Saving...";
          status.classList.remove("is-error", "is-success");
        }

        const isUniverse = node.data?.kind === "universe";
        const tableName = isUniverse ? "universes" : "elements";
        const payload = {
          name,
          description: description || null,
          updated_at: new Date().toISOString()
        };

        if (!isUniverse) {
          payload.element_type_id = elementTypeId || null;
        }

        const { error } = await window.centralisSupabase
          .from(tableName)
          .update(payload)
          .eq("id", node.data.recordId);

        if (error) {
          if (status) {
            status.textContent = `Could not save: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
          if (saveButton) {
            saveButton.disabled = false;
          }
          return;
        }

        const nextElementType = isUniverse ? null : getElementTypeById(elementTypeId);
        setNodes((currentNodes) => currentNodes.map((currentNode) => {
          if (currentNode.id !== node.id) {
            return currentNode;
          }

          return {
            ...currentNode,
            data: {
              ...currentNode.data,
              name,
              description,
              ...(isUniverse ? {} : { elementType: nextElementType })
            }
          };
        }));

        if (isUniverse) {
          universe.name = name;
          universe.description = description;
          if (titleElement) {
            titleElement.textContent = name;
          }
        }

        if (saveButton) {
          saveButton.disabled = false;
        }
        setDetailsMode("view");
      }

      controls.richButton?.addEventListener("click", handleOpenInChronicle);
      controls.editButton?.addEventListener("click", handleEdit);
      controls.cancelButton?.addEventListener("click", handleCancel);
      controls.saveButton?.addEventListener("click", handleSave);
      return () => {
        controls.richButton?.removeEventListener("click", handleOpenInChronicle);
        controls.editButton?.removeEventListener("click", handleEdit);
        controls.cancelButton?.removeEventListener("click", handleCancel);
        controls.saveButton?.removeEventListener("click", handleSave);
      };
    }, [detailsNodeId, nodes]);

    React.useEffect(() => {
      if (aiChatOpen) {
        return;
      }

      if (!detailsNodeId) {
        hideDetailsPane();
        return;
      }

      renderDetailsPane(detailsNodeId, nodes, edges, openLinkedNodeDetails, detailsMode);
    }, [aiChatOpen, detailsNodeId, detailsMode, nodes, edges, openLinkedNodeDetails]);

    React.useEffect(() => {
      const form = document.querySelector("[data-element-form]");
      const status = document.querySelector("[data-element-status]");
      const aiCheckbox = document.querySelector("[data-generate-element-ai]");
      const submitButton = document.querySelector("[data-element-submit]");
      const addElementModal = document.getElementById("add-element-modal");
      const reviewModal = document.getElementById("review-element-modal");
      const generationOverlay = document.getElementById("generate-element-overlay");
      const reviewForm = document.querySelector("[data-review-element-form]");
      const reviewType = document.querySelector("[data-review-element-type]");
      const reviewName = document.querySelector("[data-review-element-name]");
      const reviewDescription = document.querySelector("[data-review-element-description]");
      const reviewStatus = document.querySelector("[data-review-element-status]");
      const reviewCancelButton = document.querySelector("[data-review-element-cancel]");
      const reviewRegenerateButton = document.querySelector("[data-review-element-regenerate]");
      if (!form) {
        return undefined;
      }

      let reviewSeed = null;

      function setElementStatus(message, tone = "") {
        if (!status) return;
        status.textContent = message || "";
        status.classList.toggle("is-error", tone === "error");
        status.classList.toggle("is-success", tone === "success");
      }

      function setReviewStatus(message, tone = "") {
        if (!reviewStatus) return;
        reviewStatus.textContent = message || "";
        reviewStatus.classList.toggle("is-error", tone === "error");
        reviewStatus.classList.toggle("is-success", tone === "success");
      }

      function setElementGenerationOverlay(visible) {
        if (!generationOverlay) return;
        generationOverlay.hidden = !visible;
      }

      function readElementForm() {
        const formData = new FormData(form);
        return {
          name: String(formData.get("element-name") || "").trim(),
          description: String(formData.get("element-description") || "").trim(),
          elementTypeId: String(formData.get("element-type") || ""),
          generateWithAi: Boolean(formData.get("generate-element-ai"))
        };
      }

      function updateSubmitLabel() {
        if (!submitButton) return;
        submitButton.textContent = aiCheckbox?.checked ? "Generate" : "Add Element";
      }

      function validateElementInput(input) {
        if (!input.elementTypeId) {
          setElementStatus("Element Type is required.", "error");
          getElementTypePicker()?.trigger?.focus();
          return false;
        }
        if (!input.generateWithAi && !input.name) {
          setElementStatus("Name is required.", "error");
          form.querySelector('[name="element-name"]')?.focus();
          return false;
        }
        return true;
      }

      async function createElementRecord(input) {
        const name = String(input.name || "").trim();
        const description = String(input.description || "").trim();
        const elementTypeId = String(input.elementTypeId || "");
        if (!name) {
          throw new Error("Name is required.");
        }
        if (!elementTypeId) {
          throw new Error("Element Type is required.");
        }

        if (submitButton) {
          submitButton.disabled = true;
        }

        setElementStatus("Adding element...");

        pushCanvasHistory();
        const id = createId();
        const position = pendingLink?.position || {
          x: Number(universe.canvas_position_x ?? 120) + 360 + (nodes.length - 1) * 32,
          y: Number(universe.canvas_position_y ?? 120) + 40 + (nodes.length - 1) * 22
        };

        try {
        const elementOwnerId = getElementOwnerId();
        if (!elementOwnerId) {
          throw new Error("Could not determine the signed-in user for this element.");
        }
        const { data: savedElement, error } = await withTimeout(window.centralisSupabase
          .from("elements")
          .insert({
            id,
            user_id: elementOwnerId,
            universe_id: universe.id,
            element_type_id: elementTypeId || null,
            name,
            description: description || null,
            position_x: position.x,
            position_y: position.y
          })
          .select("id,name,description,position_x,position_y,element_type_id")
          .single(), "Creating element");

        if (error) {
          if (status) {
            status.textContent = `Could not add element: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
          if (submitButton) {
            submitButton.disabled = false;
          }
          return;
        }

        const nextNode = toElementNode(savedElement);
        nextNode.data.format = universeFormat;
        setNodes((currentNodes) => [
          ...currentNodes,
          applyLayerOverlayToNode(nextNode, activeLayerIdRef.current, layerEntriesRef.current, layerAssignmentsRef.current)
        ]);

        if (pendingLink?.sourceNodeId) {
          const linkId = createId();
          const sourceRecordId = toRecordId(pendingLink.sourceNodeId);
          const targetRecordId = savedElement.id;
          const edge = {
            id: linkId,
            source: pendingLink.sourceNodeId,
            target: `element:${savedElement.id}`,
            sourceHandle: pendingLink.sourceHandle || "right",
            targetHandle: "left",
            type: "deletable",
            zIndex: LINK_EDGE_Z_INDEX,
            data: { recordId: linkId, format: universeFormat },
            style: {
              stroke: universeFormat.strokeColor,
              strokeWidth: universeFormat.strokeWidth,
              strokeDasharray: getStrokeDasharray(universeFormat.strokeStyle)
            }
          };

          setEdges((currentEdges) => [...currentEdges, edge]);

          const { error: linkError } = await window.centralisSupabase
            .from("element_links")
            .insert({
              id: linkId,
              universe_id: universe.id,
              source_element_id: sourceRecordId,
              target_element_id: targetRecordId,
              path_type: "deletable"
            });

          if (linkError) {
            console.error("Could not create element link:", linkError);
            setEdges((currentEdges) => currentEdges.filter((currentEdge) => currentEdge.id !== linkId));
          }
        }

        setPendingLink(null);
        form.reset();
        setElementTypePickerValue("");
        updateSubmitLabel();
        setElementStatus("");
        if (addElementModal) addElementModal.hidden = true;
        } catch (error) {
          setElementStatus(`Could not add element: ${getReadableError(error)}`, "error");
          if (submitButton) {
            submitButton.disabled = false;
          }
          throw error;
        }

        if (submitButton) {
          submitButton.disabled = false;
        }
      }

      async function generateElementDraft(seed) {
        const elementType = getElementTypeById(seed.elementTypeId);
        if (!elementType) {
          throw new Error("Choose a valid element type before generating.");
        }
        return callEdgeFunction("generate-universe-element", {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            universe: getGenerateElementsUniverseContext(),
            elementType: {
              id: elementType.id,
              name: elementType.name || "Untitled Type"
            },
            existingElements: getExistingElementContext(80),
            name: seed.name,
            description: seed.description
          })
        });
      }

      function openReviewElementDialog(seed, draft) {
        const elementType = getElementTypeById(seed.elementTypeId);
        reviewSeed = { ...seed, elementTypeName: elementType?.name || "Untitled Type" };
        if (reviewType) reviewType.value = reviewSeed.elementTypeName;
        if (reviewName) reviewName.value = draft.name || "";
        if (reviewDescription) reviewDescription.value = draft.description || "";
        setReviewStatus("");
        if (addElementModal) addElementModal.hidden = true;
        if (reviewModal) reviewModal.hidden = false;
        window.setTimeout(() => reviewName?.focus({ preventScroll: true }), 0);
      }

      async function handleAiGenerate(input) {
        if (submitButton) submitButton.disabled = true;
        setElementStatus("Generating element...");
        setElementGenerationOverlay(true);
        try {
          const draft = await generateElementDraft(input);
          if (!draft?.name || !draft?.description) {
            throw new Error("The generator did not return a name and description.");
          }
          openReviewElementDialog(input, draft);
          setElementStatus("");
        } catch (error) {
          setElementStatus(`Could not generate element: ${getReadableError(error)}`, "error");
        } finally {
          setElementGenerationOverlay(false);
          if (submitButton) submitButton.disabled = false;
        }
      }

      async function handleSubmit(event) {
        event.preventDefault();
        const input = readElementForm();
        if (!validateElementInput(input)) return;
        if (input.generateWithAi) {
          await handleAiGenerate(input);
          return;
        }
        try {
          await createElementRecord(input);
        } catch (_error) {
          // createElementRecord already writes the inline Add Element error.
        }
      }

      function handleReviewCancel() {
        if (reviewModal) reviewModal.hidden = true;
        setReviewStatus("");
        if (addElementModal) addElementModal.hidden = false;
      }

      async function handleReviewRegenerate() {
        if (!reviewSeed) return;
        if (reviewRegenerateButton) reviewRegenerateButton.disabled = true;
        const finalizeButton = reviewForm?.querySelector('[type="submit"]');
        if (finalizeButton) finalizeButton.disabled = true;
        setReviewStatus("Generating again...");
        setElementGenerationOverlay(true);
        try {
          const draft = await generateElementDraft(reviewSeed);
          if (reviewName) reviewName.value = draft.name || "";
          if (reviewDescription) reviewDescription.value = draft.description || "";
          setReviewStatus("");
        } catch (error) {
          setReviewStatus(`Could not generate element: ${getReadableError(error)}`, "error");
        } finally {
          setElementGenerationOverlay(false);
          if (reviewRegenerateButton) reviewRegenerateButton.disabled = false;
          if (finalizeButton) finalizeButton.disabled = false;
        }
      }

      async function handleReviewFinalize(event) {
        event.preventDefault();
        if (!reviewSeed) return;
        const finalizeButton = reviewForm?.querySelector('[type="submit"]');
        if (finalizeButton) finalizeButton.disabled = true;
        setReviewStatus("Adding element...");
        const finalInput = {
          name: String(reviewName?.value || "").trim(),
          description: String(reviewDescription?.value || "").trim(),
          elementTypeId: reviewSeed.elementTypeId
        };
        try {
          if (!finalInput.name) {
            throw new Error("Name is required.");
          }
          await createElementRecord(finalInput);
          if (reviewModal) reviewModal.hidden = true;
          reviewSeed = null;
          setReviewStatus("");
        } catch (error) {
          setReviewStatus(`Could not add element: ${getReadableError(error)}`, "error");
        } finally {
          if (finalizeButton) finalizeButton.disabled = false;
        }
      }

      updateSubmitLabel();
      form.addEventListener("submit", handleSubmit);
      aiCheckbox?.addEventListener("change", updateSubmitLabel);
      reviewCancelButton?.addEventListener("click", handleReviewCancel);
      reviewRegenerateButton?.addEventListener("click", handleReviewRegenerate);
      reviewForm?.addEventListener("submit", handleReviewFinalize);
      return () => {
        form.removeEventListener("submit", handleSubmit);
        aiCheckbox?.removeEventListener("change", updateSubmitLabel);
        reviewCancelButton?.removeEventListener("click", handleReviewCancel);
        reviewRegenerateButton?.removeEventListener("click", handleReviewRegenerate);
        reviewForm?.removeEventListener("submit", handleReviewFinalize);
      };
    }, [nodes.length, pendingLink, universeFormat]);

    React.useEffect(() => {
      function handleRequestDelete(event) {
        setPendingDeleteElement(event.detail);
        const modal = document.getElementById("delete-element-modal");
        if (modal) {
          modal.hidden = false;
        }
      }

      window.addEventListener("centralis:request-delete-element", handleRequestDelete);
      return () => window.removeEventListener("centralis:request-delete-element", handleRequestDelete);
    }, []);

    React.useEffect(() => {
      const modal = document.getElementById("delete-element-modal");
      const cancelButton = document.querySelector("[data-cancel-delete-element]");
      const confirmButton = document.querySelector("[data-confirm-delete-element]");

      if (!modal || !cancelButton || !confirmButton) {
        return undefined;
      }

      function closeDeleteModal() {
        modal.hidden = true;
        setPendingDeleteElement(null);
      }

      async function confirmDelete() {
        if (!pendingDeleteElement?.elementId) {
          closeDeleteModal();
          return;
        }

        pushCanvasHistory();
        confirmButton.disabled = true;

        try {
          await deleteElementRecords([pendingDeleteElement.elementId]);
        } catch (error) {
          console.error("Could not delete element:", error);
          setTransferStatus(`Could not delete element: ${getReadableError(error)}`, "error");
          confirmButton.disabled = false;
          return;
        }

        setEdges((currentEdges) => currentEdges.filter((edge) => (
          edge.source !== pendingDeleteElement.nodeId &&
          edge.target !== pendingDeleteElement.nodeId
        )));
        setNodes((currentNodes) => currentNodes.filter((node) => node.id !== pendingDeleteElement.nodeId));
        confirmButton.disabled = false;
        closeDeleteModal();
      }

      cancelButton.addEventListener("click", closeDeleteModal);
      confirmButton.addEventListener("click", confirmDelete);
      return () => {
        cancelButton.removeEventListener("click", closeDeleteModal);
        confirmButton.removeEventListener("click", confirmDelete);
      };
    }, [pendingDeleteElement]);

    async function handleConnect(connection) {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return;
      }
      if (isGroupNodeId(connection.source) || isGroupNodeId(connection.target) || isNoteNodeId(connection.source) || isNoteNodeId(connection.target)) {
        return;
      }
      pushCanvasHistory();

      const id = createId();
      const sourceRecordId = toRecordId(connection.source);
      const targetRecordId = toRecordId(connection.target);
      const edge = {
        id,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || "right",
        targetHandle: connection.targetHandle || "left",
        type: "deletable",
        zIndex: LINK_EDGE_Z_INDEX,
        data: { recordId: id, format: universeFormat },
        style: {
          stroke: universeFormat.strokeColor,
          strokeWidth: universeFormat.strokeWidth,
          strokeDasharray: getStrokeDasharray(universeFormat.strokeStyle)
        }
      };

      setEdges((currentEdges) => [...currentEdges, edge]);

      const { error } = await window.centralisSupabase
        .from("element_links")
        .insert({
          id,
          universe_id: universe.id,
          source_element_id: sourceRecordId,
          target_element_id: targetRecordId,
          stroke_color: universeFormat.strokeColor,
          stroke_width: universeFormat.strokeWidth,
          stroke_style: universeFormat.strokeStyle,
          path_type: universeFormat.pathType
        });

      if (error) {
        console.error("Could not create element link:", error);
        setEdges((currentEdges) => currentEdges.filter((currentEdge) => currentEdge.id !== id));
      }
    }

    async function deleteSelectedElements() {
      const selectedElementNodes = getSelectedElementNodes();
      if (!selectedElementNodes.length) {
        setTransferStatus("Select one or more element nodes to delete.", "error");
        return;
      }
      const count = selectedElementNodes.length;
      const confirmed = window.confirm(`Delete ${count} selected ${count === 1 ? "element" : "elements"} and all connected links?`);
      if (!confirmed) {
        return;
      }
      pushCanvasHistory();

      const recordIds = selectedElementNodes.map((node) => node.data.recordId).filter(Boolean);
      const selectedNodeIds = new Set(selectedElementNodes.map((node) => node.id));
      setTransferStatus(`Deleting ${count} ${count === 1 ? "element" : "elements"}...`);

      try {
        await deleteElementRecords(recordIds);

        setDetailsNodeId((currentId) => selectedNodeIds.has(currentId) ? null : currentId);
        setRichDetailsNodeId((currentId) => selectedNodeIds.has(currentId) ? null : currentId);
        setEdges((currentEdges) => currentEdges.filter((edge) => (
          !selectedNodeIds.has(edge.source) &&
          !selectedNodeIds.has(edge.target)
        )));
        setNodes((currentNodes) => currentNodes.filter((node) => !selectedNodeIds.has(node.id)));
        setLayerAssignments((currentAssignments) => currentAssignments.filter((assignment) => !recordIds.includes(assignment.element_id)));
        setTransferStatus(`Deleted ${count} ${count === 1 ? "element" : "elements"}.`, "success");
      } catch (error) {
        setTransferStatus(`Could not delete selected elements: ${getReadableError(error)}`, "error");
      }
    }

    function getViewportCenterPosition() {
      const wrapperRect = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowInstance.current || !wrapperRect) {
        return { x: Number(universe.canvas_position_x || 120) + 360, y: Number(universe.canvas_position_y || 120) + 80 };
      }
      return reactFlowInstance.current.project({
        x: wrapperRect.width / 2,
        y: wrapperRect.height / 2
      });
    }

    async function createNoteAt(position = getViewportCenterPosition()) {
      if (!window.centralisSupabase) {
        setTransferStatus("Supabase is not available.", "error");
        return null;
      }

      const id = createId();
      const payload = {
        id,
        universe_id: universe.id,
        title: "Note",
        content: "",
        position_x: Math.round(Number(position.x || 0)),
        position_y: Math.round(Number(position.y || 0)),
        width: DEFAULT_NOTE_WIDTH,
        height: DEFAULT_NOTE_HEIGHT,
        bg_color: DEFAULT_NOTE_BG_COLOR,
        border_color: DEFAULT_NOTE_BORDER_COLOR,
        text_color: DEFAULT_NOTE_TEXT_COLOR,
        is_collapsed: false
      };

      pushCanvasHistory();
      const { data, error } = await window.centralisSupabase
        .from("canvas_notes")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        setTransferStatus(`Could not create note: ${error.message}`, "error");
        return null;
      }

      const noteNode = toNoteNode(data || payload);
      setNodes((currentNodes) => [
        ...currentNodes.map((node) => ({ ...node, selected: false })),
        { ...noteNode, selected: true }
      ]);
      setTransferStatus("Note created.", "success");
      return noteNode;
    }

    async function deleteNoteNode(node) {
      if (!node?.data?.recordId || !window.centralisSupabase) {
        return;
      }
      const confirmed = window.confirm(`Delete note "${node.data.title || "Note"}"?`);
      if (!confirmed) {
        return;
      }

      pushCanvasHistory();
      const { error } = await window.centralisSupabase
        .from("canvas_notes")
        .delete()
        .eq("id", node.data.recordId);

      if (error) {
        setTransferStatus(`Could not delete note: ${error.message}`, "error");
        return;
      }

      setNodes((currentNodes) => currentNodes.filter((currentNode) => currentNode.id !== node.id));
      setTransferStatus("Note deleted.", "success");
    }

    function scheduleNoteSave(nodeId, patch, flush = false) {
      setNodes((currentNodes) => currentNodes.map((node) => {
        if (node.id !== nodeId || node.data?.kind !== "note") {
          return node;
        }
        return {
          ...node,
          data: {
            ...node.data,
            ...patch
          }
        };
      }));
      nodesRef.current = nodesRef.current.map((node) => {
        if (node.id !== nodeId || node.data?.kind !== "note") {
          return node;
        }
        return {
          ...node,
          data: {
            ...node.data,
            ...patch
          }
        };
      });

      const existingTimer = noteSaveTimersRef.current.get(nodeId);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      const save = async () => {
        noteSaveTimersRef.current.delete(nodeId);
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node?.data?.recordId || node.data.kind !== "note" || !window.centralisSupabase) {
          return;
        }
        const { error } = await window.centralisSupabase
          .from("canvas_notes")
          .update({
            title: node.data.title || "Note",
            content: node.data.content || null,
            updated_at: new Date().toISOString()
          })
          .eq("id", node.data.recordId);
        if (error) {
          console.error("Could not save note:", error);
        }
      };

      if (flush) {
        save();
      } else {
        noteSaveTimersRef.current.set(nodeId, window.setTimeout(save, 650));
      }
    }

    function resizeNoteNode(nodeId, width, height, persist = false) {
      const nextWidth = Math.max(180, Math.round(Number(width || DEFAULT_NOTE_WIDTH)));
      const nextHeight = Math.max(120, Math.round(Number(height || DEFAULT_NOTE_HEIGHT)));
      setNodes((currentNodes) => currentNodes.map((node) => (
        node.id === nodeId
          ? {
            ...node,
            style: { ...(node.style || {}), width: nextWidth, height: nextHeight },
            data: {
              ...node.data,
              expandedWidth: nextWidth,
              expandedHeight: nextHeight
            }
          }
          : node
      )));
      if (!persist || !window.centralisSupabase) {
        return;
      }
      const node = nodesRef.current.find((item) => item.id === nodeId);
      const noteId = node?.data?.recordId || toRecordId(nodeId);
      window.centralisSupabase
        .from("canvas_notes")
        .update({ width: nextWidth, height: nextHeight, updated_at: new Date().toISOString() })
        .eq("id", noteId)
        .then(({ error }) => {
          if (error) {
            console.error("Could not save note size:", error);
          }
        });
    }

    async function toggleNoteCollapsed(nodeId, collapsed) {
      if (!nodeId) return;
      const noteNode = nodesRef.current.find((node) => node.id === nodeId);
      const expandedWidth = Number(noteNode?.data?.expandedWidth || noteNode?.style?.width || DEFAULT_NOTE_WIDTH);
      const expandedHeight = Number(noteNode?.data?.expandedHeight || noteNode?.style?.height || DEFAULT_NOTE_HEIGHT);
      setNodes((currentNodes) => currentNodes.map((node) => {
        if (node.id !== nodeId || node.data?.kind !== "note") {
          return node;
        }
        return {
          ...node,
          style: {
            ...(node.style || {}),
            width: collapsed ? 260 : Number(node.data.expandedWidth || expandedWidth),
            height: collapsed ? 72 : Number(node.data.expandedHeight || expandedHeight)
          },
          data: {
            ...node.data,
            collapsed,
            expandedWidth,
            expandedHeight
          }
        };
      }));

      const noteId = noteNode?.data?.recordId || toRecordId(nodeId);
      if (!noteId || !window.centralisSupabase) {
        return;
      }
      const { error } = await window.centralisSupabase
        .from("canvas_notes")
        .update({
          is_collapsed: collapsed,
          width: expandedWidth,
          height: expandedHeight,
          updated_at: new Date().toISOString()
        })
        .eq("id", noteId);
      if (error) {
        console.error("Could not update note collapse state:", error);
      }
    }

    function handleConnectEnd(event) {
      const targetElement = event.target instanceof Element ? event.target : null;
      const targetIsPane = Boolean(targetElement?.classList?.contains("react-flow__pane"));
      const targetIsGroupCanvas = Boolean(targetElement?.closest(".group-flow-node"));
      const targetIsConcreteNode = Boolean(targetElement?.closest(".element-flow-node, .universe-flow-node, .note-flow-node, .react-flow__handle"));
      if ((!targetIsPane && !targetIsGroupCanvas) || targetIsConcreteNode || !reactFlowInstance.current || !reactFlowWrapper.current) {
        return;
      }

      const state = window.__centralisConnectionStart;
      if (!state?.sourceNodeId) {
        return;
      }
      if (isGroupNodeId(state.sourceNodeId) || isNoteNodeId(state.sourceNodeId)) {
        window.__centralisConnectionStart = null;
        return;
      }

      const rect = reactFlowWrapper.current.getBoundingClientRect();
      const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX;
      const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY;
      if (typeof clientX !== "number" || typeof clientY !== "number") {
        return;
      }

      const position = reactFlowInstance.current.project({
        x: clientX - rect.left,
        y: clientY - rect.top
      });

      setPendingLink({
        sourceNodeId: state.sourceNodeId,
        sourceHandle: state.sourceHandle || "right",
        position
      });

      const modal = document.getElementById("add-element-modal");
      if (modal) {
        modal.hidden = false;
        modal.querySelector('[name="element-name"]')?.focus();
      }
    }

    async function handleEdgesChange(changes) {
      if (changes.some((change) => change.type === "remove")) {
        pushCanvasHistory();
      }
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));

      const removedEdges = changes.filter((change) => change.type === "remove");
      if (!removedEdges.length) {
        return;
      }

      await Promise.all(removedEdges.map((change) => window.centralisSupabase
        .from("element_links")
        .delete()
        .eq("id", change.id)));
    }

    function setTransferStatus(message, tone = "") {
      const status = document.querySelector("[data-canvas-transfer-status]");
      if (!status) return;
      window.clearTimeout(transferStatusTimerRef.current);
      status.textContent = message || "";
      status.classList.toggle("is-error", tone === "error");
      status.classList.toggle("is-success", tone === "success");
      status.classList.toggle("is-fading", false);
      if (message && tone) {
        transferStatusTimerRef.current = window.setTimeout(() => {
          status.classList.add("is-fading");
          transferStatusTimerRef.current = window.setTimeout(() => {
            status.textContent = "";
            status.classList.remove("is-error", "is-success", "is-fading");
          }, 260);
        }, tone === "error" ? 7000 : 4200);
      }
    }

    function showCanvasToast(message, tone = "") {
      const container = getCanvasToastContainer();
      const toast = document.createElement("div");
      toast.className = "chronicle-toast";
      toast.classList.toggle("is-error", tone === "error");
      toast.classList.toggle("is-success", tone === "success");
      toast.setAttribute("role", tone === "error" ? "alert" : "status");
      toast.textContent = message;
      container.appendChild(toast);

      window.setTimeout(() => {
        toast.classList.add("is-hiding");
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
      }, tone === "error" ? 5200 : 3200);
    }

    function getCanvasToastContainer() {
      let container = document.querySelector("[data-canvas-toast-stack]");
      if (container) {
        return container;
      }
      container = document.createElement("div");
      container.className = "chronicle-toast-stack";
      container.dataset.canvasToastStack = "true";
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "true");
      document.body.appendChild(container);
      return container;
    }

    function getSelectedElementNodes() {
      return nodesRef.current.filter((node) => node.selected && node.data?.kind === "element");
    }

    function getSelectedUngroupedElementNodes() {
      return getSelectedElementNodes().filter((node) => !node.parentId && !node.data?.groupId);
    }

    function getSelectedGroupableNodes() {
      return nodesRef.current.filter((node) => {
        if (!node.selected || node.parentId) {
          return false;
        }
        return node.data?.kind === "element" || node.data?.kind === "group";
      });
    }

    function estimateCanvasNodeSize(node) {
      return estimateNodeSize(node, universeFormatRef.current);
    }

    function getGroupedChildClampPosition(node, groupNode) {
      if (!node?.parentId || !groupNode || groupNode.data?.collapsed) {
        return node?.position || { x: 0, y: 0 };
      }

      const paddingX = 24;
      const paddingTop = 60;
      const paddingBottom = 24;
      const childSize = estimateCanvasNodeSize(node);
      const groupWidth = Number(groupNode.style?.width || groupNode.measured?.width || groupNode.width || groupNode.data?.expandedWidth || 280);
      const groupHeight = Number(groupNode.style?.height || groupNode.measured?.height || groupNode.height || groupNode.data?.expandedHeight || 190);
      const maxX = Math.max(paddingX, groupWidth - paddingX - childSize.width);
      const maxY = Math.max(paddingTop, groupHeight - paddingBottom - childSize.height);
      return {
        x: Math.round(Math.min(Math.max(Number(node.position?.x || 0), paddingX), maxX)),
        y: Math.round(Math.min(Math.max(Number(node.position?.y || 0), paddingTop), maxY))
      };
    }

    function clampGroupedChildPositions(currentNodes) {
      const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
      let changed = false;
      const nextNodes = currentNodes.map((node) => {
        if (node.data?.kind !== "element" || !node.parentId) {
          return node;
        }

        const groupNode = nodesById.get(node.parentId);
        const position = getGroupedChildClampPosition(node, groupNode);
        if (position.x === Math.round(Number(node.position?.x || 0)) && position.y === Math.round(Number(node.position?.y || 0))) {
          return node;
        }

        changed = true;
        return { ...node, position };
      });
      return changed ? nextNodes : currentNodes;
    }

    function getGroupBounds(selectedNodes) {
      const padding = 44;
      const minX = Math.min(...selectedNodes.map((node) => node.position.x));
      const minY = Math.min(...selectedNodes.map((node) => node.position.y));
      const maxX = Math.max(...selectedNodes.map((node) => {
        const size = estimateCanvasNodeSize(node);
        return node.position.x + size.width;
      }));
      const maxY = Math.max(...selectedNodes.map((node) => {
        const size = estimateCanvasNodeSize(node);
        return node.position.y + size.height;
      }));

      return {
        x: Math.round(minX - padding),
        y: Math.round(minY - padding - 28),
        width: Math.max(280, Math.round(maxX - minX + padding * 2)),
        height: Math.max(190, Math.round(maxY - minY + padding * 2 + 28)),
        padding
      };
    }

    function getGroupFitPatch(groupNode, childNodes, allNodes = nodesRef.current) {
      const padding = 44;
      const headerOffset = 28;
      if (!groupNode) {
        return null;
      }
      const nodesById = new Map(allNodes.map((node) => [node.id, node]));
      const parentPosition = groupNode.parentId
        ? getAbsoluteNodePosition(nodesById.get(groupNode.parentId), nodesById)
        : { x: 0, y: 0 };
      if (!childNodes.length) {
        return {
          group: {
            x: Math.round(Number(groupNode.position?.x || 0)),
            y: Math.round(Number(groupNode.position?.y || 0)),
            width: 280,
            height: 190
          },
          children: new Map()
        };
      }

      const absoluteRects = childNodes.map((node) => {
        const rect = getNodeAbsoluteRect(node, allNodes);
        return { node, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      const minX = Math.min(...absoluteRects.map((rect) => rect.x));
      const minY = Math.min(...absoluteRects.map((rect) => rect.y));
      const maxX = Math.max(...absoluteRects.map((rect) => rect.x + rect.width));
      const maxY = Math.max(...absoluteRects.map((rect) => rect.y + rect.height));
      const groupAbsolute = {
        x: Math.round(minX - padding),
        y: Math.round(minY - padding - headerOffset),
        width: Math.max(280, Math.round(maxX - minX + padding * 2)),
        height: Math.max(190, Math.round(maxY - minY + padding * 2 + headerOffset))
      };
      const group = {
        ...groupAbsolute,
        x: Math.round(groupAbsolute.x - parentPosition.x),
        y: Math.round(groupAbsolute.y - parentPosition.y)
      };
      const children = new Map(absoluteRects.map((rect) => [
        rect.node.id,
        {
          x: Math.round(rect.x - groupAbsolute.x),
          y: Math.round(rect.y - groupAbsolute.y)
        }
      ]));
      return { group, children };
    }

    function setGroupDropTarget(groupNodeId) {
      const nextId = groupNodeId || "";
      if (dropTargetGroupIdRef.current === nextId) {
        return;
      }
      dropTargetGroupIdRef.current = nextId;
      setDropTargetGroupId(nextId);
    }

    function getNodeAbsoluteRect(node, allNodes = nodesRef.current) {
      const nodesById = new Map(allNodes.map((item) => [item.id, item]));
      const position = getAbsoluteNodePosition(node, nodesById);
      const size = estimateCanvasNodeSize(node);
      return {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        centerX: position.x + size.width / 2,
        centerY: position.y + size.height / 2
      };
    }

    function isGroupDropCandidate(node) {
      if (node?.data?.kind === "element") {
        return !node.parentId && !node.data?.groupId;
      }
      return node?.data?.kind === "group";
    }

    function isGroupDescendant(candidateGroupNode, ancestorGroupNode, nodesById) {
      let parentId = candidateGroupNode?.parentId || "";
      while (parentId) {
        if (parentId === ancestorGroupNode?.id) {
          return true;
        }
        parentId = nodesById.get(parentId)?.parentId || "";
      }
      return false;
    }

    function findDropTargetGroup(draggedNode, allNodes = nodesRef.current) {
      if (!isGroupDropCandidate(draggedNode)) {
        return null;
      }

      const nodesById = new Map(allNodes.map((node) => [node.id, node]));
      const draggedRect = getNodeAbsoluteRect(draggedNode, allNodes);
      const candidateGroups = allNodes
        .filter((node) => {
          if (node.data?.kind !== "group" || node.id === draggedNode.id || node.id === draggedNode.parentId || node.data?.collapsed) {
            return false;
          }
          if (draggedNode.data?.kind === "group" && isGroupDescendant(node, draggedNode, nodesById)) {
            return false;
          }
          return true;
        })
        .map((groupNode) => {
          const groupRect = getNodeAbsoluteRect(groupNode, allNodes);
          const isInside = draggedRect.centerX >= groupRect.x
            && draggedRect.centerX <= groupRect.x + groupRect.width
            && draggedRect.centerY >= groupRect.y
            && draggedRect.centerY <= groupRect.y + groupRect.height;
          return {
            groupNode,
            area: groupRect.width * groupRect.height,
            isInside
          };
        })
        .filter((candidate) => candidate.isInside)
        .sort((a, b) => a.area - b.area);

      return candidateGroups[0]?.groupNode || null;
    }

    function fitGroupsInNodes(currentNodes, groupIds) {
      let nextNodes = currentNodes;
      const groupUpdates = [];
      const childUpdates = [];
      [...new Set(groupIds.filter(Boolean))].forEach((groupId) => {
        const groupNodeId = String(groupId).startsWith("group:") ? groupId : `group:${groupId}`;
        const groupNode = nextNodes.find((node) => node.id === groupNodeId);
        if (!groupNode) {
          return;
        }
        const childNodes = nextNodes.filter((node) => node.parentId === groupNodeId);
        const patch = getGroupFitPatch(groupNode, childNodes, nextNodes);
        if (!patch) {
          return;
        }
        groupUpdates.push({
          id: groupNode.data.recordId,
          parentGroupId: groupNode.data?.parentGroupId || toRecordId(groupNode.parentId),
          ...patch.group,
          collapsed: Boolean(groupNode.data?.collapsed)
        });
        patch.children.forEach((position, nodeId) => {
          const childNode = childNodes.find((node) => node.id === nodeId);
          if (childNode?.data?.recordId) {
            childUpdates.push({
              id: childNode.data.recordId,
              kind: childNode.data.kind,
              ...position
            });
          }
        });
        nextNodes = nextNodes.map((node) => {
          if (node.id === groupNodeId) {
            return {
              ...node,
              position: { x: patch.group.x, y: patch.group.y },
              style: {
                ...node.style,
                width: node.data?.collapsed ? 260 : patch.group.width,
                height: node.data?.collapsed ? 96 : patch.group.height
              },
              data: {
                ...node.data,
                childCount: childNodes.length,
                expandedWidth: patch.group.width,
                expandedHeight: patch.group.height
              }
            };
          }
          const childPosition = patch.children.get(node.id);
          if (childPosition) {
            return {
              ...node,
              position: childPosition
            };
          }
          return node;
        });
      });
      return { nodes: nextNodes, groupUpdates, childUpdates };
    }

    async function persistGroupFit(groupUpdates, childUpdates) {
      const now = new Date().toISOString();
      await Promise.all([
        ...groupUpdates.map((group) => window.centralisSupabase
          .from("element_groups")
          .update(group.parentGroupId ? {
            group_position_x: group.x,
            group_position_y: group.y,
            width: group.width,
            height: group.height,
            updated_at: now
          } : {
            position_x: group.x,
            position_y: group.y,
            width: group.width,
            height: group.height,
            updated_at: now
          })
          .eq("id", group.id)),
        ...childUpdates.map((child) => window.centralisSupabase
          .from(child.kind === "group" ? "element_groups" : "elements")
          .update({
            group_position_x: child.x,
            group_position_y: child.y,
            updated_at: now
          })
          .eq("id", child.id))
      ]);
    }

    async function layoutSingleGroupInNodes(currentNodes, groupId) {
      const groupNodeId = String(groupId).startsWith("group:") ? groupId : `group:${groupId}`;
      const groupNode = currentNodes.find((node) => node.id === groupNodeId);
      if (!groupNode || groupNode.data?.collapsed) {
        return fitGroupsInNodes(currentNodes, [groupId]);
      }

      const childNodes = currentNodes.filter((node) => node.parentId === groupNodeId);
      if (childNodes.length < 2) {
        return fitGroupsInNodes(currentNodes, [groupId]);
      }

      const childIds = new Set(childNodes.map((node) => node.id));
      const localEdges = edgesRef.current.filter((edge) => childIds.has(edge.source) && childIds.has(edge.target));
      const localLayoutInput = childNodes.map((node) => ({
        ...node,
        parentId: undefined,
        extent: undefined,
        expandParent: undefined
      }));
      const layoutedChildren = await createAutoLayout(localLayoutInput, localEdges, universeFormatRef.current);
      const minX = Math.min(...layoutedChildren.map((node) => Number(node.position?.x || 0)));
      const minY = Math.min(...layoutedChildren.map((node) => Number(node.position?.y || 0)));
      const normalizedChildren = new Map(layoutedChildren.map((node) => [
        node.id,
        {
          x: Math.round(Number(node.position?.x || 0) - minX + 44),
          y: Math.round(Number(node.position?.y || 0) - minY + 72)
        }
      ]));

      const locallyLayoutedNodes = currentNodes.map((node) => {
        const position = normalizedChildren.get(node.id);
        if (!position) {
          return node;
        }
        return {
          ...node,
          position,
          parentId: groupNodeId,
          extent: "parent",
          expandParent: false
        };
      });

      return fitGroupsInNodes(locallyLayoutedNodes, [groupId]);
    }

    function getGroupResizeLayout(currentNodes, groupId, requestedWidth, requestedHeight) {
      const groupNodeId = String(groupId).startsWith("group:") ? groupId : `group:${groupId}`;
      const groupNode = currentNodes.find((node) => node.id === groupNodeId);
      if (!groupNode || groupNode.data?.collapsed) {
        return { nodes: currentNodes, groupUpdates: [], childUpdates: [] };
      }

      const childNodes = currentNodes.filter((node) => node.parentId === groupNodeId);
      const requestedGroupWidth = Math.max(280, Math.round(Number(requestedWidth || groupNode.style?.width || 360)));
      const requestedGroupHeight = Math.max(190, Math.round(Number(requestedHeight || groupNode.style?.height || 260)));
      if (!childNodes.length) {
        const groupUpdate = {
          id: groupNode.data.recordId,
          parentGroupId: groupNode.data?.parentGroupId || toRecordId(groupNode.parentId),
          x: Math.round(Number(groupNode.position?.x || 0)),
          y: Math.round(Number(groupNode.position?.y || 0)),
          width: requestedGroupWidth,
          height: requestedGroupHeight
        };
        return {
          nodes: currentNodes.map((node) => node.id === groupNodeId
            ? {
                ...node,
                style: { ...node.style, width: requestedGroupWidth, height: requestedGroupHeight },
                data: { ...node.data, expandedWidth: requestedGroupWidth, expandedHeight: requestedGroupHeight }
              }
            : node),
          groupUpdates: [groupUpdate],
          childUpdates: []
        };
      }

      const horizontalGap = 34;
      const verticalGap = 34;
      const paddingX = 44;
      const paddingTop = 72;
      const availableWidth = Math.max(120, requestedGroupWidth - paddingX * 2);
      const sortedChildren = [...childNodes].sort((left, right) => {
        const leftY = Number(left.position?.y || 0);
        const rightY = Number(right.position?.y || 0);
        return leftY - rightY || Number(left.position?.x || 0) - Number(right.position?.x || 0);
      });
      let cursorX = paddingX;
      let cursorY = paddingTop;
      let rowHeight = 0;
      const normalizedChildren = new Map();
      const childSizes = new Map();
      sortedChildren.forEach((node) => {
        const size = estimateCanvasNodeSize(node);
        childSizes.set(node.id, size);
        if (cursorX > paddingX && cursorX + size.width > paddingX + availableWidth) {
          cursorX = paddingX;
          cursorY += rowHeight + verticalGap;
          rowHeight = 0;
        }
        normalizedChildren.set(node.id, {
          x: Math.round(cursorX),
          y: Math.round(cursorY)
        });
        cursorX += size.width + horizontalGap;
        rowHeight = Math.max(rowHeight, size.height);
      });
      const requiredWidth = Math.max(requestedGroupWidth, ...sortedChildren.map((node) => {
        const position = normalizedChildren.get(node.id);
        const size = childSizes.get(node.id);
        return Number(position?.x || 0) + Number(size?.width || 0) + paddingX;
      }));
      const requiredHeight = Math.max(requestedGroupHeight, ...sortedChildren.map((node) => {
        const position = normalizedChildren.get(node.id);
        const size = childSizes.get(node.id);
        return Number(position?.y || 0) + Number(size?.height || 0) + 44;
      }));
      const groupUpdate = {
        id: groupNode.data.recordId,
        parentGroupId: groupNode.data?.parentGroupId || toRecordId(groupNode.parentId),
        x: Math.round(Number(groupNode.position?.x || 0)),
        y: Math.round(Number(groupNode.position?.y || 0)),
        width: Math.round(requiredWidth),
        height: Math.round(requiredHeight)
      };
      const childUpdates = childNodes.map((node) => ({
        id: node.data.recordId,
        kind: node.data.kind,
        ...(normalizedChildren.get(node.id) || node.position)
      }));
      return {
        nodes: currentNodes.map((node) => {
          if (node.id === groupNodeId) {
            return {
              ...node,
              style: { ...node.style, width: groupUpdate.width, height: groupUpdate.height },
              data: { ...node.data, expandedWidth: groupUpdate.width, expandedHeight: groupUpdate.height }
            };
          }
          const position = normalizedChildren.get(node.id);
          if (!position) {
            return node;
          }
          return {
            ...node,
            position,
            parentId: groupNodeId,
            extent: "parent",
            expandParent: false
          };
        }),
        groupUpdates: [groupUpdate],
        childUpdates
      };
    }

    function previewResizeGroup(groupId, width, height) {
      if (!groupId) {
        return;
      }
      setNodes((currentNodes) => {
        const fitted = getGroupResizeLayout(currentNodes, groupId, width, height);
        nodesRef.current = fitted.nodes;
        return fitted.nodes;
      });
    }

    async function autoLayoutGroup(groupId) {
      if (!groupId) {
        setTransferStatus("No group selected for auto layout.", "error");
        return false;
      }

      pushCanvasHistory();
      const fitted = await layoutSingleGroupInNodes(nodesRef.current, groupId);
      const finalNodes = fitted.nodes.map((node) => ({ ...node }));
      setNodes(finalNodes);
      nodesRef.current = finalNodes;
      await persistGroupFit(fitted.groupUpdates, fitted.childUpdates);
      setTransferStatus("Auto-layout complete for group.", "success");
      return true;
    }

    async function resizeAndLayoutGroup(groupId, width, height) {
      if (!groupId) {
        return false;
      }
      pushCanvasHistory();
      const fitted = getGroupResizeLayout(nodesRef.current, groupId, width, height);
      const finalNodes = fitted.nodes.map((node) => ({ ...node }));
      setNodes(finalNodes);
      nodesRef.current = finalNodes;
      await persistGroupFit(fitted.groupUpdates, fitted.childUpdates);
      setTransferStatus("Group resized.", "success");
      return true;
    }

    function openCreateGroupDialog() {
      const modal = document.getElementById("create-group-modal");
      const input = modal?.querySelector('[name="group-name"]');
      const status = modal?.querySelector("[data-group-status]");
      if (!modal) return;
      modal.hidden = false;
      if (status) {
        status.textContent = "";
        status.classList.remove("is-error");
      }
      if (input) {
        input.value = `Group ${nodesRef.current.filter((node) => node.data?.kind === "group").length + 1}`;
        input.select();
        input.focus();
      }
    }

    async function createGroupFromSelection(name) {
      const selectedNodes = getSelectedGroupableNodes();
      if (!selectedNodes.length) {
        setTransferStatus("Select one or more top-level elements or groups to group.", "error");
        return false;
      }

      const groupName = String(name || "").trim();
      if (!groupName) {
        return false;
      }

      pushCanvasHistory();
      const bounds = getGroupBounds(selectedNodes);
      const id = createId();
      const now = new Date().toISOString();
      const groupRow = {
        id,
        universe_id: universe.id,
        name: groupName,
        description: null,
        position_x: bounds.x,
        position_y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        background_color: "#123034",
        is_collapsed: false,
        updated_at: now
      };

      const { error: groupError } = await window.centralisSupabase
        .from("element_groups")
        .insert(groupRow);
      if (groupError) {
        setTransferStatus(`Could not create group: ${getReadableError(groupError)}`, "error");
        return false;
      }

      const updates = await Promise.all(selectedNodes.map((node) => {
        const relativePosition = {
          x: Math.round(node.position.x - bounds.x),
          y: Math.round(node.position.y - bounds.y)
        };
        if (node.data?.kind === "group") {
          return window.centralisSupabase
            .from("element_groups")
            .update({
              parent_group_id: id,
              group_position_x: relativePosition.x,
              group_position_y: relativePosition.y,
              updated_at: now
            })
            .eq("id", node.data.recordId);
        }
        return window.centralisSupabase
          .from("elements")
          .update({
            group_id: id,
            group_position_x: relativePosition.x,
            group_position_y: relativePosition.y,
            updated_at: now
          })
          .eq("id", node.data.recordId);
      }));

      const failed = updates.find((response) => response.error);
      if (failed?.error) {
        await window.centralisSupabase
          .from("element_groups")
          .delete()
          .eq("id", id);
        setTransferStatus(`Could not add elements to group: ${getReadableError(failed.error)}`, "error");
        return false;
      }

      const groupNode = toGroupNode(groupRow);
      groupNode.data.childCount = selectedNodes.length;
      const selectedIds = new Set(selectedNodes.map((node) => node.id));
      groupNode.selected = true;
      setNodes((currentNodes) => {
        const nextNodes = currentNodes.map((node) => {
          if (!selectedIds.has(node.id)) {
            return { ...node, selected: false };
          }
          return {
            ...node,
            selected: false,
            parentId: groupNode.id,
            extent: "parent",
            expandParent: false,
            zIndex: node.data?.kind === "group" ? 0 : node.zIndex,
            position: {
              x: Math.round(node.position.x - bounds.x),
              y: Math.round(node.position.y - bounds.y)
            },
            data: {
              ...node.data,
              groupId: node.data?.kind === "element" ? id : node.data?.groupId,
              parentGroupId: node.data?.kind === "group" ? id : node.data?.parentGroupId
            }
          };
        });
        const firstSelectedIndex = nextNodes.findIndex((node) => selectedIds.has(node.id));
        const insertIndex = firstSelectedIndex >= 0 ? firstSelectedIndex : nextNodes.length;
        return [
          ...nextNodes.slice(0, insertIndex),
          groupNode,
          ...nextNodes.slice(insertIndex)
        ];
      });
      setTransferStatus(`Created group "${groupName}".`, "success");
      return true;
    }

    async function addNodeToGroup(draggedNode, targetGroupNode) {
      const currentNodes = nodesRef.current;
      const storedElementNode = currentNodes.find((node) => node.id === draggedNode?.id);
      const elementNode = storedElementNode ? { ...storedElementNode, position: draggedNode.position } : draggedNode;
      const groupNode = currentNodes.find((node) => node.id === targetGroupNode?.id) || targetGroupNode;
      if (!isGroupDropCandidate(elementNode) || !groupNode?.data?.recordId || elementNode.id === groupNode.id) {
        return false;
      }

      const elementName = elementNode.data?.name || (elementNode.data?.kind === "group" ? "this group" : "this element");
      const groupName = groupNode.data?.name || "this group";
      const confirmed = window.confirm(`Do you want to add "${elementName}" to this group ("${groupName}")?`);
      if (!confirmed) {
        return false;
      }

      pushCanvasHistory();
      const absolutePosition = getNodeAbsoluteRect(elementNode, currentNodes);
      const groupPosition = getNodeAbsoluteRect(groupNode, currentNodes);
      const relativePosition = {
        x: Math.round(absolutePosition.x - groupPosition.x),
        y: Math.round(absolutePosition.y - groupPosition.y)
      };
      const now = new Date().toISOString();

      const payload = elementNode.data?.kind === "group" ? {
        parent_group_id: groupNode.data.recordId,
        group_position_x: relativePosition.x,
        group_position_y: relativePosition.y,
        position_x: Math.round(absolutePosition.x),
        position_y: Math.round(absolutePosition.y),
        updated_at: now
      } : {
          group_id: groupNode.data.recordId,
          group_position_x: relativePosition.x,
          group_position_y: relativePosition.y,
          position_x: Math.round(absolutePosition.x),
          position_y: Math.round(absolutePosition.y),
          updated_at: now
        };
      const { error } = await window.centralisSupabase
        .from(elementNode.data?.kind === "group" ? "element_groups" : "elements")
        .update(payload)
        .eq("id", elementNode.data.recordId);

      if (error) {
        setTransferStatus(`Could not add "${elementName}" to group: ${getReadableError(error)}`, "error");
        return false;
      }

      let fitted = null;
      const nextNodes = nodesRef.current.map((node) => {
        if (node.id === elementNode.id) {
          return {
            ...node,
            selected: true,
            parentId: groupNode.id,
            extent: "parent",
            expandParent: false,
            zIndex: node.data?.kind === "group" ? 0 : node.zIndex,
            position: relativePosition,
            data: {
              ...node.data,
              groupId: node.data?.kind === "element" ? groupNode.data.recordId : node.data?.groupId,
              parentGroupId: node.data?.kind === "group" ? groupNode.data.recordId : node.data?.parentGroupId
            }
          };
        }
        return { ...node, selected: false };
      });
      fitted = await layoutSingleGroupInNodes(nextNodes, groupNode.data.recordId);
      const finalNodes = fitted.nodes.map((node) => ({
        ...node,
        selected: node.id === elementNode.id
      }));
      setNodes(finalNodes);
      nodesRef.current = finalNodes;

      if (fitted) {
        await persistGroupFit(fitted.groupUpdates, fitted.childUpdates);
      }

      setTransferStatus(`Added "${elementName}" to "${groupName}".`, "success");
      return true;
    }

    async function ungroupNode(groupNode) {
      if (!groupNode?.data?.recordId) {
        return false;
      }

      pushCanvasHistory();
      const childNodes = nodesRef.current.filter((node) => node.parentId === groupNode.id);
      const now = new Date().toISOString();
      const nodesById = new Map(nodesRef.current.map((node) => [node.id, node]));
      const updates = await Promise.all(childNodes.map((node) => {
        const absolutePosition = getAbsoluteNodePosition(node, nodesById);
        if (node.data?.kind === "group") {
          return window.centralisSupabase
            .from("element_groups")
            .update({
              parent_group_id: null,
              group_position_x: null,
              group_position_y: null,
              position_x: Math.round(absolutePosition.x),
              position_y: Math.round(absolutePosition.y),
              updated_at: now
            })
            .eq("id", node.data.recordId);
        }
        return window.centralisSupabase
          .from("elements")
          .update({
            group_id: null,
            group_position_x: null,
            group_position_y: null,
            position_x: Math.round(absolutePosition.x),
            position_y: Math.round(absolutePosition.y),
            updated_at: now
          })
          .eq("id", node.data.recordId);
      }));

      const failed = updates.find((response) => response.error);
      if (failed?.error) {
        setTransferStatus(`Could not ungroup elements: ${getReadableError(failed.error)}`, "error");
        return false;
      }

      const { error: deleteError } = await window.centralisSupabase
        .from("element_groups")
        .delete()
        .eq("id", groupNode.data.recordId);

      if (deleteError) {
        setTransferStatus(`Could not delete group: ${getReadableError(deleteError)}`, "error");
        return false;
      }

      const childIds = new Set(childNodes.map((node) => node.id));
      const childPositions = new Map(childNodes.map((node) => [
        node.id,
        getAbsoluteNodePosition(node, nodesById)
      ]));
      setNodes((currentNodes) => currentNodes
        .filter((node) => node.id !== groupNode.id)
        .map((node) => {
          if (!childIds.has(node.id)) {
            return { ...node, selected: false };
          }
          return {
            ...node,
            parentId: undefined,
            extent: undefined,
            expandParent: undefined,
            zIndex: node.data?.kind === "group" ? -1 : node.zIndex,
            selected: true,
            position: {
              x: Math.round(childPositions.get(node.id)?.x || 0),
              y: Math.round(childPositions.get(node.id)?.y || 0)
            },
            data: {
              ...node.data,
              groupId: node.data?.kind === "element" ? null : node.data?.groupId,
              parentGroupId: node.data?.kind === "group" ? null : node.data?.parentGroupId
            }
          };
        }));
      setTransferStatus(`Ungrouped "${groupNode.data.name || "group"}".`, "success");
      return true;
    }

    async function removeSelectedElementsFromGroup() {
      const selectedNodes = getSelectedElementNodes();
      if (!selectedNodes.length) {
        setTransferStatus("Select one or more grouped elements first.", "error");
        return false;
      }
      const groupId = selectedNodes[0]?.data?.groupId;
      const groupNode = nodesRef.current.find((node) => node.id === `group:${groupId}`);
      if (!groupId || !groupNode) {
        setTransferStatus("Selected elements are not inside a group.", "error");
        return false;
      }

      pushCanvasHistory();
      const selectedIds = new Set(selectedNodes.map((node) => node.id));
      const now = new Date().toISOString();
      const nodesById = new Map(nodesRef.current.map((node) => [node.id, node]));
      const updates = await Promise.all(selectedNodes.map((node) => window.centralisSupabase
        .from("elements")
        .update({
          group_id: null,
          group_position_x: null,
          group_position_y: null,
          position_x: Math.round(getAbsoluteNodePosition(node, nodesById).x),
          position_y: Math.round(getAbsoluteNodePosition(node, nodesById).y),
          updated_at: now
        })
        .eq("id", node.data.recordId)));

      const failed = updates.find((response) => response.error);
      if (failed?.error) {
        setTransferStatus(`Could not remove from group: ${getReadableError(failed.error)}`, "error");
        return false;
      }

      let fitted = null;
      const detachedNodes = nodesRef.current.map((node) => {
        if (!selectedIds.has(node.id)) {
          return { ...node, selected: false };
        }
        return {
          ...node,
          parentId: undefined,
          extent: undefined,
          expandParent: undefined,
          selected: true,
          position: {
            x: Math.round(getAbsoluteNodePosition(node, nodesById).x),
            y: Math.round(getAbsoluteNodePosition(node, nodesById).y)
          },
          data: {
            ...node.data,
            groupId: null
          }
        };
      });
      fitted = await layoutSingleGroupInNodes(detachedNodes, groupId);
      const finalNodes = fitted.nodes.map((node) => ({
        ...node,
        selected: selectedIds.has(node.id)
      }));
      setNodes(finalNodes);
      nodesRef.current = finalNodes;

      if (fitted) {
        await persistGroupFit(fitted.groupUpdates, fitted.childUpdates);
      }
      setTransferStatus(`Removed ${selectedNodes.length} ${selectedNodes.length === 1 ? "element" : "elements"} from group.`, "success");
      return true;
    }

    async function duplicateSelectedElements() {
      const selectedNodes = getSelectedElementNodes();
      if (!selectedNodes.length) {
        setTransferStatus("Select one or more elements to duplicate.", "error");
        return false;
      }

      pushCanvasHistory();
      const offset = 28;
      const now = new Date().toISOString();
      const elementOwnerId = getElementOwnerId();
      if (!elementOwnerId) {
        setTransferStatus("Could not determine the signed-in user for duplicated elements.", "error");
        return false;
      }
      const nodesById = new Map(nodesRef.current.map((currentNode) => [currentNode.id, currentNode]));
      const payloads = selectedNodes.map((node) => {
        const isGrouped = Boolean(node.data?.groupId);
        const absolutePosition = getAbsoluteNodePosition(node, nodesById);
        const nextX = Math.round(Number(node.position?.x || 0) + offset);
        const nextY = Math.round(Number(node.position?.y || 0) + offset);
        return {
          id: createId(),
          user_id: elementOwnerId,
          universe_id: universe.id,
          element_type_id: node.data?.elementType?.id || null,
          rich_template_id: node.data?.richTemplateId || null,
          name: `${node.data?.name || "Untitled Element"} Copy`,
          description: node.data?.description || null,
          group_id: isGrouped ? node.data.groupId : null,
          group_position_x: isGrouped ? nextX : null,
          group_position_y: isGrouped ? nextY : null,
          position_x: isGrouped ? Math.round(absolutePosition.x + offset) : nextX,
          position_y: isGrouped ? Math.round(absolutePosition.y + offset) : nextY,
          updated_at: now
        };
      });

      const { data, error } = await window.centralisSupabase
        .from("elements")
        .insert(payloads)
        .select("id,name,description,position_x,position_y,element_type_id,rich_template_id,group_id,group_position_x,group_position_y");

      if (error) {
        setTransferStatus(`Could not duplicate elements: ${getReadableError(error)}`, "error");
        return false;
      }

      const duplicatedNodes = (data || []).map((row) => {
        const node = toElementNode(row);
        node.data.format = universeFormatRef.current;
        node.selected = true;
        return applyLayerOverlayToNode(node, activeLayerIdRef.current, layerEntriesRef.current, layerAssignmentsRef.current);
      });
      const duplicatedIds = new Set(duplicatedNodes.map((node) => node.id));
      const groupedIds = [...new Set(duplicatedNodes.map((node) => node.data?.groupId).filter(Boolean))];
      let fitted = null;
      const nextNodes = [
        ...nodesRef.current.map((node) => ({ ...node, selected: false })),
        ...duplicatedNodes
      ];
      if (groupedIds.length === 1) {
        fitted = await layoutSingleGroupInNodes(nextNodes, groupedIds[0]);
      } else if (groupedIds.length > 1) {
        fitted = fitGroupsInNodes(nextNodes, groupedIds);
      }

      const finalNodes = (fitted?.nodes || nextNodes).map((node) => ({
        ...node,
        selected: duplicatedIds.has(node.id)
      }));
      setNodes(finalNodes);
      nodesRef.current = finalNodes;

      if (fitted) {
        await persistGroupFit(fitted.groupUpdates, fitted.childUpdates);
      }
      setTransferStatus(`Duplicated ${duplicatedNodes.length} ${duplicatedNodes.length === 1 ? "element" : "elements"}.`, "success");
      return true;
    }

    function getGenerateElementsTypeOptions(selectedTypeId = "") {
      return elementTypes
        .map((type) => `<option value="${escapeHtml(type.id)}"${type.id === selectedTypeId ? " selected" : ""}>${escapeHtml(type.name || "Untitled Type")}</option>`)
        .join("");
    }

    function getExistingElementContext(limit = 120) {
      const typeById = new Map(elementTypes.map((type) => [type.id, type]));
      return nodesRef.current
        .filter((node) => node.data?.kind === "element")
        .slice(0, limit)
        .map((node) => ({
          id: node.data.recordId,
          name: String(node.data.name || "Untitled Element").slice(0, 160),
          element_type_name: String(node.data.elementType?.name || typeById.get(node.data.elementType?.id)?.name || "").slice(0, 120),
          description: String(node.data.description || "").replace(/\s+/g, " ").trim().slice(0, 600)
        }));
    }

    function getGenerateElementsUniverseContext() {
      return {
        id: universe.id,
        name: universe.name || "Untitled Universe",
        description: String(universe.description || "").replace(/\s+/g, " ").trim().slice(0, 4000)
      };
    }

    function getGenerateElementsSourceContext(nodeId) {
      const node = nodesRef.current.find((item) => item.id === nodeId && item.data?.kind === "element");
      if (!node) return null;
      return {
        nodeId: node.id,
        id: node.data.recordId,
        name: String(node.data.name || "Untitled Element").slice(0, 180),
        element_type_name: String(node.data.elementType?.name || "Unknown").slice(0, 120),
        description: String(node.data.description || "").replace(/\s+/g, " ").trim().slice(0, 1200)
      };
    }

    function getEndpointKey(kind, id) {
      if (!kind || !id) return "";
      return `${kind}:${id}`;
    }

    function getEndpointLabel(endpoint, generatedElements = []) {
      if (!endpoint) return "Unknown";
      if (endpoint.kind === "universe") return `Universe: ${universe.name || "Untitled Universe"}`;
      if (endpoint.kind === "existing") {
        const node = nodesRef.current.find((item) => item.data?.kind === "element" && item.data.recordId === endpoint.id);
        return `Existing: ${node?.data?.name || endpoint.name || "Untitled Element"}`;
      }
      if (endpoint.kind === "generated") {
        const generated = generatedElements.find((item) => item.tempId === endpoint.id);
        return `Generated: ${generated?.name || endpoint.name || "Untitled Element"}`;
      }
      return endpoint.name || "Unknown";
    }

    function getGenerateElementsEndpointOptions(generatedElements = [], selectedValue = "") {
      const universeOptionValue = getEndpointKey("universe", universe.id);
      const existingOptions = nodesRef.current
        .filter((node) => node.data?.kind === "element")
        .map((node) => {
          const value = getEndpointKey("existing", node.data.recordId);
          return `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(`Existing: ${node.data.name || "Untitled Element"}`)}</option>`;
        })
        .join("");
      const generatedOptions = generatedElements
        .map((element) => {
          const value = getEndpointKey("generated", element.tempId);
          return `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(`Generated: ${element.name || "Untitled Element"}`)}</option>`;
        })
        .join("");

      return [
        `<option value="${escapeHtml(universeOptionValue)}"${universeOptionValue === selectedValue ? " selected" : ""}>${escapeHtml(`Universe: ${universe.name || "Untitled Universe"}`)}</option>`,
        existingOptions,
        generatedOptions
      ].filter(Boolean).join("");
    }

    function parseGenerateElementsEndpoint(value) {
      const [kind, ...rest] = String(value || "").split(":");
      const id = rest.join(":");
      if (!kind || !id) return null;
      if (!["universe", "existing", "generated"].includes(kind)) return null;
      return { kind, id };
    }

    function normalizeGeneratedElement(rawElement, index, typeByName) {
      const tempId = String(rawElement?.temp_id || rawElement?.tempId || rawElement?.id || `generated-${index + 1}`).trim();
      const name = String(rawElement?.name || "").replace(/\s+/g, " ").trim().slice(0, 200);
      const description = String(rawElement?.description || "").replace(/\s+/g, " ").trim().slice(0, 4000);
      const typeName = String(rawElement?.element_type_name || rawElement?.elementTypeName || rawElement?.type || "").replace(/\s+/g, " ").trim();
      const type = typeByName.get(normalizeLookupKey(typeName)) || null;
      return {
        tempId: tempId || `generated-${index + 1}`,
        name,
        description,
        elementTypeName: typeName,
        elementTypeId: type?.id || "",
        unknownTypeName: type ? "" : typeName
      };
    }

    function normalizeGeneratedEndpoint(value, generatedElements, sourceElement = null) {
      const text = String(value || "").trim();
      if (!text) return null;
      const lower = normalizeLookupKey(text);
      if (sourceElement && (
        lower === "source"
        || text === sourceElement.id
        || lower === normalizeLookupKey(sourceElement.id)
        || lower === normalizeLookupKey(sourceElement.name)
      )) {
        return { kind: "existing", id: sourceElement.id, name: sourceElement.name };
      }
      if (lower === "universe" || text === universe.id || lower === normalizeLookupKey(universe.name)) {
        return { kind: "universe", id: universe.id, name: universe.name };
      }

      const generated = generatedElements.find((element) => (
        text === element.tempId
        || lower === normalizeLookupKey(element.tempId)
        || lower === normalizeLookupKey(element.name)
      ));
      if (generated) {
        return { kind: "generated", id: generated.tempId, name: generated.name };
      }

      const existingNode = nodesRef.current.find((node) => node.data?.kind === "element" && (
        text === node.data.recordId
        || lower === normalizeLookupKey(node.data.recordId)
        || lower === normalizeLookupKey(node.data.name)
      ));
      if (existingNode) {
        return { kind: "existing", id: existingNode.data.recordId, name: existingNode.data.name };
      }

      return null;
    }

    function normalizeGeneratedLink(rawLink, index, generatedElements, sourceElement = null) {
      const sourceValue = rawLink?.source || rawLink?.source_id || rawLink?.source_temp_id || rawLink?.source_existing_id || rawLink?.source_name;
      const targetValue = rawLink?.target || rawLink?.target_id || rawLink?.target_temp_id || rawLink?.target_existing_id || rawLink?.target_name;
      const source = normalizeGeneratedEndpoint(sourceValue, generatedElements, sourceElement);
      const target = normalizeGeneratedEndpoint(targetValue, generatedElements, sourceElement);
      return {
        id: String(rawLink?.id || `link-${index + 1}`),
        source,
        target,
        label: String(rawLink?.label || rawLink?.relationship || "").replace(/\s+/g, " ").trim().slice(0, 120)
      };
    }

    function normalizeGeneratedElementsPayload(payload, sourceElement = null) {
      const typeByName = new Map(elementTypes.map((type) => [normalizeLookupKey(type.name), type]));
      const elementsPayload = Array.isArray(payload?.elements) ? payload.elements : [];
      const elementsList = elementsPayload
        .map((element, index) => normalizeGeneratedElement(element, index, typeByName))
        .filter((element) => element.name);
      const tempIds = new Set();
      elementsList.forEach((element, index) => {
        let nextId = element.tempId || `generated-${index + 1}`;
        let suffix = 2;
        while (tempIds.has(nextId)) {
          nextId = `${element.tempId || `generated-${index + 1}`}-${suffix}`;
          suffix += 1;
        }
        element.tempId = nextId;
        tempIds.add(nextId);
      });

      const linksList = (Array.isArray(payload?.links) ? payload.links : [])
        .map((link, index) => normalizeGeneratedLink(link, index, elementsList, sourceElement))
        .filter((link) => link.source && link.target && getEndpointKey(link.source.kind, link.source.id) !== getEndpointKey(link.target.kind, link.target.id));

      return { elements: elementsList, links: linksList };
    }

    function getGeneratedElementsReviewState() {
      const elementsHost = document.querySelector("[data-generated-elements-list]");
      const linksHost = document.querySelector("[data-generated-links-list]");
      const elementsList = [...(elementsHost?.querySelectorAll("[data-generated-element-row]") || [])].map((row, index) => ({
        tempId: row.dataset.tempId || `generated-${index + 1}`,
        name: String(row.querySelector("[data-generated-element-name]")?.value || "").trim(),
        description: String(row.querySelector("[data-generated-element-description]")?.value || "").trim(),
        elementTypeId: String(row.querySelector("[data-generated-element-type]")?.value || "").trim()
      }));
      const linksList = [...(linksHost?.querySelectorAll("[data-generated-link-row]") || [])].map((row, index) => ({
        id: row.dataset.linkId || `link-${index + 1}`,
        source: parseGenerateElementsEndpoint(row.querySelector("[data-generated-link-source]")?.value),
        target: parseGenerateElementsEndpoint(row.querySelector("[data-generated-link-target]")?.value),
        label: String(row.querySelector("[data-generated-link-label]")?.value || "").trim()
      }));

      return { elements: elementsList, links: linksList };
    }

    function renderGeneratedElementsReview(draft) {
      const elementsHost = document.querySelector("[data-generated-elements-list]");
      const linksHost = document.querySelector("[data-generated-links-list]");
      const elementsCount = document.querySelector("[data-generated-elements-count]");
      const linksCount = document.querySelector("[data-generated-links-count]");
      if (!elementsHost || !linksHost) return;

      elementsHost.innerHTML = draft.elements.map((element, index) => `
        <article class="generated-element-row${element.unknownTypeName ? " has-warning" : ""}" data-generated-element-row data-temp-id="${escapeHtml(element.tempId)}">
          <div class="generated-element-index">${index + 1}</div>
          <div class="generated-element-fields">
            <label class="form-field compact-field">
              <span>Name</span>
              <input type="text" data-generated-element-name value="${escapeHtml(element.name)}">
            </label>
            <label class="form-field compact-field">
              <span>Type${element.unknownTypeName ? ` <em>Unknown: ${escapeHtml(element.unknownTypeName)}</em>` : ""}</span>
              <select data-generated-element-type>
                <option value="">Choose type</option>
                ${getGenerateElementsTypeOptions(element.elementTypeId)}
              </select>
            </label>
            <label class="form-field compact-field generated-element-description-field">
              <span>Description</span>
              <textarea data-generated-element-description>${escapeHtml(element.description)}</textarea>
            </label>
          </div>
        </article>
      `).join("");

      linksHost.innerHTML = draft.links.length ? draft.links.map((link, index) => {
        const sourceValue = getEndpointKey(link.source?.kind, link.source?.id);
        const targetValue = getEndpointKey(link.target?.kind, link.target?.id);
        return `
          <article class="generated-link-row" data-generated-link-row data-link-id="${escapeHtml(link.id || `link-${index + 1}`)}">
            <button class="icon-button generated-link-remove" type="button" aria-label="Remove link" data-remove-generated-link>
              <ph-x weight="bold" aria-hidden="true"></ph-x>
            </button>
            <label class="form-field compact-field">
              <span>Source</span>
              <select data-generated-link-source>${getGenerateElementsEndpointOptions(draft.elements, sourceValue)}</select>
            </label>
            <label class="form-field compact-field">
              <span>Target</span>
              <select data-generated-link-target>${getGenerateElementsEndpointOptions(draft.elements, targetValue)}</select>
            </label>
            <label class="form-field compact-field generated-link-label-field">
              <span>Label</span>
              <input type="text" data-generated-link-label value="${escapeHtml(link.label || "")}" placeholder="Relationship label">
            </label>
          </article>
        `;
      }).join("") : '<p class="empty-state">No links were generated.</p>';

      if (elementsCount) {
        elementsCount.textContent = `${draft.elements.length} ${draft.elements.length === 1 ? "element" : "elements"}`;
      }
      if (linksCount) {
        linksCount.textContent = `${draft.links.length} ${draft.links.length === 1 ? "link" : "links"}`;
      }

      linksHost.querySelectorAll("[data-remove-generated-link]").forEach((button) => {
        button.addEventListener("click", () => {
          button.closest("[data-generated-link-row]")?.remove();
          const nextCount = linksHost.querySelectorAll("[data-generated-link-row]").length;
          if (linksCount) {
            linksCount.textContent = `${nextCount} ${nextCount === 1 ? "link" : "links"}`;
          }
          if (!nextCount) {
            linksHost.innerHTML = '<p class="empty-state">No links remain.</p>';
          }
        });
      });
    }

    function setGenerateElementsStatus(message, tone = "") {
      const status = document.querySelector("[data-generate-elements-status]");
      if (!status) return;
      status.textContent = message || "";
      status.classList.toggle("is-error", tone === "error");
      status.classList.toggle("is-success", tone === "success");
    }

    function setGeneratedElementsReviewStatus(message, tone = "") {
      const status = document.querySelector("[data-generated-elements-review-status]");
      if (!status) return;
      status.textContent = message || "";
      status.classList.toggle("is-error", tone === "error");
      status.classList.toggle("is-success", tone === "success");
    }

    async function updateAiElementProposalStatus(proposal, status) {
      const proposalId = String(proposal?.id || "");
      if (!proposalId) return;
      const now = new Date().toISOString();
      const update = {
        status,
        updated_at: now
      };
      if (status === "finalized") {
        update.finalized_at = now;
      }
      const { error } = await window.centralisSupabase
        .from("universe_ai_proposals")
        .update(update)
        .eq("id", proposalId)
        .eq("universe_id", universe.id);
      if (error) {
        throw error;
      }
      window.dispatchEvent(new CustomEvent("centralis:ai-proposal-status-changed", {
        detail: {
          proposalId,
          status
        }
      }));
    }

    function setLayerStatus(message, tone = "") {
      const status = document.querySelector("[data-layer-status]");
      if (!status) return;
      status.textContent = message || "";
      status.classList.toggle("is-error", tone === "error");
      status.classList.toggle("is-success", tone === "success");
    }

    function setLayersManagerStatus(message, tone = "") {
      const status = document.querySelector("[data-layers-manager-status]");
      if (!status) return;
      status.textContent = message || "";
      status.classList.toggle("is-error", tone === "error");
      status.classList.toggle("is-success", tone === "success");
    }

    function updateLayerCollections(nextLayers, nextEntries = layerEntriesRef.current, nextAssignments = layerAssignmentsRef.current) {
      const sortedLayers = sortLayers(nextLayers);
      const sortedEntries = sortLayers(nextEntries);
      setLayers(sortedLayers);
      setLayerEntries(sortedEntries);
      setLayerAssignments(nextAssignments || []);
      overlayLayers = sortedLayers;
      overlayLayerEntries = sortedEntries;
      overlayLayerAssignments = nextAssignments || [];
    }

    async function reloadLayers() {
      if (!window.centralisSupabase || !universe.id) {
        return;
      }

      const layerResponse = await window.centralisSupabase
        .from("universe_layers")
        .select("*")
        .eq("universe_id", universe.id)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (layerResponse.error) throw layerResponse.error;

      const nextLayers = layerResponse.data || [];
      const layerIds = nextLayers.map((layer) => layer.id).filter(Boolean);
      let nextEntries = [];
      let nextAssignments = [];
      if (layerIds.length) {
        const [entryResponse, assignmentResponse] = await Promise.all([
          window.centralisSupabase
            .from("universe_layer_entries")
            .select("*")
            .in("layer_id", layerIds)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          window.centralisSupabase
            .from("element_layer_assignments")
            .select("*")
            .eq("universe_id", universe.id)
            .in("layer_id", layerIds)
        ]);
        if (entryResponse.error) throw entryResponse.error;
        if (assignmentResponse.error) throw assignmentResponse.error;
        nextEntries = entryResponse.data || [];
        nextAssignments = assignmentResponse.data || [];
      }

      updateLayerCollections(nextLayers, nextEntries, nextAssignments);
      if (activeLayerIdRef.current && !nextLayers.some((layer) => layer.id === activeLayerIdRef.current)) {
        setActiveLayerId("");
      }
      if (layersManagerLayerId && !nextLayers.some((layer) => layer.id === layersManagerLayerId)) {
        setLayersManagerLayerId(nextLayers[0]?.id || "");
      }
    }

    async function createLayer() {
      const id = createId();
      const nextOrder = layersRef.current.length
        ? Math.max(...layersRef.current.map((layer) => Number(layer.sort_order || 0))) + 10
        : 10;
      const existingNames = new Set(layersRef.current.map((layer) => normalizeLookupKey(layer.name)));
      let layerName = "New Layer";
      let suffix = 2;
      while (existingNames.has(normalizeLookupKey(layerName))) {
        layerName = `New Layer ${suffix}`;
        suffix += 1;
      }
      const { data, error } = await window.centralisSupabase
        .from("universe_layers")
        .insert({
          id,
          universe_id: universe.id,
          user_id: universe.user_id || window.centralisCurrentAppUser?.id,
          name: layerName,
          description: null,
          sort_order: nextOrder
        })
        .select("*")
        .single();
      if (error) throw error;
      setLayersManagerLayerId(data.id);
      await reloadLayers();
    }

    async function saveLayer(layerId, payload) {
      const { error } = await window.centralisSupabase
        .from("universe_layers")
        .update({
          name: payload.name,
          description: payload.description || null,
          sort_order: Number(payload.sort_order || 0),
          updated_at: new Date().toISOString()
        })
        .eq("id", layerId);
      if (error) throw error;
      await reloadLayers();
      setLayersManagerStatus("Layer saved.", "success");
    }

    async function deleteLayer(layerId) {
      const layer = layersRef.current.find((item) => item.id === layerId);
      if (!layer) return;
      if (!window.confirm(`Delete "${layer.name}" and all of its assignments?`)) {
        return;
      }
      const { error } = await window.centralisSupabase
        .from("universe_layers")
        .delete()
        .eq("id", layerId);
      if (error) throw error;
      if (activeLayerIdRef.current === layerId) {
        setActiveLayerId("");
      }
      await reloadLayers();
      setLayersManagerStatus("Layer deleted.", "success");
    }

    async function createLayerEntry(layerId) {
      const entries = getEntriesForLayer(layerId, layerEntriesRef.current);
      const id = createId();
      const nextOrder = entries.length
        ? Math.max(...entries.map((entry) => Number(entry.sort_order || 0))) + 10
        : 10;
      const existingNames = new Set(entries.map((entry) => normalizeLookupKey(entry.name)));
      let entryName = "New Entry";
      let suffix = 2;
      while (existingNames.has(normalizeLookupKey(entryName))) {
        entryName = `New Entry ${suffix}`;
        suffix += 1;
      }
      const { error } = await window.centralisSupabase
        .from("universe_layer_entries")
        .insert({
          id,
          layer_id: layerId,
          name: entryName,
          color: "#6366f1",
          sort_order: nextOrder
        });
      if (error) throw error;
      await reloadLayers();
    }

    async function saveLayerEntry(entryId, payload) {
      const { error } = await window.centralisSupabase
        .from("universe_layer_entries")
        .update({
          name: payload.name,
          color: sanitizeColor(payload.color, "#6366f1"),
          sort_order: Number(payload.sort_order || 0),
          updated_at: new Date().toISOString()
        })
        .eq("id", entryId);
      if (error) throw error;
      await reloadLayers();
      setLayersManagerStatus("Entry saved.", "success");
    }

    async function deleteLayerEntry(entryId) {
      const entry = getEntryById(entryId, layerEntriesRef.current);
      if (!entry) return;
      if (!window.confirm(`Delete "${entry.name}" and clear it from assigned elements?`)) {
        return;
      }
      const { error } = await window.centralisSupabase
        .from("universe_layer_entries")
        .delete()
        .eq("id", entryId);
      if (error) throw error;
      await reloadLayers();
      setLayersManagerStatus("Entry deleted.", "success");
    }

    async function saveSelectedLayerAssignments(entryIds) {
      const selectedNodes = getSelectedElementNodes();
      const layerId = activeLayerIdRef.current;
      if (!layerId) {
        setLayerStatus("Choose an active layer first.", "error");
        return;
      }
      if (!selectedNodes.length) {
        setLayerStatus("Select one or more elements first.", "error");
        return;
      }

      const selectedEntryIds = [...new Set((entryIds || []).filter(Boolean))];
      const elementIds = selectedNodes.map((node) => node.data.recordId).filter(Boolean);
      const now = new Date().toISOString();
      const deleteResponse = await window.centralisSupabase
        .from("element_layer_assignments")
        .delete()
        .eq("layer_id", layerId)
        .in("element_id", elementIds);
      if (deleteResponse.error) {
        setLayerStatus(`Could not update assignments: ${getReadableError(deleteResponse.error)}`, "error");
        return;
      }

      if (selectedEntryIds.length) {
        const rows = elementIds.flatMap((elementId) => selectedEntryIds.map((entryId) => ({
          id: createId(),
          universe_id: universe.id,
          element_id: elementId,
          layer_id: layerId,
          entry_id: entryId,
          updated_at: now
        })));
        const insertResponse = await window.centralisSupabase
          .from("element_layer_assignments")
          .insert(rows);
        if (insertResponse.error) {
          setLayerStatus(`Could not assign layer: ${getReadableError(insertResponse.error)}`, "error");
          return;
        }
      }

      await reloadLayers();
      setLayerStatus(`Updated ${elementIds.length} ${elementIds.length === 1 ? "element" : "elements"}.`, "success");
    }

    async function clearSelectedLayerAssignments() {
      const selectedNodes = getSelectedElementNodes();
      const layerId = activeLayerIdRef.current;
      if (!layerId) {
        setLayerStatus("Choose an active layer first.", "error");
        return;
      }
      if (!selectedNodes.length) {
        setLayerStatus("Select one or more elements first.", "error");
        return;
      }
      const elementIds = selectedNodes.map((node) => node.data.recordId).filter(Boolean);
      const { error } = await window.centralisSupabase
        .from("element_layer_assignments")
        .delete()
        .eq("layer_id", layerId)
        .in("element_id", elementIds);
      if (error) {
        setLayerStatus(`Could not clear assignments: ${getReadableError(error)}`, "error");
        return;
      }
      await reloadLayers();
      setLayerStatus(`Cleared ${elementIds.length} ${elementIds.length === 1 ? "assignment" : "assignments"}.`, "success");
    }

    function renderLayerAssignmentDialog() {
      const modal = document.getElementById("layer-assignment-modal");
      const options = modal?.querySelector("[data-layer-assignment-options]");
      const subtitle = modal?.querySelector("[data-layer-assignment-subtitle]");
      if (!modal || !options) return;

      const selectedNodes = getSelectedElementNodes();
      if (subtitle) {
        subtitle.textContent = `${activeLayer?.name || "Active layer"}: ${selectedNodes.length} selected ${selectedNodes.length === 1 ? "element" : "elements"}.`;
      }
      options.innerHTML = activeLayerEntries.length
        ? activeLayerEntries.map((entry) => `
          <label class="layer-assignment-row">
            <input type="checkbox" name="entry" value="${escapeHtml(entry.id)}">
            <span class="layer-entry-swatch" style="--entry-color: ${escapeHtml(sanitizeColor(entry.color, "#6366f1"))}"></span>
            <span>${escapeHtml(entry.name)}</span>
          </label>
        `).join("")
        : `<p class="empty-state">This layer has no entries yet. Use Manage Layers to add entries.</p>`;

      const selectedElementIds = selectedNodes.map((node) => node.data.recordId).filter(Boolean);
      options.querySelectorAll('input[name="entry"]').forEach((input) => {
        const assignedCount = selectedElementIds.filter((elementId) => getAssignmentsForElement(elementId, activeLayerIdRef.current, layerAssignmentsRef.current)
          .some((assignment) => assignment.entry_id === input.value)).length;
        input.checked = assignedCount > 0 && assignedCount === selectedElementIds.length;
        input.indeterminate = assignedCount > 0 && assignedCount < selectedElementIds.length;
      });
    }

    function openLayerAssignmentDialog() {
      if (!layerModeActive || !activeLayerIdRef.current) {
        setLayerStatus("Turn on layer mode and choose a layer first.", "error");
        return;
      }
      if (!getSelectedElementNodes().length) {
        setLayerStatus("Select one or more elements first.", "error");
        return;
      }
      const modal = document.getElementById("layer-assignment-modal");
      if (!modal) return;
      renderLayerAssignmentDialog();
      modal.hidden = false;
    }

    function renderLayersManager() {
      const modal = document.getElementById("layers-manager-modal");
      const list = modal?.querySelector("[data-layer-list]");
      const detail = modal?.querySelector("[data-layer-detail]");
      if (!modal || !list || !detail) return;

      const selectedLayer = layers.find((layer) => layer.id === layersManagerLayerId) || layers[0] || null;

      list.innerHTML = layers.length
        ? layers.map((layer) => `
          <button class="layer-list-item${layer.id === selectedLayer?.id ? " is-selected" : ""}" type="button" data-select-layer="${escapeHtml(layer.id)}">
            <strong>${escapeHtml(layer.name)}</strong>
            <span>${escapeHtml(layer.description || `${getEntriesForLayer(layer.id, layerEntries).length} entries`)}</span>
          </button>
        `).join("")
        : `<p class="empty-state">No layers yet.</p>`;

      if (!selectedLayer) {
        detail.innerHTML = `<p class="empty-state">Select a layer or add one to begin.</p>`;
        return;
      }

      const entries = getEntriesForLayer(selectedLayer.id, layerEntries);
      detail.innerHTML = `
        <div class="layer-detail-header">
          <div>
            <h3>${escapeHtml(selectedLayer.name)}</h3>
            <p class="modal-subtitle">${escapeHtml(selectedLayer.description || "No description yet.")}</p>
          </div>
          <button class="danger-action compact-action" type="button" data-delete-layer="${escapeHtml(selectedLayer.id)}">Delete Layer</button>
        </div>
        <form class="layer-detail-form" data-layer-form="${escapeHtml(selectedLayer.id)}">
          <label class="form-field">
            <span>Name</span>
            <input type="text" name="name" value="${escapeHtml(selectedLayer.name)}" autocomplete="off">
          </label>
          <label class="form-field">
            <span>Sort Order</span>
            <input type="number" name="sort_order" value="${escapeHtml(selectedLayer.sort_order ?? 0)}">
          </label>
          <label class="form-field">
            <span>Description</span>
            <textarea name="description" rows="3">${escapeHtml(selectedLayer.description || "")}</textarea>
          </label>
          <div class="layer-detail-actions">
            <span></span>
            <button class="primary-action compact-action" type="submit">Save Layer</button>
          </div>
        </form>
        <div class="layer-detail-header">
          <h3>Entries</h3>
          <button class="secondary-action compact-action" type="button" data-add-layer-entry="${escapeHtml(selectedLayer.id)}">+ Add Entry</button>
        </div>
        <div class="layer-entry-list">
          ${entries.length ? entries.map((entry) => `
            <form class="layer-entry-row" data-layer-entry-form="${escapeHtml(entry.id)}">
              <div class="layer-entry-main">
                <span class="layer-entry-swatch" style="--entry-color: ${escapeHtml(sanitizeColor(entry.color, "#6366f1"))}"></span>
                <label class="form-field">
                  <span>Name</span>
                  <input type="text" name="name" value="${escapeHtml(entry.name)}" autocomplete="off">
                </label>
                <label class="form-field">
                  <span>Color</span>
                  <input type="text" name="color" value="${escapeHtml(sanitizeColor(entry.color, "#6366f1"))}" autocomplete="off">
                </label>
                <label class="form-field">
                  <span>Sort</span>
                  <input type="number" name="sort_order" value="${escapeHtml(entry.sort_order ?? 0)}">
                </label>
              </div>
              <div class="layer-detail-actions">
                <button class="secondary-action compact-action" type="submit">Save</button>
                <button class="danger-action compact-action" type="button" data-delete-layer-entry="${escapeHtml(entry.id)}">Delete</button>
              </div>
            </form>
          `).join("") : `<p class="empty-state">No entries yet. Add entries like Nations, Product Lines, Religions, or Regions.</p>`}
        </div>
      `;
    }

    async function toggleGroupCollapsed(groupId, collapsed) {
      if (!groupId) return;
      setNodes((currentNodes) => currentNodes.map((node) => {
        if (node.data?.kind !== "group" || node.data.recordId !== groupId) {
          return node;
        }
        return {
          ...node,
          style: {
            ...node.style,
            width: collapsed ? 260 : Number(node.data.expandedWidth || node.style?.width || 360),
            height: collapsed ? 96 : Number(node.data.expandedHeight || node.style?.height || 260)
          },
          data: {
            ...node.data,
            collapsed
          }
        };
      }));

      const { error } = await window.centralisSupabase
        .from("element_groups")
        .update({
          is_collapsed: collapsed,
          updated_at: new Date().toISOString()
        })
        .eq("id", groupId);
      if (error) {
        console.error("Could not update group collapse state:", error);
      }
    }

    async function updateGroupColor(groupId, color) {
      if (!groupId) return;
      const safeColor = sanitizeColor(color, "#123034");
      setNodes((currentNodes) => currentNodes.map((node) => {
        if (node.data?.kind !== "group" || node.data.recordId !== groupId) {
          return node;
        }
        return {
          ...node,
          data: {
            ...node.data,
            backgroundColor: safeColor
          }
        };
      }));

      const { error } = await window.centralisSupabase
        .from("element_groups")
        .update({
          background_color: safeColor,
          updated_at: new Date().toISOString()
        })
        .eq("id", groupId);
      if (error) {
        console.error("Could not update group color:", error);
        setTransferStatus(`Could not update group color: ${getReadableError(error)}`, "error");
      }
    }

    function getViewportImportOrigin() {
      const fallback = {
        x: Number(universe.canvas_position_x ?? 120) + 420,
        y: Number(universe.canvas_position_y ?? 120) + 120
      };
      if (!reactFlowInstance.current || !reactFlowWrapper.current) {
        return fallback;
      }

      const rect = reactFlowWrapper.current.getBoundingClientRect();
      const point = {
        x: rect.width / 2,
        y: rect.height / 2
      };
      if (typeof reactFlowInstance.current.project === "function") {
        return reactFlowInstance.current.project(point);
      }
      if (typeof reactFlowInstance.current.screenToFlowPosition === "function") {
        return reactFlowInstance.current.screenToFlowPosition({
          x: rect.left + point.x,
          y: rect.top + point.y
        });
      }
      return fallback;
    }

    async function fetchTemplateLibraryForImport() {
      const typesByName = new Map(elementTypes.map((type) => [normalizeLookupKey(type.name), type]));
      const typeIds = elementTypes.map((type) => type.id).filter(Boolean);
      const templatesByTypeAndName = new Map();
      const fieldsByTemplateAndKey = new Map();
      if (!typeIds.length) {
        return { typesByName, templatesByTypeAndName, fieldsByTemplateAndKey };
      }

      const templateResponse = await window.centralisSupabase
        .from("element_type_templates")
        .select("*")
        .in("element_type_id", typeIds);
      if (templateResponse.error) throw templateResponse.error;

      const templates = templateResponse.data || [];
      templates.forEach((template) => {
        templatesByTypeAndName.set(`${template.element_type_id}::${normalizeLookupKey(template.name)}`, template);
      });

      const templateIds = templates.map((template) => template.id).filter(Boolean);
      if (!templateIds.length) {
        return { typesByName, templatesByTypeAndName, fieldsByTemplateAndKey };
      }

      const fieldResponse = await window.centralisSupabase
        .from("element_type_template_fields")
        .select("*")
        .in("template_id", templateIds);
      if (fieldResponse.error) throw fieldResponse.error;

      (fieldResponse.data || []).forEach((field) => {
        fieldsByTemplateAndKey.set(`${field.template_id}::${normalizeLookupKey(getTemplateFieldKey(field))}`, field);
      });

      return { typesByName, templatesByTypeAndName, fieldsByTemplateAndKey };
    }

    function normalizeTransferOptions(options = {}) {
      return {
        ...DEFAULT_TRANSFER_OPTIONS,
        ...options
      };
    }

    async function exportSelectedElements(options = DEFAULT_TRANSFER_OPTIONS) {
      const transferOptions = normalizeTransferOptions(options);
      const selectedElementNodes = nodesRef.current.filter((node) => node.selected && node.data?.kind === "element");
      if (!selectedElementNodes.length) {
        setTransferStatus("Select one or more element nodes to export.", "error");
        return;
      }

      setTransferStatus("Preparing export...");
      try {
        const selectedRecordIds = selectedElementNodes.map((node) => node.data.recordId);
        const selectedNodeIds = new Set(selectedElementNodes.map((node) => node.id));
        const selectedRecordIdSet = new Set(selectedRecordIds);
        const sourceUniverseId = universe.id;
        const isSelectedOrUniverseEndpoint = (nodeId) => {
          if (String(nodeId || "").startsWith("universe:")) {
            return toRecordId(nodeId) === sourceUniverseId;
          }
          return selectedNodeIds.has(nodeId);
        };
        const hasSelectedElementEndpoint = (edge) => selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);

        const [valueResponse, customResponse] = await Promise.all([
          transferOptions.richDetails
            ? window.centralisSupabase
              .from("element_template_field_values")
              .select("*")
              .in("element_id", selectedRecordIds)
            : Promise.resolve({ data: [], error: null }),
          transferOptions.customFields
            ? window.centralisSupabase
              .from("element_custom_fields")
              .select("*")
              .in("element_id", selectedRecordIds)
              .order("sort_order", { ascending: true })
            : Promise.resolve({ data: [], error: null })
        ]);
        if (valueResponse.error) throw valueResponse.error;
        if (customResponse.error) throw customResponse.error;

        const values = valueResponse.data || [];
        const fieldIds = [...new Set(values.map((value) => value.template_field_id).filter(Boolean))];
        let fieldsById = new Map();
        if (fieldIds.length) {
          const fieldResponse = await window.centralisSupabase
            .from("element_type_template_fields")
            .select("id,field_key,label")
            .in("id", fieldIds);
          if (fieldResponse.error) throw fieldResponse.error;
          fieldsById = new Map((fieldResponse.data || []).map((field) => [field.id, field]));
        }

        const templateIds = transferOptions.richDetails
          ? [...new Set(selectedElementNodes.map((node) => node.data?.richTemplateId).filter(Boolean))]
          : [];
        let templatesById = new Map();
        if (templateIds.length) {
          const templateResponse = await window.centralisSupabase
            .from("element_type_templates")
            .select("id,name")
            .in("id", templateIds);
          if (templateResponse.error) throw templateResponse.error;
          templatesById = new Map((templateResponse.data || []).map((template) => [template.id, template]));
        }

        const valuesByElementId = new Map();
        values.forEach((value) => {
          const field = fieldsById.get(value.template_field_id);
          const fieldKey = field ? getTemplateFieldKey(field) : "";
          if (!fieldKey) return;
          const elementValues = valuesByElementId.get(value.element_id) || [];
          elementValues.push({
            field_key: fieldKey,
            label: field?.label || "",
            value: value.value || ""
          });
          valuesByElementId.set(value.element_id, elementValues);
        });

        const customByElementId = new Map();
        (customResponse.data || []).forEach((field) => {
          const elementFields = customByElementId.get(field.element_id) || [];
          elementFields.push({
            name: field.name || "",
            value: field.value || "",
            sort_order: Number(field.sort_order || 0)
          });
          customByElementId.set(field.element_id, elementFields);
        });

        const exportPayload = {
          format: ELEMENT_EXPORT_FORMAT,
          exported_at: new Date().toISOString(),
          options: transferOptions,
          source_universe: {
            id: universe.id,
            name: universe.name || ""
          },
          elements: selectedElementNodes.map((node) => ({
            export_id: node.data.recordId,
            name: node.data.name || "Untitled Element",
            description: node.data.description || "",
            position: transferOptions.position ? {
              x: Number(node.position?.x || 0),
              y: Number(node.position?.y || 0)
            } : null,
            element_type_name: node.data.elementType?.name || "",
            rich_template_name: transferOptions.richDetails ? templatesById.get(node.data?.richTemplateId)?.name || "" : "",
            rich_values: transferOptions.richDetails ? valuesByElementId.get(node.data.recordId) || [] : [],
            custom_fields: transferOptions.customFields ? customByElementId.get(node.data.recordId) || [] : []
          })),
          links: transferOptions.connections ? edgesRef.current
            .filter((edge) => hasSelectedElementEndpoint(edge) && isSelectedOrUniverseEndpoint(edge.source) && isSelectedOrUniverseEndpoint(edge.target))
            .map((edge) => ({
              export_id: edge.id,
              source_export_id: toRecordId(edge.source),
              target_export_id: toRecordId(edge.target),
              source_kind: String(edge.source || "").startsWith("universe:") ? "universe" : "element",
              target_kind: String(edge.target || "").startsWith("universe:") ? "universe" : "element",
              source_handle: edge.sourceHandle || "right",
              target_handle: edge.targetHandle || "left",
              label: edge.label || "",
              stroke_color: edge.data?.format?.strokeColor || edge.style?.stroke || universeFormatRef.current.strokeColor,
              stroke_width: Number(edge.data?.format?.strokeWidth || edge.style?.strokeWidth || universeFormatRef.current.strokeWidth),
              stroke_style: edge.data?.format?.strokeStyle || universeFormatRef.current.strokeStyle,
              path_type: edge.data?.format?.pathType || universeFormatRef.current.pathType
            }))
            .filter((link) => {
              const sourceIncluded = selectedRecordIdSet.has(link.source_export_id) || (link.source_kind === "universe" && link.source_export_id === sourceUniverseId);
              const targetIncluded = selectedRecordIdSet.has(link.target_export_id) || (link.target_kind === "universe" && link.target_export_id === sourceUniverseId);
              return sourceIncluded && targetIncluded;
            }) : []
        };

        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const date = new Date().toISOString().slice(0, 10);
        anchor.href = url;
        anchor.download = `centralis-elements-${safeFileSlug(universe.name)}-${date}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setTransferStatus(`Exported ${exportPayload.elements.length} elements and ${exportPayload.links.length} links.`, "success");
      } catch (error) {
        setTransferStatus(`Could not export elements: ${getReadableError(error)}`, "error");
      }
    }

    async function importElementPayload(payload, options = DEFAULT_TRANSFER_OPTIONS) {
      const transferOptions = normalizeTransferOptions(options);
      if (!payload || payload.format !== ELEMENT_EXPORT_FORMAT || !Array.isArray(payload.elements)) {
        throw new Error("This is not a supported Centralis element export file.");
      }
      if (!window.centralisSupabase) {
        throw new Error("Supabase is not available.");
      }

      const library = await fetchTemplateLibraryForImport();
      const sourceElements = payload.elements.filter((element) => element && String(element.name || "").trim());
      if (!sourceElements.length) {
        throw new Error("The import file does not contain any elements.");
      }

      const minX = Math.min(...sourceElements.map((element) => Number(element.position?.x || 0)));
      const minY = Math.min(...sourceElements.map((element) => Number(element.position?.y || 0)));
      const origin = getViewportImportOrigin();
      const offset = { x: origin.x - minX, y: origin.y - minY };
      const oldToNewRecordId = new Map();
      const importedRows = [];
      const now = new Date().toISOString();
      const elementOwnerId = getElementOwnerId();
      if (!elementOwnerId) {
        throw new Error("Could not determine the signed-in user for imported elements.");
      }
      let skippedRichFields = 0;

      for (const [index, sourceElement] of sourceElements.entries()) {
        const type = library.typesByName.get(normalizeLookupKey(sourceElement.element_type_name)) || null;
        const template = transferOptions.richDetails && type && sourceElement.rich_template_name
          ? library.templatesByTypeAndName.get(`${type.id}::${normalizeLookupKey(sourceElement.rich_template_name)}`) || null
          : null;
        const id = createId();
        const position = transferOptions.position && sourceElement.position ? {
          x: Math.round(Number(sourceElement.position?.x || 0) + offset.x),
          y: Math.round(Number(sourceElement.position?.y || 0) + offset.y)
        } : {
          x: Math.round(origin.x + ((index % 4) * 48)),
          y: Math.round(origin.y + (Math.floor(index / 4) * 48))
        };

        const { data, error } = await window.centralisSupabase
          .from("elements")
          .insert({
            id,
            user_id: elementOwnerId,
            universe_id: universe.id,
            element_type_id: type?.id || null,
            rich_template_id: template?.id || null,
            name: String(sourceElement.name || "Imported Element").trim(),
            description: String(sourceElement.description || "").trim() || null,
            position_x: position.x,
            position_y: position.y
          })
          .select("id,name,description,position_x,position_y,element_type_id,rich_template_id")
          .single();
        if (error) throw error;

        oldToNewRecordId.set(String(sourceElement.export_id), data.id);
        importedRows.push(data);

        const richRows = [];
        if (transferOptions.richDetails && template?.id && Array.isArray(sourceElement.rich_values)) {
          sourceElement.rich_values.forEach((value) => {
            const field = library.fieldsByTemplateAndKey.get(`${template.id}::${normalizeLookupKey(value.field_key)}`);
            if (!field) {
              skippedRichFields += 1;
              return;
            }
            if (!hasMeaningfulValue(value.value)) return;
            richRows.push({
              element_id: data.id,
              template_field_id: field.id,
              value: String(value.value),
              updated_at: now
            });
          });
        } else if (transferOptions.richDetails && Array.isArray(sourceElement.rich_values)) {
          skippedRichFields += sourceElement.rich_values.filter((value) => hasMeaningfulValue(value?.value)).length;
        }

        if (richRows.length) {
          const { error: valueError } = await window.centralisSupabase
            .from("element_template_field_values")
            .insert(richRows);
          if (valueError) throw valueError;
        }

        const customRows = transferOptions.customFields && Array.isArray(sourceElement.custom_fields)
          ? sourceElement.custom_fields
            .filter((field) => hasMeaningfulValue(field?.name) || hasMeaningfulValue(field?.value))
            .map((field, index) => ({
              element_id: data.id,
              name: String(field.name || "Untitled Field").trim() || "Untitled Field",
              value: String(field.value || "").trim() || null,
              sort_order: Number(field.sort_order ?? index)
            }))
          : [];
        if (customRows.length) {
          const { error: customError } = await window.centralisSupabase
            .from("element_custom_fields")
            .insert(customRows);
          if (customError) throw customError;
        }
      }

      const importedNodes = importedRows.map((row) => {
        const node = toElementNode(row);
        node.data.format = universeFormatRef.current;
        node.selected = true;
        return applyLayerOverlayToNode(node, activeLayerIdRef.current, layerEntriesRef.current, layerAssignmentsRef.current);
      });

      const linkRows = transferOptions.connections && Array.isArray(payload.links) ? payload.links : [];
      const importedEdges = [];
      for (const link of linkRows) {
        const sourceIsUniverse = link.source_kind === "universe" || String(link.source_export_id) === String(payload.source_universe?.id);
        const targetIsUniverse = link.target_kind === "universe" || String(link.target_export_id) === String(payload.source_universe?.id);
        const sourceRecordId = sourceIsUniverse ? universe.id : oldToNewRecordId.get(String(link.source_export_id));
        const targetRecordId = targetIsUniverse ? universe.id : oldToNewRecordId.get(String(link.target_export_id));
        if (!sourceRecordId || !targetRecordId) continue;

        const id = createId();
        const linkFormat = {
          ...universeFormatRef.current,
          strokeColor: link.stroke_color || universeFormatRef.current.strokeColor,
          strokeWidth: Number(link.stroke_width || universeFormatRef.current.strokeWidth),
          strokeStyle: link.stroke_style || universeFormatRef.current.strokeStyle,
          pathType: link.path_type || universeFormatRef.current.pathType
        };
        const { error } = await window.centralisSupabase
          .from("element_links")
          .insert({
            id,
            universe_id: universe.id,
            source_element_id: sourceRecordId,
            target_element_id: targetRecordId,
            label: link.label || null,
            stroke_color: linkFormat.strokeColor,
            stroke_width: linkFormat.strokeWidth,
            stroke_style: linkFormat.strokeStyle,
            path_type: linkFormat.pathType
          });
        if (error) throw error;

        importedEdges.push({
          id,
          source: sourceIsUniverse ? `universe:${sourceRecordId}` : `element:${sourceRecordId}`,
          target: targetIsUniverse ? `universe:${targetRecordId}` : `element:${targetRecordId}`,
          sourceHandle: link.source_handle || "right",
          targetHandle: link.target_handle || "left",
          label: link.label || undefined,
          type: "deletable",
          data: { recordId: id, format: linkFormat },
          style: {
            stroke: linkFormat.strokeColor,
            strokeWidth: linkFormat.strokeWidth,
            strokeDasharray: getStrokeDasharray(linkFormat.strokeStyle)
          }
        });
      }

      setNodes((currentNodes) => [
        ...currentNodes.map((node) => ({ ...node, selected: false })),
        ...importedNodes
      ]);
      setEdges((currentEdges) => [...currentEdges, ...importedEdges]);

      return {
        elementCount: importedNodes.length,
        linkCount: importedEdges.length,
        skippedRichFields
      };
    }

    async function importElementsFromFile(file, options = DEFAULT_TRANSFER_OPTIONS) {
      if (!file) return;
      setTransferStatus("Importing elements...");
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const result = await importElementPayload(payload, options);
        const skipped = result.skippedRichFields ? ` ${result.skippedRichFields} rich fields skipped.` : "";
        setTransferStatus(`Imported ${result.elementCount} elements and ${result.linkCount} links.${skipped}`, "success");
      } catch (error) {
        setTransferStatus(`Could not import elements: ${getReadableError(error)}`, "error");
      }
    }

    React.useEffect(() => {
      const modal = document.getElementById("generate-elements-modal");
      const reviewModal = document.getElementById("generated-elements-review-modal");
      const infoModal = document.getElementById("generate-elements-info-modal");
      const form = document.querySelector("[data-generate-elements-form]");
      const modalSubtitle = document.querySelector("[data-generate-elements-subtitle]");
      const typeList = document.querySelector("[data-generate-elements-types]");
      const typeToggle = document.querySelector("[data-generate-elements-types-toggle]");
      const typeCount = document.querySelector("[data-generate-elements-types-count]");
      const typeSelectAll = document.querySelector("[data-generate-elements-types-select-all]");
      const previewButton = document.querySelector("[data-generate-elements-preview]");
      const infoText = document.querySelector("[data-generate-elements-info-text]");
      const infoStatus = document.querySelector("[data-generate-elements-info-status]");
      const infoCloseButtons = document.querySelectorAll("[data-generate-elements-info-close]");
      const cancelButtons = document.querySelectorAll("[data-generate-elements-cancel]");
      const reviewCancelButtons = document.querySelectorAll("[data-generated-elements-review-cancel]");
      const regenerateButton = document.querySelector("[data-generated-elements-regenerate]");
      const finalizeButton = document.querySelector("[data-generated-elements-finalize]");
      const generationOverlay = document.getElementById("generate-element-overlay");
      if (!modal || !reviewModal || !form) {
        return undefined;
      }

      let activeUniverseNodeId = `universe:${universe.id}`;
      let activeSourceElement = null;
      let lastGenerateOptions = null;
      let lastGeneratedDraft = { elements: [], links: [] };
      let activeReviewMode = "generate";
      let activeAiProposal = null;

      function setGenerateElementsOverlay(visible) {
        if (!generationOverlay) return;
        generationOverlay.hidden = !visible;
      }

      function updateTypeCount() {
        if (!typeCount || !typeList) return;
        const checkedCount = typeList.querySelectorAll('[data-generate-elements-type]:checked').length;
        typeCount.textContent = elementTypes.length
          ? `${checkedCount} of ${elementTypes.length} selected`
          : "No types";
        updateTypeSelectAllState();
      }

      function updateTypeSelectAllState() {
        if (!typeList || !typeSelectAll) return;
        const checkedCount = typeList.querySelectorAll('[data-generate-elements-type]:checked').length;
        typeSelectAll.checked = elementTypes.length > 0 && checkedCount === elementTypes.length;
        typeSelectAll.indeterminate = checkedCount > 0 && checkedCount < elementTypes.length;
        typeSelectAll.disabled = !elementTypes.length;
      }

      function renderTypeChecklist(resetSelection = false) {
        if (!typeList) return;
        if (!elementTypes.length) {
          typeList.innerHTML = '<p class="generate-elements-type-empty">No element types are available yet. Add element types before generating elements.</p>';
          typeList.classList.add("is-error");
          updateTypeCount();
          return;
        }
        typeList.classList.remove("is-error");
        const checkedIds = resetSelection
          ? new Set(elementTypes.map((type) => type.id))
          : new Set([...typeList.querySelectorAll('[data-generate-elements-type]:checked')].map((input) => input.value));
        const effectiveCheckedIds = checkedIds;
        typeList.innerHTML = elementTypes
          .map((type) => {
            const typeName = type.name || "Untitled Type";
            const checked = effectiveCheckedIds.has(type.id) ? " checked" : "";
            return `
              <label class="generate-elements-type-option">
                <input type="checkbox" value="${escapeHtml(type.id)}" data-generate-elements-type${checked}>
                <span title="${escapeHtml(typeName)}">${escapeHtml(typeName)}</span>
              </label>
            `;
          })
          .join("");
        updateTypeCount();
      }

      function openGenerateElementsModal(nodeId) {
        activeUniverseNodeId = nodeId || `universe:${universe.id}`;
        activeSourceElement = getGenerateElementsSourceContext(activeUniverseNodeId);
        if (modalSubtitle) {
          modalSubtitle.textContent = activeSourceElement
            ? `Create worldbuilding elements that branch from "${activeSourceElement.name}".`
            : "Create worldbuilding elements from this universe using the element types in your database.";
        }
        renderTypeChecklist(true);
        if (typeList) typeList.hidden = true;
        if (typeToggle) typeToggle.setAttribute("aria-expanded", "false");
        setGenerateElementsStatus("");
        modal.hidden = false;
        window.setTimeout(() => {
          form.querySelector('[name="total-elements"]')?.focus({ preventScroll: true });
        }, 0);
      }

      function closeGenerateElementsModal() {
        modal.hidden = true;
        setGenerateElementsStatus("");
      }

      function openReviewModal(options = {}) {
        activeReviewMode = options.mode || "generate";
        activeAiProposal = options.proposal || null;
        closeGenerateElementsModal();
        setGeneratedElementsReviewStatus("");
        if (regenerateButton) {
          regenerateButton.hidden = activeReviewMode === "ai-proposal";
        }
        reviewModal.hidden = false;
      }

      function closeReviewModal(returnToOptions = false) {
        reviewModal.hidden = true;
        setGeneratedElementsReviewStatus("");
        if (regenerateButton) {
          regenerateButton.hidden = false;
        }
        const shouldReturnToOptions = returnToOptions && activeReviewMode === "generate";
        activeReviewMode = "generate";
        activeAiProposal = null;
        if (shouldReturnToOptions) {
          modal.hidden = false;
        }
      }

      function openInfoModal() {
        if (!infoModal) return;
        if (infoText) infoText.value = "";
        if (infoStatus) {
          infoStatus.textContent = "";
          infoStatus.classList.remove("is-error", "is-success");
        }
        infoModal.hidden = false;
      }

      function closeInfoModal() {
        if (!infoModal) return;
        infoModal.hidden = true;
        if (infoStatus) {
          infoStatus.textContent = "";
          infoStatus.classList.remove("is-error", "is-success");
        }
      }

      function setInfoStatus(message, tone = "") {
        if (!infoStatus) return;
        infoStatus.textContent = message || "";
        infoStatus.classList.toggle("is-error", tone === "error");
        infoStatus.classList.toggle("is-success", tone === "success");
      }

      function getSelectedAllowedElementTypes() {
        if (!typeList) return [];
        const selectedIds = new Set([...typeList.querySelectorAll('[data-generate-elements-type]:checked')].map((input) => input.value));
        return elementTypes
          .filter((type) => selectedIds.has(type.id))
          .map((type) => ({ id: type.id, name: type.name || "Untitled Type" }));
      }

      function handleTypeListChange(event) {
        updateTypeCount();
      }

      function handleTypeSelectAllChange() {
        if (!typeList || !typeSelectAll) return;
        typeList.querySelectorAll("[data-generate-elements-type]").forEach((input) => {
          input.checked = typeSelectAll.checked;
        });
        updateTypeCount();
      }

      function readGenerateOptions() {
        const data = new FormData(form);
        const count = Math.min(50, Math.max(1, Math.round(Number(data.get("total-elements") || 12))));
        const density = String(data.get("relationship-density") || "balanced");
        const instructions = String(data.get("generation-instructions") || "").trim();
        const allowedElementTypes = getSelectedAllowedElementTypes();
        return {
          count,
          density: ["sparse", "balanced", "dense"].includes(density) ? density : "balanced",
          instructions,
          allowedElementTypes
        };
      }

      function buildGenerateElementsRequest(options, previewOnly = false) {
        return {
          universe: getGenerateElementsUniverseContext(),
          allowedElementTypes: options.allowedElementTypes,
          existingElements: getExistingElementContext(),
          count: options.count,
          relationshipDensity: options.density,
          instructions: options.instructions,
          sourceElement: options.sourceElement || null,
          previewOnly
        };
      }

      async function generateElements(options) {
        if (!elementTypes.length) {
          throw new Error("No element types are available. Add element types before generating elements.");
        }
        if (!options.allowedElementTypes.length) {
          throw new Error("Choose at least one element type before generating elements.");
        }
        lastGenerateOptions = {
          ...options,
          sourceElement: activeSourceElement
        };
        const payload = await callEdgeFunction("generate-universe-elements", {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildGenerateElementsRequest(lastGenerateOptions))
        });
        const draft = normalizeGeneratedElementsPayload(payload, activeSourceElement);
        if (!draft.elements.length) {
          throw new Error("The generator did not return any usable elements.");
        }
        lastGeneratedDraft = draft;
        renderGeneratedElementsReview(draft);
        openReviewModal();
      }

      async function handleGenerateSubmit(event) {
        event.preventDefault();
        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        try {
          const options = readGenerateOptions();
          setGenerateElementsOverlay(true);
          setGenerateElementsStatus("Generating elements...");
          await generateElements(options);
          setGenerateElementsStatus("");
        } catch (error) {
          setGenerateElementsStatus(getReadableError(error), "error");
        } finally {
          setGenerateElementsOverlay(false);
          if (submitButton) submitButton.disabled = false;
        }
      }

      async function handlePreviewInformation() {
        let options;
        try {
          options = readGenerateOptions();
          if (!options.allowedElementTypes.length) {
            throw new Error("Choose at least one element type before previewing the prompt.");
          }
        } catch (error) {
          setGenerateElementsStatus(getReadableError(error), "error");
          return;
        }
        openInfoModal();
        if (infoText) infoText.value = "Building prompt preview...";
        if (previewButton) previewButton.disabled = true;
        try {
          const previewOptions = {
            ...options,
            sourceElement: activeSourceElement
          };
          const payload = await callEdgeFunction("generate-universe-elements", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildGenerateElementsRequest(previewOptions, true))
          });
          if (infoText) {
            infoText.value = [
              "REQUEST CONTEXT",
              JSON.stringify(payload.request || buildGenerateElementsRequest(previewOptions), null, 2),
              "",
              "PROMPT",
              payload.prompt || ""
            ].join("\n");
          }
          setInfoStatus("");
        } catch (error) {
          if (infoText) infoText.value = "";
          setInfoStatus(getReadableError(error), "error");
        } finally {
          if (previewButton) previewButton.disabled = false;
        }
      }

      async function handleRegenerate() {
        if (!lastGenerateOptions) return;
        if (!lastGenerateOptions.allowedElementTypes?.length) {
          setGeneratedElementsReviewStatus("Choose at least one element type before generating again.", "error");
          return;
        }
        if (regenerateButton) regenerateButton.disabled = true;
        if (finalizeButton) finalizeButton.disabled = true;
        setGenerateElementsOverlay(true);
        try {
          setGeneratedElementsReviewStatus("Generating again...");
          const payload = await callEdgeFunction("generate-universe-elements", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildGenerateElementsRequest(lastGenerateOptions))
          });
          activeSourceElement = lastGenerateOptions.sourceElement || null;
          const draft = normalizeGeneratedElementsPayload(payload, activeSourceElement);
          if (!draft.elements.length) {
            throw new Error("The generator did not return any usable elements.");
          }
          lastGeneratedDraft = draft;
          renderGeneratedElementsReview(draft);
          setGeneratedElementsReviewStatus("");
        } catch (error) {
          setGeneratedElementsReviewStatus(getReadableError(error), "error");
        } finally {
          setGenerateElementsOverlay(false);
          if (regenerateButton) regenerateButton.disabled = false;
          if (finalizeButton) finalizeButton.disabled = false;
        }
      }

      function validateGeneratedReview(state) {
        if (!state.elements.length) {
          throw new Error("There are no generated elements to finalize.");
        }
        const tempIds = new Set();
        state.elements.forEach((element, index) => {
          if (!element.name) {
            throw new Error(`Element ${index + 1} needs a name.`);
          }
          if (!element.elementTypeId) {
            throw new Error(`Element "${element.name}" needs a valid database element type.`);
          }
          tempIds.add(element.tempId);
        });
        state.links.forEach((link, index) => {
          if (!link.source || !link.target) {
            throw new Error(`Link ${index + 1} needs a source and target.`);
          }
          if (getEndpointKey(link.source.kind, link.source.id) === getEndpointKey(link.target.kind, link.target.id)) {
            throw new Error(`Link ${index + 1} cannot connect an element to itself.`);
          }
          if (link.source.kind === "generated" && !tempIds.has(link.source.id)) {
            throw new Error(`Link ${index + 1} references a generated source that no longer exists.`);
          }
          if (link.target.kind === "generated" && !tempIds.has(link.target.id)) {
            throw new Error(`Link ${index + 1} references a generated target that no longer exists.`);
          }
        });
      }

      function withRequiredSourceLinks(state) {
        if (!state.elements.length) return state;
        const sourceElement = lastGenerateOptions?.sourceElement || null;
        const anchor = sourceElement?.id
          ? { kind: "existing", id: sourceElement.id, name: sourceElement.name }
          : { kind: "universe", id: universe.id, name: universe.name };
        const anchorKey = getEndpointKey(anchor.kind, anchor.id);
        const existingLinkKeys = new Set();
        const incomingGeneratedIds = new Set();

        state.links.forEach((link) => {
          const sourceKey = getEndpointKey(link.source?.kind, link.source?.id);
          const targetKey = getEndpointKey(link.target?.kind, link.target?.id);
          existingLinkKeys.add(`${sourceKey}>${targetKey}`);
          if (link.target?.kind === "generated") {
            incomingGeneratedIds.add(link.target.id);
          }
        });

        const links = [...state.links];
        state.elements.forEach((element) => {
          if (incomingGeneratedIds.has(element.tempId)) return;
          const target = { kind: "generated", id: element.tempId, name: element.name };
          const key = `${anchorKey}>${getEndpointKey(target.kind, target.id)}`;
          if (existingLinkKeys.has(key)) return;
          existingLinkKeys.add(key);
          incomingGeneratedIds.add(element.tempId);
          links.push({
            id: `anchor-link-${links.length + 1}`,
            source: anchor,
            target,
            label: sourceElement?.id ? "expands into" : "contains"
          });
        });

        return { ...state, links };
      }

      function getGeneratedElementPositions(count) {
        const universeNode = nodesRef.current.find((node) => node.id === activeUniverseNodeId)
          || nodesRef.current.find((node) => node.data?.kind === "universe");
        const originX = Number(universeNode?.position?.x ?? universe.canvas_position_x ?? 120);
        const originY = Number(universeNode?.position?.y ?? universe.canvas_position_y ?? 120);
        const universeWidth = Number(universeNode?.measured?.width || universeNode?.width || 260);
        const minimumRightX = originX + universeWidth + 160;
        if (lastGenerateOptions?.sourceElement) {
          const rowsPerColumn = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Math.max(1, count)))));
          const horizontalSpacing = 330;
          const verticalSpacing = 170;
          return Array.from({ length: count }, (_item, index) => {
            const column = Math.floor(index / rowsPerColumn);
            const row = index % rowsPerColumn;
            const rowsInColumn = Math.min(rowsPerColumn, count - column * rowsPerColumn);
            const centerOffset = (rowsInColumn - 1) / 2;
            return {
              x: Math.round(minimumRightX + column * horizontalSpacing),
              y: Math.round(originY + (row - centerOffset) * verticalSpacing)
            };
          });
        }
        const positions = [];
        let placed = 0;
        let ring = 1;
        while (placed < count) {
          const ringSize = Math.min(count - placed, Math.max(3, ring * 4));
          const xBase = minimumRightX + (ring - 1) * 300;
          const verticalSpacing = 175;
          const arcOffset = (ringSize - 1) / 2;
          for (let index = 0; index < ringSize && placed < count; index += 1) {
            const normalized = ringSize === 1 ? 0 : (index - arcOffset) / Math.max(1, arcOffset);
            const outwardCurve = Math.abs(normalized) * 120 * ring;
            positions.push({
              x: Math.round(Math.max(minimumRightX, xBase + outwardCurve)),
              y: Math.round(originY + (index - arcOffset) * verticalSpacing)
            });
            placed += 1;
          }
          ring += 1;
        }
        return positions;
      }

      function endpointToRecordId(endpoint, generatedIdMap) {
        if (!endpoint) return "";
        if (endpoint.kind === "universe") return universe.id;
        if (endpoint.kind === "existing") return endpoint.id;
        if (endpoint.kind === "generated") return generatedIdMap.get(endpoint.id) || "";
        return "";
      }

      function endpointToNodeId(endpoint, generatedIdMap) {
        const recordId = endpointToRecordId(endpoint, generatedIdMap);
        if (!recordId) return "";
        return endpoint.kind === "universe" ? `universe:${recordId}` : `element:${recordId}`;
      }

      async function finalizeGeneratedElements() {
        let state = getGeneratedElementsReviewState();
        try {
          validateGeneratedReview(state);
        } catch (error) {
          setGeneratedElementsReviewStatus(getReadableError(error), "error");
          return;
        }

        const ownerId = getElementOwnerId();
        if (!ownerId) {
          setGeneratedElementsReviewStatus("Could not determine the signed-in user for these elements.", "error");
          return;
        }

        if (finalizeButton) finalizeButton.disabled = true;
        if (regenerateButton) regenerateButton.disabled = true;
        setGeneratedElementsReviewStatus("Adding generated elements...");
        pushCanvasHistory();

        const positions = getGeneratedElementPositions(state.elements.length);
        state = withRequiredSourceLinks(state);
        const elementRows = state.elements.map((element, index) => ({
          id: createId(),
          user_id: ownerId,
          universe_id: universe.id,
          element_type_id: element.elementTypeId,
          rich_template_id: null,
          name: element.name,
          description: element.description || null,
          position_x: positions[index].x,
          position_y: positions[index].y
        }));

        const tempIdToInsertedId = new Map(state.elements.map((element, index) => [element.tempId, elementRows[index].id]));

        try {
          const { data: insertedElements, error: elementError } = await window.centralisSupabase
            .from("elements")
            .insert(elementRows)
            .select("id,name,description,position_x,position_y,element_type_id,rich_template_id,group_id,group_position_x,group_position_y");
          if (elementError) throw elementError;

          const linkRows = state.links
            .map((link) => {
              const sourceRecordId = endpointToRecordId(link.source, tempIdToInsertedId);
              const targetRecordId = endpointToRecordId(link.target, tempIdToInsertedId);
              if (!sourceRecordId || !targetRecordId || sourceRecordId === targetRecordId) return null;
              return {
                id: createId(),
                universe_id: universe.id,
                source_element_id: sourceRecordId,
                target_element_id: targetRecordId,
                label: link.label || null,
                stroke_color: universeFormatRef.current.strokeColor,
                stroke_width: universeFormatRef.current.strokeWidth,
                stroke_style: universeFormatRef.current.strokeStyle,
                path_type: universeFormatRef.current.pathType,
                sourceNodeId: endpointToNodeId(link.source, tempIdToInsertedId),
                targetNodeId: endpointToNodeId(link.target, tempIdToInsertedId)
              };
            })
            .filter(Boolean);

          if (linkRows.length) {
            const { error: linkError } = await window.centralisSupabase
              .from("element_links")
              .insert(linkRows.map(({ sourceNodeId: _sourceNodeId, targetNodeId: _targetNodeId, ...row }) => row));
            if (linkError) {
              await window.centralisSupabase.from("elements").delete().in("id", elementRows.map((row) => row.id));
              throw linkError;
            }
          }

          const insertedNodes = (insertedElements || []).map((row) => {
            const node = toElementNode(row);
            node.data.format = universeFormatRef.current;
            node.selected = true;
            return applyLayerOverlayToNode(node, activeLayerIdRef.current, layerEntriesRef.current, layerAssignmentsRef.current);
          });
          const insertedNodeIds = new Set(insertedNodes.map((node) => node.id));
          const linkEdges = linkRows.map((row) => ({
            id: row.id,
            source: row.sourceNodeId,
            target: row.targetNodeId,
            sourceHandle: "right",
            targetHandle: "left",
            label: row.label || undefined,
            type: "deletable",
            zIndex: LINK_EDGE_Z_INDEX,
            data: { recordId: row.id, format: universeFormatRef.current },
            style: {
              stroke: universeFormatRef.current.strokeColor,
              strokeWidth: universeFormatRef.current.strokeWidth,
              strokeDasharray: getStrokeDasharray(universeFormatRef.current.strokeStyle)
            }
          }));

          const nextNodes = [
            ...nodesRef.current.map((node) => ({ ...node, selected: false })),
            ...insertedNodes
          ].map((node) => ({
            ...node,
            selected: insertedNodeIds.has(node.id)
          }));
          const nextEdges = [...edgesRef.current, ...linkEdges];
          let finalNodes = nextNodes;
          let layoutWarning = "";
          const finalizedAiProposal = activeAiProposal;
          try {
            setGeneratedElementsReviewStatus("Adding generated elements and laying out canvas...");
            finalNodes = await createAutoLayout(nextNodes, nextEdges, universeFormatRef.current);
            finalNodes = finalNodes.map((node) => ({
              ...node,
              selected: insertedNodeIds.has(node.id)
            }));
            await saveNodePositions(finalNodes);
          } catch (layoutError) {
            console.error("Could not auto-layout generated elements:", layoutError);
            layoutWarning = " Auto-layout could not be saved.";
          }

          setNodes(finalNodes);
          setEdges(nextEdges);
          nodesRef.current = finalNodes;
          edgesRef.current = nextEdges;
          if (finalizedAiProposal?.id) {
            try {
              await updateAiElementProposalStatus(finalizedAiProposal, "finalized");
            } catch (proposalStatusError) {
              console.error("Could not mark AI proposal finalized:", proposalStatusError);
              layoutWarning = `${layoutWarning} Proposal status could not be updated.`;
            }
          }
          closeReviewModal(false);
          window.setTimeout(() => {
            fitCanvasToRenderedNodes({ padding: 0.06, duration: 360 });
          }, 50);
          const resultMessage = `Added ${insertedNodes.length} generated ${insertedNodes.length === 1 ? "element" : "elements"} and ${linkEdges.length} ${linkEdges.length === 1 ? "link" : "links"}.`;
          setTransferStatus(layoutWarning ? `${resultMessage}${layoutWarning}` : `${resultMessage} Auto-layout applied.`, layoutWarning ? "error" : "success");
        } catch (error) {
          setGeneratedElementsReviewStatus(`Could not add generated elements: ${getReadableError(error)}`, "error");
        } finally {
          if (finalizeButton) finalizeButton.disabled = false;
          if (regenerateButton) regenerateButton.disabled = false;
        }
      }

      function handleGenerateElementsEvent(event) {
        openGenerateElementsModal(event.detail?.nodeId);
      }

      function handleReviewAiProposalEvent(event) {
        const proposal = event.detail?.proposal;
        if (!proposal || proposal.type !== "create_elements" || proposal.status !== "pending") {
          return;
        }
        activeUniverseNodeId = `universe:${universe.id}`;
        activeSourceElement = null;
        lastGenerateOptions = {
          sourceElement: null,
          allowedElementTypes: elementTypes.map((type) => ({ id: type.id, name: type.name || "Untitled Type" })),
          density: "balanced",
          count: Array.isArray(proposal.payload?.elements) ? proposal.payload.elements.length : 0,
          instructions: ""
        };
        const draft = normalizeGeneratedElementsPayload(proposal.payload || {}, null);
        if (!draft.elements.length) {
          setTransferStatus("This AI proposal does not contain any usable elements.", "error");
          return;
        }
        lastGeneratedDraft = draft;
        renderGeneratedElementsReview(draft);
        openReviewModal({ mode: "ai-proposal", proposal });
      }

      function handleReviewCancel() {
        closeReviewModal(true);
      }

      function handleEscape(event) {
        if (event.key !== "Escape") return;
        if (infoModal && !infoModal.hidden) {
          closeInfoModal();
        } else if (!reviewModal.hidden) {
          closeReviewModal(true);
        } else if (!modal.hidden) {
          closeGenerateElementsModal();
        }
      }

      function handleTypeToggle() {
        if (!typeList || !typeToggle) return;
        const expanded = typeList.hidden;
        typeList.hidden = !expanded;
        typeToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      }

      window.addEventListener("centralis:generate-elements", handleGenerateElementsEvent);
      window.addEventListener("centralis:review-ai-element-proposal", handleReviewAiProposalEvent);
      form.addEventListener("submit", handleGenerateSubmit);
      typeToggle?.addEventListener("click", handleTypeToggle);
      typeList?.addEventListener("change", handleTypeListChange);
      typeSelectAll?.addEventListener("change", handleTypeSelectAllChange);
      previewButton?.addEventListener("click", handlePreviewInformation);
      infoCloseButtons.forEach((button) => button.addEventListener("click", closeInfoModal));
      cancelButtons.forEach((button) => button.addEventListener("click", closeGenerateElementsModal));
      reviewCancelButtons.forEach((button) => button.addEventListener("click", handleReviewCancel));
      regenerateButton?.addEventListener("click", handleRegenerate);
      finalizeButton?.addEventListener("click", finalizeGeneratedElements);
      document.addEventListener("keydown", handleEscape);

      return () => {
        window.removeEventListener("centralis:generate-elements", handleGenerateElementsEvent);
        window.removeEventListener("centralis:review-ai-element-proposal", handleReviewAiProposalEvent);
        form.removeEventListener("submit", handleGenerateSubmit);
        typeToggle?.removeEventListener("click", handleTypeToggle);
        typeList?.removeEventListener("change", handleTypeListChange);
        typeSelectAll?.removeEventListener("change", handleTypeSelectAllChange);
        previewButton?.removeEventListener("click", handlePreviewInformation);
        infoCloseButtons.forEach((button) => button.removeEventListener("click", closeInfoModal));
        cancelButtons.forEach((button) => button.removeEventListener("click", closeGenerateElementsModal));
        reviewCancelButtons.forEach((button) => button.removeEventListener("click", handleReviewCancel));
        regenerateButton?.removeEventListener("click", handleRegenerate);
        finalizeButton?.removeEventListener("click", finalizeGeneratedElements);
        document.removeEventListener("keydown", handleEscape);
      };
    }, [elementTypeVersion]);

    React.useEffect(() => {
      const importButton = document.querySelector("[data-import-elements]");
      const exportButton = document.querySelector("[data-export-elements]");
      const fileInput = document.querySelector("[data-import-elements-file]");
      const modal = document.getElementById("element-transfer-options-modal");
      const form = document.querySelector("[data-transfer-options-form]");
      const title = document.querySelector("[data-transfer-options-title]");
      const subtitle = document.querySelector("[data-transfer-options-subtitle]");
      const confirmButton = document.querySelector("[data-transfer-options-confirm]");
      const cancelButtons = document.querySelectorAll("[data-transfer-options-cancel]");
      if (!importButton || !exportButton || !fileInput || !modal || !form) {
        return undefined;
      }

      let transferMode = "export";
      let pendingImportOptions = DEFAULT_TRANSFER_OPTIONS;

      function readOptions() {
        const data = new FormData(form);
        return {
          connections: data.get("connections") === "on",
          position: data.get("position") === "on",
          richDetails: data.get("richDetails") === "on",
          customFields: data.get("customFields") === "on"
        };
      }

      function resetOptions() {
        Object.keys(DEFAULT_TRANSFER_OPTIONS).forEach((key) => {
          const input = form.elements.namedItem(key);
          if (input) {
            input.checked = DEFAULT_TRANSFER_OPTIONS[key];
          }
        });
      }

      function openTransferOptions(mode) {
        transferMode = mode;
        resetOptions();
        if (title) {
          title.textContent = mode === "import" ? "Import Elements" : "Export Elements";
        }
        if (subtitle) {
          subtitle.textContent = mode === "import"
            ? "Choose which data to bring into this universe."
            : "Choose which data to include in the export file.";
        }
        if (confirmButton) {
          confirmButton.textContent = mode === "import" ? "Choose File" : "Export";
        }
        modal.hidden = false;
      }

      function closeTransferOptions() {
        modal.hidden = true;
      }

      function handleImportClick() {
        openTransferOptions("import");
      }

      function handleExportClick() {
        const selectedElementNodes = nodesRef.current.filter((node) => node.selected && node.data?.kind === "element");
        if (!selectedElementNodes.length) {
          setTransferStatus("Select one or more element nodes to export.", "error");
          return;
        }
        openTransferOptions("export");
      }

      function handleSubmit(event) {
        event.preventDefault();
        const options = readOptions();
        closeTransferOptions();
        if (transferMode === "import") {
          pendingImportOptions = options;
          fileInput.value = "";
          fileInput.click();
          return;
        }
        exportSelectedElements(options);
      }

      function handleBackdropClick(event) {
        if (event.target === modal) {
          closeTransferOptions();
        }
      }

      function handleEscape(event) {
        if (event.key === "Escape" && !modal.hidden) {
          closeTransferOptions();
        }
      }

      function handleFileChange(event) {
        importElementsFromFile(event.target.files?.[0], pendingImportOptions);
      }

      importButton.addEventListener("click", handleImportClick);
      exportButton.addEventListener("click", handleExportClick);
      form.addEventListener("submit", handleSubmit);
      modal.addEventListener("click", handleBackdropClick);
      cancelButtons.forEach((button) => button.addEventListener("click", closeTransferOptions));
      document.addEventListener("keydown", handleEscape);
      fileInput.addEventListener("change", handleFileChange);
      return () => {
        importButton.removeEventListener("click", handleImportClick);
        exportButton.removeEventListener("click", handleExportClick);
        form.removeEventListener("submit", handleSubmit);
        modal.removeEventListener("click", handleBackdropClick);
        cancelButtons.forEach((button) => button.removeEventListener("click", closeTransferOptions));
        document.removeEventListener("keydown", handleEscape);
        fileInput.removeEventListener("change", handleFileChange);
      };
    }, []);

    React.useEffect(() => {
      const deleteButton = document.querySelector("[data-delete-selected-elements]");
      const label = document.querySelector("[data-delete-selected-label]");
      if (!deleteButton) {
        return undefined;
      }

      const selectedCount = nodes.filter((node) => node.selected && node.data?.kind === "element").length;
      deleteButton.hidden = selectedCount < 1;
      if (label) {
        label.textContent = selectedCount > 1 ? `Delete (${selectedCount})` : "Delete";
      }

      deleteButton.addEventListener("click", deleteSelectedElements);
      return () => {
        deleteButton.removeEventListener("click", deleteSelectedElements);
      };
    }, [nodes]);

    React.useEffect(() => {
      const groupButton = document.querySelector("[data-create-group]");
      if (!groupButton) {
        return undefined;
      }

      const selectedCount = nodes.filter((node) => node.selected && !node.parentId && (node.data?.kind === "element" || node.data?.kind === "group")).length;
      groupButton.hidden = selectedCount < 1;

      function handleGroupClick() {
        openCreateGroupDialog();
      }

      groupButton.addEventListener("click", handleGroupClick);
      return () => {
        groupButton.removeEventListener("click", handleGroupClick);
      };
    }, [nodes]);

    React.useEffect(() => {
      const noteButton = document.querySelector("[data-create-note]");
      if (!noteButton) {
        return undefined;
      }

      function handleNoteClick() {
        createNoteAt(getViewportCenterPosition());
      }

      noteButton.addEventListener("click", handleNoteClick);
      return () => {
        noteButton.removeEventListener("click", handleNoteClick);
      };
    }, []);

    React.useEffect(() => {
      const undoButton = document.querySelector("[data-undo-canvas]");
      const redoButton = document.querySelector("[data-redo-canvas]");
      if (!undoButton || !redoButton) {
        return undefined;
      }

      syncHistoryControls();

      async function handleUndo() {
        await undoCanvas();
      }

      async function handleRedo() {
        await redoCanvas();
      }

      undoButton.addEventListener("click", handleUndo);
      redoButton.addEventListener("click", handleRedo);
      return () => {
        undoButton.removeEventListener("click", handleUndo);
        redoButton.removeEventListener("click", handleRedo);
      };
    }, []);

    React.useEffect(() => {
      async function handleHistoryShortcut(event) {
        if (isFormEditingTarget(event.target)) {
          return;
        }
        const modifierPressed = event.ctrlKey || event.metaKey;
        if (!modifierPressed) {
          return;
        }
        const key = String(event.key || "").toLowerCase();
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          await undoCanvas();
        } else if (key === "y" || (key === "z" && event.shiftKey)) {
          event.preventDefault();
          await redoCanvas();
        }
      }

      document.addEventListener("keydown", handleHistoryShortcut, true);
      return () => {
        document.removeEventListener("keydown", handleHistoryShortcut, true);
      };
    }, []);

    React.useEffect(() => {
      async function handleDeleteShortcut(event) {
        if (event.key !== "Backspace" && event.key !== "Delete") {
          return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey || isFormEditingTarget(event.target)) {
          return;
        }
        if (!getSelectedElementNodes().length) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        await deleteSelectedElements();
      }

      document.addEventListener("keydown", handleDeleteShortcut, true);
      return () => {
        document.removeEventListener("keydown", handleDeleteShortcut, true);
      };
    }, []);

    React.useEffect(() => {
      const modal = document.getElementById("create-group-modal");
      const form = modal?.querySelector("[data-group-form]");
      const closeButtons = modal?.querySelectorAll("[data-close-group-modal]");
      const status = modal?.querySelector("[data-group-status]");
      if (!modal || !form) {
        return undefined;
      }

      function closeModal() {
        modal.hidden = true;
      }

      async function handleSubmit(event) {
        event.preventDefault();
        const submitButton = form.querySelector('[type="submit"]');
        const formData = new FormData(form);
        const groupName = String(formData.get("group-name") || "").trim();
        if (!groupName) {
          if (status) {
            status.textContent = "Name is required.";
            status.classList.add("is-error");
          }
          return;
        }
        if (submitButton) submitButton.disabled = true;
        const created = await createGroupFromSelection(groupName);
        if (submitButton) submitButton.disabled = false;
        if (created) {
          form.reset();
          closeModal();
        }
      }

      function handleClick(event) {
        if (event.target === modal) {
          closeModal();
        }
      }

      function handleEscape(event) {
        if (event.key === "Escape" && !modal.hidden) {
          closeModal();
        }
      }

      form.addEventListener("submit", handleSubmit);
      modal.addEventListener("click", handleClick);
      closeButtons.forEach((button) => button.addEventListener("click", closeModal));
      document.addEventListener("keydown", handleEscape);
      return () => {
        form.removeEventListener("submit", handleSubmit);
        modal.removeEventListener("click", handleClick);
        closeButtons.forEach((button) => button.removeEventListener("click", closeModal));
        document.removeEventListener("keydown", handleEscape);
      };
    }, [nodes]);

    React.useEffect(() => {
      function handleToggleGroup(event) {
        toggleGroupCollapsed(event.detail?.groupId, Boolean(event.detail?.collapsed));
      }
      function handleUpdateGroupColor(event) {
        updateGroupColor(event.detail?.groupId, event.detail?.color);
      }
      function handlePreviewResizeGroup(event) {
        previewResizeGroup(event.detail?.groupId, event.detail?.width, event.detail?.height);
      }
      function handleResizeGroup(event) {
        resizeAndLayoutGroup(event.detail?.groupId, event.detail?.width, event.detail?.height);
      }

      window.addEventListener("centralis:toggle-group", handleToggleGroup);
      window.addEventListener("centralis:update-group-color", handleUpdateGroupColor);
      window.addEventListener("centralis:preview-resize-group", handlePreviewResizeGroup);
      window.addEventListener("centralis:resize-group", handleResizeGroup);
      return () => {
        window.removeEventListener("centralis:toggle-group", handleToggleGroup);
        window.removeEventListener("centralis:update-group-color", handleUpdateGroupColor);
        window.removeEventListener("centralis:preview-resize-group", handlePreviewResizeGroup);
        window.removeEventListener("centralis:resize-group", handleResizeGroup);
      };
    }, []);

    React.useEffect(() => {
      function handleUpdateNote(event) {
        const detail = event.detail || {};
        const patch = { ...(detail.patch || {}) };
        const flush = Boolean(patch.flush);
        delete patch.flush;
        scheduleNoteSave(detail.nodeId, patch, flush);
      }
      function handlePreviewResizeNote(event) {
        resizeNoteNode(event.detail?.nodeId, event.detail?.width, event.detail?.height, false);
      }
      function handleResizeNote(event) {
        resizeNoteNode(event.detail?.nodeId, event.detail?.width, event.detail?.height, true);
      }
      function handleToggleNote(event) {
        toggleNoteCollapsed(event.detail?.nodeId, Boolean(event.detail?.collapsed));
      }
      function handleStyleNote(event) {
        const nodeId = event.detail?.nodeId;
        if (nodeId) {
          setPendingNoteStyle({ nodeId });
        }
      }

      window.addEventListener("centralis:update-note", handleUpdateNote);
      window.addEventListener("centralis:preview-resize-note", handlePreviewResizeNote);
      window.addEventListener("centralis:resize-note", handleResizeNote);
      window.addEventListener("centralis:toggle-note", handleToggleNote);
      window.addEventListener("centralis:style-note", handleStyleNote);
      return () => {
        window.removeEventListener("centralis:update-note", handleUpdateNote);
        window.removeEventListener("centralis:preview-resize-note", handlePreviewResizeNote);
        window.removeEventListener("centralis:resize-note", handleResizeNote);
        window.removeEventListener("centralis:toggle-note", handleToggleNote);
        window.removeEventListener("centralis:style-note", handleStyleNote);
        noteSaveTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        noteSaveTimersRef.current.clear();
      };
    }, []);

    React.useEffect(() => {
      const modal = document.getElementById("note-style-modal");
      const form = modal?.querySelector("[data-note-style-form]");
      const closeButtons = modal?.querySelectorAll("[data-close-note-style]");
      const status = modal?.querySelector("[data-note-style-status]");
      if (!modal || !form) {
        return undefined;
      }

      if (pendingNoteStyle?.nodeId) {
        const node = nodesRef.current.find((item) => item.id === pendingNoteStyle.nodeId);
        form.elements["note-bg-color"].value = sanitizeColor(node?.data?.bgColor, DEFAULT_NOTE_BG_COLOR);
        form.elements["note-border-color"].value = sanitizeColor(node?.data?.borderColor, DEFAULT_NOTE_BORDER_COLOR);
        form.elements["note-text-color"].value = sanitizeColor(node?.data?.textColor, DEFAULT_NOTE_TEXT_COLOR);
        if (status) {
          status.textContent = "";
          status.classList.remove("is-error");
        }
        modal.hidden = false;
      }

      function closeModal() {
        modal.hidden = true;
        setPendingNoteStyle(null);
      }

      async function handleSubmit(event) {
        event.preventDefault();
        const nodeId = pendingNoteStyle?.nodeId;
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node?.data?.recordId) {
          closeModal();
          return;
        }
        const formData = new FormData(form);
        const bgColor = sanitizeColor(formData.get("note-bg-color"), DEFAULT_NOTE_BG_COLOR);
        const borderColor = sanitizeColor(formData.get("note-border-color"), DEFAULT_NOTE_BORDER_COLOR);
        const textColor = sanitizeColor(formData.get("note-text-color"), DEFAULT_NOTE_TEXT_COLOR);

        const { error } = await window.centralisSupabase
          .from("canvas_notes")
          .update({
            bg_color: bgColor,
            border_color: borderColor,
            text_color: textColor,
            updated_at: new Date().toISOString()
          })
          .eq("id", node.data.recordId);

        if (error) {
          if (status) {
            status.textContent = `Could not save style: ${error.message}`;
            status.classList.add("is-error");
          }
          return;
        }

        setNodes((currentNodes) => currentNodes.map((currentNode) => (
          currentNode.id === nodeId
            ? {
              ...currentNode,
              data: {
                ...currentNode.data,
                bgColor,
                borderColor,
                textColor
              }
            }
            : currentNode
        )));
        closeModal();
      }

      function handleBackdropClick(event) {
        if (event.target === modal) {
          closeModal();
        }
      }

      function handleEscape(event) {
        if (event.key === "Escape" && !modal.hidden) {
          closeModal();
        }
      }

      form.addEventListener("submit", handleSubmit);
      modal.addEventListener("click", handleBackdropClick);
      closeButtons.forEach((button) => button.addEventListener("click", closeModal));
      document.addEventListener("keydown", handleEscape);
      return () => {
        form.removeEventListener("submit", handleSubmit);
        modal.removeEventListener("click", handleBackdropClick);
        closeButtons.forEach((button) => button.removeEventListener("click", closeModal));
        document.removeEventListener("keydown", handleEscape);
      };
    }, [pendingNoteStyle]);

    React.useEffect(() => {
      const toggle = document.querySelector("[data-toggle-layers-mode]");
      const panel = document.querySelector("[data-layers-panel]");
      const layerSelect = document.querySelector("[data-active-layer-select]");
      const legend = document.querySelector("[data-layer-inline-legend]");
      const selectedSummary = document.querySelector("[data-layer-selected-summary]");
      const count = document.querySelector("[data-layer-panel-count]");
      const manageButton = document.querySelector("[data-open-layers-manager]");
      const assignButton = document.querySelector("[data-open-layer-assignment]");
      if (!toggle || !panel || !layerSelect) {
        return undefined;
      }

      const selectedCount = nodes.filter((node) => node.selected && node.data?.kind === "element").length;
      layerSelect.innerHTML = [
        `<option value="">No active layer</option>`,
        ...layers.map((layer) => `<option value="${escapeHtml(layer.id)}">${escapeHtml(layer.name)}</option>`)
      ].join("");
      layerSelect.value = activeLayerId;

      panel.hidden = !layerModeActive;
      toggle.classList.toggle("is-active", layerModeActive);
      toggle.setAttribute("aria-pressed", String(layerModeActive));
      if (count) {
        count.textContent = layers.length ? `${layers.length} ${layers.length === 1 ? "layer" : "layers"}` : "No layers yet";
      }
      if (legend) {
        legend.innerHTML = layerModeActive && activeLayerId && activeLayerEntries.length
          ? activeLayerEntries.map((entry) => `
            <div class="layer-inline-legend-row">
              <span class="layer-legend-swatch" style="--entry-color: ${escapeHtml(sanitizeColor(entry.color, "#6366f1"))}"></span>
              <span>${escapeHtml(entry.name)}</span>
            </div>
          `).join("")
          : "";
      }
      if (selectedSummary) {
        selectedSummary.textContent = selectedCount
          ? `${selectedCount} selected ${selectedCount === 1 ? "element" : "elements"}`
          : "No elements selected";
      }
      if (assignButton) {
        assignButton.disabled = !layerModeActive || !activeLayerId || !selectedCount || !activeLayerEntries.length;
      }

      function handleToggleClick(event) {
        event.stopPropagation();
        setLayerModeActive((isActive) => {
          const nextActive = !isActive;
          if (nextActive && !activeLayerIdRef.current && layersRef.current[0]?.id) {
            setActiveLayerId(layersRef.current[0].id);
          }
          return nextActive;
        });
      }

      function handleLayerChange(event) {
        setActiveLayerId(event.target.value || "");
        setLayerStatus("");
      }

      function handleManageClick() {
        const modal = document.getElementById("layers-manager-modal");
        if (modal) {
          modal.hidden = false;
          setLayersManagerLayerId((currentId) => currentId || layers[0]?.id || "");
          renderLayersManager();
        }
      }

      function handleAssignClick() {
        openLayerAssignmentDialog();
      }

      toggle.addEventListener("click", handleToggleClick);
      layerSelect.addEventListener("change", handleLayerChange);
      manageButton?.addEventListener("click", handleManageClick);
      assignButton?.addEventListener("click", handleAssignClick);
      return () => {
        toggle.removeEventListener("click", handleToggleClick);
        layerSelect.removeEventListener("change", handleLayerChange);
        manageButton?.removeEventListener("click", handleManageClick);
        assignButton?.removeEventListener("click", handleAssignClick);
      };
    }, [layers, activeLayerId, activeLayerEntries, layerModeActive, nodes]);

    React.useEffect(() => {
      const modal = document.getElementById("layers-manager-modal");
      const addButton = modal?.querySelector("[data-add-layer]");
      const closeButtons = modal?.querySelectorAll("[data-close-layers-manager]");
      if (!modal || !addButton) {
        return undefined;
      }

      renderLayersManager();

      async function runLayerAction(action) {
        try {
          setLayersManagerStatus("");
          await action();
        } catch (error) {
          setLayersManagerStatus(getReadableError(error), "error");
        }
      }

      function closeModal() {
        modal.hidden = true;
      }

      function handleAddLayer() {
        runLayerAction(createLayer);
      }

      function handleClick(event) {
        const selectLayerButton = event.target.closest("[data-select-layer]");
        if (selectLayerButton) {
          setLayersManagerLayerId(selectLayerButton.dataset.selectLayer);
          return;
        }
        const deleteLayerButton = event.target.closest("[data-delete-layer]");
        if (deleteLayerButton) {
          runLayerAction(() => deleteLayer(deleteLayerButton.dataset.deleteLayer));
          return;
        }
        const addEntryButton = event.target.closest("[data-add-layer-entry]");
        if (addEntryButton) {
          runLayerAction(() => createLayerEntry(addEntryButton.dataset.addLayerEntry));
          return;
        }
        const deleteEntryButton = event.target.closest("[data-delete-layer-entry]");
        if (deleteEntryButton) {
          runLayerAction(() => deleteLayerEntry(deleteEntryButton.dataset.deleteLayerEntry));
          return;
        }
        if (event.target === modal) {
          closeModal();
        }
      }

      function handleSubmit(event) {
        const layerForm = event.target.closest("[data-layer-form]");
        const entryForm = event.target.closest("[data-layer-entry-form]");
        if (!layerForm && !entryForm) {
          return;
        }
        event.preventDefault();
        const formData = new FormData(event.target);
        const payload = Object.fromEntries(formData.entries());
        if (layerForm) {
          runLayerAction(() => saveLayer(layerForm.dataset.layerForm, payload));
        } else if (entryForm) {
          runLayerAction(() => saveLayerEntry(entryForm.dataset.layerEntryForm, payload));
        }
      }

      function handleEscape(event) {
        if (event.key === "Escape" && !modal.hidden) {
          closeModal();
        }
      }

      addButton.addEventListener("click", handleAddLayer);
      modal.addEventListener("click", handleClick);
      modal.addEventListener("submit", handleSubmit);
      closeButtons.forEach((button) => button.addEventListener("click", closeModal));
      document.addEventListener("keydown", handleEscape);
      return () => {
        addButton.removeEventListener("click", handleAddLayer);
        modal.removeEventListener("click", handleClick);
        modal.removeEventListener("submit", handleSubmit);
        closeButtons.forEach((button) => button.removeEventListener("click", closeModal));
        document.removeEventListener("keydown", handleEscape);
      };
    }, [layers, layerEntries, layersManagerLayerId]);

    React.useEffect(() => {
      const modal = document.getElementById("layer-assignment-modal");
      const form = modal?.querySelector("[data-layer-assignment-form]");
      const closeButtons = modal?.querySelectorAll("[data-close-layer-assignment]");
      const clearButton = modal?.querySelector("[data-clear-layer-assignment]");
      if (!modal || !form) {
        return undefined;
      }

      if (!modal.hidden) {
        renderLayerAssignmentDialog();
      }

      function closeModal() {
        modal.hidden = true;
      }

      async function handleSubmit(event) {
        event.preventDefault();
        const checkedEntryIds = [...form.querySelectorAll('input[name="entry"]:checked')]
          .map((input) => input.value)
          .filter(Boolean);
        await saveSelectedLayerAssignments(checkedEntryIds);
        closeModal();
      }

      async function handleClear() {
        await clearSelectedLayerAssignments();
        closeModal();
      }

      function handleClick(event) {
        if (event.target === modal) {
          closeModal();
        }
      }

      function handleEscape(event) {
        if (event.key === "Escape" && !modal.hidden) {
          closeModal();
        }
      }

      form.addEventListener("submit", handleSubmit);
      clearButton?.addEventListener("click", handleClear);
      modal.addEventListener("click", handleClick);
      closeButtons.forEach((button) => button.addEventListener("click", closeModal));
      document.addEventListener("keydown", handleEscape);
      return () => {
        form.removeEventListener("submit", handleSubmit);
        clearButton?.removeEventListener("click", handleClear);
        modal.removeEventListener("click", handleClick);
        closeButtons.forEach((button) => button.removeEventListener("click", closeModal));
        document.removeEventListener("keydown", handleEscape);
      };
    }, [activeLayer, activeLayerEntries, layerAssignments, nodes]);

    React.useEffect(() => {
      function handleEscape(event) {
        if (event.key === "Escape") {
          setContextMenu(null);
          setCanvasContextMenu(null);
        }
      }
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }, []);

    const handleNodeDrag = React.useCallback((_event, node) => {
      closeContextMenu();
      const storedNode = nodesRef.current.find((item) => item.id === node.id);
      const currentNode = storedNode ? { ...storedNode, position: node.position } : node;
      const targetGroup = findDropTargetGroup(currentNode, nodesRef.current);
      setGroupDropTarget(targetGroup?.id || "");
    }, []);

    const handleNodeDragStop = React.useCallback(async (_event, node) => {
      dragHistoryNodeIdRef.current = "";
      const currentNodes = nodesRef.current;
      const storedNode = currentNodes.find((item) => item.id === node.id);
      const currentNode = storedNode ? { ...storedNode, position: node.position } : node;
      const targetGroup = findDropTargetGroup(currentNode, currentNodes);
      setGroupDropTarget("");
      if (!targetGroup) {
        return;
      }
      await addNodeToGroup(currentNode, targetGroup);
    }, []);

    const nodesWithDropTarget = React.useMemo(() => nodes.map((node) => {
      if (node.data?.kind !== "group") {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          isDropTarget: node.id === dropTargetGroupId
        }
      };
    }), [nodes, dropTargetGroupId]);

    const renderedNodes = React.useMemo(() => getVisibleNodesForGroups(nodesWithDropTarget), [nodesWithDropTarget]);
    const renderedEdges = React.useMemo(() => getVisibleEdgesForGroups(edges, nodes), [edges, nodes]);

    const handleNodeContextMenu = React.useCallback((event, node) => {
      event.preventDefault();
      event.stopPropagation();
      const preserveSelection = Boolean(node.selected);
      setNodes((currentNodes) => currentNodes.map((currentNode) => ({
        ...currentNode,
        selected: preserveSelection ? currentNode.selected : currentNode.id === node.id
      })));
      const wrapperRect = reactFlowWrapper.current?.getBoundingClientRect();
      setContextMenu({
        nodeId: node.id,
        x: Math.max(8, (event.clientX || 0) - (wrapperRect?.left || 0)),
        y: Math.max(8, (event.clientY || 0) - (wrapperRect?.top || 0))
      });
    }, []);

    const handlePaneContextMenu = React.useCallback((event) => {
      event.preventDefault();
      event.stopPropagation();
      const wrapperRect = reactFlowWrapper.current?.getBoundingClientRect();
      const canvasX = Math.max(8, (event.clientX || 0) - (wrapperRect?.left || 0));
      const canvasY = Math.max(8, (event.clientY || 0) - (wrapperRect?.top || 0));
      let position = { x: canvasX, y: canvasY };
      if (reactFlowInstance.current) {
        position = reactFlowInstance.current.project({ x: canvasX, y: canvasY });
      }
      setContextMenu(null);
      setCanvasContextMenu({ x: canvasX, y: canvasY, position });
    }, []);

    function closeContextMenu() {
      setContextMenu(null);
      setCanvasContextMenu(null);
    }

    const contextMenuNode = contextMenu
      ? nodes.find((node) => node.id === contextMenu.nodeId)
      : null;
    const contextSelectedElements = contextMenuNode?.data?.kind === "element"
      ? nodes.filter((node) => node.selected && node.data?.kind === "element")
      : [];
    const contextIsSingleElement = contextSelectedElements.length === 1;
    const contextIsGroupedSelection = Boolean(contextSelectedElements[0]?.data?.groupId);
    const contextIsUngroupedSelection = Boolean(contextSelectedElements.length && !contextSelectedElements[0]?.data?.groupId);
    const contextGroupId = contextMenuNode?.data?.kind === "group"
      ? contextMenuNode.data.recordId
      : contextSelectedElements[0]?.data?.groupId || "";
    const aiPopoutStatus = getUniverseAiStatusMeta(aiChatState);
    const aiPopoutStatusLine = getUniverseAiReadyStatusLine(aiPopoutStatus);

    return React.createElement(
      "div",
      {
        ref: reactFlowWrapper,
        className: "flow-canvas-inner",
        onContextMenu: (event) => event.preventDefault()
      },
      React.createElement(
      ReactFlowComponent,
      {
        nodes: renderedNodes,
        edges: renderedEdges,
        nodeTypes,
        edgeTypes,
        fitView: false,
        minZoom: 0.08,
        maxZoom: 2.5,
        onInit: (instance) => {
          reactFlowInstance.current = instance;
          window.requestAnimationFrame(() => {
            window.setTimeout(() => fitCanvasToRenderedNodes({ padding: 0.06, duration: 0 }), 80);
          });
        },
        onNodesChange: handleNodesChange,
        onEdgesChange: handleEdgesChange,
        onNodeDragStart: handleNodeDragStart,
        onNodeDrag: handleNodeDrag,
        onNodeDragStop: handleNodeDragStop,
        onNodeContextMenu: handleNodeContextMenu,
        onPaneContextMenu: handlePaneContextMenu,
        onNodeClick: closeContextMenu,
        onPaneClick: closeContextMenu,
        onMoveStart: closeContextMenu,
        onConnectStart: (_event, params) => {
          if (isGroupNodeId(params.nodeId) || isNoteNodeId(params.nodeId)) {
            window.__centralisConnectionStart = null;
            return;
          }
          window.__centralisConnectionStart = {
            sourceNodeId: params.nodeId,
            sourceHandle: params.handleId
          };
        },
        onConnect: handleConnect,
        onConnectEnd: handleConnectEnd,
        elementsSelectable: true,
        nodesDraggable: true,
        multiSelectionKeyCode: ["Control", "Meta"],
        selectionKeyCode: "Shift",
        deleteKeyCode: null,
        selectionOnDrag: false,
        panOnDrag: true,
        proOptions: { hideAttribution: true }
      },
      React.createElement(Background, { gap: 18, size: 1 }),
      React.createElement(
        Controls,
        { showFitView: !ControlButton },
        ControlButton && React.createElement(
          ControlButton,
          {
            type: "button",
            title: "Fit view",
            "aria-label": "Fit view",
            onClick: () => fitCanvasToRenderedNodes({ padding: 0.06, duration: 360 })
          },
          React.createElement("ph-corners-out", { "aria-hidden": "true" })
        )
      )
      ),
      aiChatPopoutOpen && React.createElement(
        "section",
        {
          className: "universe-ai-popout",
          role: "dialog",
          "aria-modal": "false",
          "aria-labelledby": "universe-ai-popout-title"
        },
        React.createElement(
          "header",
          { className: "universe-ai-popout-header" },
          React.createElement(
            "div",
            { className: "universe-ai-popout-title-block" },
            React.createElement("p", { className: "details-pane-kicker" }, "AI Expert"),
            React.createElement("h2", { id: "universe-ai-popout-title" }, universe.name || "Universe Expert"),
            aiPopoutStatusLine && React.createElement("p", { className: "universe-ai-header-status" }, aiPopoutStatusLine)
          ),
          React.createElement(
            "button",
            {
              className: "modal-close",
              type: "button",
              "aria-label": "Close AI Expert chat",
              onClick: () => setAiChatPopoutOpen(false)
            },
            React.createElement(
              "svg",
              { viewBox: "0 0 24 24", "aria-hidden": "true" },
              React.createElement("path", { d: "M18 6 6 18" }),
              React.createElement("path", { d: "m6 6 12 12" })
            )
          )
        ),
        React.createElement("div", {
          className: "universe-ai-popout-body",
          "data-ai-popout-content": true
        })
      ),
      contextMenu && React.createElement(
        "div",
        {
          className: "node-context-menu",
          style: {
            left: contextMenu.x,
            top: contextMenu.y
          },
          onClick: closeContextMenu,
          onContextMenu: (event) => event.preventDefault()
        },
        contextMenuNode?.data?.kind === "universe" && React.createElement(
          "button",
          {
            type: "button",
            onClick: (event) => {
              event.stopPropagation();
              closeContextMenu();
              openNodeDetails(contextMenuNode.id);
            }
          },
          "View Details"
        ),
        contextMenuNode?.data?.kind === "universe" && React.createElement(
          "button",
          {
            type: "button",
            onClick: (event) => {
              event.stopPropagation();
              closeContextMenu();
              window.dispatchEvent(new CustomEvent("centralis:generate-elements", {
                detail: { nodeId: contextMenuNode.id, universeId: contextMenuNode.data?.recordId }
              }));
            }
          },
          "Generate Elements"
        ),
        contextMenuNode?.data?.kind === "element" && contextIsSingleElement && React.createElement(
          "button",
          {
            type: "button",
            onClick: (event) => {
              event.stopPropagation();
              closeContextMenu();
              openNodeDetails(contextMenuNode.id);
            }
          },
          "View Details"
        ),
        contextMenuNode?.data?.kind === "element" && contextIsSingleElement && React.createElement(
          "button",
          {
            type: "button",
            onClick: (event) => {
              event.stopPropagation();
              closeContextMenu();
              window.dispatchEvent(new CustomEvent("centralis:generate-elements", {
                detail: { nodeId: contextMenuNode.id, elementId: contextMenuNode.data?.recordId }
              }));
            }
          },
          "Generate Elements"
        ),
        contextMenuNode?.data?.kind === "element" && contextSelectedElements.length > 0 && React.createElement(
          "button",
          {
            type: "button",
            onClick: async (event) => {
              event.stopPropagation();
              closeContextMenu();
              await duplicateSelectedElements();
            }
          },
          "Duplicate"
        ),
        contextMenuNode?.data?.kind === "element" && contextIsUngroupedSelection && React.createElement(
          "button",
          {
            type: "button",
            onClick: (event) => {
              event.stopPropagation();
              closeContextMenu();
              openCreateGroupDialog();
            }
          },
          "Group"
        ),
        contextMenuNode?.data?.kind === "element" && contextIsGroupedSelection && React.createElement(
          "button",
          {
            type: "button",
            onClick: async (event) => {
              event.stopPropagation();
              closeContextMenu();
              await autoLayoutGroup(contextGroupId);
            }
          },
          "Auto Layout Group"
        ),
        contextMenuNode?.data?.kind === "element" && contextIsGroupedSelection && React.createElement(
          "button",
          {
            type: "button",
            onClick: async (event) => {
              event.stopPropagation();
              closeContextMenu();
              await removeSelectedElementsFromGroup();
            }
          },
          "Remove From Group"
        ),
        contextMenuNode?.data?.kind === "element" && contextSelectedElements.length > 0 && React.createElement("div", {
          className: "node-context-menu-separator",
          role: "separator"
        }),
        contextMenuNode?.data?.kind === "element" && contextSelectedElements.length > 0 && React.createElement(
          "button",
          {
            className: "danger-menu-item",
            type: "button",
            onClick: async (event) => {
              event.stopPropagation();
              closeContextMenu();
              await deleteSelectedElements();
            }
          },
          "Delete"
        ),
        contextMenuNode?.data?.kind === "note" && React.createElement(
          "button",
          {
            type: "button",
            onClick: (event) => {
              event.stopPropagation();
              closeContextMenu();
              setPendingNoteStyle({ nodeId: contextMenuNode.id });
            }
          },
          "Style"
        ),
        contextMenuNode?.data?.kind === "note" && React.createElement("div", {
          className: "node-context-menu-separator",
          role: "separator"
        }),
        contextMenuNode?.data?.kind === "note" && React.createElement(
          "button",
          {
            className: "danger-menu-item",
            type: "button",
            onClick: async (event) => {
              event.stopPropagation();
              closeContextMenu();
              await deleteNoteNode(contextMenuNode);
            }
          },
          "Delete"
        ),
        contextMenuNode?.data?.kind === "group" && React.createElement(
          "button",
          {
            type: "button",
            onClick: async (event) => {
              event.stopPropagation();
              closeContextMenu();
              await autoLayoutGroup(contextGroupId);
            }
          },
          "Auto Layout Group"
        ),
        contextMenuNode?.data?.kind === "group" && React.createElement("div", {
          className: "node-context-menu-separator",
          role: "separator"
        }),
        contextMenuNode?.data?.kind === "group" && React.createElement(
          "button",
          {
            type: "button",
            onClick: async (event) => {
              event.stopPropagation();
              closeContextMenu();
              await ungroupNode(contextMenuNode);
            }
          },
          "Ungroup"
        )
      ),
      canvasContextMenu && React.createElement(
        "div",
        {
          className: "node-context-menu",
          style: {
            left: canvasContextMenu.x,
            top: canvasContextMenu.y
          },
          onClick: closeContextMenu,
          onContextMenu: (event) => event.preventDefault()
        },
        React.createElement(
          "button",
          {
            type: "button",
            onClick: async (event) => {
              event.stopPropagation();
              const position = canvasContextMenu.position;
              closeContextMenu();
              await createNoteAt(position);
            }
          },
          "Add Note"
        )
      )
    );
  }

  ReactDOM.createRoot(rootElement).render(React.createElement(UniverseFlow));
})();
