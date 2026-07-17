const movieSupabase = window.centralisSupabase;

const movieState = {
  appUser: null,
  movies: [],
  franchises: [],
  collections: [],
  selectedIds: new Set(),
  page: 1,
  pageSize: 50,
  total: 0,
  stats: {
    total: 0,
    downloaded: 0,
    franchises: 0,
    collections: 0,
    missingData: 0,
  },
  filters: {
    search: "",
    sort: "title-asc",
    status: "all",
    franchise: "all",
    collection: "all",
  },
  importFile: null,
  activeMovie: null,
  activeManager: null,
  posterDisplayUrls: new Map(),
};

window.centralisMovieTrackerLoaded = true;

const els = {
  rows: document.querySelector("[data-movie-rows]"),
  count: document.querySelector("[data-movie-count]"),
  status: document.querySelector("[data-movie-status]"),
  stats: document.querySelector("[data-movie-stats]"),
  selectAll: document.querySelector("[data-select-all-movies]"),
  pagination: Array.from(document.querySelectorAll("[data-movie-pagination]")),
  search: document.querySelector("[data-search-movies]"),
  sort: document.querySelector("[data-sort-movies]"),
  statusFilter: document.querySelector("[data-filter-status]"),
  franchiseFilter: document.querySelector("[data-filter-franchise]"),
  collectionFilter: document.querySelector("[data-filter-collection]"),
  addFranchise: document.querySelector("[data-add-franchise]"),
  actionsToggle: document.querySelector("[data-actions-toggle]"),
  actionsMenu: document.querySelector("[data-actions-menu]"),
  statisticsToggle: document.querySelector("[data-statistics-toggle]"),
  addForm: document.querySelector("[data-add-movie-form]"),
  addStatus: document.querySelector("[data-add-movie-status]"),
  viewContent: document.querySelector("[data-movie-view-content]"),
  editForm: document.querySelector("[data-edit-movie-form]"),
  managerContent: document.querySelector("[data-manager-content]"),
  importForm: document.querySelector("[data-import-form]"),
  importInput: document.querySelector("[data-import-file]"),
  importLabel: document.querySelector("[data-import-file-label]"),
  importSubmit: document.querySelector("[data-import-submit]"),
  importStatus: document.querySelector("[data-import-status]"),
  processContent: document.querySelector("[data-process-content]"),
  bulkForm: document.querySelector("[data-bulk-form]"),
};

function ensureSidebarAddMovieButton() {
  const panel = document.querySelector(".movie-side-panel");
  const actionsWrap = document.querySelector(".movie-actions-wrap");
  if (!panel || !actionsWrap || panel.querySelector("[data-open-add-movie]")) return;

  const addWrap = document.createElement("div");
  addWrap.className = "movie-sidebar-actions";
  addWrap.innerHTML = `
    <button class="primary-action movie-wide-action" type="button" data-open-add-movie>
      <ph-plus weight="bold" aria-hidden="true"></ph-plus>
      Add Movie
    </button>
  `;
  panel.insertBefore(addWrap, actionsWrap);
}

ensureSidebarAddMovieButton();

function setStatus(message, type) {
  if (!els.status) return;
  els.status.textContent = message || "";
  els.status.classList.toggle("is-error", type === "error");
  els.status.classList.toggle("is-success", type === "success");
}

function setDialogStatus(element, message, type) {
  if (!element) return;
  element.textContent = message || "";
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-success", type === "success");
}

function getReadableError(error) {
  return error?.message || error?.error || String(error || "Unknown error");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeId(value) {
  const text = String(value || "").trim();
  if (!text || text === "all" || text === "none") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeMovieTitleForSort(title) {
  const text = String(title || "").trim().replace(/\s+/g, " ");
  if (!/^the\s+\S/i.test(text) || /,\s*the$/i.test(text)) {
    return text;
  }
  return `${text.replace(/^the\s+/i, "")}, The`;
}

function normalizeMovieTitleForLookup(title) {
  const text = String(title || "").trim();
  const match = text.match(/^(.+),\s*The$/i);
  return match ? `The ${match[1].trim()}` : text;
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = false;
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = true;
}

function statusBadge(movie) {
  return movie.downloaded
    ? '<span class="movie-status-badge is-downloaded">Downloaded</span>'
    : '<span class="movie-status-badge">Not Downloaded</span>';
}

function movieImageObjectId(movieId) {
  return `movie-${movieId}`;
}

function getPosterDisplayUrl(movie) {
  const cached = movieState.posterDisplayUrls.get(movie.id);
  if (cached?.storedUrl && cached.storedUrl === movie.poster_url) {
    return cached.displayUrl;
  }
  return movie.poster_url;
}

function posterMarkup(movie, size = "thumb") {
  const posterUrl = getPosterDisplayUrl(movie);
  if (posterUrl) {
    return `<img class="movie-poster movie-poster-${size}" src="${escapeHtml(posterUrl)}" alt="${escapeHtml(movie.title)} poster" loading="lazy">`;
  }
  return `<div class="movie-poster movie-poster-${size} is-empty"><ph-film-slate weight="bold"></ph-film-slate></div>`;
}

function getSelectedMovies() {
  return movieState.movies.filter((movie) => movieState.selectedIds.has(movie.id));
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

async function fetchLookups() {
  const [franchiseResponse, collectionResponse] = await Promise.all([
    movieSupabase
      .from("franchise")
      .select("*")
      .eq("user_id", movieState.appUser.id)
      .order("name", { ascending: true }),
    movieSupabase
      .from("collections")
      .select("*")
      .eq("user_id", movieState.appUser.id)
      .order("name", { ascending: true }),
  ]);

  if (franchiseResponse.error) throw franchiseResponse.error;
  if (collectionResponse.error) throw collectionResponse.error;
  movieState.franchises = franchiseResponse.data || [];
  movieState.collections = collectionResponse.data || [];
}

function applyMovieQueryFilters(query) {
  query = query.eq("user_id", movieState.appUser.id);
  const search = movieState.filters.search.trim();
  if (search) {
    const safe = search.replaceAll("%", "\\%").replaceAll(",", " ");
    query = query.or(`title.ilike.%${safe}%,director.ilike.%${safe}%,actors.ilike.%${safe}%,genre.ilike.%${safe}%,plot.ilike.%${safe}%`);
  }
  if (movieState.filters.status === "downloaded") query = query.eq("downloaded", true);
  if (movieState.filters.status === "missing") query = query.eq("downloaded", false);
  if (movieState.filters.franchise !== "all") query = query.eq("franchise_id", normalizeId(movieState.filters.franchise));
  if (movieState.filters.collection !== "all") query = query.eq("collection_id", normalizeId(movieState.filters.collection));
  return query;
}

function applyMovieSort(query) {
  switch (movieState.filters.sort) {
    case "title-desc":
      return query.order("title", { ascending: false });
    case "year-desc":
      return query.order("year_released", { ascending: false }).order("title", { ascending: true });
    case "year-asc":
      return query.order("year_released", { ascending: true }).order("title", { ascending: true });
    case "title-asc":
    default:
      return query.order("title", { ascending: true });
  }
}

async function fetchMovies() {
  const from = (movieState.page - 1) * movieState.pageSize;
  const to = from + movieState.pageSize - 1;
  let query = movieSupabase
    .from("movies")
    .select("*, franchise:franchise_id(id,name), collection:collection_id(id,name)", { count: "exact" });
  query = applyMovieSort(applyMovieQueryFilters(query));
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  movieState.movies = data || [];
  movieState.total = Number(count || 0);
  await hydrateMoviePosterDisplayUrls();
}

async function hydrateMoviePosterDisplayUrls() {
  const uploadedPosterMovies = movieState.movies.filter((movie) => movie.poster_url);
  if (!uploadedPosterMovies.length) return;

  const objectIds = uploadedPosterMovies.map((movie) => movieImageObjectId(movie.id));
  try {
    const response = await getFunctionResponse("list-object-images", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectIds }),
    });
    if (!response.ok) {
      throw new Error(await parseFunctionError(response, "Could not load signed poster URLs."));
    }
    const payload = await response.json();
    const images = Array.isArray(payload.images) ? payload.images : [];
    for (const movie of uploadedPosterMovies) {
      const image = images
        .filter((currentImage) => currentImage.object_id === movieImageObjectId(movie.id))
        .sort((first, second) => Number(second.is_primary) - Number(first.is_primary))[0];
      if (image?.stored_image_url && image.stored_image_url === movie.poster_url && image.image_url) {
        movieState.posterDisplayUrls.set(movie.id, {
          storedUrl: image.stored_image_url,
          displayUrl: image.image_url,
        });
      } else {
        movieState.posterDisplayUrls.delete(movie.id);
      }
    }
  } catch (error) {
    console.warn("Could not hydrate signed movie poster URLs.", error);
  }
}

