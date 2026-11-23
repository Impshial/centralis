const assert=require('node:assert/strict');
const fs=require('node:fs');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,store,page,open}=h;
 const shots='node_modules/.cache/lexicon/screenshots';fs.mkdirSync(shots,{recursive:true});
 try{
  const golden='The Golden Age and its civilizations',rend='The Rend and the long recovery';
  const prose=['A recorded history.','## '+golden,'Four civilizations.','### Solmarra Domain','The first civilization.','#### Capital','An old settlement.','###### Archive','A surviving record.','### Divalean Harmony','The second civilization.','### Val’Marid Empire','The third civilization.','### Kingdom of Pela','The fourth civilization.','## '+rend,'A later era.','### Solmarra Domain','A later account.',...Array(25).fill('The account continues.')].join('\n\n');
  await f.db.query("update universes set description=$1 where id='u1'",[prose]);
  await f.db.query("update elements set body=$1 where id='a'",['## Builder heading\n\n### Builder detail\n\nSaved prose.']);
  const wiki=await store.createWiki({id:f.uuid(),name:'Outline test',kind:'universe',universe_id:'u1'});
  await open(wiki.id);const source=await f.snapshot(),writes=f.writes.length;
  const outline=page.locator('[data-outline-list]');
  assert.equal(await page.locator('[data-wiki-navigation]').getByRole('button',{name:'Text actions',exact:true}).count(),0);
  const branch=label=>outline.locator('li').filter({has:page.locator(':scope > .lexicon-outline-row > a').filter({hasText:label})});
  const goldenItem=branch(golden),rendItem=branch(rend);
  assert.deepEqual(await outline.locator(':scope > li > .lexicon-outline-row > a').allTextContents(),['Overview',golden,rend]);
  assert.deepEqual(await goldenItem.locator(':scope > ul > li > .lexicon-outline-row > a').allTextContents(),['Solmarra Domain','Divalean Harmony','Val’Marid Empire','Kingdom of Pela']);
  const goldenButton=goldenItem.locator(':scope > .lexicon-outline-row > button');
  assert.equal(await goldenButton.getAttribute('aria-expanded'),'false','Branches start collapsed');
  assert.equal(await outline.locator('[aria-expanded="true"]').count(),0);
  await goldenButton.click();
  const firstSolmarra=goldenItem.getByRole('link',{name:'Solmarra Domain',exact:true});
  const childHref=await firstSolmarra.getAttribute('href');
  assert.notEqual(childHref,await rendItem.getByRole('link',{name:'Solmarra Domain',exact:true,includeHidden:true}).getAttribute('href'),'Duplicate labels have distinct anchors');
  const url=page.url();await goldenButton.click();assert.equal(page.url(),url);
  assert.equal(await goldenButton.getAttribute('aria-expanded'),'false');assert.equal(await firstSolmarra.isVisible(),false);
  assert.ok(await page.locator('.lexicon-article').getByRole('heading',{name:'Kingdom of Pela',exact:true}).isVisible(),'Only navigation collapses');
  await goldenButton.press('Enter');assert.equal(await firstSolmarra.isVisible(),true);
  await goldenButton.press('ArrowLeft');assert.equal(await firstSolmarra.isVisible(),false);
  await goldenButton.press('ArrowRight');assert.equal(await firstSolmarra.isVisible(),true);
  await goldenButton.press('Space');assert.equal(await firstSolmarra.isVisible(),false);
  // A reader re-render keeps the chosen branch state; a deep link reveals its ancestors.
  await page.getByRole('link',{name:'Edit wiki page',exact:true}).click();assert.equal(await goldenButton.getAttribute('aria-expanded'),'false');
  await page.getByRole('link',{name:'View wiki page',exact:true}).click();assert.equal(await goldenButton.getAttribute('aria-expanded'),'false');
  await page.evaluate(href=>{const a=document.createElement('a');a.href=href;a.textContent='Deep section';document.querySelector('.lexicon-article').append(a);},childHref);
  await page.getByRole('link',{name:'Deep section',exact:true}).click();assert.equal(await goldenButton.getAttribute('aria-expanded'),'true');
  await page.waitForFunction(()=>document.querySelector('[data-outline-list] [aria-current="location"]')?.textContent==='Solmarra Domain');
  await goldenButton.click();assert.equal(await goldenItem.getAttribute('data-current-within'),'');
  await goldenButton.click();await page.screenshot({path:shots+'/outline-tree-desktop.png'});
  await page.reload();await h.ready();assert.equal(await goldenButton.getAttribute('aria-expanded'),'true');
  // Scrolling to a parent expands it; reaching a deeper heading expands that path.
  await open(wiki.id);assert.equal(await goldenButton.getAttribute('aria-expanded'),'false');
  await page.locator('.lexicon-article').getByRole('heading',{name:golden,exact:true}).evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-document.querySelector('.site-header').getBoundingClientRect().bottom-10));
  await page.waitForFunction(()=>document.querySelector('[data-outline-list] [aria-label="Collapse The Golden Age and its civilizations"]'));
  assert.equal(await rendItem.locator(':scope > .lexicon-outline-row > button').getAttribute('aria-expanded'),'false');
  await page.locator('.lexicon-article').getByRole('heading',{name:'Archive',exact:true}).evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-document.querySelector('.site-header').getBoundingClientRect().bottom-10));
  await outline.getByRole('link',{name:'Archive',exact:true}).waitFor();
  // The popover control stays opaque in its normal and hover states.
  await page.locator('.lexicon-article > [data-prose] p').first().scrollIntoViewIfNeeded();
  await page.locator('.lexicon-article > [data-prose]').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el.querySelector('p'));getSelection().removeAllRanges();getSelection().addRange(r);});
  const textButton=page.locator('.lexicon-selection-action');await textButton.waitFor();
  const opaque=()=>textButton.evaluate(el=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data[3]===255&&getComputedStyle(el).opacity==='1';});
  assert.equal(await opaque(),true);await textButton.hover();assert.equal(await opaque(),true);
  await textButton.click();await page.getByRole('menu',{name:'Text actions'}).waitFor();await page.keyboard.press('Escape');
  // Module/section headings stay parents even when their prose starts at h2.
  await open(wiki.id,'a');const body=branch('Body');assert.deepEqual(await body.locator(':scope > ul > li > .lexicon-outline-row > a').allTextContents(),['Builder heading']);
  assert.equal(await body.getByRole('link',{name:'Builder detail',exact:true}).isVisible(),false);
  await body.locator(':scope > .lexicon-outline-row > button').click();await body.getByRole('button',{name:'Expand Builder heading',exact:true}).click();assert.ok(await body.getByRole('link',{name:'Builder detail',exact:true}).isVisible());
  const standalone=await store.createWiki({id:f.uuid(),kind:'standalone',name:'Standalone outline'}),aid=f.uuid(),sid=f.uuid();
  await store.save('lexicon_articles',{id:aid,wiki_id:standalone.id,title:'Article',introduction:'Overview text.'});
  await store.save('lexicon_sections',{id:sid,wiki_id:standalone.id,article_id:aid,label:'History',body:'## Early era\n\n#### A subheading\n\nSaved text.'});
  await open(standalone.id,aid);assert.deepEqual(await branch('History').locator(':scope > ul > li > .lexicon-outline-row > a').allTextContents(),['Early era']);
  // The generated introduction shortcut must not duplicate an Overview section.
  const overviewId=f.uuid();await store.save('lexicon_sections',{id:overviewId,wiki_id:standalone.id,article_id:aid,label:'Overview',body:'## Structure\n\n'+Array(20).fill('A detailed account.').join('\n\n')+'\n\n## Visibility\n\nSeen across the region.'});
  await store.save('lexicon_articles',{id:aid,wiki_id:standalone.id,title:'Article',introduction:Array(20).fill('Introduction text.').join('\n\n')});
  await open(standalone.id,aid);const overview=branch('Overview');assert.equal(await outline.getByRole('link',{name:'Overview',exact:true}).count(),1);assert.deepEqual(await overview.locator(':scope > ul > li > .lexicon-outline-row > a').allTextContents(),['Structure','Visibility']);assert.equal(await overview.getByRole('button',{name:'Expand Overview',exact:true}).count(),1);
  await page.locator('.lexicon-article > section > h2').filter({hasText:/^Overview$/}).evaluate(el=>scrollTo(0,el.getBoundingClientRect().top+scrollY-document.querySelector('.site-header').getBoundingClientRect().bottom-10));await page.waitForFunction(()=>document.querySelector('[data-outline-list] [aria-current="location"]')?.textContent==='Overview');await overview.getByRole('link',{name:'Structure',exact:true}).waitFor();
  await overview.getByRole('link',{name:'Structure',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-outline-list] [aria-current="location"]')?.textContent==='Structure');await page.reload();await h.ready();assert.ok(await overview.getByRole('link',{name:'Structure',exact:true}).isVisible());
  await overview.getByRole('link',{name:'Overview',exact:true}).click();assert.equal(new URL(page.url()).hash,'#article-overview');await page.waitForFunction(()=>document.querySelector('[data-outline-list] [aria-current="location"]')?.textContent==='Overview');
  await store.save('lexicon_articles',{id:aid,wiki_id:standalone.id,title:'Article',introduction:''});await open(standalone.id,aid);assert.equal(await outline.getByRole('link',{name:'Overview',exact:true}).count(),1);assert.ok((await outline.getByRole('link',{name:'Overview',exact:true}).getAttribute('href')).endsWith('#section-'+overviewId));
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await open(wiki.id);await page.locator('[data-outline] > summary').click();
   assert.equal(await firstSolmarra.isVisible(),false);await goldenButton.click();assert.equal(await firstSolmarra.isVisible(),true);await goldenButton.click();assert.equal(await firstSolmarra.isVisible(),false);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width===390)await page.screenshot({path:shots+'/outline-tree-mobile.png'});
  }
  assert.deepEqual(await f.snapshot(),source);
  assert.ok(f.writes.slice(writes).every(write=>write.table.startsWith('lexicon_')));
  assert.deepEqual(h.errors,[]);
  console.log('Outline: heading hierarchy, independent sibling branches, duplicate/skipped heading levels, keyboard toggles, collapsed defaults, deep links, scroll expansion, source/standalone sections, mobile and solid Text actions passed.');
 }catch(error){console.error(page.url(),(await page.locator('body').innerText()).slice(-4500));throw error;}finally{await h.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
