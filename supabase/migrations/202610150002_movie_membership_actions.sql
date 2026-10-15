-- Modify current memberships in one transaction rather than overwriting client snapshots.
create function public.update_movie_memberships(
  p_movie_ids integer[], p_membership_type text, p_operation text, p_target_ids integer[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id integer;
  movie_ids integer[];
  target_ids integer[];
  affected integer;
begin
  select u.id into actor_id from public.users u where u.clerk_user_id = auth.uid()::text;
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_membership_type is null or p_membership_type not in ('collection', 'franchise')
     or p_operation is null or p_operation not in ('add', 'remove') then
    raise exception 'Invalid membership operation';
  end if;
  if coalesce(cardinality(p_movie_ids), 0) = 0 or coalesce(cardinality(p_target_ids), 0) = 0
     or exists (select 1 from unnest(p_movie_ids || p_target_ids) id where id is null or id <= 0) then
    raise exception 'Choose movies and at least one membership';
  end if;
  select array_agg(distinct id order by id) into movie_ids from unnest(p_movie_ids) id;
  select array_agg(distinct id order by id) into target_ids from unnest(p_target_ids) id;
  if p_membership_type = 'franchise' and cardinality(target_ids) <> 1 then
    raise exception 'Choose exactly one franchise';
  end if;

  -- Reject stale, deleted, or foreign targets before changing any movie.
  if p_membership_type = 'collection' then
    perform c.id from public.collections c
    where c.id = any(target_ids) and c.user_id = actor_id and not c.deleted
    order by c.id for share;
  else
    perform f.id from public.franchise f
    where f.id = any(target_ids) and f.user_id = actor_id and not f.deleted
    order by f.id for share;
  end if;
  get diagnostics affected = row_count;
  if affected <> cardinality(target_ids) then raise exception 'One or more memberships are unavailable'; end if;

  -- Serialize changes to the selected movies, including selections on other pages.
  perform m.id from public.movies m
  where m.id = any(movie_ids) and m.user_id = actor_id and not m.deleted
  order by m.id for update;
  get diagnostics affected = row_count;
  if affected <> cardinality(movie_ids) then raise exception 'One or more selected movies are unavailable'; end if;

  if p_membership_type = 'collection' then
    if p_operation = 'add' then
      update public.movies m
      set collection_ids = m.collection_ids || target_ids, updated_at = now()
      where m.id = any(movie_ids) and m.user_id = actor_id and not m.deleted
        and not m.collection_ids @> target_ids;
      -- Existing validation trigger deduplicates and synchronizes collection_id.
    else
      update public.movies m
      set collection_ids = array(
        select id from unnest(m.collection_ids) with ordinality as members(id, position)
        where not (id = any(target_ids)) order by position
      ), updated_at = now()
      where m.id = any(movie_ids) and m.user_id = actor_id and not m.deleted
        and m.collection_ids && target_ids;
    end if;
  elsif p_operation = 'add' then
    update public.movies m set franchise_id = target_ids[1], updated_at = now()
    where m.id = any(movie_ids) and m.user_id = actor_id and not m.deleted
      and m.franchise_id is distinct from target_ids[1];
  else
    update public.movies m set franchise_id = null, updated_at = now()
    where m.id = any(movie_ids) and m.user_id = actor_id and not m.deleted
      and m.franchise_id = target_ids[1];
  end if;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.update_movie_memberships(integer[], text, text, integer[]) from public;
grant execute on function public.update_movie_memberships(integer[], text, text, integer[]) to authenticated;
notify pgrst, 'reload schema';