async function fetchMovieStats() {
  const base = () => movieSupabase
    .from("movies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", movieState.appUser.id);

  const [totalResponse, downloadedResponse, missingResponse] = await Promise.all([
    base(),
    base().eq("downloaded", true),
    base().or("director.is.null,actors.is.null,plot.is.null,date_released.is.null"),
  ]);

  if (totalResponse.error) throw totalResponse.error;
  if (downloadedResponse.error) throw downloadedResponse.error;
  if (missingResponse.error) throw missingResponse.error;

  movieState.stats = {
    total: Number(totalResponse.count || 0),
    downloaded: Number(downloadedResponse.count || 0),
    franchises: movieState.franchises.length,
    collections: movieState.collections.length,
    missingData: Number(missingResponse.count || 0),
  };
}

function optionMarkup(items, label, selected = "all") {
  return [
    `<option value="all">${label}</option>`,
    ...items.map((item) => `<option value="${item.id}" ${String(selected) === String(item.id) ? "selected" : ""}>${escapeHtml(item.name)}</option>`),
  ].join("");
}

function noneOptionMarkup(items, label, selected = "") {
  return [
    `<option value="">${label}</option>`,
    ...items.map((item) => `<option value="${item.id}" ${String(selected || "") === String(item.id) ? "selected" : ""}>${escapeHtml(item.name)}</option>`),
  ].join("");
}

function renderLookups() {
  if (els.franchiseFilter) els.franchiseFilter.innerHTML = optionMarkup(movieState.franchises, "All Franchises", movieState.filters.franchise);
  if (els.collectionFilter) els.collectionFilter.innerHTML = optionMarkup(movieState.collections, "All Collections", movieState.filters.collection);
  if (els.addFranchise) els.addFranchise.innerHTML = noneOptionMarkup(movieState.franchises, "No Franchise");
}

function renderMovies() {
  if (!els.rows) return;
  if (!movieState.movies.length) {
    els.rows.innerHTML = '<tr><td colspan="8" class="movie-empty-row">No movies found.</td></tr>';
  } else {
    els.rows.innerHTML = movieState.movies.map((movie) => `
      <tr class="movie-clickable-row" data-movie-id="${movie.id}" tabindex="0" aria-label="View ${escapeHtml(movie.title)}">
        <td><input type="checkbox" data-select-movie="${movie.id}" ${movieState.selectedIds.has(movie.id) ? "checked" : ""} aria-label="Select ${escapeHtml(movie.title)}"></td>
        <td>${posterMarkup(movie)}</td>
        <td class="movie-title-cell">${escapeHtml(movie.title)}</td>
        <td>${escapeHtml(movie.year_released)}</td>
        <td>${escapeHtml(movie.director || "")}</td>
        <td class="movie-muted">${escapeHtml(movie.franchise?.name || "None")}</td>
        <td class="movie-muted">${escapeHtml(movie.collection?.name || "None")}</td>
        <td>${statusBadge(movie)}</td>
      </tr>
    `).join("");
  }

  const start = movieState.total ? (movieState.page - 1) * movieState.pageSize + 1 : 0;
  const end = Math.min(movieState.page * movieState.pageSize, movieState.total);
  if (els.count) els.count.textContent = `${start}-${end} of ${movieState.total} movies`;
  renderMoviePagination();
  if (els.selectAll) {
    els.selectAll.checked = movieState.movies.length > 0 && movieState.movies.every((movie) => movieState.selectedIds.has(movie.id));
    els.selectAll.indeterminate = movieState.movies.some((movie) => movieState.selectedIds.has(movie.id)) && !els.selectAll.checked;
  }
  renderActionsState();
  renderStats();
}

function getMovieTotalPages() {
  return Math.max(1, Math.ceil(movieState.total / movieState.pageSize));
}

