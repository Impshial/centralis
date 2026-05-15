create table if not exists public.franchise (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.collections (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.movies (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  title text not null,
  franchise_id integer references public.franchise(id) on delete set null,
  collection_id integer references public.collections(id) on delete set null,
  year_released integer not null,
  downloaded boolean not null default false,
  rated text,
  director text,
  date_released date,
  runtime text,
  genre text,
  writers text,
  actors text,
  plot text,
  poster_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists idx_franchise_user_name_unique
on public.franchise(user_id, lower(name));

create unique index if not exists idx_collections_user_name_unique
on public.collections(user_id, lower(name));

create index if not exists idx_franchise_user_id
on public.franchise(user_id);

create index if not exists idx_collections_user_id
on public.collections(user_id);

create index if not exists idx_movies_user_id
on public.movies(user_id);

create index if not exists idx_movies_user_title
on public.movies(user_id, lower(title));

create index if not exists idx_movies_user_downloaded
on public.movies(user_id, downloaded);

create index if not exists idx_movies_franchise_id
on public.movies(franchise_id);

create index if not exists idx_movies_collection_id
on public.movies(collection_id);
