begin;

alter table public.god_species
  add column if not exists years_since_parent integer not null default 0 check (years_since_parent between 0 and 5000000),
  add column if not exists elapsed_years bigint not null default 0 check (elapsed_years >= 0);

alter table public.god_evolution_events
  add column if not exists step_years jsonb not null default '[]'::jsonb,
  add column if not exists total_years integer not null default 0 check (total_years between 0 and 25000000);

commit;
