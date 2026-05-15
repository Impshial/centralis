const menuTriggers = document.querySelectorAll(".menu-trigger");
const themeToggle = document.querySelector(".theme-toggle");
const modalOpeners = document.querySelectorAll("[data-open-modal]");
const modalClosers = document.querySelectorAll("[data-close-modal]");
const appShell = document.querySelector(".app-shell");
const authLanding = document.querySelector(".auth-landing");
const authForm = document.querySelector(".auth-form");
const authStatus = document.querySelector("[data-auth-status]");
const universeStatus = document.querySelector("[data-universe-status]");
const deleteUniverseStatus = document.querySelector("[data-delete-universe-status]");
const universeList = document.querySelector("[data-universe-list]");
const googleAuthButton = document.querySelector("[data-auth-google]");
const signOutButtons = document.querySelectorAll("[data-sign-out]");
const createUniverseButtons = document.querySelectorAll("[data-create-universe]");
const UNIVERSE_TABLE = "universes";
const DEFAULT_ELEMENT_TYPES_TABLE = "default_element_types";
const DEFAULT_ELEMENT_TYPE_TEMPLATES_TABLE = "default_element_type_templates";
const DEFAULT_ELEMENT_TEMPLATE_SECTIONS_TABLE = "default_element_template_sections";
const DEFAULT_ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE = "default_element_type_template_fields";
const ELEMENT_TYPES_TABLE = "element_types";
const ELEMENT_TYPE_TEMPLATES_TABLE = "element_type_templates";
const ELEMENT_TEMPLATE_SECTIONS_TABLE = "element_template_sections";
const ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE = "element_type_template_fields";
const ELEMENTS_TABLE = "elements";
const ELEMENT_LINKS_TABLE = "element_links";
const SUPABASE_TIMEOUT_MS = 15000;
const DEFAULT_UNIVERSE_POSITION = { x: 120, y: 120 };
const DEFAULT_UNIVERSE_FORMAT = {
  fmt_stroke_color: "#3b82f6",
  fmt_stroke_width: 2,
  fmt_stroke_style: "solid",
  fmt_path_type: "step",
  fmt_node_bg_opacity: 1,
  fmt_node_border_width: 2,
  fmt_node_image_placement: "side",
  fmt_node_layout_gap: 12
};
let activeModal = null;
let supabaseClient = null;
let currentAppUser = null;
let currentUserSettings = null;
let profileLoadPromise = null;
let pendingUniverseDelete = null;

window.centralisScriptVersion = "seed-diagnostics-3";
console.warn("Centralis script loaded", window.centralisScriptVersion);

if (window.supabase && window.CENTRALIS_SUPABASE_CONFIG) {
  const { url, publishableKey } = window.CENTRALIS_SUPABASE_CONFIG;
  supabaseClient = window.supabase.createClient(url, publishableKey);
  window.centralisSupabase = supabaseClient;
} else {
  console.warn("Supabase client was not initialized.");
}

function setAuthStatus(message, type) {
  if (!authStatus) {
    return;
  }

  authStatus.textContent = message || "";
  authStatus.classList.toggle("is-error", type === "error");
  authStatus.classList.toggle("is-success", type === "success");
}

function setUniverseStatus(message, type) {
  if (!universeStatus) {
    return;
  }

  universeStatus.textContent = message || "";
  universeStatus.classList.toggle("is-error", type === "error");
  universeStatus.classList.toggle("is-success", type === "success");
}

function setDeleteUniverseStatus(message, type) {
  if (!deleteUniverseStatus) {
    return;
  }

  deleteUniverseStatus.textContent = message || "";
  deleteUniverseStatus.classList.toggle("is-error", type === "error");
  deleteUniverseStatus.classList.toggle("is-success", type === "success");
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `universe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlurb(description) {
  if (!description) {
    return "No description yet.";
  }

  const trimmed = description.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function createUniverseDeleteMenu(universe) {
  return `
    <div class="card-menu-wrap">
      <button class="node-kebab card-kebab" type="button" aria-label="Universe actions" aria-expanded="false" aria-haspopup="menu" data-universe-menu-button>
        <ph-dots-three-vertical weight="bold" aria-hidden="true"></ph-dots-three-vertical>
      </button>
      <div class="node-menu card-menu" role="menu" hidden>
        <button class="danger-menu-item" type="button" role="menuitem" data-delete-universe data-universe-id="${escapeHtml(universe.id)}" data-universe-name="${escapeHtml(universe.name || "Untitled Universe")}">Delete Universe</button>
      </div>
    </div>
  `;
}

function getReadableError(error) {
  return error?.message || error?.details || error?.hint || "Unknown error";
}

function isSchemaColumnError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.code === "PGRST204" || message.includes("schema cache") || message.includes("could not find");
}

function withTimeout(promise, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${SUPABASE_TIMEOUT_MS / 1000} seconds.`));
    }, SUPABASE_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function fetchAllRows(table, {
  select = "*",
  filters,
  order,
  label,
  pageSize = 1000
} = {}) {
  const rows = [];
  let start = 0;

  while (true) {
    let query = supabaseClient
      .from(table)
      .select(select, { count: "exact" });

    if (typeof filters === "function") {
      query = filters(query);
    }

    if (order) {
      const orders = Array.isArray(order) ? order : [order];
      orders.forEach((orderRule) => {
        query = query.order(orderRule.column, {
          ascending: orderRule.ascending !== false,
          foreignTable: orderRule.foreignTable
        });
      });
    }

    const end = start + pageSize - 1;
    const { data, error, count } = await withTimeout(
      query.range(start, end),
      `${label || `Loading ${table}`} (${start + 1}-${end + 1})`
    );

    if (error) {
      return { data: rows, error };
    }

    rows.push(...(data || []));

    if (typeof count === "number" && rows.length >= count) {
      return { data: rows, error: null, count };
    }

    if (!data || data.length < pageSize) {
      return { data: rows, error: null, count };
    }

    start += pageSize;
  }
}

