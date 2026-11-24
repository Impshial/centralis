const assert=require('node:assert/strict');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,store,page,open,base,settings}=h;
 try{
  const wiki=await store.createWiki({id:f.uuid(),name:'Main wiki',kind:'universe',universe_id:'u1'});
  const second=await store.createWiki({id:f.uuid(),name:'Other wiki',kind:'universe',universe_id:'u1'});
  const excerpt=f.uuid(),fact=f.uuid(),relation=f.uuid(),root=f.uuid(),other=f.uuid();
  await store.save('lexicon_facts',{id:excerpt,wiki_id:wiki.id,article_id:'a',label:'Accidental excerpt',kind:'excerpt',reference:{subject_type:'article',subject_id:'a',property:'introduction',anchor:{quote:'coastal city',start:2,end:14,prefix:'A ',suffix:'. Population is ordinary prose.'}}});
  await store.save('lexicon_facts',{id:fact,wiki_id:wiki.id,article_id:'a',label:'Mayor',value:'Mirella'});
  await store.save('lexicon_facts',{id:relation,wiki_id:wiki.id,article_id:'a',label:'Trading partner',kind:'relationship',reference:{subject_type:'source_link',subject_id:'l1'}});
  await store.save('lexicon_facts',{id:root,wiki_id:wiki.id,article_id:'u1',label:'Calendar',value:'Year 4525'});
  await store.save('lexicon_facts',{id:other,wiki_id:second.id,article_id:'a',label:'Other mayor',value:'Other value'});
  const sourceBefore=await f.snapshot();
  // Removal is available beside the actual item and preserves unrelated drafts on failure/retry.
  await open(wiki.id,'a',true);await page.getByRole('heading',{name:'Article Details',exact:true}).waitFor();
  await settings();const title=page.getByRole('form',{name:'Article title',exact:true});await title.locator('[name="value"]').fill('Draft title');
  await page.getByRole('button',{name:'Manage Article Details',exact:true}).click();await page.locator(`[data-detail-node="${excerpt}"] > button`).click();
  const remove=page.getByRole('button',{name:'Remove Accidental excerpt from Article Details',exact:true});
  h.failNext('lexicon_facts');await remove.click();await page.locator('[data-wiki-status]').getByText('Fixture save failed',{exact:true}).waitFor();assert.equal(await remove.count(),1);
  await remove.click();await page.locator('[data-wiki-status]').getByText('Detail removed.',{exact:true}).waitFor();assert.equal(await remove.count(),0);
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await settings();assert.equal(await title.locator('[name="value"]').inputValue(),'Draft title');
  assert.equal((await f.db.query('select count(*)::int n from lexicon_facts where id=$1',[excerpt])).rows[0].n,0);
  assert.deepEqual(await f.snapshot(),sourceBefore);
  // Source-derived details can be removed from this wiki without deleting the source custom field.
  await page.getByRole('button',{name:'Manage Article Details',exact:true}).click();await page.locator('[data-detail-node="custom1"] > button').click();await page.getByRole('button',{name:'Remove Founded from Article Details',exact:true}).click();await page.locator('[data-wiki-status]').getByText('Detail removed.',{exact:true}).waitFor();
  assert.deepEqual(await f.snapshot(),sourceBefore);
  await open(second.id,'a');assert.equal(await page.locator('.lexicon-infobox [data-field-id="custom1"]').count(),1);
  // Both wiki-owned facts and pinned relationships are editable Chronicle custom fields.
  async function chronicle(article='a'){
   await page.goto(base+'/chronicle-editor.html#universe/u1'+(article==='u1'?'':'/element/'+article));
   await page.getByRole('button',{name:article==='u1'?'Save Universe':'Save Element',exact:true}).waitFor();
  }
  async function save(){await page.locator('[data-chronicle-workspace-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-chronicle-workspace-save]').disabled);}
  const row=id=>page.locator(`[data-custom-field-id="wiki-fact:${id}"]`);
  await chronicle();assert.equal(await row(fact).locator('[name="custom-value"]').inputValue(),'Mirella');assert.equal(await row(relation).locator('[name="custom-value"]').inputValue(),'Harbor');assert.equal(await row(other).count(),1);assert.equal(await row(excerpt).count(),0);assert.equal(await row(root).count(),0);
  await row(fact).locator('[name="custom-name"]').fill('District mayor');await row(fact).locator('[name="custom-value"]').fill('Mirella Starweave');
  await row(relation).getByRole('button',{name:'Edit detail',exact:true}).click();let d=page.getByRole('dialog');assert.equal(await d.getByLabel('Location',{exact:true}).count(),0);await d.getByLabel('Name (optional)',{exact:true}).fill('Harbor trade');await d.getByRole('button',{name:'Apply',exact:true}).click();
  h.failNext('lexicon_facts');await save();await page.getByText(/Could not save element: Fixture save failed/).waitFor();assert.equal(await row(fact).locator('[name="custom-value"]').inputValue(),'Mirella Starweave');await save();
  const saved=(await f.db.query('select * from lexicon_facts where id=$1',[fact])).rows[0];assert.equal(saved.label,'District mayor');assert.equal(saved.value,'Mirella Starweave');assert.equal((await f.db.query('select kind from lexicon_facts where id=$1',[relation])).rows[0].kind,'relationship','Renaming retains the pinned relationship');
  await open(wiki.id,'a');assert.match(await page.locator(`.lexicon-infobox [data-field-id="${fact}"]`).innerText(),/District mayor\s+Mirella Starweave/);
  await chronicle();await row(fact).getByRole('button',{name:'Remove custom field',exact:true}).click();
  assert.equal((await f.db.query('select count(*)::int n from lexicon_facts where id=$1',[fact])).rows[0].n,1,'Chronicle deletion remains a draft until Save');
  await save();assert.equal((await f.db.query('select count(*)::int n from lexicon_facts where id=$1',[fact])).rows[0].n,0);
  assert.equal((await f.db.query('select value from lexicon_facts where id=$1',[other])).rows[0].value,'Other value');
  await row(relation).locator('[name="custom-value"]').fill('Independent value');await save();assert.equal((await f.db.query('select kind from lexicon_facts where id=$1',[relation])).rows[0].kind,'fact');
  await chronicle('u1');await row(root).locator('[name="custom-value"]').fill('Year 4526');await save();await open(wiki.id);assert.match(await page.locator('.lexicon-infobox').innerText(),/Calendar\s+Year 4526/);
  await chronicle('b');assert.equal(await page.locator('[data-custom-field-id^="wiki-fact:"]').count(),0);
  assert.equal((await f.db.query("select count(*)::int n from element_custom_fields where id like 'wiki-fact:%'")).rows[0].n,0,'No duplicate source records are created');
  assert.deepEqual(h.errors,[]);console.log('Article Details: remove with retry and draft preservation, source hiding, shared Chronicle fields, edit/delete/save, pinned relationship preservation, root/element and multiple wiki scope passed.');
 }catch(e){console.error((await page.locator('body').innerText()).slice(-6000));console.error(JSON.stringify(h.calls.filter(c=>c.op&&c.op.method!=='select').slice(-8)));console.error(await page.locator('input:invalid,textarea:invalid,select:invalid').evaluateAll(els=>els.map(e=>({name:e.name,value:e.value,message:e.validationMessage}))));throw e;}finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
