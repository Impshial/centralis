begin;

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  module text not null check (module in ('image_generation', 'universe_builder', 'stellar_architect')),
  job_type text not null default 'image' check (job_type in ('image')),
  source_type text not null default 'unknown',
  source_id text,
  source_label text,
  prompt text not null default '',
  model text,
  parameters jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress_label text,
  source_message_id uuid references public.image_generation_messages(id) on delete cascade,
  result_image_id uuid,
  result_asset_id uuid references public.image_generation_assets(id) on delete set null,
  error_message text,
  error_details jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_user_status_updated_idx
  on public.generation_jobs(user_id, status, updated_at desc);
create index if not exists generation_jobs_user_created_idx
  on public.generation_jobs(user_id, created_at desc);
create index if not exists generation_jobs_source_message_idx
  on public.generation_jobs(source_message_id);

alter table public.generation_jobs enable row level security;

create or replace function public.touch_generation_job_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_generation_jobs_updated_at on public.generation_jobs;
create trigger trg_generation_jobs_updated_at
before update on public.generation_jobs
for each row execute function public.touch_generation_job_updated_at();

drop policy if exists "Users view own generation jobs" on public.generation_jobs;
create policy "Users view own generation jobs"
on public.generation_jobs for select
using (
  exists (
    select 1 from public.users
    where users.id = generation_jobs.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

commit;
