begin;

do $$
begin
  if to_regclass('public.roleplayer_characters') is null
    and to_regclass('public.local_chat_characters') is not null then
    alter table public.local_chat_characters rename to roleplayer_characters;
  end if;

  if to_regclass('public.roleplayer_personas') is null
    and to_regclass('public.local_chat_personas') is not null then
    alter table public.local_chat_personas rename to roleplayer_personas;
  end if;

  if to_regclass('public.roleplayer_sessions') is null
    and to_regclass('public.local_chat_sessions') is not null then
    alter table public.local_chat_sessions rename to roleplayer_sessions;
  end if;

  if to_regclass('public.roleplayer_messages') is null
    and to_regclass('public.local_chat_messages') is not null then
    alter table public.local_chat_messages rename to roleplayer_messages;
  end if;

  if to_regclass('public.roleplayer_memories') is null
    and to_regclass('public.local_chat_memories') is not null then
    alter table public.local_chat_memories rename to roleplayer_memories;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_local_chat_updated_at'
      and not exists (
        select 1
        from pg_proc roleplayer_proc
        join pg_namespace roleplayer_ns on roleplayer_ns.oid = roleplayer_proc.pronamespace
        where roleplayer_ns.nspname = 'public'
          and roleplayer_proc.proname = 'set_roleplayer_updated_at'
      )
  ) then
    alter function public.set_local_chat_updated_at() rename to set_roleplayer_updated_at;
  end if;
end;
$$;

create or replace function public.set_roleplayer_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  item record;
  new_name text;
begin
  for item in
    select conrelid::regclass as table_name, conrelid, conname
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname like 'local_chat_%'
      and conrelid in (
        'public.roleplayer_characters'::regclass,
        'public.roleplayer_personas'::regclass,
        'public.roleplayer_sessions'::regclass,
        'public.roleplayer_messages'::regclass,
        'public.roleplayer_memories'::regclass
      )
  loop
    new_name := replace(item.conname, 'local_chat', 'roleplayer');
    if not exists (
      select 1
      from pg_constraint existing
      where existing.conrelid = item.conrelid
        and existing.conname = new_name
    ) then
      execute format('alter table %s rename constraint %I to %I', item.table_name, item.conname, new_name);
    end if;
  end loop;
end;
$$;

do $$
declare
  item record;
  new_name text;
begin
  for item in
    select schemaname, indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname like 'idx_local_chat_%'
  loop
    new_name := replace(item.indexname, 'idx_local_chat', 'idx_roleplayer');
    if to_regclass(format('%I.%I', item.schemaname, new_name)) is null then
      execute format('alter index %I.%I rename to %I', item.schemaname, item.indexname, new_name);
    end if;
  end loop;
end;
$$;

drop trigger if exists trg_local_chat_characters_updated_at on public.roleplayer_characters;
drop trigger if exists trg_roleplayer_characters_updated_at on public.roleplayer_characters;
create trigger trg_roleplayer_characters_updated_at
before update on public.roleplayer_characters
for each row execute function public.set_roleplayer_updated_at();

drop trigger if exists trg_local_chat_personas_updated_at on public.roleplayer_personas;
drop trigger if exists trg_roleplayer_personas_updated_at on public.roleplayer_personas;
create trigger trg_roleplayer_personas_updated_at
before update on public.roleplayer_personas
for each row execute function public.set_roleplayer_updated_at();

drop trigger if exists trg_local_chat_sessions_updated_at on public.roleplayer_sessions;
drop trigger if exists trg_roleplayer_sessions_updated_at on public.roleplayer_sessions;
create trigger trg_roleplayer_sessions_updated_at
before update on public.roleplayer_sessions
for each row execute function public.set_roleplayer_updated_at();

drop trigger if exists trg_local_chat_messages_updated_at on public.roleplayer_messages;
drop trigger if exists trg_roleplayer_messages_updated_at on public.roleplayer_messages;
create trigger trg_roleplayer_messages_updated_at
before update on public.roleplayer_messages
for each row execute function public.set_roleplayer_updated_at();

drop trigger if exists trg_local_chat_memories_updated_at on public.roleplayer_memories;
drop trigger if exists trg_roleplayer_memories_updated_at on public.roleplayer_memories;
create trigger trg_roleplayer_memories_updated_at
before update on public.roleplayer_memories
for each row execute function public.set_roleplayer_updated_at();

create index if not exists idx_roleplayer_characters_user_updated
on public.roleplayer_characters(user_id, updated_at desc);

create index if not exists idx_roleplayer_characters_user_active
on public.roleplayer_characters(user_id, is_archived, name);

create index if not exists idx_roleplayer_personas_user_updated
on public.roleplayer_personas(user_id, updated_at desc);

create unique index if not exists idx_roleplayer_personas_one_default
on public.roleplayer_personas(user_id)
where is_default = true and is_archived = false;

create index if not exists idx_roleplayer_sessions_user_updated
on public.roleplayer_sessions(user_id, updated_at desc);

create index if not exists idx_roleplayer_sessions_character
on public.roleplayer_sessions(character_id, last_message_at desc nulls last);

create index if not exists idx_roleplayer_messages_session_sequence
on public.roleplayer_messages(session_id, sequence_number);

create index if not exists idx_roleplayer_messages_user_created
on public.roleplayer_messages(user_id, created_at desc);

create index if not exists idx_roleplayer_memories_session_active
on public.roleplayer_memories(session_id, status, importance desc);

create index if not exists idx_roleplayer_memories_user_created
on public.roleplayer_memories(user_id, created_at desc);

alter table public.roleplayer_characters enable row level security;
alter table public.roleplayer_personas enable row level security;
alter table public.roleplayer_sessions enable row level security;
alter table public.roleplayer_messages enable row level security;
alter table public.roleplayer_memories enable row level security;

drop policy if exists local_chat_characters_admin_owned_select on public.roleplayer_characters;
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

drop policy if exists local_chat_characters_admin_owned_insert on public.roleplayer_characters;
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

drop policy if exists local_chat_characters_admin_owned_update on public.roleplayer_characters;
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

drop policy if exists local_chat_characters_admin_owned_delete on public.roleplayer_characters;
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

drop policy if exists local_chat_personas_admin_owned_all on public.roleplayer_personas;
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

drop policy if exists local_chat_sessions_admin_owned_all on public.roleplayer_sessions;
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

drop policy if exists local_chat_messages_admin_owned_all on public.roleplayer_messages;
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

drop policy if exists local_chat_memories_admin_owned_all on public.roleplayer_memories;
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

drop function if exists public.set_local_chat_updated_at();

commit;
