import {
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

function normalizeDate(value: string | undefined) {
  if (!value || value === "N/A") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeValue(value: unknown) {
  const text = String(value || "").trim();
  return text && text !== "N/A" ? text : null;
}

function createRedactedRequestUrl(url: URL) {
  const redactedUrl = new URL(url.toString());
  redactedUrl.searchParams.set("apikey", "[redacted]");
  return redactedUrl.toString();
}

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

    const url = new URL("https://www.omdbapi.com/");
    url.searchParams.set("apikey", getEnv("OMDB_API_KEY"));
    url.searchParams.set("t", title);
    url.searchParams.set("plot", "full");
    if (year) {
      url.searchParams.set("y", year);
    }
    const requestUrl = createRedactedRequestUrl(url);

    const response = await fetch(url);
    if (!response.ok) {
      return jsonResponse({ error: `OMDB returned ${response.status}.`, requestUrl }, 502);
    }

    const data = await response.json();
    if (data.Response === "False") {
      return jsonResponse({
        error: data.Error || "OMDB did not find this movie.",
        requestUrl,
      }, 404);
    }

    return jsonResponse({
      movie: {
        rated: normalizeValue(data.Rated),
        director: normalizeValue(data.Director),
        genre: normalizeValue(data.Genre),
        runtime: normalizeValue(data.Runtime),
        writers: normalizeValue(data.Writer),
        actors: normalizeValue(data.Actors),
        plot: normalizeValue(data.Plot),
        date_released: normalizeDate(data.Released),
      },
      raw: data,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not look up OMDB movie data."), 500);
  }
});
