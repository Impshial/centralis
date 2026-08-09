(() => {
  window.centralisFusionVersion = "fusion-17";
  const supabase = window.centralisSupabase;
  const BOARD_SIZE = 3200;
  const ROOT_RADIUS = 34;
  const GENERATED_RADIUS = 42;
  const COLLISION_GAP = 12;
  const MAX_LEVEL = 5;

  const els = {
    app: document.querySelector("[data-fusion-app]"),
    home: document.querySelector("[data-fusion-home]"),
    homeStatus: document.querySelector("[data-fusion-home-status]"),
    homeGameCount: document.querySelector("[data-fusion-home-game-count]"),
    homeItemCount: document.querySelector("[data-fusion-home-item-count]"),
    homeMaxLevel: document.querySelector("[data-fusion-home-max-level]"),
    gameGrid: document.querySelector("[data-fusion-game-grid]"),
    newGame: document.querySelector("[data-fusion-new-game]"),
    shell: document.querySelector("[data-fusion-shell]"),
    gameTitle: document.querySelector("[data-fusion-game-title]"),
    board: document.querySelector("[data-fusion-board]"),
    world: document.querySelector("[data-fusion-world]"),
    panel: document.querySelector("[data-fusion-panel]"),
    tooltip: document.querySelector("[data-fusion-tooltip]"),
    status: document.querySelector("[data-fusion-status]"),
    discoveryCount: document.querySelector("[data-fusion-discovery-count]"),
    maxLevel: document.querySelector("[data-fusion-max-level]"),
    zoomLabel: document.querySelector("[data-fusion-zoom-label]"),
    search: document.querySelector("[data-fusion-search]"),
  };

  const state = {
    mode: "home",
    appUser: null,
    gameId: new URLSearchParams(window.location.search).get("game") || "",
    game: null,
    items: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: {},
    selectedId: null,
    highlightedId: null,
    loadingRecipeKey: null,
    searchQuery: "",
    drag: null,
    dragGhost: null,
    pan: null,
    activePointers: new Map(),
    pinch: null,
    suppressClick: false,
    expandedAncestry: new Set(),
    saveTimer: null,
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

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizePair(firstId, secondId) {
    return [firstId, secondId].sort((a, b) => a.localeCompare(b)).join("+");
  }

  function radiusFor(item) {
    return item.level === 0 ? ROOT_RADIUS : GENERATED_RADIUS + Math.min(14, item.level * 3);
  }

  function setHomeStatus(message, type = "") {
    if (!els.homeStatus) return;
    els.homeStatus.textContent = message || "";
    els.homeStatus.classList.toggle("is-error", type === "error");
  }

  function setStatus(message, type = "") {
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.classList.toggle("is-error", type === "error");
    els.status.classList.toggle("is-success", type === "success");
  }

  async function getAppUser() {
    if (state.appUser?.id) return state.appUser;
    if (window.centralisGetCurrentAppUser) {
      state.appUser = await window.centralisGetCurrentAppUser();
    } else {
      state.appUser = window.centralisCurrentAppUser || null;
    }
    if (!state.appUser?.id) throw new Error("Sign in to Centralis before using Fusion.");
    return state.appUser;
  }

  function requireSupabase() {
    if (!supabase) throw new Error("Supabase is not available for Fusion.");
    return supabase;
  }

  function handleDbError(error, fallback) {
    if (!error) return;
    throw new Error(error.message || fallback);
  }

  class FusionDataService {
    static async listGames() {
      const client = requireSupabase();
      const user = await getAppUser();
      const { data: games, error } = await client
        .from("fusion_games")
        .select("id,title,status,created_at,updated_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false });
      handleDbError(error, "Could not load Fusion games.");
      const gameIds = (games || []).map((game) => game.id);
      if (!gameIds.length) return [];

      const [rootsResult, discoveriesResult] = await Promise.all([
        client.from("fusion_game_level0_items").select("game_id,id").in("game_id", gameIds),
        client.from("fusion_game_discoveries").select("game_id,id,level").in("game_id", gameIds),
      ]);
      handleDbError(rootsResult.error, "Could not load Fusion game counts.");
      handleDbError(discoveriesResult.error, "Could not load Fusion game counts.");

      const summary = new Map(gameIds.map((id) => [id, { rootCount: 0, discoveryCount: 0, maxLevel: 0 }]));
      (rootsResult.data || []).forEach((row) => {
        const stats = summary.get(row.game_id);
        if (stats) rootCountPlus(stats);
      });
      (discoveriesResult.data || []).forEach((row) => {
        const stats = summary.get(row.game_id);
        if (!stats) return;
        stats.discoveryCount += 1;
        stats.maxLevel = Math.max(stats.maxLevel, Number(row.level) || 0);
      });
      return (games || []).map((game) => ({ ...game, ...(summary.get(game.id) || {}) }));
    }

    static async createGame() {
      const client = requireSupabase();
      const user = await getAppUser();
      const { data, error } = await client.rpc("create_fusion_game", { p_user_id: user.id });
      handleDbError(error, "Could not create Fusion game.");
      return data;
    }

    static async loadGame(gameId) {
      const client = requireSupabase();
      const user = await getAppUser();
      const { data: game, error: gameError } = await client
        .from("fusion_games")
        .select("id,user_id,title,status,viewport,settings,created_at,updated_at")
        .eq("id", gameId)
        .eq("user_id", user.id)
        .single();
      handleDbError(gameError, "Could not load Fusion game.");

      const [rootsResult, discoveriesResult] = await Promise.all([
        client
          .from("fusion_game_level0_items")
          .select("id,level0_item_id,initial_order,position_x,position_y,fusion_level0_items(name,description)")
          .eq("game_id", gameId)
          .order("initial_order", { ascending: true }),
        client
          .from("fusion_game_discoveries")
          .select("id,name,description,traits,level,parent_item_ids,ancestor_item_ids,position_x,position_y,discovered_at")
          .eq("game_id", gameId)
          .order("discovered_at", { ascending: true }),
      ]);
      handleDbError(rootsResult.error, "Could not load Fusion starting items.");
      handleDbError(discoveriesResult.error, "Could not load Fusion discoveries.");

      const roots = (rootsResult.data || []).map((row) => ({
        id: row.id,
        dbTable: "fusion_game_level0_items",
        level0ItemId: row.level0_item_id,
        initialOrder: row.initial_order,
        name: row.fusion_level0_items?.name || "Starting Item",
        description: row.fusion_level0_items?.description || "A starting Fusion object.",
        traits: [],
        level: 0,
        parentIds: [],
        ancestorIds: [],
        position: { x: Number(row.position_x) || 0, y: Number(row.position_y) || 0 },
        discoveredAt: null,
        anchored: true,
      }));
      const discoveries = (discoveriesResult.data || []).map((row) => ({
        id: row.id,
        dbTable: "fusion_game_discoveries",
        name: row.name,
        description: row.description,
        traits: asArray(row.traits),
        level: Number(row.level) || 1,
        parentIds: asArray(row.parent_item_ids),
        ancestorIds: asArray(row.ancestor_item_ids),
        position: { x: Number(row.position_x) || 0, y: Number(row.position_y) || 0 },
        discoveredAt: row.discovered_at,
        anchored: false,
      }));
      return {
        game,
        items: [...roots, ...discoveries],
        viewport: game.viewport && Object.keys(game.viewport).length ? game.viewport : null,
        settings: game.settings && typeof game.settings === "object" ? game.settings : {},
      };
    }

    static async updateGame(patch) {
      const client = requireSupabase();
      const user = await getAppUser();
      const { error } = await client
        .from("fusion_games")
        .update(patch)
        .eq("id", state.gameId)
        .eq("user_id", user.id);
      handleDbError(error, "Could not save Fusion game.");
    }

    static async updateItemPosition(item) {
      const client = requireSupabase();
      const user = await getAppUser();
      const table = item.level === 0 ? "fusion_game_level0_items" : "fusion_game_discoveries";
      const { error } = await client
        .from(table)
        .update({ position_x: item.position.x, position_y: item.position.y })
        .eq("id", item.id)
        .eq("user_id", user.id);
      handleDbError(error, "Could not save Fusion item position.");
    }

    static async createDiscovery(first, second, generated, position) {
      const client = requireSupabase();
      const user = await getAppUser();
      const level = Math.max(first.level, second.level) + 1;
      const ancestorIds = [...new Set([first.id, second.id, ...(first.ancestorIds || []), ...(second.ancestorIds || [])])];
      const payload = {
        game_id: state.gameId,
        user_id: user.id,
        name: generated.name,
        description: generated.description,
        traits: cleanTraits(generated.traits, first, second),
        level,
        parent_item_ids: [first.id, second.id],
        ancestor_item_ids: ancestorIds,
        position_x: position.x,
        position_y: position.y,
        discovered_at: new Date().toISOString(),
      };
      const { data, error } = await client
        .from("fusion_game_discoveries")
        .insert(payload)
        .select("id,name,description,traits,level,parent_item_ids,ancestor_item_ids,position_x,position_y,discovered_at")
        .single();
      handleDbError(error, "Could not save Fusion discovery.");
      return {
        id: data.id,
        dbTable: "fusion_game_discoveries",
        name: data.name,
        description: data.description,
        traits: asArray(data.traits),
        level: Number(data.level) || level,
        parentIds: asArray(data.parent_item_ids),
        ancestorIds: asArray(data.ancestor_item_ids),
        position: { x: Number(data.position_x) || position.x, y: Number(data.position_y) || position.y },
        discoveredAt: data.discovered_at,
        anchored: false,
      };
    }

    static async deleteDiscoveries(itemIds) {
      const client = requireSupabase();
      const user = await getAppUser();
      if (itemIds.length) {
        const { error } = await client
          .from("fusion_game_discoveries")
          .delete()
          .eq("user_id", user.id)
          .in("id", itemIds);
        handleDbError(error, "Could not delete Fusion discoveries.");
      }
    }
  }

  function rootCountPlus(stats) {
    stats.rootCount += 1;
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

    static async deleteItem(itemId) {
      const item = state.items.find((candidate) => candidate.id === itemId);
      if (!item || item.level === 0) return { deleted: 0 };
      const deleteIds = this.getDeleteCascade(itemId);
      await FusionDataService.deleteDiscoveries([...deleteIds]);
      state.items = state.items.filter((candidate) => !deleteIds.has(candidate.id));
      if (deleteIds.has(state.selectedId)) state.selectedId = null;
      if (deleteIds.has(state.highlightedId)) state.highlightedId = null;
      [...state.expandedAncestry].forEach((id) => {
        if (deleteIds.has(id)) state.expandedAncestry.delete(id);
      });
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
      const key = normalizePair(first.id, second.id);
      state.loadingRecipeKey = key;
      renderLoadingCircle(dropPoint);
      setStatus("Generating discovery...");
      try {
        const generated = await OpenAIService.generate(first, second);
        const item = await DiscoveryService.create(first, second, generated, dropPoint);
        return { item };
      } finally {
        state.loadingRecipeKey = null;
      }
    }
  }

  class OpenAIService {
    static async generate(first, second) {
      if (!supabase) throw new Error("Sign in to Centralis before generating Fusion discoveries.");
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
    static async create(first, second, generated, dropPoint) {
      const level = Math.max(first.level, second.level) + 1;
      const radius = GENERATED_RADIUS + Math.min(14, level * 3);
      const position = CollisionService.findOpenPosition(dropPoint.x, dropPoint.y, radius);
      const item = await FusionDataService.createDiscovery(first, second, generated, position);
      state.items.push(item);
      return item;
    }
  }

  function serializeParent(item) {
    const payload = { id: item.id, name: item.name, level: item.level };
    if (item.description) payload.description = item.description;
    if (item.level > 0) payload.traits = cleanTraits(item.traits, ...getParents(item));
    return payload;
  }

  function cleanName(value) {
    return text(value).replace(/\s+/g, " ").trim().slice(0, 48) || "Unnamed Discovery";
  }

  function cleanDescription(value) {
    return text(value).replace(/\s+/g, " ").trim() || "A newly discovered fusion of its parent objects.";
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

  function getParents(item) {
    return (item.parentIds || []).map((id) => state.items.find((candidate) => candidate.id === id)).filter(Boolean);
  }

  function getAncestorHighlightIds() {
    const item = state.items.find((candidate) => candidate.id === state.selectedId);
    if (!item || item.level === 0) return new Set();
    return new Set([...(item.parentIds || []), ...(item.ancestorIds || [])]);
  }

  function formatDateTime(value) {
    if (!value) return "Unknown";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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
    if (!els.world) return;
    els.world.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`;
    if (els.zoomLabel) els.zoomLabel.textContent = `${Math.round(state.viewport.zoom * 100)}%`;
  }

  function scheduleGameSave(patch = {}) {
    state.game = { ...(state.game || {}), ...patch };
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      FusionDataService.updateGame({
        viewport: state.viewport,
        settings: state.settings,
        ...patch,
      }).catch((error) => setStatus(error.message, "error"));
    }, 250);
  }

  async function resetView({ persist = true } = {}) {
    const rect = els.board.getBoundingClientRect();
    state.viewport = {
      x: rect.width / 2 - BOARD_SIZE / 2,
      y: rect.height / 2 - BOARD_SIZE / 2,
      zoom: Math.min(1, Math.max(0.62, rect.width / 940)),
    };
    applyViewport();
    if (persist) scheduleGameSave();
  }

  async function sortFusions() {
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

    try {
      await Promise.all(generated.map((item) => FusionDataService.updateItemPosition(item)));
      render();
      const first = generated[0];
      if (first) centerItemIfNeeded(first);
      setStatus("Fusions sorted by level.", "success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save sorted fusions.", "error");
    }
  }

  function zoomBy(delta, center = null) {
    const oldZoom = state.viewport.zoom;
    const nextZoom = clampZoom(oldZoom + delta);
    if (nextZoom === oldZoom) return;
    const rect = els.board.getBoundingClientRect();
    const screen = center || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const before = screenToWorld(screen);
    state.viewport.zoom = nextZoom;
    state.viewport.x = screen.x - rect.left - before.x * nextZoom;
    state.viewport.y = screen.y - rect.top - before.y * nextZoom;
    applyViewport();
    scheduleGameSave();
  }

  function clampZoom(value) {
    return Math.max(0.35, Math.min(1.8, value));
  }

  function pointerCenter(first, second) {
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }

  function pointerDistance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function activePinchPointers() {
    return [...state.activePointers.values()].slice(0, 2);
  }

  function startPinchGesture() {
    if (state.activePointers.size < 2) return;
    const [first, second] = activePinchPointers();
    const center = pointerCenter(first, second);
    state.pinch = {
      startDistance: Math.max(1, pointerDistance(first, second)),
      startZoom: state.viewport.zoom,
      worldCenter: screenToWorld(center),
    };
    state.pan = null;
    state.drag = null;
    document.body.classList.remove("is-fusion-dragging");
    removeDragGhost();
    updateDropFeedback(null);
    hideTooltip();
  }

  function updatePinchGesture() {
    if (!state.pinch || state.activePointers.size < 2) return;
    const [first, second] = activePinchPointers();
    const center = pointerCenter(first, second);
    const distance = Math.max(1, pointerDistance(first, second));
    const nextZoom = clampZoom(state.pinch.startZoom * (distance / state.pinch.startDistance));
    const rect = els.board.getBoundingClientRect();
    state.viewport.zoom = nextZoom;
    state.viewport.x = center.x - rect.left - state.pinch.worldCenter.x * nextZoom;
    state.viewport.y = center.y - rect.top - state.pinch.worldCenter.y * nextZoom;
    applyViewport();
  }

  function finishPointer(event) {
    state.activePointers.delete(event.pointerId);
    if (state.pinch) {
      state.suppressClick = true;
      if (state.activePointers.size >= 2) {
        startPinchGesture();
      } else {
        state.pinch = null;
        scheduleGameSave();
      }
      return true;
    }
    return false;
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
    const ancestorIds = getAncestorHighlightIds();
    const isSelected = state.selectedId === item.id;
    const isHighlighted = state.highlightedId === item.id;
    const isAncestor = ancestorIds.has(item.id);
    const isFiltered = state.searchQuery && !itemMatchesSearch(item, state.searchQuery);
    const classes = ["fusion-item", item.level === 0 ? "is-root" : "is-generated"];
    if (isSelected) classes.push("is-selected");
    if (isHighlighted) classes.push("is-highlighted");
    if (isAncestor) classes.push("is-ancestor");
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
        <div><dt>Discovered</dt><dd>${item.discoveredAt ? formatDateTime(item.discoveredAt) : "Starting item"}</dd></div>
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
    if (!els.tooltip) return;
    const parents = getParents(item).map((parent) => parent.name);
    const traits = cleanTraits(item.traits, ...getParents(item));
    els.tooltip.innerHTML = `
      <strong>${html(item.name)}</strong>
      <span>${html(item.description)}</span>
      ${item.level > 0 && traits.length ? `<span class="fusion-tooltip-traits">${traits.slice(0, 4).map((trait) => html(trait)).join(" / ")}</span>` : ""}
      <small>${item.level > 0 ? `Level ${item.level}${parents.length ? ` from ${html(parents.join(" + "))}` : ""}` : `Starting item #${item.initialOrder || ""}`}</small>
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
    if (!drag?.moved) return;
    const source = state.items.find((item) => item.id === drag.sourceId);
    const target = itemAtScreenPoint(event.clientX, event.clientY, source?.id);
    const dropPoint = screenToWorld({ x: event.clientX, y: event.clientY });
    if (!source) {
      render();
      return;
    }
    if (!target && source.level > 0) {
      source.position = CollisionService.findOpenPosition(dropPoint.x, dropPoint.y, radiusFor(source), new Set([source.id]));
      try {
        await FusionDataService.updateItemPosition(source);
        render();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not save item position.", "error");
        render();
      }
      return;
    }
    if (!target || !FusionService.canCombine(source, target)) {
      setStatus(target && source.level >= MAX_LEVEL ? "Level 5 is the current discovery limit." : target ? "Only same-level items can be fused in version 1." : "");
      render();
      return;
    }
    try {
      const { item } = await FusionService.combine(source, target, dropPoint);
      state.selectedId = item.id;
      state.highlightedId = item.id;
      render();
      centerItem(item);
      setStatus("Discovery saved.", "success");
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
    scheduleGameSave();
  }

  function bindGameEvents() {
    if (!els.board || els.board.dataset.fusionBound) return;
    els.board.dataset.fusionBound = "true";
    els.board.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        event.preventDefault();
        hideTooltip();
        state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (state.activePointers.size >= 2) {
          startPinchGesture();
          els.board.setPointerCapture?.(event.pointerId);
          return;
        }
      }
      const itemNode = event.target.closest("[data-fusion-item]");
      if (itemNode) {
        const item = state.items.find((candidate) => candidate.id === itemNode.dataset.fusionItem);
        if (!item) return;
        state.drag = { sourceId: item.id, startX: event.clientX, startY: event.clientY, moved: false };
        itemNode.setPointerCapture?.(event.pointerId);
        return;
      }
      state.pan = { startX: event.clientX, startY: event.clientY, x: state.viewport.x, y: state.viewport.y, moved: false };
      els.board.setPointerCapture?.(event.pointerId);
    });

    window.addEventListener("pointermove", (event) => {
      if (state.activePointers.has(event.pointerId)) {
        event.preventDefault();
        state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (state.pinch) {
          updatePinchGesture();
          return;
        }
      }
      if (state.pan) {
        if (!state.pan.moved && Math.hypot(event.clientX - state.pan.startX, event.clientY - state.pan.startY) > 6) {
          state.pan.moved = true;
        }
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
      if (finishPointer(event)) return;
      if (state.pan) {
        state.suppressClick = Boolean(state.pan.moved);
        state.pan = null;
        scheduleGameSave();
      }
      if (state.drag) handleDrop(event);
    });

    window.addEventListener("pointercancel", (event) => {
      if (finishPointer(event)) return;
      if (state.pan) {
        state.pan = null;
        scheduleGameSave();
      }
      if (state.drag) {
        state.drag = null;
        document.body.classList.remove("is-fusion-dragging");
        removeDragGhost();
        updateDropFeedback(null);
        render();
      }
    });

    els.board.addEventListener("click", (event) => {
      if (state.suppressClick) {
        state.suppressClick = false;
        return;
      }
      const itemNode = event.target.closest("[data-fusion-item]");
      if (!itemNode) {
        state.selectedId = null;
        render();
        return;
      }
      state.selectedId = itemNode.dataset.fusionItem;
      render();
    });

    els.board.addEventListener("pointerover", (event) => {
      if (event.pointerType !== "mouse") return;
      const itemNode = event.target.closest("[data-fusion-item]");
      if (!itemNode) return;
      const item = state.items.find((candidate) => candidate.id === itemNode.dataset.fusionItem);
      if (item) showTooltip(item, event);
    });
    els.board.addEventListener("pointerout", (event) => {
      if (event.pointerType !== "mouse") return;
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
    document.addEventListener("click", async (event) => {
      const closePanel = event.target.closest("[data-fusion-close-panel]");
      if (closePanel) {
        state.selectedId = null;
        render();
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
        try {
          const result = await DiscoveryRepository.deleteItem(item.id);
          render();
          setStatus(result.deleted > 1 ? `Deleted ${result.deleted} discoveries.` : "Discovery deleted.", "success");
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not delete discovery.", "error");
        }
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
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      game: state.game,
      items: state.items,
      viewport: state.viewport,
      settings: state.settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `centralis-fusion-game-${state.gameId || "export"}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderHome(games) {
    const totalItems = games.reduce((sum, game) => sum + (game.rootCount || 0) + (game.discoveryCount || 0), 0);
    const maxLevel = games.reduce((max, game) => Math.max(max, game.maxLevel || 0), 0);
    if (els.homeGameCount) els.homeGameCount.textContent = String(games.length);
    if (els.homeItemCount) els.homeItemCount.textContent = String(totalItems);
    if (els.homeMaxLevel) els.homeMaxLevel.textContent = String(maxLevel);
    if (!els.gameGrid) return;
    if (!games.length) {
      els.gameGrid.innerHTML = `<div class="fusion-empty-state">No saved Fusion games yet.</div>`;
      return;
    }
    els.gameGrid.innerHTML = games.map((game, index) => {
      const title = game.title && game.title !== "Fusion Game" ? game.title : `Fusion Game ${games.length - index}`;
      const itemCount = (game.rootCount || 0) + (game.discoveryCount || 0);
      return `
        <a class="fusion-game-card" href="fusion.html?game=${encodeURIComponent(game.id)}">
          <div>
            <h2>${html(title)}</h2>
            <p>Updated ${html(formatDateTime(game.updated_at))}</p>
          </div>
          <div class="fusion-game-card-stats">
            <span><strong>${itemCount}</strong> Items</span>
            <span><strong>${game.maxLevel || 0}</strong> Max</span>
          </div>
          <p>Started ${html(formatDateTime(game.created_at))}</p>
        </a>
      `;
    }).join("");
  }

  async function showHome() {
    state.mode = "home";
    document.body.classList.add("is-fusion-home");
    els.home.hidden = false;
    els.shell.hidden = true;
    if (els.panel) els.panel.hidden = true;
    setHomeStatus("Loading saved games...");
    try {
      const games = await FusionDataService.listGames();
      renderHome(games);
      setHomeStatus("");
    } catch (error) {
      renderHome([]);
      setHomeStatus(error instanceof Error ? error.message : "Could not load Fusion games.", "error");
    }
  }

  async function showGame(gameId) {
    state.mode = "game";
    document.body.classList.remove("is-fusion-home");
    els.home.hidden = true;
    els.shell.hidden = false;
    if (!els.app || !els.board || !els.world) return;
    setStatus("Loading Fusion game...");
    const save = await FusionDataService.loadGame(gameId);
    state.gameId = gameId;
    state.game = save.game;
    state.items = save.items;
    state.settings = save.settings;
    state.selectedId = null;
    state.highlightedId = null;
    state.expandedAncestry = new Set();
    if (els.gameTitle) els.gameTitle.textContent = save.game.title || "Fusion";
    els.world.style.width = `${BOARD_SIZE}px`;
    els.world.style.height = `${BOARD_SIZE}px`;
    render();
    bindGameEvents();
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

  function bindHomeEvents() {
    els.newGame?.addEventListener("click", async () => {
      if (els.newGame.disabled) return;
      els.newGame.disabled = true;
      setHomeStatus("Creating a new Fusion game...");
      try {
        const gameId = await FusionDataService.createGame();
        window.location.href = `fusion.html?game=${encodeURIComponent(gameId)}`;
      } catch (error) {
        setHomeStatus(error instanceof Error ? error.message : "Could not create Fusion game.", "error");
        els.newGame.disabled = false;
      }
    });
  }

  async function init() {
    if (!els.app) return;
    bindHomeEvents();
    try {
      await getAppUser();
      if (state.gameId) await showGame(state.gameId);
      else await showHome();
    } catch (error) {
      if (state.gameId) {
        els.shell.hidden = false;
        setStatus(error instanceof Error ? error.message : "Could not initialize Fusion.", "error");
      } else {
        await showHome();
      }
    }
  }

  init();
})();