function getMoviePageItems(totalPages, currentPage) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage]);
  for (let offset = -1; offset <= 1; offset += 1) {
    const page = currentPage + offset;
    if (page > 1 && page < totalPages) {
      pages.add(page);
    }
  }
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 3);
    pages.add(totalPages - 2);
    pages.add(totalPages - 1);
  }

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((first, second) => first - second);
  const items = [];
  sortedPages.forEach((page, index) => {
    if (index > 0 && page - sortedPages[index - 1] > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });
  return items;
}

function renderMoviePagination() {
  const totalPages = getMovieTotalPages();
  const currentPage = Math.min(movieState.page, totalPages);
  movieState.page = currentPage;
  const pageItems = getMoviePageItems(totalPages, currentPage);
  const atStart = currentPage <= 1;
  const atEnd = currentPage >= totalPages;
  const controls = [
    `<button class="secondary-action movie-pagination-edge" type="button" data-page-action="first" aria-label="First page" title="First page" ${atStart ? "disabled" : ""}><ph-arrow-line-left weight="bold" aria-hidden="true"></ph-arrow-line-left></button>`,
    `<button class="secondary-action movie-pagination-edge" type="button" data-page-action="previous" aria-label="Previous page" title="Previous page" ${atStart ? "disabled" : ""}><ph-arrow-left weight="bold" aria-hidden="true"></ph-arrow-left></button>`,
    `<span class="movie-page-number-group" aria-label="Pages">`,
    ...pageItems.map((item) => {
      if (item === "ellipsis") {
        return `<span class="movie-page-ellipsis" aria-hidden="true">…</span>`;
      }
      const isCurrent = item === currentPage;
      return `<button class="secondary-action movie-page-number ${isCurrent ? "is-current" : ""}" type="button" data-page-number="${item}" ${isCurrent ? 'aria-current="page"' : ""}>${item}</button>`;
    }),
    `</span>`,
    `<button class="secondary-action movie-pagination-edge" type="button" data-page-action="next" aria-label="Next page" title="Next page" ${atEnd ? "disabled" : ""}><ph-arrow-right weight="bold" aria-hidden="true"></ph-arrow-right></button>`,
    `<button class="secondary-action movie-pagination-edge" type="button" data-page-action="last" aria-label="Last page" title="Last page" ${atEnd ? "disabled" : ""}><ph-arrow-line-right weight="bold" aria-hidden="true"></ph-arrow-line-right></button>`,
  ].join("");

  els.pagination.forEach((pagination) => {
    pagination.innerHTML = controls;
  });
}

function renderActionsState() {
  const count = movieState.selectedIds.size;
  const downloaded = document.querySelector("[data-bulk-downloaded]");
  const franchise = document.querySelector("[data-bulk-franchise]");
  const collection = document.querySelector("[data-bulk-collection]");
  [[downloaded, "Mark Downloaded"], [franchise, "Set Franchise"], [collection, "Set Collection"]].forEach(([button, label]) => {
    if (!button) return;
    button.disabled = count === 0;
    button.innerHTML = `${button.querySelector("ph-download-simple,ph-clapperboard")?.outerHTML || ""}${label} (${count})`;
  });
}

function renderStats() {
  if (!els.stats) return;
  els.stats.innerHTML = `
    <div><dt>Total Movies:</dt><dd>${movieState.stats.total}</dd></div>
    <div><dt>Downloaded:</dt><dd>${movieState.stats.downloaded}</dd></div>
    <div><dt>Franchises:</dt><dd>${movieState.stats.franchises}</dd></div>
    <div><dt>Collections:</dt><dd>${movieState.stats.collections}</dd></div>
    <div><dt>Missing Data:</dt><dd>${movieState.stats.missingData}</dd></div>
  `;
}

async function refreshMovieTracker(message = "") {
  setStatus(message || "Loading movies...");
  try {
    await fetchLookups();
    await fetchMovieStats();
    await fetchMovies();
    renderLookups();
    renderMovies();
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus(`Could not load movies: ${getReadableError(error)}`, "error");
  }
}

function getMovieById(id) {
  return movieState.movies.find((movie) => movie.id === Number(id)) || null;
}

function renderMovieView(movie) {
  movieState.activeMovie = movie;
  els.viewContent.innerHTML = `
    <div class="movie-dialog-layout">
      <header class="movie-dialog-header">
        <h2 id="movie-view-title">${escapeHtml(movie.title)}</h2>
        <p>${escapeHtml(movie.year_released)}</p>
      </header>
      <aside class="movie-dialog-poster-panel">
        ${posterMarkup(movie, "large")}
      </aside>
      <div class="movie-dialog-scroll">
        <dl class="movie-detail-list">
          <div><dt>Rating</dt><dd>${escapeHtml(movie.rated || "-")}</dd></div>
          <div><dt>Director</dt><dd>${escapeHtml(movie.director || "-")}</dd></div>
          <div><dt>Genre</dt><dd>${escapeHtml(movie.genre || "-")}</dd></div>
          <div><dt>Runtime</dt><dd>${escapeHtml(movie.runtime || "-")}</dd></div>
          <div><dt>Cast</dt><dd>${escapeHtml(movie.actors || "-")}</dd></div>
          <div><dt>Writers</dt><dd>${escapeHtml(movie.writers || "-")}</dd></div>
          <div><dt>Plot</dt><dd>${escapeHtml(movie.plot || "-")}</dd></div>
          <div><dt>Status</dt><dd>${statusBadge(movie)}</dd></div>
        </dl>
      </div>
      <footer class="movie-dialog-footer">
        <button class="secondary-action" type="button" data-edit-current-movie>Edit</button>
        <button class="primary-action" type="button" data-close-modal-target="movie-view-modal">Close</button>
      </footer>
    </div>
  `;
  openModal("movie-view-modal");
}

