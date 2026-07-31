begin;

create table if not exists public.god_evolutions (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  description text,
  world_summary text,
  starting_mode text not null default 'instant' check (starting_mode in ('guided', 'instant', 'manual')),
  starter_kind text not null default 'random' check (starter_kind in ('single_cell', 'multicellular', 'random')),
  environment jsonb not null default '{}'::jsonb,
  canvas_settings jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.god_species (
  id uuid primary key default gen_random_uuid(),
  evolution_id uuid not null references public.god_evolutions(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  parent_species_id uuid references public.god_species(id) on delete set null,
  origin_event_id uuid,
  branch_group text,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  scientific_name text,
  classification text,
  category text,
  status text not null default 'stable' check (status in ('thriving', 'stable', 'specialized', 'vulnerable', 'declining', 'endangered', 'unstable', 'extinct')),
  can_evolve boolean not null default true,
  step_index integer not null default 0,
  depth_index integer not null default 0,
  sort_order integer not null default 0,
  position_x real not null default 0,
  position_y real not null default 0,
  overview text,
  habitat text,
  ecology jsonb not null default '{}'::jsonb,
  reproduction jsonb not null default '{}'::jsonb,
  population_condition jsonb not null default '{}'::jsonb,
  newly_evolved_traits jsonb not null default '[]'::jsonb,
  complete_traits jsonb not null default '{}'::jsonb,
  inherited_traits jsonb not null default '[]'::jsonb,
  lost_traits jsonb not null default '[]'::jsonb,
  potential_trait_hints jsonb not null default '[]'::jsonb,
  pressures jsonb not null default '[]'::jsonb,
  adaptation_bias text,
  novelty integer not null default 50 check (novelty between 0 and 100),
  visual_genome jsonb not null default '{}'::jsonb,
  image_prompt text,
  extinction_cause text,
  evolution_reason text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.god_evolution_events (
  id uuid primary key default gen_random_uuid(),
  evolution_id uuid not null references public.god_evolutions(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  parent_species_id uuid not null references public.god_species(id) on delete cascade,
  total_steps integer not null check (total_steps between 1 and 8),
  novelty integer not null check (novelty between 0 and 100),
  environmental_pressures jsonb not null default '[]'::jsonb,
  adaptation_bias text,
  summary text,
  environment_shift jsonb not null default '{}'::jsonb,
  generated_payload jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.god_species
  add constraint god_species_origin_event_fkey
  foreign key (origin_event_id) references public.god_evolution_events(id) on delete set null;

create index if not exists idx_god_evolutions_user_updated
  on public.god_evolutions(user_id, updated_at desc)
  where deleted = false;

create index if not exists idx_god_species_evolution_depth
  on public.god_species(evolution_id, depth_index, sort_order)
  where deleted = false;

create index if not exists idx_god_species_parent
  on public.god_species(parent_species_id)
  where deleted = false;

create index if not exists idx_god_evolution_events_parent
  on public.god_evolution_events(parent_species_id, created_at desc)
  where deleted = false;

create or replace function public.touch_god_engine_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_god_evolutions_updated_at on public.god_evolutions;
create trigger trg_god_evolutions_updated_at
before update on public.god_evolutions
for each row execute function public.touch_god_engine_updated_at();

drop trigger if exists trg_god_species_updated_at on public.god_species;
create trigger trg_god_species_updated_at
before update on public.god_species
for each row execute function public.touch_god_engine_updated_at();

drop trigger if exists trg_god_evolution_events_updated_at on public.god_evolution_events;
create trigger trg_god_evolution_events_updated_at
before update on public.god_evolution_events
for each row execute function public.touch_god_engine_updated_at();

alter table public.god_evolutions enable row level security;
alter table public.god_species enable row level security;
alter table public.god_evolution_events enable row level security;

create policy "Users manage own god evolutions"
on public.god_evolutions for all
using (
  exists (
    select 1 from public.users
    where users.id = god_evolutions.user_id
      and users.clerk_user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = god_evolutions.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create policy "Users manage own god species"
on public.god_species for all
using (
  exists (
    select 1 from public.users
    where users.id = god_species.user_id
      and users.clerk_user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = god_species.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create policy "Users manage own god evolution events"
on public.god_evolution_events for all
using (
  exists (
    select 1 from public.users
    where users.id = god_evolution_events.user_id
      and users.clerk_user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = god_evolution_events.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

alter table public.generation_jobs
  drop constraint if exists generation_jobs_module_check;

alter table public.generation_jobs
  add constraint generation_jobs_module_check
  check (module in ('image_generation', 'universe_builder', 'stellar_architect', 'god_engine'));

commit;
