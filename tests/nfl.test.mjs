import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { game, calendar, scoreboard, standings, playerTables, validate, createNflService, safeUrl, NflUpstreamError } from '../supabase/functions/nfl-api/service.mjs';
import { activeWeek, selectWeek, weekWindow, eastern, kickoff, groupFavoriteGames, gameRow, gameCard, gameGrid, sortConferenceTeams, createClient, startPolling } from '../nfl-client.mjs';

const rawCalendar = { leagues: [{ season: { year: 2025 }, calendar: [
  { label: 'Preseason', value: '1', entries: [{ value: '4', label: 'Preseason Week 3', startDate: '2025-08-20', endDate: '2025-09-03' }] },
  { label: 'Regular Season', value: '2', entries: [{ value: '1', label: 'Week 1', startDate: '2025-09-04', endDate: '2025-09-10' }, { value: '17', label: 'Week 17', startDate: '2025-12-24', endDate: '2025-12-31' }] },
  { label: 'Postseason', value: '3', entries: [{ value: '1', label: 'Wild Card', startDate: '2026-01-08', endDate: '2026-01-14' }, { value: '5', label: 'Super Bowl', startDate: '2026-02-05', endDate: '2026-02-11' }] },
  { label: 'Off Season', value: '4', startDate: '2026-02-12', endDate: '2026-08-01' },
] }] };
const event = (status = {}) => ({ id: 123, date: '2025-09-08T00:20Z', season: { year: 2025, type: 2 }, week: { number: 1 }, competitions: [{
  competitors: [{ homeAway: 'home', team: { id: 12, displayName: 'Chiefs', abbreviation: 'KC' }, score: { value: 20 }, linescores: [{ value: 0, period: 1 }, { displayValue: '6', period: 5 }] },
    { homeAway: 'away', team: { id: '13', displayName: 'Raiders', abbreviation: 'LV' }, score: '20' }],
  status: { type: { name: 'STATUS_FINAL', state: 'post', shortDetail: 'Final/OT', completed: true, ...status } },
}] });
const board = () => ({ season: { year: 2025, type: 2 }, week: { number: 1 }, events: [event()] });

