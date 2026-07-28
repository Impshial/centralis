begin;

update public.chat_logs
set deleted = true
where deleted_at is not null
  and coalesce(deleted, false) = false;

commit;
