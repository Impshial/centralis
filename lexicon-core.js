(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LexiconCore = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const active = rows => (rows || []).filter(row => !row.deleted);
  const order = (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.id).localeCompare(String(b.id));
  const overview = section => [section.label,section.base?.label].some(label=>String(label||'').trim().toLowerCase()==='overview');
  const sectionOrder = (a,b) => Number(overview(b))-Number(overview(a)) || order(a,b);
  const key = (type, article, subject, property) => JSON.stringify([type, String(article), String(subject), property]);
  const hasValue = value => richValue(value) && value !== null && value !== undefined &&
    (typeof value !== 'string' || value.trim() !== '') &&
    (!Array.isArray(value) || value.length > 0) &&
    (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 0);
  function richValue(value) {
    let doc=value;try{if(typeof doc==='string'&&doc.trim().startsWith('{'))doc=JSON.parse(doc);}catch{}
    if(doc?.type!=='doc')return true;
    const populated=n=>!!n.text?.trim()||(n.content||[]).some(populated);return populated(doc);
  }
  const text = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

  function build(data) {
    const overrides = new Map((data.overrides || []).map(row => [key(row.subject_type, row.article_id, row.subject_id, row.property), row.value]));
    function subject(type, articleId, id, base) {
      const item = { ...base, id: String(id), articleId: String(articleId), subjectType: type, base: { ...base }, overridden: {} };
      for (const property of Object.keys(base)) {
        const k = key(type, articleId, id, property);
        if (overrides.has(k)) { item[property] = overrides.get(k); item.overridden[property] = true; }
      }
      return item;
    }
    const wiki = data.wiki;
    const articles = new Map();
    const standalone = wiki.kind === 'standalone';
    let landing;
    if (!standalone && data.universe) {
      const u = data.universe;
      landing = subject('article', u.id, u.id, { title: u.name, introduction: u.description || '', hidden: false });
      articles.set(String(u.id), { ...landing, isRoot: true, sections: [], fields: [], type: '' });
    }
    for (const row of active(standalone ? data.articles : data.elements)) {
      const article = standalone
        ? { id: String(row.id), articleId: String(row.id), title: row.title, introduction: row.introduction, hidden: row.hidden, table: 'lexicon_articles', base: {}, overridden: {} }
        : subject('article', row.id, row.id, { title: row.name, introduction: row.description || '', body: row.body || '', hidden: false });
      article.groupId = row.group_id;
      article.type = standalone ? '' : (data.types || []).find(type => type.id === row.element_type_id)?.name || '';
      article.sections = []; article.fields = [];
      articles.set(article.id, article);
    }
    if (standalone) {
      for (const section of data.sections || []) {
        const a = articles.get(String(section.article_id));
        if (!a) continue;
        a.sections.push({ ...section, articleId: a.id, table: 'lexicon_sections', base: {}, overridden: {} });
      }
      for (const field of data.fields || []) {
        const a = articles.get(String(field.article_id));
        if (!a || !a.sections.some(s => s.id === field.section_id)) continue;
        a.fields.push({ ...field, sectionId: field.section_id, articleId: a.id, table: 'lexicon_fields', base: {}, overridden: {} });
      }
    } else {
      const values = new Map(active(data.values).map(v => [JSON.stringify([v.element_id, v.template_field_id]), v.value]));
      for (const m of active(data.modules).sort(order)) {
        const a = articles.get(String(m.element_id));
        const s = active(data.templateSections).find(s => s.id === m.data?.section_id);
        if (!a || !s || m.module_type !== 'template_section') continue;
        const section = subject('section', a.id, m.id, { label: s.name, sort_order: m.sort_order, hidden: !!s.is_hidden });
        a.sections.push(section);
        for (const f of active(data.templateFields).filter(f => f.section_id === s.id).sort(order)) {
          if (a.fields.some(old => old.subjectType === 'template_field' && old.id === String(f.id))) continue;
          const field = subject('template_field', a.id, f.id, { label: f.label || f.field_key, value: values.get(JSON.stringify([a.id, f.id])) ?? '',
            sort_order: f.sort_order, hidden: !!f.is_hidden, placement: 'body' });
          a.fields.push({ ...field, sectionId: section.id, field_type: f.field_type });
        }
      }
      for (const [rows, type, ownerKey] of [[data.customFields, 'custom_field', 'element_id'], [data.universeFields, 'universe_field', 'universe_id']]) {
        for (const f of active(rows)) {
          const a = articles.get(String(f[ownerKey]));
          const sectionId = a?.sections.some(s => s.id === f.chronicle_module_id) ? f.chronicle_module_id : null;
          if (a) a.fields.push({ ...subject(type, a.id, f.id, { label: f.name, value: f.value, sort_order: f.sort_order, placement: sectionId ? 'body' : 'infobox', hidden: false }), field_type: 'text', sectionId });
        }
      }
    }
    for (const fact of data.facts || []) {
      const a = articles.get(fact.article_id);
      if (a) a.fields.push({...fact,articleId:a.id,sectionId:null,table:'lexicon_facts',field_type:'text',base:{},overridden:{}});
    }
    for (const a of articles.values()) {
      a.detailGroups=(data.detailGroups||[]).filter(g=>g.article_id===a.id).sort(order);
      for(const f of a.fields){
        const type=f.subjectType||(f.table==='lexicon_facts'?'wiki_fact':'standalone_field');
        const member=(data.detailGroupItems||[]).find(m=>m.article_id===a.id&&m.subject_type===type&&m.subject_id===f.id);
        f.group_id=a.detailGroups.some(g=>g.id===member?.group_id)?member.group_id:'';
      }
      a.aliases = (data.aliases || []).filter(x => x.article_id === a.id).map(x => x.alias);
      a.sections.sort(sectionOrder); a.fields.sort(order);
      a.image = (data.images || []).find(image => String(image.object_id) === a.id)?.image_url || '';
    }
    const links = [...active(data.sourceLinks).map(l => ({ id: l.id, subjectType: 'source_link', source_id: l.source_element_id, target_id: l.target_element_id, label: l.label || '', direction: 'directed' })),
      ...(data.links || []).map(l => ({ ...l, subjectType: 'wiki_link' }))]
      .filter(l => articles.has(String(l.source_id)) && articles.has(String(l.target_id)))
      .map(l => ({ ...l, ...subject(l.subjectType, '', l.id, { label: l.label, hidden: false }), source_id: String(l.source_id), target_id: String(l.target_id) }));
    function connections(articleId, { editor = false, outgoing = false } = {}) {
      const result = new Map();
      for (const link of links) {
        if (link.source_id !== articleId && link.target_id !== articleId) continue;
        if (outgoing && link.source_id !== articleId && link.direction !== 'both') continue;
        const target = link.source_id === articleId ? link.target_id : link.source_id;
        const destination = articles.get(target);
        const pageHidden = overrides.get(key(link.subjectType, articleId, link.id, 'page_hidden')) === true;
        if (!editor && (link.hidden || pageHidden || destination.hidden)) continue;
        const group = result.get(target) || { article: destination, relations: [] };
        group.relations.push({ ...link, pageHidden, relativeDirection: link.direction === 'both' ? 'Both directions' : link.source_id === articleId ? 'Outgoing' : 'Incoming' });
        result.set(target, group);
      }
      return [...result.values()];
    }
    function visibleFields(article, placement, sectionId) {
      return article.fields.filter(f => !f.hidden && hasValue(f.value) && f.placement === placement &&
        (!f.sectionId || !article.sections.find(s => s.id === f.sectionId)?.hidden) &&
        (sectionId === undefined || f.sectionId === sectionId));
    }
    const groups = active(data.groups), navigation = data.navigation || [];
    function breadcrumbs(id) {
      const a = articles.get(id); if (!a || a.hidden) return [];
      let path = [], seen = new Set([id]);
      if (standalone) {
        let n = navigation.filter(n => n.article_id === id).sort(order)[0];
        const entries = new Set(n ? [n.id] : []);
        while (n?.parent_id) {
          n = navigation.find(p => p.id === n.parent_id);
          if (!n || entries.has(n.id)) break;
          entries.add(n.id);
          const parent = articles.get(n.article_id);
          if (!parent?.hidden) path.unshift({id:parent?.id || null,label:n.label});
        }
      } else if (a.groupId) {
        let g = groups.find(g => g.id === a.groupId);
        while (g && !seen.has(g.id)) {seen.add(g.id);path.unshift({id:null,label:g.name});g=groups.find(p=>p.id===g.parent_group_id);}
      } else {
        let child = id;
        while (child) {
          const parent = links.filter(l => !l.hidden && !overrides.get(key(l.subjectType,child,l.id,'page_hidden')) && l.direction !== 'both' && l.target_id === child && /^(contains|includes|parent of)$/i.test(l.label.trim()) && !articles.get(l.source_id)?.hidden).sort((x,y)=>x.source_id.localeCompare(y.source_id)||x.id.localeCompare(y.id))[0];
          if (!parent || seen.has(parent.source_id)) break;
          seen.add(parent.source_id);const p=articles.get(parent.source_id);
          if (!p.isRoot) path.unshift({id:p.id,label:p.title});child=p.id;
        }
      }
      const homeId=wiki.universe_id && articles.get(wiki.universe_id)?.hidden ? null : wiki.universe_id || '';
      return [...(a.isRoot ? [] : [{id:homeId,label:'Wiki home'}]),...path,{id:a.id,label:a.title}];
    }
    const plain = value => {
      let v=value;try {if(typeof v==='string' && v.trim().startsWith('{'))v=JSON.parse(v);}catch{}
      if(v?.type==='doc') {const walk=n=>n.text || (n.content || []).map(walk).join(n.type==='doc'?' ':'');return walk(v);}
      return text(value).replace(/<[^>]+>/g,' ').replace(/[#*_`]/g,'');
    };
    function search(query) {
      const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);if(!terms.length)return [];
      return [...articles.values()].filter(a=>!a.hidden).map(a=>{
        const body=visibleFields(a,'body'), facts=visibleFields(a,'infobox');
        const parts=[{text:[a.title,...a.aliases].join(' '),score:100},{text:plain(a.introduction),score:30},{text:plain(a.body),score:20},
          ...a.sections.filter(s=>!s.hidden && (hasValue(s.body)||body.some(f=>f.sectionId===s.id))).map(s=>({text:s.label+' '+plain(s.body)+' '+body.filter(f=>f.sectionId===s.id).map(f=>f.label+' '+plain(f.value)).join(' '),score:15,section:s.id})),
          ...[...body.filter(f=>!f.sectionId),...facts].map(f=>({text:f.label+' '+plain(f.value),score:10}))];
        const joined=parts.map(p=>p.text).join(' ').toLocaleLowerCase();if(!terms.every(t=>joined.includes(t)))return null;
        const match=parts.filter(p=>terms.some(t=>p.text.toLocaleLowerCase().includes(t))).sort((x,y)=>y.score-x.score)[0];
        const at=match.text.toLocaleLowerCase().indexOf(terms[0]);
        return {article:a,score:match.score,section:match.section,snippet:match.text.slice(Math.max(0,at-55),Math.max(0,at-55)+190)};
      }).filter(Boolean).sort((x,y)=>y.score-x.score||x.article.title.localeCompare(y.article.title)||x.article.id.localeCompare(y.article.id));
    }
    return { wiki, articles, links, groups, navigation, connections, visibleFields, overrides, breadcrumbs, search, plain, annotations:data.annotations || [], media:data.media || [] };
  }
  return { build, hasValue, text, key, order };
});
