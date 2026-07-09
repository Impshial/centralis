alter table public.chat_logs
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists search_text text not null default '',
  add column if not exists search_indexed_at timestamp with time zone;

alter table public.chat_logs
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(search_text, '')), 'C')
  ) stored;

create index if not exists idx_chat_logs_user_active_created_at
on public.chat_logs(user_id, created_at desc)
where deleted_at is null;

create index if not exists idx_chat_logs_search_vector
on public.chat_logs
using gin(search_vector);
