alter table public.stellar_colonies
  add column if not exists location_type text,
  add column if not exists location_notes text;

alter table public.stellar_colonists
  add column if not exists profile jsonb not null default '{}'::jsonb;

alter table public.stellar_moons
  add column if not exists colony_count integer not null default 0;

alter table public.generation_jobs
  drop constraint if exists generation_jobs_job_type_check;

alter table public.generation_jobs
  add constraint generation_jobs_job_type_check
  check (job_type in ('image', 'colony', 'colonists'));

create index if not exists idx_stellar_colonies_user_system
  on public.stellar_colonies(user_id, system_id);

create index if not exists idx_stellar_colonists_user_system
  on public.stellar_colonists(user_id, system_id);

create unique index if not exists generation_jobs_active_stellar_colony_source_idx
  on public.generation_jobs(user_id, source_type, source_id)
  where module = 'stellar_architect'
    and job_type = 'colony'
    and status in ('queued', 'running')
    and source_id is not null;

create unique index if not exists generation_jobs_active_stellar_colonists_source_idx
  on public.generation_jobs(user_id, source_type, source_id)
  where module = 'stellar_architect'
    and job_type = 'colonists'
    and status in ('queued', 'running')
    and source_id is not null;
