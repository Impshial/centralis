const rouletteSupabase = window.centralisSupabase;

const rouletteState = {
  appUser: null,
  queryCache: new Map(),
  searchTimer: null,
  searchResults: [],
  activeResultIndex: -1,
  show: null,
  selectedSeasons: new Set(),
  isSpinning: false,
};

const rouletteEls = {
  search: document.querySelector("[data-episode-search]"),
  spinner: document.querySelector("[data-episode-search-spinner]"),
  results: document.querySelector("[data-episode-search-results]"),
  searchStatus: document.querySelector("[data-episode-search-status]"),
  selectedShow: document.querySelector("[data-episode-selected-show]"),
  result: document.querySelector("[data-episode-result]"),
  recent: document.querySelector("[data-episode-recent-shows]"),
  loadingOverlay: document.querySelector("[data-episode-loading-overlay]"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function readableError(error) {
  return error?.context?.error || error?.message || error?.error || "Something went wrong.";
}

function posterUrl(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}

function yearFrom(date) {
  return String(date || "").slice(0, 4) || "Year unavailable";
}

function dateLabel(date) {
  if (!date) return "Air date unavailable";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? String(date) : new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(parsed);
}

async function invokeTmdb(action, payload = {}) {
  const { data, error } = await rouletteSupabase.functions.invoke("episode-roulette-tmdb", { body: { action, ...payload } });
  if (error) {
    let context = null;
    try { context = typeof error.context?.json === "function" ? await error.context.json() : null; } catch { /* ignore */ }
    error.context = context;
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function waitForAppUser() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const user = window.centralisCurrentAppUser || await window.centralisGetCurrentAppUser?.();
    if (user) return user;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return null;
}

function setSearchStatus(message, type = "") {
  rouletteEls.searchStatus.textContent = message || "";
  rouletteEls.searchStatus.className = `episode-search-status${type ? ` is-${type}` : ""}`;
}

function setSearching(isSearching) {
  rouletteEls.spinner.hidden = !isSearching;
}

function setPageLoading(isLoading) {
  rouletteEls.loadingOverlay.hidden = !isLoading;
  document.body.classList.toggle("is-episode-loading", isLoading);
}

function hideResults() {
  rouletteState.searchResults = [];
  rouletteState.activeResultIndex = -1;
  rouletteEls.results.hidden = true;
  rouletteEls.results.innerHTML = "";
  rouletteEls.search.setAttribute("aria-expanded", "false");
}

function renderSearchResults(results) {
  rouletteState.searchResults = results;
  rouletteState.activeResultIndex = -1;
  if (!results.length) {
    hideResults();
    setSearchStatus("No regular-season shows found for that search.");
    return;
  }
  rouletteEls.results.innerHTML = results.map((show, index) => {
    const image = posterUrl(show.posterPath, "w92");
    return `<button type="button" class="episode-search-result" role="option" aria-selected="false" data-episode-result-index="${index}">
      ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : `<span class="episode-search-poster-fallback"><ph-television weight="duotone"></ph-television></span>`}
      <span><strong>${escapeHtml(show.name)}</strong><small>${escapeHtml(yearFrom(show.firstAirDate))} · ${show.seasonCount} ${show.seasonCount === 1 ? "season" : "seasons"}</small></span>
    </button>`;
  }).join("");
  rouletteEls.results.hidden = false;
  rouletteEls.search.setAttribute("aria-expanded", "true");
  setSearchStatus(`${results.length} matching shows.`);
}

async function searchShows(query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length < 2) {
    hideResults();
    setSearching(false);
    setSearchStatus("Enter at least two characters to search TMDB.");
    return;
  }
  setSearching(true);
  setSearchStatus("Searching TMDB…");
  try {
    const results = rouletteState.queryCache.get(normalized) || (await invokeTmdb("search", { query })).results || [];
    rouletteState.queryCache.set(normalized, results);
    renderSearchResults(results);
  } catch (error) {
    hideResults();
    setSearchStatus(readableError(error), "error");
  } finally {
    setSearching(false);
  }
}

function renderSelectedShow() {
  const show = rouletteState.show;
  if (!show) {
    rouletteEls.selectedShow.hidden = true;
    return;
  }
  const image = posterUrl(show.posterPath, "w500");
  const seasonChips = show.seasons.map((season) => `<button type="button" class="episode-season-chip${rouletteState.selectedSeasons.has(season.number) ? " is-selected" : ""}" data-episode-season="${season.number}" aria-pressed="${rouletteState.selectedSeasons.has(season.number)}">Season ${season.number}</button>`).join("");
  rouletteEls.selectedShow.innerHTML = `
    <button class="episode-show-clear icon-button" type="button" data-clear-episode-show aria-label="Choose a different show"><ph-x></ph-x></button>
    <div class="episode-show-overview">
      ${image ? `<img class="episode-show-poster" src="${escapeHtml(image)}" alt="${escapeHtml(show.name)} poster">` : `<div class="episode-show-poster is-empty"><ph-television weight="duotone"></ph-television></div>`}
      <div><h2>${escapeHtml(show.name)}</h2><p>${escapeHtml(show.overview)}</p><span>${escapeHtml(yearFrom(show.firstAirDate))} · ${show.seasonCount} ${show.seasonCount === 1 ? "season" : "seasons"}</span></div>
    </div>
    <button type="button" class="primary-action episode-spin" data-spin-episode><ph-shuffle-simple weight="bold"></ph-shuffle-simple><span>Get Random Episode</span></button>
    <div class="episode-season-filter"><h3>Filter by Season <span>(Optional)</span></h3><p>Leave all seasons unselected to include every regular episode.</p><div class="episode-season-chips"><button type="button" class="episode-season-chip${rouletteState.selectedSeasons.size === 0 ? " is-selected" : ""}" data-clear-seasons aria-pressed="${rouletteState.selectedSeasons.size === 0}">All Episodes</button>${seasonChips}</div></div>`;
  rouletteEls.selectedShow.hidden = false;
}

function renderEpisodeResult(payload) {
  const episode = payload.episode;
  rouletteEls.result.innerHTML = `
    <div class="episode-result-top"><div><h2>${escapeHtml(episode.name)}</h2><p><ph-calendar-blank></ph-calendar-blank>${escapeHtml(dateLabel(episode.airDate))}${episode.runtime ? ` <span><ph-clock></ph-clock>${escapeHtml(episode.runtime)} minutes</span>` : ""}</p></div><div class="episode-number">S${episode.seasonNumber}E${episode.episodeNumber}<small>Season ${episode.seasonNumber}, Episode ${episode.episodeNumber}</small></div></div>
    <div class="episode-result-body"><h3>Synopsis</h3><p>${escapeHtml(episode.overview)}</p><div class="episode-result-meta"><div><span>Production Code</span><strong>${escapeHtml(episode.productionCode || "N/A")}</strong></div><div><span>Episode Type</span><strong>${escapeHtml(episode.type || "Regular Episode")}</strong></div><div><span>Show</span><strong>${escapeHtml(episode.showName)}</strong></div></div>
    <button type="button" class="outline-action episode-spin-again" data-spin-episode><ph-shuffle-simple weight="bold"></ph-shuffle-simple><span>Get Another Episode</span></button></div>
    ${payload.warnings?.length ? `<p class="episode-inline-warning">${escapeHtml(payload.warnings.join(" "))}</p>` : ""}`;
  rouletteEls.result.hidden = false;
  window.setTimeout(() => rouletteEls.result.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
}

async function saveRecentShow() {
  const show = rouletteState.show;
  if (!show || !rouletteState.appUser) return;
  const { error } = await rouletteSupabase.from("recent_shows").upsert({
    user_id: rouletteState.appUser.id,
    tmdb_id: show.id,
    show_name: show.name,
    poster_path: show.posterPath || null,
    last_used_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,tmdb_id" });
  if (error) throw error;
}

async function loadRecentShows() {
  const { data, error } = await rouletteSupabase.from("recent_shows").select("*").eq("user_id", rouletteState.appUser.id).order("last_used_at", { ascending: false }).limit(30);
  if (error) throw error;
  rouletteEls.recent.innerHTML = data?.length ? data.map((show) => {
    const image = posterUrl(show.poster_path, "w92");
    return `<button type="button" class="episode-recent-show" data-recent-show-id="${show.tmdb_id}">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : `<span class="episode-recent-poster-fallback"><ph-television></ph-television></span>`}<span>${escapeHtml(show.show_name)}</span></button>`;
  }).join("") : `<p class="empty-state">Your spun shows will appear here.</p>`;
}

async function selectShow(show) {
  rouletteState.show = show;
  rouletteState.selectedSeasons.clear();
  rouletteEls.search.value = "";
  rouletteEls.result.hidden = true;
  hideResults();
  setSearchStatus("");
  renderSelectedShow();
  rouletteEls.selectedShow.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function selectShowById(id) {
  setSearchStatus("Loading show details…");
  setPageLoading(true);
  try {
    const data = await invokeTmdb("details", { showId: id });
    await selectShow(data.show);
  } catch (error) {
    setSearchStatus(readableError(error), "error");
  } finally {
    setPageLoading(false);
  }
}

async function spinEpisode() {
  if (rouletteState.isSpinning || !rouletteState.show) return;
  rouletteState.isSpinning = true;
  renderSelectedShow();
  setPageLoading(true);
  const spinner = rouletteEls.selectedShow.querySelector("[data-spin-episode]");
  spinner?.setAttribute("disabled", "");
  try {
    const data = await invokeTmdb("randomEpisode", { showId: rouletteState.show.id, seasonNumbers: [...rouletteState.selectedSeasons] });
    rouletteState.show = data.show;
    renderSelectedShow();
    renderEpisodeResult(data);
    try { await saveRecentShow(); await loadRecentShows(); } catch (error) { console.warn("Could not save recent show", error); }
  } catch (error) {
    const status = rouletteEls.selectedShow.querySelector(".episode-season-filter");
    if (status) status.insertAdjacentHTML("beforeend", `<p class="episode-inline-error">${escapeHtml(readableError(error))}</p>`);
  } finally {
    rouletteState.isSpinning = false;
    setPageLoading(false);
    renderSelectedShow();
  }
}

rouletteEls.search?.addEventListener("input", () => {
  window.clearTimeout(rouletteState.searchTimer);
  rouletteState.searchTimer = window.setTimeout(() => searchShows(rouletteEls.search.value), 300);
});

rouletteEls.search?.addEventListener("keydown", (event) => {
  if (rouletteEls.results.hidden || !rouletteState.searchResults.length) return;
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    rouletteState.activeResultIndex = (rouletteState.activeResultIndex + (event.key === "ArrowDown" ? 1 : -1) + rouletteState.searchResults.length) % rouletteState.searchResults.length;
    rouletteEls.results.querySelectorAll("[data-episode-result-index]").forEach((node, index) => node.setAttribute("aria-selected", String(index === rouletteState.activeResultIndex)));
  } else if (event.key === "Enter" && rouletteState.activeResultIndex >= 0) {
    event.preventDefault(); selectShow(rouletteState.searchResults[rouletteState.activeResultIndex]);
  } else if (event.key === "Escape") hideResults();
});

rouletteEls.results?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-episode-result-index]");
  if (button) selectShow(rouletteState.searchResults[Number(button.dataset.episodeResultIndex)]);
});

rouletteEls.selectedShow?.addEventListener("click", (event) => {
  if (event.target.closest("[data-clear-episode-show]")) { rouletteState.show = null; rouletteState.selectedSeasons.clear(); rouletteEls.result.hidden = true; renderSelectedShow(); rouletteEls.search.focus(); return; }
  if (event.target.closest("[data-spin-episode]")) { spinEpisode(); return; }
  if (event.target.closest("[data-clear-seasons]")) { rouletteState.selectedSeasons.clear(); renderSelectedShow(); return; }
  const season = event.target.closest("[data-episode-season]");
  if (season) {
    const number = Number(season.dataset.episodeSeason);
    if (rouletteState.selectedSeasons.has(number)) rouletteState.selectedSeasons.delete(number); else rouletteState.selectedSeasons.add(number);
    renderSelectedShow();
  }
});

rouletteEls.result?.addEventListener("click", (event) => { if (event.target.closest("[data-spin-episode]")) spinEpisode(); });
rouletteEls.recent?.addEventListener("click", (event) => { const show = event.target.closest("[data-recent-show-id]"); if (show) selectShowById(show.dataset.recentShowId); });

async function bootEpisodeRoulette() {
  if (!rouletteSupabase) throw new Error("Episode Roulette could not initialize Supabase.");
  rouletteState.appUser = await waitForAppUser();
  if (!rouletteState.appUser) throw new Error("Still waiting for your profile. Refresh if this does not clear.");
  try { await loadRecentShows(); } catch (error) { rouletteEls.recent.innerHTML = `<p class="empty-state is-error">${escapeHtml(readableError(error))}</p>`; }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bootEpisodeRoulette().catch((error) => setSearchStatus(readableError(error), "error")), { once: true });
else bootEpisodeRoulette().catch((error) => setSearchStatus(readableError(error), "error"));
