(() => {
  const supabase = window.centralisSupabase;
  if (!supabase) return;

  const TABLES = {
    lists: "listmaker_lists",
    items: "listmaker_items",
    categories: "listmaker_categories",
    statuses: "listmaker_statuses",
    fields: "listmaker_fields",
    values: "listmaker_field_values",
  };

  const FIELD_TYPES = [
    ["text", "Text"],
    ["number", "Number"],
    ["checkbox", "Checkbox"],
    ["date", "Date"],
    ["dropdown", "Dropdown"],
    ["long_text", "Long Text"],
  ];

  const RATING_TYPES = [
    ["", "No rating"],
    ["stars_5", "1-5 Stars"],
    ["number_10", "1-10"],
    ["percentage", "Percentage"],
    ["thumbs", "Thumbs Up / Down"],
  ];

  const BASE_STATUSES = [
    { name: "Idea", color: "#8b5cf6" },
    { name: "Considering", color: "#0ea5e9" },
    { name: "Selected", color: "#22c55e" },
    { name: "Rejected", color: "#ef4444" },
  ];

  const TEMPLATES = [
    { key: "blank", name: "Blank List", description: "A simple empty list.", behaviors: {}, fields: [] },
    { key: "checklist", name: "Checklist", description: "Completion checkboxes for each item.", behaviors: { checklist: true }, fields: [] },
    { key: "ranked", name: "Ranked List", description: "Explicit manual ranking controls.", behaviors: { ranked: true }, fields: [] },
    { key: "scored", name: "Scored List", description: "Numeric score on each item.", behaviors: { scored: true }, fields: [] },
    { key: "categorized", name: "Categorized List", description: "Sections for grouping items.", behaviors: { categorized: true }, categories: ["Uncategorized"], fields: [] },
    { key: "pros-cons", name: "Pros & Cons", description: "Two categories for evaluation.", behaviors: { categorized: true }, categories: ["Pros", "Cons"], fields: [] },
    { key: "inventory", name: "Inventory", description: "Track quantities and notes.", behaviors: {}, fields: [{ name: "Quantity", field_type: "number" }, { name: "Notes", field_type: "long_text" }] },
    { key: "comparison", name: "Comparison", description: "Compare items across fields.", behaviors: { scored: true }, rating_type: "stars_5", fields: [{ name: "Price", field_type: "number" }, { name: "Notes", field_type: "long_text" }] },
    { key: "shopping", name: "Shopping List", description: "Checklist with quantities.", behaviors: { checklist: true }, fields: [{ name: "Quantity", field_type: "number" }] },
    { key: "packing", name: "Packing List", description: "Categorized checklist.", behaviors: { checklist: true, categorized: true }, categories: ["Clothing", "Toiletries", "Gear", "Documents"], fields: [] },
    { key: "favorites", name: "Favorites", description: "Ranked list with ratings.", behaviors: { ranked: true }, rating_type: "stars_5", fields: [] },
    { key: "brainstorm", name: "Brainstorm", description: "Fast capture list.", behaviors: {}, fields: [{ name: "Notes", field_type: "long_text" }] },
  ];

  const state = {
    user: null,
    mode: "home",
    homeFilter: "active",
    homeSearch: "",
    lists: [],
    itemCounts: new Map(),
    listId: new URLSearchParams(window.location.search).get("list") || "",
    list: null,
    items: [],
    categories: [],
    statuses: [],
    fields: [],
    values: [],
    selectedIds: new Set(),
    pendingCategoryMoveIds: [],
    collapsedVirtualCategories: new Set(),
    search: "",
    sort: localStorage.getItem("listmaker.sort") || "manual",
    filter: "",
    view: localStorage.getItem("listmaker.view") || "list",
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("click", handleDocumentClick);
  window.addEventListener("keydown", handleGlobalKeydown);

  function bindDom() {
    dom.home = document.querySelector("[data-listmaker-home]");
    dom.editor = document.querySelector("[data-listmaker-editor]");
    dom.homeSearch = document.querySelector("[data-listmaker-home-search]");
    dom.homeStatus = document.querySelector("[data-listmaker-home-status]");
    dom.homeTabs = [...document.querySelectorAll("[data-listmaker-home-filter]")];
    dom.listGrid = document.querySelector("[data-listmaker-list-grid]");
    dom.createModal = document.getElementById("listmaker-create-modal");
    dom.createForm = document.querySelector("[data-listmaker-create-form]");
    dom.settingsModal = document.getElementById("listmaker-settings-modal");
    dom.settingsForm = document.querySelector("[data-listmaker-settings-form]");
    dom.ioModal = document.getElementById("listmaker-io-modal");
    dom.ioTitle = document.querySelector("[data-listmaker-io-title]");
    dom.ioContent = document.querySelector("[data-listmaker-io-content]");
    dom.categoryModal = document.getElementById("listmaker-category-modal");
    dom.categoryForm = document.querySelector("[data-listmaker-category-form]");
    dom.categorySelect = document.querySelector("[data-listmaker-category-select]");
    dom.categoryStatus = document.querySelector("[data-listmaker-category-status]");
    dom.categoryManagerModal = document.getElementById("listmaker-category-manager-modal");
    dom.categoryManagerForm = document.querySelector("[data-listmaker-category-manager-form]");
    dom.contextMenu = document.querySelector("[data-listmaker-context-menu]");
    dom.titleInput = document.querySelector("[data-listmaker-title-input]");
    dom.descriptionDisplay = document.querySelector("[data-listmaker-description-display]");
    dom.addForm = document.querySelector("[data-listmaker-add-form]");
    dom.addInput = document.querySelector("[data-listmaker-add-input]");
    dom.addCategory = document.querySelector("[data-listmaker-add-category]");
    dom.itemSearch = document.querySelector("[data-listmaker-item-search]");
    dom.sort = document.querySelector("[data-listmaker-sort]");
    dom.filter = document.querySelector("[data-listmaker-filter]");
    dom.items = document.querySelector("[data-listmaker-items]");
    dom.editorStatus = document.querySelector("[data-listmaker-editor-status]");
    dom.bulkBar = document.querySelector("[data-listmaker-bulk-bar]");
  }

  function redirectLegacyEditorUrl() {
    if (state.listId && !dom.editor && location.pathname.toLowerCase().endsWith("/listmaker.html")) {
      window.location.replace(`listmaker-list.html?list=${encodeURIComponent(state.listId)}`);
    }
  }

  async function init() {
    bindDom();
    redirectLegacyEditorUrl();
    if (state.listId && !dom.editor && location.pathname.toLowerCase().endsWith("/listmaker.html")) return;
    bindEvents();
    try {
      await waitForAuth();
      state.user = await window.centralisGetCurrentAppUser();
      if (!state.user?.id) return;
      state.mode = state.listId ? "editor" : "home";
      if (state.mode === "editor" && !dom.editor) {
        window.location.replace(`listmaker-list.html?list=${encodeURIComponent(state.listId)}`);
        return;
      }
      if (state.mode === "home" && !dom.home) {
        window.location.replace("listmaker.html");
        return;
      }
      renderShellMode();
      if (state.mode === "editor") {
        await loadList();
        renderEditor();
      } else {
        await loadHome();
        renderHome();
      }
    } catch (error) {
      setStatus(state.mode === "editor" ? dom.editorStatus : dom.homeStatus, `Could not load ListMaker: ${readableError(error)}`, "error");
    }
  }

  function bindEvents() {
    document.querySelectorAll("[data-listmaker-create-open]").forEach((button) => button.addEventListener("click", openCreateModal));
    document.querySelector("[data-listmaker-create-close]")?.addEventListener("click", closeCreateModal);
    document.querySelector("[data-listmaker-settings-open]")?.addEventListener("click", openSettingsModal);
    document.querySelector("[data-listmaker-settings-close]")?.addEventListener("click", closeSettingsModal);
    document.querySelector("[data-listmaker-import-open]")?.addEventListener("click", () => openIoModal("import"));
    document.querySelector("[data-listmaker-export-open]")?.addEventListener("click", () => openIoModal("export"));
    document.querySelector("[data-listmaker-io-close]")?.addEventListener("click", closeIoModal);
    document.querySelectorAll("[data-listmaker-category-close]").forEach((button) => button.addEventListener("click", closeCategoryModal));
    document.querySelector("[data-listmaker-category-manager-close]")?.addEventListener("click", closeCategoryManagerModal);
    dom.homeSearch?.addEventListener("input", () => {
      state.homeSearch = dom.homeSearch.value.trim().toLowerCase();
      renderHome();
    });
    dom.homeTabs.forEach((button) => button.addEventListener("click", async () => {
      state.homeFilter = button.dataset.listmakerHomeFilter || "active";
      await loadHome();
      renderHome();
    }));
    dom.createForm?.addEventListener("submit", handleCreateList);
    dom.createForm?.addEventListener("change", handleCreateFormChange);
    dom.createForm?.addEventListener("click", handleCreateFormClick);
    dom.settingsForm?.addEventListener("submit", handleSettingsSubmit);
    dom.settingsForm?.addEventListener("click", handleSettingsClick);
    dom.settingsForm?.addEventListener("change", handleSettingsChange);
    dom.addForm?.addEventListener("submit", handleAddSubmit);
    dom.addInput?.addEventListener("paste", handlePasteIntoAdd);
    dom.itemSearch?.addEventListener("input", () => {
      state.search = dom.itemSearch.value.trim();
      renderItems();
    });
    dom.sort?.addEventListener("change", () => {
      state.sort = dom.sort.value;
      localStorage.setItem("listmaker.sort", state.sort);
      renderItems();
    });
    dom.filter?.addEventListener("change", () => {
      state.filter = dom.filter.value;
      renderItems();
    });
    document.querySelectorAll("[data-listmaker-view]").forEach((button) => button.addEventListener("click", () => {
      state.view = button.dataset.listmakerView || "list";
      localStorage.setItem("listmaker.view", state.view);
      updateList({ default_view: state.view });
      renderItems();
    }));
    dom.items?.addEventListener("change", handleItemChange);
    dom.items?.addEventListener("click", handleItemClick);
    dom.items?.addEventListener("contextmenu", handleItemContextMenu);
    dom.items?.addEventListener("paste", handleItemPaste);
    dom.bulkBar?.addEventListener("click", handleBulkClick);
    dom.categoryForm?.addEventListener("submit", handleCategorySubmit);
    dom.categoryManagerForm?.addEventListener("submit", (event) => event.preventDefault());
    dom.categoryManagerForm?.addEventListener("click", handleCategoryManagerClick);
    dom.categoryManagerForm?.addEventListener("change", handleCategoryManagerChange);
    dom.listGrid?.addEventListener("click", handleHomeAction);
    dom.ioContent?.addEventListener("click", handleIoClick);
  }

  async function waitForAuth() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (window.centralisSupabase && window.centralisGetCurrentAppUser) return;
      await sleep(50);
    }
    throw new Error("Centralis auth did not initialize.");
  }

  async function loadHome() {
    setStatus(dom.homeStatus, "Loading lists...");
    let query = supabase.from(TABLES.lists).select("*").eq("user_id", state.user.id);
    if (state.homeFilter === "archived") {
      query = query.not("archived_at", "is", null).is("deleted_at", null).order("archived_at", { ascending: false });
    } else if (state.homeFilter === "trash") {
      query = query.not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    } else {
      query = query.is("archived_at", null).is("deleted_at", null).order("updated_at", { ascending: false });
    }
    const { data, error } = await query;
    if (error) throw error;
    state.lists = data || [];
    state.itemCounts = new Map();
    const ids = state.lists.map((list) => list.id);
    if (ids.length) {
      const itemResponse = await supabase.from(TABLES.items).select("id,list_id").in("list_id", ids).is("deleted_at", null);
      if (itemResponse.error) throw itemResponse.error;
      (itemResponse.data || []).forEach((item) => state.itemCounts.set(item.list_id, (state.itemCounts.get(item.list_id) || 0) + 1));
    }
    setStatus(dom.homeStatus, "");
  }

  async function loadList() {
    setStatus(dom.editorStatus, "");
    const [listResponse, categoryResponse, statusResponse, fieldResponse, itemResponse, valueResponse] = await Promise.all([
      supabase.from(TABLES.lists).select("*").eq("id", state.listId).eq("user_id", state.user.id).maybeSingle(),
      supabase.from(TABLES.categories).select("*").eq("list_id", state.listId).eq("user_id", state.user.id).order("sort_order"),
      supabase.from(TABLES.statuses).select("*").eq("list_id", state.listId).eq("user_id", state.user.id).order("sort_order"),
      supabase.from(TABLES.fields).select("*").eq("list_id", state.listId).eq("user_id", state.user.id).eq("visible", true).order("sort_order"),
      supabase.from(TABLES.items).select("*").eq("list_id", state.listId).eq("user_id", state.user.id).is("deleted_at", null).order("manual_order"),
      supabase.from(TABLES.values).select("*").eq("list_id", state.listId).eq("user_id", state.user.id),
    ]);
    [listResponse, categoryResponse, statusResponse, fieldResponse, itemResponse, valueResponse].forEach((response) => {
      if (response.error) throw response.error;
    });
    if (!listResponse.data) throw new Error("That list could not be found.");
    state.list = listResponse.data;
    state.categories = categoryResponse.data || [];
    state.statuses = statusResponse.data || [];
    state.fields = fieldResponse.data || [];
    state.items = itemResponse.data || [];
    state.values = valueResponse.data || [];
    state.view = ["list", "table"].includes(state.list.default_view) ? state.list.default_view : state.view;
    setStatus(dom.editorStatus, "");
  }

  function renderShellMode() {
    if (dom.home) dom.home.hidden = state.mode !== "home";
    if (dom.editor) dom.editor.hidden = state.mode !== "editor";
  }

  function renderHome() {
    renderShellMode();
    dom.homeTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.listmakerHomeFilter === state.homeFilter));
    const lists = state.homeSearch
      ? state.lists.filter((list) => `${list.title} ${list.description || ""} ${templateName(list.template_key)}`.toLowerCase().includes(state.homeSearch))
      : state.lists;
    if (!lists.length) {
      dom.listGrid.innerHTML = `
        <div class="listmaker-empty">
          <h2>${state.homeFilter === "active" ? "No lists yet" : "Nothing here"}</h2>
          <p>${state.homeFilter === "active" ? "Create a blank list or start from a template." : "This saved-list view is empty."}</p>
          ${state.homeFilter === "active" ? '<button class="primary-action" type="button" data-listmaker-create-open><ph-plus weight="bold" aria-hidden="true"></ph-plus><span>Create New List</span></button>' : ""}
        </div>
      `;
      dom.listGrid.querySelector("[data-listmaker-create-open]")?.addEventListener("click", openCreateModal);
      return;
    }
    dom.listGrid.innerHTML = lists.map((list) => {
      const behaviors = normalizeBehaviors(list.behaviors);
      const behaviorLabels = Object.entries(behaviors).filter((entry) => entry[1]).map((entry) => label(entry[0]));
      return `
        <article class="listmaker-card">
          <a href="listmaker-list.html?list=${encodeURIComponent(list.id)}">
            <span>${escapeHtml(templateName(list.template_key))}</span>
            <h2>${escapeHtml(list.title)}</h2>
            <p>${escapeHtml(list.description || "No description.")}</p>
            <div class="listmaker-card-meta">
              <strong>${state.itemCounts.get(list.id) || 0} items</strong>
              <em>${escapeHtml(formatDate(list.updated_at || list.created_at))}</em>
            </div>
            <div class="listmaker-card-tags">
              ${(behaviorLabels.length ? behaviorLabels : ["Plain"]).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
              ${list.rating_type ? `<span>${escapeHtml(ratingLabel(list.rating_type))}</span>` : ""}
            </div>
          </a>
          <div class="listmaker-card-actions">
            ${state.homeFilter === "trash"
              ? `<button type="button" data-list-action="restore" data-list-id="${escapeHtml(list.id)}">Restore</button><button type="button" data-list-action="delete-forever" data-list-id="${escapeHtml(list.id)}">Delete Forever</button>`
              : `<button type="button" data-list-action="duplicate" data-list-id="${escapeHtml(list.id)}">Duplicate</button><button type="button" data-list-action="${state.homeFilter === "archived" ? "unarchive" : "archive"}" data-list-id="${escapeHtml(list.id)}">${state.homeFilter === "archived" ? "Unarchive" : "Archive"}</button><button type="button" data-list-action="trash" data-list-id="${escapeHtml(list.id)}">Trash</button>`}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderEditor() {
    renderShellMode();
    dom.titleInput.textContent = state.list?.title || "";
    dom.descriptionDisplay.textContent = state.list?.description || "";
    dom.itemSearch.value = state.search;
    renderSortOptions();
    renderFilterOptions();
    renderAddCategoryControl();
    renderItems();
  }

  function renderAddCategoryControl() {
    if (!dom.addCategory) return;
    const behaviors = normalizeBehaviors(state.list?.behaviors);
    dom.addCategory.hidden = !behaviors.categorized;
    if (!behaviors.categorized) {
      dom.addCategory.innerHTML = "";
      return;
    }
    dom.addCategory.innerHTML = [
      `<option value="">Uncategorized</option>`,
      ...state.categories.map((category) => `<option value="${escapeAttribute(category.id)}">${escapeHtml(category.name)}</option>`),
    ].join("");
  }

  function renderSortOptions() {
    const behaviors = normalizeBehaviors(state.list?.behaviors);
    const options = [
      ["manual", "No Sort"],
      ["alpha-asc", "Alphabetical A-Z"],
      ["alpha-desc", "Alphabetical Z-A"],
      ["created-desc", "Date Created"],
      ["updated-desc", "Date Modified"],
      ["random", "Random"],
    ];
    if (behaviors.checklist) options.push(["completed", "Completed / Incomplete"]);
    if (behaviors.scored) options.push(["score-desc", "Score Highest"]);
    if (state.list?.rating_type) options.push(["rating-desc", "Rating Highest"]);
    if (behaviors.status) options.push(["status", "Status"]);
    if (behaviors.categorized) options.push(["category", "Category"]);
    if (effectiveCustomFieldsEnabled()) state.fields.forEach((field) => options.push([`field:${field.id}`, `${field.name}`]));
    dom.sort.innerHTML = options.map(([value, name]) => `<option value="${escapeHtml(value)}"${state.sort === value ? " selected" : ""}>Sort: ${escapeHtml(name)}</option>`).join("");
  }

  function renderFilterOptions() {
    const behaviors = normalizeBehaviors(state.list?.behaviors);
    const options = [["", "All Items"]];
    if (behaviors.checklist) {
      const hideChecked = state.list?.settings?.completedItems === "hide";
      options.push(["completed:false", "Unchecked"], ["completed:true", hideChecked ? "Checked (Hidden)" : "Checked"]);
    }
    if (behaviors.categorized) {
      options.push(["category:", "Uncategorized"], ...state.categories.map((category) => [`category:${category.id}`, `Category: ${category.name}`]));
    }
    if (behaviors.status) {
      options.push(["status:", "No Status"], ...state.statuses.map((status) => [`status:${status.id}`, `Status: ${status.name}`]));
    }
    dom.filter.innerHTML = options.map(([value, name]) => `<option value="${escapeHtml(value)}"${state.filter === value ? " selected" : ""}>${escapeHtml(name)}</option>`).join("");
  }

  function renderItems() {
    document.querySelectorAll("[data-listmaker-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.listmakerView === state.view));
    renderBulkBar();
    const rows = visibleItems();
    if (!state.items.length) {
      dom.items.innerHTML = `
        <div class="listmaker-empty" data-listmaker-blank-space>
          <h2>This list is empty</h2>
          <p>Add the first item above or paste several lines at once.</p>
        </div>
      `;
      return;
    }
    if (!rows.length) {
      dom.items.innerHTML = `<div class="listmaker-empty" data-listmaker-blank-space><h2>No matching items</h2><p>Search or filters are hiding every item.</p></div>`;
      return;
    }
    dom.items.innerHTML = `${state.view === "table" ? "" : renderSelectionHeader(rows)}${state.view === "table" ? renderTable(rows) : renderListView(rows)}`;
    syncSelectionToggles();
  }

  function renderListView(rows) {
    const behaviors = normalizeBehaviors(state.list?.behaviors);
    if (behaviors.categorized && state.sort === "manual") {
      const groups = [
        ...state.categories.map((category) => ({ id: category.id, name: category.name, collapsed: category.collapsed })),
        { id: "", name: "Uncategorized", collapsed: state.collapsedVirtualCategories.has("") },
      ];
      return `<div class="listmaker-category-list">${groups.map((category) => {
        const groupRows = rows.filter((item) => (item.category_id || "") === category.id);
        if (!groupRows.length && category.id) return "";
        const selectedCount = groupRows.filter((item) => state.selectedIds.has(item.id)).length;
        const selectionLabel = selectedCount === groupRows.length && groupRows.length ? "Select none" : "Select all";
        return `
          <section class="listmaker-category" data-category-id="${escapeHtml(category.id)}">
            <header data-category-heading="${escapeHtml(category.id)}">
              <button type="button" data-category-toggle="${escapeHtml(category.id)}" aria-expanded="${category.collapsed ? "false" : "true"}">${renderCategoryCaret(category.collapsed)}</button>
              <input type="text" value="${escapeAttribute(category.name)}" data-category-name="${escapeHtml(category.id)}"${category.id ? "" : " disabled"}>
              <label class="listmaker-category-select"><input type="checkbox" data-select-category="${escapeHtml(category.id)}"><span>${selectionLabel}</span><em>${selectedCount} selected / ${groupRows.length} ${groupRows.length === 1 ? "item" : "items"}</em></label>
            </header>
            ${category.collapsed ? "" : `<div class="listmaker-list-rows">${groupRows.map(renderItemRow).join("")}</div>`}
          </section>
        `;
      }).join("")}</div>`;
    }
    return `<div class="listmaker-list-rows" data-listmaker-blank-space>${rows.map(renderItemRow).join("")}</div>`;
  }

  function renderCategoryCaret(collapsed) {
    return collapsed
      ? '<ph-caret-right weight="bold" aria-hidden="true"></ph-caret-right>'
      : '<ph-caret-down weight="bold" aria-hidden="true"></ph-caret-down>';
  }

  function renderSelectionHeader(rows) {
    if (!rows.length) return "";
    const selectedCount = rows.filter((item) => state.selectedIds.has(item.id)).length;
    const selectionLabel = selectedCount === rows.length ? "Select none" : "Select all";
    return `
      <div class="listmaker-selection-row">
        <label class="listmaker-list-select-all"><input type="checkbox" data-select-scope="visible"><span>${selectionLabel}</span></label>
        <span>${selectedCount} selected</span>
      </div>
    `;
  }

  function renderItemRow(item) {
    const behaviors = normalizeBehaviors(state.list?.behaviors);
    const checked = state.selectedIds.has(item.id) ? " checked" : "";
    return `
      <article class="listmaker-item-row${behaviors.checklist ? " has-checklist" : ""}${item.completed ? " is-complete" : ""}${state.selectedIds.has(item.id) ? " is-selected" : ""}" data-item-id="${escapeHtml(item.id)}" role="listitem">
        <input type="checkbox" aria-label="Select ${escapeAttribute(item.title)}" data-select-item="${escapeHtml(item.id)}"${checked}>
        ${behaviors.checklist ? renderChecklistToggle(item) : ""}
        <div class="listmaker-row-title-wrap">
          ${behaviors.ranked ? `<span class="listmaker-rank">${rankFor(item)}</span>` : ""}
          <input class="listmaker-item-title" type="text" value="${escapeAttribute(item.title)}" data-item-field="title" data-item-id="${escapeHtml(item.id)}">
        </div>
        ${renderBehaviorInputs(item)}
        ${renderRowActionMenu(item.id)}
      </article>
    `;
  }

  function renderRowActionMenu(itemId) {
    const id = escapeHtml(itemId);
    return `
      <details class="listmaker-row-menu">
        <summary title="Item actions" aria-label="Item actions"><ph-dots-three-outline weight="bold" aria-hidden="true"></ph-dots-three-outline></summary>
        <div>
          <button type="button" data-item-action="move-up" data-item-id="${id}"><ph-arrow-up weight="bold" aria-hidden="true"></ph-arrow-up><span>Move Up</span></button>
          <button type="button" data-item-action="move-down" data-item-id="${id}"><ph-arrow-down weight="bold" aria-hidden="true"></ph-arrow-down><span>Move Down</span></button>
          <button type="button" data-item-action="duplicate" data-item-id="${id}"><ph-copy weight="bold" aria-hidden="true"></ph-copy><span>Duplicate</span></button>
          <button type="button" data-item-action="delete" data-item-id="${id}"><ph-trash weight="bold" aria-hidden="true"></ph-trash><span>Delete</span></button>
        </div>
      </details>
    `;
  }

  function renderBehaviorInputs(item) {
    const behaviors = normalizeBehaviors(state.list?.behaviors);
    const parts = [];
    if (behaviors.scored) {
      parts.push(`<input class="listmaker-small-input" type="number" step="any" placeholder="Score" value="${escapeAttribute(item.score ?? "")}" data-item-field="score" data-item-id="${escapeHtml(item.id)}">`);
    }
    if (state.list?.rating_type) {
      parts.push(renderRatingInput(item));
    }
    if (behaviors.status) {
      parts.push(`<select data-item-field="status_id" data-item-id="${escapeHtml(item.id)}"><option value="">No status</option>${state.statuses.map((status) => `<option value="${escapeHtml(status.id)}"${item.status_id === status.id ? " selected" : ""}>${escapeHtml(status.name)}</option>`).join("")}</select>`);
    }
    if (behaviors.categorized && !(state.view === "list" && state.sort === "manual")) {
      parts.push(`<span class="listmaker-category-chip">${escapeHtml(categoryName(item.category_id))}</span>`);
    }
    if (effectiveCustomFieldsEnabled()) state.fields.forEach((field) => parts.push(renderFieldInput(item, field)));
    return parts.join("");
  }

  function renderChecklistToggle(item) {
    return `
      <button class="listmaker-check-toggle${item.completed ? " is-checked" : ""}" type="button" data-item-check-toggle="${escapeHtml(item.id)}" aria-label="${item.completed ? "Mark unchecked" : "Mark checked"}" aria-pressed="${item.completed ? "true" : "false"}">
        <ph-check weight="bold" aria-hidden="true"></ph-check>
      </button>
    `;
  }

  function renderRatingInput(item) {
    if (state.list.rating_type === "thumbs") {
      return `<select data-item-field="rating" data-item-id="${escapeHtml(item.id)}"><option value="">Rating</option><option value="1"${Number(item.rating) === 1 ? " selected" : ""}>Thumbs Up</option><option value="0"${Number(item.rating) === 0 ? " selected" : ""}>Thumbs Down</option></select>`;
    }
    const max = state.list.rating_type === "percentage" ? 100 : state.list.rating_type === "number_10" ? 10 : 5;
    return `<input class="listmaker-small-input" type="number" min="0" max="${max}" step="${state.list.rating_type === "percentage" ? "1" : "0.5"}" placeholder="${escapeAttribute(ratingLabel(state.list.rating_type))}" value="${escapeAttribute(item.rating ?? "")}" data-item-field="rating" data-item-id="${escapeHtml(item.id)}">`;
  }

  function renderFieldInput(item, field) {
    const value = getFieldValue(item.id, field.id);
    const attrs = `data-custom-field="${escapeHtml(field.id)}" data-item-id="${escapeHtml(item.id)}"`;
    if (field.field_type === "checkbox") return `<label class="listmaker-inline-check"><input type="checkbox" ${attrs}${value?.boolean_value ? " checked" : ""}><span>${escapeHtml(field.name)}</span></label>`;
    if (field.field_type === "number") return `<input class="listmaker-small-input" type="number" step="any" placeholder="${escapeAttribute(field.name)}" value="${escapeAttribute(value?.number_value ?? "")}" ${attrs}>`;
    if (field.field_type === "date") return `<input class="listmaker-date-input" type="date" value="${escapeAttribute(value?.date_value || "")}" ${attrs}>`;
    if (field.field_type === "dropdown") {
      const options = Array.isArray(field.dropdown_options) ? field.dropdown_options : [];
      return `<select ${attrs}><option value="">${escapeHtml(field.name)}</option>${options.map((option) => `<option value="${escapeAttribute(option)}"${value?.text_value === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
    }
    if (field.field_type === "long_text") return `<textarea rows="1" placeholder="${escapeAttribute(field.name)}" ${attrs}>${escapeHtml(value?.text_value || "")}</textarea>`;
    return `<input type="text" placeholder="${escapeAttribute(field.name)}" value="${escapeAttribute(value?.text_value || "")}" ${attrs}>`;
  }

  function renderTable(rows) {
    const behaviors = normalizeBehaviors(state.list?.behaviors);
    return `
      <div class="listmaker-table-wrap" data-listmaker-blank-space>
        <table class="listmaker-table">
          <thead>
            <tr>
              <th class="listmaker-select-column"><input type="checkbox" data-select-all${rows.every((item) => state.selectedIds.has(item.id)) ? " checked" : ""}></th>
              ${behaviors.ranked ? "<th>Rank</th>" : ""}
              ${behaviors.checklist ? '<th class="listmaker-completed-column">Completed</th>' : ""}
              <th class="listmaker-name-column">Name</th>
              ${behaviors.scored ? "<th>Score</th>" : ""}
              ${state.list?.rating_type ? "<th>Rating</th>" : ""}
              ${behaviors.status ? "<th>Status</th>" : ""}
              ${behaviors.categorized ? "<th>Category</th>" : ""}
              ${effectiveCustomFieldsEnabled() ? state.fields.map((field) => `<th data-field-heading="${escapeHtml(field.id)}">${escapeHtml(field.name)}</th>`).join("") : ""}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows.map((item) => renderTableRow(item)).join("")}</tbody>
        </table>
      </div>
    `;
  }

  function renderTableRow(item) {
    const behaviors = normalizeBehaviors(state.list?.behaviors);
    return `
      <tr data-item-id="${escapeHtml(item.id)}" class="${item.completed ? "is-complete " : ""}${state.selectedIds.has(item.id) ? "is-selected" : ""}">
        <td class="listmaker-select-column"><input type="checkbox" data-select-item="${escapeHtml(item.id)}"${state.selectedIds.has(item.id) ? " checked" : ""}></td>
        ${behaviors.ranked ? `<td>${rankFor(item)}</td>` : ""}
        ${behaviors.checklist ? `<td class="listmaker-completed-column">${renderChecklistToggle(item)}</td>` : ""}
        <td class="listmaker-line-cell listmaker-name-column"><input type="text" value="${escapeAttribute(item.title)}" data-item-field="title" data-item-id="${escapeHtml(item.id)}"></td>
        ${behaviors.scored ? `<td class="listmaker-line-cell"><input type="number" step="any" value="${escapeAttribute(item.score ?? "")}" data-item-field="score" data-item-id="${escapeHtml(item.id)}"></td>` : ""}
        ${state.list?.rating_type ? `<td class="listmaker-line-cell">${renderRatingInput(item)}</td>` : ""}
        ${behaviors.status ? `<td class="listmaker-line-cell"><select data-item-field="status_id" data-item-id="${escapeHtml(item.id)}"><option value="">No status</option>${state.statuses.map((status) => `<option value="${escapeHtml(status.id)}"${item.status_id === status.id ? " selected" : ""}>${escapeHtml(status.name)}</option>`).join("")}</select></td>` : ""}
        ${behaviors.categorized ? `<td class="listmaker-line-cell"><span class="listmaker-category-chip">${escapeHtml(categoryName(item.category_id))}</span></td>` : ""}
        ${effectiveCustomFieldsEnabled() ? state.fields.map((field) => `<td class="listmaker-line-cell">${renderFieldInput(item, field)}</td>`).join("") : ""}
        <td class="listmaker-table-actions">
          ${renderRowActionMenu(item.id)}
        </td>
      </tr>
    `;
  }

  function syncSelectionToggles() {
    const rows = visibleItems();
    syncSelectionToggle(dom.items?.querySelector("[data-select-scope='visible']"), rows);
    dom.items?.querySelectorAll("[data-select-category]").forEach((control) => {
      const categoryId = control.dataset.selectCategory || "";
      syncSelectionToggle(control, rows.filter((item) => (item.category_id || "") === categoryId));
    });
  }

  function syncSelectionToggle(control, rows) {
    if (!control) return;
    const selected = rows.filter((item) => state.selectedIds.has(item.id)).length;
    control.checked = Boolean(rows.length && selected === rows.length);
    control.indeterminate = Boolean(selected && selected < rows.length);
    control.disabled = !rows.length;
  }

  async function handleCreateList(event) {
    event.preventDefault();
    const formData = new FormData(dom.createForm);
    const template = TEMPLATES.find((item) => item.key === formData.get("template_key")) || TEMPLATES[0];
    const behaviors = collectBehaviorForm(formData);
    const ratingType = formData.get("behavior_rating") ? clean(formData.get("rating_type")) || "stars_5" : null;
    const customFields = collectCreateFields();
    const payload = {
      user_id: state.user.id,
      title: clean(formData.get("title")) || "Untitled List",
      description: clean(formData.get("description")),
      template_key: template.key,
      behaviors,
      rating_type: ratingType,
      default_view: customFields.length ? "table" : formData.get("default_view") || "list",
      settings: { completedItems: formData.get("completed_items") || "keep" },
    };
    setStatus(dom.createForm.querySelector("[data-listmaker-create-status]"), "Creating list...");
    const { data, error } = await supabase.from(TABLES.lists).insert(payload).select("*").single();
    if (error) {
      setStatus(dom.createForm.querySelector("[data-listmaker-create-status]"), error.message, "error");
      return;
    }
    await seedListConfiguration(data.id, behaviors, template, formData, customFields);
    window.location.href = `listmaker-list.html?list=${encodeURIComponent(data.id)}`;
  }

  async function seedListConfiguration(listId, behaviors, template, formData, customFields = null) {
    const categories = (behaviors.categorized ? collectLines(formData.get("categories")) : []).map((name, index) => ({
      list_id: listId, user_id: state.user.id, name, sort_order: (index + 1) * 100,
    }));
    const statuses = (behaviors.status ? collectLines(formData.get("statuses")) : []).map((name, index) => ({
      list_id: listId, user_id: state.user.id, name, color: BASE_STATUSES[index % BASE_STATUSES.length]?.color || "#6366f1", sort_order: (index + 1) * 100,
    }));
    const fields = (customFields || collectCreateFields()).map((field, index) => ({
      list_id: listId,
      user_id: state.user.id,
      name: field.name,
      field_type: field.field_type,
      dropdown_options: field.dropdown_options || [],
      sort_order: (index + 1) * 100,
    }));
    if (categories.length) await supabase.from(TABLES.categories).insert(categories);
    if (statuses.length) await supabase.from(TABLES.statuses).insert(statuses);
    if (fields.length) await supabase.from(TABLES.fields).insert(fields);
    if (template.key === "pros-cons" && !categories.length) {
      await supabase.from(TABLES.categories).insert(["Pros", "Cons"].map((name, index) => ({ list_id: listId, user_id: state.user.id, name, sort_order: (index + 1) * 100 })));
    }
  }

  function openCreateModal() {
    dom.createForm.innerHTML = renderCreateForm();
    applyTemplateToCreateForm("blank");
    dom.createModal.hidden = false;
    dom.createForm.querySelector("[name='title']")?.focus();
  }

  function closeCreateModal() {
    dom.createModal.hidden = true;
  }

  function renderCreateForm() {
    return `
      <div class="listmaker-create-scroll">
        <div class="listmaker-create-grid">
          <label class="form-field is-wide"><span>List Name</span><input name="title" type="text" placeholder="Movies, groceries, ideas..." required></label>
          <label class="form-field is-wide"><span>List Description</span><textarea name="description" rows="5" placeholder="Optional context..."></textarea></label>
          <label class="form-field"><span>Template ${infoTip("Templates preselect useful behaviors and starter fields. You can change every option before creating the list.")}</span><select name="template_key">${TEMPLATES.map((template) => `<option value="${template.key}">${escapeHtml(template.name)}</option>`).join("")}</select></label>
          <label class="form-field"><span>Default View ${infoTip("Choose whether the list opens as flexible list rows or a denser table.")}</span><select name="default_view"><option value="list">List</option><option value="table">Table</option></select></label>
        </div>
        <section class="listmaker-config-section">
          <h3>Behaviors ${infoTip("Behaviors turn on extra list features. Related setup sections appear only when their behavior is enabled.")}</h3>
          <div class="listmaker-checkbox-grid">
            ${["checklist", "ranked", "scored", "categorized", "status", "custom_fields", "rating"].map((key) => `<label class="listmaker-check-option"><input type="checkbox" name="behavior_${key}"><span>${label(key)}</span>${infoTip(behaviorHelp(key))}</label>`).join("")}
          </div>
        </section>
        <section class="listmaker-config-section" data-checklist-config hidden><h3>Checklist Options ${infoTip("Choose what happens to checked checklist items in this list.")}</h3><select name="completed_items"><option value="keep">Checked Items: Keep in Place</option><option value="bottom">Checked Items: Move to Bottom</option><option value="hide">Checked Items: Hide</option></select></section>
        <section class="listmaker-config-section" data-category-config hidden><h3>Categories ${infoTip("Categories group items into named sections. Add one category per line.")}</h3><textarea name="categories" rows="3" placeholder="One category per line"></textarea></section>
        <section class="listmaker-config-section" data-status-config hidden><h3>Statuses ${infoTip("Statuses add a per-item workflow state such as Idea, Selected, or Rejected.")}</h3><textarea name="statuses" rows="3" placeholder="Idea&#10;Considering&#10;Selected&#10;Rejected"></textarea></section>
        <section class="listmaker-config-section" data-custom-fields-config hidden><h3>Custom Fields ${infoTip("Custom fields add extra columns or row controls, such as quantity, date, notes, or dropdown choices.")}</h3><div data-create-fields></div><button class="secondary-action" type="button" data-create-add-field><ph-plus weight="bold" aria-hidden="true"></ph-plus>Add Field</button></section>
        <section class="listmaker-config-section" data-rating-config hidden><h3>Rating ${infoTip("Ratings add a simple rating control to every item.")}</h3><select name="rating_type">${RATING_TYPES.filter((item) => item[0]).map(([value, name]) => `<option value="${value}">${name}</option>`).join("")}</select></section>
      </div>
      <p class="form-status" data-listmaker-create-status role="status"></p>
      <div class="modal-actions"><button class="secondary-action" type="button" data-listmaker-create-close>Cancel</button><button class="primary-action" type="submit">Create List</button></div>
    `;
  }

  function handleCreateFormChange(event) {
    if (event.target.name === "template_key") applyTemplateToCreateForm(event.target.value);
    if (event.target.name?.startsWith("behavior_")) syncCreateConditionalFields();
  }

  function handleCreateFormClick(event) {
    if (event.target.closest("[data-listmaker-create-close]")) closeCreateModal();
    if (event.target.closest("[data-create-add-field]")) addCreateFieldRow();
    const remove = event.target.closest("[data-remove-create-field]");
    if (remove) remove.closest("[data-create-field-row]")?.remove();
  }

  function applyTemplateToCreateForm(templateKey) {
    const template = TEMPLATES.find((item) => item.key === templateKey) || TEMPLATES[0];
    ["checklist", "ranked", "scored", "categorized", "status"].forEach((key) => {
      dom.createForm.elements[`behavior_${key}`].checked = Boolean(template.behaviors?.[key]);
    });
    dom.createForm.elements.behavior_custom_fields.checked = Boolean(template.fields?.length);
    dom.createForm.elements.behavior_rating.checked = Boolean(template.rating_type);
    if (template.rating_type) dom.createForm.elements.rating_type.value = template.rating_type;
    dom.createForm.elements.categories.value = (template.categories || []).join("\n");
    dom.createForm.elements.statuses.value = BASE_STATUSES.map((item) => item.name).join("\n");
    dom.createForm.querySelector("[data-create-fields]").innerHTML = "";
    (template.fields || []).forEach(addCreateFieldRow);
    syncCreateConditionalFields();
  }

  function addCreateFieldRow(field = {}) {
    const row = document.createElement("div");
    row.className = "listmaker-field-row";
    row.dataset.createFieldRow = "true";
    row.innerHTML = `
      <input type="text" placeholder="Field name" value="${escapeAttribute(field.name || "")}" data-create-field-name>
      <select data-create-field-type>${FIELD_TYPES.map(([value, name]) => `<option value="${value}"${field.field_type === value ? " selected" : ""}>${name}</option>`).join("")}</select>
      <input type="text" placeholder="Dropdown choices, comma separated" value="${escapeAttribute((field.dropdown_options || []).join(", "))}" data-create-field-options>
      <button type="button" data-remove-create-field aria-label="Remove field">&times;</button>
    `;
    dom.createForm.querySelector("[data-create-fields]").append(row);
  }

  function syncCreateConditionalFields() {
    dom.createForm.querySelector("[data-checklist-config]").hidden = !dom.createForm.elements.behavior_checklist.checked;
    dom.createForm.querySelector("[data-category-config]").hidden = !dom.createForm.elements.behavior_categorized.checked;
    dom.createForm.querySelector("[data-status-config]").hidden = !dom.createForm.elements.behavior_status.checked;
    dom.createForm.querySelector("[data-custom-fields-config]").hidden = !dom.createForm.elements.behavior_custom_fields.checked;
    dom.createForm.querySelector("[data-rating-config]").hidden = !dom.createForm.elements.behavior_rating.checked;
  }

  function collectCreateFields() {
    if (!dom.createForm.elements.behavior_custom_fields?.checked) return [];
    return [...dom.createForm.querySelectorAll("[data-create-field-row]")].map((row) => {
      const name = clean(row.querySelector("[data-create-field-name]").value);
      const field_type = row.querySelector("[data-create-field-type]").value;
      const dropdown_options = clean(row.querySelector("[data-create-field-options]").value).split(",").map(clean).filter(Boolean);
      return name ? { name, field_type, dropdown_options } : null;
    }).filter(Boolean);
  }

  function openSettingsModal() {
    dom.settingsForm.innerHTML = renderSettingsForm();
    syncSettingsConditionalFields();
    dom.settingsModal.hidden = false;
  }

  function closeSettingsModal() {
    dom.settingsModal.hidden = true;
  }

  function renderSettingsForm() {
    const behaviors = normalizeBehaviors(state.list.behaviors);
    const settings = state.list.settings || {};
    const customFieldsEnabled = effectiveCustomFieldsEnabled();
    const ratingEnabled = effectiveRatingEnabled();
    return `
      <div class="listmaker-settings-scroll">
        <div class="listmaker-create-grid">
          <label class="form-field is-wide"><span>Name</span><input name="title" value="${escapeAttribute(state.list.title)}" required></label>
          <label class="form-field is-wide"><span>Description</span><textarea name="description" rows="5">${escapeHtml(state.list.description || "")}</textarea></label>
        </div>
        <section class="listmaker-config-section">
          <h3>Behaviors ${infoTip("Behaviors turn on extra list features. Related setup sections appear only when their behavior is enabled.")}</h3>
          <div class="listmaker-checkbox-grid">
            ${["checklist", "ranked", "scored", "categorized", "status", "custom_fields", "rating"].map((key) => {
              const checked = key === "custom_fields" ? customFieldsEnabled : key === "rating" ? ratingEnabled : behaviors[key];
              const locked = ["categorized", "custom_fields"].includes(key) && checked;
              return `${locked ? `<input type="hidden" name="behavior_${key}" value="on">` : ""}<label class="listmaker-check-option${locked ? " is-locked" : ""}"><input type="checkbox" name="behavior_${key}"${checked ? " checked" : ""}${locked ? " disabled" : ""}><span>${label(key)}</span>${locked ? infoTip("This behavior is already in use and cannot be removed here.") : infoTip(behaviorHelp(key))}</label>`;
            }).join("")}
          </div>
        </section>
        <section class="listmaker-config-section" data-settings-checklist-config><h3>Checklist Options ${infoTip("Choose what happens to checked checklist items in this list.")}</h3><select name="completed_items"><option value="keep"${(settings.completedItems || "keep") === "keep" ? " selected" : ""}>Checked Items: Keep in Place</option><option value="bottom"${settings.completedItems === "bottom" ? " selected" : ""}>Checked Items: Move to Bottom</option><option value="hide"${settings.completedItems === "hide" ? " selected" : ""}>Checked Items: Hide</option></select></section>
        <section class="listmaker-config-section" data-settings-rating-config><h3>Rating ${infoTip("Ratings add a simple rating control to every item.")}</h3><select name="rating_type">${RATING_TYPES.filter((item) => item[0]).map(([value, name]) => `<option value="${value}"${(state.list.rating_type || "stars_5") === value ? " selected" : ""}>${name}</option>`).join("")}</select></section>
        <section class="listmaker-config-section" data-settings-category-config><h3>Categories ${infoTip("Categories group items into named sections.")}</h3><div class="listmaker-settings-list">${state.categories.map((category) => settingRow("category", category)).join("") || '<p class="listmaker-muted">No categories.</p>'}</div><div class="listmaker-inline-add"><input type="text" placeholder="New category" data-add-category-name><button type="button" data-add-category>Add Category</button></div></section>
        <section class="listmaker-config-section" data-settings-status-config><h3>Statuses ${infoTip("Statuses add a per-item workflow state.")}</h3><div class="listmaker-settings-list">${state.statuses.map((status) => settingRow("status", status)).join("") || '<p class="listmaker-muted">No statuses.</p>'}</div><div class="listmaker-inline-add"><input type="text" placeholder="New status" data-add-status-name><input type="color" value="#6366f1" data-add-status-color><button type="button" data-add-status>Add Status</button></div></section>
        <section class="listmaker-config-section" data-settings-fields-config><h3>Custom Fields ${infoTip("Custom fields add extra columns or row controls.")}</h3><div class="listmaker-settings-list">${state.fields.map((field) => settingRow("field", field)).join("") || '<p class="listmaker-muted">No fields.</p>'}</div><div class="listmaker-inline-add"><input type="text" placeholder="New field" data-add-field-name><select data-add-field-type>${FIELD_TYPES.map(([value, name]) => `<option value="${value}">${name}</option>`).join("")}</select><input type="text" placeholder="Dropdown choices" data-add-field-options><button type="button" data-add-field>Add Field</button></div></section>
      </div>
      <p class="form-status" data-settings-status role="status"></p>
      <div class="modal-actions"><button class="secondary-action" type="button" data-listmaker-settings-close>Close</button><button class="primary-action" type="submit">Save Settings</button></div>
    `;
  }

  function settingRow(kind, row) {
    const extra = kind === "status" ? `<input type="color" value="${escapeAttribute(row.color || "#6366f1")}" data-setting-color="${escapeHtml(row.id)}">` : "";
    const type = kind === "field" ? `<span>${escapeHtml(label(row.field_type))}</span>` : "";
    return `<div class="listmaker-setting-row"><input type="text" value="${escapeAttribute(row.name)}" data-setting-name="${kind}:${escapeHtml(row.id)}">${extra}${type}<button type="button" data-setting-move="${kind}:${escapeHtml(row.id)}:up">Up</button><button type="button" data-setting-move="${kind}:${escapeHtml(row.id)}:down">Down</button><button type="button" data-setting-delete="${kind}:${escapeHtml(row.id)}">Delete</button></div>`;
  }

  async function handleSettingsSubmit(event) {
    event.preventDefault();
    const formData = new FormData(dom.settingsForm);
    await updateList({
      title: clean(formData.get("title")) || "Untitled List",
      description: clean(formData.get("description")),
      behaviors: collectBehaviorForm(formData),
      rating_type: formData.get("behavior_rating") ? clean(formData.get("rating_type")) || "stars_5" : null,
      settings: { ...(state.list.settings || {}), completedItems: formData.get("completed_items") || "keep" },
    });
    await loadList();
    renderEditor();
    closeSettingsModal();
  }

  async function handleSettingsClick(event) {
    if (event.target.closest("[data-listmaker-settings-close]")) closeSettingsModal();
    if (event.target.closest("[data-add-category]")) await addSettingRow("category");
    if (event.target.closest("[data-add-status]")) await addSettingRow("status");
    if (event.target.closest("[data-add-field]")) await addSettingRow("field");
    const del = event.target.closest("[data-setting-delete]");
    if (del) await deleteSettingRow(del.dataset.settingDelete);
    const move = event.target.closest("[data-setting-move]");
    if (move) await moveSettingRow(move.dataset.settingMove);
  }

  async function handleSettingsChange(event) {
    if (event.target.name?.startsWith("behavior_")) syncSettingsConditionalFields();
    const nameTarget = event.target.closest("[data-setting-name]");
    if (nameTarget) {
      const [kind, id] = nameTarget.dataset.settingName.split(":");
      await updateSettingName(kind, id, clean(nameTarget.value));
    }
    const colorTarget = event.target.closest("[data-setting-color]");
    if (colorTarget) {
      await supabase.from(TABLES.statuses).update({ color: colorTarget.value }).eq("id", colorTarget.dataset.settingColor).eq("user_id", state.user.id);
      await loadList();
      renderEditor();
      openSettingsModal();
    }
  }

  function syncSettingsConditionalFields() {
    if (!dom.settingsForm) return;
    const checklist = settingsBehaviorEnabled("checklist");
    const categorized = settingsBehaviorEnabled("categorized");
    const status = settingsBehaviorEnabled("status");
    const customFields = settingsBehaviorEnabled("custom_fields");
    const rating = settingsBehaviorEnabled("rating");
    const sections = [
      ["[data-settings-checklist-config]", checklist],
      ["[data-settings-category-config]", categorized],
      ["[data-settings-status-config]", status],
      ["[data-settings-fields-config]", customFields],
      ["[data-settings-rating-config]", rating],
    ];
    sections.forEach(([selector, visible]) => {
      const section = dom.settingsForm.querySelector(selector);
      if (section) section.hidden = !visible;
    });
  }

  function settingsBehaviorEnabled(key) {
    if (!dom.settingsForm) return false;
    return new FormData(dom.settingsForm).has(`behavior_${key}`);
  }

  async function addSettingRow(kind) {
    if (kind === "category") {
      const name = clean(dom.settingsForm.querySelector("[data-add-category-name]").value);
      if (!name) return;
      await supabase.from(TABLES.categories).insert({ list_id: state.listId, user_id: state.user.id, name, sort_order: nextOrder(state.categories) });
    } else if (kind === "status") {
      const name = clean(dom.settingsForm.querySelector("[data-add-status-name]").value);
      if (!name) return;
      await supabase.from(TABLES.statuses).insert({ list_id: state.listId, user_id: state.user.id, name, color: dom.settingsForm.querySelector("[data-add-status-color]").value, sort_order: nextOrder(state.statuses) });
    } else {
      const name = clean(dom.settingsForm.querySelector("[data-add-field-name]").value);
      if (!name) return;
      const field_type = dom.settingsForm.querySelector("[data-add-field-type]").value;
      const dropdown_options = clean(dom.settingsForm.querySelector("[data-add-field-options]").value).split(",").map(clean).filter(Boolean);
      await supabase.from(TABLES.fields).insert({ list_id: state.listId, user_id: state.user.id, name, field_type, dropdown_options, sort_order: nextOrder(state.fields) });
    }
    await loadList();
    renderEditor();
    openSettingsModal();
  }

  async function deleteSettingRow(value) {
    const [kind, id] = value.split(":");
    if (!window.confirm(`Delete this ${kind}?`)) return;
    const table = kind === "category" ? TABLES.categories : kind === "status" ? TABLES.statuses : TABLES.fields;
    const payload = kind === "field" ? { visible: false } : null;
    const response = payload
      ? await supabase.from(table).update(payload).eq("id", id).eq("user_id", state.user.id)
      : await supabase.from(table).delete().eq("id", id).eq("user_id", state.user.id);
    if (response.error) setStatus(dom.settingsForm.querySelector("[data-settings-status]"), response.error.message, "error");
    await loadList();
    renderEditor();
    openSettingsModal();
  }

  async function moveSettingRow(value) {
    const [kind, id, direction] = value.split(":");
    const rows = kind === "category" ? state.categories : kind === "status" ? state.statuses : state.fields;
    const table = kind === "category" ? TABLES.categories : kind === "status" ? TABLES.statuses : TABLES.fields;
    const index = rows.findIndex((row) => row.id === id);
    const other = rows[index + (direction === "up" ? -1 : 1)];
    const row = rows[index];
    if (!row || !other) return;
    await Promise.all([
      supabase.from(table).update({ sort_order: other.sort_order }).eq("id", row.id).eq("user_id", state.user.id),
      supabase.from(table).update({ sort_order: row.sort_order }).eq("id", other.id).eq("user_id", state.user.id),
    ]);
    await loadList();
    renderEditor();
    openSettingsModal();
  }

  async function updateSettingName(kind, id, name) {
    if (!name) return;
    const table = kind === "category" ? TABLES.categories : kind === "status" ? TABLES.statuses : TABLES.fields;
    await supabase.from(table).update({ name }).eq("id", id).eq("user_id", state.user.id);
    await loadList();
    renderEditor();
  }

  async function handleAddSubmit(event) {
    event.preventDefault();
    const title = clean(dom.addInput.value);
    if (!title) return;
    await addItems([title], addItemOverrides());
    dom.addInput.value = "";
  }

  async function handlePasteIntoAdd(event) {
    const textValue = event.clipboardData?.getData("text/plain") || "";
    const items = parsePastedItems(textValue);
    if (items.length <= 1) return;
    event.preventDefault();
    await addItems(items, addItemOverrides());
    dom.addInput.value = "";
  }

  function addItemOverrides() {
    const behaviors = normalizeBehaviors(state.list?.behaviors);
    return behaviors.categorized ? { category_id: dom.addCategory?.value || null } : {};
  }

  async function handleItemPaste(event) {
    if (!event.target.matches("[data-listmaker-blank-space], [data-listmaker-add-input]")) return;
    const items = parsePastedItems(event.clipboardData?.getData("text/plain") || "");
    if (items.length <= 1) return;
    event.preventDefault();
    await addItems(items);
  }

  async function addItems(titles, overrides = {}) {
    const start = nextOrder(state.items);
    const rows = titles.map((title, index) => ({
      list_id: state.listId,
      user_id: state.user.id,
      title,
      manual_order: start + index * 100,
      category_id: overrides.category_id || null,
      status_id: overrides.status_id || null,
    }));
    const { error } = await supabase.from(TABLES.items).insert(rows);
    if (error) {
      setStatus(dom.editorStatus, error.message, "error");
      return;
    }
    await loadList();
    renderEditor();
  }

  async function handleItemChange(event) {
    const categoryNameTarget = event.target.closest("[data-category-name]");
    if (categoryNameTarget && categoryNameTarget.dataset.categoryName) {
      await supabase.from(TABLES.categories).update({ name: clean(categoryNameTarget.value) || "Category" }).eq("id", categoryNameTarget.dataset.categoryName).eq("user_id", state.user.id);
      await loadList();
      renderEditor();
      return;
    }
    const selectAll = event.target.closest("[data-select-all]");
    if (selectAll) {
      visibleItems().forEach((item) => selectAll.checked ? state.selectedIds.add(item.id) : state.selectedIds.delete(item.id));
      renderItems();
      return;
    }
    const selectScope = event.target.closest("[data-select-scope]");
    if (selectScope) {
      visibleItems().forEach((item) => selectScope.checked ? state.selectedIds.add(item.id) : state.selectedIds.delete(item.id));
      renderItems();
      return;
    }
    const selectCategory = event.target.closest("[data-select-category]");
    if (selectCategory) {
      const categoryId = selectCategory.dataset.selectCategory || "";
      visibleItems()
        .filter((item) => (item.category_id || "") === categoryId)
        .forEach((item) => selectCategory.checked ? state.selectedIds.add(item.id) : state.selectedIds.delete(item.id));
      renderItems();
      return;
    }
    const select = event.target.closest("[data-select-item]");
    if (select) {
      select.checked ? state.selectedIds.add(select.dataset.selectItem) : state.selectedIds.delete(select.dataset.selectItem);
      renderItems();
      return;
    }
    const field = event.target.closest("[data-item-field]");
    if (field) {
      await updateItemField(field.dataset.itemId, field.dataset.itemField, controlValue(field));
      return;
    }
    const custom = event.target.closest("[data-custom-field]");
    if (custom) {
      await updateCustomFieldValue(custom.dataset.itemId, custom.dataset.customField, controlValue(custom));
    }
  }

  async function handleItemClick(event) {
    const checkToggle = event.target.closest("[data-item-check-toggle]");
    if (checkToggle) {
      const item = state.items.find((row) => row.id === checkToggle.dataset.itemCheckToggle);
      await updateItemField(checkToggle.dataset.itemCheckToggle, "completed", !item?.completed);
      return;
    }
    const action = event.target.closest("[data-item-action]");
    if (action) {
      await runItemAction(action.dataset.itemId, action.dataset.itemAction);
      return;
    }
    const toggle = event.target.closest("[data-category-toggle]");
    if (toggle) {
      const id = toggle.dataset.categoryToggle;
      if (!id) {
        if (state.collapsedVirtualCategories.has("")) {
          state.collapsedVirtualCategories.delete("");
        } else {
          state.collapsedVirtualCategories.add("");
        }
        renderItems();
        return;
      }
      const category = state.categories.find((item) => item.id === id);
      if (category) await supabase.from(TABLES.categories).update({ collapsed: !category.collapsed }).eq("id", id).eq("user_id", state.user.id);
      await loadList();
      renderEditor();
    }
  }

  async function runItemAction(itemId, action) {
    if (action === "duplicate") return duplicateItems([itemId]);
    if (action === "delete") return deleteItems([itemId]);
    if (action === "move-up") return moveItem(itemId, -1);
    if (action === "move-down") return moveItem(itemId, 1);
    if (action === "move-top") return moveItemToEdge(itemId, "top");
    if (action === "move-bottom") return moveItemToEdge(itemId, "bottom");
    if (action === "set-position") return setItemPosition(itemId);
    return null;
  }

  async function updateItemField(itemId, field, value) {
    const payload = { [field]: value === "" && ["score", "rating", "category_id", "status_id"].includes(field) ? null : value };
    if (field === "completed") payload.completed = Boolean(value);
    if (["score", "rating"].includes(field) && value !== "") payload[field] = Number(value);
    const { error } = await supabase.from(TABLES.items).update(payload).eq("id", itemId).eq("user_id", state.user.id);
    if (error) setStatus(dom.editorStatus, error.message, "error");
    await loadList();
    renderEditor();
  }

  async function updateCustomFieldValue(itemId, fieldId, value) {
    const field = state.fields.find((item) => item.id === fieldId);
    if (!field) return;
    const payload = {
      list_id: state.listId,
      item_id: itemId,
      field_id: fieldId,
      user_id: state.user.id,
      text_value: null,
      number_value: null,
      boolean_value: null,
      date_value: null,
    };
    if (field.field_type === "number") payload.number_value = value === "" ? null : Number(value);
    else if (field.field_type === "checkbox") payload.boolean_value = Boolean(value);
    else if (field.field_type === "date") payload.date_value = value || null;
    else payload.text_value = String(value ?? "");
    const { error } = await supabase.from(TABLES.values).upsert(payload, { onConflict: "item_id,field_id" });
    if (error) setStatus(dom.editorStatus, error.message, "error");
    await loadList();
    renderEditor();
  }

  async function duplicateItems(ids) {
    const sourceItems = ids.map((id) => state.items.find((row) => row.id === id)).filter(Boolean);
    const rows = sourceItems.map((item, index) => ({
        list_id: state.listId,
        user_id: state.user.id,
        title: `${item.title} copy`,
        completed: item.completed,
        manual_order: nextOrder(state.items) + index * 100,
        score: item.score,
        rating: item.rating,
        category_id: item.category_id,
        status_id: item.status_id,
        notes: item.notes,
    }));
    if (!rows.length) return;
    const { data, error } = await supabase.from(TABLES.items).insert(rows).select("*");
    if (error) {
      setStatus(dom.editorStatus, error.message, "error");
      return;
    }
    const clonedValues = [];
    (data || []).forEach((newItem, index) => {
      const source = sourceItems[index];
      state.values.filter((value) => value.item_id === source.id).forEach((value) => {
        clonedValues.push({
          list_id: state.listId,
          item_id: newItem.id,
          field_id: value.field_id,
          user_id: state.user.id,
          text_value: value.text_value,
          number_value: value.number_value,
          boolean_value: value.boolean_value,
          date_value: value.date_value,
        });
      });
    });
    if (clonedValues.length) await supabase.from(TABLES.values).insert(clonedValues);
    await loadList();
    renderEditor();
  }

  async function deleteItems(ids) {
    if (!ids.length || !window.confirm(`Delete ${ids.length} item${ids.length === 1 ? "" : "s"}?`)) return;
    const { error } = await supabase.from(TABLES.items).update({ deleted_at: new Date().toISOString(), deleted_by: state.user.id }).in("id", ids).eq("user_id", state.user.id);
    if (error) setStatus(dom.editorStatus, error.message, "error");
    ids.forEach((id) => state.selectedIds.delete(id));
    await loadList();
    renderEditor();
  }

  async function moveItem(itemId, delta) {
    const rows = state.items.slice().sort((a, b) => Number(a.manual_order) - Number(b.manual_order));
    const index = rows.findIndex((item) => item.id === itemId);
    const other = rows[index + delta];
    const item = rows[index];
    if (!item || !other) return;
    await Promise.all([
      supabase.from(TABLES.items).update({ manual_order: other.manual_order }).eq("id", item.id).eq("user_id", state.user.id),
      supabase.from(TABLES.items).update({ manual_order: item.manual_order }).eq("id", other.id).eq("user_id", state.user.id),
    ]);
    await loadList();
    renderEditor();
  }

  async function moveItemToEdge(itemId, edge) {
    const rows = state.items.slice().sort((a, b) => Number(a.manual_order) - Number(b.manual_order)).filter((item) => item.id !== itemId);
    const item = state.items.find((row) => row.id === itemId);
    if (!item) return;
    const ordered = edge === "top" ? [item, ...rows] : [...rows, item];
    await rewriteManualOrder(ordered);
  }

  async function setItemPosition(itemId) {
    const rows = state.items.slice().sort(compareManual).filter((item) => item.id !== itemId);
    const item = state.items.find((row) => row.id === itemId);
    if (!item) return;
    const position = Math.max(1, Math.min(rows.length + 1, Number(window.prompt("Move to position", String(rankFor(item)))) || rankFor(item)));
    rows.splice(position - 1, 0, item);
    await rewriteManualOrder(rows);
  }

  async function rewriteManualOrder(items) {
    await Promise.all(items.map((item, index) => supabase.from(TABLES.items).update({ manual_order: (index + 1) * 100 }).eq("id", item.id).eq("user_id", state.user.id)));
    await loadList();
    renderEditor();
  }

  async function handleBulkClick(event) {
    const clear = event.target.closest("[data-listmaker-clear-selection]");
    if (clear) {
      state.selectedIds.clear();
      renderItems();
      return;
    }
    const action = event.target.closest("[data-listmaker-bulk]")?.dataset.listmakerBulk;
    if (!action) return;
    const ids = [...state.selectedIds];
    if (action === "duplicate") await duplicateItems(ids);
    if (action === "delete") await deleteItems(ids);
    if (action === "complete") await bulkUpdateItems(ids, { completed: true });
    if (action === "incomplete") await bulkUpdateItems(ids, { completed: false });
    if (action === "category") await bulkSetCategory(ids);
    if (action === "status") await bulkSetStatus(ids);
    if (action === "score") {
      const score = window.prompt("Score");
      if (score !== null) await bulkUpdateItems(ids, { score: score === "" ? null : Number(score) });
    }
    if (action === "rating") {
      const rating = window.prompt(`Rating (${ratingLabel(state.list.rating_type)})`);
      if (rating !== null) await bulkUpdateItems(ids, { rating: rating === "" ? null : Number(rating) });
    }
  }

  async function bulkUpdateItems(ids, payload) {
    if (!ids.length) return;
    const { error } = await supabase.from(TABLES.items).update(payload).in("id", ids).eq("user_id", state.user.id);
    if (error) setStatus(dom.editorStatus, error.message, "error");
    await loadList();
    renderEditor();
  }

  async function bulkSetCategory(ids) {
    if (!ids.length) return;
    state.pendingCategoryMoveIds = ids;
    openCategoryModal();
  }

  function openCategoryModal() {
    if (!dom.categoryModal || !dom.categorySelect) return;
    dom.categorySelect.innerHTML = [
      `<option value="">Uncategorized</option>`,
      ...state.categories.map((category) => `<option value="${escapeAttribute(category.id)}">${escapeHtml(category.name)}</option>`),
    ].join("");
    setStatus(dom.categoryStatus, "");
    dom.categoryModal.hidden = false;
    dom.categorySelect.focus();
  }

  function closeCategoryModal() {
    if (dom.categoryModal) dom.categoryModal.hidden = true;
    state.pendingCategoryMoveIds = [];
  }

  function openCategoryManagerModal() {
    if (!dom.categoryManagerModal || !dom.categoryManagerForm) return;
    dom.categoryManagerForm.innerHTML = renderCategoryManagerForm();
    dom.categoryManagerModal.hidden = false;
    dom.categoryManagerForm.querySelector("[data-add-category-name]")?.focus();
  }

  function closeCategoryManagerModal() {
    if (dom.categoryManagerModal) dom.categoryManagerModal.hidden = true;
  }

  function renderCategoryManagerForm() {
    return `
      <div class="listmaker-settings-scroll">
        <section class="listmaker-config-section">
          <h3>Categories ${infoTip("Add, rename, reorder, or remove sections for this categorized list.")}</h3>
          <div class="listmaker-settings-list">${state.categories.map((category) => settingRow("category", category)).join("") || '<p class="listmaker-muted">No categories.</p>'}</div>
          <div class="listmaker-inline-add"><input type="text" placeholder="New category" data-add-category-name><button type="button" data-add-category>Add Category</button></div>
        </section>
      </div>
      <p class="form-status" data-category-manager-status role="status"></p>
      <div class="modal-actions">
        <button class="secondary-action" type="button" data-listmaker-category-manager-close>Close</button>
      </div>
    `;
  }

  async function handleCategoryManagerClick(event) {
    if (event.target.closest("[data-listmaker-category-manager-close]")) closeCategoryManagerModal();
    if (event.target.closest("[data-add-category]")) await addManagedCategory();
    const del = event.target.closest("[data-setting-delete]");
    if (del) await deleteManagedCategory(del.dataset.settingDelete);
    const move = event.target.closest("[data-setting-move]");
    if (move) await moveManagedCategory(move.dataset.settingMove);
  }

  async function handleCategoryManagerChange(event) {
    const nameTarget = event.target.closest("[data-setting-name]");
    if (!nameTarget) return;
    const [kind, id] = nameTarget.dataset.settingName.split(":");
    if (kind !== "category") return;
    await updateSettingName(kind, id, clean(nameTarget.value));
  }

  async function addManagedCategory() {
    const name = clean(dom.categoryManagerForm?.querySelector("[data-add-category-name]")?.value);
    if (!name) return;
    const { error } = await supabase.from(TABLES.categories).insert({ list_id: state.listId, user_id: state.user.id, name, sort_order: nextOrder(state.categories) });
    if (error) {
      setStatus(dom.categoryManagerForm.querySelector("[data-category-manager-status]"), error.message, "error");
      return;
    }
    await loadList();
    renderEditor();
    openCategoryManagerModal();
  }

  async function deleteManagedCategory(value) {
    const [kind, id] = value.split(":");
    if (kind !== "category") return;
    if (!window.confirm("Delete this category? Items in it will become uncategorized.")) return;
    const { error } = await supabase.from(TABLES.categories).delete().eq("id", id).eq("user_id", state.user.id);
    if (error) {
      setStatus(dom.categoryManagerForm.querySelector("[data-category-manager-status]"), error.message, "error");
      return;
    }
    await loadList();
    renderEditor();
    openCategoryManagerModal();
  }

  async function moveManagedCategory(value) {
    const [kind, id, direction] = value.split(":");
    if (kind !== "category") return;
    const index = state.categories.findIndex((row) => row.id === id);
    const other = state.categories[index + (direction === "up" ? -1 : 1)];
    const row = state.categories[index];
    if (!row || !other) return;
    await Promise.all([
      supabase.from(TABLES.categories).update({ sort_order: other.sort_order }).eq("id", row.id).eq("user_id", state.user.id),
      supabase.from(TABLES.categories).update({ sort_order: row.sort_order }).eq("id", other.id).eq("user_id", state.user.id),
    ]);
    await loadList();
    renderEditor();
    openCategoryManagerModal();
  }

  async function handleCategorySubmit(event) {
    event.preventDefault();
    const ids = state.pendingCategoryMoveIds.slice();
    if (!ids.length) return closeCategoryModal();
    const categoryId = dom.categorySelect?.value || null;
    await bulkUpdateItems(ids, { category_id: categoryId });
    closeCategoryModal();
  }

  async function bulkSetStatus(ids) {
    const choice = window.prompt(`Status:\n${["No Status", ...state.statuses.map((status) => status.name)].join("\n")}`);
    if (choice === null) return;
    const status = state.statuses.find((item) => item.name.toLowerCase() === choice.trim().toLowerCase());
    await bulkUpdateItems(ids, { status_id: status?.id || null });
  }

  function renderBulkBar() {
    const count = state.selectedIds.size;
    const behaviors = normalizeBehaviors(state.list.behaviors);
    const disabled = count ? "" : " disabled";
    dom.bulkBar.classList.toggle("has-selection", Boolean(count));
    dom.bulkBar.innerHTML = `
      <span>${count} selected</span>
      <details class="listmaker-bulk-menu${count ? "" : " is-disabled"}">
        <summary class="primary-action"${disabled}>Selected Items Actions<ph-caret-down weight="bold" aria-hidden="true"></ph-caret-down></summary>
        <div>
          <button type="button" data-listmaker-bulk="duplicate"${disabled}>Duplicate</button>
          ${behaviors.checklist ? `<button type="button" data-listmaker-bulk="complete"${disabled}>Complete</button><button type="button" data-listmaker-bulk="incomplete"${disabled}>Incomplete</button>` : ""}
          ${behaviors.categorized ? `<button type="button" data-listmaker-bulk="category"${disabled}>Move to Category</button>` : ""}
          ${behaviors.status ? `<button type="button" data-listmaker-bulk="status"${disabled}>Set Status</button>` : ""}
          ${behaviors.scored ? `<button type="button" data-listmaker-bulk="score"${disabled}>Set Score</button>` : ""}
          ${state.list.rating_type ? `<button type="button" data-listmaker-bulk="rating"${disabled}>Set Rating</button>` : ""}
          <button type="button" data-listmaker-bulk="delete"${disabled}>Delete</button>
          <button type="button" data-listmaker-clear-selection${disabled}>Clear</button>
        </div>
      </details>
    `;
  }

  function handleItemContextMenu(event) {
    const openRowMenus = document.querySelectorAll(".listmaker-row-menu[open]");
    if (event.target.closest(".listmaker-row-menu[open]")) {
      event.preventDefault();
      event.stopPropagation();
      openRowMenus.forEach((menu) => menu.removeAttribute("open"));
      hideContextMenu();
      return;
    }
    openRowMenus.forEach((menu) => menu.removeAttribute("open"));
    event.preventDefault();
    const fieldHeading = event.target.closest("[data-field-heading]");
    const itemNode = event.target.closest("[data-item-id]");
    const categoryNode = event.target.closest("[data-category-heading]");
    if (fieldHeading) {
      showContextMenu(event, fieldHeaderMenu(fieldHeading.dataset.fieldHeading));
    } else if (itemNode) {
      showContextMenu(event, itemMenu(itemNode.dataset.itemId));
    } else if (categoryNode) {
      showContextMenu(event, categoryMenu(categoryNode.dataset.categoryHeading));
    } else {
      showContextMenu(event, blankMenu());
    }
  }

  function itemMenu(itemId) {
    const item = state.items.find((row) => row.id === itemId);
    const behaviors = normalizeBehaviors(state.list.behaviors);
    const entries = [
      ["Duplicate", () => duplicateItems([itemId])],
      ["Delete", () => deleteItems([itemId])],
      ["Move Up", () => moveItem(itemId, -1)],
      ["Move Down", () => moveItem(itemId, 1)],
      ["Move to Top", () => moveItemToEdge(itemId, "top")],
      ["Move to Bottom", () => moveItemToEdge(itemId, "bottom")],
      ["Set Position...", () => setItemPosition(itemId)],
    ];
    if (behaviors.checklist) entries.push([item?.completed ? "Mark Incomplete" : "Mark Complete", () => updateItemField(itemId, "completed", !item?.completed)]);
    if (behaviors.categorized) {
      entries.push(["Manage Categories", openCategoryManagerModal]);
      state.categories.forEach((category) => entries.push([`Move to Category: ${category.name}`, () => updateItemField(itemId, "category_id", category.id)]));
    }
    if (behaviors.status) state.statuses.forEach((status) => entries.push([`Set Status: ${status.name}`, () => updateItemField(itemId, "status_id", status.id)]));
    return entries;
  }

  function categoryMenu(categoryId) {
    const category = state.categories.find((row) => row.id === categoryId);
    return [
      ["Add Item", () => {
        const title = window.prompt("Item name");
        if (title) addItems([clean(title)], { category_id: categoryId || null });
      }],
      ["Manage Categories", openCategoryManagerModal],
      [category?.collapsed ? "Expand" : "Collapse", async () => {
        if (category) {
          await supabase.from(TABLES.categories).update({ collapsed: !category.collapsed }).eq("id", category.id).eq("user_id", state.user.id);
          await loadList();
          renderEditor();
        }
      }],
    ];
  }

  function blankMenu() {
    const entries = [
      ["Add Item", () => dom.addInput?.focus()],
      ["Add Multiple Items", async () => {
        const value = window.prompt("Paste or type one item per line");
        const rows = parsePastedItems(value || "");
        if (rows.length) await addItems(rows);
      }],
      ["Pick Random", pickRandomItems],
      ["Remove Exact Duplicates", removeDuplicates],
      ["Remove Blank Items", removeBlankItems],
      ["Trim Whitespace", trimWhitespace],
      ["Remove Leading Numbers/Bullets", removeLeadingBullets],
      ["Randomize", randomizeItems],
      ["Find and Replace", findAndReplace],
    ];
    if (normalizeBehaviors(state.list?.behaviors).categorized) entries.splice(2, 0, ["Manage Categories", openCategoryManagerModal]);
    return entries;
  }

  function fieldHeaderMenu(fieldId) {
    return [
      ["Sort by Field", () => {
        state.sort = `field:${fieldId}`;
        localStorage.setItem("listmaker.sort", state.sort);
        renderEditor();
      }],
      ["Move Column Left", () => moveSettingRow(`field:${fieldId}:up`)],
      ["Move Column Right", () => moveSettingRow(`field:${fieldId}:down`)],
      ["Hide Field", () => deleteSettingRow(`field:${fieldId}`)],
    ];
  }

  function showContextMenu(event, entries) {
    dom.contextMenu.innerHTML = entries.map((entry, index) => `<button type="button" data-context-index="${index}">${escapeHtml(entry[0])}</button>`).join("");
    dom.contextMenu.hidden = false;
    dom.contextMenu.style.left = `${event.clientX}px`;
    dom.contextMenu.style.top = `${event.clientY}px`;
    dom.contextMenu.onclick = async (clickEvent) => {
      const button = clickEvent.target.closest("[data-context-index]");
      if (!button) return;
      hideContextMenu();
      await entries[Number(button.dataset.contextIndex)]?.[1]?.();
    };
  }

  function hideContextMenu() {
    if (dom.contextMenu) dom.contextMenu.hidden = true;
  }

  function handleDocumentClick(event) {
    hideContextMenu();
    document.querySelectorAll(".listmaker-actions-menu[open], .listmaker-bulk-menu[open], .listmaker-row-menu[open]").forEach((menu) => {
      if (!menu.contains(event.target)) menu.removeAttribute("open");
    });
  }

  async function handleHomeAction(event) {
    const button = event.target.closest("[data-list-action]");
    if (!button) return;
    const id = button.dataset.listId;
    const action = button.dataset.listAction;
    const now = new Date().toISOString();
    if (action === "archive") await supabase.from(TABLES.lists).update({ archived_at: now }).eq("id", id).eq("user_id", state.user.id);
    if (action === "unarchive") await supabase.from(TABLES.lists).update({ archived_at: null }).eq("id", id).eq("user_id", state.user.id);
    if (action === "trash") await supabase.from(TABLES.lists).update({ deleted_at: now, deleted_by: state.user.id }).eq("id", id).eq("user_id", state.user.id);
    if (action === "restore") await supabase.from(TABLES.lists).update({ deleted_at: null, deleted_by: null }).eq("id", id).eq("user_id", state.user.id);
    if (action === "delete-forever" && window.confirm("Permanently delete this list?")) await supabase.from(TABLES.lists).delete().eq("id", id).eq("user_id", state.user.id);
    if (action === "duplicate") await duplicateList(id);
    await loadHome();
    renderHome();
  }

  async function duplicateList(id) {
    const list = state.lists.find((row) => row.id === id);
    if (!list) return;
    const { data, error } = await supabase.from(TABLES.lists).insert({
      user_id: state.user.id,
      title: `${list.title} copy`,
      description: list.description,
      template_key: list.template_key,
      behaviors: list.behaviors,
      rating_type: list.rating_type,
      default_view: list.default_view,
      settings: list.settings,
    }).select("*").single();
    if (error) return setStatus(dom.homeStatus, error.message, "error");
    await cloneListChildren(id, data.id);
  }

  async function cloneListChildren(sourceId, targetId) {
    const [cats, stats, fields, items, values] = await Promise.all([
      supabase.from(TABLES.categories).select("*").eq("list_id", sourceId).eq("user_id", state.user.id),
      supabase.from(TABLES.statuses).select("*").eq("list_id", sourceId).eq("user_id", state.user.id),
      supabase.from(TABLES.fields).select("*").eq("list_id", sourceId).eq("user_id", state.user.id),
      supabase.from(TABLES.items).select("*").eq("list_id", sourceId).eq("user_id", state.user.id).is("deleted_at", null),
      supabase.from(TABLES.values).select("*").eq("list_id", sourceId).eq("user_id", state.user.id),
    ]);
    const idMap = new Map();
    async function cloneRows(response, table, mapper) {
      if (response.error || !response.data?.length) return;
      const payload = response.data.map(mapper);
      const { data } = await supabase.from(table).insert(payload).select("*");
      (data || []).forEach((row, index) => idMap.set(response.data[index].id, row.id));
    }
    await cloneRows(cats, TABLES.categories, (row) => ({ list_id: targetId, user_id: state.user.id, name: row.name, sort_order: row.sort_order, collapsed: row.collapsed }));
    await cloneRows(stats, TABLES.statuses, (row) => ({ list_id: targetId, user_id: state.user.id, name: row.name, color: row.color, sort_order: row.sort_order }));
    await cloneRows(fields, TABLES.fields, (row) => ({ list_id: targetId, user_id: state.user.id, name: row.name, field_type: row.field_type, dropdown_options: row.dropdown_options, sort_order: row.sort_order, visible: row.visible }));
    await cloneRows(items, TABLES.items, (row) => ({ list_id: targetId, user_id: state.user.id, title: row.title, completed: row.completed, manual_order: row.manual_order, score: row.score, rating: row.rating, category_id: idMap.get(row.category_id) || null, status_id: idMap.get(row.status_id) || null, notes: row.notes }));
    if (!values.error && values.data?.length) {
      await supabase.from(TABLES.values).insert(values.data.map((row) => ({ list_id: targetId, user_id: state.user.id, item_id: idMap.get(row.item_id), field_id: idMap.get(row.field_id), text_value: row.text_value, number_value: row.number_value, boolean_value: row.boolean_value, date_value: row.date_value })).filter((row) => row.item_id && row.field_id));
    }
  }

  function openIoModal(mode) {
    dom.ioTitle.textContent = mode === "import" ? "Import Items" : "Export List";
    dom.ioContent.innerHTML = mode === "import" ? renderImportContent() : renderExportContent();
    dom.ioModal.hidden = false;
  }

  function closeIoModal() {
    dom.ioModal.hidden = true;
  }

  function renderImportContent() {
    return `
      <label class="form-field"><span>Format</span><select data-import-format><option value="txt">TXT / Plain Text</option><option value="csv">CSV</option><option value="markdown">Markdown</option><option value="json">JSON</option></select></label>
      <textarea class="listmaker-io-textarea" rows="12" placeholder="Paste list data here..." data-import-text></textarea>
      <p class="form-status" data-io-status role="status"></p>
      <div class="modal-actions"><button class="secondary-action" type="button" data-listmaker-io-close>Cancel</button><button class="primary-action" type="button" data-import-run>Import</button></div>
    `;
  }

  function renderExportContent() {
    return `
      <label class="form-field"><span>Format</span><select data-export-format><option value="txt">TXT</option><option value="markdown">Markdown</option><option value="csv">CSV</option><option value="json">JSON</option></select></label>
      <textarea class="listmaker-io-textarea" rows="14" readonly data-export-text>${escapeHtml(exportList("txt"))}</textarea>
      <div class="modal-actions"><button class="secondary-action" type="button" data-export-copy>Copy</button><button class="primary-action" type="button" data-export-download>Download</button></div>
    `;
  }

  async function handleIoClick(event) {
    if (event.target.closest("[data-listmaker-io-close]")) closeIoModal();
    if (event.target.closest("[data-import-run]")) {
      const format = dom.ioContent.querySelector("[data-import-format]").value;
      const textValue = dom.ioContent.querySelector("[data-import-text]").value;
      const rows = importRows(format, textValue);
      if (!rows.length) return setStatus(dom.ioContent.querySelector("[data-io-status]"), "No items found.", "error");
      await addItems(rows);
      closeIoModal();
    }
    const formatSelect = event.target.closest("[data-export-format]");
    if (formatSelect) dom.ioContent.querySelector("[data-export-text]").value = exportList(formatSelect.value);
    if (event.target.closest("[data-export-copy]")) await navigator.clipboard?.writeText(dom.ioContent.querySelector("[data-export-text]").value);
    if (event.target.closest("[data-export-download]")) downloadText(`listmaker-${slug(state.list.title)}.${exportExtension(dom.ioContent.querySelector("[data-export-format]").value)}`, dom.ioContent.querySelector("[data-export-text]").value);
  }

  function importRows(format, value) {
    if (format === "json") {
      try {
        const data = JSON.parse(value);
        if (Array.isArray(data)) return data.map((item) => clean(typeof item === "string" ? item : item.title || item.name)).filter(Boolean);
        if (Array.isArray(data.items)) return data.items.map((item) => clean(item.title || item.name || item)).filter(Boolean);
      } catch {
        return [];
      }
    }
    if (format === "csv") return parseCsv(value).map((row) => clean(row[0])).filter(Boolean);
    return parsePastedItems(value);
  }

  function exportList(format) {
    const rows = visibleItems();
    if (format === "json") {
      return JSON.stringify({
        title: state.list.title,
        description: state.list.description,
        behaviors: state.list.behaviors,
        rating_type: state.list.rating_type,
        fields: state.fields,
        items: rows.map((item) => ({ ...item, field_values: state.fields.reduce((acc, field) => ({ ...acc, [field.name]: fieldValueForExport(item.id, field) }), {}) })),
      }, null, 2);
    }
    if (format === "csv") {
      const headers = ["Title", "Completed", "Score", "Rating", "Category", "Status", ...state.fields.map((field) => field.name)];
      return [headers, ...rows.map((item) => [item.title, item.completed ? "true" : "false", item.score ?? "", item.rating ?? "", categoryName(item.category_id), statusName(item.status_id), ...state.fields.map((field) => fieldValueForExport(item.id, field))])].map(csvLine).join("\n");
    }
    if (format === "markdown") {
      return rows.map((item, index) => `${normalizeBehaviors(state.list.behaviors).checklist ? `- [${item.completed ? "x" : " "}]` : `${index + 1}.`} ${item.title}`).join("\n");
    }
    return rows.map((item) => item.title).join("\n");
  }

  async function updateList(payload) {
    const { error } = await supabase.from(TABLES.lists).update(payload).eq("id", state.listId).eq("user_id", state.user.id);
    if (error) return setStatus(dom.editorStatus, error.message, "error");
    state.list = { ...state.list, ...payload };
  }

  function visibleItems() {
    let rows = state.items.slice();
    const settings = state.list?.settings || {};
    const showingChecked = state.filter === "completed:true";
    if (settings.completedItems === "hide" && normalizeBehaviors(state.list.behaviors).checklist && !showingChecked) rows = rows.filter((item) => !item.completed);
    if (state.search) {
      const query = state.search.toLowerCase();
      rows = rows.filter((item) => searchText(item).includes(query));
    }
    if (state.filter) {
      const [key, value = ""] = state.filter.split(":");
      rows = rows.filter((item) => String(item[key] ?? "") === value);
    }
    rows.sort(compareItems);
    if (settings.completedItems === "bottom" && normalizeBehaviors(state.list.behaviors).checklist && state.sort === "manual") {
      rows.sort((a, b) => Number(a.completed) - Number(b.completed) || compareManual(a, b));
    }
    return rows;
  }

  function compareItems(a, b) {
    if (state.sort === "alpha-asc") return a.title.localeCompare(b.title);
    if (state.sort === "alpha-desc") return b.title.localeCompare(a.title);
    if (state.sort === "created-desc") return new Date(b.created_at) - new Date(a.created_at);
    if (state.sort === "updated-desc") return new Date(b.updated_at) - new Date(a.updated_at);
    if (state.sort === "completed") return Number(a.completed) - Number(b.completed) || compareManual(a, b);
    if (state.sort === "score-desc") return Number(b.score || -Infinity) - Number(a.score || -Infinity);
    if (state.sort === "rating-desc") return Number(b.rating || -Infinity) - Number(a.rating || -Infinity);
    if (state.sort === "status") return statusName(a.status_id).localeCompare(statusName(b.status_id)) || compareManual(a, b);
    if (state.sort === "category") return categoryName(a.category_id).localeCompare(categoryName(b.category_id)) || compareManual(a, b);
    if (state.sort?.startsWith("field:")) {
      const fieldId = state.sort.slice(6);
      const field = state.fields.find((item) => item.id === fieldId);
      return String(fieldValueForExport(a.id, field)).localeCompare(String(fieldValueForExport(b.id, field))) || compareManual(a, b);
    }
    if (state.sort === "random") return Math.random() - 0.5;
    return compareManual(a, b);
  }

  function compareManual(a, b) {
    return Number(a.manual_order || 0) - Number(b.manual_order || 0) || String(a.created_at || "").localeCompare(String(b.created_at || ""));
  }

  async function removeDuplicates() {
    const seen = new Set();
    const duplicateIds = [];
    state.items.forEach((item) => {
      const key = item.title.trim().toLowerCase();
      if (seen.has(key)) duplicateIds.push(item.id);
      else seen.add(key);
    });
    if (duplicateIds.length) await deleteItems(duplicateIds);
  }

  async function removeBlankItems() {
    await deleteItems(state.items.filter((item) => !item.title.trim()).map((item) => item.id));
  }

  async function trimWhitespace() {
    await Promise.all(state.items.map((item) => supabase.from(TABLES.items).update({ title: item.title.trim() }).eq("id", item.id).eq("user_id", state.user.id)));
    await loadList();
    renderEditor();
  }

  async function removeLeadingBullets() {
    await Promise.all(state.items.map((item) => supabase.from(TABLES.items).update({ title: stripLeadingBullet(item.title) }).eq("id", item.id).eq("user_id", state.user.id)));
    await loadList();
    renderEditor();
  }

  async function randomizeItems() {
    await rewriteManualOrder(shuffle(state.items));
  }

  function pickRandomItems() {
    const rows = visibleItems();
    if (!rows.length) return;
    const count = Math.max(1, Number(window.prompt("How many items?", "1")) || 1);
    const chosen = shuffle(rows).slice(0, count);
    state.selectedIds = new Set(chosen.map((item) => item.id));
    setStatus(dom.editorStatus, `Picked: ${chosen.map((item) => item.title).join(", ")}`, "success");
    renderItems();
  }

  async function findAndReplace() {
    const find = window.prompt("Find");
    if (!find) return;
    const replace = window.prompt("Replace with", "") ?? "";
    await Promise.all(state.items.filter((item) => item.title.includes(find)).map((item) => supabase.from(TABLES.items).update({ title: item.title.split(find).join(replace) }).eq("id", item.id).eq("user_id", state.user.id)));
    await loadList();
    renderEditor();
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape") hideContextMenu();
    if (state.mode !== "editor") return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      visibleItems().forEach((item) => state.selectedIds.add(item.id));
      renderItems();
    }
    if (event.key === "Delete" && state.selectedIds.size && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      deleteItems([...state.selectedIds]);
    }
  }

  function parsePastedItems(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(stripLeadingBullet)
      .map(clean)
      .filter(Boolean);
  }

  function stripLeadingBullet(value) {
    return String(value || "").replace(/^\s*(?:[-*+]|\d+[.)]|\[[ xX]\])\s+/, "");
  }

  function collectBehaviorForm(formData) {
    return {
      checklist: Boolean(formData.get("behavior_checklist")),
      ranked: Boolean(formData.get("behavior_ranked")),
      scored: Boolean(formData.get("behavior_scored")),
      categorized: Boolean(formData.get("behavior_categorized")),
      status: Boolean(formData.get("behavior_status")),
      custom_fields: Boolean(formData.get("behavior_custom_fields")),
      rating: Boolean(formData.get("behavior_rating")),
    };
  }

  function normalizeBehaviors(value) {
    return {
      checklist: Boolean(value?.checklist),
      ranked: Boolean(value?.ranked),
      scored: Boolean(value?.scored),
      categorized: Boolean(value?.categorized),
      status: Boolean(value?.status),
      custom_fields: Boolean(value?.custom_fields),
      rating: Boolean(value?.rating),
    };
  }

  function effectiveCustomFieldsEnabled() {
    const behaviors = state.list?.behaviors || {};
    return Boolean(behaviors.custom_fields) || (!hasBehaviorFlag(behaviors, "custom_fields") && Boolean(state.fields.length));
  }

  function effectiveRatingEnabled() {
    const behaviors = state.list?.behaviors || {};
    return Boolean(behaviors.rating) || (!hasBehaviorFlag(behaviors, "rating") && Boolean(state.list?.rating_type));
  }

  function hasBehaviorFlag(behaviors, key) {
    return Boolean(behaviors && Object.prototype.hasOwnProperty.call(behaviors, key));
  }

  function getFieldValue(itemId, fieldId) {
    return state.values.find((value) => value.item_id === itemId && value.field_id === fieldId) || null;
  }

  function fieldValueForExport(itemId, field) {
    const value = getFieldValue(itemId, field?.id);
    if (!value || !field) return "";
    if (field.field_type === "number") return value.number_value ?? "";
    if (field.field_type === "checkbox") return value.boolean_value ? "true" : "false";
    if (field.field_type === "date") return value.date_value || "";
    return value.text_value || "";
  }

  function searchText(item) {
    return [
      item.title,
      item.notes,
      categoryName(item.category_id),
      statusName(item.status_id),
      ...state.fields.map((field) => fieldValueForExport(item.id, field)),
    ].join(" ").toLowerCase();
  }

  function rankFor(item) {
    return state.items.slice().sort(compareManual).findIndex((row) => row.id === item.id) + 1;
  }

  function categoryName(id) {
    return state.categories.find((item) => item.id === id)?.name || "Uncategorized";
  }

  function statusName(id) {
    return state.statuses.find((item) => item.id === id)?.name || "";
  }

  function controlValue(control) {
    if (control.type === "checkbox") return control.checked;
    return control.value;
  }

  function nextOrder(rows) {
    return Math.max(0, ...rows.map((row) => Number(row.sort_order ?? row.manual_order ?? 0))) + 100;
  }

  function collectLines(value) {
    return String(value || "").split(/\r?\n/).map(clean).filter(Boolean);
  }

  function parseCsv(value) {
    return String(value || "").split(/\r?\n/).filter(Boolean).map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
  }

  function csvLine(cells) {
    return cells.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",");
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportExtension(format) {
    return format === "markdown" ? "md" : format;
  }

  function shuffle(rows) {
    return rows.slice().sort(() => Math.random() - 0.5);
  }

  function templateName(key) {
    return TEMPLATES.find((template) => template.key === key)?.name || "Custom";
  }

  function ratingLabel(value) {
    return RATING_TYPES.find((item) => item[0] === value)?.[1] || "Rating";
  }

  function infoTip(message) {
    return `<span class="listmaker-info-tip" title="${escapeAttribute(message)}" aria-label="${escapeAttribute(message)}"><ph-info weight="bold" aria-hidden="true"></ph-info></span>`;
  }

  function behaviorHelp(key) {
    const messages = {
      checklist: "Adds a completion checkbox to each item and enables checklist handling options.",
      ranked: "Adds manual ordering controls for lists where position matters.",
      scored: "Adds a numeric score field to each item.",
      categorized: "Lets items be grouped into named categories.",
      status: "Adds a workflow-style status field to each item.",
      custom_fields: "Lets you define extra fields such as text, numbers, dates, dropdowns, or notes.",
      rating: "Adds a rating control to each item.",
    };
    return messages[key] || "Adds this behavior to the list.";
  }

  function label(value) {
    return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleString() : "Never";
  }

  function setStatus(element, message, type = "") {
    if (!element) return;
    element.textContent = message || "";
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-success", type === "success");
  }

  function readableError(error) {
    return error?.message || String(error || "Unknown error");
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
  }

  function slug(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "list";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
