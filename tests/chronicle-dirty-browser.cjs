const assert=require('node:assert/strict');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,store,page,base}=h;
 try{
  const wiki=await store.createWiki({id:f.uuid(),name:'First wiki',kind:'universe',universe_id:'u1'});
  const route=id=>`${base}/chronicle-editor.html#universe/u1${id?'/element/'+id:''}`;
  const dirty=()=>page.locator('[data-chronicle-dirty]');
  const form=()=>page.locator('[data-chronicle-workspace-form]');
  const go=async id=>{await page.goto(route(id));await form().waitFor();};
  const stay=async()=>{await page.getByRole('dialog').getByRole('button',{name:'Keep editing'}).click();};
  const clean=async()=>assert.equal(await dirty().innerText(),'');
  const changed=async()=>assert.equal(await dirty().innerText(),'Unsaved changes');
  await go('a');await clean();
  const original=await page.locator('[name="workspace-name"]').inputValue();
  await page.locator('[name="workspace-name"]').fill('Draft');await changed();
  await page.getByRole('link',{name:'Back to Builder',exact:true}).click();await stay();assert.equal(await page.locator('[name="workspace-name"]').inputValue(),'Draft');
  let unload=false;page.once('dialog',async d=>{assert.equal(d.type(),'beforeunload');unload=true;await d.dismiss();});await page.reload().catch(()=>{});assert.ok(unload);assert.equal(await page.locator('[name="workspace-name"]').inputValue(),'Draft');
  await page.locator('[name="workspace-name"]').fill(original);await clean();
  await page.locator('[name="workspace-description"]').fill('A new description');await changed();
  h.failNext('elements');await page.getByRole('button',{name:'Save Element',exact:true}).click();await page.getByText(/Could not save element: Fixture save failed/).waitFor();await changed();
  await page.getByRole('button',{name:'Save Element',exact:true}).click();await page.getByText('Element saved.',{exact:true}).waitFor();await clean();
  await page.locator('[name="workspace-field:f1"]').fill('101');await changed();await page.locator('[name="workspace-field:f1"]').fill('100');await clean();
  await page.getByRole('button',{name:'Add field',exact:true}).click();let d=page.getByRole('dialog');await d.getByLabel('Name',{exact:true}).fill('Draft fact');await d.getByLabel('Value',{exact:true}).fill('Value');await d.getByRole('button',{name:'Apply',exact:true}).click();await changed();
  const field=page.locator('[data-custom-field-row]').filter({has:page.locator('[name="custom-name"][value="Draft fact"]')});await field.locator('[data-chronicle-remove-custom-field]').click();await clean();
  // Collapsing a module is a view change, and must not cause a dirty prompt.
  await page.locator('[data-toggle-module]').first().click();await clean();await page.locator('[data-toggle-module]').first().click();await clean();
  await page.locator('[data-remove-module]').first().click();await changed();await page.locator('[data-add-module="s1"]').click();await clean();
  await page.locator('[name="workspace-template"]').selectOption('');await changed();
  await page.getByRole('button',{name:'View in Lexicon',exact:true}).click();await stay();assert.match(page.url(),/chronicle-editor/);
  await page.getByRole('link',{name:'Back to Builder',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Discard and leave'}).click();await page.waitForURL(/universe-canvas/);
  await go('a');await clean();
  // Known same-document history entries preserve both URL and draft on canceled Back.
  await page.evaluate(()=>location.hash='universe/u1/element/b');await page.waitForFunction(()=>document.querySelector('[name="workspace-name"]')?.value==='Harbor');
  await page.locator('[name="workspace-description"]').fill('Keep this on Back');await changed();
  await page.goBack();await stay();await page.waitForURL(/element\/b$/);assert.equal(await page.locator('[name="workspace-description"]').inputValue(),'Keep this on Back');
  await page.goBack();await page.getByRole('dialog').getByRole('button',{name:'Discard and leave'}).click();await page.waitForURL(/element\/a$/);await page.waitForFunction(()=>document.querySelector('[name="workspace-name"]')?.value==='Stormhaven');await clean();
  await page.goForward();await page.waitForFunction(()=>document.querySelector('[name="workspace-name"]')?.value==='Harbor');await clean();
  await page.getByRole('button',{name:'View in Lexicon',exact:true}).click();await page.waitForURL(/lexicon-wiki/);await h.ready();assert.match(page.url(),new RegExp(`wiki=${wiki.id}&article=b`));
  await go('');await page.getByRole('button',{name:'View in Lexicon',exact:true}).click();await page.waitForURL(/lexicon-wiki/);await h.ready();assert.ok(!page.url().includes('article='));assert.equal(await page.locator('.lexicon-article h1').innerText(),'Aesterra');
  const second=await store.createWiki({id:f.uuid(),name:'Second wiki',kind:'universe',universe_id:'u1'});
  await go('a');const source=await f.snapshot();await page.getByRole('button',{name:'View in Lexicon',exact:true}).click();await page.getByRole('dialog').getByRole('link',{name:'Second wiki',exact:true}).click();await page.waitForURL(new RegExp(second.id));await h.ready();assert.deepEqual(await f.snapshot(),source);
  await store.override(wiki.id,{subjectType:'article',articleId:'a',id:'a'},'hidden',true);await store.override(second.id,{subjectType:'article',articleId:'a',id:'a'},'hidden',true);
  await go('a');await page.getByRole('button',{name:'View in Lexicon',exact:true}).click();await page.getByRole('dialog').getByText('This article is hidden in every linked wiki.',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').getByRole('link',{name:'First wiki'}).count(),0);await page.getByRole('dialog').getByRole('button',{name:'Cancel'}).click();
  await f.db.exec("insert into universes(id,user_id,name,description) values('no-wiki',1,'No wiki','No wiki exists');");await page.goto(`${base}/chronicle-editor.html#universe/no-wiki`);await page.getByRole('button',{name:'Save Universe'}).waitFor();await page.getByRole('button',{name:'View in Lexicon',exact:true}).click();await page.getByText('No wiki is linked to this universe.',{exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Cancel'}).click();assert.equal((await f.db.query("select count(*)::int n from lexicon_wikis where universe_id='no-wiki'")).rows[0].n,0);
  await page.locator('[name="workspace-description"]').fill('Root draft');await changed();await page.getByRole('button',{name:'Save Universe'}).click();await page.getByText('Universe saved.',{exact:true}).waitFor();await clean();
  assert.deepEqual(h.errors,[]);console.log('Chronicle follow-ups passed: dirty/revert/save/failure, field/module/template drafts, beforeunload, canceled/accepted links and Back/Forward, and View in Lexicon root/element/multiple/hidden/missing without phantom writes.');
 }catch(e){console.error(page.url(),(await page.locator('body').innerText()).slice(-2500));throw e;}finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
