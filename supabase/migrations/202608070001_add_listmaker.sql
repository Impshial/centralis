begin;

create table if not exists public.listmaker_lists (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  description text,
  template_key text not null default 'blank',
  behaviors jsonb not null default '{}'::jsonb,
  rating_type text check (rating_type in ('stars_5', 'number_10', 'percentage', 'thumbs')),
  default_view text not null default 'list' check (default_view in ('list', 'table')),
  settings jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listmaker_categories (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.listmaker_lists(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0,
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listmaker_statuses (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.listmaker_lists(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  color text not null default '#6366f1',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listmaker_fields (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.listmaker_lists(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  field_type text not null check (field_type in ('text', 'number', 'checkbox', 'date', 'dropdown', 'long_text')),
  dropdown_options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listmaker_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.listmaker_lists(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  title text not null default 'Untitled item',
  completed boolean not null default false,
  manual_order integer not null default 0,
  score numeric,
  rating numeric,
  category_id uuid references public.listmaker_categories(id) on delete set null,
  status_id uuid references public.listmaker_statuses(id) on delete set null,
  notes text,
  deleted_at timestamptz,
  deleted_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listmaker_field_values (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.listmaker_lists(id) on delete cascade,
  item_id uuid not null references public.listmaker_items(id) on delete cascade,
  field_id uuid not null references public.listmaker_fields(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  text_value text,
  number_value numeric,
  boolean_value boolean,
  date_value date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, field_id)
);

create index if not exists idx_listmaker_lists_user_active
  on public.listmaker_lists(user_id, updated_at desc)
  where archived_at is null and deleted_at is null;

create index if not exists idx_listmaker_lists_user_archive
  on public.listmaker_lists(user_id, archived_at desc)
  where archived_at is not null and deleted_at is null;

create index if not exists idx_listmaker_lists_user_trash
  on public.listmaker_lists(user_id, deleted_at desc)
  where deleted_at is not null;

create index if not exists idx_listmaker_items_list_order
  on public.listmaker_items(list_id, manual_order)
  where deleted_at is null;

create index if not exists idx_listmaker_items_list_category
  on public.listmaker_items(list_id, category_id)
  where deleted_at is null;

create index if not exists idx_listmaker_items_list_status
  on public.listmaker_items(list_id, status_id)
  where deleted_at is null;

create index if not exists idx_listmaker_fields_list_order
  on public.listmaker_fields(list_id, sort_order)
  where visible = true;

create index if not exists idx_listmaker_field_values_field
  on public.listmaker_field_values(field_id, text_value, number_value, boolean_value, date_value);

create or replace function public.touch_listmaker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_listmaker_lists_updated_at on public.listmaker_lists;
create trigger trg_listmaker_lists_updated_at before update on public.listmaker_lists
for each row execute function public.touch_listmaker_updated_at();

drop trigger if exists trg_listmaker_categories_updated_at on public.listmaker_categories;
create trigger trg_listmaker_categories_updated_at before update on public.listmaker_categories
for each row execute function public.touch_listmaker_updated_at();

drop trigger if exists trg_listmaker_statuses_updated_at on public.listmaker_statuses;
create trigger trg_listmaker_statuses_updated_at before update on public.listmaker_statuses
for each row execute function public.touch_listmaker_updated_at();

drop trigger if exists trg_listmaker_fields_updated_at on public.listmaker_fields;
create trigger trg_listmaker_fields_updated_at before update on public.listmaker_fields
for each row execute function public.touch_listmaker_updated_at();

drop trigger if exists trg_listmaker_items_updated_at on public.listmaker_items;
create trigger trg_listmaker_items_updated_at before update on public.listmaker_items
for each row execute function public.touch_listmaker_updated_at();

drop trigger if exists trg_listmaker_field_values_updated_at on public.listmaker_field_values;
create trigger trg_listmaker_field_values_updated_at before update on public.listmaker_field_values
for each row execute function public.touch_listmaker_updated_at();

create or replace function public.touch_listmaker_list_from_child()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    update public.listmaker_lists set updated_at = now() where id = old.list_id;
    return old;
  end if;

  update public.listmaker_lists set updated_at = now() where id = new.list_id;
  return new;
end;
$$;

drop trigger if exists trg_listmaker_categories_touch_list on public.listmaker_categories;
create trigger trg_listmaker_categories_touch_list
after insert or update or delete on public.listmaker_categories
for each row execute function public.touch_listmaker_list_from_child();

drop trigger if exists trg_listmaker_statuses_touch_list on public.listmaker_statuses;
create trigger trg_listmaker_statuses_touch_list
after insert or update or delete on public.listmaker_statuses
for each row execute function public.touch_listmaker_list_from_child();

drop trigger if exists trg_listmaker_fields_touch_list on public.listmaker_fields;
create trigger trg_listmaker_fields_touch_list
after insert or update or delete on public.listmaker_fields
for each row execute function public.touch_listmaker_list_from_child();

drop trigger if exists trg_listmaker_items_touch_list on public.listmaker_items;
create trigger trg_listmaker_items_touch_list
after insert or update or delete on public.listmaker_items
for each row execute function public.touch_listmaker_list_from_child();

drop trigger if exists trg_listmaker_field_values_touch_list on public.listmaker_field_values;
create trigger trg_listmaker_field_values_touch_list
after insert or update or delete on public.listmaker_field_values
for each row execute function public.touch_listmaker_list_from_child();

alter table public.listmaker_lists enable row level security;
alter table public.listmaker_categories enable row level security;
alter table public.listmaker_statuses enable row level security;
alter table public.listmaker_fields enable row level security;
alter table public.listmaker_items enable row level security;
alter table public.listmaker_field_values enable row level security;

create policy "Users manage own listmaker lists" on public.listmaker_lists for all
using (exists (select 1 from public.users where users.id = listmaker_lists.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = listmaker_lists.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own listmaker categories" on public.listmaker_categories for all
using (exists (select 1 from public.users where users.id = listmaker_categories.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = listmaker_categories.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own listmaker statuses" on public.listmaker_statuses for all
using (exists (select 1 from public.users where users.id = listmaker_statuses.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = listmaker_statuses.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own listmaker fields" on public.listmaker_fields for all
using (exists (select 1 from public.users where users.id = listmaker_fields.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = listmaker_fields.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own listmaker items" on public.listmaker_items for all
using (exists (select 1 from public.users where users.id = listmaker_items.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = listmaker_items.user_id and users.clerk_user_id = auth.uid()::text));

create policy "Users manage own listmaker field values" on public.listmaker_field_values for all
using (exists (select 1 from public.users where users.id = listmaker_field_values.user_id and users.clerk_user_id = auth.uid()::text))
with check (exists (select 1 from public.users where users.id = listmaker_field_values.user_id and users.clerk_user_id = auth.uid()::text));

commit;
