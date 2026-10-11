import { createClient, escapeHtml as e, icon, empty, gameRow, activeWeek, weekWindow, groupFavoriteGames, installImageFallbacks, startPolling } from './nfl-client.mjs';

const root = document.querySelector('[data-home-nfl]');
if (root) {
  const api = createClient();
  let busy = false, enabled = true, generation = 0, again = false;
  installImageFallbacks(root);
  async function render(refresh = false) {
    if (busy) { again = true; return; }
    busy = true;
    const token = ++generation;
    try {
      await api.waitUser();
      const settings = await api.settings();
      enabled = settings?.nfl_home_widget_visible !== false;
      root.hidden = !enabled;
      if (!enabled) return;
      const favorites = await api.loadFavorites();
      const heading = `<div class="nfl-section-heading"><h2>NFL Favorites</h2><a class="nfl-control" href="nfl.html" title="Open NFL">NFL ${icon('arrow-up-right')}</a></div>`;
      if (!favorites.length) { root.innerHTML = heading + empty('No favorite teams yet.') + '<a class="nfl-control" href="nfl.html?section=favorites">Choose teams</a>'; return; }
      const boot = await api.request('bootstrap', {}, refresh), cal = boot.data.calendar, selected = activeWeek(cal);
      if (!selected) { root.innerHTML = heading + empty('Offseason. No active week in the NFL calendar.') + '<a class="nfl-control" href="nfl.html">Browse schedule</a>'; return; }
      const weeks = weekWindow(cal, selected).filter(Boolean);
      const results = await Promise.allSettled(weeks.map(w => api.request('scoreboard', { season: cal.year, type: w.type, week: w.week }, refresh)));
      if (token !== generation) return;
      const stale = boot.stale || results.some(r => r.status === 'rejected' || r.value.stale);
      const games = results.flatMap(r => r.status === 'fulfilled' ? r.value.data.games : []);
      const groups = groupFavoriteGames(games, new Set(favorites.map(t => t.team_id)));
      const link = change => `nfl.html?${new URLSearchParams({ season: String(cal.year), type: String(selected.type), week: String(selected.week), ...change })}`;
      root.innerHTML = heading + (stale ? '<p class="nfl-muted" role="status">Some scores are unavailable or stale.</p>' : '') +
        (groups.filter(([, rows]) => rows.length).map(([label, rows]) => `<section><h3>${e(label)}</h3>${rows.slice(0, 6).map(g => gameRow(g, link, true)).join('')}${rows.length > 6 ? `<a class="nfl-control" href="${link({ section: 'games' })}">All ${e(label.toLowerCase())} games</a>` : ''}</section>`).join('') || empty(stale ? 'Scores could not load.' : 'No favorite-team games in this three-week window.'));
    } catch (error) {
      if (!root.querySelector('.nfl-game-row')) root.innerHTML = `<div class="nfl-section-heading"><h2>NFL Favorites</h2><a class="nfl-control" href="nfl.html">Open NFL</a></div>${empty(error.message)}`;
      else {
        let status = root.querySelector('[data-nfl-home-stale]');
        if (!status) { status = document.createElement('p'); status.className = 'nfl-muted'; status.dataset.nflHomeStale = ''; root.prepend(status); }
        status.textContent = 'Refresh failed. Showing last successful scores.';
      }
    } finally { busy = false; if (again) { again = false; void render(true); } }
  }
  const stop = startPolling(() => render(true), () => enabled && !busy);
  window.addEventListener('centralis:nfl-favorites-changed', () => render());
  window.addEventListener('centralis:user-settings-changed', () => render());
  window.addEventListener('centralis:current-user-changed', () => render());
  window.addEventListener('pagehide', event => { if (!event.persisted) stop(); });
  void render();
}
