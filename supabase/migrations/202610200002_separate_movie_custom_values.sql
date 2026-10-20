-- Repair the earlier custom-field migration: extension data belongs in separate tables.
create table public.movie_custom_values (
 movie_id integer primary key references public.movies(id) on delete cascade,
 user_id integer not null references public.users(id) on delete cascade,
 custom_values jsonb not null default '{}'
);
alter table public.movie_custom_values enable row level security;
create policy movie_custom_values_owner on public.movie_custom_values for all to authenticated
using (user_id in (select id from public.users where clerk_user_id=auth.uid()::text))
with check (user_id in (select id from public.users where clerk_user_id=auth.uid()::text)
 and exists(select 1 from public.movies m where m.id=movie_id and m.user_id=movie_custom_values.user_id and not m.deleted));
revoke all on public.movie_custom_values from public,anon;
grant select,insert,update,delete on public.movie_custom_values to authenticated;
-- Preserve any values saved between the two migrations before removing the extension column.
insert into public.movie_custom_values(movie_id,user_id,custom_values)
select id,user_id,custom_values from public.movies where custom_values<>'{}';
drop trigger movies_validate_custom_values on public.movies;
drop policy movie_records_owner on public.movies;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='movies') then
  alter table public.movies disable row level security;
 end if;
end; $$;
alter table public.movies drop column custom_values;
create trigger movie_custom_values_validate before insert or update on public.movie_custom_values
for each row execute function public.validate_movie_custom_values();
create or replace function public.validate_movie_custom_values() returns trigger language plpgsql set search_path='' as $$
declare pair record; field public.movie_custom_fields; text_value text;
begin
  if current_user in ('authenticated','anon') and not exists(select 1 from public.movies where id=new.movie_id and user_id=new.user_id and not deleted) then raise exception 'Movie is unavailable'; end if;
  if current_user in ('authenticated','anon') and (tg_op='INSERT' or new.custom_values is distinct from old.custom_values)
     and not exists(select 1 from public.users where id=new.user_id and clerk_user_id=auth.uid()::text) then
    raise exception 'Movie custom values are unavailable for this account';
  end if;
  if jsonb_typeof(new.custom_values) <> 'object' then raise exception 'Custom values must be an object'; end if;
  new.custom_values := jsonb_strip_nulls(new.custom_values);
  for pair in select * from jsonb_each(new.custom_values) loop
    select * into field from public.movie_custom_fields where id=pair.key and user_id=new.user_id for share;
    if not found then raise exception 'Custom field is unavailable'; end if;
    text_value := pair.value #>> '{}';
    if field.field_type='checkbox' then
      if jsonb_typeof(pair.value)<>'boolean' then raise exception '% must be Yes or No',field.name; end if;
    elsif field.field_type='number' then
      if jsonb_typeof(pair.value)<>'number' then raise exception '% must be a number',field.name; end if;
    else
      if jsonb_typeof(pair.value)<>'string' then raise exception '% must be text',field.name; end if;
      if length(text_value)>(case when field.field_type='long_text' then 20000 else 500 end) then raise exception '% is too long',field.name; end if;
      if field.field_type='date' then
        if text_value !~ '^\d{4}-\d{2}-\d{2}$' or to_char(text_value::date,'YYYY-MM-DD')<>text_value then raise exception '% must be a valid date',field.name; end if;
      elsif field.field_type='dropdown' and not (text_value=any(field.options)) then raise exception 'Choose an available option for %',field.name; end if;
    end if;
  end loop;
  return new;
end; $$;
create or replace function public.validate_movie_custom_field() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.field_type<>old.field_type) then
    raise exception 'Field type and ownership cannot be changed. Create a new field instead.';
  end if;
  new.name:=btrim(new.name);
  if new.field_type='dropdown' then
    if cardinality(new.options) not between 1 and 100 or exists(select 1 from unnest(new.options) o where o is null or btrim(o)='' or length(o)>500)
       or (select count(distinct o) from unnest(new.options) o)<>cardinality(new.options) then raise exception 'Provide 1–100 unique dropdown choices'; end if;
    if exists(select 1 from public.movie_custom_values m where m.user_id=new.user_id and m.custom_values ? new.id and not ((m.custom_values->>new.id)=any(new.options))) then
      raise exception 'A removed choice is still used by movies. Change their values first.';
    end if;
  else new.options:='{}'; end if;
  return new;
end; $$;
create or replace function public.remove_movie_custom_field_values() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.movie_custom_values set custom_values=custom_values-old.id where user_id=old.user_id and custom_values ? old.id and exists(select 1 from public.movies where id=movie_custom_values.movie_id);
  return old;
