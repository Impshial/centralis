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
  const UNIVERSE_CUSTOM_FIELDS_TABLE = "universe_custom_fields";
  const TEMPLATE_SECTION_MODULE_TYPE = "template_section";
  const MAX_IMAGE_PROMPT_LENGTH = 3900;
  const IS_CHRONICLE_EDITOR_PAGE = document.body?.dataset.page === "chronicle-editor";

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
    moduleExchange: null
  };

  const dom = {};
  let savedDraft=null,allowLeave=false,leaveDialog=null,currentEditorUrl=location.href;
  let routeIndex=Number(history.state?.chronicleIndex)||0,restoringHistory=false,routeDecision=false;
  if(IS_CHRONICLE_EDITOR_PAGE)history.replaceState({...history.state,chronicleIndex:routeIndex},'',location.href);

  document.addEventListener("DOMContentLoaded", initChronicle);
  async function onEditorRouteChange() {
    if (state.pageMode !== "editor") {
      return;
    }
    if(restoringHistory){if(location.href===currentEditorUrl)restoringHistory=false;return;}
    if(routeDecision||location.href===currentEditorUrl)return;
    const nextUrl=location.href,nextIndex=Number.isFinite(history.state?.chronicleIndex)?history.state.chronicleIndex:routeIndex+1;
    if(isWorkspaceDirty()&&!allowLeave){
      routeDecision=true;const delta=nextIndex-routeIndex;
      if(delta){restoringHistory=true;history.go(-delta);}else history.replaceState({...history.state,chronicleIndex:routeIndex},'',currentEditorUrl);
      const leave=await confirmDiscard();routeDecision=false;
      if(leave){allowLeave=true;if(delta)history.go(delta);else{history.replaceState({...history.state,chronicleIndex:nextIndex},'',nextUrl);onEditorRouteChange();}}
      return;
    }
    currentEditorUrl=nextUrl;routeIndex=nextIndex;allowLeave=false;
    history.replaceState({...history.state,chronicleIndex:routeIndex},'',location.href);
    scrollEditorToTop();
    state.routeContext = parseRouteContext();
    await loadRouteWorkspace();
    renderRouteNotice();
    renderWorkspace();
    scrollEditorToTop();
  }
  window.addEventListener('hashchange',onEditorRouteChange);
  window.addEventListener('popstate',onEditorRouteChange);

  function draftSnapshot() {
    const w=state.workspace,form=dom.workspace?.querySelector('[data-chronicle-workspace-form]');
    if(!w.element||!form||w.isLoading||w.error)return null;
    syncAllInlineMarkdownEditors();
    const value=(name,fallback='')=>String(form.elements.namedItem(name)?.value??fallback).trim();
    const section=id=>getModuleSectionId(w.modules.find(m=>m.id===id)||{})||null;
    const fields=getAssignedSectionModules(w).flatMap(m=>m.fields).map(f=>[f.id,readTemplateFieldValue(form,f)]).filter(([,v])=>hasMeaningfulValue(v)).sort((a,b)=>a[0].localeCompare(b[0]));
    const custom=[...form.querySelectorAll('[data-custom-field-row]')].map(row=>[row.dataset.customFieldId,row.querySelector('[name="custom-name"]').value.trim(),row.querySelector('[name="custom-value"]').value,Number(row.querySelector('[name="custom-order"]').value),section(row.dataset.customModuleId)]).sort((a,b)=>a[0].localeCompare(b[0]));
    return JSON.stringify({id:w.element.id,name:value('workspace-name'),description:value('workspace-description'),body:value('workspace-body'),type:value('workspace-element-type'),template:value('workspace-template'),modules:[...w.modules].sort(sortModules).map(m=>[getModuleSectionId(m),getModuleTemplateId(m)]),fields,custom});
  }
  function isWorkspaceDirty(){
    if(savedDraft===null)return false;
    const dialogDraft=state.activeTextEditorDialog;
    if(dialogDraft){const text=dialogDraft.editor?dialogDraft.editor.getMarkdown():String(dom.textEditorFallback?.value||'');if(text!==dialogDraft.textarea.value)return true;}
    if([...document.querySelectorAll('dialog[open]')].some(d=>d.chronicleDraftChanged?.()))return true;
    return draftSnapshot()!==savedDraft;
  }
  function updateDirtyStatus(){const label=dom.workspace?.querySelector('[data-chronicle-dirty]');if(label)label.textContent=isWorkspaceDirty()?'Unsaved changes':'';}
  function markWorkspaceSaved(){savedDraft=draftSnapshot();updateDirtyStatus();}
  function confirmDiscard() {
    if(leaveDialog)return Promise.resolve(false);
    return new Promise(resolve=>{
      const active=document.activeElement,modal=document.createElement('dialog');leaveDialog=modal;modal.className='chronicle-field-dialog';modal.setAttribute('aria-labelledby','chronicle-leave-title');modal.setAttribute('aria-describedby','chronicle-leave-description');
      modal.innerHTML='<h2 id="chronicle-leave-title">Discard unsaved changes?</h2><p id="chronicle-leave-description">Changes on this Chronicle page have not been saved.</p><div class="modal-actions"><button type="button" class="secondary-action" data-stay>Keep editing</button><button type="button" class="primary-action" data-discard>Discard and leave</button></div>';
      let leave=false;document.body.append(modal);modal.querySelector('[data-stay]').onclick=()=>modal.close();modal.querySelector('[data-discard]').onclick=()=>{leave=true;modal.close();};
      modal.addEventListener('close',()=>{modal.remove();leaveDialog=null;if(!leave)active?.focus({preventScroll:true});resolve(leave);},{once:true});modal.showModal();modal.querySelector('[data-stay]').focus({preventScroll:true});
    });
  }
  async function navigateFromEditor(href) {
    if(isWorkspaceDirty()&&!await confirmDiscard())return;
    allowLeave=true;location.href=href;
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(state.pageMode!=='editor'||!link||link.closest('[data-chronicle-lexicon-dialog]')||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
    const target=new URL(link.href,location.href);if(!['http:','https:'].includes(target.protocol)||target.href===location.href)return;
    if(isWorkspaceDirty()){event.preventDefault();event.stopImmediatePropagation();navigateFromEditor(target.href);}
  },true);
  window.addEventListener('beforeunload',event=>{if(!allowLeave&&isWorkspaceDirty()){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pageshow',event=>{if(event.persisted&&IS_CHRONICLE_EDITOR_PAGE){allowLeave=true;location.reload();}});

  async function initChronicle() {
    bindDom();
    state.pageMode = document.body?.dataset.page === "chronicle-editor" ? "editor" : "home";
    if (state.pageMode === "editor" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    if (state.pageMode === "editor") {
      scrollEditorToTop();
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
        scrollEditorToTop();
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
    dom.aiModuleGenerationOverlay = document.querySelector("[data-chronicle-ai-generation-overlay]");
    dom.aiModuleProgressStage = document.querySelector("[data-chronicle-ai-progress-stage]");
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
    dom.workspace?.addEventListener('input',updateDirtyStatus);
    dom.workspace?.addEventListener('change',updateDirtyStatus);
    dom.workspace?.addEventListener("focusin",event=>{
      const module = event.target.closest('[data-module-id]');
      if (module) state.workspace.activeModuleId = module.dataset.moduleId;
    });
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
        .eq("deleted", false)
        .order("name", { ascending: true }),
      window.centralisSupabase
        .from(CHRONICLE_MODULES_TABLE)
        .select("element_id")
        .eq("user_id", state.user.id)
        .eq("deleted", false)
        .eq("module_type", TEMPLATE_SECTION_MODULE_TYPE),
      window.centralisSupabase
        .from(UNIVERSES_TABLE)
        .select("id,name")
        .eq("user_id", state.user.id)
        .eq("deleted", false)
        .order("name", { ascending: true }),
      window.centralisSupabase
        .from(ELEMENTS_TABLE)
        .select("id,name,description,element_type_id,universe_id,updated_at,created_at")
        .eq("user_id", state.user.id)
        .eq("deleted", false)
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

    if (state.selectedUniverseId && !state.universesById.has(state.selectedUniverseId)) {
      state.selectedUniverseId = "";
      writeHomepageQueryState();
    }

    if (state.selectedUniverseId) {
      const universeElementResponse = await window.centralisSupabase
        .from(ELEMENTS_TABLE)
        .select("id,name,description,element_type_id,universe_id,updated_at,created_at")
        .eq("user_id", state.user.id)
        .eq("deleted", false)
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
      .eq("user_id", state.user.id)
      .eq("deleted", false)
      .in("id", universeIds)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    (data || []).forEach((universe) => state.universesById.set(universe.id, universe));
  }

  async function loadRouteWorkspace() {
    savedDraft=null;
    const context = state.routeContext;
    if (!context || !["standalone-element", "universe-element", "universe"].includes(context.type)) {
      state.workspace = createEmptyWorkspace();
      return;
    }

    state.workspace = { ...createEmptyWorkspace(), isOpen: true, isLoading: true, mode: "edit" };
    renderWorkspace();

    try {
      if (context.type === "universe") {
        const response = await window.centralisSupabase.from(UNIVERSES_TABLE).select("*")
          .eq("id",context.universeId).eq("user_id",state.user.id).eq("deleted",false).single();
        throwIfError(response);
        const [custom, images, wikiDetails] = await Promise.all([
          window.centralisSupabase.from(UNIVERSE_CUSTOM_FIELDS_TABLE).select("*").eq("universe_id",context.universeId).eq("deleted",false).order("sort_order"),
          fetchObjectImages([context.universeId]),
          new window.LexiconData.Store(window.centralisSupabase,state.user).articleDetails(context.universeId,context.universeId)
        ]);
        throwIfError(custom);
        state.workspace = {...createEmptyWorkspace(),isOpen:true,mode:"edit",isUniverse:true,
          element:response.data,universe:response.data,customFields:[...(custom.data || []),...wikiDetails],
          wikiDetailsById:Object.fromEntries(wikiDetails.map(f=>[f.id,f.wikiDetail])),images:normalizeImages(images.images || [])};
        return;
      }
      const elementResponse = await window.centralisSupabase
        .from(ELEMENTS_TABLE)
        .select("id,name,description,body,element_type_id,universe_id,rich_template_id,updated_at,created_at")
        .eq("user_id", state.user.id)
        .eq("id", context.elementId)
        .eq("deleted", false)
        .maybeSingle();

      throwIfError(elementResponse);
      const element = elementResponse.data;
      if (!element) {
        throw new Error("That element could not be found.");
      }
      if (context.universeId && element.universe_id !== context.universeId) {
        throw new Error("That element does not belong to the linked Universe.");
      }

      const [universeResponse, moduleResponse, valueResponse, customResponse, imageResponse, wikiDetails] = await Promise.all([
        element.universe_id
          ? window.centralisSupabase
            .from(UNIVERSES_TABLE)
            .select("id,name")
            .eq("id", element.universe_id)
            .eq("user_id", state.user.id)
            .eq("deleted", false)
            .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        window.centralisSupabase
          .from(CHRONICLE_MODULES_TABLE)
          .select("*")
          .eq("user_id", state.user.id)
          .eq("element_id", element.id)
          .eq("module_type", TEMPLATE_SECTION_MODULE_TYPE)
          .eq("deleted", false)
          .order("sort_order", { ascending: true }),
        window.centralisSupabase
          .from(ELEMENT_TEMPLATE_FIELD_VALUES_TABLE)
          .select("*")
          .eq("deleted", false)
          .eq("element_id", element.id),
        window.centralisSupabase
          .from(ELEMENT_CUSTOM_FIELDS_TABLE)
          .select("*")
          .eq("deleted", false)
          .eq("element_id", element.id)
          .order("sort_order", { ascending: true }),
        fetchObjectImages([element.id]),
        new window.LexiconData.Store(window.centralisSupabase,state.user).articleDetails(element.universe_id,element.id)
      ]);

      throwIfError(universeResponse);
      if (element.universe_id && !universeResponse.data) {
        throw new Error("This element's universe is no longer available.");
      }
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
        customFields: [...(customResponse.data || []),...wikiDetails],
        wikiDetailsById:Object.fromEntries(wikiDetails.map(f=>[f.id,f.wikiDetail])),
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
      sections: (sectionResponse.data || []).filter((section) => !section.is_hidden).sort(sortSections),
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

  function scrollEditorToTop() {
    if (state.pageMode !== "editor") {
      return;
    }

    forceEditorScrollTop();
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
    dom.universeFilter.disabled = !state.universes.length;
    dom.universeFilter.innerHTML = `
      <option value="">${state.universes.length ? "Choose a universe" : "No universes available"}</option>
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
    dom.workspace.classList.toggle('is-universe',Boolean(workspace.isUniverse));

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
                ${workspace.isUniverse ? '' : `<p data-chronicle-workspace-type>${escapeHtml(type?.name || "No element type")}</p>`}
              </div>
            </div>
          </div>
          <div class="chronicle-workspace-actions">
            ${renderBackToCanvasLink()}
            ${workspace.universe?.id?'<button class="secondary-action" type="button" data-chronicle-view-lexicon>View in Lexicon</button>':''}
            <span data-chronicle-dirty role="status" aria-live="polite"></span>
            <button class="secondary-action" type="button" data-chronicle-add-custom-field>Add field</button>
            <button class="primary-action" type="submit" data-chronicle-workspace-save>${workspace.isUniverse ? 'Save Universe' : 'Save Element'}</button>
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
            ${workspace.isUniverse ? '' : `<label class="form-field">
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
            </label>`}
          </div>
          <label class="form-field">
            <span>Description</span>
            <textarea name="workspace-description" rows="6">${escapeHtml(element.description || "")}</textarea>
          </label>
          ${workspace.isUniverse ? '' : `<label class="form-field"><span>Body</span><textarea name="workspace-body" rows="8">${escapeHtml(element.body || '')}</textarea></label>`}
          ${workspace.isUniverse ? '' : renderTemplateChoiceHint(workspace)}
        </section>
        <section class="chronicle-editor-section" data-chronicle-custom-fields><h3>Details</h3>${renderWorkspaceCustomFields(workspace.customFields.filter(f=>!f.chronicle_module_id))}</section>
        ${workspace.isUniverse ? '' : `<div class="chronicle-workspace-grid">
          <aside class="chronicle-module-sidebar">
            <section class="chronicle-editor-section">
              <div class="chronicle-section-title-row chronicle-module-title-row">
                <h3>Modules</h3>
                ${renderAiModuleGenerationControl(workspace)}
              </div>
              <button class="secondary-action" type="button" data-chronicle-exchange>Import / Export</button>
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
        </div>`}
      </form>
    `;
    initializeInlineMarkdownEditors();
    if(savedDraft===null)markWorkspaceSaved();else updateDirtyStatus();
  }

  function renderBackToCanvasLink() {
    const universeId = state.routeContext?.universeId || state.workspace?.element?.universe_id || "";
    if (!universeId) {
      return "";
    }

    return `
      <a class="secondary-action compact-action chronicle-nav-button" href="universe-canvas.html?universe_id=${encodeURIComponent(universeId)}">
        Back to Builder
      </a>
    `;
  }

  async function viewInLexicon() {
    const w=state.workspace,universeId=w.universe?.id,articleId=w.element?.id;
    if(!universeId||!articleId)return;
    const modal=document.createElement('dialog');modal.className='chronicle-field-dialog';modal.dataset.chronicleLexiconDialog='';modal.setAttribute('aria-labelledby','chronicle-lexicon-title');
    modal.innerHTML='<h2 id="chronicle-lexicon-title">View in Lexicon</h2><div data-lexicon-choices><p role="status">Finding visible articles…</p></div><div class="modal-actions"><button type="button" class="secondary-action" data-close>Cancel</button></div>';
    document.body.append(modal);modal.querySelector('[data-close]').onclick=()=>modal.close();modal.addEventListener('close',()=>modal.remove(),{once:true});modal.showModal();
    try {
      const store=new LexiconData.Store(window.centralisSupabase,state.user);
      const [wikis,source,universes]=await Promise.all([
        store.rows('lexicon_wikis',{user_id:state.user.id,kind:'universe',universe_id:universeId}),
        store.rows(w.isUniverse?UNIVERSES_TABLE:ELEMENTS_TABLE,{id:articleId,user_id:state.user.id,deleted:false,...(w.isUniverse?{}:{universe_id:universeId})},'id'),
        store.rows(UNIVERSES_TABLE,{id:universeId,user_id:state.user.id,deleted:false},'id')
      ]);
      const overrides=await store.forIds('lexicon_overrides','wiki_id',wikis.map(w=>w.id),{subject_type:'article',article_id:articleId,subject_id:articleId,property:'hidden'});
      if(!modal.open||state.workspace.element?.id!==articleId)return;
      const available=source.length&&universes.length;
      const visible=available?wikis.filter(w=>!overrides.some(o=>o.wiki_id===w.id&&o.value===true)):[];
      const href=w=>`lexicon-wiki.html?wiki=${encodeURIComponent(w.id)}${state.workspace.isUniverse?'':'&article='+encodeURIComponent(articleId)}`;
      if(visible.length===1){modal.close();await navigateFromEditor(href(visible[0]));return;}
      const choices=modal.querySelector('[data-lexicon-choices]');
      choices.innerHTML=visible.length?'<p>Choose a wiki.</p>'+visible.map(w=>`<p><a class="secondary-action" href="${href(w)}">${escapeHtml(w.name)}</a></p>`).join(''):`<p>${!available?'This source record is unavailable.':wikis.length?'This article is hidden in every linked wiki.':'No wiki is linked to this universe.'}</p><a href="lexicon.html">Open Lexicon</a>`;
      choices.addEventListener('click',event=>{const a=event.target.closest('a');if(!a||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();modal.close();navigateFromEditor(a.href);});
    }catch(error){if(modal.open)modal.querySelector('[data-lexicon-choices]').textContent=error.message;}
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
      .sort((left, right) => overviewPriority(left.section.name,right.section.name) || Number(left.module.sort_order || 0) - Number(right.module.sort_order || 0) || left.section.name.localeCompare(right.section.name));
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
          ${renderWorkspaceCustomFields(state.workspace.customFields.filter(f=>f.chronicle_module_id===module.id))}
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
    return overviewPriority(left.title,right.title) || Number(left.sort_order || 0) - Number(right.sort_order || 0)
      || String(left.title || "").localeCompare(String(right.title || ""));
  }
  function overviewPriority(left,right) {
    return Number(String(right||'').trim().toLowerCase()==='overview')-Number(String(left||'').trim().toLowerCase()==='overview');
  }
  function sortSections(left,right) {
    return overviewPriority(left.name,right.name) || Number(left.sort_order||0)-Number(right.sort_order||0) || String(left.name||'').localeCompare(String(right.name||''));
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
      control = `<input type="${inputType}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${inputType==='number'?' step="any"':''}${required}>`;
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
    const rows = [...customFields].sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
    return rows.map((field) => renderWorkspaceCustomField(field)).join("");
  }

  function renderWorkspaceCustomField(field) {
    return `
      <div class="chronicle-custom-field-row" data-custom-field-row data-custom-field-id="${escapeHtml(field.id)}" data-custom-module-id="${escapeHtml(field.chronicle_module_id || '')}">
        <input type="text" name="custom-name" value="${escapeHtml(field.name || "")}" placeholder="Field name">
        <textarea name="custom-value" rows="3" placeholder="Value">${escapeHtml(field.value || "")}</textarea>
        <button class="secondary-action" type="button" data-custom-edit="${escapeHtml(field.id)}">${field.wikiDetail ? 'Edit detail' : 'Move or rename'}</button>
        <label>Order<input type="number" name="custom-order" value="${Number(field.sort_order||0)}" step="1"></label>
        <button class="icon-button" type="button" data-chronicle-remove-custom-field aria-label="Remove custom field">
          <ph-trash aria-hidden="true"></ph-trash>
        </button>
        ${field.wikiDetail ? `<small class="chronicle-wiki-detail-source">Article Details · <a href="lexicon-wiki.html?wiki=${encodeURIComponent(field.wikiDetail.wiki_id)}&article=${encodeURIComponent(field.wikiDetail.article_id)}">${escapeHtml(field.wikiDetail.wikiName)}</a>${field.wikiDetail.groupName?' · '+escapeHtml(field.wikiDetail.groupName):''}${field.wikiDetail.hidden?' · Hidden in wiki':''}${field.wikiDetail.kind!=='fact'?' · Changing the value replaces the pinned '+(field.wikiDetail.kind==='excerpt'?'excerpt':field.wikiDetail.kind==='links'?'links':'relationship')+'.':''}</small>` : ''}
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
    if (!state.universes.length) {
      dom.content.innerHTML = `
        <div class="chronicle-empty">
          <h2>No universes available</h2>
          <a class="secondary-action" href="universe-builder.html">Open Universe Builder</a>
        </div>
      `;
      return;
    }

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
    if(event.target.closest('[data-chronicle-exchange]')){openModuleExchange();return;}
    if(event.target.closest('[data-chronicle-view-lexicon]')){await viewInLexicon();return;}
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
    const editCustom = event.target.closest('[data-custom-edit]');
    if (addButton || editCustom) {
      openCustomFieldDialog(editCustom?.dataset.customEdit);
      return;
    }

    const removeButton = event.target.closest("[data-chronicle-remove-custom-field]");
    if (removeButton) {
      captureWorkspaceDraft();
      const id = removeButton.closest('[data-custom-field-row]').dataset.customFieldId;
      state.workspace.deletedCustomFieldIds.push(id);
      state.workspace.customFields = state.workspace.customFields.filter(f=>f.id!==id);
      renderWorkspace();
    }
  }

  function openCustomFieldDialog(id) {
    captureWorkspaceDraft();
    const sections = getAssignedSectionModules(state.workspace);
    const existing = state.workspace.customFields.find(f=>f.id===id);
    const field = existing || {id:crypto.randomUUID(),name:'',value:'',sort_order:state.workspace.customFields.length,chronicle_module_id:state.workspace.activeModuleId || null};
    const modal = document.createElement('dialog'); modal.className='chronicle-field-dialog';
    modal.setAttribute('aria-label',existing ? 'Edit custom field' : 'Add field');
    modal.innerHTML = `<form><h2>${existing ? 'Edit custom field' : 'Add field'}</h2>
      <label class="form-field"><span>Name${field.wikiDetail?' (optional)':''}</span><input name="name" ${field.wikiDetail?'':'required'} value="${escapeHtml(field.name)}"></label>
      <label class="form-field"><span>Value</span><textarea name="value" rows="5">${escapeHtml(field.value ?? '')}</textarea></label>
      ${field.wikiDetail ? `<p>Article Details · ${escapeHtml(field.wikiDetail.wikiName)}${field.wikiDetail.kind!=='fact'?'. Changing the value replaces the pinned '+(field.wikiDetail.kind==='excerpt'?'excerpt':field.wikiDetail.kind==='links'?'links':'relationship')+'.':''}</p>` : sections.length ? `<label class="form-field"><span>Location</span><select name="location" aria-label="Location"><option value="">Top-level details</option>${sections.map(({module,section})=>`<option value="${escapeHtml(module.id)}"${module.id===field.chronicle_module_id?' selected':''}>${escapeHtml(section.name)}</option>`).join('')}</select></label>` : ''}
      <div class="modal-actions"><button type="button" class="secondary-action" data-cancel>Cancel</button><button type="submit" class="primary-action">Apply</button></div></form>`;
    document.body.append(modal);
    const initialValues=JSON.stringify([...new FormData(modal.querySelector('form'))]);
    modal.chronicleDraftChanged=()=>JSON.stringify([...new FormData(modal.querySelector('form'))])!==initialValues;
    modal.querySelector('[data-cancel]').onclick=()=>modal.close();
    modal.addEventListener('close',()=>modal.remove());
    modal.querySelector('form').onsubmit=event=>{
      event.preventDefault();const form=event.currentTarget;
      const value={...field,name:form.elements.name.value.trim(),value:form.elements.value.value,chronicle_module_id:form.elements.location?.value || null};
      if(!value.name&&!field.wikiDetail)return;
      state.workspace.customFields=existing ? state.workspace.customFields.map(f=>f.id===id?value:f) : [...state.workspace.customFields,value];
      modal.close();renderWorkspace();
    };
    modal.showModal();
  }

  function normalizeCustomPlacement() {
    const assigned = new Set(state.workspace.modules.map(m=>m.id));
    state.workspace.customFields = state.workspace.customFields.map(f=>({...f,chronicle_module_id:assigned.has(f.chronicle_module_id)?f.chronicle_module_id:null}));
  }

  async function persistCustomFields() {
    const w=state.workspace, table=w.isUniverse?UNIVERSE_CUSTOM_FIELDS_TABLE:ELEMENT_CUSTOM_FIELDS_TABLE;
    const owner=w.isUniverse?'universe_id':'element_id';
    normalizeCustomPlacement();
    const wikiStore=new window.LexiconData.Store(window.centralisSupabase,state.user);
    for(const field of w.customFields) {
      if(field.wikiDetail){field.wikiDetail=await wikiStore.saveArticleDetail(field);w.wikiDetailsById[field.id]=field.wikiDetail;continue;}
      const row={id:field.id,[owner]:w.element.id,name:field.name || 'Field',value:field.value ?? '',sort_order:Number(field.sort_order||0),deleted:false};
      if(!w.isUniverse)row.chronicle_module_id=field.chronicle_module_id || null;
      throwIfError(await window.centralisSupabase.from(table).upsert(row,{onConflict:'id'}));
    }
    const sourceIds=w.deletedCustomFieldIds.filter(id=>!w.wikiDetailsById[id]);
    if(sourceIds.length)throwIfError(await window.centralisSupabase.from(table).delete().in('id',sourceIds).eq(owner,w.element.id));
    for(const id of w.deletedCustomFieldIds){const detail=w.wikiDetailsById[id];if(detail)await wikiStore.remove('lexicon_facts',detail.wiki_id,detail.id);}
    w.deletedCustomFieldIds=[];
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
        name: String(form.elements.namedItem("workspace-name")?.value || "").trim(),
        description: String(form.elements.namedItem("workspace-description")?.value || "").trim() || null,
        ...(!workspace.isUniverse ? {body:String(form.elements.namedItem('workspace-body')?.value || '')} : {})
      },
      customFields: [...form.querySelectorAll('[data-custom-field-row]')].map(row=>({
        ...workspace.customFields.find(f=>f.id===row.dataset.customFieldId),
        id:row.dataset.customFieldId, name:row.querySelector('[name="custom-name"]').value,
        value:row.querySelector('[name="custom-value"]').value, sort_order:Number(row.querySelector('[name="custom-order"]').value),
        chronicle_module_id:row.dataset.customModuleId || null
      })),
      values: [...valuesByFieldId.values()]
    };
  }

  function exchangeWorkspace() {
    captureWorkspaceDraft();
    const w=state.workspace, values=new Map(w.values.map(v=>[v.template_field_id,v.value]));
    const form=dom.workspace.querySelector('[data-chronicle-workspace-form]');
    if(w.isLoading||w.error||!w.element||!form)throw new Error('Wait for the element to finish loading.');
    if(form.elements.namedItem('workspace-template')?.value!==(w.template?.id||'')||form.elements.namedItem('workspace-element-type')?.value!==(w.element.element_type_id||''))throw new Error('The template is changing. Wait for it to finish loading.');
    return {
      element:{id:w.element?.id,name:w.element?.name},templateId:w.template?.id || '',
      modules:getAssignedSectionModules(w).map(({module,section,fields})=>({
        sectionId:section.id,assignmentId:module.id,label:section.name,
        fields:[
          ...fields.map(f=>({kind:'template',id:f.id,label:getTemplateFieldLabel(f),type:getTemplateFieldType(f),hint:f.hint_text||f.description||'',...(['select','multi_select'].includes(getTemplateFieldType(f))?{choices:getTemplateFieldOptions(f)}:{}),value:values.get(f.id)??''})),
          ...w.customFields.filter(f=>f.chronicle_module_id===module.id&&!f.wikiDetail&&!w.wikiDetailsById[f.id]).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)).map(f=>({kind:'custom',id:f.id,label:f.name,type:'textarea',hint:'',value:f.value??''}))
        ]
      }))
    };
  }

  function openModuleExchange() {
    if(state.moduleExchange||!state.workspace.element||state.workspace.isLoading)return;
    let snapshot;try{snapshot=exchangeWorkspace();}catch(error){setWorkspaceStatus(error.message,'error');return;}
    const modal=document.createElement('dialog');modal.className='chronicle-exchange-dialog';modal.setAttribute('aria-labelledby','chronicle-exchange-title');
    modal.innerHTML=`<header><h2 id="chronicle-exchange-title">Import / Export</h2><p>Transfer selected module values. Imports stay in the draft until you save the element.</p></header>
      <div class="chronicle-exchange-tabs" role="group" aria-label="Import or export"><button type="button" class="secondary-action" data-exchange-tab="export" aria-pressed="true">Export</button><button type="button" class="secondary-action" data-exchange-tab="import" aria-pressed="false">Import</button></div>
      <div class="chronicle-exchange-content" data-exchange-content></div><p class="form-status" role="status" data-exchange-status></p>
      <footer class="modal-actions"><button type="button" class="secondary-action" data-exchange-cancel>Cancel</button><button type="button" class="primary-action" data-exchange-apply hidden>Apply to draft</button></footer>`;
    const x=state.moduleExchange={modal,workspace:snapshot,selected:new Set(snapshot.modules.map(m=>m.sectionId)),includeValues:false,text:'',fileRevision:0,review:null,tab:'export',opener:document.activeElement};
    document.body.append(modal);
    modal.addEventListener('close',()=>{if(state.moduleExchange===x)state.moduleExchange=null;modal.remove();x.opener?.isConnected&&x.opener.focus({preventScroll:true});},{once:true});
    modal.querySelector('[data-exchange-cancel]').onclick=()=>modal.close();
    modal.querySelectorAll('[data-exchange-tab]').forEach(button=>button.onclick=()=>{x.tab=button.dataset.exchangeTab;x.review=null;renderModuleExchange();});
    modal.querySelector('[data-exchange-apply]').onclick=applyModuleExchange;
    renderModuleExchange();modal.showModal();
  }

  function exchangeStatus(message,error=false) {
    const node=state.moduleExchange?.modal.querySelector('[data-exchange-status]');if(!node)return;
    node.textContent=message;node.classList.toggle('is-error',error);
  }

  function renderModuleExchange() {
    const x=state.moduleExchange;if(!x)return;
    const box=x.modal.querySelector('[data-exchange-content]');exchangeStatus('');
    x.modal.querySelectorAll('[data-exchange-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.exchangeTab===x.tab)));
    x.modal.querySelector('[data-exchange-apply]').hidden=!x.review;
    if(x.review){renderExchangeReview();return;}
    if(x.tab==='export'){
      x.workspace=exchangeWorkspace();
      box.innerHTML=`<fieldset><legend>Modules to export</legend>${x.workspace.modules.length?x.workspace.modules.map((m,i)=>`<label class="chronicle-exchange-module-choice"><input type="checkbox" data-exchange-module="${i}" ${x.selected.has(m.sectionId)?'checked':''}><span>${escapeHtml(m.label)}</span><small>${m.fields.length} ${m.fields.length===1?'field':'fields'}</small></label>`).join(''):'<p>No modules assigned. Add a module from the Modules panel in Chronicle.</p>'}</fieldset>
        <fieldset class="chronicle-exchange-modes"><legend>Values</legend><label><input type="radio" name="exchange-values" value="blank" ${!x.includeValues?'checked':''}> Blank template</label><label><input type="radio" name="exchange-values" value="current" ${x.includeValues?'checked':''}> Include current values</label></fieldset>
        <label class="form-field"><span>JSON preview</span><textarea data-exchange-preview readonly rows="12" spellcheck="false"></textarea></label>
        <div class="chronicle-exchange-actions"><button type="button" class="secondary-action" data-exchange-export="download">Download JSON</button><button type="button" class="secondary-action" data-exchange-export="copy">Copy JSON</button><button type="button" class="secondary-action" data-exchange-export="instructions">Copy instructions and template</button></div>`;
      box.querySelectorAll('[data-exchange-module]').forEach(control=>control.onchange=()=>{const id=x.workspace.modules[Number(control.dataset.exchangeModule)].sectionId;control.checked?x.selected.add(id):x.selected.delete(id);refreshExchangeExport();});
      box.querySelectorAll('[name="exchange-values"]').forEach(control=>control.onchange=()=>{x.includeValues=control.value==='current';refreshExchangeExport();});
      box.querySelectorAll('[data-exchange-export]').forEach(button=>button.onclick=()=>exportModuleExchange(button.dataset.exchangeExport));
      refreshExchangeExport();
    }else{
      box.innerHTML=`<label class="form-field"><span>Choose JSON file</span><input type="file" accept=".json,application/json" data-exchange-file></label>
        <label class="form-field"><span>Paste JSON</span><textarea data-exchange-input rows="14" spellcheck="false">${escapeHtml(x.text)}</textarea></label>
        <button type="button" class="primary-action" data-exchange-review>Review import</button>`;
      box.querySelector('[data-exchange-input]').oninput=event=>{x.text=event.target.value;++x.fileRevision;};
      box.querySelector('[data-exchange-file]').onchange=async event=>{
        const file=event.target.files?.[0];if(!file)return;
        const input=box.querySelector('[data-exchange-input]'),revision=++x.fileRevision;
        try{const text=await file.text();if(state.moduleExchange!==x||!input.isConnected||x.fileRevision!==revision)return;x.text=text;input.value=text;exchangeStatus('File loaded. Choose Review import.');}catch(error){if(state.moduleExchange===x&&input.isConnected)exchangeStatus('Could not read the file: '+error.message,true);}
      };
      box.querySelector('[data-exchange-review]').onclick=()=>{
        try{x.review=ChronicleModuleExchange.review(ChronicleModuleExchange.parse(x.text),exchangeWorkspace());renderModuleExchange();}catch(error){x.review=null;exchangeStatus(error.message,true);}
      };
    }
  }

  function refreshExchangeExport() {
    const x=state.moduleExchange;if(!x)return null;
    const preview=x.modal.querySelector('[data-exchange-preview]');
    try{
      const payload=ChronicleModuleExchange.exportModules(exchangeWorkspace(),x.selected,x.includeValues);
      preview.value=JSON.stringify(payload,null,2);x.modal.querySelectorAll('[data-exchange-export]').forEach(b=>b.disabled=false);exchangeStatus('');return payload;
    }catch(error){preview.value='';x.modal.querySelectorAll('[data-exchange-export]').forEach(b=>b.disabled=true);exchangeStatus(error.message,true);return null;}
  }

  async function exportModuleExchange(action) {
    const payload=refreshExchangeExport();if(!payload)return;
    const text=action==='instructions'?ChronicleModuleExchange.instructions(payload):JSON.stringify(payload,null,2);
    try{
      if(action==='download'){
        const href=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
        link.href=href;link.download=ChronicleModuleExchange.filename(payload.element.name);document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);exchangeStatus('JSON downloaded.');
      }else{await navigator.clipboard.writeText(text);exchangeStatus('Copied.');}
    }catch(error){exchangeStatus('Could not '+(action==='download'?'download':'copy')+'. Select and copy the JSON preview instead.',true);}
  }

  function exchangeIncomingControl(row) {
    if(row.structuralError)return '';
    const f=row.field,value=row.input.value,type=f.type,aria=`aria-label="Incoming ${escapeHtml(row.label)}" data-exchange-value`;
    if(type==='checkbox')return `<label><input type="checkbox" ${aria} ${value===true?'checked':''}> Enabled</label>`;
    if(type==='select'||type==='multi_select')return `<select ${aria} ${type==='multi_select'?'multiple':''}>${type==='select'?'<option value="">Select...</option>':''}${f.choices.map(choice=>`<option value="${escapeHtml(choice)}" ${value===choice||Array.isArray(value)&&value.includes(choice)?'selected':''}>${escapeHtml(choice)}</option>`).join('')}</select>`;
    if(['number','date','url'].includes(type))return `<input type="${type}" ${aria} ${type==='number'?'step="any"':''} value="${escapeHtml(typeof value==='string'||typeof value==='number'?value:'')}">`;
    if(type==='textarea'||type==='rich_text')return `<textarea rows="5" ${aria}>${escapeHtml(typeof value==='string'?value:'')}</textarea>`;
    return `<input type="text" ${aria} value="${escapeHtml(typeof value==='string'?value:'')}">`;
  }

  function renderExchangeReview() {
    const x=state.moduleExchange,box=x.modal.querySelector('[data-exchange-content]'),api=ChronicleModuleExchange;
    box.innerHTML=`<div class="chronicle-exchange-review-heading"><h3>Review import</h3><button type="button" class="secondary-action" data-exchange-edit-input>Edit JSON</button><button type="button" class="secondary-action" data-exchange-select="all">Select All</button><button type="button" class="secondary-action" data-exchange-select="none">Select None</button></div><p>Select the values to apply. Occupied fields keep their current value unless selected.</p>${x.review.groups.length?'':'<p>No modules supplied.</p>'}`+x.review.groups.map((group,gi)=>`<section class="chronicle-exchange-group" data-exchange-group="${gi}"><h3><label><input type="checkbox" data-exchange-group-toggle aria-label="Use changes in ${escapeHtml(group.label)}"> ${escapeHtml(group.label)}</label></h3>${group.issue?'<p class="form-status is-error">'+escapeHtml(group.issue)+'</p>':''}${group.rows.map(row=>`<div class="chronicle-exchange-row" data-exchange-row="${row.token}">
      <label class="chronicle-exchange-row-label"><input type="checkbox" data-exchange-use aria-label="Apply ${escapeHtml(row.label)}" ${row.selected?'checked':''}><strong>${escapeHtml(row.label)}</strong>${row.field?'<small>'+escapeHtml(row.field.kind==='custom'?'Custom field':row.field.type)+'</small>':''}</label>
      <p data-exchange-row-status role="status"></p>${row.field?.hint?'<p class="chronicle-muted">'+escapeHtml(row.field.hint)+'</p>':''}
      <div class="chronicle-exchange-comparison"><div><h4>Current draft</h4><pre>${escapeHtml(row.field?api.display(api.fromStored(row.field.value,row.field))||'(empty)':'Unavailable')}</pre></div><div><h4>Incoming</h4>${exchangeIncomingControl(row)}<pre data-exchange-invalid-value>${escapeHtml(api.display(row.input?.value))}</pre></div></div></div>`).join('')}</section>`).join('');
    box.querySelector('[data-exchange-edit-input]').onclick=()=>{x.text=JSON.stringify(x.review.payload,null,2);x.review=null;renderModuleExchange();};
    box.querySelectorAll('[data-exchange-select]').forEach(button=>button.onclick=()=>{
      for(const group of x.review.groups)for(const row of group.rows)row.selected=button.dataset.exchangeSelect==='all'&&['new','conflict'].includes(row.status);
      updateExchangeReviewControls();
    });
    for(const group of x.review.groups)for(const row of group.rows){
      const node=box.querySelector(`[data-exchange-row="${row.token}"]`),check=node.querySelector('[data-exchange-use]'),control=node.querySelector('[data-exchange-value]');
      check.onchange=()=>{row.selected=check.checked;updateExchangeReviewControls();};
      if(control)control.oninput=control.onchange=()=>{
        const before=row.status;
        row.input.value=row.field.type==='checkbox'?control.checked:row.field.type==='multi_select'?[...control.selectedOptions].map(o=>o.value):row.field.type==='number'?control.value===''?null:Number(control.value):control.value;
        Object.assign(row,api.assess(row.field,row.input.value));
        if(!['new','conflict'].includes(row.status))row.selected=false;else if(!['new','conflict'].includes(before))row.selected=row.status==='new';
        updateExchangeReviewControls();
      };
    }
    box.querySelectorAll('[data-exchange-group-toggle]').forEach(control=>control.onchange=()=>{for(const row of x.review.groups[Number(control.closest('[data-exchange-group]').dataset.exchangeGroup)].rows)if(['new','conflict'].includes(row.status))row.selected=control.checked;updateExchangeReviewControls();});
    updateExchangeReviewControls();
  }

  function updateExchangeReviewControls() {
    const x=state.moduleExchange;
    for(const [gi,group] of x.review.groups.entries()){
      const eligible=group.rows.filter(row=>['new','conflict'].includes(row.status)),selected=eligible.filter(row=>row.selected);
      const toggle=x.modal.querySelector(`[data-exchange-group="${gi}"] [data-exchange-group-toggle]`);
      toggle.checked=eligible.length>0&&selected.length===eligible.length;toggle.indeterminate=selected.length>0&&selected.length<eligible.length;toggle.disabled=!eligible.length;
      for(const row of group.rows){
        const node=x.modal.querySelector(`[data-exchange-row="${row.token}"]`),check=node.querySelector('[data-exchange-use]'),message=node.querySelector('[data-exchange-row-status]');
        check.disabled=!eligible.includes(row);check.checked=row.selected;message.textContent=row.message;message.classList.toggle('is-error',row.status==='invalid');node.dataset.status=row.status;
        node.querySelector('[data-exchange-invalid-value]').hidden=row.status!=='invalid';
      }
    }
    x.modal.querySelector('[data-exchange-apply]').disabled=!x.review.groups.some(g=>g.rows.some(r=>r.selected&&['new','conflict'].includes(r.status)));
  }

  function applyModuleExchange() {
    const x=state.moduleExchange;if(!x?.review)return;
    try{
      const current=exchangeWorkspace();
      if(ChronicleModuleExchange.fingerprint(current)!==x.review.fingerprint){
        const payload=x.review.payload;
        try{x.review=ChronicleModuleExchange.review(payload,current);renderModuleExchange();exchangeStatus('The draft or modules changed. Review the updated comparisons before applying.',true);}
        catch(error){x.text=JSON.stringify(payload,null,2);x.review=null;renderModuleExchange();exchangeStatus(error.message,true);}
        return;
      }
      const {changes,skipped}=ChronicleModuleExchange.plan(current,x.review);
      const form=dom.workspace.querySelector('[data-chronicle-workspace-form]'),scroll=window.scrollY;
      // Update existing controls in place, preserving unrelated drafts and open editors.
      for(const change of changes){
        if(change.kind==='custom'){
          const row=[...form.querySelectorAll('[data-custom-field-row]')].find(el=>el.dataset.customFieldId===change.id);
          row.querySelector('[name="custom-value"]').value=change.value;
        }else{
          const field=state.workspace.fields.find(f=>f.id===change.id),control=form.elements.namedItem('workspace-field:'+change.id),type=getTemplateFieldType(field);
          if(type==='checkbox'){control.checked=change.value==='true';control.dataset.touched='true';}
          else if(type==='multi_select'){const values=new Set(change.value.split('\n'));for(const option of control.options)option.selected=values.has(option.value);}
          else{control.value=change.value;const wrapper=control.closest('[data-markdown-field]');if(wrapper)syncToastEditorFromTextarea(wrapper);}
        }
      }
      captureWorkspaceDraft();x.modal.close();updateDirtyStatus();window.scrollTo(0,scroll);
      setWorkspaceStatus(`${changes.length} fields applied to draft; ${skipped} skipped. Save the element to keep these changes.`,'success');
    }catch(error){exchangeStatus(error.message,true);}
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
    setAiModuleGenerateBusy(false);
    dom.aiModuleGenerateForm?.reset();
    renderAiModuleChecklist();
    setAiModuleGenerateStatus("");
    dom.aiModuleGenerateModal.hidden = false;
    document.body.classList.add("centralis-modal-open");
    requestAnimationFrame(() => dom.aiModuleInstructions?.focus({preventScroll:true}));
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
    if (dom.aiModuleProgressStage) dom.aiModuleProgressStage.textContent = message;
  }

  function setAiModuleGenerateBusy(isBusy) {
    const wasBusy = state.aiModuleGeneration.isGenerating;
    state.aiModuleGeneration = {
      ...state.aiModuleGeneration,
      isGenerating: isBusy
    };
    dom.aiModuleGenerateModal?.classList.toggle("is-generating", isBusy);
    if (dom.aiModuleGenerateForm) {
      dom.aiModuleGenerateForm.inert = isBusy;
      dom.aiModuleGenerateForm.setAttribute("aria-busy", String(isBusy));
    }
    if (dom.aiModuleGenerationOverlay) {
      dom.aiModuleGenerationOverlay.hidden = !isBusy;
      if (isBusy) dom.aiModuleGenerationOverlay.focus({ preventScroll: true });
    }
    if (dom.aiModuleGenerateSubmit) {
      dom.aiModuleGenerateSubmit.disabled = isBusy;
      dom.aiModuleGenerateSubmit.innerHTML = isBusy
        ? '<span class="chronicle-ai-loading-icon" aria-hidden="true"></span> Generating…'
        : '<ph-sparkle weight="bold" aria-hidden="true"></ph-sparkle> Generate';
    }
    if (!isBusy && wasBusy && dom.aiModuleGenerateModal?.hidden === false) {
      dom.aiModuleGenerateSubmit?.focus({ preventScroll: true });
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
    // These are actual request boundaries. Neither endpoint emits streaming
    // progress or a known total, so the bar remains indeterminate throughout.
    setAiModuleGenerateStatus("Preparing universe knowledge…");
    try {
      const universeId = workspace.universe?.id || workspace.element.universe_id;
      const syncResponse = await window.centralisSupabase.functions.invoke("sync-universe-ai-source", {
        body: { universeId }
      });
      throwIfError(syncResponse);
      if (syncResponse.data?.error) {
        throw new Error(syncResponse.data.error);
      }

      setAiModuleGenerateStatus("Generating suggestions…");
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
      dom.aiModuleReviewForm?.querySelector("input, textarea, select, button")?.focus({ preventScroll: true });
    } catch (error) {
      console.error("Could not generate Chronicle details.", error);
      setAiModuleGenerateStatus(`Could not generate Chronicle details: ${getReadableError(error)}`, "error");
    } finally {
      setAiModuleGenerateBusy(false);
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
    const value=String(control?.value || "");
    return ['textarea','rich_text'].includes(fieldType)&&value.trim()?value:value.trim();
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
    dom.generateImagePrompt.focus({preventScroll:true});
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
          objectKind: state.workspace.isUniverse ? "universe" : "element",
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
        autofocus: false,
        hideModeSwitch: true,
        toolbarItems: []
      });
      editor.on("change", () => {
        textarea.value = editor.getMarkdown();
        updateDirtyStatus();
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
    updateDirtyStatus();

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
        autofocus: false,
        toolbarItems: getMarkdownToolbarItems()
      });
      state.activeTextEditorDialog.editor = editor;
      [...dom.textEditorHost.querySelectorAll('[contenteditable="true"]')].find(el=>el.getClientRects().length)?.focus({preventScroll:true});
      return;
    }

    if (dom.textEditorFallback) {
      dom.textEditorFallback.hidden = false;
      dom.textEditorFallback.value = textarea.value || "";
      dom.textEditorFallback.focus({preventScroll:true});
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
    updateDirtyStatus();
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
    if(target.name?.startsWith('workspace-field:'))target.dataset.touched='true';
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
    captureWorkspaceDraft();
    state.workspace.removedModuleIds.push(...state.workspace.modules.map(m=>m.id));
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
    normalizeCustomPlacement(); renderWorkspace();
  }

  async function updateWorkspaceTemplate(templateId) {
    captureWorkspaceDraft();
    state.workspace.removedModuleIds.push(...state.workspace.modules.filter(m=>getModuleTemplateId(m)!==templateId).map(m=>m.id));
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
    normalizeCustomPlacement(); renderWorkspace();
  }

  async function addSectionModule(sectionId) {
    captureWorkspaceDraft();
    const w=state.workspace, section=w.sections.find(s=>s.id===sectionId);
    if(!section || w.modules.some(m=>getModuleSectionId(m)===sectionId))return;
    w.modules.push({id:crypto.randomUUID(),element_id:w.element.id,user_id:state.user.id,module_type:TEMPLATE_SECTION_MODULE_TYPE,source:'manual',title:section.name,sort_order:getNextModuleSortOrder(w.modules),data:{section_id:section.id,template_id:w.template.id,ai_draft:true}});
    renderWorkspace();
  }

  async function toggleSectionModule(moduleId) {
    captureWorkspaceDraft();
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
    state.workspace = {
      ...state.workspace,
      modules: state.workspace.modules.map((item) => item.id === module.id ? { ...item, data: nextData } : item)
    };
    renderWorkspace();
  }

  async function removeSectionModule(sectionId) {
    captureWorkspaceDraft();
    const w=state.workspace;
    w.removedModuleIds.push(...w.modules.filter(m=>getModuleSectionId(m)===sectionId).map(m=>m.id));
    w.modules=w.modules.filter(m=>getModuleSectionId(m)!==sectionId);
    normalizeCustomPlacement();renderWorkspace();
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
      form.querySelector('[name="workspace-name"]')?.focus({preventScroll:true});
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
    form.inert=true;form.setAttribute('aria-busy','true');

    try {
      const element = state.workspace.element;
      const shouldResetModules = false;
      const nextTemplateId = templateId;
      if(state.workspace.isUniverse) {
        throwIfError(await window.centralisSupabase.from(UNIVERSES_TABLE).update({name,description:description || null,updated_at:new Date().toISOString()}).eq('id',element.id).eq('user_id',state.user.id));
        captureWorkspaceDraft();await persistCustomFields();
        state.workspace.universe={...state.workspace.universe,name,description};
        markWorkspaceSaved();setWorkspaceStatus('Universe saved.','success');return;
      }
      if(state.workspace.removedModuleIds.length) {
        throwIfError(await window.centralisSupabase.from(CHRONICLE_MODULES_TABLE).delete().in('id',state.workspace.removedModuleIds).eq('element_id',element.id).eq('user_id',state.user.id));
        state.workspace.removedModuleIds=[];
      }

      const elementResponse = await window.centralisSupabase
        .from(ELEMENTS_TABLE)
        .update({
          name,
          description: description || null,
          body: String(formData.get('workspace-body') || '') || null,
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
        const draftModules = state.workspace.modules;
        if (draftModules.length) {
          const draftModuleResponse = await window.centralisSupabase
            .from(CHRONICLE_MODULES_TABLE)
            .upsert(draftModules.map((module) => ({
              id: module.id,
              element_id: element.id,
              user_id: state.user.id,
              module_type: TEMPLATE_SECTION_MODULE_TYPE,
              source: module.source || "manual",
              title: module.title || "Untitled Module",
              sort_order: module.sort_order ?? getNextModuleSortOrder(state.workspace.modules),
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

      captureWorkspaceDraft();
      await persistCustomFields();
      const customRows = [...form.querySelectorAll('[data-custom-field-row]')];
      const customResponses = [], allDeletedCustomFieldIds = [];

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
      markWorkspaceSaved();setWorkspaceStatus("Element saved.", "success");
      syncUniverseAiKnowledgeAfterChronicleSave(state.workspace.universe?.id);
    } catch (error) {
      console.error("Could not save Chronicle workspace.", error);
      setWorkspaceStatus(`Could not save element: ${getReadableError(error)}`, "error");
    } finally {
      form.inert=false;form.setAttribute('aria-busy','false');
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
    requestAnimationFrame(() => dom.createName?.focus({preventScroll:true}));
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
    if (parts[0] === 'universe' && parts[1] && parts.length === 2) return {type:'universe',universeId:decodeURIComponent(parts[1]),elementId:''};
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
      wikiDetailsById: {},
      deletedCustomFieldIds: [],
      removedModuleIds: [],
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
      .sort(sortSections);
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
      return control?.checked ? "true" : control?.dataset.touched || state.workspace?.values.some(v=>v.template_field_id===field.id && hasMeaningfulValue(v.value)) ? "false" : "";
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
        [...wrapper.querySelectorAll('[contenteditable="true"]')].find(el=>el.getClientRects().length)?.focus({preventScroll:true});
        return;
      }
    }
    control?.focus?.({preventScroll:true});
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

    const persistedDraftsBySectionId = new Map((persistedDraftModules || [])
      .map((module) => [getModuleSectionId(module), module])
      .filter(([sectionId]) => Boolean(sectionId)));

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
      customFields: state.workspace.customFields
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
