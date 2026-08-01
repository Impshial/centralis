begin;

alter table public.arc_units
add column if not exists chronology_sort numeric,
add column if not exists starts_at timestamptz,
add column if not exists ends_at timestamptz,
add column if not exists timeline_label text;

alter table public.arc_threads
add column if not exists current_state text,
add column if not exists next_movement text,
add column if not exists resolution_note text;

create table if not exists public.arc_unit_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  source_unit_id uuid not null references public.arc_units(id) on delete cascade,
  target_unit_id uuid not null references public.arc_units(id) on delete cascade,
  link_type text not null default 'causes' check (link_type in ('causes', 'enables', 'blocks', 'reveals', 'foreshadows', 'pays_off', 'contradicts', 'follows')),
  description text,
  status text not null default 'active' check (status in ('active', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_unit_id <> target_unit_id)
);

create table if not exists public.arc_element_states (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  unit_id uuid not null references public.arc_units(id) on delete cascade,
  element_id varchar not null references public.elements(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  state_type text not null default 'general' check (state_type in ('location', 'knowledge', 'goal', 'possession', 'condition', 'relationship', 'emotional_state', 'general')),
  value text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arc_diagnostic_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  scope text not null default 'project',
  instructions text,
  status text not null default 'complete' check (status in ('running', 'complete', 'failed')),
  summary text,
  diagnostics jsonb not null default '[]'::jsonb,
  dismissed_issue_keys jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_arc_units_project_chronology
on public.arc_units(project_id, chronology_sort, starts_at) where deleted = false;

create index if not exists idx_arc_unit_links_project_source
on public.arc_unit_links(project_id, source_unit_id);

create index if not exists idx_arc_unit_links_project_target
on public.arc_unit_links(project_id, target_unit_id);

create index if not exists idx_arc_element_states_unit
on public.arc_element_states(unit_id, element_id);

create index if not exists idx_arc_diagnostic_reports_project
on public.arc_diagnostic_reports(project_id, created_at desc);

drop trigger if exists trg_arc_unit_links_updated_at on public.arc_unit_links;
create trigger trg_arc_unit_links_updated_at before update on public.arc_unit_links
for each row execute function public.touch_arc_studio_updated_at();

drop trigger if exists trg_arc_element_states_updated_at on public.arc_element_states;
create trigger trg_arc_element_states_updated_at before update on public.arc_element_states
for each row execute function public.touch_arc_studio_updated_at();

drop trigger if exists trg_arc_diagnostic_reports_updated_at on public.arc_diagnostic_reports;
create trigger trg_arc_diagnostic_reports_updated_at before update on public.arc_diagnostic_reports
for each row execute function public.touch_arc_studio_updated_at();

alter table public.arc_unit_links enable row level security;
alter table public.arc_element_states enable row level security;
alter table public.arc_diagnostic_reports enable row level security;

create policy "Users manage own arc unit links" on public.arc_unit_links for all
using (exists (select 1 from public.users where users.id = arc_unit_links.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_unit_links.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own arc element states" on public.arc_element_states for all
using (exists (select 1 from public.users where users.id = arc_element_states.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_element_states.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own arc diagnostic reports" on public.arc_diagnostic_reports for all
using (exists (select 1 from public.users where users.id = arc_diagnostic_reports.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = arc_diagnostic_reports.user_id and users.clerk_user_id = auth.uid()::text));

commit;
