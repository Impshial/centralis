(function initGodCanvas() {
  const root = document.getElementById("god-flow");
  if (!root || !window.React || !window.ReactDOM || !window.ReactFlow) {
    if (root) root.textContent = "God Engine canvas could not be loaded.";
    return;
  }

  const React = window.React;
  const ReactDOM = window.ReactDOM;
  const Flow = window.ReactFlow;
  const ReactFlowComponent = Flow.default || Flow.ReactFlow;
  const Background = Flow.Background;
  const Controls = Flow.Controls;
  const ControlButton = Flow.ControlButton;
  const Handle = Flow.Handle;
  const Position = Flow.Position;
  const applyNodeChanges = Flow.applyNodeChanges;
  const applyEdgeChanges = Flow.applyEdgeChanges;

  const params = new URLSearchParams(window.location.search);
  const evolutionId = params.get("evolution_id") || sessionStorage.getItem("centralis-current-god-evolution-id") || "";
  if (evolutionId) sessionStorage.setItem("centralis-current-god-evolution-id", evolutionId);

  const titleElement = document.querySelector("[data-god-title]");
  const statusElement = document.querySelector("[data-god-canvas-status]");
  const inspector = document.querySelector("[data-god-inspector]");
  const contextPanel = document.querySelector("[data-god-context-panel]");
  const workspace = document.querySelector("[data-god-workspace]");
  const autopilotLink = document.querySelector("[data-god-autopilot-launch]");
  const actionsToggle = document.querySelector("[data-god-actions-toggle]");
  const actionsMenu = document.querySelector("[data-god-actions-menu]");
  const cleanImagesButton = document.querySelector("[data-god-clean-images]");
  const godSettingsOpenButton = document.querySelector("[data-god-settings-open]");
  const godSettingsModal = document.getElementById("god-settings-modal");
  const godSettingsForm = document.querySelector("[data-god-settings-form]");
  const godSettingsStatus = document.querySelector("[data-god-settings-status]");
  const godSettingsResetButton = document.querySelector("[data-god-settings-reset]");
  const godSettingsCloseButtons = document.querySelectorAll("[data-god-settings-close]");
  const evolutionStatusOpenButton = document.querySelector("[data-god-evolution-status-open]");
  const evolutionStatusCount = document.querySelector("[data-god-evolution-status-count]");
  if (autopilotLink && evolutionId) {
    autopilotLink.href = `god-autopilot.html?evolution_id=${encodeURIComponent(evolutionId)}`;
  }

  const PRESSURE_OPTIONS = [
    ["rising_temperature", "Rising temperature", "Climate"],
    ["falling_temperature", "Falling temperature", "Climate"],
    ["severe_seasonal_shifts", "Severe seasonal shifts", "Climate"],
    ["increased_storms", "Increased storms", "Climate"],
    ["drought", "Drought", "Climate"],
    ["freezing_conditions", "Freezing conditions", "Climate"],
    ["increasing_water_depth", "Increasing water depth", "Habitat"],
    ["decreasing_water_depth", "Decreasing water depth", "Habitat"],
    ["drying_habitat", "Drying habitat", "Habitat"],
    ["loss_of_shelter", "Loss of shelter", "Habitat"],
    ["expansion_into_land", "Expansion into land", "Habitat"],
    ["increased_darkness", "Increased darkness", "Habitat"],
    ["food_scarcity", "Food scarcity", "Resources"],
    ["new_food_source", "New food source", "Resources"],
    ["mineral_shortage", "Mineral shortage", "Resources"],
    ["new_predator", "New predator", "Ecology"],
    ["increased_predation", "Increased predation", "Ecology"],
    ["increased_competition", "Increased competition", "Ecology"],
    ["new_prey_species", "New prey species", "Ecology"],
    ["parasitic_infection", "Parasitic infection", "Ecology"],
    ["disease_outbreak", "Disease outbreak", "Ecology"],
    ["reduced_oxygen", "Reduced oxygen", "Chemistry"],
    ["increased_oxygen", "Increased oxygen", "Chemistry"],
    ["toxic_environment", "Toxic environment", "Chemistry"],
    ["increased_salinity", "Increased salinity", "Chemistry"],
    ["increased_acidity", "Increased acidity", "Chemistry"],
    ["heavy_radiation", "Heavy radiation", "Chemistry"],
  ];
  const BIAS_OPTIONS = [
    ["body_structure", "Body structure"],
    ["locomotion", "Locomotion"],
    ["feeding", "Feeding"],
    ["digestion", "Digestion"],
    ["defense", "Defense"],
    ["sensory_systems", "Sensory systems"],
    ["respiration", "Respiration"],
    ["reproduction", "Reproduction"],
    ["environmental_tolerance", "Environmental tolerance"],
    ["social_behavior", "Social behavior"],
    ["intelligence", "Intelligence"],
  ];
  const HIGH_RESOLUTION_OPTIONS = [
    ["2560x1440", "2K Resolution (2560x1440)"],
    ["3840x2160", "4K Resolution (3840x2160)"],
  ];
  const GOD_FORMAT_COLORS = new Set([
    "#78d5c8",
    "#94a3b8",
    "#fb7185",
    "#fb923c",
    "#fbbf24",
    "#4ade80",
    "#60a5fa",
    "#a78bfa",
    "#f472b6",
  ]);
  const DEFAULT_GOD_FORMAT = {
    connectionColor: "#78d5c8",
    connectionWidth: 2,
    connectionCurve: "curve",
    nodeBorderWidth: 1,
  };

  let currentUser = window.centralisCurrentAppUser || null;
  let evolution = null;
  let godFormat = { ...DEFAULT_GOD_FORMAT };
  let speciesRows = [];
  let imageRows = [];
  let selectedSpeciesId = null;
  let inspectedSpeciesId = null;
  let contextMode = "";
  const evolvingSpeciesIds = new Set();
  let reactFlowInstance = null;
  let refreshCanvas = () => {};
  let lastLayoutColumns = new Map();
  let openSpeciesMenuId = "";
  let evolutionStatusModal = null;
  let evolutionStatusList = null;
  let evolutionStatusMessage = null;
  let evolutionStatusPoll = null;
  let evolutionStatusLoading = false;
  let suppressPositionSavesUntil = 0;
  let statusClearTimer = null;
  let cleaningImages = false;
  const EVOLUTION_STATUS_POLL_MS = 4000;
  const EVOLUTION_JOB_SOURCE_TYPES = ["god_species_evolution", "god_species_branch_evolution"];
  const EVOLUTION_ACTIVE_STATUSES = new Set(["queued", "running"]);

  function setStatus(message, type = "", options = {}) {
    if (!statusElement) return;
    if (statusClearTimer) {
      window.clearTimeout(statusClearTimer);
      statusClearTimer = null;
    }
    statusElement.textContent = message || "";
    statusElement.classList.remove("is-fading");
    statusElement.classList.toggle("is-error", type === "error");
    statusElement.classList.toggle("is-success", type === "success");
    const autoClear = options.persist ? 0 : Number(options.autoClear || (type === "error" ? 10000 : 4500));
    if (message && autoClear) {
      statusClearTimer = window.setTimeout(() => {
        statusElement.classList.add("is-fading");
        statusClearTimer = window.setTimeout(() => {
          statusElement.textContent = "";
          statusElement.classList.remove("is-error", "is-success", "is-fading");
          statusClearTimer = null;
        }, 280);
      }, autoClear);
    }
  }

  function normalizeGodFormat(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const connectionWidth = Math.min(4, Math.max(1, Number.parseInt(source.connectionWidth, 10) || DEFAULT_GOD_FORMAT.connectionWidth));
    const nodeBorderWidth = Math.min(4, Math.max(1, Number.parseInt(source.nodeBorderWidth, 10) || DEFAULT_GOD_FORMAT.nodeBorderWidth));
    const connectionCurve = ["step", "curve", "line"].includes(source.connectionCurve)
      ? source.connectionCurve
      : DEFAULT_GOD_FORMAT.connectionCurve;
    const connectionColor = GOD_FORMAT_COLORS.has(String(source.connectionColor || "").toLowerCase())
      ? String(source.connectionColor).toLowerCase()
      : DEFAULT_GOD_FORMAT.connectionColor;
    return {
      connectionColor,
      connectionWidth,
      connectionCurve,
      nodeBorderWidth,
    };
  }

  function applyGodFormatToDocument() {
    const target = workspace || document.documentElement;
    target.style.setProperty("--god-edge-color", godFormat.connectionColor);
    target.style.setProperty("--god-edge-width", String(godFormat.connectionWidth));
    target.style.setProperty("--god-node-border-width", `${godFormat.nodeBorderWidth}px`);
  }

  function setGodSettingsStatus(message, type = "") {
    if (!godSettingsStatus) return;
    godSettingsStatus.textContent = message || "";
    godSettingsStatus.classList.toggle("is-error", type === "error");
    godSettingsStatus.classList.toggle("is-success", type === "success");
  }

  function setGodColorValue(value) {
    if (!godSettingsForm) return;
    const nextValue = GOD_FORMAT_COLORS.has(String(value || "").toLowerCase())
      ? String(value).toLowerCase()
      : DEFAULT_GOD_FORMAT.connectionColor;
    const input = godSettingsForm.elements.connectionColor;
    if (input) input.value = nextValue;
    godSettingsForm.querySelectorAll("[data-god-format-colors] [data-god-format-value]").forEach((button) => {
      button.classList.toggle("is-selected", String(button.dataset.godFormatValue || "").toLowerCase() === nextValue);
    });
  }

  function setGodSegmentValue(name, value) {
    if (!godSettingsForm) return;
    const input = godSettingsForm.elements[name];
    if (input) input.value = value;
    const group = godSettingsForm.querySelector(`[data-god-format-segment="${name}"]`);
    group?.querySelectorAll("[data-god-format-value]").forEach((button) => {
      button.classList.toggle("is-selected", String(button.dataset.godFormatValue) === String(value));
    });
  }

  function populateGodSettingsForm(format = godFormat) {
    const normalized = normalizeGodFormat(format);
    setGodColorValue(normalized.connectionColor);
    setGodSegmentValue("connectionWidth", normalized.connectionWidth);
    setGodSegmentValue("connectionCurve", normalized.connectionCurve);
    setGodSegmentValue("nodeBorderWidth", normalized.nodeBorderWidth);
    setGodSettingsStatus("");
  }

  function readGodSettingsForm() {
    if (!godSettingsForm) return normalizeGodFormat(godFormat);
    return normalizeGodFormat({
      connectionColor: godSettingsForm.elements.connectionColor?.value,
      connectionWidth: godSettingsForm.elements.connectionWidth?.value,
      connectionCurve: godSettingsForm.elements.connectionCurve?.value,
      nodeBorderWidth: godSettingsForm.elements.nodeBorderWidth?.value,
    });
  }

  async function saveGodFormat(nextFormat) {
    godFormat = normalizeGodFormat(nextFormat);
    applyGodFormatToDocument();
    refreshCanvas({ preservePositions: true });
    if (!evolution?.id || !currentUser?.id || !window.centralisSupabase) return;
    setGodSettingsStatus("Saving...");
    const nextCanvasSettings = {
      ...(evolution.canvas_settings && typeof evolution.canvas_settings === "object" ? evolution.canvas_settings : {}),
      godFormat,
    };
    const { error } = await window.centralisSupabase
      .from("god_evolutions")
      .update({ canvas_settings: nextCanvasSettings })
      .eq("id", evolution.id)
      .eq("user_id", currentUser.id);
    if (error) {
      setGodSettingsStatus(`Could not save settings: ${error.message}`, "error");
      return;
    }
    evolution = { ...evolution, canvas_settings: nextCanvasSettings };
    setGodSettingsStatus("Settings saved.", "success");
  }

  function openGodSettingsDialog() {
    setActionsMenuOpen(false);
    populateGodSettingsForm(godFormat);
    if (godSettingsModal) godSettingsModal.hidden = false;
  }

  function closeGodSettingsDialog() {
    if (godSettingsModal) godSettingsModal.hidden = true;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function createId() {
    return window.crypto?.randomUUID ? window.crypto.randomUUID() : `god-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeLabel(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatYears(value) {
    const years = Number(value || 0);
    if (!Number.isFinite(years) || years <= 0) return "0 years";
    if (years >= 1000000) {
      const millions = years / 1000000;
      return `${Number.isInteger(millions) ? millions : millions.toFixed(1)} million years`;
    }
    return `${Math.round(years).toLocaleString()} years`;
  }

  function formatElapsed(job) {
    const start = new Date(job.started_at || job.created_at || Date.now()).getTime();
    const end = EVOLUTION_ACTIVE_STATUSES.has(job.status)
      ? Date.now()
      : new Date(job.completed_at || job.updated_at || Date.now()).getTime();
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  function formatJobStatus(status) {
    return String(status || "queued").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function ensureEvolutionStatusModal() {
    if (evolutionStatusModal) return evolutionStatusModal;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div class="modal-backdrop god-evolution-status-backdrop" hidden data-god-evolution-status-modal>
        <div class="modal-dialog god-evolution-status-dialog" role="dialog" aria-modal="true" aria-labelledby="god-evolution-status-title">
          <header class="generation-activity-header">
            <div>
              <p class="settings-eyebrow">God Engine</p>
              <h2 id="god-evolution-status-title">Evolution Status</h2>
              <p>Active species evolution jobs for this tree, including work started in other tabs.</p>
            </div>
            <button class="modal-close" type="button" aria-label="Close Evolution Status" data-god-evolution-status-close>
              <ph-x weight="bold" aria-hidden="true"></ph-x>
            </button>
          </header>
          <div class="god-evolution-status-list" data-god-evolution-status-list></div>
          <footer class="generation-activity-footer">
            <p class="form-status" data-god-evolution-status-message role="status" aria-live="polite"></p>
            <div class="generation-activity-actions">
              <button class="secondary-action" type="button" data-god-evolution-status-refresh>
                <ph-arrows-clockwise weight="duotone" aria-hidden="true"></ph-arrows-clockwise>
                <span>Refresh</span>
              </button>
              <button class="primary-action" type="button" data-god-evolution-status-close>Close</button>
            </div>
          </footer>
        </div>
      </div>
    `;
    evolutionStatusModal = wrapper.firstElementChild;
    document.body.append(evolutionStatusModal);
    evolutionStatusList = evolutionStatusModal.querySelector("[data-god-evolution-status-list]");
    evolutionStatusMessage = evolutionStatusModal.querySelector("[data-god-evolution-status-message]");
    evolutionStatusModal.querySelectorAll("[data-god-evolution-status-close]").forEach((button) => {
      button.addEventListener("click", closeEvolutionStatus);
    });
    evolutionStatusModal.querySelector("[data-god-evolution-status-refresh]")?.addEventListener("click", () => {
      void refreshEvolutionStatus();
    });
    return evolutionStatusModal;
  }

  function renderEvolutionStatusJobs(jobs = []) {
    const active = jobs.filter((job) => EVOLUTION_ACTIVE_STATUSES.has(job.status));
    const recent = jobs.filter((job) => !EVOLUTION_ACTIVE_STATUSES.has(job.status));
    if (evolutionStatusCount) {
      evolutionStatusCount.hidden = active.length <= 0;
      evolutionStatusCount.textContent = active.length > 99 ? "99+" : String(active.length);
    }
    if (!evolutionStatusList) return;
    const renderJob = (job) => {
      const isBranch = job.source_type === "god_species_branch_evolution" || job.parameters?.branch_only === true;
      return `
        <article class="god-evolution-status-card is-${escapeHtml(job.status || "queued")}">
          <div>
            <div class="generation-job-topline">
              <span>${escapeHtml(isBranch ? "Branch evolution" : "Species evolution")}</span>
              <span class="generation-job-status">${escapeHtml(formatJobStatus(job.status))}</span>
            </div>
            <h3>${escapeHtml(job.source_label || job.parameters?.parent_species_name || "Unnamed species")}</h3>
            <div class="generation-job-meta">
              ${job.progress_label ? `<span>${escapeHtml(job.progress_label)}</span>` : ""}
              <span>${escapeHtml(formatElapsed(job))}</span>
              ${job.error_message ? `<span class="is-warning">${escapeHtml(job.error_message)}</span>` : ""}
            </div>
          </div>
        </article>
      `;
    };
    if (!active.length && !recent.length) {
      evolutionStatusList.innerHTML = `
        <div class="generation-activity-empty">
          <ph-hourglass-medium weight="duotone" aria-hidden="true"></ph-hourglass-medium>
          <p>No species are evolving in this tree right now.</p>
        </div>
      `;
      return;
    }
    evolutionStatusList.innerHTML = `
      ${active.length ? `<section><h3>Active</h3>${active.map(renderJob).join("")}</section>` : ""}
      ${recent.length ? `<section><h3>Recent</h3>${recent.map(renderJob).join("")}</section>` : ""}
    `;
  }

  async function refreshEvolutionStatus({ quiet = false } = {}) {
    if (!window.centralisSupabase || !currentUser?.id || evolutionStatusLoading) return;
    evolutionStatusLoading = true;
    if (evolutionStatusMessage && !quiet) evolutionStatusMessage.textContent = "Loading evolution status...";
    try {
      const { data, error } = await window.centralisSupabase
        .from("generation_jobs")
        .select("id,module,source_type,source_id,source_label,status,progress_label,parameters,error_message,created_at,updated_at,started_at,completed_at")
        .eq("module", "god_engine")
        .eq("deleted", false)
        .in("source_type", EVOLUTION_JOB_SOURCE_TYPES)
        .in("status", ["queued", "running", "completed", "failed"])
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      const rows = (data || []).filter((job) => String(job.parameters?.evolution_id || "") === String(evolutionId));
      const visibleRows = [
        ...rows.filter((job) => EVOLUTION_ACTIVE_STATUSES.has(job.status)),
        ...rows.filter((job) => !EVOLUTION_ACTIVE_STATUSES.has(job.status)).slice(0, 8),
      ];
      renderEvolutionStatusJobs(visibleRows);
      if (evolutionStatusMessage) evolutionStatusMessage.textContent = "";
    } catch (error) {
      if (evolutionStatusMessage) evolutionStatusMessage.textContent = `Could not load status: ${error.message || error}`;
    } finally {
      evolutionStatusLoading = false;
    }
  }

  async function openEvolutionStatus() {
    ensureEvolutionStatusModal();
    evolutionStatusModal.hidden = false;
    await refreshEvolutionStatus();
    if (!evolutionStatusPoll) {
      evolutionStatusPoll = window.setInterval(() => refreshEvolutionStatus({ quiet: true }), EVOLUTION_STATUS_POLL_MS);
    }
  }

  function closeEvolutionStatus() {
    if (evolutionStatusModal) evolutionStatusModal.hidden = true;
    if (evolutionStatusPoll) {
      window.clearInterval(evolutionStatusPoll);
      evolutionStatusPoll = null;
    }
  }

  function displayValue(value, fallback = "") {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "string") return value === "[object Object]" ? fallback : value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map((item) => displayValue(item)).filter(Boolean).join(", ") || fallback;
    if (typeof value === "object") {
      const direct = value.name || value.label || value.title || value.type || value.kind || value.summary || value.description || value.niche || value.primary || value.value;
      if (direct) return displayValue(direct, fallback);
      const firstReadable = Object.values(value).map((item) => displayValue(item)).find(Boolean);
      return firstReadable || fallback;
    }
    return String(value);
  }

  function normalizeNovelty(value) {
    if (value === null || value === undefined || value === "") return 50;
    return Math.max(0, Math.min(100, Number(value)));
  }

  function normalizeStepYears(value, totalSteps) {
    const source = Array.isArray(value) ? value : [];
    return Array.from({ length: Math.max(1, Number(totalSteps) || 3) }, (_, index) => {
      const numberValue = Math.round(Number(source[index]));
      if (!Number.isFinite(numberValue)) return 1000000;
      return Math.min(5000000, Math.max(1000000, numberValue));
    });
  }

  function noveltyMeta(value) {
    const novelty = normalizeNovelty(value);
    if (novelty <= 20) return ["Highly Conservative", "Small anatomical changes with low developmental risk."];
    if (novelty <= 40) return ["Conservative", "Recognizable descendants with stable biological continuity."];
    if (novelty <= 60) return ["Balanced", "Moderate biological change with manageable risk."];
    if (novelty <= 80) return ["Experimental", "Larger adaptations and niche exploration with real costs."];
    return ["Radical", "Dramatic but biologically grounded experimentation with high failure risk."];
  }

  function imageForSpecies(speciesId) {
    const rows = imageRows.filter((image) => String(image.object_id) === String(speciesId));
    return rows.find((image) => image.is_primary) || rows[0] || null;
  }

  function imagesForSpecies(speciesId) {
    return imageRows
      .filter((image) => String(image.object_id) === String(speciesId))
      .sort((left, right) => Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary)) || Number(left.sort_order || 0) - Number(right.sort_order || 0));
  }

  function normalizeViewerImages(row) {
    return imagesForSpecies(row.id).map((image) => ({
      ...image,
      src: image.image_url,
      name: row.name || image.name || "Species Image",
      alt: row.name || "Species image",
      isPrimary: Boolean(image.is_primary),
    }));
  }

  function mergeImageRow(image) {
    if (!image) return;
    imageRows = [
      image,
      ...imageRows
        .filter((item) => item.id !== image.id)
        .map((item) => image.is_primary && item.object_id === image.object_id ? { ...item, is_primary: false } : item),
    ];
  }

  function removeImageRow(imageId, speciesId) {
    imageRows = imageRows.filter((image) => image.id !== imageId);
    const remaining = imagesForSpecies(speciesId);
    if (remaining.length && !remaining.some((image) => image.is_primary)) {
      const primaryId = remaining[0].id;
      imageRows = imageRows.map((image) => (
        String(image.object_id) === String(speciesId)
          ? { ...image, is_primary: image.id === primaryId }
          : image
      ));
    }
  }

  function traitsPreview(row) {
    const traits = Array.isArray(row.newly_evolved_traits) ? row.newly_evolved_traits : [];
    return traits.slice(0, 3).map((trait) => typeof trait === "string" ? trait : trait?.name || trait?.trait || "").filter(Boolean);
  }

  function selectedLineageIds() {
    if (!selectedSpeciesId) return new Set();
    const byId = new Map(speciesRows.map((row) => [row.id, row]));
    const ids = new Set([selectedSpeciesId]);
    let cursor = byId.get(selectedSpeciesId);
    while (cursor?.parent_species_id) {
      ids.add(cursor.parent_species_id);
      cursor = byId.get(cursor.parent_species_id);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of speciesRows) {
        if (row.parent_species_id && ids.has(row.parent_species_id) && !ids.has(row.id)) {
          ids.add(row.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  function selectedAncestryIds() {
    if (!selectedSpeciesId) return new Set();
    const byId = new Map(speciesRows.map((row) => [row.id, row]));
    const ids = new Set([selectedSpeciesId]);
    let cursor = byId.get(selectedSpeciesId);
    while (cursor?.parent_species_id) {
      ids.add(cursor.parent_species_id);
      cursor = byId.get(cursor.parent_species_id);
    }
    return ids;
  }

  function buildTreeHelpers(rows) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const childrenByParent = new Map();
    rows.forEach((row) => {
      if (!row.parent_species_id || !byId.has(row.parent_species_id)) return;
      const group = childrenByParent.get(row.parent_species_id) || [];
      group.push(row);
      childrenByParent.set(row.parent_species_id, group);
    });
    const sortRows = (items) => items.sort((left, right) => {
      const leftExtinct = left.status === "extinct" || left.can_evolve === false;
      const rightExtinct = right.status === "extinct" || right.can_evolve === false;
      return Number(leftExtinct) - Number(rightExtinct)
        || Number(left.depth_index ?? left.step_index ?? 0) - Number(right.depth_index ?? right.step_index ?? 0)
        || Number(left.sort_order || 0) - Number(right.sort_order || 0)
        || String(left.name).localeCompare(String(right.name));
    });
    const orderedChildren = (parent) => {
      return sortRows([...(childrenByParent.get(parent.id) || [])]);
    };
    return { byId, childrenByParent, sortRows, orderedChildren };
  }

  function layoutSpecies(rows) {
    const { byId, sortRows, orderedChildren } = buildTreeHelpers(rows);
    const roots = sortRows(rows.filter((row) => !row.parent_species_id || !byId.has(row.parent_species_id)));
    const columnById = new Map();
    const assignColumns = (row, column) => {
      const currentColumn = Math.max(column, columnById.get(row.id) ?? 0);
      columnById.set(row.id, currentColumn);
      orderedChildren(row).forEach((child) => {
        assignColumns(child, currentColumn + 1);
      });
    };
    roots.forEach((rootRow) => assignColumns(rootRow, 0));
    lastLayoutColumns = columnById;
    const positions = new Map();
    const columnGap = 420;
    const rowGap = 500;
    const nodeHeight = 420;
    const minLaneGap = 0.92;
    const laneById = new Map();
    let nextLeafLane = 0;
    let nextRootLane = 0;
    const placeNode = (row, lane) => {
      const column = columnById.get(row.id) ?? 0;
      laneById.set(row.id, lane);
      positions.set(row.id, {
        x: Math.round(80 + column * columnGap),
        y: Math.round(80 + lane * rowGap),
      });
    };
    const assignSubtree = (row, startLane) => {
      const children = orderedChildren(row);
      if (!children.length) {
        const lane = Math.max(startLane, nextLeafLane);
        nextLeafLane = lane + 1;
        placeNode(row, lane);
        return { minLane: lane, maxLane: lane, nextLane: nextLeafLane };
      }

      let cursorLane = startLane;
      const childSpans = children.map((child) => {
        const span = assignSubtree(child, cursorLane);
        cursorLane = Math.max(span.nextLane, span.maxLane + 1);
        return span;
      });
      const minLane = Math.min(...childSpans.map((span) => span.minLane));
      const maxLane = Math.max(...childSpans.map((span) => span.maxLane));
      placeNode(row, (minLane + maxLane) / 2);
      return { minLane, maxLane, nextLane: cursorLane };
    };
    roots.forEach((rootRow) => {
      const result = assignSubtree(rootRow, nextRootLane);
      nextRootLane = Math.max(result.nextLane, result.maxLane + 1);
    });

    const rowsByColumn = new Map();
    rows.forEach((row) => {
      const column = columnById.get(row.id) ?? 0;
      const group = rowsByColumn.get(column) || [];
      group.push(row);
      rowsByColumn.set(column, group);
    });
    rowsByColumn.forEach((columnRows) => {
      const ordered = columnRows
        .map((row) => ({ row, lane: laneById.get(row.id) ?? 0 }))
        .sort((left, right) => left.lane - right.lane || Number(left.row.sort_order || 0) - Number(right.row.sort_order || 0));
      let previousLane = -Infinity;
      ordered.forEach(({ row, lane }) => {
        const nextLane = Math.max(lane, previousLane + minLaneGap);
        previousLane = nextLane;
        laneById.set(row.id, nextLane);
        const position = positions.get(row.id);
        if (position) {
          positions.set(row.id, { ...position, y: Math.round(80 + nextLane * rowGap) });
        }
      });
    });

    let minX = Infinity;
    let minY = Infinity;
    positions.forEach((position) => {
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
    });
    const offsetX = Number.isFinite(minX) && minX < 80 ? 80 - minX : 0;
    const offsetY = Number.isFinite(minY) && minY < 80 ? 80 - minY : 0;
    if (offsetX || offsetY) {
      positions.forEach((position, id) => {
        positions.set(id, {
          x: Math.round(position.x + offsetX),
          y: Math.round(position.y + offsetY),
        });
      });
    }

    rowsByColumn.forEach((columnRows) => {
      const ordered = columnRows
        .map((row) => ({ row, position: positions.get(row.id) }))
        .filter((item) => item.position)
        .sort((left, right) => left.position.y - right.position.y);
      let previousBottom = -Infinity;
      ordered.forEach(({ row, position }) => {
        const minYForNode = previousBottom + 40;
        if (position.y < minYForNode) {
          positions.set(row.id, { ...position, y: Math.round(minYForNode) });
          previousBottom = minYForNode + nodeHeight;
        } else {
          previousBottom = position.y + nodeHeight;
        }
      });
    });

    return positions;
  }

  function toNodes() {
    const lineage = selectedLineageIds();
    return speciesRows.map((row) => {
      const image = imageForSpecies(row.id);
      return {
        id: row.id,
        type: "species",
        position: {
          x: Number(row.position_x || 0),
          y: Number(row.position_y || 0),
        },
        data: {
          row,
          image,
          selected: row.id === selectedSpeciesId,
          inLineage: !selectedSpeciesId || lineage.has(row.id),
          menuOpen: openSpeciesMenuId === row.id,
          format: godFormat,
          onInfo: () => openInspector(row.id),
          onSelect: () => selectSpecies(row.id),
          onToggleMenu: () => toggleSpeciesMenu(row.id),
          onSetExtinct: () => setSpeciesExtinct(row),
          onDelete: () => deleteSpecies(row),
        },
      };
    });
  }

  function toEdges() {
    const lineage = selectedLineageIds();
    const ancestry = selectedAncestryIds();
    const connectionWidth = Number(godFormat.connectionWidth || DEFAULT_GOD_FORMAT.connectionWidth);
    const edgeType = godFormat.connectionCurve === "step"
      ? "smoothstep"
      : godFormat.connectionCurve === "line"
        ? "straight"
        : "default";
    return speciesRows
      .filter((row) => row.parent_species_id)
      .sort((left, right) => {
        return Number(left.depth_index ?? left.step_index ?? 0) - Number(right.depth_index ?? right.step_index ?? 0)
          || Number(left.sort_order || 0) - Number(right.sort_order || 0);
      })
      .map((row) => {
        const inLineage = lineage.has(row.id) && lineage.has(row.parent_species_id);
        const inAncestry = ancestry.has(row.id) && ancestry.has(row.parent_species_id);
        return {
          id: `edge:${row.parent_species_id}:${row.id}`,
          source: row.parent_species_id,
          target: row.id,
          type: edgeType,
          animated: inAncestry,
          zIndex: inAncestry ? 20 : inLineage ? 5 : 1,
          className: [
            "god-edge",
            selectedSpeciesId && !inLineage ? "is-muted" : "",
            inAncestry ? "is-ancestry" : "",
          ].filter(Boolean).join(" "),
          style: {
            strokeWidth: inAncestry ? Math.max(connectionWidth + 2.5, 4.5) : inLineage ? connectionWidth + 0.8 : connectionWidth,
            stroke: inAncestry ? "#9ef8ee" : row.status === "extinct" ? "#8d7f75" : godFormat.connectionColor,
          },
        };
      });
  }

  function SpeciesNode(props) {
    const row = props.data.row;
    const image = props.data.image;
    const preview = traitsPreview(row);
    const classes = [
      "god-species-node",
      props.data.selected ? "is-selected" : "",
      props.data.inLineage ? "" : "is-muted",
      row.status === "extinct" ? "is-extinct" : "",
    ].filter(Boolean).join(" ");
    return React.createElement("article", {
      className: classes,
      style: { borderWidth: `${Number(props.data.format?.nodeBorderWidth || DEFAULT_GOD_FORMAT.nodeBorderWidth)}px` },
      onDoubleClick: (event) => {
        event.stopPropagation();
        props.data.onInfo();
      },
    },
      React.createElement(Handle, { type: "target", position: Position.Left, isConnectable: false }),
      React.createElement("button", {
        type: "button",
        className: "god-node-image",
        onClick: (event) => {
          event.stopPropagation();
          props.data.onSelect();
        },
        title: "Select species",
      }, image
        ? React.createElement("img", { src: image.image_url, alt: "" })
        : React.createElement("span", { className: "god-node-placeholder" }, React.createElement("ph-dna", { weight: "duotone", "aria-hidden": "true" }))),
      React.createElement("div", { className: "god-node-body" },
        React.createElement("h3", null, row.name || "Unnamed species"),
        React.createElement("ul", null, preview.length
          ? preview.map((trait) => React.createElement("li", { key: trait }, `+ ${trait}`))
          : React.createElement("li", null, "+ Baseline lineage")),
        React.createElement("footer", null,
          React.createElement("span", { className: `god-status-dot is-${row.status || "stable"}` }, normalizeLabel(row.status || "stable")),
          React.createElement("div", { className: "god-node-actions" },
          React.createElement("div", { className: "god-node-menu-wrap nodrag" },
            React.createElement("button", {
              type: "button",
              className: "god-node-menu-button",
              title: "Species actions",
              "aria-label": "Species actions",
              "aria-expanded": props.data.menuOpen ? "true" : "false",
              onClick: (event) => {
                event.stopPropagation();
                props.data.onToggleMenu();
              },
            }, React.createElement("ph-gear-six", { weight: "fill", "aria-hidden": "true" })),
            props.data.menuOpen ? React.createElement("div", { className: "god-node-menu", role: "menu" },
              React.createElement("button", {
                type: "button",
                role: "menuitem",
                onClick: (event) => {
                  event.stopPropagation();
                  props.data.onSetExtinct();
                },
              }, "Set Extinct"),
              React.createElement("button", {
                type: "button",
                role: "menuitem",
                className: "is-danger",
                onClick: (event) => {
                  event.stopPropagation();
                  props.data.onDelete();
                },
              }, "Delete Species")) : null),
          React.createElement("button", {
            type: "button",
            className: "god-info-button",
            onClick: (event) => {
              event.stopPropagation();
              props.data.onInfo();
            },
          }, "Info")))),
      React.createElement(Handle, { type: "source", position: Position.Right, isConnectable: false }),
    );
  }

  const nodeTypes = { species: SpeciesNode };

  function App() {
    const [nodes, setNodes] = React.useState(toNodes());
    const [edges, setEdges] = React.useState(toEdges());

    refreshCanvas = (options = {}) => {
      const nextNodes = toNodes();
      setNodes((current) => {
        if (!options.preservePositions) return nextNodes;
        const currentById = new Map(current.map((node) => [node.id, node]));
        return nextNodes.map((node) => {
          const currentNode = currentById.get(node.id);
          return currentNode ? { ...node, position: currentNode.position } : node;
        });
      });
      setEdges(toEdges());
      if (options.updateInternals && reactFlowInstance && typeof reactFlowInstance.updateNodeInternals === "function") {
        window.requestAnimationFrame(() => {
          speciesRows.forEach((row) => reactFlowInstance.updateNodeInternals(row.id));
        });
      }
    };

    React.useEffect(() => {
      refreshCanvas();
    }, []);

    return React.createElement(ReactFlowComponent, {
      nodes,
      edges,
      nodeTypes,
      fitView: true,
      proOptions: { hideAttribution: true },
      minZoom: 0.08,
      maxZoom: 1.6,
      nodesDraggable: true,
      nodesConnectable: false,
      elementsSelectable: true,
      onInit: (instance) => { reactFlowInstance = instance; },
      onNodesChange: (changes) => {
        setNodes((current) => applyNodeChanges(changes, current));
        if (Date.now() < suppressPositionSavesUntil) return;
        const finished = changes.filter((change) => change.type === "position" && change.dragging === false && change.position);
        if (finished.length) {
          finished.forEach((change) => saveSpeciesPosition(change.id, change.position));
        }
      },
      onEdgesChange: (changes) => setEdges((current) => applyEdgeChanges(changes, current)),
      onNodeClick: (_event, node) => {
        selectSpecies(node.id);
      },
      onPaneClick: () => {
        selectedSpeciesId = null;
        suppressPositionSavesUntil = Date.now() + 500;
        refreshCanvas({ preservePositions: true });
        renderInspector();
      },
    },
      React.createElement(Background, { variant: "lines", gap: 42, color: "var(--god-flow-grid-line)", lineWidth: 1 }),
      React.createElement(Controls, { showInteractive: false },
        React.createElement(ControlButton, {
          onClick: async () => {
            await persistLayout({ fit: false });
            setStatus("Auto-layout complete.", "success");
          },
          title: "Auto-layout canvas",
          "aria-label": "Auto-layout canvas",
        }, React.createElement("ph-tree-structure", { weight: "bold", "aria-hidden": "true" }))));
  }

  async function saveSpeciesPosition(id, position) {
    await window.centralisSupabase
      .from("god_species")
      .update({ position_x: Math.round(position.x), position_y: Math.round(position.y) })
      .eq("id", id)
      .eq("user_id", currentUser.id)
      .eq("deleted", false);
  }

  async function persistLayout({ fit = false } = {}) {
    const positions = await layoutSpecies(speciesRows);
    speciesRows = speciesRows.map((row) => {
      const position = positions.get(row.id) || { x: Number(row.position_x || 0), y: Number(row.position_y || 0) };
      return { ...row, position_x: position.x, position_y: position.y, depth_index: lastLayoutColumns.get(row.id) ?? row.depth_index };
    });
    refreshCanvas({ updateInternals: true });
    await Promise.all(speciesRows.map((row) => window.centralisSupabase
      .from("god_species")
      .update({ position_x: Math.round(row.position_x), position_y: Math.round(row.position_y), depth_index: row.depth_index })
      .eq("id", row.id)
      .eq("user_id", currentUser.id)
      .eq("deleted", false)));
    if (fit && reactFlowInstance) {
      window.requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.18, duration: 300 }));
    }
  }

  async function loadImages() {
    const ids = speciesRows.map((row) => row.id);
    if (!ids.length) {
      imageRows = [];
      return;
    }
    try {
      const { data, error } = await window.centralisSupabase.functions.invoke("list-object-images", { body: { objectIds: ids } });
      if (error) throw error;
      imageRows = data?.images || [];
    } catch (error) {
      console.warn("Could not load God Engine images:", error);
      imageRows = [];
    }
  }

  async function refreshSpeciesRowsFromDb() {
    const { data, error } = await window.centralisSupabase
      .from("god_species")
      .select("*")
      .eq("evolution_id", evolutionId)
      .eq("user_id", currentUser.id)
      .eq("deleted", false)
      .order("depth_index", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw error;
    speciesRows = data || [];
    await loadImages();
  }

  async function loadData() {
    if (!evolutionId) {
      setStatus("No evolution selected.", "error");
      return;
    }
    if (!window.centralisSupabase || !currentUser?.id) return;
    setStatus("Loading evolution...");
    const [{ data: evolutionRow, error: evolutionError }, { data: species, error: speciesError }] = await Promise.all([
      window.centralisSupabase
        .from("god_evolutions")
        .select("*")
        .eq("id", evolutionId)
        .eq("user_id", currentUser.id)
        .eq("deleted", false)
        .single(),
      window.centralisSupabase
        .from("god_species")
        .select("*")
        .eq("evolution_id", evolutionId)
        .eq("user_id", currentUser.id)
        .eq("deleted", false)
        .order("depth_index", { ascending: true })
        .order("sort_order", { ascending: true }),
    ]);
    if (evolutionError || speciesError) {
      setStatus(`Could not load evolution: ${(evolutionError || speciesError).message}`, "error");
      return;
    }
    evolution = evolutionRow;
    godFormat = normalizeGodFormat(evolution?.canvas_settings?.godFormat);
    applyGodFormatToDocument();
    speciesRows = species || [];
    if (titleElement) titleElement.textContent = evolution.name || "God Engine";
    await loadImages();
    setStatus("");
    ReactDOM.createRoot(root).render(React.createElement(App));
    renderInspector();
    if (speciesRows.some((row) => !Number(row.position_x) && !Number(row.position_y))) {
      await persistLayout({ fit: true });
    }
    void refreshEvolutionStatus({ quiet: true });
    void ensureMissingStandardImages();
  }

  function formatValueList(value) {
    const rows = Array.isArray(value) ? value : [];
    if (!rows.length) return '<p class="god-muted">None recorded.</p>';
    return `<ul>${rows.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : item.name || item.trait || JSON.stringify(item))}</li>`).join("")}</ul>`;
  }

  function formatRecord(record) {
    const value = record && typeof record === "object" && !Array.isArray(record) ? record : {};
    const entries = Object.entries(value);
    if (!entries.length) return '<p class="god-muted">None recorded.</p>';
    return `<dl>${entries.map(([key, item]) => `
      <dt>${escapeHtml(normalizeLabel(key))}</dt>
      <dd>${formatRecordValue(item)}</dd>
    `).join("")}</dl>`;
  }

  function formatRecordValue(item) {
    if (Array.isArray(item)) return escapeHtml(item.join(", "));
    if (item && typeof item === "object") {
      const entries = Object.entries(item);
      if (!entries.length) return '<span class="god-muted">None recorded.</span>';
      return `<dl class="god-nested-record">${entries.map(([key, value]) => `
        <dt>${escapeHtml(normalizeLabel(key))}</dt>
        <dd>${formatRecordValue(value)}</dd>
      `).join("")}</dl>`;
    }
    return escapeHtml(item ?? "");
  }

  function physicalDescriptionFor(row) {
    const traits = row?.complete_traits && typeof row.complete_traits === "object" && !Array.isArray(row.complete_traits)
      ? row.complete_traits
      : {};
    return String(traits.physical_description || traits.physicalDescription || "").trim();
  }

  function customTraitsFor(row) {
    const values = Array.isArray(row?.custom_evolution_traits) ? row.custom_evolution_traits : [];
    const traits = values
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const legacy = String(row?.custom_evolution_trait || "").trim();
    if (legacy && !traits.some((item) => item.toLowerCase() === legacy.toLowerCase())) traits.push(legacy);
    return traits.slice(0, 12);
  }

  function renderInspector() {
    if (!inspector || !workspace) return;
    const row = speciesRows.find((item) => item.id === inspectedSpeciesId) || null;
    workspace.classList.toggle("has-inspector", Boolean(row));
    inspector.hidden = !row;
    if (!row) {
      inspector.innerHTML = "";
      renderContextPanel();
      return;
    }
    const image = imageForSpecies(row.id);
    const noveltyValue = normalizeNovelty(row.novelty);
    const [noveltyLabel, noveltyText] = noveltyMeta(row.novelty);
    const pressureLabels = Array.isArray(row.pressures) && row.pressures.length
      ? row.pressures.map(normalizeLabel).join(", ")
      : "Determined by evolutionary engine";
    const biasLabel = row.adaptation_bias ? normalizeLabel(row.adaptation_bias) : "Determined by evolutionary engine";
    const customTraits = customTraitsFor(row);
    const isEvolving = evolvingSpeciesIds.has(row.id);
    const hasExistingDescendants = speciesRows.some((item) => item.parent_species_id === row.id);
    const evolveLabel = hasExistingDescendants ? "Add Branch Evolution" : "Evolve Species";
    const factChips = [
      displayValue(row.category, "Unclassified organism"),
      displayValue(row.habitat, "Habitat unknown"),
    ].filter((value) => value && value !== "[object Object]");
    inspector.innerHTML = `
      <div class="god-inspector-resizer" data-god-inspector-resizer aria-hidden="true"></div>
      <div class="god-inspector-tabs" aria-label="Evolution context controls">
        <button type="button" data-god-context="environment" aria-pressed="${contextMode === "environment"}">Environment</button>
        <button type="button" data-god-context="adaptation" aria-pressed="${contextMode === "adaptation"}">Adaptation</button>
        <button type="button" data-god-context="custom" aria-pressed="${contextMode === "custom"}">Custom</button>
      </div>
      <header class="god-inspector-header">
        <div class="god-inspector-name-row">
          <h2>${escapeHtml(row.name || "Unnamed species")}</h2>
          <button class="icon-button god-rename-species" type="button" aria-label="Rename species" title="Rename species" data-god-rename-species>
            <ph-pencil-simple weight="bold" aria-hidden="true"></ph-pencil-simple>
          </button>
        </div>
        <button class="modal-close" type="button" aria-label="Close Species Inspector" data-god-close-inspector><ph-x weight="bold" aria-hidden="true"></ph-x></button>
      </header>
      <div class="god-inspector-title">
        <p class="settings-eyebrow">Species Inspector</p>
        ${row.scientific_name ? `<p class="god-scientific">${escapeHtml(row.scientific_name)}</p>` : ""}
      </div>
      <div class="god-species-portrait">
        ${image ? `<img src="${escapeHtml(image.image_url)}" alt="">` : `<div class="god-portrait-placeholder"><ph-dna weight="duotone" aria-hidden="true"></ph-dna></div>`}
        <div class="god-image-actions">
          <button class="secondary-action compact-action" type="button" data-god-regenerate-image>${image ? "Regenerate Thumbnail" : "Generate Thumbnail"}</button>
          <div class="god-high-resolution-picker" data-god-high-resolution-picker ${image ? "hidden" : "hidden aria-disabled=\"true\""}>
            <span>High Resolution Size</span>
            <select data-god-high-size ${image ? "" : "disabled"}>
              ${HIGH_RESOLUTION_OPTIONS.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}
            </select>
          </div>
          <button class="secondary-action compact-action" type="button" data-god-high-image ${image ? "" : "disabled"}>Generate High Resolution Version</button>
          <button class="secondary-action compact-action" type="button" data-god-view-image ${image ? "" : "disabled"}>View Full Image</button>
        </div>
      </div>
      <div class="god-inspector-facts">
        ${factChips.map((chip) => `<span class="god-fact-line">${escapeHtml(chip)}</span>`).join("")}
        <span class="god-status-dot is-${escapeHtml(row.status || "stable")}">${escapeHtml(normalizeLabel(row.status || "stable"))}</span>
      </div>
      <button class="secondary-action god-jump-evolve" type="button" data-god-jump-evolve><ph-arrow-down weight="bold" aria-hidden="true"></ph-arrow-down> Jump to Evolve</button>
      <section class="god-section"><h3>Overview</h3><p>${escapeHtml(row.overview || "No overview yet.")}</p></section>
      ${physicalDescriptionFor(row) ? `<section class="god-section"><h3>Physical Description</h3><p>${escapeHtml(physicalDescriptionFor(row))}</p></section>` : ""}
      <section class="god-section"><h3>Newly Evolved Traits</h3>${formatValueList(row.newly_evolved_traits)}</section>
      <section class="god-section"><h3>Complete Traits</h3>${formatRecord(row.complete_traits)}</section>
      <section class="god-section"><h3>Habitat And Ecology</h3>${formatRecord(row.ecology)}</section>
      <section class="god-section"><h3>Reproduction</h3>${formatRecord(row.reproduction)}</section>
      <section class="god-section"><h3>Evolutionary History</h3>
        <dl>
          <dt>Elapsed Time</dt><dd>${escapeHtml(formatYears(row.elapsed_years))}</dd>
          <dt>Since Parent</dt><dd>${escapeHtml(formatYears(row.years_since_parent))}</dd>
        </dl>
        <p>${escapeHtml(row.evolution_reason || "This species begins or continues the lineage.")}</p>
        ${row.extinction_cause ? `<p><strong>Extinction cause:</strong> ${escapeHtml(row.extinction_cause)}</p>` : ""}
        <h4>Potential future directions</h4>
        ${formatValueList(row.potential_trait_hints)}
      </section>
      <section class="god-evolve-panel" data-god-evolve-panel>
        <label class="god-novelty-label">
          <span>Evolutionary Novelty</span>
          <input type="range" min="0" max="100" value="${noveltyValue}" data-god-novelty>
        </label>
        <div class="god-novelty-scale" aria-hidden="true">
          <span>Highly Conservative</span>
          <span>Balanced</span>
          <span>Radical</span>
        </div>
        <strong data-god-novelty-title>${escapeHtml(noveltyLabel)}</strong>
        <p data-god-novelty-copy>${escapeHtml(noveltyText)}</p>
        <div class="god-next-summary">
          <h3>Next Evolution</h3>
          <dl>
            <dt>Novelty</dt><dd data-god-summary-novelty>${escapeHtml(noveltyLabel)}</dd>
            <dt>Environmental Pressure</dt><dd>${escapeHtml(pressureLabels)}</dd>
            <dt>Adaptation Bias</dt><dd>${escapeHtml(biasLabel)}</dd>
          </dl>
        </div>
        <div class="god-custom-traits-next">
          <h3>Custom Traits for Next Evolution</h3>
          ${customTraits.length ? `
            <ul class="god-custom-trait-list">
              ${customTraits.map((trait, index) => `
                <li>
                  <span>${escapeHtml(trait)}</span>
                  <button class="secondary-action compact-action" type="button" data-god-remove-custom-trait="${index}">Remove</button>
                </li>
              `).join("")}
            </ul>
          ` : `<p class="god-muted">No custom traits added.</p>`}
        </div>
        <button class="primary-action god-evolve-button" type="button" data-god-evolve ${isEvolving || row.status === "extinct" || row.can_evolve === false ? "disabled" : ""}>${isEvolving ? `Evolving ${escapeHtml(row.name || "Species")}` : evolveLabel}</button>
        <button class="secondary-action god-jump-top" type="button" data-god-jump-top><ph-arrow-up weight="bold" aria-hidden="true"></ph-arrow-up> Jump to Top</button>
        ${row.status === "extinct" || row.can_evolve === false ? `<p class="god-muted">This branch can no longer evolve.</p>` : ""}
      </section>
    `;
    bindInspector(row);
    renderContextPanel();
  }

  function openInspector(speciesId) {
    inspectedSpeciesId = speciesId;
    selectedSpeciesId = speciesId;
    suppressPositionSavesUntil = Date.now() + 500;
    refreshCanvas({ preservePositions: true });
    renderInspector();
  }

  function selectSpecies(speciesId) {
    selectedSpeciesId = speciesId;
    openSpeciesMenuId = "";
    suppressPositionSavesUntil = Date.now() + 500;
    refreshCanvas({ preservePositions: true });
  }

  function toggleSpeciesMenu(speciesId) {
    openSpeciesMenuId = openSpeciesMenuId === speciesId ? "" : speciesId;
    suppressPositionSavesUntil = Date.now() + 500;
    refreshCanvas({ preservePositions: true });
  }

  function closeSpeciesMenuOnOutsideClick(event) {
    if (!openSpeciesMenuId) return;
    const target = event.target;
    if (target?.closest?.(".god-node-menu, .god-node-menu-button")) return;
    openSpeciesMenuId = "";
    suppressPositionSavesUntil = Date.now() + 500;
    refreshCanvas({ preservePositions: true });
  }

  function setActionsMenuOpen(isOpen) {
    if (!actionsMenu || !actionsToggle) return;
    actionsMenu.hidden = !isOpen;
    actionsToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function closeActionsMenuOnOutsideClick(event) {
    if (!actionsMenu || actionsMenu.hidden) return;
    const target = event.target;
    if (target?.closest?.("[data-god-actions-menu], [data-god-actions-toggle]")) return;
    setActionsMenuOpen(false);
  }

  function closeInspector() {
    inspectedSpeciesId = null;
    contextMode = "";
    renderInspector();
  }

  function descendantIds(speciesId) {
    const ids = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      speciesRows.forEach((row) => {
        if (row.parent_species_id && (row.parent_species_id === speciesId || ids.has(row.parent_species_id)) && !ids.has(row.id)) {
          ids.add(row.id);
          changed = true;
        }
      });
    }
    return ids;
  }

  async function setSpeciesExtinct(row) {
    const descendants = descendantIds(row.id);
    const message = descendants.size
      ? `Set ${row.name} extinct and remove ${descendants.size} descendant${descendants.size === 1 ? "" : "s"} from this tree?`
      : `Set ${row.name} extinct?`;
    if (!window.confirm(message)) return;
    openSpeciesMenuId = "";
    setStatus(`Setting ${row.name} extinct...`);
    const now = new Date().toISOString();
    try {
      if (descendants.size) {
        const { error: descendantError } = await window.centralisSupabase
          .from("god_species")
          .update({ deleted: true, deleted_at: now, deleted_by: currentUser.id })
          .in("id", [...descendants])
          .eq("user_id", currentUser.id);
        if (descendantError) throw descendantError;
      }
      const { error } = await window.centralisSupabase
        .from("god_species")
        .update({
          status: "extinct",
          can_evolve: false,
          extinction_cause: "Marked extinct by user.",
        })
        .eq("id", row.id)
        .eq("user_id", currentUser.id)
        .eq("deleted", false);
      if (error) throw error;
      speciesRows = speciesRows
        .filter((item) => !descendants.has(item.id))
        .map((item) => item.id === row.id ? { ...item, status: "extinct", can_evolve: false, extinction_cause: "Marked extinct by user." } : item);
      if (descendants.has(selectedSpeciesId)) selectedSpeciesId = row.id;
      if (descendants.has(inspectedSpeciesId)) inspectedSpeciesId = row.id;
      await persistLayout({ fit: false });
      refreshCanvas();
      renderInspector();
      setStatus(`${row.name} is extinct. Descendants removed.`, "success");
    } catch (error) {
      console.error(error);
      setStatus(`Could not set extinct: ${error.message || error}`, "error");
    }
  }

  async function deleteSpecies(row) {
    const descendants = descendantIds(row.id);
    const deleteIds = new Set([row.id, ...descendants]);
    if (!window.confirm(`Delete ${row.name} and ${descendants.size} descendant${descendants.size === 1 ? "" : "s"} from this tree?`)) return;
    openSpeciesMenuId = "";
    setStatus(`Deleting ${row.name}...`);
    try {
      const { error } = await window.centralisSupabase
        .from("god_species")
        .update({ deleted: true, deleted_at: new Date().toISOString(), deleted_by: currentUser.id })
        .in("id", [...deleteIds])
        .eq("user_id", currentUser.id);
      if (error) throw error;
      speciesRows = speciesRows.filter((item) => !deleteIds.has(item.id));
      if (deleteIds.has(selectedSpeciesId)) selectedSpeciesId = speciesRows[0]?.id || null;
      if (deleteIds.has(inspectedSpeciesId)) inspectedSpeciesId = null;
      await persistLayout({ fit: false });
      refreshCanvas();
      renderInspector();
      setStatus(`${row.name} deleted. Descendants removed.`, "success");
    } catch (error) {
      console.error(error);
      setStatus(`Could not delete species: ${error.message || error}`, "error");
    }
  }

  function bindInspector(row) {
    inspector.querySelector("[data-god-close-inspector]")?.addEventListener("click", closeInspector);
    inspector.querySelector("[data-god-rename-species]")?.addEventListener("click", () => renameSpecies(row));
    setupInspectorResize();
    inspector.querySelectorAll("[data-god-context]").forEach((button) => {
      button.addEventListener("click", () => {
        contextMode = contextMode === button.dataset.godContext ? "" : button.dataset.godContext;
        renderInspector();
      });
    });
    inspector.querySelector("[data-god-jump-evolve]")?.addEventListener("click", () => {
      inspector.querySelector("[data-god-evolve-panel]")?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    inspector.querySelector("[data-god-jump-top]")?.addEventListener("click", () => {
      inspector.scrollTo({ top: 0, behavior: "smooth" });
    });
    inspector.querySelectorAll("[data-god-remove-custom-trait]").forEach((button) => {
      button.addEventListener("click", async () => {
        const removeIndex = Number(button.dataset.godRemoveCustomTrait);
        const nextTraits = customTraitsFor(row).filter((_, index) => index !== removeIndex);
        await updateSpeciesSettings(row, {
          custom_evolution_traits: nextTraits,
          custom_evolution_trait: nextTraits[0] || null,
        });
      });
    });
    inspector.querySelector("[data-god-novelty]")?.addEventListener("input", async (event) => {
      const value = Number(event.target.value || 50);
      const [label, copy] = noveltyMeta(value);
      inspector.querySelector("[data-god-novelty-title]").textContent = label;
      inspector.querySelector("[data-god-novelty-copy]").textContent = copy;
      inspector.querySelector("[data-god-summary-novelty]").textContent = label;
      row.novelty = value;
      await window.centralisSupabase.from("god_species").update({ novelty: value }).eq("id", row.id).eq("user_id", currentUser.id);
    });
    inspector.querySelector("[data-god-evolve]")?.addEventListener("click", () => evolveSpecies(row));
    inspector.querySelector("[data-god-regenerate-image]")?.addEventListener("click", () => generateSpeciesImage(row, { highResolution: false, makePrimary: true, force: true }));
    inspector.querySelector("[data-god-high-image]")?.addEventListener("click", () => {
      const picker = inspector.querySelector("[data-god-high-resolution-picker]");
      if (picker?.hidden) {
        picker.hidden = false;
        inspector.querySelector("[data-god-high-size]")?.focus();
        return;
      }
      const highResolutionSize = inspector.querySelector("[data-god-high-size]")?.value || HIGH_RESOLUTION_OPTIONS[0][0];
      const specialInstructions = window.prompt("Add any special instructions for this high-resolution image. Leave blank to use the standard species prompt.", "");
      if (specialInstructions === null) return;
      generateSpeciesImage(row, {
        highResolution: true,
        highResolutionSize,
        makePrimary: true,
        force: true,
        specialInstructions: String(specialInstructions || "").trim(),
      });
    });
    inspector.querySelector("[data-god-view-image]")?.addEventListener("click", () => openImageViewer(row));
  }

  function setupInspectorResize() {
    const resizer = inspector.querySelector("[data-god-inspector-resizer]");
    if (!resizer || resizer.dataset.bound === "true") return;
    resizer.dataset.bound = "true";
    let pendingWidth = 0;
    let resizeFrame = 0;

    function handlePointerMove(event) {
      const workspaceWidth = workspace?.getBoundingClientRect().width || window.innerWidth;
      const contextWidth = workspace?.classList.contains("has-context") ? 320 : 0;
      const maxWidth = Math.max(320, Math.min(760, workspaceWidth - contextWidth - 360));
      pendingWidth = Math.min(maxWidth, Math.max(320, window.innerWidth - event.clientX));
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(() => {
        workspace?.style.setProperty("--god-inspector-width", `${pendingWidth}px`);
        resizeFrame = 0;
      });
    }

    function handlePointerUp() {
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = 0;
      }
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("is-resizing-details");
      workspace?.classList.remove("is-resizing");
    }

    resizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      document.body.classList.add("is-resizing-details");
      workspace?.classList.add("is-resizing");
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    });
  }

  async function renameSpecies(row) {
    const currentName = row.name || "";
    const nextName = window.prompt("Rename this creature. The AI will generate a new Latin name to match.", currentName);
    if (nextName === null) return;
    const cleanName = String(nextName || "").replace(/\s+/g, " ").trim();
    if (!cleanName || cleanName === currentName) return;
    setStatus(`Renaming ${currentName || "species"}...`);
    try {
      const { data, error } = await window.centralisSupabase.functions.invoke("generate-god-species-name", {
        body: {
          name: cleanName,
          species: row,
        },
      });
      if (error) throw error;
      const scientificName = String(data?.scientific_name || data?.scientificName || "").trim();
      if (!scientificName) throw new Error("The AI did not return a scientific name.");
      const patch = {
        name: cleanName,
        scientific_name: scientificName,
      };
      const { error: updateError } = await window.centralisSupabase
        .from("god_species")
        .update(patch)
        .eq("id", row.id)
        .eq("user_id", currentUser.id);
      if (updateError) throw updateError;
      speciesRows = speciesRows.map((item) => item.id === row.id ? { ...item, ...patch } : item);
      refreshCanvas({ preservePositions: true });
      renderInspector();
      setStatus(`${cleanName} renamed. Latin name updated.`, "success");
    } catch (error) {
      console.error(error);
      setStatus(`Could not rename species: ${error.message || error}`, "error");
    }
  }

  function renderContextPanel() {
    if (!contextPanel || !workspace) return;
    const row = speciesRows.find((item) => item.id === inspectedSpeciesId) || null;
    const isOpen = Boolean(row && contextMode);
    contextPanel.hidden = !isOpen;
    workspace.classList.toggle("has-context", isOpen);
    if (!isOpen) {
      contextPanel.innerHTML = "";
      return;
    }
    if (contextMode === "environment") {
      const selected = new Set(Array.isArray(row.pressures) ? row.pressures : []);
      const groups = PRESSURE_OPTIONS.reduce((map, option) => {
        const list = map.get(option[2]) || [];
        list.push(option);
        map.set(option[2], list);
        return map;
      }, new Map());
      contextPanel.innerHTML = `
        <header><h2>Environmental Pressure</h2><p>Choose up to three pressures for the next evolution.</p></header>
        <label class="god-context-option is-wide">
          <input type="checkbox" value="" data-god-no-pressure ${selected.size ? "" : "checked"}>
          <span><strong>No Custom Pressures</strong><em>Allow the evolutionary engine to determine pressures.</em></span>
        </label>
        ${[...groups.entries()].map(([group, options]) => `
          <section class="god-context-group"><h3>${escapeHtml(group)}</h3>
            ${options.map(([value, label]) => `
              <label class="god-context-option">
                <input type="checkbox" value="${escapeHtml(value)}" data-god-pressure ${selected.has(value) ? "checked" : ""}>
                <span>${escapeHtml(label)}</span>
              </label>
            `).join("")}
          </section>
        `).join("")}
      `;
      bindPressurePanel(row);
    } else if (contextMode === "adaptation") {
      contextPanel.innerHTML = `
        <header><h2>Adaptation Bias</h2><p>Favor one biological system without forcing the outcome.</p></header>
        <label class="god-context-option is-wide">
          <input type="radio" name="god-bias" value="" data-god-bias ${row.adaptation_bias ? "" : "checked"}>
          <span><strong>No Custom Bias</strong><em>Allow the engine to decide which systems adapt.</em></span>
        </label>
        <section class="god-context-group">
          ${BIAS_OPTIONS.map(([value, label]) => `
            <label class="god-context-option">
              <input type="radio" name="god-bias" value="${escapeHtml(value)}" data-god-bias ${row.adaptation_bias === value ? "checked" : ""}>
              <span>${escapeHtml(label)}</span>
            </label>
          `).join("")}
        </section>
      `;
      bindBiasPanel(row);
    } else {
      contextPanel.innerHTML = `
        <header><h2>Custom Trait</h2><p>Add custom evolutionary traits the engine should try to incorporate somewhere in the next evolution.</p></header>
        <label class="god-context-field">
          <span>Trait guidance</span>
          <textarea data-god-custom-trait maxlength="1000" rows="8" placeholder="Example: develop a heat-sensing frill used to locate warm burrows during cold nights."></textarea>
        </label>
        <div class="god-context-actions">
          <button class="secondary-action" type="button" data-god-clear-custom-trait>Clear</button>
          <button class="primary-action" type="button" data-god-save-custom-trait>Save Trait</button>
        </div>
      `;
      bindCustomTraitPanel(row);
    }
  }

  function bindPressurePanel(row) {
    contextPanel.querySelector("[data-god-no-pressure]")?.addEventListener("change", async (event) => {
      if (!event.target.checked) return;
      await updateSpeciesSettings(row, { pressures: [] });
    });
    contextPanel.querySelectorAll("[data-god-pressure]").forEach((input) => {
      input.addEventListener("change", async () => {
        const selected = [...contextPanel.querySelectorAll("[data-god-pressure]:checked")].map((item) => item.value).slice(0, 3);
        contextPanel.querySelectorAll("[data-god-pressure]").forEach((item) => {
          item.checked = selected.includes(item.value);
          item.disabled = selected.length >= 3 && !item.checked;
        });
        await updateSpeciesSettings(row, { pressures: selected });
      });
    });
  }

  function bindBiasPanel(row) {
    contextPanel.querySelectorAll("[data-god-bias]").forEach((input) => {
      input.addEventListener("change", async () => {
        if (!input.checked) return;
        await updateSpeciesSettings(row, { adaptation_bias: input.value || null });
      });
    });
  }

  function bindCustomTraitPanel(row) {
    const textarea = contextPanel.querySelector("[data-god-custom-trait]");
    contextPanel.querySelector("[data-god-save-custom-trait]")?.addEventListener("click", async () => {
      const trait = String(textarea?.value || "").trim();
      if (!trait) return;
      const lowerTrait = trait.toLowerCase();
      const nextTraits = [
        ...customTraitsFor(row).filter((item) => item.toLowerCase() !== lowerTrait),
        trait,
      ].slice(0, 12);
      await updateSpeciesSettings(row, {
        custom_evolution_traits: nextTraits,
        custom_evolution_trait: nextTraits[0] || null,
      });
      if (textarea) textarea.value = "";
    });
    contextPanel.querySelector("[data-god-clear-custom-trait]")?.addEventListener("click", () => {
      if (textarea) textarea.value = "";
    });
  }

  async function updateSpeciesSettings(row, patch) {
    Object.assign(row, patch);
    speciesRows = speciesRows.map((item) => item.id === row.id ? { ...item, ...patch } : item);
    await window.centralisSupabase.from("god_species").update(patch).eq("id", row.id).eq("user_id", currentUser.id);
    renderInspector();
  }

  function createFallbackEvolution(parent, options = {}) {
    if (options.branchOnly) {
      const stepYears = [2000000];
      return {
        total_steps: 1,
        step_years: stepYears,
        total_years: stepYears[0],
        summary: "A fallback evolution created a new side branch from an already-diverging species.",
        environment_shift: { note: "Local fallback used because AI evolution was unavailable." },
        species: [
          {
            temp_id: "branch-1",
            parent_temp_id: null,
            branch_group: `branch_${Date.now()}`,
            name: "Mireglint",
            status: "specialized",
            can_evolve: true,
            step_index: 1,
            years_since_parent: stepYears[0],
            newly_evolved_traits: ["new feeding rhythm", "altered surface texture"],
            overview: "A direct side branch that explores a different ecological tactic from the selected parent.",
          },
        ].map((item, index) => ({
          scientific_name: "",
          classification: parent.classification,
          category: parent.category,
          depth_index: item.step_index,
          sort_order: index,
          habitat: parent.habitat,
          ecology: parent.ecology || {},
          reproduction: parent.reproduction || {},
          population_condition: { note: item.overview },
          complete_traits: parent.complete_traits || {},
          inherited_traits: Array.isArray(parent.inherited_traits) ? parent.inherited_traits : [],
          lost_traits: [],
          potential_trait_hints: ["niche specialization", "new feeding adaptation", "environmental tolerance"],
          pressures: Array.isArray(parent.pressures) ? parent.pressures : [],
          visual_genome: parent.visual_genome || {},
          image_prompt: parent.image_prompt || "",
          years_since_parent: item.years_since_parent || 0,
          elapsed_years: Number(parent.elapsed_years || 0) + stepYears[0],
          extinction_cause: "",
          evolution_reason: item.overview,
          ...item,
        })),
      };
    }
    const totalSteps = 3;
    const stepYears = [2000000, 3000000, 2000000];
    return {
      total_steps: totalSteps,
      step_years: stepYears,
      total_years: stepYears.reduce((sum, value) => sum + value, 0),
      summary: "A fallback evolution produced a synchronized branch with conservative biological continuity over several million years.",
      environment_shift: { note: "Local fallback used because AI evolution was unavailable." },
      species: [
        {
          temp_id: "stage-1",
          parent_temp_id: null,
          branch_group: "main",
          name: "Shallows Drifter",
          status: "stable",
          can_evolve: true,
          step_index: 1,
          years_since_parent: stepYears[0],
          newly_evolved_traits: ["improved directional movement", "stronger outer membrane"],
          overview: "A direct descendant with improved movement and modest protective tissue.",
        },
        {
          temp_id: "stage-2a",
          parent_temp_id: "stage-1",
          branch_group: "reef",
          name: "Reefveil Grazer",
          status: "specialized",
          can_evolve: true,
          step_index: 2,
          years_since_parent: stepYears[1],
          newly_evolved_traits: ["shelter-seeking behavior", "reinforced leading edge"],
          overview: "A sheltered branch adapting toward obstacle-rich habitats.",
        },
        {
          temp_id: "stage-2b",
          parent_temp_id: "stage-1",
          branch_group: "open_water",
          name: "Glassfin Wanderer",
          status: "vulnerable",
          can_evolve: true,
          step_index: 2,
          years_since_parent: stepYears[1],
          newly_evolved_traits: ["larger steering surface", "improved light sensing"],
          overview: "A parallel branch moving into more exposed habitat.",
        },
        {
          temp_id: "stage-3a",
          parent_temp_id: "stage-2a",
          branch_group: "reef",
          name: "Siltmantle Lurker",
          status: "stable",
          can_evolve: true,
          step_index: 3,
          years_since_parent: stepYears[2],
          newly_evolved_traits: ["camouflaging tissue", "slower metabolism"],
          overview: "A synchronized continuation of the reef branch.",
        },
        {
          temp_id: "stage-3b",
          parent_temp_id: "stage-2b",
          branch_group: "open_water",
          name: "Brightwater Glider",
          status: "unstable",
          can_evolve: true,
          step_index: 3,
          years_since_parent: stepYears[2],
          newly_evolved_traits: ["fast burst movement", "expanded sensory patches"],
          overview: "A synchronized continuation of the open-water branch with higher energy costs.",
        },
      ].map((item, index) => ({
        scientific_name: "",
        classification: parent.classification,
        category: parent.category,
        depth_index: item.step_index,
        sort_order: index,
        habitat: parent.habitat,
        ecology: parent.ecology || {},
        reproduction: parent.reproduction || {},
        population_condition: { note: item.overview },
        complete_traits: parent.complete_traits || {},
        inherited_traits: Array.isArray(parent.inherited_traits) ? parent.inherited_traits : [],
        lost_traits: [],
        potential_trait_hints: ["greater specialization", "new sensory adaptation", "environmental tolerance"],
        pressures: Array.isArray(parent.pressures) ? parent.pressures : [],
        visual_genome: parent.visual_genome || {},
        image_prompt: parent.image_prompt || "",
        years_since_parent: item.years_since_parent || 0,
        elapsed_years: Number(parent.elapsed_years || 0) + stepYears.slice(0, item.step_index).reduce((sum, value) => sum + value, 0),
        extinction_cause: "",
        evolution_reason: item.overview,
        ...item,
      })),
    };
  }

  async function evolveSpecies(parent) {
    if (parent.status === "extinct" || parent.can_evolve === false) return;
    if (evolvingSpeciesIds.has(parent.id)) return;
    evolvingSpeciesIds.add(parent.id);
    renderInspector();
    setStatus(`Evolving ${parent.name}...`);
    let evolutionJobId = "";
    let descendantsSaved = false;
    try {
      const branchOnly = speciesRows.some((row) => row.parent_species_id === parent.id);
      const body = {
        evolutionId: evolution.id,
        evolutionName: evolution.name,
        worldSummary: evolution.world_summary,
        parentSpecies: parent,
        branchOnly,
        existingSpecies: speciesRows.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          step_index: row.step_index,
          elapsed_years: Number(row.elapsed_years || 0),
        })),
        novelty: parent.novelty,
        environmentalPressures: Array.isArray(parent.pressures) ? parent.pressures : [],
        adaptationBias: parent.adaptation_bias || "",
        customEvolutionTraits: customTraitsFor(parent),
        customEvolutionTrait: customTraitsFor(parent)[0] || "",
      };
      let generated;
      let savedRowsFromFunction = [];
      try {
        const { data, error } = await window.centralisSupabase.functions.invoke("generate-god-evolution", { body });
        if (error) throw error;
        evolutionJobId = data?.jobId || "";
        savedRowsFromFunction = Array.isArray(data?.speciesRows) ? data.speciesRows : [];
        generated = data?.evolution;
      } catch (error) {
        console.warn("Using fallback God evolution:", error);
        generated = createFallbackEvolution(parent, { branchOnly });
      }
      if (!generated?.species?.length) throw new Error("No descendants were generated.");
      if (savedRowsFromFunction.length) {
        descendantsSaved = true;
        await refreshSpeciesRowsFromDb();
        await persistLayout({ fit: false });
        renderInspector();
        setStatus(`Evolution complete. Added ${savedRowsFromFunction.length} descendant${savedRowsFromFunction.length === 1 ? "" : "s"}. Layout updated.`, "success");
        savedRowsFromFunction.forEach((row) => {
          if (row.status !== "extinct") void generateSpeciesImage(row, { highResolution: false, force: false });
        });
        return;
      }

      const eventId = createId();
      const totalSteps = Number(generated.total_steps || 3);
      const stepYears = normalizeStepYears(generated.step_years, totalSteps);
      const totalYears = stepYears.reduce((sum, value) => sum + value, 0);
      const { error: eventError } = await window.centralisSupabase.from("god_evolution_events").insert({
        id: eventId,
        evolution_id: evolution.id,
        user_id: currentUser.id,
        parent_species_id: parent.id,
        total_steps: totalSteps,
        step_years: stepYears,
        total_years: totalYears,
        novelty: normalizeNovelty(parent.novelty),
        environmental_pressures: Array.isArray(parent.pressures) ? parent.pressures : [],
        adaptation_bias: parent.adaptation_bias || null,
        custom_evolution_traits: customTraitsFor(parent),
        custom_evolution_trait: customTraitsFor(parent)[0] || null,
        summary: generated.summary || null,
        environment_shift: generated.environment_shift || {},
        generated_payload: generated,
      });
      if (eventError) throw eventError;

      const idByTemp = new Map();
      const baseDepth = Number(parent.depth_index || parent.step_index || 0);
      const baseElapsedYears = Number(parent.elapsed_years || 0);
      const rows = generated.species.map((item, index) => {
        const id = createId();
        idByTemp.set(item.temp_id, id);
        const relativeStep = Math.max(1, Number(item.step_index || index + 1));
        const elapsedYears = baseElapsedYears + stepYears.slice(0, relativeStep).reduce((sum, value) => sum + value, 0);
        const yearsSinceParent = normalizeStepYears([item.years_since_parent || stepYears[Math.max(0, relativeStep - 1)]], 1)[0];
        return {
          id,
          evolution_id: evolution.id,
          user_id: currentUser.id,
          parent_species_id: item.parent_temp_id ? null : parent.id,
          origin_event_id: eventId,
          branch_group: item.branch_group || "main",
          name: item.name || `Descendant ${index + 1}`,
          scientific_name: item.scientific_name || null,
          classification: item.classification || parent.classification || null,
          category: item.category || parent.category || null,
          status: item.status || "stable",
          can_evolve: item.status !== "extinct" && item.can_evolve !== false,
          step_index: baseDepth + relativeStep,
          depth_index: baseDepth + relativeStep,
          sort_order: speciesRows.length + index,
          position_x: Number(parent.position_x || 80) + relativeStep * 420,
          position_y: Number(parent.position_y || 80) + (index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? 460 : -460)),
          years_since_parent: yearsSinceParent,
          elapsed_years: elapsedYears,
          overview: item.overview || "",
          habitat: item.habitat || parent.habitat || "",
          ecology: item.ecology || parent.ecology || {},
          reproduction: item.reproduction || parent.reproduction || {},
          population_condition: item.population_condition || {},
          newly_evolved_traits: item.newly_evolved_traits || [],
          complete_traits: item.complete_traits || parent.complete_traits || {},
          inherited_traits: item.inherited_traits || [],
          lost_traits: item.lost_traits || [],
          potential_trait_hints: item.potential_trait_hints || [],
          pressures: [],
          adaptation_bias: null,
          custom_evolution_traits: [],
          custom_evolution_trait: null,
          novelty: normalizeNovelty(parent.novelty),
          visual_genome: item.visual_genome || parent.visual_genome || {},
          image_prompt: item.image_prompt || parent.image_prompt || "",
          extinction_cause: item.extinction_cause || null,
          evolution_reason: item.evolution_reason || generated.summary || "",
        };
      });
      rows.forEach((row, index) => {
        const source = generated.species[index];
        if (source.parent_temp_id && idByTemp.has(source.parent_temp_id)) {
          row.parent_species_id = idByTemp.get(source.parent_temp_id);
        }
      });

      const { data: inserted, error: insertError } = await window.centralisSupabase
        .from("god_species")
        .insert(rows)
        .select("*");
      if (insertError) throw insertError;
      let savedRows = inserted || [];
      if (savedRows.length !== rows.length) {
        const { data: verifiedRows, error: verifyError } = await window.centralisSupabase
          .from("god_species")
          .select("*")
          .eq("origin_event_id", eventId)
          .eq("user_id", currentUser.id)
          .eq("deleted", false)
          .order("depth_index", { ascending: true })
          .order("sort_order", { ascending: true });
        if (verifyError) throw verifyError;
        savedRows = verifiedRows || [];
      }
      if (!savedRows.length) {
        throw new Error("Evolution generated, but no descendant species were saved.");
      }
      descendantsSaved = true;
      await refreshSpeciesRowsFromDb();
      await persistLayout({ fit: false });
      renderInspector();
      setStatus(`Evolution complete. Added ${savedRows.length} descendant${savedRows.length === 1 ? "" : "s"}. Layout updated.`, "success");
      savedRows.forEach((row) => {
        if (row.status !== "extinct") void generateSpeciesImage(row, { highResolution: false, force: false });
      });
    } catch (error) {
      console.error(error);
      if (evolutionJobId && !descendantsSaved) {
        await window.centralisSupabase.functions.invoke("fail-generation-job", {
          body: {
            jobId: evolutionJobId,
            module: "god_engine",
            errorMessage: error.message || "Evolution generated but could not be saved to the canvas.",
            errorDetails: {
              name: error.name || "Error",
              message: error.message || String(error),
              context: "save_evolution_descendants",
              parentSpeciesId: parent.id,
              parentSpeciesName: parent.name,
            },
          },
        }).catch((cleanupError) => console.warn("Could not mark failed evolution job:", cleanupError));
      }
      setStatus(`Could not evolve species: ${error.message || error}`, "error");
    } finally {
      evolvingSpeciesIds.delete(parent.id);
      renderInspector();
      void refreshEvolutionStatus({ quiet: true });
    }
  }

  async function generateSpeciesImage(row, options = {}) {
    if (!options.force && imageForSpecies(row.id)) return;
    if (!options.suppressStatus) {
      setStatus(options.highResolution ? `Generating high-resolution image for ${row.name}...` : `Generating image for ${row.name}...`);
    }
    const sourceType = options.highResolution ? "god_species_high_image" : "god_species_image";
    const parentSpecies = row.parent_species_id ? speciesRows.find((item) => item.id === row.parent_species_id) || null : null;
    try {
      const { data, error } = await window.centralisSupabase.functions.invoke("generate-god-species-image", {
        body: {
          speciesId: row.id,
          name: row.name,
          scientificName: row.scientific_name || "",
          classification: row.classification || "",
          category: row.category || "",
          habitat: row.habitat,
          overview: row.overview,
          newlyEvolvedTraits: row.newly_evolved_traits || [],
          completeTraits: row.complete_traits || {},
          inheritedTraits: row.inherited_traits || [],
          lostTraits: row.lost_traits || [],
          ecology: row.ecology || {},
          populationCondition: row.population_condition || {},
          visualGenome: row.visual_genome || {},
          parentSpecies: parentSpecies ? {
            id: parentSpecies.id,
            name: parentSpecies.name,
            scientificName: parentSpecies.scientific_name || "",
            habitat: parentSpecies.habitat || "",
            overview: parentSpecies.overview || "",
            completeTraits: parentSpecies.complete_traits || {},
            newlyEvolvedTraits: parentSpecies.newly_evolved_traits || [],
            visualGenome: parentSpecies.visual_genome || {},
            imagePrompt: parentSpecies.image_prompt || "",
          } : null,
          promptOverride: row.image_prompt || "",
          specialInstructions: options.highResolution ? options.specialInstructions || "" : "",
          highResolution: Boolean(options.highResolution),
          highResolutionSize: options.highResolutionSize || HIGH_RESOLUTION_OPTIONS[0][0],
          makePrimary: options.makePrimary === true,
        },
      });
      if (error) throw error;
      if (data?.image) mergeImageRow(data.image);
      refreshCanvas();
      renderInspector();
      if (!options.suppressStatus) {
        setStatus(options.highResolution ? "High-resolution image generated and set as primary." : "Species thumbnail generated and set as primary.", "success");
      }
      return true;
    } catch (error) {
      console.warn("Could not generate species image:", error);
      await window.centralisSupabase.functions.invoke("fail-generation-job", {
        body: {
          module: "god_engine",
          sourceId: row.id,
          sourceType,
          errorMessage: error.message || "Image generation failed before completion.",
          errorDetails: {
            name: error.name || "Error",
            message: error.message || String(error),
            context: options.highResolution ? "high_resolution_species_image" : "standard_species_image",
            highResolutionSize: options.highResolutionSize || null,
          },
        },
      }).catch((cleanupError) => console.warn("Could not mark failed generation job:", cleanupError));
      if (!options.suppressStatus) {
        setStatus(`Image generation failed: ${error.message || error}`, "error", { autoClear: 8000 });
      }
      return false;
    }
  }

  async function ensureMissingStandardImages() {
    for (const row of speciesRows) {
      if (row.status !== "extinct" && !imageForSpecies(row.id)) {
        await generateSpeciesImage(row, { highResolution: false, force: false });
      }
    }
  }

  async function cleanUpMissingImages() {
    if (cleaningImages) return;
    if (!window.centralisSupabase || !currentUser?.id) {
      setStatus("You must be signed in before cleaning up images.", "error");
      return;
    }
    cleaningImages = true;
    if (cleanImagesButton) cleanImagesButton.disabled = true;
    setActionsMenuOpen(false);
    setStatus("Checking this evolution for missing thumbnails...");
    try {
      await loadImages();
      const missingRows = speciesRows.filter((row) => !imageForSpecies(row.id));
      if (!missingRows.length) {
        setStatus("Every creature in this evolution already has an image.", "success");
        return;
      }
      setStatus(`Starting ${missingRows.length} missing thumbnail job${missingRows.length === 1 ? "" : "s"} at once...`);
      const results = await Promise.allSettled(missingRows.map((row) => {
        return generateSpeciesImage(row, {
          highResolution: false,
          force: true,
          makePrimary: true,
          suppressStatus: true,
        });
      }));
      await loadImages();
      refreshCanvas();
      renderInspector();
      const failedCount = results.filter((result) => result.status === "rejected" || result.value === false).length;
      const successCount = missingRows.length - failedCount;
      if (failedCount) {
        setStatus(`Clean up started ${successCount} thumbnail${successCount === 1 ? "" : "s"}; ${failedCount} failed.`, "error");
      } else {
        setStatus(`Clean up started ${missingRows.length} thumbnail job${missingRows.length === 1 ? "" : "s"}.`, "success");
      }
    } catch (error) {
      console.error(error);
      setStatus(`Could not clean up images: ${error.message || error}`, "error");
    } finally {
      cleaningImages = false;
      if (cleanImagesButton) cleanImagesButton.disabled = false;
    }
  }

  function openImageViewer(row) {
    const images = normalizeViewerImages(row);
    if (!images.length || typeof window.openCentralisImageViewer !== "function") return;
    window.openCentralisImageViewer({
      title: row.name || "Species Image",
      kicker: "God Engine",
      images,
      activeImageId: images[0].id,
      capabilities: {
        canNavigate: true,
        canShowThumbnails: true,
        canDownload: true,
        canOpen: true,
        canDelete: true,
        canSetPrimary: true,
        canUpload: true,
        uploadMode: "add",
        uploadLabel: "Upload Image",
      },
      actions: {
        setPrimary: async (image) => {
          const { data, error } = await window.centralisSupabase.functions.invoke("set-primary-image", {
            body: { imageId: image.id },
          });
          if (error) throw error;
          if (data?.image) mergeImageRow({ ...data.image, image_url: image.src, stored_image_url: data.image.image_url });
          refreshCanvas();
          renderInspector();
          return { images: normalizeViewerImages(row), activeImageId: image.id };
        },
        upload: async (file) => {
          const formData = new FormData();
          formData.append("objectId", row.id);
          formData.append("storageModule", "god-engine");
          formData.append("objectName", row.name || "God Engine species");
          formData.append("objectKind", "species");
          formData.append("file", file);
          const { data, error } = await window.centralisSupabase.functions.invoke("upload-object-image", {
            body: formData,
          });
          if (error) throw error;
          if (data?.image) mergeImageRow(data.image);
          refreshCanvas();
          renderInspector();
          return { images: normalizeViewerImages(row), activeImageId: data?.image?.id };
        },
        delete: async (image, index) => {
          if (!image?.id || !window.confirm("Delete this image?")) return false;
          const previousImages = normalizeViewerImages(row);
          const { error } = await window.centralisSupabase.functions.invoke("delete-object-image", {
            body: { imageId: image.id },
          });
          if (error) throw error;
          removeImageRow(image.id, row.id);
          refreshCanvas();
          renderInspector();
          const nextImages = normalizeViewerImages(row);
          if (!nextImages.length) return { close: true };
          const nextIndex = Math.min(index, Math.max(0, previousImages.length - 2));
          return {
            images: nextImages,
            activeImageId: nextImages[nextIndex]?.id || nextImages[0]?.id,
          };
        },
      },
      details: (image) => ({
        imageInfo: {
          title: "Image",
          rows: [
            ["Species", row.name || "Unnamed species"],
            ["Provider", image.provider || "Unknown"],
          ],
        },
        promptInfo: {
          title: "Prompt",
          body: image.prompt || "",
        },
      }),
    });
  }

  evolutionStatusOpenButton?.addEventListener("click", () => {
    void openEvolutionStatus();
  });
  godSettingsOpenButton?.addEventListener("click", openGodSettingsDialog);
  godSettingsCloseButtons.forEach((button) => {
    button.addEventListener("click", closeGodSettingsDialog);
  });
  godSettingsResetButton?.addEventListener("click", () => {
    populateGodSettingsForm(DEFAULT_GOD_FORMAT);
    void saveGodFormat(DEFAULT_GOD_FORMAT);
  });
  godSettingsForm?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-god-format-value]");
    if (!button) return;
    const colorGroup = button.closest("[data-god-format-colors]");
    const segmentGroup = button.closest("[data-god-format-segment]");
    if (colorGroup) {
      setGodColorValue(button.dataset.godFormatValue);
    } else if (segmentGroup) {
      setGodSegmentValue(segmentGroup.dataset.godFormatSegment, button.dataset.godFormatValue);
    } else {
      return;
    }
    void saveGodFormat(readGodSettingsForm());
  });
  actionsToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    setActionsMenuOpen(actionsMenu?.hidden !== false);
  });
  cleanImagesButton?.addEventListener("click", () => {
    void cleanUpMissingImages();
  });
  document.addEventListener("pointerdown", closeSpeciesMenuOnOutsideClick);
  document.addEventListener("pointerdown", closeActionsMenuOnOutsideClick);

  if (currentUser?.id) {
    loadData();
  } else {
    window.addEventListener("centralis:current-user-changed", (event) => {
      currentUser = event.detail?.user || window.centralisCurrentAppUser;
      loadData();
    }, { once: true });
  }
})();
