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
window.centralisSupabase = {
  async rpc(name, args) {
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
          const result = String(a[key]).localeCompare(String(b[key]), undefined, {numeric:true}) * (options.ascending ? 1 : -1);
          if (result) return result;
        }
        return 0;
      });
      const data = head ? null : range ? rows.slice(range[0], range[1]+1) : rows;
      return {data:JSON.parse(JSON.stringify(single ? data[0] : data)),count:rows.length,error:null};
    };
    const q = {
      select(_, options) { head = options?.head; return q; },
      eq(key, value) { rows = rows.filter(row => value === '{}' ? Array.isArray(row[key]) && !row[key].length : row[key] === value); return q; },
      is(key, value) { rows = rows.filter(row => row[key] === value); return q; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return q; },
      overlaps(key, values) { rows = rows.filter(row => row[key]?.some(value => values.includes(value))); return q; },
      or(value) {
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
