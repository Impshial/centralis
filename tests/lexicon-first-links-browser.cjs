const assert=require('node:assert/strict');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,store,page,open}=h;
 try{
  const wiki=await store.createWiki({id:f.uuid(),name:'First mentions',kind:'universe',universe_id:'u1'});
  await f.db.exec(`update elements set description='Harbor appears first. Harbor appears again.',body='## History\n\nHarbor has an old port.' where id='a';
   update elements set description='Harbor is nearby.' where id='c';
   update universes set description='Harbor is on the coast.\n\n## Trade\n\nHarbor trades with Island.' where id='u1';
   update element_type_template_fields set field_type='textarea' where id='f3';
   insert into element_template_field_values(element_id,template_field_id,value) values('a','f3','Old Port supports trade. Island lies offshore. Harbor has docks.');
   insert into element_template_sections(id,template_id,name,sort_order) values('s3','template1','Culture',3);
   insert into chronicle_modules(id,element_id,user_id,module_type,data,sort_order) values('m3','a',1,'template_section','{"section_id":"s3","template_id":"template1"}',3);
   insert into element_custom_fields(id,element_id,name,value,sort_order,chronicle_module_id) values('culture','a','Traditions','Harbor and Island celebrate together.',0,'m3');`);
  await store.save('lexicon_aliases',{id:f.uuid(),wiki_id:wiki.id,article_id:'b',alias:'Old Port'});
  const article=()=>page.locator('.lexicon-article');
  const auto=id=>article().locator(`a[data-auto-link][data-article-id="${id}"]`);
  const check=async()=>{
   assert.equal(await auto('b').count(),1,'Harbor is linked once across introduction, Body and modules');
   assert.equal(await article().locator(':scope > [data-prose] a[data-article-id="b"]').innerText(),'Harbor');
   assert.equal(await auto('c').count(),1,'A destination first mentioned in a later module is linked there');
   assert.equal(await article().locator('[data-section-id="m3"] a[data-auto-link]').count(),0);
   assert.match(await article().locator('[data-section-id="m1"]').innerText(),/Old Port supports trade/);
   assert.match(await article().locator('[data-section-id="m3"]').innerText(),/Harbor and Island celebrate together/);
  };
  const before=await f.snapshot(),writes=f.writes.length;
  await open(wiki.id,'a');await check();
  await auto('c').click();await page.locator('.lexicon-article h1').getByText('Island',{exact:true}).waitFor();
  assert.equal(await auto('b').count(),1,'Tracking starts fresh on each article');
  await page.goBack();await page.locator('.lexicon-article h1').getByText('Stormhaven',{exact:true}).waitFor();await check();
  await page.reload();await h.ready();await check();
  await page.getByRole('link',{name:'Edit wiki page',exact:true}).click();await check();
  await page.getByRole('link',{name:'View wiki page',exact:true}).click();await check();
  await open(wiki.id);assert.equal(await auto('b').count(),1,'Universe Markdown sections share the same tracking');
  assert.equal(f.writes.length,writes);assert.deepEqual(await f.snapshot(),before);
  // Manually authored links remain intact even when their destination was mentioned earlier.
  await f.db.query("update element_custom_fields set value=$1 where id='culture'",[`Harbor and [Harbor again](lexicon-wiki.html?wiki=${wiki.id}&article=b).`]);
  await open(wiki.id,'a');assert.equal(await auto('b').count(),1);
  assert.equal(await article().locator('[data-section-id="m3"] a').innerText(),'Harbor again');
  const standalone=await store.createWiki({id:f.uuid(),name:'Standalone',kind:'standalone'}),source=f.uuid(),target=f.uuid();
  await store.save('lexicon_articles',{id:target,wiki_id:standalone.id,title:'Greenmere Vale'});
  await store.save('lexicon_articles',{id:source,wiki_id:standalone.id,title:'Viora',introduction:'Greenmere Vale has farms.'});
  await store.save('lexicon_sections',{id:f.uuid(),wiki_id:standalone.id,article_id:source,label:'Culture',body:'Greenmere Vale has seasonal festivals.'});
  await open(standalone.id,source);assert.equal(await auto(target).count(),1,'Standalone sections share article tracking');
  assert.deepEqual(h.errors,[]);
  console.log('First article links: introduction/Body/modules, aliases, later first mentions, universe/standalone sections, navigation/reload/edit mode, explicit links and unchanged source passed.');
 }finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
