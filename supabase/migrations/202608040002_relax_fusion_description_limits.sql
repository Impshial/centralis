begin;

alter table public.fusion_level0_items
  drop constraint if exists fusion_level0_items_description_check;

alter table public.fusion_level0_items
  add constraint fusion_level0_items_description_check
  check (char_length(btrim(description)) >= 1);

alter table public.fusion_game_discoveries
  drop constraint if exists fusion_game_discoveries_description_check;

alter table public.fusion_game_discoveries
  add constraint fusion_game_discoveries_description_check
  check (char_length(btrim(description)) >= 1);

commit;
