(function () {
  const MODEL_STORAGE_KEY = "centralis:local-chat:selected-model";
  const DEFAULT_FEATHERLESS_MODEL = "anthracite-org/magnum-v4-9b";
  const PREFERRED_FEATHERLESS_MODELS = [
    DEFAULT_FEATHERLESS_MODEL,
    "huihui-ai/Qwen2.5-Coder-32B-Instruct-abliterated"
  ];
  const RECENT_MESSAGE_LIMIT = 8;
  const MEMORY_RECALL_LIMIT = 8;
  const SUMMARY_TRIGGER_MESSAGE_COUNT = 20;
  const SUMMARY_MIN_NEW_MESSAGES = 6;
  const MEMORY_TYPES = new Set([
    "fact",
    "preference",
    "event",
    "promise",
    "goal",
    "secret",
    "relationship",
    "emotion",
    "opinion",
    "boundary",
    "location",
    "possession",
    "injury",
    "identity",
    "plot_thread",
    "character_development",
    "major_event",
    "other"
  ]);
  const ALWAYS_RECALLED_MEMORY_TYPES = new Set([
    "promise",
    "boundary",
    "injury",
    "secret",
    "goal",
    "plot_thread",
    "major_event",
    "character_development"
  ]);
  const MEMORY_STATUSES = new Set(["active", "resolved", "superseded", "uncertain", "forgotten"]);
  const REPLY_LENGTH_OPTIONS = [
    {
      key: "brief",
      label: "Brief",
      instruction: "Keep the response very brief: 1 short paragraph, usually 1 to 3 sentences."
    },
    {
      key: "short",
      label: "Short",
      instruction: "Keep the response short: 1 to 2 compact paragraphs."
    },
    {
      key: "standard",
      label: "Standard",
      instruction: "Keep the response moderate: usually 1 to 3 short paragraphs."
    },
    {
      key: "detailed",
      label: "Detailed",
      instruction: "Use a fuller response: 3 to 5 paragraphs with more sensory detail, character nuance, and world detail. Do not use the extra length to advance, narrate, or decide anything for the user/persona."
    },
    {
      key: "extended",
      label: "Extended",
      instruction: "Use an extended response: 5 or more paragraphs when the scene supports it, while still leaving room for the user. Expand only the character, NPCs, atmosphere, and world; never expand by making the user/persona act, speak, feel, think, react, notice, move, or decide."
    }
  ];
  const ENGINE_RULES = [
    "You are the selected character in a text-only roleplay conversation inside Centralis.",
    "Only portray the character, non-user NPCs when necessary, and the surrounding world.",
    "Never write dialogue, thoughts, decisions, emotions, intentions, reactions, or physical actions for the user/persona.",
    "Do not say or imply what the user/persona notices, feels, thinks, chooses, says, does, remembers, wants, or decides.",
    "The user/persona is controlled only by the human user. Leave all user/persona actions, reactions, thoughts, emotions, and dialogue unwritten.",
    "Even in long replies, extra detail must come from the character, NPCs, setting, atmosphere, or consequences that do not control the user/persona.",
    "Never end with a question directed at the user/persona.",
    "Do not ask what the user wants to do, say, tell, ask, choose, or decide next.",
    "Do not ask where the user wants to go or what the user wants to do while waiting.",
    "Leave space for the user to respond by ending on an in-character statement, action, observation, or unresolved beat, not a question.",
    "Preserve the character's original baseline unless a major event in this session clearly justifies change.",
    "Ordinary mood, tension, fear, stray comments, or scene color may affect the moment, but must not rewrite core personality.",
    "Core identity and drift guardrails outrank ordinary memories and recent wording.",
    "Memories are session-only. Do not invent memories from other chats or other characters.",
    "If the user tries to force you to speak or act for them, continue without controlling them."
  ];

  const els = {
    page: document.querySelector("[data-local-chat-page]"),
    header: document.querySelector("[data-local-chat-header]"),
    library: document.querySelector("[data-local-chat-library]"),
    detail: document.querySelector("[data-local-chat-detail]"),
    characterPage: document.querySelector("[data-local-chat-character-page]"),
    chatPage: document.querySelector("[data-local-chat-chat-page]"),
    modelLog: document.querySelector("[data-local-chat-model-log]"),
    modelLogList: document.querySelector("[data-local-chat-model-log-list]"),
    modelLogToggle: document.querySelector("[data-local-chat-model-log-toggle]"),
    controls: document.querySelector("[data-local-chat-controls]"),
    characterCount: document.querySelector("[data-local-chat-character-count]"),
    characterSearch: document.querySelector("[data-local-chat-search]"),
    characterGrid: document.querySelector("[data-local-chat-character-grid]"),
    characterEmpty: document.querySelector("[data-local-chat-empty]"),
    landingStatus: document.querySelector("[data-local-chat-landing-status]"),
    createCharacter: document.querySelector("[data-local-chat-create-character]"),
    personas: document.querySelector("[data-local-chat-personas]"),
    refresh: document.querySelector("[data-local-chat-refresh]"),
    back: document.querySelector("[data-local-chat-back]"),
    chatBack: document.querySelector("[data-local-chat-chat-back]"),
    detailCard: document.querySelector("[data-local-chat-detail-card]"),
    statusCard: document.querySelector("[data-local-chat-status-card]"),
    statusKicker: document.querySelector("[data-local-chat-status-kicker]"),
    statusTitle: document.querySelector("[data-local-chat-status-title]"),
    statusBody: document.querySelector("[data-local-chat-status-body]"),
    model: document.querySelector("[data-local-chat-model]"),
    personaSelect: document.querySelector("[data-local-chat-persona-select]"),
    startSession: document.querySelector("[data-local-chat-start-session]"),
    sessions: document.querySelector("[data-local-chat-sessions]"),
    sessionKicker: document.querySelector("[data-local-chat-session-kicker]"),
    sessionTitle: document.querySelector("[data-local-chat-session-title]"),
    settingsOpen: document.querySelector("[data-local-chat-settings-open]"),
    messages: document.querySelector("[data-local-chat-messages]"),
    form: document.querySelector("[data-local-chat-form]"),
    input: document.querySelector("[data-local-chat-input]"),
    send: document.querySelector("[data-local-chat-send]"),
    formStatus: document.querySelector("[data-local-chat-form-status]"),
    characterEditor: document.querySelector("[data-local-chat-character-editor]"),
    characterModalTitle: document.querySelector("[data-local-chat-character-modal-title]"),
    characterSaveText: document.querySelectorAll("[data-local-chat-character-save-text]"),
    characterForm: document.querySelector("[data-local-chat-character-form]"),
    characterStatus: document.querySelector("[data-local-chat-character-status]"),
    archiveCharacter: document.querySelector("[data-local-chat-archive-character]"),
    characterImageInput: document.querySelector("[data-local-chat-character-image-input]"),
    characterImagePreview: document.querySelector("[data-local-chat-character-image-preview]"),
    characterImageName: document.querySelector("[data-local-chat-character-image-name]"),
    characterImageClear: document.querySelector("[data-local-chat-character-image-clear]"),
    closeCharacterButtons: document.querySelectorAll("[data-local-chat-close-character]"),
    personaModal: document.querySelector("[data-local-chat-persona-modal]"),
    personaForm: document.querySelector("[data-local-chat-persona-form]"),
    personaStatus: document.querySelector("[data-local-chat-persona-status]"),
    personaList: document.querySelector("[data-local-chat-persona-list]"),
    newPersona: document.querySelector("[data-local-chat-new-persona]"),
    archivePersona: document.querySelector("[data-local-chat-archive-persona]"),
    closePersonaButtons: document.querySelectorAll("[data-local-chat-close-personas]"),
    settingsModal: document.querySelector("[data-local-chat-settings-modal]"),
    settingsForm: document.querySelector("[data-local-chat-settings-form]"),
    settingsStatus: document.querySelector("[data-local-chat-settings-status]"),
    replyLength: document.querySelector("[data-local-chat-reply-length]"),
    replyLengthLabel: document.querySelector("[data-local-chat-reply-length-label]"),
    closeSettingsButtons: document.querySelectorAll("[data-local-chat-settings-close]")
  };

  const state = {
    supabase: window.centralisSupabase || null,
    user: null,
    statusOk: false,
    models: [],
    selectedModel: localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_FEATHERLESS_MODEL,
    characters: [],
    characterImagesById: new Map(),
    personas: [],
    sessions: [],
    messages: [],
    memories: [],
    lastRecalledMemoryIds: [],
    selectedCharacterId: null,
    selectedSessionId: null,
    selectedPersonaId: null,
    editorMode: "",
    editingCharacterId: null,
    pendingCharacterImageFile: null,
    pendingCharacterImagePreviewUrl: "",
    editingPersonaId: null,
    characterQuery: "",
    busy: false,
    abortController: null,
    generationStartedAt: 0,
    generationElapsedSeconds: 0,
    generationTimer: null,
    modelLog: [],
    modelLogCollapsed: false,
    nextModelLogId: 1,
    repairEnabled: false
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeModelEchoText(value) {
    return normalizeText(value)
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function cleanCharacterReplyArtifacts(rawText, userText, characterName) {
    const original = normalizeText(rawText);
    if (!original) return "";

    const hadTemplateArtifact = /<\|(?:im_start|im_end|endoftext)\|>|<\/s>/i.test(original);
    const userEcho = normalizeModelEchoText(userText);
    const characterEcho = normalizeModelEchoText(characterName);
    let cleaned = original
      .replace(/<\|(?:im_start|im_end|endoftext)\|>/gi, "\n")
      .replace(/<\/s>/gi, "\n");

    const lines = cleaned
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;
        const comparable = normalizeModelEchoText(line);
        if (userEcho && comparable === userEcho) return false;
        if (characterEcho && comparable === characterEcho) return false;
        return true;
      });

    cleaned = normalizeText(lines.join("\n"));
    const onlyEcho = !cleaned && userEcho && normalizeModelEchoText(original).startsWith(userEcho);
    if (hadTemplateArtifact || onlyEcho) {
      return cleaned;
    }
    return original;
  }

  function textSimilarityFingerprint(value) {
    return normalizeModelEchoText(value)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .slice(0, 80);
  }

  function isLikelyRepeatedReply(previousText, nextText) {
    const previousTokens = textSimilarityFingerprint(previousText);
    const nextTokens = textSimilarityFingerprint(nextText);
    if (previousTokens.length < 8 || nextTokens.length < 8) return false;

    const previousSet = new Set(previousTokens);
    const nextSet = new Set(nextTokens);
    const shared = [...nextSet].filter((token) => previousSet.has(token)).length;
    const overlap = shared / Math.min(previousSet.size, nextSet.size);
    const previousStart = previousTokens.slice(0, 12).join(" ");
    const nextStart = nextTokens.slice(0, 12).join(" ");
    return overlap >= 0.82 || Boolean(previousStart && previousStart === nextStart);
  }

  function splitTags(value) {
    return String(value || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  function formatDate(value) {
    if (!value) return "No activity yet";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function formatSize(bytes) {
    const size = Number(bytes || 0);
    if (!size) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = size;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function formatElapsedSeconds(totalSeconds) {
    const seconds = Math.max(0, Number(totalSeconds || 0));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function assistantElapsedSeconds(message) {
    const metadata = message?.generation_metadata || {};
    if (Number.isFinite(Number(metadata.elapsed_seconds))) {
      return Math.max(0, Math.round(Number(metadata.elapsed_seconds)));
    }
    if (Number.isFinite(Number(metadata.total_duration))) {
      return Math.max(0, Math.round(Number(metadata.total_duration) / 1000000000));
    }
    if (Number.isFinite(Number(metadata.eval_duration)) || Number.isFinite(Number(metadata.prompt_eval_duration))) {
      const total = Number(metadata.eval_duration || 0) + Number(metadata.prompt_eval_duration || 0);
      return Math.max(0, Math.round(total / 1000000000));
    }
    return null;
  }

  function renderMessageActions(message) {
    if (!["assistant", "user"].includes(message.role) || message.streaming) return "";
    const isAssistant = message.role === "assistant";
    const seconds = assistantElapsedSeconds(message);
    const timing = seconds === null
      ? "Time unavailable"
      : `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
    return `
      <footer class="local-chat-message-actions" aria-label="${isAssistant ? "Reply actions" : "Message actions"}">
        ${isAssistant ? `<span>${escapeHtml(timing)}</span>` : ""}
        <button type="button" aria-label="${isAssistant ? "Copy reply" : "Copy message"}" title="${isAssistant ? "Copy reply" : "Copy message"}" data-local-chat-copy-reply="${escapeHtml(message.id || "")}">
          <ph-copy weight="bold" aria-hidden="true"></ph-copy>
        </button>
        <button type="button" aria-label="${isAssistant ? "Delete reply" : "Delete message"}" title="${isAssistant ? "Delete reply" : "Delete message"}" data-local-chat-delete-reply="${escapeHtml(message.id || "")}">
          <ph-trash weight="bold" aria-hidden="true"></ph-trash>
        </button>
        ${isAssistant ? `<button type="button" data-local-chat-continue-reply="${escapeHtml(message.id || "")}">
          <ph-arrow-bend-down-right weight="bold" aria-hidden="true"></ph-arrow-bend-down-right>
          Continue
        </button>` : ""}
      </footer>
    `;
  }

  function startGenerationTimer() {
    stopGenerationTimer();
    state.generationStartedAt = Date.now();
    state.generationElapsedSeconds = 0;
    state.generationTimer = setInterval(() => {
      state.generationElapsedSeconds = Math.floor((Date.now() - state.generationStartedAt) / 1000);
      renderMessages();
    }, 1000);
  }

  function stopGenerationTimer() {
    if (state.generationTimer) {
      clearInterval(state.generationTimer);
      state.generationTimer = null;
    }
  }

  function selectedCharacter() {
    return state.characters.find((character) => character.id === state.selectedCharacterId) || null;
  }

  function selectedSession() {
    return state.sessions.find((session) => session.id === state.selectedSessionId) || null;
  }

  function primaryCharacterImage(characterId) {
    const images = state.characterImagesById.get(characterId) || [];
    return images.find((image) => image.is_primary) || images[0] || null;
  }

  function characterAvatarHtml(character) {
    const image = primaryCharacterImage(character?.id);
    if (image?.image_url) {
      return `<img src="${escapeHtml(image.image_url)}" alt="">`;
    }
    return escapeHtml((character?.name || "?").slice(0, 1).toUpperCase());
  }

  function characterImageHtml(character) {
    const image = primaryCharacterImage(character?.id);
    if (image?.image_url) {
      return `<img src="${escapeHtml(image.image_url)}" alt="">`;
    }
    return `<span>${escapeHtml((character?.name || "?").slice(0, 1).toUpperCase())}</span>`;
  }

  function setStatus(kind, title, body) {
    if (!els.statusCard) return;
    els.statusCard.classList.toggle("is-ready", kind === "ready");
    els.statusCard.classList.toggle("is-error", kind === "error");
    els.statusCard.classList.toggle("is-loading", kind === "loading");
    if (els.statusKicker) els.statusKicker.textContent = kind === "ready" ? "Ready" : kind === "error" ? "Needs setup" : "Checking";
    if (els.statusTitle) els.statusTitle.textContent = title;
    if (els.statusBody) els.statusBody.textContent = body;
  }

  function setLandingStatus(message = "", isError = false) {
    if (!els.landingStatus) return;
    els.landingStatus.textContent = message;
    els.landingStatus.classList.toggle("is-error", isError);
  }

  function setFormStatus(message = "", isError = false) {
    if (!els.formStatus) return;
    els.formStatus.textContent = isError ? message : "";
    els.formStatus.hidden = !isError || !message;
    els.formStatus.classList.toggle("is-error", isError);
  }

  function setDialogStatus(element, message = "", isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", isError);
    element.classList.toggle("is-success", Boolean(message) && !isError);
  }

  function focusComposer({ preventScroll = true } = {}) {
    if (!els.input || els.input.disabled || els.chatPage?.hidden) return;
    els.input.focus({ preventScroll });
  }

  async function waitForAdmin() {
    if (window.centralisCurrentAppUser) return window.centralisCurrentAppUser;
    if (window.centralisGetCurrentAppUser) return window.centralisGetCurrentAppUser();
    return null;
  }

  function requireSupabase() {
    if (!state.supabase) {
      state.supabase = window.centralisSupabase || null;
    }
    if (!state.supabase) {
      throw new Error("Supabase is not available. Refresh the page and sign in again.");
    }
    if (!state.user?.id) {
      throw new Error("Your Centralis user profile is not loaded.");
    }
    return state.supabase;
  }

  function updateChatUrl() {
    const url = new URL(window.location.href);
    if (state.selectedCharacterId) {
      url.searchParams.set("character", state.selectedCharacterId);
    } else {
      url.searchParams.delete("character");
    }
    if (state.selectedSessionId) {
      url.searchParams.set("session", state.selectedSessionId);
    } else {
      url.searchParams.delete("session");
    }
    if (state.editorMode) {
      url.searchParams.set("editor", state.editorMode);
    } else {
      url.searchParams.delete("editor");
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function readChatUrlState() {
    const params = new URLSearchParams(window.location.search);
    return {
      characterId: params.get("character") || "",
      sessionId: params.get("session") || "",
      editorMode: params.get("editor") || ""
    };
  }

  function showLibrary() {
    state.editorMode = "";
    els.page?.classList.remove("is-local-chat-detail-view", "is-local-chat-editor-view");
    if (els.header) els.header.hidden = false;
    if (els.library) els.library.hidden = false;
    if (els.detail) els.detail.hidden = true;
    if (els.characterEditor) els.characterEditor.hidden = true;
    if (els.controls) els.controls.hidden = false;
    state.selectedCharacterId = null;
    state.selectedSessionId = null;
    state.messages = [];
    updateChatUrl();
    renderCharacterLanding();
  }

  function showDetail() {
    els.page?.classList.add("is-local-chat-detail-view");
    els.page?.classList.remove("is-local-chat-editor-view");
    if (els.header) els.header.hidden = true;
    if (els.library) els.library.hidden = true;
    if (els.detail) els.detail.hidden = false;
    if (els.characterEditor) els.characterEditor.hidden = true;
    if (els.controls) els.controls.hidden = true;
    if (!state.busy) {
      refreshReadiness();
    }
  }

  function showCharacterPage() {
    state.editorMode = "";
    showDetail();
    if (els.characterPage) els.characterPage.hidden = false;
    if (els.chatPage) els.chatPage.hidden = true;
  }

  function showChatPage() {
    state.editorMode = "";
    showDetail();
    if (els.characterPage) els.characterPage.hidden = true;
    if (els.chatPage) els.chatPage.hidden = false;
  }

  function showCharacterEditor() {
    state.editorMode = state.editingCharacterId ? "edit" : "create";
    els.page?.classList.add("is-local-chat-editor-view");
    els.page?.classList.remove("is-local-chat-detail-view");
    if (els.header) els.header.hidden = true;
    if (els.library) els.library.hidden = true;
    if (els.detail) els.detail.hidden = true;
    if (els.characterEditor) els.characterEditor.hidden = false;
    if (els.controls) els.controls.hidden = true;
    updateChatUrl();
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("centralis-modal-open");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    if (!document.querySelector(".local-chat-modal-backdrop:not([hidden])")) {
      document.body.classList.remove("centralis-modal-open");
    }
  }

  function getFilteredCharacters() {
    const query = state.characterQuery.trim().toLowerCase();
    const activeCharacters = state.characters.filter((character) => !character.is_archived);
    if (!query) return activeCharacters;
    return activeCharacters.filter((character) => [
      character.name,
      character.short_description,
      character.description,
      character.core_identity,
      ...(character.tags || [])
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }

  function renderCharacterLanding() {
    const activeTotal = state.characters.filter((character) => !character.is_archived).length;
    const characters = getFilteredCharacters();
    if (els.characterCount) {
      els.characterCount.textContent = `${activeTotal} ${activeTotal === 1 ? "Character" : "Characters"}`;
    }
    if (els.characterEmpty) {
      els.characterEmpty.hidden = characters.length > 0;
    }
    if (!els.characterGrid) return;
    els.characterGrid.innerHTML = characters.map((character) => {
      const summary = [
        character.short_description || character.description || "No description yet.",
        character.core_identity
      ].map(normalizeText).filter(Boolean).join(" - ");
      return `
        <article class="local-chat-character-card" data-character-id="${escapeHtml(character.id)}" tabindex="0">
          <div class="local-chat-character-avatar" aria-hidden="true">${characterAvatarHtml(character)}</div>
          <div class="local-chat-character-body">
            <h2>${escapeHtml(character.name)}</h2>
            <p>${escapeHtml(summary)}</p>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderDetailCard() {
    const character = selectedCharacter();
    if (!els.detailCard || !character) return;
    els.detailCard.innerHTML = `
      <div class="local-chat-character-page-image" aria-hidden="true">${characterImageHtml(character)}</div>
      <div class="local-chat-character-page-copy">
        <h2>${escapeHtml(character.name)}</h2>
        <span>${escapeHtml(character.short_description || character.description || "No description yet.")}</span>
        <div class="local-chat-character-page-details">
          ${character.description ? `<section><strong>Description</strong><p>${escapeHtml(character.description)}</p></section>` : ""}
          ${character.personality ? `<section><strong>Personality</strong><p>${escapeHtml(character.personality)}</p></section>` : ""}
          ${character.appearance ? `<section><strong>Appearance</strong><p>${escapeHtml(character.appearance)}</p></section>` : ""}
          ${character.background ? `<section><strong>Background</strong><p>${escapeHtml(character.background)}</p></section>` : ""}
          ${character.scenario ? `<section><strong>Scenario</strong><p>${escapeHtml(character.scenario)}</p></section>` : ""}
        </div>
      </div>
      <button class="primary-action local-chat-detail-edit-button" type="button" data-local-chat-edit-character>
        <ph-pencil-simple weight="bold" aria-hidden="true"></ph-pencil-simple>
        <span>Edit Character</span>
      </button>
    `;
  }

  function renderPersonaSelect() {
    if (!els.personaSelect) return;
    const activePersonas = state.personas.filter((persona) => !persona.is_archived);
    if (state.selectedPersonaId === null) {
      state.selectedPersonaId = activePersonas.find((persona) => persona.is_default)?.id || "";
    } else if (state.selectedPersonaId && !activePersonas.some((persona) => persona.id === state.selectedPersonaId)) {
      state.selectedPersonaId = "";
    }
    els.personaSelect.innerHTML = [
      `<option value=""${state.selectedPersonaId === "" ? " selected" : ""}>No persona</option>`,
      ...activePersonas.map((persona) => `<option value="${escapeHtml(persona.id)}"${persona.id === state.selectedPersonaId ? " selected" : ""}>${escapeHtml(persona.name)}${persona.is_default ? " (Default)" : ""}</option>`)
    ].join("");
  }

  function renderModelOptions() {
    if (!els.model) return;
    if (!state.models.length) {
      els.model.innerHTML = '<option value="">No Featherless models found</option>';
      els.model.disabled = true;
      return;
    }

    const knownModelNames = new Set(state.models.map((model) => model.name));
    for (const preferredModel of PREFERRED_FEATHERLESS_MODELS.slice().reverse()) {
      if (!knownModelNames.has(preferredModel)) {
        state.models.unshift({ name: preferredModel });
        knownModelNames.add(preferredModel);
      }
    }

    const storedModelStillAvailable = state.models.some((model) => model.name === state.selectedModel);
    if (!storedModelStillAvailable) {
      if (PREFERRED_FEATHERLESS_MODELS.includes(state.selectedModel)) {
        state.models = [{ name: state.selectedModel }, ...state.models.filter((model) => model.name !== state.selectedModel)];
      } else {
        state.selectedModel = state.models[0].name;
        localStorage.setItem(MODEL_STORAGE_KEY, state.selectedModel);
      }
    }

    els.model.innerHTML = state.models.map((model) => {
      const detail = model.context_length
        ? `${Number(model.context_length).toLocaleString()} context`
        : formatSize(model.size);
      const label = detail ? `${model.name} (${detail})` : model.name;
      return `<option value="${escapeHtml(model.name)}"${model.name === state.selectedModel ? " selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
    els.model.disabled = false;
  }

  function renderSessions() {
    if (!els.sessions) return;
    if (!state.sessions.length) {
      els.sessions.innerHTML = '<p class="local-chat-muted">No chats yet.</p>';
      return;
    }
    els.sessions.innerHTML = state.sessions.map((session) => `
      <article class="local-chat-session-card${session.id === state.selectedSessionId ? " is-active" : ""}" data-session-id="${escapeHtml(session.id)}" tabindex="0">
        <div>
          <strong>${escapeHtml(sessionDisplayTitle(session))}</strong>
          <span>${escapeHtml(formatDate(session.last_message_at || session.updated_at || session.created_at))}</span>
          <em>${Number(session._messageCount || 0)} ${Number(session._messageCount || 0) === 1 ? "message" : "messages"}</em>
        </div>
        <button type="button" aria-label="Delete session" title="Delete session" data-local-chat-delete-session="${escapeHtml(session.id)}">
          <ph-trash weight="bold" aria-hidden="true"></ph-trash>
        </button>
      </article>
    `).join("");
  }

  function sessionDisplayTitle(session) {
    const characterName = selectedCharacter()?.name || session.character_snapshot?.name || "";
    const title = normalizeText(session.title || "");
    if (characterName && title.startsWith(`${characterName} - `)) return characterName;
    return title || characterName || "Untitled chat";
  }

  function renderMessages() {
    if (!els.messages) return;
    if (!state.selectedSessionId) {
      els.messages.innerHTML = `
        <div class="local-chat-empty">
          <ph-chats-circle weight="duotone" aria-hidden="true"></ph-chats-circle>
          <strong>Start a character chat</strong>
          <p>Select a model and start a session to begin.</p>
        </div>
      `;
      return;
    }
    if (!state.messages.length) {
      els.messages.innerHTML = `
        <div class="local-chat-empty">
          <ph-chats-circle weight="duotone" aria-hidden="true"></ph-chats-circle>
          <strong>No messages yet</strong>
          <p>Send the first message to continue the scene.</p>
        </div>
      `;
      return;
    }

    els.messages.innerHTML = state.messages.map((message) => {
      const role = message.role === "assistant" ? "assistant" : "user";
      const character = selectedCharacter();
      const label = role === "assistant" ? (character?.name || "Character") : "You";
      const placeholder = message.streaming ? `Thinking... ${formatElapsedSeconds(state.generationElapsedSeconds)}` : "";
      const text = escapeHtml(message.content || placeholder).replace(/\n/g, "<br>");
      const avatar = role === "assistant"
        ? `<div class="local-chat-message-avatar" aria-hidden="true">${characterImageHtml(character)}</div>`
        : "";
      return `
        <article class="local-chat-message is-${role}${message.streaming ? " is-streaming" : ""}">
          ${avatar}
          <div class="local-chat-message-content">
            <span>${escapeHtml(label)}</span>
            <div class="local-chat-message-body">${text}</div>
            ${renderMessageActions(message)}
          </div>
        </article>
      `;
    }).join("");
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function stringifyModelLogValue(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_error) {
      return String(value ?? "");
    }
  }

  function addModelLogEntry(entry) {
    const item = {
      id: state.nextModelLogId++,
      createdAt: new Date().toISOString(),
      label: entry.label || "Featherless request",
      status: entry.status || "pending",
      request: entry.request || null,
      response: entry.response || null,
      error: entry.error || ""
    };
    state.modelLog.push(item);
    state.modelLog = state.modelLog.slice(-80);
    renderModelLog();
    return item.id;
  }

  function updateModelLogEntry(id, updates) {
    state.modelLog = state.modelLog.map((entry) => entry.id === id ? { ...entry, ...updates } : entry);
    renderModelLog();
  }

  function clearModelLog() {
    state.modelLog = [];
    renderModelLog();
  }

  function renderModelLog() {
    if (els.modelLog) {
      els.modelLog.classList.toggle("is-collapsed", state.modelLogCollapsed);
    }
    if (els.modelLogToggle) {
      els.modelLogToggle.setAttribute("aria-label", state.modelLogCollapsed ? "Expand model log" : "Collapse model log");
      els.modelLogToggle.title = state.modelLogCollapsed ? "Expand model log" : "Collapse model log";
    }
    if (!els.modelLogList) return;
    if (!state.modelLog.length) {
      els.modelLogList.innerHTML = `
        <div class="local-chat-model-log-empty">
          <strong>No model calls yet</strong>
          <span>Send a message to see the exact prompts and responses Centralis exchanges with Featherless.</span>
        </div>
      `;
      return;
    }
    els.modelLogList.innerHTML = state.modelLog.slice().reverse().map((entry) => `
      <details class="local-chat-model-log-entry" open>
        <summary>
          <span>${escapeHtml(formatDate(entry.createdAt))}</span>
          <strong>${escapeHtml(entry.label)}</strong>
          <em>${escapeHtml(entry.status)}</em>
        </summary>
        ${entry.request ? `<section><span>Request</span><pre>${escapeHtml(stringifyModelLogValue(entry.request))}</pre></section>` : ""}
        ${entry.response ? `<section><span>Response</span><pre>${escapeHtml(stringifyModelLogValue(entry.response))}</pre></section>` : ""}
        ${entry.error ? `<section><span>Error</span><pre>${escapeHtml(entry.error)}</pre></section>` : ""}
      </details>
    `).join("");
  }

  function replyLengthOptionFromKey(key) {
    return REPLY_LENGTH_OPTIONS.find((option) => option.key === key) || REPLY_LENGTH_OPTIONS[2];
  }

  function selectedSessionSettings() {
    const settings = selectedSession()?.settings;
    return settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  }

  function selectedReplyLengthOption() {
    return replyLengthOptionFromKey(selectedSessionSettings().reply_length);
  }

  function renderReplyLengthControl() {
    if (!els.replyLength || !els.replyLengthLabel) return;
    const option = selectedReplyLengthOption();
    const index = Math.max(0, REPLY_LENGTH_OPTIONS.findIndex((item) => item.key === option.key));
    els.replyLength.value = String(index);
    els.replyLengthLabel.textContent = option.label;
  }

  function openChatSettings() {
    if (!selectedSession()) return;
    renderReplyLengthControl();
    setDialogStatus(els.settingsStatus, "");
    openModal(els.settingsModal);
  }

  async function saveChatSettings(event) {
    event.preventDefault();
    const session = selectedSession();
    if (!session) return;

    const index = Math.min(REPLY_LENGTH_OPTIONS.length - 1, Math.max(0, Number(els.replyLength?.value || 2)));
    const replyLength = REPLY_LENGTH_OPTIONS[index] || REPLY_LENGTH_OPTIONS[2];
    const settings = {
      ...selectedSessionSettings(),
      reply_length: replyLength.key
    };

    setDialogStatus(els.settingsStatus, "Saving settings...");
    try {
      const { data, error } = await requireSupabase()
        .from("local_chat_sessions")
        .update({ settings })
        .eq("id", session.id)
        .eq("user_id", state.user.id)
        .select()
        .single();
      if (error) throw error;
      if (data) {
        state.sessions = state.sessions.map((item) => item.id === data.id ? data : item);
      }
      closeModal(els.settingsModal);
      setFormStatus("Chat settings saved.");
      renderAll();
    } catch (error) {
      setDialogStatus(els.settingsStatus, error.message || "Could not save settings.", true);
    }
  }

  function renderChatHeader() {
    const session = selectedSession();
    if (els.sessionKicker) els.sessionKicker.textContent = session ? selectedCharacter()?.name || "Local Chat" : "No Session";
    if (els.sessionTitle) els.sessionTitle.textContent = session ? selectedCharacter()?.name || session.title || "Chat" : "Select or start a chat";
    if (els.settingsOpen) els.settingsOpen.disabled = !session || state.busy;
    renderReplyLengthControl();
  }

  function canSend() {
    return Boolean(state.selectedSessionId && state.statusOk && state.selectedModel && !state.busy);
  }

  function renderControls() {
    const modelReady = state.statusOk && Boolean(state.selectedModel);
    if (els.startSession) els.startSession.disabled = !state.selectedCharacterId || !modelReady || state.busy;
    if (els.input) els.input.disabled = !canSend();
    if (els.send) {
      els.send.disabled = !state.busy && !canSend();
      els.send.classList.toggle("local-chat-stop-button", state.busy);
      els.send.innerHTML = state.busy
        ? '<ph-stop-circle weight="bold" aria-hidden="true"></ph-stop-circle>Stop'
        : '<ph-paper-plane-tilt weight="bold" aria-hidden="true"></ph-paper-plane-tilt>Send';
    }
  }

  function renderPersonaList() {
    if (!els.personaList) return;
    const activePersonas = state.personas.filter((persona) => !persona.is_archived);
    if (!activePersonas.length) {
      els.personaList.innerHTML = `
        <div class="local-chat-persona-empty">
          <strong>No personas yet</strong>
          <span>Create one to give the user a stable role inside character chats.</span>
        </div>
      `;
      return;
    }
    els.personaList.innerHTML = activePersonas.map((persona) => `
      <button type="button" class="local-chat-persona-button${persona.id === state.editingPersonaId ? " is-active" : ""}" data-persona-id="${escapeHtml(persona.id)}">
        <strong>${escapeHtml(persona.name)}${persona.is_default ? ' <em>Default</em>' : ""}</strong>
        <span>${escapeHtml(persona.short_description || "No description yet.")}</span>
      </button>
    `).join("");
  }

  function renderAll() {
    renderCharacterLanding();
    renderDetailCard();
    renderPersonaSelect();
    renderModelOptions();
    renderSessions();
    renderMessages();
    renderModelLog();
    renderChatHeader();
    renderControls();
    renderPersonaList();
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(options.body ? { "Content-Type": "application/json" } : {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed with HTTP ${response.status}.`);
    }
    return payload;
  }

  async function refreshReadiness() {
    state.busy = true;
    setFormStatus("");
    setStatus("loading", "Checking Featherless...", "Centralis is checking the local proxy and available Featherless models.");
    renderControls();

    try {
      const status = await fetchJson("/api/featherless/status");
      state.statusOk = status.ok === true;
      if (!state.statusOk) {
        state.models = [];
        setStatus("error", "Featherless is unavailable", status.error || "Set FEATHERLESS_API_KEY, restart npm run dev, and refresh this page.");
        return;
      }

      const modelPayload = await fetchJson("/api/featherless/models");
      state.models = Array.isArray(modelPayload.models) ? modelPayload.models : [];
      if (!state.models.length) {
        setStatus("error", "No Featherless models found", modelPayload.error || "Confirm your Featherless plan has available chat models, then refresh this module.");
        return;
      }

      if (!state.selectedModel || !state.models.some((model) => model.name === state.selectedModel)) {
        state.selectedModel = PREFERRED_FEATHERLESS_MODELS.find((modelName) => state.models.some((model) => model.name === modelName))
          || state.models[0].name;
        localStorage.setItem(MODEL_STORAGE_KEY, state.selectedModel);
      }
      const readyDetails = modelPayload.error || status.warning
        ? `Using ${state.selectedModel}. ${modelPayload.error || status.warning}`
        : `Connected to Featherless at ${status.baseUrl || "https://api.featherless.ai/v1"}.`;
      setStatus("ready", "Featherless ready", readyDetails);
    } catch (error) {
      state.statusOk = false;
      state.models = [];
      setStatus("error", "Featherless chat is unavailable", error.message || "Run Centralis with FEATHERLESS_API_KEY set, then refresh this page.");
    } finally {
      state.busy = false;
      renderAll();
    }
  }

  async function loadCharacters() {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("local_chat_characters")
      .select("*")
      .eq("user_id", state.user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    state.characters = Array.isArray(data) ? data : [];
    await loadCharacterImages();
  }

  function throwFunctionError(response, fallbackMessage = "Edge Function request failed.") {
    if (response?.error) {
      throw response.error;
    }
    if (response?.data?.error) {
      throw new Error(response.data.error);
    }
    if (!response?.data) {
      throw new Error(fallbackMessage);
    }
  }

  function readableError(error) {
    if (!error) return "Unknown error.";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    if (error.error_description) return error.error_description;
    if (error.error) return error.error;
    try {
      return JSON.stringify(error);
    } catch (_) {
      return "Unknown error.";
    }
  }

  async function loadCharacterImages() {
    const objectIds = state.characters.map((character) => character.id).filter(Boolean);
    state.characterImagesById = new Map();
    if (!objectIds.length) return;

    const response = await requireSupabase().functions.invoke("list-object-images", {
      body: { objectIds }
    });
    throwFunctionError(response, "Could not load character images.");

    const grouped = new Map();
    for (const image of response.data?.images || []) {
      const group = grouped.get(image.object_id) || [];
      group.push(image);
      grouped.set(image.object_id, group);
    }
    state.characterImagesById = grouped;
  }

  async function setPrimaryCharacterImage(imageId) {
    if (!imageId) return;
    const response = await requireSupabase().functions.invoke("set-primary-image", {
      body: { imageId }
    });
    throwFunctionError(response, "Could not set primary character image.");
  }

  async function uploadCharacterImage(character, file) {
    if (!character?.id || !file) return null;
    if (!file.type?.startsWith("image/")) {
      throw new Error("Choose an image file to upload.");
    }

    const body = new FormData();
    body.append("objectId", character.id);
    body.append("storageModule", "local-chat");
    body.append("objectName", character.name || "Local Chat Character");
    body.append("objectKind", "character");
    body.append("elementType", "Local Chat Character");
    body.append("file", file);

    const response = await requireSupabase().functions.invoke("upload-object-image", { body });
    throwFunctionError(response, "Could not upload character image.");
    const image = response.data?.image || null;
    if (image?.id) {
      await setPrimaryCharacterImage(image.id);
    }
    return image;
  }

  async function loadPersonas() {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("local_chat_personas")
      .select("*")
      .eq("user_id", state.user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    state.personas = Array.isArray(data) ? data : [];
  }

  async function loadSessions(characterId = state.selectedCharacterId) {
    if (!characterId) {
      state.sessions = [];
      return;
    }
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("local_chat_sessions")
      .select("*")
      .eq("user_id", state.user.id)
      .eq("character_id", characterId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const sessions = Array.isArray(data) ? data : [];
    if (!sessions.length) {
      state.sessions = [];
      return;
    }

    const countsBySession = new Map(sessions.map((session) => [session.id, { user: 0, assistant: 0 }]));
    const { data: messages, error: messagesError } = await supabase
      .from("local_chat_messages")
      .select("session_id, role")
      .eq("user_id", state.user.id)
      .in("session_id", sessions.map((session) => session.id))
      .in("role", ["user", "assistant"]);
    if (messagesError) throw messagesError;

    (Array.isArray(messages) ? messages : []).forEach((message) => {
      const counts = countsBySession.get(message.session_id);
      if (!counts) return;
      if (message.role === "user") counts.user += 1;
      if (message.role === "assistant") counts.assistant += 1;
    });

    state.sessions = sessions.map((session) => {
      const counts = countsBySession.get(session.id) || { user: 0, assistant: 0 };
      return {
        ...session,
        _messageCount: counts.user + counts.assistant
      };
    });
  }

  async function loadMessages(sessionId = state.selectedSessionId) {
    if (!sessionId) {
      state.messages = [];
      return;
    }
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("local_chat_messages")
      .select("*")
      .eq("user_id", state.user.id)
      .eq("session_id", sessionId)
      .order("sequence_number", { ascending: true });
    if (error) throw error;
    state.messages = Array.isArray(data) ? data : [];
  }

  async function loadMemories(sessionId = state.selectedSessionId) {
    if (!sessionId) {
      state.memories = [];
      return;
    }
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("local_chat_memories")
      .select("*")
      .eq("user_id", state.user.id)
      .eq("session_id", sessionId)
      .eq("status", "active")
      .order("is_pinned", { ascending: false })
      .order("importance", { ascending: false })
      .limit(80);
    if (error) throw error;
    state.memories = Array.isArray(data) ? data : [];
  }

  function characterSnapshot(character) {
    return {
      id: character.id,
      name: character.name,
      short_description: character.short_description,
      description: character.description,
      core_identity: character.core_identity,
      personality: character.personality,
      appearance: character.appearance,
      background: character.background,
      speech_style: character.speech_style,
      scenario: character.scenario,
      behavior_instructions: character.behavior_instructions,
      drift_guardrails: character.drift_guardrails,
      system_prompt: character.system_prompt,
      first_message: character.first_message,
      tags: character.tags || [],
      settings: character.settings || {}
    };
  }

  function personaSnapshot(persona) {
    if (!persona) return null;
    return {
      id: persona.id,
      name: persona.name,
      short_description: persona.short_description,
      description: persona.description,
      appearance: persona.appearance,
      background: persona.background,
      personality: persona.personality,
      relationship_context: persona.relationship_context,
      instructions: persona.instructions
    };
  }

  async function nextSequenceNumber(sessionId) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("local_chat_messages")
      .select("sequence_number")
      .eq("session_id", sessionId)
      .order("sequence_number", { ascending: false })
      .limit(1);
    if (error) throw error;
    return Number(data?.[0]?.sequence_number || 0) + 1;
  }

  async function insertMessage(sessionId, role, content, metadata = {}) {
    const supabase = requireSupabase();
    const sequence = await nextSequenceNumber(sessionId);
    const row = {
      user_id: state.user.id,
      session_id: sessionId,
      role,
      content: normalizeText(content),
      sequence_number: sequence,
      model_name: metadata.model_name || null,
      generation_metadata: metadata.generation_metadata || null
    };
    const { data, error } = await supabase
      .from("local_chat_messages")
      .insert(row)
      .select()
      .single();
    if (error) throw error;

    await supabase
      .from("local_chat_sessions")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("user_id", state.user.id);

    return data;
  }

  function deleteCutoffForMessage(message) {
    if (!message) return null;
    const sequence = Number(message.sequence_number || 0);
    if (!sequence) return null;

    if (message.role === "assistant") {
      const previousUserMessage = state.messages
        .filter((item) => item.role === "user" && Number(item.sequence_number || 0) < sequence)
        .sort((a, b) => Number(b.sequence_number || 0) - Number(a.sequence_number || 0))[0];
      return Number(previousUserMessage?.sequence_number || sequence);
    }

    return sequence;
  }

  async function rewindMessagesFrom(messageId) {
    if (state.busy) return;
    const message = state.messages.find((item) => item.id === messageId);
    const cutoffSequence = deleteCutoffForMessage(message);
    if (!message || !cutoffSequence || !state.selectedSessionId) return;

    const affectedCount = state.messages.filter((item) => Number(item.sequence_number || 0) >= cutoffSequence).length;
    const laterCount = message.role === "assistant"
      ? Math.max(0, affectedCount - 2)
      : Math.max(0, affectedCount - 1);
    const prompt = message.role === "assistant"
      ? `Delete this reply, the user message it replied to, and ${laterCount} later message${laterCount === 1 ? "" : "s"}?`
      : `Delete this message and ${laterCount} later message${laterCount === 1 ? "" : "s"}?`;
    if (!confirm(prompt)) return;

    setFormStatus("Deleting messages...");
    try {
      const supabase = requireSupabase();
      const removedMessages = state.messages.filter((item) => Number(item.sequence_number || 0) >= cutoffSequence);
      const removedMessageIds = removedMessages.map((item) => item.id).filter(Boolean);
      const remainingMessages = state.messages.filter((item) => Number(item.sequence_number || 0) < cutoffSequence);
      const lastRemainingMessage = remainingMessages[remainingMessages.length - 1] || null;
      if (removedMessageIds.length) {
        const { error: deleteMemoriesError } = await supabase
          .from("local_chat_memories")
          .delete()
          .eq("user_id", state.user.id)
          .eq("session_id", state.selectedSessionId)
          .in("source_message_id", removedMessageIds);
        if (deleteMemoriesError) throw deleteMemoriesError;
      }

      const { error: deleteMessagesError } = await supabase
        .from("local_chat_messages")
        .delete()
        .eq("user_id", state.user.id)
        .eq("session_id", state.selectedSessionId)
        .gte("sequence_number", cutoffSequence);
      if (deleteMessagesError) throw deleteMessagesError;

      const { error: updateSessionError } = await supabase
        .from("local_chat_sessions")
        .update({
          last_message_at: lastRemainingMessage?.created_at || null,
          conversation_summary: null,
          relationship_summary: null,
          scene_state: {},
          summarized_through_sequence: null,
          memory_updated_through_sequence: null
        })
        .eq("id", state.selectedSessionId)
        .eq("user_id", state.user.id);
      if (updateSessionError) throw updateSessionError;

      await loadMessages(state.selectedSessionId);
      await loadMemories(state.selectedSessionId);
      await loadSessions(state.selectedCharacterId);
      setFormStatus("");
      renderAll();
      focusComposer();
    } catch (error) {
      setFormStatus(error.message || "Could not delete messages.", true);
    }
  }

  function revokePendingCharacterImagePreview() {
    if (state.pendingCharacterImagePreviewUrl) {
      URL.revokeObjectURL(state.pendingCharacterImagePreviewUrl);
      state.pendingCharacterImagePreviewUrl = "";
    }
  }

  function setCharacterImagePreview({ src = "", label = "No image selected", showClear = false } = {}) {
    if (els.characterImagePreview) {
      els.characterImagePreview.innerHTML = src
        ? `<img src="${escapeHtml(src)}" alt="">`
        : '<ph-user-focus weight="duotone" aria-hidden="true"></ph-user-focus>';
    }
    if (els.characterImageName) {
      els.characterImageName.textContent = label;
    }
    if (els.characterImageClear) {
      els.characterImageClear.hidden = !showClear;
    }
  }

  function resetPendingCharacterImage() {
    revokePendingCharacterImagePreview();
    state.pendingCharacterImageFile = null;
    if (els.characterImageInput) els.characterImageInput.value = "";
  }

  function renderCharacterImageEditor(character = null) {
    resetPendingCharacterImage();
    const existingImage = character ? primaryCharacterImage(character.id) : null;
    setCharacterImagePreview({
      src: existingImage?.image_url || "",
      label: existingImage ? "Current character image" : "No image selected",
      showClear: false
    });
  }

  function fillCharacterForm(character = null) {
    state.editingCharacterId = character?.id || null;
    const form = els.characterForm;
    if (!form) return;
    if (els.characterModalTitle) els.characterModalTitle.textContent = character ? "Edit Character" : "Create Character";
    const saveText = character ? "Update Character" : "Save Character";
    els.characterSaveText.forEach((item) => {
      item.textContent = saveText;
    });
    if (els.archiveCharacter) els.archiveCharacter.hidden = true;
    form.reset();
    const fields = [
      "name",
      "short_description",
      "description",
      "core_identity",
      "personality",
      "appearance",
      "background",
      "speech_style",
      "scenario",
      "behavior_instructions",
      "drift_guardrails",
      "system_prompt",
      "first_message"
    ];
    fields.forEach((field) => {
      if (form.elements[field]) form.elements[field].value = character?.[field] || "";
    });
    if (form.elements.tags) form.elements.tags.value = (character?.tags || []).join(", ");
    if (!character) {
      form.elements.behavior_instructions.value = "Never speak, act, decide, feel, or think for the user.";
      form.elements.drift_guardrails.value = "Preserve the character's baseline unless a major event justifies change.";
    }
    renderCharacterImageEditor(character);
    setDialogStatus(els.characterStatus, "");
  }

  function fillPersonaForm(persona = null) {
    state.editingPersonaId = persona?.id || null;
    const form = els.personaForm;
    if (!form) return;
    if (els.archivePersona) els.archivePersona.hidden = !persona;
    form.reset();
    form.elements.id.value = persona?.id || "";
    ["name", "short_description", "description", "appearance", "background", "personality", "relationship_context", "instructions"].forEach((field) => {
      if (form.elements[field]) form.elements[field].value = persona?.[field] || "";
    });
    if (form.elements.is_default) form.elements.is_default.checked = Boolean(persona?.is_default);
    setDialogStatus(els.personaStatus, "");
    renderPersonaList();
  }

  async function saveCharacter(event) {
    event.preventDefault();
    const form = els.characterForm;
    if (!form) return;
    setDialogStatus(els.characterStatus, "Saving...");
    try {
      const supabase = requireSupabase();
      const row = {
        user_id: state.user.id,
        name: normalizeText(form.elements.name.value),
        short_description: normalizeText(form.elements.short_description.value) || null,
        description: normalizeText(form.elements.description.value) || null,
        core_identity: normalizeText(form.elements.core_identity.value) || null,
        personality: normalizeText(form.elements.personality.value) || null,
        appearance: normalizeText(form.elements.appearance.value) || null,
        background: normalizeText(form.elements.background.value) || null,
        speech_style: normalizeText(form.elements.speech_style.value) || null,
        scenario: normalizeText(form.elements.scenario.value) || null,
        behavior_instructions: normalizeText(form.elements.behavior_instructions.value) || null,
        drift_guardrails: normalizeText(form.elements.drift_guardrails.value) || null,
        system_prompt: normalizeText(form.elements.system_prompt.value) || null,
        first_message: normalizeText(form.elements.first_message.value) || null,
        tags: splitTags(form.elements.tags.value),
        settings: {}
      };
      if (!row.name) throw new Error("Name is required.");

      const query = state.editingCharacterId
        ? supabase.from("local_chat_characters").update(row).eq("id", state.editingCharacterId).eq("user_id", state.user.id).select().single()
        : supabase.from("local_chat_characters").insert(row).select().single();
      const { data, error } = await query;
      if (error) throw error;
      state.editingCharacterId = data.id;

      if (state.pendingCharacterImageFile) {
        setDialogStatus(els.characterStatus, "Uploading image...");
        await uploadCharacterImage(data, state.pendingCharacterImageFile);
        resetPendingCharacterImage();
      }

      await loadCharacters();
      state.selectedCharacterId = data.id;
      state.selectedSessionId = null;
      await loadSessions(data.id);
      showCharacterPage();
      updateChatUrl();
      renderAll();
      setLandingStatus("Character saved.");
    } catch (error) {
      setDialogStatus(els.characterStatus, readableError(error) || "Could not save character.", true);
    }
  }

  async function archiveSelectedCharacter() {
    const character = state.editingCharacterId
      ? state.characters.find((item) => item.id === state.editingCharacterId)
      : selectedCharacter();
    if (!character) return;
    if (!confirm(`Archive ${character.name}? Existing sessions will remain available in the database, but the character will leave the active library.`)) return;

    try {
      const supabase = requireSupabase();
      const { error } = await supabase
        .from("local_chat_characters")
        .update({ is_archived: true })
        .eq("id", character.id)
        .eq("user_id", state.user.id);
      if (error) throw error;

      await loadCharacters();
      state.selectedCharacterId = null;
      state.selectedSessionId = null;
      state.sessions = [];
      state.messages = [];
      showLibrary();
      renderAll();
      setLandingStatus("Character archived.");
    } catch (error) {
      setDialogStatus(els.characterStatus, error.message || "Could not archive character.", true);
      setLandingStatus(error.message || "Could not archive character.", true);
    }
  }

  async function savePersona(event) {
    event.preventDefault();
    const form = els.personaForm;
    if (!form) return;
    setDialogStatus(els.personaStatus, "Saving...");
    try {
      const supabase = requireSupabase();
      const isDefault = Boolean(form.elements.is_default.checked);
      if (isDefault) {
        await supabase
          .from("local_chat_personas")
          .update({ is_default: false })
          .eq("user_id", state.user.id)
          .eq("is_default", true);
      }

      const row = {
        user_id: state.user.id,
        name: normalizeText(form.elements.name.value),
        short_description: normalizeText(form.elements.short_description.value) || null,
        description: normalizeText(form.elements.description.value) || null,
        appearance: normalizeText(form.elements.appearance.value) || null,
        background: normalizeText(form.elements.background.value) || null,
        personality: normalizeText(form.elements.personality.value) || null,
        relationship_context: normalizeText(form.elements.relationship_context.value) || null,
        instructions: normalizeText(form.elements.instructions.value) || null,
        is_default: isDefault
      };
      if (!row.name) throw new Error("Name is required.");

      const id = normalizeText(form.elements.id.value);
      const query = id
        ? supabase.from("local_chat_personas").update(row).eq("id", id).eq("user_id", state.user.id).select().single()
        : supabase.from("local_chat_personas").insert(row).select().single();
      const { data, error } = await query;
      if (error) throw error;

      await loadPersonas();
      state.selectedPersonaId = data.is_archived ? "" : data.id;
      fillPersonaForm(data);
      renderAll();
      setDialogStatus(els.personaStatus, "Persona saved.");
    } catch (error) {
      setDialogStatus(els.personaStatus, error.message || "Could not save persona.", true);
    }
  }

  async function archiveEditingPersona() {
    const persona = state.personas.find((item) => item.id === state.editingPersonaId);
    if (!persona) return;
    if (!confirm(`Archive ${persona.name}? Existing sessions that already use this persona snapshot will remain unchanged.`)) return;

    setDialogStatus(els.personaStatus, "Archiving...");
    try {
      const supabase = requireSupabase();
      const { error } = await supabase
        .from("local_chat_personas")
        .update({ is_archived: true, is_default: false })
        .eq("id", persona.id)
        .eq("user_id", state.user.id);
      if (error) throw error;

      await loadPersonas();
      if (state.selectedPersonaId === persona.id) {
        state.selectedPersonaId = state.personas.find((item) => !item.is_archived && item.is_default)?.id || "";
      }
      fillPersonaForm(state.personas.find((item) => !item.is_archived && item.is_default) || state.personas.find((item) => !item.is_archived) || null);
      renderAll();
      setDialogStatus(els.personaStatus, "Persona archived.");
    } catch (error) {
      setDialogStatus(els.personaStatus, error.message || "Could not archive persona.", true);
    }
  }

  async function openCharacterDetail(characterId) {
    state.selectedCharacterId = characterId;
    state.selectedSessionId = null;
    state.messages = [];
    state.memories = [];
    updateChatUrl();
    showCharacterPage();
    await loadSessions(characterId);
    renderAll();
  }

  async function startSession() {
    const character = selectedCharacter();
    if (!character || !state.selectedModel) return;
    setFormStatus("");
    try {
      const supabase = requireSupabase();
      const persona = state.personas.find((item) => item.id === state.selectedPersonaId && !item.is_archived) || null;
      const title = `${character.name}${persona ? ` with ${persona.name}` : ""} - ${formatDate(new Date().toISOString())}`;
      const { data: session, error } = await supabase
        .from("local_chat_sessions")
        .insert({
          user_id: state.user.id,
          title,
          character_id: character.id,
          persona_id: persona?.id || null,
          character_snapshot: characterSnapshot(character),
          persona_snapshot: personaSnapshot(persona),
          model_name: state.selectedModel,
          settings: {
            stream: true,
            temperature: 0.8,
            reply_length: "standard"
          },
          scene_state: {}
        })
        .select()
        .single();
      if (error) throw error;

      state.selectedSessionId = session.id;
      state.modelLog = [];
      updateChatUrl();
      if (character.first_message) {
        await insertMessage(session.id, "assistant", character.first_message, { model_name: state.selectedModel });
      }
      await loadSessions(character.id);
      await loadMessages(session.id);
      await loadMemories(session.id);
      showChatPage();
      renderAll();
      focusComposer();
    } catch (error) {
      setFormStatus(error.message || "Could not start session.", true);
    }
  }

  async function selectSession(sessionId) {
    state.selectedSessionId = sessionId;
    state.modelLog = [];
    updateChatUrl();
    const session = selectedSession();
    if (session?.model_name) {
      state.selectedModel = session.model_name;
      localStorage.setItem(MODEL_STORAGE_KEY, state.selectedModel);
    }
    await loadMessages(sessionId);
    await loadMemories(sessionId);
    showChatPage();
    renderAll();
    focusComposer();
  }

  function addSection(parts, title, value, fallback = "") {
    const text = normalizeText(value) || normalizeText(fallback);
    if (text) parts.push(`## ${title}\n${text}`);
  }

  function compileFieldList(fields) {
    return fields
      .map(([label, value]) => [label, normalizeText(value)])
      .filter(([, value]) => value)
      .map(([label, value]) => `- ${label}: ${value}`)
      .join("\n");
  }

  function compileMemoryList(memories) {
    return memories
      .map((memory) => {
        const labels = [
          memory.memory_type,
          memory.subject ? `subject: ${memory.subject}` : "",
          Number(memory.importance) >= 0.8 ? "important" : "",
          memory.is_pinned ? "pinned" : ""
        ].filter(Boolean).join(", ");
        return `- ${labels ? `[${labels}] ` : ""}${memory.content}`;
      })
      .join("\n");
  }

  function tokenizeMemoryText(value) {
    return new Set(String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4));
  }

  function recentTopicText(userText) {
    return [
      ...state.messages
        .filter((message) => ["user", "assistant"].includes(message.role) && !message.streaming)
        .slice(-6)
        .map((message) => message.content),
      userText
    ].join("\n");
  }

  function compileSceneState(sceneState) {
    if (!sceneState || typeof sceneState !== "object" || Array.isArray(sceneState)) return "";
    return Object.entries(sceneState)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
      .join("\n");
  }

  function selectRelevantMemories(userText) {
    const text = recentTopicText(userText).toLowerCase();
    const topicTokens = tokenizeMemoryText(text);
    const scored = state.memories.map((memory) => {
      let score = Number(memory.importance || 0.5);
      const alwaysRecall = memory.is_pinned || ALWAYS_RECALLED_MEMORY_TYPES.has(memory.memory_type);
      if (memory.is_pinned) score += 3;
      if (ALWAYS_RECALLED_MEMORY_TYPES.has(memory.memory_type)) score += 2;
      const subject = String(memory.subject || "").toLowerCase();
      if (subject && text.includes(subject)) score += 2;
      for (const token of subject.split(/\s+/).filter((item) => item.length > 3)) {
        if (text.includes(token)) score += 0.55;
      }
      for (const token of tokenizeMemoryText(memory.content)) {
        if (topicTokens.has(token)) score += 0.18;
      }
      return { memory, score, alwaysRecall };
    });

    const always = scored
      .filter((item) => item.alwaysRecall)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.memory);
    const selectedIds = new Set(always.map((memory) => memory.id));
    const matched = scored
      .filter((item) => !selectedIds.has(item.memory.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, MEMORY_RECALL_LIMIT)
      .map((item) => item.memory);
    return [...always, ...matched]
      .slice(0, MEMORY_RECALL_LIMIT);
  }

  async function recordMemoryRecall(memoryIds) {
    if (!memoryIds.length) return;
    try {
      const supabase = requireSupabase();
      const recalledAt = new Date().toISOString();
      await Promise.all(memoryIds.map((id) => {
        const memory = state.memories.find((item) => item.id === id);
        if (!memory) return Promise.resolve();
        return supabase
          .from("local_chat_memories")
          .update({
            recall_count: Number(memory.recall_count || 0) + 1,
            last_recalled_at: recalledAt
          })
          .eq("id", id)
          .eq("user_id", state.user.id)
          .eq("session_id", state.selectedSessionId);
      }));
      state.memories = state.memories.map((memory) => memoryIds.includes(memory.id)
        ? { ...memory, recall_count: Number(memory.recall_count || 0) + 1, last_recalled_at: recalledAt }
        : memory);
    } catch (error) {
      console.warn("Local Chat memory recall counters were not updated:", error);
    }
  }

  function compilePrompt(userText) {
    const session = selectedSession();
    if (!session) return [];
    const character = session.character_snapshot || {};
    const persona = session.persona_snapshot || null;
    const relevantMemories = selectRelevantMemories(userText);
    const replyLengthOption = selectedReplyLengthOption();
    state.lastRecalledMemoryIds = relevantMemories.map((memory) => memory.id).filter(Boolean);
    const parts = [];

    addSection(parts, "Engine Rules", ENGINE_RULES.map((rule) => `- ${rule}`).join("\n"));
    addSection(parts, "Prompt Priority", [
      "1. Engine rules and user-control boundaries",
      "2. Character snapshot and original baseline",
      "3. Persona snapshot as context only, never as something to control",
      "4. Core identity and drift guardrails",
      "5. Current scene, relationship, and relevant session memories",
      "6. Conversation summary",
      "7. Recent raw messages"
    ].join("\n"));

    addSection(parts, "Character Snapshot", compileFieldList([
      ["Name", character.name],
      ["Short Description", character.short_description],
      ["Description", character.description],
      ["Personality", character.personality],
      ["Appearance", character.appearance],
      ["Background", character.background],
      ["Speech Style", character.speech_style],
      ["Scenario", session.scenario_override || character.scenario],
      ["Behavior Instructions", character.behavior_instructions],
      ["Advanced System Prompt", session.system_prompt_override || character.system_prompt]
    ]), "The character snapshot is sparse. Use only supplied session context and do not invent a new baseline.");

    if (persona) {
      addSection(parts, "Persona Snapshot", compileFieldList([
        ["Name", persona.name],
        ["Short Description", persona.short_description],
        ["Description", persona.description],
        ["Appearance", persona.appearance],
        ["Background", persona.background],
        ["Personality", persona.personality],
        ["Relationship Context", persona.relationship_context],
        ["Instructions", persona.instructions]
      ]));
    } else {
      addSection(parts, "Persona Snapshot", "No reusable persona was selected. Treat the user as themselves without inventing traits, actions, thoughts, or backstory.");
    }

    addSection(parts, "Core Identity", character.core_identity, "Use the Character Snapshot as the baseline identity. Do not invent a new baseline.");
    addSection(parts, "Drift Guardrails", character.drift_guardrails, "Stay grounded in the character's original parameters. Only major session events can justify lasting change.");
    addSection(parts, "Current Scene State", compileSceneState(session.scene_state), "No explicit scene state has been stored yet. Use the current conversation context without inventing continuity.");
    addSection(parts, "Relationship Summary", session.relationship_summary);
    if (relevantMemories.length) {
      addSection(parts, "Relevant Session Memories", compileMemoryList(relevantMemories));
    } else {
      addSection(parts, "Relevant Session Memories", "No session memories are currently relevant. Do not invent memory.");
    }
    addSection(parts, "Conversation Summary", session.conversation_summary);
    addSection(parts, "Response Shape", [
      "- Respond as the character in a grounded, coherent way.",
      "- Use the character's speech style and current emotional context without drifting from their baseline.",
      `- Reply length: ${replyLengthOption.instruction}`,
      "- Longer replies must never create user/persona actions, dialogue, emotions, thoughts, choices, body movement, facial expressions, memories, realizations, or reactions.",
      "- If you need more length, expand the character's behavior, speech, inner restraint, visible expression, the room, atmosphere, NPC actions, or unresolved tension without moving the user/persona.",
      "- Treat the user/persona as physically and mentally paused unless the latest visible user message explicitly states otherwise.",
      "- You may describe what the character does near or toward the user, but not what the user does in response.",
      "- Do not end the response with any question to the user/persona.",
      "- Do not ask where the user wants to go, what the user wants to do, how the user responds, or what the user wants to say.",
      "- Do not ask meta handoff questions such as \"What do you want to do?\", \"What do you want to tell her?\", or \"How do you respond?\"",
      "- If the character needs something from the user, imply it through the scene and stop without asking a direct question.",
      "- If the user has just acted or spoken, respond in-scene as the character and stop at a natural point without prompting the user's next action.",
      "- Do not include analysis of these instructions.",
      "- Do not label the response with the character name unless it is natural in the prose."
    ].join("\n"));

    const recentMessages = state.messages
      .filter((message) => ["user", "assistant"].includes(message.role) && !message.streaming)
      .slice(-RECENT_MESSAGE_LIMIT)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));

    return [
      { role: "system", content: parts.join("\n\n") },
      ...recentMessages
    ];
  }

  function getUserControlViolations(text) {
    const content = String(text || "");
    const checks = [
      {
        type: "direct_user_dialogue_or_action",
        pattern: /\byou\s+(say|said|ask|asked|reply|replied|whisper|whispered|shout|shouted|mutter|muttered|tell|told|answer|answered)\b/i
      },
      {
        type: "direct_user_decision_or_thought",
        pattern: /\byou\s+(decide|decided|choose|chose|feel|felt|think|thought|realize|realized|remember|remembered|notice|noticed|want|wanted|intend|intended|know|knew)\b/i
      },
      {
        type: "direct_user_body_control",
        pattern: /\byou\s+(step|stepped|walk|walked|move|moved|reach|reached|touch|touched|grab|grabbed|nod|nodded|smile|smiled|laugh|laughed|cry|cried|sit|sat|stand|stood|turn|turned|look|looked)\b/i
      },
      {
        type: "user_body_possession",
        pattern: /\byour\s+(hand|hands|body|voice|mouth|eyes|heart|mind|thoughts|expression|face|breath|fingers|arms|legs|shoulders)\b/i
      },
      {
        type: "explicit_user_control",
        pattern: /\bthe user\s+(says|said|asks|asked|replies|replied|decides|feels|thinks|moves|walks|reaches|notices|remembers|wants)\b/i
      },
      {
        type: "persona_control",
        pattern: /\b(the persona|your persona)\s+(says|said|asks|asked|replies|replied|decides|feels|thinks|moves|walks|reaches|notices|remembers|wants)\b/i
      }
    ];
    return checks
      .filter((check) => check.pattern.test(content))
      .map((check) => check.type);
  }

  async function nonStreamingModel(messages, signal, label = "Featherless request") {
    const request = {
      endpoint: "/api/featherless/chat",
      model: state.selectedModel,
      messages
    };
    const logId = addModelLogEntry({ label, status: "pending", request });
    try {
      const payload = await fetchJson("/api/featherless/chat", {
        method: "POST",
        signal,
        body: JSON.stringify({
          model: state.selectedModel,
          messages
        })
      });
      updateModelLogEntry(logId, { status: "complete", response: payload });
      return normalizeText(payload.text) || "(No text returned.)";
    } catch (error) {
      updateModelLogEntry(logId, { status: "error", error: readableError(error) });
      throw error;
    }
  }

  async function repairResponse(originalText, promptMessages, violations, signal) {
    const repairMessages = [
      ...promptMessages,
      {
        role: "assistant",
        content: originalText
      },
      {
        role: "user",
        content: [
          "Rewrite your previous response.",
          `Detected user-control violations: ${violations.length ? violations.join(", ") : "unknown"}.`,
          "Do not speak, act, decide, feel, notice, remember, want, or think for me.",
          "Do not ask meta handoff questions like \"What do you want to tell her?\" or \"How do you respond?\"",
          "Only portray your character, non-user NPCs when necessary, and the world around your character.",
          "Preserve the character baseline and drift guardrails from the system prompt.",
          "Return only the corrected in-character response. Do not explain the correction."
        ].join("\n")
      }
    ];
    return nonStreamingModel(repairMessages, signal, "Repair response");
  }

  async function streamAssistantResponse(promptMessages, assistantMessage) {
    const request = {
      endpoint: "/api/featherless/chat-stream-json",
      model: state.selectedModel,
      messages: promptMessages
    };
    const logId = addModelLogEntry({ label: "Character response stream", status: "streaming", request });
    let response;
    try {
      response = await fetch("/api/featherless/chat-stream-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: state.abortController.signal,
        body: JSON.stringify({
          model: state.selectedModel,
          messages: promptMessages
        })
      });
    } catch (error) {
      updateModelLogEntry(logId, { status: "error", error: readableError(error) });
      throw error;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 404 || String(payload.error || "").includes("Unknown route")) {
        updateModelLogEntry(logId, { status: "fallback", response: payload });
        const text = await nonStreamingModel(promptMessages, state.abortController.signal, "Character response fallback");
        return { text, metadata: { model: state.selectedModel, stream_fallback: "non_streaming" }, logId };
      }
      updateModelLogEntry(logId, { status: "error", error: payload.error || `Streaming failed with HTTP ${response.status}.` });
      throw new Error(payload.error || `Streaming failed with HTTP ${response.status}.`);
    }
    if (!response.body) {
      updateModelLogEntry(logId, { status: "error", error: "Featherless did not return a streaming response." });
      throw new Error("Featherless did not return a streaming response.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let metadata = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const payload = JSON.parse(line);
        if (payload.type === "delta") {
          assistantMessage.content += String(payload.text || "");
          renderMessages();
        } else if (payload.type === "done") {
          metadata = payload.metadata || { model: payload.model || state.selectedModel };
        } else if (payload.type === "debug") {
          updateModelLogEntry(logId, {
            status: "debug",
            response: {
              warning: payload.warning || "Stream debug payload",
              sample: payload.sample || null
            }
          });
        } else if (payload.type === "error") {
          updateModelLogEntry(logId, { status: "error", error: payload.error || "Featherless stream failed." });
          throw new Error(payload.error || "Featherless stream failed.");
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/).filter((line) => line.trim());
      for (const line of lines) {
        const payload = JSON.parse(line);
        if (payload.type === "delta") {
          assistantMessage.content += String(payload.text || "");
        } else if (payload.type === "done") {
          metadata = payload.metadata || { model: payload.model || state.selectedModel };
        } else if (payload.type === "debug") {
          updateModelLogEntry(logId, {
            status: "debug",
            response: {
              warning: payload.warning || "Stream debug payload",
              sample: payload.sample || null
            }
          });
        } else if (payload.type === "error") {
          updateModelLogEntry(logId, { status: "error", error: payload.error || "Featherless stream failed." });
          throw new Error(payload.error || "Featherless stream failed.");
        }
      }
    }
    const finalResponse = {
      text: normalizeText(assistantMessage.content) || "(No text returned.)",
      metadata: metadata || { model: state.selectedModel }
    };
    updateModelLogEntry(logId, { status: "complete", response: finalResponse });
    return { ...finalResponse, logId };
  }

  function stopStreaming() {
    state.abortController?.abort();
    setFormStatus("Stopping Featherless response...");
  }

  async function copyReply(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    const text = message?.content || "";
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setFormStatus("Reply copied.");
      focusComposer();
    } catch (error) {
      setFormStatus(error.message || "Could not copy reply.", true);
    }
  }

  function extractJsonObject(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(raw.slice(start, end + 1));
        } catch (_innerError) {
          return null;
        }
      }
      return null;
    }
  }

  function cleanMemory(memory, sourceMessageId = null) {
    const type = MEMORY_TYPES.has(memory?.memory_type) ? memory.memory_type : "other";
    const content = normalizeText(memory?.content);
    if (!content) return null;
    const validMemoryIds = new Set(state.memories.map((item) => item.id));
    const supersedesMemoryId = validMemoryIds.has(memory?.supersedes_memory_id) ? memory.supersedes_memory_id : null;
    const importance = Number(memory.importance ?? 0.5);
    const confidence = Number(memory.confidence ?? 1);
    return {
      user_id: state.user.id,
      session_id: state.selectedSessionId,
      source_message_id: sourceMessageId,
      memory_type: type,
      subject: normalizeText(memory.subject) || null,
      content,
      structured_data: memory.structured_data && typeof memory.structured_data === "object" && !Array.isArray(memory.structured_data) ? memory.structured_data : {},
      importance: Number.isFinite(importance) ? Math.min(1, Math.max(0, importance)) : 0.5,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 1,
      status: "active",
      is_pinned: Boolean(memory.is_pinned),
      supersedes_memory_id: supersedesMemoryId
    };
  }

  function cleanMemoryUpdate(update) {
    const validMemoryIds = new Set(state.memories.map((memory) => memory.id));
    const id = normalizeText(update?.id || update?.memory_id);
    if (!id || !validMemoryIds.has(id)) return null;
    const row = {};
    if (normalizeText(update.content)) row.content = normalizeText(update.content);
    if (normalizeText(update.subject)) row.subject = normalizeText(update.subject);
    if (MEMORY_TYPES.has(update.memory_type)) row.memory_type = update.memory_type;
    if (MEMORY_STATUSES.has(update.status)) row.status = update.status;
    if (update.structured_data && typeof update.structured_data === "object" && !Array.isArray(update.structured_data)) {
      row.structured_data = update.structured_data;
    }
    if (update.importance !== undefined) {
      const importance = Number(update.importance);
      if (Number.isFinite(importance)) row.importance = Math.min(1, Math.max(0, importance));
    }
    if (update.confidence !== undefined) {
      const confidence = Number(update.confidence);
      if (Number.isFinite(confidence)) row.confidence = Math.min(1, Math.max(0, confidence));
    }
    if (update.is_pinned !== undefined) row.is_pinned = Boolean(update.is_pinned);
    const supersedesMemoryId = normalizeText(update.supersedes_memory_id);
    if (supersedesMemoryId && validMemoryIds.has(supersedesMemoryId)) row.supersedes_memory_id = supersedesMemoryId;
    if (!Object.keys(row).length) return null;
    return { id, row };
  }

  function cleanResolvedMemory(update) {
    const validMemoryIds = new Set(state.memories.map((memory) => memory.id));
    const id = normalizeText(typeof update === "string" ? update : update?.id || update?.memory_id);
    if (!id || !validMemoryIds.has(id)) return null;
    const status = typeof update === "object" && MEMORY_STATUSES.has(update.status) ? update.status : "resolved";
    return { id, row: { status } };
  }

  function memoryExtractionContext() {
    return state.memories.slice(0, 40).map((memory) => ({
      id: memory.id,
      type: memory.memory_type,
      subject: memory.subject,
      content: memory.content,
      status: memory.status,
      importance: memory.importance,
      confidence: memory.confidence,
      pinned: memory.is_pinned
    }));
  }

  function cleanSceneStateChanges(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const changes = Object.fromEntries(Object.entries(value).filter(([key, item]) => {
      return normalizeText(key) && item !== undefined;
    }));
    return Object.keys(changes).length ? changes : null;
  }

  async function extractMemories(userMessage, assistantMessage) {
    const session = selectedSession();
    if (!session || !state.selectedModel) return;
    const extractionPrompt = [
      {
        role: "system",
        content: [
          "You extract session-only roleplay memory as strict JSON.",
          "Return only JSON with keys: new_memories, memory_updates, resolved_memories, scene_state_changes, relationship_summary_update.",
          "Do not include markdown.",
          "Only extract important continuity facts, promises, goals, secrets, injuries, boundaries, relationship changes, plot threads, major events, and character development.",
          "Do not create memories for trivial wording or temporary mood unless it affects continuity.",
          "Memory types must be one of: fact, preference, event, promise, goal, secret, relationship, emotion, opinion, boundary, location, possession, injury, identity, plot_thread, character_development, major_event, other.",
          "Use memory_updates when new information changes an existing memory. Use resolved_memories when a goal, promise, plot thread, injury, or uncertainty is resolved.",
          "Only reference existing memory IDs from the provided Active Memories list.",
          "For contradictions, mark the old memory superseded in memory_updates and create a new active memory with supersedes_memory_id set to the old memory id."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `Character: ${(session.character_snapshot || {}).name || "Character"}`,
          `Session id: ${session.id}`,
          `Current relationship summary:\n${session.relationship_summary || ""}`,
          `Current scene state:\n${JSON.stringify(session.scene_state || {}, null, 2)}`,
          `Active Memories:\n${JSON.stringify(memoryExtractionContext(), null, 2)}`,
          `User message:\n${userMessage?.content || "(No visible user message. The assistant continued from the previous scene.)"}`,
          `Assistant message:\n${assistantMessage.content}`
        ].join("\n\n")
      }
    ];

    try {
      const text = await nonStreamingModel(extractionPrompt, state.abortController?.signal, "Session memory extraction");
      const payload = extractJsonObject(text);
      if (!payload || typeof payload !== "object") return;

      const memories = Array.isArray(payload.new_memories)
        ? payload.new_memories.map((memory) => cleanMemory(memory, assistantMessage.id)).filter(Boolean).slice(0, 12)
        : [];
      const supabase = requireSupabase();
      if (memories.length) {
        await supabase.from("local_chat_memories").insert(memories);
      }

      const memoryUpdates = [
        ...(Array.isArray(payload.memory_updates) ? payload.memory_updates.map(cleanMemoryUpdate).filter(Boolean) : []),
        ...(Array.isArray(payload.resolved_memories) ? payload.resolved_memories.map(cleanResolvedMemory).filter(Boolean) : [])
      ].slice(0, 20);
      for (const update of memoryUpdates) {
        await supabase
          .from("local_chat_memories")
          .update(update.row)
          .eq("id", update.id)
          .eq("user_id", state.user.id)
          .eq("session_id", session.id);
      }

      const updates = {};
      const sceneStateChanges = cleanSceneStateChanges(payload.scene_state_changes);
      if (sceneStateChanges) {
        updates.scene_state = {
          ...(session.scene_state && typeof session.scene_state === "object" ? session.scene_state : {}),
          ...sceneStateChanges
        };
      }
      if (normalizeText(payload.relationship_summary_update)) {
        updates.relationship_summary = normalizeText(payload.relationship_summary_update);
      }
      updates.memory_updated_through_sequence = assistantMessage.sequence_number;
      if (Object.keys(updates).length) {
        const { data, error } = await supabase
          .from("local_chat_sessions")
          .update(updates)
          .eq("id", session.id)
          .eq("user_id", state.user.id)
          .select()
          .single();
        if (!error && data) {
          state.sessions = state.sessions.map((item) => item.id === data.id ? data : item);
        }
      }
      await loadMemories(session.id);
    } catch (error) {
      console.warn("Local Chat memory extraction skipped:", error);
    }
  }

  function formatMessagesForSummary(messages) {
    return messages.map((message) => {
      const label = message.role === "assistant"
        ? (selectedSession()?.character_snapshot?.name || "Assistant")
        : "User";
      return `[${message.sequence_number}] ${label}: ${message.content}`;
    }).join("\n\n");
  }

  async function updateConversationSummaryIfNeeded() {
    const session = selectedSession();
    if (!session || !state.selectedModel) return;
    const persistedMessages = state.messages
      .filter((message) => ["user", "assistant"].includes(message.role) && !message.streaming)
      .sort((a, b) => Number(a.sequence_number || 0) - Number(b.sequence_number || 0));
    if (persistedMessages.length < SUMMARY_TRIGGER_MESSAGE_COUNT) return;

    const cutoffIndex = persistedMessages.length - RECENT_MESSAGE_LIMIT - 1;
    if (cutoffIndex < 0) return;
    const cutoffSequence = Number(persistedMessages[cutoffIndex]?.sequence_number || 0);
    const summarizedThrough = Number(session.summarized_through_sequence || 0);
    if (!cutoffSequence || cutoffSequence <= summarizedThrough) return;

    const messagesToSummarize = persistedMessages.filter((message) => {
      const sequence = Number(message.sequence_number || 0);
      return sequence > summarizedThrough && sequence <= cutoffSequence;
    });
    if (messagesToSummarize.length < SUMMARY_MIN_NEW_MESSAGES) return;

    const characterName = session.character_snapshot?.name || "the character";
    const summaryPrompt = [
      {
        role: "system",
        content: [
          "You update a long-running roleplay conversation summary for Centralis.",
          "Return only the updated summary text. Do not include markdown headings.",
          "Preserve chronology, durable facts, relationship changes, promises, unresolved threads, secrets, injuries, goals, major events, and character-development moments.",
          "Do not add new events or interpret beyond the provided messages.",
          "Do not write future actions for the user. This is a neutral summary, not a roleplay response.",
          "Keep the summary concise but complete enough that older raw messages can be omitted from future prompts."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `Character: ${characterName}`,
          `Existing summary:\n${session.conversation_summary || "(none yet)"}`,
          `New messages to fold into the summary through sequence ${cutoffSequence}:`,
          formatMessagesForSummary(messagesToSummarize)
        ].join("\n\n")
      }
    ];

    try {
      const updatedSummary = normalizeText(await nonStreamingModel(summaryPrompt, state.abortController?.signal, "Conversation summary update"));
      if (!updatedSummary) return;
      const supabase = requireSupabase();
      const { data, error } = await supabase
        .from("local_chat_sessions")
        .update({
          conversation_summary: updatedSummary,
          summarized_through_sequence: cutoffSequence
        })
        .eq("id", session.id)
        .eq("user_id", state.user.id)
        .select()
        .single();
      if (error) throw error;
      if (data) {
        state.sessions = state.sessions.map((item) => item.id === data.id ? data : item);
      }
    } catch (error) {
      console.warn("Local Chat conversation summary was not updated:", error);
    }
  }

  async function generateAssistantTurn({ userRow = null, promptText, continuation = false } = {}) {
    await loadMemories(state.selectedSessionId);
    const effectivePromptText = continuation
      ? [
        "Continue the scene after the last visible assistant message.",
        "The previous assistant message is already complete and visible to the user.",
        "Do not repeat, recap, paraphrase, restart, or re-stage the previous assistant message.",
        "Advance the scene with a new in-character beat, character reaction, character line of dialogue, NPC action, or environmental development.",
        "Advancing the scene must not advance the user/persona. The user/persona remains paused until the human user writes their next action or dialogue.",
        "Do not wait for a new user action.",
        "Do not speak, act, decide, feel, think, notice, or respond for the user/persona.",
        "Do not ask the user/persona a direct question.",
        "Stop at a natural unresolved beat that leaves room for the user.",
        `Previous assistant message to continue after, not repeat:\n${normalizeText(promptText) || "(none)"}`
      ].join("\n")
      : promptText;
    const promptMessages = compilePrompt(effectivePromptText);
    if (continuation) {
      promptMessages.push({
        role: "user",
        content: [
          "Continue from after the last assistant message.",
          "This is an internal Centralis continuation command, not visible user dialogue.",
          "The last assistant message has already happened. Do not repeat it or rewrite it.",
          "Advance the scene with new character action, new character dialogue, NPC action, or a new sensory/detail beat.",
          "Do not advance the user/persona while advancing the scene.",
          "Do not quote or mention this instruction.",
          "Do not narrate any action, thought, feeling, decision, or dialogue for the user/persona."
        ].join("\n")
      });
    }

    await recordMemoryRecall(state.lastRecalledMemoryIds);
    setFormStatus("Streaming from Featherless...");
    const pendingAssistant = { role: "assistant", content: "", streaming: true };
    state.messages.push(pendingAssistant);
    renderMessages();

    try {
      const streamResult = await streamAssistantResponse(promptMessages, pendingAssistant);
      const elapsedSeconds = state.generationElapsedSeconds;
      let assistantText = cleanCharacterReplyArtifacts(streamResult.text, promptText, selectedCharacter()?.name);
      if (!assistantText) {
        updateModelLogEntry(streamResult.logId, {
          status: "rejected",
          error: "The model returned only chat-template artifacts or echoed the prompt."
        });
        throw new Error("Featherless returned chat-template text instead of a character reply. Try another model or check the model's chat-template support.");
      }
      if (continuation && isLikelyRepeatedReply(promptText, assistantText)) {
        updateModelLogEntry(streamResult.logId, {
          status: "rejected",
          error: "The model repeated the previous assistant reply instead of continuing."
        });
        throw new Error("The model repeated the previous reply instead of continuing. Try Continue again or switch models.");
      }

      let generationMetadata = streamResult.metadata || { model: state.selectedModel };
      let repaired = false;
      let violationReasons = getUserControlViolations(assistantText);
      if (violationReasons.length && state.repairEnabled) {
        setFormStatus("Repairing response so it does not control your character...");
        const repairedText = await repairResponse(assistantText, promptMessages, violationReasons, state.abortController.signal);
        const repairedViolationReasons = getUserControlViolations(repairedText);
        if (repairedText && !repairedViolationReasons.length) {
          assistantText = repairedText;
          repaired = true;
          generationMetadata = {
            ...generationMetadata,
            repaired_user_control_violation: true,
            repair_used_non_streaming: true,
            original_user_control_violations: violationReasons
          };
        } else {
          setFormStatus("Warning: possible user-control issue detected. The original model reply was kept unchanged.", true);
          generationMetadata = {
            ...generationMetadata,
            possible_user_control_violation: true,
            original_reply_preserved: true,
            original_user_control_violations: violationReasons,
            repaired_user_control_violations: repairedViolationReasons
          };
        }
        violationReasons = getUserControlViolations(assistantText);
      } else if (violationReasons.length) {
        generationMetadata = {
          ...generationMetadata,
          possible_user_control_violation: true,
          repair_disabled: true,
          original_reply_preserved: true,
          original_user_control_violations: violationReasons
        };
      }

      pendingAssistant.content = assistantText;
      pendingAssistant.streaming = false;
      stopGenerationTimer();
      state.busy = false;
      state.abortController = null;
      const assistantRow = await insertMessage(state.selectedSessionId, "assistant", assistantText, {
        model_name: state.selectedModel,
        generation_metadata: {
          ...generationMetadata,
          elapsed_seconds: elapsedSeconds,
          continued_without_user_message: continuation,
          repaired_user_control_violation: repaired,
          user_control_violation_detected: Boolean(generationMetadata.possible_user_control_violation || generationMetadata.original_user_control_violations?.length),
          final_user_control_violations: violationReasons
        }
      });
      state.messages = state.messages.filter((message) => message !== pendingAssistant);
      state.messages.push(assistantRow);
      renderAll();

      if (!els.formStatus?.classList.contains("is-error")) setFormStatus("Updating session memory...");
      await extractMemories(userRow, assistantRow);
      if (!els.formStatus?.classList.contains("is-error")) setFormStatus("Updating conversation summary...");
      await updateConversationSummaryIfNeeded();
      await loadSessions(state.selectedCharacterId);
      setFormStatus("");
      return assistantRow;
    } catch (error) {
      state.messages = state.messages.filter((message) => message !== pendingAssistant);
      throw error;
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (state.busy) {
      stopStreaming();
      return;
    }
    if (!canSend()) return;

    const content = normalizeText(els.input?.value);
    if (!content) return;

    state.busy = true;
    state.abortController = new AbortController();
    clearModelLog();
    startGenerationTimer();
    setFormStatus("Saving message...");
    if (els.input) els.input.value = "";
    renderControls();

    let userRow = null;

    try {
      userRow = await insertMessage(state.selectedSessionId, "user", content);
      state.messages.push(userRow);
      await generateAssistantTurn({ userRow, promptText: content });
      clearModelLog();
    } catch (error) {
      stopGenerationTimer();
      if (error.name === "AbortError") {
        setFormStatus("Stopped.");
      } else {
        setFormStatus(error.message || "Featherless request failed.", true);
      }
    } finally {
      stopGenerationTimer();
      state.busy = false;
      state.abortController = null;
      renderAll();
      focusComposer();
    }
  }

  async function continueReply(messageId) {
    if (state.busy) {
      stopStreaming();
      return;
    }
    if (!canSend()) return;

    const message = state.messages.find((item) => item.id === messageId);
    if (!message || message.role !== "assistant") return;

    state.busy = true;
    state.abortController = new AbortController();
    clearModelLog();
    startGenerationTimer();
    setFormStatus("Continuing from Featherless...");
    renderControls();

    try {
      await generateAssistantTurn({
        userRow: null,
        promptText: message.content,
        continuation: true
      });
      clearModelLog();
    } catch (error) {
      stopGenerationTimer();
      setFormStatus(error.name === "AbortError" ? "Stopped." : error.message || "Featherless request failed.", error.name !== "AbortError");
    } finally {
      stopGenerationTimer();
      state.busy = false;
      state.abortController = null;
      renderAll();
      focusComposer();
    }
  }

  async function deleteSession(sessionId = state.selectedSessionId) {
    const session = state.sessions.find((item) => item.id === sessionId) || selectedSession();
    if (!session || !confirm("Delete this chat session?")) return;
    try {
      const supabase = requireSupabase();
      const { error } = await supabase
        .from("local_chat_sessions")
        .delete()
        .eq("id", session.id)
        .eq("user_id", state.user.id);
      if (error) throw error;
      if (state.selectedSessionId === session.id) {
        state.selectedSessionId = null;
        state.messages = [];
        state.memories = [];
        showCharacterPage();
      }
      await loadSessions(state.selectedCharacterId);
      updateChatUrl();
      renderAll();
    } catch (error) {
      setFormStatus(error.message || "Could not delete session.", true);
    }
  }

  async function initialize() {
    try {
      state.user = await waitForAdmin();
      if (state.user?.admin !== true) {
        window.location.replace("index.html");
        return;
      }
      requireSupabase();
      await Promise.all([loadCharacters(), loadPersonas()]);
      const urlState = readChatUrlState();
      if (urlState.editorMode === "create") {
        fillCharacterForm();
        showCharacterEditor();
      } else if (urlState.editorMode === "edit" && urlState.characterId && state.characters.some((character) => character.id === urlState.characterId)) {
        state.selectedCharacterId = urlState.characterId;
        fillCharacterForm(state.characters.find((character) => character.id === urlState.characterId) || null);
        showCharacterEditor();
      } else if (urlState.characterId && state.characters.some((character) => character.id === urlState.characterId)) {
        state.selectedCharacterId = urlState.characterId;
        await loadSessions(urlState.characterId);
        if (urlState.sessionId && state.sessions.some((session) => session.id === urlState.sessionId)) {
          state.selectedSessionId = urlState.sessionId;
          await loadMessages(urlState.sessionId);
          await loadMemories(urlState.sessionId);
          showChatPage();
        } else {
          state.selectedSessionId = null;
          state.messages = [];
          state.memories = [];
          showCharacterPage();
        }
        updateChatUrl();
      } else {
        showLibrary();
      }
      renderAll();
      if (els.page) els.page.hidden = false;
    } catch (error) {
      if (els.page) els.page.hidden = false;
      setLandingStatus(error.message || "Could not initialize Local Chat.", true);
    }
  }

  els.characterSearch?.addEventListener("input", () => {
    state.characterQuery = els.characterSearch.value || "";
    renderCharacterLanding();
  });
  els.createCharacter?.addEventListener("click", () => {
    fillCharacterForm();
    showCharacterEditor();
  });
  els.personas?.addEventListener("click", () => {
    fillPersonaForm(state.personas.find((persona) => persona.is_default) || state.personas[0] || null);
    openModal(els.personaModal);
  });
  els.refresh?.addEventListener("click", async () => {
    try {
      const characterId = state.selectedCharacterId;
      const sessionId = state.selectedSessionId;
      await Promise.all([loadCharacters(), loadPersonas()]);
      if (characterId && state.characters.some((character) => character.id === characterId)) {
        state.selectedCharacterId = characterId;
        await loadSessions(characterId);
        if (sessionId && state.sessions.some((session) => session.id === sessionId)) {
          state.selectedSessionId = sessionId;
          await loadMessages(sessionId);
          await loadMemories(sessionId);
          showChatPage();
        } else {
          state.selectedSessionId = null;
          state.messages = [];
          state.memories = [];
          showCharacterPage();
        }
      } else {
        showLibrary();
      }
      updateChatUrl();
      renderAll();
      setLandingStatus("Local Chat refreshed.");
    } catch (error) {
      setLandingStatus(error.message || "Could not refresh Local Chat.", true);
    }
  });
  els.back?.addEventListener("click", showLibrary);
  els.chatBack?.addEventListener("click", () => {
    state.selectedSessionId = null;
    state.messages = [];
    state.memories = [];
    state.modelLog = [];
    updateChatUrl();
    showCharacterPage();
    renderAll();
  });
  els.modelLogToggle?.addEventListener("click", () => {
    state.modelLogCollapsed = !state.modelLogCollapsed;
    renderModelLog();
  });
  els.settingsOpen?.addEventListener("click", openChatSettings);
  els.settingsForm?.addEventListener("submit", saveChatSettings);
  els.replyLength?.addEventListener("input", () => {
    const index = Math.min(REPLY_LENGTH_OPTIONS.length - 1, Math.max(0, Number(els.replyLength.value || 2)));
    if (els.replyLengthLabel) els.replyLengthLabel.textContent = (REPLY_LENGTH_OPTIONS[index] || REPLY_LENGTH_OPTIONS[2]).label;
  });
  els.closeSettingsButtons.forEach((button) => button.addEventListener("click", () => closeModal(els.settingsModal)));
  els.characterGrid?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-character-id]");
    if (card) openCharacterDetail(card.dataset.characterId);
  });
  els.characterGrid?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-character-id]");
    if (!card) return;
    event.preventDefault();
    openCharacterDetail(card.dataset.characterId);
  });
  els.detailCard?.addEventListener("click", (event) => {
    const toolsButton = event.target.closest("[data-local-chat-tools]");
    if (toolsButton) {
      const isOpen = toolsButton.getAttribute("aria-expanded") === "true";
      toolsButton.setAttribute("aria-expanded", String(!isOpen));
      return;
    }
    if (event.target.closest("[data-local-chat-edit-character]")) {
      event.target.closest(".local-chat-tools-menu")?.querySelector("[data-local-chat-tools]")?.setAttribute("aria-expanded", "false");
      fillCharacterForm(selectedCharacter());
      showCharacterEditor();
      return;
    }
    if (event.target.closest("[data-local-chat-archive-character-detail]")) {
      event.target.closest(".local-chat-tools-menu")?.querySelector("[data-local-chat-tools]")?.setAttribute("aria-expanded", "false");
      archiveSelectedCharacter();
    }
  });
  els.startSession?.addEventListener("click", startSession);
  els.sessions?.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-local-chat-delete-session]");
    if (deleteButton) {
      deleteSession(deleteButton.dataset.localChatDeleteSession);
      return;
    }
    const card = event.target.closest("[data-session-id]");
    if (card) selectSession(card.dataset.sessionId);
  });
  els.sessions?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("[data-local-chat-delete-session]")) return;
    const card = event.target.closest("[data-session-id]");
    if (!card) return;
    event.preventDefault();
    selectSession(card.dataset.sessionId);
  });
  els.messages?.addEventListener("click", (event) => {
    const copyButton = event.target.closest("[data-local-chat-copy-reply]");
    if (copyButton) {
      copyReply(copyButton.dataset.localChatCopyReply);
      return;
    }
    const deleteButton = event.target.closest("[data-local-chat-delete-reply]");
    if (deleteButton) {
      rewindMessagesFrom(deleteButton.dataset.localChatDeleteReply);
      return;
    }
    const continueButton = event.target.closest("[data-local-chat-continue-reply]");
    if (continueButton) {
      continueReply(continueButton.dataset.localChatContinueReply);
    }
  });
  els.model?.addEventListener("change", () => {
    state.selectedModel = els.model.value;
    localStorage.setItem(MODEL_STORAGE_KEY, state.selectedModel);
    const session = selectedSession();
    if (session && state.selectedModel) {
      requireSupabase()
        .from("local_chat_sessions")
        .update({ model_name: state.selectedModel })
        .eq("id", session.id)
        .eq("user_id", state.user.id)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          if (data) state.sessions = state.sessions.map((item) => item.id === data.id ? data : item);
        })
        .catch((error) => setFormStatus(error.message || "Could not update session model.", true));
    }
    renderControls();
  });
  els.personaSelect?.addEventListener("change", () => {
    state.selectedPersonaId = els.personaSelect.value || "";
    renderPersonaSelect();
  });
  els.form?.addEventListener("submit", sendMessage);
  els.chatPage?.addEventListener("click", (event) => {
    const intentionalFocusTarget = event.target.closest("button, a, input, select, textarea, [role='menuitem'], [tabindex]");
    if (intentionalFocusTarget) return;
    window.setTimeout(() => focusComposer(), 0);
  });
  els.input?.addEventListener("input", () => {
    if (!els.input) return;
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(160, Math.max(44, els.input.scrollHeight))}px`;
  });
  els.input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (canSend()) els.form?.requestSubmit();
  });
  els.characterImageInput?.addEventListener("change", () => {
    const file = els.characterImageInput.files?.[0] || null;
    if (!file) {
      resetPendingCharacterImage();
      renderCharacterImageEditor(state.characters.find((character) => character.id === state.editingCharacterId) || null);
      return;
    }
    if (!file.type?.startsWith("image/")) {
      resetPendingCharacterImage();
      setDialogStatus(els.characterStatus, "Choose an image file to upload.", true);
      return;
    }

    revokePendingCharacterImagePreview();
    state.pendingCharacterImageFile = file;
    state.pendingCharacterImagePreviewUrl = URL.createObjectURL(file);
    setCharacterImagePreview({
      src: state.pendingCharacterImagePreviewUrl,
      label: file.name || "Selected image",
      showClear: true
    });
    setDialogStatus(els.characterStatus, "");
  });
  els.characterImageClear?.addEventListener("click", () => {
    resetPendingCharacterImage();
    renderCharacterImageEditor(state.characters.find((character) => character.id === state.editingCharacterId) || null);
  });
  els.characterForm?.addEventListener("submit", saveCharacter);
  els.personaForm?.addEventListener("submit", savePersona);
  els.archiveCharacter?.addEventListener("click", archiveSelectedCharacter);
  els.archivePersona?.addEventListener("click", archiveEditingPersona);
  els.closeCharacterButtons.forEach((button) => button.addEventListener("click", () => {
    resetPendingCharacterImage();
    if (state.selectedCharacterId) {
      showCharacterPage();
      updateChatUrl();
      renderAll();
    } else {
      showLibrary();
    }
  }));
  els.closePersonaButtons.forEach((button) => button.addEventListener("click", () => closeModal(els.personaModal)));
  [els.personaModal, els.settingsModal].forEach((modal) => {
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) {
        event.stopImmediatePropagation();
      }
    }, true);
  });
  els.newPersona?.addEventListener("click", () => fillPersonaForm());
  els.personaList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-persona-id]");
    if (!button) return;
    fillPersonaForm(state.personas.find((persona) => persona.id === button.dataset.personaId) || null);
  });

  initialize();
}());
