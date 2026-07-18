import {
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

type TmdbSeason = {
  season_number?: number;
  name?: string;
  episode_count?: number;
  air_date?: string | null;
  poster_path?: string | null;
};

type TmdbShow = {
  id?: number;
  name?: string;
  overview?: string;
  first_air_date?: string | null;
  poster_path?: string | null;
  number_of_seasons?: number;
  seasons?: TmdbSeason[];
};

function asId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("A valid TMDB show ID is required.");
  return id;
}

async function tmdb(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", getEnv("TMDB_API_KEY"));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB returned ${response.status}.`);
  return response.json();
}

function regularSeasons(show: TmdbShow) {
  return (Array.isArray(show.seasons) ? show.seasons : [])
    .filter((season) => Number(season.season_number) > 0)
    .map((season) => ({
      number: Number(season.season_number),
      name: season.name || `Season ${season.season_number}`,
      episodeCount: Number(season.episode_count || 0),
      airDate: season.air_date || null,
      posterPath: season.poster_path || null,
    }))
    .sort((a, b) => a.number - b.number);
}

function showPayload(show: TmdbShow) {
  return {
    id: Number(show.id),
    name: show.name || "Untitled show",
    overview: show.overview || "No overview is available.",
    firstAirDate: show.first_air_date || null,
    posterPath: show.poster_path || null,
    seasonCount: regularSeasons(show).length,
    seasons: regularSeasons(show),
  };
}

async function loadShow(id: number) {
  return tmdb(`/tv/${id}`) as Promise<TmdbShow>;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await getAuthUser(req);
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "search") {
      const query = String(body.query || "").trim();
      if (query.length < 2) return jsonResponse({ results: [] });
      if (query.length > 200) return jsonResponse({ error: "Search query is too long." }, 400);
      const search = await tmdb("/search/tv", { query });
      const candidates = Array.isArray(search.results) ? search.results.slice(0, 8) : [];
      const detailed = await Promise.allSettled(candidates.map((candidate: TmdbShow) => loadShow(asId(candidate.id))));
      const results = detailed
        .filter((result): result is PromiseFulfilledResult<TmdbShow> => result.status === "fulfilled")
        .map((result) => showPayload(result.value))
        .filter((show) => show.seasonCount > 0);
      return jsonResponse({ results });
    }

    if (action === "details") {
      const show = await loadShow(asId(body.showId));
      return jsonResponse({ show: showPayload(show) });
    }

    if (action === "randomEpisode") {
      const showId = asId(body.showId);
      const show = await loadShow(showId);
      const available = regularSeasons(show);
      const requested = Array.isArray(body.seasonNumbers)
        ? [...new Set(body.seasonNumbers.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0))]
        : [];
      const eligible = requested.length
        ? available.filter((season) => requested.includes(season.number))
        : available;
      if (!eligible.length) return jsonResponse({ error: "No eligible regular seasons were selected." }, 400);

      const fetched = await Promise.allSettled(eligible.map((season) => tmdb(`/tv/${showId}/season/${season.number}`)));
      const warnings: string[] = [];
      const episodes: Array<Record<string, unknown>> = [];
      fetched.forEach((result, index) => {
        if (result.status === "rejected") {
          warnings.push(`Could not load ${eligible[index].name}.`);
          return;
        }
        const seasonEpisodes = Array.isArray(result.value?.episodes) ? result.value.episodes : [];
        seasonEpisodes.forEach((episode: Record<string, unknown>) => {
          if (Number(episode.season_number) > 0) episodes.push(episode);
        });
      });
      if (!episodes.length) return jsonResponse({ error: "No eligible episodes could be loaded.", warnings }, 404);
      const chosen = episodes[Math.floor(Math.random() * episodes.length)];
      const type = String(chosen.episode_type || "standard").replace(/(^|_)([a-z])/g, (_match, prefix, letter) => `${prefix} ${letter.toUpperCase()}`).trim();
      return jsonResponse({
        show: showPayload(show),
        warnings,
        episode: {
          id: Number(chosen.id),
          name: String(chosen.name || "Untitled episode"),
          seasonNumber: Number(chosen.season_number),
          episodeNumber: Number(chosen.episode_number),
          airDate: chosen.air_date || null,
          runtime: chosen.runtime || null,
          overview: String(chosen.overview || "No synopsis is available."),
          productionCode: chosen.production_code || null,
          type: type || "Regular Episode",
          showName: show.name || "Untitled show",
        },
      });
    }

    return jsonResponse({ error: "Unsupported Episode Roulette action." }, 400);
  } catch (error) {
    console.error("Episode Roulette TMDB error", error);
    return jsonResponse(describeError(error, "Could not load TMDB data."), 500);
  }
});
