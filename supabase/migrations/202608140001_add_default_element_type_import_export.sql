begin;

create or replace function public.admin_default_element_type_slug(p_value text, p_fallback text default 'item')
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(both '_' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '_', 'g')), ''),
    p_fallback
  );
$$;

create or replace function public.require_current_admin(p_action text default 'perform this action')
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.users%rowtype;
begin
  select *
    into actor_user
    from public.users
    where clerk_user_id = auth.uid()::text
      and coalesce(deleted, false) = false;

  if actor_user.id is null or coalesce(actor_user.admin, false) is not true then
    raise exception 'Only admins can %.', p_action;
  end if;

  return actor_user;
end;
$$;

create or replace function public.export_default_element_type(p_default_element_type_id varchar default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_type public.default_element_types%rowtype;
begin
  perform public.require_current_admin('export default element types');

  if p_default_element_type_id is null or trim(p_default_element_type_id) = '' then
    select *
      into target_type
      from public.default_element_types
      order by case when lower(name) = 'artifact' then 0 else 1 end, lower(name), id
      limit 1;
  else
    select *
      into target_type
      from public.default_element_types
      where id = p_default_element_type_id;
  end if;

  if target_type.id is null then
    raise exception 'Default element type not found.';
  end if;

  return jsonb_build_object(
    'format', 'centralis.default-element-type.v1',
    'version', 1,
    'element_type', jsonb_build_object(
      'id', target_type.id,
      'name', target_type.name,
      'description', target_type.description,
      'icon', target_type.icon,
      'color', target_type.color
    ),
    'templates',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', dett.id,
          'name', dett.name,
          'description', dett.description,
          'sections',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', dets.id,
                'key', public.admin_default_element_type_slug(dets.name, dets.id),
                'name', dets.name,
                'description', dets.description,
                'sort_order', dets.sort_order
              )
              order by dets.sort_order, lower(dets.name), dets.id
            )
            from public.default_element_template_sections dets
            where dets.default_template_id = dett.id
          ), '[]'::jsonb),
          'fields',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', detf.id,
                'field_key', coalesce(nullif(trim(detf.field_key), ''), public.admin_default_element_type_slug(detf.label, detf.id)),
                'label', detf.label,
                'field_type', detf.field_type,
                'section', dets.id,
                'description', detf.description,
                'placeholder', detf.placeholder,
                'default_value', detf.default_value,
                'options', detf.options,
                'is_required', detf.is_required,
                'sort_order', detf.sort_order
              )
              order by detf.sort_order, lower(detf.label), detf.id
            )
            from public.default_element_type_template_fields detf
            left join public.default_element_template_sections dets
              on dets.id = detf.default_section_id
            where detf.default_template_id = dett.id
          ), '[]'::jsonb)
        )
        order by lower(dett.name), dett.id
      )
      from public.default_element_type_templates dett
      where dett.default_element_type_id = target_type.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.import_default_element_type(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_element_type jsonb;
  v_templates jsonb;
  v_template jsonb;
  v_template_data jsonb;
  v_sections jsonb;
  v_fields jsonb;
  v_section jsonb;
  v_field jsonb;
  v_type_id varchar;
  v_type_name varchar;
  v_template_id varchar;
  v_template_payload_id varchar;
  v_template_name varchar;
  v_section_id varchar;
  v_section_key text;
  v_field_id varchar;
  v_field_key varchar;
  v_field_label varchar;
  v_field_type varchar;
  v_section_ref text;
  v_options jsonb;
  v_type_count integer := 0;
  v_template_count integer := 0;
  v_section_count integer := 0;
  v_field_count integer := 0;
begin
  perform public.require_current_admin('import default element types');

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Import payload must be a JSON object.';
  end if;

  if p_payload->>'format' <> 'centralis.default-element-type.v1' then
    raise exception 'Unsupported default element type format.';
  end if;

  if coalesce((p_payload->>'version')::integer, 0) <> 1 then
    raise exception 'Unsupported default element type version.';
  end if;

  v_element_type := p_payload->'element_type';
  if v_element_type is null or jsonb_typeof(v_element_type) <> 'object' then
    raise exception 'element_type is required.';
  end if;

  v_type_name := nullif(trim(v_element_type->>'name'), '');
  v_type_id := nullif(trim(v_element_type->>'id'), '');
  if v_type_name is null then
    raise exception 'element_type.name is required.';
  end if;
  if v_type_id is null then
    v_type_id := public.admin_default_element_type_slug(v_type_name, 'element_type');
  end if;

  insert into public.default_element_types (id, name, description, icon, color)
  values (
    v_type_id,
    v_type_name,
    nullif(v_element_type->>'description', ''),
    nullif(v_element_type->>'icon', ''),
    coalesce(nullif(v_element_type->>'color', ''), '#6366f1')
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    color = excluded.color;
  v_type_count := 1;

  if jsonb_typeof(p_payload->'templates') = 'array' then
    v_templates := p_payload->'templates';
  elsif jsonb_typeof(p_payload->'template') = 'object' then
    v_templates := jsonb_build_array(jsonb_build_object(
      'template', p_payload->'template',
      'sections', coalesce(p_payload->'sections', '[]'::jsonb),
      'fields', coalesce(p_payload->'fields', '[]'::jsonb)
    ));
  else
    raise exception 'templates array is required.';
  end if;

  if jsonb_array_length(v_templates) = 0 then
    raise exception 'At least one template is required.';
  end if;

  for v_template in select value from jsonb_array_elements(v_templates)
  loop
    v_template_data := case
      when jsonb_typeof(v_template->'template') = 'object' then v_template->'template'
      else v_template
    end;
    v_template_name := nullif(trim(v_template_data->>'name'), '');
    if v_template_name is null then
      raise exception 'Every template needs a name.';
    end if;

    v_template_payload_id := coalesce(nullif(trim(v_template_data->>'id'), ''), nullif(trim(v_template->>'id'), ''));
    if v_template_payload_id is not null then
      v_template_id := v_template_payload_id;
    else
      select dett.id
        into v_template_id
        from public.default_element_type_templates dett
        where dett.default_element_type_id = v_type_id
          and lower(dett.name) = lower(v_template_name)
        order by dett.id
        limit 1;
      v_template_id := coalesce(
        v_template_id,
        v_type_id || '_' || public.admin_default_element_type_slug(v_template_name, 'template') || '_template'
      );
    end if;
    v_sections := coalesce(v_template->'sections', '[]'::jsonb);
    v_fields := coalesce(v_template->'fields', '[]'::jsonb);
    if jsonb_typeof(v_sections) <> 'array' then
      raise exception 'Template "%" sections must be an array.', v_template_name;
    end if;
    if jsonb_typeof(v_fields) <> 'array' or jsonb_array_length(v_fields) = 0 then
      raise exception 'Template "%" needs at least one field.', v_template_name;
    end if;

    insert into public.default_element_type_templates (id, default_element_type_id, name, description)
    values (v_template_id, v_type_id, v_template_name, nullif(v_template_data->>'description', ''))
    on conflict (id) do update set
      default_element_type_id = excluded.default_element_type_id,
      name = excluded.name,
      description = excluded.description;
    v_template_count := v_template_count + 1;

    delete from public.default_element_type_template_fields
    where default_template_id = v_template_id;
    delete from public.default_element_template_sections
    where default_template_id = v_template_id;

    for v_section in select value from jsonb_array_elements(v_sections)
    loop
      v_section_key := coalesce(nullif(trim(v_section->>'key'), ''), nullif(trim(v_section->>'name'), ''));
      v_section_id := coalesce(
        nullif(trim(v_section->>'id'), ''),
        v_template_id || '_' || public.admin_default_element_type_slug(v_section_key, 'section') || '_section'
      );
      if nullif(trim(v_section->>'name'), '') is null then
        raise exception 'Every section needs a name.';
      end if;
      insert into public.default_element_template_sections (
        id,
        default_template_id,
        name,
        description,
        sort_order
      )
      values (
        v_section_id,
        v_template_id,
        trim(v_section->>'name'),
        nullif(v_section->>'description', ''),
        coalesce((v_section->>'sort_order')::integer, 0)
      );
      v_section_count := v_section_count + 1;
    end loop;

    for v_field in select value from jsonb_array_elements(v_fields)
    loop
      v_field_label := nullif(trim(v_field->>'label'), '');
      v_field_key := public.admin_default_element_type_slug(coalesce(nullif(v_field->>'field_key', ''), v_field_label), 'field');
      v_field_type := lower(coalesce(nullif(trim(v_field->>'field_type'), ''), 'textarea'));
      if v_field_label is null then
        raise exception 'Every field needs a label.';
      end if;
      if v_field_type not in ('text', 'textarea', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url', 'image', 'rich_text', 'relationship') then
        raise exception 'Field "%" uses unsupported type "%".', v_field_label, v_field_type;
      end if;

      v_options := v_field->'options';
      if jsonb_typeof(v_options) = 'array' then
        v_options := jsonb_build_object('choices', v_options);
      end if;
      if v_field_type in ('select', 'multi_select')
        and (
          v_options is null
          or jsonb_typeof(v_options->'choices') <> 'array'
          or jsonb_array_length(v_options->'choices') = 0
        ) then
        raise exception 'Field "%" needs at least one option.', v_field_label;
      end if;

      v_section_ref := nullif(trim(v_field->>'section'), '');
      v_section_id := null;
      if v_section_ref is not null then
        select coalesce(
          nullif(trim(section_item.value->>'id'), ''),
          v_template_id || '_' || public.admin_default_element_type_slug(coalesce(section_item.value->>'key', section_item.value->>'name'), 'section') || '_section'
        )
        into v_section_id
        from jsonb_array_elements(v_sections) section_item
        where lower(coalesce(section_item.value->>'id', section_item.value->>'key', section_item.value->>'name')) = lower(v_section_ref)
        limit 1;

        if v_section_id is null then
          raise exception 'Field "%" references unknown section "%".', v_field_label, v_section_ref;
        end if;
      end if;

      v_field_id := coalesce(
        nullif(trim(v_field->>'id'), ''),
        v_template_id || '_' || v_field_key || '_field'
      );

      insert into public.default_element_type_template_fields (
        id,
        default_template_id,
        default_section_id,
        field_key,
        label,
        field_type,
        description,
        placeholder,
        default_value,
        options,
        is_required,
        sort_order,
        updated_at
      )
      values (
        v_field_id,
        v_template_id,
        v_section_id,
        v_field_key,
        v_field_label,
        v_field_type,
        nullif(v_field->>'description', ''),
        nullif(v_field->>'placeholder', ''),
        nullif(v_field->>'default_value', ''),
        v_options,
        coalesce((v_field->>'is_required')::boolean, false),
        coalesce((v_field->>'sort_order')::integer, 0),
        now()
      );
      v_field_count := v_field_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'element_type_id', v_type_id,
    'element_type_name', v_type_name,
    'types', v_type_count,
    'templates', v_template_count,
    'sections', v_section_count,
    'fields', v_field_count
  );
end;
$$;

create or replace function public.sync_default_element_types_to_users()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_types integer := 0;
  v_inserted_templates integer := 0;
  v_inserted_sections integer := 0;
  v_inserted_fields integer := 0;
  v_mapped_templates integer := 0;
  v_mapped_sections integer := 0;
  v_mapped_fields integer := 0;
  v_user_count integer := 0;
begin
  perform public.require_current_admin('sync default element types');

  select count(*)
    into v_user_count
    from public.users u
    where coalesce(u.deleted, false) = false;

  insert into public.element_types (user_id, name, description, icon, color)
  select u.id, det.name, det.description, det.icon, coalesce(det.color, '#6366f1')
  from public.users u
  cross join public.default_element_types det
  where coalesce(u.deleted, false) = false
    and not exists (
      select 1
      from public.element_types et
      where et.user_id = u.id
        and lower(et.name) = lower(det.name)
    );
  get diagnostics v_inserted_types = row_count;

  insert into public.element_type_templates (
    element_type_id,
    name,
    description,
    source_default_template_id,
    is_default
  )
  select et.id, dett.name, dett.description, dett.id, true
  from public.default_element_type_templates dett
  join public.default_element_types det
    on det.id = dett.default_element_type_id
  join public.element_types et
    on lower(et.name) = lower(det.name)
  join public.users u
    on u.id = et.user_id
   and coalesce(u.deleted, false) = false
  where not exists (
    select 1
    from public.element_type_templates ett
    where ett.element_type_id = et.id
      and (
        ett.source_default_template_id = dett.id
        or lower(ett.name) = lower(dett.name)
      )
  );
  get diagnostics v_inserted_templates = row_count;

  update public.element_type_templates ett
  set source_default_template_id = dett.id,
      is_default = true
  from public.element_types et
  join public.users u
    on u.id = et.user_id
   and coalesce(u.deleted, false) = false
  join public.default_element_types det
    on lower(det.name) = lower(et.name)
  join public.default_element_type_templates dett
    on dett.default_element_type_id = det.id
  where ett.element_type_id = et.id
    and lower(ett.name) = lower(dett.name)
    and ett.source_default_template_id is null;
  get diagnostics v_mapped_templates = row_count;

  insert into public.element_template_sections (
    template_id,
    name,
    description,
    sort_order,
    source_default_section_id,
    is_default
  )
  select ett.id, dets.name, dets.description, coalesce(dets.sort_order, 0), dets.id, true
  from public.default_element_template_sections dets
  join public.default_element_type_templates dett
    on dett.id = dets.default_template_id
  join public.default_element_types det
    on det.id = dett.default_element_type_id
  join public.element_types et
    on lower(et.name) = lower(det.name)
  join public.users u
    on u.id = et.user_id
   and coalesce(u.deleted, false) = false
  join public.element_type_templates ett
    on ett.element_type_id = et.id
   and (ett.source_default_template_id = dett.id or lower(ett.name) = lower(dett.name))
  where not exists (
    select 1
    from public.element_template_sections ets
    where ets.template_id = ett.id
      and (
        ets.source_default_section_id = dets.id
        or lower(ets.name) = lower(dets.name)
      )
  );
  get diagnostics v_inserted_sections = row_count;

  update public.element_template_sections ets
  set source_default_section_id = dets.id,
      is_default = true
  from public.element_type_templates ett
  join public.element_types et
    on et.id = ett.element_type_id
  join public.users u
    on u.id = et.user_id
   and coalesce(u.deleted, false) = false
  join public.default_element_template_sections dets
    on dets.default_template_id = ett.source_default_template_id
  where ets.template_id = ett.id
    and lower(ets.name) = lower(dets.name)
    and ets.source_default_section_id is null;
  get diagnostics v_mapped_sections = row_count;

  insert into public.element_type_template_fields (
    template_id,
    section_id,
    field_key,
    label,
    field_type,
    description,
    placeholder,
    default_value,
    options,
    is_required,
    sort_order,
    source_default_field_id,
    is_default
  )
  select
    ett.id,
    ets.id,
    coalesce(
      nullif(trim(detf.field_key), ''),
      nullif(regexp_replace(lower(coalesce(detf.label, detf.id, 'field')), '[^a-z0-9]+', '_', 'g'), ''),
      'field'
    ),
    coalesce(detf.label, 'Untitled Field'),
    case
      when lower(coalesce(detf.field_type, 'textarea')) in (
        'text',
        'textarea',
        'number',
        'date',
        'select',
        'multi_select',
        'checkbox',
        'url',
        'image',
        'rich_text',
        'relationship'
      ) then lower(coalesce(detf.field_type, 'textarea'))
      else 'textarea'
    end,
    detf.description,
    detf.placeholder,
    detf.default_value,
    detf.options,
    coalesce(detf.is_required, false),
    coalesce(detf.sort_order, 0),
    detf.id,
    true
  from public.default_element_type_template_fields detf
  join public.default_element_type_templates dett
    on dett.id = detf.default_template_id
  join public.default_element_types det
    on det.id = dett.default_element_type_id
  join public.element_types et
    on lower(et.name) = lower(det.name)
  join public.users u
    on u.id = et.user_id
   and coalesce(u.deleted, false) = false
  join public.element_type_templates ett
    on ett.element_type_id = et.id
   and (ett.source_default_template_id = dett.id or lower(ett.name) = lower(dett.name))
  left join public.default_element_template_sections dets
    on dets.id = detf.default_section_id
  left join public.element_template_sections ets
    on ets.template_id = ett.id
   and (ets.source_default_section_id = dets.id or lower(ets.name) = lower(dets.name))
  where not exists (
    select 1
    from public.element_type_template_fields ettf
    where ettf.template_id = ett.id
      and (
        ettf.source_default_field_id = detf.id
        or lower(coalesce(nullif(trim(ettf.field_key), ''), ettf.label, ettf.id)) =
          lower(coalesce(nullif(trim(detf.field_key), ''), detf.label, detf.id))
      )
  );
  get diagnostics v_inserted_fields = row_count;

  with matched_fields as (
    select distinct on (ettf.id)
      ettf.id as field_id,
      detf.id as default_field_id
    from public.element_type_template_fields ettf
    join public.element_type_templates ett
      on ett.id = ettf.template_id
    join public.element_types et
      on et.id = ett.element_type_id
    join public.users u
      on u.id = et.user_id
     and coalesce(u.deleted, false) = false
    join public.default_element_type_template_fields detf
      on detf.default_template_id = ett.source_default_template_id
     and (
       lower(coalesce(nullif(trim(detf.field_key), ''), detf.label, detf.id)) =
         lower(coalesce(nullif(trim(ettf.field_key), ''), ettf.label, ettf.id))
       or lower(coalesce(detf.label, '')) = lower(coalesce(ettf.label, ''))
     )
    where ettf.source_default_field_id is null
    order by ettf.id, detf.sort_order, detf.id
  )
  update public.element_type_template_fields ettf
  set source_default_field_id = matched_fields.default_field_id,
      is_default = true
  from matched_fields
  where ettf.id = matched_fields.field_id;
  get diagnostics v_mapped_fields = row_count;

  return jsonb_build_object(
    'users', v_user_count,
    'inserted_types', v_inserted_types,
    'inserted_templates', v_inserted_templates,
    'inserted_sections', v_inserted_sections,
    'inserted_fields', v_inserted_fields,
    'mapped_templates', v_mapped_templates,
    'mapped_sections', v_mapped_sections,
    'mapped_fields', v_mapped_fields
  );
end;
$$;

revoke all on function public.admin_default_element_type_slug(text, text) from public;
revoke all on function public.admin_default_element_type_slug(text, text) from anon;
grant execute on function public.admin_default_element_type_slug(text, text) to authenticated;

revoke all on function public.require_current_admin(text) from public;
revoke all on function public.require_current_admin(text) from anon;
grant execute on function public.require_current_admin(text) to authenticated;

revoke all on function public.export_default_element_type(varchar) from public;
revoke all on function public.export_default_element_type(varchar) from anon;
grant execute on function public.export_default_element_type(varchar) to authenticated;

revoke all on function public.import_default_element_type(jsonb) from public;
revoke all on function public.import_default_element_type(jsonb) from anon;
grant execute on function public.import_default_element_type(jsonb) to authenticated;

revoke all on function public.sync_default_element_types_to_users() from public;
revoke all on function public.sync_default_element_types_to_users() from anon;
grant execute on function public.sync_default_element_types_to_users() to authenticated;

notify pgrst, 'reload schema';

commit;
