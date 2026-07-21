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
      from public.users
      where id <> actor_user.id;
  else
    select coalesce(array_agg(distinct id), '{}'::integer[])
      into resolved_user_ids
      from public.users
      where id = any(coalesce(p_user_ids, '{}'::integer[]))
        and id <> actor_user.id;
  end if;

  if cardinality(resolved_user_ids) = 0 then
    raise exception 'At least one target user is required.';
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

revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from public;
revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from anon;
grant execute on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) to authenticated;
