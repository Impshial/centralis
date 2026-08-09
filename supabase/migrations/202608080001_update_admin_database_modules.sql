begin;

do $$
begin
  if to_regprocedure('public.admin_purge_data_legacy(text, integer[], boolean, text[])') is null
    and to_regprocedure('public.admin_purge_data(text, integer[], boolean, text[])') is not null then
    alter function public.admin_purge_data(text, integer[], boolean, text[]) rename to admin_purge_data_legacy;
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
  counts jsonb;
begin
  select jsonb_build_object(
    'user_account',
      (select count(*) from public.users where id = p_user_id and coalesce(deleted, false) = false),
    'universes',
      (select count(*) from public.universes where user_id = p_user_id and coalesce(deleted, false) = false),
    'elements',
      (select count(*) from public.elements where user_id = p_user_id and coalesce(deleted, false) = false),
    'element_types',
      (select count(*) from public.element_types where user_id = p_user_id and coalesce(deleted, false) = false),
    'templates',
      (select count(*)
        from public.element_type_templates ett
        join public.element_types et on et.id = ett.element_type_id
        where et.user_id = p_user_id
          and coalesce(et.deleted, false) = false
          and coalesce(ett.deleted, false) = false
          and coalesce(ett.is_default, false) = false),
    'chronicle',
      (
        (select count(*) from public.chronicle_modules where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*)
          from public.element_custom_fields ecf
          join public.elements e on e.id = ecf.element_id
          where e.user_id = p_user_id
            and coalesce(e.deleted, false) = false
            and coalesce(ecf.deleted, false) = false)
        +
        (select count(*)
          from public.element_template_field_values etfv
          join public.elements e on e.id = etfv.element_id
          where e.user_id = p_user_id
            and coalesce(e.deleted, false) = false
            and coalesce(etfv.deleted, false) = false)
      ),
    'chat_repositories',
      (select count(*) from public.chat_logs where user_id = p_user_id and coalesce(deleted, false) = false),
    'calendars',
      (
        (select count(*) from public.calendars where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.categories where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*)
          from public.events e
          left join public.calendars c on c.id = e.calendar_id
          left join public.categories cat on cat.id = e.category_id
          where coalesce(e.deleted, false) = false
            and (
              (c.user_id = p_user_id and coalesce(c.deleted, false) = false)
              or (cat.user_id = p_user_id and coalesce(cat.deleted, false) = false)
            ))
        +
        (select count(*)
          from public.event_recurrence_rules err
          join public.events e on e.id = err.event_id
          left join public.calendars c on c.id = e.calendar_id
          left join public.categories cat on cat.id = e.category_id
          where coalesce(err.deleted, false) = false
            and coalesce(e.deleted, false) = false
            and (
              (c.user_id = p_user_id and coalesce(c.deleted, false) = false)
              or (cat.user_id = p_user_id and coalesce(cat.deleted, false) = false)
            ))
        +
        (select count(*)
          from public.event_exceptions ex
          join public.events e on e.id = ex.parent_event_id
          left join public.calendars c on c.id = e.calendar_id
          left join public.categories cat on cat.id = e.category_id
          where coalesce(ex.deleted, false) = false
            and coalesce(e.deleted, false) = false
            and (
              (c.user_id = p_user_id and coalesce(c.deleted, false) = false)
              or (cat.user_id = p_user_id and coalesce(cat.deleted, false) = false)
            ))
        +
        (select count(*)
          from public.reminders r
          join public.events e on e.id = r.event_id
          left join public.calendars c on c.id = e.calendar_id
          left join public.categories cat on cat.id = e.category_id
          where coalesce(r.deleted, false) = false
            and coalesce(e.deleted, false) = false
            and (
              (c.user_id = p_user_id and coalesce(c.deleted, false) = false)
              or (cat.user_id = p_user_id and coalesce(cat.deleted, false) = false)
            ))
        +
        (select count(*)
          from public.calendar_permissions cp
          left join public.calendars c on c.id = cp.calendar_id
          where coalesce(cp.deleted, false) = false
            and (cp.user_id = p_user_id or (c.user_id = p_user_id and coalesce(c.deleted, false) = false)))
      ),
    'todo',
      (
        (select count(*) from public.todo_tasks where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*)
          from public.todo_subtasks ts
          join public.todo_tasks tt on tt.id = ts.task_id
          where tt.user_id = p_user_id
            and coalesce(tt.deleted, false) = false
            and coalesce(ts.deleted, false) = false)
      ),
    'source_documents',
      (select count(*) from public.universe_source_documents where user_id = p_user_id and coalesce(deleted, false) = false),
    'image_generation',
      (
        (select count(*) from public.image_generation_sessions where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.image_generation_messages where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.image_generation_assets where user_id = p_user_id and coalesce(deleted, false) = false)
      ),
    'roleplayer',
      (
        (select count(*) from public.roleplayer_characters where user_id = p_user_id)
        +
        (select count(*) from public.roleplayer_personas where user_id = p_user_id)
        +
        (select count(*) from public.roleplayer_sessions where user_id = p_user_id)
        +
        (select count(*) from public.roleplayer_messages where user_id = p_user_id)
        +
        (select count(*) from public.roleplayer_memories where user_id = p_user_id)
      ),
    'god_engine',
      (
        (select count(*) from public.god_evolutions where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.god_species where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.god_evolution_events where user_id = p_user_id and coalesce(deleted, false) = false)
      ),
    'arc_studio',
      (
        (select count(*) from public.arc_projects where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.arc_units where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.arc_unit_elements where user_id = p_user_id)
        +
        (select count(*) from public.arc_threads where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.arc_thread_units where user_id = p_user_id)
        +
        (select count(*) from public.arc_character_arcs where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.arc_arc_stages where user_id = p_user_id)
        +
        (select count(*) from public.arc_setups_payoffs where user_id = p_user_id)
        +
        (select count(*) from public.arc_unit_links where user_id = p_user_id)
        +
        (select count(*) from public.arc_element_states where user_id = p_user_id)
        +
        (select count(*) from public.arc_diagnostic_reports where user_id = p_user_id)
      ),
    'fusion',
      (
        (select count(*) from public.fusion_games where user_id = p_user_id)
        +
        (select count(*) from public.fusion_game_level0_items where user_id = p_user_id)
        +
        (select count(*) from public.fusion_game_discoveries where user_id = p_user_id)
      ),
    'listmaker',
      (
        (select count(*) from public.listmaker_lists where user_id = p_user_id and deleted_at is null)
        +
        (select count(*)
          from public.listmaker_categories c
          join public.listmaker_lists l on l.id = c.list_id
          where c.user_id = p_user_id and l.deleted_at is null)
        +
        (select count(*)
          from public.listmaker_statuses s
          join public.listmaker_lists l on l.id = s.list_id
          where s.user_id = p_user_id and l.deleted_at is null)
        +
        (select count(*)
          from public.listmaker_fields f
          join public.listmaker_lists l on l.id = f.list_id
          where f.user_id = p_user_id and l.deleted_at is null)
        +
        (select count(*)
          from public.listmaker_items i
          join public.listmaker_lists l on l.id = i.list_id
          where i.user_id = p_user_id and i.deleted_at is null and l.deleted_at is null)
        +
        (select count(*)
          from public.listmaker_field_values fv
          join public.listmaker_items i on i.id = fv.item_id
          join public.listmaker_lists l on l.id = fv.list_id
          where fv.user_id = p_user_id and i.deleted_at is null and l.deleted_at is null)
      ),
    'generation_jobs',
      (select count(*) from public.generation_jobs where user_id = p_user_id and coalesce(deleted, false) = false),
    'movies',
      (
        (select count(*) from public.movies where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.franchise where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.collections where user_id = p_user_id and coalesce(deleted, false) = false)
      ),
    'episode_roulette',
      (select count(*) from public.recent_shows where user_id = p_user_id and coalesce(deleted, false) = false),
    'stellar',
      (
        (select count(*) from public.stellar_systems where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.stellar_stars where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.stellar_planets where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.stellar_moons where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.stellar_lifeforms where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.stellar_colonies where user_id = p_user_id and coalesce(deleted, false) = false)
        +
        (select count(*) from public.stellar_colonists where user_id = p_user_id and coalesce(deleted, false) = false)
      )
  )
    into counts;

  return counts;
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
  account_purge_user_ids integer[];
  purge_user_ids integer[];
  requested_datasets text[];
  legacy_datasets text[];
  should_purge_accounts boolean;
  base_result jsonb := null;
  new_counts jsonb := '{}'::jsonb;
  merged_counts jsonb := '{}'::jsonb;
  deleted_count integer := 0;
