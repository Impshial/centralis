create table if not exists public.element_groups (
  id varchar primary key default (gen_random_uuid())::varchar,
  universe_id varchar not null references public.universes(id) on delete cascade,
  name varchar not null,
  description text,
  position_x float4 not null default 0,
  position_y float4 not null default 0,
  width float4 not null default 360,
  height float4 not null default 260,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.elements
add column if not exists group_id varchar references public.element_groups(id) on delete set null;

alter table public.elements
add column if not exists group_position_x float4;

alter table public.elements
add column if not exists group_position_y float4;

create index if not exists idx_element_groups_universe_id
on public.element_groups(universe_id);

create index if not exists idx_elements_group_id
on public.elements(group_id);
