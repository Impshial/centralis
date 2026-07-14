alter table public.universes
add column if not exists opened_at timestamptz;
