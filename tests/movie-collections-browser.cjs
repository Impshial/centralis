const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { isolateMoviePage } = require('./movie-tracker-fixture.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.MOVIE_TEST_BASE_URL || 'http://127.0.0.1:4173';
const output = 'node_modules/.cache/movie-tracker/screenshots';
fs.mkdirSync(output, {recursive:true});

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    for (const width of [390,1440]) {
      const context = await browser.newContext({viewport:{width,height:900},hasTouch:width<1000,isMobile:width<1000,acceptDownloads:true});
      const page = await context.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await isolateMoviePage(page,base);
      const ready = () => page.waitForFunction(() => window.centralisMovieTrackerLoaded && document.querySelector('[data-movie-status]').textContent !== 'Loading movies...' && document.querySelector('[data-movie-rows]').children.length);
      const search = async text => { await page.locator('[data-search-movies]').fill(text); await ready(); };
      const openAction = async selector => { await page.locator('[data-actions-toggle]').click(); await page.locator(selector).click(); };
      const counts = async total => { await ready(); assert.match(await page.locator('[data-movie-count]').textContent(),new RegExp('of '+total+' movies$')); };
      const edit = async () => { await page.locator('.movie-title-cell').first().click(); await page.locator('[data-edit-current-movie]').click(); };
      const save = async () => { await page.locator('#movie-edit-modal button[type="submit"]').click(); await page.locator('#movie-edit-modal').waitFor({state:'hidden'}); await ready(); };
      const reloadSearch = async title => { await page.reload(); await ready(); await search(title); };
      const assertMembership = async expected => {
        const actual = await page.locator('.movie-collection-cell').first().textContent();
        assert.equal(actual,expected.join(', ') || 'None');
      };
      await page.goto(base+'/movie-tracker.html'); await counts(125);
      if (width<1000) await page.locator('.movie-filters > summary').click();
      const filter=page.locator('[data-filter-collection]');
      await filter.locator('summary').click();
      await filter.locator('input[value="1"]').check(); await counts(63);
      await filter.locator('input[value="2"]').check(); await counts(94);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,'Collection dropdown fits the viewport');
      assert.equal(await filter.locator('details').getAttribute('open'),'','Dropdown stays open for multiple choices');
      await page.screenshot({path:`${output}/collections-filter-${width}.png`});
      await filter.locator('input[value="1"]').uncheck(); await counts(63);
      await filter.locator('input[value="__none"]').check(); await counts(94);
      await filter.locator('input[value="2"]').uncheck(); await counts(31);
      await filter.locator('input[value="all"]').check(); await counts(125);
      await filter.locator('input[value="all"]').focus(); await page.keyboard.press('Escape');
      assert.equal(await filter.locator('details').getAttribute('open'),null);
      assert.equal(await filter.locator('summary').evaluate(el=>el===document.activeElement),true);

      await page.locator('.movie-add-main').click();
      await page.locator('[data-add-movie-form] [name="title"]').fill('Added with multiple collections');
      await page.locator('[data-add-movie-form] [name="year_released"]').fill('2026');
      const addPicker=page.locator('[data-add-collection]');
      await addPicker.locator('summary').focus(); await page.keyboard.press('Enter');
      await addPicker.locator('input[value="1"]').check();
      await addPicker.locator('input[value="2"]').check();
      await addPicker.locator('summary').click();
      await page.locator('[data-add-movie-form] button[type="submit"]').click();
      await page.locator('#add-movie-modal').waitFor({state:'hidden'}); await ready();
      await reloadSearch('Added with multiple collections'); await counts(1);
      await assertMembership(['Favorites','Watch Again']);
      await edit();
      const editPicker=page.locator('[data-edit-movie-form] [data-collection-picker]');
      await editPicker.locator('summary').click();
      assert.equal(await editPicker.locator('input[value="1"]').isChecked(),true);
      assert.equal(await editPicker.locator('input[value="2"]').isChecked(),true);
      await editPicker.locator('input[value="1"]').uncheck(); await save();
      await reloadSearch('Added with multiple collections'); await assertMembership(['Watch Again']);
      await edit(); await editPicker.locator('summary').click();
      await editPicker.locator('[data-clear-collections]').click(); await save();
      await reloadSearch('Added with multiple collections'); await assertMembership([]);

      await edit(); await editPicker.locator('summary').click();
      await editPicker.locator('input[value="1"]').check(); await editPicker.locator('input[value="2"]').check();
      await page.evaluate(()=>{window.movieTestFailNextSave=true;});
      await page.locator('#movie-edit-modal button[type="submit"]').click();
      await page.waitForFunction(()=>document.querySelector('[data-edit-movie-status]').textContent==='Test save failed');
      assert.equal(await editPicker.locator('input[value="2"]').isChecked(),true,'Failed save retains selections');
      await save(); await reloadSearch('Added with multiple collections'); await assertMembership(['Favorites','Watch Again']);

      const downloadPromise=page.waitForEvent('download');
      await openAction('[data-export-movies]');
      const download=await downloadPromise;
      const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
      assert.equal(exported.format,'centralis.movie-export.v2');
      assert.deepEqual(exported.movies[0].collections,['Favorites','Watch Again']);
      exported.movies[0].title='Imported from export';
      await openAction('[data-open-import]');
      await page.locator('[data-import-file]').setInputFiles({name:'export.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
      await page.locator('[data-import-submit]').click();
      await page.waitForFunction(()=>document.querySelector('[data-import-status]').textContent.startsWith('Imported 1 movies.'));
      await page.locator('#movie-import-modal .modal-close').click();
      await search('Imported from export'); await counts(1); await assertMembership(['Favorites','Watch Again']);

      await openAction('[data-open-import]');
      await page.locator('[data-import-file]').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{title:'Legacy collection import',yearReleased:2000,collection:'Favorites'}]))});
      await page.locator('[data-import-submit]').click();
      await page.waitForFunction(()=>document.querySelector('[data-import-status]').textContent.startsWith('Imported 1 movies.'));
      await page.locator('#movie-import-modal .modal-close').click();
      await search('Legacy collection import'); await counts(1); await assertMembership(['Favorites']);
      await openAction('[data-open-import]');
      await page.locator('[data-import-file]').setInputFiles({name:'collections.csv',mimeType:'text/csv',buffer:Buffer.from('title,yearReleased,collections\nCSV collections,2026,Favorites;Watch Again')});
      await page.locator('[data-import-submit]').click();
      await page.waitForFunction(()=>document.querySelector('[data-import-status]').textContent.startsWith('Imported 1 movies.'));
      await page.locator('#movie-import-modal .modal-close').click();
      await search('CSV collections'); await counts(1); await assertMembership(['Favorites','Watch Again']);

      await page.locator('[data-add-movie-menu-toggle]').click();
      await page.locator('[data-open-bulk-add-movies]').click();
      await page.locator('[name="bulk_title"]').fill('Batch collections');
      await page.locator('[data-bulk-add-collection] summary').click();
      await page.locator('[data-bulk-add-collection] input[value="1"]').check();
      await page.locator('[data-bulk-add-collection] input[value="2"]').check();
      await page.locator('[data-bulk-add-collection] summary').click();
      await page.locator('[data-bulk-add-row]').click();
      assert.match(await page.locator('.movie-bulk-add-row').textContent(),/Favorites, Watch Again/);
      await page.locator('[data-bulk-add-submit]').click();
      await page.locator('#movie-bulk-add-modal').waitFor({state:'hidden'});
      await search('Batch collections'); await counts(1); await assertMembership(['Favorites','Watch Again']);

      await search('');
      await page.locator('[data-select-all-movies]:visible').check();
      await openAction('[data-bulk-collection]');
      await page.locator('#movie-bulk-modal [data-collection-picker] summary').click();
      await page.locator('#movie-bulk-modal input[value="2"]').check();
      await page.locator('#movie-bulk-modal [data-collection-picker] summary').click();
      await page.locator('#movie-bulk-modal button[type="submit"]').click();
      await page.locator('#movie-bulk-modal').waitFor({state:'hidden'}); await ready();
      assert.equal(await page.locator('.movie-collection-cell').evaluateAll(cells=>cells.every(cell=>cell.textContent==='Watch Again')),true,'Bulk replace applies to every selected movie');
      await search('Added with multiple collections'); await assertMembership(['Watch Again']);
      await edit(); await editPicker.locator('summary').click(); await editPicker.locator('input[value="1"]').check(); await save();
      await openAction('[data-open-collections]');
      page.once('dialog',dialog=>dialog.accept());
      await page.locator('[data-delete-manager="2"]').click();
      await page.locator('[data-delete-manager="2"]').waitFor({state:'detached'});
      await page.locator('#manager-modal .modal-close').click();
      await reloadSearch('Added with multiple collections'); await assertMembership(['Favorites']);
      assert.deepEqual(errors,[]);
      console.log(`Collection browser checks passed at ${width}px: filter union/empty/all, create, edit, clear, retry, reload, import/export, batch, bulk and deletion.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
