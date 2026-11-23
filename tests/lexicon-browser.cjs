const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture, sourceTables } = require('./lexicon-fixture.cjs');
const base = process.env.CENTRALIS_BASE_URL || 'http://127.0.0.1:4173';
const output = 'node_modules/.cache/lexicon/screenshots';
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const f=await fixture(); const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.exposeBinding('lexiconDb',(_,{op,route})=>{
    if(op.method!=='select' && sourceTables.includes(op.table)) assert.ok(route.includes('chronicle-editor.html'),'Lexicon must never write source tables');
    return f.request(op);
  });
  await context.addInitScript(()=>{
    window.lexiconTestClient={from(table){
      const op={table,method:'select',filters:[],orders:[]};
      const q={select(columns='*'){op.columns=columns;return q;},eq(k,v){op.filters.push(['eq',k,v]);return q;},is(k,v){op.filters.push(['eq',k,v]);return q;},in(k,v){op.filters.push(['in',k,v]);return q;},order(k,o={}){op.orders.push([k,o.ascending]);return q;},range(a,b){op.range=[a,b];return q;},limit(n){op.limit=n;return q;},insert(p){op.method='insert';op.payload=p;return q;},upsert(p,o={}){op.method='upsert';op.payload=p;op.conflict=o.onConflict;return q;},update(p){op.method='update';op.payload=p;return q;},delete(){op.method='delete';return q;},single(){op.single=true;return q;},maybeSingle(){op.single='maybe';return q;},then(resolve,reject){return window.lexiconDb({op,route:location.pathname}).then(resolve,reject);}}; return q;
    },functions:{invoke:async()=>({data:{images:[]},error:null})}};
  });
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin!==base || u.pathname==='/supabase-config.js') return route.fulfill({status:200,body:''});
    if(u.pathname==='/script.js') {const response=await route.fetch();return route.fulfill({response,body:(await response.text())+`\nwindow.centralisSupabase=window.lexiconTestClient;window.centralisCurrentAppUser={id:1};window.centralisGetCurrentAppUser=async()=>({id:1});`});}
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const status=page.locator('[data-wiki-status]');
  async function ready(){await page.locator('[data-wiki-content][aria-busy="false"]').waitFor();await page.locator('[data-wiki-content] > *').first().waitFor();}
  async function createWiki(name,kind='universe'){
    await page.goto(base+'/lexicon.html');await page.getByRole('button',{name:'Create',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'Wiki type',exact:true}).selectOption(kind);
    if(kind==='universe') {await dialog.getByRole('combobox',{name:'Universe',exact:true}).selectOption('u1');assert.equal(await dialog.getByLabel('Wiki name').inputValue(),'Aesterra');}
    await dialog.getByLabel('Wiki name').fill(name);await dialog.getByRole('button',{name:'Create Wiki',exact:true}).click();
    await page.waitForURL('**/lexicon-wiki.html?*');await ready();return new URL(page.url()).searchParams.get('wiki');
  }
  async function open(wiki,article='',edit=false){await page.goto(`${base}/lexicon-wiki.html?wiki=${wiki}${article?'&article='+article:''}${edit?'&edit=1':''}`);await ready();if(edit)await settings();}
  async function settings(){const el=page.locator('.lexicon-settings');if(await el.count()&&await el.getAttribute('open')===null)await el.locator(':scope > summary').click();}
  async function customize(){await page.getByRole('link',{name:'Edit wiki page',exact:true}).click();await ready();await settings();}
  async function fieldPanel(id='f1'){const panel=page.locator(`[data-edit-field="${id}"]`);await settings();if((await panel.getAttribute('open'))===null)await panel.locator('summary').click();return panel;}
  async function property(scope,label,value,reset=false){
    const form=scope.getByRole('form',{name:label,exact:true});
    if(reset) await form.getByRole('button',{name:'Reset to source'}).click();
    else {const input=form.locator('[name="value"]');const type=await input.getAttribute('type');const tag=await input.evaluate(e=>e.tagName);
      if(type==='checkbox')await input.setChecked(value);else if(tag==='SELECT')await input.selectOption(value);else await input.fill(String(value));
      await form.getByRole('button',{name:'Save',exact:true}).click();}
    await status.getByText('Saved.',{exact:true}).waitFor();await settings();
  }
  const initial=await f.snapshot();
  const one=await createWiki('Aesterra Notes');const two=await createWiki('Aesterra Reference');
  await open(one,'a');await customize();
  await page.getByRole('form',{name:'Introduction',exact:true}).locator('textarea').fill('Draft introduction');
  await property(page,'Article title','Port city');
  assert.equal(await page.getByRole('form',{name:'Introduction',exact:true}).locator('textarea').inputValue(),'Draft introduction','Saving one property preserves other drafts');
  assert.equal((await f.db.query("select * from lexicon_overrides where property='introduction'")).rows.length,0,'Unsubmitted drafts are not written');
  await property(await fieldPanel(),'Placement','infobox');await property(await fieldPanel(),'Field label','People');
  await open(one,'a');assert.equal(await page.locator('.lexicon-infobox [data-field-id="f1"] dt').innerText(),'People');
  assert.equal(await page.locator('.lexicon-infobox [data-field-id="f1"] dd').innerText(),'100');
  await open(two,'a');assert.equal(await page.getByRole('heading',{name:'Stormhaven',exact:true}).count(),1);
  assert.equal(await page.locator('.lexicon-article [data-field-id="f1"] dt').innerText(),'Population count');
  assert.deepEqual(await f.snapshot(),initial,'Wiki creation, loads and customizations do not write source tables');
  console.log('UI flow 1: two wikis, scoped title/label/placement, reload and source snapshot passed.');
  async function sourceEdit(value,name){
    await page.getByRole('link',{name:'Edit in Chronicle',exact:true}).click();
    await page.locator('[name="workspace-field:f1"]').fill(String(value));
    if(name)await page.locator('[name="workspace-name"]').fill(name);
    await page.getByRole('button',{name:'Save Element',exact:true}).click();await page.getByText('Element saved.',{exact:true}).waitFor();
  }
  await sourceEdit(110);await open(one,'a');assert.equal(await page.locator('[data-field-id="f1"] dd').innerText(),'110');
  await open(two,'a');assert.equal(await page.locator('[data-field-id="f1"] dd').innerText(),'110');
  await open(one,'a',true);await property(await fieldPanel(),'Field value','777');
  await page.getByRole('link',{name:'View wiki page',exact:true}).click();await ready();await sourceEdit(120,'New Stormhaven');
  const sourceAfter=await f.snapshot();
  await open(one,'a');assert.equal(await page.locator('[data-field-id="f1"] dd').innerText(),'777');
  await customize();await property(await fieldPanel(),'Field value',null,true);
  await page.getByRole('link',{name:'View wiki page',exact:true}).click();await ready();
  assert.equal(await page.locator('.lexicon-infobox [data-field-id="f1"] dd').innerText(),'120');
  assert.equal(await page.locator('.lexicon-infobox [data-field-id="f1"] dt').innerText(),'People');
  await open(two,'a');assert.equal(await page.getByRole('heading',{name:'New Stormhaven',exact:true}).count(),1);
  console.log('UI flow 2: actual Chronicle editor source changes, pin, reload, per-property reset and stable rename passed.');
  await open(one,'a');assert.equal(await page.getByRole('heading',{name:'Connections',exact:true}).count(),0);
  await customize();
  async function linkPanel(id){const panel=page.locator(`[data-edit-link="${id}"]`);if((await panel.getAttribute('open'))===null)await panel.locator('summary').click();return panel;}
  await property(await linkPanel('l1'),'Connection label','Commercial partner');
  await property(await linkPanel('l1'),'Hide on this page',true);
  await open(one,'a');assert.equal(await page.getByText('Outgoing: Commercial partner',{exact:true}).count(),0);assert.equal(await page.getByText('Outgoing: Governs',{exact:true}).count(),0);
  await open(one,'b');assert.equal(await page.getByText('Incoming: Commercial partner',{exact:true}).count(),0);
  await customize();await property(await linkPanel('l1'),'Hide connection in this wiki',true);
  await open(one,'a',true);await page.getByRole('button',{name:'Add wiki-only connection',exact:true}).click();
  let dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'Destination',exact:true}).selectOption('b');await dialog.getByLabel('Connection label').fill('Wiki only');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();await settings();await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();await settings();
  const local=(await f.db.query('select * from lexicon_links')).rows[0];assert.ok(local);
  await (await linkPanel(local.id)).getByRole('button',{name:'Delete wiki-only connection',exact:true}).click();await page.getByText('Connection deleted.',{exact:true}).waitFor();await settings();
  assert.equal((await f.db.query('select * from lexicon_links')).rows.length,0);
  await property(page,'Hide article',true);await page.getByRole('link',{name:'View wiki page',exact:true}).click();await ready();
  assert.equal(await page.locator('[data-wiki-navigation] a[href*="article=a"]').count(),0);
  await customize();await property(page,'Hide article',null,true);
  assert.deepEqual(await f.snapshot(),sourceAfter);
  console.log('UI flow 3: grouped destinations, relabel, per-page/wiki hiding, wiki-only link create/delete, hidden article restore and source snapshot passed.');
  await open(one,'a');assert.match(await page.locator('.lexicon-breadcrumbs').innerText(),/Regions.*Coast/);await page.getByRole('link',{name:'All articles',exact:true}).click();assert.ok(await page.locator('[data-wiki-content] a[href*="article=c"]').isVisible());await open(one,'a');assert.equal(await page.getByRole('heading',{name:'Port city',exact:true}).count(),1);
  console.log('UI flow 4: nested groups, cyclic/converging graph, unconnected article and stable ID routes passed.');
  const independent=await createWiki('Standalone handbook','standalone');
  async function article(title){
    await page.getByRole('button',{name:/Create (first )?article/,exact:true}).last().click();
    const d=page.getByRole('dialog');await d.getByLabel('Article title').fill(title);await d.getByRole('button',{name:'Save',exact:true}).click();
    await page.waitForURL('**/*article=*');await ready();await settings();return new URL(page.url()).searchParams.get('article');
  }
  const first=await article('First article');
  await property(page,'Introduction','Written without a universe.');
  await page.getByRole('button',{name:'Add section',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Section label').fill('Facts');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();await settings();
  await page.getByRole('button',{name:'Add field',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Field label').fill('Count');await dialog.getByRole('combobox',{name:'Field type',exact:true}).selectOption('number');await dialog.getByLabel('Field value').fill('0');await dialog.getByRole('combobox',{name:'Placement',exact:true}).selectOption('infobox');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();await settings();
  const second=await article('Second article');
  await page.getByRole('button',{name:'Add wiki-only connection',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'Destination',exact:true}).selectOption(first);await dialog.getByLabel('Connection label').fill('See also');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();await settings();
  await page.getByRole('button',{name:'Edit navigation',exact:true}).click();dialog=page.getByRole('dialog');const entries=(await f.db.query('select * from lexicon_navigation where wiki_id=$1',[independent])).rows;
  await dialog.getByRole('combobox',{name:'Entry',exact:true}).selectOption(entries.find(n=>n.article_id===second).id);await dialog.getByLabel('Navigation label').fill('Nested article');await dialog.getByRole('combobox',{name:'Parent',exact:true}).selectOption(entries.find(n=>n.article_id===first).id);await dialog.getByLabel('Order',{exact:true}).fill('3');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();await settings();
  await page.goto(base+'/lexicon.html');await page.getByRole('link',{name:/Standalone handbook/}).click();await ready();
  await page.getByRole('link',{name:'All articles',exact:true}).click();await page.locator(`[data-wiki-content] a[href*="article=${first}"]`).last().click();await ready();
  assert.equal(await page.locator('.lexicon-infobox dd').innerText(),'0');assert.equal(await page.getByText('Written without a universe.',{exact:true}).count(),1);
  assert.equal(await page.getByRole('heading',{name:'Connections',exact:true}).count(),0);
  assert.deepEqual(await f.snapshot(),sourceAfter);
  console.log('UI flow 5: standalone wiki, two articles, body/section, infobox zero, links, nested navigation, homepage reopen and no source rows passed.');
  for(const width of [1440,760,390,320]){
    await page.setViewportSize({width,height:1000});await open(independent,first);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${output}/reader-${width}.png`});
    await customize();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${output}/editor-${width}.png`});
    for(const file of ['lexicon.html','universe-builder.html']){
      await page.goto(base+'/'+file);
      assert.equal(await page.evaluate(()=>{const row=document.querySelector('.universe-builder-control-actions').getBoundingClientRect();const search=document.querySelector('.universe-builder-search').getBoundingClientRect();const view=document.querySelector('.chat-view-switcher').getBoundingClientRect();return Math.abs(row.left-search.left)<1&&Math.abs(row.right-view.right)<1;}),true);
    }
  }
  assert.deepEqual(errors,[]);console.log('Responsive reader/editor and both homepage toolbar checks passed at 1440/760/390/320px.');
 } finally {await browser.close();await f.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
