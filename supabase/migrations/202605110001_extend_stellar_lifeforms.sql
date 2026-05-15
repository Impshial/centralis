alter table public.stellar_lifeforms
add column if not exists designation varchar,
add column if not exists phylum varchar,
add column if not exists class_name varchar,
add column if not exists taxonomic_order varchar,
add column if not exists family varchar,
add column if not exists genus varchar,
add column if not exists species varchar,
add column if not exists biome varchar,
add column if not exists body_type text,
add column if not exists size_m numeric,
add column if not exists reproductive_method text;

create index if not exists idx_stellar_lifeforms_system_id
on public.stellar_lifeforms(system_id);
