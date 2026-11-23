# NFL Module — Complete Technical Reference

> This document describes the NFL module as implemented in this repository: user interface, routing, ESPN calls, server API, persistence, image handling, data flow, and implementation caveats. Source code is authoritative if the application changes later.

## 1. Module Overview

The NFL module is an ESPN-backed football tracker inside the dashboard. It covers weekly scores, league standings, playoff bracket and playoff picture, bye weeks, favorite teams, team schedules and rosters, player profiles, game logs, statistics, and news.

Most NFL data is fetched live from ESPN and is not persisted in the application's database. The only NFL-specific persistent data is the user's list of favorite teams.

### Source file map

| Responsibility | File |
|---|---|
| Module URL parsing, section navigation and rendering | `client/src/App.tsx` |
| Global sidebar module grouping | `client/src/components/left-navigation.tsx` |
| Weekly games/scoreboard | `client/src/pages/nfl-games.tsx` |
| Standings | `client/src/pages/nfl-standings.tsx` |
| Bye weeks | `client/src/pages/nfl-bye-weeks.tsx` |
| Playoff bracket and playoff picture | `client/src/pages/nfl-playoffs.tsx` |
| Favorite-team selection | `client/src/pages/nfl-favorites.tsx` |
| Game detail and box score | `client/src/pages/nfl-game-detail.tsx` |
| Team schedule and roster | `client/src/pages/nfl-team.tsx` |
| Player detail | `client/src/pages/nfl-player.tsx` |
| ESPN proxy routes and favorite-game aggregation | `server/routes.ts` (approximately lines 1217–1716) |
| Favorite-team database methods | `server/storage.ts` (approximately lines 2129–2145) |
| Favorite-team table and types | `shared/schema.ts` (approximately lines 478–493) |
| Homepage NFL favorites card | `client/src/pages/home.tsx` |
| NFL hero image | `attached_assets/generated_images/nfl_stadium_panorama_night_optimized.png` |
| Module overview | `modules-reference.md` |

## 2. URLs, Routing, and Sidebar

`client/src/App.tsx` treats any path beginning with `/nfl` as the NFL module, maps known paths to a `currentSection`, and renders the corresponding page. Unknown NFL paths default to the games page.

| URL | Page |
|---|---|
| `/nfl` | Weekly games |
| `/nfl/standings` | Standings |
| `/nfl/bye-weeks` | Bye weeks |
| `/nfl/playoffs` | Playoff bracket and playoff picture tabs |
| `/nfl/favorites` | Favorite teams |
| `/nfl/game/:gameId` | Game detail |
| `/nfl/team/:teamId` | Team detail |
| `/nfl/player/:playerId` | Player detail |

NFL appears in the main module list and is grouped under Entertainment in the left-navigation component. The NFL module section navigation contains Games, Standings, Playoffs, Bye Weeks, and Favorites. Game/team/player detail pages are reached through links in the views, but can also be opened directly by URL.

Settings define the NFL module (`id: "nfl"`) and the dashboard section (`id: "nfl-games"`). The homepage NFL card can be hidden independently from the module itself. Server defaults seed NFL as visible and the NFL Games dashboard section as visible.

## 3. Page Design and Behavior

### 3.1 Weekly games — `client/src/pages/nfl-games.tsx`

- Panoramic stadium header, 112 px tall, with dark overlay, NFL title and subtitle “Scores, standings, and stats”.
- Scrollable page content with “Weekly Games”, previous/next week controls and a refresh button.
- Regular-season labels show “Week n of 18”; displayed weeks 19–22 label Wild Card, Divisional, Conference, and Super Bowl.
- Responsive two-column game cards show away/home team logo and name, scores if available, status, date, and time.
- Game card click opens game details; logo/name clicks open team detail.
- “Teams on Bye” appears during weeks 1–18 for NFL teams not found among the scoreboard competitors.
- Includes test IDs on game cards, navigation controls and bye-team rows.

