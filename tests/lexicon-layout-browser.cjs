const assert=require('node:assert/strict');
const fs=require('node:fs');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,store,page,open,context}=h;
 const shots='node_modules/.cache/lexicon/screenshots';fs.mkdirSync(shots,{recursive:true});
 try{
  await page.setViewportSize({width:1440,height:780});
  await f.db.exec("update elements set description='Stormhaven stands along the coast. Harbor connects the city to Island. Ships arrive throughout the year.',body='## Terrain\n\nThe roads cross the coastal plain.\n\n## Climate\n\nRain reaches the city from the sea.' where id='a';update element_type_template_fields set field_type='textarea' where id='f3';insert into element_template_field_values(element_id,template_field_id,value) values('a','f3','The southern coast connects the city to nearby settlements.');");
  const wiki=await store.createWiki({id:f.uuid(),name:'Aesterra',kind:'universe',universe_id:'u1'});
  const second=await store.createWiki({id:f.uuid(),name:'Second wiki',kind:'universe',universe_id:'u1'});
  const snapshot=await f.snapshot();
  await open(wiki.id,'a');
  // Delay an actual image response until after the source card is rendered.
  await page.evaluate(()=>{const old=centralisSupabase.functions.invoke;centralisSupabase.functions.invoke=(name,options)=>name==='lexicon-images'?new Promise(resolve=>{window.finishLayoutImage=()=>resolve({data:{images:[{object_id:'a',image_url:location.origin+'/assets/centralis-icon.svg'}]},error:null});}):old(name,options);});
  await page.getByRole('button',{name:'Reload source',exact:true}).click();
  await page.waitForFunction(()=>typeof window.finishLayoutImage==='function');
  const sourceCard=page.getByRole('region',{name:'Source tools'});
  await sourceCard.waitFor();await page.evaluate(()=>window.finishLayoutImage());await page.locator('.lexicon-infobox img').waitFor();
  assert.equal(await page.locator('.lexicon-sidebar > :first-child').getAttribute('data-sidebar-page-title'),'');assert.equal(await page.locator('[data-sidebar-page-title]').isVisible(),false);
  assert.deepEqual(await page.locator('.lexicon-sidebar > section').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label'))),['Article Details','Source tools']);
  assert.deepEqual(await sourceCard.locator('a,button').allTextContents(),['Open in Builder','Edit in Chronicle','Edit wiki page','Reload source']);
  assert.equal(await page.locator('.lexicon-title-row a').count(),0);
  assert.equal(await page.locator('[aria-label="Breadcrumb"]').count(),1);
  assert.equal(await page.locator('.lexicon-breadcrumbs [aria-current="page"]').innerText(),'Stormhaven');
  assert.match(await page.locator('.lexicon-breadcrumbs').innerText(),/Lexicon.*Aesterra.*Regions.*Coast.*Stormhaven/);
  assert.equal(await page.getByRole('link',{name:'Edit wiki page',exact:true}).count(),1);
  assert.equal(await page.locator('[data-wiki-navigation]').getByRole('button',{name:'Text actions',exact:true}).count(),0);
  const builder=new URL(await sourceCard.getByRole('link',{name:'Open in Builder',exact:true}).getAttribute('href'),h.base);
  assert.equal(builder.searchParams.get('universe_id'),'u1');assert.equal(builder.searchParams.get('focus_element_id'),'a');
  assert.equal(await sourceCard.getByRole('link',{name:'Edit in Chronicle',exact:true}).getAttribute('href'),'chronicle-editor.html#universe/u1/element/a');
  await page.locator('[data-wiki-status]').evaluate(el=>el.textContent='');
  const geometry=await page.evaluate(()=>{
   const b=s=>document.querySelector(s).getBoundingClientRect(),article=b('.lexicon-article'),left=b('.lexicon-navigation'),right=b('.lexicon-sidebar'),utility=b('.lexicon-utility-row'),details=b('.lexicon-infobox'),tools=b('.lexicon-source-tools'),input=b('#wiki-search'),icon=b('.lexicon-search-icon');
   return {aligned:Math.abs(left.top-right.top)<1&&Math.abs(article.top-left.top)<1,columns:article.width>right.width&&right.left>article.right&&article.left>left.right,above:utility.bottom<left.top,order:details.bottom<tools.top,border:getComputedStyle(document.querySelector('.lexicon-article')).borderWidth,icon:icon.top>=input.top&&icon.bottom<=input.bottom};
  });
  assert.deepEqual(geometry,{aligned:true,columns:true,above:true,order:true,border:'0px',icon:true});
  await page.screenshot({path:shots+'/layout-desktop-article.png',fullPage:true});
  const section=page.locator('[data-outline-list]').getByRole('link',{name:'Geography',exact:true});await section.click();
  await page.waitForFunction(()=>document.querySelector('#section-m1').getBoundingClientRect().top>=document.querySelector('.site-header').getBoundingClientRect().bottom);
  await page.waitForFunction(()=>document.querySelector('[data-outline-list] [aria-current="location"]')?.textContent==='Geography');
  await page.getByRole('link',{name:'Aesterra',exact:true}).click();
  assert.equal(await page.locator('.lexicon-breadcrumbs').innerText(),'Lexicon › Aesterra');
  assert.equal(new URL(await sourceCard.getByRole('link',{name:'Open in Builder'}).getAttribute('href'),h.base).searchParams.get('focus_element_id'),'u1');
  assert.equal(await sourceCard.getByRole('link',{name:'Edit in Chronicle'}).getAttribute('href'),'chronicle-editor.html#universe/u1');
  await page.screenshot({path:shots+'/layout-desktop-home.png',fullPage:true});
  const input=page.getByRole('combobox',{name:'Search this wiki'});
  await input.fill('southern');assert.equal(await input.evaluate(el=>document.activeElement===el),true);
  await page.locator('#wiki-suggestions a').click();assert.match(page.url(),/article=a#section-m1$/);
  await input.fill('Stormhaven');await page.getByRole('button',{name:'Search',exact:true}).click();assert.match(page.url(),/lexicon-search.html.*q=Stormhaven/);
  assert.equal(await sourceCard.count(),0);assert.equal(await page.getByRole('link',{name:'Edit wiki page'}).count(),0);
  await page.goBack();assert.match(page.url(),/article=a#section-m1$/);
  await input.fill('Harbor');await input.press('Escape');assert.equal(await page.locator('#wiki-suggestions').isVisible(),false);await input.press('Enter');assert.match(page.url(),/lexicon-search.html.*q=Harbor/);
  await input.fill('');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByText('Enter a search term.',{exact:true}).waitFor();
  // Source reload retains local customizations and unsaved editor drafts.
  await open(wiki.id,'a');await sourceCard.getByRole('link',{name:'Edit wiki page',exact:true}).click();await page.getByRole('button',{name:'Edit Introduction',exact:true}).waitFor();
  assert.deepEqual(await sourceCard.locator('a,button').allTextContents(),['Open in Builder','Edit in Chronicle','View wiki page','Reload source']);
  await h.property('Article title','Local title');
  await page.getByRole('button',{name:'Edit Introduction',exact:true}).click();await page.getByRole('textbox',{name:'Introduction',exact:true}).fill('Unsaved introduction');
  await page.getByRole('button',{name:'Reload source',exact:true}).click();await page.getByText('Source reloaded.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Introduction',exact:true}).innerText(),'Unsaved introduction');
  assert.equal(await page.locator('.lexicon-title-row h1').innerText(),'Local title');
  await page.getByRole('button',{name:'Cancel edits',exact:true}).click();assert.equal(await page.getByText('Unsaved introduction',{exact:true}).count(),0);
  assert.equal((await store.load(second.id)).overrides.length,0);
  assert.deepEqual(await f.snapshot(),snapshot);
  // Every density uses the same layout, including a truly empty infobox.
  await f.db.exec("update universes set name='A very long universe title that wraps across the available reading column' where id='u1';delete from universe_custom_fields where universe_id='u1';");
  await f.db.query("update universes set description=$1 where id='u1'",[Array.from({length:24},()=> 'The coastal settlements trade throughout the year. Ships connect the region to nearby islands.').join('\n\n')]);
  await open(wiki.id);assert.equal(await page.locator('.lexicon-infobox').count(),0);assert.equal(await sourceCard.count(),1);
  // Universe articles without details still show their title when scrolled,
  // including after the asynchronous image request returns no root image.
  assert.equal(await page.locator('[data-sidebar-page-title]').isVisible(),false);
  await page.evaluate(()=>scrollTo(0,500));
  await page.waitForFunction(()=>document.querySelector('[data-sidebar-page-title]')?.hidden===false);
  assert.equal(await page.locator('.lexicon-sidebar > :first-child').innerText(),'A very long universe title that wraps across the available reading column');
  await page.screenshot({path:shots+'/layout-universe-scrolled.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Back to top',exact:true}).click();
  await page.waitForFunction(()=>scrollY===0&&document.querySelector('[data-sidebar-page-title]').hidden);
  await sourceCard.getByRole('link',{name:'Edit wiki page',exact:true}).click();await page.getByRole('button',{name:'Edit Introduction',exact:true}).waitFor();
  await sourceCard.getByRole('link',{name:'View wiki page',exact:true}).click();
  assert.equal(await sourceCard.getByRole('link',{name:'Edit wiki page',exact:true}).count(),1);
  assert.equal(new URL(page.url()).searchParams.get('article'),null);
  const standalone=await store.createWiki({id:f.uuid(),kind:'standalone',name:'Standalone wiki'});
  await open(standalone.id);assert.equal(await sourceCard.count(),0);assert.equal(await page.locator('.lexicon-infobox').count(),0);
  await page.getByRole('button',{name:'Create article',exact:true}).click();await page.getByRole('dialog').getByLabel('Article title').fill('First article');await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Edit Introduction',exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit Introduction',exact:true}).click();await page.getByRole('textbox',{name:'Introduction',exact:true}).fill('A saved standalone introduction.');await page.getByRole('button',{name:'Save page',exact:true}).click();await page.getByText('Saved.',{exact:true}).waitFor();
  assert.equal(await sourceCard.count(),0);assert.equal(await page.getByRole('button',{name:'Reload wiki',exact:true}).count(),1);
  const pageTools=page.getByRole('region',{name:'Page tools',exact:true});
  assert.equal(await pageTools.getByRole('link',{name:'Edit wiki page',exact:true}).count(),1);
  assert.equal(await page.locator('.lexicon-title-row a').count(),0);
  await pageTools.getByRole('link',{name:'Edit wiki page',exact:true}).click();await page.getByRole('button',{name:'Edit Introduction',exact:true}).waitFor();
  await pageTools.getByRole('link',{name:'View wiki page',exact:true}).click();
  await pageTools.getByRole('link',{name:'Edit wiki page',exact:true}).waitFor();
  await page.screenshot({path:shots+'/layout-standalone.png',fullPage:true});
  const long=f.uuid();await store.save('lexicon_facts',{id:long,wiki_id:wiki.id,article_id:'a',label:'Long reference value',value:'LongValue'.repeat(70),placement:'infobox',sort_order:9});
  // Long panels must fit from their initial position below search, not just after
  // scrolling far enough to reach the sticky header offset.
  await f.db.query("update elements set body=$1 where id='a'",[Array.from({length:30},(_,i)=>`## Section ${i+1}\n\nThe coastal settlements trade with Harbor throughout the year.\n\n### History ${i+1}\n\nShips connect the region to Island.`).join('\n\n')]);
  const panelsFit=()=>page.waitForFunction(()=>[...document.querySelectorAll('.lexicon-navigation,.lexicon-sidebar')].every(el=>{const rect=el.getBoundingClientRect();return rect.top>=document.querySelector('.site-header').getBoundingClientRect().bottom&&rect.bottom<=innerHeight-8;}));
  for(const viewport of [{width:1920,height:958},{width:1366,height:648},{width:1280,height:600}]){
   await page.setViewportSize(viewport);await open(wiki.id,'a');await panelsFit();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+viewport.width);
   assert.equal(await page.locator('[data-outline-list] [aria-expanded="true"]').count(),0);
   await page.getByRole('button',{name:'Expand Body',exact:true}).click();await panelsFit();
   assert.ok(await page.locator('.lexicon-navigation').evaluate(el=>el.scrollHeight>el.clientHeight),'Expanded long contents scroll inside the left panel');
   await page.screenshot({path:shots+'/layout-fit-'+viewport.width+'.png'});
   await page.evaluate(()=>scrollTo(0,500));await page.waitForFunction(()=>scrollY===500);await panelsFit();
   await page.waitForFunction(()=>!document.querySelector('[data-sidebar-page-title]').hidden);assert.equal(await page.locator('[data-sidebar-page-title]').innerText(),'Local title');
   await sourceCard.getByRole('link',{name:'Edit wiki page',exact:true}).focus();
   assert.ok(await sourceCard.getByRole('link',{name:'Edit wiki page',exact:true}).evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),'Wiki editing remains reachable within the panel');
   await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Back to top',exact:true}).click();await page.waitForFunction(()=>scrollY===0);await panelsFit();
  }
  await open(wiki.id,'a',true);await panelsFit();
  await page.locator('[data-wiki-status]').evaluate(el=>el.textContent='The source has changed. Review the article details before saving.');await panelsFit();
  for(const width of [1024,768,390,320]){
   await page.setViewportSize({width,height:900});await open(wiki.id,'a');assert.equal(await page.locator('[data-outline]').getAttribute('open'),null);
   await page.locator('[data-outline] > summary').click();assert.ok(await page.locator('[data-outline-list]').getByRole('link',{name:'Overview',exact:true}).isVisible());await page.locator('[data-outline] > summary').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow at '+width);
   if(width===1024||width===390)await page.screenshot({path:shots+'/layout-'+width+'.png'});
  }
  // Existing access rules are owner-only: an inaccessible wiki exposes no source/edit actions.
  const foreign=f.uuid();await f.db.exec('reset role');await f.db.query("insert into lexicon_wikis(id,user_id,kind,name) values($1,2,'standalone','Private wiki')",[foreign]);await f.db.exec('set role authenticated');
  await open(foreign);await page.getByText('Wiki not found or access denied.',{exact:true}).waitFor();assert.equal(await sourceCard.count(),0);assert.equal(await page.getByRole('link',{name:'Edit wiki page'}).count(),0);
  assert.deepEqual(h.errors,[]);
  console.log('Layout: shared desktop/tablet/phone composition; image/card ordering; universe scroll title without details; right-panel wiki editing; sparse and empty facts; search/suggestions/Back; breadcrumbs and anchors; source destinations; standalone creation; preserved reload drafts and wiki/source isolation; access denied passed.');
 }catch(e){console.error(page.url(),(await page.locator('body').innerText()).slice(-4500));throw e;}finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
