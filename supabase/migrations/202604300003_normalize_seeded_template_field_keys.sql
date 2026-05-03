create or replace function public.ensure_user_element_type_library(p_user_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id text := auth.uid()::text;
  v_inserted_types integer := 0;
  v_inserted_templates integer := 0;
  v_inserted_sections integer := 0;
  v_inserted_fields integer := 0;
  v_total_types integer := 0;
  v_total_templates integer := 0;
  v_total_sections integer := 0;
  v_total_fields integer := 0;
  v_source_fields integer := 0;
  v_mapped_fields integer := 0;
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

  insert into public.element_types (user_id, name, description, icon, color)
  select p_user_id, det.name, det.description, det.icon, coalesce(det.color, '#6366f1')
  from public.default_element_types det
  where not exists (
    select 1
    from public.element_types et
    where et.user_id = p_user_id
      and lower(et.name) = lower(det.name)
  );
  get diagnostics v_inserted_types = row_count;

  insert into public.element_type_templates (element_type_id, name, description)
  select et.id, dett.name, dett.description
  from public.default_element_type_templates dett
  join public.default_element_types det
    on det.id = dett.default_element_type_id
  join public.element_types et
    on et.user_id = p_user_id
   and lower(et.name) = lower(det.name)
  where not exists (
    select 1
    from public.element_type_templates ett
    where ett.element_type_id = et.id
      and lower(ett.name) = lower(dett.name)
  );
  get diagnostics v_inserted_templates = row_count;

  insert into public.element_template_sections (template_id, name, description, sort_order)
  select ett.id, dets.name, dets.description, coalesce(dets.sort_order, 0)
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
  where not exists (
    select 1
    from public.element_template_sections ets
    where ets.template_id = ett.id
      and lower(ets.name) = lower(dets.name)
  );
  get diagnostics v_inserted_sections = row_count;

  select count(*)
  into v_source_fields
  from public.default_element_type_template_fields;

  with mapped_fields as (
    select
      ett.id as template_id,
      ets.id as section_id,
      coalesce(
        nullif(trim(detf.field_key), ''),
        nullif(regexp_replace(lower(coalesce(detf.label, detf.id, 'field')), '[^a-z0-9]+', '_', 'g'), ''),
        'field'
      ) as field_key,
      coalesce(detf.label, 'Untitled Field') as label,
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
      end as field_type,
      detf.description,
      detf.placeholder,
      detf.default_value,
      detf.options,
      coalesce(detf.is_required, false) as is_required,
      coalesce(detf.sort_order, 0) as sort_order,
      detf.id as default_field_id
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
  ),
  ranked_fields as (
    select
      *,
      row_number() over (
        partition by template_id, field_key
        order by sort_order, default_field_id
      ) as field_rank
    from mapped_fields
  ),
  keyed_fields as (
    select
      *,
      case
        when field_rank = 1 then field_key
        else concat(field_key, '_', regexp_replace(lower(default_field_id), '[^a-z0-9]+', '_', 'g'))
      end as effective_field_key
    from ranked_fields
  )
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
    kf.template_id,
    kf.section_id,
    kf.effective_field_key,
    kf.label,
    kf.field_type,
    kf.description,
    kf.placeholder,
    kf.default_value,
    kf.options,
    kf.is_required,
    kf.sort_order
  from keyed_fields kf
  where not exists (
    select 1
    from public.element_type_template_fields ettf
    where ettf.template_id = kf.template_id
      and ettf.field_key = kf.effective_field_key
  );
  get diagnostics v_inserted_fields = row_count;

  with mapped_fields as (
    select detf.id
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
  )
  select count(*)
  into v_mapped_fields
  from mapped_fields;

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
    'inserted_types', v_inserted_types,
    'inserted_templates', v_inserted_templates,
    'inserted_sections', v_inserted_sections,
    'inserted_fields', v_inserted_fields,
    'source_fields', v_source_fields,
    'mapped_fields', v_mapped_fields,
    'total_types', v_total_types,
    'total_templates', v_total_templates,
    'total_sections', v_total_sections,
    'total_fields', v_total_fields
  );
end;
$$;

grant execute on function public.ensure_user_element_type_library(integer) to authenticated;

with mapped_fields as (
  select
    et.user_id,
    ett.id as template_id,
    coalesce(
      nullif(trim(detf.field_key), ''),
      nullif(regexp_replace(lower(coalesce(detf.label, detf.id, 'field')), '[^a-z0-9]+', '_', 'g'), ''),
      'field'
    ) as field_key,
    detf.id as default_field_id,
    coalesce(detf.sort_order, 0) as sort_order
  from public.default_element_type_template_fields detf
  join public.default_element_type_templates dett
    on dett.id = detf.default_template_id
  join public.default_element_types det
    on det.id = dett.default_element_type_id
  join public.element_types et
    on lower(et.name) = lower(det.name)
  join public.element_type_templates ett
    on ett.element_type_id = et.id
   and lower(ett.name) = lower(dett.name)
),
ranked_fields as (
  select
    *,
    row_number() over (
      partition by template_id, field_key
      order by sort_order, default_field_id
    ) as field_rank
  from mapped_fields
),
extra_rank_one_fields as (
  select
    rf.template_id,
    rf.field_key,
    concat(rf.field_key, '_', regexp_replace(lower(rf.default_field_id), '[^a-z0-9]+', '_', 'g')) as extra_field_key
  from ranked_fields rf
  where rf.field_rank = 1
)
delete from public.element_type_template_fields ettf
using extra_rank_one_fields extra
where ettf.template_id = extra.template_id
  and ettf.field_key = extra.extra_field_key
  and exists (
    select 1
    from public.element_type_template_fields base
    where base.template_id = extra.template_id
      and base.field_key = extra.field_key
  );
