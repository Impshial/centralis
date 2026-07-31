begin;

alter table public.god_species
  add column if not exists custom_evolution_traits jsonb not null default '[]'::jsonb;

alter table public.god_evolution_events
  add column if not exists custom_evolution_traits jsonb not null default '[]'::jsonb;

update public.god_species
set custom_evolution_traits = jsonb_build_array(custom_evolution_trait)
where custom_evolution_trait is not null
  and btrim(custom_evolution_trait) <> ''
  and custom_evolution_traits = '[]'::jsonb;

update public.god_evolution_events
set custom_evolution_traits = jsonb_build_array(custom_evolution_trait)
where custom_evolution_trait is not null
  and btrim(custom_evolution_trait) <> ''
  and custom_evolution_traits = '[]'::jsonb;

commit;
