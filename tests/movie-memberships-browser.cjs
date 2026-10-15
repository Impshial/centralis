const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { isolateMoviePage } = require('./movie-tracker-fixture.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.MOVIE_TEST_BASE_URL || 'http://127.0.0.1:4173';
const output = 'node_modules/.cache/movie-tracker/screenshots';
fs.mkdirSync(output,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    for (const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<1000,isMobile:width<1000});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await isolateMoviePage(page,base);
      await page.addInitScript(()=>{
        if (localStorage.getItem('movie-test-tables')) return;
        const franchise=[{id:1,user_id:42,deleted:false,name:'First franchise'},{id:2,user_id:42,deleted:false,name:'Second franchise'}];
        localStorage.setItem('movie-test-tables',JSON.stringify({
          franchise, collections:[{id:1,user_id:42,deleted:false,name:'Favorites'},{id:2,user_id:42,deleted:false,name:'Watch Again'}],
          movies:Array.from({length:125},(_,i)=>({id:i+1,user_id:42,deleted:false,title:'Movie '+String(i+1).padStart(3,'0'),year_released:2000,
            collection_ids:[[1,2],[1],[2],[]][i%4],franchise_id:[1,2,null][i%3],franchise:franchise.find(f=>f.id===[1,2,null][i%3]) || null,downloaded:i%2===0}))
        }));
      });
      const ready=()=>page.waitForFunction(()=>document.querySelector('[data-movie-count]').textContent.includes('of 125 movies'));
      const action=(kind,operation)=>page.locator(`[data-bulk-membership="${kind}"][data-operation="${operation}"]`);
      const form=page.locator('[data-bulk-form]'), submit=form.locator('[type="submit"]');
      const movieRows=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('movie-test-tables')).movies);
      const selected=[1,2,3,4,51];
      const firstPage=async()=>{
        const first=page.locator('.movie-pagination-top [data-page-action="first"]');
        if(await first.isEnabled()) await first.click();
        await page.locator('[data-select-movie="1"]').waitFor();
      };
      const selectMovies=async()=>{
        await firstPage();
        for(const id of selected.slice(0,4)) await page.locator(`[data-select-movie="${id}"]`).check();
        await page.locator('.movie-pagination-top [data-page-action="next"]').click();
        await page.locator('[data-select-movie="51"]').check();
        assert.match(await action('collection','add').textContent(),/\(5\)/);
      };
      const openAction=async(kind,operation)=>{
        await page.locator('[data-actions-toggle]').click();
        await action(kind,operation).click();
        assert.equal(await submit.isDisabled(),true,'A target is always required');
        assert.equal(await submit.textContent(),operation==='add'?'Add':'Remove');
      };
      const choose=async(kind,id)=>{
        if(kind==='collection') {
          await form.locator('summary').click();
          await form.locator(`input[value="${id}"]`).check();
          await form.locator('summary').click();
        } else await form.locator('[name="lookup_id"]').selectOption(String(id));
        assert.equal(await submit.isEnabled(),true);
      };
      const save=async()=>{
        await submit.click();
        await page.locator('#movie-bulk-modal').waitFor({state:'hidden'});
        await ready();
        assert.match(await action('collection','add').textContent(),/\(0\)/);
      };
      await page.goto(base+'/movie-tracker.html'); await ready();
      assert.equal(await page.locator('[data-bulk-membership]:disabled').count(),4);
      assert.equal(await page.locator('[data-bulk-downloaded]').count(),0);
      await selectMovies(); await openAction('collection','add');
      await choose('collection',1);
      await form.locator('summary').click(); await form.locator('[data-clear-collections]').click();
      assert.equal(await submit.isDisabled(),true,'Clear selection disables submission');
      await form.locator('input[value="1"]').check(); await form.locator('summary').click();
      await page.evaluate(()=>{window.movieTestFailNextSave=true;});
      await submit.click();
      await page.waitForFunction(()=>document.querySelector('[data-bulk-status]').textContent==='Test save failed');
      assert.equal(await form.locator('input[value="1"]').isChecked(),true);
      assert.match(await action('collection','add').textContent(),/\(5\)/);
      await page.screenshot({path:`${output}/membership-retry-${width}.png`});
      await save();
      let rows=await movieRows();
      assert.deepEqual(rows.filter(row=>selected.includes(row.id)).map(row=>row.collection_ids),[[1,2],[1],[2,1],[1],[2,1]]);
      assert.deepEqual(rows[4].collection_ids,[1,2],'Unselected movies are untouched');
      const rpcArgs=await page.evaluate(()=>window.movieTestWrites.filter(write=>write.rpc).at(-1).args);
      assert.deepEqual(rpcArgs.p_movie_ids,selected,'RPC includes selections from both pages');
      await selectMovies(); await openAction('collection','add'); await choose('collection',1); await save();
      assert.equal(await page.locator('[data-movie-status]').textContent(),'No membership changes needed.');
      await selectMovies(); await openAction('collection','remove'); await choose('collection',1); await save();
      rows=await movieRows();
      assert.deepEqual(rows.filter(row=>selected.includes(row.id)).map(row=>row.collection_ids),[[2],[],[2],[],[2]]);
      await selectMovies(); await openAction('franchise','remove'); await choose('franchise',1); await save();
      rows=await movieRows();
      assert.deepEqual(rows.filter(row=>selected.includes(row.id)).map(row=>row.franchise_id),[null,2,null,null,null]);
      await selectMovies(); await openAction('franchise','add'); await choose('franchise',1);
      await page.screenshot({path:`${output}/membership-franchise-${width}.png`});
      await save();
      rows=await movieRows();
      assert.deepEqual(rows.filter(row=>selected.includes(row.id)).map(row=>row.franchise_id),[1,1,1,1,1]);
      await firstPage();
      await page.locator('.movie-title-cell').first().click();
      const labels=await page.locator('#movie-view-modal dt').allTextContents();
      for(const removed of ['ID','Downloaded','Franchise ID','Collection IDs','Created','Updated','Deleted','Deleted At','Deleted By']) assert.equal(labels.includes(removed),false,removed);
      assert.ok(labels.includes('Franchise') && labels.includes('Collections'));
      await page.screenshot({path:`${output}/movie-view-clean-${width}.png`});
      await page.locator('[data-edit-current-movie]').click();
      assert.equal(await page.locator('[data-edit-movie-form] [name="downloaded"]').count(),0);
      await page.locator('[data-edit-movie-form] [name="director"]').fill('Updated director');
      await page.locator('[data-edit-movie-form] button[type="submit"]').click();
      await page.locator('#movie-edit-modal').waitFor({state:'hidden'});
      await page.reload(); await ready();
      rows=await movieRows();
      assert.equal(rows[0].director,'Updated director');
      assert.equal(rows[0].downloaded,true,'Editing preserves stored Downloaded value');
      assert.equal(rows[1].downloaded,false);
      assert.deepEqual(rows[0].collection_ids,[2]);
      assert.deepEqual(errors,[]);
      console.log(`Membership UI checks passed at ${width}px: cross-page selections, add/remove, no-op, retry, franchise moves, clean details and preserved Downloaded values.`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
