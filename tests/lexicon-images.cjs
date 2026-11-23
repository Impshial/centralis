const { fixture } = require('./lexicon-fixture.cjs');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { Store } = require('../lexicon-data.js');
(async () => {
  const f = await fixture();
  try {
    const store = new Store(f.client(), { id: 1 });
    const wiki = await store.createWiki({ id: f.uuid(), name: 'Images', kind: 'universe', universe_id: 'u1' });
    await f.db.exec(`reset role;
      create table image_table(id text primary key,object_id text,image_url text,is_primary boolean,sort_order integer,created_at timestamptz default now(),deleted boolean default false);
      insert into image_table(id,object_id,image_url,is_primary,sort_order) values
        ('one','a','https://example.invalid/one',false,0),('primary','a','https://example.invalid/primary',true,1),
        ('universe','u1','https://example.invalid/universe',false,0),('private','private','https://example.invalid/private',true,0);
      grant select on image_table to authenticated;set role authenticated;`);
    const before = (await f.db.query('select * from image_table order by id')).rows;
    let handler;
    const sandbox = { console, Deno: { serve(fn) { handler = fn; } },
      handleCors: () => null,
      getAuthUser: async req => { if (!req.headers.get('Authorization')) throw Error('Missing'); return { id: 'owner' }; },
      createAdminClient: () => f.client(), createSignedImageUrl: async url => url + '?signed',
      jsonResponse: (body, status = 200) => ({ body, status }),
    };
    vm.runInNewContext(fs.readFileSync('supabase/functions/lexicon-images/index.ts', 'utf8').replace(/^import .*;\r?\n/, ''), sandbox);
    const request = (body, auth = true) => new Request('http://localhost/images', { method: 'POST', headers: auth ? { Authorization: 'test-only' } : {}, body: JSON.stringify(body) });
    const response = await handler(request({ wikiId: wiki.id, objectIds: ['a', 'u1', 'private'] }));
    assert.equal(response.status, 200);
    assert.deepEqual(Array.from(response.body.images, i => i.id).sort(), ['primary', 'universe']);
    assert.deepEqual((await f.db.query('select * from image_table order by id')).rows, before, 'No primary-image repairs or other writes');
    assert.equal((await handler(request({ wikiId: wiki.id }, false))).status, 401);
    assert.equal((await handler(request({ wikiId: f.uuid() }))).status, 404);
    assert.equal(f.writes.some(w => w.table === 'image_table'), false);
    console.log('Lexicon image endpoint checks passed: authentication, wiki ownership, allowed object IDs, primary selection and zero source-image writes.');
  } finally { await f.db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
