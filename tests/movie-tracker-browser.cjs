// Run against npm run dev, with MOVIE_TEST_BASE_URL to override its address.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.MOVIE_TEST_BASE_URL || 'http://127.0.0.1:4173';
const output = 'node_modules/.cache/movie-tracker/screenshots';
fs.mkdirSync(output, { recursive: true });

// Keep the real shared header and movie code. All account/data calls stay local.
const mock = `
window.centralisCurrentAppUser = { id: 42 };
window.centralisGetCurrentAppUser = async () => window.centralisCurrentAppUser;
const movieFixtures = Array.from({length: 125}, (_, i) => ({
  id: i + 1, user_id: 42, deleted: false,
  title: i === 0 ? 'A Very Long Movie Title That Should Wrap Without Pushing Controls Off Screen' : 'Movie ' + String(i + 1).padStart(3, '0'),
  year_released: 1900 + i, director: 'A Director With A Long Name',
  writers: 'Writer One, Writer Two', actors: 'Actor One, Actor Two',
  plot: 'A long plot description. '.repeat(50),
  franchise_id: i % 2 ? 1 : null, collection_id: 1,
  franchise: i % 2 ? {id: 1, name: 'A long franchise name that wraps on phones'} : null,
  collection: {id: 1, name: 'Favorites'}, poster_url: null
}));
window.centralisSupabase = {
  from(table) {
    let rows = table === 'movies' ? [...movieFixtures] : [{id: 1, name: table === 'franchise' ? 'A long franchise name that wraps on phones' : 'Favorites'}];
    let head = false, range = null;
    const orders = [];
    const q = {
      select(_, options) { head = options?.head; return q; },
      eq(key, value) { if (!['user_id', 'deleted'].includes(key)) rows = rows.filter(row => row[key] === value); return q; },
      is(key, value) { rows = rows.filter(row => row[key] === value); return q; },
      or(value) {
        const term = value.match(/title\\.ilike\\.%([^%]*)%/);
        if (term) rows = rows.filter(row => row.title.toLowerCase().includes(term[1].toLowerCase()));
        return q;
      },
      order(key, options) { orders.push([key, options]); return q; },
      range(from, to) { range = [from, to]; return q; },
      then(resolve) {
        rows.sort((a,b) => {
          for (const [key, options] of orders) {
            const result = String(a[key]).localeCompare(String(b[key]), undefined, {numeric:true}) * (options.ascending ? 1 : -1);
            if (result) return result;
          }
          return 0;
        });
        return Promise.resolve({data: head ? null : range ? rows.slice(range[0], range[1]+1) : rows, count: rows.length, error: null}).then(resolve);
      }
    }; return q;
  }
};
`;

async function noHorizontalOverflow(page, selector) {
  const failures = await page.locator(selector).evaluateAll(elements => elements
    .filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1)
    .map(el => ({tag: el.tagName, class: el.className, width: el.clientWidth, scroll: el.scrollWidth})));
  assert.deepEqual(failures, [], `Horizontal overflow: ${JSON.stringify(failures)}`);
}

