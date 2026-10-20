/* User-defined Movie Tracker fields. Values are edited only in Edit Movie. */
window.createMovieCustomFields = function ({ supabase, getUser, getSort, setSort, refresh }) {
  const types = { checkbox: 'Checkbox', text: 'Short text', long_text: 'Long text', number: 'Number', date: 'Date', dropdown: 'Dropdown' };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let fields = [], filters = {}, signature = '', busy = false, importMap = {};
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop'; modal.id = 'movie-fields-modal'; modal.hidden = true;
  modal.innerHTML = `<section class="modal-dialog movie-fields-dialog" role="dialog" aria-modal="true" aria-labelledby="movie-fields-title">
    <button class="modal-close movie-floating-close" type="button" data-fields-close aria-label="Close Manage Fields">×</button>
    <h2 id="movie-fields-title">Manage Fields</h2>
    <p class="movie-collection-help">Fields belong to your movie library. Edit their values in Edit Movie. Hidden columns remain available in movie details and filters.</p>
    <div data-field-list></div>
    <form data-field-form class="movie-form-grid">
      <h3 class="movie-span" data-field-form-title>Add field</h3>
      <label class="form-field movie-span"><span>Optional preset</span><select data-field-preset><option value="">Custom field</option><option>Watched</option><option>Downloaded</option><option>Hated</option><option>Review</option></select></label>
      <input type="hidden" name="id">
      <label class="form-field"><span>Name</span><input name="name" required maxlength="80"></label>
      <label class="form-field"><span>Type</span><select name="field_type">${Object.entries(types).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>
      <label class="form-field movie-span" data-field-options hidden><span>Dropdown choices (one per line)</span><textarea name="options" rows="4"></textarea></label>
      <label class="checkbox-field movie-span"><input type="checkbox" name="visible" checked>Show as a column / on mobile cards</label>
      <label class="checkbox-field movie-span" data-copy-downloaded hidden><input type="checkbox" name="copy_downloaded">Copy previously stored Downloaded values</label>
      <p class="movie-collection-help movie-span">A field's type cannot be changed after creation. Create a new field for a different type.</p>
      <div class="dialog-actions movie-span"><button type="button" class="secondary-action" data-field-reset>New field</button><button type="submit" class="primary-action">Add field</button></div>
    </form><p class="dialog-status" data-field-status role="status"></p>
  </section>`;
  document.body.append(modal);
  const form = modal.querySelector('form'), status = modal.querySelector('[data-field-status]');
  function formState() {
    const creating = !form.elements.id.value;
    form.elements.field_type.disabled = !creating || busy;
    form.querySelector('[data-field-preset]').disabled = !creating || busy;
    modal.querySelector('[data-field-options]').hidden = form.elements.field_type.value !== 'dropdown';
    modal.querySelector('[data-copy-downloaded]').hidden = !creating || form.elements.field_type.value !== 'checkbox' || form.elements.name.value.trim().toLowerCase() !== 'downloaded';
  }
  function resetForm() {
    form.reset(); form.elements.id.value = ''; form.elements.field_type.value = 'checkbox';
    modal.querySelector('[data-field-form-title]').textContent = 'Add field';
    form.querySelector('[type="submit"]').textContent = 'Add field'; formState();
  }
  function renderManager() {
    modal.querySelector('[data-field-list]').innerHTML = fields.length ? fields.map((f,i)=>`<div class="movie-field-row">
      <div><strong>${escape(f.name)}</strong><small>${types[f.field_type]} · ${f.visible?'Column visible':'Details only'}</small></div>
      <div class="movie-field-buttons"><button type="button" class="secondary-action" data-field-up="${f.id}" aria-label="Move ${escape(f.name)} up" ${i===0?'disabled':''}>↑</button><button type="button" class="secondary-action" data-field-down="${f.id}" aria-label="Move ${escape(f.name)} down" ${i===fields.length-1?'disabled':''}>↓</button><button type="button" class="secondary-action" data-field-edit="${f.id}">Edit</button><button type="button" class="danger-action" data-field-delete="${f.id}">Delete</button></div>
    </div>`).join('') : '<p class="movie-collection-help">No custom fields yet. Add your own or choose a preset below.</p>';
  }
  async function load() {
    const { data, error } = await supabase.from('movie_custom_fields').select('*').eq('user_id',getUser().id).order('sort_order',{ascending:true}).order('id',{ascending:true});
    if(error) throw error;
    fields = data || [];
    for(const id of Object.keys(filters)) if(!fields.some(f=>f.id===id)) delete filters[id];
    for(const f of fields) if(f.field_type==='dropdown' && filters[f.id]?.value && !f.options.includes(filters[f.id].value)) delete filters[f.id];
    if(getSort().startsWith('custom:') && !fields.some(f=>getSort().split(':')[1]===f.id)) setSort('title-asc',false);
  }
  async function manage(action, field) {
    const {data,error}=await supabase.rpc('manage_movie_custom_field',{p_action:action,p_field:field});
    if(error) throw error;
    return data;
  }
  async function run(action) {
    if(busy) return;
    busy=true; status.textContent='Saving…';
    modal.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=true;});
    try { await action(); await load(); await refresh(); renderManager(); resetForm(); status.textContent='Fields updated.'; }
    catch(error) { status.textContent=error.message || 'Could not save field.'; }
    finally { busy=false; modal.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=false;}); renderManager(); formState(); }
  }
  modal.addEventListener('click',event=>{
    if(busy) return;
    if(event.target===modal || event.target.closest('[data-fields-close]')) { modal.hidden=true; return; }
    if(event.target.closest('[data-field-reset]')) { resetForm(); status.textContent=''; return; }
    const button=event.target.closest('button'); if(!button) return;
    const id=button.dataset.fieldEdit || button.dataset.fieldDelete || button.dataset.fieldUp || button.dataset.fieldDown;
    const field=fields.find(f=>f.id===id); if(!field) return;
    if(button.dataset.fieldEdit) {
      form.elements.id.value=field.id; form.elements.name.value=field.name; form.elements.field_type.value=field.field_type;
      form.elements.options.value=field.options.join('\n'); form.elements.visible.checked=field.visible; form.elements.copy_downloaded.checked=false;
      modal.querySelector('[data-field-form-title]').textContent='Edit field'; form.querySelector('[type="submit"]').textContent='Save field';
      formState(); form.elements.name.focus(); return;
    }
    if(button.dataset.fieldDelete) {
      if(window.confirm(`Delete “${field.name}” and all its movie values? This cannot be undone. Hide its column instead to keep the data.`)) run(()=>manage('delete',{id}));
      return;
    }
    const ids=fields.map(f=>f.id), index=ids.indexOf(id), other=index+(button.dataset.fieldUp?-1:1);
    [ids[index],ids[other]]=[ids[other],ids[index]]; run(()=>manage('reorder',{ids}));
  });
  form.addEventListener('input',formState);
  form.addEventListener('change',event=>{
    if(event.target.matches('[data-field-preset]') && event.target.value) {
      form.elements.name.value=event.target.value; form.elements.field_type.value=event.target.value==='Review'?'long_text':'checkbox';
      form.elements.visible.checked=event.target.value!=='Review'; form.elements.copy_downloaded.checked=false;
    }
    formState();
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const field={id:form.elements.id.value,name:form.elements.name.value.trim(),field_type:form.elements.field_type.value,
      options:[...new Set(form.elements.options.value.split('\n').map(s=>s.trim()).filter(Boolean))],visible:form.elements.visible.checked,
      copy_downloaded:!modal.querySelector('[data-copy-downloaded]').hidden && form.elements.copy_downloaded.checked};
    if(!field.name || (field.field_type==='dropdown' && !field.options.length)) {status.textContent='Enter a name and at least one choice for dropdown fields.';return;}
    run(()=>manage(field.id?'update':'create',field));
  });
  document.querySelector('[data-manage-movie-fields]').addEventListener('click',()=>{
    if(busy) return;
    document.querySelector('[data-actions-menu]').hidden=true; document.querySelector('[data-actions-toggle]').setAttribute('aria-expanded','false');
    renderManager(); resetForm(); status.textContent=''; modal.hidden=false; form.elements.name.focus();
  });
  function display(field,value) {return field.field_type==='checkbox' ? (value===true?'Yes':'No') : value==null || value==='' ? 'Not set' : String(value);}
  function input(field,value) {
    const attrs=`name="custom_${field.id}" data-movie-custom-input="${field.id}"`;
    if(field.field_type==='checkbox') return `<input type="checkbox" ${attrs} ${value===true?'checked':''}>`;
    if(field.field_type==='dropdown') return `<select ${attrs}><option value="">Not set</option>${field.options.map(o=>`<option ${o===value?'selected':''} value="${escape(o)}">${escape(o)}</option>`).join('')}</select>`;
    if(field.field_type==='long_text') return `<textarea ${attrs} rows="4" maxlength="20000">${escape(value)}</textarea>`;
    return `<input ${attrs} type="${field.field_type==='number'?'number':field.field_type==='date'?'date':'text'}" ${field.field_type==='number'?'step="any"':'maxlength="500"'} value="${escape(value)}">`;
  }
  function parseValue(field,value,csv=false) {
    if(value==null || value==='') return undefined;
    if(field.field_type==='checkbox') {
      if(csv && /^(true|false|yes|no|1|0)$/i.test(value)) value=/^(true|yes|1)$/i.test(value);
      if(typeof value!=='boolean') throw new Error(`${field.name} must be Yes or No.`);
    } else if(field.field_type==='number') {
      if(csv) value=Number(value);
      if(typeof value!=='number' || !Number.isFinite(value)) throw new Error(`${field.name} must be a number.`);
    } else {
      if(typeof value!=='string') throw new Error(`${field.name} must be text.`);
      if(value.length>(field.field_type==='long_text'?20000:500)) throw new Error(`${field.name} is too long.`);
      if(field.field_type==='date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value)) throw new Error(`${field.name} must be a valid date.`);
      if(field.field_type==='dropdown' && !field.options.includes(value)) throw new Error(`${field.name} contains an unknown choice.`);
    }
    return value;
  }
  const filterHost=document.querySelector('[data-custom-field-filters]');
  function renderControls() {
    const next=JSON.stringify(fields);
    if(signature!==next) {
      signature=next;
      filterHost.hidden=!fields.length;
      filterHost.innerHTML=`<summary>Custom fields</summary><div class="movie-custom-filter-grid">${fields.map(f=>{
        const attrs=`data-custom-filter="${f.id}"`, current=filters[f.id] || {};
        if(f.field_type==='number' || f.field_type==='date') return `<fieldset><legend>${escape(f.name)}</legend><label>From<input type="${f.field_type==='date'?'date':'number'}" step="any" ${attrs} data-bound="min" value="${escape(current.min)}"></label><label>To<input type="${f.field_type==='date'?'date':'number'}" step="any" ${attrs} data-bound="max" value="${escape(current.max)}"></label></fieldset>`;
        const control=f.field_type==='checkbox' || f.field_type==='dropdown'
          ? `<select ${attrs}><option value="">Any</option>${(f.field_type==='checkbox'?['true','false']:f.options).map(v=>`<option value="${escape(v)}" ${current.value===v?'selected':''}>${f.field_type==='checkbox'?(v==='true'?'Yes':'No'):escape(v)}</option>`).join('')}</select>`
          : `<input type="search" ${attrs} placeholder="Contains…" value="${escape(current.value)}">`;
        return `<label>${escape(f.name)}${control}</label>`;
      }).join('')}<button type="button" class="secondary-action" data-clear-custom-filters>Clear custom filters</button></div>`;
      const sortOptions=fields.map(f=>['asc','desc'].map(d=>`<option data-custom-sort-option value="custom:${f.id}:${d}">${escape(f.name)}: ${d==='asc'?'ascending':'descending'}</option>`).join('')).join('');
      document.querySelector('[data-custom-field-sort]').innerHTML=`<option value="title-asc">Standard sorting</option>${sortOptions}`;
      document.querySelector('[data-custom-sort-label]').hidden=!fields.length;
      const mobile=document.querySelector('[data-movie-sort]'); mobile.querySelectorAll('[data-custom-sort-option]').forEach(el=>el.remove()); mobile.insertAdjacentHTML('beforeend',sortOptions);
    }
    document.querySelector('[data-custom-field-sort]').value=getSort().startsWith('custom:')?getSort():'title-asc';
    document.querySelector('[data-movie-sort]').value=getSort();
    const header=document.querySelector('.movie-table thead tr'); header.querySelectorAll('[data-custom-column]').forEach(el=>el.remove());
    const table=header.closest('table'), visibleCount=fields.filter(f=>f.visible).length;
    table.classList.toggle('has-custom-fields',visibleCount>0); table.style.setProperty('--movie-custom-columns',visibleCount);
    header.insertAdjacentHTML('beforeend',fields.filter(f=>f.visible).map(f=>`<th data-custom-column aria-sort="${getSort().startsWith(`custom:${f.id}:`)?(getSort().endsWith(':asc')?'ascending':'descending'):'none'}"><button type="button" class="movie-sort-header" data-custom-sort="${f.id}">${escape(f.name)} <ph-caret-up-down aria-hidden="true"></ph-caret-up-down></button></th>`).join(''));
  }
  filterHost.addEventListener('change',event=>{
    const el=event.target.closest('[data-custom-filter]'); if(!el || !el.checkValidity()) return;
    (filters[el.dataset.customFilter] ||= {})[el.dataset.bound || 'value']=el.value;
    setSort(getSort());
  });
  filterHost.addEventListener('click',event=>{if(event.target.closest('[data-clear-custom-filters]')) {filters={};signature='';renderControls();setSort(getSort());}});
  document.querySelector('[data-custom-field-sort]').addEventListener('change',event=>setSort(event.target.value));
  document.querySelector('.movie-table thead').addEventListener('click',event=>{
    const button=event.target.closest('[data-custom-sort]'); if(button) setSort(`custom:${button.dataset.customSort}:${getSort()===`custom:${button.dataset.customSort}:asc`?'desc':'asc'}`);
  });
  function applyFilters(query) {
    for(const field of fields) {
      const filter=filters[field.id]; if(!filter) continue;
      const path=`custom_values->>${field.id}`;
      if(field.field_type==='checkbox' && filter.value) query=filter.value==='true'?query.eq(path,'true'):query.or(`${path}.eq.false,${path}.is.null`);
      else if(field.field_type==='dropdown' && filter.value) query=query.eq(path,filter.value);
      else if(['number','date'].includes(field.field_type)) {
        const typed=field.field_type==='number'?`custom_values->${field.id}`:path;
        if(filter.min!==undefined && filter.min!=='') query=query.gte(typed,filter.min);
        if(filter.max!==undefined && filter.max!=='') query=query.lte(typed,filter.max);
      } else if(filter.value) query=query.ilike(path,`%${filter.value.replace(/[\\%_]/g,'\\$&')}%`);
    }
    return query;
  }
  async function importDefinitions(records,items) {
    importMap={};
    const definitions=records.custom_fields || [];
    if(!Array.isArray(definitions)) throw new Error('Custom field definitions must be an array.');
    const seen=new Set(), ids=new Set();
    for(const def of definitions) {
      if(!def || !/^f_[a-f0-9]{32}$/.test(def.id) || typeof def.name!=='string' || !def.name.trim() || def.name.trim().length>80 || !types[def.field_type] || seen.has(def.name.trim().toLowerCase()) || ids.has(def.id)) throw new Error('Invalid or duplicate custom field definition.');
      seen.add(def.name.trim().toLowerCase()); ids.add(def.id);
      if(!Array.isArray(def.options) || (def.field_type==='dropdown' && (!def.options.length || def.options.length>100 || def.options.some(v=>typeof v!=='string' || !v.trim() || v.length>500) || new Set(def.options).size!==def.options.length))) throw new Error(`Invalid choices for ${def.name}.`);
      const existing=fields.find(f=>f.name.toLowerCase()===def.name.trim().toLowerCase());
      if(existing && existing.field_type!==def.field_type) throw new Error(`“${def.name}” already exists with a different type.`);
    }
    // Validate every value before creating definitions or inserting movies.
    for(const item of items) {
      if(item.custom_fields!==undefined && (!item.custom_fields || Array.isArray(item.custom_fields) || typeof item.custom_fields!=='object')) throw new Error('Movie custom_fields must be an object.');
      for(const [id,value] of Object.entries(item.custom_fields || {})) {
        const def=definitions.find(f=>f.id===id) || fields.find(f=>f.id===id);
        if(!def) throw new Error('A movie references an unknown custom field.'); parseValue(def,value);
      }
      for(const [key,value] of Object.entries(item)) if(key.startsWith('custom:')) {
        const def=fields.find(f=>f.name.toLowerCase()===key.slice(7).trim().toLowerCase()) || definitions.find(f=>f.name.toLowerCase()===key.slice(7).trim().toLowerCase());
        if(!def) throw new Error(`Create the field “${key.slice(7)}” before importing this CSV.`); parseValue(def,value,true);
      }
    }
    for(const def of definitions) {
      let existing=fields.find(f=>f.name.toLowerCase()===def.name.trim().toLowerCase());
      if(!existing) {existing=await manage('create',def);fields.push(existing);}
      else if(def.field_type==='dropdown' && def.options.some(o=>!existing.options.includes(o))) {
        existing=await manage('update',{...existing,options:[...new Set([...existing.options,...def.options])]});
        fields=fields.map(f=>f.id===existing.id?existing:f);
      }
      importMap[def.id]=existing.id;
    }
  }
  return {
    isBusy:()=>busy,
    load, renderControls, applyFilters,
    applySort(query,sort) {const [,id,direction]=sort.split(':');return query.order(`custom_values->${id}`,{ascending:direction==='asc',nullsFirst:false}).order('title',{ascending:true}).order('id',{ascending:true});},
    visibleCount:()=>fields.filter(f=>f.visible).length,
    cells:movie=>fields.filter(f=>f.visible).map(f=>`<td class="movie-custom-cell" data-label="${escape(f.name)}"><span title="${escape(display(f,movie.custom_values?.[f.id]))}">${escape(display(f,movie.custom_values?.[f.id]))}</span></td>`).join(''),
    details:movie=>fields.map(f=>[f.name,display(f,movie.custom_values?.[f.id]),'Not set',f.field_type==='long_text'?'movie-detail-wide movie-custom-detail':'movie-custom-detail']),
    editMarkup:movie=>fields.length?`<h3 class="movie-span">Custom fields</h3>${fields.map(f=>`<label class="${f.field_type==='checkbox'?'checkbox-field':'form-field'} ${f.field_type==='long_text'?'movie-span':''}"><span>${escape(f.name)}</span>${input(f,movie.custom_values?.[f.id])}</label>`).join('')}`:'',
    readValues(data) {const values={};for(const f of fields) {const raw=f.field_type==='checkbox'?data.get(`custom_${f.id}`)==='on':data.get(`custom_${f.id}`);const v=parseValue(f,raw,f.field_type==='number');if(v!==undefined) values[f.id]=v;}return values;},
    exportDefinitions:()=>fields.map(({id,name,field_type,options,visible,sort_order})=>({id,name,field_type,options,visible,sort_order})),
    importDefinitions,
    importValues(item) {
      const values={};
      for(const [key,value] of Object.entries(item.custom_fields || {})) {const id=importMap[key] || key,f=fields.find(f=>f.id===id);const parsed=parseValue(f,value);if(parsed!==undefined) values[id]=parsed;}
      for(const [key,value] of Object.entries(item)) if(key.startsWith('custom:')) {const f=fields.find(f=>f.name.toLowerCase()===key.slice(7).trim().toLowerCase()), parsed=parseValue(f,value,true);if(parsed!==undefined) values[f.id]=parsed;}
      return values;
    }
  };
};
