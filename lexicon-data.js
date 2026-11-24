(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LexiconData = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const writes = new Set(['lexicon_wikis','lexicon_articles','lexicon_navigation','lexicon_sections','lexicon_fields','lexicon_links','lexicon_annotations','lexicon_facts','lexicon_aliases','lexicon_detail_groups']);
  function checked(response) {
    if (response.error) {
      if (['42P01','PGRST205'].includes(response.error.code)) throw new Error('Lexicon database setup is required. Apply the Lexicon migration.');
      throw new Error(response.error.message || 'The request failed. Try again.');
    }
    return response.data;
  }
  class Store {
    constructor(client, user) { this.client = client; this.user = user; }
    async rows(table, filters = {}, columns = '*') {
      const result = [];
      for (let offset = 0; ; offset += 200) {
        let q = this.client.from(table).select(columns);
        for (const [name, value] of Object.entries(filters)) q = Array.isArray(value) ? q.in(name, value) : q.eq(name, value);
        // Overrides have a composite primary key rather than an id column.
        q = table === 'lexicon_overrides' ? q.order('subject_type').order('article_id').order('subject_id').order('property') : q.order('id');
        const rows = checked(await q.range(offset, offset + 199)) || [];
        result.push(...rows);
        if (rows.length < 200) return result;
      }
    }
    async forIds(table, column, ids, filters = {}, columns = '*') {
      const result = [];
      const unique = [...new Set(ids.filter(Boolean))];
      for (let i = 0; i < unique.length; i += 60) result.push(...await this.rows(table, { ...filters, [column]: unique.slice(i, i + 60) }, columns));
      return result;
    }
    async images(wikiId, objectIds) {
      const images = [];
      for (let i = 0; i < objectIds.length; i += 100) {
        const result = checked(await this.client.functions.invoke('lexicon-images', { body: { wikiId, objectIds: objectIds.slice(i, i + 100) } }));
        images.push(...(result?.images || []));
      }
      return images;
    }
    async universes() { return this.rows('universes', { user_id: this.user.id, deleted: false }, 'id,name,description'); }
    async elementTypes() { return this.rows('element_types', { user_id: this.user.id, deleted: false }, 'id,name'); }
    async createLinkedPage({wikiId,pageId,annotation,title,elementType,introduction}) {
      return checked(await this.client.rpc('lexicon_create_linked_page',{
        p_wiki_id:wikiId,p_page_id:pageId,p_annotation_id:annotation.id,
        p_source_article:annotation.article_id,p_subject_type:annotation.subject_type,
        p_subject_id:annotation.subject_id,p_property:annotation.property,p_anchor:annotation.anchor,
        p_title:title,p_element_type:elementType||null,p_introduction:introduction||''
      }));
    }
    async home() {
      const wikis = await this.rows('lexicon_wikis', { user_id: this.user.id });
      const universes = await this.forIds('universes', 'id', wikis.map(w => w.universe_id), { user_id: this.user.id, deleted: false }, 'id,name,description');
      return wikis.map(w => ({ ...w, universe: universes.find(u => u.id === w.universe_id) }));
    }
    async articleDetails(universeId, articleId) {
      if (!universeId) return [];
      const wikis = await this.rows('lexicon_wikis', { user_id:this.user.id, kind:'universe', universe_id:universeId });
      const facts = await this.forIds('lexicon_facts', 'wiki_id', wikis.map(w=>w.id), { article_id:articleId, placement:'infobox' });
      const [groups,members] = await Promise.all(['lexicon_detail_groups','lexicon_detail_group_items'].map(table=>this.forIds(table,'wiki_id',wikis.map(w=>w.id),{article_id:articleId})));
      const relationships = facts.filter(f=>f.kind==='relationship');
      const [sourceLinks,wikiLinks] = await Promise.all([
        this.forIds('element_links','id',relationships.filter(f=>f.reference.subject_type==='source_link').map(f=>f.reference.subject_id),{universe_id:universeId,deleted:false}),
        this.forIds('lexicon_links','id',relationships.filter(f=>f.reference.subject_type==='wiki_link').map(f=>f.reference.subject_id),{wiki_id:wikis.map(w=>w.id)})
      ]);
      const targets = new Map();
      for (const fact of relationships) {
        const link = fact.reference.subject_type==='source_link'
          ? sourceLinks.find(l=>l.id===fact.reference.subject_id)
          : wikiLinks.find(l=>l.id===fact.reference.subject_id&&l.wiki_id===fact.wiki_id);
        const source=link?.source_element_id||link?.source_id, target=link?.target_element_id||link?.target_id;
        if(source===articleId||target===articleId)targets.set(fact.id,source===articleId?target:source);
      }
      const [elements,universes] = await Promise.all([
        this.forIds('elements','id',[...targets.values(),...facts.filter(f=>f.kind==='links').flatMap(f=>f.reference.links.map(l=>l.article_id))],{user_id:this.user.id,universe_id:universeId,deleted:false},'id,name'),
        facts.some(f=>['relationship','links'].includes(f.kind)) ? this.rows('universes',{id:universeId,user_id:this.user.id,deleted:false},'id,name') : []
      ]);
      const names = new Map([...elements,...universes].map(e=>[e.id,e.name]));
      return facts.map(row=>{
        const value = row.kind==='excerpt' ? row.reference.anchor?.quote||'' : row.kind==='relationship' ? names.get(targets.get(row.id))||'' : row.kind==='links' ? row.reference.links.map(l=>l.text??(l.label||names.get(l.article_id)||'Unavailable article')).join('\n') : row.value;
        const displayValue = typeof value==='string' ? value : value==null ? '' : JSON.stringify(value);
        return {id:'wiki-fact:'+row.id,name:row.label,value:displayValue,sort_order:row.sort_order,chronicle_module_id:null,
          wikiDetail:{...row,wikiName:wikis.find(w=>w.id===row.wiki_id).name,displayValue,groupName:groups.find(g=>g.id===members.find(m=>m.wiki_id===row.wiki_id&&m.subject_type==='wiki_fact'&&m.subject_id===row.id)?.group_id)?.label||''}};
      });
    }
    async saveArticleDetail(field) {
      const original=field.wikiDetail;
      const changedValue=field.value!==original.displayValue;
      const patch={label:field.name??'',sort_order:Number(field.sort_order||0)};
      if(changedValue)Object.assign(patch,{kind:'fact',value:field.value,reference:{}});
      if(!changedValue&&patch.label===original.label&&patch.sort_order===original.sort_order)return original;
      const row=checked(await this.client.from('lexicon_facts').update(patch).eq('wiki_id',original.wiki_id)
        .eq('article_id',original.article_id).eq('id',original.id).select().single());
      return {...row,wikiName:original.wikiName,groupName:original.groupName,displayValue:field.value};
    }
    async setDetailGroup(wikiId,articleId,subject,groupId) {
      const identity={wiki_id:wikiId,article_id:articleId,subject_type:subject.type,subject_id:String(subject.id)};
      if(groupId)return checked(await this.client.from('lexicon_detail_group_items').upsert({...identity,group_id:groupId},{onConflict:'wiki_id,article_id,subject_type,subject_id'}));
      let q=this.client.from('lexicon_detail_group_items').delete();for(const [key,value]of Object.entries(identity))q=q.eq(key,value);return checked(await q);
    }
    async saveDetail(row,groupId='') {
      return checked(await this.client.rpc('lexicon_save_detail',{p_detail:row,p_group_id:groupId||null}));
    }
    async load(wikiId, { includeImages = true, onOverview } = {}) {
      const wiki = (await this.rows('lexicon_wikis', { id: wikiId, user_id: this.user.id }))[0];
      if (!wiki) throw new Error('Wiki not found or access denied.');
      const data = { wiki, images: [] };
      const annotations = Promise.all(['annotations','facts','aliases','media','detail_groups','detail_group_items'].map(name=>this.rows(`lexicon_${name}`,{wiki_id:wiki.id})));
      if (wiki.kind === 'standalone') {
        const [common,parts] = await Promise.all([annotations,Promise.all(
          ['overrides','links','articles','navigation','sections','fields'].map(name => this.rows(`lexicon_${name}`, { wiki_id: wiki.id })))]);
        [data.annotations,data.facts,data.aliases,data.media,data.detailGroups,data.detailGroupItems]=common;
        [data.overrides,data.links,data.articles,data.navigation,data.sections,data.fields]=parts;
        return data;
      }
      let universes;
      let common;
      [common,data.overrides, data.links, universes,data.elements,data.groups,data.sourceLinks,data.universeFields] = await Promise.all([
        annotations,
        this.rows('lexicon_overrides', { wiki_id: wiki.id }),
        this.rows('lexicon_links', { wiki_id: wiki.id }),
        this.rows('universes', { id: wiki.universe_id || '', user_id: this.user.id, deleted: false }, 'id,name,description'),
        this.rows('elements', { universe_id: wiki.universe_id, user_id: this.user.id, deleted: false }, 'id,name,description,body,element_type_id,group_id'),
        this.rows('element_groups', { universe_id: wiki.universe_id, deleted: false }, 'id,name,parent_group_id'),
        this.rows('element_links', { universe_id: wiki.universe_id, deleted: false }, 'id,source_element_id,target_element_id,label,created_at'),
        this.rows('universe_custom_fields', { universe_id: wiki.universe_id, deleted: false }, 'id,universe_id,name,value,sort_order'),
      ]);
      [data.annotations,data.facts,data.aliases,data.media,data.detailGroups,data.detailGroupItems]=common;
      data.universe = universes[0];
      if (!data.universe) throw new Error('The source universe is unavailable.');
      // Show only fresh, authorized source prose after wiki visibility overrides arrive.
      // No private article content is persisted in browser storage.
      onOverview?.({...data,modules:[],values:[],customFields:[],types:[],templateSections:[],templateFields:[]});
      const ids = data.elements.map(e => e.id);
      [data.modules, data.values, data.customFields, data.types] = await Promise.all([
        this.forIds('chronicle_modules', 'element_id', ids, { user_id: this.user.id, module_type: 'template_section', deleted: false }, 'id,element_id,module_type,data,sort_order'),
        this.forIds('element_template_field_values', 'element_id', ids, { deleted: false }, 'id,element_id,template_field_id,value'),
        this.forIds('element_custom_fields', 'element_id', ids, { deleted: false }, 'id,element_id,name,value,sort_order,chronicle_module_id'),
        this.forIds('element_types', 'id', data.elements.map(e => e.element_type_id), { user_id: this.user.id, deleted: false }, 'id,name'),
      ]);
      const sectionIds = data.modules.map(m => m.data?.section_id);
      [data.templateSections, data.templateFields] = await Promise.all([
        this.forIds('element_template_sections', 'id', sectionIds, { deleted: false }, 'id,name,sort_order,is_hidden'),
        this.forIds('element_type_template_fields', 'section_id', sectionIds, { deleted: false }, 'id,section_id,label,field_key,field_type,sort_order,is_hidden'),
      ]);
      if (includeImages) {
        try { data.images = await this.images(wiki.id, [wiki.universe_id, ...ids]); }
        catch (error) { data.imageError = error.message; }
      }
      return data;
    }
    async createWiki(row) {
      return checked(await this.client.from('lexicon_wikis').upsert({ ...row, user_id: this.user.id }, { onConflict: 'id' }).select().single());
    }
    async deleteWiki(wikiId) {
      if (!wikiId || !this.user?.id) throw new Error('Select a wiki to delete.');
      return checked(await this.client.from('lexicon_wikis').delete().eq('id', wikiId).eq('user_id', this.user.id).select('id').maybeSingle());
    }
    async save(table, row) {
      if (!writes.has(table) || table === 'lexicon_wikis') throw new Error('Unsupported content table.');
      return checked(await this.client.from(table).upsert(row, { onConflict: 'id' }).select().single());
    }
    async patch(table, wikiId, id, property, value) {
      if (!writes.has(table)) throw new Error('Unsupported content table.');
      if (!['name','title','introduction','body','label','sort_order','hidden','value','placement','parent_id','field_type','alias'].includes(property)) throw new Error('Unsupported property.');
      let query = this.client.from(table).update({ [property]: value }).eq('id', id);
      query = table === 'lexicon_wikis' ? query.eq('user_id', this.user.id) : query.eq('wiki_id', wikiId);
      return checked(await query.select().single());
    }
    async override(wikiId, item, property, value, reset = false) {
      const identity = { wiki_id: wikiId, subject_type: item.subjectType, article_id: item.articleId, subject_id: item.id, property };
      if (reset) {
        let q = this.client.from('lexicon_overrides').delete();
        for (const [name, val] of Object.entries(identity)) q = q.eq(name, val);
        checked(await q); return;
      }
      checked(await this.client.from('lexicon_overrides').upsert({ ...identity, value }, { onConflict: 'wiki_id,subject_type,article_id,subject_id,property' }));
    }
    async deleteLink(wikiId, id) {
      checked(await this.client.from('lexicon_links').delete().eq('wiki_id', wikiId).eq('id', id));
    }
    async remove(table,wikiId,id) {
      if(!['lexicon_annotations','lexicon_facts','lexicon_aliases','lexicon_navigation','lexicon_detail_groups'].includes(table))throw new Error('Unsupported deletion.');
      checked(await this.client.from(table).delete().eq('wiki_id',wikiId).eq('id',id));
    }
    async mediaAction(wikiId,action,values={}) {
      return checked(await this.client.functions.invoke('lexicon-media',{body:{wikiId,action,...values}}));
    }
    async uploadMedia(wikiId,id,file) {
      const body=new FormData();body.append('wikiId',wikiId);body.append('id',id);body.append('file',file);
      return checked(await this.client.functions.invoke('lexicon-media',{body}));
    }
  }
  return { Store, checked };
});
