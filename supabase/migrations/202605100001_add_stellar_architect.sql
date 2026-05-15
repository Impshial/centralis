create table if not exists public.stellar_systems (
  id varchar primary key default (gen_random_uuid())::varchar,
  user_id integer not null references public.users(id) on delete cascade,
  name varchar not null,
  catalog_code varchar,
  description text,
  star_count integer not null default 1,
  planet_count integer not null default 0,
  asteroid_belt_count integer not null default 0,
  age_gyr numeric,
  galactic_position text,
  generated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.stellar_stars (
  id varchar primary key default (gen_random_uuid())::varchar,
  user_id integer not null references public.users(id) on delete cascade,
  system_id varchar not null references public.stellar_systems(id) on delete cascade,
  name varchar not null,
  designation varchar,
  spectral_type varchar,
  stellar_class varchar,
  mass_solar numeric,
  radius_solar numeric,
  luminosity_solar numeric,
  temperature_k integer,
  metallicity_feh numeric,
  rotational_velocity_kms numeric,
  magnetic_activity varchar,
  age_gyr numeric,
  evolutionary_stage varchar,
  habitable_zone_inner_au numeric,
  habitable_zone_outer_au numeric,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.stellar_planets (
  id varchar primary key default (gen_random_uuid())::varchar,
  user_id integer not null references public.users(id) on delete cascade,
  system_id varchar not null references public.stellar_systems(id) on delete cascade,
  star_id varchar references public.stellar_stars(id) on delete set null,
  name varchar not null,
  designation varchar,
  planet_number integer not null default 0,
  type varchar not null default 'Rocky Terrestrial',
  habitability varchar,
  mass_earth numeric,
  radius_earth numeric,
  density_g_cm3 numeric,
  gravity_ms2 numeric,
  orbital_distance_au numeric,
  orbital_period_days numeric,
  rotation_period_hours numeric,
  escape_velocity_kms numeric,
  day_length_hours numeric,
  surface_temperature_k integer,
  atmosphere text,
  water_presence text,
  magnetosphere varchar,
  climate text,
  orbital_eccentricity numeric,
  axial_tilt_degrees numeric,
  rings boolean not null default false,
  moon_count integer not null default 0,
  lifeform_count integer not null default 0,
  colony_count integer not null default 0,
  visual_appearance text,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.stellar_moons (
  id varchar primary key default (gen_random_uuid())::varchar,
  user_id integer not null references public.users(id) on delete cascade,
  system_id varchar not null references public.stellar_systems(id) on delete cascade,
  planet_id varchar not null references public.stellar_planets(id) on delete cascade,
  name varchar not null,
  designation varchar,
  moon_number integer not null default 1,
  type varchar,
  mass_lunar numeric,
  radius_lunar numeric,
  density_g_cm3 numeric,
  orbital_distance_km numeric,
  orbital_period_days numeric,
  rotation_period_days numeric,
  surface_temperature_k integer,
  atmosphere text,
  water_presence text,
  geological_activity varchar,
  magnetosphere varchar,
  habitability text,
  lifeform_count integer not null default 0,
  visual_appearance text,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.stellar_lifeforms (
  id varchar primary key default (gen_random_uuid())::varchar,
  user_id integer not null references public.users(id) on delete cascade,
  system_id varchar not null references public.stellar_systems(id) on delete cascade,
  planet_id varchar references public.stellar_planets(id) on delete cascade,
  moon_id varchar references public.stellar_moons(id) on delete cascade,
  name varchar not null,
  species_name varchar,
  kingdom varchar,
  habitat varchar,
  scale text,
  diet text,
  locomotion text,
  skin_color text,
  reproduction text,
  sensory text,
  thermal_regulation text,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.stellar_colonies (
  id varchar primary key default (gen_random_uuid())::varchar,
  user_id integer not null references public.users(id) on delete cascade,
  system_id varchar not null references public.stellar_systems(id) on delete cascade,
  planet_id varchar references public.stellar_planets(id) on delete cascade,
  moon_id varchar references public.stellar_moons(id) on delete cascade,
  name varchar not null,
  founded_year integer,
  organization text,
  settlement_type text,
  population integer,
  primary_biome text,
  local_hazards text,
  energy_sources text,
  water_source text,
  industry text,
  food_production text,
  housing text,
  supply_status text,
  government_type text,
  defensive_structures text,
  communication text,
  research_focus text,
  description text,
  colonist_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.stellar_colonists (
  id varchar primary key default (gen_random_uuid())::varchar,
  user_id integer not null references public.users(id) on delete cascade,
  system_id varchar not null references public.stellar_systems(id) on delete cascade,
  colony_id varchar not null references public.stellar_colonies(id) on delete cascade,
  name varchar not null,
  role text,
  department text,
  age integer,
  gender text,
  nationality text,
  ethnicity text,
  family_status text,
  physical_description text,
  field_of_study text,
  specialization text,
  primary_role text,
  secondary_role text,
  personality text,
  temperament text,
  beliefs text,
  political_views text,
  languages jsonb,
  biography text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_stellar_systems_user_id on public.stellar_systems(user_id);
create index if not exists idx_stellar_stars_user_id on public.stellar_stars(user_id);
create index if not exists idx_stellar_stars_system_id on public.stellar_stars(system_id);
create index if not exists idx_stellar_planets_user_id on public.stellar_planets(user_id);
create index if not exists idx_stellar_planets_system_id on public.stellar_planets(system_id);
create index if not exists idx_stellar_planets_star_id on public.stellar_planets(star_id);
create index if not exists idx_stellar_moons_user_id on public.stellar_moons(user_id);
create index if not exists idx_stellar_moons_system_id on public.stellar_moons(system_id);
create index if not exists idx_stellar_moons_planet_id on public.stellar_moons(planet_id);
create index if not exists idx_stellar_lifeforms_planet_id on public.stellar_lifeforms(planet_id);
create index if not exists idx_stellar_lifeforms_moon_id on public.stellar_lifeforms(moon_id);
create index if not exists idx_stellar_colonies_planet_id on public.stellar_colonies(planet_id);
create index if not exists idx_stellar_colonies_moon_id on public.stellar_colonies(moon_id);
create index if not exists idx_stellar_colonists_colony_id on public.stellar_colonists(colony_id);
