begin;

create table if not exists public.universe_source_documents (
  id uuid primary key default gen_random_uuid(),
  universe_id varchar not null references public.universes(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  storage_key text not null unique,
  original_filename text not null,
  display_name text,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_universe_source_documents_universe_created
on public.universe_source_documents(universe_id, created_at desc);

create index if not exists idx_universe_source_documents_user_created
on public.universe_source_documents(user_id, created_at desc);

alter table public.universe_source_documents enable row level security;

drop policy if exists "Users can view their own universe source documents" on public.universe_source_documents;
create policy "Users can view their own universe source documents"
on public.universe_source_documents
for select
using (
  exists (
    select 1
    from public.users
    where users.id = universe_source_documents.user_id
      and users.clerk_user_id = auth.uid()::text
  )
  and exists (
    select 1
    from public.universes
    where universes.id = universe_source_documents.universe_id
      and universes.user_id = universe_source_documents.user_id
  )
);

drop policy if exists "Users can insert their own universe source documents" on public.universe_source_documents;
create policy "Users can insert their own universe source documents"
on public.universe_source_documents
for insert
with check (
  exists (
    select 1
    from public.users
    where users.id = universe_source_documents.user_id
      and users.clerk_user_id = auth.uid()::text
  )
  and exists (
    select 1
    from public.universes
    where universes.id = universe_source_documents.universe_id
      and universes.user_id = universe_source_documents.user_id
  )
);

drop policy if exists "Users can delete their own universe source documents" on public.universe_source_documents;
create policy "Users can delete their own universe source documents"
on public.universe_source_documents
for delete
using (
  exists (
    select 1
    from public.users
    where users.id = universe_source_documents.user_id
      and users.clerk_user_id = auth.uid()::text
  )
  and exists (
    select 1
    from public.universes
    where universes.id = universe_source_documents.universe_id
      and universes.user_id = universe_source_documents.user_id
  )
);

commit;