async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  const result = await locator.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {ok: rect.x >= 0 && rect.right <= innerWidth + 1 && rect.y >= 0 && rect.bottom <= innerHeight + 1 && el.contains(hit), rect:rect.toJSON(), target:hit?.outerHTML.slice(0,200), element:el.outerHTML.slice(0,200)};
  });
  if (!result.ok) await locator.page().screenshot({path: `${output}/clipped.png`});
  assert.equal(result.ok, true, `Control is clipped or covered: ${JSON.stringify(result)}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const errors = [];
    const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: {width: 390, height: 844} });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base || url.pathname === '/supabase-config.js') return route.fulfill({body: ''});
      if (url.pathname === '/movie-tracker.js') {
        const response = await route.fetch();
        return route.fulfill({response, body: mock + '\n' + await response.text()});
      }
      return route.continue();
    });
    const ready = () => page.waitForFunction(() => document.querySelector('[data-movie-status]').textContent === '');

    for (const [width, height] of [[320,568], [390,844], [768,1024], [844,390], [1000,800]]) {
      await page.setViewportSize({width, height});
      await page.goto(base + '/movie-tracker.html');
      await ready();
      assert.equal(await page.locator('[data-movie-id]').count(), 50);
      assert.equal(await page.locator('[data-movie-filters]').getAttribute('open'), null);
      await noHorizontalOverflow(page, 'html, body, .movie-page, .movie-side-panel, .movie-table, .movie-clickable-row');
      await page.screenshot({path: `${output}/initial-${width}.png`});

      await page.locator('.movie-select-target').first().tap({position:{x:3,y:3}});
      assert.equal(await page.locator('[data-select-movie]').first().isChecked(), true, 'Entire touch label selects the movie');
      assert.equal(await page.locator('#movie-view-modal').isVisible(), false, 'Selecting does not open details');
      assert.equal(await page.locator('.movie-mobile-controls [data-select-all-movies]').evaluate(el => el.indeterminate), true);
      await page.locator('.movie-select-page').tap();
      assert.equal(await page.locator('[data-select-movie]:checked').count(), 50);
      await page.locator('[data-actions-toggle]').tap();
      await reachable(page.locator('[data-bulk-collection]'));
      await page.locator('[data-bulk-collection]').tap();
      await noHorizontalOverflow(page, '#movie-bulk-modal .modal-dialog');
      await page.locator('#movie-bulk-modal [data-close-modal-target]').first().tap();

      await page.locator('[data-movie-sort]').selectOption('year-desc');
      await ready();
      assert.equal(await page.locator('.movie-year-cell').first().textContent(), '2024');
      await page.locator('.movie-pagination-bottom [data-page-action="next"]').tap();
      await ready();
      assert.match(await page.locator('[data-movie-count]').textContent(), /^51-100/);
      await page.locator('.movie-pagination-top [data-page-action="last"]').tap();
      await ready();
      assert.equal(await page.locator('[data-movie-id]').count(), 25);
      assert.equal(await page.locator('.movie-pagination-bottom [data-page-action="next"]').isDisabled(), true);

      await page.locator('[data-search-movies]').fill('no matching movie');
      await ready();
      assert.equal(await page.locator('.movie-empty-row').textContent(), 'No movies found.');
      assert.equal(await page.locator('.movie-mobile-controls [data-select-all-movies]').isDisabled(), true);
      await page.locator('[data-search-movies]').fill('');
      await ready();
      await page.locator('.movie-filters summary').tap();
      await page.locator('[data-filter-franchise]').selectOption('1');
      await ready();
      assert.match(await page.locator('[data-movie-count]').textContent(), /of 62 movies/);
      await page.locator('[data-filter-franchise]').selectOption('all');
      await page.locator('[data-filter-collection]').selectOption('1');
      await ready();
      await page.locator('.movie-filters summary').tap();
      await page.locator('[data-movie-sort]').selectOption('title-asc');
      await ready();

      await page.locator('.movie-title-cell').first().tap();
      await noHorizontalOverflow(page, '#movie-view-modal .modal-dialog, #movie-view-modal .movie-dialog-layout');
      await reachable(page.locator('[data-edit-current-movie]'));
      await page.locator('[data-edit-current-movie]').tap();
      await noHorizontalOverflow(page, '#movie-edit-modal .modal-dialog, #movie-edit-modal .movie-form-grid');
      if (width === 390) await page.screenshot({path: `${output}/edit-mobile.png`});
      await reachable(page.locator('#movie-edit-modal button[type="submit"]'));
      await page.locator('#movie-edit-modal .movie-dialog-footer [data-close-modal-target]').tap();

      await page.locator('.movie-add-main').tap();
      await reachable(page.locator('[data-add-movie-form] button[type="submit"]'));
      await noHorizontalOverflow(page, '#add-movie-modal .modal-dialog');
      await page.locator('#add-movie-modal .dialog-actions [data-close-modal-target]').tap();
      await page.locator('[data-add-movie-menu-toggle]').tap();
      await reachable(page.locator('[data-open-bulk-add-movies]'));
      await page.locator('[data-open-bulk-add-movies]').tap();
      await page.locator('[name="bulk_title"]').fill('A batch movie');
      await page.locator('[data-bulk-add-row]').tap();
      assert.equal(await page.locator('.movie-bulk-add-row').count(), 1);
      await reachable(page.locator('[data-bulk-add-submit]'));
      await noHorizontalOverflow(page, '#movie-bulk-add-modal .modal-dialog');
      await page.locator('#movie-bulk-add-modal .movie-dialog-footer [data-close-modal-target]').tap();

      for (const [trigger, modal] of [['[data-open-import]', '#movie-import-modal'], ['[data-open-franchises]', '#manager-modal'], ['[data-open-missing-details]', '#movie-process-modal']]) {
        await page.locator('[data-actions-toggle]').tap();
        await reachable(page.locator(trigger));
        await page.locator(trigger).tap();
        await noHorizontalOverflow(page, modal + ' .modal-dialog');
        await reachable(page.locator(modal + ' [data-close-modal-target]').first());
        await page.locator(modal + ' [data-close-modal-target]').first().tap();
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({path: `${output}/mobile-${width}.png`});
      console.log(`Mobile checks passed at ${width}x${height}`);
    }

    await page.setViewportSize({width:1440, height:1000});
    await page.goto(base + '/movie-tracker.html');
    await ready();
    assert.equal(await page.locator('.movie-table').evaluate(el => getComputedStyle(el).display), 'table');
    assert.equal(await page.locator('[data-sidebar-toggle]').isVisible(), true);
    await page.locator('[data-sidebar-toggle]').click();
    await page.setViewportSize({width:390, height:844});
    await reachable(page.locator('.movie-add-main'));
    assert.equal(await page.locator('[data-search-movies]').isVisible(), true, 'Collapsed desktop sidebar does not hide mobile tools');
    await page.setViewportSize({width:1440, height:1000});
    await page.locator('[data-sidebar-toggle]').click();
    await page.locator('[data-sort-header="year"]').click();
    await ready();
    assert.equal(await page.locator('.movie-year-cell').first().textContent(), '2024');
    await page.screenshot({path:`${output}/desktop.png`});
    await page.setViewportSize({width:1024, height:768});
    await noHorizontalOverflow(page, 'html, .movie-page');
    await reachable(page.locator('.movie-pagination-top [data-page-action="next"]'));
    await page.screenshot({path:`${output}/laptop.png`});
    await page.setViewportSize({width:390, height:844});
    await page.evaluate(() => window.centralisApplyTheme({
      id:'test-light', label:'Test light', scheme:'light',
      colors:{page:'#f7fafc',surface:'#ffffff',field:'#f1f5f9',text:'#16212a',muted:'#526170',border:'#ccd6df',primary:'#78d5c8',secondary:'#5146b8',success:'#187747',danger:'#c42626'}
    }, {persist:false}));
    await noHorizontalOverflow(page, 'html, .movie-page');
    await page.screenshot({path:`${output}/mobile-light.png`});
    assert.deepEqual(errors, []);
    console.log('Movie Tracker browser checks passed: touch selection, sort, search, filters, pagination, dialogs, desktop and breakpoint changes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
