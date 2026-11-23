import * as Prose from './lexicon-prose.js?v=wiki-followups-1';
(() => {
  const C = window.LexiconCore;
  const params = new URLSearchParams(location.search);
  const wikiId = params.get('wiki');
  let edit = params.get('edit') === '1';
  let query=params.get('q') || '',view=location.pathname.endsWith('/lexicon-search.html')?'search':params.get('view') || '',inlineEditors=new Map(),inlineVersion=0,outlineHeadings=[],outlineFrame=0,media=new Map(),repairItems=[],overviewPending=false;
  const current=()=>model?.articles.get(articleId || model.wiki.universe_id);
  const anchorId=id=>'section-'+encodeURIComponent(id);
  const proseItems=new Map();
  let activeOutlineId='';
  let imageViewerOpen=false;
  let articleId = params.get('article') || '';
  const content = document.querySelector('[data-wiki-content]');
  const workspace = content.closest('main');
  let panelFrame = 0;
  const nav = document.querySelector('[data-wiki-navigation]');
  const status = document.querySelector('[data-wiki-status]');
  const actions = document.querySelector('[data-wiki-actions]');
  const trail = document.querySelector('[data-wiki-breadcrumbs]');
  const search = document.querySelector('[data-wiki-search]');
  const compactNavigation = matchMedia('(max-width: 1100px)');
  compactNavigation.addEventListener('change',event=>{const outline=nav.querySelector('[data-outline]');if(outline)outline.open=!event.matches;});
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
  const canEdit = () => !!store && String(model?.wiki.user_id) === String(store.user.id);
  const icon = name => `<ph-${name} aria-hidden="true"></ph-${name}>`;
  const backTop=document.createElement('button');backTop.type='button';backTop.className='secondary-action lexicon-back-top';backTop.innerHTML=icon('arrow-up')+'Back to top';backTop.hidden=true;document.body.append(backTop);
  backTop.addEventListener('click',()=>{
    const heading=content.querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  });
  function renderNavigation() {
    nav.innerHTML = '<details data-outline><summary>Wiki navigation</summary><ul data-outline-list></ul><div class="lexicon-wiki-links"><a href="'+url('',false)+'"'+(!view&&!articleId?' aria-current="page"':'')+'>Wiki home</a><a href="'+url('',edit)+'&view=index"'+(view==='index'?' aria-current="page"':'')+'>All articles</a></div>' + (canEdit()&&model.wiki.kind==='standalone'?'<div class="lexicon-actions">'+button('new-article','Create article')+button('navigation','Edit navigation')+button('refresh','Reload wiki')+'</div>':'')+'</details>';
    if(model.wiki.kind==='universe'&&(view||!current()))nav.querySelector('[data-outline]').insertAdjacentHTML('beforeend','<div class="lexicon-actions">'+button('refresh','Reload source')+'</div>');
  }
  function breadcrumbs(a) {
    const path=[{href:'lexicon.html',label:'Lexicon'},{href:url('',false),label:model.wiki.name}];
    if(view==='index'||view==='search')path.push({label:view==='search'?'Search results':'All articles'});
    else if(a?.hidden)path.push({label:edit?a.title:'Article hidden'});
    else if(a&&!a.isRoot)path.push(...model.breadcrumbs(a.id).slice(1).map(p=>({label:p.label,href:p.id!==null?url(p.id,false):null})));
    else if(articleId&&!a)path.push({label:'Article unavailable'});
    return path.map((p,i)=>i===path.length-1?'<span aria-current="page">'+esc(p.label)+'</span>':p.href?'<a href="'+p.href+'">'+esc(p.label)+'</a>':'<span>'+esc(p.label)+'</span>').join('<span class="lexicon-crumb-separator" aria-hidden="true"> › </span>');
  }
  function prose(item,property,label) {
    const key=JSON.stringify([item.subjectType||item.table,item.id,property]);proseItems.set(key,{item,property,label});
    return '<div class="lexicon-prose" data-prose="'+esc(key)+'" data-label="'+esc(label)+'">'+Prose.html(item[property])+'</div>';
  }
  function subject(item,property) {return {type:item.subjectType || ({lexicon_articles:'standalone_article',lexicon_sections:'standalone_section',lexicon_fields:'standalone_field',lexicon_facts:'wiki_fact'}[item.table]),id:String(item.id),property};}
  function resultLink(r) {return url(r.article.id,false)+(r.section?'#'+anchorId(r.section):'');}
  function resultList(results) {return '<ul class="lexicon-results">'+results.map(r=>'<li><a href="'+resultLink(r)+'">'+esc(r.article.title)+'</a><small>'+esc(model.breadcrumbs(r.article.id).slice(0,-1).map(p=>p.label).join(' › '))+'</small><p>'+esc(r.snippet)+'</p></li>').join('')+'</ul>';}
  function indexPage() {
    if(view==='search')return '<section class="lexicon-article"><h1>Search results</h1><p>'+esc(query)+'</p>'+(query.trim()?(model.search(query).length?resultList(model.search(query)):'<p>No results.</p>'):'<p>Enter a search term.</p>')+'</section>';
    return '<section class="lexicon-article"><h1>All articles</h1>'+resultList([...model.articles.values()].filter(visible).sort((a,b)=>a.title.localeCompare(b.title)).map(a=>({article:a,snippet:model.plain(a.introduction).slice(0,150)})))+'</section>';
  }
  function fieldValue(field) {
    if(field.kind==='links')return '<ul class="lexicon-detail-links">'+field.reference.links.map(link=>{const target=model.articles.get(link.article_id);return target&&!target.hidden?'<li>'+articleLink(target,link.label||target.title)+'</li>':'';}).join('')+'</ul>';
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
    return `<dl>${fields.map(f => `<div class="lexicon-field" data-field-id="${esc(f.id)}"><dt>${esc(f.label)}</dt><dd>${fieldValue(f)}${edit&&f.placement==='infobox'?'<div class="lexicon-detail-actions">'+(f.kind==='links'?button('detail-links','Edit links',`data-id="${esc(f.id)}"`):'')+button('move-detail','Move',`data-id="${esc(f.id)}" aria-label="Move ${esc(f.label)} to group"`)+button('remove-detail','Remove',`data-id="${esc(f.id)}" aria-label="Remove ${esc(f.label)} from Article Details"`)+'</div>':''}</dd></div>`).join('')}</dl>`;
  }
  function infobox(a) {
    const info = model.visibleFields(a, 'infobox');
    if (!a.image && !a.type && !info.length && !edit) return '';
    const grouped=a.detailGroups.map(group=>{
      const fields=info.filter(f=>f.group_id===group.id);if(!fields.length&&!edit)return '';
      return `<section class="lexicon-detail-group" data-detail-group="${esc(group.id)}"><h3>${esc(group.label)}</h3>${edit?'<div class="lexicon-detail-actions">'+button('detail-group','Edit group',`data-id="${esc(group.id)}"`)+button('remove-detail-group','Remove group',`data-id="${esc(group.id)}"`)+button('detail-links','Add links',`data-group="${esc(group.id)}"`)+'</div>':''}${fieldsMarkup(fields)}</section>`;
    }).join('');
    return `<section class="lexicon-infobox" aria-label="Article Details"><h2>Article Details</h2>${a.image ? `<img src="${esc(a.image)}" alt="${esc(a.title)}">` : ''}${a.type ? `<dl><div class="lexicon-field"><dt>Type</dt><dd>${esc(a.type)}</dd></div></dl>` : ''}${fieldsMarkup(info.filter(f=>!f.group_id))}${grouped}${edit?'<div class="lexicon-detail-actions">'+button('new-fact','Add detail')+button('detail-links','Add links')+button('detail-group','Add group')+'</div>':''}</section>`;
  }
  function sourceTools(a) {
    if(model.wiki.kind!=='universe'||!a||!canEdit())return '';
    const builder='universe-canvas.html?universe_id='+encodeURIComponent(model.wiki.universe_id);
    return '<section class="lexicon-source-tools" aria-label="Source tools"><h2>Source tools</h2><a href="'+builder+'&focus_element_id='+encodeURIComponent(a.id)+'">'+icon('cube')+'Open in Builder</a><a href="chronicle-editor.html#universe/'+encodeURIComponent(model.wiki.universe_id)+(a.isRoot?'':'/element/'+encodeURIComponent(a.id))+'">'+icon('arrow-square-out')+'Edit in Chronicle</a>'+button('refresh',icon('arrows-clockwise')+'Reload source')+'</section>';
  }
  function reader(a) {
    if(!a)return '<section class="lexicon-article"><h1>'+esc(model.wiki.name)+'</h1>'+ (model.wiki.kind==='standalone'?(model.articles.size?resultList([...model.articles.values()].filter(visible).map(article=>({article,snippet:model.plain(article.introduction).slice(0,150)}))):'<p>No articles.</p>'):'<p>No article selected.</p>')+'</section>';
    const editAction=canEdit()&&!overviewPending?'<a class="secondary-action" href="'+url(articleId,!edit)+'">'+icon(edit?'eye':'pencil-simple')+(edit?'View wiki page':'Edit wiki page')+'</a>':'';
    if(a.hidden&&!edit){const tools=sourceTools(a);return '<div class="lexicon-reader'+(tools?'':' is-single')+'"><section class="lexicon-article"><div class="lexicon-title-row"><h1>Article hidden</h1>'+editAction+'</div><p>This article is hidden in this wiki.</p></section>'+(tools?'<aside class="lexicon-sidebar" aria-label="Article information">'+tools+'</aside>':'')+'</div>';}
    resolveFacts(a);const body=model.visibleFields(a,'body'),info=infobox(a),tools=sourceTools(a);
    return '<div class="lexicon-reader'+(info||tools?'':' is-single')+'"><article class="lexicon-article"><div class="lexicon-title-row"><h1>'+esc(a.title)+'</h1>'+editAction+'</div>'+prose(a,'introduction','Introduction')+
      (a.body||edit&&a.subjectType==='article'&&!a.isRoot?'<section><h2 id="article-body">Body</h2>'+prose(a,'body','Body')+'</section>':'')+
      (body.some(f=>!f.sectionId)?'<section><h2 id="article-details">Details</h2>'+fieldsMarkup(body.filter(f=>!f.sectionId))+'</section>':'')+
      a.sections.filter(s=>edit||!s.hidden&&(C.hasValue(s.body)||body.some(f=>f.sectionId===s.id))).map(s=>'<section data-section-id="'+esc(s.id)+'"><h2 id="'+anchorId(s.id)+'">'+esc(s.label)+'</h2>'+(s.table==='lexicon_sections'?prose(s,'body',s.label):'')+fieldsMarkup(body.filter(f=>f.sectionId===s.id))+'</section>').join('')+
      '</article><aside class="lexicon-sidebar" aria-label="Article information"'+(info||tools?'':' hidden')+'>'+info+tools+'</aside></div>'+(edit?'<div class="lexicon-inline-toolbar" role="toolbar" aria-label="Article editing">'+button('save-prose','Save page')+button('cancel-prose','Cancel edits')+'</div><div data-repairs></div><details class="lexicon-settings"><summary>Choose details</summary>'+button('new-fact','Add wiki-only fact')+button('pin-relation','Pin relationship')+button('alias','Add alias')+editor(a)+'</details>':'');
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
      if(f.kind==='links')f.value=f.reference.links.some(l=>model.articles.has(l.article_id)&&!model.articles.get(l.article_id).hidden)?'links':'';
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
    const headings=[...content.querySelectorAll('.lexicon-article section > h2,.lexicon-article [data-prose] :is(h1,h2,h3,h4,h5,h6)')];
    const intro=content.querySelector('.lexicon-article > [data-prose]');
    if(headings.length&&intro?.textContent.trim()){intro.id='article-overview';headings.unshift(intro);}
    renderOutline(headings,intro);
    const outline=nav.querySelector('[data-outline]');if(outline){outline.open=!compactNavigation.matches;outline.querySelector('summary').textContent=headings.length?'On this page':'Wiki navigation';outline.classList.toggle('has-outline',!!headings.length);}
    outlineHeadings=headings;activeOutlineId='';updateOutline();
    schedulePanelFit();
    enableImageViewing();
    const repairs=content.querySelector('[data-repairs]');if(repairs)repairs.innerHTML=repairItems.length?'<p>Some annotations need a new passage. Select the passage, then choose Repair.</p>'+repairItems.map(n=>'<div>'+esc(n.kind==='image'?'Image':n.kind==='excerpt'?'Pinned excerpt':'Link')+' '+button('repair','Repair',`data-id="${esc(n.id)}"`)+button('remove-annotation','Remove',`data-id="${esc(n.id)}"`)+'</div>').join(''):'';
  }
  function renderOutline(headings,intro) {
    const roots=[],stacks=new Map();
    for(const heading of headings) {
      const node={heading,children:[],level:Number(heading.tagName.slice(1))};
      if(heading===intro){roots.push(node);continue;}
      const section=heading.closest('.lexicon-article > section');
      const scope=section||heading.closest('[data-prose]');
      const stack=stacks.get(scope)||[];
      node.section=heading.parentElement===section;
      // Saved sections own their prose headings, even if that prose starts at h1/h2.
      while(stack.length&&!stack.at(-1).section&&stack.at(-1).level>=node.level)stack.pop();
      (stack.length?stack.at(-1).children:roots).push(node);
      stack.push(node);stacks.set(scope,stack);
    }
    const markup=nodes=>nodes.map(({heading,children})=>{
      const label=heading===intro?'Overview':heading.textContent;
      const open=false;
      const groupId='outline-children-'+encodeURIComponent(heading.id);
      const toggle=children.length?'<button type="button" class="lexicon-outline-toggle" data-outline-toggle aria-expanded="'+open+'" aria-controls="'+esc(groupId)+'" aria-label="'+esc((open?'Collapse ':'Expand ')+label)+'"></button>':'';
      return '<li data-outline-id="'+esc(heading.id)+'"><div class="lexicon-outline-row">'+toggle+'<a href="'+url(articleId)+'#'+encodeURIComponent(heading.id)+'">'+esc(label)+'</a></div>'+(children.length?'<ul class="lexicon-outline-children" id="'+esc(groupId)+'"'+(open?'':' hidden')+'>'+markup(children)+'</ul>':'')+'</li>';
    }).join('');
    const list=nav.querySelector('[data-outline-list]');if(list)list.innerHTML=markup(roots);
  }
  function setOutlineExpanded(control,expanded) {
    const group=document.getElementById(control.getAttribute('aria-controls'));
    if(!group)return;
    group.hidden=!expanded;control.setAttribute('aria-expanded',String(expanded));
    control.setAttribute('aria-label',(expanded?'Collapse ':'Expand ')+control.nextElementSibling.textContent);
  }
  function revealOutline(id,includeSelf=false) {
    const item=[...nav.querySelectorAll('[data-outline-id]')].find(el=>el.dataset.outlineId===id);
    for(let parent=includeSelf?item:item?.parentElement.closest('[data-outline-id]');parent;parent=parent.parentElement.closest('[data-outline-id]')){
      const control=parent.querySelector(':scope > .lexicon-outline-row > [data-outline-toggle]');
      if(control?.getAttribute('aria-expanded')==='false')setOutlineExpanded(control,true);
    }
  }
  nav.addEventListener('click',event=>{
    const control=event.target.closest('[data-outline-toggle]');
    if(control)setOutlineExpanded(control,control.getAttribute('aria-expanded')!=='true');
  });
  nav.addEventListener('keydown',event=>{
    const control=event.target.closest('[data-outline-toggle]');
    if(control&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setOutlineExpanded(control,event.key==='ArrowRight');}
  });
  function updateOutline(expand=false) {
    outlineFrame=0;if(!outlineHeadings.length)return;
    const top=document.querySelector('.site-header').getBoundingClientRect().bottom+32;
    let active=outlineHeadings[0];
    for(const heading of outlineHeadings)if(heading.getBoundingClientRect().top<=top)active=heading;
    // A short final section cannot always reach the top of the viewport.
    if(scrollY>0&&scrollY+innerHeight>=document.documentElement.scrollHeight-2)active=outlineHeadings.at(-1);
    if(expand&&active.id!==activeOutlineId)revealOutline(active.id,true);
    activeOutlineId=active.id;
    let activeItem;
    for(const item of nav.querySelectorAll('[data-outline-id]')) {
      item.removeAttribute('data-current-within');
      const link=item.querySelector(':scope > .lexicon-outline-row > a');
      if(item.dataset.outlineId===active.id){link.setAttribute('aria-current','location');activeItem=item;}
      else link.removeAttribute('aria-current');
    }
    for(let parent=activeItem?.parentElement.closest('[data-outline-id]');parent;parent=parent.parentElement.closest('[data-outline-id]'))parent.setAttribute('data-current-within','');
  }
  function schedulePanelFit() {
    if(panelFrame)return;
    panelFrame=requestAnimationFrame(()=>{
      panelFrame=0;
      const stickyTop=header.getBoundingClientRect().bottom+8;
      // At page top the search row also uses viewport space. Once sticky, panels
      // can grow into that space without extending below the visible screen.
      const panels=[nav,content.querySelector('.lexicon-sidebar')].filter(Boolean).map(panel=>({panel,top:Math.ceil(Math.max(stickyTop,panel.getBoundingClientRect().top))+'px'}));
      for(const {panel,top} of panels)if(panel.style.getPropertyValue('--lexicon-panel-top')!==top)panel.style.setProperty('--lexicon-panel-top',top);
    });
  }
  window.addEventListener('resize',schedulePanelFit);
  nav.addEventListener('toggle',schedulePanelFit,true);
  window.addEventListener('scroll',()=>{schedulePanelFit();if(!outlineFrame)outlineFrame=requestAnimationFrame(()=>{backTop.hidden=!model||scrollY<300;updateOutline(true);});},{passive:true});
  function enableImageViewing() {
    for(const img of content.querySelectorAll('.lexicon-infobox img,.lexicon-article img')) {
      if(img.closest('[data-wiki-image],[contenteditable="true"]'))continue;
      const control=img.closest('a')||document.createElement('button');
      if(control.tagName==='BUTTON'){control.type='button';control.className='lexicon-image-button';img.before(control);control.append(img);}
      control.dataset.wikiImage='';control.setAttribute('aria-haspopup','dialog');
      control.setAttribute('aria-label','View image: '+(img.alt||current()?.title||'Image'));
    }
  }
  function openReaderImage(control) {
    const a=current(),clicked=control.querySelector('img');
    if(!a||!clicked||typeof window.openCentralisImageViewer!=='function')return;
    const elements=[...content.querySelectorAll('[data-wiki-image] img')];
    const images=elements.map((img,index)=>({id:String(index),src:img.currentSrc||img.src,alt:img.alt,name:img.alt||a.title,caption:img.closest('figure')?.querySelector('figcaption')?.textContent||''}));
    closeContext();selectionButton?.remove();selectionButton=null;imageViewerOpen=true;
    const shell=document.querySelector('.app-shell');shell.inert=true;
    window.openCentralisImageViewer({
      title:a.title,kicker:'Lexicon',images,activeImageId:String(elements.indexOf(clicked)),
      capabilities:{canNavigate:true,canShowThumbnails:images.length>1,canOpen:true,canDownload:true,canSetPrimary:false,canDelete:false,canUpload:false},
      details:image=>({imageInfo:{title:'Image',rows:[['Article',a.title],['Alt text',image.alt],['Caption',image.caption]].filter(([,value])=>value)}}),
      actions:{close:()=>{imageViewerOpen=false;shell.inert=false;if(control.isConnected)control.focus({preventScroll:true});}}
    });
    document.querySelector('[data-centralis-image-viewer-close]')?.focus({preventScroll:true});
  }
  content.addEventListener('click',event=>{
    const control=event.target.closest('[data-wiki-image]');
    if(!control||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();openReaderImage(control);
  });
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
      enableImageViewing();
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
  function pointForLink(link) {
    const range=document.createRange();range.selectNodeContents(link);return captureSelection(range);
  }
  function showContext(selected,insertion,x,y) {
    if(overviewPending||!current()||current().hidden)return;
    closeContext();let point=selected||insertion;if(!point){status.textContent='Select text or place the caret in the article first.';return;}
    const node=point.range.startContainer.nodeType===1?point.range.startContainer:point.range.startContainer.parentElement;
    const linked=node.closest('a')||point.root.querySelector('a')&&[...point.root.querySelectorAll('a')].find(a=>point.range.intersectsNode(a));
    if(linked&&!point.anchor.quote){selected=point=pointForLink(linked);}
    const copyText=selected?.text||'';
    contextMenu=document.createElement('div');contextMenu.className='lexicon-context-menu';contextMenu.setAttribute('role','menu');contextMenu.setAttribute('aria-label','Text actions');
    contextMenu.innerHTML=button('context-copy','Copy',copyText?'':'disabled')+(canEdit()?button('context-link',linked?'Replace link…':'Link selected text…',selected?.anchor.quote?'':'disabled')+button('context-create-page','Create page from selected text…',selected?.anchor.quote?.trim()?'':'disabled')+button('context-unlink','Remove link…',linked?'':'disabled')+button('context-image','Insert image here…')+button('context-excerpt','Pin excerpt to Article Details',selected?.anchor.quote?'':'disabled'):'')+'<small>Shift + right-click: browser menu</small>';
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
    if(overviewPending||dialog.open||contextMenu||imageViewerOpen)return;
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
    const link=event.target.closest('a');let selected=captureSelection();
    if(link){
      if(!canEdit())return;
      if(selected?.root!==root||!selected?.anchor.quote||!selected.range.intersectsNode(link))selected=pointForLink(link);
    }
    const insertion=caretPoint(event)||selected;
    if(!insertion||insertion.root!==root)return;
    event.preventDefault();selectionButton?.remove();showContext(selected?.root===root?selected:null,insertion,event.clientX||undefined,event.clientY||undefined);
  });
  document.addEventListener('keydown',event=>{
    if(imageViewerOpen){
      if(event.key==='Tab'){
        const controls=[...document.querySelectorAll('[data-centralis-image-viewer] button,[data-centralis-image-viewer] input')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
      return;
    }
    if(event.key==='Escape'&&(contextMenu||selectionButton)){closeContext();selectionButton?.remove();restoreSelection();selectionPoint?.root.focus({preventScroll:true});}
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
      let point=captureSelection()||selectionPoint;const root=event.target.closest('[data-prose]');
      const link=event.target.closest('a');if(link&&(!point?.anchor.quote||point.root!==root||!point.range.intersectsNode(link)))point=pointForLink(link);
      if(root&&point?.root!==root){const r=document.createRange();r.selectNodeContents(root);r.collapse(true);point=captureSelection(r);}
      if(point&&!dialog.open){event.preventDefault();showContext(point,point);}
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&captureSelection()&&!dialog.open){event.preventDefault();selectionPoint=captureSelection();inlineAction('manual-link');}
  });
  dialog.addEventListener('close',()=>{document.querySelector('[data-point-marker]')?.remove();restoreSelection();});
  dialog.addEventListener('cancel',event=>{if(dialog.querySelector('[type="submit"]')?.disabled)event.preventDefault();});
  function annotationRow(point,kind,id=crypto.randomUUID()) {return {id,wiki_id:wikiId,article_id:current().id,subject_type:point.type,subject_id:point.id,property:point.property,kind,anchor:point.anchor};}
  function linkDialog(point,create=false) {
    const a=current(),ownerStore=store,version=loadVersion,pageId=crypto.randomUUID();
    const existing=model.annotations.find(n=>n.article_id===a.id&&n.kind==='link'&&n.subject_type===point.type&&n.subject_id===point.id&&n.property===point.property&&JSON.stringify(Prose.locate(Prose.plain(point.root),n.anchor))===JSON.stringify({start:point.anchor.start,end:point.anchor.end}));
    const annotation=annotationRow(point,'link',existing?.id||crypto.randomUUID());
    if(existing)annotation.anchor=existing.anchor;
    const options=[...model.articles.values()].filter(t=>!t.hidden&&t.id!==a.id).map(t=>[t.id,[t.title,t.type,model.breadcrumbs(t.id).slice(1,-1).map(p=>p.label).join(' › ')].filter(Boolean).join(' — ')]);
    const universe=model.wiki.kind==='universe';
    const title=point.anchor.quote.trim().replace(/\s+/g,' ');
    const currentLink=[...point.root.querySelectorAll('a[data-article-id]')].find(link=>point.range.intersectsNode(link));
    openForm('Link selected text','<fieldset data-existing-page><label class="form-field"><span>Find article</span><input name="find" type="search"></label>'+selectField('target_id','Article',options,existing?.target_id||currentLink?.dataset.articleId)+'<button type="button" class="secondary-action" data-create-page>Create new page…</button></fieldset>'+
      '<fieldset data-new-page hidden disabled>'+inputField('title','Page title',title)+(universe?selectField('element_type','Element type',[['','Loading element types…']]):'')+'<label class="form-field"><span>Introduction (optional)</span><textarea name="introduction" rows="3"></textarea></label>'+(universe?'<p class="lexicon-dialog-note">Creates an element in Universe Builder.</p>':'')+'<button type="button" class="secondary-action" data-existing-link>Link to an existing page</button></fieldset>',async v=>{
        if(ownerStore!==store||version!==loadVersion)throw new Error('Reopen the wiki before saving.');
        if(create){
          if(!v.title.trim())throw new Error('Enter a page title.');
          if(universe&&!v.element_type)throw new Error('Choose an element type.');
          await ownerStore.createLinkedPage({wikiId,pageId,annotation,title:v.title.trim(),elementType:v.element_type,introduction:v.introduction});
        }else{
          if(!v.target_id)throw new Error('Choose an article.');
          await ownerStore.save('lexicon_annotations',{...annotation,target_id:v.target_id});
        }
      });
    const form=dialog.querySelector('form'),oldFields=form.querySelector('[data-existing-page]'),newFields=form.querySelector('[data-new-page]');
    form.elements.title.maxLength=240;
    if(universe)form.elements.element_type.required=true;
    let typesLoaded=false,typesLoading=false;
    const setMode=async next=>{
      if(form.querySelector('[type="submit"]').disabled)return;
      create=next;oldFields.hidden=next;oldFields.disabled=next;newFields.hidden=!next;newFields.disabled=!next;
      form.querySelector('h2').textContent=next?'Create page from selected text':'Link selected text';
      form.querySelector('[type="submit"]').textContent=next?'Create page and link':'Save';
      form.querySelector('[role="status"]').textContent='';
      (next?form.elements.title:form.elements.find).focus();
      if(next&&universe&&!typesLoaded&&!typesLoading){
        typesLoading=true;
        try{
          const types=await ownerStore.elementTypes();
          if(!form.isConnected||ownerStore!==store||version!==loadVersion)return;
          form.elements.element_type.innerHTML=option('','Choose an element type','')+types.sort((a,b)=>a.name.localeCompare(b.name)).map(t=>option(t.id,t.name,'')).join('');typesLoaded=true;
          if(!types.length)form.querySelector('[role="status"]').textContent='Create an element type in Universe Builder first.';
        }catch(e){if(form.isConnected)form.querySelector('[role="status"]').textContent='Could not load element types: '+e.message;}
        finally{typesLoading=false;}
      }
    };
    form.querySelector('[data-create-page]').addEventListener('click',()=>setMode(true));
    form.querySelector('[data-existing-link]').addEventListener('click',()=>setMode(false));
    form.elements.find.addEventListener('input',e=>{form.elements.target_id.innerHTML=options.filter(([,label])=>label.toLowerCase().includes(e.target.value.toLowerCase())).map(([id,label])=>option(id,label,'')).join('');});
    setMode(create);
  }
  async function inlineAction(action) {
    if(!canEdit())return;
    if(action==='link')action='manual-link';
    const point=selectionPoint||captureSelection();
    if(!point){status.textContent='Select text or place the caret in the article first.';return;}
    const a=current();if(!a)return;
    if(action==='manual-link'||action==='create-page'){if(!point.anchor.quote?.trim()){status.textContent='Select the text first.';return;}linkDialog(point,action==='create-page');return;}
    if(action==='excerpt') {
      if(!point.anchor.quote){status.textContent='Select the text first.';return;}
      const id=crypto.randomUUID();
      openForm('Pin excerpt to Article Details',inputField('label','Label')+detailGroupField(a),v=>store.saveDetail({id,wiki_id:wikiId,article_id:a.id,label:v.label,kind:'excerpt',reference:{subject_type:point.type,subject_id:point.id,property:point.property,anchor:point.anchor},placement:'infobox',sort_order:a.fields.length},v.group_id));
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
  function dismissSuggestions() {
    search.querySelector('#wiki-suggestions').hidden=true;
    const input=search.querySelector('input');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
  }
  function runSearch(href) {
    if(!model||busy)return;
    history.replaceState({...history.state,lexiconScroll:scrollY},'',location.href);history.pushState({lexiconScroll:0},'',href);showRoute(localRoute(href));
  }
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('[data-wiki-search]'))dismissSuggestions();});
  search.addEventListener('submit',event=>{event.preventDefault();runSearch(searchUrl(search.querySelector('input').value));});
  search.addEventListener('input',event=>{
    if(event.target.id!=='wiki-search'||!model)return;const input=event.target,list=search.querySelector('#wiki-suggestions'),results=model.search(input.value).slice(0,7);
    list.innerHTML=results.map((r,i)=>'<a role="option" id="wiki-suggestion-'+i+'" href="'+resultLink(r)+'" tabindex="-1">'+esc(r.article.title)+'<small>'+esc(r.snippet)+'</small></a>').join('')||(input.value.trim()?'<p>No results.</p>':'');list.hidden=!input.value.trim();input.setAttribute('aria-expanded',String(!list.hidden));input.removeAttribute('aria-activedescendant');
  });
  search.addEventListener('keydown',event=>{
    if(event.target.id!=='wiki-search')return;const input=event.target,list=search.querySelector('#wiki-suggestions'),options=list.hidden?[]:[...list.querySelectorAll('[role="option"]')];
    let index=options.findIndex(o=>o.id===input.getAttribute('aria-activedescendant'));
    if(event.key==='Escape'){event.preventDefault();dismissSuggestions();}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();index=Math.max(0,Math.min(options.length-1,index+(event.key==='ArrowDown'?1:-1)));options.forEach((o,i)=>o.setAttribute('aria-selected',String(i===index)));if(options[index]){input.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});}}
    if(event.key==='Enter'){event.preventDefault();runSearch(options[index]?.href||searchUrl(input.value));}
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
      <label for="${id}">${esc(label)}${item.subjectType&&!options.local ? `<small>${overridden ? 'Customized' : 'Inherited'}</small>` : ''}</label>
      ${input}<div class="lexicon-property-actions"><button type="submit" class="secondary-action" disabled>Save</button>
      ${item.subjectType&&!options.local ? `<button type="button" class="secondary-action" data-reset${overridden ? '' : ' disabled'}>Reset to source</button>` : ''}</div>
    </form>`;
  }
  function fieldEditor(f) {
    let valueOptions = { multiline: ['textarea','rich_text'].includes(f.field_type), number: f.field_type === 'number' };
    if (f.field_type === 'checkbox') valueOptions = { choices: [['','Empty'],['true','True'],['false','False']], typedBoolean: true };
    return `<details class="lexicon-editor-item" data-edit-field="${esc(f.id)}"><summary>${esc(f.label || 'Untitled field')}${f.hidden ? ' (hidden)' : ''}</summary>
      ${!C.hasValue(f.value)&&f.subjectType?'<p>No source value. Use Edit source to enter one.</p>':''}${property(f,'label','Field label')}${!f.kind||f.kind==='fact'?property(f,'value','Field value',valueOptions):''}
      ${property(f,'placement','Placement',{choices:[['body','Body'],['infobox','Article Details']]})}
      ${property(f,'sort_order','Field order',{number:true})}${property(f,'hidden','Hide field',{boolean:true})}
      ${property(f,'group_id','Article Details group',{choices:[['','Ungrouped'],...current().detailGroups.map(g=>[g.id,g.label])],local:true})}
      ${f.kind==='links'?button('detail-links','Edit links',`data-id="${esc(f.id)}"`):''}
      ${f.table==='lexicon_facts'?button('remove-detail','Remove detail',`data-id="${esc(f.id)}"`):''}
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
    if(imageViewerOpen)window.closeCentralisImageViewer?.();
    closeContext();selectionButton?.remove();selectionButton=null;dismissSuggestions();
    search.querySelector('#wiki-suggestions').replaceChildren();
    repairItems=[];selectionPoint=null;++inlineVersion;for(const {editor} of inlineEditors.values())editor.destroy();inlineEditors.clear();proseItems.clear();
    propertyForms = new Map();
    const a = model.articles.get(articleId || model.wiki.universe_id);
    if(!canEdit())edit=false;
    trail.innerHTML=breadcrumbs(a);
    search.querySelector('input').value=query;
    document.title = `${edit ? 'Wiki Editor' : model.wiki.name} | Lexicon`;
    actions.replaceChildren();
    renderNavigation();
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
    if(location.hash)requestAnimationFrame(()=>{const id=decodeURIComponent(location.hash.slice(1));revealOutline(id);document.getElementById(id)?.scrollIntoView();});
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
      const sidebar=readerEl.querySelector('.lexicon-sidebar');
      if(info)sidebar.insertAdjacentHTML('afterbegin',info);
      sidebar.hidden=!sidebar.children.length;
      readerEl.classList.toggle('is-single',sidebar.hidden);
      const used=new Set();
      for(const root of readerEl.querySelectorAll('.lexicon-infobox [data-prose]')) {
        const p=proseItems.get(root.dataset.prose);Prose.decorate(root,subject(p.item,p.property),model,a,id=>url(id,false),used,media);
      }
      enableImageViewing();
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
    if(target.hash){const id=decodeURIComponent(target.hash.slice(1));revealOutline(id);if(!scroll)document.getElementById(id)?.scrollIntoView();}
    const heading = content.querySelector('h1') || content;
    heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true});
  }
  document.querySelector('main').addEventListener('click',event=>{
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const target = localRoute(link.href);
    if (!target || !model || busy || dialog.open) return;
    if(target.hash&&target.article===articleId&&target.edit===edit&&!target.view&&!target.query){event.preventDefault();history.pushState({lexiconScroll:window.scrollY},'',target.href);const id=decodeURIComponent(target.hash.slice(1));revealOutline(id);document.getElementById(id)?.scrollIntoView();return;}
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
    ++loadVersion; store = null; model = null; data = null;outlineHeadings=[];activeOutlineId='';
    if(imageViewerOpen)window.closeCentralisImageViewer?.();
    const viewer=document.querySelector('[data-centralis-image-viewer]');
    viewer?.querySelectorAll('img').forEach(img=>img.removeAttribute('src'));
    viewer?.querySelectorAll('[data-centralis-image-viewer-title],[data-centralis-image-viewer-details],[data-centralis-image-viewer-thumbs]').forEach(el=>el.replaceChildren());
    closeContext();selectionButton?.remove();dismissSuggestions();selectionPoint=null;
    backTop.hidden=true;
    ++inlineVersion;for(const {editor}of inlineEditors.values())editor.destroy();inlineEditors.clear();media.clear();propertyForms.clear(); content.replaceChildren(); nav.replaceChildren(); actions.replaceChildren(); dialog.close();
    trail.replaceChildren();search.reset();search.querySelector('#wiki-suggestions').replaceChildren();
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
      if(name==='group_id')await store.setDetailGroup(wikiId,item.articleId,subject(item,'value'),value);
      else if (item.subjectType) await store.override(wikiId,item,name,value,reset);
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
  function selectField(name,label,items,selected='') { return `<label class="form-field"><span>${esc(label)}</span><select name="${name}" aria-label="${esc(label)}">${items.map(([v,l]) => option(v,l,selected)).join('')}</select></label>`; }
  function detailGroupField(article,selected='') {return selectField('group_id','Group',[['','Ungrouped'],...article.detailGroups.map(g=>[g.id,g.label])],selected);}
  function editDetailLinks(article,field,groupId='') {
    const id=field?.id||crypto.randomUUID();
    openForm(field?'Edit links':'Add links',inputField('label','Label',field?.label||'')+detailGroupField(article,field?.group_id||groupId)+'<div data-detail-link-rows></div><button type="button" class="secondary-action" data-add-detail-link>Add link</button>',async v=>{
      const links=[...dialog.querySelectorAll('[data-detail-link-row]')].map(row=>({article_id:row.querySelector('select').value,label:row.querySelector('input').value.trim()}));
      if(!links.length||links.some(link=>!model.articles.has(link.article_id)))throw new Error('Choose at least one article.');
      await store.saveDetail({id,wiki_id:wikiId,article_id:article.id,label:v.label,kind:'links',reference:{links},sort_order:field?.sort_order??article.fields.length,hidden:field?.hidden||false},v.group_id);
    });
    const rows=dialog.querySelector('[data-detail-link-rows]');
    const add=link=>{
      const row=document.createElement('div');row.dataset.detailLinkRow='';row.className='lexicon-detail-link-row';
      const choices=[...model.articles.values()].filter(a=>!a.hidden||a.id===link?.article_id).map(a=>[a.id,a.title]);
      if(link?.article_id&&!model.articles.has(link.article_id))choices.push([link.article_id,'Unavailable article']);
      row.innerHTML=selectField('link_article','Article',[['','Choose an article'],...choices],link?.article_id||'')+'<label class="form-field"><span>Link text (optional)</span><input name="link_label" maxlength="240" value="'+esc(link?.label||'')+'"></label><div class="lexicon-detail-actions"><button type="button" class="secondary-action" data-link-up>Move up</button><button type="button" class="secondary-action" data-link-down>Move down</button><button type="button" class="secondary-action" data-link-remove>Remove link</button></div>';
      row.querySelector('select').required=true;row.querySelector('[data-link-remove]').onclick=()=>row.remove();
      row.querySelector('[data-link-up]').onclick=()=>{if(row.previousElementSibling)rows.insertBefore(row,row.previousElementSibling);};
      row.querySelector('[data-link-down]').onclick=()=>{if(row.nextElementSibling)rows.insertBefore(row.nextElementSibling,row);};rows.append(row);
    };
    (field?.reference.links||[null]).forEach(add);dialog.querySelector('[data-add-detail-link]').onclick=()=>add(null);
  }
  function openForm(title, markup, submit) {
    const ownerStore=store,version=loadVersion;
    selectionButton?.remove();selectionButton=null;
    dialog.innerHTML = `<form><h2 id="wiki-dialog-title">${esc(title)}</h2>${markup}<p class="form-status" role="status"></p><div class="modal-actions"><button type="button" class="secondary-action" data-dialog-cancel>Cancel</button><button class="primary-action" type="submit">Save</button></div></form>`;
    dialog.querySelector('[data-dialog-cancel]').addEventListener('click',() => {if(!dialog.querySelector('[type="submit"]').disabled)dialog.close();});
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget; const b = form.querySelector('[type="submit"]');if(b.disabled||ownerStore!==store||version!==loadVersion)return;b.disabled = true;status.textContent='Saving…';
      const values = Object.fromEntries(new FormData(form));
      try { const scroll=scrollY,openIds=[...content.querySelectorAll('details[open]')].map(el=>el.dataset.editField||el.dataset.editLink);await submit(values);if(ownerStore!==store||version!==loadVersion)return;dialog.close();await load({preserveDraftsExcept:true});if(ownerStore!==store)return;restoreOpenDetails(openIds);window.scrollTo(0,scroll);status.textContent='Saved.'; }
      catch (error) { if(ownerStore===store&&form.isConnected){form.querySelector('[role="status"]').textContent = error.message;status.textContent='Could not save.';} }
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
    if(action==='detail-group'&&a&&edit){
      const group=a.detailGroups.find(g=>g.id===control.dataset.id),id=group?.id||crypto.randomUUID();
      openForm(group?'Edit group':'Add group',inputField('label','Group name',group?.label||'')+inputField('sort_order','Order',group?.sort_order??a.detailGroups.length,'number'),v=>store.save('lexicon_detail_groups',{id,wiki_id:wikiId,article_id:a.id,label:v.label.trim(),sort_order:Number(v.sort_order)}));return;
    }
    if(action==='detail-links'&&a&&edit){editDetailLinks(a,a.fields.find(f=>f.id===control.dataset.id),control.dataset.group||'');return;}
    if(action==='move-detail'&&a&&edit){const field=a.fields.find(f=>f.id===control.dataset.id);if(field)openForm('Move detail',detailGroupField(a,field.group_id),v=>store.setDetailGroup(wikiId,a.id,subject(field,'value'),v.group_id));return;}
    if(action==='remove-detail-group'&&a&&edit&&!busy){
      const group=a.detailGroups.find(g=>g.id===control.dataset.id);if(!group)return;
      const ownerStore=store,version=loadVersion,scroll=scrollY;busy=true;control.disabled=true;
      try{await ownerStore.remove('lexicon_detail_groups',wikiId,group.id);if(ownerStore!==store||version!==loadVersion)return;await load({preserveDraftsExcept:true});window.scrollTo(0,scroll);status.textContent='Group removed. Items are ungrouped.';}
      catch(error){if(ownerStore===store)status.textContent=error.message;}finally{busy=false;control.disabled=false;}return;
    }
    if(action==='remove-detail'&&edit&&canEdit()&&!busy){
      const field=a?.fields.find(f=>f.id===control.dataset.id);if(!field)return;
      const ownerStore=store,scroll=scrollY,version=loadVersion;
      const openIds=[...content.querySelectorAll('details[open]')].map(el=>el.dataset.editField||el.dataset.editLink);
      busy=true;control.disabled=true;status.textContent='Removing…';
      try{
        if(field.table==='lexicon_facts')await ownerStore.remove('lexicon_facts',wikiId,field.id);
        else if(field.subjectType)await ownerStore.override(wikiId,field,'hidden',true);
        else await ownerStore.patch(field.table,wikiId,field.id,'hidden',true);
        if(ownerStore!==store||version!==loadVersion)return;
        await load({preserveDraftsExcept:true});restoreOpenDetails(openIds);window.scrollTo(0,scroll);status.textContent='Detail removed.';
      }catch(error){if(ownerStore===store)status.textContent=error.message;}
      finally{busy=false;control.disabled=false;}
      return;
    }
    if(action==='text-actions'){showContext(selectionPoint||captureSelection(),selectionPoint||captureSelection());return;}
    if(action==='save-prose'){try{await saveProse();}catch{}return;}
    if(action==='cancel-prose'){const scroll=scrollY;edit=false;history.replaceState({lexiconScroll:scroll},'',url(articleId,false));render();window.scrollTo(0,scroll);return;}
    if(['bold','italic','heading'].includes(action)){const active=[...inlineEditors.values()].find(v=>v.editor.isFocused)||[...inlineEditors.values()].at(-1);if(active){const chain=active.editor.chain().focus();if(action==='bold')chain.toggleBold().run();if(action==='italic')chain.toggleItalic().run();if(action==='heading')chain.toggleHeading({level:3}).run();}return;}
    if(['manual-link','unlink','image','excerpt'].includes(action)){inlineAction(action);return;}
    if(action==='new-fact'&&a){const id=crypto.randomUUID();openForm('Add detail',inputField('label','Label')+'<label class="form-field"><span>Value</span><textarea name="value"></textarea></label>'+detailGroupField(a),v=>store.saveDetail({id,wiki_id:wikiId,article_id:a.id,label:v.label,value:v.value,placement:'infobox',sort_order:a.fields.length},v.group_id));}
    if(action==='pin-relation'&&a){const id=crypto.randomUUID(),relations=model.connections(a.id).flatMap(g=>g.relations.map(r=>({r,title:g.article.title})));openForm('Pin relationship',selectField('relation','Relationship',relations.map(({r,title})=>[r.id,(r.label||'Connection')+' — '+title]))+inputField('label','Label')+detailGroupField(a),v=>{const r=relations.find(x=>x.r.id===v.relation)?.r;if(!r)throw new Error('Choose a relationship.');return store.saveDetail({id,wiki_id:wikiId,article_id:a.id,label:v.label,kind:'relationship',reference:{subject_type:r.subjectType,subject_id:r.id},placement:'infobox',sort_order:a.fields.length},v.group_id);});}
    if(action==='alias'&&a){const id=crypto.randomUUID();openForm('Add alias',inputField('alias','Alias'),v=>store.save('lexicon_aliases',{id,wiki_id:wikiId,article_id:a.id,alias:v.alias.trim()}));}
    if(action==='remove-annotation'){try{const item=repairItems.find(n=>n.id===control.dataset.id);await store.remove(item?.excerpt?'lexicon_facts':'lexicon_annotations',wikiId,control.dataset.id);await load();}catch(e){status.textContent=e.message;}}
    if(action==='repair'){const point=selectionPoint||captureSelection(),item=repairItems.find(n=>n.id===control.dataset.id);if(!point){status.textContent='Select a replacement passage first.';return;}try{if(item.excerpt)await store.save('lexicon_facts',{id:item.id,wiki_id:wikiId,article_id:item.article_id,label:item.label,kind:'excerpt',placement:item.placement,sort_order:item.sort_order,hidden:item.hidden,reference:{subject_type:point.type,subject_id:point.id,property:point.property,anchor:point.anchor}});else await store.save('lexicon_annotations',{...item,subject_type:point.type,subject_id:point.id,property:point.property,anchor:point.anchor});await load();}catch(e){status.textContent=e.message;}}
    if (action === 'refresh') {
      if(busy)return;busy=true;control.disabled=true;const scroll=scrollY;status.textContent='Loading…';
      try { await load({preserveDraftsExcept:edit?true:undefined});window.scrollTo(0,scroll);status.textContent=model.wiki.kind==='universe'?'Source reloaded.':'Wiki reloaded.'; }
      catch(e) { status.textContent=e.message; }finally{busy=false;control.disabled=false;}
    }
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
        selectField('placement','Placement',[['body','Body'],['infobox','Article Details']]),v => {
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
  const readerResizeObserver=new ResizeObserver(()=>{
    workspace.style.setProperty('--lexicon-header-height',`${header.getBoundingClientRect().height}px`);
    schedulePanelFit();
  });
  for(const element of [header,workspace.querySelector('.lexicon-utility-row'),status,actions])if(element)readerResizeObserver.observe(element);
  (async () => {
    try {
      if (!wikiId) throw new Error('Select a wiki from Lexicon.');
      const user = await window.centralisGetCurrentAppUser?.();
      if (!user || !window.centralisSupabase) throw new Error('Sign in to open this wiki.');
      store = new LexiconData.Store(window.centralisSupabase,user); await load();
    } catch(error) { overviewPending=false;content.setAttribute('aria-busy','false');status.textContent=error.message;if(!model)content.innerHTML='<section class="lexicon-article"><h1>Wiki unavailable</h1><a href="lexicon.html">Return to Lexicon</a></section>';actions.innerHTML=store?button('refresh','Try again'):''; }
  })();
})();
