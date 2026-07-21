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
  lifeformModal: { planetId: null, moonId: null, isGenerating: false },
  loading: false,
};

window.centralisStellarLoaded = true;

const stellarEls = {
  root: document.querySelector("[data-stellar-root]"),
  tree: document.querySelector("[data-stellar-tree]"),
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
};

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

  const response = await fetch(`${window.CENTRALIS_SUPABASE_CONFIG.url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: window.CENTRALIS_SUPABASE_CONFIG.publishableKey,
      ...(options.headers || {}),
    },
    body: options.body,
  });
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
      .select("id,system_id,spectral_type")
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
  stellarState.images = [];
  stellarState.colonists = [];
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
  await fetchLifeformImages();
}

async function fetchLifeformImages() {
  const objectIds = stellarState.lifeforms.map((lifeform) => lifeform.id).filter(Boolean);
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

function isAsteroidBelt(planet) {
  return String(planet?.type || "").toLowerCase().includes("asteroid");
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

function renderLanding() {
  const total = stellarState.systems.length;
  const planetTotal = stellarState.planets.filter((planet) => !isAsteroidBelt(planet)).length;
  const colonyTotal = stellarState.colonies.length;
  const cards = stellarState.systems.map((system) => {
    const star = stellarState.stars.find((item) => item.system_id === system.id);
    const planets = stellarState.planets.filter((planet) => planet.system_id === system.id && !isAsteroidBelt(planet));
    const colonies = stellarState.colonies.filter((colony) => colony.system_id === system.id);
    const systemSummary = [
      `${formatValue(star?.spectral_type)} star`,
      `${planets.length || Number(system.planet_count || 0)} planets`,
      `${formatNumber(system.age_gyr, " Gyr", 1)} old`,
      `${colonies.length} colonies`,
    ].join(" · ");
    const starDescription = createBlurb(star?.description || system.description || "", 220);
    return `
      <article class="universe-card-wrap stellar-system-card-wrap">
        <a class="universe-card stellar-system-card" href="#system/${encodeURIComponent(system.id)}">
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
        <div class="stellar-home-stats" aria-label="Stellar Architect totals">
          <span><strong>${planetTotal}</strong> planets</span>
          <span><strong>${stellarState.moons.length}</strong> moons</span>
          <span><strong>${colonyTotal}</strong> colonies</span>
        </div>
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

function renderSystemPage(system) {
  const star = starForSystem(system.id);
  const planets = stellarState.planets.filter((planet) => planet.system_id === system.id);
  const planetCount = planets.filter((planet) => !isAsteroidBelt(planet)).length;
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      <a class="stellar-back-link" href="#systems"><ph-arrow-left></ph-arrow-left> Back to Systems</a>
      <h1>Star System: ${escapeHtml(system.name)}</h1>
      <div class="stellar-page-actions">
        <button class="secondary-action" type="button" data-export-system><ph-download-simple weight="bold"></ph-download-simple> Export</button>
      </div>
    </header>
    <section class="stellar-detail-scroll">
      <article class="stellar-panel stellar-star-panel">
        <h2><ph-star weight="fill"></ph-star> Primary Star: ${escapeHtml(star?.name || system.name)}</h2>
        <div class="stellar-split-card">
          ${placeholder()}
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
  return `
    <a class="stellar-body-row" href="#planet/${encodeURIComponent(planet.id)}">
      <div class="stellar-row-image">${isBelt ? '<ph-meteor weight="duotone"></ph-meteor>' : '<ph-planet weight="duotone"></ph-planet>'}</div>
      <div class="stellar-row-main">
        <div class="stellar-row-title">
          <h3>${escapeHtml(planet.name)}</h3>
          ${planetTypeBadge(planet)}
          ${planetHabitabilityBadge(planet)}
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
  const lifeforms = stellarState.lifeforms.filter((lifeform) => lifeform.planet_id === planet.id);
  const colonies = stellarState.colonies.filter((colony) => colony.planet_id === planet.id);
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      <a class="stellar-back-link" href="#system/${encodeURIComponent(planet.system_id)}"><ph-arrow-left></ph-arrow-left> Back to System</a>
      <h1>Planet - ${escapeHtml(planet.name)}</h1>
      <div class="stellar-page-actions">
        <button class="primary-action is-orange" type="button" data-generate-moons="${escapeHtml(planet.id)}"><ph-moon weight="bold"></ph-moon> Generate Details</button>
      </div>
    </header>
    <section class="stellar-detail-scroll">
      <div class="stellar-planet-hero">
        ${placeholder()}
        <div>
          ${planetTypeBadge(planet)}
          ${planetHabitabilityBadge(planet)}
          <p>${escapeHtml(planet.visual_appearance || "")}</p>
        </div>
      </div>
      <article class="stellar-panel">
        <h2><ph-globe-hemisphere-west></ph-globe-hemisphere-west> Planet Properties</h2>
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
        <p class="stellar-description">${escapeHtml(planet.description || "")}</p>
      </article>
      <article class="stellar-panel">
        <div class="stellar-section-heading">
          <h2><ph-eye></ph-eye> Moons (${moons.length})</h2>
          <button class="secondary-action" type="button" data-generate-moons="${escapeHtml(planet.id)}">Generate Moons</button>
        </div>
        <div class="stellar-body-list">${moons.map(renderMoonSummary).join("") || '<p class="stellar-muted">No moons generated yet.</p>'}</div>
      </article>
      ${renderLifeformShell(lifeforms, { planetId: planet.id })}
      ${renderColonyShell(colonies)}
    </section>
  `;
}

function renderMoonSummary(moon) {
  return `
    <a class="stellar-body-row" href="#moon/${encodeURIComponent(moon.id)}">
      <div class="stellar-row-image"><ph-moon weight="duotone"></ph-moon></div>
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
        <h2 class="is-green"><ph-dna></ph-dna> Lifeforms (${lifeforms.length})</h2>
        <button class="secondary-action" type="button" ${targetAttribute} ${!targetAttribute ? "disabled" : ""}>${buttonLabel}</button>
      </div>
      ${lifeforms.length ? lifeforms.map(renderLifeformSummary).join("") : '<p class="stellar-muted">No lifeforms detected.</p>'}
    </article>
  `;
}

function renderLifeformImageBlock(lifeform, sizeClass = "") {
  const image = primaryObjectImage(lifeform.id);
  const actionLabel = image ? "Regenerate" : "Generate";
  return `
    <div class="stellar-lifeform-image-block ${sizeClass}">
      <a class="stellar-lifeform-image" href="#lifeform/${encodeURIComponent(lifeform.id)}" aria-label="Open ${escapeHtml(lifeform.name || "lifeform")}">
        ${image?.image_url
          ? `<img src="${escapeHtml(image.image_url)}" alt="">`
          : '<span>No Image</span>'}
      </a>
      <button class="stellar-lifeform-image-action" type="button" data-generate-lifeform-image="${escapeHtml(lifeform.id)}">
        <ph-arrows-clockwise weight="bold"></ph-arrows-clockwise>
        ${actionLabel}
      </button>
    </div>
  `;
}

function renderLifeformSummary(lifeform) {
  return `
    <article class="stellar-body-row stellar-lifeform-row">
      ${renderLifeformImageBlock(lifeform)}
      <div class="stellar-row-main">
        <div class="stellar-row-title">
          <h3><a href="#lifeform/${encodeURIComponent(lifeform.id)}">${escapeHtml(lifeform.designation || lifeform.name)}</a></h3>
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

function renderColonyShell(colonies) {
  return `
    <article class="stellar-panel">
      <div class="stellar-section-heading">
        <h2 class="is-red"><ph-buildings></ph-buildings> Colonies (${colonies.length})</h2>
        <button class="secondary-action" type="button" disabled title="Coming soon">Generate Colony</button>
      </div>
      ${colonies.length ? colonies.map((colony) => `<a class="stellar-body-row" href="#colony/${encodeURIComponent(colony.id)}"><div class="stellar-row-image"><ph-buildings></ph-buildings></div><div><h3>${escapeHtml(colony.name)}</h3><p>${escapeHtml(colony.description || "")}</p></div></a>`).join("") : '<p class="stellar-muted">Colony generation is coming soon.</p>'}
    </article>
  `;
}

function renderMoonPage(moon) {
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      <a class="stellar-back-link" href="#planet/${encodeURIComponent(moon.planet_id)}"><ph-arrow-left></ph-arrow-left> Back to Planet</a>
      <h1>Moon - ${escapeHtml(moon.name)}</h1>
      <div class="stellar-page-actions"></div>
    </header>
    <section class="stellar-detail-scroll">
      <article class="stellar-panel">
        <h2><ph-eye></ph-eye> Moon Properties</h2>
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
        <p class="stellar-description">${escapeHtml(moon.description || moon.visual_appearance || "")}</p>
      </article>
      ${renderLifeformShell(stellarState.lifeforms.filter((lifeform) => lifeform.moon_id === moon.id), { moonId: moon.id })}
    </section>
  `;
}

function renderLifeformPage(lifeform) {
  const parentHref = lifeform.planet_id
    ? `#planet/${encodeURIComponent(lifeform.planet_id)}`
    : `#moon/${encodeURIComponent(lifeform.moon_id)}`;
  const parentLabel = lifeform.planet_id ? "Back to Planet" : "Back to Moon";
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      <a class="stellar-back-link" href="${parentHref}"><ph-arrow-left></ph-arrow-left> ${parentLabel}</a>
      <h1>Lifeform - ${escapeHtml(lifeform.name)}</h1>
      <div class="stellar-page-actions"></div>
    </header>
    <section class="stellar-detail-scroll">
      ${renderLifeformImageBlock(lifeform, "is-large")}
      <article class="stellar-panel">
        <h2 class="is-green"><ph-dna></ph-dna> Lifeform Properties</h2>
        <div class="stellar-stat-grid">
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
        <p class="stellar-description">${escapeHtml(lifeform.description || "Lifeform generation is coming soon.")}</p>
      </article>
    </section>
  `;
}

function renderColonyPage(colony) {
  const colonists = stellarState.colonists.filter((colonist) => colonist.colony_id === colony.id);
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      <a class="stellar-back-link" href="${colony.planet_id ? `#planet/${encodeURIComponent(colony.planet_id)}` : colony.moon_id ? `#moon/${encodeURIComponent(colony.moon_id)}` : `#system/${encodeURIComponent(colony.system_id)}`}"><ph-arrow-left></ph-arrow-left> ${colony.planet_id ? "Back to Planet" : colony.moon_id ? "Back to Moon" : "Back to System"}</a>
      <h1>${escapeHtml(colony.name)}</h1>
      <div class="stellar-page-actions">
        <button class="secondary-action" disabled title="Coming soon">Generate Colonists</button>
      </div>
    </header>
    <section class="stellar-detail-scroll">
      <article class="stellar-panel">
        <h2 class="is-red"><ph-buildings></ph-buildings> Colony Properties</h2>
        <div class="stellar-stat-grid">
          ${renderStat("Founded", formatValue(colony.founded_year))}
          ${renderStat("Organization", formatValue(colony.organization))}
          ${renderStat("Settlement Type", formatValue(colony.settlement_type))}
          ${renderStat("Population", formatNumber(colony.population, "", 0))}
          ${renderStat("Industry", formatValue(colony.industry))}
          ${renderStat("Supply Status", formatValue(colony.supply_status))}
        </div>
        <p class="stellar-description">${escapeHtml(colony.description || "")}</p>
      </article>
      <article class="stellar-panel">
        <h2 class="is-green"><ph-users></ph-users> Colonists</h2>
        ${colonists.length ? colonists.map((colonist) => `<a class="stellar-body-row" href="#colonist/${encodeURIComponent(colonist.id)}"><div class="stellar-row-image"><ph-user></ph-user></div><div><h3>${escapeHtml(colonist.name)}</h3><p>${escapeHtml(colonist.role || "")}</p></div></a>`).join("") : '<p class="stellar-muted">Colonist generation is coming soon.</p>'}
      </article>
    </section>
  `;
}

function renderColonistPage(colonist) {
  stellarEls.root.innerHTML = `
    <header class="stellar-detail-toolbar">
      <a class="stellar-back-link" href="#colony/${encodeURIComponent(colonist.colony_id)}"><ph-arrow-left></ph-arrow-left> Back to Colony</a>
      <h1>${escapeHtml(colonist.name)}</h1>
      <div class="stellar-page-actions"></div>
    </header>
    <section class="stellar-detail-scroll">
      <article class="stellar-panel">
        <h2><ph-user></ph-user> Personal Information</h2>
        <div class="stellar-stat-grid">
          ${renderStat("Age", formatValue(colonist.age))}
          ${renderStat("Gender", formatValue(colonist.gender))}
          ${renderStat("Nationality", formatValue(colonist.nationality))}
          ${renderStat("Role", formatValue(colonist.role))}
          ${renderStat("Department", formatValue(colonist.department))}
        </div>
        <p class="stellar-description">${escapeHtml(colonist.biography || colonist.physical_description || "Colonist generation is coming soon.")}</p>
      </article>
    </section>
  `;
}

function renderTree() {
  const systems = stellarState.systems;
  if (!stellarEls.tree) return;
  if (stellarEls.sideGenerateButton) {
    stellarEls.sideGenerateButton.hidden = stellarState.route.name !== "systems";
  }
  stellarEls.tree.innerHTML = `
    <h2>Star Systems</h2>
    <div class="stellar-tree-list">
      ${systems.map((system) => renderTreeSystem(system)).join("") || '<p class="stellar-muted">No systems generated.</p>'}
    </div>
  `;
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
          <ph-star weight="fill"></ph-star>
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
  return `<a class="stellar-tree-item ${stellarState.route.id === lifeform.id ? "is-selected" : ""}" href="#lifeform/${encodeURIComponent(lifeform.id)}"><ph-dna></ph-dna><span>${escapeHtml(lifeform.name)}</span></a>`;
}

function renderTreeColony(colony) {
  return `<a class="stellar-tree-item ${stellarState.route.id === colony.id ? "is-selected" : ""}" href="#colony/${encodeURIComponent(colony.id)}"><ph-users></ph-users><span>${escapeHtml(colony.name)}</span></a>`;
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
        <a class="stellar-tree-item ${stellarState.route.id === moon.id ? "is-selected" : ""}" href="#moon/${encodeURIComponent(moon.id)}"><ph-moon></ph-moon><span>${escapeHtml(moon.name)}</span></a>
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
  const moons = stellarState.moons.filter((moon) => moon.planet_id === planet.id);
  const lifeforms = stellarState.lifeforms.filter((lifeform) => lifeform.planet_id === planet.id);
  const colonies = stellarState.colonies.filter((colony) => colony.planet_id === planet.id);
  const moonLifeforms = stellarState.lifeforms.filter((lifeform) => moons.some((moon) => moon.id === lifeform.moon_id));
  const moonColonies = stellarState.colonies.filter((colony) => moons.some((moon) => moon.id === colony.moon_id));
  const colonist = stellarState.route.name === "colonist" ? colonistForId(stellarState.route.id) : null;
  const isSelected = stellarState.route.id === planet.id;
  const isBelt = isAsteroidBelt(planet);
  const hasChildren = moons.length > 0 || lifeforms.length > 0 || colonies.length > 0 || moonLifeforms.length > 0 || moonColonies.length > 0;
  const isAncestor = moons.some((moon) => moon.id === stellarState.route.id)
    || moonLifeforms.some((lifeform) => lifeform.id === stellarState.route.id)
    || moonColonies.some((colony) => colony.id === stellarState.route.id)
    || lifeforms.some((lifeform) => lifeform.id === stellarState.route.id)
    || colonies.some((colony) => colony.id === stellarState.route.id)
    || (stellarState.route.name === "colonist" && [...colonies, ...moonColonies].some((colony) => colony.id === colonist?.colony_id));
  const treeKey = `planet:${planet.id}`;
  const expanded = hasChildren && !stellarState.collapsedTree.has(treeKey) && (stellarState.expandedTree.has(treeKey) || isAncestor);
  return `
    <div>
      <div class="stellar-tree-row">
        ${hasChildren ? `<button class="stellar-tree-toggle ${expanded ? "is-expanded" : ""}" type="button" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(planet.name)}" aria-expanded="${expanded}" data-tree-toggle="${escapeHtml(treeKey)}"><ph-caret-right weight="bold"></ph-caret-right></button>` : '<span class="stellar-tree-toggle-spacer"></span>'}
        <a class="stellar-tree-item ${isSelected ? "is-selected" : ""}" href="#planet/${encodeURIComponent(planet.id)}">
          ${isBelt ? "<ph-meteor></ph-meteor>" : "<ph-planet></ph-planet>"}
          <span>${escapeHtml(planet.name)}</span>
        </a>
      </div>
      ${expanded ? `<div class="stellar-tree-children">
        ${renderTreeFolder({
          key: `planet-moons:${planet.id}`,
          label: "Moons",
          icon: "<ph-moon-stars></ph-moon-stars>",
          count: moons.length,
          childrenHtml: moons.map(renderTreeMoon).join(""),
          isAncestor: moons.some((moon) => moon.id === stellarState.route.id)
            || moonLifeforms.some((lifeform) => lifeform.id === stellarState.route.id)
            || moonColonies.some((colony) => colony.id === stellarState.route.id)
            || moonColonies.some((colony) => colony.id === colonist?.colony_id),
        })}
        ${renderTreeFolder({
          key: `planet-lifeforms:${planet.id}`,
          label: "Planetary Lifeforms",
          icon: "<ph-dna></ph-dna>",
          count: lifeforms.length,
          childrenHtml: lifeforms.map(renderTreeLifeform).join(""),
          isAncestor: lifeforms.some((lifeform) => lifeform.id === stellarState.route.id),
        })}
        ${renderTreeFolder({
          key: `planet-colonies:${planet.id}`,
          label: "Planetary Colonies",
          icon: "<ph-users></ph-users>",
          count: colonies.length,
          childrenHtml: colonies.map(renderTreeColony).join(""),
          isAncestor: colonies.some((colony) => colony.id === stellarState.route.id) || colonies.some((colony) => colony.id === colonist?.colony_id),
        })}
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
  stellarEls.root.innerHTML = '<div class="stellar-loading">Loading Stellar Architect...</div>';
  try {
    if (!stellarState.appUser) {
      stellarState.appUser = await waitForCurrentAppUser();
    }
    if (!stellarState.appUser) throw new Error("Could not load your Centralis user profile.");
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
    const { data, error } = await stellarSupabase.functions.invoke("generate-stellar-lifeforms", {
      body: planetId ? { planetId } : { moonId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    closeLifeModal(true);
    await refresh();
  } catch (error) {
    setStatus(stellarEls.lifeStatus, `Could not generate lifeforms: ${getReadableError(error)}`, "error");
  } finally {
    setLifeModalGenerating(false);
  }
}

async function handleGenerateLifeformImage(lifeformId, button) {
  const lifeform = lifeformForId(lifeformId);
  if (!lifeform) return;
  const originalHtml = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<ph-arrows-clockwise weight="bold"></ph-arrows-clockwise> Generating...';
  }

  try {
    const generated = await callEdgeFunction("generate-object-image", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectId: lifeform.id,
        storageModule: "stellar-architect",
        objectKind: "stellar lifeform",
        elementType: lifeform.kingdom || "Alien lifeform",
        name: lifeform.name || lifeform.designation || "",
        description: "",
        extraPrompt: buildLifeformImagePrompt(lifeform),
      }),
    });
    if (generated?.image?.id) {
      await callEdgeFunction("set-primary-image", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: generated.image.id }),
      });
    }
    await fetchLifeformImages();
    renderRoute();
  } catch (error) {
    window.alert(`Could not generate lifeform image: ${getReadableError(error)}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
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

  const lifeformImageButton = event.target.closest("[data-generate-lifeform-image]");
  if (lifeformImageButton) {
    handleGenerateLifeformImage(lifeformImageButton.dataset.generateLifeformImage, lifeformImageButton);
    return;
  }

  if (event.target.closest("[data-export-system]")) {
    handleExport();
  }
});

stellarEls.generateForm?.addEventListener("submit", handleGenerateSystem);
window.addEventListener("hashchange", refresh);

if (!window.location.hash) {
  window.location.hash = "#systems";
} else {
  refresh();
}
