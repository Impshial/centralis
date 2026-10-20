const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {isolateMoviePage}=require('./movie-tracker-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.MOVIE_TEST_BASE_URL || 'http://127.0.0.1:4173';
const output='node_modules/.cache/movie-tracker/screenshots';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  for(const width of [320,390,1440]) {
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<1000,hasTouch:width<1000,acceptDownloads:true});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await isolateMoviePage(page,base);
   await page.goto(base+'/movie-tracker.html');
   await page.waitForFunction(()=>document.querySelector('[data-movie-count]').textContent.includes('of 125 movies'));
   await page.evaluate(()=>{movieTestTables.movies[0].downloaded=true;});
   const action=async selector=>{await page.locator('[data-actions-toggle]').click();await page.locator(selector).click();};
   const manager=page.locator('#movie-fields-modal'),form=manager.locator('form');
   const defs=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('movie-test-tables')).movie_custom_fields);
   const saved=()=>page.waitForFunction(()=>document.querySelector('[data-field-status]').textContent==='Fields updated.' && !document.querySelector('[data-field-form] button[type="submit"]').disabled);
   await action('[data-manage-movie-fields]');
   assert.equal(await manager.locator('[data-field-list] .movie-field-row').count(),0);
   const add=async(name,type,options='',visible=true)=>{
    await form.locator('[name="name"]').fill(name);await form.locator('[name="field_type"]').selectOption(type);
    if(type==='dropdown') await form.locator('[name="options"]').fill(options);
    await form.locator('[name="visible"]').setChecked(visible);
    await form.locator('[type="submit"]').click();await saved();
   };
   await add('Watched','checkbox');await add('My score','number');await add('Watched on','date');
   await add('Review','long_text','',false);await add('Recommended by','text');await add('Opinion','dropdown','Loved\nHated');
   await form.locator('[data-field-preset]').selectOption('Downloaded');
   assert.equal(await form.locator('[name="copy_downloaded"]').isChecked(),false);
   await form.locator('[name="copy_downloaded"]').check();await form.locator('[type="submit"]').click();await saved();
   let fields=await defs();const id=name=>fields.find(f=>f.name===name).id;
   assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem('movie-test-tables')).movies[0].custom_values[key],id('Downloaded')),true);
   await page.screenshot({path:`${output}/custom-field-manager-${width}.png`});
   await manager.locator('[data-fields-close]').click();
   assert.equal(await page.locator('[data-custom-column]').count(),6);
   assert.equal(await page.locator('.movie-custom-cell input').count(),0,'Columns are read-only');
   const edit=async(movie)=>{await page.locator(`[data-movie-id="${movie}"] .movie-title-cell`).click();await page.locator('[data-edit-current-movie]').click();};
   const input=name=>page.locator(`[data-movie-custom-input="${id(name)}"]`);
   const save=async()=>{await page.locator('[data-edit-movie-form] [type="submit"]').click();await page.locator('#movie-edit-modal').waitFor({state:'hidden'});};
   await edit(1);await input('Watched').check();await input('My score').fill('2.5');await input('Watched on').fill('2026-10-20');
   await input('Review').fill('Great <b>movie</b>\nSecond line');await input('Recommended by').fill('Alice');await input('Opinion').selectOption('Loved');
   await page.evaluate(()=>{window.movieTestFailNextSave=true;});await page.locator('[data-edit-movie-form] [type="submit"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-edit-movie-status]').textContent==='Test save failed');
   assert.equal(await input('Review').inputValue(),'Great <b>movie</b>\nSecond line');await save();
   await page.locator('.movie-pagination-top [data-page-action="last"]').click();await page.locator('[data-movie-id="125"]').waitFor();
   await edit(125);await input('Watched').check();await input('My score').fill('10');await input('Watched on').fill('2026-01-01');await input('Opinion').selectOption('Hated');await save();
   await page.locator('.movie-pagination-top [data-page-action="first"]').click();await page.locator('[data-movie-id="1"]').waitFor();
   if(width<1000) await page.locator('.movie-filters > summary').click();
   await page.locator('[data-custom-field-filters] > summary').click();
   const filter=name=>page.locator(`[data-custom-filter="${id(name)}"]`);
   const count=async total=>page.waitForFunction(n=>document.querySelector('[data-movie-count]').textContent.endsWith(`of ${n} movies`),total);
   const clear=async()=>{await page.locator('[data-clear-custom-filters]').click();await count(125);};
   await filter('My score').first().fill('5');await filter('My score').first().press('Tab');await count(1);
   assert.equal(await page.locator('[data-movie-id]').first().getAttribute('data-movie-id'),'125','Filter finds a movie beyond the first page');await clear();
   await filter('Watched').selectOption('false');await count(123);await clear();
   await filter('Opinion').selectOption('Loved');await count(1);await clear();
   await filter('Review').fill('Great');await filter('Review').press('Tab');await count(1);await clear();
   await filter('Watched on').first().fill('2026-09-01');await filter('Watched on').first().press('Tab');await count(1);await clear();
   await page.locator('[data-custom-field-sort]').selectOption(`custom:${id('My score')}:desc`);
   await page.waitForFunction(()=>document.querySelector('[data-movie-id]')?.dataset.movieId==='125');
   await page.locator('[data-custom-field-sort]').selectOption(`custom:${id('My score')}:asc`);
   await page.waitForFunction(()=>document.querySelector('[data-movie-id]')?.dataset.movieId==='1');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(width>1000) {
    assert.ok(await page.locator('.movie-custom-cell').first().evaluate(el=>el.getBoundingClientRect().width>=130),'Custom columns retain readable widths');
    await page.locator('[data-movie-id="1"] .movie-custom-cell').last().scrollIntoViewIfNeeded();
    const bounds=await page.locator('[data-movie-id="1"] .movie-custom-cell').last().boundingBox();
    assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width,'Custom columns are reachable by horizontal scrolling');
   }
   await page.screenshot({path:`${output}/custom-field-columns-${width}.png`});
   await action('[data-manage-movie-fields]');await manager.locator(`[data-field-edit="${id('Watched')}"]`).click();
   await form.locator('[name="name"]').fill('Seen');await form.locator('[name="visible"]').uncheck();
   await page.evaluate(()=>{window.movieTestFailNextSave=true;});await form.locator('[type="submit"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-field-status]').textContent==='Test save failed');
   assert.equal(await form.locator('[name="name"]').inputValue(),'Seen');await form.locator('[type="submit"]').click();await saved();
   fields=await defs();await manager.locator(`[data-field-up="${id('Downloaded')}"]`).click();await saved();
   assert.equal((await defs()).find(f=>f.name==='Downloaded').sort_order,5);
   await manager.locator('[data-fields-close]').click();
   assert.equal(await page.locator('[data-custom-column]').count(),5);
   await page.locator('[data-movie-id="1"] .movie-title-cell').click();
   assert.ok((await page.locator('#movie-view-modal dt').allTextContents()).includes('Seen'));
   assert.equal(await page.locator('#movie-view-modal .movie-custom-detail b').count(),0,'Custom text is escaped');
   assert.match(await page.locator('#movie-view-modal').textContent(),/Great <b>movie<\/b>/);
   await page.locator('#movie-view-modal .modal-close').click();
   const downloadPromise=page.waitForEvent('download');await action('[data-export-movies]');const download=await downloadPromise;
   const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
   assert.equal(exported.format,'centralis.movie-export.v3');assert.equal(exported.custom_fields.length,7);assert.equal(exported.movies.length,125);
   const movie=exported.movies.find(m=>m.title.startsWith('A Very'));assert.equal(movie.custom_fields[id('My score')],2.5);
   const portable={...exported,movies:[{...movie,title:'Imported custom movie'}]};
   const importFile=async(name,data)=>{
    await action('[data-open-import]');await page.locator('[data-import-file]').setInputFiles({name,mimeType:name.endsWith('.json')?'application/json':'text/csv',buffer:Buffer.from(data)});
    await page.locator('[data-import-submit]').click();await page.waitForFunction(()=>document.querySelector('[data-import-status]').textContent.startsWith('Imported 1 movies.'));
    await page.locator('#movie-import-modal .modal-close').click();
   };
   await importFile('custom.json',JSON.stringify(portable));
   await importFile('custom.csv','title,yearReleased,custom:My score,custom:Seen\nCSV custom movie,2026,7.25,yes');
   let tables=await page.evaluate(()=>JSON.parse(localStorage.getItem('movie-test-tables')));
   assert.equal(tables.movies.find(m=>m.title==='Imported custom movie').custom_values[id('My score')],2.5);
   assert.equal(tables.movies.find(m=>m.title==='CSV custom movie').custom_values[id('Seen')],true);
   await page.reload();await page.waitForFunction(()=>document.querySelector('[data-movie-count]').textContent.includes('of 127 movies'));
   await action('[data-manage-movie-fields]');page.once('dialog',dialog=>dialog.accept());await manager.locator(`[data-field-delete="${id('Recommended by')}"]`).click();await saved();
   tables=await page.evaluate(()=>JSON.parse(localStorage.getItem('movie-test-tables')));
   assert.equal(tables.movies[0].custom_values[id('Recommended by')],undefined);assert.equal(tables.movies[0].custom_values[id('My score')],2.5);
   assert.deepEqual(errors,[]);console.log(`Custom field UI checks passed at ${width}px: management, all types, edit/retry, full-library filters/sort, hidden columns, presets, import/export and deletion.`);
   // Import into a fresh library: definition IDs are remapped, not reused across users.
   if(width===1440) {
    const fresh=await browser.newContext();const p=await fresh.newPage();await isolateMoviePage(p,base);await p.goto(base+'/movie-tracker.html');
    await p.waitForFunction(()=>document.querySelector('[data-movie-count]').textContent.includes('of 125 movies'));
    await p.locator('[data-actions-toggle]').click();await p.locator('[data-open-import]').click();
    await p.locator('[data-import-file]').setInputFiles({name:'portable.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(portable))});await p.locator('[data-import-submit]').click();
    await p.waitForFunction(()=>document.querySelector('[data-import-status]').textContent.startsWith('Imported 1 movies.'));
    const imported=await p.evaluate(()=>JSON.parse(localStorage.getItem('movie-test-tables'))),score=imported.movie_custom_fields.find(f=>f.name==='My score');
    assert.notEqual(score.id,id('My score'));assert.equal(imported.movies.find(m=>m.title==='Imported custom movie').custom_values[score.id],2.5);
    await p.locator('#movie-import-modal .modal-close').click();
    await p.evaluate(async()=>{
      const first=movieTestTables.movies[0];
      for(let i=0;i<1100;i++) movieTestTables.movies.push({...first,id:1000+i,title:'Large library '+i,custom_values:{}});
      await refreshMovieTracker();
    });
    for(const selected of [false,true]) {
      if(selected) await p.evaluate(()=>{movieState.selectedIds=new Set(movieTestTables.movies.map(m=>m.id));renderActionsState();});
      const waiting=p.waitForEvent('download');await p.locator('[data-actions-toggle]').click();await p.locator('[data-export-movies]').click();
      const file=await waiting;assert.equal(JSON.parse(fs.readFileSync(await file.path(),'utf8')).movies.length,1226,'Large library exports include every movie across API pages');
    }
    await fresh.close();
   }
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