The page initially queries the default scoreboard with `currentWeek === null`. Once the response supplies a week, it selects the week, causing a week-specific request. Preseason uses four weeks; regular season allows navigation through 22; postseason ESPN week N is mapped to displayed week 18+N. The route converts a displayed week above 18 back to postseason week numbering.

Example scoreboard fetch:

```ts
const url = currentWeek
  ? `/api/nfl/scoreboard?week=${currentWeek}`
  : "/api/nfl/scoreboard";
const response = await fetch(url);
return response.json();
```

The page maps the first competition's competitors into home/away teams, formats date/time using `America/New_York`, and reads ESPN's team IDs, names, logos and scores. **One exception to the server proxy architecture:** this page fetches the ESPN teams endpoint directly from the browser to calculate bye teams.

### 3.2 Standings — `client/src/pages/nfl-standings.tsx`

- Tabs for AFC and NFC.
- Each conference is split into East, North, South and West division tables.
- Columns: Team, W, L, T, Pct, PF, PA, Diff and Strk.
- Team logo/name links to team details.
- Maps ESPN's stat entries by `name` and reads `displayValue`.
- Division membership is determined on the client with hard-coded substring checks against current team display names; ordering is win percentage, wins, then point differential.

### 3.3 Bye weeks — `client/src/pages/nfl-bye-weeks.tsx`

Displays a card for each week that has one or more teams on bye. Cards form a responsive one-, two-, or three-column layout. Each team logo/name links to its team page. The UI expects `[{ week, teams: [{ id, name, abbreviation, logo }] }]` and filters away weeks with no bye teams.

### 3.4 Playoffs — `client/src/pages/nfl-playoffs.tsx`

Two tabs:

1. **Brackets:** wide, horizontally scrollable bracket, AFC on the left, NFC on the right, Super Bowl center. Renders seed slots, Wild Card, Divisional, Conference Championship and Super Bowl matchups; missing matchups render as TBD placeholders.
2. **Standings:** AFC/NFC cards grouped as In Playoff Position (green), In the Hunt (yellow), and Eliminated (red), with seed, records, clinch badge and team links.

The bracket combines `/api/nfl/playoffs` for matchups with `/api/nfl/playoff-picture` for seeds. The client accommodates varying ESPN championship round names by looking for AFC/NFC-specific rounds, a combined Conference Championship/Conference round, then generic championship rounds. Some bracket headings are static (including Wild Card date captions and Super Bowl “LX”); they are not computed from the selected season.

### 3.5 Favorite teams — `client/src/pages/nfl-favorites.tsx`

- Queries ESPN's team list and the authenticated user's saved favorite list.
- Organizes teams into hard-coded AFC/NFC divisions using abbreviations, then alphabetizes each division.
- Shows each team as a checkbox with logo and a link to team details.
- Checking adds a favorite; unchecking deletes it.
- Success invalidates `/api/nfl/favorite-teams` and shows a toast. Errors also show a destructive toast.

### 3.6 Game details — `client/src/pages/nfl-game-detail.tsx`

- Derives `gameId` from the final path segment and fetches the ESPN summary endpoint through the app server.
- Header card displays the date/status, team names/logos/records, score and optional quarter-by-quarter line score.
- If competitor line scores are missing, it tries the box-score team's `linescores` statistic. Values are normalized from numbers, strings, or ESPN value/displayValue objects.
- Tabs: **Scoring**, **Player Stats**, and **Team Stats**.
- Scoring plays are grouped by period and display team logo, play text, clock/type and score.
- Player statistics are grouped by team and category; player links go to player detail.
- Team statistics merge away/home values by ESPN stat name.
- Pregame states show an explanatory message instead of empty stats.

### 3.7 Team detail — `client/src/pages/nfl-team.tsx`

- Fetches team detail (with roster/schedule enabled), schedule, and the user's favorites.
- Header card uses the team's ESPN color for a top border and shows the preferred/default logo, name, location, overall/home/road record and standing summary.
- Heart button adds or removes the team from favorites.
- **Schedule** tab displays week/date, home/away marker, opponent/logo, result or status; game cards link to game detail.
- **Roster** tab groups players by position in the preferred order QB, RB, WR, TE, OL, DL, LB, CB, S, K, P, LS; unknown positions follow alphabetically. Players are ordered by jersey number and link to player detail.
- Roster cards show ESPN headshots when available, otherwise a jersey-number placeholder.

