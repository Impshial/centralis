const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns text language sql stable as $$ select current_setting('request.jwt.claim.sub', true) $$;
      create table users(id integer primary key, clerk_user_id text);
      insert into users values(1,'owner'),(2,'other');
      grant usage on schema auth to authenticated;
      grant select on users to authenticated;
    `);
    await db.exec(fs.readFileSync('supabase/migrations/202605080001_add_movie_tracker.sql', 'utf8'));
    await db.exec(`
      alter table movies add column deleted boolean not null default false;
      alter table collections add column deleted boolean not null default false;
      insert into collections(id,user_id,name) values (1,1,'Favorites'),(2,1,'Watch again'),(3,2,'Private'),(4,1,'Remove me'),(5,1,'Retired');
      update collections set deleted=true where id=5;
      insert into movies(id,user_id,title,year_released,collection_id) values(1,1,'Legacy',2000,1),(2,1,'Unassigned',2001,null),(3,2,'Other movie',2002,3),(4,1,'Deleted collection',2003,5);
      select setval('movies_id_seq', 4);
      grant select,insert,update,delete on movies,collections to authenticated;
      grant usage on sequence movies_id_seq to authenticated;
      alter table movies enable row level security;
      alter table collections enable row level security;
      create policy owned_movies on movies for all to authenticated
        using (user_id=(select id from users where clerk_user_id=auth.uid()))
        with check (user_id=(select id from users where clerk_user_id=auth.uid()));
      create policy owned_collections on collections for all to authenticated
        using (user_id=(select id from users where clerk_user_id=auth.uid()))
        with check (user_id=(select id from users where clerk_user_id=auth.uid()));
    `);
    await db.exec(fs.readFileSync('supabase/migrations/202610150001_movie_multiple_collections.sql', 'utf8'));
    const row = async id => (await db.query('select collection_id,collection_ids from movies where id=$1', [id])).rows[0];
    assert.deepEqual(await row(1), {collection_id:1,collection_ids:[1]}, 'Backfill existing membership');
    assert.deepEqual(await row(2), {collection_id:null,collection_ids:[]});
    assert.deepEqual(await row(4), {collection_id:null,collection_ids:[]}, 'Ignore already deleted collections');
    await db.exec("set request.jwt.claim.sub='owner'; set role authenticated;");
    await db.exec('update movies set collection_ids=array[2,1,2,null] where id=1');
    assert.deepEqual(await row(1), {collection_id:2,collection_ids:[2,1]}, 'Deduplicate and sync compatibility field');
    await db.exec("update movies set title='Unrelated edit' where id=1");
    assert.deepEqual((await row(1)).collection_ids, [2,1], 'Other edits retain memberships');
    await assert.rejects(db.exec('update movies set collection_ids=array[1,3] where id=1'), /unavailable/);
    await assert.rejects(db.exec('update movies set collection_ids=array[1,999] where id=1'), /unavailable/);
    await assert.rejects(db.exec('update movies set collection_ids=array[5] where id=1'), /unavailable/);
    assert.deepEqual((await row(1)).collection_ids, [2,1], 'Invalid changes roll back atomically');
    await db.exec('update movies set collection_ids=array[1,2] where id in(1,2)');
    assert.deepEqual((await row(2)).collection_ids, [1,2], 'Bulk memberships');
    assert.equal((await db.query('select id from movies where collection_ids && array[2,4]')).rows.length, 2, 'Any selected collection');
    await db.exec("update movies set collection_ids='{}' where id=2");
    assert.deepEqual(await row(2), {collection_id:null,collection_ids:[]}, 'Clearing does not restore old primary');
    assert.equal((await db.query("select id from movies where collection_ids && array[2] or collection_ids='{}'")).rows.length, 3, 'Selected plus unassigned');
    await db.exec("insert into movies(user_id,title,year_released,collection_ids) values(1,'New',2026,array[1,2])");
    assert.deepEqual((await row(5)).collection_ids, [1,2]);
    await db.exec("insert into movies(user_id,title,year_released,collection_id) values(1,'Old client',2026,2)");
    assert.deepEqual((await row(6)).collection_ids, [2], 'Old inserts continue working');
    await db.exec('update movies set collection_id=1 where id=6');
    assert.deepEqual((await row(6)).collection_ids, [1], 'Old collection edits remain supported');
    await db.exec('update movies set collection_ids=array[1,2,4] where id=1');
    await db.exec('update collections set deleted=true where id=1');
    assert.deepEqual(await row(1), {collection_id:2,collection_ids:[2,4]}, 'Soft deletion retains other memberships');
    await db.exec('delete from collections where id=2');
    assert.deepEqual(await row(1), {collection_id:4,collection_ids:[4]}, 'Hard deletion retains other memberships');
    await db.exec("set request.jwt.claim.sub='other'");
    assert.deepEqual((await row(3)).collection_ids, [3], 'Other accounts are unaffected');
    assert.equal(await row(1), undefined, 'Existing RLS still controls movie visibility');
    await db.exec('reset role; delete from users where id=1');
    assert.equal((await db.query('select count(*)::integer as count from movies')).rows[0].count, 1, 'Account cascade still works');
    console.log('Movie collection database checks passed: backfill, atomic saves, overlap filtering, clear, old clients, ownership, deleted collections, and cascades.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
