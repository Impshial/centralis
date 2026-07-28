begin;

create or replace function public.admin_user_table_latest(
  p_table_name text,
  p_user_id integer
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  table_ref regclass;
  timestamp_expr text := null;
  where_expr text := ' where user_id = $1';
  column_name text;
  latest_at timestamptz;
begin
  table_ref := to_regclass(format('public.%I', p_table_name));

  if table_ref is null then
    return null;
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = table_ref
      and attname = 'user_id'
      and not attisdropped
  ) then
    return null;
  end if;

  foreach column_name in array array['updated_at', 'created_at', 'deleted_at']
  loop
    if exists (
      select 1
      from pg_attribute
      where attrelid = table_ref
        and attname = column_name
        and not attisdropped
    ) then
      timestamp_expr := concat_ws(
        ', ',
        timestamp_expr,
        format('coalesce(%I, ''epoch''::timestamptz)', column_name)
      );
    end if;
  end loop;

  if timestamp_expr is null then
    return null;
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = table_ref
      and attname = 'deleted'
      and not attisdropped
  ) then
    where_expr := where_expr || ' and coalesce(deleted, false) = false';
  end if;

  execute format(
    'select nullif(max(greatest(%s)), ''epoch''::timestamptz) from %s%s',
    timestamp_expr,
    table_ref,
    where_expr
  )
  using p_user_id
  into latest_at;

  return latest_at;
end;
$$;

revoke all on function public.admin_user_table_latest(text, integer) from public;
revoke all on function public.admin_user_table_latest(text, integer) from anon;
revoke all on function public.admin_user_table_latest(text, integer) from authenticated;

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
      public.admin_user_table_latest('universes', user_counts.id) as universes_last,
      public.admin_user_table_latest('elements', user_counts.id) as elements_last,
      public.admin_user_table_latest('element_types', user_counts.id) as element_types_last,
      public.admin_user_table_latest('element_type_templates', user_counts.id) as templates_last,
      public.admin_user_table_latest('chronicle_modules', user_counts.id) as chronicle_last,
      public.admin_user_table_latest('chat_logs', user_counts.id) as chat_repositories_last,
      greatest(
        coalesce(public.admin_user_table_latest('calendars', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('categories', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('events', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('event_exceptions', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('calendar_permissions', user_counts.id), 'epoch'::timestamptz)
      ) as calendars_last,
      public.admin_user_table_latest('todo_tasks', user_counts.id) as todo_last,
      public.admin_user_table_latest('universe_source_documents', user_counts.id) as source_documents_last,
      greatest(
        coalesce(public.admin_user_table_latest('image_generation_sessions', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('image_generation_messages', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('image_generation_assets', user_counts.id), 'epoch'::timestamptz)
      ) as image_generation_last,
      greatest(
        coalesce(public.admin_user_table_latest('movies', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('franchise', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('collections', user_counts.id), 'epoch'::timestamptz)
      ) as movies_last,
      public.admin_user_table_latest('recent_shows', user_counts.id) as episode_roulette_last,
      greatest(
        coalesce(public.admin_user_table_latest('stellar_systems', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_stars', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_planets', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_moons', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_lifeforms', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_colonies', user_counts.id), 'epoch'::timestamptz),
        coalesce(public.admin_user_table_latest('stellar_colonists', user_counts.id), 'epoch'::timestamptz)
      ) as stellar_last,
      coalesce((user_counts.object_counts->>'generation_jobs')::integer, 0) as generation_jobs_count,
      public.admin_user_table_latest('generation_jobs', user_counts.id) as generation_jobs_last
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
