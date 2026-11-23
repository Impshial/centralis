const assert=require('node:assert/strict');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,store,page,open}=h;
 try{
  await f.db.exec("update elements set name='The Drench' where id='b'; update elements set name='The Drench Syndicates' where id='c'; update elements set description='Unrelated words. Rumored ties to The Drench Syndicates. The Drench appears again.' where id='a'");
  const wiki=await store.createWiki({id:f.uuid(),name:'Link actions',kind:'universe',universe_id:'u1'});
  await store.save('lexicon_annotations',{id:f.uuid(),wiki_id:wiki.id,article_id:'a',subject_type:'article',subject_id:'a',property:'introduction',kind:'auto_suppress',target_id:'c',anchor:{quote:'The Drench Syndicates',start:32,end:52}});
  const before=await f.snapshot(),root=()=>page.locator('.lexicon-article > [data-prose]').first(),menu=()=>page.getByRole('menu',{name:'Text actions'});
  const link=()=>root().locator('a[data-article-id="b"]').first();
  const save=async()=>{await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();};
  async function select(quote){await root().evaluate((el,quote)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);const start=nodes.map(n=>n.textContent).join('').indexOf(quote);if(start<0)throw Error('Missing text');let offset=0,found=false,r=document.createRange();for(const n of nodes){if(!found&&start<offset+n.length){r.setStart(n,start-offset);found=true;}if(found&&start+quote.length<=offset+n.length){r.setEnd(n,start+quote.length-offset);break;}offset+=n.length;}getSelection().removeAllRanges();getSelection().addRange(r);},quote);}
  await open(wiki.id,'a');await page.evaluate(()=>getSelection().removeAllRanges());
  await link().click({button:'right'});await menu().waitFor();assert.ok(await menu().getByRole('menuitem',{name:'Replace link…'}).isEnabled());assert.ok(await menu().getByRole('menuitem',{name:'Remove link…'}).isEnabled());
  await menu().getByRole('menuitem',{name:'Replace link…'}).click();assert.equal(await page.getByRole('dialog').getByLabel('Article',{exact:true}).inputValue(),'b');await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await root().locator('[data-auto-link][data-article-id="b"]').count(),1);
  // A stale selection elsewhere must not replace the text under the clicked link.
  await select('Unrelated words');await link().click({button:'right'});await menu().getByRole('menuitem',{name:'Remove link…'}).click();await save();assert.equal(await root().locator('[data-article-id="b"]').count(),0);
  await page.reload();await h.ready();assert.equal(await root().locator('[data-article-id="b"]').count(),0,'Removed auto-link stays suppressed after reload and does not move to the next mention');
  await select('The Drench Syndicates');await page.keyboard.press('Shift+F10');await menu().getByRole('menuitem',{name:'Link selected text…'}).click();await page.getByRole('dialog').getByLabel('Find article',{exact:true}).fill('The Drench Syndicates');await page.getByRole('dialog').getByLabel('Article',{exact:true}).selectOption('c');await save();
  const manual=()=>root().locator('a[data-annotation-id]');assert.equal(await manual().innerText(),'The Drench Syndicates');assert.equal(await manual().getAttribute('data-article-id'),'c');
  await page.reload();await h.ready();assert.equal(await manual().innerText(),'The Drench Syndicates');
  // Existing manual links can be replaced directly, with a single stored annotation.
  await page.evaluate(()=>getSelection().removeAllRanges());await manual().focus();await page.keyboard.press('Shift+F10');await menu().getByRole('menuitem',{name:'Replace link…'}).click();await page.getByRole('dialog').getByLabel('Article',{exact:true}).selectOption('b');await save();assert.equal(await manual().getAttribute('data-article-id'),'b');
  assert.equal((await f.db.query("select count(*)::int n from lexicon_annotations where kind='link'")).rows[0].n,1);
  await page.keyboard.down('Shift');await manual().click({button:'right'});await page.keyboard.up('Shift');assert.equal(await menu().count(),0,'Shift-right-click retains the browser menu');await page.keyboard.press('Escape');
  await open(wiki.id,'a',true);await manual().click({button:'right'});await menu().getByRole('menuitem',{name:'Remove link…'}).click();await save();assert.equal(await manual().count(),0);assert.match(await root().innerText(),/The Drench Syndicates/);
  assert.deepEqual(await f.snapshot(),before);assert.deepEqual(h.errors,[]);console.log('Wiki link context: right-click auto/manual links, replace/cancel, persistent removal, full-phrase replacement, keyboard, edit/read modes, native menu bypass and unchanged source passed.');
 }catch(e){console.error((await page.locator('body').innerText()).slice(-4000));throw e;}finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
