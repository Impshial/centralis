import { createClient, escapeHtml as e, icon, empty, gameRow, activeWeek, groupFavoriteGames, installImageFallbacks, startPolling } from './nfl-client.mjs';

const root = document.querySelector('[data-home-nfl]');
if (root) {
  const api = createClient();
  let busy = false, enabled = true, generation = 0, again = false, displayedWeek = '';
  const panel = html => `<div class="home-section-heading"><h2>NFL Favorites</h2><a class="nfl-control" href="nfl.html" title="Open NFL">NFL ${icon('arrow-up-right')}</a></div><div class="home-nfl-panel">${html}</div>`;
  installImageFallbacks(root);
  async function render(refresh = false) {
    if (busy) { again = true; return; }
    busy = true;
    root.setAttribute('aria-busy', 'true');
    const token = ++generation;
    try {
      await api.waitUser();
      const settings = await api.settings();
      enabled = settings?.nfl_home_widget_visible !== false;
      root.hidden = !enabled;
      if (!enabled) return;
      const favorites = await api.loadFavorites();
      if (!favorites.length) { displayedWeek = ''; root.innerHTML = panel(empty('No favorite teams yet.') + '<a class="nfl-control" href="nfl.html?section=favorites">Choose teams</a>'); return; }
      const boot = await api.request('bootstrap', {}, refresh), cal = boot.data.calendar, selected = activeWeek(cal);
      if (!selected) { displayedWeek = ''; root.innerHTML = panel(empty('Offseason. No active week in the NFL calendar.') + '<a class="nfl-control" href="nfl.html">Browse schedule</a>'); return; }
      const weekKey = `${cal.year}:${selected.type}:${selected.week}`;
      // Never carry last week's scores into a failed refresh of a new week.
      if (displayedWeek !== weekKey) { displayedWeek = weekKey; root.innerHTML = panel(empty('Loading current games...')); }
      const result = await api.request('scoreboard', { season: cal.year, type: selected.type, week: selected.week }, refresh);
      if (token !== generation) return;
      const stale = boot.stale || result.stale;
      const games = groupFavoriteGames(result.data.games, new Set(favorites.map(t => t.team_id))).flatMap(([, rows]) => rows);
      const link = change => `nfl.html?${new URLSearchParams({ season: String(cal.year), type: String(selected.type), week: String(selected.week), ...change })}`;
      root.innerHTML = panel(`<div class="nfl-section-heading"><h3>${e(selected.label)}</h3><small>${e(selected.detail)}</small></div>` +
        (stale ? '<p class="nfl-muted" role="status">Some scores are unavailable or stale.</p>' : '') +
        (games.length ? games.slice(0, 6).map(g => gameRow(g, link, true)).join('') : empty('No favorite-team games this week.')) +
        (games.length > 6 ? `<a class="nfl-control" href="${e(link({ section: 'games' }))}">All current-week games</a>` : ''));
    } catch (error) {
      if (!root.querySelector('.nfl-game-row')) root.innerHTML = panel(empty(error.message));
      else {
        let status = root.querySelector('[data-nfl-home-stale]');
        if (!status) { status = document.createElement('p'); status.className = 'nfl-muted'; status.dataset.nflHomeStale = ''; status.setAttribute('role', 'status'); root.querySelector('.home-nfl-panel').prepend(status); }
        status.textContent = 'Refresh failed. Showing last successful scores.';
      }
    } finally { busy = false; root.setAttribute('aria-busy', 'false'); if (again) { again = false; void render(true); } }
  }
  const stop = startPolling(() => render(true), () => enabled && !busy);
  window.addEventListener('centralis:nfl-favorites-changed', () => render());
  window.addEventListener('centralis:user-settings-changed', () => render());
  window.addEventListener('centralis:current-user-changed', () => render());
  window.addEventListener('pagehide', event => { if (!event.persisted) stop(); });
  void render();
}
