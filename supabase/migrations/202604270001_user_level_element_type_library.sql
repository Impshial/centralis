begin;

-- User-level element type library migration.
-- This is intentionally a clean break from universe-scoped element types.

create table if not exists public.element_type_templates (
  id varchar primary key default (gen_random_uuid())::varchar,
  element_type_id varchar not null references public.element_types(id) on delete cascade,
  name varchar not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.element_template_sections (
  id varchar primary key default (gen_random_uuid())::varchar,
  template_id varchar not null references public.element_type_templates(id) on delete cascade,
  name varchar not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint unique_template_section_name unique (template_id, name)
);

create table if not exists public.element_type_template_fields (
  id varchar primary key default (gen_random_uuid())::varchar,
  template_id varchar not null references public.element_type_templates(id) on delete cascade,
  field_key varchar not null,
  label text not null,
  field_type text not null default 'text',
  section_id varchar references public.element_template_sections(id) on delete set null,
  description text,
  placeholder text,
  default_value text,
  options jsonb,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_field_type check (
    field_type = any (array[
      'text'::text,
      'textarea'::text,
      'number'::text,
      'date'::text,
      'select'::text,
      'multi_select'::text,
      'checkbox'::text,
      'url'::text,
      'image'::text,
      'rich_text'::text,
      'relationship'::text
    ])
  )
);

create table if not exists public.element_template_field_values (
  id varchar primary key default (gen_random_uuid())::varchar,
  element_id varchar not null references public.elements(id) on delete cascade,
  template_field_id varchar not null references public.element_type_template_fields(id) on delete cascade,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_element_template_field_value unique (element_id, template_field_id)
);

-- Detach existing elements from old per-universe element types, then remove
-- the old copied library rows and their rich-detail template data.
update public.elements
set element_type_id = null
where element_type_id is not null;

delete from public.element_template_field_values;
delete from public.element_type_template_fields;
delete from public.element_template_sections;
delete from public.element_type_templates;
delete from public.element_types;

alter table public.element_types
drop constraint if exists element_types_universe_id_fkey;

alter table public.element_types
drop column if exists universe_id;

alter table public.element_types
add column if not exists user_id integer;

alter table public.element_types
alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'element_types_user_id_fkey'
      and conrelid = 'public.element_types'::regclass
  ) then
    alter table public.element_types
    add constraint element_types_user_id_fkey
    foreign key (user_id)
    references public.users(id)
    on delete cascade;
  end if;
end $$;

create index if not exists idx_element_types_user_id
on public.element_types(user_id);

create unique index if not exists idx_element_types_user_name_unique
on public.element_types(user_id, lower(name));

alter table public.element_type_template_fields
add column if not exists field_key varchar;

alter table public.element_type_template_fields
alter column field_key set not null;

alter table public.element_type_template_fields
add column if not exists label text;

alter table public.element_type_template_fields
alter column label set not null;

alter table public.element_type_template_fields
add column if not exists field_type text not null default 'text';

alter table public.element_type_template_fields
add column if not exists section_id varchar references public.element_template_sections(id) on delete set null;

alter table public.element_type_template_fields
add column if not exists description text;

alter table public.element_type_template_fields
add column if not exists placeholder text;

alter table public.element_type_template_fields
add column if not exists default_value text;

alter table public.element_type_template_fields
add column if not exists options jsonb;

alter table public.element_type_template_fields
add column if not exists is_required boolean not null default false;

alter table public.element_type_template_fields
add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_element_type_templates_element_type_id
on public.element_type_templates(element_type_id);

create index if not exists idx_element_template_sections_template_id
on public.element_template_sections(template_id);

create index if not exists idx_element_type_template_fields_template_id
on public.element_type_template_fields(template_id);

create index if not exists idx_element_type_template_fields_section_id
on public.element_type_template_fields(section_id);

create index if not exists idx_template_field_values_element_id
on public.element_template_field_values(element_id);

create index if not exists idx_template_field_values_template_field_id
on public.element_template_field_values(template_field_id);

create table if not exists public.default_element_type_templates (
  id varchar primary key default (gen_random_uuid())::varchar,
  default_element_type_id varchar not null references public.default_element_types(id) on delete cascade,
  name varchar not null,
  description text,
  created_at timestamptz not null default now(),
  constraint unique_default_type_template_name unique (default_element_type_id, name)
);

create table if not exists public.default_element_template_sections (
  id varchar primary key default (gen_random_uuid())::varchar,
  default_template_id varchar not null references public.default_element_type_templates(id) on delete cascade,
  name varchar not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint unique_default_template_section_name unique (default_template_id, name)
);

create table if not exists public.default_element_type_template_fields (
  id varchar primary key default (gen_random_uuid())::varchar,
  default_template_id varchar not null references public.default_element_type_templates(id) on delete cascade,
  default_section_id varchar references public.default_element_template_sections(id) on delete set null,
  field_key varchar,
  label varchar not null,
  field_type varchar not null default 'textarea',
  description text,
  placeholder text,
  default_value text,
  options jsonb,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_default_templates_type_id
on public.default_element_type_templates(default_element_type_id);

create index if not exists idx_default_sections_template_id
on public.default_element_template_sections(default_template_id);

create index if not exists idx_default_fields_template_id
on public.default_element_type_template_fields(default_template_id);

create index if not exists idx_default_fields_section_id
on public.default_element_type_template_fields(default_section_id);

commit;
