const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create function auth.uid() returns text language sql stable as $$ select current_setting('request.jwt.claim.sub', true) $$;
      create table users(id integer primary key, clerk_user_id text);
      insert into users values(1,'owner'),(2,'other');
      grant usage on schema auth to authenticated;
      grant select on users to authenticated;
    `);
    await db.exec(fs.readFileSync('supabase/migrations/202605080001_add_movie_tracker.sql','utf8'));
    await db.exec(`
      alter table movies add column deleted boolean not null default false;
      alter table collections add column deleted boolean not null default false;
      alter table franchise add column deleted boolean not null default false;
      insert into collections(id,user_id,name,deleted) values(1,1,'One',false),(2,1,'Two',false),(3,1,'Three',false),(4,2,'Foreign',false),(5,1,'Retired',true);
      insert into franchise(id,user_id,name,deleted) values(1,1,'First',false),(2,1,'Second',false),(3,2,'Foreign',false),(4,1,'Retired',true);
      insert into movies(id,user_id,title,year_released,collection_id,franchise_id,downloaded,deleted) values
        (1,1,'First movie',2000,1,1,true,false),(2,1,'Second movie',2001,2,2,false,false),
        (3,1,'Third movie',2002,null,null,true,false),(4,2,'Foreign movie',2003,4,3,false,false),(5,1,'Deleted movie',2004,1,1,false,true);
      grant select,update on movies,collections,franchise to authenticated;
    `);
    for (const table of ['movies','collections','franchise']) await db.exec(`
      alter table ${table} enable row level security;
      create policy owned_rows on ${table} for all to authenticated
        using(user_id=(select id from users where clerk_user_id=auth.uid()))
        with check(user_id=(select id from users where clerk_user_id=auth.uid()));
    `);
    await db.exec(fs.readFileSync('supabase/migrations/202610150001_movie_multiple_collections.sql','utf8'));
    await db.exec('alter default privileges in schema public grant execute on functions to anon');
    await db.exec(fs.readFileSync('supabase/migrations/202610150002_movie_membership_actions.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/202610150003_restrict_movie_membership_rpc.sql','utf8'));
    const rpc = async (ids,kind,op,targets) => (await db.query('select public.update_movie_memberships($1,$2,$3,$4) as changed',[ids,kind,op,targets])).rows[0].changed;
    const rows = async () => (await db.query('select id,collection_ids,collection_id,franchise_id,downloaded from movies where not deleted order by id')).rows;
    await db.exec("set request.jwt.claim.sub='owner'; set role authenticated");
    assert.equal(await rpc([1,2,3],'collection','add',[1,3,3]),3);
    assert.deepEqual((await rows()).map(row=>row.collection_ids),[[1,3],[2,1,3],[1,3]]);
    const timestamps=(await db.query('select updated_at from movies order by id')).rows;
    assert.equal(await rpc([1,2,3],'collection','add',[3,1]),0);
    assert.deepEqual((await db.query('select updated_at from movies order by id')).rows,timestamps,'No-op leaves timestamps unchanged');
    assert.equal(await rpc([1,2,3],'collection','remove',[1]),3);
    assert.deepEqual((await rows()).map(row=>row.collection_ids),[[3],[2,3],[3]]);
    assert.equal(await rpc([1,2,3],'collection','remove',[1]),0);
    assert.equal(await rpc([1,3],'collection','remove',[3]),2);
    assert.deepEqual((await rows()).map(row=>row.collection_id),[null,2,null]);
    // A subsequent action must use current memberships, not an earlier client snapshot.
    await rpc([1],'collection','add',[2]);
    await rpc([1],'collection','add',[3]);
    assert.deepEqual((await rows())[0].collection_ids,[2,3]);
    assert.equal(await rpc([1,2,3],'franchise','remove',[1]),1);
    assert.deepEqual((await rows()).map(row=>row.franchise_id),[null,2,null]);
    assert.equal(await rpc([1,2,3],'franchise','add',[1]),3);
    assert.equal(await rpc([1,2,3],'franchise','add',[1]),0);
    assert.equal(await rpc([1,2,3],'franchise','remove',[2]),0);
    assert.deepEqual((await rows()).map(row=>row.downloaded),[true,false,true]);
    const unchanged=await rows();
    // The live legacy tables do not enable RLS. Explicit owner checks must still protect this RPC.
    await db.exec('reset role; alter table movies disable row level security; alter table collections disable row level security; alter table franchise disable row level security; set role authenticated');
    for (const args of [ [[1,4],'collection','add',[1]], [[1],'collection','add',[4]], [[1],'franchise','add',[3]] ]) await assert.rejects(rpc(...args));
    await db.exec('reset role; alter table movies enable row level security; alter table collections enable row level security; alter table franchise enable row level security; set role authenticated');
    assert.deepEqual(await rows(),unchanged,'Ownership is enforced even without RLS');
    for (const args of [
      [[1,4],'collection','add',[1]], [[1,5],'collection','remove',[2]], [[1,999],'collection','add',[1]],
      [[1,2],'collection','add',[1,4]], [[1],'collection','remove',[5]], [[1],'collection','add',[999]],
      [[1],'franchise','add',[3]], [[1],'franchise','remove',[4]], [[1],'franchise','add',[1,2]],
      [[], 'collection','add',[1]], [[1],'collection','remove',[]], [[1],'collection','add',[null]],
      [[1],'collection','set',[1]], [[1],'invalid','add',[1]]
    ]) { await assert.rejects(rpc(...args)); assert.deepEqual(await rows(),unchanged,'Rejected request changes nothing'); }
    await db.exec(`reset role;
      create function public.fail_second_movie() returns trigger language plpgsql as $$ begin
        if new.id=2 then raise exception 'Simulated row failure'; end if; return new;
      end; $$;
      create trigger fail_second before update on movies for each row execute function public.fail_second_movie();
      set role authenticated;
    `);
    await assert.rejects(rpc([1,2],'collection','add',[1]),/Simulated row failure/);
    assert.deepEqual(await rows(),unchanged,'Later row failure rolls back earlier writes');
    await db.exec("set request.jwt.claim.sub='other'");
    assert.equal((await rows()).length,1);
    assert.deepEqual((await rows())[0].collection_ids,[4]);
    await assert.rejects(rpc([1],'collection','add',[4]));
    await db.exec("set request.jwt.claim.sub=''");
    await assert.rejects(rpc([4],'collection','add',[4]),/Authentication required/);
    await db.exec('reset role; set role anon');
    await assert.rejects(rpc([1],'collection','add',[1]),/permission denied/);
    console.log('Membership database checks passed: additive/removal semantics, no-ops, current values, franchise moves, atomic rollback, ownership, invalid targets and authenticated-only access.');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
