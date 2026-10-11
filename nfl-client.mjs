export const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const icon = name => `<ph-${name} aria-hidden="true"></ph-${name}>`;
export const empty = text => `<p class="nfl-empty">${escapeHtml(text)}</p>`;
export function imageMarkup(url, name, kind = 'logo') {
  let safe = '';
  try { const u = new URL(url); if (u.protocol === 'https:') safe = u.href; } catch { /* Missing provider artwork uses the abbreviation. */ }
  return `<span class="nfl-image nfl-image--${kind}"><span aria-hidden="true">${escapeHtml((name || 'NFL').slice(0, 3))}</span>${safe ? `<img src="${escapeHtml(safe)}" alt="${escapeHtml(name)}" loading="lazy">` : ''}</span>`;
}
export function installImageFallbacks(root) {
  root.addEventListener('error', e => { if (e.target.matches?.('.nfl-image img')) e.target.remove(); }, true);
}
export function eastern(date, options = {}) {
  if (!date || !Number.isFinite(Date.parse(date))) return 'TBD';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...options }).format(new Date(date));
}
export const dateLabel = date => eastern(date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
export const kickoff = game => game.timeTbd ? 'Time TBD' : `${eastern(game.date, { hour: 'numeric', minute: '2-digit' })} ET`;
export function activeWeek(calendar, now = Date.now()) {
  return calendar.weeks.find(w => Date.parse(w.start) <= now && Date.parse(w.end) >= now) || null;
}
export function selectWeek(calendar, type, week) {
  return calendar.weeks.find(w => w.type === Number(type) && w.week === Number(week)) || calendar.weeks.at(-1) || null;
}
export function weekWindow(calendar, selected) {
  const index = calendar.weeks.findIndex(w => w.type === selected?.type && w.week === selected?.week);
  return index < 0 ? [null, null, null] : [calendar.weeks[index - 1] || null, calendar.weeks[index], calendar.weeks[index + 1] || null];
}
export function sortConferenceTeams(teams) {
  const record = (team, key, missing) => {
    const value = team.stats?.[key];
    return value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : missing;
  };
  return [...teams].sort((a, b) => record(b, 'wins', -1) - record(a, 'wins', -1) || record(a, 'losses', Infinity) - record(b, 'losses', Infinity) || 0);
}
export function groupFavoriteGames(games, ids) {
  const unique = [...new Map(games.filter(g => g.competitors.some(t => ids.has(t.id))).map(g => [g.id, g])).values()];
  return [
    ['Live', unique.filter(g => g.state === 'in').sort((a, b) => Date.parse(a.date) - Date.parse(b.date))],
    ['Upcoming', unique.filter(g => g.state !== 'in' && !g.completed && !/CANCEL/i.test(g.statusName)).sort((a, b) => (Date.parse(a.date) || Infinity) - (Date.parse(b.date) || Infinity))],
    ['Recent', unique.filter(g => g.completed || /CANCEL/i.test(g.statusName)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date))],
  ];
}
export function gameRow(g, link, compact = false) {
  const showScore = g.state !== 'pre' && !/CANCEL|POSTPON/i.test(g.statusName);
  const competitor = t => {
    const body = `${imageMarkup(t.logo, t.abbreviation)}<span>${escapeHtml(compact ? t.abbreviation : t.name)}${!compact && t.record ? `<small>${escapeHtml(t.record)}</small>` : ''}</span>`;
    return /^[1-9]\d*$/.test(t.id) ? `<a class="nfl-team-link" href="${escapeHtml(link({ section: 'team', id: t.id, tab: 'schedule' }))}">${body}</a>` : `<span class="nfl-team-link">${body}</span>`;
  };
  return `<article class="nfl-game-row ${g.state === 'in' ? 'is-live' : ''}">
    <div class="nfl-matchup">${g.competitors.map(t => `<div class="nfl-competitor ${t.winner ? 'is-winner' : ''}">${competitor(t)}<strong class="nfl-score">${showScore ? escapeHtml(t.score || '-') : ''}</strong></div>`).join('')}</div>
    <div class="nfl-game-meta"><span class="nfl-status ${g.state === 'in' ? 'is-live' : ''}">${escapeHtml(g.state === 'pre' && !/CANCEL|POSTPON|DELAY/i.test(g.statusName) ? kickoff(g) : g.status)}</span><small>${escapeHtml(compact ? eastern(g.date, { month: 'short', day: 'numeric' }) : g.broadcast || g.venue)}</small></div>
    <a class="nfl-control nfl-game-open" href="${escapeHtml(link({ section: 'game', id: g.id, tab: 'scoring' }))}" title="Game details" aria-label="Game details: ${escapeHtml(g.name)}">${icon('arrow-up-right')}</a></article>`;
}
export function gameList(games, link, noGames = 'No games scheduled.') {
  if (!games.length) return empty(noGames);
  const groups = new Map();
  [...games].sort((a, b) => (Date.parse(a.date) || Infinity) - (Date.parse(b.date) || Infinity)).forEach(g => {
    const label = dateLabel(g.date); if (!groups.has(label)) groups.set(label, []); groups.get(label).push(g);
  });
  return [...groups].map(([label, rows]) => `<div class="nfl-date-group"><h3>${escapeHtml(label)}</h3>${rows.map(g => gameRow(g, link)).join('')}</div>`).join('');
}
export function gameCard(g, link) {
  const specialStatus = /CANCEL|POSTPON|DELAY/i.test(g.statusName);
  const showScore = g.state !== 'pre' && !/CANCEL|POSTPON/i.test(g.statusName);
  const teams = g.competitors.map(t => {
    const body = `${imageMarkup(t.logo, t.abbreviation)}<span>${escapeHtml(t.name)}</span>`;
    const team = /^[1-9]\d*$/.test(t.id) ? `<a class="nfl-team-link" href="${escapeHtml(link({ section: 'team', id: t.id, tab: 'schedule' }))}">${body}</a>` : `<span class="nfl-team-link">${body}</span>`;
    return `<div class="nfl-competitor ${t.winner ? 'is-winner' : ''}">${team}<strong class="nfl-score">${showScore ? escapeHtml(t.score === '' ? '-' : t.score ?? '-') : ''}</strong></div>`;
  }).join('');
  // A stretched sibling link makes the card clickable without nesting the team links.
  return `<article class="nfl-game-card ${g.state === 'in' ? 'is-live' : ''}">
    <a class="nfl-game-card-open" href="${escapeHtml(link({ section: 'game', id: g.id, tab: 'scoring' }))}" title="Game details: ${escapeHtml(g.name)}" aria-label="Game details: ${escapeHtml(g.name)}"></a>
    <div class="nfl-matchup">${teams}</div>
    <div class="nfl-card-meta"><span class="nfl-status ${g.state === 'in' ? 'is-live' : ''}">${escapeHtml(g.state === 'pre' && !specialStatus ? 'Scheduled' : g.status)}</span>
      <div class="nfl-card-kickoff"><span>${escapeHtml(eastern(g.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</span><span>${escapeHtml(kickoff(g))}</span></div>
      ${g.broadcast ? `<small>${escapeHtml(g.broadcast)}</small>` : ''}</div></article>`;
}
export function gameGrid(games, link) {
  if (!games.length) return empty('No games scheduled.');
  const sorted = [...games].sort((a, b) => (Date.parse(a.date) || Infinity) - (Date.parse(b.date) || Infinity));
  return `<div class="nfl-games-grid">${sorted.map(g => gameCard(g, link)).join('')}</div>`;
}
export function startPolling(callback, eligible, interval = 60000, doc = document) {
  let timer, running = false;
  const tick = async () => {
    if (!doc.hidden && eligible() && !running) {
      running = true; try { await callback(); } finally { running = false; }
    }
  };
  const schedule = () => { clearInterval(timer); if (!doc.hidden) timer = setInterval(tick, interval); };
  const visibility = () => { schedule(); if (!doc.hidden) void tick(); };
  doc.addEventListener('visibilitychange', visibility); schedule();
  return () => { clearInterval(timer); doc.removeEventListener('visibilitychange', visibility); };
}

