const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const fixtures = JSON.parse(fs.readFileSync('node_modules/.cache/nfl/live-results.json', 'utf8'));
const header = fs.readFileSync('script.js', 'utf8').match(/const CENTRALIS_HEADER_MARKUP = `([\s\S]*?)`;/)[1];
const output = 'node_modules/.cache/nfl/screenshots';
fs.mkdirSync(output, { recursive: true });
const mock = `
document.querySelector('.site-header').innerHTML = ${JSON.stringify(header)};
document.querySelector('.app-shell').hidden = false;
window.centralisCurrentAppUser = { id: 42 };
window.centralisGetCurrentAppUser = async () => window.centralisCurrentAppUser;
let favorites = JSON.parse(localStorage.getItem('nfl-test-favorites') || '[]');
let settings = JSON.parse(localStorage.getItem('nfl-test-settings') || '{"nfl_home_widget_visible":true}');
window.centralisGetUserSettings = async () => settings;
window.centralisUpdateUserSettings = async value => {
  if (window.failSave) throw Error('Preference failed.');
  settings = { ...settings, ...value }; localStorage.setItem('nfl-test-settings', JSON.stringify(settings)); return settings;
};
window.centralisSupabase = {
  functions: { invoke: async (_, options) => {
    const response = await fetch('/nfl-test-api', {method:'POST',body:JSON.stringify(options.body)});
    return response.ok ? {data:await response.json()} : {error:{context:response}};
  } },
  from(table) {
    let mode='read', value; const filters=[];
    const q = {select(){return q},order(){return q},eq(k,v){filters.push([k,v]);return q},
      upsert(v){mode='add';value=v;return q}, delete(){mode='delete';return q},
      then(resolve) {
        if(window.failSave && mode!=='read') return Promise.resolve({error:{message:'Save failed'}}).then(resolve);
        if(mode==='add' && !favorites.some(t=>t.team_id===value.team_id)) favorites.push(value);
        if(mode==='delete') favorites=favorites.filter(t=>!filters.every(([k,v])=>t[k]===v));
        localStorage.setItem('nfl-test-favorites',JSON.stringify(favorites));
        return Promise.resolve({data:favorites,error:null}).then(resolve);
      }
    };return q;
  }
};
`;
const copy = value => JSON.parse(JSON.stringify(value));

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [], calls = [];
    const fixtureTime = new Date(fixtures.scoreboard.fetchedAt);
    await page.clock.install({ time: fixtureTime });
    let failure = '', optionalFailure = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'warning' && msg.text().includes('Phosphor')) errors.push(msg.text()); });
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.pathname === '/script.js') return route.fulfill({ contentType: 'text/javascript', body: mock });
      if (u.pathname === '/supabase-config.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (u.pathname === '/nfl-test-api') {
        const b = route.request().postDataJSON(); calls.push(b);
        if (b.action === failure || optionalFailure && b.action === 'playerTab') return route.fulfill({ status: 502, json: { error: 'Test provider unavailable.' } });
        let key = b.action === 'playerTab' ? 'player-' + b.tab : b.action;
        if (b.action === 'scoreboard') {
          if (b.week === fixtures.scoreboard.data.games[0].week - 1 && fixtures['previous-scoreboard']) key = 'previous-scoreboard';
          if (b.week === fixtures.scoreboard.data.games[0].week + 1 && fixtures['next-scoreboard']) key = 'next-scoreboard';
        }
        if (b.season === fixtures['historical-calendar'].data.year && fixtures['historical-' + key]) key = 'historical-' + key;
        const r = copy(fixtures[key]);
        if (!r) throw new Error('Missing fixture ' + key);
        if (b.action === 'scoreboard') {
          r.data.games = r.data.games.map(g => ({ ...g, week: b.week }));
        }
        if (b.action === 'team' && b.id) r.data.id = b.id;
        return route.fulfill({ json: r });
      }
      if (u.hostname !== '127.0.0.1' && !u.hostname.endsWith('espncdn.com')) return route.fulfill({ status: 200, body: '' });
      return route.continue();
    });
    await page.addInitScript(() => localStorage.setItem('centralis-theme', 'nebula'));
    const base = 'http://127.0.0.1:4187';
    const ready = async () => {
      await page.waitForFunction(() => document.querySelector('#nfl-content')?.getAttribute('aria-busy') === 'false');
      await page.waitForTimeout(100);
    };
    await page.goto(base + '/nfl.html'); await ready();
    await page.waitForFunction(() => [...document.querySelectorAll('.nfl-image img')].some(img => img.complete && img.naturalWidth > 0));
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#nfl-content > .nfl-section').count(), 1);
    assert.ok(await page.locator('.nfl-game-card').count() > 0);
    assert.equal(await page.locator('#nfl-content .nfl-tabs').count(), 0, 'Games uses the toolbar, not week tabs');
    assert.equal(calls.filter(c => c.action === 'scoreboard').length, 1, 'Load only the visible week');
    const centerWeek = await page.locator('#nfl-week').inputValue();
    const borderBefore = await page.locator('.nfl-game-card').first().evaluate(el => getComputedStyle(el).borderTopColor);
    await page.locator('.nfl-game-card-open').first().hover({ position: { x: 5, y: 5 } });
    const borderHover = await page.locator('.nfl-game-card').first().evaluate(el => getComputedStyle(el).borderTopColor);
    assert.notEqual(borderHover, borderBefore, 'Game card has a visible hover border');
    await page.screenshot({ path: path.join(output, 'games-dark-desktop.png') });
    await page.getByRole('button', { name: 'Previous week', exact: true }).click(); await ready();
    assert.equal(calls.filter(c => c.action === 'scoreboard').at(-1).week, Number(centerWeek.split(':')[1]) - 1);
    const browsedWeek = await page.locator('#nfl-week').inputValue();
    assert.notEqual(browsedWeek, centerWeek);
    await page.reload(); await ready();
    assert.equal(await page.locator('#nfl-week').inputValue(), browsedWeek);
    const browsedUrl = page.url();
    await page.locator('.nfl-game-card .nfl-team-link').first().click(); await ready();
    assert.match(page.url(), /section=team/);
    await page.getByRole('link', { name: 'NFL Games', exact: true }).click(); await ready();
    assert.equal(await page.locator('#nfl-week').inputValue(), browsedWeek);
    await page.goto(browsedUrl); await ready();
    await page.locator('.nfl-game-card-open').first().focus();
    assert.equal(await page.locator('.nfl-game-card-open').first().evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await page.keyboard.press('Enter'); await ready();
    assert.match(page.url(), /section=game/);
    await page.goBack(); await ready();
    assert.equal(await page.locator('#nfl-week').inputValue(), browsedWeek);
    await page.locator('#nfl-week').selectOption(centerWeek); await ready();
    const initial = page.url();
    await page.getByRole('button', { name: 'Next week', exact: true }).click(); await ready();
    assert.notEqual(page.url(), initial);
    await page.goBack(); await ready(); assert.equal(page.url(), initial);
    await page.goForward(); await ready();
    await page.locator('.nfl-game-card-open').first().click({ position: { x: 5, y: 5 } }); await ready();
    assert.match(page.url(), /section=game/);
    for (const tab of ['Player Stats', 'Team Stats', 'Scoring']) { await page.getByRole('link', { name: tab, exact: true }).click(); await ready(); }
    await page.screenshot({ path: path.join(output, 'game-desktop.png') });
    await page.locator('.nfl-team-link').first().click(); await ready();
    await page.getByRole('link', { name: 'Roster', exact: true }).click(); await ready();
    assert.ok(await page.locator('.nfl-player-link').count() > 0);
    await page.locator('.nfl-player-link').first().click(); await ready();
    for (const tab of ['Game Log', 'Season Stats', 'Career Stats', 'Splits', 'News', 'Overview']) {
      await page.getByRole('navigation', { name: 'Detail views' }).getByRole('link', { name: tab, exact: true }).click(); await ready();
      assert.match(await page.locator('.nfl-detail-heading h2').textContent(), /Mahomes/);
    }
    await page.screenshot({ path: path.join(output, 'player-desktop.png') });
    optionalFailure = true;
    await page.getByRole('link', { name: 'Splits', exact: true }).click(); await ready();
    await page.getByRole('button', { name: 'Refresh NFL data', exact: true }).click(); await ready();
    assert.match(await page.locator('.nfl-detail-heading h2').textContent(), /Mahomes/);
    optionalFailure = false;
    for (const section of ['Standings', 'Playoffs', 'Bye Weeks', 'Favorites']) {
      await page.locator('#nfl-nav').getByRole('link', { name: section, exact: true }).click(); await ready();
      await page.screenshot({ path: path.join(output, section.toLowerCase().replaceAll(' ', '-') + '-desktop.png') });
      if (section === 'Standings') {
        const divisionOrder = await page.locator('.nfl-table tbody .nfl-team-link').allTextContents();
        await page.getByRole('link', { name: 'Conferences', exact: true }).click(); await ready();
        const conferenceRows = await page.locator('.nfl-table').evaluateAll(tables => tables.map(table => [...table.tBodies[0].rows].map(row => ({
          name: row.cells[0].textContent, wins: Number(row.cells[1].textContent), losses: Number(row.cells[2].textContent),
        }))));
        for (const rows of conferenceRows) {
          assert.deepEqual(rows, [...rows].sort((a, b) => b.wins - a.wins || a.losses - b.losses));
          assert.equal(rows.length, 16, 'Each conference contains every division');
        }
        assert.notDeepEqual(await page.locator('.nfl-table tbody .nfl-team-link').allTextContents(), divisionOrder);
        await page.screenshot({ path: path.join(output, 'conferences-desktop.png') });
        await page.getByRole('link', { name: 'Divisions', exact: true }).click(); await ready();
        assert.deepEqual(await page.locator('.nfl-table tbody .nfl-team-link').allTextContents(), divisionOrder);
      }
      if (section === 'Playoffs') {
        await page.getByRole('link', { name: 'Playoff Picture', exact: true }).click(); await ready();
        for (const seeds of await page.locator('.nfl-table').evaluateAll(tables => tables.map(t => [...t.tBodies[0].rows].map(r => Number(r.cells[0].textContent))))) {
          assert.deepEqual(seeds, [...seeds].sort((a, b) => a - b), 'Playoff picture remains seed ordered');
        }
        await page.getByRole('link', { name: 'Bracket', exact: true }).click(); await ready();
      }
    }
    const favorite = page.locator('[data-favorite]').first();
    await favorite.check(); await page.waitForFunction(() => document.querySelector('#nfl-notice').textContent === 'Saved.');
    assert.equal(await favorite.isChecked(), true);
    await page.evaluate(() => window.failSave = true);
    await favorite.click(); await page.waitForFunction(() => document.querySelector('#nfl-notice').textContent.includes('could not'));
    assert.equal(await favorite.isChecked(), true);
    await page.evaluate(() => window.failSave = false);
    await page.locator('#nfl-home-visible').uncheck(); await page.waitForFunction(() => document.querySelector('#nfl-notice').textContent === 'Saved.');
    await page.reload(); await ready(); assert.equal(await page.locator('#nfl-home-visible').isChecked(), false);
    await page.goto(base + '/index.html'); await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-home-nfl]').isVisible(), false);
    await page.goto(base + '/nfl.html?section=favorites'); await ready();
    await page.locator('#nfl-home-visible').check(); await page.waitForFunction(() => document.querySelector('#nfl-notice').textContent === 'Saved.');
    const favoriteGame = fixtures.scoreboard.data.games.find(g => g.state === 'in') || fixtures.scoreboard.data.games[0];
    const homeFavorites = favoriteGame.competitors.map(t => ({ user_id: 42, team_id: t.id, team_name: t.name, team_logo: t.logo }));
    await page.evaluate(value => localStorage.setItem('nfl-test-favorites', JSON.stringify(value)), homeFavorites);
    const homeCalls = calls.length;
    await page.goto(base + '/index.html');
    const homeReady = () => page.waitForFunction(() => document.querySelector('[data-home-nfl]')?.getAttribute('aria-busy') === 'false');
    await homeReady();
    const home = page.locator('[data-home-nfl]');
    assert.equal(await home.isVisible(), true);
    const homeBoards = calls.slice(homeCalls).filter(c => c.action === 'scoreboard');
    assert.equal(homeBoards.length, 1, 'Homepage fetches only one week');
    assert.equal(homeBoards[0].week, favoriteGame.week, 'Homepage fetches the active week');
    assert.equal(await home.locator('.nfl-game-row').count(), 1, 'Both favorite teams in one game must not duplicate it');
    assert.equal(new URL(await home.locator('.nfl-game-open').getAttribute('href'), base).searchParams.get('id'), favoriteGame.id);
    assert.equal(await home.getByRole('heading', { name: /^(Live|Upcoming|Recent)$/ }).count(), 0, 'No past/following game groups');
    const panelStyle = await page.evaluate(() => ['.home-glance-section', '.home-nfl-panel'].map(selector => {
      const s = getComputedStyle(document.querySelector(selector));
      return Object.fromEntries(['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderColor', 'borderRadius', 'backgroundImage', 'boxShadow', 'padding'].map(key => [key, s[key]]));
    }));
    assert.deepEqual(panelStyle[1], panelStyle[0], 'NFL uses the same border, shading, padding and shadow as other dashboard panels');
    assert.notEqual(panelStyle[1].backgroundImage, 'none');
    assert.equal(panelStyle[1].borderTopWidth, '1px');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await home.scrollIntoViewIfNeeded();
      const layout = await home.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, pageWidth: innerWidth, pageScroll: document.documentElement.scrollWidth }));
      assert.ok(layout.scroll <= layout.width + 1 && layout.pageScroll <= layout.pageWidth + 1, `Homepage widget overflow: ${JSON.stringify(layout)}`);
      await page.screenshot({ path: path.join(output, `home-widget-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    failure = 'scoreboard';
    await page.clock.fastForward(61000); await homeReady();
    assert.equal(await home.locator('.nfl-game-row').count(), 1, 'Same-week refresh failures preserve known scores');
    assert.match(await home.textContent(), /unavailable or stale/);
    const weeks = fixtures.bootstrap.data.calendar.weeks;
    const currentIndex = weeks.findIndex(w => w.type === homeBoards[0].type && w.week === homeBoards[0].week);
    await page.clock.setSystemTime(new Date(Date.parse(weeks[currentIndex + 1].start) + 1000));
    await page.clock.fastForward(61000); await homeReady();
    assert.equal(await home.locator('.nfl-game-row').count(), 0, 'A failed new week must not display last week');
    failure = '';
    await page.clock.setSystemTime(new Date(Date.parse(weeks.at(-1).end) + 86400000));
    await page.reload(); await homeReady();
    assert.match(await home.textContent(), /Offseason/);
    assert.equal(await home.locator('.home-nfl-panel').count(), 1, 'Offseason remains in the dashboard panel');
    await page.clock.setSystemTime(fixtureTime);
    await page.evaluate(() => localStorage.setItem('nfl-test-favorites', '[]'));
    await page.reload(); await homeReady();
    assert.match(await home.textContent(), /No favorite teams yet/);
    assert.equal(await home.locator('.home-nfl-panel').count(), 1, 'Empty favorites retain the dashboard panel');
    await page.evaluate(value => localStorage.setItem('nfl-test-favorites', JSON.stringify(value)), [{ user_id: 42, team_id: '999999', team_name: 'Idle Team' }]);
    await page.reload(); await homeReady();
    assert.match(await home.textContent(), /No favorite-team games this week/);
    await page.evaluate(value => localStorage.setItem('nfl-test-favorites', JSON.stringify(value)), homeFavorites);
    await page.goto(base + '/nfl.html'); await ready();
    failure = 'scoreboard';
    await page.getByRole('button', { name: 'Refresh NFL data', exact: true }).click(); await ready();
    assert.match(await page.locator('#nfl-notice').textContent(), /last successful/);
    assert.ok(await page.locator('.nfl-game-card').count() > 0);
    failure = '';
    const previousYear = fixtures['historical-calendar'].data.year;
    await page.locator('#nfl-season').selectOption(String(previousYear)); await ready();
    assert.match(page.url(), new RegExp('season=' + previousYear));
    await page.getByRole('button', { name: 'Today', exact: true }).click(); await ready();
    for (const [week, button] of [[fixtures.bootstrap.data.calendar.weeks[0], 'Previous week'], [fixtures.bootstrap.data.calendar.weeks.at(-1), 'Next week']]) {
      await page.goto(`${base}/nfl.html?section=games&type=${week.type}&week=${week.week}&tab=following`); await ready();
      assert.equal(await page.getByRole('button', { name: button, exact: true }).isDisabled(), true);
      assert.equal(new URL(page.url()).searchParams.has('tab'), false, 'Remove obsolete week tabs from Games URLs');
      assert.equal(await page.locator('#nfl-content .nfl-tabs').count(), 0);
    }
    for (const width of [2560, 1920, 1440, 1024, 760, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const section of ['games', 'standings', 'playoffs', 'favorites', 'game', 'team', 'player']) {
        const detail = { game:'&id=401872981&tab=players', team:'&id=3&tab=roster', player:'&id=3139477&tab=splits' }[section] || '';
        await page.goto(`${base}/nfl.html?section=${section}${detail}`); await ready();
        const sizes = await page.evaluate(() => ({
          w: innerWidth, sw: document.documentElement.scrollWidth,
          h: innerHeight, sh: document.documentElement.scrollHeight,
          top: document.querySelector('.nfl-page').getBoundingClientRect().top,
          header: document.querySelector('.site-header').getBoundingClientRect().bottom,
          left: document.querySelector('.nfl-page').getBoundingClientRect().left,
          right: document.querySelector('.nfl-page').getBoundingClientRect().right,
        }));
        assert.ok(sizes.sw <= sizes.w + 1, `Horizontal overflow ${width}/${section}: ${JSON.stringify(sizes)}`);
        assert.ok(sizes.sh <= sizes.h + 1, `Page scroll ${width}/${section}: ${JSON.stringify(sizes)}`);
        assert.ok(sizes.top >= sizes.header - 1, 'Header overlap');
        assert.ok(sizes.left <= 16 && sizes.w - sizes.right <= 16, 'NFL fills the available width');
        if (section === 'games') {
          const cards = await page.locator('.nfl-game-card').evaluateAll(cards => cards.slice(0, 2).map(c => ({ x: c.offsetLeft, y: c.offsetTop })));
          assert.equal(cards[0].y === cards[1].y, width >= 1440, 'Two columns on wide screens, one on narrow screens');
          const overflow = await page.locator('.nfl-game-card').evaluateAll(cards => cards.some(c => c.scrollWidth > c.clientWidth + 1));
          assert.equal(overflow, false, 'Card text stays within its border');
        }
        if ([320, 390, 1440, 1920].includes(width)) await page.screenshot({ path: path.join(output, `${section}-${width}.png`) });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + '/nfl.html'); await ready();
    await page.getByRole('button', { name: 'Next week', exact: true }).click(); await ready();
    const pollingWeek = await page.locator('#nfl-week').inputValue();
    const currentCalls = calls.length;
    await page.clock.fastForward(61000); await ready();
    assert.ok(calls.length > currentCalls, 'Current scoreboards should refresh every minute');
    assert.equal(await page.locator('#nfl-week').inputValue(), pollingWeek, 'Polling preserves the selected week');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, value:true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hiddenCalls = calls.length;
    await page.clock.fastForward(61000); assert.equal(calls.length, hiddenCalls, 'Hidden tab should not poll');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, value:false }); document.dispatchEvent(new Event('visibilitychange')); });
    await ready();
    await page.locator('#nfl-season').selectOption(String(previousYear)); await ready();
    const historicalCalls = calls.length;
    await page.clock.fastForward(61000); assert.equal(calls.length, historicalCalls, 'Historical view should not poll');
    await page.getByRole('button', { name:'Today', exact:true }).click(); await ready();
    await page.evaluate(() => {
      const root = document.documentElement;
      root.dataset.colorScheme = 'light'; root.style.colorScheme = 'light';
      const colors = { page:'#f4f6f8',surface:'#ffffff',field:'#f3f5f7',text:'#17222b',muted:'#586674',border:'#c7d0d9',primary:'#087767',secondary:'#5146b8',success:'#167547',danger:'#b52532' };
      Object.entries(colors).forEach(([k,v]) => root.style.setProperty('--theme-' + k,v));
    });
    await page.screenshot({ path: path.join(output, 'games-light-desktop.png') });
    await page.setViewportSize({ width:390, height:844 });
    await page.screenshot({ path: path.join(output, 'games-light-mobile.png') });
    assert.deepEqual(errors, []);
    console.log(`NFL browser checks passed. ${calls.length} API requests; screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
