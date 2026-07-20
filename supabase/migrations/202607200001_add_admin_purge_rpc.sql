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
  requested_datasets text[];
  should_purge_accounts boolean;
  result jsonb := '{}'::jsonb;
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

  if 'universes' = any(requested_datasets) or should_purge_accounts then
    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_elements as (
      select id from public.elements where universe_id in (select id from target_universes)
    ),
    deleted as (
      delete from public.image_table where object_id in (
        select id from target_universes union select id from target_elements
      ) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{image_table}', to_jsonb(coalesce((result->>'image_table')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_elements as (
      select id from public.elements where universe_id in (select id from target_universes)
    ),
    deleted as (
      delete from public.builder_images where object_id in (
        select id from target_universes union select id from target_elements
      ) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{builder_images}', to_jsonb(coalesce((result->>'builder_images')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_chats as (
      select id from public.universe_ai_chats where universe_id in (select id from target_universes)
    ),
    target_messages as (
      select id from public.universe_ai_messages where chat_id in (select id from target_chats)
    ),
    deleted as (
      delete from public.universe_ai_proposals
      where universe_id in (select id from target_universes)
        or chat_id in (select id from target_chats)
        or source_user_message_id in (select id from target_messages)
        or assistant_message_id in (select id from target_messages)
      returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universe_ai_proposals}', to_jsonb(deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_chats as (
      select id from public.universe_ai_chats where universe_id in (select id from target_universes)
    ),
    deleted as (
      delete from public.universe_ai_messages where chat_id in (select id from target_chats) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universe_ai_messages}', to_jsonb(deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.universe_ai_chats where universe_id in (select id from target_universes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universe_ai_chats}', to_jsonb(deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.universe_ai_sources where universe_id in (select id from target_universes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universe_ai_sources}', to_jsonb(deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_elements as (
      select id from public.elements where universe_id in (select id from target_universes)
    ),
    target_views as (
      select id from public.expanded_views where universe_id in (select id from target_universes) or element_id in (select id from target_elements)
    ),
    target_nodes as (
      select id from public.expanded_view_nodes where expanded_view_id in (select id from target_views)
    ),
    deleted as (
      delete from public.expanded_view_node_fields where node_id in (select id from target_nodes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{expanded_view_node_fields}', to_jsonb(coalesce((result->>'expanded_view_node_fields')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_elements as (
      select id from public.elements where universe_id in (select id from target_universes)
    ),
    target_views as (
      select id from public.expanded_views where universe_id in (select id from target_universes) or element_id in (select id from target_elements)
    ),
    target_nodes as (
      select id from public.expanded_view_nodes where expanded_view_id in (select id from target_views)
    ),
    deleted as (
      delete from public.expanded_view_edges
      where expanded_view_id in (select id from target_views)
         or source_node_id in (select id from target_nodes)
         or target_node_id in (select id from target_nodes)
      returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{expanded_view_edges}', to_jsonb(coalesce((result->>'expanded_view_edges')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_elements as (
      select id from public.elements where universe_id in (select id from target_universes)
    ),
    target_views as (
      select id from public.expanded_views where universe_id in (select id from target_universes) or element_id in (select id from target_elements)
    ),
    deleted as (
      delete from public.expanded_view_nodes where expanded_view_id in (select id from target_views) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{expanded_view_nodes}', to_jsonb(coalesce((result->>'expanded_view_nodes')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_elements as (
      select id from public.elements where universe_id in (select id from target_universes)
    ),
    deleted as (
      delete from public.expanded_views where universe_id in (select id from target_universes) or element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{expanded_views}', to_jsonb(coalesce((result->>'expanded_views')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_layers as (
      select id from public.universe_layers where universe_id in (select id from target_universes)
    ),
    deleted as (
      delete from public.element_layer_assignments where universe_id in (select id from target_universes) or layer_id in (select id from target_layers) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_layer_assignments}', to_jsonb(coalesce((result->>'element_layer_assignments')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_layers as (
      select id from public.universe_layers where universe_id in (select id from target_universes)
    ),
    deleted as (
      delete from public.universe_layer_entries where layer_id in (select id from target_layers) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universe_layer_entries}', to_jsonb(deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.universe_layers where universe_id in (select id from target_universes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universe_layers}', to_jsonb(deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_elements as (
      select id from public.elements where universe_id in (select id from target_universes)
    ),
    deleted as (
      delete from public.element_links
      where universe_id in (select id from target_universes)
         or source_element_id in (select id from target_elements)
         or target_element_id in (select id from target_elements)
      returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_links}', to_jsonb(coalesce((result->>'element_links')::integer, 0) + deleted_count), true);

    with target_elements as (
      select e.id
      from public.elements e
      join public.universes u on u.id = e.universe_id
      where u.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.chronicle_modules where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{chronicle_modules}', to_jsonb(coalesce((result->>'chronicle_modules')::integer, 0) + deleted_count), true);

    with target_elements as (
      select e.id
      from public.elements e
      join public.universes u on u.id = e.universe_id
      where u.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_template_field_values where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_template_field_values}', to_jsonb(coalesce((result->>'element_template_field_values')::integer, 0) + deleted_count), true);

    with target_elements as (
      select e.id
      from public.elements e
      join public.universes u on u.id = e.universe_id
      where u.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_custom_fields where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_custom_fields}', to_jsonb(coalesce((result->>'element_custom_fields')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.canvas_notes where universe_id in (select id from target_universes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{canvas_notes}', to_jsonb(deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.canvas_groups where universe_id in (select id from target_universes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{canvas_groups}', to_jsonb(deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.universe_custom_fields where universe_id in (select id from target_universes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universe_custom_fields}', to_jsonb(deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.universe_source_documents where universe_id in (select id from target_universes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universe_source_documents}', to_jsonb(coalesce((result->>'universe_source_documents')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.elements where universe_id in (select id from target_universes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{elements}', to_jsonb(coalesce((result->>'elements')::integer, 0) + deleted_count), true);

    with target_universes as (
      select id from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_groups where universe_id in (select id from target_universes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_groups}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.universes where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universes}', to_jsonb(deleted_count), true);
  end if;

  if 'elements' = any(requested_datasets) or should_purge_accounts then
    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.image_table where object_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{image_table}', to_jsonb(coalesce((result->>'image_table')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.builder_images where object_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{builder_images}', to_jsonb(coalesce((result->>'builder_images')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_views as (
      select id from public.expanded_views where element_id in (select id from target_elements)
    ),
    target_nodes as (
      select id from public.expanded_view_nodes where expanded_view_id in (select id from target_views)
    ),
    deleted as (
      delete from public.expanded_view_node_fields where node_id in (select id from target_nodes) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{expanded_view_node_fields}', to_jsonb(coalesce((result->>'expanded_view_node_fields')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_views as (
      select id from public.expanded_views where element_id in (select id from target_elements)
    ),
    target_nodes as (
      select id from public.expanded_view_nodes where expanded_view_id in (select id from target_views)
    ),
    deleted as (
      delete from public.expanded_view_edges
      where expanded_view_id in (select id from target_views)
         or source_node_id in (select id from target_nodes)
         or target_node_id in (select id from target_nodes)
      returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{expanded_view_edges}', to_jsonb(coalesce((result->>'expanded_view_edges')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_views as (
      select id from public.expanded_views where element_id in (select id from target_elements)
    ),
    deleted as (
      delete from public.expanded_view_nodes where expanded_view_id in (select id from target_views) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{expanded_view_nodes}', to_jsonb(coalesce((result->>'expanded_view_nodes')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.expanded_views where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{expanded_views}', to_jsonb(coalesce((result->>'expanded_views')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_links where source_element_id in (select id from target_elements) or target_element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_links}', to_jsonb(coalesce((result->>'element_links')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_layer_assignments where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_layer_assignments}', to_jsonb(coalesce((result->>'element_layer_assignments')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.chronicle_modules where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{chronicle_modules}', to_jsonb(coalesce((result->>'chronicle_modules')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_template_field_values where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_template_field_values}', to_jsonb(coalesce((result->>'element_template_field_values')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_custom_fields where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_custom_fields}', to_jsonb(coalesce((result->>'element_custom_fields')::integer, 0) + deleted_count), true);

    update public.elements
      set group_id = null
      where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end);

    with deleted as (
      delete from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{elements}', to_jsonb(coalesce((result->>'elements')::integer, 0) + deleted_count), true);
  end if;

  if 'chronicle' = any(requested_datasets) or should_purge_accounts then
    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.chronicle_modules where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{chronicle_modules}', to_jsonb(coalesce((result->>'chronicle_modules')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_template_field_values where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_template_field_values}', to_jsonb(coalesce((result->>'element_template_field_values')::integer, 0) + deleted_count), true);

    with target_elements as (
      select id from public.elements where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_custom_fields where element_id in (select id from target_elements) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_custom_fields}', to_jsonb(coalesce((result->>'element_custom_fields')::integer, 0) + deleted_count), true);
  end if;

  if 'templates' = any(requested_datasets) or 'element_types' = any(requested_datasets) or should_purge_accounts then
    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    )
    update public.elements
      set rich_template_id = null
      where rich_template_id in (select id from target_templates);

    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_fields as (
      select id from public.element_type_template_fields where template_id in (select id from target_templates)
    ),
    deleted as (
      delete from public.element_template_field_values where template_field_id in (select id from target_fields) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_template_field_values}', to_jsonb(coalesce((result->>'element_template_field_values')::integer, 0) + deleted_count), true);

    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_type_template_fields where template_id in (select id from target_templates) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_type_template_fields}', to_jsonb(deleted_count), true);

    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_template_sections where template_id in (select id from target_templates) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_template_sections}', to_jsonb(deleted_count), true);

    with target_templates as (
      select ett.id
      from public.element_type_templates ett
      join public.element_types et on et.id = ett.element_type_id
      where et.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.element_type_templates where id in (select id from target_templates) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_type_templates}', to_jsonb(deleted_count), true);
  end if;

  if 'element_types' = any(requested_datasets) or should_purge_accounts then
    update public.elements
      set element_type_id = null
      where element_type_id in (
        select id from public.element_types where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
      );

    with deleted as (
      delete from public.element_types where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{element_types}', to_jsonb(deleted_count), true);
  end if;

  if 'chat_repositories' = any(requested_datasets) or should_purge_accounts then
    with deleted as (
      delete from public.chat_logs where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{chat_logs}', to_jsonb(deleted_count), true);
  end if;

  if 'calendars' = any(requested_datasets) or should_purge_accounts then
    with target_events as (
      select e.id
      from public.events e
      left join public.calendars c on c.id = e.calendar_id
      left join public.categories cat on cat.id = e.category_id
      where c.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
         or cat.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.reminders where event_id in (select id from target_events) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{reminders}', to_jsonb(deleted_count), true);

    with target_events as (
      select e.id
      from public.events e
      left join public.calendars c on c.id = e.calendar_id
      left join public.categories cat on cat.id = e.category_id
      where c.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
         or cat.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.event_recurrence_rules where event_id in (select id from target_events) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{event_recurrence_rules}', to_jsonb(deleted_count), true);

    with target_events as (
      select e.id
      from public.events e
      left join public.calendars c on c.id = e.calendar_id
      left join public.categories cat on cat.id = e.category_id
      where c.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
         or cat.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.event_exceptions where parent_event_id in (select id from target_events) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{event_exceptions}', to_jsonb(deleted_count), true);

    with target_events as (
      select e.id
      from public.events e
      left join public.calendars c on c.id = e.calendar_id
      left join public.categories cat on cat.id = e.category_id
      where c.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
         or cat.user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.events where id in (select id from target_events) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{events}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.calendar_permissions
      where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
         or calendar_id in (
           select id from public.calendars where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
         )
      returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{calendar_permissions}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.calendars where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{calendars}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.categories where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{categories}', to_jsonb(deleted_count), true);
  end if;

  if 'todo' = any(requested_datasets) or should_purge_accounts then
    with target_tasks as (
      select id from public.todo_tasks where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.todo_subtasks where task_id in (select id from target_tasks) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{todo_subtasks}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.todo_tasks where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{todo_tasks}', to_jsonb(deleted_count), true);
  end if;

  if 'source_documents' = any(requested_datasets) or should_purge_accounts then
    with deleted as (
      delete from public.universe_source_documents where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{universe_source_documents}', to_jsonb(coalesce((result->>'universe_source_documents')::integer, 0) + deleted_count), true);
  end if;

  if 'image_generation' = any(requested_datasets) or should_purge_accounts then
    with deleted as (
      delete from public.image_generation_assets where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{image_generation_assets}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.image_generation_messages where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{image_generation_messages}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.image_generation_sessions where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{image_generation_sessions}', to_jsonb(deleted_count), true);
  end if;

  if 'movies' = any(requested_datasets) or should_purge_accounts then
    with target_franchise as (
      select id from public.franchise where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    target_collections as (
      select id from public.collections where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
    ),
    deleted as (
      delete from public.movies
      where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end)
         or franchise_id in (select id from target_franchise)
         or collection_id in (select id from target_collections)
      returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{movies}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.franchise where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{franchise}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.collections where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{collections}', to_jsonb(deleted_count), true);
  end if;

  if 'episode_roulette' = any(requested_datasets) or should_purge_accounts then
    with deleted as (
      delete from public.recent_shows where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{recent_shows}', to_jsonb(deleted_count), true);
  end if;

  if 'stellar' = any(requested_datasets) or should_purge_accounts then
    with deleted as (
      delete from public.stellar_colonists where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{stellar_colonists}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.stellar_colonies where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{stellar_colonies}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.stellar_lifeforms where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{stellar_lifeforms}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.stellar_moons where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{stellar_moons}', to_jsonb(deleted_count), true);

    update public.stellar_planets
      set star_id = null
      where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end);

    with deleted as (
      delete from public.stellar_planets where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{stellar_planets}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.stellar_stars where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{stellar_stars}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.stellar_systems where user_id = any(case when should_purge_accounts then account_purge_user_ids else target_user_ids end) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{stellar_systems}', to_jsonb(deleted_count), true);
  end if;

  if should_purge_accounts then
    with target_simulations as (
      select id from public.what_if_simulations where user_id = any(account_purge_user_ids)
    ),
    target_iterations as (
      select id from public.what_if_iterations where simulation_id in (select id from target_simulations)
    ),
    deleted as (
      delete from public.what_if_phases where iteration_id in (select id from target_iterations) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{what_if_phases}', to_jsonb(deleted_count), true);

    with target_simulations as (
      select id from public.what_if_simulations where user_id = any(account_purge_user_ids)
    ),
    deleted as (
      delete from public.what_if_iterations where simulation_id in (select id from target_simulations) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{what_if_iterations}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.what_if_simulations where user_id = any(account_purge_user_ids) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{what_if_simulations}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.analytics_aggregates where user_id = any(account_purge_user_ids) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{analytics_aggregates}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.user_settings where user_id = any(account_purge_user_ids) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{user_settings}', to_jsonb(deleted_count), true);

    with deleted as (
      delete from public.users where id = any(account_purge_user_ids) returning 1
    )
    select count(*) into deleted_count from deleted;
    result := jsonb_set(result, '{users}', to_jsonb(deleted_count), true);
  end if;

  return jsonb_build_object(
    'ok', true,
    'requested_datasets', requested_datasets,
    'target_user_ids', target_user_ids,
    'account_purge_user_ids', account_purge_user_ids,
    'counts', result
  );
end;
$$;

revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from public;
revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from anon;
revoke all on function public.admin_purge_data(text, integer[], boolean, text[]) from authenticated;
grant execute on function public.admin_purge_data(text, integer[], boolean, text[]) to service_role;
