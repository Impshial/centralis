begin;

create table if not exists public.image_generation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  title text not null default 'New Generation' check (char_length(btrim(title)) between 1 and 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.image_generation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.image_generation_sessions(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (char_length(content) <= 32000),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  endpoint text check (endpoint in ('generations', 'edits')),
  settings_snapshot jsonb not null default '{}'::jsonb,
  reference_asset_ids jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.image_generation_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.image_generation_sessions(id) on delete cascade,
  message_id uuid references public.image_generation_messages(id) on delete set null,
  user_id integer not null references public.users(id) on delete cascade,
  asset_kind text not null check (asset_kind in ('uploaded', 'output')),
  storage_key text not null unique,
  original_filename text not null,
  content_type text not null,
  byte_size bigint not null default 0 check (byte_size >= 0),
  width integer,
  height integer,
  sort_order integer not null default 0,
  revised_prompt text,
  created_at timestamptz not null default now()
);

create index if not exists idx_image_generation_sessions_user_updated
  on public.image_generation_sessions(user_id, updated_at desc);
create index if not exists idx_image_generation_messages_session_created
  on public.image_generation_messages(session_id, created_at);
create index if not exists idx_image_generation_assets_session_created
  on public.image_generation_assets(session_id, created_at);
create index if not exists idx_image_generation_assets_message
  on public.image_generation_assets(message_id, sort_order);

alter table public.image_generation_sessions enable row level security;
alter table public.image_generation_messages enable row level security;
alter table public.image_generation_assets enable row level security;

create or replace function public.owns_image_generation_record(target_user_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where users.id = target_user_id
      and users.clerk_user_id = auth.uid()::text
  );
$$;

drop policy if exists "Users manage own image generation sessions" on public.image_generation_sessions;
create policy "Users manage own image generation sessions"
on public.image_generation_sessions for all
using (public.owns_image_generation_record(user_id))
with check (public.owns_image_generation_record(user_id));

drop policy if exists "Users view own image generation messages" on public.image_generation_messages;
create policy "Users view own image generation messages"
on public.image_generation_messages for select
using (public.owns_image_generation_record(user_id));

drop policy if exists "Users view own image generation assets" on public.image_generation_assets;
create policy "Users view own image generation assets"
on public.image_generation_assets for select
using (public.owns_image_generation_record(user_id));

create or replace function public.touch_image_generation_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session_id uuid;
begin
  target_session_id := case
    when tg_op = 'DELETE' then old.session_id
    else new.session_id
  end;

  update public.image_generation_sessions
  set updated_at = now()
  where id = target_session_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_image_generation_messages_touch_session on public.image_generation_messages;
create trigger trg_image_generation_messages_touch_session
after insert or update or delete on public.image_generation_messages
for each row execute function public.touch_image_generation_session();

drop trigger if exists trg_image_generation_assets_touch_session on public.image_generation_assets;
create trigger trg_image_generation_assets_touch_session
after insert or update or delete on public.image_generation_assets
for each row execute function public.touch_image_generation_session();

commit;
