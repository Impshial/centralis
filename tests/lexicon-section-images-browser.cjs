const assert=require('node:assert/strict');
const fs=require('node:fs');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,store,page,open}=h;
 const shots='node_modules/.cache/lexicon/screenshots';fs.mkdirSync(shots,{recursive:true});
 try{
  const wiki=await store.createWiki({id:f.uuid(),name:'Aesterra',kind:'universe',universe_id:'u1'});
  const link=id=>`lexicon-wiki.html?wiki=${wiki.id}&article=${id}`;
  await f.db.exec(`update elements set description='A coastal city near Harbor with several surrounding regions.' where id='a';
   insert into elements(id,user_id,universe_id,name) values('d',1,'u1','No image'),('e',1,'u1','Hidden place'),('f',1,'u1','Seaport'),('g',1,'u1','Reef'),('shared',1,'u1','Shared image');
   update element_template_sections set name='Regions' where id='s1';
   update element_type_template_fields set field_type='textarea',label='Major regions' where id='f3';
   insert into element_template_sections(id,template_id,name,sort_order) values('s3','template1','Trade',3),('s4','template1','Other places',4);
   insert into chronicle_modules(id,element_id,user_id,module_type,data,sort_order) values('m3','a',1,'template_section','{"section_id":"s3","template_id":"template1"}',3),('m4','a',1,'template_section','{"section_id":"s4","template_id":"template1"}',4);
   insert into element_type_template_fields(id,template_id,section_id,label,field_type,sort_order) values('f5','template1','s3','Routes','textarea',0),('f6','template1','s4','Places','textarea',0);`);
  const regionText='- Harbor connects the coastal settlements. Ships arrive throughout the year.\n- Island lies offshore, with forests and sheltered bays.\n\n'+ 'The towns exchange food, timber, and supplies along established routes. '.repeat(14);
  const tradeText='Harbor handles trade with nearby towns. Island receives supplies.';
  await f.db.query("insert into element_template_field_values(element_id,template_field_id,value) values('a','f3',$1),('a','f5',$2),('a','f6',$3)",[regionText,tradeText,'No image and Hidden place appear here. Harbor and Island are also linked. Shared image uses the Seaport image. [External destination](https://example.com).']);
  await f.db.query("update elements set body=$1 where id='a'",[`## Maritime history\n\n[Seaport](${link('f')}) connects the coast.\n\n### Ships\n\nThe fleet sails daily.\n\n## Quiet years\n\nNo destinations are linked here.\n\n## Offshore\n\n[Reef](${link('g')}) lies offshore.`]);
  await f.db.query("update universes set description=$1 where id='u1'",[`## Seas\n\n[Harbor](${link('b')}) is a coastal port.\n\n## Islands\n\n[Island](${link('c')}) lies offshore.`]);
  await store.override(wiki.id,{subjectType:'article',articleId:'e',id:'e'},'hidden',true);
  const svg=color=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${color}"/><path d="M0 400L160 180L280 330L440 130L640 400V480H0Z" fill="#39576a"/><circle cx="500" cy="90" r="40" fill="#f7e4ab"/></svg>`);
  const images=[{object_id:'b',image_url:svg('#1c3548')},{object_id:'c',image_url:svg('#37665d')},{object_id:'e',image_url:svg('#661122')},{object_id:'f',image_url:svg('#335577')},{object_id:'g',image_url:svg('#556677')},{object_id:'shared',image_url:svg('#335577')}];
  const writes=f.writes.length,snapshot=await f.snapshot();
  async function installImages(random=.99){
   await page.evaluate(({images,random})=>{
    window.sectionRandom=random;Math.random=()=>window.sectionRandom;
    const original=centralisSupabase.functions.invoke;
    centralisSupabase.functions.invoke=(name,options)=>name==='lexicon-images'?new Promise(resolve=>{window.releaseSectionImages=()=>resolve({data:{images},error:null});}):original(name,options);
   },{images,random});
   await page.getByRole('button',{name:'Reload source',exact:true}).click();await page.waitForFunction(()=>typeof window.releaseSectionImages==='function');
  }
  const figures=()=>page.locator('.lexicon-section-image');
  const regions=()=>page.locator('[data-section-id="m1"] .lexicon-section-image');
  const uniqueImages=async()=>{const sources=await page.locator('.lexicon-reader img').evaluateAll(imgs=>imgs.map(img=>img.src));assert.equal(new Set(sources).size,sources.length,'No repeated images anywhere on the article');};
  await page.setViewportSize({width:1600,height:1000});await open(wiki.id,'a');await installImages();
  assert.equal(await figures().count(),0,'Text is readable while image metadata is pending');
  await page.evaluate(()=>{const root=document.querySelector('[data-section-id="m1"] [data-label="Major regions"]'),n=root.querySelector('[data-article-mention="b"]').firstChild,r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);});
  await page.evaluate(()=>window.releaseSectionImages());await regions().waitFor();
  assert.equal(await page.evaluate(()=>getSelection().toString()),'Harbor','Delayed illustrations preserve the current text selection');
  assert.equal(await figures().count(),4,'One illustration per linked module or top-level Markdown section');
  assert.equal(await page.locator('.lexicon-article > [data-prose] .lexicon-section-image').count(),0,'The introduction stays image-free even when it links to an element with an image');
  assert.equal(await regions().getAttribute('data-linked-element'),'c','Random selection can choose the second eligible element');
  assert.equal(await regions().locator('figcaption').innerText(),'Island');
  assert.equal(await page.locator('[data-section-id="m3"] .lexicon-section-image').getAttribute('data-linked-element'),'b');
  assert.equal(await page.locator('[data-section-id="m4"] .lexicon-section-image').count(),0,'Used elements and shared image URLs cannot repeat; missing, hidden and external images are excluded');
  await uniqueImages();
  assert.equal(await page.locator('.lexicon-sidebar .lexicon-section-image').count(),0);
  await page.evaluate(()=>getSelection().removeAllRanges());
  await regions().scrollIntoViewIfNeeded();
  assert.ok(await regions().evaluate(el=>{const f=el.getBoundingClientRect(),article=el.closest('.lexicon-article').getBoundingClientRect(),section=el.closest('section').getBoundingClientRect(),sidebar=document.querySelector('.lexicon-sidebar').getBoundingClientRect();return f.left>article.left+article.width/2&&Math.abs(f.right-article.right)<2&&f.right<sidebar.left&&f.bottom<=section.bottom;}),'Illustration floats inside the article column and stays in its section');
  await page.screenshot({path:shots+'/section-images-desktop.png'});
  const image=regions().getByRole('button',{name:'View image: Island',exact:true}),viewer=page.locator('[data-centralis-image-viewer]');
  await image.focus();await page.keyboard.press('Enter');await viewer.waitFor();
  assert.equal(await viewer.locator('[data-centralis-image-viewer-image]').getAttribute('alt'),'Island');
  await viewer.getByRole('button',{name:'Details',exact:true}).click();assert.match(await viewer.locator('[data-centralis-image-viewer-details]').innerText(),/Caption\s+Island/i);
  await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});assert.equal(await image.evaluate(el=>document.activeElement===el),true);
  await page.evaluate(()=>window.sectionRandom=0);
  await page.getByRole('link',{name:'Edit wiki page',exact:true}).click();await page.getByRole('button',{name:'Edit Major regions',exact:true}).waitFor();
  assert.equal(await figures().count(),0,'Generated images are not inserted into editing fields');
  await page.getByRole('link',{name:'View wiki page',exact:true}).click();await regions().waitFor();assert.equal(await regions().getAttribute('data-linked-element'),'c','Choice is stable across reader re-renders');
  await uniqueImages();
  await page.getByRole('link',{name:'Wiki home',exact:true}).click();await figures().first().waitFor();assert.equal(await figures().count(),1,'An empty Markdown lead does not bypass the first-section rule');
  assert.equal(await figures().first().getAttribute('data-linked-element'),'c','Only the second Markdown section receives an image');
  await page.goBack();await regions().waitFor();assert.equal(await regions().getAttribute('data-linked-element'),'c','Choice is stable across local navigation');
  for(const width of [768,390,320]){
   await page.setViewportSize({width,height:900});await regions().scrollIntoViewIfNeeded();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);
   if(width<600)assert.equal(await regions().evaluate(el=>getComputedStyle(el).float),'none');
   if(width===390)await page.screenshot({path:shots+'/section-images-mobile.png'});
  }
  // A fresh page can randomly choose a different eligible element.
  await open(wiki.id,'a');await installImages(0);await page.evaluate(()=>window.releaseSectionImages());await regions().waitFor();
  assert.equal(await regions().getAttribute('data-linked-element'),'b');
  assert.equal(await page.locator('[data-section-id="m3"] .lexicon-section-image').getAttribute('data-linked-element'),'c','A later section chooses an unused alternative');
  await uniqueImages();
  // A saved unlink annotation removes a candidate even if its name remains in the prose.
  const start=tradeText.indexOf('Island');
  await store.save('lexicon_annotations',{id:f.uuid(),wiki_id:wiki.id,article_id:'a',subject_type:'template_field',subject_id:'f5',property:'value',kind:'unlink',anchor:{quote:'Island',prefix:tradeText.slice(0,start),suffix:' receives supplies.',start,end:start+6}});
  await page.getByRole('button',{name:'Reload source',exact:true}).click();await page.getByText('Source reloaded.',{exact:true}).waitFor();await page.evaluate(()=>window.releaseSectionImages());await regions().waitFor();
  assert.equal(await page.locator('[data-section-id="m3"] .lexicon-section-image').count(),0);
  await uniqueImages();
  // The same image in Article Details is also excluded from automatic placement.
  images.push({object_id:'a',image_url:images[0].image_url});
  await open(wiki.id,'a');await installImages(0);await page.evaluate(()=>window.releaseSectionImages());await regions().waitFor();
  assert.equal(await regions().getAttribute('data-linked-element'),'c');await uniqueImages();
  assert.equal(f.writes.length,writes+1,'Only the explicit test annotation writes data');assert.deepEqual(await f.snapshot(),snapshot);
  // Without an introduction or Body, the first displayed module is the first section.
  await f.db.exec("update elements set description='',body=null where id='a'");images.pop();
  await open(wiki.id,'a');await installImages(0);await page.evaluate(()=>window.releaseSectionImages());
  await page.locator('[data-section-id="m3"] .lexicon-section-image').waitFor();
  assert.equal(await regions().count(),0,'The first template section stays image-free when the introduction is empty');
  assert.equal(await page.locator('[data-section-id="m3"] .lexicon-section-image').getAttribute('data-linked-element'),'b','Skipping the first section does not reserve its linked images');
  await uniqueImages();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('centralis:current-user-changed',{detail:{user:{id:2}}})));
  assert.equal(await figures().count(),0);
  assert.deepEqual(h.errors,[]);
  console.log('Section images: first introduction/Markdown/template section excluded, no repeats across sections or Article Details, unused alternatives, shared image URLs, delayed loading, linked modules and Markdown headings, random/stable choices, names, hidden/missing/unlinked targets, column containment, mobile, shared viewer, editor exclusion and zero automatic writes passed.');
 }catch(e){console.error(page.url(),(await page.locator('body').innerText()).slice(-2800));throw e;}finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
