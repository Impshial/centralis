import {
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    await getAuthUser(req);
    const body = await req.json();
    const title = String(body.title || "").trim();
    const year = String(body.year || body.yearReleased || "").trim();
    if (!title) {
      return jsonResponse({ error: "title is required." }, 400);
    }

    const url = new URL("https://api.themoviedb.org/3/search/movie");
    url.searchParams.set("api_key", getEnv("TMDB_API_KEY"));
    url.searchParams.set("query", title);
    if (year) {
      url.searchParams.set("year", year);
    }

    const response = await fetch(url);
    if (!response.ok) {
      return jsonResponse({ error: `TMDB returned ${response.status}.` }, 502);
    }

    const data = await response.json();
    const result = Array.isArray(data.results)
      ? data.results.find((item: { poster_path?: string }) => item.poster_path)
      : null;
    if (!result?.poster_path) {
      return jsonResponse({ error: "TMDB did not return a poster for this movie." }, 404);
    }

    return jsonResponse({
      poster_url: `https://image.tmdb.org/t/p/w500${result.poster_path}`,
      result,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not look up TMDB poster data."), 500);
  }
});