async function fetchAllRowsById(table, {
  select = "*",
  filters,
  label,
  pageSize = 1000
} = {}) {
  const rows = [];
  let lastId = null;

  while (true) {
    let query = supabaseClient
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .limit(pageSize);

    if (typeof filters === "function") {
      query = filters(query);
    }

    if (lastId) {
      query = query.gt("id", lastId);
    }

    const { data, error } = await withTimeout(
      query,
      `${label || `Loading ${table}`} (${rows.length + 1}+)`
    );

    if (error) {
      return { data: rows, error };
    }

    if (!data?.length) {
      return { data: rows, error: null };
    }

    rows.push(...data);
    lastId = data[data.length - 1].id;

    if (data.length < pageSize) {
      return { data: rows, error: null };
    }
  }
}

async function insertRowsResiliently(table, rows, {
  select,
  label
} = {}) {
  let query = supabaseClient
    .from(table)
    .insert(rows);

  if (select) {
    query = query.select(select);
  }

  const { data, error } = await withTimeout(
    query,
    `${label || `Creating ${table}`} (${rows.length} rows)`
  );

  if (!error) {
    return {
      data: data || [],
      error: null,
      insertedCount: Array.isArray(data) && data.length ? data.length : rows.length,
      failedRows: []
    };
  }

  if (isSchemaColumnError(error)) {
    return {
      data: [],
      error,
      insertedCount: 0,
      failedRows: []
    };
  }

  if (rows.length === 1) {
    console.warn(`${label || `Creating ${table}`} skipped one row.`, {
      error,
      row: rows[0]
    });
    return {
      data: [],
      error: null,
      insertedCount: 0,
      failedRows: [{ row: rows[0], error }]
    };
  }

  const midpoint = Math.ceil(rows.length / 2);
  const left = await insertRowsResiliently(table, rows.slice(0, midpoint), { select, label });
  const right = await insertRowsResiliently(table, rows.slice(midpoint), { select, label });

  return {
    data: [...left.data, ...right.data],
    error: null,
    insertedCount: left.insertedCount + right.insertedCount,
    failedRows: [...left.failedRows, ...right.failedRows]
  };
}

async function insertRowsInBatches(table, rows, {
  select,
  label,
  batchSize = 250,
  resilient = false
} = {}) {
  const insertedRows = [];
  const failedRows = [];
  let insertedCount = 0;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);

    const result = resilient
      ? await insertRowsResiliently(table, batch, { select, label })
      : await insertRowsResiliently(table, batch, { select, label });

    if (result.error) {
      return { data: insertedRows, error: result.error, insertedCount, failedRows };
    }

    insertedRows.push(...(result.data || []));
    failedRows.push(...(result.failedRows || []));
    insertedCount += result.insertedCount || 0;

    if (result.failedRows?.length && !resilient) {
      return {
        data: insertedRows,
        error: result.failedRows[0].error,
        insertedCount,
        failedRows
      };
    }
  }

  return { data: insertedRows, error: null, insertedCount, failedRows };
}

function getAuthUrlMessage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("error_description")) {
    return params.get("error_description");
  }

  if (params.get("error")) {
    return params.get("error");
  }

  if (window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get("error_description")) {
      return hashParams.get("error_description");
    }

    if (hashParams.get("error")) {
      return hashParams.get("error");
    }
  }

  return "";
}

