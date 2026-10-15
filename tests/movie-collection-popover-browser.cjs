const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { isolateMoviePage } = require('./movie-tracker-fixture.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.MOVIE_TEST_BASE_URL || 'http://127.0.0.1:4173';
const output = 'node_modules/.cache/movie-tracker/screenshots';
fs.mkdirSync(output, {recursive:true});

async function expectCaret(picker, open) {
  await picker.locator('.movie-collection-caret').evaluate(async (icon, expanded) => {
    await Promise.all(icon.getAnimations().map(animation => animation.finished));
    const matrix = new DOMMatrix(getComputedStyle(icon).transform);
    if (Math.abs(matrix.a - (expanded ? -1 : 1)) > 0.01) throw new Error('Caret does not reflect dropdown state');
  }, open);
}

async function expectWithinViewport(options) {
  const bounds = await options.evaluate(el => {
    const box = el.getBoundingClientRect();
    return {left:box.left, top:box.top, right:box.right, bottom:box.bottom, width:innerWidth, height:innerHeight};
  });
  assert.ok(bounds.left >= 7 && bounds.right <= bounds.width - 7, JSON.stringify(bounds));
  assert.ok(bounds.top >= 7 && bounds.bottom <= bounds.height - 7, JSON.stringify(bounds));
}

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    for (const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]) {
      const context = await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000});
      const page = await context.newPage(), errors=[];
      page.on('pageerror', error => errors.push(error.message));
      await isolateMoviePage(page,base);
      await page.addInitScript(() => {
        localStorage.setItem('movie-test-tables', JSON.stringify({
          movies:[{id:1,user_id:42,deleted:false,title:'Popover test movie',year_released:2026,collection_ids:[],franchise_id:null}],
          franchise:[{id:1,user_id:42,deleted:false,name:'A long franchise name that needs room for its caret'}],
          collections:Array.from({length:25},(_,i)=>({id:i+1,user_id:42,deleted:false,name:`Collection ${String(i+1).padStart(2,'0')}`}))
        }));
      });
      await page.goto(base+'/movie-tracker.html');
      await page.waitForFunction(()=>document.querySelector('[data-movie-count]').textContent.includes('of 1 movies'));
      await page.evaluate(()=>customElements.whenDefined('ph-caret-down'));
      if (width<1000) await page.locator('.movie-filters > summary').click();
      const filter = page.locator('[data-filter-collection] [data-collection-picker]');
      const insets = await page.evaluate(() => {
        const select = document.querySelector('[data-filter-franchise]');
        const summary = document.querySelector('[data-filter-collection] summary');
        return [
          select.getBoundingClientRect().right - select.nextElementSibling.getBoundingClientRect().right,
          summary.getBoundingClientRect().right - summary.querySelector('ph-caret-down').getBoundingClientRect().right
        ];
      });
      assert.ok(insets.every(inset=>inset>=19 && inset<=22), `Both carets have an inset: ${insets}`);
      await filter.locator('summary').click();
      await filter.locator(':popover-open').waitFor();
      await expectCaret(filter,true);
      await expectWithinViewport(filter.locator('.movie-collection-options'));
      await page.screenshot({path:`${output}/filter-caret-${width}.png`});
      await page.keyboard.press('Escape');
      await expectCaret(filter,false);
      assert.equal(await filter.locator('summary').evaluate(el=>el===document.activeElement),true);
      await page.screenshot({path:`${output}/filter-carets-closed-${width}.png`});
      await page.locator('[data-filter-franchise]').selectOption('1');
      await page.waitForFunction(()=>document.querySelector('[data-movie-count]').textContent.includes('of 0 movies'));
      await page.locator('[data-filter-franchise]').selectOption('all');
      await page.waitForFunction(()=>document.querySelector('[data-movie-count]').textContent.includes('of 1 movies'));

      await page.locator('[data-select-all-movies]:visible').check();
      await page.locator('[data-actions-toggle]').click();
      await page.locator('[data-bulk-membership="collection"][data-operation="add"]').click();
      const dialog = page.locator('#movie-bulk-modal .modal-dialog');
      const picker = dialog.locator('[data-collection-picker]');
      const options = picker.locator('.movie-collection-options');
      await picker.locator('summary').scrollIntoViewIfNeeded();
      const dimensions = () => dialog.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,top:el.scrollTop}));
      const before = await dimensions();
      await picker.locator('summary').click();
      await options.locator(':scope:popover-open').waitFor();
      await expectCaret(picker,true);
      await expectWithinViewport(options);
      assert.deepEqual(await dimensions(),before,'Opening the list must not resize or scroll its dialog');
      const geometry = await options.evaluate(el=>{
        const menu=el.getBoundingClientRect(), modal=el.closest('.modal-dialog').getBoundingClientRect();
        const extendsOutside=menu.bottom>modal.bottom+1 || menu.top<modal.top-1;
        const y=menu.bottom>modal.bottom+1 ? Math.min(menu.bottom-4,modal.bottom+4) : Math.max(menu.top+4,modal.top-4);
        return {extendsOutside,hittable:el.contains(document.elementFromPoint(menu.x+menu.width/2,y))};
      });
      if (height>=568) {
        assert.equal(geometry.extendsOutside,true,'List extends outside the dialog');
        assert.equal(geometry.hittable,true,'List remains interactive outside the dialog');
      }
      await page.screenshot({path:`${output}/collection-popover-${width}.png`});
      await picker.locator('input[value="1"]').check();
      await options.hover();
      await page.mouse.wheel(0,240);
      await page.waitForFunction(()=>document.querySelector('#movie-bulk-modal .movie-collection-options').scrollTop>0);
      assert.equal(await options.evaluate(el=>el.matches(':popover-open')),true,'Scrolling the list keeps it open');
      assert.deepEqual(await dimensions(),before,'Scrolling choices must not scroll the dialog');
      await picker.locator('input[value="25"]').check();
      const values = await page.locator('[data-bulk-form]').evaluate(form=>new FormData(form).getAll('collection_ids'));
      assert.deepEqual(values,['1','25'],'Floating checkboxes still belong to the form');
      await page.keyboard.press('Escape');
      await expectCaret(picker,false);
      assert.equal(await options.isVisible(),false);
      await picker.locator('summary').click();
      await options.locator(':scope:popover-open').waitFor();
      // The menu can open upward over the title on short screens; use the dialog padding.
      await dialog.click({position:{x:4,y:20}});
      assert.equal(await options.isVisible(),false,'Outside click closes the list');
      await picker.locator('summary').click();
      await options.locator(':scope:popover-open').waitFor();
      // An upward-opening list may cover the close button, which remains keyboard accessible.
      await page.locator('#movie-bulk-modal .modal-close').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(':popover-open').count(),0,'Closing the dialog leaves no floating menu');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);
      console.log(`Popover checks passed at ${width}x${height}: stable dialog, independent scrolling, viewport fit, form values, dismissal and caret spacing/state.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
