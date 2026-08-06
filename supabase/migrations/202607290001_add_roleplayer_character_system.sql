begin;

create table if not exists public.roleplayer_characters (
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

create index if not exists idx_roleplayer_characters_user_updated
on public.roleplayer_characters(user_id, updated_at desc);

create index if not exists idx_roleplayer_characters_user_active
on public.roleplayer_characters(user_id, is_archived, name);

create table if not exists public.roleplayer_personas (
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

create index if not exists idx_roleplayer_personas_user_updated
on public.roleplayer_personas(user_id, updated_at desc);

create unique index if not exists idx_roleplayer_personas_one_default
on public.roleplayer_personas(user_id)
where is_default = true and is_archived = false;

create table if not exists public.roleplayer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  title text,
  character_id uuid not null references public.roleplayer_characters(id) on delete restrict,
  persona_id uuid references public.roleplayer_personas(id) on delete set null,
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

create index if not exists idx_roleplayer_sessions_user_updated
on public.roleplayer_sessions(user_id, updated_at desc);

create index if not exists idx_roleplayer_sessions_character
on public.roleplayer_sessions(character_id, last_message_at desc nulls last);

create table if not exists public.roleplayer_messages (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  session_id uuid not null references public.roleplayer_sessions(id) on delete cascade,
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

create index if not exists idx_roleplayer_messages_session_sequence
on public.roleplayer_messages(session_id, sequence_number);

create index if not exists idx_roleplayer_messages_user_created
on public.roleplayer_messages(user_id, created_at desc);

create table if not exists public.roleplayer_memories (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  session_id uuid not null references public.roleplayer_sessions(id) on delete cascade,
  source_message_id uuid references public.roleplayer_messages(id) on delete set null,
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
  supersedes_memory_id uuid references public.roleplayer_memories(id) on delete set null,
  recall_count integer not null default 0,
  last_recalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roleplayer_memories_session_active
on public.roleplayer_memories(session_id, status, importance desc);

create index if not exists idx_roleplayer_memories_user_created
on public.roleplayer_memories(user_id, created_at desc);

create or replace function public.set_roleplayer_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_roleplayer_characters_updated_at on public.roleplayer_characters;
create trigger trg_roleplayer_characters_updated_at
before update on public.roleplayer_characters
for each row execute function public.set_roleplayer_updated_at();

drop trigger if exists trg_roleplayer_personas_updated_at on public.roleplayer_personas;
create trigger trg_roleplayer_personas_updated_at
before update on public.roleplayer_personas
for each row execute function public.set_roleplayer_updated_at();

drop trigger if exists trg_roleplayer_sessions_updated_at on public.roleplayer_sessions;
create trigger trg_roleplayer_sessions_updated_at
before update on public.roleplayer_sessions
for each row execute function public.set_roleplayer_updated_at();

drop trigger if exists trg_roleplayer_messages_updated_at on public.roleplayer_messages;
create trigger trg_roleplayer_messages_updated_at
before update on public.roleplayer_messages
for each row execute function public.set_roleplayer_updated_at();

drop trigger if exists trg_roleplayer_memories_updated_at on public.roleplayer_memories;
create trigger trg_roleplayer_memories_updated_at
before update on public.roleplayer_memories
for each row execute function public.set_roleplayer_updated_at();

alter table public.roleplayer_characters enable row level security;
alter table public.roleplayer_personas enable row level security;
alter table public.roleplayer_sessions enable row level security;
alter table public.roleplayer_messages enable row level security;
alter table public.roleplayer_memories enable row level security;

drop policy if exists roleplayer_characters_admin_owned_select on public.roleplayer_characters;
create policy roleplayer_characters_admin_owned_select on public.roleplayer_characters
for select using (
  exists (
    select 1 from public.users
    where users.id = roleplayer_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists roleplayer_characters_admin_owned_insert on public.roleplayer_characters;
create policy roleplayer_characters_admin_owned_insert on public.roleplayer_characters
for insert with check (
  exists (
    select 1 from public.users
    where users.id = roleplayer_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists roleplayer_characters_admin_owned_update on public.roleplayer_characters;
create policy roleplayer_characters_admin_owned_update on public.roleplayer_characters
for update using (
  exists (
    select 1 from public.users
    where users.id = roleplayer_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = roleplayer_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists roleplayer_characters_admin_owned_delete on public.roleplayer_characters;
create policy roleplayer_characters_admin_owned_delete on public.roleplayer_characters
for delete using (
  exists (
    select 1 from public.users
    where users.id = roleplayer_characters.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists roleplayer_personas_admin_owned_all on public.roleplayer_personas;
create policy roleplayer_personas_admin_owned_all on public.roleplayer_personas
for all using (
  exists (
    select 1 from public.users
    where users.id = roleplayer_personas.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = roleplayer_personas.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
);

drop policy if exists roleplayer_sessions_admin_owned_all on public.roleplayer_sessions;
create policy roleplayer_sessions_admin_owned_all on public.roleplayer_sessions
for all using (
  exists (
    select 1 from public.users
    where users.id = roleplayer_sessions.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = roleplayer_sessions.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
  and exists (
    select 1 from public.roleplayer_characters
    where roleplayer_characters.id = roleplayer_sessions.character_id
      and roleplayer_characters.user_id = roleplayer_sessions.user_id
  )
  and (
    roleplayer_sessions.persona_id is null
    or exists (
      select 1 from public.roleplayer_personas
      where roleplayer_personas.id = roleplayer_sessions.persona_id
        and roleplayer_personas.user_id = roleplayer_sessions.user_id
    )
  )
);

drop policy if exists roleplayer_messages_admin_owned_all on public.roleplayer_messages;
create policy roleplayer_messages_admin_owned_all on public.roleplayer_messages
for all using (
  exists (
    select 1 from public.users
    where users.id = roleplayer_messages.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = roleplayer_messages.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
  and exists (
    select 1 from public.roleplayer_sessions
    where roleplayer_sessions.id = roleplayer_messages.session_id
      and roleplayer_sessions.user_id = roleplayer_messages.user_id
  )
);

drop policy if exists roleplayer_memories_admin_owned_all on public.roleplayer_memories;
create policy roleplayer_memories_admin_owned_all on public.roleplayer_memories
for all using (
  exists (
    select 1 from public.users
    where users.id = roleplayer_memories.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
) with check (
  exists (
    select 1 from public.users
    where users.id = roleplayer_memories.user_id
      and users.clerk_user_id = auth.uid()::text
      and coalesce(users.admin, false) is true
  )
  and exists (
    select 1 from public.roleplayer_sessions
    where roleplayer_sessions.id = roleplayer_memories.session_id
      and roleplayer_sessions.user_id = roleplayer_memories.user_id
  )
);

commit;
