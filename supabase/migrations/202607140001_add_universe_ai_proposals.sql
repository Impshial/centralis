begin;

create table if not exists public.universe_ai_proposals (
  id uuid primary key default gen_random_uuid(),
  universe_id varchar not null references public.universes(id) on delete cascade,
  chat_id uuid not null references public.universe_ai_chats(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  source_user_message_id uuid references public.universe_ai_messages(id) on delete set null,
  assistant_message_id uuid references public.universe_ai_messages(id) on delete cascade,
  proposal_type text not null check (proposal_type in ('create_elements')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'finalized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index if not exists idx_universe_ai_proposals_chat_id
on public.universe_ai_proposals(chat_id, created_at);

create index if not exists idx_universe_ai_proposals_message_id
on public.universe_ai_proposals(assistant_message_id);

create index if not exists idx_universe_ai_proposals_user_status
on public.universe_ai_proposals(user_id, status);

alter table public.universe_ai_proposals enable row level security;

drop policy if exists "Users can view their own universe AI proposals" on public.universe_ai_proposals;
create policy "Users can view their own universe AI proposals"
on public.universe_ai_proposals
for select
using (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_proposals.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can insert their own universe AI proposals" on public.universe_ai_proposals;
create policy "Users can insert their own universe AI proposals"
on public.universe_ai_proposals
for insert
with check (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_proposals.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

drop policy if exists "Users can update their own universe AI proposals" on public.universe_ai_proposals;
create policy "Users can update their own universe AI proposals"
on public.universe_ai_proposals
for update
using (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_proposals.user_id
      and users.clerk_user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = universe_ai_proposals.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

commit;
