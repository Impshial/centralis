begin;

do $$
begin
  if to_regprocedure('public.get_admin_purge_user_object_counts_before_secureit(integer)') is null
    and to_regprocedure('public.get_admin_purge_user_object_counts(integer)') is not null then
    alter function public.get_admin_purge_user_object_counts(integer) rename to get_admin_purge_user_object_counts_before_secureit;
  end if;

  if to_regprocedure('public.admin_purge_data_before_secureit(text, integer[], boolean, text[])') is null
    and to_regprocedure('public.admin_purge_data(text, integer[], boolean, text[])') is not null then
    alter function public.admin_purge_data(text, integer[], boolean, text[]) rename to admin_purge_data_before_secureit;
  end if;

  if to_regprocedure('public.admin_purge_data_for_current_user_before_secureit(integer[], boolean, text[], text)') is null
    and to_regprocedure('public.admin_purge_data_for_current_user(integer[], boolean, text[], text)') is not null then
    alter function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) rename to admin_purge_data_for_current_user_before_secureit;
  end if;
end;
$$;

create or replace function public.get_admin_purge_user_object_counts(p_user_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  base_counts jsonb := '{}';
  secureit_count integer := 0;
begin
  if to_regprocedure('public.get_admin_purge_user_object_counts_before_secureit(integer)') is not null then
    execute 'select public.get_admin_purge_user_object_counts_before_secureit($1)' using p_user_id into base_counts;
  else
    select jsonb_build_object(
      'user_account', (select count(*) from public.users where id = p_user_id and coalesce(deleted, false) = false)
    ) into base_counts;
  end if;

  select
    (select count(*) from public.secureit_vaults where user_id = p_user_id and deleted = false)
    +
    (select count(*) from public.secureit_collections where user_id = p_user_id and deleted = false)
    +
    (select count(*) from public.secureit_items where user_id = p_user_id and deleted = false)
    into secureit_count;

  return jsonb_set(coalesce(base_counts, '{}'::jsonb), '{secureit}', to_jsonb(secureit_count), true);
end;
$$;

create or replace function public.admin_purge_data(
  p_actor_auth_id text,
  p_user_ids integer[] default '{}'::integer[],
  p_all_users boolean default false,
  p_datasets text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.users%rowtype;
  target_user_ids integer[];
  purge_user_ids integer[];
  requested_datasets text[];
  passthrough_datasets text[];
  base_result jsonb := null;
  custom_counts jsonb := '{}'::jsonb;
  merged_counts jsonb := '{}'::jsonb;
  deleted_count integer := 0;
begin
  select * into actor_user from public.users where clerk_user_id = p_actor_auth_id;
  if actor_user.id is null or coalesce(actor_user.admin, false) is not true then
    raise exception 'Only admins can purge data.';
  end if;

  select coalesce(array_agg(distinct dataset), '{}'::text[])
    into requested_datasets
    from unnest(coalesce(p_datasets, '{}'::text[])) dataset
    where dataset = any(array[
      'universes','elements','element_types','templates','chronicle','chat_repositories',
      'calendars','todo','source_documents','image_generation','roleplayer','god_engine',
      'arc_studio','fusion','listmaker','secureit','generation_jobs','movies',
      'episode_roulette','stellar','users'
    ]);

  if cardinality(requested_datasets) = 0 then
    raise exception 'At least one dataset is required.';
  end if;

  if coalesce(p_all_users, false) then
    select coalesce(array_agg(id order by email), '{}'::integer[]) into target_user_ids from public.users;
  else
    select coalesce(array_agg(distinct id), '{}'::integer[]) into target_user_ids from public.users where id = any(coalesce(p_user_ids, '{}'::integer[]));
  end if;

  if cardinality(target_user_ids) = 0 then
    raise exception 'At least one target user is required.';
  end if;

  purge_user_ids := case
    when 'users' = any(requested_datasets) then array(select id from unnest(target_user_ids) id where id <> actor_user.id)
    else target_user_ids
  end;

  if 'users' = any(requested_datasets) and cardinality(purge_user_ids) = 0 then
    raise exception 'The active admin cannot be deleted.';
  end if;

  if 'secureit' = any(requested_datasets) or 'users' = any(requested_datasets) then
    with deleted as (delete from public.secureit_items where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    custom_counts := jsonb_set(custom_counts, '{secureit_items}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.secureit_collections where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    custom_counts := jsonb_set(custom_counts, '{secureit_collections}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.secureit_vaults where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    custom_counts := jsonb_set(custom_counts, '{secureit_vaults}', to_jsonb(deleted_count), true);
  end if;

  passthrough_datasets := array_remove(requested_datasets, 'secureit');
  if cardinality(passthrough_datasets) > 0 then
    base_result := public.admin_purge_data_before_secureit(p_actor_auth_id, target_user_ids, false, passthrough_datasets);
  end if;

  select coalesce(jsonb_object_agg(key, to_jsonb(total)), '{}'::jsonb)
    into merged_counts
    from (
      select key, sum(value::integer) as total
      from (
        select key, value from jsonb_each_text(custom_counts)
        union all
        select key, value from jsonb_each_text(coalesce(base_result->'counts', '{}'::jsonb))
      ) count_rows
      group by key
    ) merged_rows;

  return jsonb_build_object(
    'ok', true,
    'requested_datasets', requested_datasets,
    'target_user_ids', target_user_ids,
    'account_purge_user_ids', coalesce(base_result->'account_purge_user_ids', '[]'::jsonb),
    'counts', merged_counts
  );
end;
$$;

create or replace function public.admin_purge_data_for_current_user(
  p_user_ids integer[] default '{}'::integer[],
  p_all_users boolean default false,
  p_datasets text[] default '{}'::text[],
  p_confirmation text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_datasets text[];
  passthrough_datasets text[];
  base_result jsonb := null;
  secureit_result jsonb := null;
  merged_counts jsonb := '{}'::jsonb;
begin
  if coalesce(p_confirmation, '') <> 'PURGE' then
    raise exception 'Type PURGE to confirm this destructive action.';
  end if;

  select coalesce(array_agg(distinct dataset), '{}'::text[])
    into requested_datasets
    from unnest(coalesce(p_datasets, '{}'::text[])) dataset
    where dataset = any(array[
      'universes','elements','element_types','templates','chronicle','chat_repositories',
      'calendars','todo','source_documents','image_generation','roleplayer','god_engine',
      'arc_studio','fusion','listmaker','secureit','generation_jobs','movies',
      'episode_roulette','stellar','users'
    ]);

  if cardinality(requested_datasets) = 0 then
    raise exception 'At least one dataset is required.';
  end if;

  passthrough_datasets := array_remove(requested_datasets, 'secureit');

  if 'secureit' = any(requested_datasets) then
    secureit_result := public.admin_purge_data(auth.uid()::text, p_user_ids, p_all_users, array['secureit']);
  end if;

  if cardinality(passthrough_datasets) > 0 then
    base_result := public.admin_purge_data_for_current_user_before_secureit(p_user_ids, p_all_users, passthrough_datasets, p_confirmation);
  end if;

  select coalesce(jsonb_object_agg(key, to_jsonb(total)), '{}'::jsonb)
    into merged_counts
    from (
      select key, sum(value::integer) as total
      from (
        select key, value from jsonb_each_text(coalesce(secureit_result->'counts', '{}'::jsonb))
        union all
        select key, value from jsonb_each_text(coalesce(base_result->'counts', '{}'::jsonb))
      ) count_rows
      group by key
    ) merged_rows;

  return jsonb_build_object(
    'ok', true,
    'requested_datasets', requested_datasets,
    'target_user_ids', coalesce(base_result->'target_user_ids', secureit_result->'target_user_ids'),
    'account_purge_user_ids', coalesce(base_result->'account_purge_user_ids', secureit_result->'account_purge_user_ids', '[]'::jsonb),
    'counts', merged_counts
  );
end;
$$;

revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from public;
revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from anon;
revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from authenticated;
grant execute on function public.admin_purge_data(text, integer[], boolean, text[]) to service_role;

revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from public;
revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from anon;
grant execute on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) to authenticated;

commit;
