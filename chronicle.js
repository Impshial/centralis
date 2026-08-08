(() => {
  const ELEMENTS_TABLE = "elements";
  const ELEMENT_TYPES_TABLE = "element_types";
  const UNIVERSES_TABLE = "universes";
  const CHRONICLE_MODULES_TABLE = "chronicle_modules";
  const ELEMENT_TYPE_TEMPLATES_TABLE = "element_type_templates";
  const ELEMENT_TEMPLATE_SECTIONS_TABLE = "element_template_sections";
  const ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE = "element_type_template_fields";
  const ELEMENT_TEMPLATE_FIELD_VALUES_TABLE = "element_template_field_values";
  const ELEMENT_CUSTOM_FIELDS_TABLE = "element_custom_fields";
  const TEMPLATE_SECTION_MODULE_TYPE = "template_section";
  const MAX_IMAGE_PROMPT_LENGTH = 3900;
  const IS_CHRONICLE_EDITOR_PAGE = document.body?.dataset.page === "chronicle-editor";
  const EDITOR_TOP_SCROLL_DELAYS = [0, 16, 50, 140, 320, 700, 1200];

  if (IS_CHRONICLE_EDITOR_PAGE && "scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  const state = {
    user: null,
    pageMode: "home",
    activeTab: "standalone",
    selectedUniverseId: "",
    search: "",
    sort: "updated-desc",
    activeImageGenerationElementId: "",
    activeImageViewerId: "",
    elementTypes: [],
    standaloneElements: [],
    universeElements: [],
    universes: [],
    moduleCounts: new Map(),
    universesById: new Map(),
    routeContext: null,
    workspace: createEmptyWorkspace(),
    aiModuleGeneration: {
      isGenerating: false,
      proposal: null
    },
    isLoading: true,
    markdownEditors: new Map(),
    activeTextEditorDialog: null,
    topScrollGeneration: 0
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", initChronicle);
  window.addEventListener("hashchange", async () => {
    if (state.pageMode !== "editor") {
      return;
    }
    scrollEditorToTop({ stubborn: true });
    state.routeContext = parseRouteContext();
    await loadRouteWorkspace();
    renderRouteNotice();
    renderWorkspace();
    scrollEditorToTop({ stubborn: true });
  });

  async function initChronicle() {
    bindDom();
    state.pageMode = document.body?.dataset.page === "chronicle-editor" ? "editor" : "home";
    if (state.pageMode === "editor" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    if (state.pageMode === "editor") {
      scrollEditorToTop({ stubborn: true });
    }
    if (state.pageMode === "home") {
      applyHomepageQueryState();
    }
    bindEvents();

    try {
      await waitForAuth();
      state.user = await window.centralisGetCurrentAppUser();
      if (!state.user) {
        return;
      }

      state.routeContext = parseRouteContext();
      await loadChronicleData();
      if (state.pageMode === "editor") {
        await loadRouteWorkspace();
      }
      state.isLoading = false;
      renderAll();
      if (state.pageMode === "editor") {
        scrollEditorToTop({ stubborn: true });
      }
    } catch (error) {
      console.error("Could not load Chronicle.", error);
      state.isLoading = false;
      setStatus(`Could not load Chronicle: ${error.message}`, true);
      renderContent();
    }
  }

  function bindDom() {
    dom.content = document.querySelector("[data-chronicle-content]");
    dom.status = document.querySelector("[data-chronicle-status]");
    dom.search = document.querySelector("[data-chronicle-search]");
    dom.sort = document.querySelector("[data-chronicle-sort]");
    dom.universeFilter = document.querySelector("[data-chronicle-universe-filter]");
    dom.universeFilterWrap = document.querySelector("[data-chronicle-universe-filter-wrap]");
    dom.tabs = Array.from(document.querySelectorAll("[data-chronicle-tab]"));
    dom.createButtons = Array.from(document.querySelectorAll("[data-chronicle-create]"));
    dom.routeNotice = document.querySelector("[data-chronicle-route-notice]");
    dom.workspace = document.querySelector("[data-chronicle-workspace]");
    dom.createModal = document.getElementById("chronicle-create-modal");
    dom.createForm = document.querySelector("[data-chronicle-create-form]");
    dom.createName = document.querySelector("[data-chronicle-name]");
    dom.createType = document.querySelector("[data-chronicle-type]");
    dom.createDescription = document.querySelector("[data-chronicle-description]");
    dom.createError = document.querySelector("[data-chronicle-create-error]");
    dom.createSubmit = document.querySelector("[data-chronicle-create-submit]");
    dom.textEditorModal = document.getElementById("chronicle-text-editor-modal");
    dom.textEditorHost = document.querySelector("[data-chronicle-text-editor-host]");
    dom.textEditorFallback = document.querySelector("[data-chronicle-text-editor-fallback]");
    dom.textEditorSubtitle = document.querySelector("[data-chronicle-text-editor-subtitle]");
    dom.generateImageModal = document.getElementById("chronicle-generate-image-modal");
    dom.generateImageForm = document.querySelector("[data-chronicle-generate-image-form]");
    dom.generateImagePrompt = document.querySelector("[data-chronicle-generate-image-prompt]");
    dom.generateImageSubtitle = document.querySelector("[data-chronicle-generate-image-subtitle]");
    dom.generateImageStatus = document.querySelector("[data-chronicle-generate-image-status]");
    dom.generateImageSubmit = document.querySelector("[data-chronicle-generate-image-submit]");
    dom.imageViewerModal = document.getElementById("chronicle-image-viewer-modal");
    dom.imageViewerTitle = document.querySelector("[data-chronicle-image-viewer-title]");
    dom.imageViewerImage = document.querySelector("[data-chronicle-image-viewer-img]");
    dom.imageViewerThumbs = document.querySelector("[data-chronicle-image-viewer-thumbs]");
    dom.imageViewerStatus = document.querySelector("[data-chronicle-image-viewer-status]");
    dom.imageViewerPrimary = document.querySelector("[data-chronicle-image-viewer-primary]");
    dom.aiModuleGenerateModal = document.getElementById("chronicle-ai-module-generate-modal");
    dom.aiModuleGenerateForm = document.querySelector("[data-chronicle-ai-module-generate-form]");
    dom.aiModuleChecklist = document.querySelector("[data-chronicle-ai-module-checklist]");
    dom.aiModuleInstructions = document.querySelector("[data-chronicle-ai-module-instructions]");
    dom.aiModuleGenerateStatus = document.querySelector("[data-chronicle-ai-module-generate-status]");
    dom.aiModuleGenerateSubmit = document.querySelector("[data-chronicle-ai-module-generate-submit]");
    dom.aiModuleReviewModal = document.getElementById("chronicle-ai-module-review-modal");
    dom.aiModuleReviewForm = document.querySelector("[data-chronicle-ai-module-review-form]");
    dom.aiModuleReviewContent = document.querySelector("[data-chronicle-ai-module-review-content]");
    dom.aiModuleReviewStatus = document.querySelector("[data-chronicle-ai-module-review-status]");
  }

  function bindEvents() {
    dom.tabs.forEach((tab) => {
      tab.addEventListener("click", async () => {
        state.activeTab = tab.dataset.chronicleTab || "standalone";
        writeHomepageQueryState();
        if (state.activeTab === "universe") {
          await loadChronicleData();
        }
        renderAll();
      });
    });

    dom.search?.addEventListener("input", () => {
      state.search = dom.search.value.trim();
      writeHomepageQueryState();
      renderContent();
    });

    dom.sort?.addEventListener("change", () => {
      state.sort = dom.sort.value;
      writeHomepageQueryState();
      renderContent();
    });

    dom.universeFilter?.addEventListener("change", async () => {
      state.selectedUniverseId = dom.universeFilter.value;
      writeHomepageQueryState();
      await loadChronicleData();
      renderAll();
    });

    dom.createButtons.forEach((button) => button.addEventListener("click", openCreateDialog));
    document.querySelector("[data-chronicle-create-close]")?.addEventListener("click", closeCreateDialog);
    document.querySelector("[data-chronicle-create-cancel]")?.addEventListener("click", closeCreateDialog);
    dom.createModal?.addEventListener("click", (event) => {
      if (event.target === dom.createModal && !isStrictModal(dom.createModal)) {
        closeCreateDialog();
      }
    });

    dom.createForm?.addEventListener("submit", handleCreateElement);
    dom.workspace?.addEventListener("click", handleWorkspaceClick);
    dom.workspace?.addEventListener("change", handleWorkspaceChange);
    dom.workspace?.addEventListener("submit", handleWorkspaceSubmit);
    document.querySelector("[data-chronicle-text-editor-close]")?.addEventListener("click", closeTextEditorDialog);
    document.querySelector("[data-chronicle-text-editor-cancel]")?.addEventListener("click", closeTextEditorDialog);
    document.querySelector("[data-chronicle-text-editor-apply]")?.addEventListener("click", applyTextEditorDialog);
    dom.textEditorModal?.addEventListener("click", (event) => {
      if (event.target === dom.textEditorModal && !isStrictModal(dom.textEditorModal)) {
        closeTextEditorDialog();
      }
    });
    document.querySelector("[data-chronicle-generate-image-close]")?.addEventListener("click", closeGenerateImageDialog);
    document.querySelector("[data-chronicle-generate-image-cancel]")?.addEventListener("click", closeGenerateImageDialog);
    dom.generateImageForm?.addEventListener("submit", handleGenerateImageSubmit);
    dom.generateImageModal?.addEventListener("click", (event) => {
      if (event.target === dom.generateImageModal && !isStrictModal(dom.generateImageModal)) {
        closeGenerateImageDialog();
      }
    });
    bindChronicleImageViewer();
    document.querySelector("[data-chronicle-ai-module-generate-cancel]")?.addEventListener("click", closeAiModuleGenerateDialog);
    document.querySelector("[data-chronicle-ai-module-review-cancel]")?.addEventListener("click", closeAiModuleReviewDialog);
    dom.aiModuleGenerateForm?.addEventListener("submit", handleAiModuleGenerateSubmit);
    dom.aiModuleReviewForm?.addEventListener("submit", handleAiModuleReviewSubmit);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dom.generateImageModal && !dom.generateImageModal.hidden) {
        closeGenerateImageDialog();
      }
    });

    if (state.pageMode === "editor") {
      ["wheel", "touchstart", "pointerdown", "keydown"].forEach((eventName) => {
        window.addEventListener(eventName, cancelPendingEditorTopScroll, { passive: true });
      });
    }
  }

  function cancelPendingEditorTopScroll() {
    state.topScrollGeneration += 1;
  }

  function isStrictModal(modal) {
    return Boolean(modal?.dataset?.strictModal !== undefined);
  }

  async function waitForAuth() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (window.centralisSupabase && window.centralisGetCurrentAppUser) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Centralis auth did not initialize.");
  }

  async function loadChronicleData() {
    setStatus("Loading Chronicle...");

    const [typeResponse, moduleResponse, universeResponse, standaloneResponse] = await Promise.all([
      window.centralisSupabase
        .from(ELEMENT_TYPES_TABLE)
        .select("id,name,icon,color")
        .eq("user_id", state.user.id)
        .order("name", { ascending: true }),
      window.centralisSupabase
        .from(CHRONICLE_MODULES_TABLE)
        .select("element_id")
        .eq("user_id", state.user.id)
        .eq("module_type", TEMPLATE_SECTION_MODULE_TYPE),
      window.centralisSupabase
        .from(UNIVERSES_TABLE)
        .select("id,name")
        .eq("user_id", state.user.id)
        .order("name", { ascending: true }),
      window.centralisSupabase
        .from(ELEMENTS_TABLE)
        .select("id,name,description,element_type_id,universe_id,updated_at,created_at")
        .eq("user_id", state.user.id)
        .is("universe_id", null)
        .order("updated_at", { ascending: false })
    ]);

    throwIfError(typeResponse);
    throwIfError(moduleResponse);
    throwIfError(universeResponse);
    throwIfError(standaloneResponse);

    state.elementTypes = typeResponse.data || [];
    state.universes = universeResponse.data || [];
    state.universesById = new Map(state.universes.map((universe) => [universe.id, universe]));
    state.moduleCounts = countModules(moduleResponse.data || []);
    state.standaloneElements = standaloneResponse.data || [];

    if (state.selectedUniverseId) {
      const universeElementResponse = await window.centralisSupabase
        .from(ELEMENTS_TABLE)
        .select("id,name,description,element_type_id,universe_id,updated_at,created_at")
        .eq("user_id", state.user.id)
        .eq("universe_id", state.selectedUniverseId)
        .order("updated_at", { ascending: false });

      throwIfError(universeElementResponse);
      state.universeElements = universeElementResponse.data || [];
    } else {
      state.universeElements = [];
    }

    setStatus("");
  }

  async function loadUniversesForElements(elements) {
    const universeIds = Array.from(new Set(elements.map((element) => element.universe_id).filter(Boolean)));
    state.universesById = new Map();
    if (!universeIds.length) {
      return;
    }

    const { data, error } = await window.centralisSupabase
      .from(UNIVERSES_TABLE)
      .select("id,name")
      .in("id", universeIds)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    (data || []).forEach((universe) => state.universesById.set(universe.id, universe));
  }

  async function loadRouteWorkspace() {
    const context = state.routeContext;
    if (!context || !["standalone-element", "universe-element"].includes(context.type)) {
      state.workspace = createEmptyWorkspace();
      return;
    }

    state.workspace = { ...createEmptyWorkspace(), isOpen: true, isLoading: true, mode: "edit" };
    renderWorkspace();

    try {
      const elementResponse = await window.centralisSupabase
        .from(ELEMENTS_TABLE)
        .select("id,name,description,element_type_id,universe_id,rich_template_id,updated_at,created_at")
        .eq("user_id", state.user.id)
        .eq("id", context.elementId)
        .maybeSingle();

      throwIfError(elementResponse);
      const element = elementResponse.data;
      if (!element) {
        throw new Error("That element could not be found.");
      }
      if (context.universeId && element.universe_id !== context.universeId) {
        throw new Error("That element does not belong to the linked Universe.");
      }

      const [universeResponse, moduleResponse, valueResponse, customResponse, imageResponse] = await Promise.all([
        element.universe_id
          ? window.centralisSupabase
            .from(UNIVERSES_TABLE)
            .select("id,name")
            .eq("id", element.universe_id)
            .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        window.centralisSupabase
          .from(CHRONICLE_MODULES_TABLE)
          .select("*")
          .eq("user_id", state.user.id)
          .eq("element_id", element.id)
          .eq("module_type", TEMPLATE_SECTION_MODULE_TYPE)
          .order("sort_order", { ascending: true }),
        window.centralisSupabase
          .from(ELEMENT_TEMPLATE_FIELD_VALUES_TABLE)
          .select("*")
          .eq("element_id", element.id),
        window.centralisSupabase
          .from(ELEMENT_CUSTOM_FIELDS_TABLE)
          .select("*")
          .eq("element_id", element.id)
          .order("sort_order", { ascending: true }),
        fetchObjectImages([element.id])
      ]);

      throwIfError(universeResponse);
      throwIfError(moduleResponse);
      throwIfError(valueResponse);
      throwIfError(customResponse);

      const templates = element.element_type_id ? await fetchTemplatesForType(element.element_type_id) : [];
      const selectedTemplateId = element.rich_template_id || (templates.length === 1 ? templates[0].id : "");
      const template = selectedTemplateId ? templates.find((item) => item.id === selectedTemplateId) || null : null;
      const templateDetails = template ? await fetchTemplateDetails(template.id) : { sections: [], fields: [] };

      state.workspace = {
        ...createEmptyWorkspace(),
        isOpen: true,
        mode: "edit",
        element,
        originalElementTypeId: element.element_type_id || "",
        originalTemplateId: selectedTemplateId || "",
        universe: universeResponse.data || null,
        modules: moduleResponse.data || [],
        templates,
        template,
        sections: templateDetails.sections,
        fields: templateDetails.fields,
        values: valueResponse.data || [],
        customFields: customResponse.data || [],
        images: normalizeImages(imageResponse.images || [])
      };
    } catch (error) {
      console.error("Could not load Chronicle workspace.", error);
      state.workspace = {
        ...createEmptyWorkspace(),
        isOpen: true,
        error: getReadableError(error)
      };
    }
  }

  async function fetchTemplatesForType(elementTypeId) {
    const response = await window.centralisSupabase
      .from(ELEMENT_TYPE_TEMPLATES_TABLE)
      .select("*")
      .eq("element_type_id", elementTypeId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    throwIfError(response);
    return response.data || [];
  }

  async function fetchTemplateDetails(templateId) {
    const [sectionResponse, fieldResponse] = await Promise.all([
      window.centralisSupabase
        .from(ELEMENT_TEMPLATE_SECTIONS_TABLE)
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      window.centralisSupabase
        .from(ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE)
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order", { ascending: true })
    ]);

    throwIfError(sectionResponse);
    throwIfError(fieldResponse);

    const hiddenSectionIds = new Set((sectionResponse.data || [])
      .filter((section) => section.is_hidden)
      .map((section) => section.id));

    return {
      sections: (sectionResponse.data || []).filter((section) => !section.is_hidden),
      fields: (fieldResponse.data || [])
        .filter((field) => !field.is_hidden && !hiddenSectionIds.has(field.section_id))
        .sort(sortTemplateFields)
    };
  }

  async function fetchObjectImages(objectIds) {
    const ids = [...new Set((objectIds || []).filter(Boolean))];
    if (!ids.length || !window.centralisSupabase?.functions) {
      return { images: [] };
    }

    const response = await window.centralisSupabase.functions.invoke("list-object-images", {
      body: { objectIds: ids }
    });
    throwIfError(response);
    return response.data || { images: [] };
  }

  function normalizeImages(images = []) {
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

  function countModules(moduleRows) {
    return moduleRows.reduce((counts, row) => {
      if (row.element_id) {
        counts.set(row.element_id, (counts.get(row.element_id) || 0) + 1);
      }
      return counts;
    }, new Map());
  }

  function renderAll() {
    renderTabs();
    renderHomepageControls();
    renderRouteNotice();
    renderWorkspace();
    renderCreateTypeOptions();
    renderContent();
  }

  function forceEditorScrollTop() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelector(".app-shell")?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    document.querySelector(".chronicle-editor-page")?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  }

  function scrollEditorToTop(options = {}) {
    if (state.pageMode !== "editor") {
      return;
    }

    const generation = state.topScrollGeneration + 1;
    state.topScrollGeneration = generation;
    const delays = options.stubborn ? EDITOR_TOP_SCROLL_DELAYS : [0, 16];
    delays.forEach((delay) => {
      window.setTimeout(() => {
        if (state.topScrollGeneration !== generation) {
          return;
        }
        forceEditorScrollTop();
      }, delay);
    });
  }

  function renderTabs() {
    dom.tabs.forEach((tab) => {
      const isActive = tab.dataset.chronicleTab === state.activeTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
  }

  function renderHomepageControls() {
    if (dom.search && dom.search.value !== state.search) {
      dom.search.value = state.search;
    }
    if (dom.sort && dom.sort.value !== state.sort) {
      dom.sort.value = state.sort;
    }
    if (!dom.universeFilter || !dom.universeFilterWrap) {
      return;
    }

    dom.universeFilterWrap.hidden = state.activeTab !== "universe";
    dom.universeFilter.innerHTML = `
      <option value="">Choose a universe</option>
      ${state.universes.map((universe) => `<option value="${escapeHtml(universe.id)}"${universe.id === state.selectedUniverseId ? " selected" : ""}>${escapeHtml(universe.name)}</option>`).join("")}
    `;
  }

  function renderRouteNotice() {
    if (!dom.routeNotice) {
      return;
    }

    const context = state.routeContext;
    if (!context) {
      dom.routeNotice.hidden = true;
      dom.routeNotice.innerHTML = "";
      return;
    }

    dom.routeNotice.hidden = true;
  }

  function renderWorkspace() {
    if (!dom.workspace) {
      return;
    }

    destroyInlineMarkdownEditors();

    const workspace = state.workspace;
    if (!workspace?.isOpen) {
      dom.workspace.hidden = true;
      dom.workspace.innerHTML = "";
      return;
    }

    dom.workspace.hidden = false;

    if (workspace.isLoading) {
      dom.workspace.innerHTML = `<div class="chronicle-workspace is-loading">Loading element workspace...</div>`;
      return;
    }

    if (workspace.error) {
      dom.workspace.innerHTML = `
        <div class="chronicle-workspace">
          <div class="chronicle-workspace-header">
            <div>
              <p class="chronicle-eyebrow">Chronicle Editor</p>
              <h2>Element unavailable</h2>
              <p>${escapeHtml(workspace.error)}</p>
            </div>
            <div class="chronicle-workspace-actions">
              ${renderBackToChronicleLink()}
              ${renderBackToCanvasLink()}
            </div>
          </div>
        </div>
      `;
      return;
    }

    const element = workspace.element;
    const type = getType(element.element_type_id);
    const iconName = sanitizeIconName(type?.icon);
    const valuesByFieldId = new Map(workspace.values.map((value) => [value.template_field_id, value]));
    const assignedModules = getAssignedSectionModules(workspace);
    const assignedModuleSectionIds = new Set(assignedModules.map((item) => item.section.id));
    const canManageModules = Boolean(workspace.template?.id);
    const images = normalizeImages(workspace.images || []);

    dom.workspace.innerHTML = `
      <form class="chronicle-workspace" data-chronicle-workspace-form>
        <div class="chronicle-workspace-header">
          <div class="chronicle-workspace-title-stack">
            ${renderBackToChronicleLink()}
            <div class="chronicle-workspace-title">
              <div class="chronicle-type-icon" style="--type-color:${escapeHtml(type?.color || "#6366f1")}">
                <ph-${escapeHtml(iconName)} weight="duotone" aria-hidden="true"></ph-${escapeHtml(iconName)}>
              </div>
              <div>
                <p class="chronicle-eyebrow">${escapeHtml(workspace.universe?.name || "Standalone Element")}</p>
                <h2 data-chronicle-workspace-title>${escapeHtml(element.name)}</h2>
                <p data-chronicle-workspace-type>${escapeHtml(type?.name || "No element type")}</p>
              </div>
            </div>
          </div>
          <div class="chronicle-workspace-actions">
            ${renderBackToCanvasLink()}
            <button class="primary-action" type="submit" data-chronicle-workspace-save>Save Element</button>
          </div>
        </div>
        ${renderWorkspaceImagePanel(images, element.name)}
        <section class="chronicle-editor-section chronicle-editor-basics">
          <h3>Basics</h3>
          <div class="chronicle-basics-fields">
            <label class="form-field">
              <span>Name</span>
              <input type="text" name="workspace-name" value="${escapeHtml(element.name)}" required autocomplete="off">
            </label>
            <label class="form-field">
              <span>Element Type</span>
              <select name="workspace-element-type" data-chronicle-element-type-select>
                <option value="">No type</option>
                ${state.elementTypes.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === element.element_type_id ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
              </select>
            </label>
            <label class="form-field">
              <span>Template</span>
              <select name="workspace-template" data-chronicle-template-select>
                <option value="">No template</option>
                ${workspace.templates.map((item) => `<option value="${escapeHtml(item.id)}"${workspace.template?.id === item.id ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="form-field">
            <span>Description</span>
            <textarea name="workspace-description" rows="6">${escapeHtml(element.description || "")}</textarea>
          </label>
          ${renderTemplateChoiceHint(workspace)}
        </section>
        <div class="chronicle-workspace-grid">
          <aside class="chronicle-module-sidebar">
            <section class="chronicle-editor-section">
              <div class="chronicle-section-title-row chronicle-module-title-row">
                <h3>Modules</h3>
                ${renderAiModuleGenerationControl(workspace)}
              </div>
              ${canManageModules
                ? renderModuleChecklist(workspace, assignedModuleSectionIds)
                : '<p class="chronicle-muted">Choose a template before adding section modules.</p>'}
            </section>
          </aside>
          <section class="chronicle-module-board" aria-label="Chronicle module board">
            ${assignedModules.length
              ? assignedModules.map(({ module, section, fields }) => renderModuleCard(module, section, fields, valuesByFieldId)).join("")
              : `<div class="chronicle-empty chronicle-board-empty">
                  <h2>No modules assigned</h2>
                  <p>Add a section module from the sidebar to start editing this element's extra descriptors.</p>
                </div>`}
          </section>
        </div>
      </form>
    `;
    initializeInlineMarkdownEditors();
  }

  function renderBackToCanvasLink() {
    const universeId = state.routeContext?.universeId || state.workspace?.element?.universe_id || "";
    if (!universeId) {
      return "";
    }

    return `
      <a class="secondary-action compact-action chronicle-nav-button" href="universe-canvas.html?universe_id=${encodeURIComponent(universeId)}">
        Back to the Builder
      </a>
    `;
  }

  function renderWorkspaceImageHeader(image, elementName) {
    const imageUrl = image?.image_url || "";
    if (!imageUrl) {
      return "";
    }

    return `
      <figure class="chronicle-editor-image-header">
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(elementName || "Element image")}">
        <button class="chronicle-editor-view-image" type="button" data-chronicle-open-image="${escapeHtml(image.id || "")}">
          <ph-arrow-square-out weight="bold" aria-hidden="true"></ph-arrow-square-out>
          Open Image
        </button>
      </figure>
    `;
  }

  function renderWorkspaceImageThumbnails(images, elementName) {
    if (!images.length) {
      return "";
    }

    return `
      <div class="chronicle-editor-image-thumbnails" aria-label="Element images">
        ${images.map((image, index) => `
          <button class="chronicle-editor-image-thumb${index === 0 ? " is-active" : ""}" type="button" data-chronicle-open-image="${escapeHtml(image.id || "")}" aria-label="Open image ${index + 1}">
            <img src="${escapeHtml(image.image_url || "")}" alt="${escapeHtml(elementName || "Element image")} ${index + 1}">
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderWorkspaceImagePanel(images, elementName) {
    const primaryImage = images[0] || null;
    const imageMarkup = primaryImage?.image_url ? renderWorkspaceImageHeader(primaryImage, elementName) : '<div class="chronicle-editor-image-empty"><ph-image-square weight="duotone" aria-hidden="true"></ph-image-square><p>No images yet.</p></div>';

    return `
      <section class="chronicle-editor-image-panel">
        <div class="chronicle-editor-image-actions">
          <div>
            <p class="chronicle-eyebrow">Image</p>
            <h3>${primaryImage?.image_url ? "Primary Image" : "Generate Concept Art"}</h3>
          </div>
          <div class="chronicle-editor-image-buttons">
            <button class="primary-action compact-action" type="button" data-chronicle-generate-image>
              <ph-sparkle weight="bold" aria-hidden="true"></ph-sparkle>
              ${primaryImage?.image_url ? "Generate New Image" : "Generate Image"}
            </button>
            <label class="secondary-action compact-action" for="chronicle-image-upload">
              <ph-upload-simple weight="bold" aria-hidden="true"></ph-upload-simple>
              Upload Image
            </label>
            <input id="chronicle-image-upload" type="file" accept="image/*" data-chronicle-image-upload hidden>
          </div>
        </div>
        ${imageMarkup}
        ${renderWorkspaceImageThumbnails(images, elementName)}
      </section>
    `;
  }

  function renderBackToChronicleLink() {
    return `
      <a class="secondary-action compact-action chronicle-nav-button chronicle-homepage-button" href="${escapeHtml(getReturnToChronicleUrl())}">
        Chronicle Homepage
      </a>
    `;
  }

  function renderTemplateChoiceHint(workspace) {
    if (!workspace.element?.element_type_id) {
      return '<p class="chronicle-muted">Choose an element type to see templates and section modules.</p>';
    }
    if (workspace.templates.length > 1 && !workspace.template) {
      return '<p class="chronicle-muted">Choose a template to unlock its section modules.</p>';
    }
    if (!workspace.templates.length) {
      return '<p class="chronicle-muted">This element type does not have templates yet.</p>';
    }
    return "";
  }

  function renderAiModuleGenerationControl(workspace) {
    const universeId = workspace.universe?.id || workspace.element?.universe_id || "";
    const canGenerate = Boolean(universeId && workspace.template?.id && workspace.sections.length);
    const reason = !universeId
      ? "Attach this element to a Universe before using Chronicle AI."
      : !workspace.template?.id
        ? "Choose a Chronicle template before using Chronicle AI."
        : !workspace.sections.length
          ? "This template does not have visible modules to generate."
          : "Generate suggestions for blank Chronicle fields.";
    return `
      <div class="chronicle-ai-module-control">
        <button class="secondary-action compact-action chronicle-ai-module-button" type="button" data-chronicle-ai-open${canGenerate ? "" : " disabled"} title="${escapeHtml(reason)}">
          <ph-sparkle weight="bold" aria-hidden="true"></ph-sparkle>
          Generate with AI
        </button>
        ${canGenerate ? "" : `<p class="chronicle-ai-module-hint">${escapeHtml(reason)}</p>`}
      </div>
    `;
  }

  function renderModuleChecklist(workspace, assignedSectionIds) {
    if (!workspace.sections.length) {
      return '<p class="chronicle-muted">This template does not have visible sections yet.</p>';
    }

    const fieldsBySectionId = groupFieldsBySection(workspace.fields);
    return `
      <div class="chronicle-module-checklist">
        ${workspace.sections.map((section) => {
          const fields = fieldsBySectionId.get(section.id) || [];
          const isAssigned = assignedSectionIds.has(section.id);
          return `
            <details class="chronicle-module-option${isAssigned ? " is-assigned" : ""}" data-section-id="${escapeHtml(section.id)}">
              <summary>
                <span>
                  <strong>${escapeHtml(section.name || "Untitled Section")}</strong>
                  <em>${fields.length} ${fields.length === 1 ? "field" : "fields"}</em>
                </span>
                <button class="secondary-action compact-action" type="button" data-${isAssigned ? "remove" : "add"}-module="${escapeHtml(section.id)}">
                  ${isAssigned ? "Remove" : "Add"}
                </button>
              </summary>
              ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}
              ${fields.length ? `
                <ul>
                  ${fields.map((field) => `<li>${escapeHtml(getTemplateFieldLabel(field))}</li>`).join("")}
                </ul>
              ` : '<p>No fields in this section.</p>'}
            </details>
          `;
        }).join("")}
      </div>
    `;
  }

  function getAssignedSectionModules(workspace) {
    const sectionsById = new Map(workspace.sections.map((section) => [section.id, section]));
    const fieldsBySectionId = groupFieldsBySection(workspace.fields);
    return workspace.modules
      .filter((module) => module.module_type === TEMPLATE_SECTION_MODULE_TYPE)
      .map((module) => {
        const sectionId = getModuleSectionId(module);
        const section = sectionsById.get(sectionId);
        if (!section) {
          return null;
        }
        return {
          module,
          section,
          fields: fieldsBySectionId.get(section.id) || []
        };
      })
      .filter(Boolean)
      .sort((left, right) => Number(left.module.sort_order || 0) - Number(right.module.sort_order || 0) || left.section.name.localeCompare(right.section.name));
  }

  function renderModuleCard(module, section, fields, valuesByFieldId) {
    const isCollapsed = isModuleCollapsed(module);
    const fieldGridClass = fields.length > 1 ? "chronicle-template-fields is-multi-field" : "chronicle-template-fields";
    return `
      <article class="chronicle-module-card${isCollapsed ? " is-collapsed" : ""}" data-module-id="${escapeHtml(module.id)}" data-section-id="${escapeHtml(section.id)}">
        <div class="chronicle-module-card-header">
          <div>
            <h3>${escapeHtml(section.name || module.title || "Untitled Module")}</h3>
            ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}
          </div>
          <div class="chronicle-module-card-actions">
            <button class="icon-button" type="button" data-toggle-module="${escapeHtml(module.id)}" aria-expanded="${String(!isCollapsed)}" aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(section.name || "module")}">
              <ph-caret-${isCollapsed ? "down" : "up"} aria-hidden="true"></ph-caret-${isCollapsed ? "down" : "up"}>
            </button>
            <button class="icon-button" type="button" data-remove-module="${escapeHtml(section.id)}" aria-label="Remove ${escapeHtml(section.name || "module")}">
              <ph-x aria-hidden="true"></ph-x>
            </button>
          </div>
        </div>
        <div class="${fieldGridClass}"${isCollapsed ? " hidden" : ""}>
          ${fields.length
            ? fields.map((field) => renderWorkspaceField(field, valuesByFieldId.get(field.id)?.value || "")).join("")
            : '<p class="chronicle-muted">This section does not have fields yet.</p>'}
        </div>
      </article>
    `;
  }

  function isModuleCollapsed(module) {
    return module?.data?.collapsed === true;
  }

  function isDraftSectionModule(module) {
    return Boolean(module?.data?.ai_draft || String(module?.source || "") === "ai_draft");
  }

  function groupFieldsBySection(fields = []) {
    return fields.reduce((map, field) => {
      const key = field.section_id || "";
      const list = map.get(key) || [];
      list.push(field);
      map.set(key, list.sort(sortTemplateFields));
      return map;
    }, new Map());
  }

  function getModuleSectionId(module) {
    return module?.data?.section_id || "";
  }

  function getModuleTemplateId(module) {
    return module?.data?.template_id || "";
  }

  function getNextModuleSortOrder(modules = []) {
    const sortOrders = modules
      .filter((module) => module.module_type === TEMPLATE_SECTION_MODULE_TYPE)
      .map((module) => Number(module.sort_order || 0));
    return sortOrders.length ? Math.max(...sortOrders) + 10 : 10;
  }

  function sortModules(left, right) {
    return Number(left.sort_order || 0) - Number(right.sort_order || 0)
      || String(left.title || "").localeCompare(String(right.title || ""));
  }

  function renderWorkspaceTemplateFields(sections, fields, valuesByFieldId) {
    if (!fields.length) {
      return `<p class="chronicle-muted">No template fields are available for this element.</p>`;
    }

    return buildSectionModels(sections, fields).map((section) => `
      <div class="chronicle-template-section">
        <div class="chronicle-template-section-header">
          <strong>${escapeHtml(section.name)}</strong>
          ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}
        </div>
        <div class="chronicle-template-fields">
          ${section.fields.map((field) => renderWorkspaceField(field, valuesByFieldId.get(field.id)?.value || "")).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderWorkspaceField(field, value) {
    const type = getTemplateFieldType(field);
    const isTextareaType = type === "textarea" || type === "rich_text";
    const label = getTemplateFieldLabel(field);
    const hint = field.hint_text || field.description || "";
    const placeholder = field.placeholder || "";
    const required = field.is_required ? " required" : "";
    const name = `workspace-field:${field.id}`;
    const options = getTemplateFieldOptions(field);
    let control = "";

    if (isTextareaType) {
      control = renderMarkdownTextareaControl({ name, value, placeholder });
    } else if (type === "checkbox") {
      const checked = ["true", "1", "yes", "on"].includes(String(value).toLowerCase()) ? " checked" : "";
      control = `<label class="chronicle-checkbox"><input type="checkbox" name="${escapeHtml(name)}"${checked}> <span>${escapeHtml(placeholder || "Enabled")}</span></label>`;
    } else if (type === "select" || type === "multi_select") {
      const selectedValues = new Set(String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean));
      control = `
        <select name="${escapeHtml(name)}"${type === "multi_select" ? " multiple" : ""}${required}>
          ${type === "select" ? '<option class="chronicle-select-placeholder" value="">Select...</option>' : ""}
          ${options.map((option) => `<option value="${escapeHtml(option)}"${selectedValues.has(option) || value === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      `;
    } else {
      const inputType = type === "number" || type === "date" || type === "url" ? type : "text";
      control = `<input type="${inputType}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${required}>`;
    }

    if (isTextareaType) {
      return `
        <div class="form-field chronicle-template-field is-textarea-field${isWideTemplateField(field) ? " is-wide" : ""}">
          <div class="chronicle-textarea-field-header">
            <span>${escapeHtml(label)}</span>
            <button class="icon-button chronicle-text-edit-button" type="button" data-open-text-editor aria-label="Open Text Editor" title="Open Text Editor">
              <ph-pencil-simple aria-hidden="true"></ph-pencil-simple>
            </button>
          </div>
          ${control}
          ${hint ? `<em>${escapeHtml(hint)}</em>` : ""}
        </div>
      `;
    }

    return `
      <label class="form-field chronicle-template-field${isWideTemplateField(field) ? " is-wide" : ""}">
        <span>${escapeHtml(label)}</span>
        ${control}
        ${hint ? `<em>${escapeHtml(hint)}</em>` : ""}
      </label>
    `;
  }

  function renderMarkdownTextareaControl({ name, value, placeholder }) {
    return `
      <div class="chronicle-markdown-field" data-markdown-field>
        <div class="chronicle-toast-editor-host" data-toast-editor-host></div>
        <textarea class="chronicle-markdown-fallback" name="${escapeHtml(name)}" rows="5" placeholder="${escapeHtml(placeholder)}" data-markdown-textarea hidden>${escapeHtml(value)}</textarea>
      </div>
    `;
  }

  function isWideTemplateField(field) {
    const type = getTemplateFieldType(field);
    return type === "textarea" || type === "rich_text";
  }

  function renderWorkspaceCustomFields(customFields) {
    const rows = customFields.length ? customFields : [{ id: "", name: "", value: "" }];
    return rows.map((field) => renderWorkspaceCustomField(field)).join("");
  }

  function renderWorkspaceCustomField(field) {
    return `
      <div class="chronicle-custom-field-row" data-custom-field-row data-custom-field-id="${escapeHtml(field.id || "")}">
        <input type="text" name="custom-name" value="${escapeHtml(field.name || "")}" placeholder="Field name">
        <textarea name="custom-value" rows="3" placeholder="Value">${escapeHtml(field.value || "")}</textarea>
        <button class="icon-button" type="button" data-chronicle-remove-custom-field aria-label="Remove custom field">
          <ph-trash aria-hidden="true"></ph-trash>
        </button>
      </div>
    `;
  }

  function renderWorkspaceModules(modules) {
    if (!modules.length) {
      return `<p class="chronicle-muted">No Chronicle modules yet. Saving this workspace will keep the element ready for modules.</p>`;
    }

    return `
      <div class="chronicle-module-list">
        ${modules.map((module) => `
          <article class="chronicle-module-row">
            <strong>${escapeHtml(module.title || "Untitled Module")}</strong>
            <span>${escapeHtml(formatModuleType(module.module_type))}</span>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderCreateTypeOptions() {
    if (!dom.createType) {
      return;
    }

    if (!state.elementTypes.length) {
      dom.createType.innerHTML = `<option value="">No element types available</option>`;
      dom.createType.disabled = true;
      return;
    }

    dom.createType.disabled = false;
    dom.createType.innerHTML = state.elementTypes
      .map((type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(type.name)}</option>`)
      .join("");
  }

  function renderContent() {
    if (!dom.content) {
      return;
    }

    if (state.isLoading) {
      dom.content.innerHTML = `<div class="chronicle-empty">Loading Chronicle...</div>`;
      return;
    }

    const rows = getVisibleRows();
    if (state.activeTab === "standalone") {
      renderStandalone(rows);
    } else {
      renderUniverseElements(rows);
    }
  }

  function renderStandalone(rows) {
    if (!rows.length) {
      dom.content.innerHTML = `
        <div class="chronicle-empty">
          <h2>No standalone elements yet</h2>
          <p>Create a standalone element to develop ideas outside a Universe.</p>
          <button class="primary-action" type="button" data-chronicle-create>
            <ph-plus aria-hidden="true"></ph-plus>
            Create Element
          </button>
        </div>
      `;
      dom.content.querySelector("[data-chronicle-create]")?.addEventListener("click", openCreateDialog);
      return;
    }

    dom.content.innerHTML = `
      <div class="chronicle-list" role="list">
        ${rows.map((row) => renderElementRow(row)).join("")}
      </div>
    `;
  }

  function renderUniverseElements(rows) {
    if (!state.selectedUniverseId) {
      dom.content.innerHTML = `
        <div class="chronicle-empty">
          <h2>Choose a universe</h2>
          <p>Select a universe above to browse every element in its canvas.</p>
        </div>
      `;
      return;
    }

    if (!rows.length) {
      const universeName = state.universesById.get(state.selectedUniverseId)?.name || "this universe";
      dom.content.innerHTML = `
        <div class="chronicle-empty">
          <h2>No elements found</h2>
          <p>${escapeHtml(universeName)} does not have any matching elements yet.</p>
        </div>
      `;
      return;
    }

    const selectedUniverseName = state.universesById.get(state.selectedUniverseId)?.name || "";
    const groups = rows.reduce((map, row) => {
      const type = getType(row.element_type_id);
      const typeName = type?.name || "No type";
      const key = type?.id || "no-type";
      if (!map.has(key)) {
        map.set(key, {
          typeName,
          rows: []
        });
      }
      map.get(key).rows.push(row);
      return map;
    }, new Map());

    dom.content.innerHTML = `
      <div class="chronicle-type-groups">
        ${Array.from(groups.values())
          .sort((left, right) => left.typeName.localeCompare(right.typeName))
      .map((group) => `
        <details class="chronicle-type-group">
          <summary>
            <span>${escapeHtml(group.typeName)}</span>
            <span>${group.rows.length} ${group.rows.length === 1 ? "element" : "elements"}</span>
            <ph-caret-down weight="bold" aria-hidden="true"></ph-caret-down>
          </summary>
          <div class="chronicle-list" role="list">
            ${group.rows.map((row) => renderElementRow(row, selectedUniverseName)).join("")}
          </div>
        </details>
      `)
      .join("")}
      </div>
    `;
  }

  function renderElementRow(row, universeName = "") {
    const type = getType(row.element_type_id);
    const modules = state.moduleCounts.get(row.id) || 0;
    const description = row.description?.trim() || "No description yet.";
    const updatedAt = row.updated_at || row.created_at;
    const iconName = sanitizeIconName(type?.icon);
    const editorHref = getEditorHref(row);
    return `
      <a class="chronicle-row" role="listitem" data-element-id="${escapeHtml(row.id)}" href="${escapeHtml(editorHref)}" aria-label="Open ${escapeHtml(row.name)} in Chronicle editor">
        <div class="chronicle-type-icon" style="--type-color:${escapeHtml(type?.color || "#6366f1")}">
          <ph-${escapeHtml(iconName)} weight="duotone" aria-hidden="true"></ph-${escapeHtml(iconName)}>
        </div>
        <div class="chronicle-row-main">
          <div class="chronicle-row-title">
            <h3>${escapeHtml(row.name)}</h3>
            <span>${escapeHtml(type?.name || "No type")}</span>
          </div>
          <p>${escapeHtml(createBlurb(description, 150))}</p>
        </div>
        <dl class="chronicle-row-meta">
          ${universeName ? `<div><dt>Universe</dt><dd>${escapeHtml(universeName)}</dd></div>` : ""}
          <div><dt>Modules</dt><dd>${escapeHtml(formatModuleCount(modules))}</dd></div>
          <div><dt>Updated</dt><dd>${formatDate(updatedAt)}</dd></div>
        </dl>
      </a>
    `;
  }

  function getVisibleRows() {
    const source = state.activeTab === "standalone" ? state.standaloneElements : state.universeElements;
    const normalizedSearch = normalizeSearch(state.search);

    const filtered = normalizedSearch
      ? source.filter((row) => normalizeSearch([
        row.name,
        row.description,
        getType(row.element_type_id)?.name,
        state.universesById.get(row.universe_id)?.name
      ].filter(Boolean).join(" ")).includes(normalizedSearch))
      : [...source];

    return filtered.sort((a, b) => {
      if (state.sort === "name-asc") {
        return a.name.localeCompare(b.name);
      }
      if (state.sort === "type-asc") {
        return (getType(a.element_type_id)?.name || "").localeCompare(getType(b.element_type_id)?.name || "");
      }
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    });
  }

  function formatModuleCount(count) {
    if (!count) {
      return "Not started";
    }
    return `${count} ${count === 1 ? "module" : "modules"}`;
  }

  function getType(typeId) {
    return state.elementTypes.find((type) => type.id === typeId) || null;
  }

  async function handleWorkspaceClick(event) {
    const aiModuleButton = event.target.closest("[data-chronicle-ai-open]");
    if (aiModuleButton) {
      openAiModuleGenerateDialog();
      return;
    }

    const textEditorButton = event.target.closest("[data-open-text-editor]");
    if (textEditorButton) {
      openTextEditorDialog(textEditorButton);
      return;
    }

    const generateImageButton = event.target.closest("[data-chronicle-generate-image]");
    if (generateImageButton) {
      openGenerateImageDialog();
      return;
    }

    const openImageButton = event.target.closest("[data-chronicle-open-image]");
    if (openImageButton) {
      openChronicleImageViewer(openImageButton.dataset.chronicleOpenImage || "");
      return;
    }

    const toggleModuleButton = event.target.closest("[data-toggle-module]");
    if (toggleModuleButton) {
      await toggleSectionModule(toggleModuleButton.dataset.toggleModule);
      return;
    }

    const addModuleButton = event.target.closest("[data-add-module]");
    if (addModuleButton) {
      await addSectionModule(addModuleButton.dataset.addModule);
      return;
    }

    const removeModuleButton = event.target.closest("[data-remove-module]");
    if (removeModuleButton) {
      await removeSectionModule(removeModuleButton.dataset.removeModule);
      return;
    }

    const addButton = event.target.closest("[data-chronicle-add-custom-field]");
    if (addButton) {
      const list = dom.workspace?.querySelector("[data-chronicle-custom-fields]");
      list?.insertAdjacentHTML("beforeend", renderWorkspaceCustomField({ id: "", name: "", value: "" }));
      return;
    }

    const removeButton = event.target.closest("[data-chronicle-remove-custom-field]");
    if (removeButton) {
      const row = removeButton.closest("[data-custom-field-row]");
      const id = row?.dataset.customFieldId;
      if (id) {
        const marker = document.createElement("input");
        marker.type = "hidden";
        marker.name = "deleted-custom-field-id";
        marker.value = id;
        dom.workspace?.querySelector("[data-chronicle-workspace-form]")?.appendChild(marker);
      }
      row?.remove();
    }
  }

  function captureWorkspaceDraft() {
    const workspace = state.workspace;
    const form = dom.workspace?.querySelector("[data-chronicle-workspace-form]");
    if (!workspace?.element || !form) {
      return;
    }

    syncAllInlineMarkdownEditors();
    const valuesByFieldId = new Map(workspace.values.map((value) => [value.template_field_id, value]));
    workspace.fields.forEach((field) => {
      const control = form.elements.namedItem(`workspace-field:${field.id}`);
      if (!control) {
        return;
      }
      const value = readTemplateFieldValue(form, field);
      if (hasMeaningfulValue(value)) {
        valuesByFieldId.set(field.id, {
          ...(valuesByFieldId.get(field.id) || {}),
          element_id: workspace.element.id,
          template_field_id: field.id,
          value
        });
      } else {
        valuesByFieldId.delete(field.id);
      }
    });

    state.workspace = {
      ...workspace,
      element: {
        ...workspace.element,
        name: String(form.elements.namedItem("workspace-name")?.value || "").trim() || workspace.element.name,
        description: String(form.elements.namedItem("workspace-description")?.value || "").trim() || null
      },
      values: [...valuesByFieldId.values()]
    };
  }

  function renderAiModuleChecklist() {
    const workspace = state.workspace;
    const fieldsBySectionId = groupFieldsBySection(workspace.fields);
    dom.aiModuleChecklist.innerHTML = workspace.sections.map((section) => {
      const fields = fieldsBySectionId.get(section.id) || [];
      return `
        <details class="chronicle-ai-module-option" open>
          <summary>
            <label class="chronicle-ai-module-select">
              <input type="checkbox" name="chronicle-ai-section" value="${escapeHtml(section.id)}" checked>
              <span>
                <strong>${escapeHtml(section.name || "Untitled Module")}</strong>
                <em>${fields.length} ${fields.length === 1 ? "field" : "fields"}</em>
              </span>
            </label>
          </summary>
          ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}
          <ul>
            ${fields.length
              ? fields.map((field) => `<li><strong>${escapeHtml(getTemplateFieldLabel(field))}</strong><span>${escapeHtml(getTemplateFieldType(field))}${field.description ? ` — ${escapeHtml(field.description)}` : ""}</span></li>`).join("")
              : "<li>This module has no fields.</li>"}
          </ul>
        </details>
      `;
    }).join("");
  }

  function openAiModuleGenerateDialog() {
    const workspace = state.workspace;
    if (!workspace?.universe?.id && !workspace?.element?.universe_id) {
      setWorkspaceStatus("Attach this element to a Universe before using Chronicle AI.", "error");
      return;
    }
    if (!workspace?.template?.id || !workspace.sections.length) {
      setWorkspaceStatus("Choose a Chronicle template with visible modules before using AI.", "error");
      return;
    }
    if (!dom.aiModuleGenerateModal) {
      return;
    }

    captureWorkspaceDraft();
    state.aiModuleGeneration = { isGenerating: false, proposal: null };
    dom.aiModuleGenerateForm?.reset();
    renderAiModuleChecklist();
    setAiModuleGenerateStatus("");
    dom.aiModuleGenerateModal.hidden = false;
    document.body.classList.add("centralis-modal-open");
    requestAnimationFrame(() => dom.aiModuleInstructions?.focus());
  }

  function closeAiModuleGenerateDialog() {
    if (state.aiModuleGeneration.isGenerating || !dom.aiModuleGenerateModal) {
      return;
    }
    dom.aiModuleGenerateModal.hidden = true;
    if (dom.aiModuleReviewModal?.hidden !== false) {
      document.body.classList.remove("centralis-modal-open");
    }
  }

  function setAiModuleGenerateStatus(message, tone = "") {
    if (!dom.aiModuleGenerateStatus) {
      return;
    }
    dom.aiModuleGenerateStatus.textContent = message;
    dom.aiModuleGenerateStatus.classList.toggle("is-error", tone === "error");
    dom.aiModuleGenerateStatus.classList.toggle("is-success", tone === "success");
  }

  function setAiModuleGenerateBusy(isBusy) {
    state.aiModuleGeneration = {
      ...state.aiModuleGeneration,
      isGenerating: isBusy
    };
    dom.aiModuleGenerateModal?.classList.toggle("is-generating", isBusy);
    if (dom.aiModuleGenerateSubmit) {
      dom.aiModuleGenerateSubmit.disabled = isBusy;
      dom.aiModuleGenerateSubmit.innerHTML = isBusy
        ? '<ph-spinner gap="none" aria-hidden="true"></ph-spinner> Generating...'
        : '<ph-sparkle weight="bold" aria-hidden="true"></ph-sparkle> Generate';
    }
  }

  function getWorkspaceFieldValuesForAi() {
    return Object.fromEntries(state.workspace.values
      .filter((value) => value?.template_field_id)
      .map((value) => [value.template_field_id, String(value.value || "")]));
  }

  async function handleAiModuleGenerateSubmit(event) {
    event.preventDefault();
    const workspace = state.workspace;
    if (!workspace?.element?.id || !workspace.template?.id || state.aiModuleGeneration.isGenerating) {
      return;
    }

    captureWorkspaceDraft();
    const selectedSectionIds = [...dom.aiModuleGenerateForm.querySelectorAll('[name="chronicle-ai-section"]:checked')]
      .map((input) => input.value)
      .filter(Boolean);
    if (!selectedSectionIds.length) {
      setAiModuleGenerateStatus("Choose at least one module to consider.", "error");
      return;
    }

    setAiModuleGenerateBusy(true);
    setAiModuleGenerateStatus("Preparing universe knowledge...");
    try {
      const universeId = workspace.universe?.id || workspace.element.universe_id;
      const syncResponse = await window.centralisSupabase.functions.invoke("sync-universe-ai-source", {
        body: { universeId }
      });
      throwIfError(syncResponse);
      if (syncResponse.data?.error) {
        throw new Error(syncResponse.data.error);
      }

      setAiModuleGenerateStatus("Generating Chronicle details...");
      const response = await window.centralisSupabase.functions.invoke("generate-chronicle-details", {
        body: {
          elementId: workspace.element.id,
          templateId: workspace.template.id,
          sectionIds: selectedSectionIds,
          instructions: dom.aiModuleInstructions?.value || "",
          elementDraft: {
            name: state.workspace.element.name || "",
            description: state.workspace.element.description || ""
          },
          fieldValues: getWorkspaceFieldValuesForAi()
        }
      });
      throwIfError(response);
      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const proposal = response.data?.proposal;
      if (!proposal?.modules?.length) {
        setAiModuleGenerateStatus("No suitable blank Chronicle fields were suggested. Try different modules or add more direction.", "error");
        return;
      }

      state.aiModuleGeneration = { isGenerating: false, proposal };
      dom.aiModuleGenerateModal.hidden = true;
      openAiModuleReviewDialog();
    } catch (error) {
      console.error("Could not generate Chronicle details.", error);
      setAiModuleGenerateStatus(`Could not generate Chronicle details: ${getReadableError(error)}`, "error");
    } finally {
      if (dom.aiModuleGenerateModal?.hidden === false) {
        setAiModuleGenerateBusy(false);
      }
    }
  }

  function renderAiReviewField(module, field) {
    const name = `chronicle-ai-review:${module.sectionId}:${field.fieldId}`;
    const type = String(field.fieldType || "text");
    const options = Array.isArray(field.options) ? field.options : [];
    const value = String(field.value || "");
    let control = "";

    if (type === "textarea" || type === "rich_text") {
      control = `<textarea name="${escapeHtml(name)}" rows="4" data-chronicle-ai-review-field data-field-id="${escapeHtml(field.fieldId)}">${escapeHtml(value)}</textarea>`;
    } else if (type === "checkbox") {
      control = `<label class="chronicle-checkbox"><input type="checkbox" name="${escapeHtml(name)}" data-chronicle-ai-review-field data-field-id="${escapeHtml(field.fieldId)}"${value === "true" ? " checked" : ""}> <span>Enabled</span></label>`;
    } else if (type === "select" || type === "multi_select") {
      const selectedValues = new Set(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean));
      control = `<select name="${escapeHtml(name)}" data-chronicle-ai-review-field data-field-id="${escapeHtml(field.fieldId)}"${type === "multi_select" ? " multiple" : ""}>
        ${type === "select" ? '<option value="">Select...</option>' : ""}
        ${options.map((option) => `<option value="${escapeHtml(option)}"${selectedValues.has(option) ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>`;
    } else {
      const inputType = ["number", "date", "url"].includes(type) ? type : "text";
      control = `<input type="${inputType}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" data-chronicle-ai-review-field data-field-id="${escapeHtml(field.fieldId)}">`;
    }

    return `
      <label class="form-field chronicle-ai-review-field">
        <span>${escapeHtml(field.label || "Untitled Field")}</span>
        ${control}
      </label>
    `;
  }

  function openAiModuleReviewDialog() {
    const proposal = state.aiModuleGeneration.proposal;
    if (!proposal?.modules?.length || !dom.aiModuleReviewModal) {
      return;
    }
    dom.aiModuleReviewContent.innerHTML = proposal.modules.map((module) => `
      <article class="chronicle-ai-review-module" data-chronicle-ai-review-module="${escapeHtml(module.sectionId)}">
        <label class="chronicle-ai-review-module-toggle">
          <input type="checkbox" name="chronicle-ai-review-module" value="${escapeHtml(module.sectionId)}" checked>
          <span>
            <strong>${escapeHtml(module.sectionName || "Untitled Module")}</strong>
            <em>${module.isExisting ? "Existing module — blank fields only" : "New module"}</em>
          </span>
        </label>
        ${module.sectionDescription ? `<p>${escapeHtml(module.sectionDescription)}</p>` : ""}
        <div class="chronicle-ai-review-fields">
          ${module.fields.map((field) => renderAiReviewField(module, field)).join("")}
        </div>
      </article>
    `).join("");
    if (dom.aiModuleReviewStatus) {
      dom.aiModuleReviewStatus.textContent = "";
    }
    dom.aiModuleReviewModal.hidden = false;
    document.body.classList.add("centralis-modal-open");
  }

  function closeAiModuleReviewDialog() {
    if (!dom.aiModuleReviewModal) {
      return;
    }
    dom.aiModuleReviewModal.hidden = true;
    state.aiModuleGeneration = { isGenerating: false, proposal: null };
    if (dom.aiModuleGenerateModal?.hidden !== false) {
      document.body.classList.remove("centralis-modal-open");
    }
  }

  function readAiReviewFieldValue(control, fieldType) {
    if (fieldType === "checkbox") {
      return control?.checked ? "true" : "";
    }
    if (fieldType === "multi_select") {
      return control ? [...control.selectedOptions].map((option) => option.value).join("\n") : "";
    }
    return String(control?.value || "").trim();
  }

  function setAiModuleReviewStatus(message, tone = "") {
    if (!dom.aiModuleReviewStatus) {
      return;
    }
    dom.aiModuleReviewStatus.textContent = message;
    dom.aiModuleReviewStatus.classList.toggle("is-error", tone === "error");
  }

  async function handleAiModuleReviewSubmit(event) {
    event.preventDefault();
    const proposal = state.aiModuleGeneration.proposal;
    const workspace = state.workspace;
    if (!proposal?.modules?.length || !workspace?.element?.id || !workspace.template?.id) {
      return;
    }

    captureWorkspaceDraft();
    const selectedSectionIds = new Set([...dom.aiModuleReviewForm.querySelectorAll('[name="chronicle-ai-review-module"]:checked')]
      .map((input) => input.value));
    if (!selectedSectionIds.size) {
      setAiModuleReviewStatus("Choose at least one suggested module to add to the editor.", "error");
      return;
    }

    const fieldsById = new Map(workspace.fields.map((field) => [field.id, field]));
    const valuesByFieldId = new Map(workspace.values.map((value) => [value.template_field_id, value]));
    const existingSections = new Set(getAssignedSectionModules(workspace).map((item) => item.section.id));
    let nextSortOrder = getNextModuleSortOrder(workspace.modules);
    const nextModules = [...workspace.modules];

    proposal.modules.forEach((module) => {
      if (!selectedSectionIds.has(module.sectionId)) {
        return;
      }
      if (!existingSections.has(module.sectionId)) {
        nextModules.push({
          id: `ai-draft:${module.sectionId}`,
          element_id: workspace.element.id,
          user_id: state.user.id,
          module_type: TEMPLATE_SECTION_MODULE_TYPE,
          source: "ai_draft",
          title: module.sectionName || "Untitled Module",
          sort_order: nextSortOrder,
          data: {
            section_id: module.sectionId,
            template_id: workspace.template.id,
            ai_draft: true
          }
        });
        nextSortOrder += 10;
        existingSections.add(module.sectionId);
      }

      module.fields.forEach((suggestion) => {
        const field = fieldsById.get(suggestion.fieldId);
        const control = dom.aiModuleReviewForm.elements.namedItem(`chronicle-ai-review:${module.sectionId}:${suggestion.fieldId}`);
        if (!field || !control || hasMeaningfulValue(valuesByFieldId.get(field.id)?.value)) {
          return;
        }
        const value = readAiReviewFieldValue(control, getTemplateFieldType(field));
        if (!hasMeaningfulValue(value)) {
          return;
        }
        valuesByFieldId.set(field.id, {
          element_id: workspace.element.id,
          template_field_id: field.id,
          value
        });
      });
    });

    state.workspace = {
      ...workspace,
      modules: nextModules.sort(sortModules),
      values: [...valuesByFieldId.values()]
    };
    closeAiModuleReviewDialog();
    renderWorkspace();
    setWorkspaceStatus("AI suggestions added to the editor. Save Element when you are ready to persist them.", "success");
  }

  function clampImagePrompt(prompt, maxLength = MAX_IMAGE_PROMPT_LENGTH) {
    const normalized = String(prompt || "").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength - 74).trimEnd()}\n\n[Prompt shortened to fit the image generation limit.]`;
  }

  function createWorkspaceImagePrompt() {
    const workspace = state.workspace;
    const element = workspace?.element;
    if (!element) {
      return "";
    }

    const type = getType(element.element_type_id);
    const assignedModules = getAssignedSectionModules(workspace);
    const moduleDetails = assignedModules
      .map(({ section, fields }) => {
        const values = fields
          .map((field) => {
            const value = workspace.values.find((item) => item.template_field_id === field.id);
            const text = getStoredTemplateFieldValue(value);
            return text ? `${getTemplateFieldLabel(field)}: ${text}` : "";
          })
          .filter(Boolean);
        return values.length ? `${section.name}: ${values.join("; ")}` : "";
      })
      .filter(Boolean);
    const customDetails = workspace.customFields
      .map((field) => [field.name, field.value].filter(Boolean).join(": "))
      .filter(Boolean);

    return clampImagePrompt([
      `Create a cinematic concept art image for this Chronicle element.`,
      `Name: ${element.name || "Untitled Element"}.`,
      type?.name ? `Element type: ${type.name}.` : "",
      workspace.universe?.name ? `Universe: ${workspace.universe.name}.` : "",
      element.description ? `Description: ${element.description}.` : "",
      moduleDetails.length ? `Module details: ${moduleDetails.join(" | ")}.` : "",
      customDetails.length ? `Custom details: ${customDetails.join(" | ")}.` : "",
      "Do not include text, labels, logos, UI, or watermarks."
    ].filter(Boolean).join("\n"));
  }

  function getStoredTemplateFieldValue(valueRow) {
    if (!valueRow) {
      return "";
    }

    return String(valueRow.value_text ?? valueRow.value_number ?? valueRow.value_boolean ?? valueRow.value_json ?? "").trim();
  }

  function setGenerateImageStatus(message, tone = "") {
    if (!dom.generateImageStatus) {
      return;
    }
    dom.generateImageStatus.textContent = message || "";
    dom.generateImageStatus.classList.toggle("is-error", tone === "error");
    dom.generateImageStatus.classList.toggle("is-success", tone === "success");
  }

  function setGenerateImageBusy(isBusy) {
    if (dom.generateImageForm) {
      dom.generateImageForm.dataset.generating = String(isBusy);
    }
    if (dom.generateImageSubmit) {
      dom.generateImageSubmit.disabled = isBusy;
      dom.generateImageSubmit.innerHTML = isBusy
        ? "Generating..."
        : '<ph-sparkle weight="bold" aria-hidden="true"></ph-sparkle>Generate';
    }
  }

  function openGenerateImageDialog() {
    const element = state.workspace?.element;
    if (!element || !dom.generateImageModal || !dom.generateImagePrompt) {
      return;
    }

    state.activeImageGenerationElementId = element.id;
    dom.generateImagePrompt.maxLength = MAX_IMAGE_PROMPT_LENGTH;
    dom.generateImagePrompt.value = createWorkspaceImagePrompt();
    if (dom.generateImageSubtitle) {
      dom.generateImageSubtitle.textContent = `Review or edit the generated image prompt for ${element.name || "this element"}.`;
    }
    setGenerateImageStatus("");
    setGenerateImageBusy(false);
    dom.generateImageModal.hidden = false;
    dom.generateImagePrompt.focus();
  }

  function closeGenerateImageDialog() {
    if (dom.generateImageModal) {
      dom.generateImageModal.hidden = true;
    }
    state.activeImageGenerationElementId = "";
    dom.generateImageForm?.reset();
    setGenerateImageStatus("");
    setGenerateImageBusy(false);
  }

  async function refreshWorkspaceImages() {
    const elementId = state.workspace?.element?.id;
    if (!elementId) {
      return;
    }

    const imageResponse = await fetchObjectImages([elementId]);
    state.workspace = {
      ...state.workspace,
      images: normalizeImages(imageResponse.images || [])
    };
    renderWorkspace();
  }

  async function uploadWorkspaceImage(file) {
    const element = state.workspace?.element;
    if (!element?.id) {
      return;
    }
    if (!file.type?.startsWith("image/")) {
      setWorkspaceStatus("Choose an image file to upload.", "error");
      return;
    }

    const body = new FormData();
    body.append("objectId", element.id);
    body.append("storageModule", "chronicle");
    body.append("file", file);
    setWorkspaceStatus("Uploading image...");

    try {
      const response = await window.centralisSupabase.functions.invoke("upload-object-image", { body });
      throwIfError(response);
      const uploadedImage = response.data?.image || null;
      await refreshWorkspaceImages();
      setWorkspaceStatus("Image uploaded.", "success");
      return uploadedImage;
    } catch (error) {
      setWorkspaceStatus(`Could not upload image: ${getReadableError(error)}`, "error");
      throw error;
    }
  }

  function getWorkspaceViewerImages() {
    return normalizeImages(state.workspace?.images || []);
  }

  function getActiveWorkspaceViewerImage() {
    const images = getWorkspaceViewerImages();
    return images.find((image) => image.id === state.activeImageViewerId) || images[0] || null;
  }

  function getChronicleViewerImageName(image, index, total) {
    const baseName = state.workspace?.element?.name || image?.id || "Chronicle image";
    return total > 1 ? `${baseName} Image (${index + 1} of ${total})` : `${baseName} Image`;
  }

  function getChronicleViewerDownloadName(image) {
    const elementName = state.workspace?.element?.name || "chronicle-image";
    const safeName = elementName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "chronicle-image";
    return `${safeName}-${image?.id || Date.now()}.png`;
  }

  function getChronicleViewerImages() {
    const images = getWorkspaceViewerImages();
    const total = images.length;
    return images.map((image, index) => ({
      id: image.id,
      src: image.image_url || "",
      name: getChronicleViewerImageName(image, index, total),
      downloadName: getChronicleViewerDownloadName(image),
      alt: state.workspace?.element?.name || "Chronicle image",
      isPrimary: Boolean(image.is_primary),
      metadata: image
    }));
  }

  async function uploadChronicleViewerImage(file) {
    const uploadedImage = await uploadWorkspaceImage(file);
    const images = getChronicleViewerImages();
    return {
      images,
      activeImageId: uploadedImage?.id || images.at(-1)?.id || state.activeImageViewerId || ""
    };
  }

  function getChronicleViewerDetails(image, index) {
    const element = state.workspace?.element || {};
    const universeName = state.workspace?.universe?.name || "Standalone Chronicle element";
    const elementType = getType(element.element_type_id)?.name || "Element";
    const total = getWorkspaceViewerImages().length;
    return {
      imageInfo: {
        title: "Image Information",
        rows: [
          ["Source", "Chronicle element image"],
          ["Selected Image", image?.id || "Unknown"],
          ["Images in Set", String(total)],
          ["Image Role", image?.isPrimary ? "Primary" : `Image ${index + 1}`]
        ]
      },
      objectDetails: {
        title: "Object Details",
        rows: [
          ["Element", element.name || "Untitled element"],
          ["Element Type", elementType],
          ["Universe", universeName]
        ],
        body: element.description || ""
      }
    };
  }

  function setChronicleImageViewerStatus(message, tone = "") {
    if (!dom.imageViewerStatus) {
      return;
    }
    dom.imageViewerStatus.textContent = message || "";
    dom.imageViewerStatus.classList.toggle("is-error", tone === "error");
    dom.imageViewerStatus.classList.toggle("is-success", tone === "success");
  }

  function renderChronicleImageViewer() {
    const modal = dom.imageViewerModal;
    const activeImage = getActiveWorkspaceViewerImage();
    const images = getWorkspaceViewerImages();
    if (!modal || !activeImage || !images.length) {
      closeChronicleImageViewer();
      return;
    }

    const activeIndex = Math.max(0, images.findIndex((image) => image.id === activeImage.id));
    state.activeImageViewerId = activeImage.id;
    if (dom.imageViewerTitle) {
      dom.imageViewerTitle.textContent = `${state.workspace?.element?.name || "Element"} Image (${activeIndex + 1} of ${images.length})`;
    }
    if (dom.imageViewerImage) {
      dom.imageViewerImage.src = activeImage.image_url || "";
      dom.imageViewerImage.alt = state.workspace?.element?.name || "Element image";
      dom.imageViewerImage.style.transform = "";
    }
    if (dom.imageViewerThumbs) {
      dom.imageViewerThumbs.innerHTML = images.map((image, index) => `
        <button class="image-thumb${image.id === activeImage.id ? " is-active" : ""}" type="button" data-chronicle-image-viewer-thumb="${escapeHtml(image.id || "")}" aria-label="Show image ${index + 1}">
          <img src="${escapeHtml(image.image_url || "")}" alt="">
        </button>
      `).join("");
    }
    if (dom.imageViewerPrimary) {
      dom.imageViewerPrimary.checked = Boolean(activeImage.is_primary);
      dom.imageViewerPrimary.disabled = Boolean(activeImage.is_primary);
    }
    const previous = modal.querySelector("[data-chronicle-image-viewer-prev]");
    const next = modal.querySelector("[data-chronicle-image-viewer-next]");
    if (previous) previous.disabled = images.length < 2;
    if (next) next.disabled = images.length < 2;
    setChronicleImageViewerStatus("");
  }

  function openChronicleImageViewer(imageId = "") {
    const images = getWorkspaceViewerImages();
    if (!images.length) {
      return;
    }
    state.activeImageViewerId = images.some((image) => image.id === imageId) ? imageId : images[0].id;
    if (typeof window.openCentralisImageViewer === "function") {
      window.openCentralisImageViewer({
        title: state.workspace?.element?.name || "Chronicle Image",
        kicker: "Chronicle Image Viewer",
        images: getChronicleViewerImages(),
        activeImageId: state.activeImageViewerId,
        details: getChronicleViewerDetails,
        capabilities: {
          canNavigate: true,
          canShowThumbnails: images.length > 1,
          canSetPrimary: true,
          canOpen: true,
          canDownload: true,
          canDelete: true,
          canUpload: true,
          uploadMode: "add",
          uploadLabel: "Upload"
        },
        actions: {
          changeImage: (image) => {
            state.activeImageViewerId = image?.id || "";
          },
          upload: uploadChronicleViewerImage,
          setPrimary: setChronicleViewerPrimaryImage,
          delete: deleteChronicleViewerImage
        }
      });
      return;
    }
    if (dom.imageViewerModal) {
      dom.imageViewerModal.hidden = false;
      document.body.classList.add("centralis-modal-open");
      renderChronicleImageViewer();
    }
  }

  function closeChronicleImageViewer() {
    if (dom.imageViewerModal) {
      dom.imageViewerModal.hidden = true;
    }
    state.activeImageViewerId = "";
    setChronicleImageViewerStatus("");
    document.body.classList.remove("centralis-modal-open");
  }

  function moveChronicleImageViewer(direction) {
    const images = getWorkspaceViewerImages();
    if (!images.length) {
      return;
    }
    const index = Math.max(0, images.findIndex((image) => image.id === state.activeImageViewerId));
    state.activeImageViewerId = images[(index + direction + images.length) % images.length].id;
    renderChronicleImageViewer();
  }

  async function setChronicleViewerPrimaryImage(viewerImage = null) {
    const isSharedViewerImage = Boolean(viewerImage?.metadata);
    const image = viewerImage?.metadata || getActiveWorkspaceViewerImage();
    if (!image || image.is_primary) {
      return;
    }

    if (dom.imageViewerPrimary) dom.imageViewerPrimary.disabled = true;
    setChronicleImageViewerStatus("Setting primary image...");
    try {
      const response = await window.centralisSupabase.functions.invoke("set-primary-image", {
        body: { imageId: image.id }
      });
      throwIfError(response);
      await refreshWorkspaceImages();
      state.activeImageViewerId = image.id;
      if (!isSharedViewerImage) renderChronicleImageViewer();
      setChronicleImageViewerStatus("Primary image updated.", "success");
      return {
        images: getChronicleViewerImages(),
        activeImageId: image.id
      };
    } catch (error) {
      setChronicleImageViewerStatus(`Could not set primary image: ${getReadableError(error)}`, "error");
      if (dom.imageViewerPrimary) {
        dom.imageViewerPrimary.checked = false;
        dom.imageViewerPrimary.disabled = false;
      }
      throw error;
    }
  }

  async function deleteChronicleViewerImage(viewerImage = null) {
    const isSharedViewerImage = Boolean(viewerImage?.metadata);
    const image = viewerImage?.metadata || getActiveWorkspaceViewerImage();
    if (!image || !window.confirm("Delete this image?")) {
      return false;
    }

    const deleteButton = dom.imageViewerModal?.querySelector("[data-chronicle-image-viewer-delete]");
    if (deleteButton) deleteButton.disabled = true;
    setChronicleImageViewerStatus("Deleting image...");
    try {
      const response = await window.centralisSupabase.functions.invoke("delete-object-image", {
        body: { imageId: image.id }
      });
      throwIfError(response);
      const remainingImages = getWorkspaceViewerImages().filter((item) => item.id !== image.id);
      state.activeImageViewerId = remainingImages[0]?.id || "";
      await refreshWorkspaceImages();
      if (!state.activeImageViewerId) {
        if (!isSharedViewerImage) closeChronicleImageViewer();
        return { close: true };
      } else {
        if (!isSharedViewerImage) renderChronicleImageViewer();
        setChronicleImageViewerStatus("Image deleted.", "success");
        return {
          images: getChronicleViewerImages(),
          activeImageId: state.activeImageViewerId
        };
      }
    } catch (error) {
      setChronicleImageViewerStatus(`Could not delete image: ${getReadableError(error)}`, "error");
      throw error;
    } finally {
      if (deleteButton) deleteButton.disabled = false;
    }
  }

  function bindChronicleImageViewer() {
    const modal = dom.imageViewerModal;
    if (!modal) {
      return;
    }

    modal.querySelectorAll("[data-chronicle-image-viewer-close]").forEach((button) => {
      button.addEventListener("click", closeChronicleImageViewer);
    });
    modal.querySelector("[data-chronicle-image-viewer-prev]")?.addEventListener("click", () => moveChronicleImageViewer(-1));
    modal.querySelector("[data-chronicle-image-viewer-next]")?.addEventListener("click", () => moveChronicleImageViewer(1));
    modal.querySelector("[data-chronicle-image-viewer-open]")?.addEventListener("click", () => {
      const image = getActiveWorkspaceViewerImage();
      if (image?.image_url) {
        window.open(image.image_url, "_blank", "noopener,noreferrer");
      }
    });
    modal.querySelector("[data-chronicle-image-viewer-download]")?.addEventListener("click", () => {
      const image = getActiveWorkspaceViewerImage();
      if (!image?.image_url) {
        return;
      }
      const link = document.createElement("a");
      link.href = image.image_url;
      link.download = `centralis-image-${image.id || Date.now()}.png`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    });
    modal.querySelector("[data-chronicle-image-viewer-delete]")?.addEventListener("click", deleteChronicleViewerImage);
    dom.imageViewerPrimary?.addEventListener("change", setChronicleViewerPrimaryImage);
    modal.querySelector("[data-chronicle-image-viewer-thumbs]")?.addEventListener("click", (event) => {
      const thumb = event.target.closest("[data-chronicle-image-viewer-thumb]");
      if (!thumb) {
        return;
      }
      state.activeImageViewerId = thumb.dataset.chronicleImageViewerThumb || "";
      renderChronicleImageViewer();
    });
  }

  async function handleGenerateImageSubmit(event) {
    event.preventDefault();
    if (dom.generateImageForm?.dataset.generating === "true") {
      return;
    }

    const element = state.workspace?.element;
    if (!element || state.activeImageGenerationElementId !== element.id) {
      setGenerateImageStatus("No active element is selected.", "error");
      return;
    }

    const type = getType(element.element_type_id);
    setGenerateImageBusy(true);
    setGenerateImageStatus("Generating image...");

    try {
      const response = await window.centralisSupabase.functions.invoke("generate-object-image", {
        body: {
          objectId: element.id,
          storageModule: "chronicle",
          objectKind: "element",
          elementType: type?.name || "",
          name: element.name || "",
          description: element.description || "",
          extraPrompt: clampImagePrompt(dom.generateImagePrompt?.value || createWorkspaceImagePrompt())
        }
      });
      throwIfError(response);
      closeGenerateImageDialog();
      setWorkspaceStatus("Image generated.", "success");
      await refreshWorkspaceImages();
    } catch (error) {
      setGenerateImageStatus(`Could not generate image: ${getReadableError(error)}`, "error");
      setGenerateImageBusy(false);
    }
  }

  function initializeInlineMarkdownEditors() {
    if (state.pageMode !== "editor" || !dom.workspace) {
      return;
    }

    const Editor = getToastEditorConstructor();
    dom.workspace.querySelectorAll("[data-markdown-field]").forEach((field) => {
      if (state.markdownEditors.has(field)) {
        return;
      }

      const textarea = field.querySelector("[data-markdown-textarea]");
      const host = field.querySelector("[data-toast-editor-host]");
      if (!textarea || !host) {
        return;
      }

      if (!Editor) {
        textarea.hidden = false;
        return;
      }

      textarea.hidden = true;
      const editor = new Editor({
        el: host,
        height: "280px",
        initialValue: textarea.value || "",
        initialEditType: "wysiwyg",
        previewStyle: "tab",
        placeholder: textarea.placeholder || "",
        theme: "dark",
        usageStatistics: false,
        hideModeSwitch: true,
        toolbarItems: []
      });
      editor.on("change", () => {
        textarea.value = editor.getMarkdown();
      });
      state.markdownEditors.set(field, editor);
    });
  }

  function destroyInlineMarkdownEditors() {
    if (!state.markdownEditors?.size) {
      return;
    }

    state.markdownEditors.forEach((editor) => {
      try {
        editor.destroy();
      } catch (error) {
        console.warn("Could not destroy Chronicle text editor.", error);
      }
    });
    state.markdownEditors.clear();
  }

  function syncTextareaFromToastEditor(field) {
    const editor = state.markdownEditors.get(field);
    const textarea = field?.querySelector("[data-markdown-textarea]");
    if (editor && textarea) {
      textarea.value = editor.getMarkdown();
    }
  }

  function syncToastEditorFromTextarea(field) {
    const editor = state.markdownEditors.get(field);
    const textarea = field?.querySelector("[data-markdown-textarea]");
    if (editor && textarea) {
      editor.setMarkdown(textarea.value || "", false);
    }
  }

  function syncAllInlineMarkdownEditors() {
    state.markdownEditors.forEach((editor, field) => {
      const textarea = field?.querySelector("[data-markdown-textarea]");
      if (textarea) {
        textarea.value = editor.getMarkdown();
      }
    });
  }

  function openTextEditorDialog(button) {
    const wrapper = button.closest(".chronicle-template-field");
    const field = wrapper?.querySelector("[data-markdown-field]") || button.closest("[data-markdown-field]");
    const textarea = field?.querySelector("[data-markdown-textarea]");
    if (!field || !textarea || !dom.textEditorModal) {
      return;
    }

    syncTextareaFromToastEditor(field);
    closeTextEditorDialog();

    const label = wrapper?.querySelector(".chronicle-textarea-field-header > span")?.textContent?.trim()
      || field.closest(".chronicle-template-field")?.querySelector(":scope > span")?.textContent?.trim()
      || "Text";
    const title = document.getElementById("chronicle-text-editor-title");
    if (title) {
      title.textContent = `Edit ${label}`;
    }
    if (dom.textEditorSubtitle) {
      dom.textEditorSubtitle.textContent = "Use Normal or Markdown mode. Apply writes the Markdown back to the field.";
    }

    state.activeTextEditorDialog = {
      field,
      textarea,
      editor: null
    };
    dom.textEditorModal.hidden = false;

    const Editor = getToastEditorConstructor();
    if (Editor && dom.textEditorHost) {
      dom.textEditorHost.hidden = false;
      dom.textEditorHost.innerHTML = "";
      if (dom.textEditorFallback) {
        dom.textEditorFallback.hidden = true;
      }
      const editor = new Editor({
        el: dom.textEditorHost,
        height: "520px",
        initialValue: textarea.value || "",
        initialEditType: "wysiwyg",
        previewStyle: "tab",
        placeholder: textarea.placeholder || "",
        theme: "dark",
        usageStatistics: false,
        toolbarItems: getMarkdownToolbarItems()
      });
      state.activeTextEditorDialog.editor = editor;
      requestAnimationFrame(() => editor.focus());
      return;
    }

    if (dom.textEditorFallback) {
      dom.textEditorFallback.hidden = false;
      dom.textEditorFallback.value = textarea.value || "";
      requestAnimationFrame(() => dom.textEditorFallback?.focus());
    }
  }

  function closeTextEditorDialog() {
    if (state.activeTextEditorDialog?.editor) {
      try {
        state.activeTextEditorDialog.editor.destroy();
      } catch (error) {
        console.warn("Could not destroy Chronicle dialog editor.", error);
      }
    }

    state.activeTextEditorDialog = null;
    if (dom.textEditorHost) {
      dom.textEditorHost.innerHTML = "";
      dom.textEditorHost.hidden = false;
    }
    if (dom.textEditorFallback) {
      dom.textEditorFallback.hidden = true;
      dom.textEditorFallback.value = "";
    }
    if (dom.textEditorModal) {
      dom.textEditorModal.hidden = true;
    }
  }

  function applyTextEditorDialog() {
    const active = state.activeTextEditorDialog;
    if (!active?.textarea) {
      closeTextEditorDialog();
      return;
    }

    const markdown = active.editor
      ? active.editor.getMarkdown()
      : String(dom.textEditorFallback?.value || "");
    active.textarea.value = markdown;
    syncToastEditorFromTextarea(active.field);
    closeTextEditorDialog();
  }

  function getToastEditorConstructor() {
    return window.toastui?.Editor || null;
  }

  function getMarkdownToolbarItems() {
    return [
      ["heading", "bold", "italic", "strike"],
      ["hr", "quote"],
      ["ul", "ol"],
      ["code", "codeblock"],
      ["link"]
    ];
  }

  async function handleWorkspaceChange(event) {
    const target = event.target;
    if (target.matches("[data-chronicle-image-upload]")) {
      const file = target.files?.[0];
      target.value = "";
      if (file) {
        await uploadWorkspaceImage(file);
      }
      return;
    }

    if (target.matches("[data-chronicle-element-type-select]")) {
      await updateWorkspaceElementType(target.value);
      return;
    }

    if (target.matches("[data-chronicle-template-select]")) {
      await updateWorkspaceTemplate(target.value);
    }
  }

  async function updateWorkspaceElementType(elementTypeId) {
    const nextTemplates = elementTypeId ? await fetchTemplatesForType(elementTypeId) : [];
    const nextTemplate = nextTemplates.length === 1 ? nextTemplates[0] : null;
    const templateDetails = nextTemplate ? await fetchTemplateDetails(nextTemplate.id) : { sections: [], fields: [] };
    state.workspace = {
      ...state.workspace,
      element: {
        ...state.workspace.element,
        element_type_id: elementTypeId || null,
        rich_template_id: nextTemplate?.id || null
      },
      templates: nextTemplates,
      template: nextTemplate,
      sections: templateDetails.sections,
      fields: templateDetails.fields,
      modules: [],
      modulesResetPending: true
    };
    renderWorkspace();
  }

  async function updateWorkspaceTemplate(templateId) {
    const nextTemplate = templateId
      ? state.workspace.templates.find((template) => template.id === templateId) || null
      : null;
    const templateDetails = nextTemplate ? await fetchTemplateDetails(nextTemplate.id) : { sections: [], fields: [] };
    state.workspace = {
      ...state.workspace,
      element: {
        ...state.workspace.element,
        rich_template_id: nextTemplate?.id || null
      },
      template: nextTemplate,
      sections: templateDetails.sections,
      fields: templateDetails.fields,
      modules: state.workspace.modules.filter((module) => getModuleTemplateId(module) === nextTemplate?.id),
      modulesResetPending: true
    };
    renderWorkspace();
  }

  async function addSectionModule(sectionId) {
    if (!state.workspace?.element?.id || !state.workspace.template?.id || !sectionId) {
      return;
    }

    const section = state.workspace.sections.find((item) => item.id === sectionId);
    if (!section) {
      return;
    }

    const existingResponse = await window.centralisSupabase
      .from(CHRONICLE_MODULES_TABLE)
      .select("*")
      .eq("user_id", state.user.id)
      .eq("element_id", state.workspace.element.id)
      .eq("module_type", TEMPLATE_SECTION_MODULE_TYPE)
      .eq("data->>section_id", sectionId)
      .maybeSingle();

    throwIfError(existingResponse);
    let nextModule = existingResponse.data || null;
    if (!nextModule) {
      const insertResponse = await window.centralisSupabase
        .from(CHRONICLE_MODULES_TABLE)
        .insert({
          element_id: state.workspace.element.id,
          user_id: state.user.id,
          module_type: TEMPLATE_SECTION_MODULE_TYPE,
          source: "manual",
          title: section.name || "Untitled Section",
          sort_order: getNextModuleSortOrder(state.workspace.modules),
          data: {
            section_id: section.id,
            template_id: state.workspace.template.id
          }
        })
        .select("*")
        .single();
      throwIfError(insertResponse);
      nextModule = insertResponse.data;
    }

    if (nextModule && !state.workspace.modules.some((module) => module.id === nextModule.id)) {
      state.workspace = {
        ...state.workspace,
        modules: [...state.workspace.modules, nextModule].sort(sortModules)
      };
      renderWorkspace();
    }
  }

  async function toggleSectionModule(moduleId) {
    if (!state.workspace?.element?.id || !moduleId) {
      return;
    }

    const module = state.workspace.modules.find((item) => item.id === moduleId);
    if (!module) {
      return;
    }

    const nextData = {
      ...(module.data || {}),
      collapsed: !isModuleCollapsed(module)
    };
    if (isDraftSectionModule(module)) {
      state.workspace = {
        ...state.workspace,
        modules: state.workspace.modules.map((item) => item.id === module.id ? { ...item, data: nextData } : item)
      };
      renderWorkspace();
      return;
    }

    const updateResponse = await window.centralisSupabase
      .from(CHRONICLE_MODULES_TABLE)
      .update({
        data: nextData,
        updated_at: new Date().toISOString()
      })
      .eq("id", module.id)
      .eq("user_id", state.user.id)
      .eq("element_id", state.workspace.element.id);

    throwIfError(updateResponse);

    state.workspace = {
      ...state.workspace,
      modules: state.workspace.modules.map((item) => item.id === module.id ? { ...item, data: nextData } : item)
    };
    renderWorkspace();
  }

  async function removeSectionModule(sectionId) {
    if (!state.workspace?.element?.id || !sectionId) {
      return;
    }

    const draftModule = state.workspace.modules.find((module) => getModuleSectionId(module) === sectionId && isDraftSectionModule(module));
    if (draftModule) {
      const sectionFieldIds = new Set((groupFieldsBySection(state.workspace.fields).get(sectionId) || []).map((field) => field.id));
      state.workspace = {
        ...state.workspace,
        modules: state.workspace.modules.filter((module) => module.id !== draftModule.id),
        values: state.workspace.values.filter((value) => !sectionFieldIds.has(value.template_field_id))
      };
      renderWorkspace();
      return;
    }

    const deleteResponse = await window.centralisSupabase
      .from(CHRONICLE_MODULES_TABLE)
      .delete()
      .eq("user_id", state.user.id)
      .eq("element_id", state.workspace.element.id)
      .eq("module_type", TEMPLATE_SECTION_MODULE_TYPE)
      .eq("data->>section_id", sectionId);
    throwIfError(deleteResponse);

    state.workspace = {
      ...state.workspace,
      modules: state.workspace.modules.filter((module) => getModuleSectionId(module) !== sectionId)
    };
    renderWorkspace();
  }

  async function handleWorkspaceSubmit(event) {
    if (!event.target.matches("[data-chronicle-workspace-form]")) {
      return;
    }

    event.preventDefault();
    if (!state.workspace?.element) {
      return;
    }

    const form = event.target;
    const saveButton = form.querySelector("[data-chronicle-workspace-save]");
    syncAllInlineMarkdownEditors();
    const formData = new FormData(form);
    const name = String(formData.get("workspace-name") || "").trim();
    const description = String(formData.get("workspace-description") || "").trim();
    const elementTypeId = String(formData.get("workspace-element-type") || "");
    const templateId = String(formData.get("workspace-template") || "");
    const assignedFieldIds = new Set(getAssignedSectionModules(state.workspace)
      .flatMap((item) => item.fields.map((field) => field.id)));
    const missingRequiredField = state.workspace.fields
      .filter((field) => assignedFieldIds.has(field.id) && field.is_required)
      .find((field) => !hasMeaningfulValue(readTemplateFieldValue(form, field)));

    if (!name) {
      setWorkspaceStatus("Name is required.", "error");
      form.querySelector('[name="workspace-name"]')?.focus();
      return;
    }

    if (missingRequiredField) {
      setWorkspaceStatus(`${getTemplateFieldLabel(missingRequiredField)} is required.`, "error");
      focusTemplateFieldControl(form, missingRequiredField);
      return;
    }

    if (saveButton) {
      saveButton.disabled = true;
    }

    try {
      const element = state.workspace.element;
      const hasPendingModuleReset = Boolean(state.workspace.modulesResetPending);
      const typeChanged = hasPendingModuleReset && elementTypeId !== (state.workspace.originalElementTypeId || "");
      const templateChanged = hasPendingModuleReset && templateId !== (state.workspace.originalTemplateId || "");
      const shouldResetModules = typeChanged || templateChanged;
      const nextTemplateId = typeChanged ? "" : templateId;
      const elementResponse = await window.centralisSupabase
        .from(ELEMENTS_TABLE)
        .update({
          name,
          description: description || null,
          element_type_id: elementTypeId || null,
          rich_template_id: nextTemplateId || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", element.id)
        .eq("user_id", state.user.id);

      throwIfError(elementResponse);

      if (shouldResetModules) {
        const moduleDeleteResponse = await window.centralisSupabase
          .from(CHRONICLE_MODULES_TABLE)
          .delete()
          .eq("user_id", state.user.id)
          .eq("element_id", element.id)
          .eq("module_type", TEMPLATE_SECTION_MODULE_TYPE);
        throwIfError(moduleDeleteResponse);
      }

      let persistedDraftModules = [];
      if (!shouldResetModules) {
        const draftModules = state.workspace.modules.filter(isDraftSectionModule);
        if (draftModules.length) {
          const draftModuleResponse = await window.centralisSupabase
            .from(CHRONICLE_MODULES_TABLE)
            .insert(draftModules.map((module) => ({
              element_id: element.id,
              user_id: state.user.id,
              module_type: TEMPLATE_SECTION_MODULE_TYPE,
              source: "ai",
              title: module.title || "Untitled Module",
              sort_order: module.sort_order || getNextModuleSortOrder(state.workspace.modules),
              data: {
                ...(module.data || {}),
                ai_draft: false
              }
            })))
            .select("*");
          throwIfError(draftModuleResponse);
          persistedDraftModules = draftModuleResponse.data || [];
        }
      }

      const savedTemplateValues = [];
      const valueResponses = await Promise.all(state.workspace.fields
        .filter((field) => assignedFieldIds.has(field.id))
        .map((field) => {
        const value = readTemplateFieldValue(form, field);
        if (!hasMeaningfulValue(value)) {
          return window.centralisSupabase
            .from(ELEMENT_TEMPLATE_FIELD_VALUES_TABLE)
            .delete()
            .eq("element_id", element.id)
            .eq("template_field_id", field.id);
        }

        savedTemplateValues.push({
          element_id: element.id,
          template_field_id: field.id,
          value,
          updated_at: new Date().toISOString()
        });
        return window.centralisSupabase
          .from(ELEMENT_TEMPLATE_FIELD_VALUES_TABLE)
          .upsert(savedTemplateValues[savedTemplateValues.length - 1], { onConflict: "element_id,template_field_id" });
      }));
      throwFirstSupabaseError(valueResponses);

      const deletedCustomFieldIdsFromRows = [];
      const customRows = [...form.querySelectorAll("[data-custom-field-row]")];
      const customResponses = await Promise.all(customRows.map((row, index) => {
        const id = row.dataset.customFieldId;
        const customName = String(row.querySelector('[name="custom-name"]')?.value || "").trim();
        const customValue = String(row.querySelector('[name="custom-value"]')?.value || "").trim();
        if (!hasMeaningfulValue(customName) && !hasMeaningfulValue(customValue)) {
          if (id) {
            deletedCustomFieldIdsFromRows.push(id);
          }
          return id
            ? window.centralisSupabase.from(ELEMENT_CUSTOM_FIELDS_TABLE).delete().eq("id", id)
            : Promise.resolve();
        }
        if (id) {
          return window.centralisSupabase
            .from(ELEMENT_CUSTOM_FIELDS_TABLE)
            .update({ name: customName || "Untitled Field", value: customValue || null, sort_order: index })
            .eq("id", id);
        }
        return window.centralisSupabase
          .from(ELEMENT_CUSTOM_FIELDS_TABLE)
          .insert({ element_id: element.id, name: customName || "Untitled Field", value: customValue || null, sort_order: index })
          .select("*")
          .single();
      }));
      throwFirstSupabaseError(customResponses);

      const deletedCustomFieldIds = [...form.querySelectorAll('[name="deleted-custom-field-id"]')]
        .map((input) => input.value)
        .filter(Boolean);
      const allDeletedCustomFieldIds = [...new Set([...deletedCustomFieldIds, ...deletedCustomFieldIdsFromRows])];
      if (deletedCustomFieldIds.length) {
        const deleteResponse = await window.centralisSupabase
          .from(ELEMENT_CUSTOM_FIELDS_TABLE)
          .delete()
          .in("id", deletedCustomFieldIds);
        throwIfError(deleteResponse);
      }

      syncWorkspaceAfterSave({
        name,
        description,
        elementTypeId,
        templateId: nextTemplateId,
        savedTemplateValues,
        customRows,
        customResponses,
        deletedCustomFieldIds: allDeletedCustomFieldIds,
        clearAssignedModules: shouldResetModules,
        persistedDraftModules
      });
      setWorkspaceStatus("Element saved.", "success");
      syncUniverseAiKnowledgeAfterChronicleSave(state.workspace.universe?.id);
    } catch (error) {
      console.error("Could not save Chronicle workspace.", error);
      setWorkspaceStatus(`Could not save element: ${getReadableError(error)}`, "error");
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
      }
    }
  }

  async function syncUniverseAiKnowledgeAfterChronicleSave(universeId) {
    if (!universeId || !window.centralisSupabase?.functions) {
      return;
    }

    try {
      // Do not create OpenAI storage merely because an ordinary Chronicle form
      // was saved. If this universe already has AI knowledge, refresh it now;
      // otherwise its first AI use will build a complete canon from scratch.
      const { data: source, error: sourceError } = await window.centralisSupabase
        .from("universe_ai_sources")
        .select("universe_id")
        .eq("universe_id", universeId)
        .eq("user_id", state.user.id)
        .maybeSingle();
      if (sourceError || !source) {
        if (sourceError) {
          console.warn("Could not check Universe AI knowledge after Chronicle save.", sourceError);
        }
        return;
      }

      const { error } = await window.centralisSupabase.functions.invoke("sync-universe-ai-source", {
        body: { universeId }
      });
      if (error) {
        console.warn("Could not refresh Universe AI knowledge after Chronicle save.", error);
        showToast("Element saved. Universe AI knowledge will refresh the next time AI is used.", "info");
        return;
      }
      showToast("Universe AI knowledge synced.", "success");
    } catch (error) {
      console.warn("Could not refresh Universe AI knowledge after Chronicle save.", error);
      showToast("Element saved. Universe AI knowledge will refresh the next time AI is used.", "info");
    }
  }

  function openCreateDialog() {
    if (!dom.createModal) {
      return;
    }
    renderCreateTypeOptions();
    clearCreateError();
    dom.createForm?.reset();
    dom.createModal.hidden = false;
    requestAnimationFrame(() => dom.createName?.focus());
  }

  function closeCreateDialog() {
    if (dom.createModal) {
      dom.createModal.hidden = true;
    }
    clearCreateError();
  }

  async function handleCreateElement(event) {
    event.preventDefault();
    if (!state.user) {
      showCreateError("You need to be signed in to create an element.");
      return;
    }

    const name = dom.createName.value.trim();
    const elementTypeId = dom.createType.value;
    const description = dom.createDescription.value.trim();
    if (!name) {
      showCreateError("Name is required.");
      return;
    }
    if (!elementTypeId) {
      showCreateError("Choose an element type.");
      return;
    }

    setCreateBusy(true);
    try {
      const { data, error } = await window.centralisSupabase
        .from(ELEMENTS_TABLE)
        .insert({
          user_id: state.user.id,
          universe_id: null,
          element_type_id: elementTypeId,
          name,
          description: description || null,
          position_x: 0,
          position_y: 0,
          is_collapsed: false
        })
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      closeCreateDialog();
      const elementId = data?.id;
      if (!elementId) {
        throw new Error("The new element was created, but its id was not returned.");
      }
      window.location.href = getEditorHref({ id: elementId, universe_id: null });
    } catch (error) {
      console.error("Could not create Chronicle element.", error);
      showCreateError(`Could not create element: ${error.message}`);
    } finally {
      setCreateBusy(false);
    }
  }

  function parseRouteContext() {
    const parts = window.location.hash.replace(/^#/, "").split("/").filter(Boolean);
    if (parts[0] === "universe" && parts[2] === "element" && parts[1] && parts[3]) {
      return {
        type: "universe-element",
        universeId: parts[1],
        elementId: parts[3]
      };
    }
    if (parts[0] === "element" && parts[1]) {
      return {
        type: "standalone-element",
        universeId: "",
        elementId: parts[1]
      };
    }
    return null;
  }

  function applyHomepageQueryState() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const sort = params.get("sort");
    state.activeTab = tab === "universe" ? "universe" : "standalone";
    state.selectedUniverseId = params.get("universe_id") || "";
    state.search = params.get("q") || "";
    state.sort = ["updated-desc", "name-asc", "type-asc"].includes(sort) ? sort : "updated-desc";
  }

  function writeHomepageQueryState() {
    if (state.pageMode !== "home") {
      return;
    }

    const params = new URLSearchParams();
    if (state.activeTab !== "standalone") {
      params.set("tab", state.activeTab);
    }
    if (state.activeTab === "universe" && state.selectedUniverseId) {
      params.set("universe_id", state.selectedUniverseId);
    }
    if (state.search) {
      params.set("q", state.search);
    }
    if (state.sort !== "updated-desc") {
      params.set("sort", state.sort);
    }

    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }

  function getHomepageUrl() {
    const query = window.location.search || "";
    return `chronicle.html${query}`;
  }

  function getReturnToChronicleUrl() {
    const returnUrl = new URLSearchParams(window.location.search).get("return");
    if (returnUrl && /^chronicle\.html(?:\?|$)/.test(returnUrl)) {
      return returnUrl;
    }
    return "chronicle.html";
  }

  function getEditorHref(row) {
    const returnParam = encodeURIComponent(getHomepageUrl());
    if (row.universe_id) {
      return `chronicle-editor.html?return=${returnParam}#universe/${encodeURIComponent(row.universe_id)}/element/${encodeURIComponent(row.id)}`;
    }
    return `chronicle-editor.html?return=${returnParam}#element/${encodeURIComponent(row.id)}`;
  }

  function setStatus(message, isError = false) {
    if (!dom.status) {
      return;
    }
    dom.status.textContent = message || "";
    dom.status.hidden = !message;
    dom.status.classList.toggle("is-error", Boolean(isError));
  }

  function showCreateError(message) {
    if (!dom.createError) {
      return;
    }
    dom.createError.textContent = message;
    dom.createError.hidden = false;
  }

  function clearCreateError() {
    if (!dom.createError) {
      return;
    }
    dom.createError.textContent = "";
    dom.createError.hidden = true;
  }

  function setCreateBusy(isBusy) {
    if (dom.createSubmit) {
      dom.createSubmit.disabled = isBusy;
      dom.createSubmit.textContent = isBusy ? "Creating..." : "Create Element";
    }
  }

  function createEmptyWorkspace() {
    return {
      isOpen: false,
      isLoading: false,
      error: "",
      mode: "view",
      element: null,
      originalElementTypeId: "",
      originalTemplateId: "",
      universe: null,
      modules: [],
      modulesResetPending: false,
      templates: [],
      template: null,
      sections: [],
      fields: [],
      values: [],
      customFields: [],
      images: []
    };
  }

  function buildSectionModels(sections = [], fields = []) {
    const sectionMap = new Map((sections || []).map((section) => [section.id, { ...section, fields: [] }]));
    const unsectioned = {
      id: "unsectioned",
      name: "Details",
      description: "",
      sort_order: 999999,
      fields: []
    };

    fields.forEach((field) => {
      const section = field.section_id ? sectionMap.get(field.section_id) : null;
      (section || unsectioned).fields.push(field);
    });

    return [...sectionMap.values(), unsectioned]
      .filter((section) => section.fields.length)
      .map((section) => ({ ...section, fields: [...section.fields].sort(sortTemplateFields) }))
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0) || left.name.localeCompare(right.name));
  }

  function sortTemplateFields(left, right) {
    return Number(left.sort_order || 0) - Number(right.sort_order || 0) || getTemplateFieldLabel(left).localeCompare(getTemplateFieldLabel(right));
  }

  function getTemplateFieldLabel(field) {
    return field.label || field.name || field.field_key || "Untitled Field";
  }

  function getTemplateFieldType(field) {
    return String(field.field_type || field.type || "text").toLowerCase();
  }

  function getTemplateFieldOptions(field) {
    const options = parseFieldOptions(field.options);
    if (Array.isArray(options.choices)) {
      return options.choices.map((option) => String(option).trim()).filter(Boolean);
    }
    if (Array.isArray(options)) {
      return options.map((option) => String(option?.label ?? option?.value ?? option).trim()).filter(Boolean);
    }
    if (options && typeof options === "object") {
      const values = Object.values(options);
      if (values.every((value) => typeof value === "string" || typeof value === "number")) {
        return values.map((option) => String(option).trim()).filter(Boolean);
      }
    }
    return String(field.options_text || field.options || "")
      .split(/\r?\n|,/)
      .map((option) => option.trim())
      .filter(Boolean);
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

  function readTemplateFieldValue(form, field) {
    const fieldType = getTemplateFieldType(field);
    const control = form.elements.namedItem(`workspace-field:${field.id}`);
    if (fieldType === "checkbox") {
      return control?.checked ? "true" : "";
    }
    if (fieldType === "multi_select") {
      return control ? [...control.selectedOptions].map((option) => option.value).join("\n") : "";
    }
    return String(control?.value || "").trim();
  }

  function focusTemplateFieldControl(form, field) {
    const control = form.elements.namedItem(`workspace-field:${field.id}`);
    const wrapper = control?.closest?.("[data-markdown-field]");
    if (wrapper) {
      const editor = state.markdownEditors.get(wrapper);
      if (editor) {
        editor.focus();
        return;
      }
    }
    control?.focus?.();
  }

  function hasMeaningfulValue(value) {
    return String(value ?? "").trim().length > 0;
  }

  function syncWorkspaceAfterSave({
    name,
    description,
    elementTypeId,
    templateId,
    savedTemplateValues,
    customRows,
    customResponses,
    deletedCustomFieldIds,
    clearAssignedModules = false,
    persistedDraftModules = []
  }) {
    const updatedAt = new Date().toISOString();
    const savedValueMap = new Map((savedTemplateValues || []).map((value) => [value.template_field_id, value]));
    const assignedFieldIds = new Set(getAssignedSectionModules(state.workspace)
      .flatMap((item) => item.fields.map((field) => field.id)));
    const nextValues = state.workspace.values
      .filter((value) => !assignedFieldIds.has(value.template_field_id) || savedValueMap.has(value.template_field_id))
      .map((value) => savedValueMap.get(value.template_field_id) || value);

    savedValueMap.forEach((value, fieldId) => {
      if (!nextValues.some((item) => item.template_field_id === fieldId)) {
        nextValues.push(value);
      }
    });

    const insertedCustomFields = (customResponses || [])
      .map((response) => response?.data)
      .filter(Boolean);
    const insertedBySignature = new Map(insertedCustomFields.map((field) => [
      `${field.sort_order}:${field.name || ""}:${field.value || ""}`,
      field
    ]));
    const deletedIds = new Set(deletedCustomFieldIds || []);
    const persistedDraftsBySectionId = new Map((persistedDraftModules || [])
      .map((module) => [getModuleSectionId(module), module])
      .filter(([sectionId]) => Boolean(sectionId)));
    const nextCustomFields = (customRows || []).map((row, index) => {
      const id = row.dataset.customFieldId;
      const customName = String(row.querySelector('[name="custom-name"]')?.value || "").trim();
      const customValue = String(row.querySelector('[name="custom-value"]')?.value || "").trim();
      if (!hasMeaningfulValue(customName) && !hasMeaningfulValue(customValue)) {
        return null;
      }
      if (id) {
        return {
          id,
          element_id: state.workspace.element.id,
          name: customName || "Untitled Field",
          value: customValue || null,
          sort_order: index
        };
      }
      return insertedBySignature.get(`${index}:${customName || "Untitled Field"}:${customValue || ""}`) || null;
    }).filter((field) => field && !deletedIds.has(field.id));

    state.workspace = {
      ...state.workspace,
      originalElementTypeId: elementTypeId || "",
      originalTemplateId: templateId || "",
      modules: clearAssignedModules
        ? []
        : state.workspace.modules.map((module) => isDraftSectionModule(module)
          ? persistedDraftsBySectionId.get(getModuleSectionId(module)) || module
          : module).sort(sortModules),
      modulesResetPending: false,
      element: {
        ...state.workspace.element,
        name,
        description: description || null,
        element_type_id: elementTypeId || null,
        rich_template_id: templateId || null,
        updated_at: updatedAt
      },
      values: nextValues,
      customFields: nextCustomFields
    };

    const title = dom.workspace?.querySelector("[data-chronicle-workspace-title]");
    if (title) {
      title.textContent = name;
    }
    const typeLabel = dom.workspace?.querySelector("[data-chronicle-workspace-type]");
    if (typeLabel) {
      typeLabel.textContent = getType(elementTypeId)?.name || "No element type";
    }
  }

  function setWorkspaceStatus(message, tone = "") {
    if (!message) {
      return;
    }
    showToast(message, tone);
  }

  function showToast(message, tone = "") {
    const container = getToastContainer();
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

  function getToastContainer() {
    if (dom.toastContainer?.isConnected) {
      return dom.toastContainer;
    }
    const container = document.createElement("div");
    container.className = "chronicle-toast-stack";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "true");
    document.body.appendChild(container);
    dom.toastContainer = container;
    return container;
  }

  function throwFirstSupabaseError(responses) {
    const failed = responses.find((response) => response?.error);
    if (failed) {
      throw failed.error;
    }
  }

  function throwIfError(response) {
    if (response?.error) {
      throw response.error;
    }
  }

  function getReadableError(error) {
    return error?.message || String(error || "Unknown error");
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLocaleLowerCase();
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

    return clean || "cube";
  }

  function createBlurb(value, limit) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= limit) {
      return text;
    }
    return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
  }

  function formatDate(value) {
    if (!value) {
      return "Never";
    }
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(value));
  }

  function formatModuleType(value) {
    return String(value || "module")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

  function renderMarkdownValue(value, emptyText = "") {
    const markdown = String(value || "").trim();
    if (!markdown) {
      return `<p class="is-empty">${escapeHtml(emptyText || "No text yet.")}</p>`;
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

    return blocks.join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
