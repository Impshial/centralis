create table if not exists public.chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text not null check (char_length(btrim(summary)) between 1 and 2000),
  storage_key text not null unique,
  original_filename text not null,
  mime_type text not null default 'text/html',
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_chat_logs_user_created_at
on public.chat_logs(user_id, created_at desc);

alter table public.chat_logs enable row level security;

drop policy if exists "Users can view their own chat logs" on public.chat_logs;
create policy "Users can view their own chat logs"
on public.chat_logs
for select
using (
  exists (
    select 1
    from public.users
    where users.id = chat_logs.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can insert their own chat logs" on public.chat_logs;
create policy "Users can insert their own chat logs"
on public.chat_logs
for insert
with check (
  exists (
    select 1
    from public.users
    where users.id = chat_logs.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can update their own chat logs" on public.chat_logs;
create policy "Users can update their own chat logs"
on public.chat_logs
for update
using (
  exists (
    select 1
    from public.users
    where users.id = chat_logs.user_id
      and users.clerk_user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = chat_logs.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can delete their own chat logs" on public.chat_logs;
create policy "Users can delete their own chat logs"
on public.chat_logs
for delete
using (
  exists (
    select 1
    from public.users
    where users.id = chat_logs.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);
