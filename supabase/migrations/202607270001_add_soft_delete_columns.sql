do $$
declare
  table_name text;
  mutable_tables text[] := array[
    'users',
    'user_settings',
    'universes',
    'elements',
    'element_types',
    'element_type_templates',
    'element_template_sections',
    'element_type_template_fields',
    'element_template_field_values',
    'element_custom_fields',
    'universe_custom_fields',
    'element_links',
    'element_groups',
    'canvas_groups',
    'canvas_notes',
    'builder_images',
    'image_table',
    'universe_layers',
    'universe_layer_entries',
    'element_layer_assignments',
    'expanded_views',
    'expanded_view_nodes',
    'expanded_view_edges',
    'expanded_view_node_fields',
    'chronicle_modules',
    'chat_logs',
    'universe_ai_sources',
    'universe_ai_chats',
    'universe_ai_messages',
    'universe_ai_proposals',
    'universe_source_documents',
    'image_generation_sessions',
    'image_generation_messages',
    'image_generation_assets',
    'calendars',
    'categories',
    'events',
    'event_recurrence_rules',
    'event_exceptions',
    'reminders',
    'calendar_permissions',
    'todo_tasks',
    'todo_subtasks',
    'franchise',
    'collections',
    'movies',
    'recent_shows',
    'stellar_systems',
    'stellar_stars',
    'stellar_planets',
    'stellar_moons',
    'stellar_lifeforms',
    'stellar_colonies',
    'stellar_colonists',
    'generation_jobs',
    'themes',
    'user_theme_menu_items',
    'what_if_simulations',
    'what_if_iterations',
    'what_if_phases',
    'analytics_aggregates'
  ];
begin
  foreach table_name in array mutable_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I add column if not exists deleted boolean not null default false', table_name);
      execute format('alter table public.%I add column if not exists deleted_at timestamp with time zone', table_name);
      execute format('alter table public.%I add column if not exists deleted_by integer references public.users(id) on delete set null', table_name);
    end if;
  end loop;
end $$;

update public.chat_logs
set deleted = true
where deleted_at is not null;

do $$
begin
  if to_regclass('public.image_table') is not null then
    create index if not exists idx_image_table_active_object
      on public.image_table(object_id, sort_order, created_at)
      where deleted = false;
  end if;

  if to_regclass('public.image_generation_sessions') is not null then
    create index if not exists idx_image_generation_sessions_active_user
      on public.image_generation_sessions(user_id, updated_at desc)
      where deleted = false;
  end if;

  if to_regclass('public.image_generation_messages') is not null then
    create index if not exists idx_image_generation_messages_active_session
      on public.image_generation_messages(session_id, created_at)
      where deleted = false;
  end if;

  if to_regclass('public.image_generation_assets') is not null then
    create index if not exists idx_image_generation_assets_active_session
      on public.image_generation_assets(session_id, created_at, sort_order)
      where deleted = false;
  end if;

  if to_regclass('public.generation_jobs') is not null then
    create index if not exists idx_generation_jobs_active_user_type
      on public.generation_jobs(user_id, job_type, status, created_at desc)
      where deleted = false;
  end if;

  if to_regclass('public.chat_logs') is not null then
    create index if not exists idx_chat_logs_active_user
      on public.chat_logs(user_id, updated_at desc)
      where deleted = false;
  end if;

  if to_regclass('public.stellar_systems') is not null then
    create index if not exists idx_stellar_systems_active_user
      on public.stellar_systems(user_id, updated_at desc)
      where deleted = false;
  end if;

  if to_regclass('public.stellar_planets') is not null then
    create index if not exists idx_stellar_planets_active_system
      on public.stellar_planets(system_id, planet_number)
      where deleted = false;
  end if;

  if to_regclass('public.stellar_moons') is not null then
    create index if not exists idx_stellar_moons_active_planet
      on public.stellar_moons(planet_id, moon_number)
      where deleted = false;
  end if;

  if to_regclass('public.stellar_lifeforms') is not null then
    create index if not exists idx_stellar_lifeforms_active_body
      on public.stellar_lifeforms(user_id, planet_id, moon_id)
      where deleted = false;
  end if;

  if to_regclass('public.stellar_colonies') is not null then
    create index if not exists idx_stellar_colonies_active_body
      on public.stellar_colonies(user_id, planet_id, moon_id)
      where deleted = false;
  end if;

  if to_regclass('public.stellar_colonists') is not null then
    create index if not exists idx_stellar_colonists_active_colony
      on public.stellar_colonists(colony_id, created_at)
      where deleted = false;
  end if;
end $$;
