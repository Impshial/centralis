(function initSettingsPage() {
  const DEFAULT_AI_SETTINGS = {
    model: "gpt-5.6-terra",
    reasoningEffort: "high",
    verbosity: "medium"
  };

  const els = {
    tabs: Array.from(document.querySelectorAll("[data-settings-tab]")),
    panels: Array.from(document.querySelectorAll("[data-settings-panel]")),
    adminOnly: Array.from(document.querySelectorAll("[data-admin-only]")),
    form: document.querySelector("[data-ai-settings-form]"),
    model: document.querySelector("[data-settings-ai-model]"),
    effort: document.querySelector("[data-settings-ai-effort]"),
    verbosity: document.querySelector("[data-settings-ai-verbosity]"),
    reset: document.querySelector("[data-settings-ai-reset]"),
    status: document.querySelector("[data-settings-status]")
  };

  if (!els.form || !els.model || !els.effort || !els.verbosity) {
    return;
  }

  let savedSettings = { ...DEFAULT_AI_SETTINGS };
  let saving = false;
  let statusTimer = 0;
  let activeTab = "ai";

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
