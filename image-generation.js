(() => {
  const supabase = window.centralisSupabase;
  if (!supabase) {
    document.querySelector("[data-image-composer]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const error = document.querySelector("[data-image-composer-error]");
      if (error) error.textContent = "Image Generation could not initialize. Reload the page and sign in again.";
    });
    return;
  }

  const els = {
    newSessionButtons: [...document.querySelectorAll("[data-image-new-session]")],
    sessionTitle: document.querySelector("[data-image-session-title]"),
    status: document.querySelector("[data-image-session-status]"),
    sessionList: document.querySelector("[data-image-session-list]"),
    conversation: document.querySelector("[data-image-conversation]"),
    empty: document.querySelector("[data-image-empty-state]"),
    composer: document.querySelector("[data-image-composer]"),
    prompt: document.querySelector("[data-image-prompt]"),
    send: document.querySelector("[data-image-send]"),
    error: document.querySelector("[data-image-composer-error]"),
    fileInput: document.querySelector("[data-image-file-input]"),
    attachments: document.querySelector("[data-image-attachments]"),
    useLast: document.querySelector("[data-image-use-last]"),
    referenceOptions: document.querySelector("[data-image-reference-options]"),
    referenceCount: document.querySelector("[data-image-reference-count]"),
    customSize: document.querySelector("[data-image-custom-size]"),
    compressionField: document.querySelector("[data-image-compression-field]"),
    modelSelect: document.querySelector("[data-image-model-select]"),
    sizeField: document.querySelector("[data-image-size-field]"),
    qualityField: document.querySelector("[data-image-quality-field]"),
    backgroundField: document.querySelector("[data-image-background-field]"),
    styleField: document.querySelector("[data-image-style-field]"),
    styleInput: document.querySelector("[data-image-style-input]"),
    stylePicker: document.querySelector("[data-image-style-picker]"),
    styleTrigger: document.querySelector("[data-image-style-trigger]"),
    styleMenu: document.querySelector("[data-image-style-menu]"),
    styleSelectedImage: document.querySelector("[data-image-style-selected-image]"),
    styleSelectedLabel: document.querySelector("[data-image-style-selected-label]"),
    negativePromptField: document.querySelector("[data-image-negative-prompt-field]"),
    seedField: document.querySelector("[data-image-seed-field]"),
    cfgScaleField: document.querySelector("[data-image-cfg-scale-field]"),
    stepsField: document.querySelector("[data-image-steps-field]"),
    webSearchField: document.querySelector("[data-image-web-search-field]"),
    modelSupportNote: document.querySelector("[data-image-model-support-note]"),
    referencePicker: document.querySelector("[data-image-reference-picker]"),
    sessionThumbnails: document.querySelector("[data-image-session-thumbnails]"),
    downloadSelected: document.querySelector("[data-image-download-selected]"),
    downloadAll: document.querySelector("[data-image-download-all]"),
    imageViewerModal: document.getElementById("image-generation-viewer-modal"),
    imageViewerTitle: document.querySelector("[data-image-viewer-title]"),
    imageViewerImage: document.querySelector("[data-image-viewer-image]"),
    imageViewerOpen: document.querySelector("[data-image-viewer-open]"),
    imageViewerClose: document.querySelector("[data-image-viewer-close]"),
    imageViewerPrev: document.querySelector("[data-image-viewer-prev]"),
    imageViewerNext: document.querySelector("[data-image-viewer-next]"),
    imageViewerDetails: document.querySelector("[data-image-viewer-details]"),
    deletingSession: document.querySelector("[data-image-deleting-session]"),
  };

  const state = { user: null, sessions: [], session: null, messages: [], assets: [], selectedAsset: null, viewerAsset: null, viewerZoom: 1, viewerFitWidth: 0, viewerFitHeight: 0, selectedReferences: new Set(), busy: false, activeGeneration: null, modelCatalog: [] };
  const ACTIVE_GENERATION_WINDOW_MS = 20 * 60 * 1000;
  const DEFAULT_MODEL_SETTINGS = { provider: "openai", model: "gpt-image-2", n: 1, size: "auto", width: "", height: "", quality: "auto", format: "png", compression: 90, background: "auto", style_preset: "", negative_prompt: "", seed: "", cfg_scale: "", steps: "", enable_web_search: false, hide_watermark: false, moderation: "low" };
  const CLIENT_IMAGE_MODEL_CATALOG = [
    { id: "gpt-image-2", label: "GPT Image 2", provider: "openai", maxPromptCharacters: 32000, maxOutputs: 10, supportsReferences: true, maxReferences: 16, sizeProfile: "openai", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: true, supportsCompression: true, supportsBackground: true, supportsStylePreset: false, supportsNegativePrompt: false, supportsSeed: false, supportsCfgScale: false, supportsSteps: false, stepsDefault: null, stepsMax: null, widthHeightDivisor: 16, supportsWebSearch: false },
    { id: "flux-2-pro", label: "Flux 2 Pro", provider: "venice", maxPromptCharacters: 3000, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
    { id: "qwen-image-2", label: "Qwen Image 2", provider: "venice", maxPromptCharacters: 10000, maxOutputs: 4, editModelId: "qwen-image-2-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
    { id: "z-image-turbo", label: "Z-Image Turbo", provider: "venice", maxPromptCharacters: 7500, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "pixel", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: false, stepsDefault: 8, stepsMax: 8, widthHeightDivisor: 8, supportsWebSearch: false },
    { id: "nano-banana-pro", label: "Nano Banana Pro", provider: "venice", maxPromptCharacters: 32768, maxOutputs: 4, editModelId: "nano-banana-pro-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "tier", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: true },
    { id: "wan-2-7-pro-text-to-image", label: "Wan 2.7 Pro", provider: "venice", maxPromptCharacters: 3000, maxOutputs: 4, editModelId: "wan-2-7-pro-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
    { id: "seedream-v4", label: "Seedream V4.5", provider: "venice", maxPromptCharacters: 10000, maxOutputs: 4, editModelId: "seedream-v4-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
    { id: "chroma", label: "Chroma", provider: "venice", maxPromptCharacters: 7500, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "pixel", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: false, stepsDefault: 10, stepsMax: 10, widthHeightDivisor: 8, supportsWebSearch: false },
    { id: "recraft-v4-pro", label: "Recraft V4 Pro", provider: "venice", maxPromptCharacters: 10000, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
  ];
  const VENICE_STYLE_SLUGS = [
    "none", "3d-model", "abstract", "advertising", "alien", "analog-film", "anime", "architectural", "cinematic", "collage", "comic-book",
    "craft-clay", "cubist", "digital-art", "disco", "dreamscape", "dystopian", "enhance", "fairy-tale", "fantasy-art", "fighting-game",
    "film-noir", "flat-papercut", "food-photography", "gothic", "graffiti", "grunge", "gta", "hdr", "horror", "hyperrealism",
    "impressionist", "isometric-style", "kirigami", "legend-of-zelda", "line-art", "long-exposure", "lowpoly", "minecraft", "minimalist",
    "monochrome", "nautical", "neon-noir", "neon-punk", "origami", "paper-mache", "paper-quilling", "papercut-collage",
    "papercut-shadow-box", "photographic", "pixel-art", "pointillism", "pokemon", "pop-art", "psychedelic", "real-estate", "renaissance",
    "retro-arcade", "retro-game", "rpg-fantasy-game", "silhouette", "space", "stacked-papercut", "stained-glass", "steampunk",
    "strategy-game", "street-fighter", "super-mario", "surrealist", "techwear-fashion", "texture", "thick-layered-papercut",
    "tilt-shift", "tribal", "typography", "watercolor", "zentangle",
  ];
  const STYLE_WORD_OVERRIDES = { "3d": "3D", gta: "GTA", hdr: "HDR", rpg: "RPG" };
  const VENICE_STYLE_OPTIONS = VENICE_STYLE_SLUGS.map((slug) => {
    const label = slug.split("-").map((word) => STYLE_WORD_OVERRIDES[word] || `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
    return { slug, label, value: slug === "none" ? "" : label, src: `assets/venice-styles/${slug}.jpg` };
  });
  const text = (value) => String(value ?? "");
  const html = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  function getParams() {
    const model = getCurrentModel();
    const params = Object.fromEntries([...document.querySelectorAll("[data-image-param]")].map((input) => [input.dataset.imageParam, input.type === "checkbox" ? input.checked : input.value]));
    if (!model?.supportsStylePreset) params.style_preset = "";
    if (!model?.supportsNegativePrompt) params.negative_prompt = "";
    if (!model?.supportsSeed) params.seed = "";
    if (!model?.supportsCfgScale) params.cfg_scale = "";
    if (!model?.supportsSteps) params.steps = "";
    if (!model?.supportsWebSearch) params.enable_web_search = false;
    if (!model?.supportsQuality && !isGptImage2Model(model)) params.quality = "";
    if (!model?.supportsBackground && !isGptImage2Model(model)) params.background = "";
    if (!model?.supportsCompression && !isGptImage2Model(model)) params.compression = "";
    return params;
  }

  function mergeImageModelCatalog(remoteCatalog = []) {
    const merged = new Map(CLIENT_IMAGE_MODEL_CATALOG.map((model) => [model.id, { ...model }]));
    (Array.isArray(remoteCatalog) ? remoteCatalog : []).forEach((model) => {
      if (!model?.id) return;
      merged.set(model.id, { ...model, ...(merged.get(model.id) || {}) });
    });
    return [...merged.values()];
  }

  function getCurrentModel() {
    return state.modelCatalog.find((model) => model.id === els.modelSelect?.value) || state.modelCatalog[0] || null;
  }

  function isGptImage2Model(model) {
    return model?.id === "gpt-image-2" || model?.provider === "openai";
  }

  function getStyleOption(value) {
    const normalized = text(value).trim().toLowerCase();
    return VENICE_STYLE_OPTIONS.find((option) => option.value.toLowerCase() === normalized) || VENICE_STYLE_OPTIONS[0];
  }

  function renderStylePickerOptions() {
    if (!els.styleMenu) return;
    const current = els.styleInput?.value || "";
    els.styleMenu.innerHTML = `
      <div class="image-generation-style-menu-header">
        <strong>Image Style</strong>
        <button class="icon-button" type="button" data-image-style-close aria-label="Close image style picker"><ph-x aria-hidden="true"></ph-x></button>
      </div>
      <div class="image-generation-style-grid">
        ${VENICE_STYLE_OPTIONS.map((option) => `
          <button class="image-generation-style-option${option.value === current ? " is-selected" : ""}" type="button" role="option" aria-selected="${option.value === current}" data-image-style-value="${html(option.value)}">
            <img src="${html(option.src)}" alt="">
            <span>${html(option.label)}</span>
          </button>`).join("")}
      </div>`;
  }

  function syncStylePicker() {
    const option = getStyleOption(els.styleInput?.value || "");
    if (els.styleInput) els.styleInput.value = option.value;
    if (els.styleSelectedImage) els.styleSelectedImage.src = option.src;
    if (els.styleSelectedLabel) els.styleSelectedLabel.textContent = option.label;
    renderStylePickerOptions();
  }

  function syncParameterSlider(control) {
    if (!control?.dataset?.imageSlider) return;
    const output = document.querySelector(`[data-image-slider-value="${control.dataset.imageSlider}"]`);
    if (output) output.textContent = control.value;
  }

  function syncParameterSliders() {
    document.querySelectorAll("[data-image-slider]").forEach(syncParameterSlider);
  }

  function getDefaultSliderValue(control) {
    if (control?.dataset?.imageSlider === "cfg_scale") return "7";
    if (control?.dataset?.imageSlider === "steps") return "20";
    return control?.min || "1";
  }

  function positionStylePickerMenu() {
    if (!els.styleTrigger || !els.styleMenu || els.styleMenu.hidden) return;
    const rect = els.styleTrigger.getBoundingClientRect();
    const menuWidth = Math.min(350, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
    const top = Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 120));
    els.styleMenu.style.width = `${menuWidth}px`;
    els.styleMenu.style.left = `${left}px`;
    els.styleMenu.style.top = `${top}px`;
    els.styleMenu.style.maxHeight = `${Math.max(240, window.innerHeight - top - 12)}px`;
  }

  function setStylePickerOpen(open) {
    if (!els.styleTrigger || !els.styleMenu) return;
    els.styleTrigger.setAttribute("aria-expanded", String(open));
    els.styleMenu.hidden = !open;
    if (open) requestAnimationFrame(() => {
      positionStylePickerMenu();
      focusSelectedStyleOption();
    });
  }

  function focusSelectedStyleOption() {
    const selected = els.styleMenu?.querySelector(".image-generation-style-option.is-selected");
    const first = els.styleMenu?.querySelector(".image-generation-style-option");
    (selected || first)?.focus();
  }

  function moveStyleFocus(delta) {
    const options = [...(els.styleMenu?.querySelectorAll(".image-generation-style-option") || [])];
    if (!options.length) return;
    const currentIndex = Math.max(0, options.indexOf(document.activeElement));
    options[(currentIndex + delta + options.length) % options.length].focus();
  }

  async function setStylePreset(value) {
    if (!els.styleInput) return;
    els.styleInput.value = getStyleOption(value).value;
    syncStylePicker();
    setStylePickerOpen(false);
    try {
      await saveActiveSettings();
      renderSessions();
    } catch (error) {
      els.error.textContent = error instanceof Error ? error.message : "Could not save the selected style.";
    }
  }

  function applySettings(settings = {}) {
    const values = { ...DEFAULT_MODEL_SETTINGS, ...(settings || {}) };
    for (const [name, value] of Object.entries(values)) {
      const control = document.querySelector(`[data-image-param="${name}"]`);
      if (control && value !== undefined && value !== null) {
        if (control.type === "checkbox") control.checked = value === true || String(value).toLowerCase() === "true";
        else if (control.type === "range" && String(value) === "") control.value = getDefaultSliderValue(control);
        else control.value = String(value);
        syncParameterSlider(control);
      }
    }
    syncStylePicker();
    syncParameterSliders();
  }

  function syncOutputCountForReferences() {
    const count = document.querySelector('[data-image-param="n"]');
    const model = getCurrentModel();
    if (!count || !model) return;
    const referenceEdit = model.supportsReferences && (state.selectedReferences.size > 0 || els.useLast?.checked);
    if (referenceEdit) {
      count.value = "1";
      count.disabled = true;
      count.title = "Reference-image edits return one image.";
    } else {
      count.disabled = false;
      count.removeAttribute("title");
    }
    syncParameterSlider(count);
  }

  function applyModelDefaults(model) {
    const openAiModel = isGptImage2Model(model);
    const defaults = {
      n: "1", size: "auto", width: "", height: "", quality: openAiModel ? "auto" : "",
      format: model.defaultFormat || "png", compression: "90", background: "auto", style_preset: "", negative_prompt: "", seed: "", cfg_scale: "", steps: model.stepsDefault && model.supportsSteps ? String(model.stepsDefault) : "", enable_web_search: false, hide_watermark: model.provider === "venice", moderation: "low",
    };
    for (const [name, value] of Object.entries(defaults)) {
      const control = document.querySelector(`[data-image-param="${name}"]`);
      if (!control) continue;
      if (control.type === "checkbox") control.checked = Boolean(value);
      else control.value = value;
      syncParameterSlider(control);
    }
  }

  function renderModelControls(preferredModelId = null, { resetSettings = false } = {}) {
    if (!els.modelSelect || !state.modelCatalog.length) return;
    const existing = preferredModelId || els.modelSelect.value || state.session?.active_settings?.model || DEFAULT_MODEL_SETTINGS.model;
    els.modelSelect.innerHTML = state.modelCatalog.map((model) => `<option value="${html(model.id)}">${html(model.label)}</option>`).join("");
    els.modelSelect.value = state.modelCatalog.some((model) => model.id === existing) ? existing : state.modelCatalog[0].id;
    const model = getCurrentModel();
    if (!model) return;
    if (resetSettings) applyModelDefaults(model);
    // GPT Image 2 is a direct OpenAI model. Derive its profile from its ID as
    // well as catalog capabilities so an older catalog response cannot leave
    // it in the Venice-only control layout.
    const openAiModel = isGptImage2Model(model);
    const sizeProfile = openAiModel ? "openai" : (model.sizeProfile || "none");
    const supportsQuality = openAiModel || Boolean(model.supportsQuality);
    const supportsCompression = openAiModel || Boolean(model.supportsCompression);
    const supportsBackground = openAiModel || Boolean(model.supportsBackground);
    const supportsStylePreset = Boolean(model.supportsStylePreset);
    const supportsNegativePrompt = Boolean(model.supportsNegativePrompt);
    const supportsSeed = Boolean(model.supportsSeed);
    const supportsCfgScale = Boolean(model.supportsCfgScale);
    const supportsSteps = Boolean(model.supportsSteps);
    const supportsWebSearch = Boolean(model.supportsWebSearch);
    const count = document.querySelector('[data-image-param="n"]');
    if (count) {
      const maxOutputs = Number(model.maxOutputs || 4);
      count.max = String(maxOutputs);
      count.value = String(Math.max(1, Math.min(maxOutputs, Number(count.value || 1))));
      syncParameterSlider(count);
    }
    const format = document.querySelector('[data-image-param="format"]');
    if (format) {
      const selected = model.formats.includes(format.value) ? format.value : model.defaultFormat;
      format.innerHTML = model.formats.map((value) => `<option value="${value}">${value.toUpperCase()}</option>`).join("");
      format.value = selected;
    }
    const showSize = sizeProfile !== "none" && sizeProfile !== "pixel";
    if (els.sizeField) els.sizeField.hidden = !showSize;
    const size = document.querySelector('[data-image-param="size"]');
    const width = document.querySelector('[data-image-param="width"]');
    const height = document.querySelector('[data-image-param="height"]');
    const customOption = size?.querySelector('option[value="custom"]');
    if (customOption) customOption.hidden = sizeProfile !== "openai";
    if (sizeProfile === "pixel") {
      if (els.customSize) els.customSize.hidden = false;
      if (size) size.value = "auto";
      [width, height].forEach((control) => {
        if (!control) return;
        control.min = "1";
        control.max = "1280";
        control.step = String(model.widthHeightDivisor || 8);
        if (!control.value) control.value = "1024";
      });
    } else if (sizeProfile === "openai") {
      [width, height].forEach((control) => {
        if (!control) return;
        control.min = "16";
        control.max = "3840";
        control.step = "16";
      });
    } else if (!showSize) {
      if (size) size.value = "auto";
      if (els.customSize) els.customSize.hidden = true;
    } else if (size?.value === "custom" && sizeProfile !== "openai") {
      size.value = "auto";
      if (els.customSize) els.customSize.hidden = true;
    } else if (els.customSize) {
      els.customSize.hidden = size?.value !== "custom";
    }
    if (els.qualityField) els.qualityField.hidden = !supportsQuality;
    if (els.backgroundField) els.backgroundField.hidden = !supportsBackground;
    [
      [els.styleField, "style_preset", supportsStylePreset],
      [els.negativePromptField, "negative_prompt", supportsNegativePrompt],
      [els.seedField, "seed", supportsSeed],
      [els.cfgScaleField, "cfg_scale", supportsCfgScale],
      [els.stepsField, "steps", supportsSteps],
      [els.webSearchField, "enable_web_search", supportsWebSearch],
    ].forEach(([field, param, supported]) => {
      if (field) field.hidden = !supported;
      const control = document.querySelector(`[data-image-param="${param}"]`);
      if (!supported && control) {
        if (control.type === "checkbox") control.checked = false;
        else control.value = "";
        syncParameterSlider(control);
      }
    });
    const steps = document.querySelector('[data-image-param="steps"]');
    if (steps && supportsSteps) {
      steps.max = String(model.stepsMax || 50);
      if (!steps.value && model.stepsDefault) steps.value = String(model.stepsDefault);
      steps.value = String(Math.max(Number(steps.min || 1), Math.min(Number(steps.max || 50), Number(steps.value || model.stepsDefault || 20))));
      syncParameterSlider(steps);
    }
    const cfgScale = document.querySelector('[data-image-param="cfg_scale"]');
    if (cfgScale && supportsCfgScale) {
      if (!cfgScale.value) cfgScale.value = "7";
      syncParameterSlider(cfgScale);
    }
    syncStylePicker();
    const formatValue = document.querySelector('[data-image-param="format"]')?.value;
    if (els.compressionField) els.compressionField.hidden = !supportsCompression || !["jpeg", "webp"].includes(formatValue);
    const referencesEnabled = Boolean(model.supportsReferences);
    const lastImageOption = els.useLast?.closest("label");
    if (!referencesEnabled) {
      state.selectedReferences.clear();
      els.useLast.checked = false;
      if (els.referencePicker) { els.referencePicker.open = false; els.referencePicker.hidden = true; }
      if (lastImageOption) lastImageOption.hidden = true;
      els.fileInput.disabled = true;
      document.querySelector(".image-generation-attach-button")?.classList.add("is-disabled");
      els.modelSupportNote.textContent = `${model.label} is text-to-image only; reference images are unavailable.`;
    } else {
      if (els.referencePicker) els.referencePicker.hidden = false;
      if (lastImageOption) lastImageOption.hidden = false;
      els.fileInput.disabled = false;
      document.querySelector(".image-generation-attach-button")?.classList.remove("is-disabled");
      els.modelSupportNote.textContent = `${model.provider === "openai" ? "OpenAI" : "Venice"} · Supports up to ${model.maxReferences} reference image${model.maxReferences === 1 ? "" : "s"}.`;
    }
    syncOutputCountForReferences();
    syncParameterSliders();
    renderReferenceOptions();
  }

  async function saveActiveSettings() {
    if (!state.session || !state.user) return;
    const selectedModel = getCurrentModel();
    const activeSettings = { provider: selectedModel?.provider || "venice", ...getParams(), hide_watermark: selectedModel?.provider === "venice" };
    const { data, error } = await supabase.from("image_generation_sessions")
      .update({ active_settings: activeSettings, updated_at: new Date().toISOString() })
      .eq("id", state.session.id).eq("user_id", state.user.id).eq("deleted", false).select("*").single();
    if (error) throw error;
    state.session = data;
    state.sessions = state.sessions.map((session) => session.id === data.id ? data : session);
  }

  async function invoke(name, body) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let message = error.message || `Could not call ${name}.`;
      let errorDetails = null;
      try {
        const details = await error.context.json();
        message = details.error || message;
        errorDetails = details.error_details || details.details || details;
      } catch (_) { /* no structured body */ }
      const requestError = new Error(message);
      requestError.details = errorDetails;
      throw requestError;
    }
    return data;
  }

  async function invokeHighQualityOpenAi(body) {
    let session = await supabase.auth.getSession();
    if (!session.data.session?.access_token) {
      session = await supabase.auth.refreshSession();
    }
    const accessToken = session.data.session?.access_token;
    if (!accessToken) throw new Error("Sign in to generate images.");
    const response = await fetch("/api/generate-high-image", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fallbackMessage = response.status === 404
        ? "High-quality image generation route was not found. Open /api/generate-high-image on the same site to verify it is deployed, then redeploy Vercel if it still returns 404."
        : response.status === 504
          ? "High-quality image generation timed out on Vercel before it could finish. Redeploy with the longer function timeout, then try again."
          : `High-quality image generation returned HTTP ${response.status}.`;
      const requestError = new Error(payload.error || fallbackMessage);
      requestError.details = payload.error_details || payload.details || payload;
      throw requestError;
    }
    return payload;
  }

  function shouldUseHighQualityRoute(model, params) {
    return isGptImage2Model(model) && params.quality === "high";
  }

  async function getCurrentImageGenerationUser() {
    const immediateUser = await window.centralisGetCurrentAppUser?.();
    if (immediateUser) return immediateUser;
    if (window.centralisCurrentAppUser) return window.centralisCurrentAppUser;
    return await new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("centralis:current-user-changed", handleUserChange);
        resolve(null);
      }, 8000);
      function handleUserChange(event) {
        if (!event.detail?.user) return;
        window.clearTimeout(timeout);
        window.removeEventListener("centralis:current-user-changed", handleUserChange);
        resolve(event.detail.user);
      }
      window.addEventListener("centralis:current-user-changed", handleUserChange);
    });
  }

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle("is-error", isError);
  }

  function setBusy(busy) {
    state.busy = busy;
    els.send.disabled = busy || !state.session;
    els.send.querySelector("span").textContent = busy ? "Generating…" : "Send";
  }

  function clearComposerError() {
    els.error.textContent = "";
  }

  function setComposerError(message) {
    const value = text(message);
    if (value === "An image generation is already in progress for this session.") {
      els.error.innerHTML = `<span>${html(value)}</span> <button class="image-generation-inline-error-action" type="button" data-image-cancel-in-progress>Cancel In-progress Generation</button>`;
      return;
    }
    els.error.textContent = value;
  }

  function getActivePendingMessage() {
    const cutoff = Date.now() - ACTIVE_GENERATION_WINDOW_MS;
    return state.messages.find((message) => (
      message.role === "user"
      && message.status === "pending"
      && new Date(message.created_at || 0).getTime() >= cutoff
    ));
  }

  function restoreGenerationState() {
    const pending = getActivePendingMessage();
    if (!pending || !state.session) {
      state.activeGeneration = null;
      setBusy(false);
      return false;
    }
    state.activeGeneration = {
      sessionId: state.session.id,
      messageId: pending.id,
      cancelled: false,
      recovered: true,
    };
    setBusy(true);
    setStatus("Generating images…");
    return true;
  }

  function autoResize() {
    els.prompt.style.height = "auto";
    els.prompt.style.height = `${Math.min(152, Math.max(42, els.prompt.scrollHeight))}px`;
  }

  function renderSessions() {
    els.sessionList.innerHTML = state.sessions.length ? state.sessions.map((session) => `
      <div class="image-generation-session-row ${session.id === state.session?.id ? "is-active" : ""}">
        <button class="image-generation-session-item" type="button" data-image-session-id="${session.id}">
          <strong>${html(session.title)}</strong><small>${new Date(session.updated_at).toLocaleString()}</small>
        </button>
        <div class="image-generation-session-menu">
          <button class="icon-button menu-trigger" type="button" data-image-session-menu="${session.id}" title="Session options" aria-label="Session options" aria-expanded="false"><ph-dots-three-vertical aria-hidden="true"></ph-dots-three-vertical></button>
          <div class="dropdown-menu align-right" role="menu">
            <button type="button" data-image-rename-session="${session.id}" role="menuitem"><ph-pencil-simple aria-hidden="true"></ph-pencil-simple>Rename</button>
            <button type="button" data-image-delete-session="${session.id}" role="menuitem"><ph-trash aria-hidden="true"></ph-trash>Delete</button>
          </div>
        </div>
      </div>`).join("") : '<p class="empty-state">No sessions yet.</p>';
  }

  function isActiveSession(sessionId) {
    return Boolean(sessionId && state.session?.id === sessionId);
  }

  function updateSessionSummary(session) {
    if (!session?.id) return;
    const existingIndex = state.sessions.findIndex((item) => item.id === session.id);
    if (existingIndex >= 0) state.sessions[existingIndex] = session;
    else state.sessions.unshift(session);
    state.sessions.sort((first, second) => new Date(second.updated_at || 0) - new Date(first.updated_at || 0));
    renderSessions();
  }

  function findAssets(messageId) { return state.assets.filter((asset) => asset.message_id === messageId && asset.asset_kind === "output"); }
  function getOutputAssets() {
    return state.assets
      .filter((asset) => asset.asset_kind === "output")
      .sort((first, second) => new Date(first.created_at || 0) - new Date(second.created_at || 0));
  }
  function findMessageReferences(message) {
    const referenceIds = Array.isArray(message?.reference_asset_ids) ? message.reference_asset_ids : [];
    return referenceIds.map(String).map((id) => state.assets.find((asset) => asset.id === id)).filter(Boolean);
  }
  function normalizeSettingsSnapshot(value) {
    let settings = value;
    if (typeof settings === "string") {
      try { settings = JSON.parse(settings); } catch { settings = null; }
    }
    return settings && typeof settings === "object" && Object.keys(settings).length ? settings : null;
  }
  function getSettingsModelLabel(settings) {
    if (settings?.modelLabel) return String(settings.modelLabel);
    const modelId = String(settings?.model || "").trim();
    return state.modelCatalog.find((model) => model.id === modelId)?.label || modelId;
  }
  function getAssetGenerationSettings(asset, fallbackMessage) {
    return normalizeSettingsSnapshot(asset?.generation_settings) || normalizeSettingsSnapshot(fallbackMessage?.settings_snapshot);
  }
  function formatGenerationDuration(settings) {
    const value = settings?.generation_duration_seconds ?? settings?.generationDurationSeconds;
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    return `${seconds.toLocaleString(undefined, { maximumFractionDigits: seconds < 10 ? 1 : 0 })} seconds`;
  }
  function getOutputAssets() {
    return state.assets.filter((asset) => asset.asset_kind === "output" && asset.preview_url);
  }
  function findPromptMessageForAsset(asset) {
    const linkedMessage = state.messages.find((message) => message.id === asset?.message_id);
    if (linkedMessage?.role === "user") return linkedMessage;
    const assetMessageIndex = state.messages.findIndex((message) => message.id === asset?.message_id);
    const precedingMessage = assetMessageIndex > 0 ? state.messages[assetMessageIndex - 1] : null;
    return precedingMessage?.role === "user" ? precedingMessage : null;
  }
  function getGenerationSettingsRows(settings) {
    if (!settings) return [];
    const stylePreset = settings.stylePreset || settings.style_preset;
    const negativePrompt = settings.negativePrompt || settings.negative_prompt;
    const cfgScale = settings.cfgScale ?? settings.cfg_scale;
    const rows = [
      ["Model", getSettingsModelLabel(settings)],
      ["Generation Time", formatGenerationDuration(settings)],
      ["Provider", settings.provider],
      ["Endpoint", settings.endpoint],
      ["Size", settings.size],
      ["Width", settings.width],
      ["Height", settings.height],
      ["Quality", settings.quality],
      ["Format", settings.format ? String(settings.format).toUpperCase() : ""],
      ["Compression", settings.compression !== null && settings.compression !== undefined ? `${settings.compression}%` : ""],
      ["Background", settings.background],
      ["Style", stylePreset],
      ["Negative Prompt", negativePrompt],
      ["Seed", settings.seed],
      ["CFG Scale", cfgScale],
      ["Steps", settings.steps],
      ["Web Search", settings.enableWebSearch || settings.enable_web_search ? "Enabled" : ""],
      ["Hide Watermark", settings.hideWatermark || settings.hide_watermark ? "Enabled" : ""],
      ["Moderation", settings.moderation],
      ["References", settings.reference_count !== null && settings.reference_count !== undefined ? String(settings.reference_count) : ""],
    ];
    return rows.filter(([, value]) => value !== null && value !== undefined && String(value).trim());
  }
  function formatGenerationSettings(settings) {
    return getGenerationSettingsRows(settings).map(([label, value]) => `${label}: ${value}`).join("\n");
  }
  function formatGenerationSettingsInline(settings) {
    if (!settings) return "No generation parameters saved.";
    const stylePreset = settings.stylePreset || settings.style_preset;
    const cfgScale = settings.cfgScale ?? settings.cfg_scale;
    const parts = [
      getSettingsModelLabel(settings),
      formatGenerationDuration(settings),
      settings.provider,
      settings.size,
      settings.quality,
      settings.format ? String(settings.format).toUpperCase() : "",
      settings.compression !== null && settings.compression !== undefined ? `${settings.compression}% compression` : "",
      settings.background && `background ${settings.background}`,
      settings.width && settings.height ? `${settings.width}x${settings.height}` : "",
      stylePreset && `style ${stylePreset}`,
      settings.seed !== null && settings.seed !== undefined && settings.seed !== "" ? `seed ${settings.seed}` : "",
      cfgScale !== null && cfgScale !== undefined && cfgScale !== "" ? `CFG ${cfgScale}` : "",
      settings.steps !== null && settings.steps !== undefined && settings.steps !== "" ? `${settings.steps} steps` : "",
      (settings.enableWebSearch || settings.enable_web_search) ? "web search" : "",
      (settings.hideWatermark || settings.hide_watermark) ? "hide watermark" : "",
      settings.moderation && `moderation ${settings.moderation}`,
      settings.reference_count !== null && settings.reference_count !== undefined ? `${settings.reference_count} references` : "",
    ];
    return parts.filter((value) => value && String(value).trim()).join(" / ") || "No generation parameters saved.";
  }
  function renderAssetGenerationSettingsActions(asset, fallbackMessage) {
    const settings = getAssetGenerationSettings(asset, fallbackMessage);
    const model = getSettingsModelLabel(settings);
    const details = formatGenerationSettings(settings);
    if (!model) return "";
    return `<span class="image-generation-output-model" title="${html(details || "Model used for this generation")}">${html(model)}</span>${details ? `<button class="image-generation-chat-action image-generation-settings-action" type="button" title="${html(details)}" aria-label="Generation settings for ${html(model)}"><ph-info aria-hidden="true"></ph-info></button>` : ""}`;
  }
  function renderConversation() {
    els.empty.hidden = state.messages.length > 0;
    const messagesHtml = state.messages.map((message, index) => {
      const precedingMessage = state.messages[index - 1];
      const outputAssets = message.role === "assistant"
        ? [...findAssets(message.id), ...(precedingMessage?.role === "user" ? findAssets(precedingMessage.id) : [])]
        : [];
      const previews = outputAssets.length ? `<div class="image-generation-message-assets">${outputAssets.map((asset) => {
        const settingsFallbackMessage = message.role === "assistant" ? precedingMessage : message;
        return `<div class="image-generation-message-asset">
        <button class="image-generation-chat-image" type="button" data-image-open-output-id="${asset.id}" title="Open generated image"><img src="${asset.preview_url}" alt="${html(asset.original_filename || "Generated output")}"></button>
        <div class="image-generation-message-actions" aria-label="Generated image actions">
          <button class="image-generation-chat-action" type="button" data-image-copy-output="${asset.id}" title="Copy image" aria-label="Copy image"><ph-copy aria-hidden="true"></ph-copy></button>
          <button class="image-generation-chat-action" type="button" data-image-download-output="${asset.id}" title="Download image" aria-label="Download image"><ph-download-simple aria-hidden="true"></ph-download-simple></button>
          <button class="image-generation-chat-action" type="button" data-image-include-output="${asset.id}" title="Include in next prompt" aria-label="Include in next prompt"><ph-paperclip aria-hidden="true"></ph-paperclip></button>
          ${renderAssetGenerationSettingsActions(asset, settingsFallbackMessage)}
        </div>
      </div>`;
      }).join("")}</div>` : "";
      const references = message.role === "user" ? findMessageReferences(message) : [];
      const referencePreviews = references.length ? `<div class="image-generation-message-references" aria-label="Reference images used">
        ${references.map((asset) => `<button type="button" data-image-open-asset-id="${asset.id}" title="${html(asset.original_filename || "Reference image")}"><img src="${asset.preview_url}" alt="Reference: ${html(asset.original_filename || "uploaded image")}"></button>`).join("")}
      </div>` : "";
      const stateLabel = message.status === "failed" ? (message.error_message || "Generation failed.") : "";
      const errorDetails = message.status === "failed" && message.error_details
        ? `<details class="image-generation-error-details"><summary>Full error JSON</summary><pre>${html(JSON.stringify(message.error_details, null, 2))}</pre></details>`
        : "";
      const generatingPlaceholder = message.role === "user" && message.status === "pending"
        ? `<article class="image-generation-message is-assistant is-generating" role="status" aria-label="Generating image">
            <div class="image-generation-generating-image" aria-hidden="true">
              <div class="image-generation-generating-shimmer"></div>
              <ph-image-square></ph-image-square>
              <span>Creating image</span>
            </div>
            <button class="image-generation-stop-action" type="button" data-image-stop-generation title="Stop this generation" aria-label="Stop this generation">
              <ph-stop weight="fill" aria-hidden="true"></ph-stop>
            </button>
          </article>`
        : "";
      const promptActions = message.role === "user" && ["completed", "failed"].includes(message.status) ? `<div class="image-generation-message-actions is-user" aria-label="Prompt actions">
        <button class="image-generation-chat-action" type="button" data-image-copy-message="${message.id}" title="Copy prompt" aria-label="Copy prompt"><ph-copy aria-hidden="true"></ph-copy></button>
        <button class="image-generation-chat-action" type="button" data-image-delete-message="${message.id}" title="Remove this chat" aria-label="Remove this chat"><ph-trash aria-hidden="true"></ph-trash></button>
        <button class="image-generation-chat-action" type="button" data-image-new-session-from-message="${message.id}" title="Start a new session with this prompt" aria-label="Start a new session with this prompt"><ph-sign-out aria-hidden="true"></ph-sign-out></button>
      </div>` : "";
      return `<article class="image-generation-message is-${message.role} ${message.status === "failed" ? "is-failed" : ""}">
        <div>${html(message.content)}</div>${referencePreviews}${previews}${stateLabel ? `<p class="image-generation-message-meta">${html(stateLabel)}</p>` : ""}${errorDetails}
      </article>${promptActions}${generatingPlaceholder}`;
    }).join("");
    els.conversation.querySelectorAll(".image-generation-message, .image-generation-message-actions").forEach((node) => node.remove());
    els.conversation.insertAdjacentHTML("beforeend", messagesHtml);
    scrollConversationToBottom();
    els.conversation.querySelectorAll("img").forEach((image) => {
      if (!image.complete) image.addEventListener("load", scrollConversationToBottom, { once: true });
    });
  }

  function scrollConversationToBottom() {
    requestAnimationFrame(() => {
      els.conversation.scrollTop = els.conversation.scrollHeight;
      setTimeout(() => { els.conversation.scrollTop = els.conversation.scrollHeight; }, 60);
      setTimeout(() => { els.conversation.scrollTop = els.conversation.scrollHeight; }, 180);
    });
  }

  function renderReferenceOptions() {
    const model = getCurrentModel();
    if (model && !model.supportsReferences) {
      els.referenceOptions.innerHTML = "";
      els.referenceCount.textContent = "Unavailable";
      els.attachments.hidden = true;
      return;
    }
    const options = state.assets.filter((asset) => asset.preview_url);
    els.referenceOptions.innerHTML = options.length ? options.map((asset) => `
      <button class="image-generation-reference-option ${state.selectedReferences.has(asset.id) ? "is-selected" : ""}" type="button" data-image-reference-id="${asset.id}" title="${html(asset.original_filename)}">
        <img src="${asset.preview_url}" alt="${html(asset.original_filename)}">
      </button>`).join("") : '<span>No session images yet.</span>';
    els.referenceCount.textContent = `${state.selectedReferences.size} selected${model ? ` / ${model.maxReferences}` : ""}`;
    const selected = state.assets.filter((asset) => state.selectedReferences.has(asset.id));
    els.attachments.hidden = !selected.length;
    els.attachments.innerHTML = selected.map((asset) => `<span class="image-generation-attachment">
      <img src="${asset.preview_url}" alt="${html(asset.original_filename)}">
      <span>${html(asset.original_filename)}</span>
      <button type="button" data-image-remove-reference="${asset.id}" aria-label="Remove ${html(asset.original_filename)}">&times;</button>
    </span>`).join("");
    syncOutputCountForReferences();
  }

  function renderSessionThumbnails() {
    const outputs = getOutputAssets();
    if (!outputs.length) {
      els.sessionThumbnails.innerHTML = '<p class="image-generation-thumbnail-empty">Generated images will appear here.</p>';
      els.downloadSelected.disabled = true; els.downloadAll.disabled = true; return;
    }
    if (!state.selectedAsset || !outputs.some((asset) => asset.id === state.selectedAsset.id)) state.selectedAsset = outputs[outputs.length - 1];
    els.sessionThumbnails.innerHTML = outputs.map((asset) => `<button type="button" class="image-generation-thumbnail ${asset.id === state.selectedAsset.id ? "is-active" : ""}" data-image-output-id="${asset.id}" title="Select ${html(asset.original_filename)}"><img src="${asset.preview_url}" alt="${html(asset.original_filename)}"></button>`).join("");
    els.downloadSelected.disabled = false; els.downloadAll.disabled = false;
  }

  function renderImageViewerDetails() {
    if (!els.imageViewerDetails) return;
    const promptMessage = findPromptMessageForAsset(state.viewerAsset);
    const settings = getAssetGenerationSettings(state.viewerAsset, promptMessage);
    const prompt = promptMessage?.content || "Prompt unavailable";
    const params = formatGenerationSettingsInline(settings);
    els.imageViewerDetails.innerHTML = `
      <p title="${html(prompt)}"><strong>Prompt Used:</strong> ${html(prompt)}</p>
      <p title="${html(formatGenerationSettings(settings) || params)}"><strong>Parameters Used:</strong> ${html(params)}</p>
    `;
  }
  function getImageViewerAssetSet(asset) {
    if (asset?.asset_kind === "output") {
      const outputs = getOutputAssets();
      return outputs.length ? outputs : [asset];
    }
    return asset ? [asset] : [];
  }
  function mapImageGenerationViewerAssets(assets) {
    return (assets || []).filter((asset) => asset?.preview_url).map((asset, index, list) => ({
      id: asset.id,
      src: asset.preview_url,
      name: asset.original_filename || (asset.asset_kind === "output" ? `Generated image ${index + 1}` : "Reference image"),
      downloadName: asset.original_filename || `centralis-image-${asset.id || index + 1}.png`,
      alt: asset.original_filename || (asset.asset_kind === "output" ? "Generated image" : "Reference image"),
      metadata: {
        ...asset,
        viewerTotal: list.length
      }
    }));
  }
  function getImageGenerationViewerDetails(viewerImage) {
    const asset = viewerImage?.metadata || viewerImage || {};
    const promptMessage = findPromptMessageForAsset(asset);
    const settings = getAssetGenerationSettings(asset, promptMessage);
    const fileLabel = asset.original_filename || asset.id || "Image";
    const imageInfoRows = [
      ["Source", asset.asset_kind === "output" ? "Image Generation output" : "Image Generation reference"],
      ["File", fileLabel],
      ["Asset ID", asset.id || ""],
      ["Images in Set", String(asset.viewerTotal || 1)]
    ].filter(([, value]) => value !== null && value !== undefined && String(value).trim());
    const details = {
      imageInfo: {
        title: "Image Information",
        rows: imageInfoRows
      }
    };
    if (promptMessage?.content) {
      details.promptInfo = {
        title: "Prompt Information",
        body: promptMessage.content
      };
    }
    const settingsRows = getGenerationSettingsRows(settings);
    if (settingsRows.length) {
      details.generatorInfo = {
        title: "Image Generator Information",
        rows: settingsRows
      };
    }
    return details;
  }
  function resetImageViewerZoom() {
    state.viewerZoom = 1;
    state.viewerFitWidth = 0;
    state.viewerFitHeight = 0;
    if (!els.imageViewerImage) return;
    els.imageViewerImage.style.width = "";
    els.imageViewerImage.style.height = "";
    els.imageViewerImage.classList.remove("is-zoomed");
  }

  function getImageViewerStage() {
    return els.imageViewerImage?.closest(".image-generation-viewer-stage") || null;
  }

  function centerImageViewerScroll() {
    const stage = getImageViewerStage();
    if (!stage) return;
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
    stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
  }

  function fitImageViewerToFrame() {
    const image = els.imageViewerImage;
    const stage = getImageViewerStage();
    if (!image || !stage || !image.naturalWidth || !image.naturalHeight) return;
    const frameWidth = Math.max(1, stage.clientWidth);
    const frameHeight = Math.max(1, stage.clientHeight);
    const fitScale = Math.min(frameWidth / image.naturalWidth, frameHeight / image.naturalHeight, 1);
    state.viewerFitWidth = Math.max(1, Math.floor(image.naturalWidth * fitScale));
    state.viewerFitHeight = Math.max(1, Math.floor(image.naturalHeight * fitScale));
    setImageViewerZoom(1);
    requestAnimationFrame(centerImageViewerScroll);
  }

  function setImageViewerZoom(nextZoom) {
    const image = els.imageViewerImage;
    if (!image) return;
    state.viewerZoom = Math.max(0.25, Math.min(5, nextZoom));
    const baseWidth = state.viewerFitWidth || image.clientWidth || image.naturalWidth;
    const baseHeight = state.viewerFitHeight || image.clientHeight || image.naturalHeight;
    if (!baseWidth || !baseHeight) return;
    image.style.width = `${Math.max(1, Math.round(baseWidth * state.viewerZoom))}px`;
    image.style.height = `${Math.max(1, Math.round(baseHeight * state.viewerZoom))}px`;
    image.classList.toggle("is-zoomed", state.viewerZoom > 1.01);
  }
  function syncImageViewerNav() {
    const outputs = getOutputAssets();
    const index = outputs.findIndex((asset) => asset.id === state.viewerAsset?.id);
    const hasMultiple = outputs.length > 1 && index >= 0;
    if (els.imageViewerPrev) els.imageViewerPrev.disabled = !hasMultiple;
    if (els.imageViewerNext) els.imageViewerNext.disabled = !hasMultiple;
  }
  function openImageViewer(asset) {
    if (!asset?.preview_url) return;
    if (typeof window.openCentralisImageViewer === "function") {
      const viewerAssets = getImageViewerAssetSet(asset);
      state.viewerAsset = asset;
      state.selectedAsset = asset.asset_kind === "output" ? asset : state.selectedAsset;
      renderSessionThumbnails();
      window.openCentralisImageViewer({
        title: asset.original_filename || "Generated image",
        kicker: asset.asset_kind === "output" ? "Image Generator Viewer" : "Reference Image Viewer",
        images: mapImageGenerationViewerAssets(viewerAssets),
        activeImageId: asset.id,
        details: getImageGenerationViewerDetails,
        capabilities: {
          canNavigate: asset.asset_kind === "output",
          canShowThumbnails: asset.asset_kind === "output" && viewerAssets.length > 1,
          canSetPrimary: false,
          canOpen: true,
          canDownload: true,
          canDelete: false
        },
        actions: {
          changeImage: (viewerImage) => {
            const nextAsset = viewerImage?.metadata;
            if (!nextAsset) return;
            state.viewerAsset = nextAsset;
            state.selectedAsset = nextAsset.asset_kind === "output" ? nextAsset : state.selectedAsset;
            renderSessionThumbnails();
          },
          download: async (viewerImage) => {
            await downloadAsset(viewerImage?.metadata);
            return false;
          }
        }
      });
      return;
    }
    if (!els.imageViewerModal) return;
    state.viewerAsset = asset;
    state.selectedAsset = asset;
    els.imageViewerTitle.textContent = asset.original_filename || "Generated image";
    els.imageViewerImage.src = asset.preview_url;
    els.imageViewerImage.alt = asset.original_filename || "Generated image";
    resetImageViewerZoom();
    els.imageViewerImage.onload = fitImageViewerToFrame;
    renderSessionThumbnails();
    renderImageViewerDetails();
    syncImageViewerNav();
    openModal(els.imageViewerModal);
    if (els.imageViewerImage.complete) requestAnimationFrame(fitImageViewerToFrame);
  }
  function moveImageViewer(direction) {
    const outputs = getOutputAssets();
    const index = outputs.findIndex((asset) => asset.id === state.viewerAsset?.id);
    if (outputs.length < 2 || index < 0) return;
    const nextIndex = (index + direction + outputs.length) % outputs.length;
    openImageViewer(outputs[nextIndex]);
  }

  function closeImageViewer() {
    if (els.imageViewerModal && !els.imageViewerModal.hidden) closeModal();
  }

  function renderAll() {
    els.sessionTitle.textContent = state.session?.title || "New Generation";
    renderSessions(); renderConversation(); renderReferenceOptions(); renderSessionThumbnails();
  }

  async function loadSessions({ createIfNone = true } = {}) {
    const { data, error } = await supabase.from("image_generation_sessions").select("*").eq("user_id", state.user.id).eq("deleted", false).order("updated_at", { ascending: false });
    if (error) throw error;
    state.sessions = data || [];
    if (!state.sessions.length && createIfNone) return createSession();
    const requestedSessionId = new URLSearchParams(window.location.search).get("session_id");
    const initialSession = state.sessions.find((session) => session.id === requestedSessionId) || state.sessions[0];
    if (initialSession) await openSession(initialSession.id);
    else renderAll();
  }

  async function createSession({ prompt = "" } = {}) {
    els.error.textContent = "";
    const { data, error } = await supabase.from("image_generation_sessions").insert({ user_id: state.user.id, title: "New Generation", active_settings: DEFAULT_MODEL_SETTINGS }).select("*").single();
    if (error) throw error;
    state.sessions.unshift(data); await openSession(data.id);
    if (prompt) {
      els.prompt.value = prompt;
      autoResize();
      els.prompt.focus();
    }
  }

  async function openSession(sessionId) {
    els.error.textContent = "";
    setStatus("Loading session…");
    try {
      const payload = await invoke("get-image-generation-session", { sessionId });
      state.modelCatalog = mergeImageModelCatalog(payload.modelCatalog);
      state.session = payload.session; state.messages = payload.messages || []; state.assets = payload.assets || []; state.selectedReferences.clear();
      applySettings(payload.session?.active_settings || DEFAULT_MODEL_SETTINGS);
      renderModelControls();
      state.selectedAsset = state.assets.filter((asset) => asset.asset_kind === "output").at(-1) || null;
      const hasActiveGeneration = restoreGenerationState();
      if (!hasActiveGeneration) setStatus("Ready");
      renderAll();
      window.setTimeout(() => {
        if (state.session?.id === sessionId) {
          scrollConversationToBottom();
        }
      }, 120);
    } catch (error) {
      setStatus("Could not load session", true);
      throw error;
    }
  }

  async function refreshSessions(sessionId = state.session?.id) {
    const { data, error } = await supabase.from("image_generation_sessions").select("*").eq("user_id", state.user.id).eq("deleted", false).order("updated_at", { ascending: false });
    if (error) throw error;
    state.sessions = data || [];
    if (sessionId) await openSession(sessionId);
  }

  async function uploadFiles(files) {
    if (!files.length || !state.session) return;
    const form = new FormData(); form.set("sessionId", state.session.id);
    [...files].forEach((file) => form.append("files", file));
    setStatus("Uploading references…");
    const { data, error } = await supabase.functions.invoke("upload-image-generation-reference", { body: form });
    if (error) throw new Error(error.message || "Could not upload references.");
    for (const asset of data.assets || []) { state.assets.push(asset); state.selectedReferences.add(asset.id); }
    setStatus("Ready"); renderReferenceOptions();
  }

  async function sendPrompt(event) {
    event.preventDefault();
    const generationStartedAt = new Date().toISOString();
    if (state.busy) return;
    const prompt = els.prompt.value.trim();
    els.error.textContent = "";
    const model = getCurrentModel();
    if (!prompt) { els.error.textContent = "Describe the image you want to generate."; return; }
    if (state.selectedReferences.size > (model?.maxReferences || 0)) { els.error.textContent = `Select no more than ${model?.maxReferences || 0} references for this model.`; return; }
    if (!model?.supportsReferences && (state.selectedReferences.size || els.useLast.checked)) {
      els.error.textContent = `${model?.label || "This model"} does not support reference images.`;
      return;
    }
    const params = getParams();
    const referenceAssetIds = [...state.selectedReferences];
    const useLastGenerated = els.useLast.checked;
    const optimistic = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: prompt,
      status: "pending",
      created_at: new Date().toISOString(),
      reference_asset_ids: referenceAssetIds,
    };
    const generation = { sessionId: state.session.id, cancelled: false };
    state.activeGeneration = generation;
    state.messages.push(optimistic);
    els.prompt.value = "";
    state.selectedReferences.clear();
    els.useLast.checked = false;
    autoResize();
    renderReferenceOptions();
    renderConversation(); setBusy(true); setStatus("Generating images…");
    try {
      const selectedModel = getCurrentModel();
      const requestBody = { sessionId: generation.sessionId, prompt, generationStartedAt, settings: { provider: selectedModel?.provider || "venice", ...params, hide_watermark: selectedModel?.provider === "venice" }, referenceAssetIds, useLastGenerated };
      const payload = shouldUseHighQualityRoute(model, params)
        ? await invokeHighQualityOpenAi(requestBody)
        : await invoke("generate-session-images", requestBody);
      if (generation.cancelled) {
        if (isActiveSession(generation.sessionId)) await openSession(generation.sessionId);
        return;
      }
      if (!isActiveSession(generation.sessionId)) {
        updateSessionSummary(payload.session);
        return;
      }
      const savedUserMessage = payload.userMessage || { ...optimistic, status: "completed" };
      state.messages = state.messages.filter((message) => message.id !== optimistic.id);
      state.messages.push(savedUserMessage);
      if (payload.assistantMessage) state.messages.push(payload.assistantMessage);
      state.assets.push(...(payload.assets || []));
      state.selectedAsset = (payload.assets || []).at(-1) || state.selectedAsset;
      state.session = payload.session || state.session;
      state.sessions = state.sessions.map((session) => session.id === state.session.id ? state.session : session)
        .sort((first, second) => new Date(second.updated_at) - new Date(first.updated_at));
      renderAll();
      setStatus("Ready");
    } catch (error) {
      if (generation.cancelled) {
        if (isActiveSession(generation.sessionId)) await openSession(generation.sessionId);
        return;
      }
      if (!isActiveSession(generation.sessionId)) {
        await clearPendingGenerationAfterError(generation.sessionId, error instanceof Error ? error.message : "Could not generate images.", error?.details || null);
        return;
      }
      optimistic.status = "failed";
      optimistic.error_message = error instanceof Error ? error.message : "Could not generate images.";
      optimistic.error_details = error?.details || null;
      if (optimistic.error_message !== "An image generation is already in progress for this session.") {
        await clearPendingGenerationAfterError(generation.sessionId, optimistic.error_message, optimistic.error_details);
      }
      renderConversation(); setComposerError(optimistic.error_message); setStatus("Generation failed", true);
    } finally {
      if (state.activeGeneration === generation) state.activeGeneration = null;
      if (isActiveSession(generation.sessionId)) setBusy(false);
    }
  }

  async function clearPendingGenerationAfterError(sessionId, errorMessage, errorDetails = null) {
    if (!sessionId) return;
    try {
      await invoke("cancel-image-generation", {
        sessionId,
        errorMessage: errorMessage || "Generation failed before completion.",
        errorDetails: {
          ...(errorDetails && typeof errorDetails === "object" ? errorDetails : {}),
          cleanup: true,
          message: errorMessage || "Generation failed before completion.",
        },
      });
    } catch (cleanupError) {
      console.warn("Could not clear failed image generation lock.", cleanupError);
    }
  }

  async function cancelInProgressGenerationFromError(button) {
    const sessionId = state.session?.id;
    if (!sessionId) return;
    button.disabled = true;
    button.textContent = "Cancelling...";
    await clearPendingGenerationAfterError(sessionId, "Generation cancelled by user.", { cancelled: true });
    state.activeGeneration = null;
    setBusy(false);
    clearComposerError();
    setStatus("Ready");
    await refreshSessions(sessionId);
  }

  async function cancelGeneration() {
    const sessionId = state.session?.id;
    if (!sessionId) return;
    if (state.activeGeneration?.sessionId === sessionId) state.activeGeneration.cancelled = true;
    try {
      await invoke("cancel-image-generation", { sessionId });
      await refreshSessions(sessionId);
      els.error.textContent = "";
      setStatus("Generation cancelled");
    } catch (error) {
      els.error.textContent = error instanceof Error ? error.message : "Could not cancel this generation.";
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip(assetIds) {
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(`${window.CENTRALIS_SUPABASE_CONFIG.url}/functions/v1/download-image-generation-zip`, {
        method: "POST", headers: { "Authorization": `Bearer ${session.data.session?.access_token}`, "apikey": window.CENTRALIS_SUPABASE_CONFIG.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.session.id, assetIds }),
      });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || "Could not prepare the download."); }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `centralis-image-generation-${state.session.id}.zip`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { els.error.textContent = error instanceof Error ? error.message : "Could not download images."; }
  }

  async function downloadAsset(asset) {
    if (!asset) return;
    try {
      const payload = await invoke("get-image-generation-asset-url", { assetId: asset.id, download: true });
      const link = document.createElement("a");
      link.href = payload.url; link.download = asset.original_filename; document.body.append(link); link.click(); link.remove();
    } catch (error) { els.error.textContent = error instanceof Error ? error.message : "Could not download this image."; }
  }

  async function downloadSelected() { await downloadAsset(state.selectedAsset); }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("Your browser could not copy this text.");
  }

  async function copyImage(asset) {
    if (!asset?.preview_url) throw new Error("This image is not available to copy.");
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("Your browser does not support copying images to the clipboard.");
    }
    const response = await fetch(asset.preview_url);
    if (!response.ok) throw new Error("Could not load this image for copying.");
    let image = await response.blob();
    if (!image.type.startsWith("image/")) throw new Error("This file is not an image.");
    if (image.type !== "image/png" && typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(image);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      image = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!image) throw new Error("Could not prepare this image for copying.");
    }
    await navigator.clipboard.write([new ClipboardItem({ [image.type]: image })]);
  }

  function includeOutput(asset) {
    const latestOutput = getOutputAssets().at(-1);
    state.selectedReferences.clear();
    if (asset?.id === latestOutput?.id) {
      els.useLast.checked = true;
    } else if (asset) {
      state.selectedReferences.add(asset.id);
      els.useLast.checked = false;
    }
    els.error.textContent = "";
    renderReferenceOptions();
    els.prompt.focus();
  }

  function setDeletingSession(isDeleting) {
    if (!els.deletingSession) return;
    els.deletingSession.hidden = !isDeleting;
    document.body.classList.toggle("is-deleting-image-session", isDeleting);
  }

  function bind() {
    els.newSessionButtons.forEach((button) => button.addEventListener("click", async () => { try { await createSession(); } catch (error) { els.error.textContent = error.message; } }));
    els.error.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-image-cancel-in-progress]");
      if (!button) return;
      event.preventDefault();
      try {
        await cancelInProgressGenerationFromError(button);
      } catch (error) {
        setComposerError(error instanceof Error ? error.message : "Could not cancel the in-progress generation.");
        setStatus("Cancel failed", true);
      }
    });
    els.sessionList.addEventListener("click", async (event) => {
      const menuTrigger = event.target.closest("[data-image-session-menu]");
      const rename = event.target.closest("[data-image-rename-session]");
      const remove = event.target.closest("[data-image-delete-session]");
      const button = event.target.closest("[data-image-session-id]");
      try {
        if (menuTrigger) {
          const isOpen = menuTrigger.getAttribute("aria-expanded") === "true";
          els.sessionList.querySelectorAll("[data-image-session-menu]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
          menuTrigger.setAttribute("aria-expanded", String(!isOpen));
        } else if (rename) {
          const session = state.sessions.find((item) => item.id === rename.dataset.imageRenameSession);
          const title = window.prompt("Session name", session?.title || "");
          if (!title?.trim()) return;
          const { error } = await supabase.from("image_generation_sessions").update({ title: title.trim(), updated_at: new Date().toISOString() }).eq("id", rename.dataset.imageRenameSession).eq("user_id", state.user.id).eq("deleted", false);
          if (error) throw error;
          await refreshSessions(rename.dataset.imageRenameSession);
        } else if (remove) {
          const sessionId = remove.dataset.imageDeleteSession;
          const session = state.sessions.find((item) => item.id === sessionId);
          if (!window.confirm(`Delete “${session?.title || "this session"}” and all of its stored images?`)) return;
          setDeletingSession(true);
          try {
            await invoke("delete-image-generation-session", { sessionId });
            state.sessions = state.sessions.filter((item) => item.id !== sessionId);
            if (state.session?.id === sessionId) { state.session = null; state.messages = []; state.assets = []; await loadSessions(); }
            else renderSessions();
          } finally {
            setDeletingSession(false);
          }
        } else if (button) {
          await openSession(button.dataset.imageSessionId);
        }
      } catch (error) { els.error.textContent = error instanceof Error ? error.message : "Could not update this session."; }
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".image-generation-session-menu")) {
        els.sessionList.querySelectorAll("[data-image-session-menu]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
      }
      if (els.stylePicker && !event.target.closest("[data-image-style-picker]")) setStylePickerOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        els.sessionList.querySelectorAll("[data-image-session-menu]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
        setStylePickerOpen(false);
      }
    });
    document.addEventListener("scroll", () => {
      if (els.styleTrigger?.getAttribute("aria-expanded") === "true") positionStylePickerMenu();
    }, true);
    window.addEventListener("resize", () => {
      if (els.styleTrigger?.getAttribute("aria-expanded") === "true") positionStylePickerMenu();
    });
    renderStylePickerOptions();
    els.styleTrigger?.addEventListener("click", () => {
      const isOpen = els.styleTrigger.getAttribute("aria-expanded") === "true";
      setStylePickerOpen(!isOpen);
    });
    els.styleTrigger?.addEventListener("keydown", (event) => {
      if (["Enter", " ", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        setStylePickerOpen(true);
      }
    });
    els.styleMenu?.addEventListener("click", async (event) => {
      if (event.target.closest("[data-image-style-close]")) {
        setStylePickerOpen(false);
        els.styleTrigger?.focus();
        return;
      }
      const option = event.target.closest("[data-image-style-value]");
      if (option) await setStylePreset(option.dataset.imageStyleValue || "");
    });
    els.styleMenu?.addEventListener("keydown", async (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setStylePickerOpen(false);
        els.styleTrigger?.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveStyleFocus(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveStyleFocus(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        els.styleMenu.querySelector(".image-generation-style-option")?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        [...els.styleMenu.querySelectorAll(".image-generation-style-option")].at(-1)?.focus();
      } else if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        const option = event.target.closest("[data-image-style-value]");
        if (option) await setStylePreset(option.dataset.imageStyleValue || "");
      }
    });
    els.composer.addEventListener("submit", sendPrompt);
    els.prompt.addEventListener("input", autoResize);
    els.prompt.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); els.composer.requestSubmit(); } });
    els.fileInput.addEventListener("change", async () => { try { await uploadFiles(els.fileInput.files); els.fileInput.value = ""; } catch (error) { els.error.textContent = error.message; setStatus("Upload failed", true); } });
    els.useLast.addEventListener("change", () => { syncOutputCountForReferences(); renderReferenceOptions(); });
    document.querySelector("[data-image-param=\"size\"]").addEventListener("change", (event) => {
      els.customSize.hidden = event.target.value !== "custom" || getCurrentModel()?.sizeProfile !== "openai";
    });
    document.querySelectorAll("[data-image-param]").forEach((control) => control.addEventListener("change", async (event) => {
      try {
        syncParameterSlider(event.target);
        if (event.target === els.modelSelect) {
          renderModelControls(event.target.value, { resetSettings: true });
        } else if (event.target.dataset.imageParam === "format") {
          renderModelControls();
        }
        await saveActiveSettings();
        renderSessions();
      } catch (error) {
        els.error.textContent = error instanceof Error ? error.message : "Could not save generation settings.";
      }
    }));
    document.querySelectorAll("[data-image-slider]").forEach((control) => control.addEventListener("input", () => syncParameterSlider(control)));
    els.referenceOptions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-image-reference-id]");
      if (!button) return;
      const model = getCurrentModel();
      if (!model?.supportsReferences) return;
      const id = button.dataset.imageReferenceId;
      if (!state.selectedReferences.has(id) && state.selectedReferences.size >= model.maxReferences) {
        els.error.textContent = `Select no more than ${model.maxReferences} references for ${model.label}.`;
        return;
      }
      state.selectedReferences.has(id) ? state.selectedReferences.delete(id) : state.selectedReferences.add(id);
      renderReferenceOptions();
    });
    els.attachments.addEventListener("click", (event) => { const button = event.target.closest("[data-image-remove-reference]"); if (!button) return; state.selectedReferences.delete(button.dataset.imageRemoveReference); renderReferenceOptions(); });
    els.sessionThumbnails.addEventListener("click", (event) => {
      const button = event.target.closest("[data-image-output-id]");
      if (!button) return;
      state.selectedAsset = state.assets.find((asset) => asset.id === button.dataset.imageOutputId);
      renderSessionThumbnails();
      openImageViewer(state.selectedAsset);
    });
    els.imageViewerOpen?.addEventListener("click", () => {
      const url = state.viewerAsset?.preview_url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
    els.imageViewerPrev?.addEventListener("click", () => moveImageViewer(-1));
    els.imageViewerNext?.addEventListener("click", () => moveImageViewer(1));
    els.imageViewerClose?.addEventListener("click", closeImageViewer);
    els.imageViewerImage?.closest(".image-generation-viewer-stage")?.addEventListener("wheel", (event) => {
      event.preventDefault();
      const stage = getImageViewerStage();
      const centerX = stage ? stage.scrollLeft + stage.clientWidth / 2 : 0;
      const centerY = stage ? stage.scrollTop + stage.clientHeight / 2 : 0;
      const ratioX = stage ? centerX / Math.max(1, stage.scrollWidth) : 0.5;
      const ratioY = stage ? centerY / Math.max(1, stage.scrollHeight) : 0.5;
      const delta = event.deltaY < 0 ? 0.15 : -0.15;
      setImageViewerZoom(state.viewerZoom + delta);
      requestAnimationFrame(() => {
        const nextStage = getImageViewerStage();
        if (!nextStage) return;
        nextStage.scrollLeft = ratioX * nextStage.scrollWidth - nextStage.clientWidth / 2;
        nextStage.scrollTop = ratioY * nextStage.scrollHeight - nextStage.clientHeight / 2;
      });
    }, { passive: false });
    els.imageViewerModal?.addEventListener("click", (event) => {
      if (event.target === els.imageViewerModal) closeImageViewer();
    });
    document.addEventListener("keydown", (event) => {
      if (!els.imageViewerModal || els.imageViewerModal.hidden) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveImageViewer(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveImageViewer(1);
      }
    });
    window.addEventListener("resize", () => {
      if (!els.imageViewerModal || els.imageViewerModal.hidden) return;
      fitImageViewerToFrame();
    });
    els.conversation.addEventListener("click", async (event) => {
      const stopGeneration = event.target.closest("[data-image-stop-generation]");
      const copyMessage = event.target.closest("[data-image-copy-message]");
      const deleteMessage = event.target.closest("[data-image-delete-message]");
      const newSession = event.target.closest("[data-image-new-session-from-message]");
      const copyOutput = event.target.closest("[data-image-copy-output]");
      const downloadOutput = event.target.closest("[data-image-download-output]");
      const includeOutputButton = event.target.closest("[data-image-include-output]");
      if (stopGeneration || copyMessage || deleteMessage || newSession || copyOutput || downloadOutput || includeOutputButton) {
        event.preventDefault();
        event.stopPropagation();
        try {
          if (stopGeneration) {
            await cancelGeneration();
          } else if (copyMessage) {
            const message = state.messages.find((item) => item.id === copyMessage.dataset.imageCopyMessage);
            await copyText(message?.content || "");
          } else if (deleteMessage) {
            const message = state.messages.find((item) => item.id === deleteMessage.dataset.imageDeleteMessage);
            if (!message || !state.session) return;
            if (!window.confirm("Remove this chat, its result, and any error details? This cannot be undone.")) return;
            if (message.status === "pending") state.activeGeneration &&= { ...state.activeGeneration, cancelled: true };
            await invoke("delete-image-generation-turn", { sessionId: state.session.id, messageId: message.id });
            els.error.textContent = "";
            await refreshSessions(state.session.id);
          } else if (newSession) {
            const message = state.messages.find((item) => item.id === newSession.dataset.imageNewSessionFromMessage);
            await createSession({ prompt: message?.content || "" });
          } else {
            const assetId = (copyOutput || downloadOutput || includeOutputButton).dataset.imageCopyOutput
              || (copyOutput || downloadOutput || includeOutputButton).dataset.imageDownloadOutput
              || (copyOutput || downloadOutput || includeOutputButton).dataset.imageIncludeOutput;
            const asset = state.assets.find((item) => item.id === assetId);
            if (copyOutput) await copyImage(asset);
            if (downloadOutput) await downloadAsset(asset);
            if (includeOutputButton) includeOutput(asset);
          }
        } catch (error) {
          els.error.textContent = error instanceof Error ? error.message : "Could not complete that action.";
        }
        return;
      }
      const button = event.target.closest("[data-image-open-output-id], [data-image-open-asset-id]");
      if (!button) return;
      const assetId = button.dataset.imageOpenOutputId || button.dataset.imageOpenAssetId;
      const asset = state.assets.find((item) => item.id === assetId);
      openImageViewer(asset);
    });
    els.downloadSelected.addEventListener("click", downloadSelected);
    els.downloadAll.addEventListener("click", () => downloadZip([]));
  }

  async function init() {
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      window.scrollTo(0, 0);
      bind();
      state.modelCatalog = mergeImageModelCatalog();
      renderModelControls();
      setStatus("Loading sessions…");
      state.user = await getCurrentImageGenerationUser();
      if (!state.user) {
        setStatus("Sign in required", true);
        els.error.textContent = "Sign in to use Image Generation.";
        return;
      }
      clearComposerError();
      await loadSessions(); autoResize();
    } catch (error) { setStatus("Could not load image generation.", true); els.error.textContent = error instanceof Error ? error.message : "Could not load image generation."; }
  }
  init();
})();