function renderMovieEdit(movie) {
  movieState.activeMovie = movie;
  els.editForm.innerHTML = `
    <div class="movie-dialog-layout">
      <header class="movie-dialog-header">
        <h2 id="movie-edit-title">Edit Movie</h2>
        <p>Update movie information</p>
      </header>
      <aside class="movie-dialog-poster-panel">
        <div data-edit-poster-preview>${posterMarkup(movie, "large")}</div>
        <input type="file" accept="image/*" data-movie-poster-input hidden>
        <button class="secondary-action movie-wide-action" type="button" data-upload-movie-poster><ph-upload-simple weight="bold"></ph-upload-simple>Upload Poster</button>
      </aside>
      <div class="movie-dialog-scroll">
        <input type="hidden" name="id" value="${movie.id}">
        <div class="movie-form-grid">
        <label class="form-field"><span>Title</span><input name="title" required value="${escapeHtml(movie.title)}"></label>
        <label class="form-field"><span>Year</span><input name="year_released" type="number" required value="${escapeHtml(movie.year_released)}"></label>
        <label class="form-field"><span>Franchise</span><select name="franchise_id">${noneOptionMarkup(movieState.franchises, "No Franchise", movie.franchise_id)}</select></label>
        <label class="form-field"><span>Collection</span><select name="collection_id">${noneOptionMarkup(movieState.collections, "No Collection", movie.collection_id)}</select></label>
        <label class="form-field"><span>Poster URL</span><input name="poster_url" value="${escapeHtml(movie.poster_url || "")}"></label>
        <label class="form-field"><span>Rating</span><input name="rated" value="${escapeHtml(movie.rated || "")}"></label>
        <label class="form-field"><span>Director</span><input name="director" value="${escapeHtml(movie.director || "")}"></label>
        <label class="form-field"><span>Released Date</span><input name="date_released" type="date" value="${escapeHtml(movie.date_released || "")}"></label>
        <label class="form-field"><span>Runtime</span><input name="runtime" value="${escapeHtml(movie.runtime || "")}"></label>
        <label class="form-field"><span>Genre</span><input name="genre" value="${escapeHtml(movie.genre || "")}"></label>
        <label class="form-field"><span>Writers</span><input name="writers" value="${escapeHtml(movie.writers || "")}"></label>
        <label class="form-field"><span>Actors</span><input name="actors" value="${escapeHtml(movie.actors || "")}"></label>
        <label class="form-field movie-span"><span>Plot</span><textarea name="plot">${escapeHtml(movie.plot || "")}</textarea></label>
        <label class="checkbox-field movie-span"><input type="checkbox" name="downloaded" ${movie.downloaded ? "checked" : ""}>Downloaded</label>
        </div>
        <p class="dialog-status" data-edit-movie-status role="status"></p>
      </div>
      <footer class="movie-dialog-footer movie-dialog-footer-split">
        <button class="danger-action" type="button" data-delete-current-movie><ph-trash weight="bold"></ph-trash>Delete Movie</button>
        <span></span>
        <button class="secondary-action" type="button" data-close-modal-target="movie-edit-modal">Cancel</button>
        <button class="primary-action" type="submit">Save Changes</button>
      </footer>
    </div>
  `;
  openModal("movie-edit-modal");
}

async function createMovie(formData) {
  const title = normalizeMovieTitleForSort(formData.get("title"));
  const year = Number(formData.get("year_released"));
  if (!title || !Number.isFinite(year)) throw new Error("Title and year are required.");
  const { error } = await movieSupabase.from("movies").insert({
    user_id: movieState.appUser.id,
    title,
    year_released: year,
    franchise_id: normalizeId(formData.get("franchise_id")),
    downloaded: formData.get("downloaded") === "on",
  });
  if (error) throw error;
}

async function saveMovie(formData) {
  const id = Number(formData.get("id"));
  const payload = {
    title: normalizeMovieTitleForSort(formData.get("title")),
    year_released: Number(formData.get("year_released")),
    franchise_id: normalizeId(formData.get("franchise_id")),
    collection_id: normalizeId(formData.get("collection_id")),
    poster_url: String(formData.get("poster_url") || "").trim() || null,
    rated: String(formData.get("rated") || "").trim() || null,
    director: String(formData.get("director") || "").trim() || null,
    date_released: String(formData.get("date_released") || "").trim() || null,
    runtime: String(formData.get("runtime") || "").trim() || null,
    genre: String(formData.get("genre") || "").trim() || null,
    writers: String(formData.get("writers") || "").trim() || null,
    actors: String(formData.get("actors") || "").trim() || null,
    plot: String(formData.get("plot") || "").trim() || null,
    downloaded: formData.get("downloaded") === "on",
    updated_at: new Date().toISOString(),
  };
  const { error } = await movieSupabase
    .from("movies")
    .update(payload)
    .eq("id", id)
    .eq("user_id", movieState.appUser.id);
  if (error) throw error;
}

async function uploadMoviePoster(file) {
  if (!movieState.activeMovie) {
    throw new Error("Choose a movie before uploading a poster.");
  }
  if (!(file instanceof File)) {
    throw new Error("Choose an image file.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Poster must be an image file.");
  }

  const body = new FormData();
  body.append("objectId", movieImageObjectId(movieState.activeMovie.id));
  body.append("storageModule", "movie-tracker");
  body.append("file", file);

  const response = await getFunctionResponse("upload-object-image", { body });
  if (!response.ok) {
    throw new Error(await parseFunctionError(response, "Could not upload poster."));
  }

  const payload = await response.json();
  const posterUrl = payload?.image?.stored_image_url || payload?.image?.image_url;
  const displayUrl = payload?.image?.image_url || posterUrl;
  if (!posterUrl) {
    throw new Error("Poster upload did not return an iDrive URL.");
  }

  const { error } = await movieSupabase
    .from("movies")
    .update({ poster_url: posterUrl, updated_at: new Date().toISOString() })
    .eq("id", movieState.activeMovie.id)
    .eq("user_id", movieState.appUser.id);
  if (error) throw error;

  movieState.activeMovie = { ...movieState.activeMovie, poster_url: posterUrl };
  movieState.posterDisplayUrls.set(movieState.activeMovie.id, {
    storedUrl: posterUrl,
    displayUrl,
  });
  movieState.movies = movieState.movies.map((movie) => (
    movie.id === movieState.activeMovie.id ? { ...movie, poster_url: posterUrl } : movie
  ));

  const posterInput = els.editForm?.querySelector('[name="poster_url"]');
  if (posterInput) posterInput.value = posterUrl;
  const preview = els.editForm?.querySelector("[data-edit-poster-preview]");
  if (preview) preview.innerHTML = posterMarkup(movieState.activeMovie, "large");
  renderMovies();
  return posterUrl;
}

async function deleteMovie(id) {
  const { error } = await movieSupabase
    .from("movies")
    .delete()
    .eq("id", id)
    .eq("user_id", movieState.appUser.id);
  if (error) throw error;
  movieState.selectedIds.delete(id);
}