test('calendar uses provider week identifiers and chronological transitions', () => {
  const c = calendar(rawCalendar);
  assert.equal(c.weeks.length, 5);
  assert.equal(weekWindow(c, c.weeks[1])[0].type, 1);
  assert.equal(weekWindow(c, c.weeks[2])[2].type, 3);
  assert.equal(c.weeks.at(-1).week, 5);
  assert.equal(weekWindow(c, c.weeks[0])[0], null);
  assert.equal(weekWindow(c, c.weeks.at(-1))[2], null);
});
test('equivalent week retained, unavailable week falls back to last valid week', () => {
  const c = calendar(rawCalendar);
  assert.equal(selectWeek(c, 2, 1).label, 'Week 1');
  assert.equal(selectWeek(c, 2, 18).label, 'Super Bowl');
});
test('offseason does not label old results as current', () => {
  const c = calendar(rawCalendar);
  assert.equal(activeWeek(c, Date.parse('2026-04-01')), null);
  assert.equal(activeWeek(c, Date.parse('2026-01-10')).label, 'Wild Card');
});
test('scores normalize strings/objects/zero/overtime and retain string IDs', () => {
  const g = game(event());
  assert.equal(g.id, '123'); assert.equal(g.competitors[0].id, '13');
  assert.equal(g.competitors[1].score, '20'); assert.equal(g.competitors[1].periods[0].score, '0');
  assert.equal(g.competitors[1].periods[1].period, 5); assert.equal(g.status, 'Final/OT');
  assert.equal(g.date, '2025-09-08T00:20:00.000Z');
});
test('ties do not fabricate a winner', () => assert.ok(game(event()).competitors.every(t => !t.winner)));
test('TBD playoff teams never link to invalid team detail IDs', () => {
  const g = game(event()); g.competitors = [{ id: '-1', name: 'TBD', abbreviation: 'TBD', periods: [], score: '' }];
  const html = gameRow(g, changes => `nfl.html?section=${changes.section}`);
  assert.ok(!html.includes('section=team')); assert.ok(html.includes('section=game'));
});
test('postponed and canceled scores are not shown as finals', () => {
  for (const name of ['STATUS_POSTPONED', 'STATUS_CANCELED']) {
    const g = game(event({ name, state: 'pre', completed: false, shortDetail: name }));
    const html = gameRow(g, () => 'nfl.html');
    assert.ok(html.includes(name)); assert.ok(!html.includes('>20</strong>'));
  }
});
test('kickoff times use Eastern DST and TBD is explicit', () => {
  assert.equal(eastern('2025-09-08T00:20Z', { hour: 'numeric', minute: '2-digit' }), '8:20 PM');
  assert.equal(eastern('2026-01-08T00:20Z', { hour: 'numeric', minute: '2-digit' }), '7:20 PM');
  assert.equal(kickoff({ timeTbd: true }), 'Time TBD');
  assert.match(kickoff(game(event())), / ET$/);
});
test('incomplete and wrong-season scoreboards fail, successful empty is distinct', () => {
  assert.throws(() => scoreboard({}));
  assert.throws(() => scoreboard({ ...board(), season: { year: 2026, type: 2 } }, { season: 2025, type: 2, week: 1 }));
  assert.throws(() => scoreboard({ ...board(), events: [{ id: '123' }] }));
  assert.deepEqual(scoreboard({ ...board(), events: [] }).games, []);
});
test('only explicit byes are used', () => {
  assert.equal(scoreboard(board()).byes, null);
  assert.deepEqual(scoreboard({ ...board(), week: { number: 1, teamsOnBye: [] } }).byes, []);
  assert.equal(scoreboard({ ...board(), week: { teamsOnBye: [{ id: '8', displayName: 'Bye Team' }] } }).byes[0].id, '8');
});
test('standings keep provider grouping, seeds and clinches', () => {
  const r = standings({ children: [{ id: '8', name: 'AFC', children: [{ id: '4', name: 'AFC East', standings: { entries: [{ team: { id: '2' }, stats: [
    { name: 'playoffSeed', value: 7, displayValue: '7' }, { name: 'clincher', displayValue: 'x', description: 'Clinched Playoff Berth' },
  ] }] } }] }] });
  assert.equal(r[0].divisions[0].teams[0].seed, 7);
  assert.equal(r[0].divisions[0].teams[0].clinch, 'Clinched Playoff Berth');
});
test('conference order combines divisions by numeric wins descending then losses ascending', () => {
  const team = (id, wins, losses) => ({ id, stats: { wins, losses } });
  const teams = [team('east', '3', '1'), team('east2', '2', '2'), team('north', '3', '0'), team('north2', '3', '1'), team('south', '10', '2'), team('unknown', '-', ''), team('zero', 0, 0)];
  const original = structuredClone(teams);
  assert.deepEqual(sortConferenceTeams(teams).map(t => t.id), ['south', 'north', 'east', 'north2', 'east2', 'zero', 'unknown']);
  assert.deepEqual(teams, original, 'Division data is not mutated');
  assert.deepEqual(sortConferenceTeams([{ id: 'a' }, { id: 'b', stats: {} }]).map(t => t.id), ['a', 'b']);
});
test('game cards have independent, escaped game and team destinations with ET kickoff', () => {
  const g = game(event());
  g.name = '<Raiders & Chiefs>'; g.competitors[0].name = '<Raiders>';
  g.competitors[0].score = 0;
  const html = gameCard(g, change => `nfl.html?${new URLSearchParams(change)}`);
  assert.equal((html.match(/<a /g) || []).length, 3);
  assert.ok(!/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/.test(html), 'No nested anchors');
  assert.match(html, /section=game&amp;id=123/);
  assert.match(html, /section=team&amp;id=13/);
  assert.match(html, /&lt;Raiders &amp; Chiefs&gt;/);
  assert.match(html, /&lt;Raiders&gt;/);
  assert.match(html, />0<\/strong>/);
  assert.match(html, /Final\/OT/);
  assert.match(html, /Sun, Sep 7/);
  assert.match(html, /8:20 PM ET/);
});
test('game cards distinguish pending, TBD, postponed and canceled games without fabricated scores', () => {
  for (const name of ['STATUS_SCHEDULED', 'STATUS_POSTPONED', 'STATUS_CANCELED']) {
    const g = game(event({ name, state: 'pre', completed: false, shortDetail: name }));
    g.timeTbd = true; g.competitors[0].id = '-1';
    const html = gameCard(g, change => `nfl.html?${new URLSearchParams(change)}`);
    assert.ok(!html.includes('>20</strong>'));
    assert.ok(!html.includes('id=-1'));
    assert.match(html, /Time TBD/);
    assert.ok(html.includes(name === 'STATUS_SCHEDULED' ? 'Scheduled' : name));
  }
});
test('game grid keeps chronological order, unknown dates last, and explicit empty schedules', () => {
  const g = game(event()), games = [{ ...g, id: 'late', date: '2025-09-09' }, { ...g, id: 'tbd', date: '' }, { ...g, id: 'early' }];
  const html = gameGrid(games, change => `nfl.html?${new URLSearchParams(change)}`);
  assert.ok(html.indexOf('id=early') < html.indexOf('id=late'));
  assert.ok(html.indexOf('id=late') < html.indexOf('id=tbd'));
  assert.equal(games[0].id, 'late');
  assert.match(gameGrid([], () => ''), /No games scheduled/);
});
test('season stats filter real year rows; career uses provider totals, never splits', () => {
  const r = { categories: [{ displayName: 'Passing', labels: ['TD'], statistics: [{ season: { year: 2024 }, stats: ['10'] }, { season: { year: 2025 }, stats: ['20'] }], totals: ['30'] }] };
  assert.equal(playerTables(r, 'season', 2025)[0].rows.length, 1);
  assert.deepEqual(playerTables(r, 'career', 2025)[0].totals, ['Career', '', '30']);
  assert.throws(() => playerTables({ splitCategories: [] }, 'career', 2025));
});
test('favorite grouping deduplicates games for both favorite teams', () => {
  const g = game(event()), groups = groupFavoriteGames([g, g], new Set(['12', '13']));
  assert.equal(groups.find(([name]) => name === 'Recent')[1].length, 1);
  assert.equal(groupFavoriteGames([g], new Set())[2][1].length, 0);
});
test('API validates every identifier and does not accept arbitrary URLs', () => {
  assert.throws(() => validate({ action: 'fetch', url: 'https://example.com' }));
  for (const id of ['../secret', 'https://example.com', 0, '-1', '1?x=y']) assert.throws(() => validate({ action: 'game', id }));
  assert.throws(() => validate({ action: 'scoreboard', season: 2025, type: 2, week: 0 }));
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.deepEqual(validate({ action: 'game', id: 123, url: 'https://example.com' }), { action: 'game', id: '123', refresh: false });
});
test('upstream request coalescing, max four concurrent, cache and refresh', async () => {
  let calls = 0, active = 0, max = 0;
  const service = createNflService({ fetcher: async (url, options) => {
    calls++; active++; max = Math.max(max, active);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['User-Agent'], 'Centralis-NFL/1.0');
    assert.equal(options.headers.Accept, 'application/json');
    await new Promise(r => setTimeout(r, 5)); active--;
    return { ok: true, json: async () => ({ athlete: { id: url.split('/').at(-1) } }) };
  } });
  await Promise.all(Array.from({ length: 10 }, (_, i) => service.run({ action: 'player', id: i + 1 })));
  assert.equal(max, 4);
  await Promise.all([service.run({ action: 'player', id: 11 }), service.run({ action: 'player', id: 11 })]);
  assert.equal(calls, 11);
  await service.run({ action: 'player', id: 11 }); assert.equal(calls, 11);
  await service.run({ action: 'player', id: 11, refresh: true }); assert.equal(calls, 12);
});
test('upstream request timeout releases request', async () => {
  const service = createNflService({ timeout: 5, fetcher: async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Timeout')))) });
  await assert.rejects(service.run({ action: 'player', id: '1' }), /timed out/);
});
test('startup uses the Centralis identity for every native fetch request', async () => {
  const urls = [];
  const service = createNflService({ fetcher: async (url, options) => {
    urls.push(url);
    const identified = options.headers?.['User-Agent'] === 'Centralis-NFL/1.0';
    return { ok: identified, status: identified ? 200 : 403, json: async () => url.includes('/seasons')
      ? { items: [{ $ref: 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2025' }], pageCount: 1 }
      : rawCalendar };
  } });
  const result = await service.run({ action: 'bootstrap' });
  assert.equal(result.data.calendar.year, 2025);
  assert.equal(urls.length, 2);
});
test('upstream failures have safe diagnostics and do not expose response bodies', async () => {
  const service = createNflService({ fetcher: async () => ({ ok: false, status: 403, json: async () => ({ message: 'Untrusted upstream body' }) }) });
  await assert.rejects(service.run({ action: 'player', id: '1' }), error => {
    assert.ok(error instanceof NflUpstreamError);
    assert.match(error.message, /HTTP 403/);
    assert.ok(!error.message.includes('Untrusted'));
    assert.match(error.resource, /athletes\/1$/);
    return true;
  });
});

function clientHost() {
  const host = new EventTarget(), calls = [], db = [];
  host.centralisCurrentAppUser = { id: 42 };
  host.localStorage = { setItem() {} };
  host.centralisGetUserSettings = async () => ({ nfl_home_widget_visible: true });
  host.centralisUpdateUserSettings = async v => { calls.push(v); return v; };
  host.centralisSupabase = {
    functions: { invoke: async () => ({ data: { data: { games: [] }, fetchedAt: '2025-01-01T00:00Z' } }) },
    from: name => {
      let mode = 'read', row, options; const filters = [];
      const q = { select() { return q; }, order() { return q; }, eq(k, v) { filters.push([k, v]); return q; },
        upsert(r, o) { mode = 'upsert'; row = r; options = o; return q; }, delete() { mode = 'delete'; return q; },
        then(resolve) {
          calls.push({ name, mode, row, options, filters });
          if (host.fail) return Promise.resolve({ error: { message: 'Save failed' } }).then(resolve);
          if (mode === 'upsert' && !db.some(t => t.team_id === row.team_id)) db.push(row);
          if (mode === 'delete') { const index = db.findIndex(t => filters.every(([k, v]) => t[k] === v)); if (index >= 0) db.splice(index, 1); }
          return Promise.resolve({ data: [...db], error: null }).then(resolve);
        },
      }; return q;
    },
  };
  return { host, calls, db };
}
test('favorite writes are idempotent and every read/removal is user scoped', async () => {
  const { host, calls, db } = clientHost(), client = createClient(host), t = { id: '12', name: 'Chiefs', logo: '' };
  await client.loadFavorites(); await client.setFavorite(t, true); await client.setFavorite(t, true);
  assert.equal(db.length, 1);
  assert.equal(calls.find(c => c.mode === 'upsert').options.onConflict, 'user_id,team_id');
  await client.setFavorite(t, false); assert.equal(db.length, 0);
  assert.deepEqual(calls.find(c => c.mode === 'delete').filters, [['user_id', 42], ['team_id', '12']]);
});
test('failed favorites reject without success notification; settings independent', async () => {
  const { host, calls } = clientHost(), client = createClient(host); let events = 0;
  host.addEventListener('centralis:nfl-favorites-changed', () => events++);
  host.fail = true;
  await assert.rejects(client.setFavorite({ id: '12', name: 'Chiefs' }, true)); assert.equal(events, 0);
  await client.setVisibility(false); assert.deepEqual(calls.at(-1), { nfl_home_widget_visible: false });
});
test('refresh failures retain last successful client data with stale indicator', async () => {
  const { host } = clientHost(), client = createClient(host);
  await client.request('game', { id: '123' });
  host.centralisSupabase.functions.invoke = async () => { throw new Error('Offline'); };
  const r = await client.request('game', { id: '123' }, true); assert.equal(r.stale, true);
  await assert.rejects(client.request('game', { id: '999' }, true));
});
test('a partial bye refresh preserves the last successful week and marks it stale', async () => {
  const { host } = clientHost(), client = createClient(host);
  host.centralisSupabase.functions.invoke = async () => ({ data: { data: { weeks: [{ type: 2, week: 5, available: true, byes: [{ id: '12' }] }] } } });
  await client.request('byes', { season: 2025 });
  host.centralisSupabase.functions.invoke = async () => ({ data: { data: { weeks: [{ type: 2, week: 5, available: false, byes: null }] } } });
  const r = await client.request('byes', { season: 2025 }, true);
  assert.equal(r.stale, true); assert.equal(r.data.weeks[0].stale, true); assert.equal(r.data.weeks[0].byes[0].id, '12');
});
test('polling pauses hidden documents, skips historical views, resumes visibility', async () => {
  const doc = new EventTarget(); doc.hidden = false;
  let calls = 0, eligible = true;
  const stop = startPolling(async () => calls++, () => eligible, 10, doc);
  await new Promise(r => setTimeout(r, 24)); assert.ok(calls >= 1);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); const before = calls;
  await new Promise(r => setTimeout(r, 24)); assert.equal(calls, before);
  doc.hidden = false; eligible = false; doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r => setTimeout(r, 24)); assert.equal(calls, before);
  eligible = true; doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r => setTimeout(r, 1)); assert.ok(calls > before); stop();
});
test('migration enforces ownership, uniqueness, FK, preference, and purge integration', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202610110001_add_nfl.sql', import.meta.url), 'utf8');
  for (const pattern of [/user_id integer not null references public.users\(id\) on delete cascade/, /unique \(user_id, team_id\)/,
    /enable row level security/, /with check \(exists/, /auth.uid\(\)::text/, /nfl_home_widget_visible boolean not null default true/,
    /delete from public.nfl_favorite_teams where user_id = any\(purge_targets\)/]) assert.match(sql, pattern);
});
