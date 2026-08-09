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
    { id: "roleplayer", label: "Roleplayer", description: "Characters, personas, sessions, messages, and memories." },
    { id: "god_engine", label: "God Engine Evolutions", description: "Evolution worlds, species, and evolution events." },
    { id: "arc_studio", label: "Arc Studio Projects", description: "Projects, story units, threads, character arcs, links, states, and diagnostics." },
    { id: "fusion", label: "Fusion Games", description: "Saved games, starting items, generated discoveries, and canvas positions. The level 0 master list remains." },
    { id: "listmaker", label: "ListMaker Lists", description: "Lists, items, categories, statuses, custom fields, and field values." },
    { id: "generation_jobs", label: "Generation Jobs", description: "Background generation job records across modules." },
    { id: "movies", label: "Movies", description: "Movies, franchises, and collections." },
    { id: "episode_roulette", label: "Episode Roulette Saved Shows", description: "Saved recent shows." },
    { id: "stellar", label: "Stellar Architect Systems", description: "Systems, stars, planets, moons, lifeforms, colonies, and colonists." },
    { id: "users", label: "Users", description: "Full account purge for selected users. Disabled when the active admin is selected." }
  ];
  const PURGE_COUNT_GROUPS = [
    { id: "user_account", label: "User Account" },
    ...PURGE_DATASETS.filter((dataset) => dataset.id !== "users").map((dataset) => ({
      id: dataset.id,
      label: dataset.label
    }))
  ];
  const ACTIVITY_MODULES = [
    { id: "user_account", label: "User Account" },
    { id: "universes", label: "Universes" },
    { id: "elements", label: "Elements" },
    { id: "element_types", label: "Custom Element Types" },
    { id: "templates", label: "Custom Templates" },
    { id: "chronicle", label: "Chronicle" },
    { id: "chat_repositories", label: "Chat Repositories" },
    { id: "calendars", label: "Calendars" },
    { id: "todo", label: "ToDo" },
    { id: "source_documents", label: "Source Material" },
    { id: "image_generation", label: "Image Generation" },
    { id: "roleplayer", label: "Roleplayer" },
    { id: "god_engine", label: "God Engine" },
    { id: "arc_studio", label: "Arc Studio" },
    { id: "fusion", label: "Fusion" },
    { id: "listmaker", label: "ListMaker" },
    { id: "generation_jobs", label: "Generation Jobs" },
    { id: "movies", label: "Movies" },
    { id: "episode_roulette", label: "Episode Roulette" },
    { id: "stellar", label: "Stellar Architect" }
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
    purgeStatus: document.querySelector("[data-settings-purge-status]"),
    activityOpen: document.querySelector("[data-settings-activity-open]"),
    activityModal: document.getElementById("settings-activity-modal"),
    activityCloseButtons: Array.from(document.querySelectorAll("[data-settings-activity-close]")),
    activityRefresh: document.querySelector("[data-settings-activity-refresh]"),
    activityUsers: document.querySelector("[data-settings-activity-users]"),
    activityDetails: document.querySelector("[data-settings-activity-details]"),
    activityStatus: document.querySelector("[data-settings-activity-status]")
  };

  if (!els.form || !els.model || !els.effort || !els.verbosity) {
    return;
  }

  let savedSettings = { ...DEFAULT_AI_SETTINGS };
  let saving = false;
  let statusTimer = 0;
  let activeTab = "appearance";
  let purgeUsers = [];
  let purgeLoaded = false;
  let purgeBusy = false;
  let purgeActingUserId = null;
  let activityUsers = [];
  let activityLoaded = false;
  let activityBusy = false;
  let selectedActivityUserId = null;

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

  function setActivityStatus(message = "", kind = "") {
    if (!els.activityStatus) return;
    els.activityStatus.textContent = message;
    els.activityStatus.classList.toggle("is-error", kind === "error");
    els.activityStatus.classList.toggle("is-success", kind === "success");
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
      tabName = "appearance";
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

  function getActingPurgeUserId() {
    const fromList = purgeUsers.find((user) => user.is_current_user === true)?.id;
    const id = Number(purgeActingUserId || fromList);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function isActingPurgeUserSelected() {
    if (els.purgeAllUsers?.checked) return true;
    const actingUserId = getActingPurgeUserId();
    if (!actingUserId) return false;
    return getSelectedUserIds().includes(actingUserId);
  }

  function formatObjectCount(value) {
    const count = Number(value) || 0;
    return `${count.toLocaleString()} ${count === 1 ? "object" : "objects"}`;
  }

  function formatDateTime(value) {
    if (!value) return "No activity yet";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No activity yet";
    return date.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short"
    });
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

    els.purgeUsers.innerHTML = purgeUsers.map((user) => {
      const email = user.email || `User ${user.id}`;
      const total = Number(user.object_total) || 0;
      const counts = user.object_counts || {};
      const subtitle = [
        user.display_name || "",
        user.is_current_user ? "Current Admin" : "",
        user.admin ? "Admin" : "",
      ].filter(Boolean).join(" / ");
      const countRows = PURGE_COUNT_GROUPS.map((group) => {
        const count = Number(counts[group.id]) || 0;
        return `
          <div class="settings-purge-user-count-row">
            <dt>${escapeHtml(group.label)}</dt>
            <dd>${escapeHtml(formatObjectCount(count))}</dd>
          </div>
        `;
      }).join("");
      return `
        <details class="settings-purge-user-row">
          <summary>
            <input type="checkbox" value="${escapeHtml(user.id)}" data-settings-purge-user aria-label="Select ${escapeHtml(email)}">
            <span class="settings-purge-row-main">
              <strong>${escapeHtml(email)} - ${escapeHtml(formatObjectCount(total))}</strong>
              ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
            </span>
            <span class="settings-purge-user-toggle" aria-hidden="true"></span>
          </summary>
          <dl class="settings-purge-user-counts">
            ${countRows}
          </dl>
        </details>
      `;
    }).join("");
  }

  function syncPurgeAllDatasets() {
    if (!els.purgeAllDatasets || !els.purgeDatasets) return;
    const datasetInputs = Array.from(els.purgeDatasets.querySelectorAll("[data-settings-purge-dataset]:not(:disabled)"));
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

  function syncPurgeUsersDatasetGuard() {
    const usersDataset = els.purgeDatasets?.querySelector('[data-settings-purge-dataset][value="users"]');
    if (!usersDataset) return;

    const shouldDisable = isActingPurgeUserSelected();
    usersDataset.disabled = shouldDisable;
    if (shouldDisable) {
      usersDataset.checked = false;
    }

    const row = usersDataset.closest(".settings-purge-row");
    row?.classList.toggle("is-disabled", shouldDisable);
    row?.toggleAttribute("aria-disabled", shouldDisable);
    if (shouldDisable) {
      row?.setAttribute("title", "The active admin can purge their own data, but cannot delete their own user account.");
    } else {
      row?.removeAttribute("title");
    }
  }

  function syncPurgeControls() {
    syncPurgeUsersDatasetGuard();
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
      const { data, error } = await settingsSupabase.rpc("list_admin_purge_users");
      if (error) throw error;
      purgeActingUserId = Number(data?.actingUserId) || null;
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

  function clearPurgeSelections() {
    els.purgeConfirm && (els.purgeConfirm.value = "");
    els.purgeAllUsers && (els.purgeAllUsers.checked = false, els.purgeAllUsers.indeterminate = false);
    els.purgeAllDatasets && (els.purgeAllDatasets.checked = false, els.purgeAllDatasets.indeterminate = false);
    els.purgeDatasets?.querySelectorAll("[data-settings-purge-dataset]").forEach((input) => { input.checked = false; });
    els.purgeUsers?.querySelectorAll("[data-settings-purge-user]").forEach((input) => {
      input.checked = false;
      input.disabled = false;
    });
    renderPurgeUsers();
    syncPurgeControls();
  }

  function resetPurgeForm() {
    clearPurgeSelections();
    setPurgeStatus("");
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
      const { data, error } = await settingsSupabase.rpc("admin_purge_data_for_current_user", {
        p_all_users: allUsers,
        p_user_ids: userIds,
        p_datasets: datasets,
        p_confirmation: els.purgeConfirm.value.trim()
      });
      if (error) throw error;
      const counts = data?.counts || {};
      const total = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
      purgeLoaded = false;
      purgeBusy = false;
      await loadPurgeUsers({ force: true });
      clearPurgeSelections();
      setPurgeStatus(`Purge complete. ${total} database rows deleted.`, "success");
      syncPurgeControls();
    } catch (error) {
      setPurgeStatus(getReadableError(error), "error");
    } finally {
      purgeBusy = false;
      syncPurgeSubmit();
    }
  }

  function getSelectedActivityUser() {
    return activityUsers.find((user) => String(user.id) === String(selectedActivityUserId)) || null;
  }

  function renderActivityUsers() {
    if (!els.activityUsers) return;
    if (!activityUsers.length) {
      els.activityUsers.innerHTML = '<p class="settings-activity-empty">No users found.</p>';
      return;
    }

    els.activityUsers.innerHTML = activityUsers.map((user) => {
      const isSelected = String(user.id) === String(selectedActivityUserId);
      const email = user.email || `User ${user.id}`;
      const subtitle = user.display_name || "";
      const badges = [
        user.is_current_user ? "Current" : "",
        user.admin ? "Admin" : ""
      ].filter(Boolean);
      const badgesHtml = badges.length
        ? `<span class="settings-activity-user-badges">${badges.map((badge) => `<span class="settings-activity-badge">${escapeHtml(badge)}</span>`).join("")}</span>`
        : "";
      return `
        <button class="settings-activity-user-row ${isSelected ? "is-active" : ""}" type="button" data-settings-activity-user-id="${escapeHtml(user.id)}">
          <span class="settings-activity-user-main">
            <strong>${escapeHtml(email)}</strong>
            ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
          </span>
          <span class="settings-activity-user-total">${escapeHtml(formatObjectCount(user.object_total))}</span>
          ${badgesHtml}
        </button>
      `;
    }).join("");
  }

  function renderActivityDetails() {
    if (!els.activityDetails) return;
    const user = getSelectedActivityUser();
    if (!user) {
      els.activityDetails.innerHTML = `<p class="settings-activity-empty">${activityLoaded && !activityUsers.length ? "No users found." : "Select a user to view activity."}</p>`;
      return;
    }

    const modules = Array.isArray(user.modules) ? user.modules : [];
    const objectCounts = user.object_counts && typeof user.object_counts === "object" ? user.object_counts : {};
    const moduleById = new Map(modules.map((module) => [module.id, module]));
    const orderedModules = [
      ...ACTIVITY_MODULES,
      ...modules
        .filter((module) => module?.id && !ACTIVITY_MODULES.some((knownModule) => knownModule.id === module.id))
        .map((module) => ({ id: module.id, label: module.label || module.id }))
    ];
    els.activityDetails.innerHTML = `
      <header class="settings-activity-detail-header">
        <div>
          <p class="settings-panel-eyebrow">Selected User</p>
          <h3>${escapeHtml(user.email || `User ${user.id}`)}</h3>
          ${user.display_name ? `<p>${escapeHtml(user.display_name)}</p>` : ""}
        </div>
        <dl class="settings-activity-summary">
          <div>
            <dt>Total Objects</dt>
            <dd>${escapeHtml(formatObjectCount(user.object_total))}</dd>
          </div>
          <div>
            <dt>Latest Activity</dt>
            <dd>${escapeHtml(formatDateTime(user.last_activity_at))}</dd>
          </div>
        </dl>
      </header>
      <div class="settings-activity-module-list">
        ${orderedModules.map((module) => {
          const activity = moduleById.get(module.id) || {};
          const count = Number(activity.count ?? objectCounts[module.id]) || 0;
          return `
            <article class="settings-activity-module-row">
              <div>
                <h4>${escapeHtml(module.label)}</h4>
                <p>${escapeHtml(count > 0 ? formatDateTime(activity.latest_activity_at) : "No activity yet")}</p>
              </div>
              <strong>${escapeHtml(formatObjectCount(count))}</strong>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  async function loadUserActivity({ force = false } = {}) {
    if ((activityLoaded && !force) || activityBusy || !settingsSupabase) return;
    activityBusy = true;
    if (els.activityRefresh) els.activityRefresh.disabled = true;
    setActivityStatus("Loading user activity...");
    try {
      const { data, error } = await settingsSupabase.rpc("list_admin_user_activity");
      if (error) throw error;
      activityUsers = Array.isArray(data?.users) ? data.users : [];
      activityLoaded = true;
      if (!activityUsers.some((user) => String(user.id) === String(selectedActivityUserId))) {
        selectedActivityUserId = activityUsers[0]?.id ?? null;
      }
      renderActivityUsers();
      renderActivityDetails();
      setActivityStatus(`Updated ${formatDateTime(data?.generatedAt)}.`, "success");
    } catch (error) {
      setActivityStatus(getReadableError(error), "error");
      if (els.activityUsers) els.activityUsers.innerHTML = '<p class="settings-activity-empty">Could not load users.</p>';
      if (els.activityDetails) els.activityDetails.innerHTML = '<p class="settings-activity-empty">Could not load user activity.</p>';
    } finally {
      activityBusy = false;
      if (els.activityRefresh) els.activityRefresh.disabled = false;
    }
  }

  async function openActivityDialog() {
    if (!els.activityModal) return;
    setActivityStatus("");
    window.openModal ? window.openModal(els.activityModal) : (els.activityModal.hidden = false);
    await loadUserActivity();
  }

  function closeActivityDialog() {
    if (!els.activityModal) return;
    window.closeModal ? window.closeModal() : (els.activityModal.hidden = true);
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
    els.purgeDatasets?.querySelectorAll("[data-settings-purge-dataset]:not(:disabled)").forEach((input) => { input.checked = checked; });
    syncPurgeControls();
  });
  els.purgeAllUsers?.addEventListener("change", () => {
    const checked = els.purgeAllUsers.checked;
    els.purgeUsers?.querySelectorAll("[data-settings-purge-user]:not(:disabled)").forEach((input) => { input.checked = checked; });
    syncPurgeControls();
  });
  els.purgeDatasets?.addEventListener("change", syncPurgeControls);
  els.purgeUsers?.addEventListener("change", syncPurgeControls);
  els.purgeUsers?.addEventListener("click", (event) => {
    if (event.target?.matches("[data-settings-purge-user]")) {
      event.stopPropagation();
    }
  });
  els.purgeConfirm?.addEventListener("input", syncPurgeSubmit);
  els.purgeSubmit?.addEventListener("click", submitPurge);
  els.activityOpen?.addEventListener("click", openActivityDialog);
  els.activityCloseButtons.forEach((button) => button.addEventListener("click", closeActivityDialog));
  els.activityRefresh?.addEventListener("click", () => loadUserActivity({ force: true }));
  els.activityUsers?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-settings-activity-user-id]");
    if (!row) return;
    selectedActivityUserId = row.dataset.settingsActivityUserId;
    renderActivityUsers();
    renderActivityDetails();
  });

  window.addEventListener("centralis:user-settings-changed", (event) => {
    if (!event.detail?.settings) return;
    if (!saving) {
      savedSettings = applySettings(event.detail.settings);
    }
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
