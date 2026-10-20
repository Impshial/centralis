// Browser-only database stand-in; real SQL constraints are tested separately.
const mock = `
window.centralisCurrentAppUser = { id: 42 };
window.centralisGetCurrentAppUser = async () => window.centralisCurrentAppUser;
const initialMovies = Array.from({length: 125}, (_, i) => ({
  id: i + 1, user_id: 42, deleted: false,
  title: i === 0 ? 'A Very Long Movie Title That Should Wrap Without Pushing Controls Off Screen' : 'Movie ' + String(i + 1).padStart(3, '0'),
  year_released: 1900 + i, director: 'A Director With A Long Name',
  writers: 'Writer One, Writer Two', actors: 'Actor One, Actor Two',
  plot: 'A long plot description. '.repeat(50),
  franchise_id: i % 2 ? 1 : null,
  collection_ids: [[1,2], [1], [2], []][i % 4],
  franchise: i % 2 ? {id: 1, name: 'A long franchise name that wraps on phones'} : null,
  poster_url: null
}));
const movieTestTables = JSON.parse(localStorage.getItem('movie-test-tables') || 'null') || {
  movies: initialMovies,
  franchise: [{id:1,user_id:42,deleted:false,name:'A long franchise name that wraps on phones'}],
  collections: [{id:1,user_id:42,deleted:false,name:'Favorites'}, {id:2,user_id:42,deleted:false,name:'Watch Again'}]
};
window.movieTestWrites = [];
movieTestTables.movie_custom_fields ||= [];
const fieldValue = (row,key) => {
  if(!key.includes('->')) return row[key];
  const value=row.custom_values?.[key.split(/->>?/)[1]];
  return value==null ? null : key.includes('->>') ? String(value) : value;
};
window.centralisSupabase = {
  async rpc(name, args) {
    if(name==='save_movie_custom_records') {
      if(window.movieTestFailNextSave) {window.movieTestFailNextSave=false;return {error:{message:'Test save failed'}};}
      const data=[];
      for(const item of args.p_records) {
        let row;
        if(args.p_insert) {row={id:Math.max(0,...movieTestTables.movies.map(x=>x.id))+1,user_id:42,deleted:false,collection_ids:[],...item};movieTestTables.movies.push(row);}
        else {row=movieTestTables.movies.find(x=>x.id===item.id);Object.assign(row,item);}
        data.push(row);
      }
      window.movieTestWrites.push({rpc:name,args,table:'movies',mode:args.p_insert?'insert':'update',payload:args.p_insert?args.p_records:args.p_records[0]});
      localStorage.setItem('movie-test-tables',JSON.stringify(movieTestTables));return {data,error:null};
    }
    if(name==='manage_movie_custom_field') {
      if(window.movieTestFailNextSave) {window.movieTestFailNextSave=false;return {error:{message:'Test save failed'}};}
      const f=args.p_field, table=movieTestTables.movie_custom_fields; let row;
      if(args.p_action==='create') {
        row={id:'f_'+crypto.randomUUID().replaceAll('-',''),user_id:42,name:f.name,field_type:f.field_type,options:f.options,visible:f.visible,sort_order:table.length};table.push(row);
        if(f.copy_downloaded) movieTestTables.movies.forEach(m=>{m.custom_values={...m.custom_values,[row.id]:!!m.downloaded};});
      } else if(args.p_action==='update') {row=table.find(x=>x.id===f.id);Object.assign(row,{name:f.name,visible:f.visible,options:f.options});}
      else if(args.p_action==='delete') {movieTestTables.movie_custom_fields=table.filter(x=>x.id!==f.id);movieTestTables.movies.forEach(m=>{if(m.custom_values) delete m.custom_values[f.id];});}
      else f.ids.forEach((id,i)=>{table.find(x=>x.id===id).sort_order=i;});
      localStorage.setItem('movie-test-tables',JSON.stringify(movieTestTables));return {data:row || {},error:null};
    }
    if (name !== 'update_movie_memberships') throw new Error('Unexpected RPC');
    window.movieTestWrites.push({rpc:name,args});
    if (window.movieTestFailNextSave) { window.movieTestFailNextSave=false; return {error:{message:'Test save failed'},data:null}; }
    let changed=0;
    for (const movie of movieTestTables.movies.filter(row=>args.p_movie_ids.includes(row.id))) {
      const before=JSON.stringify([movie.collection_ids,movie.franchise_id]);
      const targets=args.p_target_ids;
      if (args.p_membership_type==='collection') {
        movie.collection_ids=args.p_operation==='add' ? [...new Set([...movie.collection_ids,...targets])] : movie.collection_ids.filter(id=>!targets.includes(id));
      } else if (args.p_operation==='add') movie.franchise_id=targets[0];
      else if (targets.includes(movie.franchise_id)) movie.franchise_id=null;
      movie.franchise=movieTestTables.franchise.find(row=>row.id===movie.franchise_id) || null;
      if (before!==JSON.stringify([movie.collection_ids,movie.franchise_id])) changed++;
    }
    localStorage.setItem('movie-test-tables',JSON.stringify(movieTestTables));
    return {data:changed,error:null};
  },
  from(table) {
    if(table==='movie_custom_records') table='movies';
    let rows = [...movieTestTables[table]], head = false, range = null, single = false, mode = 'read', payload;
    const orders = [];
    const execute = () => {
      if (mode !== 'read') {
        if (window.movieTestFailNextSave) { window.movieTestFailNextSave = false; return {error:{message:'Test save failed'},data:null}; }
        window.movieTestWrites.push({table,mode,payload:JSON.parse(JSON.stringify(payload))});
        if (mode === 'insert') {
          rows = (Array.isArray(payload) ? payload : [payload]).map(value => {
            const item = {id:Math.max(0,...movieTestTables[table].map(row=>row.id))+1,deleted:false,collection_ids:[],...value};
            movieTestTables[table].push(item); return item;
          });
        } else rows.forEach(row => Object.assign(row,payload));
        if (table === 'collections' && payload.deleted) {
          movieTestTables.movies.forEach(movie => { movie.collection_ids = movie.collection_ids.filter(id => !rows.some(row=>row.id===id)); });
        }
        localStorage.setItem('movie-test-tables', JSON.stringify(movieTestTables));
      }
      rows.sort((a,b) => {
        for (const [key, options] of orders) {
          const av=fieldValue(a,key),bv=fieldValue(b,key);
          if(options.nullsFirst===false && (av==null || bv==null)) {if(av==null && bv!=null) return 1;if(bv==null && av!=null) return -1;}
          const result = String(av).localeCompare(String(bv), undefined, {numeric:true}) * (options.ascending ? 1 : -1);
          if (result) return result;
        }
        return 0;
      });
      const data = head ? null : range ? rows.slice(range[0], range[1]+1) : rows;
      return {data:JSON.parse(JSON.stringify(single ? data[0] : data)),count:rows.length,error:null};
    };
    const q = {
      select(_, options) { head = options?.head; return q; },
      eq(key, value) { rows = rows.filter(row => value === '{}' ? Array.isArray(row[key]) && !row[key].length : fieldValue(row,key) === value); return q; },
      gte(key,value) {rows=rows.filter(row=>fieldValue(row,key)!=null && fieldValue(row,key)>=value);return q;},
      lte(key,value) {rows=rows.filter(row=>fieldValue(row,key)!=null && fieldValue(row,key)<=value);return q;},
      ilike(key,value) {rows=rows.filter(row=>String(fieldValue(row,key)||'').toLowerCase().includes(value.slice(1,-1).toLowerCase()));return q;},
      is(key, value) { rows = rows.filter(row => row[key] === value); return q; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return q; },
      overlaps(key, values) { rows = rows.filter(row => row[key]?.some(value => values.includes(value))); return q; },
      or(value) {
        if(value.startsWith('custom_values->>')) {const key=value.split('.')[0];rows=rows.filter(row=>fieldValue(row,key)==='false' || fieldValue(row,key)==null);return q;}
        const term = value.match(/title\\.ilike\\.%([^%]*)%/);
        if (term) rows = rows.filter(row => row.title.toLowerCase().includes(term[1].toLowerCase()));
        const ids = value.match(/collection_ids\\.ov\\.\\{([\\d,]+)\\}/);
        if (ids) rows = rows.filter(row => !row.collection_ids.length || row.collection_ids.some(id=>ids[1].split(',').map(Number).includes(id)));
        return q;
      },
      order(key, options) { orders.push([key, options]); return q; },
      range(from, to) { range = [from, to]; return q; },
      insert(value) { mode='insert';payload=value;return q; },
      update(value) { mode='update';payload=value;return q; },
      single() { single=true;return q; },
      then(resolve) { return Promise.resolve(execute()).then(resolve); }
    }; return q;
  }
};
`;

async function isolateMoviePage(page, base) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base || url.pathname === '/supabase-config.js') return route.fulfill({body: ''});
    if (url.pathname === '/movie-tracker.js') {
      const response = await route.fetch();
      // Metadata providers are unrelated to collection persistence.
      const noMetadata = '\nfetchMovieMissingDetails = async () => ({failures:[],payload:{},skipped:true}); sleep = async () => {};';
      return route.fulfill({response, body: mock + '\n' + await response.text() + noMetadata});
    }
    return route.continue();
  });
}

module.exports = { isolateMoviePage };