function openManager(type) {
  movieState.activeManager = type;
  const isFranchise = type === "franchise";
  const title = isFranchise ? "Manage Franchises" : "Manage Collections";
  const subtitle = `Create, edit, or delete ${isFranchise ? "franchises" : "collections"} to organize your movie collection.`;
  const items = isFranchise ? movieState.franchises : movieState.collections;
  els.managerContent.innerHTML = `
    <h2 id="manager-title">${title}</h2>
    <p class="modal-subtitle">${subtitle}</p>
    <form class="movie-manager-add" data-manager-add-form>
      <input name="name" placeholder="New ${isFranchise ? "franchise" : "collection"} name..." required>
      <button class="primary-action" type="submit"><ph-plus weight="bold"></ph-plus></button>
    </form>
    <div class="movie-manager-list">
      ${items.map((item) => {
        const count = movieState.movies.filter((movie) => isFranchise ? movie.franchise_id === item.id : movie.collection_id === item.id).length;
        return `
          <div class="movie-manager-row" data-manager-id="${item.id}">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span>${count} movies</span>
            </div>
            <button type="button" data-edit-manager="${item.id}">Edit</button>
            <button type="button" data-delete-manager="${item.id}">Delete</button>
          </div>
        `;
      }).join("") || '<p class="movie-muted">No entries yet.</p>'}
    </div>
    <p class="dialog-status" data-manager-status role="status"></p>
    <div class="dialog-actions"><button class="primary-action" type="button" data-close-modal-target="manager-modal">Done</button></div>
  `;
  openModal("manager-modal");
}

async function saveManagerName(type, name, id = null) {
  const table = type === "franchise" ? "franchise" : "collections";
  const payload = { user_id: movieState.appUser.id, name: name.trim(), updated_at: new Date().toISOString() };
  const response = id
    ? await movieSupabase.from(table).update(payload).eq("id", id).eq("user_id", movieState.appUser.id)
    : await movieSupabase.from(table).insert(payload);
  if (response.error) throw response.error;
}

async function deleteManagerRow(type, id) {
  const table = type === "franchise" ? "franchise" : "collections";
  const { error } = await movieSupabase.from(table).delete().eq("id", id).eq("user_id", movieState.appUser.id);
  if (error) throw error;
}

async function ensureLookup(type, name) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  const existing = (type === "franchise" ? movieState.franchises : movieState.collections)
    .find((item) => item.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  await saveManagerName(type, clean);
  await fetchLookups();
  return (type === "franchise" ? movieState.franchises : movieState.collections)
    .find((item) => item.name.toLowerCase() === clean.toLowerCase())?.id || null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = rows.shift()?.map((value) => value.trim().toLowerCase()) || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function normalizeImportKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getImportValue(item, aliases) {
  if (!item || typeof item !== "object") return "";
  const normalizedAliases = new Set(aliases.map(normalizeImportKey));
  for (const [key, value] of Object.entries(item)) {
    if (normalizedAliases.has(normalizeImportKey(key))) {
      return value;
    }
  }
  return "";
}

function parseImportBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "downloaded"].includes(normalized);
}

