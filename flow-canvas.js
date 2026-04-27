(async function initUniverseCanvas() {
  const rootElement = document.getElementById("universe-flow");
  if (!rootElement || !window.React || !window.ReactDOM || !window.ReactFlow) {
    if (rootElement) {
      rootElement.textContent = "React Flow could not be loaded.";
    }
    return;
  }

  const SUPABASE_TIMEOUT_MS = 15000;
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

  function createBlurb(description) {
    if (!description) {
      return "No description yet.";
    }

    const trimmed = description.trim();
    return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
  let elementLinks = [];
  let imageRows = [];

  if (window.centralisSupabase && universeId) {
    const universeResponse = await withTimeout(window.centralisSupabase
      .from("universes")
      .select("id,name,description,canvas_position_x,canvas_position_y,fmt_stroke_color,fmt_stroke_width,fmt_stroke_style,fmt_path_type,fmt_node_bg_opacity,fmt_node_border_width,fmt_node_image_placement,fmt_node_layout_gap")
      .eq("id", universeId)
      .maybeSingle(), "Loading universe");

    if (universeResponse.error && rootElement) {
      rootElement.textContent = `Could not load universe: ${universeResponse.error.message}`;
      return;
    }

    if (universeResponse.data) {
      universe = universeResponse.data;
    }

    const typeResponse = await withTimeout(window.centralisSupabase
      .from("element_types")
      .select("id,name,icon,color")
      .eq("universe_id", universeId)
      .order("name", { ascending: true }), "Loading element types");

    if (!typeResponse.error) {
      elementTypes = typeResponse.data || [];
    }

    const elementResponse = await withTimeout(window.centralisSupabase
      .from("elements")
      .select("id,name,description,position_x,position_y,element_type_id")
      .eq("universe_id", universeId)
      .order("created_at", { ascending: true }), "Loading elements");

    if (!elementResponse.error) {
      elements = elementResponse.data || [];
    }

    const linkResponse = await withTimeout(window.centralisSupabase
      .from("element_links")
      .select("id,source_element_id,target_element_id,label,stroke_color,stroke_width,stroke_style,path_type")
      .eq("universe_id", universeId)
      .order("created_at", { ascending: true }), "Loading element links");

    if (!linkResponse.error) {
      elementLinks = linkResponse.data || [];
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
  const Handle = Flow.Handle;
  const Position = Flow.Position;
  const EdgeLabelRenderer = Flow.EdgeLabelRenderer;
  const BaseEdge = Flow.BaseEdge;
  const getBezierPath = Flow.getBezierPath;
  const getSmoothStepPath = Flow.getSmoothStepPath;
  const getStraightPath = Flow.getStraightPath;
  const applyNodeChanges = Flow.applyNodeChanges;
  const applyEdgeChanges = Flow.applyEdgeChanges;

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
    const color = sanitizeColor(elementType?.color);
    const typeName = elementType?.name || "No Type";
    const iconName = sanitizeIconName(elementType?.icon);
    const format = data.format || DEFAULT_UNIVERSE_FORMAT;
    const imageUrl = data.images?.[0]?.image_url;
    const imagePlacement = imageUrl ? format.nodeImagePlacement : "hidden";

    return React.createElement(
      "article",
      {
        className: `element-flow-node node-image-${imagePlacement}${props.selected ? " is-selected" : ""}`,
        style: {
          "--element-color": color,
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

  function toElementNode(row) {
    const elementType = elementTypes.find((type) => type.id === row.element_type_id) || null;

    return {
      id: `element:${row.id}`,
      type: "element",
      position: {
        x: Number(row.position_x ?? 460),
        y: Number(row.position_y ?? 180)
      },
      data: {
        kind: "element",
        recordId: row.id,
        name: row.name || "Untitled Element",
        description: row.description || "",
        elementType,
        format: initialUniverseFormat,
        images: getImagesForObject(row.id)
      },
      draggable: true
    };
  }

  const initialNodes = [
    toUniverseNode(universe),
    ...elements.map(toElementNode)
  ];

  function toRecordId(nodeId) {
    return String(nodeId || "").replace(/^(universe|element):/, "");
  }

  function toNodeId(recordId) {
    const value = String(recordId || "");
    if (value.startsWith("universe:") || value.startsWith("element:")) {
      return value;
    }

    return value === universe.id ? `universe:${value}` : `element:${value}`;
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

  function getImagesForObject(objectId) {
    return imageRows.filter((image) => image.object_id === objectId);
  }

  function getNodeTypeMeta(node) {
    if (node?.data?.kind === "universe") {
      return {
        label: "Universe",
        icon: "globe-hemisphere-west",
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
      content: pane.querySelector("[data-details-content]"),
      closeButton: pane.querySelector("[data-details-close]"),
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
    }
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

  function renderImageGallery(images, nodeId) {
    if (!images?.length) {
      return '<p class="details-empty">No images yet.</p>';
    }

    const primaryImage = images.find((image) => image.is_primary) || images[0];
    const primaryIndex = Math.max(0, images.findIndex((image) => image.id === primaryImage.id));

    return `
      <div class="image-gallery">
        <button class="image-primary" type="button" data-image-primary data-node-id="${escapeHtml(nodeId)}" data-image-id="${escapeHtml(primaryImage.id)}">
          <img src="${escapeHtml(primaryImage.image_url)}" alt="" data-image-primary-img>
          <span data-image-counter>${primaryIndex + 1} / ${images.length}</span>
        </button>
        <div class="image-thumbs" aria-label="Image gallery">
          ${images.map((image, index) => `
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

  function createImagePrompt(node) {
    const meta = getNodeTypeMeta(node);
    const name = node.data?.name || "Untitled Node";
    const description = node.data?.description || "";
    return [
      `${name} is a ${meta.label.toLowerCase()} in a universe-building canvas.`,
      description,
      "Create a visually rich, cinematic concept image based on these details."
    ].filter(Boolean).join(" ");
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

  function setDetailsPaneMode(controls, mode) {
    const isEditMode = mode === "edit";
    if (controls.editButton) {
      controls.editButton.hidden = isEditMode;
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
    setDetailsPaneMode(controls, mode);
    if (controls.kind) {
      controls.kind.textContent = meta.label;
    }
    if (controls.title) {
      controls.title.textContent = name;
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
      <section class="details-section">
        <dl class="details-fields">
          <div>
            <dt>Name</dt>
            <dd>${escapeHtml(name)}</dd>
          </div>
        </dl>
      </section>
      <section class="details-section">
        <h3>Images</h3>
        ${renderImageGallery(images, nodeId)}
      </section>
      <section class="details-section">
        <dl class="details-fields">
          <div>
            <dt>Description</dt>
            <dd class="details-description-text">${escapeHtml(description)}</dd>
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
      <section class="details-section">
        <h3>Linked Nodes</h3>
        <div class="linked-node-list">
          ${renderLinkedNodeCards(linkedNodes)}
        </div>
      </section>
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
    } else {
      tableName = "elements";
      payload.position_x = Number(node.position.x);
      payload.position_y = Number(node.position.y);
    }

    const { error } = await window.centralisSupabase
      .from(tableName)
      .update(payload)
      .eq("id", node.data.recordId);

    if (error) {
      console.error("Could not save node position:", error);
    }
  }

  function getElementTypeById(typeId) {
    return elementTypes.find((type) => type.id === typeId) || null;
  }

  async function fetchElementTypes() {
    if (!window.centralisSupabase || !universe?.id) {
      return elementTypes;
    }

    const { data, error } = await window.centralisSupabase
      .from("element_types")
      .select("id,name,icon,color")
      .eq("universe_id", universe.id)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    elementTypes = data || [];
    return elementTypes;
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

    controls.trigger.addEventListener("click", handleTriggerClick);
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    setElementTypePickerValue("");

    return () => {
      controls.trigger.removeEventListener("click", handleTriggerClick);
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }

  function UniverseFlow() {
    const [nodes, setNodes] = React.useState(initialNodes);
    const [edges, setEdges] = React.useState(initialEdges);
    const [universeFormat, setUniverseFormat] = React.useState(initialUniverseFormat);
    const [elementTypeVersion, setElementTypeVersion] = React.useState(0);
    const [pendingLink, setPendingLink] = React.useState(null);
    const [pendingDeleteElement, setPendingDeleteElement] = React.useState(null);
    const [detailsNodeId, setDetailsNodeId] = React.useState(null);
    const [detailsMode, setDetailsMode] = React.useState("view");
    const [pendingImageGeneration, setPendingImageGeneration] = React.useState(null);
    const reactFlowWrapper = React.useRef(null);
    const reactFlowInstance = React.useRef(null);
    const nodesRef = React.useRef(nodes);
    const nodeTypes = React.useMemo(() => ({ universe: UniverseNode, element: ElementNode }), []);

    React.useEffect(() => {
      nodesRef.current = nodes;
    }, [nodes]);

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
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== edgeId));

      const { error } = await window.centralisSupabase
        .from("element_links")
        .delete()
        .eq("id", edgeId);

      if (error) {
        console.error("Could not delete element link:", error);
      }
    }, []);
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
      setDetailsNodeId(nodeId);
      setDetailsMode("view");
      setNodes((currentNodes) => currentNodes.map((node) => ({
        ...node,
        selected: node.id === nodeId
      })));
    }, []);

    const setNodeImages = React.useCallback((nodeId, images) => {
      if (!Array.isArray(images)) {
        return;
      }

      setNodes((currentNodes) => currentNodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            images
          }
        };
      }));
    }, []);

    const refreshNodeImages = React.useCallback(async (node) => {
      if (!node?.data?.recordId) {
        return;
      }

      const data = await callEdgeFunction("list-object-images", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectIds: [node.data.recordId] })
      });

      setNodeImages(node.id, data.images || []);
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
      const downloadButton = document.querySelector("[data-image-viewer-download]");
      const deleteButton = document.querySelector("[data-image-viewer-delete]");
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
        const images = node?.data?.images || [];
        if (!node || !images.length) {
          return;
        }

        viewerNodeId = nodeId;
        viewerImages = images;
        viewerIndex = Math.max(0, images.findIndex((viewerImage) => viewerImage.id === imageId));
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
          const nextImages = viewerImages.filter((viewerImage) => viewerImage.id !== activeImage.id);
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
      downloadButton?.addEventListener("click", handleDownload);
      deleteButton?.addEventListener("click", handleDelete);
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
        downloadButton?.removeEventListener("click", handleDownload);
        deleteButton?.removeEventListener("click", handleDelete);
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
    }, [applyUniverseFormat, universeFormat]);

    React.useEffect(() => {
      const modal = document.getElementById("element-types-modal");
      const opener = document.querySelector("[data-open-types-modal]");
      const closeButton = document.querySelector("[data-close-types-modal]");
      const addButton = document.querySelector("[data-add-type]");
      const list = document.querySelector("[data-element-types-list]");
      const count = document.querySelector("[data-element-types-count]");
      const editorHost = document.querySelector("[data-type-editor-host]");
      const status = document.querySelector("[data-element-types-status]");
      if (!modal || !opener || !list || !editorHost) {
        return undefined;
      }

      let activeEditor = null;
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

      function createTypeIconMarkup(iconName, color) {
        const icon = sanitizeIconName(iconName || DEFAULT_ELEMENT_TYPE_ICON);
        const safeColor = sanitizeColor(color || DEFAULT_ELEMENT_TYPE_COLOR);
        return `<span class="element-type-icon" style="--type-color: ${escapeHtml(safeColor)}" aria-hidden="true"><ph-${escapeHtml(icon)} weight="duotone"></ph-${escapeHtml(icon)}></span>`;
      }

      function renderTypeList() {
        const sortedTypes = [...elementTypes].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        if (count) {
          count.textContent = `${sortedTypes.length} ${sortedTypes.length === 1 ? "type" : "types"}`;
        }
        list.innerHTML = sortedTypes.map((type) => `
          <div class="element-type-row" data-type-id="${escapeHtml(type.id)}">
            <button class="element-type-expand" type="button" aria-label="Expand ${escapeHtml(type.name)}"><ph-caret-right weight="bold" aria-hidden="true"></ph-caret-right></button>
            ${createTypeIconMarkup(type.icon, type.color)}
            <span class="element-type-name">${escapeHtml(type.name)}</span>
            <div class="element-type-actions">
              <button type="button" data-edit-type="${escapeHtml(type.id)}" aria-label="Edit ${escapeHtml(type.name)}"><ph-pencil-simple weight="bold" aria-hidden="true"></ph-pencil-simple></button>
              <button type="button" data-delete-type="${escapeHtml(type.id)}" aria-label="Delete ${escapeHtml(type.name)}"><ph-trash weight="bold" aria-hidden="true"></ph-trash></button>
            </div>
          </div>
        `).join("");
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
        renderTypeList();
      }

      function closeTypesModal() {
        modal.hidden = true;
        closeEditor();
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
              .eq("universe_id", universe.id);
            if (error) throw error;
          } else {
            const { error } = await window.centralisSupabase
              .from("element_types")
              .insert({ universe_id: universe.id, name, icon: selectedIcon || DEFAULT_ELEMENT_TYPE_ICON, color: sanitizeColor(selectedColor, DEFAULT_ELEMENT_TYPE_COLOR) });
            if (error) throw error;
          }
          const completedMode = activeEditor.mode;
          syncElementTypes(await fetchElementTypes());
          renderTypeList();
          closeEditor();
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
            .update({ element_type_id: null, updated_at: new Date().toISOString() })
            .eq("universe_id", universe.id)
            .eq("element_type_id", typeId);
          if (updateError) throw updateError;
          const { error: deleteError } = await window.centralisSupabase
            .from("element_types")
            .delete()
            .eq("id", typeId)
            .eq("universe_id", universe.id);
          if (deleteError) throw deleteError;
          syncElementTypes(await fetchElementTypes());
          renderTypeList();
          closeEditor();
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

      opener.addEventListener("click", openTypesModal);
      closeButton?.addEventListener("click", closeTypesModal);
      addButton?.addEventListener("click", handleAddClick);
      list.addEventListener("click", handleListClick);
      editorHost.addEventListener("click", handleEditorClick);
      editorHost.addEventListener("input", handleEditorInput);
      editorHost.addEventListener("submit", saveType);
      return () => {
        opener.removeEventListener("click", openTypesModal);
        closeButton?.removeEventListener("click", closeTypesModal);
        addButton?.removeEventListener("click", handleAddClick);
        list.removeEventListener("click", handleListClick);
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
        if (event.target === modal) {
          closeAddElementModal();
        }
      }

      function handleEscape(event) {
        if (event.key === "Escape" && !modal.hidden) {
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
      function handleViewDetails(event) {
        if (event.detail?.nodeId) {
          setDetailsNodeId(event.detail.nodeId);
          setDetailsMode("view");
        }
      }

      window.addEventListener("centralis:view-node-details", handleViewDetails);
      return () => window.removeEventListener("centralis:view-node-details", handleViewDetails);
    }, []);

    React.useEffect(() => {
      async function handleUploadImage(event) {
        const { nodeId, file } = event.detail || {};
        const node = nodes.find((currentNode) => currentNode.id === nodeId);
        const status = document.querySelector("[data-image-upload-status]");
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

        setPendingImageGeneration({ nodeId: node.id });
        promptInput.value = event.detail?.prompt || createImagePrompt(node);
        if (subtitle) {
          subtitle.textContent = `Describe the image you want to generate for ${node.data.name || "this node"}.`;
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
        if (event.target === modal) {
          closeGenerateModal();
        }
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
        if (submitButton) {
          submitButton.disabled = true;
        }
        if (status) {
          status.textContent = "Generating image...";
          status.classList.remove("is-error", "is-success");
        }

        const meta = getNodeTypeMeta(node);
        try {
          await callEdgeFunction("generate-object-image", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              objectId: node.data.recordId,
              objectKind: node.data.kind,
              elementType: meta.label,
              name: node.data.name,
              description: node.data.description,
              extraPrompt: promptInput.value
            })
          });
          await refreshNodeImages(node);
        } catch (error) {
          if (submitButton) {
            submitButton.disabled = false;
          }
          form.dataset.generating = "false";

          if (status) {
            status.textContent = `Could not generate image: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
          return;
        }

        if (submitButton) {
          submitButton.disabled = false;
        }
        form.dataset.generating = "false";

        closeGenerateModal();
        setDetailsMode("view");
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

      controls.editButton?.addEventListener("click", handleEdit);
      controls.cancelButton?.addEventListener("click", handleCancel);
      controls.saveButton?.addEventListener("click", handleSave);
      return () => {
        controls.editButton?.removeEventListener("click", handleEdit);
        controls.cancelButton?.removeEventListener("click", handleCancel);
        controls.saveButton?.removeEventListener("click", handleSave);
      };
    }, [detailsNodeId, nodes]);

    React.useEffect(() => {
      if (!detailsNodeId) {
        hideDetailsPane();
        return;
      }

      renderDetailsPane(detailsNodeId, nodes, edges, openLinkedNodeDetails, detailsMode);
    }, [detailsNodeId, detailsMode, nodes, edges, openLinkedNodeDetails]);

    React.useEffect(() => {
      const form = document.querySelector("[data-element-form]");
      const status = document.querySelector("[data-element-status]");
      if (!form) {
        return undefined;
      }

      async function handleSubmit(event) {
        event.preventDefault();

        const submitButton = form.querySelector('[type="submit"]');
        const formData = new FormData(form);
        const name = String(formData.get("element-name") || "").trim();
        const description = String(formData.get("element-description") || "").trim();
        const elementTypeId = String(formData.get("element-type") || "");

        if (!name) {
          if (status) {
            status.textContent = "Name is required.";
            status.classList.add("is-error");
          }
          form.querySelector('[name="element-name"]')?.focus();
          return;
        }

        if (submitButton) {
          submitButton.disabled = true;
        }

        if (status) {
          status.textContent = "Adding element...";
          status.classList.remove("is-error");
        }

        const id = createId();
        const position = pendingLink?.position || {
          x: Number(universe.canvas_position_x ?? 120) + 360 + (nodes.length - 1) * 32,
          y: Number(universe.canvas_position_y ?? 120) + 40 + (nodes.length - 1) * 22
        };

        try {
        const { data: savedElement, error } = await withTimeout(window.centralisSupabase
          .from("elements")
          .insert({
            id,
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
        setNodes((currentNodes) => [...currentNodes, nextNode]);

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
        if (status) {
          status.textContent = "";
          status.classList.remove("is-error");
        }
        document.getElementById("add-element-modal").hidden = true;
        } catch (error) {
          if (status) {
            status.textContent = `Could not add element: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
        }

        if (submitButton) {
          submitButton.disabled = false;
        }
      }

      form.addEventListener("submit", handleSubmit);
      return () => form.removeEventListener("submit", handleSubmit);
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

        confirmButton.disabled = true;

        const { error: linksError } = await window.centralisSupabase
          .from("element_links")
          .delete()
          .or(`source_element_id.eq.${pendingDeleteElement.elementId},target_element_id.eq.${pendingDeleteElement.elementId}`);

        if (linksError) {
          console.error("Could not delete element links:", linksError);
          confirmButton.disabled = false;
          return;
        }

        const { error: elementError } = await window.centralisSupabase
          .from("elements")
          .delete()
          .eq("id", pendingDeleteElement.elementId);

        if (elementError) {
          console.error("Could not delete element:", elementError);
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

    function handleConnectEnd(event) {
      const targetIsPane = event.target?.classList?.contains("react-flow__pane");
      if (!targetIsPane || !reactFlowInstance.current || !reactFlowWrapper.current) {
        return;
      }

      const state = window.__centralisConnectionStart;
      if (!state?.sourceNodeId) {
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

    return React.createElement(
      "div",
      {
        ref: reactFlowWrapper,
        className: "flow-canvas-inner"
      },
      React.createElement(
      ReactFlowComponent,
      {
        nodes,
        edges,
        nodeTypes,
        edgeTypes,
        fitView: true,
        onInit: (instance) => {
          reactFlowInstance.current = instance;
        },
        onNodesChange: (changes) => setNodes((currentNodes) => applyNodeChanges(changes, currentNodes)),
        onEdgesChange: handleEdgesChange,
        onConnectStart: (_event, params) => {
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
        selectionOnDrag: false,
        panOnDrag: true,
        onNodeDragStop: saveNodePosition,
        proOptions: { hideAttribution: true }
      },
      React.createElement(Background, { gap: 18, size: 1 }),
      React.createElement(Controls, null)
      )
    );
  }

  ReactDOM.createRoot(rootElement).render(React.createElement(UniverseFlow));
})();
