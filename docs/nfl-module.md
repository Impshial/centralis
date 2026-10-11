# NFL Module

NFL is under Entertainment at `nfl.html`. It shares Centralis authentication,
theme tokens, Phosphor icons, and the shared header. No sports data or imagery is
stored in Supabase. Favorites are owner-scoped; ESPN data is fetched through the
authenticated `nfl-api` Edge Function.

## Enable in Supabase

From the Centralis repository in PowerShell:

```powershell
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy nfl-api --project-ref lztmpbxmntcktijcdcda
```

This workspace is already linked to `lztmpbxmntcktijcdcda`. If the CLI needs
authentication or this checkout has not been linked:

```powershell
npx supabase login
npx supabase link --project-ref lztmpbxmntcktijcdcda
```

Review the dry-run before applying. `db push` applies all outstanding migrations,
not just NFL. The NFL migration is `202610110001_add_nfl.sql`; it creates
`nfl_favorite_teams`, adds `user_settings.nfl_home_widget_visible`, and extends
existing admin count/activity/purge routines without replacing their handlers.
No extra API key or function secret is required. JWT verification stays enabled,
and the function also calls Supabase `getUser()` before accessing ESPN.

**Implementation-time status:** migration and function were not applied remotely.
The local UI is available at `http://127.0.0.1:4187/nfl.html`. Live data and favorite
saves require the steps above. Failure messages distinguish missing deployment,
unavailable provider data, and empty schedules.

## Behavior

- Games uses the week dropdown and previous/next arrows to browse the selected
  calendar week. Only that week is loaded/refreshed. Two-column game cards
  collapse to one column on narrow screens, with independent game and team links.
- Conference standings sort by wins descending, then losses ascending; equal
  records retain provider order. Division grouping and playoff seeds are preserved.
- The NFL workspace fills the available window with scrolling inside the content
  pane, while the shared header, module navigation, and week controls remain visible.
- Routes use `section`, `id`, `season`, `type`, `week`, and `tab` query parameters.
  `from` and `fromTab` preserve the NFL return destination. Browser history works
  without application-wide routing changes.
- ESPN's season catalog and calendar determine available seasons, week IDs,
  transitions and postseason labels. Adjacent weeks never cross season boundaries.
- UTC provider dates render in `America/New_York` with an ET label. Offseason,
  TBD kickoff, overtime, ties, canceled and postponed games are distinct states.
- Current-season games and in-progress game details refresh every 60 seconds.
  Historical views do not poll. Background tabs pause. Homepage favorites use
  only the active calendar week and deduplicate games across selected teams.
  The homepage widget shares the dashboard's bordered, shaded panel styling.
- Active scores cache for 20 seconds, reference data for 15 minutes, and season
  metadata for 24 hours. Requests coalesce, upstream concurrency is limited to
  four, and each upstream request has a 12-second timeout. Refresh bypasses the
  relevant cache; last-known data remains marked stale on failure.
- Every upstream request identifies itself as `Centralis-NFL/1.0`. ESPN's CDN
  rejects Deno's default User-Agent with HTTP 403 even when PowerShell succeeds.
  Native Deno smoke verification is required before deploying adapter changes.
- Bye weeks use only explicit ESPN bye lists. Omitted bye metadata is not
  interpreted as "no byes" or inferred from missing games.
- Season stats filter ESPN's year rows. Career Stats uses the career statistics
  resource and provider totals, never situational splits. Career totals and player
  biographies are current; season-specific stats and schedules use the selector.
- ESPN sometimes supplies no historical roster entries or no player-tagged news.
  Those views say so without hiding the profile. Pro Bowl entries remain separate
  from the playoff bracket. Placeholder teams are not clickable team links.

## Verification

Deterministic adapter and browser-client tests:

```powershell
node --test tests/nfl.test.mjs
```

Live read-only adapter verification, with optional public response fixtures for UI
tests (fixtures are ignored under `node_modules/.cache/nfl`):

```powershell
node scripts/nfl-smoke.mjs --powershell --fixtures
```

The PowerShell option uses the Windows certificate store and forwards the same
headers as the service. It is not a substitute for testing the Edge runtime.
Run the complete adapter suite with native Deno fetch as well:

```powershell
$env:DENO_TLS_CA_STORE = 'system'
npx --yes deno run --no-lock --allow-net=site.api.espn.com,site.web.api.espn.com,sports.core.api.espn.com scripts/nfl-smoke.mjs
```

No credentials are sent to ESPN. This runtime check reads public sports data and
does not change Supabase or deploy a function. To apply the User-Agent fix, only
redeploy `nfl-api`; no additional database migration is needed.

Browser tests require Playwright and an installed Chrome browser. Set
`PLAYWRIGHT_MODULE` to the local Playwright package path when it isn't installed
in this repository, keep the preview server on port 4187, then run:

```powershell
node tests/nfl-browser.cjs
node tests/header-browser.cjs
```

These use isolated mock Supabase users and live-captured public ESPN responses.
They exercise all sections and detail tabs, URL history, save rollback, widget
visibility, refresh/stale states, foreground/background timers, light/dark theme
tokens, and 320/390/760/1024/1440/1920/2560px widths. They do not write user data.
The shared-header suite uses the real menu script without authentication or module
data. It checks touch menus across five pages, clipped-menu hit targets, outside
taps, navigation, mouse hover/click, and keyboard opening/dismissal.

The migration can also be executed in an isolated PGlite PostgreSQL instance:

```powershell
npm install --prefix node_modules/.cache/nfl-tools --no-save @electric-sql/pglite
$env:PGLITE_MODULE = (Resolve-Path 'node_modules/.cache/nfl-tools/node_modules/@electric-sql/pglite').Path
node tests/nfl-database.cjs
```

This verifies real PostgreSQL ownership policies, cross-user denial, duplicate
favorites, deletion, foreign keys, default preference, admin counts/activity,
combined-purge rollback, and delegation to existing admin handlers. It uses
minimal existing-app contracts, not a clone of the remote database. A signed-in
production smoke test remains necessary after deployment.
