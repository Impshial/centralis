const stellarSupabase = window.centralisSupabase;

const stellarState = {
  appUser: null,
  route: { name: "systems", id: null },
  systems: [],
  stars: [],
  planets: [],
  moons: [],
  lifeforms: [],
  images: [],
  colonies: [],
  colonists: [],
  selectedSystemId: null,
  expandedTree: new Set(),
  collapsedTree: new Set(),
  sidePanelCollapsed: readStellarSidePanelPreference(),
  lifeformModal: { planetId: null, moonId: null, isGenerating: false },
  colonyModal: { planetId: null, moonId: null, isGenerating: false },
  colonistModal: { colonyId: null, isGenerating: false },
  loading: false,
};

window.centralisStellarLoaded = true;

const stellarEls = {
  page: document.querySelector(".stellar-page"),
  root: document.querySelector("[data-stellar-root]"),
  tree: document.querySelector("[data-stellar-tree]"),
  sidePanel: document.querySelector(".stellar-side-panel"),
  sideGenerateButton: document.querySelector("[data-stellar-side-generate]"),
  generateButtons: document.querySelectorAll("[data-open-generate-system]"),
  generateModal: document.getElementById("stellar-generate-modal"),
  generateForm: document.querySelector("[data-stellar-generate-form]"),
  generateStatus: document.querySelector("[data-stellar-generate-status]"),
  detailsModal: document.getElementById("stellar-details-modal"),
  detailsMessage: document.querySelector("[data-stellar-details-message]"),
  detailsStatus: document.querySelector("[data-stellar-details-status]"),
  detailsConfirm: document.querySelector("[data-confirm-stellar-details]"),
  lifeModal: document.getElementById("stellar-life-modal"),
  lifeTitle: document.querySelector("[data-stellar-life-title]"),
  lifeStatus: document.querySelector("[data-stellar-life-status]"),
  lifeConfirm: document.querySelector("[data-confirm-stellar-life]"),
  colonyModal: document.getElementById("stellar-colony-modal"),
  colonyTitle: document.querySelector("[data-stellar-colony-title]"),
  colonyInstructions: document.querySelector("[data-stellar-colony-instructions]"),
  colonyIncludeColonists: document.querySelector("[data-stellar-colony-include-colonists]"),
  colonyRosterWrap: document.querySelector("[data-stellar-colony-roster-wrap]"),
  colonyRoster: document.querySelector("[data-stellar-colony-roster]"),
  colonyStatus: document.querySelector("[data-stellar-colony-status]"),
  colonyConfirm: document.querySelector("[data-confirm-stellar-colony]"),
  colonistModal: document.getElementById("stellar-colonist-modal"),
  colonistTitle: document.querySelector("[data-stellar-colonist-title]"),
  colonistInstructions: document.querySelector("[data-stellar-colonist-instructions]"),
  colonistRoster: document.querySelector("[data-stellar-colonist-roster]"),
  colonistStatus: document.querySelector("[data-stellar-colonist-status]"),
  colonistConfirm: document.querySelector("[data-confirm-stellar-colonists]"),
  imagePromptModal: document.getElementById("stellar-image-prompt-modal"),
  imagePromptForm: document.querySelector("[data-stellar-image-prompt-form]"),
  imagePromptTitle: document.getElementById("stellar-image-prompt-title"),
  imagePromptSubtitle: document.querySelector("[data-stellar-image-prompt-subtitle]"),
  imagePromptBase: document.querySelector("[data-stellar-image-prompt-base]"),
  imagePromptExtra: document.querySelector("[data-stellar-image-prompt-extra]"),
  imagePromptStatus: document.querySelector("[data-stellar-image-prompt-status]"),
};

let stellarImagePromptResolver = null;

function readStellarSidePanelPreference() {
  try {
    return localStorage.getItem("centralis.stellarSidePanelCollapsed") === "true";
  } catch {
    return false;
  }
}

function setStellarSidePanelCollapsed(isCollapsed) {
  stellarState.sidePanelCollapsed = Boolean(isCollapsed);
  try {
    localStorage.setItem("centralis.stellarSidePanelCollapsed", String(stellarState.sidePanelCollapsed));
  } catch {
    // Ignore storage failures; the current page state still updates.
  }
  applyStellarSidePanelState();
  renderTree();
}

function applyStellarSidePanelState() {
  stellarEls.page?.classList.toggle("is-stellar-side-collapsed", stellarState.sidePanelCollapsed);
  stellarEls.sidePanel?.classList.toggle("is-collapsed", stellarState.sidePanelCollapsed);
}

function showStellarToast(message, tone = "") {
  const container = getStellarToastContainer();
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

function getStellarToastContainer() {
  let container = document.querySelector("[data-stellar-toast-stack]");
  if (container) return container;
  container = document.createElement("div");
  container.className = "chronicle-toast-stack";
  container.dataset.stellarToastStack = "true";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-atomic", "true");
  document.body.appendChild(container);
  return container;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatValue(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "--";
  return `${escapeHtml(value)}${suffix}`;
}

function formatNumber(value, suffix = "", digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const rendered = Number.isInteger(number) ? String(number) : number.toFixed(digits).replace(/\.?0+$/, "");
  return `${rendered}${suffix}`;
}

function createBlurb(value, maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function setStatus(element, message, type) {
  if (!element) return;
  element.textContent = message || "";
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-success", type === "success");
}

function getReadableError(error) {
  return error?.message || error?.error || String(error || "Unknown error");
}

async function callEdgeFunction(name, options = {}) {
  if (!stellarSupabase || !window.CENTRALIS_SUPABASE_CONFIG) {
    throw new Error("Supabase is not available yet.");
  }

  const { data: sessionData, error: sessionError } = await stellarSupabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error(sessionError?.message || "You must be signed in to use this feature.");
  }

  const functionUrl = `${window.CENTRALIS_SUPABASE_CONFIG.url}/functions/v1/${name}`;
  let response;
  try {
    response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: window.CENTRALIS_SUPABASE_CONFIG.publishableKey,
        ...(options.headers || {}),
      },
      body: options.body,
    });
  } catch (error) {
    throw new Error(`Could not reach Edge Function "${name}". Confirm it is deployed, then retry. (${getReadableError(error)})`);
  }
  const responseText = await response.text();
  let data = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch (_error) {
      data = { error: responseText };
    }
  }
  if (!response.ok) {
    throw new Error(getReadableError(data) || `Edge Function returned ${response.status}.`);
  }
  return data;
}

async function waitForCurrentAppUser() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (window.centralisCurrentAppUser) return window.centralisCurrentAppUser;
    if (window.centralisGetCurrentAppUser) {
      const appUser = await window.centralisGetCurrentAppUser();
      if (appUser) return appUser;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return null;
}

function openGenerateModal() {
  setStatus(stellarEls.generateStatus, "");
  if (stellarEls.generateModal) stellarEls.generateModal.hidden = false;
}

function closeGenerateModal() {
  if (stellarEls.generateModal) stellarEls.generateModal.hidden = true;
}

function openDetailsModal(systemId) {
  const system = systemForId(systemId);
  if (!system || !stellarEls.detailsModal) return;
  stellarEls.detailsModal.dataset.systemId = system.id;
  const planets = stellarState.planets.filter((planet) => planet.system_id === system.id && !isAsteroidBelt(planet));
  if (stellarEls.detailsMessage) {
    stellarEls.detailsMessage.textContent = `Generate detailed information for all ${planets.length} planets in ${system.name}?`;
  }
  setStatus(stellarEls.detailsStatus, "");
  stellarEls.detailsModal.hidden = false;
}

function closeDetailsModal() {
  if (stellarEls.detailsModal) stellarEls.detailsModal.hidden = true;
}

function getLifeformSourceName({ planetId, moonId }) {
  const source = planetId ? planetForId(planetId) : moonForId(moonId);
  return source?.name || source?.designation || "this body";
}

function setLifeModalGenerating(isGenerating) {
  stellarState.lifeformModal.isGenerating = isGenerating;
  if (stellarEls.lifeConfirm) {
    stellarEls.lifeConfirm.disabled = isGenerating;
    stellarEls.lifeConfirm.textContent = isGenerating ? "Generating..." : "Generate New Lifeforms";
  }
  document.querySelectorAll("[data-close-stellar-life-modal]").forEach((button) => {
    button.disabled = isGenerating;
  });
}

function openLifeModal({ planetId = null, moonId = null }) {
  if (!stellarEls.lifeModal) return;
  stellarState.lifeformModal = { planetId, moonId, isGenerating: false };
  if (stellarEls.lifeTitle) {
    stellarEls.lifeTitle.textContent = `Generate Life on ${getLifeformSourceName({ planetId, moonId })}`;
  }
  setStatus(stellarEls.lifeStatus, "");
  setLifeModalGenerating(false);
  stellarEls.lifeModal.hidden = false;
}

function closeLifeModal(force = false) {
  if (stellarState.lifeformModal.isGenerating && !force) return;
  if (stellarEls.lifeModal) stellarEls.lifeModal.hidden = true;
  stellarState.lifeformModal = { planetId: null, moonId: null, isGenerating: false };
}

function getColonySourceName({ planetId, moonId }) {
  const source = planetId ? planetForId(planetId) : moonForId(moonId);
  return source?.name || source?.designation || "this body";
}

function getColonistSourceName(colonyId) {
  const colony = colonyForId(colonyId);
  return colony?.name || "this colony";
}

function setColonyModalGenerating(isGenerating) {
  stellarState.colonyModal.isGenerating = isGenerating;
  if (stellarEls.colonyConfirm) {
    stellarEls.colonyConfirm.disabled = isGenerating;
    stellarEls.colonyConfirm.textContent = isGenerating ? "Starting..." : "Generate Colony";
  }
  document.querySelectorAll("[data-close-stellar-colony-modal]").forEach((button) => {
    button.disabled = isGenerating;
  });
}

function updateColonyRosterVisibility() {
  if (!stellarEls.colonyRosterWrap || !stellarEls.colonyIncludeColonists) return;
  stellarEls.colonyRosterWrap.hidden = !stellarEls.colonyIncludeColonists.checked;
}

function openColonyModal({ planetId = null, moonId = null }) {
  if (!stellarEls.colonyModal) return;
  stellarState.colonyModal = { planetId, moonId, isGenerating: false };
  if (stellarEls.colonyTitle) {
    stellarEls.colonyTitle.textContent = `Generate Colony on ${getColonySourceName({ planetId, moonId })}`;
  }
  if (stellarEls.colonyInstructions) stellarEls.colonyInstructions.value = "";
  if (stellarEls.colonyIncludeColonists) stellarEls.colonyIncludeColonists.checked = false;
  if (stellarEls.colonyRoster) stellarEls.colonyRoster.value = "core";
  updateColonyRosterVisibility();
  setStatus(stellarEls.colonyStatus, "");
  setColonyModalGenerating(false);
  stellarEls.colonyModal.hidden = false;
  window.setTimeout(() => stellarEls.colonyInstructions?.focus(), 0);
}

function closeColonyModal(force = false) {
  if (stellarState.colonyModal.isGenerating && !force) return;
  if (stellarEls.colonyModal) stellarEls.colonyModal.hidden = true;
  stellarState.colonyModal = { planetId: null, moonId: null, isGenerating: false };
}

function setColonistModalGenerating(isGenerating) {
  stellarState.colonistModal.isGenerating = isGenerating;
  if (stellarEls.colonistConfirm) {
    stellarEls.colonistConfirm.disabled = isGenerating;
    stellarEls.colonistConfirm.textContent = isGenerating ? "Starting..." : "Generate Colonists";
  }
  document.querySelectorAll("[data-close-stellar-colonist-modal]").forEach((button) => {
    button.disabled = isGenerating;
  });
}

function openColonistModal(colonyId) {
  if (!stellarEls.colonistModal) return;
  stellarState.colonistModal = { colonyId, isGenerating: false };
  if (stellarEls.colonistTitle) {
    stellarEls.colonistTitle.textContent = `Generate Colonists for ${getColonistSourceName(colonyId)}`;
  }
  if (stellarEls.colonistInstructions) stellarEls.colonistInstructions.value = "";
  if (stellarEls.colonistRoster) stellarEls.colonistRoster.value = "core";
  setStatus(stellarEls.colonistStatus, "");
  setColonistModalGenerating(false);
  stellarEls.colonistModal.hidden = false;
  window.setTimeout(() => stellarEls.colonistInstructions?.focus(), 0);
}

function closeColonistModal(force = false) {
  if (stellarState.colonistModal.isGenerating && !force) return;
  if (stellarEls.colonistModal) stellarEls.colonistModal.hidden = true;
  stellarState.colonistModal = { colonyId: null, isGenerating: false };
}

function openStellarImagePromptDialog({ kind, config, record, basePrompt }) {
  if (!stellarEls.imagePromptModal) return Promise.resolve("");
  if (stellarImagePromptResolver) {
    stellarImagePromptResolver(null);
    stellarImagePromptResolver = null;
  }

  const displayLabel = stellarImageDisplayLabel(kind, record, config.label);
  const objectName = stellarObjectDisplayName(record, displayLabel);
  if (stellarEls.imagePromptTitle) {
    stellarEls.imagePromptTitle.textContent = `Generate ${displayLabel} Image`;
  }
  if (stellarEls.imagePromptSubtitle) {
    stellarEls.imagePromptSubtitle.textContent = `Add optional overriding instructions for ${objectName}. Leave this blank to use the generated prompt as-is.`;
  }
  if (stellarEls.imagePromptBase) stellarEls.imagePromptBase.value = basePrompt || "";
  if (stellarEls.imagePromptExtra) stellarEls.imagePromptExtra.value = "";
  setStatus(stellarEls.imagePromptStatus, "");
  stellarEls.imagePromptModal.hidden = false;
  window.setTimeout(() => stellarEls.imagePromptExtra?.focus(), 0);

  return new Promise((resolve) => {
    stellarImagePromptResolver = resolve;
  });
}

function closeStellarImagePromptDialog(value = null) {
  if (stellarEls.imagePromptModal) stellarEls.imagePromptModal.hidden = true;
  const resolve = stellarImagePromptResolver;
  stellarImagePromptResolver = null;
  if (resolve) resolve(value);
}

function buildStellarImageExtraPrompt(basePrompt, userInstructions) {
  const prompt = String(basePrompt || "").trim();
  const instructions = String(userInstructions || "").trim();
  if (!instructions) return prompt;
  return `${prompt}\n\nAdditional overriding instructions from the user:\n${instructions}`;
}

function parseRoute() {
  const hash = window.location.hash || "#systems";
  const [name, id] = hash.slice(1).replace(/=$/, "").split("/");
  const valid = new Set(["systems", "system", "planet", "moon", "lifeform", "colony", "colonist"]);
  return { name: valid.has(name) ? name : "systems", id: id ? decodeURIComponent(id) : null };
}

function setRoute(route) {
  stellarState.route = route;
  if (route.name === "system") stellarState.selectedSystemId = route.id;
}

function systemForId(id) {
  return stellarState.systems.find((system) => system.id === id) || null;
}

function starForSystem(systemId) {
  return stellarState.stars.find((star) => star.system_id === systemId) || null;
}

function planetForId(id) {
  return stellarState.planets.find((planet) => planet.id === id) || null;
}

function moonForId(id) {
  return stellarState.moons.find((moon) => moon.id === id) || null;
}

function colonyForId(id) {
  return stellarState.colonies.find((colony) => colony.id === id) || null;
}

function colonistForId(id) {
  return stellarState.colonists.find((colonist) => colonist.id === id) || null;
}

function lifeformForId(id) {
  return stellarState.lifeforms.find((lifeform) => lifeform.id === id) || null;
}

function currentSystem() {
  if (stellarState.selectedSystemId) return systemForId(stellarState.selectedSystemId);
  const route = stellarState.route;
  if (route.name === "system") return systemForId(route.id);
  if (route.name === "planet") return systemForId(planetForId(route.id)?.system_id);
  if (route.name === "moon") return systemForId(moonForId(route.id)?.system_id);
  if (route.name === "lifeform") return systemForId(lifeformForId(route.id)?.system_id);
  if (route.name === "colony") return systemForId(colonyForId(route.id)?.system_id);
  if (route.name === "colonist") return systemForId(colonistForId(route.id)?.system_id);
  return null;
}