async function importMovies(file) {
  const text = await file.text();
  const records = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseCsv(text);
  const items = Array.isArray(records) ? records : records.movies;
  if (!Array.isArray(items)) throw new Error("Import file must contain an array of movies.");
  const rows = [];
  for (const item of items) {
    const title = normalizeMovieTitleForSort(getImportValue(item, ["title", "movie title", "name"]));
    const year = Number(getImportValue(item, ["yearReleased", "year released", "year_released", "year", "release year"]));
    if (!title || !Number.isFinite(year)) continue;
    rows.push({
      user_id: movieState.appUser.id,
      title,
      year_released: year,
      downloaded: parseImportBoolean(getImportValue(item, ["downloaded", "already downloaded", "is downloaded"])),
      franchise_id: await ensureLookup("franchise", getImportValue(item, ["franchise", "series"])),
      collection_id: await ensureLookup("collection", getImportValue(item, ["collection", "set"])),
    });
  }
  if (!rows.length) throw new Error("No valid movies were found.");
  const { error } = await movieSupabase.from("movies").insert(rows);
  if (error) throw error;
  return rows.length;
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportMovies() {
  let movies = getSelectedMovies();
  if (movieState.selectedIds.size) {
    const missingSelectedIds = Array.from(movieState.selectedIds)
      .filter((id) => !movies.some((movie) => movie.id === id));
    if (missingSelectedIds.length) {
      const { data, error } = await movieSupabase
        .from("movies")
        .select("*, franchise:franchise_id(id,name), collection:collection_id(id,name)")
        .in("id", missingSelectedIds)
        .eq("user_id", movieState.appUser.id);
      if (error) throw error;
      movies = [...movies, ...(data || [])];
    }
  }
  if (!movieState.selectedIds.size) {
    const { data, error } = await applyMovieSort(applyMovieQueryFilters(movieSupabase
      .from("movies")
      .select("*, franchise:franchise_id(id,name), collection:collection_id(id,name)")));
    if (error) throw error;
    movies = data || [];
  }
  downloadJson(`centralis-movies-${new Date().toISOString().slice(0, 10)}.json`, {
    format: "centralis.movie-export.v1",
    exported_at: new Date().toISOString(),
    movies: movies.map((movie) => ({
      title: movie.title,
      year_released: movie.year_released,
      downloaded: movie.downloaded,
      franchise: movie.franchise?.name || null,
      collection: movie.collection?.name || null,
      rated: movie.rated,
      director: movie.director,
      date_released: movie.date_released,
      runtime: movie.runtime,
      genre: movie.genre,
      writers: movie.writers,
      actors: movie.actors,
      plot: movie.plot,
      poster_url: movie.poster_url,
    })),
  });
}

function missingOmdb(movie) {
  return !movie.director || !movie.plot || !movie.actors || !movie.date_released;
}

function missingMovieDetails(movie) {
  return missingOmdb(movie) || !movie.poster_url;
}

async function invokeFunction(name, body) {
  const { data, error } = await movieSupabase.functions.invoke(name, { body });
  if (error) {
    let message = getReadableError(error);
    let requestUrl = "";
    const response = error.context;
    if (response && typeof response.json === "function") {
      try {
        const details = await response.json();
        if (details?.error) {
          message = details.error;
        }
        if (details?.requestUrl) {
          requestUrl = details.requestUrl;
        }
      } catch {
        // Keep the Supabase client error if the response body cannot be parsed.
      }
    }
    const functionError = new Error(message);
    if (requestUrl) functionError.requestUrl = requestUrl;
    throw functionError;
  }
  if (data?.error) {
    const functionError = new Error(data.error);
    if (data.requestUrl) functionError.requestUrl = data.requestUrl;
    throw functionError;
  }
  return data;
}

async function getFunctionResponse(name, options = {}) {
  const { data: sessionData, error: sessionError } = await movieSupabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw sessionError || new Error("You must be signed in.");
  }

  const config = window.CENTRALIS_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) {
    throw new Error("Supabase configuration is not available.");
  }

  return fetch(`${config.url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: config.publishableKey,
      ...(options.headers || {}),
    },
    body: options.body,
  });
}

async function parseFunctionError(response, fallback) {
  try {
    const payload = await response.json();
    return payload?.error || payload?.message || fallback;
  } catch {
    return fallback;
  }
}

function renderProcessFailures(container, failures) {
  if (!container) return;
  if (!failures.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <details class="movie-process-failure-details">
      <summary>Failure details (${failures.length})</summary>
      <ul>
        ${failures.map((failure) => `
          <li>
            <strong>${escapeHtml(failure.title)}</strong>
            <span>${escapeHtml(failure.source)}: ${escapeHtml(failure.message)}</span>
            ${failure.requestUrl ? `<code>${escapeHtml(failure.requestUrl)}</code>` : ""}
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function getProcessMovieReasons(movie) {
  const reasons = [];
  if (missingOmdb(movie)) reasons.push("OMDb details");
  if (!movie.poster_url) reasons.push("poster");
  return reasons;
}

function renderProcessMovieList(container, movies) {
  if (!container) return;
  const candidates = movies.filter(missingMovieDetails);
  container.innerHTML = `
    <details class="movie-process-movie-details">
      <summary>Movies to process (${candidates.length})</summary>
      ${candidates.length ? `
        <ul>
          ${candidates.map((movie) => `
            <li>
              <strong>${escapeHtml(movie.title)}</strong>
              <span>${escapeHtml(movie.year_released || "")}${movie.year_released ? " · " : ""}${escapeHtml(getProcessMovieReasons(movie).join(" + "))}</span>
            </li>
          `).join("")}
        </ul>
      ` : '<p>No movies on this page currently need missing details.</p>'}
    </details>
  `;
}

function openProcessDialog() {
  const candidates = movieState.movies.filter(missingMovieDetails);
  els.processContent.innerHTML = `
    <h2 id="movie-process-title">Get Missing Details</h2>
    <p class="modal-subtitle">This will fetch missing OMDb details and TMDb posters for movies on the current page.</p>
    <div data-process-movies></div>
    <p class="dialog-status" data-process-status role="status"></p>
    <div data-process-failures hidden></div>
    <div class="dialog-actions" data-process-actions>
      <button class="secondary-action" type="button" data-close-modal-target="movie-process-modal">Cancel</button>
      <button class="primary-action" type="button" data-start-process="missing-details" ${candidates.length ? "" : "disabled"}>Start Processing</button>
    </div>
  `;
  renderProcessMovieList(document.querySelector("[data-process-movies]"), candidates);
  openModal("movie-process-modal");
}

function renderProcessCompleteActions() {
  const actions = document.querySelector("[data-process-actions]");
  if (!actions) return;
  actions.innerHTML = `
    <button class="primary-action" type="button" data-close-modal-target="movie-process-modal">Close</button>
  `;
}

function updateProcessMovieList() {
  renderProcessMovieList(document.querySelector("[data-process-movies]"), movieState.movies);
}

async function processMissingMovieDetails() {
  const status = document.querySelector("[data-process-status]");
  const failuresContainer = document.querySelector("[data-process-failures]");
  const candidates = movieState.movies.filter(missingMovieDetails);
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let omdbFailures = 0;
  let tmdbFailures = 0;
  const failures = [];

  renderProcessFailures(failuresContainer, failures);
  for (const movie of candidates) {
    setDialogStatus(status, `Processing ${movie.title}...`);
    const payload = {};
    const needsOmdb = missingOmdb(movie);
    const needsPoster = !movie.poster_url;

    if (!needsOmdb && !needsPoster) {
      skipped += 1;
      continue;
    }

    if (needsOmdb) {
      try {
        const data = await invokeFunction("lookup-movie-omdb", {
          title: normalizeMovieTitleForLookup(movie.title),
          year: movie.year_released,
        });
        Object.assign(payload, data.movie || {});
      } catch (error) {
        console.warn(`Could not process OMDb details for ${movie.title}`, error);
        omdbFailures += 1;
        failures.push({
          title: movie.title,
          source: "OMDb",
          message: getReadableError(error),
          requestUrl: error.requestUrl || "",
        });
      }
    }

    if (needsPoster) {
      try {
        const data = await invokeFunction("lookup-movie-poster-tmdb", {
          title: normalizeMovieTitleForLookup(movie.title),
          year: movie.year_released,
        });
        payload.poster_url = data.poster_url;
      } catch (error) {
        console.warn(`Could not process TMDb poster for ${movie.title}`, error);
        tmdbFailures += 1;
        failures.push({
          title: movie.title,
          source: "TMDb",
          message: getReadableError(error),
        });
      }
    }

    if (Object.keys(payload).length) {
      try {
        payload.updated_at = new Date().toISOString();
        const { error } = await movieSupabase.from("movies").update(payload).eq("id", movie.id).eq("user_id", movieState.appUser.id);
        if (error) throw error;
        updated += 1;
      } catch (error) {
        console.warn(`Could not save missing details for ${movie.title}`, error);
        failed += 1;
        failures.push({
          title: movie.title,
          source: "Database",
          message: getReadableError(error),
        });
      }
    } else {
      failed += 1;
    }
  }
  await refreshMovieTracker();
  updateProcessMovieList();
  renderProcessFailures(failuresContainer, failures);
  setDialogStatus(
    status,
    `Updated ${updated}, skipped ${skipped}, failed ${failed}. OMDb failures ${omdbFailures}, TMDb failures ${tmdbFailures}.`,
    failures.length ? "error" : "success",
  );
}

function openBulkDialog(kind) {
  const count = movieState.selectedIds.size;
  if (!count) return;
  const label = kind === "franchise" ? "Franchise" : "Collection";
  const options = kind === "franchise"
    ? noneOptionMarkup(movieState.franchises, "No Franchise")
    : noneOptionMarkup(movieState.collections, "No Collection");
  els.bulkForm.innerHTML = `
    <h2 id="movie-bulk-title">Set ${label}</h2>
    <p class="modal-subtitle">Update ${count} selected movies.</p>
    <label class="form-field"><span>${label}</span><select name="lookup_id">${options}</select></label>
    <p class="dialog-status" data-bulk-status role="status"></p>
    <div class="dialog-actions">
      <button class="secondary-action" type="button" data-close-modal-target="movie-bulk-modal">Cancel</button>
      <button class="primary-action" type="submit" data-bulk-kind="${kind}">Save</button>
    </div>
  `;
  openModal("movie-bulk-modal");
}

async function bulkSetDownloaded() {
  const ids = Array.from(movieState.selectedIds);
  if (!ids.length) return;
  const { error } = await movieSupabase
    .from("movies")
    .update({ downloaded: true, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", movieState.appUser.id);
  if (error) throw error;
  movieState.selectedIds.clear();
  await refreshMovieTracker("Marked selected movies as downloaded.");
}

async function initializeMovieTracker() {
  if (!movieSupabase) {
    setStatus("Movie Tracker could not initialize Supabase.", "error");
    return;
  }
  movieState.appUser = await waitForCurrentAppUser();
  if (!movieState.appUser) {
    setStatus("Still waiting for your profile. Refresh the page if this does not clear.", "error");
    return;
  }
  await refreshMovieTracker();
}

document.querySelector("[data-open-add-movie]")?.addEventListener("click", () => {
  setDialogStatus(els.addStatus, "");
  els.addForm?.reset();
  renderLookups();
  openModal("add-movie-modal");
});

document.querySelectorAll("[data-close-modal-target]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.dataset.closeModalTarget));
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop && backdrop.dataset.strictModal === undefined) backdrop.hidden = true;
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal-backdrop").forEach((modal) => {
      if (modal.dataset.strictModal === undefined) {
        modal.hidden = true;
      }
    });
    els.actionsMenu.hidden = true;
  }
});

