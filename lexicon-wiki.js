import * as Prose from './lexicon-prose.js?v=wiki-followups-1';
(() => {
  const C = window.LexiconCore;
  const params = new URLSearchParams(location.search);
  const wikiId = params.get('wiki');
  let edit = params.get('edit') === '1';
  let query=params.get('q') || '',view=location.pathname.endsWith('/lexicon-search.html')?'search':params.get('view') || '',inlineEditors=new Map(),inlineVersion=0,outlineObserver,media=new Map(),repairItems=[],overviewPending=false;
  const current=()=>model?.articles.get(articleId || model.wiki.universe_id);
  const anchorId=id=>'section-'+encodeURIComponent(id);
  const proseItems=new Map();
  let articleId = params.get('article') || '';
  const content = document.querySelector('[data-wiki-content]');
  const nav = document.querySelector('[data-wiki-navigation]');
  const status = document.querySelector('[data-wiki-status]');
  const actions = document.querySelector('[data-wiki-actions]');
  const dialog = document.querySelector('[data-wiki-dialog]');
  let store, data, model, propertyForms = new Map(), busy = false, loadVersion = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const url = (id = '', editor = edit) => `lexicon-wiki.html?wiki=${encodeURIComponent(wikiId)}${id ? `&article=${encodeURIComponent(id)}` : ''}${editor ? '&edit=1' : ''}`;
  const searchUrl=q=>`lexicon-search.html?wiki=${encodeURIComponent(wikiId)}&q=${encodeURIComponent(q.trim())}`;
  if(view==='search'){edit=false;articleId='';history.replaceState(history.state,'',searchUrl(query));}
  history.scrollRestoration='manual';
  const button = (action, label, extra = '') => `<button type="button" class="secondary-action" data-action="${action}" ${extra}>${label}</button>`;
  const option = (value, label, selected) => `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`;
  const articleLink = (a, label = a.title) => `<a href="${url(a.isRoot ? '' : a.id)}"${a.id === articleId ? ' aria-current="page"' : ''}>${esc(label)}${a.hidden && edit ? ' (hidden)' : ''}</a>`;
  const visible = a => edit || !a.hidden;
  function renderNavigation() {
    nav.innerHTML = '<label for="wiki-search">Search this wiki</label><input id="wiki-search" type="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="wiki-suggestions" value="'+esc(query)+'"><div id="wiki-suggestions" role="listbox" hidden></div><details data-outline open><summary>On this page</summary><ul data-outline-list></ul></details><a href="'+url('',edit)+'&view=index">All articles</a>' + (edit&&model.wiki.kind==='standalone'?'<div class="lexicon-actions">'+button('new-article','Create article')+button('navigation','Edit navigation')+'</div>':'');
  }
  function breadcrumbs(a) {return '<nav class="lexicon-breadcrumbs" aria-label="Breadcrumb">'+model.breadcrumbs(a.id).map((p,i,all)=>i===all.length-1?'<span aria-current="page">'+esc(p.label)+'</span>':p.id!==null?'<a href="'+url(p.id)+'">'+esc(p.label)+'</a>':'<span>'+esc(p.label)+'</span>').join('<span aria-hidden="true"> › </span>')+'</nav>';}
  function prose(item,property,label) {
    const key=JSON.stringify([item.subjectType||item.table,item.id,property]);proseItems.set(key,{item,property,label});
    return '<div class="lexicon-prose" data-prose="'+esc(key)+'" data-label="'+esc(label)+'">'+Prose.html(item[property])+'</div>';
  }
  function subject(item,property) {return {type:item.subjectType || ({lexicon_articles:'standalone_article',lexicon_sections:'standalone_section',lexicon_fields:'standalone_field',lexicon_facts:'wiki_fact'}[item.table]),id:String(item.id),property};}
  function resultLink(r) {return url(r.article.id,false)+(r.section?'#'+anchorId(r.section):'');}
  function resultList(results) {return '<ul class="lexicon-results">'+results.map(r=>'<li><a href="'+resultLink(r)+'">'+esc(r.article.title)+'</a><small>'+esc(model.breadcrumbs(r.article.id).slice(0,-1).map(p=>p.label).join(' › '))+'</small><p>'+esc(r.snippet)+'</p></li>').join('')+'</ul>';}
  function indexPage() {
    if(view==='search')return '<section class="lexicon-article"><nav class="lexicon-breadcrumbs" aria-label="Breadcrumb"><a href="'+url('',false)+'">Wiki home</a><span aria-hidden="true"> › </span><span aria-current="page">Search results</span></nav><h1>Search results</h1><p>'+esc(query)+'</p>'+(query.trim()?(model.search(query).length?resultList(model.search(query)):'<p>No results.</p>'):'<p>Enter a search term.</p>')+'</section>';
    return '<section class="lexicon-article"><h1>All articles</h1>'+resultList([...model.articles.values()].filter(visible).sort((a,b)=>a.title.localeCompare(b.title)).map(a=>({article:a,snippet:model.plain(a.introduction).slice(0,150)})))+'</section>';
  }
  function fieldValue(field) {
    // Only an explicitly typed relationship can resolve a saved ID to an article.
    if (field.field_type === 'relationship') {
      let refs = field.value;
      if (typeof refs === 'string') { try { refs = JSON.parse(refs); } catch {} }
      const list = Array.isArray(refs) ? refs : [refs];
      return list.map(ref => {
        const id = typeof ref === 'object' && ref ? ref.element_id || ref.target_element_id || ref.id : ref;
        const a = model.articles.get(String(id));
        if (a) return a.hidden ? '' : articleLink(a);
        return esc(C.text(ref));
      }).filter(Boolean).join(', ');
    }
    if(field.kind==='relationship') {const link=model.links.find(l=>l.id===field.reference.subject_id&&l.subjectType===field.reference.subject_type);if(!link)return '';const g=model.connections(field.articleId).find(g=>g.relations.some(r=>r.id===link.id));return g?articleLink(g.article):'';}
    if(field.kind==='excerpt')return esc(field.resolvedValue || '');
    return prose(field,'value',field.label);
  }
  function fieldsMarkup(fields) {
    return `<dl>${fields.map(f => `<div class="lexicon-field" data-field-id="${esc(f.id)}"><dt>${esc(f.label)}</dt><dd>${fieldValue(f)}</dd></div>`).join('')}</dl>`;
  }
  function infobox(a) {
    const info = model.visibleFields(a, 'infobox');
    if (!a.image && !a.type && !info.length) return '';
    return `<aside class="lexicon-infobox" aria-label="Article details">${a.image ? `<img src="${esc(a.image)}" alt="${esc(a.title)}">` : ''}${a.type ? `<p><strong>Type</strong><br>${esc(a.type)}</p>` : ''}${fieldsMarkup(info)}</aside>`;
  }
  function reader(a) {
    if(!a)return '<section class="lexicon-article"><h1>'+esc(model.wiki.name)+'</h1>'+ (edit?button('new-article',model.articles.size?'Create article':'Create first article'):'<p>No article selected.</p>')+'</section>';
    if(a.hidden&&!edit)return '<section class="lexicon-article"><p>This article is hidden in this wiki.</p></section>';
    resolveFacts(a);const body=model.visibleFields(a,'body'),info=infobox(a);
    return '<div class="lexicon-reader'+(info?'':' is-single')+'"><article class="lexicon-article">'+breadcrumbs(a)+'<h1>'+esc(a.title)+'</h1>'+prose(a,'introduction','Introduction')+
      (a.body||edit&&a.subjectType==='article'&&!a.isRoot?'<section><h2 id="article-body">Body</h2>'+prose(a,'body','Body')+'</section>':'')+
      (body.some(f=>!f.sectionId)?'<section><h2 id="article-details">Details</h2>'+fieldsMarkup(body.filter(f=>!f.sectionId))+'</section>':'')+
      a.sections.filter(s=>edit||!s.hidden&&(C.hasValue(s.body)||body.some(f=>f.sectionId===s.id))).map(s=>'<section data-section-id="'+esc(s.id)+'"><h2 id="'+anchorId(s.id)+'">'+esc(s.label)+'</h2>'+(s.table==='lexicon_sections'?prose(s,'body',s.label):'')+fieldsMarkup(body.filter(f=>f.sectionId===s.id))+'</section>').join('')+
      '</article>'+info+'</div>'+(edit?'<div class="lexicon-inline-toolbar" role="toolbar" aria-label="Article editing">'+button('save-prose','Save page')+button('cancel-prose','Cancel edits')+button('bold','Bold')+button('italic','Italic')+button('heading','Heading')+button('manual-link','Link selected text…')+button('unlink','Remove link…')+button('image','Insert image here…')+button('excerpt','Pin excerpt to infobox')+'</div><div data-repairs></div><details class="lexicon-settings"><summary>Choose details</summary>'+button('new-fact','Add wiki-only fact')+button('pin-relation','Pin relationship')+button('alias','Add alias')+editor(a)+'</details>':'');
  }
  function resolveFacts(a) {
    for(const f of a?.fields || []) {
      if(f.kind==='excerpt') {
        const ref=f.reference,item=[a,...a.sections,...a.fields].find(i=>subject(i,ref.property).type===ref.subject_type&&String(i.id)===ref.subject_id);
        const el=document.createElement('div');el.innerHTML=Prose.html(item?.[ref.property]);const text=Prose.plain(el),pos=Prose.locate(text,ref.anchor);
        f.value=f.resolvedValue=pos?text.slice(pos.start,pos.end):'';
        if(!pos)repairItems.push({...f,excerpt:true});
      }
      if(f.kind==='relationship')f.value=model.connections(a.id).some(g=>g.relations.some(l=>l.id===f.reference.subject_id&&l.subjectType===f.reference.subject_type))?'relationship':'';
    }
  }
  function finishReader() {
    const a=current(),sectionLinks=new Map();
    if(a)for(const root of content.querySelectorAll('[data-prose]')) {
      const p=proseItems.get(root.dataset.prose);
      // Repeat a destination once in each section (and each infobox), not every mention.
      const scope=root.closest('section,.lexicon-infobox')||root;
      if(!sectionLinks.has(scope))sectionLinks.set(scope,new Set());
      const used=sectionLinks.get(scope);
      repairItems.push(...Prose.decorate(root,subject(p.item,p.property),model,a,id=>url(id,false),used,media));
      if(!edit){root.tabIndex=0;root.setAttribute('aria-label',p.label);}
      if(edit && !p.item.kind && !['number','checkbox','relationship'].includes(p.item.field_type)) {
        const b=document.createElement('button');b.className='secondary-action lexicon-edit-text';b.type='button';b.textContent='Edit '+p.label;b.dataset.editProse=root.dataset.prose;root.after(b);
      }
    }
    // Prose headings receive IDs tied to their stable field identity and position.
    for(const root of content.querySelectorAll('[data-prose]')) {
      let index=0;for(const heading of root.querySelectorAll('h1,h2,h3,h4,h5,h6'))heading.id='prose-'+encodeURIComponent(root.dataset.prose)+'-'+index++;
    }
    outlineObserver?.disconnect();const headings=[...content.querySelectorAll('.lexicon-article section > h2,.lexicon-article [data-prose] h1,.lexicon-article [data-prose] h2,.lexicon-article [data-prose] h3,.lexicon-article [data-prose] h4')];
    const list=nav.querySelector('[data-outline-list]');if(list)list.innerHTML=headings.map(h=>'<li><a href="'+url(articleId)+'#'+encodeURIComponent(h.id)+'">'+esc(h.textContent)+'</a></li>').join('');
    const outline=nav.querySelector('[data-outline]');if(outline){outline.open=headings.length>1;outline.hidden=!headings.length;}
    outlineObserver=new IntersectionObserver(entries=>{const active=entries.find(e=>e.isIntersecting)?.target;if(!active)return;for(const link of list?.querySelectorAll('a')||[])link.setAttribute('aria-current',decodeURIComponent(new URL(link.href).hash.slice(1))===active.id?'location':'false');},{rootMargin:'-10% 0px -65% 0px'});headings.forEach(h=>outlineObserver.observe(h));
    const repairs=content.querySelector('[data-repairs]');if(repairs)repairs.innerHTML=repairItems.length?'<p>Some annotations need a new passage. Select the passage, then choose Repair.</p>'+repairItems.map(n=>'<div>'+esc(n.kind==='image'?'Image':n.kind==='excerpt'?'Pinned excerpt':'Link')+' '+button('repair','Repair',`data-id="${esc(n.id)}"`)+button('remove-annotation','Remove',`data-id="${esc(n.id)}"`)+'</div>').join(''):'';
  }
  async function resolveMedia(ownerStore,version) {
    if(!model.media.length)return;
    try {
      const result=await ownerStore.mediaAction(wikiId,'resolve',{ids:model.media.map(m=>m.id)});
      if(version!==loadVersion||ownerStore!==store)return;
      media=new Map((result.media||[]).map(m=>[m.id,m]));
      // Resolve illustrations in place: never replace a reader selection, menu,
      // insertion marker or dialog anchor when a delayed signing response arrives.
      const a=current();if(a)for(const root of content.querySelectorAll('[data-prose]')){
        if(inlineEditors.has(root.dataset.prose))continue;
        const p=proseItems.get(root.dataset.prose);if(p)Prose.decorateImages(root,subject(p.item,p.property),model,a,media);
      }
    }catch(e){if(version===loadVersion)status.textContent='Illustrations unavailable: '+e.message;}
  }
  function captureProseDrafts() {return new Map([...inlineEditors].filter(([,v])=>JSON.stringify(v.editor.getJSON())!==v.original).map(([key,v])=>[key,v.editor.getJSON()]));}
  async function startEditors(drafts) {if(drafts)for(const [key,doc]of drafts)await startEditor(key,doc);}
  async function startEditor(key,doc) {
    if(inlineEditors.has(key))return inlineEditors.get(key).editor.commands.focus();
    const root=[...content.querySelectorAll('[data-prose]')].find(el=>el.dataset.prose===key),p=proseItems.get(key),version=inlineVersion;if(!root||!p)return;
    const {createEditor}=await import('./assets/vendor/lexicon-editor.js');if(version!==inlineVersion)return;
    root.replaceChildren();const editor=createEditor(root,Prose.html(p.item[p.property]));const original=JSON.stringify(editor.getJSON());
    if(doc)editor.commands.setContent(doc);inlineEditors.set(key,{editor,original,...p});root.nextElementSibling?.matches('[data-edit-prose]')&&root.nextElementSibling.remove();editor.commands.focus();
  }
  async function saveProse(stay=false) {
    if(busy)return;busy=true;const scroll=scrollY;status.textContent='Saving…';
    try {
      for(const v of inlineEditors.values()) {
        const doc=JSON.stringify(v.editor.getJSON());if(doc===v.original)continue;
        if(v.item.subjectType)await store.override(wikiId,v.item,v.property,doc);else await store.patch(v.item.table,wikiId,v.item.id,v.property,doc);
        v.original=doc;
      }
      if(!stay){edit=false;history.replaceState({lexiconScroll:scroll},'',url(articleId,false));}
      await load();window.scrollTo(0,scroll);status.textContent='Saved.';
    }catch(e){status.textContent=e.message;throw e;}finally{busy=false;}
  }
  let selectionPoint=null,contextMenu,selectionButton;
  function captureSelection(range) {
    const selection=getSelection(),text=range?range.toString():selection?.toString()||'';range=range|| (selection?.rangeCount?selection.getRangeAt(0):null);if(!range)return null;
    const start=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement,root=start.closest?.('[data-prose]');
    if(!root||!root.contains(range.endContainer))return null;
    const p=proseItems.get(root.dataset.prose);if(!p)return null;
    return {root,range:range.cloneRange(),text,anchor:Prose.anchor(root,range),...subject(p.item,p.property)};
  }
  function restoreSelection(point=selectionPoint) {if(point?.root.isConnected){const s=getSelection();s.removeAllRanges();s.addRange(point.range);}}
  function closeContext(){contextMenu?.remove();contextMenu=null;}
  async function copySelection(point,text) {
    if(!text)return;
    point.root.focus({preventScroll:true});restoreSelection(point);
    try {
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if(point.root.isConnected)status.textContent='Copied.';
    }catch {
      if(!point.root.isConnected)return;
      point.root.focus({preventScroll:true});restoreSelection(point);
      status.textContent='Could not copy. Use your browser’s Copy command.';
    }
  }
  function caretPoint(event) {
    let r;
    if(event.clientX||event.clientY){r=document.caretRangeFromPoint?.(event.clientX,event.clientY);if(!r&&document.caretPositionFromPoint){const p=document.caretPositionFromPoint(event.clientX,event.clientY);if(p){r=document.createRange();r.setStart(p.offsetNode,p.offset);r.collapse(true);}}}
    return r?captureSelection(r):null;
  }
  function showContext(selected,insertion,x,y) {
    if(overviewPending||!current()||current().hidden)return;
    closeContext();const point=selected||insertion;if(!point){status.textContent='Select text or place the caret in the article first.';return;}
    const copyText=selected?.text||'';
    const node=point.range.startContainer.nodeType===1?point.range.startContainer:point.range.startContainer.parentElement;
    const linked=node.closest('a')||point.root.querySelector('a')&&[...point.root.querySelectorAll('a')].find(a=>point.range.intersectsNode(a));
    contextMenu=document.createElement('div');contextMenu.className='lexicon-context-menu';contextMenu.setAttribute('role','menu');contextMenu.setAttribute('aria-label','Text actions');
    contextMenu.innerHTML=button('context-copy','Copy',copyText?'':'disabled')+button('context-link','Link selected text…',selected?.anchor.quote?'':'disabled')+button('context-unlink','Remove link…',linked?'':'disabled')+button('context-image','Insert image here…')+button('context-excerpt','Pin excerpt to infobox',selected?.anchor.quote?'':'disabled')+'<small>Shift + right-click: browser menu</small>';
    contextMenu.querySelectorAll('button').forEach(b=>b.setAttribute('role','menuitem'));
    const rect=point.range.getBoundingClientRect();document.body.append(contextMenu);const bounds=contextMenu.getBoundingClientRect();contextMenu.style.left=Math.max(8,Math.min(x??rect.left,innerWidth-bounds.width-8))+'px';contextMenu.style.top=Math.max(8,Math.min(y??rect.bottom,innerHeight-bounds.height-8))+'px';
    contextMenu.addEventListener('click',e=>{const control=e.target.closest('[data-action]'),action=control?.dataset.action;if(!action||control.disabled)return;e.stopPropagation();selectionPoint=action==='context-image'?insertion||point:point;if(action==='context-unlink'&&linked){const r=document.createRange();r.selectNodeContents(linked);selectionPoint=captureSelection(r);}closeContext();if(action==='context-copy'){copySelection(point,copyText);return;}inlineAction(action.replace('context-',''));});
    contextMenu.addEventListener('keydown',e=>{const options=[...contextMenu.querySelectorAll('button:not(:disabled)')],i=options.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowUp'?-1:1)+options.length)%options.length]?.focus();}if(e.key==='Tab')closeContext();});
    contextMenu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest('.lexicon-inline-toolbar,[data-action="repair"],[data-action="text-actions"],.lexicon-selection-action'))selectionPoint=captureSelection()||selectionPoint;
    if(!event.target.closest('.lexicon-context-menu,[data-action="text-actions"],.lexicon-selection-action'))closeContext();
  });
  document.addEventListener('selectionchange',()=>{
    if(edit||overviewPending||dialog.open||contextMenu)return;
    const point=captureSelection();selectionButton?.remove();selectionButton=null;
    if(!point?.anchor.quote)return;
    selectionPoint=point;selectionButton=document.createElement('button');selectionButton.type='button';selectionButton.className='secondary-action lexicon-selection-action';selectionButton.textContent='Text actions';selectionButton.setAttribute('aria-haspopup','menu');
    const rect=point.range.getBoundingClientRect();selectionButton.style.left=Math.max(8,Math.min(rect.left,innerWidth-140))+'px';selectionButton.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-50))+'px';
    selectionButton.addEventListener('pointerdown',e=>e.preventDefault());selectionButton.addEventListener('click',()=>{showContext(point,point);selectionButton?.remove();});document.body.append(selectionButton);
  });
  content.addEventListener('pointerup',event=>{if(!dialog.open&&!overviewPending)selectionPoint=captureSelection()||caretPoint(event)||selectionPoint;});
  content.addEventListener('contextmenu',event=>{
    if(event.shiftKey||overviewPending){closeContext();return;}
    const root=event.target.closest('[data-prose]');if(!root)return;
    const selected=captureSelection(),insertion=caretPoint(event)||selected;
    // Native link actions remain available on an ordinary right-click of a link.
    if(event.target.closest('a')&&!selected?.anchor.quote)return;
    if(!insertion||insertion.root!==root)return;
    event.preventDefault();selectionButton?.remove();showContext(selected?.root===root?selected:null,insertion,event.clientX||undefined,event.clientY||undefined);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){closeContext();selectionButton?.remove();restoreSelection();selectionPoint?.root.focus({preventScroll:true});}
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
      let point=captureSelection()||selectionPoint;const root=event.target.closest('[data-prose]');
      if(root&&point?.root!==root){const r=document.createRange();r.selectNodeContents(root);r.collapse(true);point=captureSelection(r);}
      if(point&&!dialog.open){event.preventDefault();showContext(point,point);}
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&captureSelection()&&!dialog.open){event.preventDefault();selectionPoint=captureSelection();inlineAction('manual-link');}
  });
  dialog.addEventListener('close',()=>{document.querySelector('[data-point-marker]')?.remove();restoreSelection();});
  function annotationRow(point,kind,id=crypto.randomUUID()) {return {id,wiki_id:wikiId,article_id:current().id,subject_type:point.type,subject_id:point.id,property:point.property,kind,anchor:point.anchor};}
  async function inlineAction(action) {
    if(action==='link')action='manual-link';
    const point=selectionPoint||captureSelection();
    if(!point){status.textContent='Select text or place the caret in the article first.';return;}
    const a=current();if(!a)return;
    if(action==='manual-link'||action==='excerpt') {
      if(!point.anchor.quote){status.textContent='Select the text first.';return;}
      const existing=action==='manual-link'?model.annotations.find(n=>n.article_id===a.id&&n.kind==='link'&&n.subject_type===point.type&&n.subject_id===point.id&&n.property===point.property&&JSON.stringify(Prose.locate(Prose.plain(point.root),n.anchor))===JSON.stringify({start:point.anchor.start,end:point.anchor.end})):null;
      const id=existing?.id || crypto.randomUUID();
      if(action==='excerpt')openForm('Pin excerpt to infobox',inputField('label','Label'),v=>store.save('lexicon_facts',{id,wiki_id:wikiId,article_id:a.id,label:v.label,kind:'excerpt',reference:{subject_type:point.type,subject_id:point.id,property:point.property,anchor:point.anchor},placement:'infobox',sort_order:a.fields.length}));
      else {
        const options=[...model.articles.values()].filter(t=>!t.hidden&&t.id!==a.id).map(t=>[t.id,t.title+' — '+(t.type||model.breadcrumbs(t.id).slice(0,-1).map(p=>p.label).join(' › '))+' ['+t.id.slice(-6)+']']);
        openForm('Link selected text', '<label class="form-field"><span>Find article</span><input name="find" type="search"></label>'+selectField('target_id','Article',options),v=>{if(!v.target_id)throw new Error('Choose an article.');return store.save('lexicon_annotations',{...annotationRow(point,'link',id),target_id:v.target_id});});
        dialog.querySelector('[name="find"]').addEventListener('input',e=>{const select=dialog.querySelector('[name="target_id"]');select.innerHTML=options.filter(([,label])=>label.toLowerCase().includes(e.target.value.toLowerCase())).map(([id,label])=>option(id,label,'')).join('');});
      }
    }
    if(action==='unlink') {
      const node=point.range.startContainer.nodeType===1?point.range.startContainer:point.range.startContainer.parentElement,link=node.closest('a')||[...point.root.querySelectorAll('a')].find(a=>point.range.intersectsNode(a));
      if(!link){status.textContent='Place the caret in a link first.';return;}
      const r=document.createRange();r.selectNodeContents(link);const selected=captureSelection(r);
      const suppression={...annotationRow(selected,link.dataset.autoLink?'auto_suppress':'unlink'),target_id:link.dataset.autoLink?link.dataset.articleId:null};
      openForm('Remove link?', '<p>Keep the text and formatting.</p>',async()=>{
        if(link.dataset.annotationId)await store.remove('lexicon_annotations',wikiId,link.dataset.annotationId);
        await store.save('lexicon_annotations',suppression);
      });
    }
    if(action==='image') {
      const id=crypto.randomUUID(),mediaId=crypto.randomUUID(),row=annotationRow({...point,anchor:{...point.anchor,quote:'',end:point.anchor.start,suffix:Prose.plain(point.root).slice(point.anchor.start,point.anchor.start+48)}},'image',id);
      const marker=document.createElement('span');marker.dataset.pointMarker='';marker.textContent='│';marker.className='lexicon-insertion-point';const markRange=point.range.cloneRange();markRange.collapse(true);markRange.insertNode(marker);
      openForm('Insert image',selectField('sourceImageId','Existing image',[['','Choose an image']])+'<div data-image-library></div>'+button('more-images','Load more images')+'<label class="form-field"><span>Upload image</span><input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"></label><label class="form-field"><span>Alt text</span><input name="alt"></label><label class="form-field"><span>Caption</span><input name="caption"></label>',async v=>{
        const file=dialog.querySelector('[name="file"]').files[0];if(!file&&!v.sourceImageId)throw new Error('Choose an existing image or upload one.');
        const result=file?await store.uploadMedia(wikiId,mediaId,file):await store.mediaAction(wikiId,'register',{id:mediaId,sourceImageId:v.sourceImageId});
        media.set(result.media.id,result.media);await store.save('lexicon_annotations',{...row,media_id:result.media.id,alt:v.alt,caption:v.caption});
      });
      let next=0;const more=dialog.querySelector('[data-action="more-images"]');
      const library=async()=>{more.disabled=true;try{const result=await store.mediaAction(wikiId,'library',{offset:next});if(!dialog.open)return;for(const img of result.images||[]){dialog.querySelector('[name="sourceImageId"]').insertAdjacentHTML('beforeend',option(img.id,img.object_id+' — '+img.id,''));const b=document.createElement('button');b.type='button';b.innerHTML='<img alt="Existing image" src="'+esc(img.image_url)+'">';b.onclick=()=>dialog.querySelector('[name="sourceImageId"]').value=img.id;dialog.querySelector('[data-image-library]').append(b);}next=result.nextOffset;more.hidden=next===null;}catch(e){dialog.querySelector('[role="status"]').textContent=e.message;}finally{more.disabled=false;}};
      more.addEventListener('click',library);library();
    }
  }
  nav.addEventListener('input',event=>{
    if(event.target.id!=='wiki-search')return;const input=event.target,list=nav.querySelector('#wiki-suggestions'),results=model.search(input.value).slice(0,7);
    list.innerHTML=results.map((r,i)=>'<a role="option" id="wiki-suggestion-'+i+'" href="'+resultLink(r)+'" tabindex="-1">'+esc(r.article.title)+'<small>'+esc(r.snippet)+'</small></a>').join('')||(input.value.trim()?'<p>No results.</p>':'');list.hidden=!input.value.trim();input.setAttribute('aria-expanded',String(!list.hidden));input.removeAttribute('aria-activedescendant');
  });
  nav.addEventListener('keydown',event=>{
    if(event.target.id!=='wiki-search')return;const input=event.target,list=nav.querySelector('#wiki-suggestions'),options=[...list.querySelectorAll('[role="option"]')];
    let index=options.findIndex(o=>o.id===input.getAttribute('aria-activedescendant'));
    if(event.key==='Escape'){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();index=Math.max(0,Math.min(options.length-1,index+(event.key==='ArrowDown'?1:-1)));options.forEach((o,i)=>o.setAttribute('aria-selected',String(i===index)));if(options[index])input.setAttribute('aria-activedescendant',options[index].id);}
    if(event.key==='Enter'){event.preventDefault();const href=options[index]?.href||searchUrl(input.value);history.replaceState({...history.state,lexiconScroll:scrollY},'',location.href);history.pushState({lexiconScroll:0},'',href);showRoute(localRoute(href));}
  });
  function property(item, name, label, options = {}) {
    const index = String(propertyForms.size); propertyForms.set(index, { item, name, options });
    const value = item[name];
    const overridden = !!item.overridden?.[name];
    const id = `wiki-property-${index}`;
    let input;
    if (options.choices) input = `<select id="${id}" name="value">${options.choices.map(([v,l]) => option(v,l,value)).join('')}</select>`;
    else if (options.boolean) input = `<input id="${id}" name="value" type="checkbox"${value ? ' checked' : ''}>`;
    else if (options.multiline) input = `<textarea id="${id}" name="value" rows="3">${esc(C.text(value))}</textarea>`;
    else input = `<input id="${id}" name="value" type="${options.number ? 'number' : 'text'}" value="${esc(C.text(value))}"${options.number ? ' step="any"' : ''}>`;
    return `<form class="lexicon-property" data-property="${index}" aria-label="${esc(label)}">
      <label for="${id}">${esc(label)}${item.subjectType ? `<small>${overridden ? 'Customized' : 'Inherited'}</small>` : ''}</label>
      ${input}<div class="lexicon-property-actions"><button type="submit" class="secondary-action" disabled>Save</button>
      ${item.subjectType ? `<button type="button" class="secondary-action" data-reset${overridden ? '' : ' disabled'}>Reset to source</button>` : ''}</div>
    </form>`;
  }
  function fieldEditor(f) {
    let valueOptions = { multiline: ['textarea','rich_text'].includes(f.field_type), number: f.field_type === 'number' };
    if (f.field_type === 'checkbox') valueOptions = { choices: [['','Empty'],['true','True'],['false','False']], typedBoolean: true };
    return `<details class="lexicon-editor-item" data-edit-field="${esc(f.id)}"><summary>${esc(f.label || 'Untitled field')}${f.hidden ? ' (hidden)' : ''}</summary>
      ${!C.hasValue(f.value)&&f.subjectType?'<p>No source value. Use Edit source to enter one.</p>':''}${property(f,'label','Field label')}${!f.kind||f.kind==='fact'?property(f,'value','Field value',valueOptions):''}
      ${property(f,'placement','Placement',{choices:[['body','Body'],['infobox','Infobox']]})}
      ${property(f,'sort_order','Field order',{number:true})}${property(f,'hidden','Hide field',{boolean:true})}
    </details>`;
  }
  function connectionEditor(a) {
    return `<section class="lexicon-editor-section"><h3>Connections</h3>${button('new-link','Add wiki-only connection')}
      ${model.connections(a.id,{editor:true}).map(g => `<section><h4>${esc(g.article.title)}</h4>${g.relations.map(r => {
        const pageSubject = { ...r, articleId:a.id, page_hidden:r.pageHidden, overridden:{page_hidden:model.overrides.has(C.key(r.subjectType,a.id,r.id,'page_hidden'))} };
        return `<details class="lexicon-editor-item" data-edit-link="${esc(r.id)}"><summary>${esc(r.relativeDirection)}: ${esc(r.label || 'Connection')}${r.hidden || r.pageHidden ? ' (hidden)' : ''}</summary>
          ${property(r,'label','Connection label')}${property(pageSubject,'page_hidden','Hide on this page',{boolean:true})}${property(r,'hidden','Hide connection in this wiki',{boolean:true})}
          ${r.subjectType === 'wiki_link' ? button('delete-link','Delete wiki-only connection',`data-id="${esc(r.id)}"`) : ''}</details>`;
      }).join('')}</section>`).join('')}</section>`;
  }
  function editor(a) {
    if (!a) return `<section class="lexicon-article"><h2>Wiki Editor</h2>${property({id:wikiId,name:model.wiki.name,table:'lexicon_wikis'},'name','Wiki name')}${button('new-article',model.articles.size ? 'Create article' : 'Create first article')}</section>`;
    return `<section class="lexicon-editor">
      <section class="lexicon-editor-section">${property(a,'title','Article title')}${property(a,'introduction','Introduction',{multiline:true})}${a.body!==undefined?property(a,'body','Body',{multiline:true}):''}${property(a,'hidden','Hide article',{boolean:true})}</section>
      ${a.sections.map(s => `<section class="lexicon-editor-section" data-edit-section="${esc(s.id)}"><h3>${esc(s.label)}${s.hidden ? ' (hidden)' : ''}</h3>
        ${property(s,'label','Section label')}${property(s,'sort_order','Section order',{number:true})}${property(s,'hidden','Hide section',{boolean:true})}
        ${a.fields.filter(f => f.sectionId === s.id).map(fieldEditor).join('')}
        ${model.wiki.kind === 'standalone' ? button('new-field','Add field',`data-section="${esc(s.id)}"`) : ''}</section>`).join('')}
      ${a.fields.filter(f => !f.sectionId).length ? `<section class="lexicon-editor-section"><h3>Custom fields</h3>${a.fields.filter(f => !f.sectionId).map(fieldEditor).join('')}</section>` : ''}
      ${model.wiki.kind === 'standalone' ? button('new-section','Add section') : ''}${connectionEditor(a)}</section>`;
  }
  function render({ navigation = true } = {}) {
    closeContext();selectionButton?.remove();selectionButton=null;
    repairItems=[];selectionPoint=null;++inlineVersion;for(const {editor} of inlineEditors.values())editor.destroy();inlineEditors.clear();proseItems.clear();
    propertyForms = new Map();
    const a = model.articles.get(articleId || model.wiki.universe_id);
    document.querySelector('#wiki-title').textContent = model.wiki.name;
    document.title = `${edit ? 'Wiki Editor' : model.wiki.name} | Lexicon`;
    const isArticle=!['search','index'].includes(view);
    actions.innerHTML = `${isArticle?`<a class="secondary-action" href="${url(articleId, !edit)}">${edit ? 'View wiki page' : 'Customize wiki page'}</a>`:`<a class="secondary-action" href="${url('',false)}">Wiki home</a>`}${button('refresh',model.wiki.kind === 'universe' ? 'Reload source' : 'Reload wiki')}`;
    if(overviewPending)actions.querySelector('a[href*="edit=1"]')?.remove();
    if(isArticle&&a&&!a.hidden&&!overviewPending)actions.innerHTML+=button('text-actions','Text actions', 'aria-haspopup="menu" title="Select text or place the caret, then open Text actions. Shift + right-click opens the browser menu."');
    if (isArticle && model.wiki.kind === 'universe') {
      if (a) actions.innerHTML += `<a class="secondary-action" href="chronicle-editor.html#universe/${encodeURIComponent(model.wiki.universe_id)}${a.isRoot?'':'/element/'+encodeURIComponent(a.id)}">Edit source</a>`;
      actions.innerHTML += `<a class="secondary-action" href="universe-canvas.html?universe_id=${encodeURIComponent(model.wiki.universe_id)}">Edit graph and groups</a>`;
    }
    renderNavigation();
    for (const link of nav.querySelectorAll('a')) {
      const targetId = new URL(link.href).searchParams.get('article') || model.wiki.universe_id || '';
      if (targetId === (articleId || model.wiki.universe_id || '')) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
    if (articleId && !a) content.innerHTML = '<section class="lexicon-article"><p>Article not found or no longer accessible.</p></section>';
    else content.innerHTML = (view==='index'||view==='search') ? indexPage() : reader(a);
    content.setAttribute('aria-busy',String(overviewPending));
    document.title=`${view==='search'?'Search results':a?.title||model.wiki.name} | ${model.wiki.name} | Lexicon`;
    finishReader();
  }
  async function load({preserveDraftsExcept} = {}) {
    const version = ++loadVersion, ownerStore = store;
    const loaded = await ownerStore.load(wikiId,{includeImages:false,onOverview:!model&&!edit&&view!=='search'?partial=>{
      if(version!==loadVersion||ownerStore!==store)return;
      overviewPending=true;model=C.build(partial);render();
      status.textContent='Fetching article details…';
    }:undefined});
    if (version !== loadVersion || ownerStore !== store) return;
    data = loaded;
    const drafts = preserveDraftsExcept ? collectDrafts(preserveDraftsExcept) : null;
    const proseDrafts=preserveDraftsExcept?captureProseDrafts():null;
    const scroll=scrollY,restoreOverview=overviewPending;overviewPending=false;
    model = C.build(data); render();if(restoreOverview)window.scrollTo(0,scroll);
    if(location.hash)requestAnimationFrame(()=>document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());
    if (drafts) restoreDrafts(drafts);
    if(proseDrafts) await startEditors(proseDrafts);
    status.textContent = '';
    if (data.wiki.kind === 'universe') loadImages(ownerStore,loaded,version);
    resolveMedia(ownerStore,version);
  }
  async function loadImages(ownerStore,loaded,version) {
    try {
      const images = await ownerStore.images(wikiId,[loaded.wiki.universe_id,...loaded.elements.map(e=>e.id)]);
      if (version !== loadVersion || ownerStore !== store) return;
      for (const a of model.articles.values()) a.image = images.find(i=>String(i.object_id)===a.id)?.image_url || '';
      // An image response must not replace editor drafts, navigation or article prose.
      const a = model.articles.get(articleId || model.wiki.universe_id);
      const readerEl = content.querySelector('.lexicon-reader');
      if (edit || !a || a.hidden || !readerEl) return;
      readerEl.querySelector('.lexicon-infobox')?.remove();
      const info = infobox(a);
      readerEl.classList.toggle('is-single',!info);
      if (info) readerEl.insertAdjacentHTML('beforeend',info);
      const used=new Set();
      for(const root of readerEl.querySelectorAll('.lexicon-infobox [data-prose]')) {
        const p=proseItems.get(root.dataset.prose);Prose.decorate(root,subject(p.item,p.property),model,a,id=>url(id,false),used,media);
      }
    } catch(error) {
      if (version === loadVersion && ownerStore === store && !busy) status.textContent = `Images unavailable: ${error.message}`;
    }
  }
  function localRoute(href) {
    const target = new URL(href,location.href);
    if (target.origin !== location.origin || !/\/lexicon-(wiki|search)\.html$/.test(target.pathname) || target.searchParams.get('wiki') !== wikiId) return null;
    const searching=target.pathname.endsWith('/lexicon-search.html')||target.searchParams.get('view')==='search';
    return {href:target.href,article:searching?'':target.searchParams.get('article') || '',edit:!searching&&target.searchParams.get('edit') === '1',query:searching?target.searchParams.get('q')||'':'',view:searching?'search':target.searchParams.get('view')||'',hash:target.hash};
  }
  function showRoute(target, scroll = 0) {
    const changedMode = edit !== target.edit;
    articleId = target.article; edit = target.edit;query=target.query||'';view=target.view||'';
    render({navigation:changedMode});
    status.textContent = '';
    window.scrollTo(0,scroll);
    if(target.hash&&!scroll)document.getElementById(decodeURIComponent(target.hash.slice(1)))?.scrollIntoView();
    const heading = content.querySelector('h1') || content;
    heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true});
  }
  document.querySelector('main').addEventListener('click',event=>{
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const target = localRoute(link.href);
    if (!target || !model || busy || dialog.open) return;
    if(target.hash&&target.article===articleId&&target.edit===edit&&!target.view&&!target.query){event.preventDefault();history.pushState({lexiconScroll:window.scrollY},'',target.href);document.getElementById(decodeURIComponent(target.hash.slice(1)))?.scrollIntoView();return;}
    event.preventDefault();
    history.replaceState({...history.state,lexiconScroll:window.scrollY},'',location.href);
    if (target.href !== location.href) history.pushState({lexiconScroll:0},'',target.href);
    showRoute(target,target.article===articleId&&target.edit!==edit?window.scrollY:0);
  });
  window.addEventListener('popstate',event=>{
    const target = localRoute(location.href);
    if (!target) { location.reload(); return; }
    if (model) showRoute(target,Number(event.state?.lexiconScroll) || 0);
  });
  window.addEventListener('centralis:current-user-changed',event=>{
    if (!store || event.detail?.user?.id === store.user.id) return;
    // No wiki data survives an account change, including pending image/read responses.
    ++loadVersion; store = null; model = null; data = null;
    closeContext();selectionButton?.remove();selectionPoint=null;
    ++inlineVersion;for(const {editor}of inlineEditors.values())editor.destroy();inlineEditors.clear();media.clear();propertyForms.clear(); content.replaceChildren(); nav.replaceChildren(); actions.replaceChildren(); dialog.close();
    document.querySelector('#wiki-title').textContent = 'Lexicon';
    status.textContent = 'Account changed. Reopen the wiki.';
  });
  window.addEventListener('pageshow',event=>{
    // A restored browser document is an actual wiki revisit; fetch current source data.
    if (event.persisted) location.reload();
  });
  function parseInput(input, options) {
    if (options.boolean) return input.checked;
    if (options.typedBoolean) return input.value === '' ? '' : input.value === 'true';
    if (options.number) return input.value === '' ? '' : Number(input.value);
    return input.value;
  }
  function restoreOpenDetails(openIds) {
    for (const el of content.querySelectorAll('details[data-edit-field],details[data-edit-link]')) {
      if (openIds.includes(el.dataset.editField || el.dataset.editLink)) el.open = true;
    }
  }
  const propertyKey = ({item,name}) => JSON.stringify([item.subjectType || item.table,item.articleId || '',item.id,name]);
  function collectDrafts(except) {
    const drafts = new Map();
    for (const form of content.querySelectorAll('[data-property]')) {
      if (form === except) continue;
      const descriptor = propertyForms.get(form.dataset.property);
      const value = parseInput(form.elements.value,descriptor.options);
      if (JSON.stringify(value) !== JSON.stringify(descriptor.item[descriptor.name])) {
        drafts.set(propertyKey(descriptor),{value:form.elements.value.value,checked:form.elements.value.checked});
      }
    }
    return drafts;
  }
  function restoreDrafts(drafts) {
    for (const form of content.querySelectorAll('[data-property]')) {
      const draft = drafts.get(propertyKey(propertyForms.get(form.dataset.property)));
      if (!draft) continue;
      form.elements.value.value = draft.value;
      form.elements.value.checked = draft.checked;
      form.elements.value.dispatchEvent(new Event('input',{bubbles:true}));
    }
  }
  async function saveProperty(form, reset) {
    if (busy) return;
    const descriptor = propertyForms.get(form.dataset.property);
    const {item,name,options} = descriptor;
    const value = parseInput(form.elements.value, options);
    if (!reset && JSON.stringify(value) === JSON.stringify(item[name])) return;
    const openIds = [...content.querySelectorAll('details[open]')].map(el => el.dataset.editField || el.dataset.editLink);
    const scroll = window.scrollY;
    busy = true; status.textContent = 'Saving...'; form.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      if (item.subjectType) await store.override(wikiId,item,name,value,reset);
      else await store.patch(item.table,wikiId,item.id,name,value);
      // Refresh inherited values after every save. Only this one property is written.
      await load({preserveDraftsExcept:form}); restoreOpenDetails(openIds); window.scrollTo(0,scroll); status.textContent = 'Saved.';
    } catch (error) { status.textContent = error.message; form.querySelectorAll('button').forEach(b => b.disabled = false); }
    finally { busy = false; }
  }
  content.addEventListener('input', event => {
    const form = event.target.closest('[data-property]');
    if (!form) return;
    const {item,name,options} = propertyForms.get(form.dataset.property);
    form.querySelector('[type="submit"]').disabled = JSON.stringify(parseInput(form.elements.value,options)) === JSON.stringify(item[name]);
  });
  content.addEventListener('change', event => event.target.dispatchEvent(new Event('input',{bubbles:true})));
  content.addEventListener('submit', event => {
    const form = event.target.closest('[data-property]');
    if (form) { event.preventDefault(); saveProperty(form,false); }
  });
  content.addEventListener('click', event => {
    if (event.target.closest('[data-reset]')) saveProperty(event.target.closest('form'),true);
  });
  function inputField(name,label,value='',type='text') { return `<label class="form-field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}"${type === 'text' ? ' required' : ''}></label>`; }
  function selectField(name,label,items,selected='') { return `<label class="form-field"><span>${esc(label)}</span><select name="${name}">${items.map(([v,l]) => option(v,l,selected)).join('')}</select></label>`; }
  function openForm(title, markup, submit) {
    dialog.innerHTML = `<form><h2 id="wiki-dialog-title">${esc(title)}</h2>${markup}<p class="form-status" role="status"></p><div class="modal-actions"><button type="button" class="secondary-action" data-dialog-cancel>Cancel</button><button class="primary-action" type="submit">Save</button></div></form>`;
    dialog.querySelector('[data-dialog-cancel]').addEventListener('click',() => dialog.close());
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget; const b = form.querySelector('[type="submit"]'); b.disabled = true;status.textContent='Saving…';
      const values = Object.fromEntries(new FormData(form));
      try { const drafts=captureProseDrafts();await submit(values); dialog.close(); await load();await startEditors(drafts);status.textContent='Saved.'; }
      catch (error) { form.querySelector('[role="status"]').textContent = error.message; }
      finally { b.disabled = false; }
    });
    dialog.showModal();
  }
  function editNavigation() {
    const entries = model.navigation;
    const id = crypto.randomUUID();
    openForm('Edit navigation', selectField('entry','Entry',[['','New entry'],...entries.map(n => [n.id,n.label])]) +
      inputField('label','Navigation label') + selectField('article_id','Article',[['','Folder'],...[...model.articles.values()].map(a => [a.id,a.title])]) +
      selectField('parent_id','Parent',[['','Top level'],...entries.map(n => [n.id,n.label])]) + inputField('sort_order','Order','0','number'), async v => {
        const row = {id:v.entry || id,wiki_id:wikiId,label:v.label.trim(),article_id:v.article_id || null,parent_id:v.parent_id || null,sort_order:Number(v.sort_order)};
        if (!row.label) throw new Error('Enter a navigation label.');
        await store.save('lexicon_navigation',row);
      });
    const form = dialog.querySelector('form');
    form.elements.entry.addEventListener('change', () => {
      const n = entries.find(e => e.id === form.elements.entry.value);
      for (const name of ['label','article_id','parent_id','sort_order']) form.elements[name].value = n?.[name] ?? (name === 'sort_order' ? 0 : '');
    });
  }
  document.addEventListener('click', async event => {
    const proseButton=event.target.closest('[data-edit-prose]');if(proseButton){await startEditor(proseButton.dataset.editProse);return;}
    const control = event.target.closest('[data-action]');
    if (!control) return;
    const a = model?.articles.get(articleId || model.wiki.universe_id);
    const action = control.dataset.action;
    if(action==='text-actions'){showContext(selectionPoint||captureSelection(),selectionPoint||captureSelection());return;}
    if(action==='save-prose'){try{await saveProse();}catch{}return;}
    if(action==='cancel-prose'){const scroll=scrollY;edit=false;history.replaceState({lexiconScroll:scroll},'',url(articleId,false));render();window.scrollTo(0,scroll);return;}
    if(['bold','italic','heading'].includes(action)){const active=[...inlineEditors.values()].find(v=>v.editor.isFocused)||[...inlineEditors.values()].at(-1);if(active){const chain=active.editor.chain().focus();if(action==='bold')chain.toggleBold().run();if(action==='italic')chain.toggleItalic().run();if(action==='heading')chain.toggleHeading({level:3}).run();}return;}
    if(['manual-link','unlink','image','excerpt'].includes(action)){inlineAction(action);return;}
    if(action==='new-fact'&&a){const id=crypto.randomUUID();openForm('Add wiki-only fact',inputField('label','Label')+'<label class="form-field"><span>Value</span><textarea name="value"></textarea></label>',v=>store.save('lexicon_facts',{id,wiki_id:wikiId,article_id:a.id,label:v.label,value:v.value,placement:'infobox',sort_order:a.fields.length}));}
    if(action==='pin-relation'&&a){const id=crypto.randomUUID(),relations=model.connections(a.id).flatMap(g=>g.relations.map(r=>({r,title:g.article.title})));openForm('Pin relationship',selectField('relation','Relationship',relations.map(({r,title})=>[r.id,(r.label||'Connection')+' — '+title]))+inputField('label','Label'),v=>{const r=relations.find(x=>x.r.id===v.relation)?.r;if(!r)throw new Error('Choose a relationship.');return store.save('lexicon_facts',{id,wiki_id:wikiId,article_id:a.id,label:v.label,kind:'relationship',reference:{subject_type:r.subjectType,subject_id:r.id},placement:'infobox',sort_order:a.fields.length});});}
    if(action==='alias'&&a){const id=crypto.randomUUID();openForm('Add alias',inputField('alias','Alias'),v=>store.save('lexicon_aliases',{id,wiki_id:wikiId,article_id:a.id,alias:v.alias.trim()}));}
    if(action==='remove-annotation'){try{const item=repairItems.find(n=>n.id===control.dataset.id);await store.remove(item?.excerpt?'lexicon_facts':'lexicon_annotations',wikiId,control.dataset.id);await load();}catch(e){status.textContent=e.message;}}
    if(action==='repair'){const point=selectionPoint||captureSelection(),item=repairItems.find(n=>n.id===control.dataset.id);if(!point){status.textContent='Select a replacement passage first.';return;}try{if(item.excerpt)await store.save('lexicon_facts',{id:item.id,wiki_id:wikiId,article_id:item.article_id,label:item.label,kind:'excerpt',placement:item.placement,sort_order:item.sort_order,hidden:item.hidden,reference:{subject_type:point.type,subject_id:point.id,property:point.property,anchor:point.anchor}});else await store.save('lexicon_annotations',{...item,subject_type:point.type,subject_id:point.id,property:point.property,anchor:point.anchor});await load();}catch(e){status.textContent=e.message;}}
    if (action === 'refresh') { status.textContent = 'Loading...'; try { await load(); } catch(e) { status.textContent=e.message; } }
    if (action === 'navigation') editNavigation();
    if (action === 'new-article') {
      const id = crypto.randomUUID(), navId = crypto.randomUUID();
      openForm('Create article',inputField('title','Article title'),async v => {
        if (!v.title.trim()) throw new Error('Enter an article title.');
        await store.save('lexicon_articles',{id,wiki_id:wikiId,title:v.title.trim(),introduction:''});
        await store.save('lexicon_navigation',{id:navId,wiki_id:wikiId,article_id:id,label:v.title.trim(),sort_order:model.navigation.length,parent_id:null});
        location.href = url(id,true);
      });
    }
    if (action === 'new-section' && a) {
      const id = crypto.randomUUID();
      openForm('Add section',inputField('label','Section label'),v => store.save('lexicon_sections',{id,wiki_id:wikiId,article_id:a.id,label:v.label,sort_order:a.sections.length}));
    }
    if (action === 'new-field' && a) {
      const id = crypto.randomUUID(), sectionId = control.dataset.section;
      openForm('Add field',inputField('label','Field label') + selectField('field_type','Field type',[['text','Text'],['textarea','Long text'],['number','Number'],['checkbox','Boolean'],['url','URL'],['relationship','Article reference']]) +
        '<label class="form-field"><span>Field value</span><textarea name="value" rows="3"></textarea></label>' +
        selectField('placement','Placement',[['body','Body'],['infobox','Infobox']]),v => {
          let value = v.value;
          if (v.field_type === 'number' && value !== '') { value = Number(value); if (!Number.isFinite(value)) throw new Error('Enter a number.'); }
          if (v.field_type === 'checkbox' && value !== '') { if (!['true','false'].includes(value)) throw new Error('Enter true or false.'); value = value === 'true'; }
          return store.save('lexicon_fields',{id,wiki_id:wikiId,article_id:a.id,section_id:sectionId,label:v.label,field_type:v.field_type,value,placement:v.placement,sort_order:a.fields.length});
        });
    }
    if (action === 'new-link' && a) {
      const id = crypto.randomUUID();
      openForm('Add wiki-only connection',selectField('target_id','Destination',[...model.articles.values()].filter(target => target.id !== a.id).map(target => [target.id,target.title])) +
        inputField('label','Connection label') + selectField('direction','Direction',[['directed','From this article to destination'],['both','Both directions']]),v =>
          store.save('lexicon_links',{id,wiki_id:wikiId,source_id:a.id,target_id:v.target_id,label:v.label,direction:v.direction}));
    }
    if (action === 'delete-link') {
      control.disabled = true;
      try { await store.deleteLink(wikiId,control.dataset.id); await load(); status.textContent='Connection deleted.'; }
      catch(e) { status.textContent=e.message; control.disabled=false; }
    }
  });
  const header = document.querySelector('.site-header');
  new ResizeObserver(() => document.querySelector('main').style.setProperty('--lexicon-header-height',`${header.getBoundingClientRect().height}px`)).observe(header);
  (async () => {
    try {
      if (!wikiId) throw new Error('Select a wiki from Lexicon.');
      const user = await window.centralisGetCurrentAppUser?.();
      if (!user || !window.centralisSupabase) throw new Error('Sign in to open this wiki.');
      store = new LexiconData.Store(window.centralisSupabase,user); await load();
    } catch(error) { overviewPending=false;content.setAttribute('aria-busy','false');status.textContent=error.message;document.querySelector('#wiki-title').textContent='Lexicon';if(!model)content.innerHTML='<section class="lexicon-article"><h1>Wiki unavailable</h1><a href="lexicon.html">Return to Lexicon</a></section>';actions.innerHTML=store?button('refresh','Try again'):''; }
  })();
})();
