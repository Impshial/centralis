# Episode Roulette Entertainment Module Plan

## Summary

Add Episode Roulette as a signed-in Centralis Entertainment page. It will use live TMDB data through a new authenticated Supabase Edge Function, persist only Recent Shows in Supabase, and match the supplied screenshots while using Centralis’s existing vanilla HTML/JS/CSS architecture.

## Key Changes

- Add `episode-roulette.html` and `episode-roulette.js`.
  - New Entertainment module page with Centralis header, hero/search area, selected-show card, season filter chips, episode result card, and right-side Recent Shows navigation.
  - Add the Entertainment menu link in the centralized header markup in `script.js`.
  - Add Episode Roulette styles to `styles.css`, reusing Centralis buttons, dark panels, forms, loading, empty, and error patterns.

- Add search behavior.
  - Require 2+ characters, debounce by 300ms, use an in-memory `Map` cache keyed by normalized query.
  - Show spinner inside the search input while searching.
  - Show a scrollable dropdown below the input with 48×64 thumbnails, title, premiere year, and regular season count.
  - Support mouse selection plus keyboard ArrowUp/ArrowDown/Enter/Escape.
  - Selecting a show only updates module state; it does not write to Supabase.

- Add selected-show and roulette behavior.
  - Fetch current TMDB show details after selection or Recent Show click.
  - Display poster, title, overview, first-air year, and regular season count.
  - Show regular seasons only; exclude season 0/specials.
  - Empty season selection means all regular seasons.
  - Spin by fetching all eligible regular season episodes server-side, flattening the complete pool, then choosing one uniformly.
  - `Get Another Episode` reuses current show and season filters.
  - Prevent duplicate spin requests.
  - After a result renders, wait about 100ms and smooth-scroll `#section-episode-result` into view.

## Data and API Interfaces

- Add migration for `public.recent_shows` because no equivalent table exists.
  - Columns: `id uuid`, `user_id integer references public.users(id)`, `tmdb_id integer`, `show_name text`, `poster_path text`, `last_used_at timestamptz`, `created_at`, `updated_at`.
  - Unique index on `(user_id, tmdb_id)`.
  - RLS policies matching existing Centralis owner-scoping: current auth user can select/insert/update/delete only rows whose `user_id` belongs to their `public.users.clerk_user_id`.

- Add authenticated Edge Function `episode-roulette-tmdb`.
  - Uses existing secret name: `TMDB_API_KEY`.
  - Request body uses an action field:
    - `{ action: "search", query }`
    - `{ action: "details", tmdbId }`
    - `{ action: "randomEpisode", tmdbId, seasonNumbers?: number[] }`
  - Never returns or exposes the API key.
  - Search calls TMDB `/search/tv`, then hydrates displayed results as needed with `/tv/{id}` so season counts are reliable.
  - Details calls `/tv/{id}` and returns show metadata plus regular seasons.
  - Random episode calls `/tv/{id}`, fetches every regular season, continues if individual season requests fail, filters by `seasonNumbers` if provided, and returns one uniformly random episode plus any non-fatal season warnings.
  - Episode mapping includes title, season/episode number, air date, runtime, synopsis, production code, episode type fallback of `Regular Episode`, and show name.

- Persist Recent Shows from the browser after a successful spin.
  - Upsert by `(user_id, tmdb_id)` with show name, relative poster path, and `last_used_at`.
  - A Recent Shows write failure shows a non-blocking warning and does not discard the episode result.
  - Right nav queries newest-first and is scrollable.
  - Clicking a recent show reloads current TMDB details, resets seasons/result, and prepares another spin.

## Test Plan

- Verify navigation: Entertainment → Episode Roulette opens the new page.
- Search:
  - No request under 2 characters.
  - 300ms debounce works.
  - Repeated query uses cache.
  - Spinner, empty state, errors, dropdown scrolling, and keyboard selection work.
- Show selection:
  - Selecting search result clears input/dropdown, resets seasons, clears previous result, and does not write to Supabase.
  - Clicking Recent Shows reloads current TMDB data and resets state.
- Roulette:
  - Season 0/specials excluded.
  - Empty selection includes all regular seasons.
  - Selected seasons narrow the flattened episode pool.
  - Randomization is uniform over episodes, not seasons.
  - Failed season fetches do not fail the whole spin when other episodes are available.
  - Result card scrolls into view after render.
- Recent Shows:
  - Upsert after successful spin.
  - Newest-first right nav.
  - RLS blocks other users’ rows.
- Verification commands:
  - `node --check .\script.js`
  - `node --check .\episode-roulette.js`
  - `git diff --check`
  - No repo test/lint/build scripts exist in `package.json`; report that during implementation.
  - Deploy with `supabase db push` and `supabase functions deploy episode-roulette-tmdb`.

## Assumptions

- Centralis remains vanilla HTML/CSS/JS here; no TanStack Query dependency is added because the repo does not currently use it.
- Only Recent Shows are persisted; shows, seasons, and episodes stay live/in-memory.
- TMDB poster paths are stored as relative paths in `recent_shows`; UI builds image URLs using TMDB’s CDN sizes.
- The screenshots are visual targets, adapted to Centralis styling rather than copied as a separate app.
