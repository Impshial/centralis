begin;

create table if not exists public.arc_source_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.arc_projects(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  storage_key text not null unique,
  original_filename text not null,
  display_name text,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_arc_source_documents_project_created
on public.arc_source_documents(project_id, created_at desc);

create index if not exists idx_arc_source_documents_user_created
on public.arc_source_documents(user_id, created_at desc);

drop trigger if exists trg_arc_source_documents_updated_at on public.arc_source_documents;
create trigger trg_arc_source_documents_updated_at before update on public.arc_source_documents
for each row execute function public.touch_arc_studio_updated_at();

alter table public.arc_source_documents enable row level security;

drop policy if exists "Users manage own arc source documents" on public.arc_source_documents;
create policy "Users manage own arc source documents" on public.arc_source_documents for all
using (
  exists (
    select 1
    from public.users
    where users.id = arc_source_documents.user_id
      and users.clerk_user_id = auth.uid()::text
  )
  and exists (
    select 1
    from public.arc_projects
    where arc_projects.id = arc_source_documents.project_id
      and arc_projects.user_id = arc_source_documents.user_id
      and coalesce(arc_projects.deleted, false) = false
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = arc_source_documents.user_id
      and users.clerk_user_id = auth.uid()::text
  )
  and exists (
    select 1
    from public.arc_projects
    where arc_projects.id = arc_source_documents.project_id
      and arc_projects.user_id = arc_source_documents.user_id
      and coalesce(arc_projects.deleted, false) = false
  )
);

commit;
