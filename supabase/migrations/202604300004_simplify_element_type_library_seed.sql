create or replace function public.ensure_user_element_type_library(p_user_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id text := auth.uid()::text;
  v_existing_types integer := 0;
  v_inserted_types integer := 0;
  v_inserted_templates integer := 0;
  v_inserted_sections integer := 0;
  v_inserted_fields integer := 0;
  v_total_types integer := 0;
  v_total_templates integer := 0;
  v_total_sections integer := 0;
  v_total_fields integer := 0;
  v_source_fields integer := 0;
begin
  if p_user_id is null then
    raise exception 'User id is required.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.clerk_user_id = v_auth_user_id
  ) then
    raise exception 'Not allowed to seed element types for this user.';
  end if;

  select count(*)
  into v_existing_types
  from public.element_types et
  where et.user_id = p_user_id;

  -- This seed is intentionally simple and first-run only. If the user's
  -- library exists, do not try to repair or merge it without constraints.
  if v_existing_types = 0 then
    insert into public.element_types (user_id, name, description, icon, color)
    select
      p_user_id,
      det.name,
      det.description,
      det.icon,
      coalesce(det.color, '#6366f1')
    from public.default_element_types det
    order by lower(det.name), det.id;

    get diagnostics v_inserted_types = row_count;

    insert into public.element_type_templates (element_type_id, name, description)
    select
      et.id,
      dett.name,
      dett.description
    from public.default_element_type_templates dett
    join public.default_element_types det
      on det.id = dett.default_element_type_id
    join public.element_types et
      on et.user_id = p_user_id
     and lower(et.name) = lower(det.name)
    order by lower(det.name), lower(dett.name), dett.id;

    get diagnostics v_inserted_templates = row_count;

    insert into public.element_template_sections (template_id, name, description, sort_order)
    select
      ett.id,
      dets.name,
      dets.description,
      coalesce(dets.sort_order, 0)
    from public.default_element_template_sections dets
    join public.default_element_type_templates dett
      on dett.id = dets.default_template_id
    join public.default_element_types det
      on det.id = dett.default_element_type_id
    join public.element_types et
      on et.user_id = p_user_id
     and lower(et.name) = lower(det.name)
    join public.element_type_templates ett
      on ett.element_type_id = et.id
     and lower(ett.name) = lower(dett.name)
    order by lower(det.name), lower(dett.name), coalesce(dets.sort_order, 0), lower(dets.name), dets.id;

    get diagnostics v_inserted_sections = row_count;

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
      sort_order
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
      coalesce(detf.sort_order, 0)
    from public.default_element_type_template_fields detf
    join public.default_element_type_templates dett
      on dett.id = detf.default_template_id
    join public.default_element_types det
      on det.id = dett.default_element_type_id
    join public.element_types et
      on et.user_id = p_user_id
     and lower(et.name) = lower(det.name)
    join public.element_type_templates ett
      on ett.element_type_id = et.id
     and lower(ett.name) = lower(dett.name)
    left join public.default_element_template_sections dets
      on dets.id = detf.default_section_id
    left join public.element_template_sections ets
      on ets.template_id = ett.id
     and lower(ets.name) = lower(dets.name)
    order by lower(det.name), lower(dett.name), coalesce(detf.sort_order, 0), detf.id;

    get diagnostics v_inserted_fields = row_count;
  end if;

  select count(*)
  into v_source_fields
  from public.default_element_type_template_fields;

  select count(*) into v_total_types
  from public.element_types et
  where et.user_id = p_user_id;

  select count(*) into v_total_templates
  from public.element_type_templates ett
  join public.element_types et
    on et.id = ett.element_type_id
  where et.user_id = p_user_id;

  select count(*) into v_total_sections
  from public.element_template_sections ets
  join public.element_type_templates ett
    on ett.id = ets.template_id
  join public.element_types et
    on et.id = ett.element_type_id
  where et.user_id = p_user_id;

  select count(*) into v_total_fields
  from public.element_type_template_fields ettf
  join public.element_type_templates ett
    on ett.id = ettf.template_id
  join public.element_types et
    on et.id = ett.element_type_id
  where et.user_id = p_user_id;

  return jsonb_build_object(
    'mode', case when v_existing_types = 0 then 'seeded' else 'already_seeded' end,
    'source_fields', v_source_fields,
    'inserted_types', v_inserted_types,
    'inserted_templates', v_inserted_templates,
    'inserted_sections', v_inserted_sections,
    'inserted_fields', v_inserted_fields,
    'total_types', v_total_types,
    'total_templates', v_total_templates,
    'total_sections', v_total_sections,
    'total_fields', v_total_fields
  );
end;
$$;

grant execute on function public.ensure_user_element_type_library(integer) to authenticated;
