begin;

create table if not exists public.local_chat_characters (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  avatar_path text,
  short_description text,
  description text,
  core_identity text,
  personality text,
  appearance text,
  background text,
  speech_style text,
  scenario text,
  behavior_instructions text,
  drift_guardrails text,
  system_prompt text,
  first_message text,
  tags text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_local_chat_characters_user_updated
on public.local_chat_characters(user_id, updated_at desc);

create index if not exists idx_local_chat_characters_user_active
on public.local_chat_characters(user_id, is_archived, name);

create table if not exists public.local_chat_personas (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  avatar_path text,
  short_description text,
  description text,
  appearance text,
  background text,
  personality text,
  relationship_context text,
  instructions text,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_local_chat_personas_user_updated
on public.local_chat_personas(user_id, updated_at desc);

create unique index if not exists idx_local_chat_personas_one_default
on public.local_chat_personas(user_id)
where is_default = true and is_archived = false;

create table if not exists public.local_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  title text,
  character_id uuid not null references public.local_chat_characters(id) on delete restrict,
  persona_id uuid references public.local_chat_personas(id) on delete set null,
  character_snapshot jsonb not null,
  persona_snapshot jsonb,
  model_name text not null check (char_length(btrim(model_name)) > 0),
  scenario_override text,
  system_prompt_override text,
  settings jsonb not null default '{}'::jsonb,
  conversation_summary text,
  relationship_summary text,
  scene_state jsonb not null default '{}'::jsonb,
  summarized_through_sequence bigint,
  memory_updated_through_sequence bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create index if not exists idx_local_chat_sessions_user_updated
on public.local_chat_sessions(user_id, updated_at desc);

create index if not exists idx_local_chat_sessions_character
on public.local_chat_sessions(character_id, last_message_at desc nulls last);

create table if not exists public.local_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  session_id uuid not null references public.local_chat_sessions(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'note')),
  content text not null check (char_length(btrim(content)) > 0),
  sequence_number bigint not null,
  model_name text,
  generation_metadata jsonb,
  is_hidden_from_context boolean not null default false,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, sequence_number)
);

create index if not exists idx_local_chat_messages_session_sequence
on public.local_chat_messages(session_id, sequence_number);

create index if not exists idx_local_chat_messages_user_created
on public.local_chat_messages(user_id, created_at desc);

