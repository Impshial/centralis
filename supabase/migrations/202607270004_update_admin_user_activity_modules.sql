begin;

create or replace function public.list_admin_user_activity()
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
    where clerk_user_id = auth.uid()::text
      and coalesce(deleted, false) = false;

  if actor_user.id is null or coalesce(actor_user.admin, false) is not true then
    raise exception 'Only admins can view user activity.';
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
    where coalesce(u.deleted, false) = false
  ),
  activity as (
    select
      user_counts.*,
      user_counts.created_at as user_account_last,
      (select max(updated_at) from public.universes where user_id = user_counts.id and coalesce(deleted, false) = false) as universes_last,
      (select max(updated_at) from public.elements where user_id = user_counts.id and coalesce(deleted, false) = false) as elements_last,
      (select max(updated_at) from public.element_types where user_id = user_counts.id and coalesce(deleted, false) = false) as element_types_last,
      (
        select max(ett.updated_at)
        from public.element_type_templates ett
        join public.element_types et on et.id = ett.element_type_id
        where et.user_id = user_counts.id
          and coalesce(et.deleted, false) = false
          and coalesce(ett.deleted, false) = false
          and coalesce(ett.is_default, false) = false
      ) as templates_last,
      (select max(updated_at) from public.chronicle_modules where user_id = user_counts.id and coalesce(deleted, false) = false) as chronicle_last,
      (select max(updated_at) from public.chat_logs where user_id = user_counts.id and coalesce(deleted, false) = false) as chat_repositories_last,
      (
        select max(last_seen)
        from (
          select max(updated_at) as last_seen from public.calendars where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(updated_at) from public.categories where user_id = user_counts.id and coalesce(deleted, false) = false
          union all
            select max(e.updated_at)
            from public.events e
            left join public.calendars c on c.id = e.calendar_id
            left join public.categories cat on cat.id = e.category_id
            where coalesce(e.deleted, false) = false
              and ((c.user_id = user_counts.id and coalesce(c.deleted, false) = false) or (cat.user_id = user_counts.id and coalesce(cat.deleted, false) = false))
          union all
            select max(err.created_at)
            from public.event_recurrence_rules err
            join public.events e on e.id = err.event_id
            left join public.calendars c on c.id = e.calendar_id
            left join public.categories cat on cat.id = e.category_id
            where coalesce(err.deleted, false) = false
              and coalesce(e.deleted, false) = false
              and ((c.user_id = user_counts.id and coalesce(c.deleted, false) = false) or (cat.user_id = user_counts.id and coalesce(cat.deleted, false) = false))
          union all
            select max(ex.updated_at)
            from public.event_exceptions ex
            join public.events e on e.id = ex.parent_event_id
            left join public.calendars c on c.id = e.calendar_id
            left join public.categories cat on cat.id = e.category_id
            where coalesce(ex.deleted, false) = false
              and coalesce(e.deleted, false) = false
              and ((c.user_id = user_counts.id and coalesce(c.deleted, false) = false) or (cat.user_id = user_counts.id and coalesce(cat.deleted, false) = false))
          union all
            select max(r.created_at)
            from public.reminders r
            join public.events e on e.id = r.event_id
            left join public.calendars c on c.id = e.calendar_id
            left join public.categories cat on cat.id = e.category_id
            where coalesce(r.deleted, false) = false
              and coalesce(e.deleted, false) = false
              and ((c.user_id = user_counts.id and coalesce(c.deleted, false) = false) or (cat.user_id = user_counts.id and coalesce(cat.deleted, false) = false))
          union all
            select max(cp.updated_at)
            from public.calendar_permissions cp
            left join public.calendars c on c.id = cp.calendar_id
            where coalesce(cp.deleted, false) = false
              and (cp.user_id = user_counts.id or (c.user_id = user_counts.id and coalesce(c.deleted, false) = false))
        ) calendar_activity
      ) as calendars_last,
      (
        select max(last_seen)
        from (
          select max(updated_at) as last_seen from public.todo_tasks where user_id = user_counts.id and coalesce(deleted, false) = false
          union all
            select max(ts.created_at)
            from public.todo_subtasks ts
            join public.todo_tasks tt on tt.id = ts.task_id
            where tt.user_id = user_counts.id
              and coalesce(tt.deleted, false) = false
              and coalesce(ts.deleted, false) = false
        ) todo_activity
      ) as todo_last,
      (select max(updated_at) from public.universe_source_documents where user_id = user_counts.id and coalesce(deleted, false) = false) as source_documents_last,
      (
        select max(last_seen)
        from (
          select max(updated_at) as last_seen from public.image_generation_sessions where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(created_at) from public.image_generation_messages where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(created_at) from public.image_generation_assets where user_id = user_counts.id and coalesce(deleted, false) = false
        ) image_activity
      ) as image_generation_last,
      (
        select max(last_seen)
        from (
          select max(updated_at) as last_seen from public.movies where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(updated_at) from public.franchise where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(updated_at) from public.collections where user_id = user_counts.id and coalesce(deleted, false) = false
        ) movie_activity
      ) as movies_last,
      (select max(updated_at) from public.recent_shows where user_id = user_counts.id and coalesce(deleted, false) = false) as episode_roulette_last,
      (
        select max(last_seen)
        from (
          select max(updated_at) as last_seen from public.stellar_systems where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(updated_at) from public.stellar_stars where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(updated_at) from public.stellar_planets where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(updated_at) from public.stellar_moons where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(updated_at) from public.stellar_lifeforms where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(updated_at) from public.stellar_colonies where user_id = user_counts.id and coalesce(deleted, false) = false
          union all select max(updated_at) from public.stellar_colonists where user_id = user_counts.id and coalesce(deleted, false) = false
        ) stellar_activity
      ) as stellar_last,
      (select count(*) from public.generation_jobs where user_id = user_counts.id and coalesce(deleted, false) = false) as generation_jobs_count,
      (select max(updated_at) from public.generation_jobs where user_id = user_counts.id and coalesce(deleted, false) = false) as generation_jobs_last
    from user_counts
  ),
  assembled as (
    select
      activity.*,
      (select coalesce(sum(value::integer), 0) from jsonb_each_text(activity.object_counts)) + coalesce(generation_jobs_count, 0) as object_total,
      nullif(greatest(
        coalesce(user_account_last, 'epoch'::timestamptz),
        coalesce(universes_last, 'epoch'::timestamptz),
        coalesce(elements_last, 'epoch'::timestamptz),
        coalesce(element_types_last, 'epoch'::timestamptz),
        coalesce(templates_last, 'epoch'::timestamptz),
        coalesce(chronicle_last, 'epoch'::timestamptz),
        coalesce(chat_repositories_last, 'epoch'::timestamptz),
        coalesce(calendars_last, 'epoch'::timestamptz),
        coalesce(todo_last, 'epoch'::timestamptz),
        coalesce(source_documents_last, 'epoch'::timestamptz),
        coalesce(image_generation_last, 'epoch'::timestamptz),
        coalesce(movies_last, 'epoch'::timestamptz),
        coalesce(episode_roulette_last, 'epoch'::timestamptz),
        coalesce(stellar_last, 'epoch'::timestamptz),
        coalesce(generation_jobs_last, 'epoch'::timestamptz)
      ), 'epoch'::timestamptz) as last_activity_at
    from activity
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'email', email,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'admin', admin,
      'created_at', created_at,
      'is_current_user', id = actor_user.id,
      'object_counts', object_counts,
      'object_total', object_total,
      'last_activity_at', last_activity_at,
      'modules', jsonb_build_array(
        jsonb_build_object('id', 'user_account', 'label', 'User Account', 'count', coalesce((object_counts->>'user_account')::integer, 0), 'latest_activity_at', user_account_last),
        jsonb_build_object('id', 'universes', 'label', 'Universes', 'count', coalesce((object_counts->>'universes')::integer, 0), 'latest_activity_at', universes_last),
        jsonb_build_object('id', 'elements', 'label', 'Elements', 'count', coalesce((object_counts->>'elements')::integer, 0), 'latest_activity_at', elements_last),
        jsonb_build_object('id', 'element_types', 'label', 'Custom Element Types', 'count', coalesce((object_counts->>'element_types')::integer, 0), 'latest_activity_at', element_types_last),
        jsonb_build_object('id', 'templates', 'label', 'Custom Templates', 'count', coalesce((object_counts->>'templates')::integer, 0), 'latest_activity_at', templates_last),
        jsonb_build_object('id', 'chronicle', 'label', 'Chronicle', 'count', coalesce((object_counts->>'chronicle')::integer, 0), 'latest_activity_at', chronicle_last),
        jsonb_build_object('id', 'chat_repositories', 'label', 'Chat Repositories', 'count', coalesce((object_counts->>'chat_repositories')::integer, 0), 'latest_activity_at', chat_repositories_last),
        jsonb_build_object('id', 'calendars', 'label', 'Calendars', 'count', coalesce((object_counts->>'calendars')::integer, 0), 'latest_activity_at', calendars_last),
        jsonb_build_object('id', 'todo', 'label', 'ToDo', 'count', coalesce((object_counts->>'todo')::integer, 0), 'latest_activity_at', todo_last),
        jsonb_build_object('id', 'source_documents', 'label', 'Source Material', 'count', coalesce((object_counts->>'source_documents')::integer, 0), 'latest_activity_at', source_documents_last),
        jsonb_build_object('id', 'image_generation', 'label', 'Image Generation', 'count', coalesce((object_counts->>'image_generation')::integer, 0), 'latest_activity_at', image_generation_last),
        jsonb_build_object('id', 'movies', 'label', 'Movies', 'count', coalesce((object_counts->>'movies')::integer, 0), 'latest_activity_at', movies_last),
        jsonb_build_object('id', 'episode_roulette', 'label', 'Episode Roulette', 'count', coalesce((object_counts->>'episode_roulette')::integer, 0), 'latest_activity_at', episode_roulette_last),
        jsonb_build_object('id', 'stellar', 'label', 'Stellar Architect', 'count', coalesce((object_counts->>'stellar')::integer, 0), 'latest_activity_at', stellar_last),
        jsonb_build_object('id', 'generation_jobs', 'label', 'Generation Jobs', 'count', coalesce(generation_jobs_count, 0), 'latest_activity_at', generation_jobs_last)
      )
    ) order by last_activity_at desc nulls last, lower(coalesce(email, ''))), '[]'::jsonb)
    into users_payload
    from assembled;

  return jsonb_build_object(
    'generatedAt', now(),
    'actingUserId', actor_user.id,
    'users', users_payload
  );
end;
$$;

revoke all on function public.list_admin_user_activity() from public;
revoke all on function public.list_admin_user_activity() from anon;
grant execute on function public.list_admin_user_activity() to authenticated;

commit;
