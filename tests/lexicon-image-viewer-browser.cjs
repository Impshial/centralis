const assert=require('node:assert/strict');
const fs=require('node:fs');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,store,page,open,context}=h;
 const shots='node_modules/.cache/lexicon/screenshots';fs.mkdirSync(shots,{recursive:true});
 try{
  const wiki=await store.createWiki({id:f.uuid(),name:'Aesterra',kind:'universe',universe_id:'u1'}),mediaId=f.uuid();
  const description='The coast surrounds the city.';
  await f.db.query("update elements set description=$1 where id='a'",[description]);
  await f.db.exec('reset role');await f.db.query("insert into lexicon_media(id,wiki_id,storage_key,name) values($1,$2,'fixture','Coastal map')",[mediaId,wiki.id]);await f.db.exec('set role authenticated');
  await store.save('lexicon_annotations',{id:f.uuid(),wiki_id:wiki.id,article_id:'a',subject_type:'article',subject_id:'a',property:'introduction',kind:'image',media_id:mediaId,alt:'Coastal map',caption:'The southern coast.',anchor:{start:description.length,end:description.length,quote:'',prefix:description,suffix:''}});
  const writes=f.writes.length,snapshot=await f.snapshot();
  await open(wiki.id,'a');
  const inline=page.getByRole('button',{name:'View image: Coastal map',exact:true}),primary=page.getByRole('button',{name:'View image: Stormhaven',exact:true});
  await inline.waitFor();
  await page.evaluate(()=>{
   const original=centralisSupabase.functions.invoke;
   centralisSupabase.functions.invoke=(name,options)=>name==='lexicon-images'?new Promise(resolve=>{window.releaseViewerImage=()=>resolve({data:{images:[{object_id:'a',image_url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1000"><rect width="2000" height="1000" fill="teal"/><circle cx="1000" cy="500" r="300" fill="lightblue"/></svg>')}]},error:null});}):original(name,options);
  });
  await page.getByRole('button',{name:'Reload source',exact:true}).click();await page.waitForFunction(()=>typeof window.releaseViewerImage==='function');
  await page.evaluate(()=>window.releaseViewerImage());await primary.waitFor();await inline.waitFor();
  const viewer=page.locator('[data-centralis-image-viewer]'),image=viewer.locator('[data-centralis-image-viewer-image]'),close=viewer.getByRole('button',{name:'Close image viewer'});
  async function loaded(alt){await viewer.waitFor();await page.waitForFunction(alt=>{const i=document.querySelector('[data-centralis-image-viewer-image]');return i.alt===alt&&i.complete&&i.naturalWidth>0&&i.style.visibility!=='hidden';},alt);}
  await primary.click();await loaded('Stormhaven');assert.equal(await close.evaluate(el=>document.activeElement===el),true);
  assert.equal(await page.locator('.app-shell').evaluate(el=>el.inert),true);
  assert.equal(await viewer.locator('[data-centralis-image-viewer-thumb]').count(),2);
  for(const name of ['delete','upload','primary-wrap'])assert.equal(await viewer.locator(`[data-centralis-image-viewer-${name}]`).isVisible(),false);
  await viewer.getByRole('button',{name:'Actual size',exact:true}).click();assert.match(await image.getAttribute('style'),/scale\(1\)/);
  await viewer.getByRole('button',{name:'Fit to view',exact:true}).click();assert.ok(await image.evaluate(el=>Number(el.style.transform.match(/scale\(([^)]+)/)[1])<1));
  await page.screenshot({path:shots+'/image-viewer-desktop.png'});
  await viewer.getByRole('button',{name:'Next image',exact:true}).click();await loaded('Coastal map');
  await viewer.getByRole('button',{name:'Details',exact:true}).click();assert.match(await viewer.locator('[data-centralis-image-viewer-details]').innerText(),/The southern coast\./);
  await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});assert.equal(await primary.evaluate(el=>document.activeElement===el),true);assert.equal(await page.locator('.app-shell').evaluate(el=>el.inert),false);
  await inline.focus();await page.keyboard.press('Enter');await loaded('Coastal map');
  await viewer.getByRole('button',{name:'Details',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await viewer.getByRole('button',{name:'Open in New Tab'}).evaluate(el=>document.activeElement===el),true);
  await page.keyboard.press('Shift+Tab');assert.equal(await viewer.getByRole('button',{name:'Details',exact:true}).evaluate(el=>document.activeElement===el),true);
  await close.click();assert.equal(await inline.evaluate(el=>document.activeElement===el),true);
  // The same controls respond to a touch tap at phone width.
  await page.setViewportSize({width:390,height:844});const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await primary.scrollIntoViewIfNeeded();const b=await primary.boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await loaded('Stormhaven');
  assert.ok(await viewer.locator('[role="dialog"]').evaluate(el=>{const b=el.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;}));
  await page.screenshot({path:shots+'/image-viewer-mobile.png',animations:'disabled'});await close.click();await cdp.detach();
  assert.equal(f.writes.length,writes,'Viewing never saves article or source changes');assert.deepEqual(await f.snapshot(),snapshot);
  await inline.click();await loaded('Coastal map');await page.evaluate(()=>window.dispatchEvent(new CustomEvent('centralis:current-user-changed',{detail:{user:{id:2}}})));
  await viewer.waitFor({state:'hidden'});assert.equal(await viewer.locator('img[src]').count(),0);assert.equal(await page.locator('.app-shell').evaluate(el=>el.inert),false);assert.equal(await page.locator('[data-wiki-content]').innerText(),'');
  assert.deepEqual(h.errors,[]);console.log('Shared image viewer: delayed primary and inline images, active gallery item, zoom/fit, details, keyboard/focus, phone touch, read-only viewing and account cleanup passed.');
 }catch(e){console.error(page.url(),(await page.locator('body').innerText()).slice(-2500));throw e;}finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
