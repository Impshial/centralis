begin;

alter table public.god_species
  add column if not exists custom_evolution_trait text;

alter table public.god_evolution_events
  add column if not exists custom_evolution_trait text;

commit;
