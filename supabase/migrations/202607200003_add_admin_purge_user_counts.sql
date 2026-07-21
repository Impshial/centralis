create or replace function public.get_admin_purge_user_object_counts(p_user_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  counts jsonb;
begin
  select jsonb_build_object(
    'user_account', 1,
    'universes',
      (select count(*) from public.universes where user_id = p_user_id),
    'elements',
      (select count(*) from public.elements where user_id = p_user_id),
    'element_types',
      (select count(*) from public.element_types where user_id = p_user_id),
    'templates',
      (select count(*)
        from public.element_type_templates ett
        join public.element_types et on et.id = ett.element_type_id
        where et.user_id = p_user_id
          and coalesce(ett.is_default, false) = false),
    'chronicle',
      (
        (select count(*) from public.chronicle_modules where user_id = p_user_id)
        +
        (select count(*)
          from public.element_custom_fields ecf
          join public.elements e on e.id = ecf.element_id
          where e.user_id = p_user_id)
        +
        (select count(*)
          from public.element_template_field_values etfv
          join public.elements e on e.id = etfv.element_id
          where e.user_id = p_user_id)
      ),
    'chat_repositories',
      (select count(*) from public.chat_logs where user_id = p_user_id),
    'calendars',
      (
        (select count(*) from public.calendars where user_id = p_user_id)
        +
        (select count(*) from public.categories where user_id = p_user_id)
        +
        (select count(*)
          from public.events e
          left join public.calendars c on c.id = e.calendar_id
          left join public.categories cat on cat.id = e.category_id
          where c.user_id = p_user_id or cat.user_id = p_user_id)
        +
        (select count(*)
          from public.event_recurrence_rules err
          join public.events e on e.id = err.event_id
          left join public.calendars c on c.id = e.calendar_id
          left join public.categories cat on cat.id = e.category_id
          where c.user_id = p_user_id or cat.user_id = p_user_id)
        +
        (select count(*)
          from public.event_exceptions ex
          join public.events e on e.id = ex.parent_event_id
          left join public.calendars c on c.id = e.calendar_id
          left join public.categories cat on cat.id = e.category_id
          where c.user_id = p_user_id or cat.user_id = p_user_id)
        +
        (select count(*)
          from public.reminders r
          join public.events e on e.id = r.event_id
          left join public.calendars c on c.id = e.calendar_id
          left join public.categories cat on cat.id = e.category_id
          where c.user_id = p_user_id or cat.user_id = p_user_id)
        +
        (select count(*)
          from public.calendar_permissions cp
          left join public.calendars c on c.id = cp.calendar_id
          where cp.user_id = p_user_id or c.user_id = p_user_id)
      ),
    'todo',
      (
        (select count(*) from public.todo_tasks where user_id = p_user_id)
        +
        (select count(*)
          from public.todo_subtasks ts
          join public.todo_tasks tt on tt.id = ts.task_id
          where tt.user_id = p_user_id)
      ),
    'source_documents',
      (select count(*) from public.universe_source_documents where user_id = p_user_id),
    'image_generation',
      (
        (select count(*) from public.image_generation_sessions where user_id = p_user_id)
        +
        (select count(*) from public.image_generation_messages where user_id = p_user_id)
        +
        (select count(*) from public.image_generation_assets where user_id = p_user_id)
      ),
    'movies',
      (
        (select count(*) from public.movies where user_id = p_user_id)
        +
        (select count(*) from public.franchise where user_id = p_user_id)
        +
        (select count(*) from public.collections where user_id = p_user_id)
      ),
    'episode_roulette',
      (select count(*) from public.recent_shows where user_id = p_user_id),
    'stellar',
      (
        (select count(*) from public.stellar_systems where user_id = p_user_id)
        +
        (select count(*) from public.stellar_stars where user_id = p_user_id)
        +
        (select count(*) from public.stellar_planets where user_id = p_user_id)
        +
        (select count(*) from public.stellar_moons where user_id = p_user_id)
        +
        (select count(*) from public.stellar_lifeforms where user_id = p_user_id)
        +
        (select count(*) from public.stellar_colonies where user_id = p_user_id)
        +
        (select count(*) from public.stellar_colonists where user_id = p_user_id)
      )
  )
    into counts;

  return counts;
end;
$$;

create or replace function public.list_admin_purge_users()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.users%rowtype;
  users_payload jsonb;
begin
  select *
    into actor_user
    from public.users
    where clerk_user_id = auth.uid()::text;

  if actor_user.id is null or coalesce(actor_user.admin, false) is not true then
    raise exception 'Only admins can view purge users.';
  end if;

  with user_counts as (
    select
      u.id,
      u.email,
      u.display_name,
      u.avatar_url,
      u.admin,
      u.created_at,
      public.get_admin_purge_user_object_counts(u.id) as object_counts
    from public.users u
    where u.id <> actor_user.id
  ),
  user_totals as (
    select
      user_counts.*,
      (
        select coalesce(sum(value::integer), 0)
        from jsonb_each_text(user_counts.object_counts)
      ) as object_total
    from user_counts
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'email', email,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'admin', admin,
      'created_at', created_at,
      'is_current_user', false,
      'object_counts', object_counts,
      'object_total', object_total
    )
    order by email
  ), '[]'::jsonb)
    into users_payload
    from user_totals;

  return jsonb_build_object(
    'actingUserId', actor_user.id,
    'users', users_payload
  );
end;
$$;

create or replace function public.admin_purge_data_for_current_user(
  p_user_ids integer[] default '{}'::integer[],
  p_all_users boolean default false,
  p_datasets text[] default '{}'::text[],
  p_confirmation text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.users%rowtype;
  resolved_user_ids integer[];
begin
  if coalesce(p_confirmation, '') <> 'PURGE' then
    raise exception 'Type PURGE to confirm this destructive action.';
  end if;

  select *
    into actor_user
    from public.users
    where clerk_user_id = auth.uid()::text;

  if actor_user.id is null or coalesce(actor_user.admin, false) is not true then
    raise exception 'Only admins can purge data.';
  end if;

  if coalesce(p_all_users, false) then
    select coalesce(array_agg(id order by email), '{}'::integer[])
      into resolved_user_ids
      from public.users
      where id <> actor_user.id;
  else
    select coalesce(array_agg(distinct id), '{}'::integer[])
      into resolved_user_ids
      from public.users
      where id = any(coalesce(p_user_ids, '{}'::integer[]))
        and id <> actor_user.id;
  end if;

  return public.admin_purge_data(
    auth.uid()::text,
    resolved_user_ids,
    false,
    coalesce(p_datasets, '{}'::text[])
  );
end;
$$;

revoke all on function public.get_admin_purge_user_object_counts(integer) from public;
revoke all on function public.get_admin_purge_user_object_counts(integer) from anon;
revoke all on function public.get_admin_purge_user_object_counts(integer) from authenticated;

revoke all on function public.list_admin_purge_users() from public;
revoke all on function public.list_admin_purge_users() from anon;
grant execute on function public.list_admin_purge_users() to authenticated;

revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from public;
revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from anon;
grant execute on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) to authenticated;