create table if not exists public.local_chat_memories (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  session_id uuid not null references public.local_chat_sessions(id) on delete cascade,
  source_message_id uuid references public.local_chat_messages(id) on delete set null,
  memory_type text not null check (
    memory_type in (
      'fact',
      'preference',
      'event',
      'promise',
      'goal',
      'secret',
      'relationship',
      'emotion',
      'opinion',
      'boundary',
      'location',
      'possession',
      'injury',
      'identity',
      'plot_thread',
      'character_development',
      'major_event',
      'other'
    )
  ),
  subject text,
  content text not null check (char_length(btrim(content)) > 0),
  structured_data jsonb not null default '{}'::jsonb,
  importance numeric not null default 0.5 check (importance between 0 and 1),
  confidence numeric not null default 1.0 check (confidence between 0 and 1),
  status text not null default 'active' check (status in ('active', 'resolved', 'superseded', 'uncertain', 'forgotten')),
  is_pinned boolean not null default false,
  supersedes_memory_id uuid references public.local_chat_memories(id) on delete set null,
  recall_count integer not null default 0,
  last_recalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_local_chat_memories_session_active
on public.local_chat_memories(session_id, status, importance desc);

create index if not exists idx_local_chat_memories_user_created
on public.local_chat_memories(user_id, created_at desc);

create or replace function public.set_local_chat_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_local_chat_characters_updated_at on public.local_chat_characters;
create trigger trg_local_chat_characters_updated_at
before update on public.local_chat_characters
for each row execute function public.set_local_chat_updated_at();

drop trigger if exists trg_local_chat_personas_updated_at on public.local_chat_personas;
create trigger trg_local_chat_personas_updated_at
before update on public.local_chat_personas
for each row execute function public.set_local_chat_updated_at();

drop trigger if exists trg_local_chat_sessions_updated_at on public.local_chat_sessions;
create trigger trg_local_chat_sessions_updated_at
before update on public.local_chat_sessions
for each row execute function public.set_local_chat_updated_at();

drop trigger if exists trg_local_chat_messages_updated_at on public.local_chat_messages;
create trigger trg_local_chat_messages_updated_at
before update on public.local_chat_messages
for each row execute function public.set_local_chat_updated_at();

drop trigger if exists trg_local_chat_memories_updated_at on public.local_chat_memories;
create trigger trg_local_chat_memories_updated_at
before update on public.local_chat_memories
for each row execute function public.set_local_chat_updated_at();

alter table public.local_chat_characters enable row level security;
alter table public.local_chat_personas enable row level security;
alter table public.local_chat_sessions enable row level security;
alter table public.local_chat_messages enable row level security;
alter table public.local_chat_memories enable row level security;

drop policy if exists local_chat_characters_admin_owned_select on public.local_chat_characters;
create policy local_chat_characters_admin_owned_select on public.local_chat_characters
for select using (
  exists (
    select 1 from public.users
    where users.id = local_chat_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists local_chat_characters_admin_owned_insert on public.local_chat_characters;
create policy local_chat_characters_admin_owned_insert on public.local_chat_characters
for insert with check (
  exists (
    select 1 from public.users
    where users.id = local_chat_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists local_chat_characters_admin_owned_update on public.local_chat_characters;
create policy local_chat_characters_admin_owned_update on public.local_chat_characters
for update using (
  exists (
    select 1 from public.users
    where users.id = local_chat_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = local_chat_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists local_chat_characters_admin_owned_delete on public.local_chat_characters;
create policy local_chat_characters_admin_owned_delete on public.local_chat_characters
for delete using (
  exists (
    select 1 from public.users
    where users.id = local_chat_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists local_chat_personas_admin_owned_all on public.local_chat_personas;
create policy local_chat_personas_admin_owned_all on public.local_chat_personas
for all using (
  exists (
    select 1 from public.users
    where users.id = local_chat_personas.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = local_chat_personas.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists local_chat_sessions_admin_owned_all on public.local_chat_sessions;
create policy local_chat_sessions_admin_owned_all on public.local_chat_sessions
for all using (
  exists (
    select 1 from public.users
    where users.id = local_chat_sessions.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = local_chat_sessions.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
  and exists (
    select 1 from public.local_chat_characters
    where local_chat_characters.id = local_chat_sessions.character_id
      and local_chat_characters.user_id = local_chat_sessions.user_id
  )
  and (
    local_chat_sessions.persona_id is null
    or exists (
      select 1 from public.local_chat_personas
      where local_chat_personas.id = local_chat_sessions.persona_id
        and local_chat_personas.user_id = local_chat_sessions.user_id
    )
  )
);

drop policy if exists local_chat_messages_admin_owned_all on public.local_chat_messages;
create policy local_chat_messages_admin_owned_all on public.local_chat_messages
for all using (
  exists (
    select 1 from public.users
    where users.id = local_chat_messages.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = local_chat_messages.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
  and exists (
    select 1 from public.local_chat_sessions
    where local_chat_sessions.id = local_chat_messages.session_id
      and local_chat_sessions.user_id = local_chat_messages.user_id
  )
);

drop policy if exists local_chat_memories_admin_owned_all on public.local_chat_memories;
create policy local_chat_memories_admin_owned_all on public.local_chat_memories
for all using (
  exists (
    select 1 from public.users
    where users.id = local_chat_memories.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = local_chat_memories.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
  and exists (
    select 1 from public.local_chat_sessions
    where local_chat_sessions.id = local_chat_memories.session_id
      and local_chat_sessions.user_id = local_chat_memories.user_id
  )
);

commit;
