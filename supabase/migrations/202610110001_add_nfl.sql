begin;

create table public.nfl_favorite_teams (
  id bigint generated always as identity primary key,
  user_id integer not null references public.users(id) on delete cascade,
  team_id text not null check (team_id ~ '^[1-9][0-9]{0,11}$'),
  team_name text not null check (char_length(team_name) between 1 and 150),
  team_logo text not null default '' check (char_length(team_logo) <= 2048),
  created_at timestamptz not null default now(),
  unique (user_id, team_id)
);

alter table public.nfl_favorite_teams enable row level security;
create policy nfl_favorites_owner on public.nfl_favorite_teams
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = user_id and u.clerk_user_id = auth.uid()::text))
  with check (exists (select 1 from public.users u where u.id = user_id and u.clerk_user_id = auth.uid()::text));
grant select, insert, update, delete on public.nfl_favorite_teams to authenticated;
grant usage, select on sequence public.nfl_favorite_teams_id_seq to authenticated;
grant all on public.nfl_favorite_teams to service_role;
grant usage, select on sequence public.nfl_favorite_teams_id_seq to service_role;

alter table public.user_settings add column if not exists nfl_home_widget_visible boolean not null default true;

alter function public.get_admin_purge_user_object_counts(integer) rename to get_admin_purge_user_object_counts_before_nfl;
alter function public.admin_purge_data(text, integer[], boolean, text[]) rename to admin_purge_data_before_nfl;
alter function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) rename to admin_purge_data_for_current_user_before_nfl;
alter function public.list_admin_user_activity() rename to list_admin_user_activity_before_nfl;

create function public.get_admin_purge_user_object_counts(p_user_id integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare base jsonb; total bigint;
begin
  base := public.get_admin_purge_user_object_counts_before_nfl(p_user_id);
  select count(*) into total from public.nfl_favorite_teams where user_id = p_user_id;
  return jsonb_set(coalesce(base, '{}'::jsonb), '{nfl}', to_jsonb(total), true);
end;
$$;

create function public.admin_purge_data(
  p_actor_auth_id text, p_user_ids integer[] default '{}', p_all_users boolean default false, p_datasets text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id integer;
  targets integer[];
  purge_targets integer[];
  passthrough text[] := array_remove(coalesce(p_datasets, '{}'::text[]), 'nfl');
  base jsonb;
  total bigint := 0;
begin
  select id into actor_id from public.users where clerk_user_id = p_actor_auth_id and admin = true;
  if actor_id is null then raise exception 'Only admins can purge data.'; end if;
  if not ('nfl' = any(coalesce(p_datasets, '{}'::text[]))) and not ('users' = any(coalesce(p_datasets, '{}'::text[]))) then
    return public.admin_purge_data_before_nfl(p_actor_auth_id, p_user_ids, p_all_users, p_datasets);
  end if;
  select coalesce(array_agg(id), '{}'::integer[]) into targets from public.users
    where coalesce(p_all_users, false) or id = any(coalesce(p_user_ids, '{}'::integer[]));
  if cardinality(targets) = 0 then raise exception 'At least one target user is required.'; end if;
  purge_targets := case when 'users' = any(p_datasets) then array_remove(targets, actor_id) else targets end;
  if cardinality(purge_targets) = 0 then raise exception 'The active admin cannot be deleted.'; end if;
  with removed as (delete from public.nfl_favorite_teams where user_id = any(purge_targets) returning 1)
    select count(*) into total from removed;
  if cardinality(passthrough) > 0 then
    base := public.admin_purge_data_before_nfl(p_actor_auth_id, targets, false, passthrough);
  else
    base := jsonb_build_object('ok', true, 'target_user_ids', targets, 'account_purge_user_ids', '[]'::jsonb, 'counts', '{}'::jsonb);
  end if;
  return base || jsonb_build_object('requested_datasets', p_datasets, 'counts',
    coalesce(base->'counts', '{}'::jsonb) || jsonb_build_object('nfl_favorite_teams', total));
end;
$$;

create function public.admin_purge_data_for_current_user(
  p_user_ids integer[] default '{}', p_all_users boolean default false, p_datasets text[] default '{}', p_confirmation text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  passthrough text[] := array_remove(coalesce(p_datasets, '{}'::text[]), 'nfl');
  base jsonb;
  nfl_result jsonb;
  counts jsonb;
begin
  if coalesce(p_confirmation, '') <> 'PURGE' then raise exception 'Type PURGE to confirm this destructive action.'; end if;
  if not ('nfl' = any(coalesce(p_datasets, '{}'::text[]))) then
    return public.admin_purge_data_for_current_user_before_nfl(p_user_ids, p_all_users, p_datasets, p_confirmation);
  end if;
  nfl_result := public.admin_purge_data(auth.uid()::text, p_user_ids, p_all_users, array['nfl']);
  if cardinality(passthrough) > 0 then
    base := public.admin_purge_data_for_current_user_before_nfl(p_user_ids, p_all_users, passthrough, p_confirmation);
  end if;
  select coalesce(jsonb_object_agg(key, to_jsonb(total)), '{}'::jsonb) into counts
    from (select key, sum(value::bigint) as total from (
      select key, value from jsonb_each_text(coalesce(nfl_result->'counts', '{}'::jsonb))
      union all
      select key, value from jsonb_each_text(coalesce(base->'counts', '{}'::jsonb))
    ) entries group by key) totals;
  return coalesce(base, nfl_result) || jsonb_build_object('requested_datasets', p_datasets, 'counts', counts);
end;
$$;

create function public.list_admin_user_activity()
returns jsonb language plpgsql security definer set search_path = public as $$
declare base jsonb; users_payload jsonb;
begin
  -- The existing function verifies the current user's admin role first.
  base := public.list_admin_user_activity_before_nfl();
  select coalesce(jsonb_agg(u || jsonb_build_object(
    'last_activity_at', greatest((u->>'last_activity_at')::timestamptz, f.latest),
    'modules', coalesce(u->'modules', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', 'nfl', 'label', 'NFL Favorites', 'count', f.total, 'latest_activity_at', f.latest
    ))
  ) order by greatest((u->>'last_activity_at')::timestamptz, f.latest) desc nulls last), '[]'::jsonb)
    into users_payload
    from jsonb_array_elements(base->'users') u
    cross join lateral (select count(*) as total, max(created_at) as latest from public.nfl_favorite_teams where user_id = (u->>'id')::integer) f;
  return jsonb_set(base, '{users}', users_payload);
end;
$$;

revoke all on function public.get_admin_purge_user_object_counts(integer) from public, anon, authenticated;
grant execute on function public.get_admin_purge_user_object_counts(integer) to service_role;
revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from public, anon, authenticated;
grant execute on function public.admin_purge_data(text, integer[], boolean, text[]) to service_role;
revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from public, anon;
grant execute on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) to authenticated;
revoke all on function public.list_admin_user_activity() from public, anon;
grant execute on function public.list_admin_user_activity() to authenticated;

commit;
