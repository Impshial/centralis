begin;

create or replace function public.touch_listmaker_list_from_child()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.listmaker_bulk_import', true) = 'on' then
    if TG_OP = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if TG_OP = 'DELETE' then
    update public.listmaker_lists set updated_at = now() where id = old.list_id;
    return old;
  end if;

  update public.listmaker_lists set updated_at = now() where id = new.list_id;
  return new;
end;
$$;

create or replace function public.import_listmaker_json(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id integer;
  v_list jsonb;
  v_categories jsonb;
  v_statuses jsonb;
  v_fields jsonb;
  v_items jsonb;
  v_list_id uuid;
  v_row jsonb;
  v_item jsonb;
  v_value jsonb;
  v_position bigint;
  v_value_position bigint;
  v_key text;
  v_name text;
  v_template_key text;
  v_rating_type text;
  v_default_view text;
  v_completed_items text;
  v_field_type text;
  v_color text;
  v_options jsonb;
  v_child_id uuid;
  v_item_id uuid;
  v_category_id uuid;
  v_status_id uuid;
  v_field_id uuid;
  v_category_ids jsonb := '{}'::jsonb;
  v_status_ids jsonb := '{}'::jsonb;
  v_field_ids jsonb := '{}'::jsonb;
  v_field_types jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select users.id
    into v_user_id
  from public.users
  where users.clerk_user_id = auth.uid()::text
  limit 1;

  if v_user_id is null then
    raise exception 'The authenticated Centralis user could not be found.' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Import payload must be a JSON object.' using errcode = '22023';
  end if;

  v_list := p_payload -> 'list';
  if v_list is null or jsonb_typeof(v_list) <> 'object' then
    raise exception 'Import payload must include a list object.' using errcode = '22023';
  end if;

  v_categories := coalesce(p_payload -> 'categories', '[]'::jsonb);
  v_statuses := coalesce(p_payload -> 'statuses', '[]'::jsonb);
  v_fields := coalesce(p_payload -> 'fields', '[]'::jsonb);
  v_items := coalesce(p_payload -> 'items', '[]'::jsonb);

  if jsonb_typeof(v_categories) <> 'array'
    or jsonb_typeof(v_statuses) <> 'array'
    or jsonb_typeof(v_fields) <> 'array'
    or jsonb_typeof(v_items) <> 'array' then
    raise exception 'Categories, statuses, fields, and items must be arrays.' using errcode = '22023';
  end if;

  if jsonb_array_length(v_categories) > 100 then
    raise exception 'An imported list can contain at most 100 categories.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_statuses) > 100 then
    raise exception 'An imported list can contain at most 100 statuses.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_fields) > 20 then
    raise exception 'An imported list can contain at most 20 custom fields.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 5000 then
    raise exception 'An imported list can contain at most 5000 items.' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(v_list ->> 'title', ''));
  if char_length(v_name) < 1 or char_length(v_name) > 180 then
    raise exception 'List title must contain between 1 and 180 characters.' using errcode = '22023';
  end if;

  v_template_key := btrim(coalesce(v_list ->> 'template_key', 'custom'));
  if v_template_key not in (
    'blank', 'checklist', 'ranked', 'scored', 'categorized', 'pros-cons',
    'inventory', 'comparison', 'notes', 'shopping', 'packing', 'favorites',
    'brainstorm', 'custom'
  ) then
    raise exception 'Unsupported ListMaker template key.' using errcode = '22023';
  end if;

  v_rating_type := nullif(btrim(coalesce(v_list ->> 'rating_type', '')), '');
  if v_rating_type is not null and v_rating_type not in ('stars_5', 'number_10', 'percentage', 'thumbs') then
    raise exception 'Unsupported ListMaker rating type.' using errcode = '22023';
  end if;

  v_default_view := btrim(coalesce(v_list ->> 'default_view', 'list'));
  if v_default_view not in ('list', 'table') then
    raise exception 'Unsupported ListMaker default view.' using errcode = '22023';
  end if;

  v_completed_items := btrim(coalesce(v_list -> 'settings' ->> 'completedItems', 'keep'));
  if v_completed_items not in ('keep', 'bottom', 'hide') then
    v_completed_items := 'keep';
  end if;

  perform set_config('app.listmaker_bulk_import', 'on', true);

  insert into public.listmaker_lists (
    user_id,
    title,
    description,
    template_key,
    behaviors,
    rating_type,
    default_view,
    settings,
    archived_at,
    deleted_at,
    deleted_by
  ) values (
    v_user_id,
    v_name,
    left(btrim(coalesce(v_list ->> 'description', '')), 10000),
    v_template_key,
    jsonb_build_object(
      'checklist', coalesce((v_list -> 'behaviors' ->> 'checklist')::boolean, false),
      'ranked', coalesce((v_list -> 'behaviors' ->> 'ranked')::boolean, false),
      'scored', coalesce((v_list -> 'behaviors' ->> 'scored')::boolean, false),
      'categorized', coalesce((v_list -> 'behaviors' ->> 'categorized')::boolean, false),
      'status', coalesce((v_list -> 'behaviors' ->> 'status')::boolean, false),
      'custom_fields', coalesce((v_list -> 'behaviors' ->> 'custom_fields')::boolean, false),
      'rating', coalesce((v_list -> 'behaviors' ->> 'rating')::boolean, false)
    ),
    v_rating_type,
    v_default_view,
    jsonb_build_object('completedItems', v_completed_items),
    null,
    null,
    null
  ) returning id into v_list_id;

  for v_row, v_position in
    select value, ordinality from jsonb_array_elements(v_categories) with ordinality
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'Every category must be an object.' using errcode = '22023';
    end if;
    v_key := btrim(coalesce(v_row ->> 'key', ''));
    v_name := btrim(coalesce(v_row ->> 'name', ''));
    if v_key = '' or char_length(v_key) > 80 or v_category_ids ? v_key then
      raise exception 'Every category needs a unique key of 80 characters or fewer.' using errcode = '22023';
    end if;
    if char_length(v_name) < 1 or char_length(v_name) > 120 then
      raise exception 'Category names must contain between 1 and 120 characters.' using errcode = '22023';
    end if;
    insert into public.listmaker_categories (list_id, user_id, name, sort_order, collapsed)
    values (
      v_list_id,
      v_user_id,
      v_name,
      coalesce((v_row ->> 'sort_order')::integer, v_position::integer * 100),
      coalesce((v_row ->> 'collapsed')::boolean, false)
    ) returning id into v_child_id;
    v_category_ids := v_category_ids || jsonb_build_object(v_key, v_child_id::text);
  end loop;

  for v_row, v_position in
    select value, ordinality from jsonb_array_elements(v_statuses) with ordinality
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'Every status must be an object.' using errcode = '22023';
    end if;
    v_key := btrim(coalesce(v_row ->> 'key', ''));
    v_name := btrim(coalesce(v_row ->> 'name', ''));
    if v_key = '' or char_length(v_key) > 80 or v_status_ids ? v_key then
      raise exception 'Every status needs a unique key of 80 characters or fewer.' using errcode = '22023';
    end if;
    if char_length(v_name) < 1 or char_length(v_name) > 120 then
      raise exception 'Status names must contain between 1 and 120 characters.' using errcode = '22023';
    end if;
    v_color := btrim(coalesce(v_row ->> 'color', '#6366f1'));
    if v_color !~ '^#[0-9a-fA-F]{6}$' then
      v_color := '#6366f1';
    end if;
    insert into public.listmaker_statuses (list_id, user_id, name, color, sort_order)
    values (
      v_list_id,
      v_user_id,
      v_name,
      v_color,
      coalesce((v_row ->> 'sort_order')::integer, v_position::integer * 100)
    ) returning id into v_child_id;
    v_status_ids := v_status_ids || jsonb_build_object(v_key, v_child_id::text);
  end loop;

  for v_row, v_position in
    select value, ordinality from jsonb_array_elements(v_fields) with ordinality
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'Every field must be an object.' using errcode = '22023';
    end if;
    v_key := btrim(coalesce(v_row ->> 'key', ''));
    v_name := btrim(coalesce(v_row ->> 'name', ''));
    v_field_type := btrim(coalesce(v_row ->> 'field_type', 'text'));
    if v_key = '' or char_length(v_key) > 80 or v_field_ids ? v_key then
      raise exception 'Every field needs a unique key of 80 characters or fewer.' using errcode = '22023';
    end if;
    if char_length(v_name) < 1 or char_length(v_name) > 120 then
      raise exception 'Field names must contain between 1 and 120 characters.' using errcode = '22023';
    end if;
    if v_field_type not in ('text', 'link', 'number', 'checkbox', 'date', 'dropdown', 'long_text') then
      raise exception 'Unsupported ListMaker field type.' using errcode = '22023';
    end if;
    v_options := coalesce(v_row -> 'dropdown_options', '[]'::jsonb);
    if jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) > 50 then
      raise exception 'Dropdown options must be an array with at most 50 choices.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_options) as option_value
      where jsonb_typeof(option_value) <> 'string'
        or char_length(btrim(option_value #>> '{}')) < 1
    ) then
      raise exception 'Every dropdown option must be a nonempty string.' using errcode = '22023';
    end if;
    insert into public.listmaker_fields (list_id, user_id, name, field_type, dropdown_options, sort_order, visible)
    values (
      v_list_id,
      v_user_id,
      v_name,
      v_field_type,
      v_options,
      coalesce((v_row ->> 'sort_order')::integer, v_position::integer * 100),
      coalesce((v_row ->> 'visible')::boolean, true)
    ) returning id into v_child_id;
    v_field_ids := v_field_ids || jsonb_build_object(v_key, v_child_id::text);
    v_field_types := v_field_types || jsonb_build_object(v_key, v_field_type);
  end loop;

  for v_item, v_position in
    select value, ordinality from jsonb_array_elements(v_items) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Every item must be an object.' using errcode = '22023';
    end if;

    v_key := nullif(btrim(coalesce(v_item ->> 'category_key', '')), '');
    if v_key is not null and not (v_category_ids ? v_key) then
      raise exception 'An item references an unknown category.' using errcode = '22023';
    end if;
    v_category_id := case when v_key is null then null else (v_category_ids ->> v_key)::uuid end;

    v_key := nullif(btrim(coalesce(v_item ->> 'status_key', '')), '');
    if v_key is not null and not (v_status_ids ? v_key) then
      raise exception 'An item references an unknown status.' using errcode = '22023';
    end if;
    v_status_id := case when v_key is null then null else (v_status_ids ->> v_key)::uuid end;

    insert into public.listmaker_items (
      list_id, user_id, title, completed, manual_order, score, rating,
      category_id, status_id, notes, deleted_at, deleted_by
    ) values (
      v_list_id,
      v_user_id,
      left(coalesce(nullif(btrim(v_item ->> 'title'), ''), 'Untitled item'), 1000),
      coalesce((v_item ->> 'completed')::boolean, false),
      coalesce((v_item ->> 'manual_order')::integer, v_position::integer * 100),
      case when nullif(v_item ->> 'score', '') is null then null else (v_item ->> 'score')::numeric end,
      case when nullif(v_item ->> 'rating', '') is null then null else (v_item ->> 'rating')::numeric end,
      v_category_id,
      v_status_id,
      nullif(v_item ->> 'notes', ''),
      null,
      null
    ) returning id into v_item_id;

    if jsonb_typeof(coalesce(v_item -> 'values', '[]'::jsonb)) <> 'array' then
      raise exception 'Item values must be an array.' using errcode = '22023';
    end if;

    for v_value, v_value_position in
      select value, ordinality from jsonb_array_elements(coalesce(v_item -> 'values', '[]'::jsonb)) with ordinality
    loop
      if jsonb_typeof(v_value) <> 'object' then
        raise exception 'Every item field value must be an object.' using errcode = '22023';
      end if;
      v_key := btrim(coalesce(v_value ->> 'field_key', ''));
      if v_key = '' or not (v_field_ids ? v_key) then
        raise exception 'An item value references an unknown field.' using errcode = '22023';
      end if;
      v_field_id := (v_field_ids ->> v_key)::uuid;
      v_field_type := v_field_types ->> v_key;

      insert into public.listmaker_field_values (
        list_id, item_id, field_id, user_id,
        text_value, number_value, boolean_value, date_value
      ) values (
        v_list_id,
        v_item_id,
        v_field_id,
        v_user_id,
        case when v_field_type in ('text', 'link', 'dropdown', 'long_text') then v_value ->> 'text_value' else null end,
        case when v_field_type = 'number' and nullif(v_value ->> 'number_value', '') is not null then (v_value ->> 'number_value')::numeric else null end,
        case when v_field_type = 'checkbox' and nullif(v_value ->> 'boolean_value', '') is not null then (v_value ->> 'boolean_value')::boolean else null end,
        case when v_field_type = 'date' and nullif(v_value ->> 'date_value', '') is not null then (v_value ->> 'date_value')::date else null end
      );
    end loop;
  end loop;

  perform set_config('app.listmaker_bulk_import', 'off', true);
  update public.listmaker_lists set updated_at = now() where id = v_list_id;

  return v_list_id;
end;
$$;

revoke all on function public.import_listmaker_json(jsonb) from public;
revoke all on function public.import_listmaker_json(jsonb) from anon;
grant execute on function public.import_listmaker_json(jsonb) to authenticated;
grant execute on function public.import_listmaker_json(jsonb) to service_role;

commit;
