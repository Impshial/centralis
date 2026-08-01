begin;

create table if not exists public.arc_projects (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  universe_id varchar references public.universes(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  logline text,
  premise text,
  genre text,
  format text not null default 'novel',
  status text not null default 'planning' check (status in ('idea', 'planning', 'outlined', 'drafting', 'revising', 'complete', 'paused', 'archived')),
  target_length text,
  notes text,
  cover_image_url text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arc_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  parent_unit_id uuid references public.arc_units(id) on delete cascade,
  unit_type text not null default 'scene' check (unit_type in ('part', 'act', 'sequence', 'episode', 'chapter', 'scene', 'beat', 'custom')),
  custom_type text,
  title text not null default 'Untitled',
  summary text,
  detailed_notes text,
  purpose text,
  conflict text,
  outcome text,
  pov_element_id varchar references public.elements(id) on delete set null,
  location_element_id varchar references public.elements(id) on delete set null,
  narrative_position numeric,
  chronological_label text,
  story_time text,
  estimated_duration text,
  emotional_tone text,
  status text not null default 'idea' check (status in ('idea', 'planned', 'outlined', 'drafting', 'revising', 'complete', 'cut')),
  word_count_target integer,
  sort_order integer not null default 0,
  collapsed boolean not null default false,
  beats jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arc_unit_elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  unit_id uuid not null references public.arc_units(id) on delete cascade,
  element_id varchar not null references public.elements(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  role text not null default 'appears',
  story_state text,
  notes text,
  created_at timestamptz not null default now(),
  unique(unit_id, element_id, role)
);

create table if not exists public.arc_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  thread_type text not null default 'plot' check (thread_type in ('plot', 'subplot', 'mystery', 'romance', 'antagonist', 'theme', 'relationship', 'custom')),
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'resolved', 'unresolved')),
  color text,
  sort_order integer not null default 0,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arc_thread_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  thread_id uuid not null references public.arc_threads(id) on delete cascade,
  unit_id uuid not null references public.arc_units(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  thread_moment text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(thread_id, unit_id)
);

create table if not exists public.arc_character_arcs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  character_element_id varchar references public.elements(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  starting_state text,
  external_goal text,
  internal_need text,
  false_belief text,
  fear text,
  final_state text,
  status text not null default 'active' check (status in ('active', 'paused', 'resolved', 'unresolved')),
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arc_arc_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  character_arc_id uuid not null references public.arc_character_arcs(id) on delete cascade,
  unit_id uuid references public.arc_units(id) on delete set null,
  user_id integer not null references public.users(id) on delete cascade,
  title text not null default 'Arc Stage',
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arc_setups_payoffs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  setup_unit_id uuid references public.arc_units(id) on delete set null,
  payoff_unit_id uuid references public.arc_units(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 1 and 180),
  setup_type text not null default 'setup' check (setup_type in ('setup', 'clue', 'promise', 'foreshadowing', 'question', 'misdirection')),
  payoff_type text not null default 'payoff' check (payoff_type in ('payoff', 'reveal', 'answer', 'reversal', 'subversion')),
  description text,
  status text not null default 'unresolved' check (status in ('unresolved', 'prepared', 'paid_off', 'cut')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_arc_projects_user_updated on public.arc_projects(user_id, updated_at desc) where deleted = false;
create index if not exists idx_arc_units_project_order on public.arc_units(project_id, parent_unit_id, sort_order) where deleted = false;
create index if not exists idx_arc_unit_elements_unit on public.arc_unit_elements(unit_id);
create index if not exists idx_arc_threads_project on public.arc_threads(project_id, sort_order) where deleted = false;
create index if not exists idx_arc_thread_units_unit on public.arc_thread_units(unit_id);
create index if not exists idx_arc_character_arcs_project on public.arc_character_arcs(project_id, created_at) where deleted = false;
create index if not exists idx_arc_setups_project on public.arc_setups_payoffs(project_id, status);

create or replace function public.touch_arc_studio_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_arc_projects_updated_at on public.arc_projects;
create trigger trg_arc_projects_updated_at before update on public.arc_projects
for each row execute function public.touch_arc_studio_updated_at();

drop trigger if exists trg_arc_units_updated_at on public.arc_units;
create trigger trg_arc_units_updated_at before update on public.arc_units
for each row execute function public.touch_arc_studio_updated_at();

drop trigger if exists trg_arc_threads_updated_at on public.arc_threads;
create trigger trg_arc_threads_updated_at before update on public.arc_threads
for each row execute function public.touch_arc_studio_updated_at();

drop trigger if exists trg_arc_character_arcs_updated_at on public.arc_character_arcs;
create trigger trg_arc_character_arcs_updated_at before update on public.arc_character_arcs
for each row execute function public.touch_arc_studio_updated_at();

drop trigger if exists trg_arc_arc_stages_updated_at on public.arc_arc_stages;
create trigger trg_arc_arc_stages_updated_at before update on public.arc_arc_stages
for each row execute function public.touch_arc_studio_updated_at();

drop trigger if exists trg_arc_setups_payoffs_updated_at on public.arc_setups_payoffs;
create trigger trg_arc_setups_payoffs_updated_at before update on public.arc_setups_payoffs
for each row execute function public.touch_arc_studio_updated_at();

alter table public.arc_projects enable row level security;
alter table public.arc_units enable row level security;
alter table public.arc_unit_elements enable row level security;
alter table public.arc_threads enable row level security;
alter table public.arc_thread_units enable row level security;
alter table public.arc_character_arcs enable row level security;
alter table public.arc_arc_stages enable row level security;
alter table public.arc_setups_payoffs enable row level security;

create policy "Users manage own arc projects" on public.arc_projects for all
using (exists (select 1 from public.users where users.id = arc_projects.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_projects.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own arc units" on public.arc_units for all
using (exists (select 1 from public.users where users.id = arc_units.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_units.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own arc unit elements" on public.arc_unit_elements for all
using (exists (select 1 from public.users where users.id = arc_unit_elements.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_unit_elements.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own arc threads" on public.arc_threads for all
using (exists (select 1 from public.users where users.id = arc_threads.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_threads.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own arc thread units" on public.arc_thread_units for all
using (exists (select 1 from public.users where users.id = arc_thread_units.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_thread_units.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own arc character arcs" on public.arc_character_arcs for all
using (exists (select 1 from public.users where users.id = arc_character_arcs.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_character_arcs.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own arc arc stages" on public.arc_arc_stages for all
using (exists (select 1 from public.users where users.id = arc_arc_stages.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_arc_stages.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own arc setups payoffs" on public.arc_setups_payoffs for all
using (exists (select 1 from public.users where users.id = arc_setups_payoffs.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_setups_payoffs.user_id and users.clerk_user_id = auth.uid()::text));

commit;
