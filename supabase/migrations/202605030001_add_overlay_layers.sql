create table if not exists public.universe_layers (
  id varchar primary key default (gen_random_uuid())::varchar,
  universe_id varchar not null references public.universes(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  name varchar not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.universe_layer_entries (
  id varchar primary key default (gen_random_uuid())::varchar,
  layer_id varchar not null references public.universe_layers(id) on delete cascade,
  name varchar not null,
  color varchar not null default '#6366f1',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.element_layer_assignments (
  id varchar primary key default (gen_random_uuid())::varchar,
  universe_id varchar not null references public.universes(id) on delete cascade,
  element_id varchar not null references public.elements(id) on delete cascade,
  layer_id varchar not null references public.universe_layers(id) on delete cascade,
  entry_id varchar not null references public.universe_layer_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_element_layer_assignment unique (element_id, layer_id)
);

create index if not exists idx_universe_layers_universe_id
on public.universe_layers(universe_id);

create index if not exists idx_universe_layers_user_id
on public.universe_layers(user_id);

create unique index if not exists idx_universe_layers_universe_name_unique
on public.universe_layers(universe_id, lower(name));

create index if not exists idx_universe_layer_entries_layer_id
on public.universe_layer_entries(layer_id);

create unique index if not exists idx_universe_layer_entries_layer_name_unique
on public.universe_layer_entries(layer_id, lower(name));

create index if not exists idx_element_layer_assignments_universe_id
on public.element_layer_assignments(universe_id);

create index if not exists idx_element_layer_assignments_element_id
on public.element_layer_assignments(element_id);

create index if not exists idx_element_layer_assignments_layer_id
on public.element_layer_assignments(layer_id);

create index if not exists idx_element_layer_assignments_entry_id
on public.element_layer_assignments(entry_id);
