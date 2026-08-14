begin;

alter table public.generation_jobs
  add column if not exists result_payload jsonb;

alter table public.generation_jobs
  drop constraint if exists generation_jobs_module_check;

alter table public.generation_jobs
  add constraint generation_jobs_module_check
  check (module in ('image_generation', 'universe_builder', 'stellar_architect', 'god_engine', 'fusion', 'arc_studio'));

alter table public.generation_jobs
  drop constraint if exists generation_jobs_job_type_check;

alter table public.generation_jobs
  add constraint generation_jobs_job_type_check
  check (job_type in ('image', 'colony', 'colonists', 'manuscript_outline'));

create index if not exists generation_jobs_active_arc_manuscript_idx
  on public.generation_jobs(user_id, source_type, source_id)
  where module = 'arc_studio'
    and job_type = 'manuscript_outline'
    and status in ('queued', 'running')
    and source_id is not null;

commit;