els.actionsToggle?.addEventListener("click", () => {
  els.actionsMenu.hidden = !els.actionsMenu.hidden;
  els.actionsToggle.setAttribute("aria-expanded", String(!els.actionsMenu.hidden));
});

els.statisticsToggle?.addEventListener("click", () => {
  const statsBody = document.getElementById(els.statisticsToggle.getAttribute("aria-controls"));
  const willExpand = statsBody?.hidden;
  if (statsBody) statsBody.hidden = !willExpand;
  els.statisticsToggle.setAttribute("aria-expanded", String(Boolean(willExpand)));
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".movie-actions-wrap") && els.actionsMenu) {
    els.actionsMenu.hidden = true;
  }
});

els.addForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createMovie(new FormData(els.addForm));
    closeModal("add-movie-modal");
    await refreshMovieTracker("Movie added.");
  } catch (error) {
    setDialogStatus(els.addStatus, getReadableError(error), "error");
  }
});

els.rows?.addEventListener("click", async (event) => {
  const checkbox = event.target.closest("[data-select-movie]");
  if (checkbox) {
    const id = Number(checkbox.dataset.selectMovie);
    checkbox.checked ? movieState.selectedIds.add(id) : movieState.selectedIds.delete(id);
    renderMovies();
    return;
  }
  const row = event.target.closest("[data-movie-id]");
  const movie = row ? getMovieById(row.dataset.movieId) : null;
  if (movie) renderMovieView(movie);
});

els.rows?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target.closest("[data-select-movie]")) return;
  const row = event.target.closest("[data-movie-id]");
  const movie = row ? getMovieById(row.dataset.movieId) : null;
  if (!movie) return;
  event.preventDefault();
  renderMovieView(movie);
});

els.selectAll?.addEventListener("change", () => {
  movieState.movies.forEach((movie) => {
    if (els.selectAll.checked) movieState.selectedIds.add(movie.id);
    else movieState.selectedIds.delete(movie.id);
  });
  renderMovies();
});

[els.search, els.sort, els.statusFilter, els.franchiseFilter, els.collectionFilter].forEach((input) => {
  input?.addEventListener(input === els.search ? "input" : "change", () => {
    movieState.filters.search = els.search?.value || "";
    movieState.filters.sort = els.sort?.value || "title-asc";
    movieState.filters.status = els.statusFilter?.value || "all";
    movieState.filters.franchise = els.franchiseFilter?.value || "all";
    movieState.filters.collection = els.collectionFilter?.value || "all";
    movieState.page = 1;
    refreshMovieTracker();
  });
});

els.pagination.forEach((pagination) => pagination.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page-action], [data-page-number]");
  if (!button || button.disabled) return;
  const totalPages = getMovieTotalPages();
  const pageNumber = Number(button.dataset.pageNumber);

  if (Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
    movieState.page = pageNumber;
  } else if (button.dataset.pageAction === "first") {
    movieState.page = 1;
  } else if (button.dataset.pageAction === "previous") {
    movieState.page = Math.max(1, movieState.page - 1);
  } else if (button.dataset.pageAction === "next") {
    movieState.page = Math.min(totalPages, movieState.page + 1);
  } else if (button.dataset.pageAction === "last") {
    movieState.page = totalPages;
  }

  refreshMovieTracker();
}));

document.querySelector("[data-refresh-movies]")?.addEventListener("click", () => refreshMovieTracker());
document.querySelector("[data-open-franchises]")?.addEventListener("click", () => openManager("franchise"));
document.querySelector("[data-open-collections]")?.addEventListener("click", () => openManager("collection"));
document.querySelector("[data-open-import]")?.addEventListener("click", () => openModal("movie-import-modal"));
document.querySelector("[data-open-missing-details]")?.addEventListener("click", () => openProcessDialog());
document.querySelector("[data-export-movies]")?.addEventListener("click", async () => {
  try {
    await exportMovies();
    setStatus("Movies exported.", "success");
  } catch (error) {
    setStatus(`Could not export movies: ${getReadableError(error)}`, "error");
  }
});
document.querySelector("[data-bulk-downloaded]")?.addEventListener("click", async () => {
  try {
    await bulkSetDownloaded();
  } catch (error) {
    setStatus(`Could not update movies: ${getReadableError(error)}`, "error");
  }
});
document.querySelector("[data-bulk-franchise]")?.addEventListener("click", () => openBulkDialog("franchise"));
document.querySelector("[data-bulk-collection]")?.addEventListener("click", () => openBulkDialog("collection"));

