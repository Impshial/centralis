const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  try {
    // Minimal existing Centralis contracts, with real PostgreSQL roles and RLS.
    await db.exec(`
      create role authenticated; create role anon; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.users (id integer primary key, clerk_user_id text, admin boolean, email text, created_at timestamptz default now());
      create table public.user_settings (id integer primary key, user_id integer references users(id));
      grant select on public.users to authenticated;
      insert into users(id,clerk_user_id,admin,email) values
        (1,'00000000-0000-0000-0000-000000000001',true,'admin@test.invalid'),
        (2,'00000000-0000-0000-0000-000000000002',false,'owner@test.invalid'),
        (3,'00000000-0000-0000-0000-000000000003',false,'other@test.invalid');
      insert into user_settings values (1,1),(2,2),(3,3);
      create function get_admin_purge_user_object_counts(p_user_id integer) returns jsonb language plpgsql security definer as $$
        begin return jsonb_build_object('user_account',1); end; $$;
      create function admin_purge_data(p_actor_auth_id text,p_user_ids integer[] default '{}',p_all_users boolean default false,p_datasets text[] default '{}')
      returns jsonb language plpgsql security definer as $$
      begin
        if not exists(select 1 from users where clerk_user_id=p_actor_auth_id and admin) then raise exception 'Only admins'; end if;
        if 'users'=any(p_datasets) then delete from users where id=any(p_user_ids) and clerk_user_id<>p_actor_auth_id; end if;
        return jsonb_build_object('ok',true,'counts',jsonb_build_object('delegated',1),'target_user_ids',p_user_ids,'account_purge_user_ids','[]'::jsonb);
      end; $$;
      create function admin_purge_data_for_current_user(p_user_ids integer[] default '{}',p_all_users boolean default false,p_datasets text[] default '{}',p_confirmation text default '')
      returns jsonb language plpgsql security definer as $$
      begin
        if p_confirmation <> 'PURGE' then raise exception 'Confirmation required'; end if;
        if 'users'=any(p_datasets) and exists(select 1 from users where id=any(p_user_ids) and clerk_user_id=auth.uid()::text) then raise exception 'Cannot delete active admin'; end if;
        return public.admin_purge_data(auth.uid()::text,p_user_ids,p_all_users,p_datasets);
      end; $$;
      create function list_admin_user_activity() returns jsonb language plpgsql security definer as $$
      declare result jsonb;
      begin
        if not exists(select 1 from users where clerk_user_id=auth.uid()::text and admin) then raise exception 'Only admins'; end if;
        select jsonb_agg(jsonb_build_object('id',id,'object_counts',get_admin_purge_user_object_counts(id),'modules','[]'::jsonb,'last_activity_at',created_at)) into result from users;
        return jsonb_build_object('users',result);
      end; $$;
    `);
    await db.exec(fs.readFileSync('supabase/migrations/202610110001_add_nfl.sql', 'utf8'));
    const query = async sql => (await db.query(sql)).rows;
    const login = async id => db.exec(`reset role; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000${id}'; set role authenticated;`);
    await login(2);
    await db.exec(`insert into nfl_favorite_teams(user_id,team_id,team_name) values(2,'12','Chiefs') on conflict(user_id,team_id) do nothing;`);
    await db.exec(`insert into nfl_favorite_teams(user_id,team_id,team_name) values(2,'12','Chiefs') on conflict(user_id,team_id) do nothing;`);
    assert.equal((await query('select * from nfl_favorite_teams')).length, 1);
    await assert.rejects(db.exec(`insert into nfl_favorite_teams(user_id,team_id,team_name) values(3,'12','Not mine')`), /row-level security/);
    await assert.rejects(db.exec(`update nfl_favorite_teams set user_id=3 where team_id='12'`), /row-level security/);
    await login(3);
    assert.equal((await query('select * from nfl_favorite_teams')).length, 0);
    await db.exec(`delete from nfl_favorite_teams where user_id=2;`);
    await login(2);
    assert.equal((await query('select * from nfl_favorite_teams')).length, 1);
    await assert.rejects(db.exec(`select admin_purge_data_for_current_user(array[2],false,array['nfl'],'PURGE')`), /Only admins/);
    await assert.rejects(db.exec(`select admin_purge_data('00000000-0000-0000-0000-000000000001',array[2],false,array['nfl'])`), /permission denied/);
    await assert.rejects(db.exec(`select list_admin_user_activity()`), /Only admins/);
    await db.exec('reset role');
    await assert.rejects(db.exec(`insert into nfl_favorite_teams(user_id,team_id,team_name) values(999,'12','Invalid')`), /foreign key/);
    assert.equal((await query('select nfl_home_widget_visible from user_settings where user_id=2'))[0].nfl_home_widget_visible, true);
    assert.equal((await query('select get_admin_purge_user_object_counts(2) as counts'))[0].counts.nfl, 1);
    await login(1);
    const activity = (await query('select list_admin_user_activity() as result'))[0].result;
    assert.equal(activity.users.find(u => u.id === 2).modules.find(m => m.id === 'nfl').count, 1);
    await assert.rejects(db.exec(`select admin_purge_data_for_current_user(array[2],false,array['nfl'],'wrong')`), /Type PURGE/);
    await assert.rejects(db.exec(`select admin_purge_data_for_current_user(array[1,2],false,array['nfl','users'],'PURGE')`), /Cannot delete active admin/);
    await login(2);
    assert.equal((await query('select * from nfl_favorite_teams')).length, 1, 'Failed combined purge must roll back');
    await login(1);
    const purge = (await query(`select admin_purge_data_for_current_user(array[2],false,array['nfl','templates'],'PURGE') as result`))[0].result;
    assert.equal(purge.counts.nfl_favorite_teams, 1);
    assert.equal(purge.counts.delegated, 1, 'Other datasets still use existing purge handlers');
    await login(2);
    assert.equal((await query('select * from nfl_favorite_teams')).length, 0);
    await db.exec(`insert into nfl_favorite_teams(user_id,team_id,team_name) values(2,'12','Chiefs'); delete from nfl_favorite_teams where user_id=2 and team_id='12';`);
    assert.equal((await query('select * from nfl_favorite_teams')).length, 0);
    console.log('NFL migration executed successfully. Ownership, uniqueness, removal, FK, defaults, admin counts/activity, combined purge rollback, and delegation checks passed.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
