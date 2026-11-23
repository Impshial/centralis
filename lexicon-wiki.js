(() => {
  const C = window.LexiconCore;
  const params = new URLSearchParams(location.search);
  const wikiId = params.get('wiki');
  let edit = params.get('edit') === '1';
  let articleId = params.get('article') || '';
  const content = document.querySelector('[data-wiki-content]');
  const nav = document.querySelector('[data-wiki-navigation]');
  const status = document.querySelector('[data-wiki-status]');
  const actions = document.querySelector('[data-wiki-actions]');
  const dialog = document.querySelector('[data-wiki-dialog]');
  let store, data, model, propertyForms = new Map(), busy = false, loadVersion = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const url = (id = '', editor = edit) => `lexicon-wiki.html?wiki=${encodeURIComponent(wikiId)}${id ? `&article=${encodeURIComponent(id)}` : ''}${editor ? '&edit=1' : ''}`;
  const button = (action, label, extra = '') => `<button type="button" class="secondary-action" data-action="${action}" ${extra}>${label}</button>`;
  const option = (value, label, selected) => `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`;
  const articleLink = (a, label = a.title) => `<a href="${url(a.isRoot ? '' : a.id)}"${a.id === articleId ? ' aria-current="page"' : ''}>${esc(label)}${a.hidden && edit ? ' (hidden)' : ''}</a>`;
  const visible = a => edit || !a.hidden;
  function renderNavigation() {
    let html = `<a href="${url()}">Wiki home</a>`;
    if (model.wiki.kind === 'standalone') {
      const visited = new Set();
      function branch(entry, trail = new Set()) {
        if (trail.has(entry.id)) return '';
        visited.add(entry.id);
        const path = new Set([...trail, entry.id]);
        const a = model.articles.get(entry.article_id);
        const children = model.navigation.filter(n => n.parent_id === entry.id).sort(C.order).map(n => branch(n, path)).join('');
        if (a && !visible(a)) return children ? `<li><ul>${children}</ul></li>` : '';
        const title = a ? articleLink(a, entry.label) : `<span>${esc(entry.label)}</span>`;
        return `<li>${children ? `<details open><summary>${title}</summary><ul>${children}</ul></details>` : title}</li>`;
      }
      const roots = model.navigation.filter(n => !n.parent_id || !model.navigation.some(p => p.id === n.parent_id)).sort(C.order);
      html += `<h2>Contents</h2><ul>${roots.map(n => branch(n)).join('')}${model.navigation.filter(n => !visited.has(n.id)).map(n => branch(n)).join('')}</ul>`;
    } else {
      let count = 0;
      function graph(a, trail = new Set()) {
        if (!a || !visible(a)) return '';
        if (trail.has(a.id) || ++count > 500) return `<li>${articleLink(a)}</li>`;
        const path = new Set([...trail, a.id]);
        const children = model.connections(a.id, { editor: edit, outgoing: true }).map(g => graph(g.article, path)).join('');
        return `<li>${children ? `<details><summary>${articleLink(a)}</summary><ul>${children}</ul></details>` : articleLink(a)}</li>`;
      }
      const root = model.articles.get(model.wiki.universe_id);
      html += `<h2>Canvas connections</h2><ul>${root ? model.connections(root.id, { editor: edit, outgoing: true }).map(g => graph(g.article, new Set([root.id]))).join('') : ''}</ul>`;
      const visitedGroups = new Set();
      function group(g, trail = new Set()) {
        if (trail.has(g.id)) return '';
        visitedGroups.add(g.id);
        const path = new Set([...trail, g.id]);
        const children = model.groups.filter(c => c.parent_group_id === g.id).map(c => group(c, path)).join('');
        const articles = [...model.articles.values()].filter(a => a.groupId === g.id && visible(a));
        return `<li><details open><summary>${esc(g.name)}</summary><ul>${children}${articles.map(a => `<li>${articleLink(a)}</li>`).join('')}</ul></details></li>`;
      }
      const roots = model.groups.filter(g => !g.parent_group_id || !model.groups.some(p => p.id === g.parent_group_id));
      if (model.groups.length) html += `<h2>Groups</h2><ul>${roots.map(g => group(g)).join('')}${model.groups.filter(g => !visitedGroups.has(g.id)).map(g => group(g)).join('')}</ul>`;
    }
    // This index is intentionally complete, including unconnected and ungrouped articles.
    const all = [...model.articles.values()].filter(a => !a.isRoot && visible(a));
    html += `<h2>${edit ? 'All articles (including hidden)' : 'All articles'}</h2><ul>${all.map(a => `<li>${articleLink(a)}</li>`).join('')}</ul>`;
    if (edit && model.wiki.kind === 'standalone') html += `<div class="lexicon-actions">${button('new-article','Create article')}${button('navigation','Edit navigation')}</div>`;
    nav.innerHTML = html;
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
    return esc(C.text(field.value));
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
    if (!a) return `<section class="lexicon-article"><h2>${esc(model.wiki.name)}</h2><p>${model.articles.size ? 'Select an article.' : 'No articles yet.'}</p></section>`;
    if (a.hidden) return '<section class="lexicon-article"><p>This article is hidden in this wiki.</p></section>';
    const body = model.visibleFields(a, 'body');
    const connections = model.connections(a.id);
    const info = infobox(a);
    return `<div class="lexicon-reader${info ? '' : ' is-single'}">
      <article class="lexicon-article"><h2>${esc(a.title)}</h2><div class="lexicon-prose">${esc(a.introduction)}</div>
        ${model.visibleFields(a, 'body', null).length ? `<section><h3>Details</h3>${fieldsMarkup(body.filter(f => !f.sectionId))}</section>` : ''}
        ${a.sections.filter(s => !s.hidden && body.some(f => f.sectionId === s.id)).map(s => `<section><h3>${esc(s.label)}</h3>${fieldsMarkup(body.filter(f => f.sectionId === s.id))}</section>`).join('')}
        ${connections.length ? `<section><h3>Connections</h3><ul class="lexicon-connections">${connections.map(g => `<li data-connection-target="${esc(g.article.id)}">${articleLink(g.article)}<ul>${[...new Set(g.relations.map(r => `${r.relativeDirection}: ${r.label || 'Connection'}`))].map(r => `<li>${esc(r)}</li>`).join('')}</ul></li>`).join('')}</ul></section>` : ''}
      </article>
      ${info}
    </div>`;
  }
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
      ${property(f,'label','Field label')}${property(f,'value','Field value',valueOptions)}
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
    return `<section class="lexicon-editor"><h2>Wiki Editor: ${esc(a.title)}</h2>
      <section class="lexicon-editor-section">${property(a,'title','Article title')}${property(a,'introduction','Introduction',{multiline:true})}${property(a,'hidden','Hide article',{boolean:true})}</section>
      ${a.sections.map(s => `<section class="lexicon-editor-section" data-edit-section="${esc(s.id)}"><h3>${esc(s.label)}${s.hidden ? ' (hidden)' : ''}</h3>
        ${property(s,'label','Section label')}${property(s,'sort_order','Section order',{number:true})}${property(s,'hidden','Hide section',{boolean:true})}
        ${a.fields.filter(f => f.sectionId === s.id).map(fieldEditor).join('')}
        ${model.wiki.kind === 'standalone' ? button('new-field','Add field',`data-section="${esc(s.id)}"`) : ''}</section>`).join('')}
      ${a.fields.filter(f => !f.sectionId).length ? `<section class="lexicon-editor-section"><h3>Custom fields</h3>${a.fields.filter(f => !f.sectionId).map(fieldEditor).join('')}</section>` : ''}
      ${model.wiki.kind === 'standalone' ? button('new-section','Add section') : ''}${connectionEditor(a)}</section>`;
  }
  function render({ navigation = true } = {}) {
    propertyForms = new Map();
    const a = model.articles.get(articleId || model.wiki.universe_id);
    document.querySelector('#wiki-title').textContent = model.wiki.name;
    document.title = `${edit ? 'Wiki Editor' : model.wiki.name} | Lexicon`;
    actions.innerHTML = `<a class="secondary-action" href="${url(articleId, !edit)}">${edit ? 'View wiki page' : 'Customize wiki page'}</a>${button('refresh',model.wiki.kind === 'universe' ? 'Reload source' : 'Reload wiki')}`;
    if (model.wiki.kind === 'universe') {
      if (a && !a.isRoot) actions.innerHTML += `<a class="secondary-action" href="chronicle-editor.html#universe/${encodeURIComponent(model.wiki.universe_id)}/element/${encodeURIComponent(a.id)}">Edit source</a>`;
      actions.innerHTML += `<a class="secondary-action" href="universe-canvas.html?universe_id=${encodeURIComponent(model.wiki.universe_id)}">${a?.isRoot ? 'Edit source' : 'Edit graph and groups'}</a>`;
    }
    if (navigation) renderNavigation();
    for (const link of nav.querySelectorAll('a')) {
      const targetId = new URL(link.href).searchParams.get('article') || model.wiki.universe_id || '';
      if (targetId === (articleId || model.wiki.universe_id || '')) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
    if (articleId && !a) content.innerHTML = '<section class="lexicon-article"><p>Article not found or no longer accessible.</p></section>';
    else content.innerHTML = edit ? editor(a) : reader(a);
  }
  async function load({preserveDraftsExcept} = {}) {
    const version = ++loadVersion, ownerStore = store;
    const loaded = await ownerStore.load(wikiId,{includeImages:false});
    if (version !== loadVersion || ownerStore !== store) return;
    data = loaded;
    const drafts = preserveDraftsExcept ? collectDrafts(preserveDraftsExcept) : null;
    model = C.build(data); render();
    if (drafts) restoreDrafts(drafts);
    status.textContent = '';
    if (data.wiki.kind === 'universe') loadImages(ownerStore,loaded,version);
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
    } catch(error) {
      if (version === loadVersion && ownerStore === store && !busy) status.textContent = `Images unavailable: ${error.message}`;
    }
  }
  function localRoute(href) {
    const target = new URL(href,location.href);
    if (target.origin !== location.origin || target.pathname !== location.pathname || target.hash || target.searchParams.get('wiki') !== wikiId) return null;
    return {href:target.href,article:target.searchParams.get('article') || '',edit:target.searchParams.get('edit') === '1'};
  }
  function showRoute(target, scroll = 0) {
    const changedMode = edit !== target.edit;
    articleId = target.article; edit = target.edit;
    render({navigation:changedMode});
    status.textContent = '';
    window.scrollTo(0,scroll);
    const heading = content.querySelector('h2') || content;
    heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true});
  }
  document.querySelector('main').addEventListener('click',event=>{
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const target = localRoute(link.href);
    if (!target || !model || busy || dialog.open) return;
    event.preventDefault();
    history.replaceState({...history.state,lexiconScroll:window.scrollY},'',location.href);
    if (target.href !== location.href) history.pushState({lexiconScroll:0},'',target.href);
    showRoute(target);
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
    propertyForms.clear(); content.replaceChildren(); nav.replaceChildren(); actions.replaceChildren(); dialog.close();
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
      event.preventDefault(); const form = event.currentTarget; const b = form.querySelector('[type="submit"]'); b.disabled = true;
      const values = Object.fromEntries(new FormData(form));
      try { await submit(values); dialog.close(); await load(); }
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
    const control = event.target.closest('[data-action]');
    if (!control) return;
    const a = model?.articles.get(articleId || model.wiki.universe_id);
    const action = control.dataset.action;
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
    } catch(error) { status.textContent=error.message; document.querySelector('#wiki-title').textContent='Lexicon'; }
  })();
})();
