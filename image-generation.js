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
  };

  const state = { user: null, sessions: [], session: null, messages: [], assets: [], selectedAsset: null, viewerAsset: null, selectedReferences: new Set(), busy: false, activeGeneration: null, modelCatalog: [] };
  const ACTIVE_GENERATION_WINDOW_MS = 20 * 60 * 1000;
  const DEFAULT_MODEL_SETTINGS = { provider: "openai", model: "gpt-image-2", n: 1, size: "auto", quality: "auto", format: "png", compression: 90, background: "auto", moderation: "low" };
  const text = (value) => String(value ?? "");
  const html = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const getParams = () => Object.fromEntries([...document.querySelectorAll("[data-image-param]")].map((input) => [input.dataset.imageParam, input.value]));

  function getCurrentModel() {
    return state.modelCatalog.find((model) => model.id === els.modelSelect?.value) || state.modelCatalog[0] || null;
  }

  function isGptImage2Model(model) {
    return model?.id === "gpt-image-2" || model?.provider === "openai";
  }

  function applySettings(settings = {}) {
    const values = { ...DEFAULT_MODEL_SETTINGS, ...(settings || {}) };
    for (const [name, value] of Object.entries(values)) {
      const control = document.querySelector(`[data-image-param="${name}"]`);
      if (control && value !== undefined && value !== null) control.value = String(value);
    }
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
  }

  function applyModelDefaults(model) {
    const openAiModel = isGptImage2Model(model);
    const defaults = {
      n: "1", size: "auto", width: "", height: "", quality: openAiModel ? "auto" : "",
      format: model.defaultFormat || "png", compression: "90", background: "auto", moderation: "low",
    };
    for (const [name, value] of Object.entries(defaults)) {
      const control = document.querySelector(`[data-image-param="${name}"]`);
      if (control) control.value = value;
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
    const count = document.querySelector('[data-image-param="n"]');
    if (count) {
      const maxOutputs = Number(model.maxOutputs || 4);
      count.max = String(maxOutputs);
      count.value = String(Math.max(1, Math.min(maxOutputs, Number(count.value || 1))));
    }
    const format = document.querySelector('[data-image-param="format"]');
    if (format) {
      const selected = model.formats.includes(format.value) ? format.value : model.defaultFormat;
      format.innerHTML = model.formats.map((value) => `<option value="${value}">${value.toUpperCase()}</option>`).join("");
      format.value = selected;
    }
    const showSize = sizeProfile !== "none";
    if (els.sizeField) els.sizeField.hidden = !showSize;
    const size = document.querySelector('[data-image-param="size"]');
    const customOption = size?.querySelector('option[value="custom"]');
    if (customOption) customOption.hidden = sizeProfile !== "openai";
    if (!showSize) {
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
    renderReferenceOptions();
  }

  async function saveActiveSettings() {
    if (!state.session || !state.user) return;
    const activeSettings = { provider: getCurrentModel()?.provider || "venice", ...getParams() };
    const { data, error } = await supabase.from("image_generation_sessions")
      .update({ active_settings: activeSettings, updated_at: new Date().toISOString() })
      .eq("id", state.session.id).eq("user_id", state.user.id).select("*").single();
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

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle("is-error", isError);
  }

  function setBusy(busy) {
    state.busy = busy;
    els.send.disabled = busy || !state.session;
    els.send.querySelector("span").textContent = busy ? "Generating…" : "Send";
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
  function getMessageModelLabel(message) {
    let settings = message?.settings_snapshot;
    if (typeof settings === "string") {
      try { settings = JSON.parse(settings); } catch { settings = null; }
    }
    if (settings?.modelLabel) return String(settings.modelLabel);
    const modelId = String(settings?.model || "").trim();
    return state.modelCatalog.find((model) => model.id === modelId)?.label || modelId;
  }
  function renderConversation() {
    els.empty.hidden = state.messages.length > 0;
    const messagesHtml = state.messages.map((message, index) => {
      const precedingMessage = state.messages[index - 1];
      const outputAssets = message.role === "assistant"
        ? [...findAssets(message.id), ...(precedingMessage?.role === "user" ? findAssets(precedingMessage.id) : [])]
        : [];
      const generatedImageModel = message.role === "assistant" && precedingMessage?.status === "completed"
        ? getMessageModelLabel(precedingMessage)
        : "";
      const previews = outputAssets.length ? `<div class="image-generation-message-assets">${outputAssets.map((asset) => `<div class="image-generation-message-asset">
        <button class="image-generation-chat-image" type="button" data-image-open-output-id="${asset.id}" title="Open generated image"><img src="${asset.preview_url}" alt="${html(asset.original_filename || "Generated output")}"></button>
        <div class="image-generation-message-actions" aria-label="Generated image actions">
          <button class="image-generation-chat-action" type="button" data-image-copy-output="${asset.id}" title="Copy image" aria-label="Copy image"><ph-copy aria-hidden="true"></ph-copy></button>
          <button class="image-generation-chat-action" type="button" data-image-download-output="${asset.id}" title="Download image" aria-label="Download image"><ph-download-simple aria-hidden="true"></ph-download-simple></button>
          <button class="image-generation-chat-action" type="button" data-image-include-output="${asset.id}" title="Include in next prompt" aria-label="Include in next prompt"><ph-paperclip aria-hidden="true"></ph-paperclip></button>
          ${generatedImageModel ? `<span class="image-generation-output-model" title="Model used for this generation">${html(generatedImageModel)}</span>` : ""}
        </div>
      </div>`).join("")}</div>` : "";
      const references = message.role === "user" ? findMessageReferences(message) : [];
      const referencePreviews = references.length ? `<div class="image-generation-message-references" aria-label="Reference images used">
        ${references.map((asset) => `<img src="${asset.preview_url}" alt="Reference: ${html(asset.original_filename || "uploaded image")}" title="${html(asset.original_filename || "Reference image")}">`).join("")}
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
      const modelLabel = message.status === "completed" ? getMessageModelLabel(message) : "";
      const promptActions = message.role === "user" && message.status === "completed" ? `<div class="image-generation-message-actions is-user" aria-label="Prompt actions">
        <button class="image-generation-chat-action" type="button" data-image-copy-message="${message.id}" title="Copy prompt" aria-label="Copy prompt"><ph-copy aria-hidden="true"></ph-copy></button>
        <button class="image-generation-chat-action" type="button" data-image-delete-message="${message.id}" title="Remove this chat" aria-label="Remove this chat"><ph-trash aria-hidden="true"></ph-trash></button>
        <button class="image-generation-chat-action" type="button" data-image-new-session-from-message="${message.id}" title="Start a new session with this prompt" aria-label="Start a new session with this prompt"><ph-sign-out aria-hidden="true"></ph-sign-out></button>
        ${modelLabel ? `<span class="image-generation-message-model" title="Model used for this generation">${html(modelLabel)}</span>` : ""}
      </div>` : "";
      return `<article class="image-generation-message is-${message.role} ${message.status === "failed" ? "is-failed" : ""}">
        <div>${html(message.content)}</div>${referencePreviews}${previews}${stateLabel ? `<p class="image-generation-message-meta">${html(stateLabel)}</p>` : ""}${errorDetails}
      </article>${promptActions}${generatingPlaceholder}`;
    }).join("");
    els.conversation.querySelectorAll(".image-generation-message, .image-generation-message-actions").forEach((node) => node.remove());
    els.conversation.insertAdjacentHTML("beforeend", messagesHtml);
    requestAnimationFrame(() => { els.conversation.scrollTop = els.conversation.scrollHeight; });
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
    const outputs = state.assets.filter((asset) => asset.asset_kind === "output");
    if (!outputs.length) {
      els.sessionThumbnails.innerHTML = '<p class="image-generation-thumbnail-empty">Generated images will appear here.</p>';
      els.downloadSelected.disabled = true; els.downloadAll.disabled = true; return;
    }
    if (!state.selectedAsset || !outputs.some((asset) => asset.id === state.selectedAsset.id)) state.selectedAsset = outputs[outputs.length - 1];
    els.sessionThumbnails.innerHTML = outputs.map((asset) => `<button type="button" class="image-generation-thumbnail ${asset.id === state.selectedAsset.id ? "is-active" : ""}" data-image-output-id="${asset.id}" title="Select ${html(asset.original_filename)}"><img src="${asset.preview_url}" alt="${html(asset.original_filename)}"></button>`).join("");
    els.downloadSelected.disabled = false; els.downloadAll.disabled = false;
  }

  function openImageViewer(asset) {
    if (!asset?.preview_url || !els.imageViewerModal) return;
    state.viewerAsset = asset;
    els.imageViewerTitle.textContent = asset.original_filename || "Generated image";
    els.imageViewerImage.src = asset.preview_url;
    els.imageViewerImage.alt = asset.original_filename || "Generated image";
    openModal(els.imageViewerModal);
  }

  function closeImageViewer() {
    if (els.imageViewerModal && !els.imageViewerModal.hidden) closeModal();
  }

  function renderAll() {
    els.sessionTitle.textContent = state.session?.title || "New Generation";
    renderSessions(); renderConversation(); renderReferenceOptions(); renderSessionThumbnails();
  }

  async function loadSessions({ createIfNone = true } = {}) {
    const { data, error } = await supabase.from("image_generation_sessions").select("*").eq("user_id", state.user.id).order("updated_at", { ascending: false });
    if (error) throw error;
    state.sessions = data || [];
    if (!state.sessions.length && createIfNone) return createSession();
    if (state.sessions.length) await openSession(state.sessions[0].id);
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
      state.modelCatalog = payload.modelCatalog || state.modelCatalog;
      state.session = payload.session; state.messages = payload.messages || []; state.assets = payload.assets || []; state.selectedReferences.clear();
      applySettings(payload.session?.active_settings || DEFAULT_MODEL_SETTINGS);
      renderModelControls();
      state.selectedAsset = state.assets.filter((asset) => asset.asset_kind === "output").at(-1) || null;
      const hasActiveGeneration = restoreGenerationState();
      if (!hasActiveGeneration) setStatus("Ready");
      renderAll();
      window.setTimeout(() => {
        if (state.session?.id === sessionId) {
          els.conversation.scrollTop = els.conversation.scrollHeight;
        }
      }, 120);
    } catch (error) {
      setStatus("Could not load session", true);
      throw error;
    }
  }

  async function refreshSessions(sessionId = state.session?.id) {
    const { data, error } = await supabase.from("image_generation_sessions").select("*").eq("user_id", state.user.id).order("updated_at", { ascending: false });
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
      const payload = await invoke("generate-session-images", {
      sessionId: generation.sessionId, prompt, settings: { provider: getCurrentModel()?.provider || "venice", ...getParams() }, referenceAssetIds, useLastGenerated,
      });
      if (generation.cancelled) {
        await openSession(generation.sessionId);
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
        await openSession(generation.sessionId);
        return;
      }
      optimistic.status = "failed";
      optimistic.error_message = error instanceof Error ? error.message : "Could not generate images.";
      optimistic.error_details = error?.details || null;
      renderConversation(); els.error.textContent = optimistic.error_message; setStatus("Generation failed", true);
    } finally {
      if (state.activeGeneration === generation) state.activeGeneration = null;
      setBusy(false);
    }
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

  function bind() {
    els.newSessionButtons.forEach((button) => button.addEventListener("click", async () => { try { await createSession(); } catch (error) { els.error.textContent = error.message; } }));
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
          const { error } = await supabase.from("image_generation_sessions").update({ title: title.trim(), updated_at: new Date().toISOString() }).eq("id", rename.dataset.imageRenameSession).eq("user_id", state.user.id);
          if (error) throw error;
          await refreshSessions(rename.dataset.imageRenameSession);
        } else if (remove) {
          const session = state.sessions.find((item) => item.id === remove.dataset.imageDeleteSession);
          if (!window.confirm(`Delete “${session?.title || "this session"}” and all of its stored images?`)) return;
          await invoke("delete-image-generation-session", { sessionId: remove.dataset.imageDeleteSession });
          state.sessions = state.sessions.filter((item) => item.id !== remove.dataset.imageDeleteSession);
          if (state.session?.id === remove.dataset.imageDeleteSession) { state.session = null; state.messages = []; state.assets = []; await loadSessions(); }
          else renderSessions();
        } else if (button) {
          await openSession(button.dataset.imageSessionId);
        }
      } catch (error) { els.error.textContent = error instanceof Error ? error.message : "Could not update this session."; }
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".image-generation-session-menu")) {
        els.sessionList.querySelectorAll("[data-image-session-menu]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") els.sessionList.querySelectorAll("[data-image-session-menu]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
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
    els.imageViewerClose?.addEventListener("click", closeImageViewer);
    els.imageViewerModal?.addEventListener("click", (event) => {
      if (event.target === els.imageViewerModal) closeImageViewer();
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
      const button = event.target.closest("[data-image-open-output-id]");
      if (!button) return;
      const asset = state.assets.find((item) => item.id === button.dataset.imageOpenOutputId);
      if (asset?.preview_url) window.open(asset.preview_url, "_blank", "noopener,noreferrer");
    });
    els.downloadSelected.addEventListener("click", downloadSelected);
    els.downloadAll.addEventListener("click", () => downloadZip([]));
  }

  async function init() {
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      window.scrollTo(0, 0);
      bind();
      setStatus("Loading sessions…");
      state.user = await window.centralisGetCurrentAppUser();
      if (!state.user) {
        setStatus("Sign in required", true);
        els.error.textContent = "Sign in to use Image Generation.";
        return;
      }
      await loadSessions(); autoResize();
    } catch (error) { setStatus("Could not load image generation.", true); els.error.textContent = error instanceof Error ? error.message : "Could not load image generation."; }
  }
  init();
})();
