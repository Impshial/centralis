begin;

create or replace function public.set_image_generation_asset_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prompt_settings jsonb;
begin
  if new.asset_kind = 'output'
    and coalesce(new.generation_settings, '{}'::jsonb) = '{}'::jsonb
    and new.message_id is not null
  then
    select settings_snapshot
    into prompt_settings
    from public.image_generation_messages
    where id = new.message_id;

    new.generation_settings := coalesce(prompt_settings, '{}'::jsonb);
  elsif new.asset_kind <> 'output' then
    new.generation_settings := coalesce(new.generation_settings, '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_image_generation_assets_set_settings on public.image_generation_assets;
create trigger trg_image_generation_assets_set_settings
before insert or update of message_id, asset_kind, generation_settings on public.image_generation_assets
for each row execute function public.set_image_generation_asset_settings();

commit;
