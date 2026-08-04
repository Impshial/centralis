(() => {
  window.centralisFusionVersion = "fusion-15";
  const supabase = window.centralisSupabase;
  const SAVE_KEY = "centralis-fusion-save";
  const SAVE_VERSION = 1;
  const BOARD_SIZE = 3200;
  const ROOT_RADIUS = 34;
  const GENERATED_RADIUS = 42;
  const COLLISION_GAP = 12;
  const MAX_LEVEL = 5;

  const LEVEL_ZERO_ITEMS = [
    "Gallon of milk", "Brick", "Bag of potting soil", "Car battery", "Fire extinguisher", "Oxygen tank", "Propane cylinder", "Bag of rice", "Loaf of bread", "Jar of honey",
    "Box of nails", "Roll of copper wire", "Motor oil", "Windshield washer fluid", "Concrete block", "Bicycle tire", "Bowling ball", "Bag of charcoal", "Sack of flour", "Aquarium",
    "Microwave oven", "Printer", "Chainsaw", "Guitar", "Violin", "Skateboard", "Soccer ball", "Suitcase", "Sleeping bag", "Folded camping chair",
    "Five-gallon bucket", "Coiled garden hose", "Paint can", "Tube of silicone caulk", "Epoxy resin kit", "Pool chlorine tablets", "Bottle of bleach", "Jug of ammonia", "Box of baking soda", "Dry ice",
    "Fertilizer pellets", "Bird seed", "Dog food", "Cat litter", "Live houseplant", "Coral fragment", "Mushroom grow kit", "Quartz crystal", "Iron ingot", "Lead brick",
    "Bicycle chain", "Glass bottle", "Aluminum ladder", "Cinder block", "Bag of cement", "Box of cereal", "Wheelbarrow tire", "Car alternator", "Brake rotor", "Spark plug",
    "Fuel injector", "Radiator", "Ceiling fan", "Air purifier", "Humidifier", "Dehumidifier", "Electric kettle", "Blender", "Rice cooker", "Cast iron skillet",
    "Pressure cooker", "Dutch oven", "Ice cube tray", "Bag of coffee beans", "Maple syrup", "Olive oil", "Vinegar", "Liquid dish soap", "Laundry detergent", "Isopropyl alcohol",
    "Hydrogen peroxide", "Acetone", "Glycerin", "Paraffin wax", "Bar of copper", "Sheet of acrylic", "Steel pipe", "PVC pipe", "Roll of fiberglass insulation", "Ceramic floor tile",
    "Rope", "Chain", "Padlock", "Door hinge", "Bicycle pedal", "Printer ink cartridge", "Box of crayons", "Aquarium filter", "Bag of sand", "Granite countertop sample",
  ];

  const els = {
    app: document.querySelector("[data-fusion-app]"),
    board: document.querySelector("[data-fusion-board]"),
    world: document.querySelector("[data-fusion-world]"),
    panel: document.querySelector("[data-fusion-panel]"),
    tooltip: document.querySelector("[data-fusion-tooltip]"),
    status: document.querySelector("[data-fusion-status]"),
    discoveryCount: document.querySelector("[data-fusion-discovery-count]"),
    recipeCount: document.querySelector("[data-fusion-recipe-count]"),
    maxLevel: document.querySelector("[data-fusion-max-level]"),
    zoomLabel: document.querySelector("[data-fusion-zoom-label]"),
    search: document.querySelector("[data-fusion-search]"),
  };

  const state = {
    items: [],
    recipes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: {},
    selectedId: null,
    highlightedId: null,
    loadingRecipeKey: null,
    searchQuery: "",
    drag: null,
    dragGhost: null,
    pan: null,
    suppressClick: false,
    expandedAncestry: new Set(),
  };

  const text = (value) => String(value ?? "");
  const html = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  function createId(prefix = "fusion") {
    return window.crypto?.randomUUID ? window.crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizePair(firstId, secondId) {
    return [firstId, secondId].sort((a, b) => a.localeCompare(b)).join("+");
  }

  function radiusFor(item) {
    return item.level === 0 ? ROOT_RADIUS : GENERATED_RADIUS + Math.min(14, item.level * 3);
  }

  function buildRootItems() {
    const columns = 10;
    const gap = 86;
    const startX = BOARD_SIZE / 2 - ((columns - 1) * gap) / 2;
    const startY = BOARD_SIZE / 2 - 340;
    return LEVEL_ZERO_ITEMS.map((name, index) => ({
      id: `root-${String(index + 1).padStart(3, "0")}`,
      name,
      description: "An ordinary level 0 object with an infinite supply.",
      level: 0,
      parentIds: [],
      ancestorIds: [],
      position: {
        x: startX + (index % columns) * gap,
        y: startY + Math.floor(index / columns) * gap,
      },
      discoveredAt: null,
      anchored: true,
    }));
  }

  class SaveService {
    static load() {
      try {
        const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
        if (!parsed || parsed.version !== SAVE_VERSION) throw new Error("No compatible save.");
        const roots = buildRootItems();
        const rootIds = new Set(roots.map((item) => item.id));
        const rawGenerated = Array.isArray(parsed.items) ? parsed.items.filter((item) => !rootIds.has(item.id)) : [];
        const itemLookup = new Map([...roots, ...rawGenerated].map((item) => [item.id, item]));
        const generated = rawGenerated.filter((item) => !isInvalidSavedDiscovery(item)).map((item) => normalizeSavedDiscovery(item, itemLookup));
        const validIds = new Set([...roots, ...generated].map((item) => item.id));
        const recipes = (Array.isArray(parsed.recipes) ? parsed.recipes : []).filter((recipe) => validIds.has(recipe.resultItemId));
        if (generated.length !== rawGenerated.length || recipes.length !== (parsed.recipes || []).length || generated.some((item) => item._wasNormalized)) {
          localStorage.setItem(SAVE_KEY, JSON.stringify({
            ...parsed,
            items: generated.map(({ _wasNormalized, ...item }) => item),
            recipes,
            savedAt: new Date().toISOString(),
          }));
        }
        return {
          items: [...roots, ...generated.map(({ _wasNormalized, ...item }) => item)],
          recipes,
          viewport: parsed.viewport && typeof parsed.viewport === "object" ? parsed.viewport : null,
          settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
        };
      } catch (_) {
        return { items: buildRootItems(), recipes: [], viewport: null, settings: {} };
      }
    }

    static save() {
      const rootIds = new Set(LEVEL_ZERO_ITEMS.map((_, index) => `root-${String(index + 1).padStart(3, "0")}`));
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        items: state.items.filter((item) => !rootIds.has(item.id)),
        recipes: state.recipes,
        viewport: state.viewport,
        settings: state.settings,
      }));
    }
  }

  function isInvalidSavedDiscovery(item) {
    if (!item || item.level < 1) return false;
    const name = text(item.name).toLowerCase();
    const description = text(item.description).toLowerCase();
    if (/\b(useful traits|tangible item|practical workshop kit|combines useful)\b/.test(description)) return true;
    if (/\b\w+\s+\w+\s+kit\b/.test(name) && /\bcombines\b/.test(description)) return true;
    if (/\b(prototype|processor|engine|device)\b/.test(name) && /\b(physical traits|combined function|uses the .* and .*)\b/.test(description)) return true;
    if (/\bworkstation\b/.test(name) && !/\b(computer workstation|audio workstation|welding workstation|laboratory workstation|kitchen workstation)\b/.test(name)) return true;
    return false;
  }

  class RecipeRepository {
    static find(firstId, secondId) {
      const key = normalizePair(firstId, secondId);
      return state.recipes.find((recipe) => recipe.key === key) || null;
    }

    static add(firstId, secondId, resultId) {
      const key = normalizePair(firstId, secondId);
      const existing = state.recipes.find((recipe) => recipe.key === key);
      if (existing) return existing;
      const recipe = { key, parentItemIds: [firstId, secondId], resultItemId: resultId, createdAt: new Date().toISOString() };
      state.recipes.push(recipe);
      return recipe;
    }
  }

  class DiscoveryRepository {
    static getDeleteCascade(itemId) {
      const deleteIds = new Set([itemId]);
      let changed = true;
      while (changed) {
        changed = false;
        state.items.forEach((item) => {
          if (item.level === 0 || deleteIds.has(item.id)) return;
          const parents = Array.isArray(item.parentIds) ? item.parentIds : [];
          const ancestors = Array.isArray(item.ancestorIds) ? item.ancestorIds : [];
          if ([...parents, ...ancestors].some((id) => deleteIds.has(id))) {
            deleteIds.add(item.id);
            changed = true;
          }
        });
      }
      return deleteIds;
    }

    static deleteItem(itemId) {
      const item = state.items.find((candidate) => candidate.id === itemId);
      if (!item || item.level === 0) return { deleted: 0 };
      const deleteIds = this.getDeleteCascade(itemId);
      state.items = state.items.filter((candidate) => !deleteIds.has(candidate.id));
      state.recipes = state.recipes.filter((recipe) => {
        const parentIds = Array.isArray(recipe.parentItemIds) ? recipe.parentItemIds : [];
        return !deleteIds.has(recipe.resultItemId) && !parentIds.some((id) => deleteIds.has(id));
      });
      if (deleteIds.has(state.selectedId)) state.selectedId = null;
      if (deleteIds.has(state.highlightedId)) state.highlightedId = null;
      [...state.expandedAncestry].forEach((id) => {
        if (deleteIds.has(id)) state.expandedAncestry.delete(id);
      });
      SaveService.save();
      return { deleted: deleteIds.size };
    }
  }

  class CollisionService {
    static intersects(x, y, radius, ignoreIds = new Set()) {
      return state.items.some((item) => {
        if (ignoreIds.has(item.id)) return false;
        const distance = Math.hypot(item.position.x - x, item.position.y - y);
        return distance < radius + radiusFor(item) + COLLISION_GAP;
      });
    }

    static findOpenPosition(targetX, targetY, radius, ignoreIds = new Set()) {
      if (!this.intersects(targetX, targetY, radius, ignoreIds)) return { x: targetX, y: targetY };
      for (let ring = 1; ring < 90; ring += 1) {
        const step = 18;
        const distance = ring * step;
        const samples = Math.max(10, Math.floor((Math.PI * 2 * distance) / (radius + 14)));
        for (let i = 0; i < samples; i += 1) {
          const angle = (Math.PI * 2 * i) / samples + ring * 0.31;
          const x = targetX + Math.cos(angle) * distance;
          const y = targetY + Math.sin(angle) * distance;
          if (!this.intersects(x, y, radius, ignoreIds)) return { x, y };
        }
      }
      return { x: targetX + 180, y: targetY + 180 };
    }
  }

  class FusionService {
    static canCombine(first, second) {
      return first && second && first.id !== second.id && first.level === second.level && first.level < MAX_LEVEL;
    }

    static async combine(first, second, dropPoint) {
      const existingRecipe = RecipeRepository.find(first.id, second.id);
      if (existingRecipe) {
        const existing = state.items.find((item) => item.id === existingRecipe.resultItemId);
        if (existing) return { item: existing, reused: true };
      }

      const key = normalizePair(first.id, second.id);
      state.loadingRecipeKey = key;
      renderLoadingCircle(dropPoint);
      setStatus("Generating discovery...");
      try {
        const generated = await OpenAIService.generate(first, second);
        const item = DiscoveryService.create(first, second, generated, dropPoint);
        RecipeRepository.add(first.id, second.id, item.id);
        return { item, reused: false };
      } finally {
        state.loadingRecipeKey = null;
      }
    }
  }

  class OpenAIService {
    static async generate(first, second) {
      if (!supabase) {
        throw new Error("Sign in to Centralis before generating Fusion discoveries.");
      }
      const { data, error } = await supabase.functions.invoke("generate-fusion-discovery", {
        body: {
          parents: [serializeParent(first), serializeParent(second)],
          recipeKey: normalizePair(first.id, second.id),
        },
      });
      if (error) {
        let message = error.message || "Could not generate discovery.";
        try {
          const payload = await error.context.json();
          message = payload.error || message;
        } catch (_) { /* no structured error */ }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.name || !data?.description) throw new Error("Fusion returned an incomplete discovery.");
      return { name: cleanName(data.name), description: cleanDescription(data.description), traits: cleanTraits(data.traits) };
    }
  }

  class DiscoveryService {
    static create(first, second, generated, dropPoint) {
      const level = Math.max(first.level, second.level) + 1;
      const radius = GENERATED_RADIUS + Math.min(14, level * 3);
      const position = CollisionService.findOpenPosition(dropPoint.x, dropPoint.y, radius);
      const ancestorIds = [...new Set([first.id, second.id, ...(first.ancestorIds || []), ...(second.ancestorIds || [])])];
      const item = {
        id: createId("fusion-item"),
        name: generated.name,
        description: generated.description,
        traits: cleanTraits(generated.traits, first, second),
        level,
        parentIds: [first.id, second.id],
        ancestorIds,
        position,
        discoveredAt: new Date().toISOString(),
        anchored: false,
      };
      state.items.push(item);
      return item;
    }
  }

  function serializeParent(item) {
    const payload = { id: item.id, name: item.name, level: item.level };
    if (item.level > 0) {
      payload.description = item.description;
      payload.traits = cleanTraits(item.traits, ...getParents(item));
    }
    return payload;
  }

  function cleanName(value) {
    return text(value).replace(/\s+/g, " ").trim().slice(0, 48) || "Unnamed Discovery";
  }

  function cleanDescription(value) {
    return text(value).replace(/\s+/g, " ").trim().slice(0, 180) || "A newly discovered fusion of its parent objects.";
  }

  function cleanTraits(value, ...fallbackParents) {
    const raw = Array.isArray(value) ? value : text(value).split(/[,;|]/);
    const blocked = /\b(fusion|hybrid|combination|combined|useful traits|tangible item|generic)\b/i;
    const cleaned = raw
      .map((trait) => text(trait).replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim().slice(0, 42))
      .filter((trait) => trait.length >= 3 && !blocked.test(trait));
    const unique = [...new Map(cleaned.map((trait) => [trait.toLowerCase(), trait])).values()];
    if (unique.length >= 3) return unique.slice(0, 6);
    const fallback = fallbackParents
      .filter(Boolean)
      .flatMap((parent) => [parent.name, ...(Array.isArray(parent.traits) ? parent.traits : [])])
      .flatMap((value) => text(value).toLowerCase().split(/[^a-z0-9]+/))
      .filter((word) => word.length > 3 && !["with", "from", "level", "object", "ordinary", "supply"].includes(word));
    return [...new Map([...unique, ...fallback].map((trait) => [trait.toLowerCase(), trait])).values()].slice(0, 6);
  }

  function normalizeSavedDiscovery(item, lookup = null) {
    const parents = (item.parentIds || [])
      .map((id) => lookup?.get?.(id) || state.items.find((candidate) => candidate.id === id))
      .filter(Boolean);
    const traits = deriveTraits(item, parents);
    const wasNormalized = !Array.isArray(item.traits) || item.traits.join("|") !== traits.join("|");
    return { ...item, traits, _wasNormalized: wasNormalized };
  }

  function deriveTraits(item, parents = []) {
    const direct = cleanTraits(item.traits, ...parents);
    if (direct.length >= 3) return direct;
    const keywordTraits = [
      ...direct,
      ...parents.flatMap((parent) => [parent.name, ...(parent.traits || [])]),
      item.name,
      item.description,
    ]
      .flatMap((value) => text(value).toLowerCase().split(/[^a-z0-9]+/))
      .filter((word) => word.length > 3 && !["with", "from", "level", "object", "ordinary", "supply", "newly", "discovered", "parent", "objects"].includes(word));
    return [...new Map(keywordTraits.map((trait) => [trait.toLowerCase(), trait])).values()].slice(0, 6);
  }

  function getParents(item) {
    return (item.parentIds || []).map((id) => state.items.find((candidate) => candidate.id === id)).filter(Boolean);
  }

  function setStatus(message, type = "") {
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.classList.toggle("is-error", type === "error");
    els.status.classList.toggle("is-success", type === "success");
  }

  function worldToScreen(point) {
    const rect = els.board.getBoundingClientRect();
    return {
      x: rect.left + state.viewport.x + point.x * state.viewport.zoom,
      y: rect.top + state.viewport.y + point.y * state.viewport.zoom,
    };
  }

  function screenToWorld(point) {
    const rect = els.board.getBoundingClientRect();
    return {
      x: (point.x - rect.left - state.viewport.x) / state.viewport.zoom,
      y: (point.y - rect.top - state.viewport.y) / state.viewport.zoom,
    };
  }

  function itemAtScreenPoint(x, y, exceptId = null) {
    return [...state.items].reverse().find((item) => {
      if (item.id === exceptId) return false;
      const screen = worldToScreen(item.position);
      return Math.hypot(screen.x - x, screen.y - y) <= radiusFor(item) * state.viewport.zoom;
    }) || null;
  }

  function applyViewport() {
    els.world.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`;
    if (els.zoomLabel) els.zoomLabel.textContent = `${Math.round(state.viewport.zoom * 100)}%`;
  }

  function resetView() {
    const rect = els.board.getBoundingClientRect();
    state.viewport = {
      x: rect.width / 2 - BOARD_SIZE / 2,
      y: rect.height / 2 - BOARD_SIZE / 2,
      zoom: Math.min(1, Math.max(0.62, rect.width / 940)),
    };
    applyViewport();
    SaveService.save();
  }

  function sortFusions() {
    const generated = state.items.filter((item) => item.level > 0).sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return new Date(a.discoveredAt || 0).getTime() - new Date(b.discoveredAt || 0).getTime()
        || a.name.localeCompare(b.name);
    });
    if (!generated.length) {
      setStatus("No generated discoveries to sort yet.");
      return;
    }

    const roots = state.items.filter((item) => item.level === 0);
    const maxRootX = Math.max(...roots.map((item) => item.position.x));
    const minRootY = Math.min(...roots.map((item) => item.position.y));
    const columnGap = 132;
    const rowGap = 112;
    const startX = maxRootX + 140;
    const sortedByLevel = new Map();
    generated.forEach((item) => {
      if (!sortedByLevel.has(item.level)) sortedByLevel.set(item.level, []);
      sortedByLevel.get(item.level).push(item);
    });

    [...sortedByLevel.entries()].sort((a, b) => a[0] - b[0]).forEach(([level, items]) => {
      const x = startX + (level - 1) * columnGap;
      items.forEach((item, index) => {
        item.position = { x, y: minRootY + index * rowGap };
      });
    });

    SaveService.save();
    render();
    const first = generated[0];
    if (first) centerItemIfNeeded(first);
    setStatus("Fusions sorted by level.", "success");
  }

  function zoomBy(delta, center = null) {
    const oldZoom = state.viewport.zoom;
    const nextZoom = Math.max(0.35, Math.min(1.8, oldZoom + delta));
    if (nextZoom === oldZoom) return;
    const rect = els.board.getBoundingClientRect();
    const screen = center || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const before = screenToWorld(screen);
    state.viewport.zoom = nextZoom;
    state.viewport.x = screen.x - rect.left - before.x * nextZoom;
    state.viewport.y = screen.y - rect.top - before.y * nextZoom;
    applyViewport();
    SaveService.save();
  }

  function render() {
    if (!els.world) return;
    els.world.innerHTML = state.items.map(renderItem).join("");
    if (state.loadingRecipeKey) renderLoadingCircle();
    syncStats();
    renderPanel();
  }

  function renderItem(item) {
    const radius = radiusFor(item);
    const isSelected = state.selectedId === item.id;
    const isHighlighted = state.highlightedId === item.id;
    const isFiltered = state.searchQuery && !itemMatchesSearch(item, state.searchQuery);
    const classes = ["fusion-item", item.level === 0 ? "is-root" : "is-generated"];
    if (isSelected) classes.push("is-selected");
    if (isHighlighted) classes.push("is-highlighted");
    if (isFiltered) classes.push("is-filtered");
    return `
      <button class="${classes.join(" ")}" type="button" data-fusion-item="${html(item.id)}" style="--x:${item.position.x}px;--y:${item.position.y}px;--r:${radius}px;" aria-label="${html(item.name)}">
        <span class="fusion-item-name">${html(item.name)}</span>
        ${item.level > 0 ? `<span class="fusion-item-level">L${item.level}</span>` : ""}
      </button>
    `;
  }

  function itemMatchesSearch(item, query) {
    const parentNames = (item.parentIds || [])
      .map((id) => state.items.find((candidate) => candidate.id === id)?.name)
      .filter(Boolean);
    const haystack = [
      item.name,
      item.description,
      ...(item.traits || []),
      `level ${item.level}`,
      `l${item.level}`,
      ...parentNames,
    ].join(" ").toLowerCase();
    return query.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
  }

  function renderLoadingCircle(point) {
    const existing = els.world.querySelector("[data-fusion-loading]");
    if (existing) existing.remove();
    if (!point) return;
    const loading = document.createElement("div");
    loading.className = "fusion-item fusion-loading is-generated";
    loading.dataset.fusionLoading = "true";
    loading.style.setProperty("--x", `${point.x}px`);
    loading.style.setProperty("--y", `${point.y}px`);
    loading.style.setProperty("--r", `${GENERATED_RADIUS}px`);
    loading.innerHTML = `<span></span>`;
    els.world.appendChild(loading);
  }

  function createDragGhost(item, event) {
    removeDragGhost();
    const ghost = document.createElement("div");
    const radius = radiusFor(item);
    ghost.className = `fusion-drag-ghost ${item.level === 0 ? "is-root" : "is-generated"}`;
    ghost.style.setProperty("--r", `${radius}px`);
    ghost.innerHTML = `
      <span class="fusion-item-name">${html(item.name)}</span>
      ${item.level > 0 ? `<span class="fusion-item-level">L${item.level}</span>` : ""}
    `;
    els.board.appendChild(ghost);
    state.dragGhost = ghost;
    moveDragGhost(event);
  }

  function moveDragGhost(event) {
    if (!state.dragGhost) return;
    const rect = els.board.getBoundingClientRect();
    state.dragGhost.style.transform = `translate(${event.clientX - rect.left}px, ${event.clientY - rect.top}px) translate(-50%, -50%)`;
  }

  function removeDragGhost({ animate = false } = {}) {
    const ghost = state.dragGhost;
    state.dragGhost = null;
    if (!ghost) return;
    if (animate) {
      ghost.classList.add("is-dropping");
      window.setTimeout(() => ghost.remove(), 160);
      return;
    }
    ghost.remove();
  }

  function syncStats() {
    if (els.discoveryCount) els.discoveryCount.textContent = String(state.items.length);
    if (els.recipeCount) els.recipeCount.textContent = String(state.recipes.length);
    if (els.maxLevel) els.maxLevel.textContent = String(Math.max(...state.items.map((item) => item.level), 0));
  }

  function renderPanel() {
    if (!els.panel) return;
    const item = state.items.find((candidate) => candidate.id === state.selectedId);
    if (!item) {
      els.panel.hidden = true;
      els.app.classList.remove("has-panel");
      return;
    }
    els.panel.hidden = false;
    els.app.classList.add("has-panel");
    const parents = getParents(item);
    const traits = cleanTraits(item.traits, ...parents);
    els.panel.innerHTML = `
      <div class="fusion-panel-header">
        <div>
          <p>Level ${item.level}</p>
          <h2>${html(item.name)}</h2>
        </div>
        <div class="fusion-panel-header-actions">
          ${item.level > 0 ? `<button class="fusion-delete-item" type="button" data-fusion-delete-item="${html(item.id)}" aria-label="Delete discovery" title="Delete discovery"><ph-trash weight="bold" aria-hidden="true"></ph-trash></button>` : ""}
          <button type="button" data-fusion-close-panel aria-label="Close details"><ph-x weight="bold" aria-hidden="true"></ph-x></button>
        </div>
      </div>
      <p class="fusion-panel-description">${html(item.description)}</p>
      ${traits.length ? `
        <section class="fusion-traits" aria-label="Primary characteristics">
          <h3>Primary Traits</h3>
          <div>${traits.map((trait) => `<span>${html(trait)}</span>`).join("")}</div>
        </section>
      ` : ""}
      <dl class="fusion-detail-list">
        <div><dt>Discovered</dt><dd>${item.discoveredAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.discoveredAt)) : "Starting item"}</dd></div>
        <div><dt>Parents</dt><dd>${parents.length ? parents.map((parent) => html(parent.name)).join(" + ") : "Original supply"}</dd></div>
        <div><dt>Ancestry</dt><dd>${item.ancestorIds?.length || 0} stored ancestor${(item.ancestorIds?.length || 0) === 1 ? "" : "s"}</dd></div>
      </dl>
      <section class="fusion-ancestry">
        <h3>Complete Ancestry</h3>
        ${renderAncestryNode(item)}
      </section>
    `;
  }

  function renderAncestryNode(item, depth = 0) {
    const hasParents = item.parentIds?.length;
    const expanded = depth < 1 || state.expandedAncestry.has(item.id);
    return `
      <div class="fusion-ancestry-node" style="--depth:${depth}">
        <button type="button" data-fusion-ancestry-toggle="${html(item.id)}" ${hasParents ? "" : "disabled"}>
          ${hasParents ? (expanded ? "<ph-caret-down aria-hidden=\"true\"></ph-caret-down>" : "<ph-caret-right aria-hidden=\"true\"></ph-caret-right>") : "<span></span>"}
          <strong>${html(item.name)}</strong>
          <em>L${item.level}</em>
        </button>
        ${hasParents && expanded ? item.parentIds.map((id) => {
          const parent = state.items.find((candidate) => candidate.id === id);
          return parent ? renderAncestryNode(parent, depth + 1) : "";
        }).join("") : ""}
      </div>
    `;
  }

  function showTooltip(item, event) {
    if (!els.tooltip || item.level === 0) return;
    const parents = getParents(item).map((parent) => parent.name);
    const traits = cleanTraits(item.traits, ...getParents(item));
    els.tooltip.innerHTML = `
      <strong>${html(item.name)}</strong>
      <span>${html(item.description)}</span>
      ${traits.length ? `<span class="fusion-tooltip-traits">${traits.slice(0, 4).map((trait) => html(trait)).join(" / ")}</span>` : ""}
      <small>Level ${item.level}${parents.length ? ` from ${html(parents.join(" + "))}` : ""}</small>
    `;
    els.tooltip.hidden = false;
    positionTooltip(event);
  }

  function positionTooltip(event) {
    if (!els.tooltip || els.tooltip.hidden) return;
    els.tooltip.style.left = `${Math.min(window.innerWidth - 280, event.clientX + 14)}px`;
    els.tooltip.style.top = `${Math.max(70, event.clientY + 14)}px`;
  }

  function hideTooltip() {
    if (els.tooltip) els.tooltip.hidden = true;
  }

  function updateDropFeedback(target) {
    els.world.querySelectorAll(".fusion-item").forEach((node) => node.classList.remove("is-valid-drop", "is-invalid-drop"));
    if (!target || !state.drag?.sourceId) return;
    const source = state.items.find((item) => item.id === state.drag.sourceId);
    const node = els.world.querySelector(`[data-fusion-item="${CSS.escape(target.id)}"]`);
    if (!node) return;
    node.classList.add(FusionService.canCombine(source, target) ? "is-valid-drop" : "is-invalid-drop");
  }

  async function handleDrop(event) {
    const drag = state.drag;
    state.drag = null;
    state.suppressClick = Boolean(drag?.moved);
    if (drag?.moved) {
      document.body.classList.remove("is-fusion-dragging");
      removeDragGhost({ animate: true });
    } else {
      removeDragGhost();
    }
    updateDropFeedback(null);
    if (!drag) return;
    if (!drag.moved) return;
    const source = state.items.find((item) => item.id === drag.sourceId);
    const target = itemAtScreenPoint(event.clientX, event.clientY, source?.id);
    const dropPoint = screenToWorld({ x: event.clientX, y: event.clientY });
    if (!source) {
      render();
      return;
    }
    if (!target && source.level > 0) {
      source.position = CollisionService.findOpenPosition(dropPoint.x, dropPoint.y, radiusFor(source), new Set([source.id]));
      SaveService.save();
      render();
      setStatus("Discovery moved.", "success");
      return;
    }
    if (!target || !FusionService.canCombine(source, target)) {
      setStatus(target && source.level >= MAX_LEVEL ? "Level 5 is the current discovery limit." : target ? "Only same-level items can be fused in version 1." : "");
      render();
      return;
    }
    try {
      const { item, reused } = await FusionService.combine(source, target, dropPoint);
      state.selectedId = item.id;
      state.highlightedId = item.id;
      SaveService.save();
      render();
      centerItem(item);
      setStatus(reused ? "Existing discovery found." : "Discovery saved.", reused ? "" : "success");
      window.setTimeout(() => {
        state.highlightedId = null;
        render();
      }, 1600);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate discovery.", "error");
      render();
    }
  }

  function centerItemIfNeeded(item) {
    const rect = els.board.getBoundingClientRect();
    const screen = worldToScreen(item.position);
    const margin = 120;
    if (screen.x > rect.left + margin && screen.x < rect.right - margin && screen.y > rect.top + margin && screen.y < rect.bottom - margin) return;
    centerItem(item);
  }

  function centerItem(item) {
    const rect = els.board.getBoundingClientRect();
    state.viewport.x = rect.width / 2 - item.position.x * state.viewport.zoom;
    state.viewport.y = rect.height / 2 - item.position.y * state.viewport.zoom;
    applyViewport();
    SaveService.save();
  }

  function bindEvents() {
    els.board.addEventListener("pointerdown", (event) => {
      const itemNode = event.target.closest("[data-fusion-item]");
      if (itemNode) {
        const item = state.items.find((candidate) => candidate.id === itemNode.dataset.fusionItem);
        if (!item) return;
        state.drag = { sourceId: item.id, startX: event.clientX, startY: event.clientY, moved: false };
        itemNode.setPointerCapture?.(event.pointerId);
        return;
      }
      state.pan = { startX: event.clientX, startY: event.clientY, x: state.viewport.x, y: state.viewport.y };
      els.board.setPointerCapture?.(event.pointerId);
    });

    window.addEventListener("pointermove", (event) => {
      if (state.pan) {
        state.viewport.x = state.pan.x + event.clientX - state.pan.startX;
        state.viewport.y = state.pan.y + event.clientY - state.pan.startY;
        applyViewport();
      }
      if (state.drag) {
        if (!state.drag.moved && Math.hypot(event.clientX - state.drag.startX, event.clientY - state.drag.startY) > 6) {
          state.drag.moved = true;
          const item = state.items.find((candidate) => candidate.id === state.drag.sourceId);
          if (item) createDragGhost(item, event);
          document.body.classList.add("is-fusion-dragging");
        }
        if (!state.drag.moved) return;
        moveDragGhost(event);
        updateDropFeedback(itemAtScreenPoint(event.clientX, event.clientY, state.drag.sourceId));
      }
      positionTooltip(event);
    });

    window.addEventListener("pointerup", (event) => {
      if (state.pan) {
        state.pan = null;
        SaveService.save();
      }
      if (state.drag) handleDrop(event);
    });

    els.board.addEventListener("click", (event) => {
      if (state.suppressClick) {
        state.suppressClick = false;
        return;
      }
      const itemNode = event.target.closest("[data-fusion-item]");
      if (!itemNode) return;
      state.selectedId = itemNode.dataset.fusionItem;
      renderPanel();
    });

    els.board.addEventListener("mouseover", (event) => {
      const itemNode = event.target.closest("[data-fusion-item]");
      if (!itemNode) return;
      const item = state.items.find((candidate) => candidate.id === itemNode.dataset.fusionItem);
      if (item) showTooltip(item, event);
    });
    els.board.addEventListener("mouseout", (event) => {
      if (!event.relatedTarget?.closest?.("[data-fusion-item]")) hideTooltip();
    });
    els.board.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? -0.08 : 0.08, { x: event.clientX, y: event.clientY });
    }, { passive: false });

    document.querySelector("[data-fusion-sort]")?.addEventListener("click", sortFusions);
    document.querySelector("[data-fusion-zoom-in]")?.addEventListener("click", () => zoomBy(0.1));
    document.querySelector("[data-fusion-zoom-out]")?.addEventListener("click", () => zoomBy(-0.1));
    document.querySelector("[data-fusion-export]")?.addEventListener("click", exportSave);
    els.search?.addEventListener("input", () => {
      state.searchQuery = els.search.value.trim();
      render();
      setStatus(state.searchQuery ? "Non-matching items are dimmed." : "");
    });
    document.addEventListener("click", (event) => {
      const closePanel = event.target.closest("[data-fusion-close-panel]");
      if (closePanel) {
        state.selectedId = null;
        renderPanel();
      }
      const deleteButton = event.target.closest("[data-fusion-delete-item]");
      if (deleteButton) {
        const item = state.items.find((candidate) => candidate.id === deleteButton.dataset.fusionDeleteItem);
        if (!item || item.level === 0) return;
        const cascade = DiscoveryRepository.getDeleteCascade(item.id);
        const message = cascade.size > 1
          ? `Delete "${item.name}" and ${cascade.size - 1} descendant discover${cascade.size - 1 === 1 ? "y" : "ies"}?`
          : `Delete "${item.name}"?`;
        if (!window.confirm(message)) return;
        const result = DiscoveryRepository.deleteItem(item.id);
        render();
        setStatus(result.deleted > 1 ? `Deleted ${result.deleted} discoveries.` : "Discovery deleted.", "success");
        return;
      }
      const toggle = event.target.closest("[data-fusion-ancestry-toggle]");
      if (toggle && !toggle.disabled) {
        const id = toggle.dataset.fusionAncestryToggle;
        if (state.expandedAncestry.has(id)) state.expandedAncestry.delete(id);
        else state.expandedAncestry.add(id);
        renderPanel();
      }
    });
  }

  function exportSave() {
    const blob = new Blob([localStorage.getItem(SAVE_KEY) || "{}"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `centralis-fusion-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function init() {
    if (!els.app || !els.board || !els.world) return;
    const save = SaveService.load();
    state.items = save.items;
    state.recipes = save.recipes;
    state.settings = save.settings;
    els.world.style.width = `${BOARD_SIZE}px`;
    els.world.style.height = `${BOARD_SIZE}px`;
    render();
    bindEvents();
    requestAnimationFrame(() => {
      if (save.viewport) {
        state.viewport = {
          x: Number(save.viewport.x) || 0,
          y: Number(save.viewport.y) || 0,
          zoom: Math.max(0.35, Math.min(1.8, Number(save.viewport.zoom) || 1)),
        };
        applyViewport();
      } else {
        resetView();
      }
    });
    setStatus("Drag one circle onto another same-level circle. Fusion currently supports levels 0-5.");
  }

  init();
})();
