const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create function auth.uid() returns text language sql stable as $$select current_setting('request.jwt.claim.sub',true)$$;
    create table users(id integer primary key,clerk_user_id text,admin boolean);
    insert into users values(1,'admin',true),(2,'ordinary',false);
    create table movies(id integer primary key,title text);insert into movies values(1,'Untouched');
    grant usage on schema auth to authenticated;
    alter default privileges grant all on tables to authenticated,anon;`);
  const original=(await db.query("select to_jsonb(m) as row from movies m")).rows;
  await db.exec(fs.readFileSync('supabase/migrations/202610200003_centralis_backups.sql','utf8'));
  assert.deepEqual((await db.query("select to_jsonb(m) as row from movies m")).rows,original);
  const rpc=async(action='status',options={})=>(await db.query('select centralis_backup_control($1,$2) as value',[action,JSON.stringify(options)])).rows[0].value;
  await db.exec("set role authenticated;set request.jwt.claim.sub='ordinary'");
  for(const action of ['status','queue','settings'])await assert.rejects(rpc(action),/administrators/);
  await assert.rejects(db.query('select * from centralis_backup_runs'),/permission denied/);
  await assert.rejects(db.query("update centralis_backup_settings set enabled=false"),/permission denied/);
  await db.exec("set request.jwt.claim.sub='admin'");
  const initial=await rpc();assert.equal(initial.settings.retention_days,30);assert.equal(initial.settings.enabled,true);assert.deepEqual(initial.runs,[]);
  await assert.rejects(rpc('queue'),/setup/);
  await assert.rejects(rpc('settings',{retention_days:0}));
  assert.equal((await rpc()).settings.retention_days,30);
  await db.exec('reset role;update centralis_backup_settings set last_worker_check=now();set role authenticated');
  const first=await rpc('queue'),again=await rpc('queue');assert.equal(first.run_id,again.run_id);assert.equal(again.runs.length,1);
  assert.equal((await rpc('settings',{enabled:false,retention_days:14})).settings.enabled,false);
  await db.exec('reset role;set role anon');await assert.rejects(rpc(),/permission denied/);
  console.log('Backup database checks passed: admin-only controls, private tables, setup gating, queue deduplication, retention validation, and unchanged movies.');
 } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