els.viewContent?.addEventListener("click", (event) => {
  if (event.target.closest("[data-edit-current-movie]") && movieState.activeMovie) {
    closeModal("movie-view-modal");
    renderMovieEdit(movieState.activeMovie);
  }
  const closeButton = event.target.closest("[data-close-modal-target]");
  if (closeButton) closeModal(closeButton.dataset.closeModalTarget);
});

els.editForm?.addEventListener("click", async (event) => {
  const uploadButton = event.target.closest("[data-upload-movie-poster]");
  const deleteButton = event.target.closest("[data-delete-current-movie]");
  const closeButton = event.target.closest("[data-close-modal-target]");
  if (closeButton) closeModal(closeButton.dataset.closeModalTarget);
  if (uploadButton) {
    els.editForm.querySelector("[data-movie-poster-input]")?.click();
    return;
  }
  if (!deleteButton || !movieState.activeMovie) return;
  if (!window.confirm(`Delete ${movieState.activeMovie.title}?`)) return;
  try {
    await deleteMovie(movieState.activeMovie.id);
    closeModal("movie-edit-modal");
    await refreshMovieTracker("Movie deleted.");
  } catch (error) {
    setDialogStatus(document.querySelector("[data-edit-movie-status]"), getReadableError(error), "error");
  }
});

els.editForm?.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-movie-poster-input]");
  if (!input) return;
  const file = input.files?.[0] || null;
  if (!file) return;

  const status = document.querySelector("[data-edit-movie-status]");
  const uploadButton = els.editForm.querySelector("[data-upload-movie-poster]");
  try {
    if (uploadButton) uploadButton.disabled = true;
    setDialogStatus(status, "Uploading poster...");
    await uploadMoviePoster(file);
    setDialogStatus(status, "Poster uploaded.", "success");
  } catch (error) {
    setDialogStatus(status, getReadableError(error), "error");
  } finally {
    input.value = "";
    if (uploadButton) uploadButton.disabled = false;
  }
});

els.editForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveMovie(new FormData(els.editForm));
    closeModal("movie-edit-modal");
    await refreshMovieTracker("Movie saved.");
  } catch (error) {
    setDialogStatus(document.querySelector("[data-edit-movie-status]"), getReadableError(error), "error");
  }
});

els.managerContent?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target.closest("[data-manager-add-form]");
  if (!form) return;
  const status = document.querySelector("[data-manager-status]");
  try {
    await saveManagerName(movieState.activeManager, new FormData(form).get("name"));
    await refreshMovieTracker();
    openManager(movieState.activeManager);
  } catch (error) {
    setDialogStatus(status, getReadableError(error), "error");
  }
});

els.managerContent?.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-manager]");
  const del = event.target.closest("[data-delete-manager]");
  const close = event.target.closest("[data-close-modal-target]");
  if (close) closeModal(close.dataset.closeModalTarget);
  if (!edit && !del) return;
  const id = Number((edit || del).dataset.editManager || (edit || del).dataset.deleteManager);
  try {
    if (edit) {
      const current = (movieState.activeManager === "franchise" ? movieState.franchises : movieState.collections).find((item) => item.id === id);
      const name = window.prompt("New name", current?.name || "");
      if (name) await saveManagerName(movieState.activeManager, name, id);
    } else if (window.confirm("Delete this item? Movies using it will stay in your library.")) {
      await deleteManagerRow(movieState.activeManager, id);
    }
    await refreshMovieTracker();
    openManager(movieState.activeManager);
  } catch (error) {
    setDialogStatus(document.querySelector("[data-manager-status]"), getReadableError(error), "error");
  }
});

els.importInput?.addEventListener("change", () => {
  movieState.importFile = els.importInput.files?.[0] || null;
  if (els.importLabel) els.importLabel.textContent = movieState.importFile?.name || "Click to select CSV or JSON file";
  if (els.importSubmit) els.importSubmit.disabled = !movieState.importFile;
});

els.importForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const count = await importMovies(movieState.importFile);
    closeModal("movie-import-modal");
    movieState.importFile = null;
    els.importForm.reset();
    await refreshMovieTracker(`Imported ${count} movies.`);
  } catch (error) {
    setDialogStatus(els.importStatus, getReadableError(error), "error");
  }
});

els.processContent?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-start-process]");
  const close = event.target.closest("[data-close-modal-target]");
  if (close) closeModal(close.dataset.closeModalTarget);
  if (!button) return;
  button.disabled = true;
  try {
    if (button.dataset.startProcess === "missing-details") {
      await processMissingMovieDetails();
      renderProcessCompleteActions();
    }
  } catch (error) {
    setDialogStatus(document.querySelector("[data-process-status]"), getReadableError(error), "error");
    button.disabled = false;
  }
});

els.bulkForm?.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close-modal-target]");
  if (close) closeModal(close.dataset.closeModalTarget);
});

els.bulkForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  const kind = submit?.dataset.bulkKind;
  const column = kind === "franchise" ? "franchise_id" : "collection_id";
  const ids = Array.from(movieState.selectedIds);
  try {
    const { error } = await movieSupabase
      .from("movies")
      .update({ [column]: normalizeId(new FormData(els.bulkForm).get("lookup_id")), updated_at: new Date().toISOString() })
      .in("id", ids)
      .eq("user_id", movieState.appUser.id);
    if (error) throw error;
    closeModal("movie-bulk-modal");
    movieState.selectedIds.clear();
    await refreshMovieTracker("Selected movies updated.");
  } catch (error) {
    setDialogStatus(document.querySelector("[data-bulk-status]"), getReadableError(error), "error");
  }
});

function bootMovieTracker() {
  initializeMovieTracker().catch((error) => {
    console.error("Movie Tracker startup failed:", error);
    setStatus(`Movie Tracker startup failed: ${getReadableError(error)}`, "error");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootMovieTracker, { once: true });
} else {
  bootMovieTracker();
}
