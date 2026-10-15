-- Store memberships on the movie so edits/imports/bulk updates remain atomic.
-- Keep collection_id as the first membership for older clients and exports.
alter table public.movies
  add column collection_ids integer[] not null default '{}';

update public.movies m
set collection_ids = array[c.id]
from public.collections c
where m.collection_id = c.id and m.user_id = c.user_id and not c.deleted;

update public.movies
set collection_id = collection_ids[1]
where collection_id is distinct from collection_ids[1];

create index idx_movies_collection_ids on public.movies using gin (collection_ids);

create function public.validate_movie_collections()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_id integer;
begin
  if tg_op = 'INSERT' then
    if coalesce(cardinality(new.collection_ids), 0) = 0 and new.collection_id is not null then
      new.collection_ids := array[new.collection_id];
    end if;
  elsif new.collection_ids is not distinct from old.collection_ids
        and new.collection_id is distinct from old.collection_id then
    -- An older client explicitly changed its single collection.
    new.collection_ids := case when new.collection_id is null then '{}'::integer[] else array[new.collection_id] end;
  end if;

  -- Deduplicate while retaining the chosen primary collection's position.
  select coalesce(array_agg(id order by first_position), '{}'::integer[])
  into new.collection_ids
  from (
    select id, min(position) as first_position
    from unnest(new.collection_ids) with ordinality as members(id, position)
    where id is not null
    group by id
  ) unique_members;

  foreach linked_id in array new.collection_ids loop
    -- Lock referenced collections until the movie write completes, including
    -- against concurrent soft deletion. Never permit cross-account membership.
    perform 1 from public.collections c
    where c.id = linked_id and c.user_id = new.user_id and not c.deleted
    for share;
    if not found then
      raise exception 'Collection % is unavailable for this movie owner', linked_id
        using errcode = '23503';
    end if;
  end loop;

  new.collection_id := new.collection_ids[1];
  return new;
end;
$$;

create trigger movies_validate_collections
before insert or update of collection_ids, collection_id, user_id on public.movies
for each row execute function public.validate_movie_collections();

create function public.remove_movie_collection_memberships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if not (new.deleted and not old.deleted) and new.user_id is not distinct from old.user_id then
      return new;
    end if;
  end if;

  -- Remove only this membership; retain all other collections on each movie.
  update public.movies
  set collection_ids = array_remove(collection_ids, old.id), updated_at = now()
  where collection_ids @> array[old.id];

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger collections_remove_movie_memberships
before delete or update of deleted, user_id on public.collections
for each row execute function public.remove_movie_collection_memberships();

revoke all on function public.validate_movie_collections() from public;
revoke all on function public.remove_movie_collection_memberships() from public;

comment on column public.movies.collection_ids is
  'Ordered unique active collection IDs owned by this movie user. Validated on write; removed when a collection is deleted.';
comment on column public.movies.collection_id is
  'Compatibility field: first entry in collection_ids, or null. New clients should write collection_ids.';

notify pgrst, 'reload schema';