### 3.8 Player detail — `client/src/pages/nfl-player.tsx`

The page fetches profile, game log, news and splits concurrently. Tabs:

- **Overview:** headshot, name, team logo/link, jersey/position, injury status, height, weight, age, experience, bio/birthplace/date of birth/college, draft, contract, ranks/ratings, and available social/ESPN links.
- **Game Log:** opponent, week, home/away, result and stats. Uses a table if labels are available, otherwise a compact row layout.
- **Season Stats:** nested ESPN stat groups/categories rendered as stat tiles.
- **Career Stats:** season table built from splits data.
- **Splits:** tables for each nonempty split category.
- **News:** article headline, optional image/description/date, linked to the external article in a new tab.

Optional fields are guarded and empty states are rendered when the endpoint returns no data. Player headshots, team logos and news images remain remote URLs returned by ESPN.

### 3.9 Homepage NFL Games - Favorites card — `client/src/pages/home.tsx`

The homepage queries `/api/nfl/favorite-games`. It displays horizontal cards in Live Games, Upcoming and Previous groups, with event name, logos, scores for live/completed games and date/time for upcoming ones. Clicking a card opens the game detail page. If there are no favorites or no matching current-week games, the card says “No favorite teams or no games this week”. The query is invalidated on homepage mount. Settings can hide this section independently from the NFL module.

## 4. ESPN API and Internal Server Endpoints

The server calls ESPN's public JSON endpoints with `fetch`; there is no ESPN API key or separate NFL service module in these routes. Most sports-data endpoints are not protected by `requireAuthMiddleware`. Favorite-team and favorite-game endpoints are authenticated.

| Internal endpoint | ESPN source / behavior | Response/caller |
|---|---|---|
| `GET /api/nfl/scoreboard?week=&season=&seasonType=` | ESPN site v2 scoreboard | Raw JSON; weekly games. Week >18 is converted to postseason type/week. |
| `GET /api/nfl/standings` | ESPN v2 standings with `season=2025` hard-coded | Raw JSON; standings page. |
| `GET /api/nfl/bye-weeks?season=` | For each week 1–18, scoreboard plus teams list | Simplified week/team objects; bye-weeks page. |
| `GET /api/nfl/playoff-picture` | ESPN v2 standings plus default scoreboard | Transformed `{ week, conferences: [...] }`; playoff-picture tab. |
| `GET /api/nfl/playoffs?season=` | Scoreboard with `seasontype=3`, weeks 1–5, limit 100 | Transformed `{ season, rounds }`; bracket tab. |
| `GET /api/nfl/game/:gameId` | ESPN game summary | Raw JSON; game detail. |
| `GET /api/nfl/teams` | ESPN NFL teams endpoint | Raw JSON; favorites page. |
| `GET /api/nfl/team/:teamId` | ESPN team endpoint with `enable=roster,schedule` | Raw JSON; team profile/roster. |
| `GET /api/nfl/team/:teamId/schedule` | ESPN team schedule endpoint | Raw JSON; team schedule. |
| `GET /api/nfl/player/:playerId` | ESPN common v3 athlete endpoint | Raw JSON; player profile and season stats. |
| `GET /api/nfl/player/:playerId/gamelog` | ESPN web common v3 athlete gamelog | Raw JSON; player game log. |
| `GET /api/nfl/player/:playerId/news` | ESPN NFL news endpoint filtered by player | Raw JSON; player news. |
| `GET /api/nfl/player/:playerId/splits` | ESPN web common v3 athlete splits | Raw JSON; player splits/career stats. |
| `GET /api/nfl/favorite-teams` | No upstream request; DB lookup | Authenticated list of current user's favorites. |
| `POST /api/nfl/favorite-teams` | No upstream request; DB insert | Authenticated create; duplicate returns 409. |
| `DELETE /api/nfl/favorite-teams/:teamId` | No upstream request; DB delete | Authenticated removal; missing row returns 404. |
| `GET /api/nfl/favorite-games` | ESPN default scoreboard filtered by stored favorite IDs | Authenticated status groups and current week; homepage card. |

