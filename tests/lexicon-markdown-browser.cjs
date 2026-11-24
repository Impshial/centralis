const assert=require('node:assert/strict');
const {setup}=require('./lexicon-browser-harness.cjs');

const table='| Date | Event |\n\n| :--- | ---: |\n\n| 3325 AR | **Founded** at [Wavemourn Bay](https://example.com/bay). |\n\n| 3375 AR | A pipe: A\\|B. |';
const source='## Major Events\n\n'+table+'\n\n### Notes\n\nA **bold**, *italic*, ~~removed~~ and `literal **code**` passage.\n\n> A quotation.\n\n- First\n  - Nested\n- Second\n\n3. Third\n4. Fourth\n\n- [x] Recorded\n- [ ] Pending\n\n---\n\n```markdown\n'+table+'\n```\n\n\\*Literal stars\\* and \\# literal hash.';
const paragraph=text=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
const legacy={type:'doc',content:source.split('\n\n').map(paragraph)};

(async()=>{
 const h=await setup(),{f,store,page,open}=h;
 try {
  const wiki=await store.createWiki({id:f.uuid(),kind:'standalone',name:'Markdown'}),article=f.uuid(),section=f.uuid(),field=f.uuid();
  await store.save('lexicon_articles',{id:article,wiki_id:wiki.id,title:'Stormhaven',introduction:'Before paste.'});
  await store.save('lexicon_sections',{id:section,wiki_id:wiki.id,article_id:article,label:'History'});
  await store.save('lexicon_fields',{id:field,wiki_id:wiki.id,article_id:article,section_id:section,label:'Major Events',value:table});
  await open(wiki.id,article);
  assert.equal(await page.locator('.lexicon-article table tr').count(),3,'Raw field tables tolerate blank lines');
  assert.equal(await page.locator('.lexicon-article table td').first().innerText(),'3325 AR');
  await page.screenshot({path:'node_modules/.cache/lexicon/screenshots/markdown-field.png',fullPage:true});

  const rendered=await page.evaluate(async({source,legacy,table})=>{
   const {html}=await import('/lexicon-prose.js');
   function inspect(value) {
    const root=document.createElement('div');root.innerHTML=html(value);
    return {tables:root.querySelectorAll('table').length,rows:root.querySelectorAll('tr').length,heading:root.querySelector('h2')?.textContent,bold:root.querySelector('strong')?.textContent,italic:root.querySelector('em')?.textContent,strike:root.querySelector('del,s')?.textContent,quote:root.querySelector('blockquote')?.textContent.trim(),nested:!!root.querySelector('ul ul'),order:root.querySelector('ol')?.getAttribute('start'),hr:root.querySelectorAll('hr').length,code:root.querySelector('pre')?.textContent,cells:[...root.querySelectorAll('td')].map(n=>n.textContent),align:root.querySelector('td:last-child')?.getAttribute('align'),text:root.textContent,unsafe:!!root.querySelector('script,img,[onclick],a[href^="javascript:"]')};
   }
   const marked={type:'text',text:'Explicit link',marks:[{type:'link',attrs:{href:'lexicon-wiki.html?wiki=test&article=target',articleId:'target'}},{type:'bold'}]};
   const rich={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'| Name | Value |'}]},{type:'paragraph',content:[{type:'text',text:'| --- | --- |'}]},{type:'paragraph',content:[{type:'text',text:'| **Known** | '},marked,{type:'text',text:' |'}]},{type:'codeBlock',content:[{type:'text',text:table}]}]};
   const root=document.createElement('div');root.innerHTML=html(rich);
   return {raw:inspect(source),legacy:inspect(JSON.stringify(legacy)),rich:{table:root.querySelectorAll('table').length,link:root.querySelector('td a')?.dataset.articleId,bold:root.querySelector('td strong a')?.textContent,code:root.querySelector('pre')?.textContent},pipes:inspect('A | B\n\nC | D'),indented:inspect('    | A | B |\n    | --- | --- |\n    | C | D |'),unsafe:inspect('**Safe** <script>alert(1)</script> [bad](javascript:alert(1)) <img src=x onerror=alert(1)>')};
  },{source,legacy,table});
  for(const result of [rendered.raw,rendered.legacy]) {
   assert.equal(result.tables,1);assert.equal(result.rows,3);assert.equal(result.heading,'Major Events');assert.equal(result.bold,'Founded');assert.equal(result.italic,'italic');assert.equal(result.strike,'removed');assert.equal(result.quote,'A quotation.');assert.ok(result.nested);assert.equal(result.order,'3');assert.equal(result.hr,1);assert.equal(result.align,'right');assert.match(result.code,/\| :--- \| ---: \|/);assert.match(result.cells[3],/A\|B/);assert.match(result.text,/☑ Recorded/);assert.match(result.text,/☐ Pending/);assert.match(result.text,/\*Literal stars\*/);assert.equal(result.unsafe,false);
  }
  assert.equal(rendered.rich.table,1);assert.equal(rendered.rich.link,'target');assert.equal(rendered.rich.bold,'Explicit link');assert.equal(rendered.rich.code,table);
  assert.equal(rendered.pipes.tables,0);assert.equal(rendered.indented.tables,0);assert.equal(rendered.unsafe.unsafe,false);

  // Already-saved editor paragraphs render correctly without rewriting the field.
  await store.save('lexicon_fields',{id:field,wiki_id:wiki.id,article_id:article,section_id:section,label:'Major Events',value:JSON.stringify(legacy)});
  await open(wiki.id,article);
  assert.equal(await page.locator('.lexicon-article table tr').count(),3);
  assert.equal((await f.db.query('select value from lexicon_fields where id=$1',[field])).rows[0].value,JSON.stringify(legacy));

  await open(wiki.id,article,true);
  await page.getByRole('button',{name:'Edit Introduction',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Introduction',exact:true});
  await editor.press('Control+a');
  await editor.evaluate((el,text)=>{const data=new DataTransfer();data.setData('text/plain',text);data.setData('text/html','<div>'+text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('\n','</div><div>')+'</div>');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},source);
  assert.equal(await editor.locator('table tr').count(),3,'Paste converts Markdown to editable nodes');
  assert.equal(await editor.locator('h2').innerText(),'Major Events');
  assert.match(await editor.locator('pre').innerText(),/\| :--- \| ---: \|/);
  await editor.press('Control+z');assert.equal(await editor.innerText(),'Before paste.');
  await editor.press('Control+Shift+z');assert.equal(await editor.locator('table tr').count(),3);
  await page.getByRole('button',{name:'Save page',exact:true}).click();
  await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();
  const saved=JSON.parse((await f.db.query('select introduction from lexicon_articles where id=$1',[article])).rows[0].introduction);
  assert.equal(saved.attrs.lexiconFormat,'rich-text');
  await open(wiki.id,article,true);
  const introduction=page.locator('.lexicon-article > [data-prose]');
  assert.equal(await introduction.locator('table tr').count(),3);assert.equal(await introduction.locator('td').nth(1).getAttribute('align'),'right');
  assert.match(await introduction.innerText(),/\*Literal stars\*/);
  await page.getByRole('button',{name:'Edit Introduction',exact:true}).click();
  await editor.waitFor();
  assert.equal(await editor.locator('table tr').count(),3);
  await editor.locator('pre').click();
  await editor.evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','**raw code**');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  assert.match(await editor.locator('pre').innerText(),/\*\*raw code\*\*/);assert.equal(await editor.locator('pre strong').count(),0);
  await page.getByRole('button',{name:'Cancel edits',exact:true}).click();
  assert.equal((await f.db.query('select introduction from lexicon_articles where id=$1',[article])).rows[0].introduction,JSON.stringify(saved));
  const clipboard=await page.evaluate(async()=>{
   const {createEditor}=await import('/assets/vendor/lexicon-editor.js');
   const {html}=await import('/lexicon-prose.js');
   const element=document.createElement('div');document.body.append(element);
   const editor=createEditor(element,'<p>Original</p>');
   function paste(text,rich='') {
    editor.commands.selectAll();const data=new DataTransfer();data.setData('text/plain',text);if(rich)data.setData('text/html',rich);
    editor.view.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    const root=document.createElement('div');root.innerHTML=html(editor.getJSON());return root;
   }
   const raw=paste('## Plain paste\n\n**Strong** and \\*literal\\*.');
   const rich=paste('Linked text','<p><strong>Linked</strong> <a href="https://example.com">text</a></p>');
   const result={heading:raw.querySelector('h2')?.textContent,strong:raw.querySelector('strong')?.textContent,literal:raw.textContent,richBold:rich.querySelector('strong')?.textContent,richLink:rich.querySelector('a')?.getAttribute('href')};
   editor.destroy();element.remove();return result;
  });
  assert.equal(clipboard.heading,'Plain paste');assert.equal(clipboard.strong,'Strong');assert.match(clipboard.literal,/\*literal\*/);assert.equal(clipboard.richBold,'Linked');assert.equal(clipboard.richLink,'https://example.com');
  assert.deepEqual(h.errors,[]);
  console.log('Markdown checks passed: raw/legacy fields, spaced tables, general Markdown, rich marks, code/literal protection, safe HTML, paste, undo, save/reload, alignment and cancel.');
 } finally {await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
