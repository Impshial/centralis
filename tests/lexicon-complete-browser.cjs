const assert=require('node:assert/strict');
const fs=require('node:fs');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,store,page,base,open,property,settings}=h;
 try {
  const initial=await f.snapshot();
  const wiki=await store.createWiki({id:f.uuid(),name:'Complete wiki',kind:'universe',universe_id:'u1'});
  await open(wiki.id,'a');assert.equal(await page.locator('.lexicon-article h1').innerText(),'Stormhaven');
  assert.equal(await page.getByRole('heading',{name:'Connections',exact:true}).count(),0);
  assert.match(await page.locator('.lexicon-breadcrumbs').innerText(),/Lexicon.*Complete wiki.*Regions.*Coast.*Stormhaven/);
  assert.equal(await page.locator('[data-outline-list] a').count(),2);
  assert.equal(await page.locator('[data-wiki-navigation]').getByText('Canvas connections',{exact:true}).count(),0);
  await open(wiki.id,'a',true);await property('Field label','People',{field:'f1'});await property('Placement','infobox',{field:'f1'});
  await page.getByRole('button',{name:'Edit Introduction',exact:true}).click();
  await page.getByRole('textbox',{name:'Introduction',exact:true}).fill('Harbor is nearby. Harbor is mentioned again.');
  await page.getByRole('button',{name:'Save page',exact:true}).click();await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();
  assert.equal(await page.locator('.lexicon-article a[data-auto-link]').count(),1);
  assert.equal(await page.locator('.lexicon-infobox [data-field-id="f1"] dt').innerText(),'People');
  await open(wiki.id,'a',true);await page.getByRole('button',{name:'Edit Introduction',exact:true}).click();await page.getByRole('textbox',{name:'Introduction',exact:true}).fill('Discard me');await page.getByRole('button',{name:'Cancel edits',exact:true}).click();assert.ok(!(await page.locator('.lexicon-article').innerText()).includes('Discard me'));
  await page.getByRole('combobox',{name:'Search this wiki'}).fill('coastal');await page.getByRole('combobox',{name:'Search this wiki'}).press('Enter');assert.match(page.url(),/q=coastal/);assert.ok(await page.getByRole('heading',{name:'Search results'}).isVisible());
  await open(wiki.id,'a');await page.getByRole('combobox',{name:'Search this wiki'}).fill('Harbor');await page.getByRole('combobox',{name:'Search this wiki'}).press('ArrowDown');await page.getByRole('combobox',{name:'Search this wiki'}).press('Enter');assert.match(page.url(),/article=b/);await page.goBack();assert.match(page.url(),/article=a$/);
  assert.deepEqual(await f.snapshot(),initial,'Reader and authoring must not write sources');
  console.log('Reader smoke: breadcrumbs, contents, sparse placement, lazy Tiptap save/cancel, automatic links, search keyboard/back and source isolation passed.');
  await page.goto(base+'/chronicle-editor.html#universe/u1');await page.getByRole('button',{name:'Save Universe',exact:true}).waitFor();
  assert.equal(await page.locator('[name="workspace-element-type"]').count(),0);assert.equal(await page.locator('[name="workspace-template"]').count(),0);
  await page.locator('[name="workspace-name"]').fill('City root');await page.getByRole('button',{name:'Add field',exact:true}).click();
  let d=page.getByRole('dialog');assert.equal(await d.getByLabel('Location',{exact:true}).count(),0);await d.getByLabel('Name',{exact:true}).fill('Region');await d.getByLabel('Value',{exact:true}).fill('West');await d.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Save Universe',exact:true}).click();await page.getByText('Universe saved.',{exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Save Universe',exact:true}).waitFor();assert.equal(await page.locator('[name="workspace-name"]').inputValue(),'City root');
  assert.equal((await f.db.query("select count(*)::int n from universe_custom_fields where name='Region'")).rows[0].n,1);
  console.log('Universe direct Chronicle route: root shell, old and new details, Save Universe and reload passed.');
  assert.deepEqual(h.errors,[]);
  fs.mkdirSync('node_modules/.cache/lexicon/screenshots',{recursive:true});await open(wiki.id,'a');await page.screenshot({path:'node_modules/.cache/lexicon/screenshots/complete-reader.png',fullPage:true});
 }catch(error){console.error('Page URL:',page.url());console.error('Page errors:',h.errors);console.error((await page.locator('body').innerText()).slice(-5000));throw error;}finally{await h.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