end; $$;
create or replace function public.manage_movie_custom_field(p_action text,p_field jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor integer; result public.movie_custom_fields; ids text[];
begin
  select id into actor from public.users where clerk_user_id=auth.uid()::text;
  if actor is null then raise exception 'Authentication required'; end if;
  -- Serialize definition changes for an account, including import and reordering.
  perform pg_advisory_xact_lock(71020,actor);
  if p_action='create' then
    insert into public.movie_custom_fields(user_id,name,field_type,options,visible,sort_order)
    values(actor,p_field->>'name',p_field->>'field_type',array(select jsonb_array_elements_text(coalesce(p_field->'options','[]'))),
      coalesce((p_field->>'visible')::boolean,true),coalesce((select max(sort_order)+1 from public.movie_custom_fields where user_id=actor),0)) returning * into result;
    if coalesce((p_field->>'copy_downloaded')::boolean,false) then
      if result.field_type<>'checkbox' then raise exception 'Downloaded values require a checkbox field'; end if;
      insert into public.movie_custom_values(movie_id,user_id,custom_values)
      select id,user_id,jsonb_build_object(result.id,downloaded) from public.movies where user_id=actor and not deleted
      on conflict(movie_id) do update set custom_values=movie_custom_values.custom_values||excluded.custom_values;
    end if;
  elsif p_action='update' then
    update public.movie_custom_fields set name=p_field->>'name',visible=(p_field->>'visible')::boolean,
      options=array(select jsonb_array_elements_text(coalesce(p_field->'options','[]')))
    where id=p_field->>'id' and user_id=actor returning * into result;
    if not found then raise exception 'Field is unavailable'; end if;
  elsif p_action='delete' then
    delete from public.movie_custom_fields where id=p_field->>'id' and user_id=actor returning * into result;
    if not found then raise exception 'Field is unavailable'; end if;
  elsif p_action='reorder' then
    ids:=array(select jsonb_array_elements_text(p_field->'ids'));
    if cardinality(ids)<>(select count(*) from public.movie_custom_fields where user_id=actor)
      or cardinality(ids)<>(select count(distinct id) from public.movie_custom_fields where user_id=actor and id=any(ids)) then raise exception 'Field list changed. Reopen Manage Fields and try again.'; end if;
    update public.movie_custom_fields f set sort_order=x.position from unnest(ids) with ordinality x(id,position) where f.id=x.id and f.user_id=actor;
    return '{}';
  else raise exception 'Invalid field action'; end if;
  return to_jsonb(result);
end; $$;

-- Read-only projection keeps filtering/sorting on the server without changing movies.
create view public.movie_custom_records with (security_invoker=true) as
select m.*, coalesce(v.custom_values,'{}'::jsonb) as custom_values
from public.movies m left join public.movie_custom_values v on v.movie_id=m.id and v.user_id=m.user_id
where m.user_id in (select id from public.users where clerk_user_id=auth.uid()::text);
revoke all on public.movie_custom_records from public,anon;
grant select on public.movie_custom_records to authenticated;

-- Ordinary Edit/Import writes and extension values commit together. No schema or access
-- rules are added to movies; ownership is checked explicitly for this new entry point.
create function public.save_movie_custom_records(p_records jsonb,p_insert boolean default false)
returns setof public.movie_custom_records language plpgsql security invoker set search_path='' as $$
declare actor integer; item jsonb; record public.movies; saved_id integer; ids integer[]:='{}';
begin
 select id into actor from public.users where clerk_user_id=auth.uid()::text;
 if actor is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(p_records)<>'array' then raise exception 'Movies must be an array'; end if;
 for item in select * from jsonb_array_elements(p_records) loop
  if p_insert then
   record:=jsonb_populate_record(null::public.movies,item-'id'-'user_id'-'custom_values');
   insert into public.movies(user_id,title,year_released,franchise_id,collection_ids,downloaded,rated,director,date_released,runtime,genre,writers,actors,plot,poster_url)
   values(actor,record.title,record.year_released,record.franchise_id,coalesce(record.collection_ids,'{}'),coalesce(record.downloaded,false),record.rated,record.director,record.date_released,record.runtime,record.genre,record.writers,record.actors,record.plot,record.poster_url)
   returning id into saved_id;
  else
   select * into record from public.movies where id=(item->>'id')::integer and user_id=actor and not deleted for update;
   if not found then raise exception 'Movie is unavailable'; end if;
   saved_id:=record.id;
   record:=jsonb_populate_record(record,item-'id'-'user_id'-'downloaded'-'custom_values');
   update public.movies set title=record.title,year_released=record.year_released,franchise_id=record.franchise_id,collection_ids=record.collection_ids,
    rated=record.rated,director=record.director,date_released=record.date_released,runtime=record.runtime,genre=record.genre,writers=record.writers,actors=record.actors,plot=record.plot,poster_url=record.poster_url,updated_at=now()
   where id=saved_id and user_id=actor;
  end if;
  if item ? 'custom_values' then
   insert into public.movie_custom_values(movie_id,user_id,custom_values) values(saved_id,actor,item->'custom_values')
   on conflict(movie_id) do update set custom_values=excluded.custom_values;
  end if;
  ids:=array_append(ids,saved_id);
 end loop;
 return query select * from public.movie_custom_records where id=any(ids);
end; $$;
revoke all on function public.save_movie_custom_records(jsonb,boolean) from public,anon;
grant execute on function public.save_movie_custom_records(jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