### Exact upstream URLs currently used

```text
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
https://site.api.espn.com/apis/v2/sports/football/nfl/standings
https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams
https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}?enable=roster,schedule
https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}/schedule
https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={gameId}
https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{playerId}
https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{playerId}/gamelog
https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?player={playerId}
https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{playerId}/splits
```

### Representative server proxy code

```ts
app.get("/api/nfl/game/:gameId", async (req, res) => {
  try {
    const gameId = req.params.gameId;
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching game details:", error);
    res.status(500).json({ error: "Failed to fetch game details" });
  }
});
```

Most straightforward proxy handlers do not check upstream `response.ok` before parsing JSON and do not validate ESPN response shapes. Fetch/JSON errors are caught and become a route-specific 500; an ESPN error JSON may otherwise be forwarded as ordinary JSON.

### Scoreboard week and season behavior

The route reads integer `week`, defaulting to 0; `season`, defaulting to `2024`; and integer `seasonType`, defaulting to 2. When `week > 18`, it sets `seasonType = 3` and changes week to `week - 18`. For a positive week it appends `seasontype` and `week` to the ESPN URL. The current route assigns `season` but does not forward it. If week is omitted/0, it does not append the supplied season type either.

### Bye-week behavior and request count

The endpoint loops through weeks 1–18. For each week it fetches the regular season scoreboard, fetches all NFL teams again, collects competitor IDs, and marks teams not playing as on bye. This is 36 sequential ESPN requests per handler call (18 scoreboard + 18 repeat team-list calls). The `season` query parameter is assigned but not used in the upstream URLs.

### Playoff-picture transformation

The route converts ESPN standings stat arrays to keyed values; maps clincher codes `z/y/x/e` to Clinched #1 / Clinched Division / Clinched Playoff / Eliminated; sorts by playoff seed; marks seeds 5–7 as wild cards; and computes games behind seed 7 as `((seed7Wins - wins) + (losses - seed7Losses)) / 2`. Non-eliminated teams beyond seed 7 at most 3 games back are `isInHunt`. A default scoreboard request supplies the displayed week text.

### Playoff-game transformation

The server sequentially requests playoff weeks 1–5, extracts home/away teams, normalizes round labels from ESPN's varying metadata, formats dates and times in New York time, groups games by round and sorts them chronologically. Failure of one week is logged but does not stop later-week requests. The query `season` value (default `2024`) is included in the response but not passed to ESPN.

### Favorite-games aggregation

If a user has no saved teams, the route returns empty arrays without calling ESPN:

```json
{"previousGames":[],"ongoingGames":[],"upcomingGames":[],"favoriteGames":[]}
```

Otherwise it fetches ESPN's default scoreboard, filters its current-week events to those involving a favorite team ID, and deduplicates by event ID. Competitor status `post` becomes `previousGames`, `in` becomes `ongoingGames`, and `pre` becomes `upcomingGames`. Response shape is `{ previousGames, ongoingGames, upcomingGames, favoriteGames, currentWeek }`, where `favoriteGames` combines live and upcoming events and excludes completed games. It is not a season-wide schedule lookup.

## 5. Client Query Defaults

Shared query behavior is defined in `client/src/lib/queryClient.ts`:

- Default query function fetches the URL obtained from `queryKey.join("/")`, includes credentials, throws on non-OK app responses and parses JSON.
- Query retries are disabled.
- Focus refetch is disabled, interval refetch is false, and `staleTime` is `Infinity`.
- Mutations also have retry disabled.

Most NFL pages relying on the default query function therefore cache data indefinitely until invalidated or manually refetched. The weekly games page has an explicit refresh button. Favorite mutations invalidate their favorites query. The browser call for the game-page teams list is direct to ESPN, not the local query endpoint.

