(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LexiconData = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const writes = new Set(['lexicon_wikis','lexicon_articles','lexicon_navigation','lexicon_sections','lexicon_fields','lexicon_links']);
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
    async home() {
      const wikis = await this.rows('lexicon_wikis', { user_id: this.user.id });
      const universes = await this.forIds('universes', 'id', wikis.map(w => w.universe_id), { user_id: this.user.id, deleted: false }, 'id,name,description');
      return wikis.map(w => ({ ...w, universe: universes.find(u => u.id === w.universe_id) }));
    }
    async load(wikiId, { includeImages = true } = {}) {
      const wiki = (await this.rows('lexicon_wikis', { id: wikiId, user_id: this.user.id }))[0];
      if (!wiki) throw new Error('Wiki not found or access denied.');
      const data = { wiki, images: [] };
      if (wiki.kind === 'standalone') {
        [data.overrides, data.links, data.articles, data.navigation, data.sections, data.fields] = await Promise.all(
          ['overrides','links','articles','navigation','sections','fields'].map(name => this.rows(`lexicon_${name}`, { wiki_id: wiki.id })));
        return data;
      }
      let universes;
      [data.overrides, data.links, universes] = await Promise.all([
        this.rows('lexicon_overrides', { wiki_id: wiki.id }),
        this.rows('lexicon_links', { wiki_id: wiki.id }),
        this.rows('universes', { id: wiki.universe_id || '', user_id: this.user.id, deleted: false }, 'id,name,description'),
      ]);
      data.universe = universes[0];
      if (!data.universe) throw new Error('The source universe is unavailable.');
      [data.elements, data.groups, data.sourceLinks, data.universeFields] = await Promise.all([
        this.rows('elements', { universe_id: wiki.universe_id, user_id: this.user.id, deleted: false }, 'id,name,description,element_type_id,group_id'),
        this.rows('element_groups', { universe_id: wiki.universe_id, deleted: false }, 'id,name,parent_group_id'),
        this.rows('element_links', { universe_id: wiki.universe_id, deleted: false }, 'id,source_element_id,target_element_id,label,created_at'),
        this.rows('universe_custom_fields', { universe_id: wiki.universe_id, deleted: false }, 'id,universe_id,name,value,sort_order'),
      ]);
      const ids = data.elements.map(e => e.id);
      [data.modules, data.values, data.customFields, data.types] = await Promise.all([
        this.forIds('chronicle_modules', 'element_id', ids, { user_id: this.user.id, module_type: 'template_section', deleted: false }, 'id,element_id,module_type,data,sort_order'),
        this.forIds('element_template_field_values', 'element_id', ids, { deleted: false }, 'id,element_id,template_field_id,value'),
        this.forIds('element_custom_fields', 'element_id', ids, { deleted: false }, 'id,element_id,name,value,sort_order'),
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
    async save(table, row) {
      if (!writes.has(table) || table === 'lexicon_wikis') throw new Error('Unsupported content table.');
      return checked(await this.client.from(table).upsert(row, { onConflict: 'id' }).select().single());
    }
    async patch(table, wikiId, id, property, value) {
      if (!writes.has(table)) throw new Error('Unsupported content table.');
      if (!['name','title','introduction','label','sort_order','hidden','value','placement','parent_id','field_type'].includes(property)) throw new Error('Unsupported property.');
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
  }
  return { Store, checked };
});
