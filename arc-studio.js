(function initArcStudio() {
  const TABLES = {
    projects: "arc_projects",
    units: "arc_units",
    unitElements: "arc_unit_elements",
    threads: "arc_threads",
    threadUnits: "arc_thread_units",
    characterArcs: "arc_character_arcs",
    arcStages: "arc_arc_stages",
    setups: "arc_setups_payoffs",
    unitLinks: "arc_unit_links",
    elementStates: "arc_element_states",
    diagnosticReports: "arc_diagnostic_reports",
    elements: "elements",
    universes: "universes",
  };

  const page = document.body?.dataset.page || "";
  if (!["arc-studio", "arc-workspace"].includes(page)) return;

  const ARC_TUTORIAL_PAGES = [
    {
      key: "tripod",
      title: "The Story Tripod",
      copy: "Universe Builder maps the world and its connections. Chronicle stores the deep lore. Arc Studio turns that material into story movement: scenes, arcs, threads, setups, payoffs, and progression.",
    },
    {
      key: "outline",
      title: "Build From The Outline",
      copy: "Organize parts, acts, sequences, chapters, scenes, beats, or custom units. The outline is the spine of the project, so you can shape the story before worrying about prose.",
    },
    {
      key: "scenes",
      title: "Scenes Do The Work",
      copy: "Use the inspector to track each scene's purpose, conflict, outcome, point of view, cast, location, tone, notes, and ordered beats.",
    },
    {
      key: "threads",
      title: "Threads And Arcs",
      copy: "Plot threads and character arcs show what develops, pauses, turns, or resolves across the story. Attach scenes to them so nothing important goes quiet by accident.",
    },
    {
      key: "intelligence",
      title: "Story Intelligence",
      copy: "Timeline, Arc Map, causality, continuity, setups, payoffs, and diagnostics help you see how the story moves and where it needs attention.",
    },
  ];

  const state = {
    user: window.centralisCurrentAppUser || null,
    projects: [],
    universes: [],
    project: null,
    units: [],
    unitElements: [],
    threads: [],
    threadUnits: [],
    characterArcs: [],
    arcStages: [],
    setups: [],
    unitLinks: [],
    elementStates: [],
    diagnosticReports: [],
    elements: [],
    selectedUnitId: "",
    inspectorTab: "overview",
    view: "outline",
    search: "",
    statusFilter: "",
    tutorialIndex: 0,
    tutorialSessionDismissed: false,
    stagedManuscript: null,
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("centralis:current-user-changed", async (event) => {
    state.user = event.detail?.user || window.centralisCurrentAppUser;
    await bootstrap();
  });

  async function init() {
    bindDom();
    bindEvents();
    await bootstrap();
  }

  function bindDom() {
    if (page === "arc-studio") {
      dom.projectList = document.querySelector("[data-arc-project-list]");
      dom.projectCount = document.querySelector("[data-arc-count]");
      dom.search = document.querySelector("[data-arc-search]");
      dom.status = document.querySelector("[data-arc-status]");
      dom.createModal = document.getElementById("arc-create-modal");
      dom.createForm = document.querySelector("[data-arc-create-form]");
      dom.createStatus = document.querySelector("[data-arc-create-status]");
      dom.createSubmit = document.querySelector("[data-arc-create-submit]");
      dom.universeSelect = document.querySelector("[data-arc-universe-select]");
      dom.manuscriptInput = document.querySelector("[data-arc-manuscript-file]");
      dom.stagedManuscript = document.querySelector("[data-arc-staged-manuscript]");
      return;
    }

    dom.projectTitle = document.querySelector("[data-arc-project-title]");
    dom.headerProjectName = document.querySelector("[data-arc-header-project-name]");
    dom.workspaceStatus = document.querySelector("[data-arc-workspace-status]");
    dom.outlineCount = document.querySelector("[data-arc-outline-count]");
    dom.outlineList = document.querySelector("[data-arc-outline-list]");
    dom.storySurface = document.querySelector("[data-arc-story-surface]");
    dom.unitSearch = document.querySelector("[data-arc-unit-search]");
    dom.statusFilter = document.querySelector("[data-arc-status-filter]");
    dom.viewTabs = Array.from(document.querySelectorAll("[data-arc-view]"));
    dom.inspectorTabs = Array.from(document.querySelectorAll("[data-arc-inspector-tab]"));
    dom.inspectorType = document.querySelector("[data-arc-inspector-type]");
    dom.inspectorTitle = document.querySelector("[data-arc-inspector-title]");
    dom.inspectorContent = document.querySelector("[data-arc-inspector-content]");
    dom.unitModal = document.getElementById("arc-unit-modal");
    dom.unitForm = document.querySelector("[data-arc-unit-form]");
    dom.unitTitle = document.querySelector("[data-arc-unit-title]");
    dom.unitStatus = document.querySelector("[data-arc-unit-status]");
    dom.parentSelect = document.querySelector("[data-arc-parent-select]");
    dom.threadModal = document.getElementById("arc-thread-modal");
    dom.threadForm = document.querySelector("[data-arc-thread-form]");
    dom.setupModal = document.getElementById("arc-setup-modal");
    dom.setupForm = document.querySelector("[data-arc-setup-form]");
    dom.setupUnitSelect = document.querySelector("[data-arc-setup-unit-select]");
    dom.payoffUnitSelect = document.querySelector("[data-arc-payoff-unit-select]");
    dom.tutorialModal = document.getElementById("arc-tutorial-modal");
    dom.tutorialTitle = document.querySelector("[data-arc-tutorial-title]");
    dom.tutorialCopy = document.querySelector("[data-arc-tutorial-copy]");
    dom.tutorialArt = document.querySelector("[data-arc-tutorial-art]");
    dom.tutorialDots = document.querySelector("[data-arc-tutorial-dots]");
    dom.tutorialDismiss = document.querySelector("[data-arc-tutorial-dismiss]");
    dom.tutorialPrev = document.querySelector("[data-arc-tutorial-prev]");
    dom.tutorialNext = document.querySelector("[data-arc-tutorial-next]");
  }

  function bindEvents() {
    if (page === "arc-studio") {
      document.querySelector("[data-arc-open-create]")?.addEventListener("click", openCreateProject);
      document.querySelector("[data-arc-create-close]")?.addEventListener("click", closeCreateProject);
      document.querySelector("[data-arc-create-cancel]")?.addEventListener("click", closeCreateProject);
      dom.createForm?.addEventListener("submit", handleCreateProject);
      dom.manuscriptInput?.addEventListener("change", handleManuscriptSelected);
      dom.stagedManuscript?.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("[data-arc-remove-manuscript]")) {
          clearStagedManuscript();
          setStatus(dom.createStatus, "Manuscript removed.");
        }
      });
      dom.search?.addEventListener("input", () => {
        state.search = dom.search.value.trim().toLowerCase();
        renderLanding();
      });
      return;
    }

    document.querySelectorAll("[data-arc-open-unit]").forEach((button) => button.addEventListener("click", () => openUnitModal()));
    document.querySelector("[data-arc-unit-close]")?.addEventListener("click", closeUnitModal);
    document.querySelector("[data-arc-unit-cancel]")?.addEventListener("click", closeUnitModal);
    dom.unitForm?.addEventListener("submit", handleSaveUnitModal);

    document.querySelector("[data-arc-open-thread]")?.addEventListener("click", openThreadModal);
    document.querySelector("[data-arc-thread-close]")?.addEventListener("click", closeThreadModal);
    document.querySelector("[data-arc-thread-cancel]")?.addEventListener("click", closeThreadModal);
    dom.threadForm?.addEventListener("submit", handleSaveThread);

    document.querySelector("[data-arc-open-setup]")?.addEventListener("click", openSetupModal);
    document.querySelector("[data-arc-setup-close]")?.addEventListener("click", closeSetupModal);
    document.querySelector("[data-arc-setup-cancel]")?.addEventListener("click", closeSetupModal);
    dom.setupForm?.addEventListener("submit", handleSaveSetup);
    document.querySelector("[data-arc-analyze-story]")?.addEventListener("click", analyzeStory);
    document.querySelector("[data-arc-tutorial-close]")?.addEventListener("click", closeTutorial);
    dom.tutorialPrev?.addEventListener("click", () => moveTutorial(-1));
    dom.tutorialNext?.addEventListener("click", () => moveTutorial(1));
    dom.tutorialDots?.addEventListener("click", (event) => {
      const dot = event.target.closest("[data-arc-tutorial-dot]");
      if (!dot) return;
      state.tutorialIndex = Number(dot.dataset.arcTutorialDot) || 0;
      renderTutorial();
    });
    document.addEventListener("keydown", handleTutorialKeydown);

    dom.outlineList?.addEventListener("click", handleWorkspaceClick);
    dom.storySurface?.addEventListener("click", handleWorkspaceClick);
    dom.inspectorContent?.addEventListener("click", handleWorkspaceClick);
    dom.inspectorContent?.addEventListener("submit", handleInspectorSubmit);
    dom.inspectorContent?.addEventListener("change", handleInspectorChange);
    dom.unitSearch?.addEventListener("input", () => {
      state.search = dom.unitSearch.value.trim().toLowerCase();
      renderWorkspace();
    });
    dom.statusFilter?.addEventListener("change", () => {
      state.statusFilter = dom.statusFilter.value;
      renderWorkspace();
    });
    dom.viewTabs.forEach((button) => button.addEventListener("click", () => {
      state.view = button.dataset.arcView || "outline";
      renderWorkspace();
    }));
    dom.inspectorTabs.forEach((button) => button.addEventListener("click", () => {
      state.inspectorTab = button.dataset.arcInspectorTab || "overview";
      renderInspector();
    }));
  }

  async function bootstrap() {
    try {
      await waitForAuth();
      state.user = state.user || await window.centralisGetCurrentAppUser();
      if (!state.user?.id) return;
      if (page === "arc-studio") {
        await loadLanding();
        renderLanding();
      } else {
        await loadWorkspace();
        renderWorkspace();
        await maybeShowTutorial();
      }
    } catch (error) {
      console.error("Could not initialize Arc Studio.", error);
      setStatus(page === "arc-studio" ? dom.status : dom.workspaceStatus, `Could not load Arc Studio: ${error.message}`, "error");
    }
  }

  async function waitForAuth() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (window.centralisSupabase && window.centralisGetCurrentAppUser) return;
      await sleep(50);
    }
    throw new Error("Centralis auth did not initialize.");
  }

  async function loadLanding() {
    setStatus(dom.status, "Loading story projects...");
    const [projectResponse, universeResponse] = await Promise.all([
      window.centralisSupabase
        .from(TABLES.projects)
        .select("*")
        .eq("user_id", state.user.id)
        .eq("deleted", false)
        .order("updated_at", { ascending: false }),
      window.centralisSupabase
        .from(TABLES.universes)
        .select("id,name")
        .eq("user_id", state.user.id)
        .order("name", { ascending: true }),
    ]);
    if (projectResponse.error) throw projectResponse.error;
    if (universeResponse.error) throw universeResponse.error;
    state.projects = projectResponse.data || [];
    state.universes = universeResponse.data || [];
    populateUniverseSelect();
    setStatus(dom.status, "");
  }

  async function loadWorkspace() {
    const projectId = new URLSearchParams(window.location.search).get("project_id") || sessionStorage.getItem("centralis-current-arc-project-id") || "";
    if (!projectId) {
      setStatus(dom.workspaceStatus, "No Arc Studio project selected.", "error");
      return;
    }
    sessionStorage.setItem("centralis-current-arc-project-id", projectId);
    setStatus(dom.workspaceStatus, "Loading Arc Studio workspace...");

    const projectResponse = await window.centralisSupabase
      .from(TABLES.projects)
      .select("*")
      .eq("id", projectId)
      .eq("user_id", state.user.id)
      .eq("deleted", false)
      .maybeSingle();
    if (projectResponse.error) throw projectResponse.error;
    state.project = projectResponse.data;
    if (!state.project) {
      setStatus(dom.workspaceStatus, "Project not found.", "error");
      return;
    }

    const [units, unitElements, threads, threadUnits, characterArcs, arcStages, setups, unitLinks, elementStates, diagnosticReports, elements] = await Promise.all([
      selectProjectRows(TABLES.units, "sort_order", true),
      selectProjectRows(TABLES.unitElements, "created_at", true),
      selectProjectRows(TABLES.threads, "sort_order", true),
      selectProjectRows(TABLES.threadUnits, "sort_order", true),
      selectProjectRows(TABLES.characterArcs, "created_at", true),
      selectProjectRows(TABLES.arcStages, "sort_order", true),
      selectProjectRows(TABLES.setups, "created_at", true),
      selectProjectRows(TABLES.unitLinks, "created_at", true),
      selectProjectRows(TABLES.elementStates, "created_at", true),
      selectProjectRows(TABLES.diagnosticReports, "created_at", false),
      loadElements(state.project.universe_id),
    ]);
    state.units = units.filter((row) => row.deleted !== true);
    state.unitElements = unitElements;
    state.threads = threads.filter((row) => row.deleted !== true);
    state.threadUnits = threadUnits;
    state.characterArcs = characterArcs.filter((row) => row.deleted !== true);
    state.arcStages = arcStages;
    state.setups = setups;
    state.unitLinks = unitLinks;
    state.elementStates = elementStates;
    state.diagnosticReports = diagnosticReports;
    state.elements = elements;
    state.selectedUnitId = state.selectedUnitId || state.units.find((unit) => unit.unit_type === "scene")?.id || state.units[0]?.id || "";
    setStatus(dom.workspaceStatus, "");
  }

  async function selectProjectRows(table, orderColumn, ascending = true) {
    const query = window.centralisSupabase
      .from(table)
      .select("*")
      .eq("project_id", state.project.id)
      .eq("user_id", state.user.id);
    if (["arc_units", "arc_threads", "arc_character_arcs"].includes(table)) {
      query.eq("deleted", false);
    }
    const { data, error } = await query.order(orderColumn, { ascending });
    if (error) throw error;
    return data || [];
  }

  async function loadElements(universeId) {
    let query = window.centralisSupabase
      .from(TABLES.elements)
      .select("id,name,description,element_type_id,universe_id,updated_at,created_at")
      .eq("user_id", state.user.id)
      .eq("deleted", false)
      .order("name", { ascending: true });
    if (universeId) query = query.eq("universe_id", universeId);
    const { data, error } = await query;
    if (error) {
      console.warn("Could not load Chronicle elements for Arc Studio:", error);
      return [];
    }
    return data || [];
  }

  async function maybeShowTutorial() {
    if (page !== "arc-workspace" || !dom.tutorialModal || state.tutorialSessionDismissed) return;
    try {
      const settings = await window.centralisGetUserSettings?.();
      if (settings?.arc_studio_tutorial_dismissed === true) return;
      openTutorial();
    } catch (error) {
      console.warn("Could not load Arc Studio tutorial setting.", error);
    }
  }

  function openTutorial() {
    if (!dom.tutorialModal) return;
    state.tutorialIndex = 0;
    if (dom.tutorialDismiss) dom.tutorialDismiss.checked = true;
    renderTutorial();
    dom.tutorialModal.hidden = false;
    document.querySelector("[data-arc-tutorial-close]")?.focus();
  }

  async function closeTutorial() {
    if (!dom.tutorialModal || dom.tutorialModal.hidden) return;
    const shouldDismiss = dom.tutorialDismiss?.checked !== false;
    dom.tutorialModal.hidden = true;
    state.tutorialSessionDismissed = true;
    if (!shouldDismiss) return;
    try {
      await window.centralisUpdateUserSettings?.({ arc_studio_tutorial_dismissed: true });
    } catch (error) {
      console.warn("Could not save Arc Studio tutorial setting.", error);
      setStatus(dom.workspaceStatus, "Tutorial closed, but the preference could not be saved.", "error");
    }
  }

  function moveTutorial(direction) {
    if (!dom.tutorialModal || dom.tutorialModal.hidden) return;
    const nextIndex = state.tutorialIndex + direction;
    if (nextIndex < 0) return;
    if (nextIndex >= ARC_TUTORIAL_PAGES.length) {
      closeTutorial();
      return;
    }
    state.tutorialIndex = nextIndex;
    renderTutorial();
  }

  function renderTutorial() {
    const pageData = ARC_TUTORIAL_PAGES[state.tutorialIndex] || ARC_TUTORIAL_PAGES[0];
    if (dom.tutorialTitle) dom.tutorialTitle.textContent = pageData.title;
    if (dom.tutorialCopy) dom.tutorialCopy.textContent = pageData.copy;
    if (dom.tutorialArt) dom.tutorialArt.dataset.arcTutorialArt = pageData.key;
    if (dom.tutorialPrev) dom.tutorialPrev.disabled = state.tutorialIndex === 0;
    if (dom.tutorialNext) {
      const isLast = state.tutorialIndex === ARC_TUTORIAL_PAGES.length - 1;
      dom.tutorialNext.setAttribute("aria-label", isLast ? "Finish tutorial" : "Next tutorial page");
    }
    if (dom.tutorialDots) {
      dom.tutorialDots.innerHTML = ARC_TUTORIAL_PAGES.map((item, index) => `
        <button type="button" class="${index === state.tutorialIndex ? "is-active" : ""}" data-arc-tutorial-dot="${index}" aria-label="Show ${escapeAttribute(item.title)}" aria-current="${index === state.tutorialIndex ? "step" : "false"}"></button>
      `).join("");
    }
  }

  function handleTutorialKeydown(event) {
    if (!dom.tutorialModal || dom.tutorialModal.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeTutorial();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTutorial(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTutorial(1);
    }
  }

  function renderLanding() {
    const projects = state.search
      ? state.projects.filter((project) => `${project.title} ${project.logline || ""} ${project.premise || ""}`.toLowerCase().includes(state.search))
      : state.projects;
    if (dom.projectCount) dom.projectCount.textContent = `${projects.length} ${projects.length === 1 ? "story project" : "story projects"}`;
    if (!projects.length) {
      dom.projectList.innerHTML = `<p class="empty-state">${state.search ? "No matching story projects." : "No story projects yet. Create the first one."}</p>`;
      return;
    }
    dom.projectList.innerHTML = projects.map((project) => {
      const universe = state.universes.find((item) => item.id === project.universe_id);
      return `
        <article class="arc-project-card">
          <a href="arc-workspace.html?project_id=${encodeURIComponent(project.id)}" class="arc-project-card-link">
            <div class="arc-project-card-top">
              <span><ph-git-branch weight="duotone" aria-hidden="true"></ph-git-branch></span>
              <div>
                <h2>${escapeHtml(project.title)}</h2>
                <p>${escapeHtml(project.logline || project.premise || "No logline yet.")}</p>
              </div>
            </div>
            <dl class="arc-project-meta">
              <div><dt>Status</dt><dd>${escapeHtml(normalizeLabel(project.status))}</dd></div>
              <div><dt>Format</dt><dd>${escapeHtml(normalizeLabel(project.format))}</dd></div>
              <div><dt>Universe</dt><dd>${escapeHtml(universe?.name || "Standalone")}</dd></div>
            </dl>
          </a>
        </article>
      `;
    }).join("");
  }

  function renderWorkspace() {
    if (!state.project) return;
    if (dom.projectTitle) dom.projectTitle.textContent = state.project.title;
    if (dom.headerProjectName) {
      dom.headerProjectName.textContent = state.project.title ? `/ ${state.project.title}` : "";
      dom.headerProjectName.hidden = !state.project.title;
    }
    dom.viewTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.arcView === state.view));
    renderOutline();
    renderSurface();
    renderInspector();
  }

  function renderOutline() {
    const visible = filteredUnits();
    if (dom.outlineCount) {
      const sceneCount = state.units.filter((unit) => unit.unit_type === "scene").length;
      dom.outlineCount.textContent = `${state.units.length} units, ${sceneCount} scenes`;
    }
    if (!state.units.length) {
      dom.outlineList.innerHTML = `<p class="empty-state">No story units yet. Add a chapter or scene to begin.</p>`;
      return;
    }
    const visibleIds = new Set(visible.map((unit) => unit.id));
    dom.outlineList.innerHTML = renderUnitTree("", 0, visibleIds);
  }

  function renderUnitTree(parentId, depth, visibleIds) {
    const children = state.units
      .filter((unit) => (unit.parent_unit_id || "") === parentId)
      .sort(sortUnits);
    return children.map((unit) => {
      const childHtml = unit.collapsed ? "" : renderUnitTree(unit.id, depth + 1, visibleIds);
      const hasVisibleChild = childHtml.trim().length > 0;
      if (!visibleIds.has(unit.id) && !hasVisibleChild) return "";
      return `
        <article class="arc-outline-item ${state.selectedUnitId === unit.id ? "is-selected" : ""}" style="--arc-depth: ${depth}">
          <button type="button" data-arc-select-unit="${escapeAttribute(unit.id)}">
            <span class="arc-unit-type">${escapeHtml(normalizeLabel(unit.unit_type))}</span>
            <strong>${escapeHtml(unit.title)}</strong>
            <small>${escapeHtml(normalizeLabel(unit.status))}</small>
          </button>
          <div class="arc-outline-actions">
            <button type="button" data-arc-toggle-unit="${escapeAttribute(unit.id)}" title="Collapse or expand"><ph-caret-down weight="bold" aria-hidden="true"></ph-caret-down></button>
            <button type="button" data-arc-edit-unit="${escapeAttribute(unit.id)}" title="Edit"><ph-pencil-simple weight="bold" aria-hidden="true"></ph-pencil-simple></button>
            <button type="button" data-arc-duplicate-unit="${escapeAttribute(unit.id)}" title="Duplicate"><ph-copy weight="bold" aria-hidden="true"></ph-copy></button>
            <button type="button" data-arc-move-unit="${escapeAttribute(unit.id)}" data-direction="up" title="Move up"><ph-arrow-up weight="bold" aria-hidden="true"></ph-arrow-up></button>
            <button type="button" data-arc-move-unit="${escapeAttribute(unit.id)}" data-direction="down" title="Move down"><ph-arrow-down weight="bold" aria-hidden="true"></ph-arrow-down></button>
            <button type="button" data-arc-delete-unit="${escapeAttribute(unit.id)}" title="Delete"><ph-trash weight="bold" aria-hidden="true"></ph-trash></button>
          </div>
        </article>
        ${childHtml}
      `;
    }).join("");
  }

  function renderSurface() {
    const units = filteredUnits();
    if (state.view === "diagnostics") {
      renderDiagnosticsView();
      return;
    }
    if (!units.length) {
      dom.storySurface.innerHTML = `<p class="empty-state">No matching story units.</p>`;
      return;
    }
    if (state.view === "timeline") {
      renderTimelineView(units);
      return;
    }
    if (state.view === "arc-map") {
      renderArcMapView(units);
      return;
    }
    if (state.view === "corkboard") {
      const columns = ["idea", "planned", "outlined", "drafting", "revising", "complete", "cut"];
      dom.storySurface.innerHTML = `
        <div class="arc-corkboard">
          ${columns.map((status) => `
            <section class="arc-corkboard-column">
              <h3>${escapeHtml(normalizeLabel(status))}</h3>
              ${units.filter((unit) => unit.status === status).map(renderSurfaceCard).join("") || '<p class="arc-muted">No units.</p>'}
            </section>
          `).join("")}
        </div>
      `;
      return;
    }
    dom.storySurface.innerHTML = `
      <div class="arc-outline-surface">
        ${units.sort(sortUnitsByTreePosition).map(renderSurfaceCard).join("")}
      </div>
    `;
  }

  function renderSurfaceCard(unit) {
    return `
      <article class="arc-unit-card ${state.selectedUnitId === unit.id ? "is-selected" : ""}">
        <button type="button" data-arc-select-unit="${escapeAttribute(unit.id)}">
          <span>${escapeHtml(normalizeLabel(unit.unit_type))}</span>
          <h3>${escapeHtml(unit.title)}</h3>
          <p>${escapeHtml(unit.summary || unit.purpose || "No synopsis yet.")}</p>
          <small>${escapeHtml(normalizeLabel(unit.status))}${unit.story_time ? ` - ${escapeHtml(unit.story_time)}` : ""}</small>
        </button>
      </article>
    `;
  }

  function renderTimelineView(units) {
    const scenes = units.filter(isStoryScene).sort(sortUnitsByChronology);
    const dated = scenes.filter(hasChronology);
    const undated = scenes.filter((unit) => !hasChronology(unit));
    dom.storySurface.innerHTML = `
      <div class="arc-timeline-view">
        <div class="arc-view-summary">
          <strong>${dated.length} chronological scenes</strong>
          <span>${undated.length} without chronology</span>
        </div>
        <section class="arc-timeline-list">
          ${scenes.map((unit) => `
            <article class="arc-timeline-item ${state.selectedUnitId === unit.id ? "is-selected" : ""}">
              <button type="button" data-arc-select-unit="${escapeAttribute(unit.id)}">
                <span>${escapeHtml(unit.timeline_label || unit.chronological_label || unit.story_time || "Chronology not set")}</span>
                <h3>${escapeHtml(unit.title)}</h3>
                <p>${escapeHtml(unit.summary || unit.purpose || "No synopsis yet.")}</p>
                <small>${escapeHtml(formatTimelineRange(unit))}</small>
              </button>
            </article>
          `).join("") || '<p class="empty-state">No scenes available for the timeline.</p>'}
        </section>
      </div>
    `;
  }

  function renderArcMapView(units) {
    const scenes = units.filter(isStoryScene).sort(sortUnitsByTreePosition);
    const threadRows = state.threads.map((thread) => ({
      id: thread.id,
      title: thread.name,
      subtitle: normalizeLabel(thread.thread_type),
      status: thread.status,
      unitIds: new Set(state.threadUnits.filter((link) => link.thread_id === thread.id).map((link) => link.unit_id)),
    }));
    const arcRows = state.characterArcs.map((arc) => ({
      id: arc.id,
      title: arc.name,
      subtitle: "Character Arc",
      status: arc.status,
      unitIds: new Set(state.arcStages.filter((stage) => stage.character_arc_id === arc.id && stage.unit_id).map((stage) => stage.unit_id)),
    }));
    const rows = [...threadRows, ...arcRows];
    dom.storySurface.innerHTML = `
      <div class="arc-map-view" style="--arc-scene-count: ${Math.max(1, scenes.length)}">
        <div class="arc-map-header">
          <span>Thread / Arc</span>
          ${scenes.map((unit) => `<span>${escapeHtml(unit.title)}</span>`).join("")}
        </div>
        ${rows.length ? rows.map((row) => `
          <section class="arc-map-row">
            <div class="arc-map-label">
              <strong>${escapeHtml(row.title)}</strong>
              <span>${escapeHtml(row.subtitle)} - ${escapeHtml(normalizeLabel(row.status))}</span>
            </div>
            ${scenes.map((unit) => `
              <button type="button" class="arc-map-cell ${row.unitIds.has(unit.id) ? "is-active" : ""} ${state.selectedUnitId === unit.id ? "is-selected" : ""}" data-arc-select-unit="${escapeAttribute(unit.id)}" title="${escapeAttribute(unit.title)}">
                ${row.unitIds.has(unit.id) ? '<ph-circle weight="fill" aria-hidden="true"></ph-circle>' : ""}
              </button>
            `).join("")}
          </section>
        `).join("") : '<p class="empty-state">Create plot threads or character arcs to populate the Arc Map.</p>'}
      </div>
    `;
  }

  function renderDiagnosticsView() {
    const localDiagnostics = buildLocalDiagnostics();
    const latestReport = state.diagnosticReports[0] || null;
    const aiDiagnostics = latestReport?.status === "complete" ? visibleReportDiagnostics(latestReport) : [];
    dom.storySurface.innerHTML = `
      <div class="arc-diagnostics-view">
        <div class="arc-diagnostics-toolbar">
          <div>
            <strong>Story Diagnostics</strong>
            <span>${latestReport ? `Latest AI report: ${escapeHtml(formatShortDateTime(latestReport.created_at))}` : "No AI report yet"}</span>
          </div>
          <button class="primary-action" type="button" data-arc-analyze-story>
            <ph-sparkle weight="bold" aria-hidden="true"></ph-sparkle>
            Run Analysis
          </button>
        </div>
        ${latestReport?.status === "failed" ? `<p class="form-status is-error">${escapeHtml(latestReport.error_message || "The last analysis failed.")}</p>` : ""}
        ${renderDiagnosticGroup("Local Checks", localDiagnostics)}
        ${renderDiagnosticGroup("AI Suggestions", aiDiagnostics, true)}
      </div>
    `;
  }

  function renderDiagnosticGroup(title, diagnostics, canDismiss = false) {
    return `
      <section class="arc-diagnostic-group">
        <h3>${escapeHtml(title)}</h3>
        ${diagnostics.length ? diagnostics.map((item) => renderDiagnosticItem(item, canDismiss)).join("") : '<p class="arc-muted">No issues found here.</p>'}
      </section>
    `;
  }

  function renderDiagnosticItem(item, canDismiss) {
    const unitIds = Array.isArray(item.unit_ids) ? item.unit_ids : [];
    return `
      <article class="arc-diagnostic-item severity-${escapeAttribute(item.severity || "medium")}">
        <div>
          <span>${escapeHtml(normalizeLabel(item.severity || "medium"))} - ${escapeHtml(normalizeLabel(item.type || "story_note"))}</span>
          <h4>${escapeHtml(item.title || "Story note")}</h4>
          <p>${escapeHtml(item.description || item.suggestion || "No details provided.")}</p>
          ${item.suggestion ? `<p><strong>Suggestion:</strong> ${escapeHtml(item.suggestion)}</p>` : ""}
        </div>
        <div class="arc-diagnostic-actions">
          ${unitIds[0] ? `<button class="secondary-action" type="button" data-arc-select-unit="${escapeAttribute(unitIds[0])}">Open Scene</button>` : ""}
          ${canDismiss ? `<button class="secondary-action" type="button" data-arc-dismiss-diagnostic="${escapeAttribute(item.key || "")}">Dismiss</button>` : ""}
          ${canDismiss && item.apply_kind && item.apply_kind !== "none" ? `<button class="secondary-action" type="button" data-arc-apply-diagnostic="${escapeAttribute(item.key || "")}">Apply Suggestion</button>` : ""}
        </div>
      </article>
    `;
  }

  function renderInspector() {
    const unit = selectedUnit();
    dom.inspectorTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.arcInspectorTab === state.inspectorTab));
    dom.inspectorType.textContent = unit ? normalizeLabel(unit.unit_type) : "Project";
    dom.inspectorTitle.textContent = unit ? unit.title : state.project?.title || "Arc Studio";
    if (!unit) {
      dom.inspectorContent.innerHTML = renderProjectInspector();
      return;
    }
    const renderers = {
      overview: renderOverviewInspector,
      cast: renderCastInspector,
      story: renderStoryInspector,
      arcs: renderArcsInspector,
      causality: renderCausalityInspector,
      continuity: renderContinuityInspector,
      chronicle: renderChronicleInspector,
      notes: renderNotesInspector,
    };
    dom.inspectorContent.innerHTML = (renderers[state.inspectorTab] || renderOverviewInspector)(unit);
  }

  function renderProjectInspector() {
    return `
      <section class="arc-inspector-section">
        <h3>Project Overview</h3>
        <p>${escapeHtml(state.project?.premise || state.project?.logline || "Select or create a scene to begin shaping the story.")}</p>
      </section>
      <section class="arc-inspector-section">
        <h3>Dashboard</h3>
        <dl class="arc-dashboard-list">
          <div><dt>Scenes</dt><dd>${state.units.filter((unit) => unit.unit_type === "scene").length}</dd></div>
          <div><dt>Active Threads</dt><dd>${state.threads.filter((thread) => thread.status === "active").length}</dd></div>
          <div><dt>Character Arcs</dt><dd>${state.characterArcs.length}</dd></div>
          <div><dt>Unresolved Setups</dt><dd>${state.setups.filter((item) => item.status === "unresolved").length}</dd></div>
        </dl>
      </section>
    `;
  }

  function renderOverviewInspector(unit) {
    return `
      <form class="arc-inspector-form" data-arc-save-unit="${escapeAttribute(unit.id)}">
        <label><span>Title</span><input name="title" value="${escapeAttribute(unit.title)}" required></label>
        <label><span>Synopsis</span><textarea name="summary">${escapeHtml(unit.summary || "")}</textarea></label>
        <label><span>Status</span>${renderStatusSelect(unit.status)}</label>
        <label><span>POV Character</span>${renderElementSelect("pov_element_id", unit.pov_element_id)}</label>
        <label><span>Location</span>${renderElementSelect("location_element_id", unit.location_element_id)}</label>
        <label><span>Story Time</span><input name="story_time" value="${escapeAttribute(unit.story_time || "")}" placeholder="Chapter 4, three years earlier..."></label>
        <label><span>Chronological Label</span><input name="chronological_label" value="${escapeAttribute(unit.chronological_label || "")}" placeholder="Year 127, midsummer"></label>
        <label><span>Timeline Label</span><input name="timeline_label" value="${escapeAttribute(unit.timeline_label || "")}" placeholder="Three years before chapter one"></label>
        <label><span>Chronology Sort</span><input type="number" step="0.01" name="chronology_sort" value="${escapeAttribute(unit.chronology_sort ?? "")}" placeholder="100"></label>
        <label><span>Starts At</span><input type="datetime-local" name="starts_at" value="${escapeAttribute(toDateTimeLocal(unit.starts_at))}"></label>
        <label><span>Ends At</span><input type="datetime-local" name="ends_at" value="${escapeAttribute(toDateTimeLocal(unit.ends_at))}"></label>
        <label><span>Emotional Tone</span><input name="emotional_tone" value="${escapeAttribute(unit.emotional_tone || "")}" placeholder="Tense, tender, ominous..."></label>
        <button class="primary-action" type="submit">Save Overview</button>
      </form>
    `;
  }

  function renderCastInspector(unit) {
    const linked = linksForUnit(unit.id);
    return `
      <section class="arc-inspector-section">
        <h3>Linked Chronicle Elements</h3>
        ${linked.length ? linked.map(renderElementLink).join("") : '<p class="arc-muted">No linked elements yet.</p>'}
      </section>
      <form class="arc-inspector-form" data-arc-add-element="${escapeAttribute(unit.id)}">
        <label><span>Element</span>${renderElementSelect("element_id", "")}</label>
        <label><span>Role</span><input name="role" value="appears" placeholder="POV, antagonist, artifact, location..."></label>
        <label><span>Story State</span><textarea name="story_state" placeholder="Alive, injured, hiding the truth, carrying the artifact..."></textarea></label>
        <button class="secondary-action" type="submit">Link Element</button>
      </form>
    `;
  }

  function renderStoryInspector(unit) {
    const beats = Array.isArray(unit.beats) ? unit.beats : [];
    return `
      <form class="arc-inspector-form" data-arc-save-unit="${escapeAttribute(unit.id)}">
        <label><span>Scene Purpose</span><textarea name="purpose">${escapeHtml(unit.purpose || "")}</textarea></label>
        <label><span>Conflict</span><textarea name="conflict">${escapeHtml(unit.conflict || "")}</textarea></label>
        <label><span>Outcome</span><textarea name="outcome">${escapeHtml(unit.outcome || "")}</textarea></label>
        <label><span>Estimated Duration</span><input name="estimated_duration" value="${escapeAttribute(unit.estimated_duration || "")}"></label>
        <label><span>Word Count Target</span><input type="number" name="word_count_target" min="0" value="${escapeAttribute(unit.word_count_target || "")}"></label>
        <label><span>Ordered Beats</span><textarea name="beats_text" placeholder="One beat per line">${escapeHtml(beats.join("\n"))}</textarea></label>
        <button class="primary-action" type="submit">Save Story</button>
      </form>
    `;
  }

  function renderArcsInspector(unit) {
    const unitThreadIds = new Set(state.threadUnits.filter((row) => row.unit_id === unit.id).map((row) => row.thread_id));
    const setupRows = state.setups.filter((item) => item.setup_unit_id === unit.id || item.payoff_unit_id === unit.id);
    const stageRows = state.arcStages.filter((stage) => stage.unit_id === unit.id);
    return `
      <section class="arc-inspector-section">
        <h3>Plot Threads</h3>
        ${state.threads.length ? state.threads.map((thread) => `
          <label class="arc-check-row">
            <input type="checkbox" data-arc-thread-toggle="${escapeAttribute(thread.id)}" data-unit-id="${escapeAttribute(unit.id)}" ${unitThreadIds.has(thread.id) ? "checked" : ""}>
            <span>${escapeHtml(thread.name)} <em>${escapeHtml(normalizeLabel(thread.thread_type))}</em></span>
          </label>
        `).join("") : '<p class="arc-muted">No threads yet.</p>'}
      </section>
      <form class="arc-inspector-form" data-arc-update-threads>
        <h3>Thread Notes</h3>
        ${state.threads.map((thread) => `
          <fieldset class="arc-mini-fieldset">
            <legend>${escapeHtml(thread.name)}</legend>
            <label><span>Current State</span><textarea name="thread_${escapeAttribute(thread.id)}_current_state">${escapeHtml(thread.current_state || "")}</textarea></label>
            <label><span>Next Movement</span><textarea name="thread_${escapeAttribute(thread.id)}_next_movement">${escapeHtml(thread.next_movement || "")}</textarea></label>
            <label><span>Resolution Note</span><textarea name="thread_${escapeAttribute(thread.id)}_resolution_note">${escapeHtml(thread.resolution_note || "")}</textarea></label>
          </fieldset>
        `).join("") || '<p class="arc-muted">Create a thread to add notes.</p>'}
        ${state.threads.length ? '<button class="secondary-action" type="submit">Save Thread Notes</button>' : ""}
      </form>
      <section class="arc-inspector-section">
        <h3>Character Arcs</h3>
        ${state.characterArcs.length ? state.characterArcs.map((arc) => {
          const stages = state.arcStages.filter((stage) => stage.character_arc_id === arc.id).sort(sortUnits);
          return `
            <article class="arc-arc-summary">
              <strong>${escapeHtml(arc.name)}</strong>
              <span>${escapeHtml(normalizeLabel(arc.status))}</span>
              ${stages.length ? `<ol>${stages.map((stage) => `<li>${escapeHtml(stage.title)}${stage.unit_id ? ` - ${escapeHtml(unitTitle(stage.unit_id))}` : ""}</li>`).join("")}</ol>` : '<p class="arc-muted">No stages yet.</p>'}
            </article>
          `;
        }).join("") : '<p class="arc-muted">No character arcs yet.</p>'}
      </section>
      <form class="arc-inspector-form" data-arc-add-character-arc>
        <label><span>New Character Arc</span><input name="name" placeholder="Mara learns to trust"></label>
        <label><span>Character</span>${renderElementSelect("character_element_id", "")}</label>
        <label><span>Starting State</span><textarea name="starting_state" placeholder="Who they are at the beginning."></textarea></label>
        <label><span>Final State</span><textarea name="final_state" placeholder="Who they become by the end."></textarea></label>
        <button class="secondary-action" type="submit">Add Character Arc</button>
      </form>
      <form class="arc-inspector-form" data-arc-add-arc-stage="${escapeAttribute(unit.id)}">
        <h3>Add Arc Stage For This Scene</h3>
        <label><span>Character Arc</span>${renderCharacterArcSelect("character_arc_id", "")}</label>
        <label><span>Stage Title</span><input name="title" placeholder="Turning point"></label>
        <label><span>Description</span><textarea name="description" placeholder="How this scene changes the arc."></textarea></label>
        <button class="secondary-action" type="submit">Add Stage</button>
      </form>
      <section class="arc-inspector-section">
        <h3>Stages In This Scene</h3>
        ${stageRows.length ? stageRows.map((stage) => `<p class="arc-link-summary"><strong>${escapeHtml(stage.title)}</strong><span>${escapeHtml(arcTitle(stage.character_arc_id))}</span></p>`).join("") : '<p class="arc-muted">No arc stages attached to this scene.</p>'}
      </section>
      <section class="arc-inspector-section">
        <h3>Setup / Payoff Links</h3>
        ${setupRows.length ? setupRows.map((item) => `<p class="arc-link-summary"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(normalizeLabel(item.status))}</span></p>`).join("") : '<p class="arc-muted">No setup or payoff links for this scene.</p>'}
      </section>
    `;
  }

  function renderCausalityInspector(unit) {
    const outgoing = state.unitLinks.filter((link) => link.source_unit_id === unit.id);
    const incoming = state.unitLinks.filter((link) => link.target_unit_id === unit.id);
    return `
      <section class="arc-inspector-section">
        <h3>Incoming Links</h3>
        ${incoming.length ? incoming.map(renderUnitLinkSummary).join("") : '<p class="arc-muted">No earlier scene links into this scene.</p>'}
      </section>
      <section class="arc-inspector-section">
        <h3>Outgoing Links</h3>
        ${outgoing.length ? outgoing.map(renderUnitLinkSummary).join("") : '<p class="arc-muted">No later scene links from this scene.</p>'}
      </section>
      <form class="arc-inspector-form" data-arc-add-unit-link="${escapeAttribute(unit.id)}">
        <h3>Add Cause / Effect Link</h3>
        <label><span>Target Scene</span>${renderUnitSelect("target_unit_id", "", unit.id)}</label>
        <label><span>Relationship</span>${renderLinkTypeSelect("link_type", "causes")}</label>
        <label><span>Description</span><textarea name="description" placeholder="Why this relationship matters."></textarea></label>
        <button class="secondary-action" type="submit">Add Link</button>
      </form>
    `;
  }

  function renderContinuityInspector(unit) {
    const states = state.elementStates.filter((row) => row.unit_id === unit.id);
    return `
      <section class="arc-inspector-section">
        <h3>Continuity States</h3>
        ${states.length ? states.map((row) => `
          <article class="arc-state-row">
            <div>
              <strong>${escapeHtml(elementName(row.element_id))}</strong>
              <span>${escapeHtml(normalizeLabel(row.state_type))}</span>
              <p>${escapeHtml(row.value)}</p>
              ${row.notes ? `<small>${escapeHtml(row.notes)}</small>` : ""}
            </div>
            <button class="icon-button" type="button" data-arc-delete-state="${escapeAttribute(row.id)}" aria-label="Delete continuity state"><ph-trash weight="bold" aria-hidden="true"></ph-trash></button>
          </article>
        `).join("") : '<p class="arc-muted">No scene-specific continuity states yet.</p>'}
      </section>
      <form class="arc-inspector-form" data-arc-add-element-state="${escapeAttribute(unit.id)}">
        <h3>Add Continuity State</h3>
        <label><span>Element</span>${renderElementSelect("element_id", "")}</label>
        <label><span>State Type</span>${renderStateTypeSelect("state_type", "general")}</label>
        <label><span>State</span><textarea name="value" required placeholder="What is true for this element in this scene?"></textarea></label>
        <label><span>Notes</span><textarea name="notes" placeholder="Optional context or uncertainty."></textarea></label>
        <button class="secondary-action" type="submit">Add State</button>
      </form>
    `;
  }

  function renderChronicleInspector(unit) {
    const links = linksForUnit(unit.id);
    return `
      <section class="arc-inspector-section">
        <h3>Chronicle Usage</h3>
        ${links.length ? links.map(renderElementLink).join("") : '<p class="arc-muted">No Chronicle elements linked to this unit.</p>'}
      </section>
    `;
  }

  function renderNotesInspector(unit) {
    return `
      <form class="arc-inspector-form" data-arc-save-unit="${escapeAttribute(unit.id)}">
        <label><span>Detailed Notes</span><textarea name="detailed_notes">${escapeHtml(unit.detailed_notes || "")}</textarea></label>
        <button class="primary-action" type="submit">Save Notes</button>
      </form>
    `;
  }

  function renderElementLink(link) {
    const element = state.elements.find((item) => item.id === link.element_id);
    const chronicleHref = element?.universe_id
      ? `chronicle-editor.html#universe/${encodeURIComponent(element.universe_id)}/element/${encodeURIComponent(link.element_id)}`
      : `chronicle-editor.html#element/${encodeURIComponent(link.element_id)}`;
    return `
      <article class="arc-element-link">
        <div>
          <strong>${escapeHtml(element?.name || "Unknown element")}</strong>
          <span>${escapeHtml(link.role || "appears")}</span>
          <p>${escapeHtml(link.story_state || element?.description || "No story state recorded.")}</p>
        </div>
        <a class="secondary-action" href="${chronicleHref}">Open Chronicle</a>
      </article>
    `;
  }

  function renderStagedManuscript() {
    if (!dom.stagedManuscript) return;
    const staged = state.stagedManuscript;
    if (!staged?.file) {
      dom.stagedManuscript.hidden = true;
      dom.stagedManuscript.innerHTML = "";
      return;
    }

    dom.stagedManuscript.hidden = false;
    dom.stagedManuscript.innerHTML = `
      <div class="arc-staged-manuscript-card">
        <ph-file-text weight="duotone" aria-hidden="true"></ph-file-text>
        <span>
          <strong>${escapeHtml(staged.source?.original_filename || staged.file.name || "Manuscript")}</strong>
          <em>${escapeHtml([formatDocumentType(staged.source?.mime_type || staged.file.type, staged.file.name), formatFileSize(staged.source?.file_size || staged.file.size)].filter(Boolean).join(" - "))}</em>
        </span>
        <button class="arc-staged-manuscript-remove" type="button" aria-label="Remove manuscript" data-arc-remove-manuscript>
          <ph-x weight="bold" aria-hidden="true"></ph-x>
        </button>
      </div>
      ${staged.units?.length ? `<p>${escapeHtml(staged.units.length)} outline ${staged.units.length === 1 ? "unit" : "units"} ready to create.</p>` : ""}
    `;
  }

  function clearStagedManuscript() {
    state.stagedManuscript = null;
    if (dom.manuscriptInput) dom.manuscriptInput.value = "";
    renderStagedManuscript();
  }

  function setCreateBusy(busy, message = "") {
    if (dom.createSubmit) dom.createSubmit.disabled = busy;
    if (dom.manuscriptInput) dom.manuscriptInput.disabled = busy;
    if (message) setStatus(dom.createStatus, message);
  }

  function setFormValue(name, value) {
    const field = dom.createForm?.elements?.[name];
    if (!field || value === undefined || value === null || value === "") return;
    field.value = String(value);
  }

  function applyExtractedArcProject(payload = {}) {
    const project = payload.project || {};
    setFormValue("title", project.title);
    setFormValue("genre", project.genre);
    setFormValue("format", project.format || "screenplay");
    setFormValue("logline", project.logline);
    setFormValue("premise", project.premise);
    setFormValue("target_length", project.target_length || project.targetLength);
    setFormValue("notes", project.notes);
    setFormValue("status", "outlined");
  }

  function normalizeGeneratedArcUnits(units = []) {
    const allowedTypes = new Set(["act", "sequence", "scene"]);
    const seen = new Set();
    return (Array.isArray(units) ? units : []).slice(0, 160).map((unit, index) => {
      const title = clean(unit?.title || unit?.name) || `Story Unit ${index + 1}`;
      let tempId = clean(unit?.temp_id || unit?.tempId || unit?.id) || `unit-${index + 1}`;
      tempId = tempId.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || `unit-${index + 1}`;
      while (seen.has(tempId)) tempId = `${tempId}-${index + 1}`;
      seen.add(tempId);
      const type = clean(unit?.unit_type || unit?.unitType || unit?.type).toLowerCase();
      return {
        tempId,
        parentTempId: clean(unit?.parent_temp_id || unit?.parentTempId),
        unitType: allowedTypes.has(type) ? type : "scene",
        title,
        summary: clean(unit?.summary || unit?.synopsis || unit?.advice),
        purpose: clean(unit?.purpose),
        conflict: clean(unit?.conflict),
        outcome: clean(unit?.outcome),
        storyTime: clean(unit?.story_time || unit?.storyTime),
        emotionalTone: clean(unit?.emotional_tone || unit?.emotionalTone || unit?.tone),
        beats: (Array.isArray(unit?.beats) ? unit.beats : []).map((beat) => clean(beat)).filter(Boolean).slice(0, 24),
        sortOrder: Number.isFinite(Number(unit?.sort_order ?? unit?.sortOrder)) ? Math.round(Number(unit.sort_order ?? unit.sortOrder)) : (index + 1) * 100,
      };
    }).filter((unit) => unit.title || unit.summary);
  }

  async function handleManuscriptSelected() {
    const file = dom.manuscriptInput?.files?.[0] || null;
    if (!file) return;
    if (!window.centralisSupabase) {
      setStatus(dom.createStatus, "Supabase is not available yet. Refresh the page and try again.", "error");
      return;
    }

    setCreateBusy(true, "Reading manuscript and building outline guidance...");
    try {
      const uploadData = new FormData();
      uploadData.set("file", file);
      const { data, error } = await window.centralisSupabase.functions.invoke("extract-arc-source-document", {
        body: uploadData,
      });
      if (error) throw error;
      const units = normalizeGeneratedArcUnits(data?.units || []);
      if (!data?.project?.title && !units.length) {
        throw new Error("The manuscript did not return usable project details or outline units.");
      }

      state.stagedManuscript = {
        file,
        source: data?.source || { original_filename: file.name, mime_type: file.type, file_size: file.size },
        project: data?.project || {},
        units,
      };
      applyExtractedArcProject({ project: state.stagedManuscript.project });
      renderStagedManuscript();
      setStatus(dom.createStatus, `Manuscript breakdown ready: ${units.length} outline ${units.length === 1 ? "unit" : "units"}.`, "success");
    } catch (error) {
      clearStagedManuscript();
      setStatus(dom.createStatus, `Could not break down manuscript: ${error.message}`, "error");
    } finally {
      setCreateBusy(false);
    }
  }

  async function uploadStagedArcSourceDocument(projectId) {
    if (!state.stagedManuscript?.file || !projectId) return null;
    const uploadData = new FormData();
    uploadData.set("projectId", projectId);
    uploadData.set("file", state.stagedManuscript.file);
    uploadData.set("displayName", state.stagedManuscript.source?.original_filename || state.stagedManuscript.file.name);
    const { data, error } = await window.centralisSupabase.functions.invoke("upload-arc-source-document", {
      body: uploadData,
    });
    if (error) throw error;
    return data?.document || null;
  }

  async function insertGeneratedArcUnits(projectId, units = []) {
    const usableUnits = normalizeGeneratedArcUnits(units);
    if (!usableUnits.length) return [];
    const idByTempId = new Map(usableUnits.map((unit) => [unit.tempId, crypto.randomUUID()]));
    const rows = usableUnits.map((unit, index) => ({
      id: idByTempId.get(unit.tempId),
      project_id: projectId,
      user_id: state.user.id,
      parent_unit_id: unit.parentTempId ? idByTempId.get(unit.parentTempId) || null : null,
      unit_type: unit.unitType,
      title: unit.title,
      summary: unit.summary,
      purpose: unit.purpose || null,
      conflict: unit.conflict || null,
      outcome: unit.outcome || null,
      story_time: unit.storyTime || null,
      emotional_tone: unit.emotionalTone || null,
      status: "outlined",
      sort_order: Number.isFinite(unit.sortOrder) ? unit.sortOrder : (index + 1) * 100,
      beats: unit.beats,
    }));
    const { data, error } = await window.centralisSupabase
      .from(TABLES.units)
      .insert(rows)
      .select("id");
    if (error) throw error;
    return data || [];
  }

  async function handleCreateProject(event) {
    event.preventDefault();
    const formData = new FormData(dom.createForm);
    const stagedUnits = state.stagedManuscript?.units || [];
    const payload = {
      user_id: state.user.id,
      title: clean(formData.get("title")),
      universe_id: clean(formData.get("universe_id")) || null,
      logline: clean(formData.get("logline")),
      premise: clean(formData.get("premise")),
      genre: clean(formData.get("genre")),
      format: clean(formData.get("format")) || "novel",
      status: clean(formData.get("status")) || "planning",
      target_length: clean(formData.get("target_length")),
      notes: clean(formData.get("notes")),
    };
    setCreateBusy(true, stagedUnits.length ? "Creating story project and outline..." : "Creating story project...");
    let createdProjectId = "";
    try {
      const { data, error } = await window.centralisSupabase.from(TABLES.projects).insert(payload).select("*").single();
      if (error) throw error;
      createdProjectId = data.id;

      if (state.stagedManuscript?.file) {
        setStatus(dom.createStatus, "Saving source manuscript...");
        await uploadStagedArcSourceDocument(createdProjectId);
      }

      if (stagedUnits.length) {
        setStatus(dom.createStatus, "Creating Arc outline...");
        await insertGeneratedArcUnits(createdProjectId, stagedUnits);
      }

      window.location.href = `arc-workspace.html?project_id=${encodeURIComponent(createdProjectId)}`;
    } catch (error) {
      const projectNote = createdProjectId ? " The project was created, but setup did not finish." : "";
      setStatus(dom.createStatus, `${error.message}${projectNote}`, "error");
      setCreateBusy(false);
    }
  }

  async function handleSaveUnitModal(event) {
    event.preventDefault();
    const formData = new FormData(dom.unitForm);
    const id = clean(formData.get("id"));
    const parentId = clean(formData.get("parent_unit_id")) || null;
    const payload = {
      project_id: state.project.id,
      user_id: state.user.id,
      parent_unit_id: parentId,
      unit_type: clean(formData.get("unit_type")) || "scene",
      title: clean(formData.get("title")) || "Untitled",
      summary: clean(formData.get("summary")),
      sort_order: nextSortOrder(parentId),
    };
    const response = id
      ? await window.centralisSupabase.from(TABLES.units).update(payload).eq("id", id).eq("user_id", state.user.id)
      : await window.centralisSupabase.from(TABLES.units).insert(payload);
    if (response.error) {
      setStatus(dom.unitStatus, response.error.message, "error");
      return;
    }
    closeUnitModal();
    await refreshWorkspace();
  }

  async function handleSaveThread(event) {
    event.preventDefault();
    const formData = new FormData(dom.threadForm);
    const payload = {
      project_id: state.project.id,
      user_id: state.user.id,
      name: clean(formData.get("name")),
      thread_type: clean(formData.get("thread_type")) || "plot",
      description: clean(formData.get("description")),
      sort_order: state.threads.length * 100 + 100,
    };
    const { error } = await window.centralisSupabase.from(TABLES.threads).insert(payload);
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    closeThreadModal();
    await refreshWorkspace();
  }

  async function handleSaveSetup(event) {
    event.preventDefault();
    const formData = new FormData(dom.setupForm);
    const payload = {
      project_id: state.project.id,
      user_id: state.user.id,
      label: clean(formData.get("label")),
      setup_unit_id: clean(formData.get("setup_unit_id")) || null,
      payoff_unit_id: clean(formData.get("payoff_unit_id")) || null,
      setup_type: clean(formData.get("setup_type")) || "setup",
      payoff_type: clean(formData.get("payoff_type")) || "payoff",
      description: clean(formData.get("description")),
      status: clean(formData.get("status")) || "unresolved",
    };
    const { error } = await window.centralisSupabase.from(TABLES.setups).insert(payload);
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    closeSetupModal();
    await refreshWorkspace();
  }

  async function handleInspectorSubmit(event) {
    event.preventDefault();
    const saveUnit = event.target.closest("[data-arc-save-unit]");
    if (saveUnit) {
      await saveInspectorUnit(saveUnit.dataset.arcSaveUnit, new FormData(saveUnit));
      return;
    }
    const addElement = event.target.closest("[data-arc-add-element]");
    if (addElement) {
      await addElementLink(addElement.dataset.arcAddElement, new FormData(addElement));
      return;
    }
    const addCharacterArc = event.target.closest("[data-arc-add-character-arc]");
    if (addCharacterArc) {
      await addCharacterArcRecord(new FormData(addCharacterArc));
      return;
    }
    const addArcStage = event.target.closest("[data-arc-add-arc-stage]");
    if (addArcStage) {
      await addArcStageRecord(addArcStage.dataset.arcAddArcStage, new FormData(addArcStage));
      return;
    }
    const addUnitLink = event.target.closest("[data-arc-add-unit-link]");
    if (addUnitLink) {
      await addUnitLinkRecord(addUnitLink.dataset.arcAddUnitLink, new FormData(addUnitLink));
      return;
    }
    const addElementState = event.target.closest("[data-arc-add-element-state]");
    if (addElementState) {
      await addElementStateRecord(addElementState.dataset.arcAddElementState, new FormData(addElementState));
      return;
    }
    const updateThreads = event.target.closest("[data-arc-update-threads]");
    if (updateThreads) {
      await updateThreadNotes(new FormData(updateThreads));
    }
  }

  async function handleInspectorChange(event) {
    const toggle = event.target.closest("[data-arc-thread-toggle]");
    if (!toggle) return;
    const threadId = toggle.dataset.arcThreadToggle;
    const unitId = toggle.dataset.unitId;
    if (toggle.checked) {
      await window.centralisSupabase.from(TABLES.threadUnits).insert({
        project_id: state.project.id,
        user_id: state.user.id,
        thread_id: threadId,
        unit_id: unitId,
      });
    } else {
      await window.centralisSupabase.from(TABLES.threadUnits).delete().eq("thread_id", threadId).eq("unit_id", unitId).eq("user_id", state.user.id);
    }
    await refreshWorkspace(false);
  }

  async function saveInspectorUnit(unitId, formData) {
    const payload = {};
    for (const [key, value] of formData.entries()) {
      if (key === "beats_text") {
        payload.beats = clean(value).split(/\r?\n/).map((beat) => beat.trim()).filter(Boolean);
      } else if (["word_count_target", "chronology_sort"].includes(key)) {
        payload[key] = value ? Number(value) : null;
      } else if (["starts_at", "ends_at"].includes(key)) {
        payload[key] = value ? new Date(String(value)).toISOString() : null;
      } else {
        payload[key] = clean(value) || null;
      }
    }
    const { error } = await window.centralisSupabase.from(TABLES.units).update(payload).eq("id", unitId).eq("user_id", state.user.id);
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    setStatus(dom.workspaceStatus, "Saved.", "success");
    await refreshWorkspace(false);
  }

  async function addElementLink(unitId, formData) {
    const elementId = clean(formData.get("element_id"));
    if (!elementId) return;
    const { error } = await window.centralisSupabase.from(TABLES.unitElements).insert({
      project_id: state.project.id,
      user_id: state.user.id,
      unit_id: unitId,
      element_id: elementId,
      role: clean(formData.get("role")) || "appears",
      story_state: clean(formData.get("story_state")),
    });
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    await refreshWorkspace(false);
  }

  async function addCharacterArcRecord(formData) {
    const name = clean(formData.get("name"));
    if (!name) return;
    const { error } = await window.centralisSupabase.from(TABLES.characterArcs).insert({
      project_id: state.project.id,
      user_id: state.user.id,
      name,
      character_element_id: clean(formData.get("character_element_id")) || null,
      starting_state: clean(formData.get("starting_state")),
      final_state: clean(formData.get("final_state")),
    });
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    await refreshWorkspace(false);
  }

  async function addArcStageRecord(unitId, formData) {
    const characterArcId = clean(formData.get("character_arc_id"));
    const title = clean(formData.get("title"));
    if (!characterArcId || !title) return;
    const { error } = await window.centralisSupabase.from(TABLES.arcStages).insert({
      project_id: state.project.id,
      user_id: state.user.id,
      character_arc_id: characterArcId,
      unit_id: unitId,
      title,
      description: clean(formData.get("description")),
      sort_order: nextArcStageOrder(characterArcId),
    });
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    await refreshWorkspace(false);
  }

  async function addUnitLinkRecord(sourceUnitId, formData) {
    const targetUnitId = clean(formData.get("target_unit_id"));
    if (!sourceUnitId || !targetUnitId || sourceUnitId === targetUnitId) return;
    const { error } = await window.centralisSupabase.from(TABLES.unitLinks).insert({
      project_id: state.project.id,
      user_id: state.user.id,
      source_unit_id: sourceUnitId,
      target_unit_id: targetUnitId,
      link_type: clean(formData.get("link_type")) || "causes",
      description: clean(formData.get("description")),
    });
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    await refreshWorkspace(false);
  }

  async function addElementStateRecord(unitId, formData) {
    const elementId = clean(formData.get("element_id"));
    const value = clean(formData.get("value"));
    if (!unitId || !elementId || !value) return;
    const { error } = await window.centralisSupabase.from(TABLES.elementStates).insert({
      project_id: state.project.id,
      user_id: state.user.id,
      unit_id: unitId,
      element_id: elementId,
      state_type: clean(formData.get("state_type")) || "general",
      value,
      notes: clean(formData.get("notes")),
    });
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    await refreshWorkspace(false);
  }

  async function updateThreadNotes(formData) {
    const updates = state.threads.map((thread) => window.centralisSupabase.from(TABLES.threads).update({
      current_state: clean(formData.get(`thread_${thread.id}_current_state`)) || null,
      next_movement: clean(formData.get(`thread_${thread.id}_next_movement`)) || null,
      resolution_note: clean(formData.get(`thread_${thread.id}_resolution_note`)) || null,
    }).eq("id", thread.id).eq("user_id", state.user.id));
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      setStatus(dom.workspaceStatus, failed.error.message, "error");
      return;
    }
    setStatus(dom.workspaceStatus, "Thread notes saved.", "success");
    await refreshWorkspace(false);
  }

  async function analyzeStory() {
    if (!state.project?.id) return;
    setStatus(dom.workspaceStatus, "Analyzing story...");
    const { data, error } = await window.centralisSupabase.functions.invoke("analyze-arc-story", {
      body: { project_id: state.project.id, scope: "project" },
    });
    if (error) {
      setStatus(dom.workspaceStatus, `Story analysis failed: ${error.message}`, "error");
      await refreshWorkspace(false);
      return;
    }
    setStatus(dom.workspaceStatus, data?.summary || "Story analysis complete.", "success");
    state.view = "diagnostics";
    await refreshWorkspace(true);
  }

  async function handleWorkspaceClick(event) {
    const analyze = event.target.closest("[data-arc-analyze-story]");
    if (analyze) {
      await analyzeStory();
      return;
    }
    const select = event.target.closest("[data-arc-select-unit]");
    if (select) {
      state.selectedUnitId = select.dataset.arcSelectUnit;
      renderWorkspace();
      return;
    }
    const toggle = event.target.closest("[data-arc-toggle-unit]");
    if (toggle) {
      await toggleUnit(toggle.dataset.arcToggleUnit);
      return;
    }
    const move = event.target.closest("[data-arc-move-unit]");
    if (move) {
      await moveUnit(move.dataset.arcMoveUnit, move.dataset.direction);
      return;
    }
    const duplicate = event.target.closest("[data-arc-duplicate-unit]");
    if (duplicate) {
      await duplicateUnit(duplicate.dataset.arcDuplicateUnit);
      return;
    }
    const remove = event.target.closest("[data-arc-delete-unit]");
    if (remove) {
      await deleteUnit(remove.dataset.arcDeleteUnit);
      return;
    }
    const edit = event.target.closest("[data-arc-edit-unit]");
    if (edit) {
      openUnitModal(edit.dataset.arcEditUnit);
      return;
    }
    const deleteState = event.target.closest("[data-arc-delete-state]");
    if (deleteState) {
      await deleteElementState(deleteState.dataset.arcDeleteState);
      return;
    }
    const deleteLink = event.target.closest("[data-arc-delete-link]");
    if (deleteLink) {
      await deleteUnitLink(deleteLink.dataset.arcDeleteLink);
      return;
    }
    const dismissDiagnostic = event.target.closest("[data-arc-dismiss-diagnostic]");
    if (dismissDiagnostic) {
      await dismissDiagnosticItem(dismissDiagnostic.dataset.arcDismissDiagnostic);
      return;
    }
    const applyDiagnostic = event.target.closest("[data-arc-apply-diagnostic]");
    if (applyDiagnostic) {
      await applyDiagnosticItem(applyDiagnostic.dataset.arcApplyDiagnostic);
    }
  }

  async function toggleUnit(unitId) {
    const unit = state.units.find((item) => item.id === unitId);
    if (!unit) return;
    await window.centralisSupabase.from(TABLES.units).update({ collapsed: !unit.collapsed }).eq("id", unitId).eq("user_id", state.user.id);
    await refreshWorkspace(false);
  }

  async function moveUnit(unitId, direction) {
    const unit = state.units.find((item) => item.id === unitId);
    if (!unit) return;
    const siblings = state.units.filter((item) => (item.parent_unit_id || "") === (unit.parent_unit_id || "")).sort(sortUnits);
    const index = siblings.findIndex((item) => item.id === unitId);
    const other = direction === "up" ? siblings[index - 1] : siblings[index + 1];
    if (!other) return;
    await Promise.all([
      window.centralisSupabase.from(TABLES.units).update({ sort_order: other.sort_order }).eq("id", unit.id).eq("user_id", state.user.id),
      window.centralisSupabase.from(TABLES.units).update({ sort_order: unit.sort_order }).eq("id", other.id).eq("user_id", state.user.id),
    ]);
    await refreshWorkspace(false);
  }

  async function duplicateUnit(unitId) {
    const unit = state.units.find((item) => item.id === unitId);
    if (!unit) return;
    const payload = {
      project_id: state.project.id,
      user_id: state.user.id,
      parent_unit_id: unit.parent_unit_id || null,
      unit_type: unit.unit_type,
      custom_type: unit.custom_type,
      title: `${unit.title} Copy`,
      summary: unit.summary,
      detailed_notes: unit.detailed_notes,
      purpose: unit.purpose,
      conflict: unit.conflict,
      outcome: unit.outcome,
      pov_element_id: unit.pov_element_id,
      location_element_id: unit.location_element_id,
      chronological_label: unit.chronological_label,
      chronology_sort: unit.chronology_sort,
      starts_at: unit.starts_at,
      ends_at: unit.ends_at,
      timeline_label: unit.timeline_label,
      story_time: unit.story_time,
      estimated_duration: unit.estimated_duration,
      emotional_tone: unit.emotional_tone,
      status: unit.status,
      word_count_target: unit.word_count_target,
      beats: unit.beats,
      metadata: unit.metadata,
      sort_order: nextSortOrder(unit.parent_unit_id || ""),
    };
    const { error } = await window.centralisSupabase.from(TABLES.units).insert(payload);
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    await refreshWorkspace(false);
  }

  async function deleteUnit(unitId) {
    const unit = state.units.find((item) => item.id === unitId);
    if (!unit || !window.confirm(`Delete "${unit.title}" and its child units?`)) return;
    const ids = descendantIds(unitId);
    const { error } = await window.centralisSupabase
      .from(TABLES.units)
      .update({ deleted: true, deleted_at: new Date().toISOString(), deleted_by: state.user.id })
      .in("id", ids)
      .eq("user_id", state.user.id);
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    if (ids.includes(state.selectedUnitId)) state.selectedUnitId = "";
    await refreshWorkspace(false);
  }

  async function deleteElementState(stateId) {
    if (!stateId) return;
    const { error } = await window.centralisSupabase
      .from(TABLES.elementStates)
      .delete()
      .eq("id", stateId)
      .eq("user_id", state.user.id);
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    await refreshWorkspace(false);
  }

  async function deleteUnitLink(linkId) {
    if (!linkId) return;
    const { error } = await window.centralisSupabase
      .from(TABLES.unitLinks)
      .delete()
      .eq("id", linkId)
      .eq("user_id", state.user.id);
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    await refreshWorkspace(false);
  }

  async function dismissDiagnosticItem(key) {
    const latest = state.diagnosticReports[0];
    if (!latest || !key) return;
    const current = Array.isArray(latest.dismissed_issue_keys) ? latest.dismissed_issue_keys : [];
    const dismissed = [...new Set([...current, key])];
    const { error } = await window.centralisSupabase
      .from(TABLES.diagnosticReports)
      .update({ dismissed_issue_keys: dismissed })
      .eq("id", latest.id)
      .eq("user_id", state.user.id);
    if (error) {
      setStatus(dom.workspaceStatus, error.message, "error");
      return;
    }
    await refreshWorkspace(false);
  }

  async function applyDiagnosticItem(key) {
    const latest = state.diagnosticReports[0];
    const item = visibleReportDiagnostics(latest).find((diagnostic) => diagnostic.key === key);
    if (!item) return;
    const changes = item.proposed_changes && typeof item.proposed_changes === "object" ? item.proposed_changes : {};
    if (item.apply_kind === "unit_edit" && Array.isArray(item.unit_ids) && item.unit_ids[0]) {
      const allowed = ["summary", "purpose", "conflict", "outcome", "emotional_tone", "timeline_label"];
      const payload = {};
      for (const keyName of allowed) {
        if (typeof changes[keyName] === "string") payload[keyName] = clean(changes[keyName]);
      }
      if (Object.keys(payload).length) {
        const { error } = await window.centralisSupabase
          .from(TABLES.units)
          .update(payload)
          .eq("id", item.unit_ids[0])
          .eq("user_id", state.user.id);
        if (error) {
          setStatus(dom.workspaceStatus, error.message, "error");
          return;
        }
      }
    }
    await dismissDiagnosticItem(key);
  }

  function openCreateProject() {
    dom.createModal.hidden = false;
    renderStagedManuscript();
    dom.createForm?.querySelector("input[name='title']")?.focus();
  }

  function closeCreateProject() {
    dom.createModal.hidden = true;
    dom.createForm?.reset();
    clearStagedManuscript();
    setStatus(dom.createStatus, "");
  }

  function openUnitModal(unitId = "") {
    populateUnitSelects();
    const unit = state.units.find((item) => item.id === unitId);
    dom.unitTitle.textContent = unit ? "Edit Story Unit" : "Add Story Unit";
    dom.unitForm.reset();
    dom.unitForm.elements.id.value = unit?.id || "";
    dom.unitForm.elements.unit_type.value = unit?.unit_type || "scene";
    dom.unitForm.elements.parent_unit_id.value = unit?.parent_unit_id || "";
    dom.unitForm.elements.title.value = unit?.title || "";
    dom.unitForm.elements.summary.value = unit?.summary || "";
    dom.unitModal.hidden = false;
  }

  function closeUnitModal() {
    dom.unitModal.hidden = true;
    dom.unitForm.reset();
    setStatus(dom.unitStatus, "");
  }

  function openThreadModal() {
    dom.threadForm.reset();
    dom.threadModal.hidden = false;
  }

  function closeThreadModal() {
    dom.threadModal.hidden = true;
    dom.threadForm.reset();
  }

  function openSetupModal() {
    populateUnitSelects();
    dom.setupForm.reset();
    dom.setupModal.hidden = false;
  }

  function closeSetupModal() {
    dom.setupModal.hidden = true;
    dom.setupForm.reset();
  }

  async function refreshWorkspace(keepStatus = true) {
    const previousStatus = dom.workspaceStatus?.textContent || "";
    await loadWorkspace();
    renderWorkspace();
    if (keepStatus && previousStatus) setStatus(dom.workspaceStatus, previousStatus);
  }

  function populateUniverseSelect() {
    if (!dom.universeSelect) return;
    dom.universeSelect.innerHTML = `<option value="">Standalone story project</option>${state.universes.map((universe) => `<option value="${escapeAttribute(universe.id)}">${escapeHtml(universe.name)}</option>`).join("")}`;
  }

  function populateUnitSelects() {
    const options = `<option value="">Top level</option>${state.units.map((unit) => `<option value="${escapeAttribute(unit.id)}">${escapeHtml(unit.title)} (${escapeHtml(normalizeLabel(unit.unit_type))})</option>`).join("")}`;
    if (dom.parentSelect) dom.parentSelect.innerHTML = options;
    const sceneOptions = `<option value="">Not assigned</option>${state.units.filter((unit) => unit.unit_type === "scene").map((unit) => `<option value="${escapeAttribute(unit.id)}">${escapeHtml(unit.title)}</option>`).join("")}`;
    if (dom.setupUnitSelect) dom.setupUnitSelect.innerHTML = sceneOptions;
    if (dom.payoffUnitSelect) dom.payoffUnitSelect.innerHTML = sceneOptions;
  }

  function renderElementSelect(name, selectedId) {
    return `<select name="${escapeAttribute(name)}"><option value="">None</option>${state.elements.map((element) => `<option value="${escapeAttribute(element.id)}" ${element.id === selectedId ? "selected" : ""}>${escapeHtml(element.name)}</option>`).join("")}</select>`;
  }

  function renderStatusSelect(selected) {
    const statuses = ["idea", "planned", "outlined", "drafting", "revising", "complete", "cut"];
    return `<select name="status">${statuses.map((status) => `<option value="${status}" ${status === selected ? "selected" : ""}>${escapeHtml(normalizeLabel(status))}</option>`).join("")}</select>`;
  }

  function linksForUnit(unitId) {
    return state.unitElements.filter((link) => link.unit_id === unitId);
  }

  function renderUnitLinkSummary(link) {
    return `
      <article class="arc-link-summary">
        <div>
          <strong>${escapeHtml(unitTitle(link.source_unit_id))}</strong>
          <span>${escapeHtml(normalizeLabel(link.link_type))} -> ${escapeHtml(unitTitle(link.target_unit_id))}</span>
          ${link.description ? `<p>${escapeHtml(link.description)}</p>` : ""}
        </div>
        <button class="icon-button" type="button" data-arc-delete-link="${escapeAttribute(link.id)}" aria-label="Delete link"><ph-trash weight="bold" aria-hidden="true"></ph-trash></button>
      </article>
    `;
  }

  function renderUnitSelect(name, selectedId, excludeId = "") {
    const options = state.units
      .filter((unit) => unit.id !== excludeId && isStoryScene(unit))
      .sort(sortUnitsByTreePosition)
      .map((unit) => `<option value="${escapeAttribute(unit.id)}" ${unit.id === selectedId ? "selected" : ""}>${escapeHtml(unit.title)}</option>`)
      .join("");
    return `<select name="${escapeAttribute(name)}"><option value="">Choose scene</option>${options}</select>`;
  }

  function renderCharacterArcSelect(name, selectedId) {
    return `<select name="${escapeAttribute(name)}"><option value="">Choose character arc</option>${state.characterArcs.map((arc) => `<option value="${escapeAttribute(arc.id)}" ${arc.id === selectedId ? "selected" : ""}>${escapeHtml(arc.name)}</option>`).join("")}</select>`;
  }

  function renderLinkTypeSelect(name, selected) {
    const types = ["causes", "enables", "blocks", "reveals", "foreshadows", "pays_off", "contradicts", "follows"];
    return `<select name="${escapeAttribute(name)}">${types.map((type) => `<option value="${type}" ${type === selected ? "selected" : ""}>${escapeHtml(normalizeLabel(type))}</option>`).join("")}</select>`;
  }

  function renderStateTypeSelect(name, selected) {
    const types = ["location", "knowledge", "goal", "possession", "condition", "relationship", "emotional_state", "general"];
    return `<select name="${escapeAttribute(name)}">${types.map((type) => `<option value="${type}" ${type === selected ? "selected" : ""}>${escapeHtml(normalizeLabel(type))}</option>`).join("")}</select>`;
  }

  function visibleReportDiagnostics(report) {
    if (!report || !Array.isArray(report.diagnostics)) return [];
    const dismissed = new Set(Array.isArray(report.dismissed_issue_keys) ? report.dismissed_issue_keys : []);
    return report.diagnostics.filter((item) => item && typeof item === "object" && !dismissed.has(item.key));
  }

  function buildLocalDiagnostics() {
    const diagnostics = [];
    const scenes = state.units.filter(isStoryScene);
    const setupIds = new Set(state.setups.map((item) => item.setup_unit_id).filter(Boolean));
    const payoffIds = new Set(state.setups.map((item) => item.payoff_unit_id).filter(Boolean));
    const threadCounts = new Map(state.threadUnits.map((link) => [link.thread_id, 0]));

    for (const link of state.threadUnits) threadCounts.set(link.thread_id, (threadCounts.get(link.thread_id) || 0) + 1);
    state.threads.forEach((thread, index) => {
      if (!threadCounts.get(thread.id)) {
        diagnostics.push({
          key: `local-thread-${thread.id}`,
          type: "inactive_thread",
          severity: thread.status === "active" ? "medium" : "low",
          title: `Thread has no scenes: ${thread.name}`,
          description: "This plot thread exists but is not attached to any scene yet.",
          thread_ids: [thread.id],
          suggestion: "Attach it to scenes in the Arcs inspector or mark it paused/resolved.",
        });
      }
      if (index > 0 && thread.status === "active" && !thread.next_movement && !thread.resolution_note) {
        diagnostics.push({
          key: `local-thread-movement-${thread.id}`,
          type: "unclear_thread_movement",
          severity: "low",
          title: `Thread has no next movement: ${thread.name}`,
          description: "V2 can track where a thread is going next; this field is blank.",
          thread_ids: [thread.id],
          suggestion: "Add a next movement or resolution note in the Arcs inspector.",
        });
      }
    });

    for (const scene of scenes) {
      if (!scene.purpose && !scene.outcome) {
        diagnostics.push({
          key: `local-purpose-${scene.id}`,
          type: "weak_scene_purpose",
          severity: "medium",
          title: `Scene purpose is unclear: ${scene.title}`,
          description: "This scene has no purpose or outcome recorded.",
          unit_ids: [scene.id],
          suggestion: "Add what changes by the end of the scene.",
        });
      }
      if (!hasChronology(scene)) {
        diagnostics.push({
          key: `local-chronology-${scene.id}`,
          type: "missing_chronology",
          severity: "low",
          title: `Chronology missing: ${scene.title}`,
          description: "This scene will appear in the unsorted part of the Timeline view.",
          unit_ids: [scene.id],
          suggestion: "Add a chronology sort value, date/time, or timeline label.",
        });
      }
    }

    for (const item of state.setups) {
      if (item.status !== "paid_off" && item.setup_unit_id && !item.payoff_unit_id) {
        diagnostics.push({
          key: `local-unresolved-setup-${item.id}`,
          type: "unresolved_setup",
          severity: "medium",
          title: `Setup has no payoff: ${item.label}`,
          description: "This setup has a setup scene but no payoff scene.",
          unit_ids: [item.setup_unit_id],
          suggestion: "Assign a payoff scene or mark the item cut.",
        });
      }
      if (!item.setup_unit_id && item.payoff_unit_id) {
        diagnostics.push({
          key: `local-orphan-payoff-${item.id}`,
          type: "orphaned_payoff",
          severity: "medium",
          title: `Payoff has no setup: ${item.label}`,
          description: "This payoff is attached to a scene without a setup scene.",
          unit_ids: [item.payoff_unit_id],
          suggestion: "Attach the setup scene or turn this into a reveal without prior setup.",
        });
      }
    }

    if (setupIds.size && payoffIds.size) {
      // Keeps the sets intentionally referenced for future expansion without changing behavior.
    }
    return diagnostics;
  }

  function selectedUnit() {
    return state.units.find((unit) => unit.id === state.selectedUnitId) || null;
  }

  function filteredUnits() {
    return state.units.filter((unit) => {
      const searchMatch = !state.search || `${unit.title} ${unit.summary || ""} ${unit.purpose || ""} ${unit.conflict || ""}`.toLowerCase().includes(state.search);
      const statusMatch = !state.statusFilter || unit.status === state.statusFilter;
      return searchMatch && statusMatch;
    });
  }

  function sortUnits(left, right) {
    return Number(left.sort_order || 0) - Number(right.sort_order || 0) || String(left.created_at || "").localeCompare(String(right.created_at || ""));
  }

  function sortUnitsByTreePosition(left, right) {
    return treePath(left).localeCompare(treePath(right));
  }

  function sortUnitsByChronology(left, right) {
    const leftHas = hasChronology(left);
    const rightHas = hasChronology(right);
    if (leftHas !== rightHas) return leftHas ? -1 : 1;
    const leftSort = Number(left.chronology_sort);
    const rightSort = Number(right.chronology_sort);
    if (Number.isFinite(leftSort) || Number.isFinite(rightSort)) {
      return (Number.isFinite(leftSort) ? leftSort : Number.MAX_SAFE_INTEGER) - (Number.isFinite(rightSort) ? rightSort : Number.MAX_SAFE_INTEGER);
    }
    const leftDate = Date.parse(left.starts_at || "");
    const rightDate = Date.parse(right.starts_at || "");
    if (Number.isFinite(leftDate) || Number.isFinite(rightDate)) {
      return (Number.isFinite(leftDate) ? leftDate : Number.MAX_SAFE_INTEGER) - (Number.isFinite(rightDate) ? rightDate : Number.MAX_SAFE_INTEGER);
    }
    return sortUnitsByTreePosition(left, right);
  }

  function isStoryScene(unit) {
    return ["scene", "beat", "chapter", "sequence", "episode", "custom"].includes(unit.unit_type);
  }

  function hasChronology(unit) {
    return unit.chronology_sort !== null && unit.chronology_sort !== undefined && unit.chronology_sort !== ""
      || Boolean(unit.starts_at || unit.ends_at || unit.timeline_label || unit.chronological_label || unit.story_time);
  }

  function formatTimelineRange(unit) {
    const range = [formatShortDateTime(unit.starts_at), formatShortDateTime(unit.ends_at)].filter(Boolean).join(" to ");
    return range || unit.story_time || unit.chronological_label || "No date or sequence set";
  }

  function formatShortDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function toDateTimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  function treePath(unit) {
    const parts = [];
    let current = unit;
    let guard = 0;
    while (current && guard < 20) {
      parts.unshift(String(current.sort_order || 0).padStart(6, "0"));
      current = state.units.find((item) => item.id === current.parent_unit_id);
      guard += 1;
    }
    return parts.join(".");
  }

  function nextSortOrder(parentId) {
    const siblings = state.units.filter((unit) => (unit.parent_unit_id || "") === (parentId || ""));
    return Math.max(0, ...siblings.map((unit) => Number(unit.sort_order || 0))) + 100;
  }

  function nextArcStageOrder(characterArcId) {
    const stages = state.arcStages.filter((stage) => stage.character_arc_id === characterArcId);
    return Math.max(0, ...stages.map((stage) => Number(stage.sort_order || 0))) + 100;
  }

  function unitTitle(unitId) {
    return state.units.find((unit) => unit.id === unitId)?.title || "Unknown scene";
  }

  function arcTitle(arcId) {
    return state.characterArcs.find((arc) => arc.id === arcId)?.name || "Unknown arc";
  }

  function elementName(elementId) {
    return state.elements.find((element) => element.id === elementId)?.name || "Unknown element";
  }

  function descendantIds(unitId) {
    const ids = [unitId];
    for (const unit of state.units.filter((item) => item.parent_unit_id === unitId)) {
      ids.push(...descendantIds(unit.id));
    }
    return ids;
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function formatDocumentType(mimeType, filename) {
    const extension = String(filename || "").split(".").pop()?.toUpperCase() || "";
    if (extension && extension.length <= 5) return extension;
    return String(mimeType || "Document").replace(/^application\//, "").replace(/^text\//, "").toUpperCase();
  }

  function normalizeLabel(value) {
    return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function clean(value) {
    return String(value ?? "").trim();
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

  function setStatus(target, message, type = "") {
    if (!target) return;
    target.textContent = message || "";
    target.classList.toggle("is-error", type === "error");
    target.classList.toggle("is-success", type === "success");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
