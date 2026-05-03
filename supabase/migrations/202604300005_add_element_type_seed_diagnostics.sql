create or replace function public.get_element_type_seed_diagnostics(p_user_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id text := auth.uid()::text;
  v_default_types integer := 0;
  v_default_templates integer := 0;
  v_default_sections integer := 0;
  v_default_fields integer := 0;
  v_user_types integer := 0;
  v_user_templates integer := 0;
  v_user_sections integer := 0;
  v_user_fields integer := 0;
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
    raise exception 'Not allowed to inspect element type seed diagnostics for this user.';
  end if;

  select count(*) into v_default_types from public.default_element_types;
  select count(*) into v_default_templates from public.default_element_type_templates;
  select count(*) into v_default_sections from public.default_element_template_sections;
  select count(*) into v_default_fields from public.default_element_type_template_fields;

  select count(*) into v_user_types
  from public.element_types et
  where et.user_id = p_user_id;

  select count(*) into v_user_templates
  from public.element_type_templates ett
  join public.element_types et
    on et.id = ett.element_type_id
  where et.user_id = p_user_id;

  select count(*) into v_user_sections
  from public.element_template_sections ets
  join public.element_type_templates ett
    on ett.id = ets.template_id
  join public.element_types et
    on et.id = ett.element_type_id
  where et.user_id = p_user_id;

  select count(*) into v_user_fields
  from public.element_type_template_fields ettf
  join public.element_type_templates ett
    on ett.id = ettf.template_id
  join public.element_types et
    on et.id = ett.element_type_id
  where et.user_id = p_user_id;

  select count(*) into v_mapped_fields
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
   and lower(ett.name) = lower(dett.name);

  return jsonb_build_object(
    'default_types', v_default_types,
    'default_templates', v_default_templates,
    'default_sections', v_default_sections,
    'default_fields', v_default_fields,
    'user_types', v_user_types,
    'user_templates', v_user_templates,
    'user_sections', v_user_sections,
    'user_fields', v_user_fields,
    'mapped_fields', v_mapped_fields
  );
end;
$$;

grant execute on function public.get_element_type_seed_diagnostics(integer) to authenticated;
