begin;

alter table public.image_generation_sessions
  add column if not exists active_settings jsonb not null default '{"provider":"venice","model":"gpt-image-2","n":1,"size":"auto","format":"png","moderation":"low"}'::jsonb;

update public.image_generation_sessions
set active_settings = '{"provider":"venice","model":"gpt-image-2","n":1,"size":"auto","format":"png","moderation":"low"}'::jsonb
where active_settings is null or active_settings = '{}'::jsonb;

commit;
