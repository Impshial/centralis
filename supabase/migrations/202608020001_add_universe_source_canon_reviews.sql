begin;

create table if not exists public.universe_source_canon_reviews (
  id uuid primary key default gen_random_uuid(),
  universe_id varchar not null references public.universes(id) on delete cascade,
  source_document_id uuid not null references public.universe_source_documents(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  status text not null default 'conflicts_ready' check (status in ('conflicts_ready', 'notes_saved', 'suggestions_ready', 'finalized', 'failed')),
  document_summary text,
  new_information_summary text,
  ai_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists public.universe_source_canon_conflicts (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.universe_source_canon_reviews(id) on delete cascade,
  universe_id varchar not null references public.universes(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  title text not null,
  conflict_type text,
  canon_summary text,
  document_summary text,
  suggested_merge text,
  decision text check (decision in ('keep_canon', 'use_document', 'merge')),
  accepted_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.universe_source_canon_notes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.universe_source_canon_reviews(id) on delete cascade,
  conflict_id uuid references public.universe_source_canon_conflicts(id) on delete set null,
  universe_id varchar not null references public.universes(id) on delete cascade,
  source_document_id uuid references public.universe_source_documents(id) on delete set null,
  user_id integer not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  note_type text not null default 'reviewed_source' check (note_type in ('reviewed_source', 'conflict_resolution', 'new_information')),
  decision text check (decision in ('keep_canon', 'use_document', 'merge')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.universe_source_element_suggestions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.universe_source_canon_reviews(id) on delete cascade,
  universe_id varchar not null references public.universes(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  temp_id text not null,
  name text not null,
  description text not null,
  element_type_name text,
  links jsonb not null default '[]'::jsonb,
  selected boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'finalized', 'dismissed')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_source_canon_reviews_universe_created
on public.universe_source_canon_reviews(universe_id, created_at desc);

create index if not exists idx_source_canon_conflicts_review
on public.universe_source_canon_conflicts(review_id, sort_order);

create index if not exists idx_source_canon_notes_universe_created
on public.universe_source_canon_notes(universe_id, created_at desc);

create index if not exists idx_source_element_suggestions_review
on public.universe_source_element_suggestions(review_id, sort_order);

alter table public.universe_source_canon_reviews enable row level security;
alter table public.universe_source_canon_conflicts enable row level security;
alter table public.universe_source_canon_notes enable row level security;
alter table public.universe_source_element_suggestions enable row level security;

drop policy if exists "Users manage own source canon reviews" on public.universe_source_canon_reviews;
create policy "Users manage own source canon reviews" on public.universe_source_canon_reviews for all
using (exists (select 1 from public.users where users.id = universe_source_canon_reviews.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = universe_source_canon_reviews.user_id and users.clerk_user_id = auth.uid()::text));

drop policy if exists "Users manage own source canon conflicts" on public.universe_source_canon_conflicts;
create policy "Users manage own source canon conflicts" on public.universe_source_canon_conflicts for all
using (exists (select 1 from public.users where users.id = universe_source_canon_conflicts.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = universe_source_canon_conflicts.user_id and users.clerk_user_id = auth.uid()::text));

drop policy if exists "Users manage own source canon notes" on public.universe_source_canon_notes;
create policy "Users manage own source canon notes" on public.universe_source_canon_notes for all
using (exists (select 1 from public.users where users.id = universe_source_canon_notes.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = universe_source_canon_notes.user_id and users.clerk_user_id = auth.uid()::text));

drop policy if exists "Users manage own source element suggestions" on public.universe_source_element_suggestions;
create policy "Users manage own source element suggestions" on public.universe_source_element_suggestions for all
using (exists (select 1 from public.users where users.id = universe_source_element_suggestions.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = universe_source_element_suggestions.user_id and users.clerk_user_id = auth.uid()::text));

commit;