## 6. Database Design and Persistence

### The only NFL-specific table: `favorite_teams`

Defined in `shared/schema.ts`:

```ts
export const favoriteTeams = pgTable("favorite_teams", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),                 // nullable in schema
  teamId: varchar("team_id").notNull(),       // ESPN ID stored as string
  teamName: text("team_name").notNull(),
  teamLogo: text("team_logo").notNull(),      // URL string, not image bytes
  createdAt: varchar("created_at").notNull().default(sql`NOW()`),
});

export const insertFavoriteTeamSchema = createInsertSchema(favoriteTeams).omit({
  id: true,
  createdAt: true,
});

export type InsertFavoriteTeam = z.infer<typeof insertFavoriteTeamSchema>;
export type FavoriteTeam = typeof favoriteTeams.$inferSelect;
```

There is no separate NFL table for games, standings, teams, rosters, player stats, schedules, news or images. There is no declared user foreign key or NFL team foreign key in this table. No composite unique constraint on `(user_id, team_id)` is declared; duplicate checking is in route code. `userId` is nullable in the schema even though authenticated API routes supply an effective user ID.

### Drizzle storage operations (`server/storage.ts`)

```ts
async getAllFavoriteTeams(userId: string): Promise<FavoriteTeam[]> {
  return await db.select().from(favoriteTeams)
    .where(eq(favoriteTeams.userId, userId))
    .orderBy(favoriteTeams.teamName);
}

async getFavoriteTeam(userId: string, teamId: string): Promise<FavoriteTeam | undefined> {
  const results = await db.select().from(favoriteTeams)
    .where(and(eq(favoriteTeams.userId, userId), eq(favoriteTeams.teamId, teamId)))
    .limit(1);
  return results[0];
}

async addFavoriteTeam(team: InsertFavoriteTeam): Promise<FavoriteTeam> {
  const results = await db.insert(favoriteTeams).values(team).returning();
  return results[0];
}

async removeFavoriteTeam(userId: string, teamId: string): Promise<boolean> {
  const results = await db.delete(favoriteTeams)
    .where(and(eq(favoriteTeams.userId, userId), eq(favoriteTeams.teamId, teamId)))
    .returning();
  return results.length > 0;
}
```

The in-memory `MemStorage` versions throw “Favorite Teams methods not implemented in MemStorage”; this feature needs the database-backed storage implementation.

### Add favorite API example

```ts
app.post("/api/nfl/favorite-teams", requireAuthMiddleware, async (req: any, res) => {
  const { teamId, teamName, teamLogo } = req.body;
  const existingFavorite = await storage.getFavoriteTeam(req.effectiveUserId, teamId);
  if (existingFavorite) return res.status(409).json({ error: "Team already in favorites" });

  const favorite = await storage.addFavoriteTeam({
    userId: req.effectiveUserId,
    teamId,
    teamName,
    teamLogo,
  });
  res.status(201).json(favorite);
});
```

The frontend request is `{ teamId, teamName, teamLogo }`. The current user ID is derived server-side from authenticated request state. GET is scoped to the current user; DELETE matches both current user and ESPN team ID. The add route returns 201, duplicate returns 409; delete returns 404 if no matching row, otherwise a success message.

## 7. Images and Download Behavior

### Local hero image

- The games page imports `@assets/generated_images/nfl_stadium_panorama_night_optimized.png` and uses it as a CSS background with `cover`/center positioning.
- That optimized PNG is 1408×350 and approximately 399 KB.
- Sibling `nfl_stadium_panorama_night.png` is 1408×768 and approximately 1.8 MB; the page imports the optimized version.
- It is already a repository asset. NFL page code does not generate, download, upload, resize or proxy this image. Original provenance is not specified by the page implementation.

### ESPN remote imagery

- Team marks: ESPN team `logo`, `logos[0].href`, or event team logo fields.
- AFC/NFC bracket marks: fixed ESPN CDN URLs under `https://a.espncdn.com/i/teamlogos/nfl/500/`.
- Player headshots: `athlete.headshot.href` or `player.headshot.href`.
- News images: `article.images[0].url`.

