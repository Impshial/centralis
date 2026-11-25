begin;

-- Extend available choices without changing anyone's saved model or defaults.
alter table public.user_settings
  drop constraint if exists user_settings_ai_model_check;

alter table public.user_settings
  add constraint user_settings_ai_model_check
  check (ai_model in (
    'gpt-6.2-astra',
    'gpt-6.2-sol',
    'gpt-6.1-terra',
    'gpt-6-luna',
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-nano',
    'gpt-5.4-mini'
  ));

commit;
