const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture } = require('./lexicon-fixture.cjs');
const { Store } = require('../lexicon-data.js');
const base = process.env.CENTRALIS_BASE_URL || 'http://127.0.0.1:4173';
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
const output = 'node_modules/.cache/lexicon';
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const f=await fixture();const s=new Store(f.client(),{id:1});
 const wiki=await s.createWiki({id:f.uuid(),name:'Navigation test',kind:'universe',universe_id:'u1'});
 const other=await s.createWiki({id:f.uuid(),name:'Other wiki',kind:'universe',universe_id:'u1'});
 await f.db.exec("update elements set description='Harbor appears here.' where id in ('a','c');");
 await s.save('lexicon_annotations',{id:f.uuid(),wiki_id:wiki.id,article_id:'c',subject_type:'article',subject_id:'c',property:'introduction',kind:'link',target_id:'b',anchor:{quote:'Harbor',prefix:'',suffix:' appears here.',start:0,end:6}});
 const sourceBefore=await f.snapshot();
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const calls=[];let imageGate=null,imageFailure=false,currentUser={id:1};
  await context.exposeBinding('navigationDb',async(_,{op})=>{
    assert.equal(op.method,'select','Navigation must only read data');
    calls.push({kind:'query',table:op.table,time:Date.now()});
    await delay(80);return f.request(op);
  });
  await context.exposeBinding('navigationAuth',async()=>{calls.push({kind:'auth',time:Date.now()});return currentUser;});
  await context.exposeBinding('navigationImages',async()=>{
    calls.push({kind:'images',time:Date.now()});
    if(imageGate)await imageGate;else await delay(400);
    return imageFailure ? {data:null,error:{message:'Test image failure'}} : {data:{images:[{object_id:'a',image_url:base+'/assets/centralis-icon.svg'},{object_id:'b',image_url:base+'/assets/centralis-icon.svg'}]},error:null};
  });
  await context.addInitScript(()=>{
    window.navigationDocument=crypto.randomUUID();
    window.lexiconTestClient={from(table){
      const op={table,method:'select',filters:[],orders:[]};
      const q={select(columns='*'){op.columns=columns;return q;},eq(k,v){op.filters.push(['eq',k,v]);return q;},in(k,v){op.filters.push(['in',k,v]);return q;},order(k,o={}){op.orders.push([k,o.ascending]);return q;},range(a,b){op.range=[a,b];return q;},then(resolve,reject){return window.navigationDb({op}).then(resolve,reject);}};return q;
    },functions:{invoke:async()=>{const result=await window.navigationImages();window.navigationImageCompletions=(window.navigationImageCompletions||0)+1;return result;}}};
    window.centralisSupabase=window.lexiconTestClient;
    window.centralisCurrentAppUser={id:1};
    // Install fixture auth for every document, including native modifier-click tabs.
    Object.defineProperty(window,'centralisGetCurrentAppUser',{get:()=>()=>window.navigationAuth(),set:()=>{}});
  });
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin!==base || u.pathname==='/supabase-config.js')return route.fulfill({status:200,body:''});
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const route=(id='a',w=wiki.id)=>`${base}/lexicon-wiki.html?wiki=${w}&article=${id}`;
  const heading=name=>page.locator('[data-wiki-content] h1').getByText(name,{exact:true});
  await page.goto(route());await heading('Stormhaven').waitFor();
  await page.locator('.lexicon-infobox img').waitFor();
  const documents=[];page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents.push(r.url());});
  const documentId=await page.evaluate(()=>window.navigationDocument);
  const countBefore=calls.length;const start=performance.now();
  await page.locator('.lexicon-article a[data-article-id="b"]').click();await heading('Harbor').waitFor();
  const measurement={articleClickMs:Math.round(performance.now()-start),documentRequests:documents.length,queryRequests:calls.slice(countBefore).filter(c=>c.kind==='query').length,authCalls:calls.slice(countBefore).filter(c=>c.kind==='auth').length,imageCalls:calls.slice(countBefore).filter(c=>c.kind==='images').length};
  fs.writeFileSync(`${output}/navigation-after.json`,JSON.stringify({latency:{queryMs:80,imagesMs:400},...measurement},null,2));
  console.log(`after: ${JSON.stringify(measurement)} (isolated fixture, 80ms/query and 400ms/image latency)`);
  assert.deepEqual({...measurement,articleClickMs:0},{articleClickMs:0,documentRequests:0,queryRequests:0,authCalls:0,imageCalls:0});
  assert.equal(await page.evaluate(()=>window.navigationDocument),documentId);
  assert.ok(page.url().endsWith('&article=b'));
  assert.equal(await page.getByRole('heading',{name:'Loading wiki...',exact:true}).count(),0);
  await page.goBack();await heading('Stormhaven').waitFor();
  await page.goForward();await heading('Harbor').waitFor();
  assert.equal(calls.length,countBefore);assert.equal(documents.length,0);
  await page.getByRole('link',{name:'Wiki home',exact:true}).click();await heading('Aesterra').waitFor();
  await page.getByRole('link',{name:'All articles',exact:true}).click();await page.locator('[data-wiki-content] a[href*="article=c"]').last().click();await heading('Island').waitFor();
  assert.equal(calls.length,countBefore);
  // The editor shares routing but keeps its own forms and can return through history.
  await page.getByRole('link',{name:'Customize wiki page',exact:true}).click();
  await heading('Island').waitFor();
  await page.getByRole('link',{name:'View wiki page',exact:true}).click();await heading('Island').waitFor();
  await page.goBack();await heading('Island').waitFor();
  await page.goForward();await heading('Island').waitFor();assert.equal(calls.length,countBefore);
  // Normal hrefs remain usable in a separate tab and directly after reload.
  const popupPromise=context.waitForEvent('page');popupPromise.catch(()=>{});
  await page.locator('.lexicon-article a[data-article-id="b"]').last().click({modifiers:['Control']});
  const popup=await popupPromise;
  await popup.locator('[data-wiki-content] h1').getByText('Harbor',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.navigationDocument),documentId);await heading('Island').waitFor();await popup.close();
  // Other native click semantics must not be swallowed by the local router.
  assert.deepEqual(await page.evaluate(()=>{
    const link=document.querySelector('.lexicon-article a[data-article-id="b"]');
    return [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{target:'_blank'},{download:true}].map(options=>{
      if(options.target)link.target=options.target;if(options.download)link.download='wiki';
      let intercepted;
      window.addEventListener('click',event=>{intercepted=event.defaultPrevented;event.preventDefault();},{once:true});
      link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,...options}));
      link.removeAttribute('target');link.removeAttribute('download');return intercepted;
    });
  }),[false,false,false,false,false,false,false]);
  // Source values refresh on explicit reload and actual document loads.
  await f.db.query("update elements set name='Updated Harbor' where id='b'");
  await page.getByRole('button',{name:'Reload source',exact:true}).click();
  await page.getByRole('link',{name:'All articles',exact:true}).click();await page.locator('[data-wiki-content] a[href*="article=b"]').getByText('Updated Harbor',{exact:true}).waitFor();
  await page.locator('[data-wiki-content] a[href*="article=b"]').click();await heading('Updated Harbor').waitFor();
  await f.db.query("update elements set name='Fresh Harbor' where id='b'");
  await page.reload();await heading('Fresh Harbor').waitFor();
  assert.notEqual(await page.evaluate(()=>window.navigationDocument),documentId);
  await f.db.query("update elements set name='Harbor' where id='b'");
  // A different wiki always takes a fresh authorized document/data path.
  await s.override(other.id,{subjectType:'article',articleId:'b',id:'b'},'title','Other wiki title');
  const beforeOther=calls.length;const currentDocument=await page.evaluate(()=>window.navigationDocument);
  await page.evaluate(href=>{const link=document.createElement('a');link.href=href;link.textContent='Other wiki';document.querySelector('[data-wiki-actions]').append(link);},route('b',other.id));
  await page.getByRole('link',{name:'Other wiki',exact:true}).click();await heading('Other wiki title').waitFor();
  assert.notEqual(await page.evaluate(()=>window.navigationDocument),currentDocument);assert.ok(calls.length>beforeOther);
  // Image signing cannot block text, navigation, or replace an editor draft on arrival.
  let releaseImages;imageGate=new Promise(resolve=>releaseImages=resolve);
  const freshStart=performance.now();await page.goto(route());await heading('Stormhaven').waitFor();
  console.log(`Text ready with images held pending: ${Math.round(performance.now()-freshStart)}ms.`);
  await page.waitForFunction(()=>document.querySelector('[data-wiki-content] h1')?.textContent==='Stormhaven');
  assert.equal(await page.locator('.lexicon-infobox img').count(),0);
  await page.locator('[data-wiki-content][aria-busy="false"]').waitFor();
  const beforePending=calls.filter(c=>c.kind==='query').length;
  await page.locator('.lexicon-article a[data-article-id="b"]').click();await heading('Harbor').waitFor();
  assert.equal(calls.filter(c=>c.kind==='query').length,beforePending);
  await page.getByRole('link',{name:'Customize wiki page',exact:true}).click();await heading('Harbor').waitFor();
  await page.locator('.lexicon-settings > summary').click();
  const draft=page.getByRole('form',{name:'Introduction',exact:true}).locator('textarea');await draft.fill('Keep this draft');
  const completedBefore=await page.evaluate(()=>window.navigationImageCompletions||0);
  releaseImages();imageGate=null;
  await page.waitForFunction(count=>(window.navigationImageCompletions||0)>count,completedBefore);
  assert.equal(await draft.inputValue(),'Keep this draft');
  await page.getByRole('link',{name:'View wiki page',exact:true}).click();await heading('Harbor').waitFor();
  await page.locator('.lexicon-infobox img').waitFor();
  // Image errors are nonfatal; visibility still applies on local routes.
  imageFailure=true;await page.reload();await heading('Harbor').waitFor();
  await page.getByText('Images unavailable: Test image failure',{exact:true}).waitFor();imageFailure=false;
  await s.override(wiki.id,{subjectType:'article',articleId:'b',id:'b'},'hidden',true);
  await page.getByRole('button',{name:'Reload source',exact:true}).click();await page.getByText('This article is hidden in this wiki.',{exact:true}).waitFor();
  assert.equal(await page.locator('.lexicon-article a[data-article-id="b"]').count(),0);
  await page.getByRole('link',{name:'Customize wiki page',exact:true}).click();await heading('Harbor').waitFor();
  // An account change immediately discards data, even with a late image response.
  let releaseLate;imageGate=new Promise(resolve=>releaseLate=resolve);
  await page.goto(route());await heading('Stormhaven').waitFor();await page.locator('[data-wiki-content][aria-busy="false"]').waitFor();
  await page.evaluate(()=>{window.centralisCurrentAppUser={id:2};window.dispatchEvent(new CustomEvent('centralis:current-user-changed',{detail:{user:{id:2}}}));});
  assert.equal(await page.locator('[data-wiki-content]').innerText(),'');
  assert.equal(await page.locator('[data-wiki-navigation]').innerText(),'');
  const completedLate=await page.evaluate(()=>window.navigationImageCompletions||0);
  releaseLate();imageGate=null;
  await page.waitForFunction(count=>(window.navigationImageCompletions||0)>count,completedLate);
  assert.equal(await page.locator('[data-wiki-content]').innerText(),'');
  currentUser={id:2};await f.db.exec("set request.jwt.claim.sub='other'");
  await page.reload();await page.getByText('Wiki not found or access denied.',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-wiki-content] h1').innerText(),'Wiki unavailable');
  await f.db.exec("set request.jwt.claim.sub='owner'");
  assert.deepEqual(await f.snapshot(),sourceBefore);
  assert.deepEqual(errors,[]);
  console.log('Navigation passed: no reload/read/auth/image requests on internal links, history, editor switching, modified/new-tab clicks, deep loads, live reload, wiki/account isolation, nonblocking images, drafts, visibility and zero source writes.');
 } finally {await browser.close();await f.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
