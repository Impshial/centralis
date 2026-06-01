begin;

alter table public.elements
add column if not exists user_id integer;

update public.elements e
set user_id = u.user_id
from public.universes u
where e.universe_id = u.id
  and e.user_id is null;

do $$
begin
  if exists (
    select 1
    from public.elements
    where user_id is null
  ) then
    raise exception 'Cannot make elements.user_id required while element rows have no user_id.';
  end if;
end $$;

alter table public.elements
alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'elements'
      and constraint_name = 'elements_user_id_fkey'
  ) then
    alter table public.elements
    add constraint elements_user_id_fkey
    foreign key (user_id)
    references public.users(id)
    on delete cascade;
  end if;
end $$;

alter table public.elements
alter column universe_id drop not null;

create index if not exists idx_elements_user_id
on public.elements(user_id);

create index if not exists idx_elements_user_universe_id
on public.elements(user_id, universe_id);

create index if not exists idx_elements_user_updated_at
on public.elements(user_id, updated_at desc);

create table if not exists public.chronicle_modules (
  id varchar primary key default (gen_random_uuid())::varchar,
  element_id varchar not null references public.elements(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  module_type varchar not null default 'overview',
  source varchar not null default 'manual',
  title varchar not null default 'Overview',
  sort_order integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chronicle_modules_element_id
on public.chronicle_modules(element_id);

create index if not exists idx_chronicle_modules_user_id
on public.chronicle_modules(user_id);

create index if not exists idx_chronicle_modules_module_type
on public.chronicle_modules(module_type);

create unique index if not exists idx_chronicle_modules_element_source_type_unique
on public.chronicle_modules(element_id, source, module_type);

insert into public.chronicle_modules (
  element_id,
  user_id,
  module_type,
  source,
  title,
  data
)
select distinct
  e.id,
  e.user_id,
  'rich_details',
  'rich_details_backfill',
  'Rich Details',
  jsonb_build_object('rich_template_id', e.rich_template_id)
from public.elements e
where e.user_id is not null
  and e.universe_id is not null
  and (
    e.rich_template_id is not null
    or exists (
      select 1
      from public.element_template_field_values v
      where v.element_id = e.id
    )
  )
on conflict (element_id, source, module_type) do nothing;

commit;
