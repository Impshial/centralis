begin;

create table if not exists public.secureit_vaults (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  kdf text not null default 'PBKDF2-SHA256',
  kdf_iterations integer not null default 310000 check (kdf_iterations >= 100000),
  salt text not null,
  wrapped_key jsonb not null,
  recovery_salt text not null,
  recovery_wrapped_key jsonb not null,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.secureit_collections (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  encrypted_payload jsonb not null,
  sort_order integer not null default 0,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.secureit_items (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  collection_id uuid references public.secureit_collections(id) on delete set null,
  encrypted_payload jsonb not null,
  sort_order integer not null default 0,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_secureit_collections_user_sort
  on public.secureit_collections(user_id, sort_order, updated_at desc)
  where deleted = false;

create index if not exists idx_secureit_items_user_collection_sort
  on public.secureit_items(user_id, collection_id, sort_order, updated_at desc)
  where deleted = false;

create index if not exists idx_secureit_items_user_updated
  on public.secureit_items(user_id, updated_at desc)
  where deleted = false;

create or replace function public.touch_secureit_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_secureit_vaults_updated_at on public.secureit_vaults;
create trigger trg_secureit_vaults_updated_at
before update on public.secureit_vaults
for each row execute function public.touch_secureit_updated_at();

drop trigger if exists trg_secureit_collections_updated_at on public.secureit_collections;
create trigger trg_secureit_collections_updated_at
before update on public.secureit_collections
for each row execute function public.touch_secureit_updated_at();

drop trigger if exists trg_secureit_items_updated_at on public.secureit_items;
create trigger trg_secureit_items_updated_at
before update on public.secureit_items
for each row execute function public.touch_secureit_updated_at();

alter table public.secureit_vaults enable row level security;
alter table public.secureit_collections enable row level security;
alter table public.secureit_items enable row level security;

create policy "Users manage own secureit vaults" on public.secureit_vaults for all
using (exists (select 1 from public.users where users.id = secureit_vaults.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = secureit_vaults.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own secureit collections" on public.secureit_collections for all
using (exists (select 1 from public.users where users.id = secureit_collections.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = secureit_collections.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own secureit items" on public.secureit_items for all
using (exists (select 1 from public.users where users.id = secureit_items.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = secureit_items.user_id and users.clerk_user_id = auth.uid()::text));

commit;
