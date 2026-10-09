(() => {
  const supabase = window.centralisSupabase;
  if (!supabase || !window.crypto?.subtle) return;

  const TABLES = {
    vaults: "secureit_vaults",
    collections: "secureit_collections",
    items: "secureit_items",
  };
  const KDF_ITERATIONS = 310000;
  const ITEM_TYPES = {
    login: {
      label: "Login",
      icon: "ph-identification-card",
      fields: [["website", "Website"], ["username", "Username"], ["password", "Password"], ["service", "Service"], ["key", "Key"], ["environment", "Environment"]],
    },
    api_key: {
      label: "API Key",
      icon: "ph-key",
      fields: [["service", "Service"], ["key", "API Key"], ["environment", "Environment"]],
    },
    secure_note: {
      label: "Secure Note",
      icon: "ph-note",
      fields: [],
    },
    idea: {
      label: "Idea",
      icon: "ph-lightbulb",
      fields: [["topic", "Topic"]],
    },
    custom: {
      label: "Custom",
      icon: "ph-squares-four",
      fields: [["custom_type", "Custom Type"]],
    },
  };
  const DEFAULT_COLLECTION = { name: "General", description: "Default SecureIt collection.", color: "#38bdf8" };
  const DEFAULT_FIELDS = ITEM_TYPES.login.fields;

  const state = {
    user: null,
    vault: null,
    vaultKey: null,
    recoveryKey: "",
    collections: [],
    items: [],
    selectedCollectionId: "all",
    selectedItemId: "",
    search: "",
    typeFilter: "",
    unlocked: false,
    busy: false,
  };

  const dom = {};
  const itemFieldDrafts = new WeakMap();
  let fieldMenuForm = null;
  let customFieldForm = null;

  document.addEventListener("DOMContentLoaded", init);

  function bindDom() {
    dom.locked = document.querySelector("[data-secureit-locked]");
    dom.setup = document.querySelector("[data-secureit-setup]");
    dom.setupForm = document.querySelector("[data-secureit-setup-form]");
    dom.setupStatus = document.querySelector("[data-secureit-setup-status]");
    dom.unlock = document.querySelector("[data-secureit-unlock]");
    dom.unlockForm = document.querySelector("[data-secureit-unlock-form]");
    dom.unlockStatus = document.querySelector("[data-secureit-unlock-status]");
    dom.recovery = document.querySelector("[data-secureit-recovery]");
    dom.recoveryForm = document.querySelector("[data-secureit-recovery-form]");
    dom.recoveryStatus = document.querySelector("[data-secureit-recovery-status]");
    dom.recoveryReveal = document.querySelector("[data-secureit-recovery-reveal]");
    dom.recoveryKey = document.querySelector("[data-secureit-recovery-key]");
    dom.recoveryCopyStatus = document.querySelector("[data-secureit-recovery-copy-status]");
    dom.workspace = document.querySelector("[data-secureit-workspace]");
    dom.unlockedActions = document.querySelector("[data-secureit-unlocked-actions]");
    dom.collections = document.querySelector("[data-secureit-collections]");
    dom.items = document.querySelector("[data-secureit-items]");
    dom.detail = document.querySelector("[data-secureit-detail]");
    dom.status = document.querySelector("[data-secureit-status]");
    dom.listTitle = document.querySelector("[data-secureit-list-title]");
    dom.search = document.querySelector("[data-secureit-search]");
    dom.typeFilter = document.querySelector("[data-secureit-type-filter]");
    dom.collectionModal = document.getElementById("secureit-collection-modal");
    dom.collectionForm = document.querySelector("[data-secureit-collection-form]");
    dom.collectionTitle = document.querySelector("[data-secureit-collection-title]");
    dom.collectionStatus = document.querySelector("[data-secureit-collection-status]");
    dom.deleteCollection = document.querySelector("[data-secureit-delete-collection]");
    dom.fieldMenu = document.getElementById("secureit-add-field-menu");
    dom.defaultFieldsMenu = document.getElementById("secureit-default-fields-menu");
    dom.defaultFieldsToggle = document.querySelector("[data-secureit-default-fields-toggle]");
    dom.defaultFieldOptions = document.querySelector("[data-secureit-default-field-options]");
    dom.fieldDialog = document.getElementById("secureit-field-dialog");
    dom.fieldForm = document.querySelector("[data-secureit-field-form]");
    dom.fieldStatus = document.querySelector("[data-secureit-field-status]");
  }

  function bindEvents() {
    dom.setupForm?.addEventListener("submit", handleSetup);
    dom.unlockForm?.addEventListener("submit", handleUnlock);
    dom.recoveryForm?.addEventListener("submit", handleRecovery);
    document.querySelector("[data-secureit-recovery-open]")?.addEventListener("click", showRecovery);
    document.querySelector("[data-secureit-recovery-cancel]")?.addEventListener("click", showUnlock);
    document.querySelector("[data-secureit-copy-recovery-key]")?.addEventListener("click", copyRecoveryKey);
    document.querySelector("[data-secureit-recovery-saved]")?.addEventListener("click", finishRecoveryReveal);
    document.querySelector("[data-secureit-lock]")?.addEventListener("click", lockVault);
    document.querySelector("[data-secureit-new-item]")?.addEventListener("click", () => openItemEditor());
    document.querySelector("[data-secureit-new-collection]")?.addEventListener("click", () => openCollectionModal());
    document.querySelectorAll("[data-secureit-collection-close]").forEach((button) => button.addEventListener("click", closeCollectionModal));
    dom.collectionForm?.addEventListener("submit", handleCollectionSubmit);
    dom.deleteCollection?.addEventListener("click", handleDeleteCollection);
    dom.collections?.addEventListener("click", handleCollectionClick);
    dom.items?.addEventListener("click", handleItemClick);
    dom.detail?.addEventListener("submit", handleItemSubmit);
    dom.detail?.addEventListener("click", handleDetailClick);
    dom.detail?.addEventListener("change", handleDetailChange);
    dom.fieldMenu?.addEventListener("click", handleFieldMenuClick);
    dom.fieldMenu?.addEventListener("keydown", handleFieldMenuKeydown);
    dom.fieldMenu?.addEventListener("toggle", (event) => {
      if (event.newState === "closed") {
        fieldMenuForm?.querySelector("[data-secureit-add-field]")?.setAttribute("aria-expanded", "false");
        fieldMenuForm = null;
        showDefaultFields(false);
      }
    });
    dom.defaultFieldsToggle?.addEventListener("mouseenter", () => {
      if (window.innerWidth > 560) showDefaultFields(true);
    });
    dom.fieldForm?.addEventListener("submit", handleCustomFieldSubmit);
    dom.fieldForm?.addEventListener("change", syncCustomFieldOptions);
    document.querySelectorAll("[data-secureit-field-cancel]").forEach((button) => button.addEventListener("click", () => dom.fieldDialog.close()));
    dom.fieldDialog?.addEventListener("close", () => {
      customFieldForm?.querySelector("[data-secureit-add-field]")?.focus({ preventScroll: true });
      customFieldForm = null;
      dom.fieldForm.reset();
    });
    window.addEventListener("resize", () => closeFieldMenu());
    dom.detail?.addEventListener("scroll", () => positionFieldMenu(), true);
    document.querySelector(".secureit-page")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-secureit-reveal-secret]");
      if (button) setSecretVisibility(button, button.getAttribute("aria-pressed") !== "true");
    });
    dom.search?.addEventListener("input", () => {
      state.search = dom.search.value.trim().toLowerCase();
      renderItems();
    });
    dom.typeFilter?.addEventListener("change", () => {
      state.typeFilter = dom.typeFilter.value;
      renderItems();
    });
  }

  async function init() {
    bindDom();
    bindEvents();
    const header = document.querySelector(".site-header");
    if (header) {
      new ResizeObserver(() => {
        document.body.style.setProperty("--secureit-header-height", `${header.getBoundingClientRect().height}px`);
      }).observe(header);
    }
    try {
      await waitForAuth();
      state.user = await window.centralisGetCurrentAppUser();
      if (!state.user?.id) return;
      await loadVault();
      renderLockState();
    } catch (error) {
      setStatus(dom.unlockStatus || dom.setupStatus, `Could not load SecureIt: ${readableError(error)}`, "error");
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitForAuth() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (window.centralisSupabase && window.centralisGetCurrentAppUser) return;
      await sleep(50);
    }
    throw new Error("Centralis auth did not initialize.");
  }

  function setStatus(node, message, type = "") {
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", type === "error");
    node.classList.toggle("is-success", type === "success");
  }

  function readableError(error) {
    return error?.message || error?.details || error?.hint || String(error || "Unknown error");
  }

  function setSecretVisibility(button, visible) {
    const input = button.closest(".secureit-secret-field")?.querySelector("input");
    if (!input) return;
    input.type = visible ? "text" : "password";
    const label = `${visible ? "Hide" : "Show"} ${/^(passphrase|confirm)$/.test(input.name) ? "passphrase" : "field"}`;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-pressed", String(visible));
    button.innerHTML = visible
      ? '<ph-eye-slash weight="bold" aria-hidden="true"></ph-eye-slash>'
      : '<ph-eye weight="bold" aria-hidden="true"></ph-eye>';
  }

  function resetSecretForm(form) {
    form.reset();
    form.querySelectorAll("[data-secureit-reveal-secret]").forEach((button) => setSecretVisibility(button, false));
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll('"', "&quot;").replaceAll("`", "&#096;");
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes(length = 32) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function recoveryKeyFromBytes(bytes) {
    return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
  }

  function recoveryKeyToBytes(value) {
    const clean = String(value || "").trim().replaceAll("-", "+").replaceAll("_", "/");
    const padded = `${clean}${"=".repeat((4 - (clean.length % 4)) % 4)}`;
    return base64ToBytes(padded);
  }

  async function importAesKey(bytes, usages = ["encrypt", "decrypt"]) {
    return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, usages);
  }

  async function deriveWrappingKey(secret, saltBase64, iterations = KDF_ITERATIONS) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: base64ToBytes(saltBase64), iterations: Number(iterations || KDF_ITERATIONS), hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptBytes(key, bytes) {
    const iv = randomBytes(12);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
    return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)) };
  }

  async function decryptBytes(key, payload) {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(payload?.iv) },
      key,
      base64ToBytes(payload?.ciphertext)
    );
    return new Uint8Array(decrypted);
  }

  async function encryptJson(value) {
    if (!state.vaultKey) throw new Error("SecureIt is locked.");
    const bytes = new TextEncoder().encode(JSON.stringify(value || {}));
    return encryptBytes(state.vaultKey, bytes);
  }

  async function decryptJson(payload) {
    if (!state.vaultKey) throw new Error("SecureIt is locked.");
    const bytes = await decryptBytes(state.vaultKey, payload);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function wrapVaultKey(vaultKeyBytes, secret, saltBase64, iterations = KDF_ITERATIONS) {
    const wrappingKey = await deriveWrappingKey(secret, saltBase64, iterations);
    return encryptBytes(wrappingKey, vaultKeyBytes);
  }

  async function unwrapVaultKey(wrappedKey, secret, saltBase64, iterations = KDF_ITERATIONS) {
    const wrappingKey = await deriveWrappingKey(secret, saltBase64, iterations);
    const keyBytes = await decryptBytes(wrappingKey, wrappedKey);
    return importAesKey(keyBytes);
  }

  async function loadVault() {
    const { data, error } = await supabase
      .from(TABLES.vaults)
      .select("*")
      .eq("user_id", state.user.id)
      .eq("deleted", false)
      .maybeSingle();
    if (error) throw error;
    state.vault = data || null;
  }

  function renderLockState() {
    dom.workspace.hidden = true;
    dom.unlockedActions.hidden = true;
    dom.recoveryReveal.hidden = true;
    dom.locked.hidden = false;
    dom.setup.hidden = Boolean(state.vault);
    dom.unlock.hidden = !state.vault;
    dom.recovery.hidden = true;
  }

  function showUnlock() {
    dom.setup.hidden = true;
    dom.unlock.hidden = false;
    dom.recovery.hidden = true;
  }

  function showRecovery() {
    dom.unlock.hidden = true;
    dom.recovery.hidden = false;
    setStatus(dom.recoveryStatus, "");
  }

  async function handleSetup(event) {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const passphrase = form.elements.passphrase.value;
    const confirm = form.elements.confirm.value;
    if (passphrase.length < 10) return setStatus(dom.setupStatus, "Use at least 10 characters.", "error");
    if (passphrase !== confirm) return setStatus(dom.setupStatus, "Passphrases do not match.", "error");
    state.busy = true;
    setStatus(dom.setupStatus, "Creating encrypted vault...");
    try {
      const vaultKeyBytes = randomBytes(32);
      const recoveryBytes = randomBytes(32);
      const recoveryKey = recoveryKeyFromBytes(recoveryBytes);
      const salt = bytesToBase64(randomBytes(16));
      const recoverySalt = bytesToBase64(randomBytes(16));
      const wrappedKey = await wrapVaultKey(vaultKeyBytes, passphrase, salt);
      const recoveryWrappedKey = await wrapVaultKey(vaultKeyBytes, recoveryKey, recoverySalt);
      const { data, error } = await supabase.from(TABLES.vaults).insert({
        user_id: state.user.id,
        kdf: "PBKDF2-SHA256",
        kdf_iterations: KDF_ITERATIONS,
        salt,
        wrapped_key: wrappedKey,
        recovery_salt: recoverySalt,
        recovery_wrapped_key: recoveryWrappedKey,
      }).select("*").single();
      if (error) throw error;
      state.vault = data;
      state.vaultKey = await importAesKey(vaultKeyBytes);
      state.recoveryKey = recoveryKey;
      state.unlocked = true;
      await createDefaultCollection();
      await loadEncryptedData();
      resetSecretForm(form);
      showRecoveryKey();
    } catch (error) {
      setStatus(dom.setupStatus, readableError(error), "error");
    } finally {
      state.busy = false;
    }
  }

  async function handleUnlock(event) {
    event.preventDefault();
    if (state.busy || !state.vault) return;
    // currentTarget is cleared once the submit listener yields to async work.
    const form = event.currentTarget;
    const passphrase = form.elements.passphrase.value;
    const submit = form.querySelector('[type="submit"]');
    let decrypted = false;
    state.busy = true;
    submit.disabled = true;
    setStatus(dom.unlockStatus, "Unlocking...");
    try {
      state.vaultKey = await unwrapVaultKey(state.vault.wrapped_key, passphrase, state.vault.salt, state.vault.kdf_iterations);
      decrypted = true;
      await loadEncryptedData();
      state.unlocked = true;
      resetSecretForm(form);
      setStatus(dom.unlockStatus, "");
      showWorkspace();
    } catch (error) {
      state.vaultKey = null;
      state.unlocked = false;
      state.collections = [];
      state.items = [];
      const message = !decrypted && error?.name === "OperationError"
        ? "That passphrase could not unlock this vault."
        : `Could not load your vault: ${readableError(error)}`;
      setStatus(dom.unlockStatus, message, "error");
    } finally {
      state.busy = false;
      submit.disabled = false;
    }
  }

  async function handleRecovery(event) {
    event.preventDefault();
    if (state.busy || !state.vault) return;
    const form = event.currentTarget;
    const recovery = form.elements.recovery.value.trim();
    const passphrase = form.elements.passphrase.value;
    const confirm = form.elements.confirm.value;
    if (passphrase.length < 10) return setStatus(dom.recoveryStatus, "Use at least 10 characters.", "error");
    if (passphrase !== confirm) return setStatus(dom.recoveryStatus, "Passphrases do not match.", "error");
    state.busy = true;
    setStatus(dom.recoveryStatus, "Resetting passphrase...");
    try {
      state.vaultKey = await unwrapVaultKey(state.vault.recovery_wrapped_key, recovery, state.vault.recovery_salt, state.vault.kdf_iterations);
      const salt = bytesToBase64(randomBytes(16));
      const vaultKeyBytes = await decryptBytes(await deriveWrappingKey(recovery, state.vault.recovery_salt, state.vault.kdf_iterations), state.vault.recovery_wrapped_key);
      const wrappedKey = await wrapVaultKey(vaultKeyBytes, passphrase, salt, state.vault.kdf_iterations);
      const { data, error } = await supabase
        .from(TABLES.vaults)
        .update({ salt, wrapped_key: wrappedKey })
        .eq("id", state.vault.id)
        .eq("user_id", state.user.id)
        .select("*")
        .single();
      if (error) throw error;
      state.vault = data;
      state.unlocked = true;
      await loadEncryptedData();
      resetSecretForm(form);
      showWorkspace();
    } catch {
      setStatus(dom.recoveryStatus, "That recovery key could not reset this vault.", "error");
    } finally {
      state.busy = false;
    }
  }

  function showRecoveryKey() {
    dom.locked.hidden = true;
    dom.recoveryReveal.hidden = false;
    dom.workspace.hidden = true;
    dom.unlockedActions.hidden = true;
    setStatus(dom.recoveryCopyStatus, "");
    dom.recoveryKey.textContent = state.recoveryKey;
  }

  async function copyRecoveryKey() {
    if (!state.recoveryKey) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable.");
      await navigator.clipboard.writeText(state.recoveryKey);
      setStatus(dom.recoveryCopyStatus, "Recovery key copied.", "success");
    } catch {
      setStatus(dom.recoveryCopyStatus, "Copy failed. Select the key and copy it manually.", "error");
    }
  }

  function finishRecoveryReveal() {
    state.recoveryKey = "";
    dom.recoveryKey.textContent = "";
    setStatus(dom.recoveryCopyStatus, "");
    showWorkspace();
  }

  function showWorkspace() {
    dom.locked.hidden = true;
    dom.recoveryReveal.hidden = true;
    dom.workspace.hidden = false;
    dom.unlockedActions.hidden = false;
    renderAll();
  }

  function lockVault() {
    state.vaultKey = null;
    state.collections = [];
    state.items = [];
    state.selectedCollectionId = "all";
    state.selectedItemId = "";
    state.unlocked = false;
    dom.collections.replaceChildren();
    dom.items.replaceChildren();
    dom.detail.replaceChildren();
    resetSecretForm(dom.unlockForm);
    setStatus(dom.unlockStatus, "");
    renderLockState();
  }

  async function createDefaultCollection() {
    const encryptedPayload = await encryptJson(DEFAULT_COLLECTION);
    const { error } = await supabase.from(TABLES.collections).insert({
      user_id: state.user.id,
      encrypted_payload: encryptedPayload,
      sort_order: 0,
    });
    if (error) throw error;
  }

  async function loadEncryptedData() {
    const [collectionsResponse, itemsResponse] = await Promise.all([
      supabase.from(TABLES.collections).select("*").eq("user_id", state.user.id).eq("deleted", false).order("sort_order"),
      supabase.from(TABLES.items).select("*").eq("user_id", state.user.id).eq("deleted", false).order("sort_order"),
    ]);
    if (collectionsResponse.error) throw collectionsResponse.error;
    if (itemsResponse.error) throw itemsResponse.error;
    state.collections = [];
    state.items = [];
    for (const row of collectionsResponse.data || []) {
      state.collections.push({ ...row, payload: await decryptJson(row.encrypted_payload) });
    }
    for (const row of itemsResponse.data || []) {
      state.items.push({ ...row, payload: await decryptJson(row.encrypted_payload) });
    }
    if (!state.collections.length) {
      await createDefaultCollection();
      return loadEncryptedData();
    }
    if (!state.collections.some((collection) => collection.id === state.selectedCollectionId)) {
      state.selectedCollectionId = "all";
    }
  }

  function renderAll() {
    renderCollections();
    renderItems();
    renderDetail();
  }

  function collectionName(collection) {
    return collection?.payload?.name || "Untitled Collection";
  }

  function typeLabel(type) {
    return ITEM_TYPES[type]?.label || "Custom";
  }

  function itemTitle(item) {
    return item?.payload?.title || "Untitled Item";
  }

  function renderCollections() {
    const allCount = state.items.length;
    dom.collections.innerHTML = `
      <button class="secureit-collection ${state.selectedCollectionId === "all" ? "is-active" : ""}" type="button" data-secureit-collection-id="all" aria-pressed="${state.selectedCollectionId === "all"}">
        <ph-squares-four class="secureit-collection-icon" weight="duotone" aria-hidden="true"></ph-squares-four>
        <strong>All Items</strong><span class="secureit-collection-count">${allCount}</span>
      </button>
      ${state.collections.map((collection) => {
        const count = state.items.filter((item) => item.collection_id === collection.id).length;
        const color = collection.payload?.color || "#38bdf8";
        return `
          <div class="secureit-collection-row">
            <button class="secureit-collection ${state.selectedCollectionId === collection.id ? "is-active" : ""}" type="button" data-secureit-collection-id="${escapeAttr(collection.id)}" aria-pressed="${state.selectedCollectionId === collection.id}" title="${escapeAttr(collectionName(collection))}">
              <ph-folder class="secureit-collection-icon" weight="duotone" aria-hidden="true" style="--secureit-color:${escapeAttr(color)}"></ph-folder>
              <strong>${escapeHtml(collectionName(collection))}</strong><span class="secureit-collection-count">${count}</span>
            </button>
            <button class="icon-button" type="button" data-secureit-edit-collection="${escapeAttr(collection.id)}" aria-label="Edit ${escapeAttr(collectionName(collection))}" title="Edit collection">
              <ph-pencil-simple weight="bold" aria-hidden="true"></ph-pencil-simple>
            </button>
          </div>
        `;
      }).join("")}
    `;
  }

  function visibleItems() {
    return state.items
      .filter((item) => state.selectedCollectionId === "all" || item.collection_id === state.selectedCollectionId)
      .filter((item) => !state.typeFilter || item.payload?.type === state.typeFilter)
      .filter((item) => {
        if (!state.search) return true;
        const haystack = [
          item.payload?.title,
          typeLabel(item.payload?.type),
          item.payload?.notes,
          item.payload?.customType,
          ...Object.values(item.payload?.fields || {}),
          collectionName(state.collections.find((collection) => collection.id === item.collection_id)),
        ].join(" ").toLowerCase();
        return haystack.includes(state.search);
      })
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  }

  function renderItems() {
    const items = visibleItems();
    dom.listTitle.textContent = state.selectedCollectionId === "all"
      ? "All Items"
      : collectionName(state.collections.find((collection) => collection.id === state.selectedCollectionId));
    setStatus(dom.status, `${items.length} ${items.length === 1 ? "item" : "items"}`);
    if (!items.length) {
      const filtered = Boolean(state.search || state.typeFilter);
      dom.items.innerHTML = `
        <div class="secureit-empty">
          <ph-${filtered ? "magnifying-glass" : "folder"} weight="duotone" aria-hidden="true"></ph-${filtered ? "magnifying-glass" : "folder"}>
          <h3>${filtered ? "No matching items" : "No items yet"}</h3>
          ${filtered ? '<button class="secondary-action" type="button" data-secureit-clear-filters>Clear Filters</button>' : '<button class="primary-action" type="button" data-secureit-empty-new><ph-plus weight="bold" aria-hidden="true"></ph-plus><span>New Item</span></button>'}
        </div>
      `;
      dom.items.querySelector("[data-secureit-empty-new]")?.addEventListener("click", () => openItemEditor());
      dom.items.querySelector("[data-secureit-clear-filters]")?.addEventListener("click", () => {
        state.search = "";
        state.typeFilter = "";
        dom.search.value = "";
        dom.typeFilter.value = "";
        renderItems();
      });
      return;
    }
    dom.items.innerHTML = items.map((item) => {
      const type = item.payload?.type || "custom";
      const collection = state.collections.find((candidate) => candidate.id === item.collection_id);
      return `
        <button class="secureit-item-card ${state.selectedItemId === item.id ? "is-active" : ""}" type="button" data-secureit-item-id="${escapeAttr(item.id)}" aria-pressed="${state.selectedItemId === item.id}">
          <span class="secureit-item-icon" aria-hidden="true"><${ITEM_TYPES[type]?.icon || "ph-squares-four"} weight="duotone"></${ITEM_TYPES[type]?.icon || "ph-squares-four"}></span>
          <span>
            <strong>${escapeHtml(itemTitle(item))}</strong>
            <em>${escapeHtml(typeLabel(type))} · ${escapeHtml(collectionName(collection))}</em>
          </span>
        </button>
      `;
    }).join("");
  }

  function renderDetail() {
    const item = state.items.find((candidate) => candidate.id === state.selectedItemId);
    if (!item) {
      dom.workspace.classList.toggle("is-editing", false);
      dom.detail.innerHTML = '<div class="secureit-detail-heading"><h2>Item Details</h2></div><div class="secureit-empty-detail"><ph-shield-check weight="duotone" aria-hidden="true"></ph-shield-check><h3>No item selected</h3></div>';
      return;
    }
    renderItemEditor(item);
  }

  function itemTypeFields(type, payload = {}) {
    const fields = [...(ITEM_TYPES[type]?.fields || [])];
    if (type !== "custom") return fields;
    return fields.concat(customFieldDefinitions(payload).map(({ key, label, kind, copyButton, passwordBehavior }) => [key, label, kind, copyButton, passwordBehavior]));
  }

  function customFieldDefinitions(payload = {}) {
    // Keep populated fields on older Custom items, but never inherit a different type's fields.
    const definitions = Array.isArray(payload.customFields) ? payload.customFields
      : payload.type === "custom" ? Object.entries(payload.fields || {})
        .filter(([key, value]) => key !== "custom_type" && (!DEFAULT_FIELDS.some(([name]) => name === key) || value !== ""))
        .map(([key]) => ({ key, label: labelFromKey(key), kind: "text" })) : [];
    const seen = new Set(["custom_type"]);
    return definitions.filter((field) => {
      if (!field || typeof field.key !== "string" || !field.key || seen.has(field.key)) return false;
      seen.add(field.key);
      return true;
    }).map((field) => {
      const kind = field.kind === "multiline" ? "multiline" : "text";
      // Fields saved before these options existed retain their copy and masking behavior.
      const passwordBehavior = kind !== "multiline" && (typeof field.passwordBehavior === "boolean" ? field.passwordBehavior : /password|key|token|secret/i.test(field.key));
      return {
        key: field.key,
        label: String(field.label || labelFromKey(field.key)),
        kind,
        copyButton: passwordBehavior || field.copyButton !== false,
        passwordBehavior,
      };
    });
  }

  function captureItemDraft(form) {
    const draft = itemFieldDrafts.get(form) || { fields: {}, customFields: [] };
    [...form.elements].forEach((element) => {
      if (element.name?.startsWith("field:")) draft.fields[element.name.slice(6)] = element.value;
    });
    itemFieldDrafts.set(form, draft);
    return draft;
  }

  function labelFromKey(key) {
    return String(key || "Field").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function renderItemEditor(item = null) {
    const payload = item?.payload || { type: "login", title: "", fields: {}, notes: "" };
    const type = payload.type || "login";
    state.selectedItemId = item?.id || "";
    dom.workspace.classList.toggle("is-editing", true);
    dom.detail.innerHTML = `
      <form class="secureit-editor" data-secureit-item-form>
        <input type="hidden" name="item_id" value="${escapeAttr(item?.id || "")}">
        <header>
          <div>
            <p class="settings-eyebrow">${item ? "Edit SecureIt Item" : "New SecureIt Item"}</p>
            <h2>${escapeHtml(item ? itemTitle(item) : "New Item")}</h2>
          </div>
          <div class="secureit-editor-tools">
            ${item ? '<button class="icon-button danger-action" type="button" data-secureit-delete-item title="Delete item" aria-label="Delete item"><ph-trash weight="bold" aria-hidden="true"></ph-trash></button>' : ""}
            <button class="icon-button" type="button" data-secureit-close-item title="Close item" aria-label="Close item"><ph-x weight="bold" aria-hidden="true"></ph-x></button>
          </div>
        </header>
        <div class="secureit-editor-fields">
          <label class="form-field">
            <span>Type</span>
            <select name="type" data-secureit-item-type>
              ${Object.entries(ITEM_TYPES).map(([key, config]) => `<option value="${escapeAttr(key)}"${key === type ? " selected" : ""}>${escapeHtml(config.label)}</option>`).join("")}
            </select>
          </label>
          <label class="form-field">
            <span>Title</span>
            <input type="text" name="title" maxlength="180" required autocomplete="off" value="${escapeAttr(payload.title || "")}">
          </label>
          <label class="form-field">
            <span>Collection</span>
            <select name="collection_id">
              ${state.collections.map((collection) => `<option value="${escapeAttr(collection.id)}"${collection.id === (item?.collection_id || selectedCollectionForNewItem()) ? " selected" : ""}>${escapeHtml(collectionName(collection))}</option>`).join("")}
            </select>
          </label>
          <div class="secureit-field-grid" data-secureit-type-fields>
            ${renderTypeFields(type, payload)}
          </div>
          <label class="form-field">
            <span data-secureit-notes-label>${type === "idea" ? "Idea" : "Notes"}</span>
            <textarea name="notes" rows="5">${escapeHtml(payload.notes || "")}</textarea>
          </label>
          <div class="secureit-add-field" data-secureit-add-field-row${type === "custom" ? "" : " hidden"}>
            <button class="secondary-action" type="button" data-secureit-add-field aria-haspopup="menu" aria-expanded="false" aria-controls="secureit-add-field-menu"><ph-plus weight="bold" aria-hidden="true"></ph-plus>Add Field<ph-caret-down weight="bold" aria-hidden="true"></ph-caret-down></button>
          </div>
          <p class="form-status" data-secureit-item-status role="status"></p>
        </div>
        <div class="secureit-editor-actions">
          ${item ? '<button class="icon-button" type="button" data-secureit-copy-json title="Copy decrypted JSON" aria-label="Copy decrypted JSON"><ph-copy weight="bold" aria-hidden="true"></ph-copy></button>' : ""}
          <button class="secondary-action" type="button" data-secureit-cancel-item>Cancel</button>
          <button class="primary-action" type="submit"><ph-${item ? "floppy-disk" : "plus"} weight="bold" aria-hidden="true"></ph-${item ? "floppy-disk" : "plus"}>${item ? "Save Item" : "Create Item"}</button>
        </div>
      </form>
    `;
    const form = dom.detail.querySelector("[data-secureit-item-form]");
    itemFieldDrafts.set(form, { fields: { ...payload.fields }, customFields: customFieldDefinitions(payload) });
  }

  function openItemEditor(item = null) {
    renderItemEditor(item);
    renderItems();
    dom.detail.querySelector('[name="title"]')?.focus({ preventScroll: true });
  }

  function selectedCollectionForNewItem() {
    return state.selectedCollectionId !== "all" ? state.selectedCollectionId : state.collections[0]?.id || "";
  }

  function renderTypeFields(type, payload = {}) {
    const fields = itemTypeFields(type, payload);
    if (!fields.length) return "";
    return fields.map(([key, label, kind, copyButton, passwordBehavior]) => {
      const value = payload.fields?.[key] || "";
      const isMultiline = kind === "multiline";
      const isSecret = !isMultiline && (type === "custom" ? passwordBehavior === true : /password|key|token|secret/i.test(key));
      const canCopy = type === "login" || type === "api_key" || (type === "custom" && copyButton === true);
      const hasInlineActions = !isMultiline && (isSecret || canCopy);
      const copyAction = canCopy ? `<button class="icon-button" type="button" data-secureit-copy-field="${escapeAttr(label)}" aria-label="Copy ${escapeAttr(label)}" title="Copy ${escapeAttr(label)}"><ph-copy weight="bold" aria-hidden="true"></ph-copy></button>` : "";
      return `
        <div class="form-field">
          <div class="secureit-field-label">
            <label for="secureit-field-${escapeAttr(key)}">${escapeHtml(label)}</label>
            ${type === "custom" && key !== "custom_type" ? `<div class="secureit-field-actions"><button class="icon-button" type="button" data-secureit-remove-field="${escapeAttr(key)}" title="Remove ${escapeAttr(label)}" aria-label="Remove ${escapeAttr(label)}"><ph-minus weight="bold" aria-hidden="true"></ph-minus></button>${isMultiline ? copyAction : ""}</div>` : ""}
          </div>
          ${hasInlineActions ? `<div class="${isSecret ? "secureit-secret-field " : ""}${canCopy ? "secureit-copy-field" : ""}">` : ""}
            ${isMultiline ? `<textarea id="secureit-field-${escapeAttr(key)}" name="field:${escapeAttr(key)}" rows="4">${escapeHtml(value)}</textarea>` : `<input id="secureit-field-${escapeAttr(key)}" type="${isSecret ? "password" : "text"}" name="field:${escapeAttr(key)}" autocomplete="off" value="${escapeAttr(value)}">`}
            ${isSecret ? '<button class="icon-button" type="button" data-secureit-reveal-secret aria-label="Show field" title="Show field" aria-pressed="false"><ph-eye weight="bold" aria-hidden="true"></ph-eye></button>' : ""}
            ${!isMultiline ? copyAction : ""}
          ${hasInlineActions ? "</div>" : ""}
        </div>
      `;
    }).join("");
  }

  async function handleCollectionClick(event) {
    const editButton = event.target.closest("[data-secureit-edit-collection]");
    if (editButton) {
      const collection = state.collections.find((candidate) => candidate.id === editButton.dataset.secureitEditCollection);
      if (collection) openCollectionModal(collection);
      return;
    }
    const button = event.target.closest("[data-secureit-collection-id]");
    if (!button) return;
    state.selectedCollectionId = button.dataset.secureitCollectionId || "all";
    state.selectedItemId = "";
    renderAll();
  }

  function handleItemClick(event) {
    const button = event.target.closest("[data-secureit-item-id]");
    if (!button) return;
    const item = state.items.find((candidate) => candidate.id === button.dataset.secureitItemId);
    if (item) openItemEditor(item);
  }

  function handleDetailChange(event) {
    if (event.target.matches("[data-secureit-item-type]")) {
      const form = event.target.closest("[data-secureit-item-form]");
      const draft = captureItemDraft(form);
      form.querySelector("[data-secureit-type-fields]").innerHTML = renderTypeFields(event.target.value, draft);
      form.querySelector("[data-secureit-notes-label]").textContent = event.target.value === "idea" ? "Idea" : "Notes";
      form.querySelector("[data-secureit-add-field-row]").hidden = event.target.value !== "custom";
      setStatus(form.querySelector("[data-secureit-item-status]"), "");
    }
  }

  function handleDetailClick(event) {
    const addField = event.target.closest("[data-secureit-add-field]");
    if (addField) {
      openFieldMenu(addField);
      return;
    }
    const removeField = event.target.closest("[data-secureit-remove-field]");
    if (removeField) {
      const form = removeField.closest("[data-secureit-item-form]");
      const draft = captureItemDraft(form);
      draft.customFields = draft.customFields.filter((field) => field.key !== removeField.dataset.secureitRemoveField);
      renderCustomDraft(form);
      form.querySelector("[data-secureit-add-field]")?.focus({ preventScroll: true });
      return;
    }
    const copyField = event.target.closest("[data-secureit-copy-field]");
    if (copyField) {
      copyItemField(copyField);
      return;
    }
    if (event.target.closest("[data-secureit-close-item]")) {
      state.selectedItemId = "";
      renderItems();
      renderDetail();
      return;
    }
    if (event.target.closest("[data-secureit-cancel-item]")) {
      renderDetail();
      return;
    }
    if (event.target.closest("[data-secureit-delete-item]")) {
      deleteSelectedItem();
      return;
    }
    if (event.target.closest("[data-secureit-copy-json]")) {
      copySelectedItemJson(event.target.closest("[data-secureit-item-form]"));
    }
  }

  function closeFieldMenu() {
    if (!dom.fieldMenu?.matches(":popover-open")) return;
    dom.fieldMenu.hidePopover();
  }

  function openFieldMenu(button) {
    if (dom.fieldMenu.matches(":popover-open")) return closeFieldMenu();
    fieldMenuForm = button.closest("[data-secureit-item-form]");
    const draft = captureItemDraft(fieldMenuForm);
    dom.defaultFieldOptions.innerHTML = DEFAULT_FIELDS.map(([key, label]) => {
      const exists = draft.customFields.some((field) => field.key === key || field.label.toLowerCase() === label.toLowerCase());
      return `<button type="button" role="menuitem" data-secureit-default-field="${key}"${exists ? ' disabled title="Already added"' : ""}>${label}</button>`;
    }).join("");
    showDefaultFields(false);
    dom.fieldMenu.showPopover();
    button.setAttribute("aria-expanded", "true");
    positionFieldMenu();
    dom.fieldMenu.querySelector("[data-secureit-custom-field-open]").focus({ preventScroll: true });
  }

  function positionFieldMenu() {
    if (!dom.fieldMenu?.matches(":popover-open")) return;
    const button = fieldMenuForm?.querySelector("[data-secureit-add-field]");
    if (!button) return closeFieldMenu();
    const anchor = button.getBoundingClientRect();
    const menu = dom.fieldMenu.getBoundingClientRect();
    dom.fieldMenu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - menu.width - 8))}px`;
    dom.fieldMenu.style.top = `${Math.max(8, anchor.bottom + menu.height + 8 <= window.innerHeight ? anchor.bottom + 4 : anchor.top - menu.height - 4)}px`;
    if (!dom.defaultFieldsMenu.hidden) showDefaultFields(true);
  }

  function showDefaultFields(open) {
    dom.defaultFieldsMenu.hidden = !open;
    dom.defaultFieldsToggle.setAttribute("aria-expanded", String(open));
    dom.fieldMenu.classList.toggle("is-submenu-open", open);
    if (!open) return;
    if (window.innerWidth <= 560) {
      const menu = dom.fieldMenu.getBoundingClientRect();
      dom.fieldMenu.style.top = `${Math.max(8, Math.min(menu.top, window.innerHeight - menu.height - 8))}px`;
      return;
    }
    const anchor = dom.fieldMenu.getBoundingClientRect();
    const menu = dom.defaultFieldsMenu.getBoundingClientRect();
    const left = anchor.left >= menu.width + 12 ? anchor.left - menu.width - 4 : anchor.right + 4;
    dom.defaultFieldsMenu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - menu.width - 8))}px`;
    dom.defaultFieldsMenu.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - menu.height - 8))}px`;
  }

  function handleFieldMenuClick(event) {
    if (event.target.closest("[data-secureit-default-fields-toggle]")) {
      showDefaultFields(true);
      dom.defaultFieldsMenu.querySelector("[data-secureit-default-field]:not(:disabled)")?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest("[data-secureit-default-fields-back]")) {
      showDefaultFields(false);
      dom.defaultFieldsToggle.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest("[data-secureit-custom-field-open]")) {
      customFieldForm = fieldMenuForm;
      closeFieldMenu();
      dom.fieldForm.reset();
      syncCustomFieldOptions();
      setStatus(dom.fieldStatus, "");
      dom.fieldDialog.showModal();
      return;
    }
    const button = event.target.closest("[data-secureit-default-field]");
    if (!button || button.disabled) return;
    const field = DEFAULT_FIELDS.find(([key]) => key === button.dataset.secureitDefaultField);
    if (field) addCustomField(fieldMenuForm, { key: field[0], label: field[1], kind: "text" });
    closeFieldMenu();
  }

  function handleFieldMenuKeydown(event) {
    const button = event.target.closest('[role="menuitem"]');
    if (!button) return;
    const inSubmenu = dom.defaultFieldsMenu.contains(button);
    if (event.key === "ArrowRight" && button === dom.defaultFieldsToggle) {
      event.preventDefault();
      showDefaultFields(true);
      dom.defaultFieldsMenu.querySelector("[data-secureit-default-field]:not(:disabled)")?.focus({ preventScroll: true });
    } else if ((event.key === "ArrowLeft" || event.key === "Escape") && inSubmenu) {
      event.preventDefault();
      event.stopPropagation();
      showDefaultFields(false);
      dom.defaultFieldsToggle.focus({ preventScroll: true });
    } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const menu = button.closest('[role="menu"]');
      const buttons = [...menu.querySelectorAll('[role="menuitem"]')].filter((item) => item.closest('[role="menu"]') === menu && !item.disabled && item.getClientRects().length);
      const current = buttons.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    }
  }

  function renderCustomDraft(form) {
    const draft = itemFieldDrafts.get(form);
    form.querySelector("[data-secureit-type-fields]").innerHTML = renderTypeFields("custom", draft);
    setStatus(form.querySelector("[data-secureit-item-status]"), "");
  }

  function addCustomField(form, field) {
    if (!form?.isConnected || form.elements.type.value !== "custom") return;
    const draft = captureItemDraft(form);
    if (draft.customFields.some((existing) => existing.key === field.key)) return;
    draft.customFields.push(field);
    renderCustomDraft(form);
    const input = form.elements.namedItem(`field:${field.key}`);
    input.focus({ preventScroll: true });
    const scroller = form.querySelector(".secureit-editor-fields");
    const overflow = input.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
    if (overflow > 0) scroller.scrollTop += overflow + 12;
  }

  function syncCustomFieldOptions() {
    const fields = dom.fieldForm.elements;
    const isMultiline = fields.field_kind.value === "multiline";
    if (isMultiline) fields.password_behavior.checked = false;
    fields.password_behavior.disabled = isMultiline;
    if (fields.password_behavior.checked) fields.copy_button.checked = true;
    fields.copy_button.disabled = fields.password_behavior.checked;
  }

  function handleCustomFieldSubmit(event) {
    event.preventDefault();
    if (!customFieldForm?.isConnected) return dom.fieldDialog.close();
    const label = dom.fieldForm.elements.field_name.value.trim();
    if (!label) return setStatus(dom.fieldStatus, "Enter a field name.", "error");
    const draft = captureItemDraft(customFieldForm);
    if (label.toLowerCase() === "custom type" || draft.customFields.some((field) => field.label.toLowerCase() === label.toLowerCase())) {
      return setStatus(dom.fieldStatus, "A field with that name already exists.", "error");
    }
    const form = customFieldForm;
    customFieldForm = null;
    const kind = dom.fieldForm.elements.field_kind.value === "multiline" ? "multiline" : "text";
    const passwordBehavior = kind !== "multiline" && dom.fieldForm.elements.password_behavior.checked;
    const copyButton = passwordBehavior || dom.fieldForm.elements.copy_button.checked;
    dom.fieldDialog.close();
    addCustomField(form, { key: `custom_${crypto.randomUUID()}`, label, kind, copyButton, passwordBehavior });
  }

  async function handleItemSubmit(event) {
    event.preventDefault();
    const form = event.target.closest("[data-secureit-item-form]");
    if (!form) return;
    const status = form.querySelector("[data-secureit-item-status]");
    const id = form.elements.item_id.value;
    const fields = {};
    [...form.elements].forEach((element) => {
      if (element.name?.startsWith("field:")) fields[element.name.slice(6)] = element.value;
    });
    const payload = {
      type: form.elements.type.value,
      title: form.elements.title.value.trim(),
      fields,
      notes: form.elements.notes.value,
    };
    if (payload.type === "custom") payload.customFields = captureItemDraft(form).customFields;
    if (!payload.title) return setStatus(status, "Enter a title.", "error");
    setStatus(status, "Encrypting and saving...");
    try {
      const encryptedPayload = await encryptJson(payload);
      if (id) {
        const { data, error } = await supabase.from(TABLES.items)
          .update({ collection_id: form.elements.collection_id.value, encrypted_payload: encryptedPayload })
          .eq("id", id)
          .eq("user_id", state.user.id)
          .select("*")
          .single();
        if (error) throw error;
        const index = state.items.findIndex((item) => item.id === id);
        state.items[index] = { ...data, payload };
      } else {
        const { data, error } = await supabase.from(TABLES.items).insert({
          user_id: state.user.id,
          collection_id: form.elements.collection_id.value,
          encrypted_payload: encryptedPayload,
          sort_order: state.items.length,
        }).select("*").single();
        if (error) throw error;
        state.items.push({ ...data, payload });
        state.selectedItemId = data.id;
      }
      renderAll();
      setStatus(dom.status, "SecureIt item saved.", "success");
    } catch (error) {
      setStatus(status, readableError(error), "error");
    }
  }

  async function deleteSelectedItem() {
    const id = state.selectedItemId;
    if (!id) return;
    const { error } = await supabase.from(TABLES.items)
      .update({ deleted: true, deleted_at: new Date().toISOString(), deleted_by: state.user.id })
      .eq("id", id)
      .eq("user_id", state.user.id);
    if (error) return setStatus(dom.status, readableError(error), "error");
    state.items = state.items.filter((item) => item.id !== id);
    state.selectedItemId = "";
    renderAll();
  }

  async function copySelectedItemJson(form) {
    const item = state.items.find((candidate) => candidate.id === form?.elements.item_id?.value);
    if (!item) return;
    const status = form.querySelector("[data-secureit-item-status]");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable.");
      await navigator.clipboard.writeText(JSON.stringify(item.payload, null, 2));
      setStatus(status, "Copied decrypted JSON.", "success");
    } catch {
      setStatus(status, "Could not copy this item. Try again.", "error");
    }
  }

  async function copyItemField(button) {
    const input = button.closest(".form-field")?.querySelector("input, textarea");
    if (!input) return;
    const label = button.dataset.secureitCopyField;
    const status = button.closest("[data-secureit-item-form]")?.querySelector("[data-secureit-item-status]");
    button.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable.");
      await navigator.clipboard.writeText(input.value);
      button.innerHTML = '<ph-check weight="bold" aria-hidden="true"></ph-check>';
      button.title = `${label} copied`;
      setStatus(status, `${label} copied.`, "success");
      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.innerHTML = '<ph-copy weight="bold" aria-hidden="true"></ph-copy>';
        button.title = `Copy ${label}`;
      }, 1500);
    } catch {
      setStatus(status, `Could not copy ${label.toLowerCase()}. Select the field and copy it manually.`, "error");
    } finally {
      button.disabled = false;
    }
  }

  function openCollectionModal(collection = null) {
    dom.collectionModal.hidden = false;
    dom.collectionTitle.textContent = collection ? "Edit Collection" : "New Collection";
    dom.collectionForm.elements.collection_id.value = collection?.id || "";
    dom.collectionForm.elements.name.value = collection?.payload?.name || "";
    dom.collectionForm.elements.description.value = collection?.payload?.description || "";
    dom.collectionForm.elements.color.value = collection?.payload?.color || "#38bdf8";
    dom.deleteCollection.hidden = !collection;
    setStatus(dom.collectionStatus, "");
  }

  function closeCollectionModal() {
    dom.collectionModal.hidden = true;
    dom.collectionForm.reset();
  }

  async function handleCollectionSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.elements.collection_id.value;
    const payload = {
      name: form.elements.name.value.trim(),
      description: form.elements.description.value.trim(),
      color: form.elements.color.value,
    };
    if (!payload.name) return setStatus(dom.collectionStatus, "Enter a collection name.", "error");
    setStatus(dom.collectionStatus, "Encrypting collection...");
    try {
      const encryptedPayload = await encryptJson(payload);
      if (id) {
        const { data, error } = await supabase.from(TABLES.collections)
          .update({ encrypted_payload: encryptedPayload })
          .eq("id", id)
          .eq("user_id", state.user.id)
          .select("*")
          .single();
        if (error) throw error;
        const index = state.collections.findIndex((collection) => collection.id === id);
        state.collections[index] = { ...data, payload };
      } else {
        const { data, error } = await supabase.from(TABLES.collections).insert({
          user_id: state.user.id,
          encrypted_payload: encryptedPayload,
          sort_order: state.collections.length,
        }).select("*").single();
        if (error) throw error;
        state.collections.push({ ...data, payload });
        state.selectedCollectionId = data.id;
      }
      closeCollectionModal();
      renderAll();
    } catch (error) {
      setStatus(dom.collectionStatus, readableError(error), "error");
    }
  }

  async function handleDeleteCollection() {
    const id = dom.collectionForm.elements.collection_id.value;
    if (!id) return;
    const fallbackCollection = state.collections.find((collection) => collection.id !== id);
    if (!fallbackCollection && state.items.some((item) => item.collection_id === id)) {
      return setStatus(dom.collectionStatus, "Move or delete items before deleting the last collection.", "error");
    }
    const { error } = await supabase.from(TABLES.collections)
      .update({ deleted: true, deleted_at: new Date().toISOString(), deleted_by: state.user.id })
      .eq("id", id)
      .eq("user_id", state.user.id);
    if (error) return setStatus(dom.collectionStatus, readableError(error), "error");
    if (fallbackCollection) {
      await supabase.from(TABLES.items)
        .update({ collection_id: fallbackCollection.id })
        .eq("collection_id", id)
        .eq("user_id", state.user.id);
      state.items.forEach((item) => {
        if (item.collection_id === id) item.collection_id = fallbackCollection.id;
      });
    }
    state.collections = state.collections.filter((collection) => collection.id !== id);
    state.selectedCollectionId = "all";
    closeCollectionModal();
    renderAll();
  }
})();