function stellarBreadcrumbLink(label, href, isCurrent = false) {
  const content = escapeHtml(label || "Untitled");
  if (isCurrent || !href) {
    return `<span class="stellar-breadcrumb-current" aria-current="page">${content}</span>`;
  }
  return `<a href="${escapeHtml(href)}">${content}</a>`;
}

function renderStellarBreadcrumbs(items) {
  return `
    <nav class="stellar-breadcrumbs" aria-label="Stellar Architect breadcrumbs">
      ${items.map((item, index) => `
        ${index ? '<ph-caret-right weight="bold" aria-hidden="true"></ph-caret-right>' : ""}
        ${stellarBreadcrumbLink(item.label, item.href, index === items.length - 1)}
      `).join("")}
    </nav>
  `;
}

function stellarSystemBreadcrumbs(system, isCurrent = false) {
  return [
    { label: "Systems Home", href: "#systems" },
    {
      label: system?.name ? `Star System - ${system.name}` : "Star System",
      href: system?.id ? `#system/${encodeURIComponent(system.id)}` : "",
      current: isCurrent,
    },
  ];
}

function stellarObjectBreadcrumbs(kind, record) {
  const system = systemForId(record?.system_id) || currentSystem();
  const planet = kind === "planet"
    ? record
    : record?.planet_id
      ? planetForId(record.planet_id)
      : null;
  const moon = kind === "moon"
    ? record
    : record?.moon_id
      ? moonForId(record.moon_id)
      : null;
  const parentPlanet = planet || (moon?.planet_id ? planetForId(moon.planet_id) : null);
  const colony = kind === "colony"
    ? record
    : record?.colony_id
      ? colonyForId(record.colony_id)
      : null;
  const items = stellarSystemBreadcrumbs(system);
  if (parentPlanet) {
    const parentPlanetKind = stellarPlanetKindLabel(parentPlanet);
    items.push({
      label: parentPlanet.name ? `${parentPlanetKind} - ${parentPlanet.name}` : parentPlanetKind,
      href: `#planet/${encodeURIComponent(parentPlanet.id)}`,
    });
  }
  if (moon) {
    items.push({
      label: moon.name ? `Moon - ${moon.name}` : "Moon",
      href: `#moon/${encodeURIComponent(moon.id)}`,
    });
  }
  if (colony) {
    items.push({
      label: colony.name ? `Colony - ${colony.name}` : "Colony",
      href: `#colony/${encodeURIComponent(colony.id)}`,
    });
  }
  const currentLabels = {
    planet: record?.name ? `${stellarPlanetKindLabel(record)} - ${record.name}` : stellarPlanetKindLabel(record),
    moon: record?.name ? `Moon - ${record.name}` : "Moon",
    lifeform: record?.designation || record?.name ? `Lifeform - ${record.designation || record.name}` : "Lifeform",
    colony: record?.name ? `Colony - ${record.name}` : "Colony",
    colonist: record?.name ? `Colonist - ${record.name}` : "Colonist",
  };
  const currentHrefByKind = {
    planet: record?.id ? `#planet/${encodeURIComponent(record.id)}` : "",
    moon: record?.id ? `#moon/${encodeURIComponent(record.id)}` : "",
    colony: record?.id ? `#colony/${encodeURIComponent(record.id)}` : "",
  };
  const lastItem = items[items.length - 1];
  if (lastItem?.href && lastItem.href === currentHrefByKind[kind]) {
    lastItem.label = currentLabels[kind];
  } else {
    items.push({ label: currentLabels[kind], href: "" });
  }
  return items;
}

function stellarRouteLoadingName(route) {
  if (!route?.id) return "";
  if (route.name === "system") return systemForId(route.id)?.name || "";
  if (route.name === "planet") return planetForId(route.id)?.name || "";
  if (route.name === "moon") return moonForId(route.id)?.name || "";
  if (route.name === "lifeform") return lifeformForId(route.id)?.name || "";
  if (route.name === "colony") return colonyForId(route.id)?.name || "";
  if (route.name === "colonist") return colonistForId(route.id)?.name || "";
  return "";
}

async function fetchStellarRouteLoadingName(route) {
  const cachedName = stellarRouteLoadingName(route);
  if (cachedName || !route?.id || !stellarState.appUser) return cachedName;
  const tableByRoute = {
    system: "stellar_systems",
    planet: "stellar_planets",
    moon: "stellar_moons",
    lifeform: "stellar_lifeforms",
    colony: "stellar_colonies",
    colonist: "stellar_colonists",
  };
  const table = tableByRoute[route.name];
  if (!table) return "";
  const { data, error } = await stellarSupabase
    .from(table)
    .select("name")
    .eq("id", route.id)
    .eq("user_id", stellarState.appUser.id)
    .maybeSingle();
  if (error) return "";
  return data?.name || "";
}

function renderStellarLoading(name = "") {
  stellarEls.root.innerHTML = `<div class="stellar-loading">Loading ${escapeHtml(name || "Stellar Architect")}...</div>`;
}

async function fetchSystems() {
  const { data, error } = await stellarSupabase
    .from("stellar_systems")
    .select("*")
    .eq("user_id", stellarState.appUser.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  stellarState.systems = data || [];
}

async function fetchLandingChildren() {
  const [stars, planets, colonies] = await Promise.all([
    stellarSupabase
      .from("stellar_stars")
      .select("id,system_id,spectral_type,description")
      .eq("user_id", stellarState.appUser.id),
    stellarSupabase
      .from("stellar_planets")
      .select("id,system_id,habitability")
      .eq("user_id", stellarState.appUser.id)
      .order("planet_number", { ascending: true }),
    stellarSupabase
      .from("stellar_colonies")
      .select("id,system_id")
      .eq("user_id", stellarState.appUser.id),
  ]);
  if (stars.error) throw stars.error;
  if (planets.error) throw planets.error;
  if (colonies.error) throw colonies.error;
  stellarState.stars = stars.data || [];
  stellarState.planets = planets.data || [];
  stellarState.colonies = colonies.data || [];
  stellarState.moons = [];
  stellarState.lifeforms = [];
  stellarState.colonists = [];
  await fetchStellarImages();
}

async function fetchSystemGraph(systemId) {
  if (!systemId) {
    stellarState.stars = [];
    stellarState.planets = [];
    stellarState.moons = [];
    stellarState.lifeforms = [];
    stellarState.images = [];
    stellarState.colonies = [];
    stellarState.colonists = [];
    return;
  }

  const [stars, planets, moons, lifeforms, colonies, colonists] = await Promise.all([
    stellarSupabase.from("stellar_stars").select("*").eq("system_id", systemId).eq("user_id", stellarState.appUser.id).order("created_at", { ascending: true }),
    stellarSupabase.from("stellar_planets").select("*").eq("system_id", systemId).eq("user_id", stellarState.appUser.id).order("planet_number", { ascending: true }),
    stellarSupabase.from("stellar_moons").select("*").eq("system_id", systemId).eq("user_id", stellarState.appUser.id).order("moon_number", { ascending: true }),
    stellarSupabase.from("stellar_lifeforms").select("*").eq("system_id", systemId).eq("user_id", stellarState.appUser.id).order("name", { ascending: true }),
    stellarSupabase.from("stellar_colonies").select("*").eq("system_id", systemId).eq("user_id", stellarState.appUser.id).order("name", { ascending: true }),
    stellarSupabase.from("stellar_colonists").select("*").eq("system_id", systemId).eq("user_id", stellarState.appUser.id).order("name", { ascending: true }),
  ]);

  for (const response of [stars, planets, moons, lifeforms, colonies, colonists]) {
    if (response.error) throw response.error;
  }

  stellarState.stars = stars.data || [];
  stellarState.planets = planets.data || [];
  stellarState.moons = moons.data || [];
  stellarState.lifeforms = lifeforms.data || [];
  stellarState.colonies = colonies.data || [];
  stellarState.colonists = colonists.data || [];
  await fetchStellarImages();
}

async function fetchStellarImages() {
  const objectIds = [
    ...stellarState.stars.map((star) => star.id),
    ...stellarState.planets.map((planet) => planet.id),
    ...stellarState.moons.map((moon) => moon.id),
    ...stellarState.lifeforms.map((lifeform) => lifeform.id),
    ...stellarState.colonies.map((colony) => colony.id),
    ...stellarState.colonists.map((colonist) => colonist.id),
  ].filter(Boolean);
  if (!objectIds.length) {
    stellarState.images = [];
    return;
  }

  const data = await callEdgeFunction("list-object-images", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectIds }),
  });
  stellarState.images = data?.images || [];
}

async function resolveSystemIdForRoute(route) {
  if (route.name === "system") return route.id;
  const tableByRoute = {
    planet: "stellar_planets",
    moon: "stellar_moons",
    lifeform: "stellar_lifeforms",
    colony: "stellar_colonies",
    colonist: "stellar_colonists",
  };
  const table = tableByRoute[route.name];
  if (!table || !route.id) return null;
  const { data, error } = await stellarSupabase
    .from(table)
    .select("system_id")
    .eq("id", route.id)
    .eq("user_id", stellarState.appUser.id)
    .maybeSingle();
  if (error) throw error;
  return data?.system_id || null;
}

async function loadForRoute() {
  stellarState.route = parseRoute();
  if (stellarState.route.name === "systems") {
    stellarState.selectedSystemId = null;
    await fetchSystems();
    await fetchLandingChildren();
    return;
  }

  await fetchSystems();
  const systemId = await resolveSystemIdForRoute(stellarState.route);
  await fetchSystemGraph(systemId);
  if (systemId) {
    stellarState.selectedSystemId = systemId;
  }
}

function placeholder() {
  return '<div class="stellar-placeholder"><ph-planet weight="duotone"></ph-planet><span>No image</span></div>';
}

function sortedObjectImages(objectId) {
  const images = stellarState.images.filter((image) => image.object_id === objectId);
  const primaryIndex = images.findIndex((image) => image.is_primary);
  if (primaryIndex < 0) return images;
  const primaryImage = images[primaryIndex];
  return [primaryImage, ...images.filter((_, index) => index !== primaryIndex)];
}

function primaryObjectImage(objectId) {
  return sortedObjectImages(objectId)[0] || null;
}

function stellarImageConfigForKind(kind) {
  const configs = {
    planet: {
      label: "Planet",
      kicker: "Stellar Planet Viewer",
      source: "Stellar Architect planet image",
      objectKind: "stellar planet",
      elementType(record) {
        return record?.type || "Planet";
      },
      prompt: buildPlanetImagePrompt,
    },
    star: {
      label: "Star",
      kicker: "Stellar Star Viewer",
      source: "Stellar Architect star image",
      objectKind: "stellar star",
      elementType(record) {
        return record?.spectral_type ? `${record.spectral_type} star` : "Star";
      },
      prompt: buildStarImagePrompt,
    },
    moon: {
      label: "Moon",
      kicker: "Stellar Moon Viewer",
      source: "Stellar Architect moon image",
      objectKind: "stellar moon",
      elementType(record) {
        return record?.type || "Moon";
      },
      prompt: buildMoonImagePrompt,
    },
    lifeform: {
      label: "Lifeform",
      kicker: "Stellar Object Viewer",
      source: "Stellar Architect lifeform image",
      objectKind: "stellar lifeform",
      elementType(record) {
        return record?.kingdom || "Alien lifeform";
      },
      prompt: buildLifeformImagePrompt,
    },
    colony: {
      label: "Colony",
      kicker: "Stellar Colony Viewer",
      source: "Stellar Architect colony image",
      objectKind: "stellar colony",
      elementType(record) {
        return record?.settlement_type || record?.location_type || "Colony";
      },
      prompt: buildColonyImagePrompt,
    },
    colonist: {
      label: "Colonist",
      kicker: "Stellar Colonist Portrait Viewer",
      source: "Stellar Architect colonist portrait",
      objectKind: "stellar colonist portrait",
      elementType(record) {
        return record?.role || record?.department || "Human colonist";
      },
      prompt: buildColonistPortraitPrompt,
    },
  };
  return configs[kind] || configs.lifeform;
}

function stellarObjectForKind(kind, id) {
  if (kind === "star") return stellarState.stars.find((star) => star.id === id) || null;
  if (kind === "planet") return planetForId(id);
  if (kind === "moon") return moonForId(id);
  if (kind === "colony") return colonyForId(id);
  if (kind === "colonist") return colonistForId(id);
  return lifeformForId(id);
}

function stellarObjectDisplayName(record, fallback = "Stellar object") {
  return record?.name || record?.designation || fallback;
}

function stellarImageName(image, record, kind) {
  const config = stellarImageConfigForKind(kind);
  const baseName = stellarObjectDisplayName(record, stellarImageDisplayLabel(kind, record, config.label));
  const filename = image?.stored_image_url ? String(image.stored_image_url).split("/").pop() : "";
  if (kind === "colonist") {
    return image?.is_primary ? `${baseName} Primary Portrait` : filename || `${baseName} Portrait`;
  }
  return image?.is_primary ? `${baseName} Primary Image` : filename || `${baseName} Image`;
}

