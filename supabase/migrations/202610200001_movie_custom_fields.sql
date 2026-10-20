create table public.movie_custom_fields (
  id text primary key default ('f_' || replace(gen_random_uuid()::text, '-', '')) check (id ~ '^f_[a-f0-9]{32}$'),
  user_id integer not null references public.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  field_type text not null check (field_type in ('checkbox','text','long_text','number','date','dropdown')),
  options text[] not null default '{}',
  visible boolean not null default true,
  sort_order integer not null default 0
);
create unique index movie_custom_fields_name on public.movie_custom_fields(user_id,lower(btrim(name)));
alter table public.movie_custom_fields enable row level security;
create policy movie_custom_fields_owner on public.movie_custom_fields for all to authenticated
using (user_id in (select id from public.users where clerk_user_id=auth.uid()::text))
with check (user_id in (select id from public.users where clerk_user_id=auth.uid()::text));
revoke all on public.movie_custom_fields from anon;
grant select,insert,update,delete on public.movie_custom_fields to authenticated;
alter table public.movies add column custom_values jsonb not null default '{}';
-- Personal field values inherit movie access, so enforce ownership on the parent too.
alter table public.movies enable row level security;
create policy movie_records_owner on public.movies for all to authenticated
using (user_id in (select id from public.users where clerk_user_id=auth.uid()::text))
with check (user_id in (select id from public.users where clerk_user_id=auth.uid()::text));

create function public.validate_movie_custom_values() returns trigger language plpgsql set search_path='' as $$
declare pair record; field public.movie_custom_fields; text_value text;
begin
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
create trigger movies_validate_custom_values before insert or update of custom_values,user_id on public.movies
for each row execute function public.validate_movie_custom_values();

create function public.validate_movie_custom_field() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.field_type<>old.field_type) then
    raise exception 'Field type and ownership cannot be changed. Create a new field instead.';
  end if;
  new.name:=btrim(new.name);
  if new.field_type='dropdown' then
    if cardinality(new.options) not between 1 and 100 or exists(select 1 from unnest(new.options) o where o is null or btrim(o)='' or length(o)>500)
       or (select count(distinct o) from unnest(new.options) o)<>cardinality(new.options) then raise exception 'Provide 1–100 unique dropdown choices'; end if;
    if exists(select 1 from public.movies m where m.user_id=new.user_id and m.custom_values ? new.id and not ((m.custom_values->>new.id)=any(new.options))) then
      raise exception 'A removed choice is still used by movies. Change their values first.';
    end if;
  else new.options:='{}'; end if;
  return new;
end; $$;
create trigger movie_custom_fields_validate before insert or update on public.movie_custom_fields
for each row execute function public.validate_movie_custom_field();

create function public.remove_movie_custom_field_values() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.movies set custom_values=custom_values-old.id where user_id=old.user_id and custom_values ? old.id;
  return old;
end; $$;
create trigger movie_custom_fields_cleanup before delete on public.movie_custom_fields
for each row execute function public.remove_movie_custom_field_values();

create function public.manage_movie_custom_field(p_action text,p_field jsonb) returns jsonb
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
      update public.movies set custom_values=custom_values||jsonb_build_object(result.id,downloaded) where user_id=actor;
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
revoke all on function public.validate_movie_custom_values(),public.validate_movie_custom_field(),public.remove_movie_custom_field_values() from public,anon;
revoke all on function public.manage_movie_custom_field(text,jsonb) from public,anon;
grant execute on function public.manage_movie_custom_field(text,jsonb) to authenticated;
notify pgrst,'reload schema';
