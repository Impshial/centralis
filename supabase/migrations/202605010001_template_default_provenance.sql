alter table public.element_type_templates
add column if not exists source_default_template_id varchar references public.default_element_type_templates(id) on delete set null;

alter table public.element_type_templates
add column if not exists is_default boolean not null default false;

alter table public.element_template_sections
add column if not exists source_default_section_id varchar references public.default_element_template_sections(id) on delete set null;

alter table public.element_template_sections
add column if not exists is_default boolean not null default false;

alter table public.element_template_sections
add column if not exists is_hidden boolean not null default false;

alter table public.element_type_template_fields
add column if not exists source_default_field_id varchar references public.default_element_type_template_fields(id) on delete set null;

alter table public.element_type_template_fields
add column if not exists is_default boolean not null default false;

alter table public.element_type_template_fields
add column if not exists is_hidden boolean not null default false;

create index if not exists idx_element_type_templates_source_default
on public.element_type_templates(source_default_template_id);

create index if not exists idx_element_template_sections_source_default
on public.element_template_sections(source_default_section_id);

create index if not exists idx_element_type_template_fields_source_default
on public.element_type_template_fields(source_default_field_id);

update public.element_type_templates ett
set
  source_default_template_id = dett.id,
  is_default = true
from public.element_types et
join public.default_element_types det
  on lower(det.name) = lower(et.name)
join public.default_element_type_templates dett
  on dett.default_element_type_id = det.id
where ett.element_type_id = et.id
  and lower(ett.name) = lower(dett.name)
  and ett.source_default_template_id is null;

update public.element_template_sections ets
set
  source_default_section_id = dets.id,
  is_default = true
from public.element_type_templates ett
join public.default_element_template_sections dets
  on dets.default_template_id = ett.source_default_template_id
where ets.template_id = ett.id
  and lower(ets.name) = lower(dets.name)
  and ets.source_default_section_id is null;

with matched_fields as (
  select distinct on (ettf.id)
    ettf.id as field_id,
    detf.id as default_field_id
  from public.element_type_template_fields ettf
  join public.element_type_templates ett
    on ett.id = ettf.template_id
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
set
  source_default_field_id = matched_fields.default_field_id,
  is_default = true
from matched_fields
where ettf.id = matched_fields.field_id;

create or replace function public.ensure_user_element_type_library(p_user_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id text := auth.uid()::text;
  v_existing_types integer := 0;
  v_existing_fields integer := 0;
  v_mapped_fields integer := 0;
  v_inserted_types integer := 0;
  v_inserted_templates integer := 0;
  v_inserted_sections integer := 0;
  v_inserted_fields integer := 0;
  v_deleted_fields integer := 0;
  v_total_types integer := 0;
  v_total_templates integer := 0;
  v_total_sections integer := 0;
  v_total_fields integer := 0;
  v_source_fields integer := 0;
  v_mode text := 'already_seeded';
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

  if v_existing_types = 0 then
    v_mode := 'seeded';

    insert into public.element_types (user_id, name, description, icon, color)
    select p_user_id, det.name, det.description, det.icon, coalesce(det.color, '#6366f1')
    from public.default_element_types det
    order by lower(det.name), det.id;
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
      on et.user_id = p_user_id
     and lower(et.name) = lower(det.name)
    order by lower(det.name), lower(dett.name), dett.id;
    get diagnostics v_inserted_templates = row_count;

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
      on et.user_id = p_user_id
     and lower(et.name) = lower(det.name)
    join public.element_type_templates ett
      on ett.element_type_id = et.id
     and ett.source_default_template_id = dett.id
    order by lower(det.name), lower(dett.name), coalesce(dets.sort_order, 0), lower(dets.name), dets.id;
    get diagnostics v_inserted_sections = row_count;
  end if;

  update public.element_type_templates ett
  set source_default_template_id = dett.id,
      is_default = true
  from public.element_types et
  join public.default_element_types det
    on lower(det.name) = lower(et.name)
  join public.default_element_type_templates dett
    on dett.default_element_type_id = det.id
  where ett.element_type_id = et.id
    and et.user_id = p_user_id
    and lower(ett.name) = lower(dett.name)
    and ett.source_default_template_id is null;

  update public.element_template_sections ets
  set source_default_section_id = dets.id,
      is_default = true
  from public.element_type_templates ett
  join public.element_types et
    on et.id = ett.element_type_id
  join public.default_element_template_sections dets
    on dets.default_template_id = ett.source_default_template_id
  where ets.template_id = ett.id
    and et.user_id = p_user_id
    and lower(ets.name) = lower(dets.name)
    and ets.source_default_section_id is null;

  select count(*)
  into v_source_fields
  from public.default_element_type_template_fields;

  select count(*)
  into v_mapped_fields
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
   and (ett.source_default_template_id = dett.id or lower(ett.name) = lower(dett.name));

  select count(*)
  into v_existing_fields
  from public.element_type_template_fields ettf
  join public.element_type_templates ett
    on ett.id = ettf.template_id
  join public.element_types et
    on et.id = ett.element_type_id
  where et.user_id = p_user_id;

  if v_existing_fields < v_mapped_fields then
    v_mode := case
      when v_mode = 'seeded' then 'seeded'
      else 'reseeded_fields'
    end;

    delete from public.element_type_template_fields ettf
    using public.element_type_templates ett,
          public.element_types et
    where ett.id = ettf.template_id
      and et.id = ett.element_type_id
      and et.user_id = p_user_id;
    get diagnostics v_deleted_fields = row_count;

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
      on et.user_id = p_user_id
     and lower(et.name) = lower(det.name)
    join public.element_type_templates ett
      on ett.element_type_id = et.id
     and (ett.source_default_template_id = dett.id or lower(ett.name) = lower(dett.name))
    left join public.default_element_template_sections dets
      on dets.id = detf.default_section_id
    left join public.element_template_sections ets
      on ets.template_id = ett.id
     and (ets.source_default_section_id = dets.id or lower(ets.name) = lower(dets.name))
    order by lower(det.name), lower(dett.name), coalesce(detf.sort_order, 0), detf.id;
    get diagnostics v_inserted_fields = row_count;
  end if;

  with matched_fields as (
    select distinct on (ettf.id)
      ettf.id as field_id,
      detf.id as default_field_id
    from public.element_type_template_fields ettf
    join public.element_type_templates ett
      on ett.id = ettf.template_id
    join public.element_types et
      on et.id = ett.element_type_id
    join public.default_element_type_template_fields detf
      on detf.default_template_id = ett.source_default_template_id
     and (
       lower(coalesce(nullif(trim(detf.field_key), ''), detf.label, detf.id)) =
         lower(coalesce(nullif(trim(ettf.field_key), ''), ettf.label, ettf.id))
       or lower(coalesce(detf.label, '')) = lower(coalesce(ettf.label, ''))
     )
    where et.user_id = p_user_id
      and ettf.source_default_field_id is null
    order by ettf.id, detf.sort_order, detf.id
  )
  update public.element_type_template_fields ettf
  set source_default_field_id = matched_fields.default_field_id,
      is_default = true
  from matched_fields
  where ettf.id = matched_fields.field_id;

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
    'mode', v_mode,
    'source_fields', v_source_fields,
    'mapped_fields', v_mapped_fields,
    'deleted_fields', v_deleted_fields,
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
