begin;

alter table public.user_settings
  add column if not exists arc_studio_tutorial_dismissed boolean not null default false;

commit;
