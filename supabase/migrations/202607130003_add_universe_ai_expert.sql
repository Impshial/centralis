begin;

create table if not exists public.universe_ai_sources (
  universe_id varchar primary key references public.universes(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  vector_store_id text,
  current_file_id text,
  content_hash text,
  sync_status text not null default 'dirty' check (sync_status in ('dirty', 'syncing', 'ready', 'error')),
  sync_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_universe_ai_sources_user_id
on public.universe_ai_sources(user_id);

create index if not exists idx_universe_ai_sources_status
on public.universe_ai_sources(user_id, sync_status);

create table if not exists public.universe_ai_chats (
  id uuid primary key default gen_random_uuid(),
  universe_id varchar not null references public.universes(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  title text not null default 'AI Expert',
  openai_conversation_id text,
  last_response_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, universe_id)
);

create index if not exists idx_universe_ai_chats_universe_id
on public.universe_ai_chats(universe_id);

create index if not exists idx_universe_ai_chats_user_id
on public.universe_ai_chats(user_id);

create table if not exists public.universe_ai_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.universe_ai_chats(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) > 0),
  openai_response_id text,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_universe_ai_messages_chat_created_at
on public.universe_ai_messages(chat_id, created_at);

create index if not exists idx_universe_ai_messages_user_id
on public.universe_ai_messages(user_id);

alter table public.universe_ai_sources enable row level security;
alter table public.universe_ai_chats enable row level security;
alter table public.universe_ai_messages enable row level security;

drop policy if exists "Users can view their own universe AI sources" on public.universe_ai_sources;
create policy "Users can view their own universe AI sources"
on public.universe_ai_sources
for select
using (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_sources.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can insert their own universe AI sources" on public.universe_ai_sources;
create policy "Users can insert their own universe AI sources"
on public.universe_ai_sources
for insert
with check (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_sources.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can update their own universe AI sources" on public.universe_ai_sources;
create policy "Users can update their own universe AI sources"
on public.universe_ai_sources
for update
using (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_sources.user_id
      and users.clerk_user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_sources.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can view their own universe AI chats" on public.universe_ai_chats;
create policy "Users can view their own universe AI chats"
on public.universe_ai_chats
for select
using (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_chats.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can insert their own universe AI chats" on public.universe_ai_chats;
create policy "Users can insert their own universe AI chats"
on public.universe_ai_chats
for insert
with check (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_chats.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can update their own universe AI chats" on public.universe_ai_chats;
create policy "Users can update their own universe AI chats"
on public.universe_ai_chats
for update
using (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_chats.user_id
      and users.clerk_user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_chats.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can view their own universe AI messages" on public.universe_ai_messages;
create policy "Users can view their own universe AI messages"
on public.universe_ai_messages
for select
using (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_messages.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can insert their own universe AI messages" on public.universe_ai_messages;
create policy "Users can insert their own universe AI messages"
on public.universe_ai_messages
for insert
with check (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_messages.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create or replace function public.mark_universe_ai_source_dirty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_universe_id varchar;
begin
  if tg_table_name = 'universes' then
    target_universe_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'elements' then
    target_universe_id := coalesce(new.universe_id, old.universe_id);
  elsif tg_table_name = 'element_links' then
    target_universe_id := coalesce(new.universe_id, old.universe_id);
  end if;

  if target_universe_id is not null then
    update public.universe_ai_sources
    set sync_status = 'dirty',
        sync_error = null,
        updated_at = now()
    where universe_id = target_universe_id
      and sync_status <> 'dirty';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_universes_mark_ai_dirty on public.universes;
create trigger trg_universes_mark_ai_dirty
after update of name, description on public.universes
for each row
when (old.name is distinct from new.name or old.description is distinct from new.description)
execute function public.mark_universe_ai_source_dirty();

drop trigger if exists trg_elements_mark_ai_dirty on public.elements;
create trigger trg_elements_mark_ai_dirty
after insert or update or delete on public.elements
for each row
execute function public.mark_universe_ai_source_dirty();

drop trigger if exists trg_element_links_mark_ai_dirty on public.element_links;
create trigger trg_element_links_mark_ai_dirty
after insert or update or delete on public.element_links
for each row
execute function public.mark_universe_ai_source_dirty();

commit;
