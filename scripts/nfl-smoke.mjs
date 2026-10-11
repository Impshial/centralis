// Live, read-only adapter check. Run with native Deno fetch before Edge deployment.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createNflService } from '../supabase/functions/nfl-api/service.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const fetcher = process.argv.includes('--powershell') ? async (url, options) => {
  const headers = Object.entries(options.headers).map(([key, value]) => `'${key.replaceAll("'", "''")}'='${value.replaceAll("'", "''")}'`).join(';');
  const command = `$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [Text.Encoding]::UTF8; (Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 25 -Headers @{${headers}} -Uri '${url.replaceAll("'", "''")}').Content`;
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { signal: options.signal, windowsHide: true, maxBuffer: 12 * 1024 * 1024 });
  return { ok: true, json: async () => JSON.parse(stdout.replace(/^\uFEFF/, '')) };
} : fetch;
const service = createNflService(process.argv.includes('--powershell') ? { fetcher, timeout: 30000 } : {});
const results = {};
async function check(key, body) {
  const result = await service.run(body);
  results[key] = result;
  if (result.data.weeks) assert.ok(result.data.weeks.every(w => w.available !== false), `${key}: at least one upstream week failed`);
  console.log(`${key}: OK ${JSON.stringify(result.data).length} bytes`);
  return result.data;
}
const boot = await check('bootstrap', { action: 'bootstrap' });
const season = boot.calendar.year;
const regular = boot.calendar.weeks.filter(w => w.type === 2);
const week = regular.find(w => Date.parse(w.start) <= Date.now() && Date.parse(w.end) >= Date.now()) || regular[0];
const board = await check('scoreboard', { action: 'scoreboard', season, type: week.type, week: week.week });
const weekIndex = boot.calendar.weeks.findIndex(w => w.type === week.type && w.week === week.week);
for (const [name, w] of [['previous-scoreboard', boot.calendar.weeks[weekIndex - 1]], ['next-scoreboard', boot.calendar.weeks[weekIndex + 1]]]) {
  if (w) await check(name, { action: 'scoreboard', season, type: w.type, week: w.week });
}
const historical = boot.seasons.find(y => y < season);
const teamId = board.games[0].competitors[0].id;
for (const action of ['calendar', 'standings', 'teams', 'byes', 'playoffs']) await check(action, { action, season });
for (const action of ['team', 'schedule', 'roster']) await check(action, { action, season, id: teamId, type: 2 });
await check('historical-calendar', { action: 'calendar', season: historical });
await check('historical-schedule', { action: 'schedule', season: historical, id: teamId, type: 2 });
await check('historical-roster', { action: 'roster', season: historical, id: teamId });
await check('historical-standings', { action: 'standings', season: historical });
await check('historical-playoffs', { action: 'playoffs', season: historical });
await check('game', { action: 'game', id: board.games.find(g => g.completed)?.id || board.games[0].id });
const playerId = '3139477';
await check('player', { action: 'player', id: playerId });
for (const tab of ['gamelog', 'season', 'career', 'splits', 'news']) await check(`player-${tab}`, { action: 'playerTab', id: playerId, season: historical, type: 2, tab });
if (process.argv.includes('--fixtures')) {
  await mkdir('node_modules/.cache/nfl', { recursive: true });
  await writeFile('node_modules/.cache/nfl/live-results.json', JSON.stringify(results));
}
console.log('All resource adapters passed live smoke checks.');