function stellarImageDownloadName(image, record) {
  const filename = image?.stored_image_url ? String(image.stored_image_url).split("/").pop() : "";
  if (filename) return filename;
  const slug = String(stellarObjectDisplayName(record, "stellar-image"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "stellar-image"}.png`;
}

function stellarViewerImagesForObject(record, kind) {
  const config = stellarImageConfigForKind(kind);
  const displayLabel = stellarImageDisplayLabel(kind, record, config.label);
  return sortedObjectImages(record?.id).map((image) => ({
    id: image.id,
    src: image.image_url,
    name: stellarImageName(image, record, kind),
    downloadName: stellarImageDownloadName(image, record),
    alt: `${stellarObjectDisplayName(record, displayLabel)} image`,
    isPrimary: Boolean(image.is_primary),
    metadata: {
      objectId: record?.id,
      storagePath: image.stored_image_url || "",
      role: image.is_primary ? "Primary" : "Supporting",
    },
  })).filter((image) => image.src);
}

function stellarObjectContext(record, kind) {
  const system = systemForId(record?.system_id) || currentSystem();
  const colony = kind === "colony" ? record : record?.colony_id ? colonyForId(record.colony_id) : null;
  const planetId = record?.planet_id || colony?.planet_id;
  const moonId = record?.moon_id || colony?.moon_id;
  const planet = kind === "planet" ? record : planetId ? planetForId(planetId) : null;
  const moon = kind === "moon" ? record : moonId ? moonForId(moonId) : null;
  return { system, planet, moon, colony };
}

function stellarViewerDetailsForObject(record, kind) {
  const config = stellarImageConfigForKind(kind);
  const displayLabel = stellarImageDisplayLabel(kind, record, config.label);
  const { system, planet, moon, colony } = stellarObjectContext(record, kind);
  const colonyColonistCount = kind === "colony"
    ? stellarState.colonists.filter((colonist) => colonist.colony_id === record?.id).length
    : 0;
  const objectRows = kind === "planet"
    ? isAsteroidBelt(record)
      ? [
        ["Asteroid Belt", stellarObjectDisplayName(record, "Asteroid Belt")],
        ["Type", record?.type || "Asteroid Belt"],
        ["System", system?.name || "--"],
        ["Orbital Distance", record?.orbital_distance_au ? `${record.orbital_distance_au} AU` : "--"],
        ["Orbital Period", record?.orbital_period_days ? `${record.orbital_period_days} days` : "--"],
        ["Colonies", String(stellarState.colonies.filter((colonyItem) => colonyItem.planet_id === record?.id).length)],
      ]
      : [
        ["Planet", stellarObjectDisplayName(record, "Planet")],
        ["Type", record?.type || "--"],
        ["System", system?.name || "--"],
        ["Habitability", displayHabitability(record) || "--"],
        ["Atmosphere", record?.atmosphere || "--"],
        ["Water", record?.water_presence || "--"],
        ["Surface Temp", record?.surface_temperature_k ? `${record.surface_temperature_k} K` : "--"],
      ]
    : kind === "moon"
      ? [
        ["Moon", stellarObjectDisplayName(record, "Moon")],
        ["Type", record?.type || "--"],
        ["System", system?.name || "--"],
        ["Parent Planet", planet?.name || "--"],
        ["Atmosphere", record?.atmosphere || "--"],
        ["Water", record?.water_presence || "--"],
        ["Geological Activity", record?.geological_activity || "--"],
      ]
      : kind === "star"
        ? [
          ["Star", stellarObjectDisplayName(record, "Star")],
          ["Spectral Type", record?.spectral_type || "--"],
          ["System", system?.name || "--"],
          ["Mass", record?.mass_solar ? `${record.mass_solar} solar masses` : "--"],
          ["Radius", record?.radius_solar ? `${record.radius_solar} solar radii` : "--"],
          ["Luminosity", record?.luminosity_solar ? `${record.luminosity_solar} solar luminosities` : "--"],
          ["Temperature", record?.temperature_k ? `${record.temperature_k} K` : "--"],
          ["Evolutionary Stage", record?.evolutionary_stage || "--"],
        ]
      : [
        ["Lifeform", stellarObjectDisplayName(record, "Lifeform")],
        ["Species", record?.species_name || "--"],
        ["System", system?.name || "--"],
        ["Planet", planet?.name || "--"],
        ["Moon", moon?.name || "--"],
        ["Biome", record?.biome || record?.habitat || "--"],
        ["Body Type", record?.body_type || "--"],
        ["Scale", record?.scale || "--"],
      ];
  const colonyRows = [
    ["Colony", stellarObjectDisplayName(record, "Colony")],
    ["System", system?.name || "--"],
    ["Parent", planet?.name || moon?.name || "--"],
    ["Location Type", record?.location_type || "--"],
    ["Settlement Type", record?.settlement_type || "--"],
    ["Population", record?.population ? String(record.population) : "--"],
    ["Colonists", String(colonyColonistCount)],
  ];
  const colonistRows = [
    ["Colonist", stellarObjectDisplayName(record, "Colonist")],
    ["System", system?.name || "--"],
    ["Colony", colony?.name || "--"],
    ["Role", record?.role || "--"],
    ["Department", record?.department || "--"],
    ["Specialization", record?.specialization || "--"],
    ["Assignment", record?.primary_role || "--"],
  ];
  const rowsByKind = {
    colony: colonyRows,
    colonist: colonistRows,
  };
  return (image) => ({
    imageInfo: {
      title: "Image Information",
      rows: [
        ["Source", stellarImageSourceLabel(kind, record, config)],
        ["Selected Image", image?.metadata?.storagePath || image?.id || "--"],
        ["Images In Set", String(stellarViewerImagesForObject(record, kind).length || 1)],
        ["Image Role", image?.metadata?.role || "--"],
      ],
    },
    objectDetails: {
      title: `${displayLabel} Details`,
      rows: rowsByKind[kind] || objectRows,
      body: record?.description || record?.visual_appearance || "",
    },
  });
}

async function refreshStellarImagesForViewer(record, kind, activeImageId) {
  await fetchStellarImages();
  renderRoute();
  return {
    images: stellarViewerImagesForObject(record, kind),
    activeImageId,
  };
}

async function uploadStellarViewerImage(record, kind, file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Choose an image file to upload.");
  }
  const config = stellarImageConfigForKind(kind);
  const body = new FormData();
  body.append("objectId", record.id);
  body.append("storageModule", stellarImageStorageModule(kind));
  body.append("objectName", stellarObjectDisplayName(record, stellarImageDisplayLabel(kind, record, config.label)));
  body.append("objectKind", stellarImageObjectKind(kind, record, config));
  body.append("elementType", config.elementType(record));
  body.append("file", file);
  const uploaded = await callEdgeFunction("upload-object-image", { body });
  return refreshStellarImagesForViewer(record, kind, uploaded?.image?.id);
}

function openStellarImageViewer(kind, objectId, activeImageId) {
  const record = stellarObjectForKind(kind, objectId);
  if (!record || typeof window.openCentralisImageViewer !== "function") return;
  const config = stellarImageConfigForKind(kind);
  const displayLabel = stellarImageDisplayLabel(kind, record, config.label);
  const images = stellarViewerImagesForObject(record, kind);
  if (!images.length) return;
  const titleSuffix = kind === "colonist" ? "Portrait" : "Image";
  window.openCentralisImageViewer({
    title: `${stellarObjectDisplayName(record, displayLabel)} ${titleSuffix}`,
    kicker: stellarImageViewerKicker(kind, record, config),
    images,
    activeImageId: activeImageId || images[0]?.id,
    details: stellarViewerDetailsForObject(record, kind),
    capabilities: {
      canNavigate: images.length > 1,
      canShowThumbnails: images.length > 1,
      canSetPrimary: true,
      canOpen: true,
      canDownload: true,
      canDelete: true,
      canUpload: true,
      uploadMode: "add",
      uploadLabel: "Upload",
    },
    actions: {
      upload(file) {
        return uploadStellarViewerImage(record, kind, file);
      },
      async setPrimary(image) {
        await callEdgeFunction("set-primary-image", {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId: image.id }),
        });
        return refreshStellarImagesForViewer(record, kind, image.id);
      },
      async delete(image, index) {
        await callEdgeFunction("delete-object-image", {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId: image.id }),
        });
        const previousImages = stellarViewerImagesForObject(record, kind);
        await fetchStellarImages();
        renderRoute();
        const nextImages = stellarViewerImagesForObject(record, kind);
        if (!nextImages.length) return { close: true };
        const nextIndex = Math.min(index, Math.max(0, previousImages.length - 2));
        return {
          images: nextImages,
          activeImageId: nextImages[nextIndex]?.id || nextImages[0]?.id,
        };
      },
    },
  });
}

function truncatePromptText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function buildLifeformImagePrompt(lifeform) {
  const source = lifeform.planet_id ? planetForId(lifeform.planet_id) : moonForId(lifeform.moon_id);
  const lines = [
    "Scientifically plausible alien lifeform concept art.",
    `Lifeform: ${lifeform.name || lifeform.designation || "Unnamed organism"}.`,
    lifeform.species_name ? `Species: ${lifeform.species_name}.` : "",
    lifeform.kingdom ? `Kingdom: ${lifeform.kingdom}.` : "",
    lifeform.body_type ? `Body type: ${lifeform.body_type}.` : "",
    lifeform.scale ? `Scale: ${lifeform.scale}.` : "",
    lifeform.biome || lifeform.habitat ? `Habitat: ${lifeform.biome || lifeform.habitat}.` : "",
    lifeform.locomotion ? `Locomotion: ${lifeform.locomotion}.` : "",
    lifeform.diet ? `Diet: ${lifeform.diet}.` : "",
    lifeform.skin_color ? `Color and surface texture: ${lifeform.skin_color}.` : "",
    lifeform.sensory ? `Sensory adaptation: ${lifeform.sensory}.` : "",
    lifeform.thermal_regulation ? `Thermal regulation: ${lifeform.thermal_regulation}.` : "",
    source ? `Native world conditions: ${source.name}; atmosphere ${source.atmosphere || "unknown"}; water ${source.water_presence || "unknown"}; gravity ${source.gravity_ms2 || "unknown"} m/s2; surface temperature ${source.surface_temperature_k || "unknown"} K.` : "",
    lifeform.description ? `Description: ${truncatePromptText(lifeform.description, 1300)}` : "",
    "Show the organism clearly in its environment. No labels, captions, diagrams, UI, logos, or watermarks.",
  ].filter(Boolean);
  return truncatePromptText(lines.join("\n"), 3800);
}

function buildStarImagePrompt(star) {
  const system = systemForId(star?.system_id) || currentSystem();
  const lines = [
    "Scientifically plausible stellar astronomy concept art.",
    `Star: ${star?.name || system?.name || "Unnamed star"}.`,
    star?.spectral_type ? `Spectral type: ${star.spectral_type}.` : "",
    star?.mass_solar ? `Mass: ${star.mass_solar} solar masses.` : "",
    star?.radius_solar ? `Radius: ${star.radius_solar} solar radii.` : "",
    star?.luminosity_solar ? `Luminosity: ${star.luminosity_solar} solar luminosities.` : "",
    star?.temperature_k ? `Surface temperature: ${star.temperature_k} K.` : "",
    star?.magnetic_activity ? `Magnetic activity: ${star.magnetic_activity}.` : "",
    star?.evolutionary_stage ? `Evolutionary stage: ${star.evolutionary_stage}.` : "",
    star?.description ? `Description: ${truncatePromptText(star.description, 1200)}` : "",
    "Show the star as the central subject with surrounding space, light, corona, and any visible stellar activity. No labels, captions, diagrams, UI, logos, or watermarks.",
  ].filter(Boolean);
  return truncatePromptText(lines.join("\n"), 3800);
}

function buildPlanetImagePrompt(planet) {
  const system = systemForId(planet?.system_id) || currentSystem();
  const isBelt = isAsteroidBelt(planet);
  const lines = [
    isBelt ? "Scientifically plausible asteroid belt concept art." : "Scientifically plausible exoplanet concept art.",
    `${isBelt ? "Asteroid belt" : "Planet"}: ${planet?.name || planet?.designation || (isBelt ? "Unnamed asteroid belt" : "Unnamed planet")}.`,
    system ? `Star system: ${system.name}.` : "",
    planet?.type ? `${isBelt ? "Belt type" : "Planet type"}: ${planet.type}.` : "",
    !isBelt && planet ? `Habitability: ${displayHabitability(planet) || "unknown"}.` : "",
    !isBelt && planet?.atmosphere ? `Atmosphere: ${planet.atmosphere}.` : "",
    !isBelt && planet?.water_presence ? `Water: ${planet.water_presence}.` : "",
    !isBelt && planet?.climate ? `Climate: ${planet.climate}.` : "",
    !isBelt && planet?.surface_temperature_k ? `Surface temperature: ${planet.surface_temperature_k} K.` : "",
    !isBelt && planet?.gravity_ms2 ? `Gravity: ${planet.gravity_ms2} m/s2.` : "",
    !isBelt && planet?.rings ? "The planet has rings." : "",
    isBelt && planet?.orbital_distance_au ? `Orbital distance: ${planet.orbital_distance_au} AU.` : "",
    isBelt && planet?.orbital_period_days ? `Orbital period: ${planet.orbital_period_days} days.` : "",
    planet?.visual_appearance ? `Visual appearance: ${truncatePromptText(planet.visual_appearance, 900)}` : "",
    planet?.description ? `Description: ${truncatePromptText(planet.description, 1200)}` : "",
    isBelt
      ? "Show a cinematic asteroid belt vista with scientifically plausible rock fields, dust, orbital scale, nearby star light, and any industrial colony context where relevant. No planet surface framing, labels, captions, diagrams, UI, logos, or watermarks."
      : "Show the planet clearly as a cinematic space vista, with scientifically plausible atmosphere, surface, clouds, rings, or terrain where relevant. No labels, captions, diagrams, UI, logos, or watermarks.",
  ].filter(Boolean);
  return truncatePromptText(lines.join("\n"), 3800);
}

function buildMoonImagePrompt(moon) {
  const planet = moon?.planet_id ? planetForId(moon.planet_id) : null;
  const system = systemForId(moon?.system_id) || currentSystem();
  const lines = [
    "Scientifically plausible moon concept art.",
    `Moon: ${moon?.name || moon?.designation || "Unnamed moon"}.`,
    system ? `Star system: ${system.name}.` : "",
    planet ? `Parent planet: ${planet.name}.` : "",
    moon?.type ? `Moon type: ${moon.type}.` : "",
    moon?.atmosphere ? `Atmosphere: ${moon.atmosphere}.` : "",
    moon?.water_presence ? `Water: ${moon.water_presence}.` : "",
    moon?.geological_activity ? `Geological activity: ${moon.geological_activity}.` : "",
    moon?.surface_temperature_k ? `Surface temperature: ${moon.surface_temperature_k} K.` : "",
    moon?.visual_appearance ? `Visual appearance: ${truncatePromptText(moon.visual_appearance, 900)}` : "",
    moon?.description ? `Description: ${truncatePromptText(moon.description, 1200)}` : "",
    "Show the moon clearly as a cinematic planetary scene, with its surface and parent planet or local sky visible where appropriate. No labels, captions, diagrams, UI, logos, or watermarks.",
  ].filter(Boolean);
  return truncatePromptText(lines.join("\n"), 3800);
}

function buildColonyImagePrompt(colony) {
  const { system, planet, moon } = stellarObjectContext(colony, "colony");
  const parent = planet || moon;
  const lines = [
    "Scientifically plausible frontier space colony concept art.",
    `Colony: ${colony?.name || "Unnamed colony"}.`,
    system ? `Star system: ${system.name}.` : "",
    parent ? `Parent body: ${parent.name}.` : "",
    colony?.location_type ? `Location type: ${colony.location_type}.` : "",
    colony?.settlement_type ? `Settlement type: ${colony.settlement_type}.` : "",
    colony?.organization ? `Organization: ${colony.organization}.` : "",
    colony?.primary_biome ? `Local environment: ${colony.primary_biome}.` : "",
    colony?.local_hazards ? `Hazards: ${colony.local_hazards}.` : "",
    colony?.energy_sources ? `Energy systems: ${colony.energy_sources}.` : "",
    colony?.water_source ? `Water source: ${colony.water_source}.` : "",
    colony?.industry ? `Primary work: ${colony.industry}.` : "",
    colony?.housing ? `Housing: ${colony.housing}.` : "",
    colony?.location_notes ? `Location notes: ${truncatePromptText(colony.location_notes, 900)}` : "",
    colony?.description ? `Description: ${truncatePromptText(colony.description, 1200)}` : "",
    "Show the colony environment clearly: structures, habitat systems, terrain or orbital context, and scale. No sentient aliens, alien ruins, alien artifacts, captions, diagrams, UI, logos, or watermarks.",
  ].filter(Boolean);
  return truncatePromptText(lines.join("\n"), 3800);
}

function buildColonistPortraitPrompt(colonist) {
  const colony = colonist?.colony_id ? colonyForId(colonist.colony_id) : null;
  const { system, planet, moon } = stellarObjectContext(colonist, "colonist");
  const parent = planet || moon;
  const profile = colonist?.profile || {};
  const lines = [
    "Realistic science fiction character portrait of a human colonist.",
    `Colonist: ${colonist?.name || "Unnamed colonist"}.`,
    colonist?.role ? `Role: ${colonist.role}.` : "",
    colonist?.department ? `Department: ${colonist.department}.` : "",
    colonist?.specialization ? `Specialization: ${colonist.specialization}.` : "",
    colonist?.age ? `Age: ${colonist.age}.` : "",
    colonist?.gender ? `Gender: ${colonist.gender}.` : "",
    colonist?.nationality ? `Origin or nationality: ${colonist.nationality}.` : "",
    colonist?.personality ? `Personality: ${colonist.personality}.` : "",
    colonist?.temperament ? `Temperament: ${colonist.temperament}.` : "",
    colonist?.physical_description ? `Physical description: ${truncatePromptText(colonist.physical_description, 900)}` : "",
    colony ? `Colony: ${colony.name}; ${colony.location_type || "unknown location type"}.` : "",
    parent ? `Parent body: ${parent.name}.` : "",
    system ? `Star system: ${system.name}.` : "",
    profile.background ? `Background: ${truncatePromptText(profile.background, 700)}` : "",
    colonist?.biography ? `Biography: ${truncatePromptText(colonist.biography, 1000)}` : "",
    "Portrait framing, face and upper body visible, practical colony clothing and tools appropriate to their work. No labels, captions, diagrams, UI, logos, or watermarks.",
  ].filter(Boolean);
  return truncatePromptText(lines.join("\n"), 3800);
}

function isAsteroidBelt(planet) {
  return String(planet?.type || "").toLowerCase().includes("asteroid");
}

function stellarPlanetKindLabel(planet) {
  return isAsteroidBelt(planet) ? "Asteroid Belt" : "Planet";
}

function stellarPlanetIcon(planet) {
  return isAsteroidBelt(planet) ? "<ph-meteor></ph-meteor>" : "<ph-planet></ph-planet>";
}

function stellarImageDisplayLabel(kind, record, fallback = "Stellar object") {
  if (kind === "planet") return stellarPlanetKindLabel(record);
  return fallback;
}

function stellarImageViewerKicker(kind, record, config) {
  if (kind === "planet" && isAsteroidBelt(record)) return "Stellar Asteroid Belt Viewer";
  return config.kicker;
}

function stellarImageObjectKind(kind, record, config) {
  if (kind === "planet" && isAsteroidBelt(record)) return "stellar asteroid belt";
  return config.objectKind;
}

function stellarImageSourceLabel(kind, record, config) {
  if (kind === "planet" && isAsteroidBelt(record)) return "Stellar Architect asteroid belt image";
  return config.source;
}

function habitabilityClass(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "potentially habitable") return "is-habitable";
  if (normalized === "too hot") return "is-too-hot";
  if (normalized === "too cold") return "is-too-cold";
  if (normalized === "gas giant") return "is-gas-giant";
  if (normalized === "no atmosphere") return "is-no-atmosphere";
  if (normalized === "not-applicable") return "is-asteroid-belt";
  if (normalized === "not habitable") return "is-unknown";
  if (normalized === "asteroid belt") return "is-asteroid-belt";
  return "is-unknown";
}

function displayHabitability(planet) {
  if (!planet) return "";
  if (isAsteroidBelt(planet)) return "Not-applicable";
  const type = String(planet.type || "").toLowerCase();
  if (type.includes("gas") || type.includes("jovian")) return "Gas Giant";

  const raw = String(planet.habitability || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized && !["non-applicable", "not applicable", "n/a", "unknown"].includes(normalized)) {
    return raw;
  }

  const surfaceTemp = Number(planet.surface_temperature_k);
  if (Number.isFinite(surfaceTemp)) {
    if (surfaceTemp > 320) return "Too Hot";
    if (surfaceTemp < 240) return "Too Cold";
  }
  if (!String(planet.atmosphere || "").trim() || String(planet.atmosphere || "").toLowerCase().includes("none")) {
    return "No Atmosphere";
  }
  return "Not Habitable";
}

function planetTypeBadge(planet) {
  const asteroidClass = isAsteroidBelt(planet) ? " is-asteroid-type" : "";
  return `<span class="stellar-badge stellar-type-badge${asteroidClass}">${escapeHtml(planet.type || "Planet")}</span>`;
}

function habitabilityBadge(value) {
  if (!value) return "";
  return `<span class="stellar-badge stellar-habitability-badge ${habitabilityClass(value)}">${escapeHtml(value)}</span>`;
}

function planetHabitabilityBadge(planet) {
  return habitabilityBadge(displayHabitability(planet));
}

function systemBadges(system) {
  const planets = stellarState.planets.filter((planet) => planet.system_id === system.id);
  const habitable = planets.some((planet) => displayHabitability(planet) === "Potentially Habitable");
  const colonized = stellarState.colonies.some((colony) => colony.system_id === system.id);
  return [
    habitable ? '<span class="stellar-badge">Habitable</span>' : "",
    colonized ? '<span class="stellar-badge">Colonized</span>' : "",
  ].join("");
}

function planetDots(system) {
  const colors = ["#d28a2e", "#e9b11f", "#8bb957", "#81919f", "#20b8dc", "#42a5f5", "#8b63df", "#ee6aa7"];
  const planets = stellarState.planets.filter((planet) => planet.system_id === system.id);
  const dots = planets.slice(0, 7).map((_, index) => `<span style="background:${colors[index % colors.length]}"></span>`).join("");
  return `<span class="stellar-planet-dots">${dots}${planets.length > 7 ? `<em>+${planets.length - 7}</em>` : ""}</span>`;
}

function landingImageForSystem(star, planets) {
  const orderedObjects = [star, ...planets].filter(Boolean);
  for (const object of orderedObjects) {
    const image = primaryObjectImage(object.id);
    if (image?.image_url) return image;
  }
  return null;
}

function renderLanding() {
  const total = stellarState.systems.length;
  const cards = stellarState.systems.map((system) => {
    const star = stellarState.stars.find((item) => item.system_id === system.id);
    const planets = stellarState.planets.filter((planet) => planet.system_id === system.id && !isAsteroidBelt(planet));
    const colonies = stellarState.colonies.filter((colony) => colony.system_id === system.id);
    const landingImage = landingImageForSystem(star, planets);
    const systemSummary = [
      `${formatValue(star?.spectral_type)} star`,
      `${planets.length || Number(system.planet_count || 0)} planets`,
      `${formatNumber(system.age_gyr, " Gyr", 1)} old`,
      `${colonies.length} colonies`,
    ].join(" · ");
    const starDescription = createBlurb(star?.description || system.description || "", 220);
    return `
      <article class="universe-card-wrap stellar-system-card-wrap">
        <a class="universe-card stellar-system-card ${landingImage ? "has-background-image" : ""}" href="#system/${encodeURIComponent(system.id)}">
          ${landingImage ? `<img class="stellar-system-card-background" src="${escapeHtml(landingImage.image_url)}" alt="" aria-hidden="true" loading="lazy">` : ""}
          <span class="card-icon" aria-hidden="true">
            <ph-star weight="duotone"></ph-star>
          </span>
          <span class="universe-card-copy">
            <span class="stellar-system-title-row">
              <strong>${escapeHtml(system.name)}</strong>
              <span class="stellar-badges">${systemBadges(system)}</span>
            </span>
            <span class="stellar-system-meta">${escapeHtml(systemSummary)} · Created ${formatShortDate(system.created_at)}</span>
            ${starDescription ? `<span class="universe-card-description-short">${escapeHtml(starDescription)}</span>` : ""}
          </span>
        </a>
      </article>
    `;
  }).join("");

  stellarEls.root.innerHTML = `
    <section class="stellar-landing">
      <section class="universe-builder-toolbar stellar-home-toolbar">
        <div>
          <p class="universe-builder-eyebrow">World Building</p>
          <h1 id="stellar-architect-title">Stellar Architect</h1>
        </div>
        <div class="universe-builder-toolbar-actions">
          <button class="primary-action" type="button" data-open-generate-system>
            <ph-plus weight="bold" aria-hidden="true"></ph-plus>
            Generate System
          </button>
        </div>
      </section>
      <section class="universe-builder-controls stellar-home-controls" aria-label="Stellar Architect summary">
        <p class="universe-builder-count">${total} ${total === 1 ? "system" : "systems"} in your archive</p>
      </section>
      <div class="universe-grid is-card-view stellar-home-grid">
        ${cards || `
          <div class="stellar-empty-state">
            <ph-star weight="fill"></ph-star>
            <h2>No star systems yet</h2>
            <p>Generate a scientifically plausible fictional system to begin.</p>
            <button class="primary-action" type="button" data-open-generate-system>Generate System</button>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderStat(label, value) {
  return `<div class="stellar-stat"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function stellarImagePlaceholderIcon(kind) {
  if (kind === "star") return '<ph-star weight="fill"></ph-star>';
  if (kind === "moon") return '<ph-moon weight="duotone"></ph-moon>';
  if (kind === "lifeform") return '<ph-dna weight="duotone"></ph-dna>';
  if (kind === "colony") return '<ph-buildings weight="duotone"></ph-buildings>';
  if (kind === "colonist") return '<ph-user weight="duotone"></ph-user>';
  return '<ph-planet weight="duotone"></ph-planet>';
}

function renderStellarImageBlock(kind, record, sizeClass = "") {
  const image = primaryObjectImage(record?.id);
  const config = stellarImageConfigForKind(kind);
  const actionLabel = image ? "Regenerate" : "Generate";
  const objectName = stellarObjectDisplayName(record, config.label);
  return `
    <div class="stellar-lifeform-image-block ${sizeClass}">
      ${image?.image_url
        ? `<button class="stellar-lifeform-image" type="button" data-open-stellar-image-kind="${escapeHtml(kind)}" data-open-stellar-image-id="${escapeHtml(record.id)}" data-stellar-image-id="${escapeHtml(image.id)}" aria-label="View ${escapeHtml(objectName)} image">
          <img src="${escapeHtml(image.image_url)}" alt="">
        </button>`
        : `<div class="stellar-lifeform-image stellar-object-image-placeholder" aria-label="${escapeHtml(objectName)} has no image">
          ${stellarImagePlaceholderIcon(kind)}
          <span>No Image</span>
        </div>`}
      <button class="stellar-lifeform-image-action" type="button" data-generate-stellar-image-kind="${escapeHtml(kind)}" data-generate-stellar-image-id="${escapeHtml(record.id)}">
        <ph-arrows-clockwise weight="bold"></ph-arrows-clockwise>
        ${actionLabel}
      </button>
    </div>
  `;
}

function renderStellarRowImage(kind, record, fallbackIcon) {
  const image = primaryObjectImage(record?.id);
  const config = stellarImageConfigForKind(kind);
  const objectName = stellarObjectDisplayName(record, stellarImageDisplayLabel(kind, record, config.label));
  if (!image?.image_url) {
    return `<div class="stellar-row-image">${fallbackIcon}</div>`;
  }
  return `
    <div class="stellar-row-image has-image">
      <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(objectName)} image">
    </div>
  `;
}

function planetDescriptionText(planet) {
  const parts = [planet.visual_appearance, planet.description]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return [...new Set(parts)].join("\n\n");
}

function renderStellarDetailImageHeader(kind, record, fallbackLabel) {
  const image = primaryObjectImage(record?.id);
  const actionLabel = image ? "Regenerate" : "Generate";
  const objectName = stellarObjectDisplayName(record, fallbackLabel);
  const imageLayer = image?.image_url
    ? `<button class="stellar-planet-image-viewer" type="button" data-open-stellar-image-kind="${escapeHtml(kind)}" data-open-stellar-image-id="${escapeHtml(record.id)}" data-stellar-image-id="${escapeHtml(image.id)}" aria-label="View ${escapeHtml(objectName)} image">
        <img src="${escapeHtml(image.image_url)}" alt="">
      </button>`
    : `<div class="stellar-planet-image-placeholder" aria-label="${escapeHtml(objectName)} has no image">
        ${stellarImagePlaceholderIcon(kind)}
        <span>No Image</span>
      </div>`;

  return `
    <section class="stellar-planet-image-header" aria-label="${escapeHtml(objectName)} image">
      ${imageLayer}
      <button class="stellar-planet-image-action" type="button" data-generate-stellar-image-kind="${escapeHtml(kind)}" data-generate-stellar-image-id="${escapeHtml(record.id)}">
        <ph-arrows-clockwise weight="bold"></ph-arrows-clockwise>
        ${actionLabel}
      </button>
    </section>
  `;
}

function renderPlanetImageHeader(planet) {
  return renderStellarDetailImageHeader("planet", planet, stellarPlanetKindLabel(planet));
}

function colonistProfileValue(profile, keys) {
  for (const key of keys) {
    const value = profile?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return "";
}

function formatColonistProfileLabel(key) {
  const labels = {
    background: "Background",
    personalConflict: "Personal Conflict",
    personal_conflict: "Personal Conflict",
    currentAssignment: "Current Assignment",
    current_assignment: "Current Assignment",
  };
  if (labels[key]) return labels[key];
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderColonistPortraitArea(colonist) {
  const images = sortedObjectImages(colonist?.id);
  const primary = images[0] || null;
  const profile = colonist.profile || {};
  const objectName = stellarObjectDisplayName(colonist, "Colonist");
  const actionLabel = primary ? "Regenerate" : "Generate";
  const portraitStats = [
    ["Age", formatValue(colonist.age)],
    ["Gender", formatValue(colonist.gender)],
    ["Nationality", formatValue(colonist.nationality)],
    ["Role", formatValue(colonist.role)],
    ["Department", formatValue(colonist.department)],
  ];
  const featuredProfile = [
    ["background", colonistProfileValue(profile, ["background"])],
    ["personalConflict", colonistProfileValue(profile, ["personalConflict", "personal_conflict"])],
    ["currentAssignment", colonistProfileValue(profile, ["currentAssignment", "current_assignment"])],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const portrait = primary?.image_url
    ? `<button class="stellar-colonist-portrait-image" type="button" data-open-stellar-image-kind="colonist" data-open-stellar-image-id="${escapeHtml(colonist.id)}" data-stellar-image-id="${escapeHtml(primary.id)}" aria-label="View ${escapeHtml(objectName)} portrait">
        <img src="${escapeHtml(primary.image_url)}" alt="${escapeHtml(objectName)} portrait">
      </button>`
    : `<div class="stellar-colonist-portrait-placeholder">
        ${stellarImagePlaceholderIcon("colonist")}
        <span>No Portrait</span>
      </div>`;
  const gallery = images.length
    ? `<div class="stellar-colonist-portrait-gallery" aria-label="${escapeHtml(objectName)} portrait gallery">
        ${images.map((image) => `
          <button class="stellar-colonist-portrait-thumb ${image.id === primary?.id ? "is-active" : ""}" type="button" data-open-stellar-image-kind="colonist" data-open-stellar-image-id="${escapeHtml(colonist.id)}" data-stellar-image-id="${escapeHtml(image.id)}" aria-label="View portrait ${escapeHtml(stellarImageName(image, colonist, "colonist"))}">
            <img src="${escapeHtml(image.image_url)}" alt="">
          </button>
        `).join("")}
      </div>`
    : '<p class="stellar-muted">Generated portraits will appear here.</p>';

  return `
    <div class="stellar-colonist-portrait-area">
      <div class="stellar-colonist-portrait-frame">
        ${portrait}
        <button class="stellar-colonist-portrait-action" type="button" data-generate-stellar-image-kind="colonist" data-generate-stellar-image-id="${escapeHtml(colonist.id)}">
          <ph-arrows-clockwise weight="bold"></ph-arrows-clockwise>
          ${actionLabel}
        </button>
      </div>
      <div class="stellar-colonist-portrait-side">
        <p class="stellar-section-kicker">Portrait Gallery</p>
        ${gallery}
        <div class="stellar-colonist-portrait-meta stellar-stat-grid-flipped">
          ${portraitStats.map(([label, value]) => renderStat(label, value)).join("")}
        </div>
        ${featuredProfile.length ? `<div class="stellar-colonist-profile-callouts stellar-stat-grid-flipped">
          ${featuredProfile.map(([key, value]) => renderStat(formatColonistProfileLabel(key), formatValue(value))).join("")}
        </div>` : ""}
      </div>
    </div>
  `;
}

function renderSystemPage(system) {
  const star = starForSystem(system.id);
  const planets = stellarState.planets.filter((planet) => planet.system_id === system.id);
  const planetCount = planets.filter((planet) => !isAsteroidBelt(planet)).length;
  const planetsWithoutImages = planets.filter((planet) => !isAsteroidBelt(planet) && !sortedObjectImages(planet.id).length);
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      ${renderStellarBreadcrumbs(stellarSystemBreadcrumbs(system, true))}
      <div class="stellar-page-actions">
        <button class="secondary-action" type="button" data-export-system><ph-download-simple weight="bold"></ph-download-simple> Export</button>
      </div>
    </header>
    <section class="stellar-detail-scroll">
      <h1 class="stellar-planet-page-title">Star - ${escapeHtml(star?.name || system.name)}</h1>
      ${star ? renderStellarDetailImageHeader("star", star, "Star") : ""}
      <article class="stellar-panel stellar-star-panel stellar-planet-properties-panel">
        <h2><ph-star weight="fill"></ph-star> Star Properties</h2>
        <div class="stellar-star-properties-body">
          <div class="stellar-stat-grid">
            ${renderStat("Spectral Type", formatValue(star?.spectral_type))}
            ${renderStat("Mass", formatNumber(star?.mass_solar, " M☉"))}
            ${renderStat("Radius", formatNumber(star?.radius_solar, " R☉"))}
            ${renderStat("Luminosity", formatNumber(star?.luminosity_solar, " L☉"))}
            ${renderStat("Temperature", formatNumber(star?.temperature_k, " K", 0))}
            ${renderStat("Metallicity [Fe/H]", formatNumber(star?.metallicity_feh, "", 2))}
            ${renderStat("Rotational Velocity", formatNumber(star?.rotational_velocity_kms, " km/s"))}
            ${renderStat("Magnetic Activity", formatValue(star?.magnetic_activity))}
            ${renderStat("Age", formatNumber(star?.age_gyr, " Gyr", 1))}
            ${renderStat("Evolutionary Stage", formatValue(star?.evolutionary_stage))}
          </div>
        </div>
        <p class="stellar-description">${escapeHtml(star?.description || system.description || "")}</p>
        <p class="stellar-zone">Habitable Zone <strong>${formatNumber(star?.habitable_zone_inner_au, " AU")} - ${formatNumber(star?.habitable_zone_outer_au, " AU")}</strong></p>
      </article>
      <article class="stellar-panel">
        <div class="stellar-section-heading">
          <h2><ph-globe-hemisphere-west></ph-globe-hemisphere-west> Planetary System</h2>
          <div class="stellar-section-actions">
            <span>${planetCount} planets detected</span>
            <button class="primary-action" type="button" data-open-stellar-details="${escapeHtml(system.id)}">
              <ph-gear-six weight="bold" aria-hidden="true"></ph-gear-six>
              Generate Details
            </button>
            <button class="secondary-action" type="button" data-generate-planet-images-system="${escapeHtml(system.id)}" ${planetsWithoutImages.length ? "" : "disabled"}>
              <ph-arrows-clockwise weight="bold" aria-hidden="true"></ph-arrows-clockwise>
              Generate All Images
            </button>
          </div>
        </div>
        <div class="stellar-body-list">
          ${planets.map(renderPlanetSummary).join("") || '<p class="stellar-muted">No planetary bodies generated.</p>'}
        </div>
      </article>
    </section>
  `;
}

function renderPlanetSummary(planet) {
  const isBelt = isAsteroidBelt(planet);
  const fallbackIcon = isBelt ? '<ph-meteor weight="duotone"></ph-meteor>' : '<ph-planet weight="duotone"></ph-planet>';
  const colonies = stellarState.colonies.filter((colony) => colony.planet_id === planet.id);
  const statItems = isBelt
    ? [
      renderStat("Type", formatValue(planet.type || "Asteroid Belt")),
      renderStat("Distance", formatNumber(planet.orbital_distance_au, " AU")),
      renderStat("Orbital Period", formatNumber(planet.orbital_period_days, " days", 1)),
      renderStat("Colonies", formatNumber(colonies.length, "", 0)),
    ]
    : [
      renderStat("Mass", formatNumber(planet.mass_earth, " MâŠ•")),
      renderStat("Radius", formatNumber(planet.radius_earth, " RâŠ•")),
      renderStat("Distance", formatNumber(planet.orbital_distance_au, " AU")),
      renderStat("Moons", formatNumber(planet.moon_count, "", 0)),
      renderStat("Atmosphere", formatValue(planet.atmosphere)),
      renderStat("Water", formatValue(planet.water_presence)),
      renderStat("Orbital Period", formatNumber(planet.orbital_period_days, " days", 1)),
      renderStat("Surface Temp", formatNumber(planet.surface_temperature_k, " K", 0)),
    ];
  if (isBelt) {
    return `
      <a class="stellar-body-row" href="#planet/${encodeURIComponent(planet.id)}">
        ${renderStellarRowImage("planet", planet, fallbackIcon)}
        <div class="stellar-row-main">
          <div class="stellar-row-title">
            <h3>${escapeHtml(planet.name)}</h3>
            ${planetTypeBadge(planet)}
          </div>
          <div class="stellar-mini-grid">
            ${statItems.join("")}
          </div>
          <p>${escapeHtml(planet.description || planet.visual_appearance || "")}</p>
        </div>
      </a>
    `;
  }
  return `
    <a class="stellar-body-row" href="#planet/${encodeURIComponent(planet.id)}">
      ${renderStellarRowImage("planet", planet, fallbackIcon)}
      <div class="stellar-row-main">
        <div class="stellar-row-title">
          <h3>${escapeHtml(planet.name)}</h3>
          ${planetTypeBadge(planet)}
          ${isBelt ? "" : planetHabitabilityBadge(planet)}
        </div>
        <div class="stellar-mini-grid">
          ${renderStat("Mass", formatNumber(planet.mass_earth, " M⊕"))}
          ${renderStat("Radius", formatNumber(planet.radius_earth, " R⊕"))}
          ${renderStat("Distance", formatNumber(planet.orbital_distance_au, " AU"))}
          ${renderStat("Moons", formatNumber(planet.moon_count, "", 0))}
          ${renderStat("Atmosphere", formatValue(planet.atmosphere))}
          ${renderStat("Water", formatValue(planet.water_presence))}
          ${renderStat("Orbital Period", formatNumber(planet.orbital_period_days, " days", 1))}
          ${renderStat("Surface Temp", formatNumber(planet.surface_temperature_k, " K", 0))}
        </div>
        <p>${escapeHtml(planet.description || planet.visual_appearance || "")}</p>
      </div>
    </a>
  `;
}

function renderPlanetPage(planet) {
  const moons = stellarState.moons.filter((moon) => moon.planet_id === planet.id);
  const moonsWithoutImages = moons.filter((moon) => !sortedObjectImages(moon.id).length);
  const lifeforms = stellarState.lifeforms.filter((lifeform) => lifeform.planet_id === planet.id);
  const colonies = stellarState.colonies.filter((colony) => colony.planet_id === planet.id);
  const descriptionText = planetDescriptionText(planet);
  const isBelt = isAsteroidBelt(planet);
  const bodyLabel = stellarPlanetKindLabel(planet);
  if (isBelt) {
    stellarEls.root.innerHTML = `
      <header class="stellar-detail-toolbar">
        ${renderStellarBreadcrumbs(stellarObjectBreadcrumbs("planet", planet))}
      </header>
      <section class="stellar-detail-scroll">
        <h1 class="stellar-planet-page-title">${escapeHtml(bodyLabel)} - ${escapeHtml(planet.name)}</h1>
        ${renderPlanetImageHeader(planet)}
        <article class="stellar-panel stellar-planet-properties-panel">
          <h2>${stellarPlanetIcon(planet)} ${escapeHtml(bodyLabel)} Properties</h2>
          <div class="stellar-planet-property-badges">
            ${planetTypeBadge(planet)}
          </div>
          ${descriptionText ? `<p class="stellar-description stellar-planet-description">${escapeHtml(descriptionText)}</p>` : ""}
          <div class="stellar-stat-grid">
            ${renderStat("Type", formatValue(planet.type || "Asteroid Belt"))}
            ${renderStat("Orbital Distance", formatNumber(planet.orbital_distance_au, " AU"))}
            ${renderStat("Orbital Period", formatNumber(planet.orbital_period_days, " days", 1))}
            ${renderStat("Colonies", formatNumber(colonies.length, "", 0))}
          </div>
        </article>
        ${renderColonyShell(colonies, { planetId: planet.id })}
      </section>
    `;
    return;
  }
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      ${renderStellarBreadcrumbs(stellarObjectBreadcrumbs("planet", planet))}
      <div class="stellar-page-actions">
        <button class="primary-action is-orange" type="button" data-generate-moons="${escapeHtml(planet.id)}"><ph-moon weight="bold"></ph-moon> Generate Details</button>
      </div>
    </header>
    <section class="stellar-detail-scroll">
      <h1 class="stellar-planet-page-title">${escapeHtml(bodyLabel)} - ${escapeHtml(planet.name)}</h1>
      ${renderPlanetImageHeader(planet)}
      <article class="stellar-panel stellar-planet-properties-panel">
        <h2>${stellarPlanetIcon(planet)} ${escapeHtml(bodyLabel)} Properties</h2>
        <div class="stellar-planet-property-badges">
          ${planetTypeBadge(planet)}
          ${planetHabitabilityBadge(planet)}
        </div>
        ${descriptionText ? `<p class="stellar-description stellar-planet-description">${escapeHtml(descriptionText)}</p>` : ""}
        <div class="stellar-stat-grid">
          ${renderStat("Mass", formatNumber(planet.mass_earth, " M⊕"))}
          ${renderStat("Radius", formatNumber(planet.radius_earth, " R⊕"))}
          ${renderStat("Density", formatNumber(planet.density_g_cm3, " g/cm³"))}
          ${renderStat("Gravity", formatNumber(planet.gravity_ms2, " m/s²"))}
          ${renderStat("Surface Temp", formatNumber(planet.surface_temperature_k, " K", 0))}
          ${renderStat("Rings", planet.rings ? "Yes" : "No")}
          ${renderStat("Orbital Distance", formatNumber(planet.orbital_distance_au, " AU"))}
          ${renderStat("Orbital Period", formatNumber(planet.orbital_period_days, " days", 1))}
          ${renderStat("Rotation Period", formatNumber(planet.rotation_period_hours, " hrs", 1))}
          ${renderStat("Atmosphere", formatValue(planet.atmosphere))}
          ${renderStat("Water Presence", formatValue(planet.water_presence))}
          ${renderStat("Magnetosphere", formatValue(planet.magnetosphere))}
        </div>
      </article>
      <article class="stellar-panel">
        <div class="stellar-section-heading">
          <h2><ph-eye></ph-eye> Moons (${moons.length})</h2>
          <div class="stellar-section-actions">
            <button class="secondary-action" type="button" data-generate-moons="${escapeHtml(planet.id)}">Generate Moons</button>
            <button class="secondary-action" type="button" data-generate-moon-images-planet="${escapeHtml(planet.id)}" ${moonsWithoutImages.length ? "" : "disabled"}>
              <ph-arrows-clockwise weight="bold" aria-hidden="true"></ph-arrows-clockwise>
              Generate All Images
            </button>
          </div>
        </div>
        <div class="stellar-body-list">${moons.map(renderMoonSummary).join("") || '<p class="stellar-muted">No moons generated yet.</p>'}</div>
      </article>
      ${renderLifeformShell(lifeforms, { planetId: planet.id })}
      ${renderColonyShell(colonies, { planetId: planet.id })}
    </section>
  `;
}

function renderMoonSummary(moon) {
  return `
    <a class="stellar-body-row" href="#moon/${encodeURIComponent(moon.id)}">
      ${renderStellarRowImage("moon", moon, '<ph-moon weight="duotone"></ph-moon>')}
      <div class="stellar-row-main">
        <div class="stellar-row-title">
          <h3>${escapeHtml(moon.name)}</h3>
          <span class="stellar-badge">${escapeHtml(moon.type || "Moon")}</span>
        </div>
        <div class="stellar-mini-grid">
          ${renderStat("Mass", formatNumber(moon.mass_lunar, " M☾"))}
          ${renderStat("Radius", formatNumber(moon.radius_lunar, " R☾"))}
          ${renderStat("Distance", formatNumber(moon.orbital_distance_km, " km", 0))}
          ${renderStat("Period", formatNumber(moon.orbital_period_days, " days", 1))}
          ${renderStat("Temperature", formatNumber(moon.surface_temperature_k, " K", 0))}
          ${renderStat("Activity", formatValue(moon.geological_activity))}
        </div>
        <p>${escapeHtml(moon.description || moon.visual_appearance || "")}</p>
      </div>
    </a>
  `;
}

function renderLifeformShell(lifeforms, source = {}) {
  const targetAttribute = source.planetId
    ? `data-generate-lifeforms-planet="${escapeHtml(source.planetId)}"`
    : source.moonId
      ? `data-generate-lifeforms-moon="${escapeHtml(source.moonId)}"`
      : "";
  const buttonLabel = lifeforms.length ? "Generate More Life" : "Generate Life";
  return `
    <article class="stellar-panel">
      <div class="stellar-section-heading">
        <h2><ph-dna></ph-dna> Lifeforms (${lifeforms.length})</h2>
        <button class="secondary-action" type="button" ${targetAttribute} ${!targetAttribute ? "disabled" : ""}>${buttonLabel}</button>
      </div>
      ${lifeforms.length ? `<div class="stellar-body-list">${lifeforms.map(renderLifeformSummary).join("")}</div>` : '<p class="stellar-muted">No lifeforms detected.</p>'}
    </article>
  `;
}

function renderLifeformImageBlock(lifeform, sizeClass = "") {
  return renderStellarImageBlock("lifeform", lifeform, sizeClass);
}

function lifeformDisplayName(lifeform) {
  return lifeform?.name || lifeform?.designation || "Unnamed Lifeform";
}

function lifeformDesignationBadge(lifeform) {
  if (!lifeform?.designation || lifeform.designation === lifeform.name) return "";
  return `<span class="stellar-badge">${escapeHtml(lifeform.designation)}</span>`;
}

function renderLifeformSummary(lifeform) {
  const displayName = lifeformDisplayName(lifeform);
  return `
    <article class="stellar-body-row stellar-lifeform-row" data-stellar-lifeform-card="${escapeHtml(lifeform.id)}" tabindex="0" role="link" aria-label="Open lifeform ${escapeHtml(displayName)}">
      ${renderLifeformImageBlock(lifeform)}
      <div class="stellar-row-main">
        <div class="stellar-row-title">
          <h3><a href="#lifeform/${encodeURIComponent(lifeform.id)}">${escapeHtml(displayName)}</a></h3>
          ${lifeformDesignationBadge(lifeform)}
          ${lifeform.kingdom ? `<span class="stellar-badge">${escapeHtml(lifeform.kingdom)}</span>` : ""}
          ${lifeform.biome || lifeform.habitat ? `<span class="stellar-badge stellar-habitability-badge is-habitable">${escapeHtml(lifeform.biome || lifeform.habitat)}</span>` : ""}
          ${lifeform.scale ? `<span class="stellar-muted">${escapeHtml(lifeform.scale)}</span>` : ""}
        </div>
        ${lifeform.species_name ? `<p><strong>Species:</strong> <em>${escapeHtml(lifeform.species_name)}</em></p>` : ""}
        <p>${escapeHtml(lifeform.description || "")}</p>
        <div class="stellar-mini-grid">
          ${renderStat("Diet", formatValue(lifeform.diet))}
          ${renderStat("Locomotion", formatValue(lifeform.locomotion))}
          ${renderStat("Skin Color", formatValue(lifeform.skin_color))}
          ${renderStat("Reproduction", formatValue(lifeform.reproductive_method || lifeform.reproduction))}
          ${renderStat("Sensory", formatValue(lifeform.sensory))}
          ${renderStat("Thermal", formatValue(lifeform.thermal_regulation))}
        </div>
      </div>
    </article>
  `;
}

function renderColonyShell(colonies, source = {}) {
  const targetAttribute = source.planetId
    ? `data-generate-colony-planet="${escapeHtml(source.planetId)}"`
    : source.moonId
      ? `data-generate-colony-moon="${escapeHtml(source.moonId)}"`
      : "";
  const buttonLabel = colonies.length ? "Generate Another Colony" : "Generate Colony";
  return `
    <article class="stellar-panel">
      <div class="stellar-section-heading">
        <h2><ph-buildings></ph-buildings> Colonies (${colonies.length})</h2>
        <button class="secondary-action" type="button" ${targetAttribute} ${!targetAttribute ? "disabled" : ""}>${buttonLabel}</button>
      </div>
      ${colonies.length ? `<div class="stellar-body-list">${colonies.map(renderColonySummary).join("")}</div>` : '<p class="stellar-muted">No colonies generated yet.</p>'}
    </article>
  `;
}

function renderColonySummary(colony) {
  const parent = colony.planet_id ? planetForId(colony.planet_id) : moonForId(colony.moon_id);
  const parentLabel = parent?.name ? `On ${parent.name}` : "Stellar colony";
  const colonistCount = stellarState.colonists.filter((colonist) => colonist.colony_id === colony.id).length;
  return `
    <article class="stellar-body-row stellar-colony-row" data-stellar-colony-card="${escapeHtml(colony.id)}" tabindex="0" role="link" aria-label="Open colony ${escapeHtml(colony.name)}">
      ${renderStellarRowImage("colony", colony, '<ph-buildings weight="duotone"></ph-buildings>')}
      <div class="stellar-row-main">
        <div class="stellar-row-title">
          <h3><a href="#colony/${encodeURIComponent(colony.id)}">${escapeHtml(colony.name)}</a></h3>
          ${colony.location_type ? `<span class="stellar-badge">${escapeHtml(colony.location_type)}</span>` : ""}
          ${colony.settlement_type ? `<span class="stellar-badge">${escapeHtml(colony.settlement_type)}</span>` : ""}
          ${colony.population ? `<span class="stellar-muted">${formatNumber(colony.population, " people", 0)}</span>` : ""}
        </div>
        <p>${escapeHtml(colony.location_notes || colony.description || parentLabel)}</p>
        <div class="stellar-mini-grid">
          ${renderStat("Parent", formatValue(parent?.name || parentLabel))}
          ${renderStat("Industry", formatValue(colony.industry))}
          ${renderStat("Supply", formatValue(colony.supply_status))}
          ${renderStat("Organization", formatValue(colony.organization))}
          ${renderStat("Energy", formatValue(colony.energy_sources))}
          ${renderStat("Colonists", formatNumber(colonistCount, "", 0))}
        </div>
      </div>
    </article>
  `;
}

function renderColonistSummary(colonist) {
  const profile = colonist.profile || {};
  return `
    <article class="stellar-body-row stellar-colonist-row" data-stellar-colonist-card="${escapeHtml(colonist.id)}" tabindex="0" role="link" aria-label="Open colonist ${escapeHtml(colonist.name)}">
      ${renderStellarRowImage("colonist", colonist, '<ph-user weight="duotone"></ph-user>')}
      <div class="stellar-row-main">
        <div class="stellar-row-title">
          <h3><a href="#colonist/${encodeURIComponent(colonist.id)}">${escapeHtml(colonist.name)}</a></h3>
          ${colonist.role ? `<span class="stellar-badge">${escapeHtml(colonist.role)}</span>` : ""}
          ${colonist.department ? `<span class="stellar-badge">${escapeHtml(colonist.department)}</span>` : ""}
        </div>
        <p>${escapeHtml(colonist.biography || colonist.personality || profile.background || "")}</p>
        <div class="stellar-mini-grid">
          ${renderStat("Age", formatValue(colonist.age))}
          ${renderStat("Assignment", formatValue(colonist.primary_role))}
          ${renderStat("Specialization", formatValue(colonist.specialization))}
          ${renderStat("Temperament", formatValue(colonist.temperament))}
        </div>
      </div>
    </article>
  `;
}

function renderMoonPage(moon) {
  const descriptionText = [moon.visual_appearance, moon.description]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .filter((part, index, list) => list.indexOf(part) === index)
    .join("\n\n");
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      ${renderStellarBreadcrumbs(stellarObjectBreadcrumbs("moon", moon))}
      <div class="stellar-page-actions"></div>
    </header>
    <section class="stellar-detail-scroll">
      <h1 class="stellar-planet-page-title">Moon - ${escapeHtml(moon.name)}</h1>
      ${renderStellarDetailImageHeader("moon", moon, "Moon")}
      <article class="stellar-panel stellar-planet-properties-panel">
        <h2><ph-eye></ph-eye> Moon Properties</h2>
        <div class="stellar-planet-property-badges">
          <span class="stellar-badge">${escapeHtml(moon.type || "Moon")}</span>
        </div>
        ${descriptionText ? `<p class="stellar-description stellar-planet-description">${escapeHtml(descriptionText)}</p>` : ""}
        <div class="stellar-stat-grid">
          ${renderStat("Mass", formatNumber(moon.mass_lunar, " M☾"))}
          ${renderStat("Radius", formatNumber(moon.radius_lunar, " R☾"))}
          ${renderStat("Density", formatNumber(moon.density_g_cm3, " g/cm³"))}
          ${renderStat("Surface Temp", formatNumber(moon.surface_temperature_k, " K", 0))}
          ${renderStat("Orbital Distance", formatNumber(moon.orbital_distance_km, " km", 0))}
          ${renderStat("Orbital Period", formatNumber(moon.orbital_period_days, " days", 1))}
          ${renderStat("Rotation Period", formatNumber(moon.rotation_period_days, " days", 1))}
          ${renderStat("Atmosphere", formatValue(moon.atmosphere))}
          ${renderStat("Water Presence", formatValue(moon.water_presence))}
          ${renderStat("Geological Activity", formatValue(moon.geological_activity))}
          ${renderStat("Magnetosphere", formatValue(moon.magnetosphere))}
        </div>
      </article>
      ${renderLifeformShell(stellarState.lifeforms.filter((lifeform) => lifeform.moon_id === moon.id), { moonId: moon.id })}
      ${renderColonyShell(stellarState.colonies.filter((colony) => colony.moon_id === moon.id), { moonId: moon.id })}
    </section>
  `;
}

function renderLifeformPage(lifeform) {
  const lifeformTitle = lifeformDisplayName(lifeform);
  const lifeformBadges = [
    lifeformDesignationBadge(lifeform),
    lifeform.kingdom ? `<span class="stellar-badge">${escapeHtml(lifeform.kingdom)}</span>` : "",
    lifeform.biome || lifeform.habitat ? `<span class="stellar-badge stellar-habitability-badge is-habitable">${escapeHtml(lifeform.biome || lifeform.habitat)}</span>` : "",
    lifeform.scale ? `<span class="stellar-badge">${escapeHtml(lifeform.scale)}</span>` : "",
  ].filter(Boolean).join("");
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      ${renderStellarBreadcrumbs(stellarObjectBreadcrumbs("lifeform", lifeform))}
      <div class="stellar-page-actions"></div>
    </header>
    <section class="stellar-detail-scroll">
      <h1 class="stellar-planet-page-title">Lifeform - ${escapeHtml(lifeformTitle)}</h1>
      ${renderStellarDetailImageHeader("lifeform", lifeform, "Lifeform")}
      <article class="stellar-panel stellar-planet-properties-panel">
        <h2><ph-dna></ph-dna> Lifeform Properties</h2>
        ${lifeformBadges ? `<div class="stellar-planet-property-badges">${lifeformBadges}</div>` : ""}
        <p class="stellar-description stellar-planet-description">${escapeHtml(lifeform.description || "Lifeform generation is coming soon.")}</p>
        <div class="stellar-stat-grid">
          ${renderStat("Name", formatValue(lifeform.name))}
          ${renderStat("Species", formatValue(lifeform.species_name))}
          ${renderStat("Designation", formatValue(lifeform.designation))}
          ${renderStat("Kingdom", formatValue(lifeform.kingdom))}
          ${renderStat("Phylum", formatValue(lifeform.phylum))}
          ${renderStat("Class", formatValue(lifeform.class_name))}
          ${renderStat("Order", formatValue(lifeform.taxonomic_order))}
          ${renderStat("Family", formatValue(lifeform.family))}
          ${renderStat("Genus", formatValue(lifeform.genus))}
          ${renderStat("Biome", formatValue(lifeform.biome || lifeform.habitat))}
          ${renderStat("Body Type", formatValue(lifeform.body_type))}
          ${renderStat("Scale", formatValue(lifeform.scale))}
          ${renderStat("Diet", formatValue(lifeform.diet))}
          ${renderStat("Locomotion", formatValue(lifeform.locomotion))}
          ${renderStat("Reproduction", formatValue(lifeform.reproductive_method || lifeform.reproduction))}
          ${renderStat("Sensory", formatValue(lifeform.sensory))}
          ${renderStat("Thermal", formatValue(lifeform.thermal_regulation))}
        </div>
      </article>
    </section>
  `;
}

function renderColonyPage(colony) {
  const colonists = stellarState.colonists.filter((colonist) => colonist.colony_id === colony.id);
  const colonistsWithoutImages = colonists.filter((colonist) => !sortedObjectImages(colonist.id).length);
  const parent = colony.planet_id ? planetForId(colony.planet_id) : moonForId(colony.moon_id);
  const parentLabel = parent?.name ? `${colony.planet_id ? "Planet" : "Moon"} - ${parent.name}` : "Parent Body";
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      ${renderStellarBreadcrumbs(stellarObjectBreadcrumbs("colony", colony))}
      <div class="stellar-page-actions">
        <button class="secondary-action" type="button" data-generate-colonists-colony="${escapeHtml(colony.id)}">Generate Colonists</button>
      </div>
    </header>
    <section class="stellar-detail-scroll">
      <h1 class="stellar-planet-page-title">Colony - ${escapeHtml(colony.name)}</h1>
      ${renderStellarDetailImageHeader("colony", colony, "Colony")}
      <article class="stellar-panel stellar-primary-properties-panel">
        <h2><ph-buildings></ph-buildings> Colony Properties</h2>
        <div class="stellar-planet-property-badges">
          ${colony.location_type ? `<span class="stellar-badge">${escapeHtml(colony.location_type)}</span>` : ""}
          ${colony.settlement_type ? `<span class="stellar-badge">${escapeHtml(colony.settlement_type)}</span>` : ""}
          <span class="stellar-badge">${formatNumber(colonists.length, " colonists", 0)}</span>
        </div>
        ${colony.location_notes ? `<p class="stellar-description stellar-planet-description">${escapeHtml(colony.location_notes)}</p>` : ""}
        ${colony.description ? `<p class="stellar-description stellar-planet-description">${escapeHtml(colony.description)}</p>` : ""}
        <div class="stellar-stat-grid stellar-stat-grid-flipped">
          ${renderStat("Parent Body", formatValue(parentLabel))}
          ${renderStat("Location Type", formatValue(colony.location_type))}
          ${renderStat("Founded", formatValue(colony.founded_year))}
          ${renderStat("Organization", formatValue(colony.organization))}
          ${renderStat("Settlement Type", formatValue(colony.settlement_type))}
          ${renderStat("Population", formatNumber(colony.population, "", 0))}
          ${renderStat("Primary Biome", formatValue(colony.primary_biome))}
          ${renderStat("Local Hazards", formatValue(colony.local_hazards))}
          ${renderStat("Energy", formatValue(colony.energy_sources))}
          ${renderStat("Water", formatValue(colony.water_source))}
          ${renderStat("Industry", formatValue(colony.industry))}
          ${renderStat("Food", formatValue(colony.food_production))}
          ${renderStat("Housing", formatValue(colony.housing))}
          ${renderStat("Supply Status", formatValue(colony.supply_status))}
          ${renderStat("Government", formatValue(colony.government_type))}
          ${renderStat("Protection", formatValue(colony.defensive_structures))}
          ${renderStat("Communication", formatValue(colony.communication))}
          ${renderStat("Research Focus", formatValue(colony.research_focus))}
          ${renderStat("Colonists", formatNumber(colonists.length, "", 0))}
        </div>
      </article>
      <article class="stellar-panel">
        <div class="stellar-section-heading">
          <h2><ph-users></ph-users> Colonists (${colonists.length})</h2>
          <div class="stellar-section-actions">
            <button class="secondary-action" type="button" data-generate-colonists-colony="${escapeHtml(colony.id)}">${colonists.length ? "Generate More Colonists" : "Generate Colonists"}</button>
            <button class="secondary-action" type="button" data-generate-colonist-images-colony="${escapeHtml(colony.id)}" ${colonistsWithoutImages.length ? "" : "disabled"}>Generate All Images</button>
          </div>
        </div>
        ${colonists.length ? `<div class="stellar-body-list">${colonists.map(renderColonistSummary).join("")}</div>` : '<p class="stellar-muted">No colonists generated yet.</p>'}
      </article>
    </section>
  `;
}

function renderColonistPage(colonist) {
  const colony = colonyForId(colonist.colony_id);
  const profile = colonist.profile || {};
  const featuredProfileKeys = new Set(["background", "personalConflict", "personal_conflict", "currentAssignment", "current_assignment"]);
  const profileEntries = Object.entries(profile)
    .filter(([key, value]) => !featuredProfileKeys.has(key) && value !== null && value !== undefined && value !== "");
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      ${renderStellarBreadcrumbs(stellarObjectBreadcrumbs("colonist", colonist))}
      <div class="stellar-page-actions"></div>
    </header>
    <section class="stellar-detail-scroll">
      <h1 class="stellar-planet-page-title">Colonist - ${escapeHtml(colonist.name)}</h1>
      <article class="stellar-panel stellar-primary-properties-panel">
        <h2><ph-user></ph-user> Colonist Properties</h2>
        ${renderColonistPortraitArea(colonist)}
        <div class="stellar-stat-grid stellar-stat-grid-flipped">
          ${renderStat("Specialization", formatValue(colonist.specialization))}
          ${renderStat("Assignment", formatValue(colonist.primary_role))}
          ${renderStat("Personality", formatValue(colonist.personality))}
          ${renderStat("Temperament", formatValue(colonist.temperament))}
          ${renderStat("Colony", formatValue(colony?.name))}
        </div>
        ${colonist.physical_description ? `<p class="stellar-description">${escapeHtml(colonist.physical_description)}</p>` : ""}
        ${colonist.biography ? `<p class="stellar-description">${escapeHtml(colonist.biography)}</p>` : ""}
        ${profileEntries.length ? `<div class="stellar-profile-list stellar-stat-grid-flipped">${profileEntries.map(([key, value]) => renderStat(formatColonistProfileLabel(key), formatValue(value))).join("")}</div>` : ""}
      </article>
    </section>
  `;
}

function renderTree() {
  const systems = stellarState.systems;
  if (!stellarEls.tree) return;
  applyStellarSidePanelState();
  if (stellarEls.sideGenerateButton) {
    stellarEls.sideGenerateButton.hidden = stellarState.route.name !== "systems";
  }
  const collapsed = stellarState.sidePanelCollapsed;
  const system = stellarState.route.name === "systems" ? null : currentSystem();
  const headerLabel = system?.name || "Star System";
  const panelLabel = collapsed ? "Expand star system panel" : "Collapse star system panel";
  const treeContent = system
    ? stellarState.planets
      .filter((planet) => planet.system_id === system.id)
      .map(renderTreePlanet)
      .join("")
    : systems.map((item) => renderTreeSystem(item)).join("");
  stellarEls.tree.innerHTML = `
    <div class="stellar-tree-header">
      <h2><ph-star weight="fill" aria-hidden="true"></ph-star><span>${escapeHtml(headerLabel)}</span></h2>
      <button class="stellar-side-panel-toggle" type="button" data-toggle-stellar-side-panel aria-label="${panelLabel}" aria-expanded="${!collapsed}">
        ${collapsed ? '<ph-caret-left weight="bold"></ph-caret-left>' : '<ph-caret-right weight="bold"></ph-caret-right>'}
      </button>
    </div>
    <div class="stellar-tree-list" ${collapsed ? "hidden" : ""}>
      ${treeContent || '<p class="stellar-muted">No planets generated.</p>'}
    </div>
  `;
}

function renderTreeObjectIcon(record, fallbackIcon) {
  const image = primaryObjectImage(record?.id);
  if (!image?.image_url) return `<span class="stellar-tree-icon" aria-hidden="true">${fallbackIcon}</span>`;
  return `
    <span class="stellar-tree-thumb" aria-hidden="true">
      <img src="${escapeHtml(image.image_url)}" alt="">
    </span>
  `;
}

function renderTreeSystemIcon(system) {
  return renderTreeObjectIcon(starForSystem(system.id), '<ph-star weight="fill"></ph-star>');
}

function renderTreeSystem(system) {
  const planets = stellarState.planets.filter((planet) => planet.system_id === system.id);
  const selected = currentSystem()?.id === system.id;
  const hasChildren = planets.length > 0;
  const autoExpanded = selected;
  const treeKey = `system:${system.id}`;
  const expanded = hasChildren && !stellarState.collapsedTree.has(treeKey) && (stellarState.expandedTree.has(treeKey) || autoExpanded);
  return `
    <div class="stellar-tree-system">
      <div class="stellar-tree-row">
        ${hasChildren ? `<button class="stellar-tree-toggle ${expanded ? "is-expanded" : ""}" type="button" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(system.name)}" aria-expanded="${expanded}" data-tree-toggle="${escapeHtml(treeKey)}"><ph-caret-right weight="bold"></ph-caret-right></button>` : '<span class="stellar-tree-toggle-spacer"></span>'}
        <a class="stellar-tree-item ${selected ? "is-selected" : ""}" href="#system/${encodeURIComponent(system.id)}">
          ${renderTreeSystemIcon(system)}
          <span>${escapeHtml(system.name)}</span>
          <em>${Number(system.planet_count || 0)} planets</em>
        </a>
      </div>
      ${expanded ? `<div class="stellar-tree-children">${planets.map(renderTreePlanet).join("")}</div>` : ""}
    </div>
  `;
}

function renderTreeFolder({ key, label, icon, count, childrenHtml, isAncestor = false }) {
  if (!childrenHtml) return "";
  const expanded = !stellarState.collapsedTree.has(key) && (stellarState.expandedTree.has(key) || isAncestor);
  return `
    <div class="stellar-tree-folder">
      <div class="stellar-tree-row">
        <button class="stellar-tree-toggle ${expanded ? "is-expanded" : ""}" type="button" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(label)}" aria-expanded="${expanded}" data-tree-toggle="${escapeHtml(key)}"><ph-caret-right weight="bold"></ph-caret-right></button>
        <button class="stellar-tree-item stellar-tree-folder-label" type="button" aria-expanded="${expanded}" data-tree-toggle="${escapeHtml(key)}">
          ${icon}
          <span>${escapeHtml(label)}</span>
          ${count === undefined ? "" : `<em>${Number(count)} ${Number(count) === 1 ? "item" : "items"}</em>`}
        </button>
      </div>
      ${expanded ? `<div class="stellar-tree-children">${childrenHtml}</div>` : ""}
    </div>
  `;
}

function renderTreeLifeform(lifeform) {
  return `<a class="stellar-tree-item ${stellarState.route.id === lifeform.id ? "is-selected" : ""}" href="#lifeform/${encodeURIComponent(lifeform.id)}">${renderTreeObjectIcon(lifeform, "<ph-dna></ph-dna>")}<span>${escapeHtml(lifeform.name)}</span></a>`;
}

function renderTreeColonist(colonist) {
  return `<a class="stellar-tree-item ${stellarState.route.id === colonist.id ? "is-selected" : ""}" href="#colonist/${encodeURIComponent(colonist.id)}">${renderTreeObjectIcon(colonist, "<ph-user></ph-user>")}<span>${escapeHtml(colonist.name)}</span></a>`;
}

function renderTreeColony(colony) {
  const colonists = stellarState.colonists.filter((colonist) => colonist.colony_id === colony.id);
  const hasChildren = colonists.length > 0;
  const isAncestor = colonists.some((colonist) => colonist.id === stellarState.route.id);
  const treeKey = `colony:${colony.id}`;
  const expanded = hasChildren && !stellarState.collapsedTree.has(treeKey) && (stellarState.expandedTree.has(treeKey) || isAncestor);
  return `
    <div>
      <div class="stellar-tree-row">
        ${hasChildren ? `<button class="stellar-tree-toggle ${expanded ? "is-expanded" : ""}" type="button" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(colony.name)}" aria-expanded="${expanded}" data-tree-toggle="${escapeHtml(treeKey)}"><ph-caret-right weight="bold"></ph-caret-right></button>` : '<span class="stellar-tree-toggle-spacer"></span>'}
        <a class="stellar-tree-item ${stellarState.route.id === colony.id ? "is-selected" : ""}" href="#colony/${encodeURIComponent(colony.id)}">${renderTreeObjectIcon(colony, "<ph-buildings></ph-buildings>")}<span>${escapeHtml(colony.name)}</span></a>
      </div>
      ${expanded ? `<div class="stellar-tree-children">${colonists.map(renderTreeColonist).join("")}</div>` : ""}
    </div>
  `;
}

function renderTreeMoon(moon) {
  const lifeforms = stellarState.lifeforms.filter((lifeform) => lifeform.moon_id === moon.id);
  const colonies = stellarState.colonies.filter((colony) => colony.moon_id === moon.id);
  const colonist = stellarState.route.name === "colonist" ? colonistForId(stellarState.route.id) : null;
  const hasChildren = lifeforms.length > 0 || colonies.length > 0;
  const isAncestor = lifeforms.some((lifeform) => lifeform.id === stellarState.route.id)
    || colonies.some((colony) => colony.id === stellarState.route.id)
    || colonies.some((colony) => colony.id === colonist?.colony_id);
  const treeKey = `moon:${moon.id}`;
  const expanded = hasChildren && !stellarState.collapsedTree.has(treeKey) && (stellarState.expandedTree.has(treeKey) || isAncestor);
  return `
    <div>
      <div class="stellar-tree-row">
        ${hasChildren ? `<button class="stellar-tree-toggle ${expanded ? "is-expanded" : ""}" type="button" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(moon.name)}" aria-expanded="${expanded}" data-tree-toggle="${escapeHtml(treeKey)}"><ph-caret-right weight="bold"></ph-caret-right></button>` : '<span class="stellar-tree-toggle-spacer"></span>'}
        <a class="stellar-tree-item ${stellarState.route.id === moon.id ? "is-selected" : ""}" href="#moon/${encodeURIComponent(moon.id)}">${renderTreeObjectIcon(moon, "<ph-moon></ph-moon>")}<span>${escapeHtml(moon.name)}</span></a>
      </div>
      ${expanded ? `<div class="stellar-tree-children">
        ${renderTreeFolder({
          key: `moon-lifeforms:${moon.id}`,
          label: "Moon Lifeforms",
          icon: "<ph-dna></ph-dna>",
          count: lifeforms.length,
          childrenHtml: lifeforms.map(renderTreeLifeform).join(""),
          isAncestor: lifeforms.some((lifeform) => lifeform.id === stellarState.route.id),
        })}
        ${renderTreeFolder({
          key: `moon-colonies:${moon.id}`,
          label: "Moon Colonies",
          icon: "<ph-users></ph-users>",
          count: colonies.length,
          childrenHtml: colonies.map(renderTreeColony).join(""),
          isAncestor: colonies.some((colony) => colony.id === stellarState.route.id) || colonies.some((colony) => colony.id === colonist?.colony_id),
        })}
      </div>` : ""}
    </div>
  `;
}

function renderTreePlanet(planet) {
  const isBelt = isAsteroidBelt(planet);
  const moons = stellarState.moons.filter((moon) => moon.planet_id === planet.id);
  const lifeforms = stellarState.lifeforms.filter((lifeform) => lifeform.planet_id === planet.id);
  const colonies = stellarState.colonies.filter((colony) => colony.planet_id === planet.id);
  const moonLifeforms = stellarState.lifeforms.filter((lifeform) => moons.some((moon) => moon.id === lifeform.moon_id));
  const moonColonies = stellarState.colonies.filter((colony) => moons.some((moon) => moon.id === colony.moon_id));
  const colonist = stellarState.route.name === "colonist" ? colonistForId(stellarState.route.id) : null;
  const isSelected = stellarState.route.id === planet.id;
  const visibleMoons = isBelt ? [] : moons;
  const visibleLifeforms = isBelt ? [] : lifeforms;
  const visibleMoonLifeforms = isBelt ? [] : moonLifeforms;
  const visibleMoonColonies = isBelt ? [] : moonColonies;
  const hasChildren = visibleMoons.length > 0 || visibleLifeforms.length > 0 || colonies.length > 0 || visibleMoonLifeforms.length > 0 || visibleMoonColonies.length > 0;
  const isAncestor = visibleMoons.some((moon) => moon.id === stellarState.route.id)
    || visibleMoonLifeforms.some((lifeform) => lifeform.id === stellarState.route.id)
    || visibleMoonColonies.some((colony) => colony.id === stellarState.route.id)
    || visibleLifeforms.some((lifeform) => lifeform.id === stellarState.route.id)
    || colonies.some((colony) => colony.id === stellarState.route.id)
    || (stellarState.route.name === "colonist" && [...colonies, ...visibleMoonColonies].some((colony) => colony.id === colonist?.colony_id));
  const treeKey = `planet:${planet.id}`;
  const expanded = hasChildren && !stellarState.collapsedTree.has(treeKey) && (stellarState.expandedTree.has(treeKey) || isAncestor);
  const moonsFolder = isBelt ? "" : renderTreeFolder({
    key: `planet-moons:${planet.id}`,
    label: "Moons",
    icon: "<ph-moon-stars></ph-moon-stars>",
    count: visibleMoons.length,
    childrenHtml: visibleMoons.map(renderTreeMoon).join(""),
    isAncestor: visibleMoons.some((moon) => moon.id === stellarState.route.id)
      || visibleMoonLifeforms.some((lifeform) => lifeform.id === stellarState.route.id)
      || visibleMoonColonies.some((colony) => colony.id === stellarState.route.id)
      || visibleMoonColonies.some((colony) => colony.id === colonist?.colony_id),
  });
  const lifeformsFolder = isBelt ? "" : renderTreeFolder({
    key: `planet-lifeforms:${planet.id}`,
    label: "Planetary Lifeforms",
    icon: "<ph-dna></ph-dna>",
    count: visibleLifeforms.length,
    childrenHtml: visibleLifeforms.map(renderTreeLifeform).join(""),
    isAncestor: visibleLifeforms.some((lifeform) => lifeform.id === stellarState.route.id),
  });
  const coloniesFolder = renderTreeFolder({
    key: `planet-colonies:${planet.id}`,
    label: isBelt ? "Belt Colonies" : "Planetary Colonies",
    icon: "<ph-users></ph-users>",
    count: colonies.length,
    childrenHtml: colonies.map(renderTreeColony).join(""),
    isAncestor: colonies.some((colony) => colony.id === stellarState.route.id) || colonies.some((colony) => colony.id === colonist?.colony_id),
  });
  return `
    <div>
      <div class="stellar-tree-row">
        ${hasChildren ? `<button class="stellar-tree-toggle ${expanded ? "is-expanded" : ""}" type="button" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(planet.name)}" aria-expanded="${expanded}" data-tree-toggle="${escapeHtml(treeKey)}"><ph-caret-right weight="bold"></ph-caret-right></button>` : '<span class="stellar-tree-toggle-spacer"></span>'}
        <a class="stellar-tree-item ${isSelected ? "is-selected" : ""}" href="#planet/${encodeURIComponent(planet.id)}">
          ${renderTreeObjectIcon(planet, isBelt ? "<ph-meteor></ph-meteor>" : "<ph-planet></ph-planet>")}
          <span>${escapeHtml(planet.name)}</span>
        </a>
      </div>
      ${expanded ? `<div class="stellar-tree-children">
        ${moonsFolder}
        ${lifeformsFolder}
        ${coloniesFolder}
      </div>` : ""}
    </div>
  `;
}

function renderNotFound() {
  stellarEls.root.innerHTML = `
    <div class="stellar-empty-state">
      <h2>Record not found</h2>
      <p>This Stellar Architect record could not be loaded.</p>
      <a class="primary-action" href="#systems">Back to Systems</a>
    </div>
  `;
}

function renderRoute() {
  renderTree();
  document.body?.classList.toggle("stellar-home-route", stellarState.route.name === "systems");
  if (stellarState.route.name === "systems") {
    renderLanding();
    return;
  }
  if (stellarState.route.name === "system") {
    const system = systemForId(stellarState.route.id);
    system ? renderSystemPage(system) : renderNotFound();
    return;
  }
  if (stellarState.route.name === "planet") {
    const planet = planetForId(stellarState.route.id);
    planet ? renderPlanetPage(planet) : renderNotFound();
    return;
  }
  if (stellarState.route.name === "moon") {
    const moon = moonForId(stellarState.route.id);
    moon ? renderMoonPage(moon) : renderNotFound();
    return;
  }
  if (stellarState.route.name === "lifeform") {
    const lifeform = lifeformForId(stellarState.route.id);
    lifeform ? renderLifeformPage(lifeform) : renderNotFound();
    return;
  }
  if (stellarState.route.name === "colony") {
    const colony = colonyForId(stellarState.route.id);
    colony ? renderColonyPage(colony) : renderNotFound();
    return;
  }
  if (stellarState.route.name === "colonist") {
    const colonist = colonistForId(stellarState.route.id);
    colonist ? renderColonistPage(colonist) : renderNotFound();
  }
}

async function refresh() {
  if (!stellarEls.root || !stellarSupabase) return;
  stellarState.loading = true;
  const route = parseRoute();
  renderStellarLoading(stellarRouteLoadingName(route));
  try {
    if (!stellarState.appUser) {
      stellarState.appUser = await waitForCurrentAppUser();
    }
    if (!stellarState.appUser) throw new Error("Could not load your Centralis user profile.");
    const loadingName = await fetchStellarRouteLoadingName(route);
    if (loadingName) renderStellarLoading(loadingName);
    await loadForRoute();
    renderRoute();
  } catch (error) {
    stellarEls.root.innerHTML = `<div class="stellar-error">${escapeHtml(getReadableError(error))}</div>`;
  } finally {
    stellarState.loading = false;
  }
}

async function handleGenerateSystem(event) {
  event.preventDefault();
  const submit = stellarEls.generateForm?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  setStatus(stellarEls.generateStatus, "Generating star system...");
  try {
    const formData = new FormData(stellarEls.generateForm);
    const { data, error } = await stellarSupabase.functions.invoke("generate-stellar-system", {
      body: {
        starType: formData.get("starType"),
        planetCount: formData.get("planetCount"),
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    closeGenerateModal();
    window.location.hash = `#system/${encodeURIComponent(data.system.id)}`;
    await refresh();
  } catch (error) {
    setStatus(stellarEls.generateStatus, `Could not generate system: ${getReadableError(error)}`, "error");
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function handleGenerateMoons(planetId) {
  const buttons = document.querySelectorAll(`[data-generate-moons="${CSS.escape(planetId)}"]`);
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const { data, error } = await stellarSupabase.functions.invoke("generate-stellar-moons", {
      body: { planetId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    await refresh();
  } catch (error) {
    window.alert(`Could not generate moons: ${getReadableError(error)}`);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function handleGenerateLifeforms({ planetId, moonId }) {
  setLifeModalGenerating(true);
  setStatus(stellarEls.lifeStatus, "");
  try {
    const data = await callEdgeFunction("generate-stellar-lifeforms", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planetId ? { planetId } : { moonId }),
    });
    if (data?.error) throw new Error(data.error);
    closeLifeModal(true);
    await refresh();
  } catch (error) {
    setStatus(stellarEls.lifeStatus, `Could not generate lifeforms: ${getReadableError(error)}`, "error");
  } finally {
    setLifeModalGenerating(false);
  }
}

async function handleGenerateColony() {
  const { planetId, moonId } = stellarState.colonyModal;
  if (!planetId && !moonId) return;
  const sourceName = getColonySourceName({ planetId, moonId });
  const payload = planetId ? { planetId } : { moonId };
  payload.instructions = stellarEls.colonyInstructions?.value || "";
  payload.includeColonists = Boolean(stellarEls.colonyIncludeColonists?.checked);
  payload.rosterRange = stellarEls.colonyRoster?.value || "core";
  closeColonyModal(true);
  showStellarToast(`Colony generation started for ${sourceName}.`, "success");

  try {
    const data = await callEdgeFunction("generate-stellar-colony", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (data?.error) throw new Error(data.error);
    await refresh();
    const colonistText = data?.insertedColonists ? ` with ${data.insertedColonists} colonists` : "";
    showStellarToast(`Generated ${data?.colony?.name || "a colony"}${colonistText}.`, "success");
  } catch (error) {
    await refresh().catch(() => null);
    showStellarToast(`Could not generate colony: ${getReadableError(error)}`, "error");
  }
}

async function handleGenerateColonists() {
  const { colonyId } = stellarState.colonistModal;
  if (!colonyId) return;
  const colonyName = getColonistSourceName(colonyId);
  const payload = {
    colonyId,
    instructions: stellarEls.colonistInstructions?.value || "",
    rosterRange: stellarEls.colonistRoster?.value || "core",
  };
  closeColonistModal(true);
  showStellarToast(`Colonist generation started for ${colonyName}.`, "success");

  try {
    const data = await callEdgeFunction("generate-stellar-colonists", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (data?.error) throw new Error(data.error);
    await refresh();
    showStellarToast(`Generated ${data?.inserted || 0} colonists for ${colonyName}.`, "success");
  } catch (error) {
    await refresh().catch(() => null);
    showStellarToast(`Could not generate colonists: ${getReadableError(error)}`, "error");
  }
}

function stellarImageStorageModule(kind) {
  const folderByKind = {
    star: "stars",
    planet: "planets",
    moon: "moons",
    lifeform: "lifeforms",
    colony: "colonies",
    colonist: "colonists",
  };
  return `stellar-architect/${folderByKind[kind] || "objects"}`;
}

async function generateStellarImageForRecord(kind, record, userInstructions = "") {
  const config = stellarImageConfigForKind(kind);
  const displayLabel = stellarImageDisplayLabel(kind, record, config.label);
  const objectKind = stellarImageObjectKind(kind, record, config);
  const basePrompt = config.prompt(record);
  const extraPrompt = buildStellarImageExtraPrompt(basePrompt, userInstructions);
  const generated = await callEdgeFunction("generate-object-image", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectId: record.id,
      storageModule: stellarImageStorageModule(kind),
      objectKind,
      elementType: config.elementType(record),
      name: stellarObjectDisplayName(record, displayLabel),
      description: "",
      extraPrompt,
    }),
  });
  if (generated?.image?.id) {
    await callEdgeFunction("set-primary-image", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId: generated.image.id }),
    });
  }
  return generated;
}

async function handleGenerateStellarImage(kind, objectId, button) {
  const record = stellarObjectForKind(kind, objectId);
  if (!record) return;
  const config = stellarImageConfigForKind(kind);
  const displayLabel = stellarImageDisplayLabel(kind, record, config.label);
  const basePrompt = config.prompt(record);
  const userInstructions = await openStellarImagePromptDialog({ kind, config, record, basePrompt });
  if (userInstructions === null) return;
  const originalHtml = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<ph-arrows-clockwise weight="bold"></ph-arrows-clockwise> Generating...';
  }
  showStellarToast(`${displayLabel} image generation started. It will finish in the background.`, "success");

  try {
    await generateStellarImageForRecord(kind, record, userInstructions);
    await fetchStellarImages();
    renderRoute();
    showStellarToast(`${displayLabel} image generated.`, "success");
  } catch (error) {
    showStellarToast(`Could not generate ${displayLabel.toLowerCase()} image: ${getReadableError(error)}`, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
}

async function handleGenerateMissingColonistImages(colonyId, button) {
  const colony = colonyForId(colonyId);
  if (!colony) return;
  const colonists = stellarState.colonists.filter((colonist) => colonist.colony_id === colony.id);
  await handleGenerateMissingStellarImages({
    kind: "colonist",
    records: colonists,
    button,
    emptyMessage: "All colonists in this colony already have images.",
    startMessage: (count) => `Generating ${count} colonist portrait${count === 1 ? "" : "s"} for ${colony.name}.`,
    successMessage: (count) => `Generated ${count} colonist portrait${count === 1 ? "" : "s"}.`,
    failureMessage: (generatedCount, failureCount) => `Generated ${generatedCount} portrait${generatedCount === 1 ? "" : "s"}; ${failureCount} failed.`,
    warningLabel: "Colonist portrait generation failures",
    displayFallback: "Colonist",
  });
}

async function handleGenerateMissingMoonImages(planetId, button) {
  const planet = planetForId(planetId);
  if (!planet) return;
  const moons = stellarState.moons.filter((moon) => moon.planet_id === planet.id);
  await handleGenerateMissingStellarImages({
    kind: "moon",
    records: moons,
    button,
    emptyMessage: "All moons for this planet already have images.",
    startMessage: (count) => `Generating ${count} moon image${count === 1 ? "" : "s"} for ${planet.name}.`,
    successMessage: (count) => `Generated ${count} moon image${count === 1 ? "" : "s"}.`,
    failureMessage: (generatedCount, failureCount) => `Generated ${generatedCount} moon image${generatedCount === 1 ? "" : "s"}; ${failureCount} failed.`,
    warningLabel: "Moon image generation failures",
    displayFallback: "Moon",
  });
}

async function handleGenerateMissingPlanetImages(systemId, button) {
  const system = systemForId(systemId);
  if (!system) return;
  const planets = stellarState.planets.filter((planet) => planet.system_id === system.id && !isAsteroidBelt(planet));
  await handleGenerateMissingStellarImages({
    kind: "planet",
    records: planets,
    button,
    emptyMessage: "All planets in this system already have images.",
    startMessage: (count) => `Generating ${count} planet image${count === 1 ? "" : "s"} for ${system.name}.`,
    successMessage: (count) => `Generated ${count} planet image${count === 1 ? "" : "s"}.`,
    failureMessage: (generatedCount, failureCount) => `Generated ${generatedCount} planet image${generatedCount === 1 ? "" : "s"}; ${failureCount} failed.`,
    warningLabel: "Planet image generation failures",
    displayFallback: "Planet",
  });
}

async function handleGenerateMissingStellarImages({
  kind,
  records,
  button,
  emptyMessage,
  startMessage,
  successMessage,
  failureMessage,
  warningLabel,
  displayFallback,
}) {
  const missingImages = records.filter((record) => record?.id && !sortedObjectImages(record.id).length);
  if (!missingImages.length) {
    showStellarToast(emptyMessage, "success");
    return;
  }

  const originalHtml = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<ph-arrows-clockwise weight="bold"></ph-arrows-clockwise> Generating...';
  }
  showStellarToast(startMessage(missingImages.length), "success");

  let completedCount = 0;
  const updateBatchButton = () => {
    if (!button) return;
    button.innerHTML = `<ph-arrows-clockwise weight="bold"></ph-arrows-clockwise> Generating ${completedCount}/${missingImages.length}...`;
  };
  updateBatchButton();

  const results = await Promise.all(
    missingImages.map(async (record) => {
      try {
        await generateStellarImageForRecord(kind, record, "");
        return { record, success: true };
      } catch (error) {
        return {
          record,
          success: false,
          message: `${stellarObjectDisplayName(record, displayFallback)}: ${getReadableError(error)}`,
        };
      } finally {
        completedCount += 1;
        updateBatchButton();
      }
    })
  );

  const generatedCount = results.filter((result) => result.success).length;
  const failures = results.filter((result) => !result.success).map((result) => result.message);

  await fetchStellarImages().catch(() => null);
  renderRoute();

  if (failures.length) {
    showStellarToast(failureMessage(generatedCount, failures.length), "error");
    console.warn(warningLabel, failures);
  } else {
    showStellarToast(successMessage(generatedCount), "success");
  }

  if (button) {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

async function handleGenerateDetails() {
  const systemId = stellarEls.detailsModal?.dataset.systemId;
  if (!systemId) return;
  const submit = stellarEls.detailsConfirm;
  const originalText = submit?.textContent || "Yes, Generate Details";
  if (submit) submit.disabled = true;
  if (submit) submit.textContent = "Yes, Generate Details";
  setStatus(stellarEls.detailsStatus, "Generating planetary details...");
  try {
    const { data, error } = await stellarSupabase.functions.invoke("generate-stellar-details", {
      body: { systemId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    closeDetailsModal();
    await refresh();
  } catch (error) {
    setStatus(stellarEls.detailsStatus, `Could not generate details: ${getReadableError(error)}`, "error");
  } finally {
    if (submit) submit.disabled = false;
    if (submit) submit.textContent = originalText;
  }
}

function buildExportPayload(system) {
  return {
    format: "centralis.stellar-export.v1",
    exported_at: new Date().toISOString(),
    system,
    stars: stellarState.stars.filter((star) => star.system_id === system.id),
    planets: stellarState.planets.filter((planet) => planet.system_id === system.id),
    moons: stellarState.moons.filter((moon) => moon.system_id === system.id),
    lifeforms: stellarState.lifeforms.filter((lifeform) => lifeform.system_id === system.id),
    colonies: stellarState.colonies.filter((colony) => colony.system_id === system.id),
    colonists: stellarState.colonists.filter((colonist) => colonist.system_id === system.id),
  };
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function handleExport() {
  const system = currentSystem();
  if (!system) return;
  const safeName = system.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  downloadJson(`centralis-stellar-${safeName || "system"}.json`, buildExportPayload(system));
}

document.addEventListener("click", (event) => {
  const generateButton = event.target.closest("[data-open-generate-system]");
  if (generateButton) {
    openGenerateModal();
    return;
  }

  const treeToggle = event.target.closest("[data-tree-toggle]");
  if (treeToggle) {
    const key = treeToggle.dataset.treeToggle;
    const isExpanded = treeToggle.getAttribute("aria-expanded") === "true";
    if (isExpanded) {
      stellarState.expandedTree.delete(key);
      stellarState.collapsedTree.add(key);
    } else {
      stellarState.expandedTree.add(key);
      stellarState.collapsedTree.delete(key);
    }
    renderTree();
    return;
  }

  const sidePanelToggle = event.target.closest("[data-toggle-stellar-side-panel]");
  if (sidePanelToggle) {
    setStellarSidePanelCollapsed(!stellarState.sidePanelCollapsed);
    return;
  }

  if (event.target.closest("[data-close-stellar-modal]")) {
    closeGenerateModal();
    return;
  }

  if (event.target.closest("[data-close-stellar-details-modal]")) {
    closeDetailsModal();
    return;
  }

  if (event.target.closest("[data-close-stellar-life-modal]")) {
    closeLifeModal();
    return;
  }

  if (event.target.closest("[data-close-stellar-colony-modal]")) {
    closeColonyModal();
    return;
  }

  if (event.target.closest("[data-close-stellar-colonist-modal]")) {
    closeColonistModal();
    return;
  }

  if (event.target.closest("[data-cancel-stellar-image-prompt]")) {
    closeStellarImagePromptDialog(null);
    return;
  }

  const detailsButton = event.target.closest("[data-open-stellar-details]");
  if (detailsButton) {
    openDetailsModal(detailsButton.dataset.openStellarDetails);
    return;
  }

  if (event.target.closest("[data-confirm-stellar-details]")) {
    handleGenerateDetails();
    return;
  }

  const moonButton = event.target.closest("[data-generate-moons]");
  if (moonButton) {
    handleGenerateMoons(moonButton.dataset.generateMoons);
    return;
  }

  const planetLifeButton = event.target.closest("[data-generate-lifeforms-planet]");
  if (planetLifeButton) {
    openLifeModal({ planetId: planetLifeButton.dataset.generateLifeformsPlanet });
    return;
  }

  const moonLifeButton = event.target.closest("[data-generate-lifeforms-moon]");
  if (moonLifeButton) {
    openLifeModal({ moonId: moonLifeButton.dataset.generateLifeformsMoon });
    return;
  }

  if (event.target.closest("[data-confirm-stellar-life]")) {
    const { planetId, moonId } = stellarState.lifeformModal;
    if (planetId || moonId) handleGenerateLifeforms({ planetId, moonId });
    return;
  }

  const planetColonyButton = event.target.closest("[data-generate-colony-planet]");
  if (planetColonyButton) {
    openColonyModal({ planetId: planetColonyButton.dataset.generateColonyPlanet });
    return;
  }

  const moonColonyButton = event.target.closest("[data-generate-colony-moon]");
  if (moonColonyButton) {
    openColonyModal({ moonId: moonColonyButton.dataset.generateColonyMoon });
    return;
  }

  if (event.target.closest("[data-confirm-stellar-colony]")) {
    handleGenerateColony();
    return;
  }

  const colonistsButton = event.target.closest("[data-generate-colonists-colony]");
  if (colonistsButton) {
    openColonistModal(colonistsButton.dataset.generateColonistsColony);
    return;
  }

  if (event.target.closest("[data-confirm-stellar-colonists]")) {
    handleGenerateColonists();
    return;
  }

  const lifeformCard = event.target.closest("[data-stellar-lifeform-card]");
  if (lifeformCard && !event.target.closest("a, button, input, select, textarea, [role='button']")) {
    window.location.hash = `#lifeform/${encodeURIComponent(lifeformCard.dataset.stellarLifeformCard)}`;
    return;
  }

  const colonyCard = event.target.closest("[data-stellar-colony-card]");
  if (colonyCard && !event.target.closest("a, button, input, select, textarea, [role='button']")) {
    window.location.hash = `#colony/${encodeURIComponent(colonyCard.dataset.stellarColonyCard)}`;
    return;
  }

  const colonistCard = event.target.closest("[data-stellar-colonist-card]");
  if (colonistCard && !event.target.closest("a, button, input, select, textarea, [role='button']")) {
    window.location.hash = `#colonist/${encodeURIComponent(colonistCard.dataset.stellarColonistCard)}`;
    return;
  }

  const stellarImageGenerateButton = event.target.closest("[data-generate-stellar-image-kind]");
  if (stellarImageGenerateButton) {
    handleGenerateStellarImage(
      stellarImageGenerateButton.dataset.generateStellarImageKind,
      stellarImageGenerateButton.dataset.generateStellarImageId,
      stellarImageGenerateButton
    );
    return;
  }

  const generateColonistImagesButton = event.target.closest("[data-generate-colonist-images-colony]");
  if (generateColonistImagesButton) {
    handleGenerateMissingColonistImages(
      generateColonistImagesButton.dataset.generateColonistImagesColony,
      generateColonistImagesButton
    );
    return;
  }

  const generateMoonImagesButton = event.target.closest("[data-generate-moon-images-planet]");
  if (generateMoonImagesButton) {
    handleGenerateMissingMoonImages(
      generateMoonImagesButton.dataset.generateMoonImagesPlanet,
      generateMoonImagesButton
    );
    return;
  }

  const generatePlanetImagesButton = event.target.closest("[data-generate-planet-images-system]");
  if (generatePlanetImagesButton) {
    handleGenerateMissingPlanetImages(
      generatePlanetImagesButton.dataset.generatePlanetImagesSystem,
      generatePlanetImagesButton
    );
    return;
  }

  const stellarImageViewerButton = event.target.closest("[data-open-stellar-image-kind]");
  if (stellarImageViewerButton) {
    openStellarImageViewer(
      stellarImageViewerButton.dataset.openStellarImageKind,
      stellarImageViewerButton.dataset.openStellarImageId,
      stellarImageViewerButton.dataset.stellarImageId
    );
    return;
  }

  if (event.target.closest("[data-export-system]")) {
    handleExport();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && stellarImagePromptResolver && !stellarEls.imagePromptModal?.hidden) {
    event.preventDefault();
    closeStellarImagePromptDialog(null);
    return;
  }

  if (event.key === "Escape" && !stellarEls.colonyModal?.hidden) {
    event.preventDefault();
    closeColonyModal();
    return;
  }

  if (event.key === "Escape" && !stellarEls.colonistModal?.hidden) {
    event.preventDefault();
    closeColonistModal();
    return;
  }

  const lifeformCard = event.target.closest?.("[data-stellar-lifeform-card]");
  if (lifeformCard && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    window.location.hash = `#lifeform/${encodeURIComponent(lifeformCard.dataset.stellarLifeformCard)}`;
    return;
  }

  const colonyCard = event.target.closest?.("[data-stellar-colony-card]");
  if (colonyCard && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    window.location.hash = `#colony/${encodeURIComponent(colonyCard.dataset.stellarColonyCard)}`;
    return;
  }

  const colonistCard = event.target.closest?.("[data-stellar-colonist-card]");
  if (colonistCard && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    window.location.hash = `#colonist/${encodeURIComponent(colonistCard.dataset.stellarColonistCard)}`;
  }
});

stellarEls.generateForm?.addEventListener("submit", handleGenerateSystem);
stellarEls.colonyIncludeColonists?.addEventListener("change", updateColonyRosterVisibility);
stellarEls.imagePromptForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  closeStellarImagePromptDialog(stellarEls.imagePromptExtra?.value || "");
});
window.addEventListener("hashchange", refresh);

if (!window.location.hash) {
  window.location.hash = "#systems";
} else {
  refresh();
}
