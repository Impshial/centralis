(function initSettingsPage() {
  const DEFAULT_AI_SETTINGS = {
    model: "gpt-5.6-terra",
    reasoningEffort: "high",
    verbosity: "medium"
  };
  const PURGE_DATASETS = [
    { id: "universes", label: "Universes", description: "Universes, canvas records, AI Expert rows, source document records, and object image records for deleted universes/elements." },
    { id: "elements", label: "Elements", description: "Elements and dependent links, fields, expanded views, chronicle modules, and object image records." },
    { id: "element_types", label: "Custom Element Types", description: "User-created element types and their custom template definitions." },
    { id: "templates", label: "Custom Templates", description: "Custom template sections, fields, and saved field values." },
    { id: "chronicle", label: "Chronicle Sections and Fields", description: "Chronicle modules plus element field/value rows." },
    { id: "chat_repositories", label: "Chat Repositories", description: "Chat repository database rows only. iDrive HTML files remain." },
    { id: "calendars", label: "Calendars", description: "Calendars, categories, events, recurrence data, reminders, and permissions." },
    { id: "todo", label: "ToDo Tasks", description: "Tasks and subtasks." },
    { id: "source_documents", label: "Source Material Documents", description: "Source document database rows only. iDrive files remain." },
    { id: "image_generation", label: "Image Generation Sessions", description: "Sessions, messages, and asset metadata. iDrive images remain." },
    { id: "movies", label: "Movies", description: "Movies, franchises, and collections." },
    { id: "episode_roulette", label: "Episode Roulette Saved Shows", description: "Saved recent shows." },
    { id: "stellar", label: "Stellar Architect Systems", description: "Systems, stars, planets, moons, lifeforms, colonies, and colonists." },
    { id: "users", label: "Users", description: "Full account purge for selected users. The active admin is excluded from deletion." }
  ];

  const els = {
    tabs: Array.from(document.querySelectorAll("[data-settings-tab]")),
    panels: Array.from(document.querySelectorAll("[data-settings-panel]")),
    adminOnly: Array.from(document.querySelectorAll("[data-admin-only]")),
    form: document.querySelector("[data-ai-settings-form]"),
    model: document.querySelector("[data-settings-ai-model]"),
    effort: document.querySelector("[data-settings-ai-effort]"),
    verbosity: document.querySelector("[data-settings-ai-verbosity]"),
    reset: document.querySelector("[data-settings-ai-reset]"),
    status: document.querySelector("[data-settings-status]"),
    purgeOpen: document.querySelector("[data-settings-purge-open]"),
    purgeModal: document.getElementById("settings-purge-modal"),
    purgeCloseButtons: Array.from(document.querySelectorAll("[data-settings-purge-close]")),
    purgeUsers: document.querySelector("[data-settings-purge-users]"),
    purgeDatasets: document.querySelector("[data-settings-purge-datasets]"),
    purgeAllUsers: document.querySelector("[data-settings-purge-all-users]"),
    purgeAllDatasets: document.querySelector("[data-settings-purge-all-datasets]"),
    purgeConfirm: document.querySelector("[data-settings-purge-confirm]"),
    purgeSubmit: document.querySelector("[data-settings-purge-submit]"),
    purgeStatus: document.querySelector("[data-settings-purge-status]")
  };

  if (!els.form || !els.model || !els.effort || !els.verbosity) {
    return;
  }

  let savedSettings = { ...DEFAULT_AI_SETTINGS };
  let saving = false;
  let statusTimer = 0;
  let activeTab = "ai";
  let purgeUsers = [];
  let purgeLoaded = false;
  let purgeBusy = false;

  const settingsSupabase = window.supabase && window.CENTRALIS_SUPABASE_CONFIG
    ? window.supabase.createClient(
      window.CENTRALIS_SUPABASE_CONFIG.url,
      window.CENTRALIS_SUPABASE_CONFIG.publishableKey
    )
    : null;

  function getReadableError(error) {
    return error?.message || "Could not save AI settings.";
  }

  function normalizeSettings(settings = {}) {
    const modelValues = Array.from(els.model.options).map((option) => option.value);
    const effortValues = Array.from(els.effort.options).map((option) => option.value);
    const verbosityValues = Array.from(els.verbosity.options).map((option) => option.value);
    return {
      model: modelValues.includes(settings.ai_model || settings.model)
        ? (settings.ai_model || settings.model)
        : DEFAULT_AI_SETTINGS.model,
      reasoningEffort: effortValues.includes(settings.ai_reasoning_effort || settings.reasoningEffort)
        ? (settings.ai_reasoning_effort || settings.reasoningEffort)
        : DEFAULT_AI_SETTINGS.reasoningEffort,
      verbosity: verbosityValues.includes(settings.ai_verbosity || settings.verbosity)
        ? (settings.ai_verbosity || settings.verbosity)
        : DEFAULT_AI_SETTINGS.verbosity
    };
  }

  function applySettings(settings) {
    const normalized = normalizeSettings(settings);
    els.model.value = normalized.model;
    els.effort.value = normalized.reasoningEffort;
    els.verbosity.value = normalized.verbosity;
    return normalized;
  }

  function getFormSettings() {
    return {
      model: els.model.value,
      reasoningEffort: els.effort.value,
      verbosity: els.verbosity.value
    };
  }

  function setStatus(message = "", kind = "") {
    window.clearTimeout(statusTimer);
    els.status.textContent = message;
    els.status.classList.toggle("is-error", kind === "error");
    els.status.classList.toggle("is-success", kind === "success");
    if (kind === "success") {
      statusTimer = window.setTimeout(() => setStatus(""), 2200);
    }
  }

  function setPurgeStatus(message = "", kind = "") {
    if (!els.purgeStatus) return;
    els.purgeStatus.textContent = message;
    els.purgeStatus.classList.toggle("is-error", kind === "error");
    els.purgeStatus.classList.toggle("is-success", kind === "success");
  }

  function setSaving(isSaving) {
    saving = isSaving;
    [els.model, els.effort, els.verbosity, els.reset].forEach((control) => {
      control.disabled = isSaving;
    });
  }

  function activateTab(tabName) {
    const tab = els.tabs.find((candidate) => candidate.dataset.settingsTab === tabName);
    if (!tab || tab.hidden) {
      tabName = "ai";
    }

    activeTab = tabName;
    els.tabs.forEach((tab) => {
      const isActive = tab.dataset.settingsTab === tabName;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    els.panels.forEach((panel) => {
      const isActive = panel.dataset.settingsPanel === tabName;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  }

  function syncAdminVisibility(user = window.centralisCurrentAppUser) {
    const isAdmin = user?.admin === true;
    els.adminOnly.forEach((element) => {
      element.hidden = !isAdmin;
    });

    if (!isAdmin && activeTab === "database") {
      activeTab = "ai";
    }

    activateTab(activeTab);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getSelectedUserIds() {
    if (els.purgeAllUsers?.checked) return [];
    return Array.from(els.purgeUsers?.querySelectorAll("[data-settings-purge-user]:checked") || [])
      .map((input) => Number(input.value))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  function getSelectedDatasets() {
    return Array.from(els.purgeDatasets?.querySelectorAll("[data-settings-purge-dataset]:checked") || [])
      .map((input) => input.value);
  }

  function isUsersDatasetSelected() {
    return getSelectedDatasets().includes("users");
  }

  function renderPurgeDatasets() {
    if (!els.purgeDatasets) return;
    els.purgeDatasets.innerHTML = PURGE_DATASETS.map((dataset) => `
      <label class="settings-purge-row">
        <input type="checkbox" value="${escapeHtml(dataset.id)}" data-settings-purge-dataset>
        <span class="settings-purge-row-main">
          <strong>${escapeHtml(dataset.label)}</strong>
          <span>${escapeHtml(dataset.description)}</span>
        </span>
      </label>
    `).join("");
  }

  function renderPurgeUsers() {
    if (!els.purgeUsers) return;
    if (!purgeUsers.length) {
      els.purgeUsers.innerHTML = '<p class="settings-purge-empty">No users found.</p>';
      return;
    }

    const disableCurrentAdmin = isUsersDatasetSelected();
    els.purgeUsers.innerHTML = purgeUsers.map((user) => {
      const isCurrent = user.is_current_user === true;
      const disabled = isCurrent && disableCurrentAdmin;
      const name = user.display_name || user.email || `User ${user.id}`;
      const subtitle = [
        user.email && user.display_name ? user.email : "",
        user.admin ? "Admin" : "",
        isCurrent ? "Current user" : "",
      ].filter(Boolean).join(" / ");
      return `
        <label class="settings-purge-row ${disabled ? "is-disabled" : ""}">
          <input type="checkbox" value="${escapeHtml(user.id)}" data-settings-purge-user ${isCurrent ? 'data-current-user="true"' : ""} ${disabled ? "disabled" : ""}>
          <span class="settings-purge-row-main">
            <strong>${escapeHtml(name)}</strong>
            ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
            ${isCurrent ? '<em class="settings-purge-badge">Protected from user deletion</em>' : ""}
          </span>
        </label>
      `;
    }).join("");
  }

  function syncPurgeAllDatasets() {
    if (!els.purgeAllDatasets || !els.purgeDatasets) return;
    const datasetInputs = Array.from(els.purgeDatasets.querySelectorAll("[data-settings-purge-dataset]"));
    const checkedCount = datasetInputs.filter((input) => input.checked).length;
    els.purgeAllDatasets.checked = datasetInputs.length > 0 && checkedCount === datasetInputs.length;
    els.purgeAllDatasets.indeterminate = checkedCount > 0 && checkedCount < datasetInputs.length;
  }

  function syncPurgeAllUsers() {
    if (!els.purgeAllUsers || !els.purgeUsers) return;
    const userInputs = Array.from(els.purgeUsers.querySelectorAll("[data-settings-purge-user]:not(:disabled)"));
    const checkedCount = userInputs.filter((input) => input.checked).length;
    els.purgeAllUsers.checked = userInputs.length > 0 && checkedCount === userInputs.length;
    els.purgeAllUsers.indeterminate = checkedCount > 0 && checkedCount < userInputs.length;
  }

  function syncPurgeSubmit() {
    if (!els.purgeSubmit) return;
    const hasUsers = els.purgeAllUsers?.checked || getSelectedUserIds().length > 0;
    const hasDatasets = getSelectedDatasets().length > 0;
    const confirmed = els.purgeConfirm?.value.trim() === "PURGE";
    els.purgeSubmit.disabled = purgeBusy || !hasUsers || !hasDatasets || !confirmed;
  }

  function syncPurgeControls() {
    if (isUsersDatasetSelected()) {
      const currentUserInput = els.purgeUsers?.querySelector("[data-settings-purge-user][data-current-user='true']");
      if (currentUserInput) {
        currentUserInput.checked = false;
        currentUserInput.disabled = true;
      }
    }
    syncPurgeAllDatasets();
    syncPurgeAllUsers();
    syncPurgeSubmit();
  }

  async function loadPurgeUsers({ force = false } = {}) {
    if ((purgeLoaded && !force) || (purgeBusy && !force) || !settingsSupabase) return;
    purgeBusy = true;
    setPurgeStatus("Loading users...");
    syncPurgeSubmit();
    try {
      const { data, error } = await settingsSupabase.functions.invoke("list-admin-purge-users", { body: {} });
      if (error) throw error;
      purgeUsers = Array.isArray(data?.users) ? data.users : [];
      purgeLoaded = true;
      setPurgeStatus("");
      renderPurgeUsers();
    } catch (error) {
      setPurgeStatus(getReadableError(error), "error");
      if (els.purgeUsers) els.purgeUsers.innerHTML = '<p class="settings-purge-empty">Could not load users.</p>';
    } finally {
      purgeBusy = false;
      syncPurgeControls();
    }
  }

  function resetPurgeForm() {
    els.purgeConfirm && (els.purgeConfirm.value = "");
    els.purgeAllUsers && (els.purgeAllUsers.checked = false, els.purgeAllUsers.indeterminate = false);
    els.purgeAllDatasets && (els.purgeAllDatasets.checked = false, els.purgeAllDatasets.indeterminate = false);
    els.purgeDatasets?.querySelectorAll("[data-settings-purge-dataset]").forEach((input) => { input.checked = false; });
    els.purgeUsers?.querySelectorAll("[data-settings-purge-user]").forEach((input) => {
      input.checked = false;
      input.disabled = false;
    });
    setPurgeStatus("");
    renderPurgeUsers();
    syncPurgeControls();
  }

  async function openPurgeDialog() {
    if (!els.purgeModal) return;
    resetPurgeForm();
    window.openModal ? window.openModal(els.purgeModal) : (els.purgeModal.hidden = false);
    await loadPurgeUsers();
    syncPurgeControls();
  }

  function closePurgeDialog() {
    if (!els.purgeModal) return;
    window.closeModal ? window.closeModal() : (els.purgeModal.hidden = true);
  }

  async function submitPurge() {
    if (purgeBusy || !settingsSupabase) return;
    const datasets = getSelectedDatasets();
    const allUsers = els.purgeAllUsers?.checked === true;
    const userIds = getSelectedUserIds();
    if (!allUsers && !userIds.length) return setPurgeStatus("Select at least one user.", "error");
    if (!datasets.length) return setPurgeStatus("Select at least one dataset.", "error");
    if (els.purgeConfirm?.value.trim() !== "PURGE") return setPurgeStatus("Type PURGE to confirm.", "error");
    if (!window.confirm("Purge selected database records? This cannot be undone.")) return;

    purgeBusy = true;
    setPurgeStatus("Purging selected database records...");
    syncPurgeSubmit();
    try {
      const { data, error } = await settingsSupabase.functions.invoke("purge-admin-data", {
        body: {
          allUsers,
          userIds,
          datasets,
          confirmation: els.purgeConfirm.value.trim()
        }
      });
      if (error) throw error;
      const counts = data?.counts || {};
      const total = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
      purgeLoaded = false;
      purgeBusy = false;
      await loadPurgeUsers({ force: true });
      setPurgeStatus(`Purge complete. ${total} database rows deleted.`, "success");
      syncPurgeControls();
    } catch (error) {
      setPurgeStatus(getReadableError(error), "error");
    } finally {
      purgeBusy = false;
      syncPurgeSubmit();
    }
  }

  async function saveSettings() {
    if (saving) return;

    const nextSettings = getFormSettings();
    const previousSettings = { ...savedSettings };
    setSaving(true);
    setStatus("Saving AI settings...");

    try {
      const update = await window.centralisUpdateUserSettings({
        ai_model: nextSettings.model,
        ai_reasoning_effort: nextSettings.reasoningEffort,
        ai_verbosity: nextSettings.verbosity
      });
      savedSettings = applySettings(update);
      setStatus("AI settings saved.", "success");
    } catch (error) {
      savedSettings = applySettings(previousSettings);
      setStatus(getReadableError(error), "error");
    } finally {
      setSaving(false);
    }
  }

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.settingsTab));
  });

  [els.model, els.effort, els.verbosity].forEach((control) => {
    control.addEventListener("change", saveSettings);
  });

  els.reset.addEventListener("click", () => {
    applySettings(DEFAULT_AI_SETTINGS);
    saveSettings();
  });

  renderPurgeDatasets();
  els.purgeOpen?.addEventListener("click", openPurgeDialog);
  els.purgeCloseButtons.forEach((button) => button.addEventListener("click", closePurgeDialog));
  els.purgeAllDatasets?.addEventListener("change", () => {
    const checked = els.purgeAllDatasets.checked;
    els.purgeDatasets?.querySelectorAll("[data-settings-purge-dataset]").forEach((input) => { input.checked = checked; });
    renderPurgeUsers();
    syncPurgeControls();
  });
  els.purgeAllUsers?.addEventListener("change", () => {
    const checked = els.purgeAllUsers.checked;
    els.purgeUsers?.querySelectorAll("[data-settings-purge-user]:not(:disabled)").forEach((input) => { input.checked = checked; });
    syncPurgeControls();
  });
  els.purgeDatasets?.addEventListener("change", () => {
    const selectedUserIds = new Set(getSelectedUserIds());
    renderPurgeUsers();
    els.purgeUsers?.querySelectorAll("[data-settings-purge-user]").forEach((input) => {
      input.checked = selectedUserIds.has(Number(input.value)) && !input.disabled;
    });
    syncPurgeControls();
  });
  els.purgeUsers?.addEventListener("change", syncPurgeControls);
  els.purgeConfirm?.addEventListener("input", syncPurgeSubmit);
  els.purgeSubmit?.addEventListener("click", submitPurge);

  window.addEventListener("centralis:user-settings-changed", (event) => {
    if (saving || !event.detail?.settings) return;
    savedSettings = applySettings(event.detail.settings);
  });

  window.addEventListener("centralis:current-user-changed", (event) => {
    syncAdminVisibility(event.detail?.user || null);
  });

  (async () => {
    syncAdminVisibility();
    setSaving(true);
    setStatus("Loading AI settings...");
    try {
      const appUser = await window.centralisGetCurrentAppUser?.();
      syncAdminVisibility(appUser);
      const settings = await window.centralisGetUserSettings();
      savedSettings = applySettings(settings || DEFAULT_AI_SETTINGS);
      setStatus("");
    } catch (error) {
      savedSettings = applySettings(DEFAULT_AI_SETTINGS);
      setStatus(getReadableError(error), "error");
    } finally {
      setSaving(false);
    }
  })();
})();
