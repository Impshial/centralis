begin;

create table if not exists public.secureit_types (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  vault_id uuid not null references public.secureit_vaults(id) on delete cascade,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_secureit_types_user_vault
  on public.secureit_types(user_id, vault_id);

alter table public.secureit_types enable row level security;

create policy "Users manage own secureit types" on public.secureit_types for all
using (exists (
  select 1 from public.secureit_vaults vault
  join public.users on users.id = vault.user_id
  where vault.id = secureit_types.vault_id
    and vault.user_id = secureit_types.user_id
    and vault.deleted = false
    and users.clerk_user_id = auth.uid()::text
))
with check (exists (
  select 1 from public.secureit_vaults vault
  join public.users on users.id = vault.user_id
  where vault.id = secureit_types.vault_id
    and vault.user_id = secureit_types.user_id
    and vault.deleted = false
    and users.clerk_user_id = auth.uid()::text
));

commit;
