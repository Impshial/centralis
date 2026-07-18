begin;

alter table public.image_generation_assets
  add column if not exists generation_settings jsonb not null default '{}'::jsonb;

update public.image_generation_assets as asset
set generation_settings = coalesce(message.settings_snapshot, '{}'::jsonb)
from public.image_generation_messages as message
where asset.message_id = message.id
  and asset.asset_kind = 'output'
  and asset.generation_settings = '{}'::jsonb;

commit;
