begin;

alter table public.user_settings
  add column if not exists ai_model text not null default 'gpt-5.6-terra',
  add column if not exists ai_reasoning_effort text not null default 'high',
  add column if not exists ai_verbosity text not null default 'medium';

alter table public.user_settings
  drop constraint if exists user_settings_ai_model_check,
  drop constraint if exists user_settings_ai_reasoning_effort_check,
  drop constraint if exists user_settings_ai_verbosity_check;

alter table public.user_settings
  add constraint user_settings_ai_model_check
    check (ai_model in (
      'gpt-5.6-luna',
      'gpt-5.6-terra',
      'gpt-5.6-sol',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-nano',
      'gpt-5.4-mini'
    )),
  add constraint user_settings_ai_reasoning_effort_check
    check (ai_reasoning_effort in ('low', 'medium', 'high', 'pro')),
  add constraint user_settings_ai_verbosity_check
    check (ai_verbosity in ('low', 'medium', 'high'));

commit;