function cleanAuthUrl() {
  if (!window.location.search && !window.location.hash) {
    return;
  }

  const authParamNames = new Set([
    "access_token",
    "code",
    "error",
    "error_code",
    "error_description",
    "expires_at",
    "expires_in",
    "provider_token",
    "refresh_token",
    "token_type",
    "type"
  ]);
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  let removedAuthParam = false;

  authParamNames.forEach((name) => {
    if (searchParams.has(name)) {
      searchParams.delete(name);
      removedAuthParam = true;
    }

    if (hashParams.has(name)) {
      hashParams.delete(name);
      removedAuthParam = true;
    }
  });

  if (!removedAuthParam) {
    return;
  }

  const queryString = searchParams.toString();
  const hashString = hashParams.toString();
  const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${hashString ? `#${hashString}` : ""}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function showSignedInApp() {
  if (authLanding) {
    authLanding.hidden = true;
  }

  if (appShell) {
    appShell.hidden = false;
  }
}

function showSignedOutLanding() {
  if (document.body.dataset.authRequired === "true") {
    window.location.href = "index.html";
    return;
  }

  if (appShell) {
    appShell.hidden = true;
  }

  if (authLanding) {
    authLanding.hidden = false;
  }
}

async function ensureUserProfile(authUser) {
  if (!supabaseClient || !authUser) {
    return null;
  }

  const displayName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || null;
  const avatarUrl = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const { data: existingUser, error: findError } = await withTimeout(supabaseClient
    .from("users")
    .select("*")
    .eq("clerk_user_id", authUser.id)
    .maybeSingle(), "Loading user profile");

  if (findError) {
    throw findError;
  }

  if (existingUser) {
    const { data: updatedUser, error: updateError } = await withTimeout(supabaseClient
      .from("users")
      .update({
        email: authUser.email,
        display_name: displayName,
        avatar_url: avatarUrl,
        timezone,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingUser.id)
      .select()
      .single(), "Updating user profile");

    if (updateError) {
      throw updateError;
    }

    return updatedUser;
  }

  const { data: newUser, error: createError } = await withTimeout(supabaseClient
    .from("users")
    .insert({
      clerk_user_id: authUser.id,
      email: authUser.email,
      display_name: displayName,
      avatar_url: avatarUrl,
      timezone
    })
    .select()
    .single(), "Creating user profile");

  if (createError) {
    throw createError;
  }

  return newUser;
}

async function ensureUserSettings(userId) {
  if (!supabaseClient || !userId) {
    return null;
  }

  const { data: existingSettings, error: findError } = await withTimeout(supabaseClient
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle(), "Loading user settings");

  if (findError) {
    throw findError;
  }

  if (existingSettings) {
    return existingSettings;
  }

  const { data: newSettings, error: createError } = await withTimeout(supabaseClient
    .from("user_settings")
    .insert({ user_id: userId })
    .select()
    .single(), "Creating user settings");

  if (createError) {
    throw createError;
  }

  return newSettings;
}

function applyUserSettings(settings) {
  if (!settings?.theme) {
    return;
  }

  document.body.classList.toggle("dark-mode", settings.theme === "dark");
  localStorage.setItem("centralis-theme", settings.theme);
  updateThemeLabel();
}

async function prepareSignedInUser(authUser) {
  if (profileLoadPromise) {
    return withTimeout(profileLoadPromise, "Loading user profile");
  }

  profileLoadPromise = (async () => {
    currentAppUser = await ensureUserProfile(authUser);
    window.centralisCurrentAppUser = currentAppUser;
    currentUserSettings = await ensureUserSettings(currentAppUser.id);
    try {
      await ensureUserElementTypeLibrary(currentAppUser.id);
    } catch (error) {
      console.error("Could not finish element type library seeding:", error);
      window.centralisElementTypeSeedError = error;
    }
    applyUserSettings(currentUserSettings);
    await loadUniverseCards();
    return currentAppUser;
  })();

  try {
    return await profileLoadPromise;
  } finally {
    profileLoadPromise = null;
  }
}

async function loadUniverseCards() {
  if (!universeList || !supabaseClient || !currentAppUser) {
    return;
  }

  universeList.innerHTML = '<p class="empty-state">Loading universes...</p>';

  try {
  const { data, error } = await withTimeout(supabaseClient
    .from(UNIVERSE_TABLE)
    .select("id,name,description,updated_at")
    .eq("user_id", currentAppUser.id)
    .order("updated_at", { ascending: false }), "Loading universes");

  if (error) {
    universeList.innerHTML = `<p class="empty-state is-error">Could not load universes: ${getReadableError(error)}</p>`;
    return;
  }

  if (!data?.length) {
    universeList.innerHTML = '<p class="empty-state">No universes yet.</p>';
    return;
  }

  universeList.innerHTML = data.map((universe) => `
    <article class="universe-card-wrap">
      <a class="universe-card" href="universe-canvas.html?universe_id=${encodeURIComponent(universe.id)}">
        <span class="card-icon" aria-hidden="true">
          <ph-planet weight="duotone"></ph-planet>
        </span>
        <strong>${escapeHtml(universe.name || "Untitled Universe")}</strong>
        <span>${escapeHtml(createBlurb(universe.description))}</span>
      </a>
      ${createUniverseDeleteMenu(universe)}
    </article>
  `).join("");
  bindUniverseCardMenus();
  } catch (error) {
    universeList.innerHTML = `<p class="empty-state is-error">Could not load universes: ${getReadableError(error)}</p>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getCurrentAppUser() {
  if (currentAppUser) {
    return currentAppUser;
  }

  if (profileLoadPromise) {
    return profileLoadPromise;
  }

  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await withTimeout(supabaseClient.auth.getSession(), "Loading auth session");
  if (error || !data.session?.user) {
    return null;
  }

  return prepareSignedInUser(data.session.user);
}

window.centralisGetCurrentAppUser = getCurrentAppUser;

function getCatalogTypeId(template) {
  return template.default_element_type_id ?? template.element_type_id ?? template.type_id ?? null;
}

function getCatalogTemplateId(record) {
  return record.default_template_id ?? record.template_id ?? null;
}

function getCatalogSectionId(record) {
  return record.default_section_id ?? record.section_id ?? null;
}

function normalizeLibraryKey(value) {
  return String(value || "").trim().toLowerCase();
}

function makeTemplateKey(elementTypeId, name) {
  return `${elementTypeId || ""}::${normalizeLibraryKey(name)}`;
}

function makeSectionKey(templateId, name) {
  return `${templateId || ""}::${normalizeLibraryKey(name)}`;
}

function getFieldIdentity(field) {
  return normalizeLibraryKey(field.field_key || field.label || field.name || field.id);
}

function makeFieldKey(templateId, field) {
  return `${templateId || ""}::${getFieldIdentity(field)}`;
}

const ALLOWED_TEMPLATE_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "multi_select",
  "checkbox",
  "url",
  "image",
  "rich_text",
  "relationship"
]);

function createTemplateFieldKey(field) {
  const source = field.field_key || field.label || field.name || field.id || "field";
  const key = String(source)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || "field";
}

function normalizeTemplateFieldType(fieldType) {
  const normalizedType = String(fieldType || "textarea").trim().toLowerCase();
  return ALLOWED_TEMPLATE_FIELD_TYPES.has(normalizedType) ? normalizedType : "textarea";
}

async function ensureUserElementTypeLibrary(userId) {
  if (!supabaseClient || !userId) {
    return;
  }

  console.warn("Element type library seed starting", { userId });

  const { data: beforeDiagnostics, error: beforeDiagnosticsError } = await withTimeout(supabaseClient
    .rpc("get_element_type_seed_diagnostics", { p_user_id: userId }), "Loading element type seed diagnostics");

  if (beforeDiagnosticsError) {
    console.warn("Could not load element type seed diagnostics before seeding.", beforeDiagnosticsError);
  } else {
    window.centralisSeedDiagnostics = {
      ...(window.centralisSeedDiagnostics || {}),
      before: beforeDiagnostics
    };
    console.warn("Element type seed diagnostics before", beforeDiagnostics);
  }

  const { data, error } = await withTimeout(supabaseClient
    .rpc("ensure_user_element_type_library", { p_user_id: userId }), "Seeding user element type library");

  if (error) {
    throw error;
  }

  window.centralisSeedDiagnostics = {
    ...(window.centralisSeedDiagnostics || {}),
    seed: data
  };
  console.warn("Element type library seed result", data);

  const { data: afterDiagnostics, error: afterDiagnosticsError } = await withTimeout(supabaseClient
    .rpc("get_element_type_seed_diagnostics", { p_user_id: userId }), "Loading element type seed diagnostics");

  if (afterDiagnosticsError) {
    console.warn("Could not load element type seed diagnostics after seeding.", afterDiagnosticsError);
  } else {
    window.centralisSeedDiagnostics = {
      ...(window.centralisSeedDiagnostics || {}),
      after: afterDiagnostics
    };
    console.warn("Element type seed diagnostics after", afterDiagnostics);
  }

  return data;

  const { data: defaultTypes, error: defaultTypesError } = await withTimeout(supabaseClient
    .from(DEFAULT_ELEMENT_TYPES_TABLE)
    .select("id,name,description,icon,color")
    .order("name", { ascending: true }), "Loading default element types");

  if (defaultTypesError) {
    throw defaultTypesError;
  }

  if (!defaultTypes?.length) {
    return;
  }

  const { data: existingTypes, error: existingTypesError } = await withTimeout(supabaseClient
    .from(ELEMENT_TYPES_TABLE)
    .select("id,name")
    .eq("user_id", userId), "Checking user element type library");

  if (existingTypesError) {
    throw existingTypesError;
  }

  const typeByName = new Map((existingTypes || []).map((type) => [normalizeLibraryKey(type.name), type]));
  const missingTypes = defaultTypes.filter((type) => !typeByName.has(normalizeLibraryKey(type.name)));

  if (missingTypes.length) {
    const { data: createdTypes, error: createTypesError } = await withTimeout(supabaseClient
      .from(ELEMENT_TYPES_TABLE)
      .insert(missingTypes.map((type) => ({
        user_id: userId,
        name: type.name,
        description: type.description || null,
        icon: type.icon || null,
        color: type.color || "#6366f1"
      })))
      .select("id,name"), "Creating user element types");

    if (createTypesError) {
      throw createTypesError;
    }

    (createdTypes || []).forEach((type) => {
      typeByName.set(normalizeLibraryKey(type.name), type);
    });
  }

  const typeIdByDefaultId = new Map();
  defaultTypes.forEach((defaultType) => {
    const userType = typeByName.get(normalizeLibraryKey(defaultType.name));
    if (userType) {
      typeIdByDefaultId.set(defaultType.id, userType.id);
    }
  });

  const { data: defaultTemplates, error: defaultTemplatesError } = await fetchAllRowsById(DEFAULT_ELEMENT_TYPE_TEMPLATES_TABLE, {
    select: "*",
    label: "Loading default element type templates"
  });

  if (defaultTemplatesError) {
    throw defaultTemplatesError;
  }

  const userTypeIds = [...new Set([...typeIdByDefaultId.values()])];
  const { data: existingTemplates, error: existingTemplatesError } = userTypeIds.length
    ? await fetchAllRowsById(ELEMENT_TYPE_TEMPLATES_TABLE, {
      select: "id,name,element_type_id",
      filters: (query) => query.in("element_type_id", userTypeIds),
      label: "Checking user element type templates"
    })
    : { data: [], error: null };

  if (existingTemplatesError) {
    throw existingTemplatesError;
  }

  const templateByTypeAndName = new Map((existingTemplates || []).map((template) => [
    makeTemplateKey(template.element_type_id, template.name),
    template
  ]));

  const templatesToCreate = (defaultTemplates || [])
    .filter((template) => typeIdByDefaultId.has(getCatalogTypeId(template)))
    .filter((template) => !templateByTypeAndName.has(makeTemplateKey(typeIdByDefaultId.get(getCatalogTypeId(template)), template.name)))
    .map((template) => ({
      element_type_id: typeIdByDefaultId.get(getCatalogTypeId(template)),
      name: template.name,
      description: template.description || null
    }));

  if (templatesToCreate.length) {
    const { data: createdTemplates, error: createTemplatesError } = await withTimeout(supabaseClient
      .from(ELEMENT_TYPE_TEMPLATES_TABLE)
      .insert(templatesToCreate)
      .select("id,name,element_type_id"), "Creating user element type templates");

    if (createTemplatesError) {
      throw createTemplatesError;
    }

    (createdTemplates || []).forEach((template) => {
      templateByTypeAndName.set(makeTemplateKey(template.element_type_id, template.name), template);
    });
  }

  const templateIdByDefaultId = new Map();
  (defaultTemplates || []).forEach((defaultTemplate) => {
    const elementTypeId = typeIdByDefaultId.get(getCatalogTypeId(defaultTemplate));
    const userTemplate = templateByTypeAndName.get(makeTemplateKey(elementTypeId, defaultTemplate.name));
    if (userTemplate) {
      templateIdByDefaultId.set(defaultTemplate.id, userTemplate.id);
    }
  });

  const { data: defaultSections, error: defaultSectionsError } = await fetchAllRowsById(DEFAULT_ELEMENT_TEMPLATE_SECTIONS_TABLE, {
    select: "*",
    label: "Loading default template sections"
  });

  if (defaultSectionsError) {
    throw defaultSectionsError;
  }

  const userTemplateIds = [...new Set([...templateIdByDefaultId.values()])];
  const { data: existingSections, error: existingSectionsError } = userTemplateIds.length
    ? await fetchAllRowsById(ELEMENT_TEMPLATE_SECTIONS_TABLE, {
      select: "id,name,template_id",
      filters: (query) => query.in("template_id", userTemplateIds),
      label: "Checking user template sections"
    })
    : { data: [], error: null };

  if (existingSectionsError) {
    throw existingSectionsError;
  }

  const sectionByTemplateAndName = new Map((existingSections || []).map((section) => [
    makeSectionKey(section.template_id, section.name),
    section
  ]));

  const sectionsToCreate = (defaultSections || [])
    .filter((section) => templateIdByDefaultId.has(getCatalogTemplateId(section)))
    .filter((section) => !sectionByTemplateAndName.has(makeSectionKey(templateIdByDefaultId.get(getCatalogTemplateId(section)), section.name)))
    .map((section) => ({
      template_id: templateIdByDefaultId.get(getCatalogTemplateId(section)),
      name: section.name,
      description: section.description || null,
      sort_order: Number(section.sort_order || 0)
    }));

  if (sectionsToCreate.length) {
    const { data: createdSections, error: createSectionsError } = await withTimeout(supabaseClient
      .from(ELEMENT_TEMPLATE_SECTIONS_TABLE)
      .insert(sectionsToCreate)
      .select("id,name,template_id"), "Creating user template sections");

    if (createSectionsError) {
      throw createSectionsError;
    }

    (createdSections || []).forEach((section) => {
      sectionByTemplateAndName.set(makeSectionKey(section.template_id, section.name), section);
    });
  }

  const sectionIdByDefaultId = new Map();
  (defaultSections || []).forEach((defaultSection) => {
    const templateId = templateIdByDefaultId.get(getCatalogTemplateId(defaultSection));
    const userSection = sectionByTemplateAndName.get(makeSectionKey(templateId, defaultSection.name));
    if (userSection) {
      sectionIdByDefaultId.set(defaultSection.id, userSection.id);
    }
  });

  const { data: defaultFields, error: defaultFieldsError } = await fetchAllRowsById(DEFAULT_ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE, {
    select: "*",
    label: "Loading default template fields"
  });

  if (defaultFieldsError) {
    throw defaultFieldsError;
  }

  const { data: existingFields, error: existingFieldsError } = userTemplateIds.length
    ? await fetchAllRowsById(ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE, {
      select: "*",
      filters: (query) => query.in("template_id", userTemplateIds),
      label: "Checking user template fields"
    })
    : { data: [], error: null };

  if (existingFieldsError) {
    throw existingFieldsError;
  }

  const fieldByTemplateAndIdentity = new Map((existingFields || []).map((field) => [
    makeFieldKey(field.template_id, field),
    field
  ]));

  const mappedDefaultFields = (defaultFields || [])
    .filter((field) => templateIdByDefaultId.has(getCatalogTemplateId(field)));
  const unmappedFieldCount = (defaultFields || []).length - mappedDefaultFields.length;
  const fieldsToCreate = mappedDefaultFields
    .filter((field) => !fieldByTemplateAndIdentity.has(makeFieldKey(templateIdByDefaultId.get(getCatalogTemplateId(field)), field)))
    .map((field) => ({
      template_id: templateIdByDefaultId.get(getCatalogTemplateId(field)),
      section_id: getCatalogSectionId(field) ? sectionIdByDefaultId.get(getCatalogSectionId(field)) || null : null,
      field_key: createTemplateFieldKey(field),
      label: field.label || field.name || "Untitled Field",
      field_type: normalizeTemplateFieldType(field.field_type),
      description: field.description || field.hint_text || null,
      placeholder: field.placeholder || null,
      default_value: field.default_value || null,
      options: field.options || null,
      is_required: Boolean(field.is_required),
      sort_order: Number(field.sort_order || 0)
    }));

  if ((defaultFields || []).length && !fieldsToCreate.length && !(existingFields || []).length) {
    console.warn("Default template fields were found, but none could be mapped into the user library.", {
      defaultFieldCount: defaultFields.length,
      defaultTemplateMapCount: templateIdByDefaultId.size,
      defaultSectionMapCount: sectionIdByDefaultId.size,
      sampleDefaultField: defaultFields[0]
    });
  }

  let insertedFieldCount = 0;

  if (fieldsToCreate.length) {
    const {
      data: createdFields,
      error: createFieldsError,
      failedRows: failedFieldRows = []
    } = await insertRowsInBatches(ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE, fieldsToCreate, {
      select: "id",
      label: "Creating user template fields",
      resilient: true
    });

    if (createFieldsError) {
      if (!isSchemaColumnError(createFieldsError)) {
        throw createFieldsError;
      }

      console.warn("Rich template field insert used the minimal destination column shape.", createFieldsError);
      const legacyFieldsToCreate = fieldsToCreate.map((field) => ({
        template_id: field.template_id,
        field_key: field.field_key,
        label: field.label,
        field_type: field.field_type,
        section_id: field.section_id || null,
        description: field.description || null,
        sort_order: field.sort_order || 0
      }));
      const {
        data: legacyCreatedFields,
        error: legacyCreateFieldsError,
        failedRows: legacyFailedFieldRows = []
      } = await insertRowsInBatches(ELEMENT_TYPE_TEMPLATE_FIELDS_TABLE, legacyFieldsToCreate, {
        select: "id",
        label: "Creating user template fields",
        resilient: true
      });

      if (legacyCreateFieldsError) {
        throw legacyCreateFieldsError;
      }

      insertedFieldCount = legacyCreatedFields.length || legacyFieldsToCreate.length;
      if (legacyFailedFieldRows.length) {
        console.warn("Some rich template fields could not be seeded with the minimal column shape.", {
          failedFieldCount: legacyFailedFieldRows.length,
          firstFailure: legacyFailedFieldRows[0]
        });
      }
    } else {
      insertedFieldCount = createdFields.length || fieldsToCreate.length;
      if (failedFieldRows.length) {
        console.warn("Some rich template fields could not be seeded.", {
          failedFieldCount: failedFieldRows.length,
          firstFailure: failedFieldRows[0]
        });
      }
    }
  }

  console.info("Rich template field seeding summary", {
    defaultFieldCount: (defaultFields || []).length,
    existingUserFieldCount: (existingFields || []).length,
    fieldsToCreateCount: fieldsToCreate.length,
    insertedFieldCount,
    unmappedFieldCount,
    expectedUserFieldCount: (existingFields || []).length + insertedFieldCount
  });
}

async function deleteUniverseAndChildren(universeId) {
  const deleteSteps = [
    { table: ELEMENT_LINKS_TABLE, column: "universe_id", label: "Deleting universe links" },
    { table: ELEMENTS_TABLE, column: "universe_id", label: "Deleting universe elements" },
    { table: UNIVERSE_TABLE, column: "id", label: "Deleting universe" }
  ];

  for (const step of deleteSteps) {
    const { error } = await withTimeout(supabaseClient
      .from(step.table)
      .delete()
      .eq(step.column, universeId), step.label);

    if (error) {
      throw error;
    }
  }
}

async function refreshAuthView() {
  const authUrlMessage = getAuthUrlMessage();

  if (!supabaseClient) {
    if (document.body.dataset.authRequired === "true" && appShell) {
      appShell.hidden = false;
    } else {
      showSignedOutLanding();
    }
    setAuthStatus("Supabase is not available yet. Refresh the page and try again.", "error");
    return;
  }

  const { data, error } = await withTimeout(supabaseClient.auth.getSession(), "Loading auth session");
  if (error) {
    if (document.body.dataset.authRequired === "true") {
      window.location.href = "index.html";
      return;
    }

    showSignedOutLanding();
    if (authUrlMessage) {
      setAuthStatus(authUrlMessage, "error");
      openModal(document.getElementById("auth-modal"));
      cleanAuthUrl();
    }
    return;
  }

  if (data.session) {
    try {
      await prepareSignedInUser(data.session.user);
      showSignedInApp();
      cleanAuthUrl();
    } catch (profileError) {
      console.error(profileError);
      if (document.body.dataset.authRequired === "true" && appShell) {
        appShell.hidden = false;
      } else {
        showSignedOutLanding();
      }
      setAuthStatus(`Login worked, but loading your profile failed: ${getReadableError(profileError)}`, "error");
    }
    return;
  }

  if (document.body.dataset.authRequired === "true") {
    window.location.href = "index.html";
    return;
  }

  showSignedOutLanding();

  if (authUrlMessage) {
    setAuthStatus(authUrlMessage, "error");
    openModal(document.getElementById("auth-modal"));
    cleanAuthUrl();
  }
}

const savedTheme = localStorage.getItem("centralis-theme");
if (savedTheme === "dark") {
  document.body.classList.add("dark-mode");
}

function updateThemeLabel() {
  if (!themeToggle) {
    return;
  }

  const isDark = document.body.classList.contains("dark-mode");
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

function closeMenus(except) {
  menuTriggers.forEach((trigger) => {
    if (trigger !== except) {
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

function closeUniverseCardMenus(except) {
  if (!universeList) {
    return;
  }

  universeList.querySelectorAll("[data-universe-menu-button]").forEach((button) => {
    const menu = button.nextElementSibling;
    if (button !== except) {
      button.setAttribute("aria-expanded", "false");
      if (menu) {
        menu.hidden = true;
      }
    }
  });
}

function openDeleteUniverseDialog(universe) {
  const modal = document.getElementById("delete-universe-modal");
  if (!modal) {
    return;
  }

  pendingUniverseDelete = universe;
  setDeleteUniverseStatus(universe?.name ? `Delete "${universe.name}"?` : "Delete this universe?");
  openModal(modal);
}

function bindUniverseCardMenus() {
  if (!universeList) {
    return;
  }

  closeUniverseCardMenus();

  universeList.querySelectorAll("[data-universe-menu-button]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const menu = button.nextElementSibling;
      const isOpen = button.getAttribute("aria-expanded") === "true";
      closeUniverseCardMenus(button);
      button.setAttribute("aria-expanded", String(!isOpen));
      if (menu) {
        menu.hidden = isOpen;
      }
    });
  });

  universeList.querySelectorAll("[data-delete-universe]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeUniverseCardMenus();
      openDeleteUniverseDialog({
        id: button.dataset.universeId,
        name: button.dataset.universeName
      });
    });
  });
}

menuTriggers.forEach((trigger) => {
  if (trigger.classList.contains("category-button")) {
    const wrap = trigger.closest(".menu-wrap");

    wrap?.addEventListener("mouseenter", () => {
      closeMenus(trigger);
      trigger.setAttribute("aria-expanded", "true");
    });

    wrap?.addEventListener("mouseleave", () => {
      trigger.setAttribute("aria-expanded", "false");
    });

    wrap?.addEventListener("focusout", (event) => {
      if (!wrap.contains(event.relatedTarget)) {
        trigger.setAttribute("aria-expanded", "false");
      }
    });

    trigger.addEventListener("focus", () => {
      closeMenus(trigger);
      trigger.setAttribute("aria-expanded", "true");
    });

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
    });

    return;
  }

  trigger.addEventListener("click", () => {
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    closeMenus(trigger);
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });
});

document.querySelectorAll(".dropdown-menu button, .dropdown-menu a").forEach((item) => {
  item.addEventListener("click", () => {
    closeMenus();
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".menu-wrap")) {
    closeMenus();
  }

  if (!event.target.closest(".card-menu-wrap")) {
    closeUniverseCardMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
    closeUniverseCardMenus();
    closeModal();
  }
});

function openModal(modal) {
  if (!modal) {
    return;
  }

  activeModal = modal;
  modal.hidden = false;
  closeMenus();

  const focusTarget = modal.querySelector("input, textarea, button");
  if (focusTarget) {
    focusTarget.focus();
  }
}

function closeModal() {
  if (!activeModal) {
    return;
  }

  if (activeModal.id === "delete-universe-modal") {
    pendingUniverseDelete = null;
    setDeleteUniverseStatus("");
  }

  activeModal.hidden = true;
  activeModal = null;
}

modalOpeners.forEach((opener) => {
  opener.addEventListener("click", () => {
    openModal(document.getElementById(opener.dataset.openModal));
  });
});

modalClosers.forEach((closer) => {
  closer.addEventListener("click", closeModal);
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  });
});

async function createUniverseFromForm(form, submitButton) {
  if (!form) {
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  setUniverseStatus("Creating universe...");

  try {
    if (!supabaseClient) {
      setUniverseStatus("Supabase is not available yet. Refresh the page and try again.", "error");
      return;
    }

    let appUser = null;
    try {
      appUser = await getCurrentAppUser();
    } catch (profileError) {
      setUniverseStatus(`Could not load your user profile: ${getReadableError(profileError)}`, "error");
      return;
    }

    if (!appUser) {
      setUniverseStatus("You need to be logged in before creating a universe.", "error");
      return;
    }

    const formData = new FormData(form);
    const name = String(formData.get("universe-name") || "").trim();
    const description = String(formData.get("universe-description") || "").trim();

    if (!name) {
      setUniverseStatus("Name is required.", "error");
      form.querySelector('[name="universe-name"]')?.focus();
      return;
    }

    const universeId = createId();
    const { error } = await withTimeout(supabaseClient
      .from(UNIVERSE_TABLE)
      .insert({
        id: universeId,
        user_id: appUser.id,
        name,
        description: description || null,
        canvas_position_x: DEFAULT_UNIVERSE_POSITION.x,
        canvas_position_y: DEFAULT_UNIVERSE_POSITION.y,
        ...DEFAULT_UNIVERSE_FORMAT
      })
      , "Creating universe");

    if (error) {
      setUniverseStatus(`Could not create universe: ${getReadableError(error)}`, "error");
      return;
    }

    setUniverseStatus("Universe created.", "success");
    window.location.href = `universe-canvas.html?universe_id=${encodeURIComponent(universeId)}`;
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

document.querySelectorAll(".universe-form").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createUniverseFromForm(form, event.submitter);
  });
});

document.querySelector("[data-confirm-delete-universe]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const universe = pendingUniverseDelete;

  if (!universe?.id) {
    closeModal();
    return;
  }

  if (!supabaseClient) {
    setDeleteUniverseStatus("Supabase is not available yet. Refresh the page and try again.", "error");
    return;
  }

  button.disabled = true;
  setDeleteUniverseStatus("Deleting universe...");

  try {
    await deleteUniverseAndChildren(universe.id);
    closeModal();
    await loadUniverseCards();
  } catch (error) {
    setDeleteUniverseStatus(`Could not delete universe: ${getReadableError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
});

createUniverseButtons.forEach((button) => {
  button.addEventListener("click", async (event) => {
    event.preventDefault();

    const form = event.currentTarget.closest("form");
    if (!form) {
      return;
    }

    await createUniverseFromForm(form, event.currentTarget);
  });
});

updateThemeLabel();

if (themeToggle) {
  themeToggle.addEventListener("click", async () => {
    const isDark = document.body.classList.toggle("dark-mode");
    const theme = isDark ? "dark" : "light";
    localStorage.setItem("centralis-theme", isDark ? "dark" : "light");
    updateThemeLabel();

    if (supabaseClient && currentUserSettings) {
      const { error } = await withTimeout(supabaseClient
        .from("user_settings")
        .update({
          theme,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUserSettings.id), "Saving theme preference");

      if (!error) {
        currentUserSettings.theme = theme;
      }
    }
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      setAuthStatus("Supabase is not available yet. Refresh the page and try again.", "error");
      return;
    }

    const formData = new FormData(authForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const mode = event.submitter?.dataset.authMode || "login";

    setAuthStatus(mode === "signup" ? "Creating account..." : "Logging in...");

    const response = mode === "signup"
      ? await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/index.html`
          }
        })
      : await supabaseClient.auth.signInWithPassword({ email, password });

    if (response.error) {
      setAuthStatus(response.error.message, "error");
      return;
    }

    if (mode === "signup" && !response.data.session) {
      setAuthStatus("Account created. Check your email to confirm your login.", "success");
      return;
    }

    try {
      await prepareSignedInUser(response.data.user);
      closeModal();
      showSignedInApp();
      setAuthStatus("");
    } catch (profileError) {
      console.error(profileError);
      setAuthStatus(`Login worked, but creating your profile/settings failed: ${getReadableError(profileError)}`, "error");
    }
  });
}

if (googleAuthButton) {
  googleAuthButton.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Supabase is not available yet. Refresh the page and try again.", "error");
      return;
    }

    setAuthStatus("Opening Google login...");

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/index.html`,
        queryParams: {
          prompt: "select_account"
        },
        skipBrowserRedirect: true
      }
    });

    if (error) {
      setAuthStatus(error.message, "error");
      return;
    }

    if (!data?.url) {
      setAuthStatus("Google did not return a login URL. Check the Google provider settings in Supabase.", "error");
      return;
    }

    const authWindow = window.open(data.url, "_blank", "noopener,noreferrer");
    if (!authWindow) {
      window.location.href = data.url;
      return;
    }

    setAuthStatus("Google login opened in a new tab. Return here after signing in.", "success");
  });
}

signOutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }

    currentAppUser = null;
    currentUserSettings = null;
    window.location.href = "index.html";
  });
});

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showSignedInApp();
      window.setTimeout(() => {
        prepareSignedInUser(session.user).catch((profileError) => {
          console.error(profileError);
          setAuthStatus(`Login worked, but loading your profile failed: ${getReadableError(profileError)}`, "error");
        });
      }, 0);
      return;
    }

    if (document.body.dataset.authRequired === "true") {
      window.location.href = "index.html";
      return;
    }

    showSignedOutLanding();
  });
}

refreshAuthView();