begin
  select *
    into actor_user
    from public.users
    where clerk_user_id = p_actor_auth_id;

  if actor_user.id is null or coalesce(actor_user.admin, false) is not true then
    raise exception 'Only admins can purge data.';
  end if;

  select coalesce(array_agg(distinct dataset), '{}'::text[])
    into requested_datasets
    from unnest(coalesce(p_datasets, '{}'::text[])) dataset
    where dataset = any(array[
      'universes',
      'elements',
      'element_types',
      'templates',
      'chronicle',
      'chat_repositories',
      'calendars',
      'todo',
      'source_documents',
      'image_generation',
      'roleplayer',
      'god_engine',
      'arc_studio',
      'fusion',
      'listmaker',
      'generation_jobs',
      'movies',
      'episode_roulette',
      'stellar',
      'users'
    ]);

  if cardinality(requested_datasets) = 0 then
    raise exception 'At least one dataset is required.';
  end if;

  if coalesce(p_all_users, false) then
    select coalesce(array_agg(id order by email), '{}'::integer[])
      into target_user_ids
      from public.users;
  else
    select coalesce(array_agg(distinct id), '{}'::integer[])
      into target_user_ids
      from public.users
      where id = any(coalesce(p_user_ids, '{}'::integer[]));
  end if;

  if cardinality(target_user_ids) = 0 then
    raise exception 'At least one target user is required.';
  end if;

  should_purge_accounts := 'users' = any(requested_datasets);
  if should_purge_accounts then
    select coalesce(array_agg(id), '{}'::integer[])
      into account_purge_user_ids
      from unnest(target_user_ids) id
      where id <> actor_user.id;

    if cardinality(account_purge_user_ids) = 0 then
      raise exception 'The active admin cannot be deleted.';
    end if;
  else
    account_purge_user_ids := '{}'::integer[];
  end if;

  purge_user_ids := case when should_purge_accounts then account_purge_user_ids else target_user_ids end;

  if 'roleplayer' = any(requested_datasets) or should_purge_accounts then
    with deleted as (delete from public.roleplayer_memories where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{roleplayer_memories}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.roleplayer_messages where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{roleplayer_messages}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.roleplayer_sessions where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{roleplayer_sessions}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.roleplayer_personas where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{roleplayer_personas}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.roleplayer_characters where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{roleplayer_characters}', to_jsonb(deleted_count), true);
  end if;

  if 'god_engine' = any(requested_datasets) or should_purge_accounts then
    update public.god_species
      set origin_event_id = null
      where user_id = any(purge_user_ids);

    with deleted as (delete from public.god_evolution_events where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{god_evolution_events}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.god_species where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{god_species}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.god_evolutions where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{god_evolutions}', to_jsonb(deleted_count), true);
  end if;

  if 'arc_studio' = any(requested_datasets) or should_purge_accounts then
    with deleted as (delete from public.arc_diagnostic_reports where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_diagnostic_reports}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_element_states where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_element_states}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_unit_links where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_unit_links}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_arc_stages where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_arc_stages}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_thread_units where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_thread_units}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_unit_elements where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_unit_elements}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_setups_payoffs where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_setups_payoffs}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_character_arcs where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_character_arcs}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_threads where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_threads}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_units where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_units}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.arc_projects where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{arc_projects}', to_jsonb(deleted_count), true);
  end if;

  if 'fusion' = any(requested_datasets) or should_purge_accounts then
    with deleted as (delete from public.fusion_game_discoveries where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{fusion_game_discoveries}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.fusion_game_level0_items where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{fusion_game_level0_items}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.fusion_games where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{fusion_games}', to_jsonb(deleted_count), true);
  end if;

  if 'listmaker' = any(requested_datasets) or should_purge_accounts then
    with deleted as (delete from public.listmaker_field_values where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{listmaker_field_values}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.listmaker_items where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{listmaker_items}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.listmaker_fields where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{listmaker_fields}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.listmaker_statuses where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{listmaker_statuses}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.listmaker_categories where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{listmaker_categories}', to_jsonb(deleted_count), true);

    with deleted as (delete from public.listmaker_lists where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{listmaker_lists}', to_jsonb(deleted_count), true);
  end if;

  if 'generation_jobs' = any(requested_datasets) or should_purge_accounts then
    with deleted as (delete from public.generation_jobs where user_id = any(purge_user_ids) returning 1)
    select count(*) into deleted_count from deleted;
    new_counts := jsonb_set(new_counts, '{generation_jobs}', to_jsonb(deleted_count), true);
  end if;

  select coalesce(array_agg(dataset), '{}'::text[])
    into legacy_datasets
    from unnest(requested_datasets) dataset
    where dataset = any(array[
      'universes',
      'elements',
      'element_types',
      'templates',
      'chronicle',
      'chat_repositories',
      'calendars',
      'todo',
      'source_documents',
      'image_generation',
      'movies',
      'episode_roulette',
      'stellar',
      'users'
    ]);

  if cardinality(legacy_datasets) > 0 then
    base_result := public.admin_purge_data_legacy(
      p_actor_auth_id,
      target_user_ids,
      false,
      legacy_datasets
    );
  end if;

  select coalesce(jsonb_object_agg(key, to_jsonb(total)), '{}'::jsonb)
    into merged_counts
    from (
      select key, sum(value::integer) as total
      from (
        select key, value from jsonb_each_text(new_counts)
        union all
        select key, value from jsonb_each_text(coalesce(base_result->'counts', '{}'::jsonb))
      ) count_rows
      group by key
    ) merged_rows;

  return jsonb_build_object(
    'ok', true,
    'requested_datasets', requested_datasets,
    'target_user_ids', target_user_ids,
    'account_purge_user_ids', coalesce(base_result->'account_purge_user_ids', to_jsonb(account_purge_user_ids)),
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
  actor_user public.users%rowtype;
  resolved_user_ids integer[];
  requested_datasets text[];
  passthrough_datasets text[];
  base_result jsonb := null;
  custom_counts jsonb := '{}'::jsonb;
  merged_counts jsonb := '{}'::jsonb;
  deleted_count integer := 0;
  use_custom_template_scope boolean := false;
begin
  if coalesce(p_confirmation, '') <> 'PURGE' then
    raise exception 'Type PURGE to confirm this destructive action.';
  end if;

  select *
    into actor_user
    from public.users
    where clerk_user_id = auth.uid()::text;

  if actor_user.id is null or coalesce(actor_user.admin, false) is not true then
    raise exception 'Only admins can purge data.';
  end if;

  select coalesce(array_agg(distinct dataset), '{}'::text[])
    into requested_datasets
    from unnest(coalesce(p_datasets, '{}'::text[])) dataset
    where dataset = any(array[
      'universes',
      'elements',
      'element_types',
      'templates',
      'chronicle',
      'chat_repositories',
      'calendars',
      'todo',
      'source_documents',
      'image_generation',
      'roleplayer',
      'god_engine',
      'arc_studio',
      'fusion',
      'listmaker',
      'generation_jobs',
      'movies',
      'episode_roulette',
      'stellar',
      'users'
    ]);

  if cardinality(requested_datasets) = 0 then
    raise exception 'At least one dataset is required.';
  end if;

  if coalesce(p_all_users, false) then
    select coalesce(array_agg(id order by email), '{}'::integer[])
      into resolved_user_ids
      from public.users;
  else
    select coalesce(array_agg(distinct id), '{}'::integer[])
      into resolved_user_ids
      from public.users
      where id = any(coalesce(p_user_ids, '{}'::integer[]));
  end if;

  if cardinality(resolved_user_ids) = 0 then
    raise exception 'At least one target user is required.';
  end if;

  if 'users' = any(requested_datasets) and actor_user.id = any(resolved_user_ids) then
    raise exception 'The active admin can purge their own data, but cannot delete their own user account.';
  end if;

  use_custom_template_scope :=
    'templates' = any(requested_datasets)
    and not ('element_types' = any(requested_datasets))
    and not ('users' = any(requested_datasets));

  passthrough_datasets := requested_datasets;

  if use_custom_template_scope then
    passthrough_datasets := array_remove(passthrough_datasets, 'templates');

    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(resolved_user_ids)
        and coalesce(ett.is_default, false) = false
    )
    update public.elements
      set rich_template_id = null
      where rich_template_id in (select id from target_templates);

    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(resolved_user_ids)
        and coalesce(ett.is_default, false) = false
    ),
    target_fields as (
      select id from public.element_type_template_fields where template_id in (select id from target_templates)
    ),
    deleted as (
      delete from public.element_template_field_values where template_field_id in (select id from target_fields) returning 1
    )
    select count(*) into deleted_count from deleted;
    custom_counts := jsonb_set(custom_counts, '{element_template_field_values}', to_jsonb(deleted_count), true);

    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(resolved_user_ids)
        and coalesce(ett.is_default, false) = false
    ),
    deleted as (
      delete from public.element_type_template_fields where template_id in (select id from target_templates) returning 1
    )
    select count(*) into deleted_count from deleted;
    custom_counts := jsonb_set(custom_counts, '{element_type_template_fields}', to_jsonb(deleted_count), true);

    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(resolved_user_ids)
        and coalesce(ett.is_default, false) = false
    ),
    deleted as (
      delete from public.element_template_sections where template_id in (select id from target_templates) returning 1
    )
    select count(*) into deleted_count from deleted;
    custom_counts := jsonb_set(custom_counts, '{element_template_sections}', to_jsonb(deleted_count), true);

    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(resolved_user_ids)
        and coalesce(ett.is_default, false) = false
    ),
    deleted as (
      delete from public.element_type_templates where id in (select id from target_templates) returning 1
    )
    select count(*) into deleted_count from deleted;
    custom_counts := jsonb_set(custom_counts, '{element_type_templates}', to_jsonb(deleted_count), true);
  end if;

  if cardinality(passthrough_datasets) > 0 then
    base_result := public.admin_purge_data(
      auth.uid()::text,
      resolved_user_ids,
      false,
      passthrough_datasets
    );
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
    'target_user_ids', resolved_user_ids,
    'account_purge_user_ids', coalesce(base_result->'account_purge_user_ids', '[]'::jsonb),
    'counts', merged_counts
  );
