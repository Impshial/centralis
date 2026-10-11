import { createClient, escapeHtml as e, icon, empty, imageMarkup, installImageFallbacks, dateLabel, eastern,
  activeWeek, selectWeek, weekWindow, gameRow, gameList, gameGrid, sortConferenceTeams, startPolling } from './nfl-client.mjs';

const api = createClient(), $ = id => document.getElementById(id);
const content = $('nfl-content'), notice = $('nfl-notice');
const sections = [['games', 'Games', 'football'], ['standings', 'Standings', 'list-numbers'], ['playoffs', 'Playoffs', 'trophy'], ['byes', 'Bye Weeks', 'calendar-blank'], ['favorites', 'Favorites', 'heart']];
let boot, calendar, selected, state, revision = 0, lastGame, favoriteTeams = new Map(), favoriteIds = new Set(), busy = false;
let currentWarnings = [], updatedAt = '';

const params = () => new URLSearchParams(location.search);
function link(change = {}) {
  const p = params();
  if (change.section && !sections.some(s => s[0] === change.section) && sections.some(s => s[0] === p.get('section'))) {
    p.set('from', p.get('section')); p.set('fromTab', p.get('tab') || '');
  }
  if (change.section && change.section !== p.get('section')) { p.delete('id'); p.delete('tab'); }
  for (const [k, v] of Object.entries(change)) { if (v == null || v === '') p.delete(k); else p.set(k, String(v)); }
  return `nfl.html?${p}`;
}
async function navigate(change, replace = false) {
  history[replace ? 'replaceState' : 'pushState']({}, '', link(change));
  await render();
}
function message(text, error = false) { notice.textContent = text; notice.classList.toggle('is-error', error); }
async function read(action, args = {}, refresh = false) {
  const token = revision;
  const r = await api.request(action, args, refresh);
  if (token === revision) {
    if (r.stale) currentWarnings.push(r.warning);
    updatedAt = r.fetchedAt;
  }
  return r.data;
}
const heading = (title, note = '') => `<div class="nfl-section-heading"><h2>${e(title)}</h2>${note ? `<small>${e(note)}</small>` : ''}</div>`;
const section = (title, html, note = '') => `<section class="nfl-section">${heading(title, note)}${html}</section>`;
const tabs = (items, chosen, label = 'Detail views') => `<nav class="nfl-tabs" aria-label="${e(label)}">${items.map(([id, name]) => `<a class="nfl-control" href="${e(link({ tab: id }))}" ${chosen === id ? 'aria-current="page"' : ''}>${e(name)}</a>`).join('')}</nav>`;
const teamLink = t => /^[1-9]\d*$/.test(t.id) ? `<a class="nfl-team-link" href="${e(link({ section: 'team', id: t.id, tab: 'schedule' }))}">${imageMarkup(t.logo, t.abbreviation)}<span>${e(t.name)}</span></a>` : `<span class="nfl-team-link">${e(t.name)}</span>`;
const playerLink = a => `<a class="nfl-player-link" href="${e(link({ section: 'player', id: a.id, tab: 'overview' }))}">${e(a.name)}</a>`;
const backLink = () => `<a class="nfl-control" href="${e(link({ section: params().get('from') || 'games', id: null, tab: params().get('fromTab') || null }))}">${icon('arrow-left')} NFL ${e(sections.find(s => s[0] === params().get('from'))?.[1] || 'Games')}</a>`;
function table(labels, rows, caption, titles = labels) {
  if (!rows.length) return empty('This information is not available from ESPN.');
  return `<div class="nfl-table-wrap" tabindex="0" aria-label="${e(caption)}"><table class="nfl-table"><caption>${e(caption)}</caption><thead><tr>${labels.map((l, i) => `<th scope="col" title="${e(titles[i] || l)}">${e(l)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function navigation() {
  const active = params().get('section') || 'games';
  $('nfl-nav').innerHTML = sections.map(([id, name, glyph]) => `<a href="${e(link({ section: id, id: null, tab: null }))}" ${active === id ? 'aria-current="page"' : ''}>${icon(glyph)}${e(name)}</a>`).join('');
  $('nfl-mobile-section').innerHTML = sections.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
  $('nfl-mobile-section').value = sections.some(s => s[0] === active) ? active : 'games';
}
function controls() {
  navigation();
  $('nfl-season').innerHTML = boot.seasons.map(y => `<option value="${y}" ${y === state.season ? 'selected' : ''}>${y}</option>`).join('');
  $('nfl-season').disabled = false;
  $('nfl-week').innerHTML = `${!selected ? '<option value="">Offseason</option>' : ''}${calendar.periods.filter(p => p.weeks.length).map(p => `<optgroup label="${e(p.label)}">${p.weeks.map(w => `<option value="${w.type}:${w.week}" ${selected?.type === w.type && selected?.week === w.week ? 'selected' : ''}>${e(w.label)}</option>`).join('')}</optgroup>`).join('')}`;
  $('nfl-week').disabled = !calendar.weeks.length;
  const [previous, , next] = weekWindow(calendar, selected);
  $('nfl-prev').disabled = !previous; $('nfl-next').disabled = !next;
  $('nfl-week').closest('label').hidden = state.section === 'favorites';
  document.querySelector('.nfl-week-actions').hidden = state.section === 'favorites';
}
async function games(refresh) {
  const views = [['previous', 'Previous'], ['current', 'Current'], ['following', 'Following']];
  const tab = views.some(([id]) => id === state.tab) ? state.tab : 'current';
  const top = `<div class="nfl-games-heading">${heading('Weekly Games')}${tabs(views, tab, 'Week views')}</div>`;
  if (!selected) return top + section('Offseason', empty('There is no active NFL week in the provider calendar. Select a week to browse the season.'), String(state.season));
  const index = views.findIndex(([id]) => id === tab), w = weekWindow(calendar, selected)[index];
  if (!w) return top + section(`${views[index][1]} week`, empty(index === 0 ? 'Start of the selected season.' : 'End of the selected season.'));
  let html;
  try {
    const data = await read('scoreboard', { season: state.season, type: w.type, week: w.week }, refresh);
    html = gameGrid(data.games, link);
    if (data.byes?.length) html += `<p class="nfl-muted">On bye: ${data.byes.map(t => e(t.name)).join(', ')}</p>`;
  } catch (error) { currentWarnings.push(`${w.label}: ${error.message}`); html = empty('Scores unavailable. Try Refresh.'); }
  return top + section(w.label, html, w.detail);
}
function standingTable(teams, title, picture = false, conference = false) {
  const stats = [['wins', 'W'], ['losses', 'L'], ['ties', 'T'], ['winPercent', 'Pct'], ['pointsFor', 'PF'], ['pointsAgainst', 'PA'], ['pointDifferential', 'Diff'], ['streak', 'Strk']];
  const sorted = picture ? [...teams].sort((a, b) => (a.seed || 99) - (b.seed || 99)) : conference ? sortConferenceTeams(teams) : teams;
  return table([...(picture ? ['Seed'] : []), 'Team', ...stats.map(s => s[1]), ...(picture ? ['Status'] : [])], sorted.map(t => [
    ...(picture ? [e(t.seed || '-')] : []), teamLink(t), ...stats.map(([k]) => e(t.stats[k] || (k === 'pointDifferential' ? t.stats.differential : '') || '-')),
    ...(picture ? [e(t.clinch && t.stats.clincher ? `${t.stats.clincher} - ${t.clinch}` : 'Not specified')] : []),
  ]), title);
}
async function standings(refresh, picture = false) {
  const { conferences } = await read('standings', { season: state.season }, refresh);
  const mode = state.tab === 'conference' ? 'conference' : 'division';
  return (picture ? '' : heading('Standings', `${state.season} season`) + tabs([['division', 'Divisions'], ['conference', 'Conferences']], mode)) +
    (conferences.map(c => section(c.name, picture || mode === 'conference' ? standingTable(c.teams.length ? c.teams : c.divisions.flatMap(d => d.teams), c.abbreviation || c.name, picture, mode === 'conference') :
      c.divisions.map(d => standingTable(d.teams, d.name)).join('') || empty('Division standings unavailable.'))).join('') || empty('Standings are not available for this season.'));
}
async function playoffs(refresh) {
  const tab = state.tab === 'picture' ? 'picture' : 'bracket';
  const top = heading(`${state.season} Playoffs`) + tabs([['bracket', 'Bracket'], ['picture', 'Playoff Picture']], tab);
  if (tab === 'picture') return top + await standings(refresh, true);
  const [{ weeks }, ranks] = await Promise.all([read('playoffs', { season: state.season }, refresh), read('standings', { season: state.season }, refresh).catch(() => ({ conferences: [] }))]);
  if (!weeks.length) return top + empty('Postseason calendar unavailable for this season.');
  const conferences = ranks.conferences.map(c => ({ ...c, ids: new Set([...c.teams, ...c.divisions.flatMap(d => d.teams)].map(t => t.id)) }));
  const exhibitions = weeks.filter(w => /pro bowl|all.star/i.test(w.label));
  const rounds = weeks.filter(w => !exhibitions.includes(w));
  return top + `<div class="nfl-bracket" tabindex="0" aria-label="Playoff rounds">${rounds.map(w => {
    if (!w.available) currentWarnings.push(`${w.label} is unavailable.`);
    return `<section class="nfl-round"><h3>${e(w.label)}</h3><p class="nfl-muted">${e(w.detail)}${w.stale ? ' | Stale' : ''}</p>${!w.available ? empty('Matchups unavailable.') : !w.games.length ? empty('TBD - matchups have not been scheduled.') :
      w.games.map(g => { const c = conferences.find(c => g.competitors.every(t => c.ids.has(t.id))); return `${c ? `<p class="nfl-muted">${e(c.abbreviation || c.name)}</p>` : ''}${gameRow(g, link, true)}`; }).join('')}</section>`;
  }).join('')}</div>` + exhibitions.map(w => section(w.label, w.available ? gameList(w.games, link, 'TBD - exhibition schedule unavailable.') : empty('Exhibition information unavailable.'), w.detail)).join('');
}
async function byes(refresh) {
  const { weeks } = await read('byes', { season: state.season }, refresh);
  return heading('Bye Weeks', `${state.season} regular season`) + (weeks.map(w => section(w.label,
    !w.available ? empty('This week is unavailable. No byes have been inferred.') : w.byes === null ? empty('ESPN has not provided explicit bye information for this week.') : !w.byes.length ? empty('No teams on bye.') :
      `<div class="nfl-favorite-grid">${w.byes.map(teamLink).join('')}</div>`, `${w.detail}${w.stale ? ' | Stale' : ''}`)).join('') || empty('No regular-season calendar is available.'));
}
async function favorites(refresh) {
  const [data, favorites, settings] = await Promise.all([read('teams', { season: state.season }, refresh), api.loadFavorites(), api.settings()]);
  favoriteIds = new Set(favorites.map(t => t.team_id));
  favoriteTeams = new Map(data.teams.map(t => [t.id, t]));
  const known = new Set();
  const checkboxes = teams => teams.map(t => {
    known.add(t.id); favoriteTeams.set(t.id, t);
    return `<label class="nfl-favorite-row">${imageMarkup(t.logo, t.abbreviation)}<span>${e(t.name)}</span><input type="checkbox" data-favorite="${e(t.id)}" ${favoriteIds.has(t.id) ? 'checked' : ''} aria-label="Favorite ${e(t.name)}"></label>`;
  }).join('');
  let html = data.conferences.map(c => section(c.name, `<div class="nfl-favorite-grid">${c.divisions.map(d => `<section><h3>${e(d.name)}</h3>${checkboxes(d.teams)}</section>`).join('')}</div>`)).join('');
  const remaining = data.teams.filter(t => !known.has(t.id));
  if (remaining.length) html += section('Teams', `<div class="nfl-favorite-grid">${checkboxes(remaining)}</div>`, 'Division information unavailable');
  return `<div class="nfl-section-heading"><h2>Favorite Teams</h2><small id="nfl-favorite-count">${favoriteIds.size} selected</small></div>` + `<label class="nfl-preference"><input type="checkbox" id="nfl-home-visible" ${settings?.nfl_home_widget_visible !== false ? 'checked' : ''}>Show NFL favorites on homepage</label>` + html;
}
async function gameDetail(refresh) {
  const data = await read('game', { id: state.id }, refresh), g = data.game;
  lastGame = g;
  const tab = ['scoring', 'players', 'teams'].includes(state.tab) ? state.tab : 'scoring';
  const periods = [...new Set(g.competitors.flatMap(t => t.periods.map(p => p.period)))].sort((a, b) => a - b);
  const lines = periods.length ? table(['Team', ...periods.map(p => p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`), 'Total'], g.competitors.map(t => [teamLink(t), ...periods.map(p => e(t.periods.find(v => v.period === p)?.score ?? '-')), e(t.score)]), 'Scoring by period') : '';
  let html = '';
  if (tab === 'scoring') {
    const grouped = new Map(); data.scoring.forEach(p => { if (!grouped.has(p.period)) grouped.set(p.period, []); grouped.get(p.period).push(p); });
    html = [...grouped].map(([period, plays]) => section(period > 4 ? `Overtime ${period - 4}` : `Quarter ${period}`, plays.map(p => `<div class="nfl-scoring-play"><span class="nfl-muted">${e(p.clock)}</span>${imageMarkup(p.team.logo, p.team.abbreviation)}<span>${e(p.text)}</span><strong>${e(p.awayScore)} - ${e(p.homeScore)}</strong></div>`).join(''))).join('') || empty(g.state === 'pre' ? 'Scoring will appear when the game starts.' : 'Scoring plays are unavailable.');
  } else if (tab === 'players') {
    html = data.players.map(t => table(['Player', ...t.labels], t.rows.map(r => [playerLink(r.athlete), ...r.cells.map(e)]), `${t.team.name} - ${t.name}`)).join('') || empty('Player statistics are unavailable.');
  } else {
    const names = [...new Set(data.teams.flatMap(t => t.stats.map(s => s.name)))];
    html = table(['Statistic', ...data.teams.map(t => t.team.abbreviation)], names.map(name => [e(name), ...data.teams.map(t => e(t.stats.find(s => s.name === name)?.value || '-'))]), 'Team statistics');
  }
  return backLink() + `<div class="nfl-detail-heading"><div><h2>${e(g.name)}</h2><p class="nfl-muted">${e(dateLabel(g.date))} &middot; ${e(g.venue)} ${g.broadcast ? `&middot; ${e(g.broadcast)}` : ''}</p></div></div>` + gameRow(g, link) + lines + tabs([['scoring', 'Scoring'], ['players', 'Player Stats'], ['teams', 'Team Stats']], tab) + html;
}
const positionOrder = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P', 'LS'];
const positionGroup = p => ['OT', 'OG', 'G', 'C', 'T'].includes(p) ? 'OL' : ['DE', 'DT', 'NT'].includes(p) ? 'DL' : ['ILB', 'OLB'].includes(p) ? 'LB' : ['FS', 'SS'].includes(p) ? 'S' : p || 'Other';
async function teamDetail(refresh) {
  const t = await read('team', { season: state.season, id: state.id }, refresh);
  favoriteTeams.set(t.id, t);
  let favorite = false, favoriteAvailable = true;
  try { favorite = (await api.loadFavorites()).some(v => v.team_id === t.id); } catch (error) { currentWarnings.push(error.message); favoriteAvailable = false; }
  const tab = state.tab === 'roster' ? 'roster' : 'schedule';
  const record = t.standing ? `${t.standing.stats.wins}-${t.standing.stats.losses}-${t.standing.stats.ties} | ${t.standing.division}` : 'Season record unavailable';
  const top = backLink() + `<div class="nfl-detail-heading">${imageMarkup(t.logo, t.abbreviation)}<div><h2>${e(t.name)}</h2><p class="nfl-muted">${state.season} &middot; ${e(record)}</p></div><button class="nfl-control" data-favorite-button="${e(t.id)}" aria-pressed="${favorite}" ${!favoriteAvailable ? 'disabled' : ''} title="Toggle favorite team">${icon('heart')} ${favorite ? 'Favorited' : 'Favorite'}</button></div>` + tabs([['schedule', 'Schedule'], ['roster', 'Roster']], tab);
  try {
    if (tab === 'schedule') {
      const { games } = await read('schedule', { season: state.season, id: t.id, type: selected?.type || 2 }, refresh);
      return top + heading(calendar.periods.find(p => p.type === (selected?.type || 2))?.label || 'Schedule') + gameList(games, link);
    }
    const { athletes } = await read('roster', { season: state.season, id: t.id }, refresh);
    const groups = new Map();
    athletes.forEach(a => { const p = positionGroup(a.position); if (!groups.has(p)) groups.set(p, []); groups.get(p).push(a); });
    return top + [...groups].sort(([a], [b]) => {
      const i = positionOrder.indexOf(a), j = positionOrder.indexOf(b);
      return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b);
    }).map(([p, players]) => table(['Player', '#', 'Position', 'Age', 'Height', 'Weight', 'College'], players.sort((a, b) => (Number(a.jersey) || 999) - (Number(b.jersey) || 999)).map(a => [
      `${imageMarkup(a.image, a.name)} ${playerLink(a)}`, e(a.jersey), e(a.position), e(a.age), e(a.height), e(a.weight), e(a.college),
    ]), p)).join('') || top + empty('Roster unavailable.');
  } catch (error) { return top + empty(error.message); }
}
async function playerDetail(refresh) {
  const a = await read('player', { id: state.id }, refresh);
  const availableTabs = [['overview', 'Overview'], ['gamelog', 'Game Log'], ['season', 'Season Stats'], ['career', 'Career Stats'], ['splits', 'Splits'], ['news', 'News']];
  const tab = availableTabs.some(t => t[0] === state.tab) ? state.tab : 'overview';
  const top = backLink() + `<div class="nfl-detail-heading">${imageMarkup(a.image, a.name, 'portrait')}<div><h2>${e(a.name)}</h2><p class="nfl-muted">${e([a.position, a.jersey ? `#${a.jersey}` : ''].filter(Boolean).join(' | '))}</p>${a.team ? teamLink(a.team) : ''}</div></div>` + tabs(availableTabs, tab);
  if (tab === 'overview') {
    const facts = [['Age', a.age], ['Height', a.height], ['Weight', a.weight], ['College', a.college], ['Experience (years)', a.experience], ['Born', a.birthDate], ['Birthplace', a.birthPlace], ['Draft', a.draft], ['Status', a.status], ['Contract', a.contract], ...(a.ranks || []).map(r => [r.label, r.value])].filter(([, v]) => v);
    return top + (a.bio ? `<p>${e(a.bio)}</p>` : '') + `<dl class="nfl-facts">${facts.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>` +
      (a.injuries.length ? section('Injury Updates', a.injuries.map(i => `<p>${e(i.status)} ${e(i.detail)}</p>`).join('')) : '') + `<p class="nfl-muted">Current ESPN player profile. Statistics use the selected season.</p>` +
      ((a.links || []).length ? `<div class="nfl-tabs">${a.links.map(l => `<a class="nfl-control" href="${e(l.url)}" target="_blank" rel="noopener noreferrer">${new URL(l.url).hostname.endsWith('espn.com') ? 'ESPN ' : ''}${e(l.label)} ${icon('arrow-up-right')}</a>`).join('')}</div>` : '');
  }
  try {
    const data = await read('playerTab', { id: state.id, season: state.season, type: selected?.type || 2, tab }, refresh);
    if (tab === 'news') return top + (data.articles.map(n => `<article class="nfl-news"><a href="${e(n.url)}" target="_blank" rel="noopener noreferrer">${e(n.title)} ${icon('arrow-up-right')}</a><p>${e(n.description)}</p><small class="nfl-muted">${e(dateLabel(n.date))}</small></article>`).join('') || empty('No player-specific articles are available.'));
    return top + (tab === 'career' ? `<p class="nfl-muted">Career statistics through the latest available season.</p>` : heading(`${state.season} ${availableTabs.find(t => t[0] === tab)[1]}`)) +
      (data.tables.map(t => table(t.labels, [...t.rows.map(r => r.cells.map((c, i) => i === 0 && r.gameId ? `<a class="nfl-player-link" href="${e(link({ section: 'game', id: r.gameId, tab: 'scoring' }))}">${e(c)}</a>` : i === 1 && r.teamId ? `<a class="nfl-player-link" href="${e(link({ section: 'team', id: r.teamId, tab: 'schedule' }))}">${e(c)}</a>` : e(c))), ...(t.totals ? [t.totals.map(e)] : [])], t.name, t.titles)).join('') || empty('Statistics are unavailable.'));
  } catch (error) { return top + empty(error.message); }
}

async function render(refresh = false, polling = false) {
  const token = ++revision, scrollTop = content.scrollTop;
  navigation();
  busy = true; $('nfl-refresh').disabled = true;
  content.setAttribute('aria-busy', 'true');
  if (!polling) content.innerHTML = empty('Loading NFL...');
  currentWarnings = []; message(''); lastGame = null;
  try {
    if (!boot || refresh || polling) boot = await read('bootstrap', {}, refresh && !polling);
    if (token !== revision) return;
    const p = params(), season = Number(p.get('season')) || boot.calendar.year;
    if (!boot.seasons.includes(season)) throw new Error('That season is not in the ESPN season catalog. Use Today to return to the current season.');
    calendar = season === boot.calendar.year ? boot.calendar : await read('calendar', { season }, refresh && !polling);
    if (token !== revision) return;
    const hasWeek = p.has('week') && p.has('type');
    selected = hasWeek ? selectWeek(calendar, p.get('type'), p.get('week')) : season === boot.calendar.year ? activeWeek(calendar) : calendar.weeks.at(-1);
    state = { section: p.get('section') || 'games', season, id: p.get('id'), tab: p.get('tab') };
    if (![...sections.map(s => s[0]), 'game', 'team', 'player'].includes(state.section)) state.section = 'games';
    history.replaceState({}, '', link({ section: state.section, season, type: selected?.type, week: selected?.week }));
    controls();
    const renderer = { games, standings, playoffs, byes, favorites, game: gameDetail, team: teamDetail, player: playerDetail }[state.section];
    const html = await renderer(refresh);
    if (token !== revision) return;
    content.innerHTML = html;
    content.scrollTop = polling ? scrollTop : 0;
    message([...new Set(currentWarnings)].join(' '), currentWarnings.length > 0);
    $('nfl-updated').textContent = `${currentWarnings.length ? 'Some data unavailable or stale | ' : ''}ESPN | Updated ${eastern(updatedAt, { hour: 'numeric', minute: '2-digit' })} ET`;
  } catch (error) {
    if (token !== revision) return;
    message(error.message, true);
    if (!polling) content.innerHTML = empty('NFL could not load. Use Refresh to try again.');
  } finally {
    if (token === revision) { busy = false; $('nfl-refresh').disabled = false; content.setAttribute('aria-busy', 'false'); }
  }
}

document.querySelector('.nfl-page').addEventListener('click', async event => {
  const anchor = event.target.closest('a');
  if (anchor && new URL(anchor.href).pathname.endsWith('/nfl.html') && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
    event.preventDefault(); history.pushState({}, '', anchor.href); await render(); return;
  }
  const favorite = event.target.closest('[data-favorite-button]');
  if (favorite) {
    const pressed = favorite.getAttribute('aria-pressed') === 'true'; favorite.disabled = true;
    try { await api.setFavorite(favoriteTeams.get(favorite.dataset.favoriteButton), !pressed); favorite.setAttribute('aria-pressed', String(!pressed)); favorite.innerHTML = icon('heart') + (pressed ? ' Favorite' : ' Favorited'); message('Favorite saved.'); }
    catch (error) { message(error.message, true); } finally { favorite.disabled = false; }
  }
});
content.addEventListener('change', async event => {
  const input = event.target;
  if (!input.matches('[data-favorite], #nfl-home-visible')) return;
  const checked = input.checked; input.disabled = true;
  try {
    if (input.id === 'nfl-home-visible') await api.setVisibility(checked);
    else { await api.setFavorite(favoriteTeams.get(input.dataset.favorite), checked); if (checked) favoriteIds.add(input.dataset.favorite); else favoriteIds.delete(input.dataset.favorite); $('nfl-favorite-count').textContent = `${favoriteIds.size} selected`; }
    message('Saved.');
  } catch (error) { input.checked = !checked; message(error.message || 'Preference could not be saved.', true); }
  finally { input.disabled = false; }
});
$('nfl-mobile-section').addEventListener('change', event => navigate({ section: event.target.value, id: null, tab: null }));
$('nfl-season').addEventListener('change', event => navigate({ season: event.target.value }));
$('nfl-week').addEventListener('change', event => { const [type, week] = event.target.value.split(':'); navigate({ type, week }); });
$('nfl-prev').addEventListener('click', () => { const w = weekWindow(calendar, selected)[0]; if (w) navigate({ type: w.type, week: w.week }); });
$('nfl-next').addEventListener('click', () => { const w = weekWindow(calendar, selected)[2]; if (w) navigate({ type: w.type, week: w.week }); });
$('nfl-today').addEventListener('click', async () => { boot = null; history.pushState({}, '', 'nfl.html?section=games'); await render(true); });
$('nfl-refresh').addEventListener('click', () => render(true));
window.addEventListener('popstate', () => render());
window.addEventListener('storage', event => { if (event.key === 'centralis:nfl-change' && ['favorites', 'team'].includes(state?.section)) void render(false, true); });
installImageFallbacks(document.querySelector('.nfl-page'));
const header = document.querySelector('.site-header');
new ResizeObserver(() => document.documentElement.style.setProperty('--nfl-header-height', `${header.getBoundingClientRect().bottom}px`)).observe(header);
const stop = startPolling(() => render(true, true), () => !busy && state?.season === boot?.calendar.year &&
  (state?.section === 'games' || state?.section === 'game' && lastGame?.state === 'in'));
window.addEventListener('pagehide', event => { if (!event.persisted) stop(); });
void render();
