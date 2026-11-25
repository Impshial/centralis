const assert=require('node:assert/strict');
const {setup}=require('./lexicon-browser-harness.cjs');

(async()=>{
 const h=await setup(),{f,page,base}=h;
 try {
  await f.db.exec(`
   insert into universes(id,user_id,name,deleted) values('deleted-world',1,'Deleted universe',true);
   insert into elements(id,user_id,universe_id,name,deleted) values
    ('deleted-child',1,'u1','Deleted child',true),
    ('orphan',1,'deleted-world','Old child',false),
    ('standalone',1,null,'Standalone draft',false),
    ('deleted-standalone',1,null,'Deleted draft',true);
   insert into element_types(id,user_id,name,deleted) values('deleted-type',1,'Deleted type',true);
   insert into chronicle_modules(id,element_id,user_id,module_type,deleted) values('deleted-module','a',1,'template_section',true);
  `);
  const content=page.locator('[data-chronicle-content]'),select=page.locator('[data-chronicle-universe-filter]');
  const options=()=>select.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
  const rowIds=()=>content.locator('[data-element-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.elementId).sort());
  await page.goto(base+'/chronicle.html?tab=universe');
  await content.getByRole('heading',{name:'Choose a universe',exact:true}).waitFor();
  assert.deepEqual(await options(),['','u1'],'Only owned, non-deleted universes are available');
  await select.selectOption('u1');await content.locator('[data-element-id="a"]').waitFor({state:'attached'});
  await content.locator('.chronicle-type-group > summary').click();
  assert.deepEqual(await rowIds(),['a','b','c'],'Deleted elements are excluded');
  assert.equal(await content.locator('[data-element-id="a"] .chronicle-row-meta dd').nth(1).innerText(),'1 module','Deleted modules are not counted');
  await page.locator('[data-chronicle-tab="standalone"]').click();
  assert.deepEqual(await rowIds(),['standalone'],'Deleted standalone elements are excluded');
  await page.locator('[data-chronicle-create]').first().click();
  assert.equal(await page.locator('[data-chronicle-type] option[value="deleted-type"]').count(),0);
  await page.locator('[data-chronicle-create-cancel]').click();

  // Old URLs must not load elements from a deleted/missing/other user's universe.
  for(const id of ['deleted-world','missing-world','u2']) {
   const start=h.calls.length;
   await page.goto(base+'/chronicle.html?tab=universe&universe_id='+id+'&q=coast&sort=name-asc');
   await content.getByRole('heading',{name:'Choose a universe',exact:true}).waitFor();
   const url=new URL(page.url());assert.equal(url.searchParams.has('universe_id'),false);assert.equal(url.searchParams.get('q'),'coast');assert.equal(url.searchParams.get('sort'),'name-asc');
   assert.equal(await select.inputValue(),'');assert.deepEqual(await rowIds(),[]);
   assert.equal(h.calls.slice(start).some(c=>c.op?.table==='elements'&&c.op.filters.some(([,key,value])=>key==='universe_id'&&value===id)),false);
  }

  // Removing the last universe also clears a previously valid selection on reload.
  await page.goto(base+'/chronicle.html?tab=universe&universe_id=u1');
  await content.locator('[data-element-id="a"]').waitFor({state:'attached'});
  await f.db.query("update universes set deleted=true where id='u1'");
  await page.reload();await content.getByRole('heading',{name:'No universes available',exact:true}).waitFor();
  assert.deepEqual(await options(),['']);assert.equal(await select.isDisabled(),true);assert.deepEqual(await rowIds(),[]);assert.equal(new URL(page.url()).searchParams.has('universe_id'),false);
  await page.screenshot({path:'node_modules/.cache/lexicon/screenshots/chronicle-no-universes.png',fullPage:true});
  // A restored universe becomes available again, without showing deleted elements.
  await f.db.query("update universes set deleted=false where id='u1'");
  await page.locator('[data-chronicle-tab="standalone"]').click();
  await page.locator('[data-chronicle-tab="universe"]').click();
  await content.getByRole('heading',{name:'Choose a universe',exact:true}).waitFor();
  assert.equal(await select.isEnabled(),true);assert.deepEqual(await options(),['','u1']);
  await select.selectOption('u1');await content.locator('[data-element-id="a"]').waitFor({state:'attached'});assert.deepEqual(await rowIds(),['a','b','c']);

  // An old editor link to an undeleted child cannot reopen its deleted parent.
  await page.goto(base+'/chronicle-editor.html#universe/deleted-world/element/orphan');
  await page.getByText("This element's universe is no longer available.",{exact:true}).waitFor();
  assert.equal(await page.locator('[data-chronicle-workspace-save]').count(),0);
  assert.equal(f.writes.length,0,'Browsing never changes stored records');
  assert.deepEqual(h.errors,[]);
  console.log('Chronicle homepage: deleted/other-user universes, elements, standalone drafts, module counts and types excluded; stale selections cleared; empty/restored states and deleted-parent editor links passed.');
 } finally {await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