export function createClient(host = window) {
  const cache = new Map(), pending = new Map();
  let user, favorites = null, settingsStale = false;
  const waitUser = async () => {
    for (let i = 0; i < 80; i++) {
      const found = host.centralisCurrentAppUser || await host.centralisGetCurrentAppUser?.();
      if (found && host.centralisSupabase) { user = found; return user; }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Sign in to use NFL.');
  };
  const request = async (action, params = {}, refresh = false) => {
    await waitUser();
    const body = { action, ...params }, key = JSON.stringify(body), old = cache.get(key);
    const ttl = ['calendar'].includes(action) ? 86400000 : ['bootstrap', 'scoreboard', 'game', 'schedule', 'playoffs'].includes(action) ? 20000 : 900000;
    if (!refresh && old && Date.now() - old.at < ttl) return old.result;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 75000);
      try {
        const { data, error } = await host.centralisSupabase.functions.invoke('nfl-api', { body: { ...body, refresh }, signal: controller.signal });
        if (error || !data?.data) {
          let message = data?.error;
          try { message ||= (await error?.context?.json())?.error; } catch { /* Generic deployment/connectivity message below. */ }
          throw new Error(message || 'NFL could not connect. Deploy the nfl-api Edge Function, then try Refresh.');
        }
        if (Array.isArray(data.data.weeks) && data.data.weeks.some(w => w.available === false)) {
          data.data.weeks = data.data.weeks.map(w => {
            const previous = old?.result.data.weeks?.find(p => p.type === w.type && p.week === w.week && p.available);
            return !w.available && previous ? { ...previous, stale: true } : w;
          });
          data.stale = true;
          data.warning = 'Some weeks could not refresh. Previously loaded results are marked stale.';
        }
        cache.set(key, { result: data, at: Date.now() });
        while (cache.size > 100) cache.delete(cache.keys().next().value);
        return data;
      } catch (error) {
        if (old) return { ...old.result, stale: true, warning: 'Refresh failed. Showing the last successful result.' };
        throw error;
      } finally { clearTimeout(timer); pending.delete(key); }
    })();
    pending.set(key, task); return task;
  };
  const loadFavorites = async () => {
    const u = await waitUser();
    const { data, error } = await host.centralisSupabase.from('nfl_favorite_teams').select('team_id,team_name,team_logo').eq('user_id', u.id).order('created_at');
    if (error) throw new Error('Favorites could not load. Apply the NFL database migration, then retry.');
    favorites = data || []; return favorites;
  };
  const changed = () => {
    host.dispatchEvent(new CustomEvent('centralis:nfl-favorites-changed'));
    try { host.localStorage.setItem('centralis:nfl-change', JSON.stringify({ userId: user.id, at: Date.now() })); } catch { /* Storage can be disabled. */ }
  };
  const setFavorite = async (team, enabled) => {
    const u = await waitUser();
    const query = host.centralisSupabase.from('nfl_favorite_teams');
    const { error } = enabled ? await query.upsert({ user_id: u.id, team_id: String(team.id), team_name: team.name, team_logo: team.logo || '' }, { onConflict: 'user_id,team_id', ignoreDuplicates: true })
      : await query.delete().eq('user_id', u.id).eq('team_id', String(team.id));
    if (error) throw new Error('Your favorite could not be saved. Please try again.');
    if (favorites) favorites = enabled ? [...favorites.filter(t => t.team_id !== team.id), { team_id: team.id, team_name: team.name, team_logo: team.logo }] : favorites.filter(t => t.team_id !== team.id);
    changed(); return favorites;
  };
  host.addEventListener?.('storage', event => {
    if (event.key !== 'centralis:nfl-change') return;
    try { if (JSON.parse(event.newValue)?.userId === user?.id) { settingsStale = true; host.dispatchEvent(new CustomEvent('centralis:nfl-favorites-changed')); } } catch { /* Ignore invalid cross-tab messages. */ }
  });
  host.addEventListener?.('centralis:current-user-changed', event => {
    if (event.detail?.user?.id !== user?.id) { user = null; favorites = null; cache.clear(); }
  });
  return { waitUser, request, loadFavorites, setFavorite,
    settings: async () => {
      const u = await waitUser();
      if (!settingsStale) return await host.centralisGetUserSettings();
      const { data, error } = await host.centralisSupabase.from('user_settings').select('nfl_home_widget_visible').eq('user_id', u.id).maybeSingle();
      if (error) throw new Error('Homepage preference could not load.');
      return data;
    },
    setVisibility: async visible => { await waitUser(); const result = await host.centralisUpdateUserSettings({ nfl_home_widget_visible: visible }); changed(); return result; },
  };
}