The app inserts these URLs directly in `<img src>`. Favorites store the URL text in `favorite_teams.team_logo`, not image bytes. No NFL-specific download-to-disk/App Storage feature or image caching endpoint exists. Broken image handling is partial: roster/player views have fallbacks, but many logo usages do not.

## 8. End-to-End Request Flows

### Game browsing

`/nfl` → query local scoreboard endpoint → map ESPN event competitions and competitors → click event → `/nfl/game/:gameId` → summary proxy → show scoring, player and team stats.

### Add favorite team

`/nfl/favorites` → read ESPN teams plus current user's saved favorites → checkbox → POST `{teamId, teamName, teamLogo}` → authenticated route checks duplicate → insert favorite row → invalidate favorite query.

### Homepage favorites card

Homepage query → authenticated favorite-games route → fetch favorites from DB → request ESPN default scoreboard → filter games by team IDs → group by game state → render live/upcoming/previous cards → click to game detail.

### Player profile

Team roster or game player link → `/nfl/player/:playerId` → profile, gamelog, news and splits requests → render tabs and remote image URLs.

## 9. Known Implementation Caveats

1. **Season parameters are inconsistent.** Scoreboard assigns but does not forward `season`; standings hard-codes 2025; bye-weeks and playoffs accept/assign season but do not pass it to ESPN. Displayed/requested season can therefore diverge from ESPN's current-default season.
2. **Bye weeks make 36 sequential ESPN requests** because the teams list is re-fetched inside every weekly loop.
3. **Query cache is effectively indefinite** until invalidated/refetched (infinite stale time, no focus or interval refetch).
4. **No centralized ESPN client:** proxy logic is inline in `server/routes.ts`, and `nfl-games.tsx` makes a direct browser-to-ESPN request for teams.
5. **Upstream status/data validation is limited:** proxy handlers generally don't check `response.ok` or validate ESPN response schemas.
6. **Favorite uniqueness is application-only:** no composite DB constraint protects against concurrent duplicate POST requests. The POST also destructures the body directly instead of parsing it with the insert schema.
7. **Favorite user ID is nullable** in the table definition although normal authenticated writes supply it.
8. **Several NFL assumptions are hard-coded:** standings/favorite division groups and playoff bracket captions/season label.
9. **Favorite games cover the scoreboard's current week only**, not a complete season schedule.
10. **Only favorite selections persist.** ESPN availability is required for current sports data; there is no local historical snapshot in this feature.

## 10. Page-to-API Quick Reference

| View | Calls |
|---|---|
| Games | `GET /api/nfl/scoreboard`; direct ESPN teams list for bye calculation |
| Standings | `GET /api/nfl/standings` |
| Bye Weeks | `GET /api/nfl/bye-weeks` |
| Playoffs | `GET /api/nfl/playoffs`, `GET /api/nfl/playoff-picture` |
| Favorites | `GET /api/nfl/teams`, `GET /api/nfl/favorite-teams`, `POST/DELETE /api/nfl/favorite-teams` |
| Game detail | `GET /api/nfl/game/:gameId` |
| Team detail | `GET /api/nfl/team/:teamId`, `/schedule`, favorite-teams GET/POST/DELETE |
| Player detail | `GET /api/nfl/player/:playerId`, `/gamelog`, `/news`, `/splits` |
| Homepage card | `GET /api/nfl/favorite-games` |

## 11. Extension Notes

- Keep ESPN IDs as strings at API and persistence boundaries.
- A season selector should forward season and season type from UI to the local route and every upstream ESPN request; don't rely on the page label alone.
- To remove the direct browser ESPN call, have `nfl-games.tsx` use `/api/nfl/teams`.
- If strict duplicate prevention matters, add a database uniqueness rule on user/team and handle the conflict atomically.
- If adding image downloads, create an explicit authorized download/storage flow; current ESPN logos/headshots are URL references only, and licensing/attribution and refresh behavior need consideration.
- New persistent NFL data should define ownership and retention; games and player data are currently fetched, not stored.
