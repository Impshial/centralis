const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const COMMON = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const DAY = 86400000, REFERENCE = 900000, SCORE = 20000;
// ESPN rejects Deno's default User-Agent; identify this application explicitly.
export const ESPN_HEADERS = Object.freeze({ Accept: 'application/json', 'User-Agent': 'Centralis-NFL/1.0' });
export class NflUpstreamError extends Error {
  constructor(message, resource) {
    super(message);
    this.name = 'NflUpstreamError';
    this.resource = resource;
  }
}
export const list = value => Array.isArray(value) ? value : [];
export const value = v => v == null ? '' : typeof v === 'object' ? String(v.displayValue ?? v.value ?? '') : String(v);
export const utc = v => v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
export function safeUrl(v) {
  try { const u = new URL(v); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
export function team(t = {}) {
  return { id: String(t.id || ''), name: t.displayName || t.name || 'Team TBD', shortName: t.shortDisplayName || t.name || 'TBD',
    abbreviation: t.abbreviation || 'TBD', logo: safeUrl(t.logo || t.logos?.[0]?.href), color: /^[a-f\d]{6}$/i.test(t.color) ? t.color : '',
    divisionId: String(t.groups?.id || ''), conferenceId: String(t.groups?.parent?.id || '') };
}
export function athlete(a = {}) {
  const links = [...list(a.links), ...list(a.socialLinks)].map(l => ({ label: l.text || l.shortText || l.type || 'Profile', url: safeUrl(l.href || l.url) })).filter(l => l.url);
  return { id: String(a.id || ''), name: a.displayName || a.fullName || 'Player', image: safeUrl(a.headshot?.href),
    position: a.position?.abbreviation || '', jersey: value(a.jersey), height: a.displayHeight || '', weight: a.displayWeight || '',
    age: value(a.age), college: a.college?.name || a.college?.shortName || '', experience: value(a.experience?.years),
    birthDate: a.displayDOB || utc(a.dateOfBirth), birthPlace: a.displayBirthPlace || [a.birthPlace?.city, a.birthPlace?.state, a.birthPlace?.country].filter(Boolean).join(', '),
    bio: typeof a.bio === 'string' ? a.bio : '', contract: a.contract?.summary || a.contract?.displayValue || '',
    links: [...new Map(links.map(l => [l.url, l])).values()], ranks: list(a.ranks || a.ratings).map(r => ({ label: r.displayName || r.name || 'Rating', value: value(r) })).filter(r => r.value),
    status: a.status?.name || '', team: a.team?.id ? team(a.team) : null,
    draft: a.displayDraft || '', injuries: list(a.injuries).map(i => ({ status: i.status || '', detail: i.details?.detail || i.longComment || '' })) };
}
export function game(e) {
  const c = e.competitions?.[0] || {}, s = c.status || e.status || {}, type = s.type || {};
  const competitors = list(c.competitors).map(c => ({ ...team(c.team), side: c.homeAway, score: value(c.score), winner: c.winner === true,
    record: list(c.records || c.record).find(r => r.type === 'total')?.summary || list(c.records || c.record).find(r => r.type === 'total')?.displayValue || '',
    periods: list(c.linescores).map((p, i) => ({ period: Number(p.period || i + 1), score: value(p) })) })).sort((a, b) => (a.side === 'away' ? -1 : 1) - (b.side === 'away' ? -1 : 1));
  return { id: String(e.id || c.id || ''), name: e.name || competitors.map(t => t.name).join(' at '), date: utc(e.date || c.date),
    season: Number(e.season?.year) || null, seasonType: Number(e.seasonType?.type || e.season?.type) || null, week: Number(e.week?.number) || null,
    state: type.state || 'pre', status: type.shortDetail || type.detail || type.description || 'Scheduled', statusName: type.name || '',
    completed: type.completed === true, period: Number(s.period || 0), clock: s.displayClock || '',
    timeTbd: c.timeValid === false || e.timeValid === false || s.isTBDFlex === true || type.name === 'STATUS_SCHEDULED_TBD',
    broadcast: [...new Set(list(c.broadcasts).flatMap(b => b.names || [b.media?.shortName]).filter(Boolean))].join(', '),
    venue: c.venue?.fullName || '', competitors };
}
export function calendar(raw) {
  const l = raw.leagues?.[0];
  if (!l?.season?.year || !Array.isArray(l.calendar)) throw new Error('ESPN season calendar is unavailable.');
  const periods = l.calendar.map(p => ({ type: Number(p.value), label: p.label, start: utc(p.startDate), end: utc(p.endDate),
    weeks: list(p.entries).map(w => ({ type: Number(p.value), week: Number(w.value), label: w.label, detail: w.detail || '', start: utc(w.startDate), end: utc(w.endDate) })) }));
  return { year: Number(l.season.year), logo: safeUrl(l.logos?.[0]?.href), periods, weeks: periods.flatMap(p => p.weeks) };
}
export function scoreboard(raw, expected) {
  if (!Array.isArray(raw.events)) throw new Error('ESPN returned an incomplete scoreboard.');
  if (expected && (Number(raw.season?.year) !== expected.season || Number(raw.season?.type) !== expected.type || Number(raw.week?.number) !== expected.week)) {
    throw new Error('ESPN did not return the requested season and week.');
  }
  const games = raw.events.map(game);
  if (games.some(g => !g.id || g.competitors.length !== 2 || g.competitors.some(t => !t.id))) throw new Error('ESPN returned incomplete game data.');
  return { games, byes: Array.isArray(raw.week?.teamsOnBye) ? raw.week.teamsOnBye.map(team) : null };
}
export function standings(raw) {
  if (!Array.isArray(raw.children)) throw new Error('ESPN standings are unavailable.');
  const entry = e => ({ ...team(e.team), stats: Object.fromEntries(list(e.stats).map(s => [s.name, value(s)])),
    clinch: list(e.stats).find(s => s.name === 'clincher')?.description || '',
    seed: Number(list(e.stats).find(s => s.name === 'playoffSeed')?.value) || null });
  return raw.children.map(c => ({ id: String(c.id), name: c.name, abbreviation: c.abbreviation,
    divisions: list(c.children).map(d => ({ id: String(d.id), name: d.name, teams: list(d.standings?.entries).map(entry) })),
    teams: list(c.standings?.entries).map(entry) }));
}
export function playerTables(raw, tab, season) {
  if (tab === 'gamelog') {
    if (!Array.isArray(raw.seasonTypes)) throw new Error('Game log is unavailable.');
    return raw.seasonTypes.flatMap(s => list(s.categories).filter(c => c.type === 'event').map(c => ({ name: c.displayName || s.displayName,
      labels: ['Game', ...list(raw.labels)], titles: ['Game', ...list(raw.displayNames)],
      rows: list(c.events).map(e => { const g = raw.events?.[e.eventId] || {}; return { gameId: String(e.eventId),
        cells: [g.gameDate ? `${g.gameDate.slice(0, 10)} ${g.atVs || ''} ${g.opponent?.abbreviation || ''}` : String(e.eventId), ...list(e.stats).map(value)] }; }) })));
  }
  if (tab === 'splits') {
    if (!Array.isArray(raw.splitCategories)) throw new Error('Splits are unavailable.');
    return raw.splitCategories.map(c => ({ name: c.displayName, labels: ['Split', ...list(raw.labels)], titles: ['Split', ...list(raw.displayNames)],
      rows: list(c.splits).map(s => ({ cells: [s.displayName, ...list(s.stats).map(value)] })) }));
  }
  if (!Array.isArray(raw.categories)) throw new Error('Statistics are unavailable.');
  return raw.categories.map(c => ({ name: c.displayName, labels: ['Season', 'Team', ...list(c.labels)], titles: ['Season', 'Team', ...list(c.displayNames)],
    rows: list(c.statistics).filter(s => tab === 'career' || Number(s.season?.year) === season).map(s => ({ teamId: s.teamId ? String(s.teamId) : '',
      cells: [value(s.season?.displayName || s.season?.year), raw.teams?.[s.teamSlug]?.abbreviation || s.teamSlug || '', ...list(s.stats).map(value)] })),
    totals: tab === 'career' && Array.isArray(c.totals) ? ['Career', '', ...c.totals.map(value)] : null }));
}
export function validate(input) {
  const actions = ['bootstrap', 'calendar', 'scoreboard', 'standings', 'teams', 'byes', 'playoffs', 'game', 'team', 'schedule', 'roster', 'player', 'playerTab'];
  if (!input || !actions.includes(input.action)) throw new TypeError('Unknown NFL resource.');
  const b = { action: input.action, refresh: input.refresh === true };
  if (!['bootstrap', 'game', 'player'].includes(b.action)) {
    if (!/^\d{4}$/.test(String(input.season))) throw new TypeError('A valid season is required.');
    b.season = Number(input.season);
  }
  if (['scoreboard', 'schedule', 'playerTab'].includes(b.action)) {
    if (!/^[1-4]$/.test(String(input.type))) throw new TypeError('A valid season type is required.');
    b.type = Number(input.type);
  }
  if (b.action === 'scoreboard') {
    if (!/^\d{1,2}$/.test(String(input.week)) || Number(input.week) < 1) throw new TypeError('A valid week is required.');
    b.week = Number(input.week);
  }
  if (['game', 'team', 'schedule', 'roster', 'player', 'playerTab'].includes(b.action)) {
    if (!/^[1-9]\d{0,11}$/.test(String(input.id))) throw new TypeError('A valid ESPN ID is required.');
    b.id = String(input.id);
  }
  if (b.action === 'playerTab') {
    if (!['gamelog', 'season', 'career', 'splits', 'news'].includes(input.tab)) throw new TypeError('Unknown player tab.');
    b.tab = input.tab;
  }
  return b;
}

export function createNflService({ fetcher = fetch, now = Date.now, timeout = 12000 } = {}) {
  const cache = new Map(), pending = new Map(), queue = [];
  let active = 0;
  async function limited(work) {
    if (active >= 4) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { return await work(); } finally { const next = queue.shift(); if (next) next(); else active--; }
  }
  async function get(url, ttl, refresh = false) {
    const key = String(url), old = cache.get(key);
    if (!refresh && old && now() - old.at < ttl) return old.data;
    if (pending.has(key)) return pending.get(key);
    const task = limited(async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
      try {
        const r = await fetcher(key, { signal: controller.signal, headers: { ...ESPN_HEADERS }, redirect: 'error' });
        if (!r.ok) throw new NflUpstreamError(`ESPN rejected the NFL data request (HTTP ${r.status}). Please try Refresh.`, key);
        const data = await r.json();
        if (!data || data.error || data.errorMessage) throw new NflUpstreamError('ESPN returned an unavailable NFL resource. Please try Refresh.', key);
        cache.delete(key); cache.set(key, { data, at: now() });
        while (cache.size > 200) cache.delete(cache.keys().next().value);
        return data;
      } catch (error) {
        if (error instanceof NflUpstreamError) throw error;
        throw new NflUpstreamError(controller.signal.aborted
          ? 'The ESPN NFL request timed out. Please try Refresh.'
          : 'The ESPN NFL response could not be loaded. Please try Refresh.', key);
      } finally { clearTimeout(timer); }
    });
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  function url(base, params = {}) { const u = new URL(base); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v)); return u; }
  async function seasons(refresh) {
    const raw = await get(url(`${CORE}/seasons`, { limit: 1000 }), DAY, refresh);
    const years = list(raw.items).map(i => Number(i.$ref?.match(/\/seasons\/(\d{4})(?:\?|$)/)?.[1])).filter(Boolean);
    if (!years.length || raw.pageCount > 1) throw new Error('The complete ESPN season catalog is unavailable.');
    return [...new Set(years)].sort((a, b) => b - a);
  }
  async function cal(season, refresh) {
    const c = calendar(await get(url(`${SITE}/scoreboard`, { dates: season, limit: 1 }), DAY, refresh));
    if (c.year !== season) throw new Error('The requested season calendar is unavailable.');
    return c;
  }
  async function board(b, refresh, ttl = SCORE) {
    return scoreboard(await get(url(`${SITE}/scoreboard`, { dates: b.season, seasontype: b.type, week: b.week, limit: 100 }), ttl, refresh), b);
  }
  async function ranks(season, refresh) {
    const raw = await get(url('https://site.api.espn.com/apis/v2/sports/football/nfl/standings', { season, type: 0, level: 3 }), REFERENCE, refresh);
    if (raw.season && Number(raw.season.year || raw.season) !== season) throw new Error('Historical standings are unavailable.');
    return standings(raw);
  }
  async function run(input) {
    const b = validate(input), refresh = b.refresh;
    if (b.season && !(await seasons(false)).includes(b.season)) throw new TypeError('Season is not in ESPN\'s catalog.');
    let data;
    switch (b.action) {
      case 'bootstrap': {
        const [years, raw] = await Promise.all([seasons(refresh), get(`${SITE}/scoreboard`, SCORE, refresh)]);
        data = { seasons: years, calendar: calendar(raw) }; break;
      }
      case 'calendar': data = await cal(b.season, refresh); break;
      case 'scoreboard': {
        const c = await cal(b.season, false);
        if (!c.weeks.some(w => w.type === b.type && w.week === b.week)) throw new TypeError('Week is not in this season\'s calendar.');
        data = await board(b, refresh); break;
      }
      case 'standings': data = { conferences: await ranks(b.season, refresh) }; break;
      case 'teams': {
        const [raw, groups] = await Promise.all([get(url(`${SITE}/teams`, { season: b.season, limit: 100 }), REFERENCE, refresh), ranks(b.season, refresh).catch(() => [])]);
        const teams = list(raw.sports?.[0]?.leagues?.[0]?.teams).map(t => team(t.team));
        if (!teams.length) throw new Error('Teams are unavailable.');
        data = { teams, conferences: groups }; break;
      }
      case 'byes': case 'playoffs': {
        const c = await cal(b.season, refresh);
        const weeks = c.weeks.filter(w => w.type === (b.action === 'byes' ? 2 : 3));
        data = { weeks: await Promise.all(weeks.map(async w => {
          try {
            const data = await board({ season: b.season, ...w }, refresh, b.action === 'byes' ? REFERENCE : SCORE);
            return { ...w, ...(b.action === 'byes' ? { byes: data.byes } : data), available: true };
          }
          catch { return { ...w, games: [], byes: null, available: false }; }
        })) }; break;
      }
      case 'team': {
        const [raw, groups] = await Promise.all([get(url(`${SITE}/teams/${b.id}`, { season: b.season }), REFERENCE, refresh), ranks(b.season, refresh).catch(() => [])]);
        if (!raw.team?.id) throw new Error('Team is unavailable.');
        const standing = groups.flatMap(c => c.divisions.flatMap(d => d.teams.map(t => ({ ...t, division: d.name })))).find(t => t.id === b.id);
        data = { ...team(raw.team), standing: standing || null }; break;
      }
      case 'schedule': {
        const raw = await get(url(`${SITE}/teams/${b.id}/schedule`, { season: b.season, seasontype: b.type }), SCORE, refresh);
        if (!Array.isArray(raw.events)) throw new Error('Schedule unavailable.');
        const games = raw.events.map(game);
        if (games.some(g => g.season !== b.season)) throw new Error('Historical schedule unavailable.');
        data = { games }; break;
      }
      case 'roster': {
        const raw = await get(url(`${SITE}/teams/${b.id}/roster`, { season: b.season }), REFERENCE, refresh);
        if (!Array.isArray(raw.athletes) || (raw.season?.year && Number(raw.season.year) !== b.season)) throw new Error('Roster for this season is unavailable.');
        data = { athletes: raw.athletes.flatMap(g => list(g.items).map(athlete)) }; break;
      }
      case 'game': {
        const raw = await get(url(`${SITE}/summary`, { event: b.id }), SCORE, refresh);
        if (!raw.header?.competitions?.length) throw new Error('Game details unavailable.');
        data = { game: game(raw.header), scoring: list(raw.scoringPlays).map(p => ({ period: p.period?.number || 0, clock: p.clock?.displayValue || '', text: p.text || '',
          awayScore: value(p.awayScore), homeScore: value(p.homeScore), team: team(p.team) })),
          teams: list(raw.boxscore?.teams).map(t => ({ team: team(t.team), stats: list(t.statistics).map(s => ({ name: s.label || s.name, value: value(s) })) })),
          players: list(raw.boxscore?.players).flatMap(t => list(t.statistics).map(s => ({ team: team(t.team), name: s.text || s.name, labels: s.labels || s.keys || [],
            rows: list(s.athletes).map(a => ({ athlete: athlete(a.athlete), cells: list(a.stats).map(value) })) }))) }; break;
      }
      case 'player': {
        const raw = await get(`https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${b.id}`, REFERENCE, refresh);
        if (!raw.athlete?.id) throw new Error('Player unavailable.');
        data = athlete(raw.athlete); break;
      }
      case 'playerTab': {
        if (b.tab === 'news') {
          const raw = await get(url(`${SITE}/news`, { player: b.id, limit: 20 }), REFERENCE, refresh);
          if (!Array.isArray(raw.articles)) throw new Error('Player news is unavailable.');
          // The news feed can ignore the player filter. Only keep explicitly tagged articles.
          data = { articles: raw.articles.filter(a => list(a.categories).some(c => String(c.athleteId || c.athlete?.id) === b.id)).map(a => ({
            title: a.headline || '', description: a.description || '', date: utc(a.published), url: safeUrl(a.links?.web?.href) })) };
        } else {
          const endpoint = ['season', 'career'].includes(b.tab) ? 'stats' : b.tab;
          const raw = await get(url(`${COMMON}/${b.id}/${endpoint}`, { season: b.season, seasontype: b.type }), REFERENCE, refresh);
          const returnedSeason = list(raw.filters).find(f => f.name === 'season')?.value;
          if (returnedSeason && Number(returnedSeason) !== b.season) throw new Error('Statistics for this season are unavailable.');
          const returnedType = list(raw.filters).find(f => f.name === 'seasontype')?.value;
          if (returnedType && Number(returnedType) !== b.type) throw new Error('Statistics for this season type are unavailable.');
          data = { tables: playerTables(raw, b.tab, b.season) };
        } break;
      }
    }
    return { data, fetchedAt: new Date(now()).toISOString() };
  }
  return { run };
}
