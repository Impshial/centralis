begin;

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

revoke all on function public.sync_default_element_types_to_users() from public;
revoke all on function public.sync_default_element_types_to_users() from anon;
grant execute on function public.sync_default_element_types_to_users() to authenticated;

notify pgrst, 'reload schema';

commit;