end;
$$;

create or replace function public.list_admin_user_activity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.users%rowtype;
  users_payload jsonb;
begin
  select *
    into actor_user
    from public.users
    where clerk_user_id = auth.uid()::text
      and coalesce(deleted, false) = false;

  if actor_user.id is null or coalesce(actor_user.admin, false) is not true then
    raise exception 'Only admins can view user activity.';
  end if;

  with user_counts as (
    select
      u.id,
      u.email,
      u.display_name,
      u.avatar_url,
      u.admin,
      u.created_at,
      public.get_admin_purge_user_object_counts(u.id) as object_counts
    from public.users u
    where coalesce(u.deleted, false) = false
  ),
  activity as (
    select
      user_counts.*,
      user_counts.created_at as user_account_last,
      public.admin_user_table_latest('universes', user_counts.id) as universes_last,
      public.admin_user_table_latest('elements', user_counts.id) as elements_last,
      public.admin_user_table_latest('element_types', user_counts.id) as element_types_last,
      public.admin_user_table_latest('element_type_templates', user_counts.id) as templates_last,
      public.admin_user_table_latest('chronicle_modules', user_counts.id) as chronicle_last,
      public.admin_user_table_latest('chat_logs', user_counts.id) as chat_repositories_last,
      greatest(
        coalesce(public.admin_user_table_latest('calendars', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('categories', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('events', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('event_exceptions', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('calendar_permissions', user_counts.id), 'epoch'::timestamptz)
      ) as calendars_last,
      public.admin_user_table_latest('todo_tasks', user_counts.id) as todo_last,
      public.admin_user_table_latest('universe_source_documents', user_counts.id) as source_documents_last,
      greatest(
        coalesce(public.admin_user_table_latest('image_generation_sessions', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('image_generation_messages', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('image_generation_assets', user_counts.id), 'epoch'::timestamptz)
      ) as image_generation_last,
      greatest(
        coalesce(public.admin_user_table_latest('roleplayer_characters', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('roleplayer_personas', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('roleplayer_sessions', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('roleplayer_messages', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('roleplayer_memories', user_counts.id), 'epoch'::timestamptz)
      ) as roleplayer_last,
      greatest(
        coalesce(public.admin_user_table_latest('god_evolutions', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('god_species', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('god_evolution_events', user_counts.id), 'epoch'::timestamptz)
      ) as god_engine_last,
      greatest(
        coalesce(public.admin_user_table_latest('arc_projects', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_units', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_unit_elements', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_threads', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_thread_units', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_character_arcs', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_arc_stages', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_setups_payoffs', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_unit_links', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_element_states', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('arc_diagnostic_reports', user_counts.id), 'epoch'::timestamptz)
      ) as arc_studio_last,
      greatest(
        coalesce(public.admin_user_table_latest('fusion_games', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('fusion_game_level0_items', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('fusion_game_discoveries', user_counts.id), 'epoch'::timestamptz)
      ) as fusion_last,
      greatest(
        coalesce(public.admin_user_table_latest('listmaker_lists', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('listmaker_categories', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('listmaker_statuses', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('listmaker_fields', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('listmaker_items', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('listmaker_field_values', user_counts.id), 'epoch'::timestamptz)
      ) as listmaker_last,
      public.admin_user_table_latest('generation_jobs', user_counts.id) as generation_jobs_last,
      greatest(
        coalesce(public.admin_user_table_latest('movies', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('franchise', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('collections', user_counts.id), 'epoch'::timestamptz)
      ) as movies_last,
      public.admin_user_table_latest('recent_shows', user_counts.id) as episode_roulette_last,
      greatest(
        coalesce(public.admin_user_table_latest('stellar_systems', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_stars', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_planets', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_moons', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_lifeforms', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_colonies', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_colonists', user_counts.id), 'epoch'::timestamptz)
      ) as stellar_last
    from user_counts
  ),
  assembled as (
    select
      activity.*,
      (select coalesce(sum(value::integer), 0) from jsonb_each_text(activity.object_counts)) as object_total,
      nullif(greatest(
        coalesce(user_account_last, 'epoch'::timestamptz),
        coalesce(universes_last, 'epoch'::timestamptz),
        coalesce(elements_last, 'epoch'::timestamptz),
        coalesce(element_types_last, 'epoch'::timestamptz),
        coalesce(templates_last, 'epoch'::timestamptz),
        coalesce(chronicle_last, 'epoch'::timestamptz),
        coalesce(chat_repositories_last, 'epoch'::timestamptz),
        coalesce(calendars_last, 'epoch'::timestamptz),
        coalesce(todo_last, 'epoch'::timestamptz),
        coalesce(source_documents_last, 'epoch'::timestamptz),
        coalesce(image_generation_last, 'epoch'::timestamptz),
        coalesce(roleplayer_last, 'epoch'::timestamptz),
        coalesce(god_engine_last, 'epoch'::timestamptz),
        coalesce(arc_studio_last, 'epoch'::timestamptz),
        coalesce(fusion_last, 'epoch'::timestamptz),
        coalesce(listmaker_last, 'epoch'::timestamptz),
        coalesce(generation_jobs_last, 'epoch'::timestamptz),
        coalesce(movies_last, 'epoch'::timestamptz),
        coalesce(episode_roulette_last, 'epoch'::timestamptz),
        coalesce(stellar_last, 'epoch'::timestamptz)
      ), 'epoch'::timestamptz) as last_activity_at
    from activity
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'email', email,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'admin', admin,
      'created_at', created_at,
      'is_current_user', id = actor_user.id,
      'object_counts', object_counts,
      'object_total', object_total,
      'last_activity_at', last_activity_at,
      'modules', jsonb_build_array(
        jsonb_build_object('id', 'user_account', 'label', 'User Account', 'count', coalesce((object_counts->>'user_account')::integer, 0), 'latest_activity_at', user_account_last),
        jsonb_build_object('id', 'universes', 'label', 'Universes', 'count', coalesce((object_counts->>'universes')::integer, 0), 'latest_activity_at', universes_last),
        jsonb_build_object('id', 'elements', 'label', 'Elements', 'count', coalesce((object_counts->>'elements')::integer, 0), 'latest_activity_at', elements_last),
        jsonb_build_object('id', 'element_types', 'label', 'Custom Element Types', 'count', coalesce((object_counts->>'element_types')::integer, 0), 'latest_activity_at', element_types_last),
        jsonb_build_object('id', 'templates', 'label', 'Custom Templates', 'count', coalesce((object_counts->>'templates')::integer, 0), 'latest_activity_at', templates_last),
        jsonb_build_object('id', 'chronicle', 'label', 'Chronicle', 'count', coalesce((object_counts->>'chronicle')::integer, 0), 'latest_activity_at', chronicle_last),
        jsonb_build_object('id', 'chat_repositories', 'label', 'Chat Repositories', 'count', coalesce((object_counts->>'chat_repositories')::integer, 0), 'latest_activity_at', chat_repositories_last),
        jsonb_build_object('id', 'calendars', 'label', 'Calendars', 'count', coalesce((object_counts->>'calendars')::integer, 0), 'latest_activity_at', calendars_last),
        jsonb_build_object('id', 'todo', 'label', 'ToDo', 'count', coalesce((object_counts->>'todo')::integer, 0), 'latest_activity_at', todo_last),
        jsonb_build_object('id', 'source_documents', 'label', 'Source Material', 'count', coalesce((object_counts->>'source_documents')::integer, 0), 'latest_activity_at', source_documents_last),
        jsonb_build_object('id', 'image_generation', 'label', 'Image Generation', 'count', coalesce((object_counts->>'image_generation')::integer, 0), 'latest_activity_at', image_generation_last),
        jsonb_build_object('id', 'roleplayer', 'label', 'Roleplayer', 'count', coalesce((object_counts->>'roleplayer')::integer, 0), 'latest_activity_at', roleplayer_last),
        jsonb_build_object('id', 'god_engine', 'label', 'God Engine', 'count', coalesce((object_counts->>'god_engine')::integer, 0), 'latest_activity_at', god_engine_last),
        jsonb_build_object('id', 'arc_studio', 'label', 'Arc Studio', 'count', coalesce((object_counts->>'arc_studio')::integer, 0), 'latest_activity_at', arc_studio_last),
        jsonb_build_object('id', 'fusion', 'label', 'Fusion', 'count', coalesce((object_counts->>'fusion')::integer, 0), 'latest_activity_at', fusion_last),
        jsonb_build_object('id', 'listmaker', 'label', 'ListMaker', 'count', coalesce((object_counts->>'listmaker')::integer, 0), 'latest_activity_at', listmaker_last),
        jsonb_build_object('id', 'generation_jobs', 'label', 'Generation Jobs', 'count', coalesce((object_counts->>'generation_jobs')::integer, 0), 'latest_activity_at', generation_jobs_last),
        jsonb_build_object('id', 'movies', 'label', 'Movies', 'count', coalesce((object_counts->>'movies')::integer, 0), 'latest_activity_at', movies_last),
        jsonb_build_object('id', 'episode_roulette', 'label', 'Episode Roulette', 'count', coalesce((object_counts->>'episode_roulette')::integer, 0), 'latest_activity_at', episode_roulette_last),
        jsonb_build_object('id', 'stellar', 'label', 'Stellar Architect', 'count', coalesce((object_counts->>'stellar')::integer, 0), 'latest_activity_at', stellar_last)
      )
    ) order by last_activity_at desc nulls last, lower(coalesce(email, ''))), '[]'::jsonb)
    into users_payload
    from assembled;

  return jsonb_build_object(
    'generatedAt', now(),
    'actingUserId', actor_user.id,
    'users', users_payload
  );
end;
$$;

revoke all on function public.get_admin_purge_user_object_counts(integer) from public;
revoke all on function public.get_admin_purge_user_object_counts(integer) from anon;
revoke all on function public.get_admin_purge_user_object_counts(integer) from authenticated;
revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from public;
revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from anon;
revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from authenticated;
grant execute on function public.admin_purge_data(text, integer[], boolean, text[]) to service_role;
revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from public;
revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from anon;
grant execute on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) to authenticated;
revoke all on function public.list_admin_user_activity() from public;
revoke all on function public.list_admin_user_activity() from anon;
grant execute on function public.list_admin_user_activity() to authenticated;

commit;
