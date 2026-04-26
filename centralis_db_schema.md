-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.analytics_aggregates (
  id integer NOT NULL DEFAULT nextval('analytics_aggregates_id_seq'::regclass),
  user_id integer NOT NULL,
  aggregate_date date NOT NULL,
  dimension text NOT NULL,
  dimension_value text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  total_duration_minutes numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT analytics_aggregates_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_aggregates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.builder_images (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  object_id character varying NOT NULL,
  image_url text NOT NULL,
  storage_key character varying,
  prompt text,
  provider character varying,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT builder_images_pkey PRIMARY KEY (id)
);
CREATE TABLE public.calendar_permissions (
  id integer NOT NULL DEFAULT nextval('calendar_permissions_id_seq'::regclass),
  calendar_id integer NOT NULL,
  user_id integer NOT NULL,
  role text NOT NULL DEFAULT 'viewer'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT calendar_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT calendar_permissions_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.calendars(id),
  CONSTRAINT calendar_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.calendars (
  id integer NOT NULL DEFAULT nextval('calendars_id_seq'::regclass),
  user_id integer NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1'::text,
  description text,
  is_visible boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  timezone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT calendars_pkey PRIMARY KEY (id),
  CONSTRAINT calendars_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.canvas_groups (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  universe_id character varying NOT NULL,
  name character varying NOT NULL DEFAULT 'Group'::character varying,
  position_x real NOT NULL DEFAULT 0,
  position_y real NOT NULL DEFAULT 0,
  width real NOT NULL DEFAULT 300,
  height real NOT NULL DEFAULT 200,
  is_collapsed boolean NOT NULL DEFAULT false,
  bg_color character varying,
  bg_opacity real,
  border_color character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT canvas_groups_pkey PRIMARY KEY (id),
  CONSTRAINT canvas_groups_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES public.universes(id)
);
CREATE TABLE public.canvas_notes (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  universe_id character varying NOT NULL,
  title character varying NOT NULL DEFAULT 'Note'::character varying,
  content text,
  position_x real NOT NULL DEFAULT 0,
  position_y real NOT NULL DEFAULT 0,
  width real,
  height real,
  is_collapsed boolean NOT NULL DEFAULT false,
  bg_color character varying,
  bg_opacity real,
  border_color character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT canvas_notes_pkey PRIMARY KEY (id),
  CONSTRAINT canvas_notes_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES public.universes(id)
);
CREATE TABLE public.categories (
  id integer NOT NULL DEFAULT nextval('categories_id_seq'::regclass),
  user_id integer NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.default_element_types (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  name character varying NOT NULL,
  description text,
  icon character varying,
  color character varying NOT NULL DEFAULT '#6366f1'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT default_element_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.element_custom_fields (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  element_id character varying NOT NULL,
  name character varying NOT NULL,
  value text,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT element_custom_fields_pkey PRIMARY KEY (id),
  CONSTRAINT element_custom_fields_element_id_fkey FOREIGN KEY (element_id) REFERENCES public.elements(id)
);
CREATE TABLE public.element_links (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  universe_id character varying NOT NULL,
  source_element_id character varying NOT NULL,
  target_element_id character varying NOT NULL,
  label character varying,
  stroke_color character varying,
  stroke_width integer,
  stroke_style character varying,
  path_type character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT element_links_pkey PRIMARY KEY (id),
  CONSTRAINT element_links_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES public.universes(id)
);
CREATE TABLE public.element_type_template_fields (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  template_id character varying NOT NULL,
  name character varying NOT NULL,
  hint_text text,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT element_type_template_fields_pkey PRIMARY KEY (id),
  CONSTRAINT element_type_template_fields_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.element_type_templates(id)
);
CREATE TABLE public.element_type_templates (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  element_type_id character varying NOT NULL,
  name character varying NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT element_type_templates_pkey PRIMARY KEY (id),
  CONSTRAINT element_type_templates_element_type_id_fkey FOREIGN KEY (element_type_id) REFERENCES public.element_types(id)
);
CREATE TABLE public.element_types (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  universe_id character varying NOT NULL,
  name character varying NOT NULL,
  description text,
  icon character varying,
  color character varying NOT NULL DEFAULT '#6366f1'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT element_types_pkey PRIMARY KEY (id),
  CONSTRAINT element_types_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES public.universes(id)
);
CREATE TABLE public.elements (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  universe_id character varying NOT NULL,
  element_type_id character varying,
  group_id character varying,
  name character varying NOT NULL,
  description text,
  body text,
  position_x real NOT NULL DEFAULT 0,
  position_y real NOT NULL DEFAULT 0,
  is_collapsed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT elements_pkey PRIMARY KEY (id),
  CONSTRAINT elements_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES public.universes(id),
  CONSTRAINT elements_element_type_id_fkey FOREIGN KEY (element_type_id) REFERENCES public.element_types(id),
  CONSTRAINT elements_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.canvas_groups(id)
);
CREATE TABLE public.event_exceptions (
  id integer NOT NULL DEFAULT nextval('event_exceptions_id_seq'::regclass),
  parent_event_id integer NOT NULL,
  original_start timestamp with time zone NOT NULL,
  new_title text,
  new_start_time timestamp with time zone,
  new_end_time timestamp with time zone,
  new_description text,
  new_location text,
  is_cancelled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_exceptions_pkey PRIMARY KEY (id),
  CONSTRAINT event_exceptions_parent_event_id_fkey FOREIGN KEY (parent_event_id) REFERENCES public.events(id)
);
CREATE TABLE public.event_recurrence_rules (
  id integer NOT NULL DEFAULT nextval('event_recurrence_rules_id_seq'::regclass),
  event_id integer NOT NULL,
  frequency text NOT NULL,
  interval integer NOT NULL DEFAULT 1,
  by_day text,
  by_month_day text,
  by_month text,
  count integer,
  until timestamp with time zone,
  raw_rrule text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_recurrence_rules_pkey PRIMARY KEY (id),
  CONSTRAINT event_recurrence_rules_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id)
);
CREATE TABLE public.events (
  id integer NOT NULL DEFAULT nextval('events_id_seq'::regclass),
  calendar_id integer NOT NULL,
  category_id integer,
  title text NOT NULL,
  description text,
  location text,
  notes text,
  color text,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  is_all_day boolean NOT NULL DEFAULT false,
  timezone text,
  status text NOT NULL DEFAULT 'confirmed'::text,
  busy_status text NOT NULL DEFAULT 'busy'::text,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  recurrence_end timestamp with time zone,
  parent_event_id integer,
  custom_fields jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.calendars(id),
  CONSTRAINT events_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.expanded_view_edges (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  expanded_view_id character varying NOT NULL,
  source_node_id character varying NOT NULL,
  target_node_id character varying NOT NULL,
  type USER-DEFINED NOT NULL DEFAULT 'custom'::expanded_view_edge_type,
  label character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT expanded_view_edges_pkey PRIMARY KEY (id),
  CONSTRAINT expanded_view_edges_expanded_view_id_fkey FOREIGN KEY (expanded_view_id) REFERENCES public.expanded_views(id),
  CONSTRAINT expanded_view_edges_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES public.expanded_view_nodes(id),
  CONSTRAINT expanded_view_edges_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES public.expanded_view_nodes(id)
);
CREATE TABLE public.expanded_view_node_fields (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  node_id character varying NOT NULL,
  key character varying NOT NULL,
  value text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT expanded_view_node_fields_pkey PRIMARY KEY (id),
  CONSTRAINT expanded_view_node_fields_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.expanded_view_nodes(id)
);
CREATE TABLE public.expanded_view_nodes (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  expanded_view_id character varying NOT NULL,
  name character varying NOT NULL,
  description text,
  position_x real NOT NULL DEFAULT 0,
  position_y real NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT expanded_view_nodes_pkey PRIMARY KEY (id),
  CONSTRAINT expanded_view_nodes_expanded_view_id_fkey FOREIGN KEY (expanded_view_id) REFERENCES public.expanded_views(id)
);
CREATE TABLE public.expanded_views (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  element_id character varying NOT NULL,
  universe_id character varying NOT NULL,
  type USER-DEFINED NOT NULL,
  name character varying NOT NULL DEFAULT 'Untitled View'::character varying,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT expanded_views_pkey PRIMARY KEY (id),
  CONSTRAINT expanded_views_element_id_fkey FOREIGN KEY (element_id) REFERENCES public.elements(id),
  CONSTRAINT expanded_views_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES public.universes(id)
);
CREATE TABLE public.reminders (
  id integer NOT NULL DEFAULT nextval('reminders_id_seq'::regclass),
  event_id integer NOT NULL,
  minutes_before integer NOT NULL DEFAULT 30,
  method text NOT NULL DEFAULT 'popup'::text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reminders_pkey PRIMARY KEY (id),
  CONSTRAINT reminders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id)
);
CREATE TABLE public.todo_tasks (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  todo_id character varying NOT NULL,
  name character varying NOT NULL,
  description text,
  due_date timestamp with time zone,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT todo_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT todo_tasks_todo_id_fkey FOREIGN KEY (todo_id) REFERENCES public.todos(id)
);
CREATE TABLE public.todos (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  user_id integer NOT NULL,
  name character varying NOT NULL,
  description text,
  due_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT todos_pkey PRIMARY KEY (id),
  CONSTRAINT todos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.universe_custom_fields (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  universe_id character varying NOT NULL,
  name character varying NOT NULL,
  value text,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT universe_custom_fields_pkey PRIMARY KEY (id),
  CONSTRAINT universe_custom_fields_universe_id_fkey FOREIGN KEY (universe_id) REFERENCES public.universes(id)
);
CREATE TABLE public.universes (
  id character varying NOT NULL DEFAULT (gen_random_uuid())::character varying,
  user_id integer NOT NULL,
  name character varying NOT NULL,
  description text,
  canvas_position_x real NOT NULL DEFAULT 0,
  canvas_position_y real NOT NULL DEFAULT 0,
  fmt_stroke_color character varying,
  fmt_stroke_width integer,
  fmt_stroke_style character varying,
  fmt_path_type character varying,
  fmt_node_bg_opacity real,
  fmt_node_border_width integer,
  fmt_node_image_placement character varying,
  fmt_node_layout_gap integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT universes_pkey PRIMARY KEY (id),
  CONSTRAINT universes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_settings (
  id integer NOT NULL DEFAULT nextval('user_settings_id_seq'::regclass),
  user_id integer NOT NULL UNIQUE,
  theme text NOT NULL DEFAULT 'dark'::text,
  default_view text NOT NULL DEFAULT 'week'::text,
  week_starts_on integer NOT NULL DEFAULT 0,
  time_format text NOT NULL DEFAULT '12h'::text,
  default_event_duration integer NOT NULL DEFAULT 60,
  show_declined_events boolean NOT NULL DEFAULT false,
  show_weekends boolean NOT NULL DEFAULT true,
  default_reminder_minutes integer NOT NULL DEFAULT 30,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_pkey PRIMARY KEY (id),
  CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  clerk_user_id text NOT NULL UNIQUE,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  timezone text NOT NULL DEFAULT 'UTC'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.what_if_iterations (
  id integer NOT NULL DEFAULT nextval('what_if_iterations_id_seq'::regclass),
  simulation_id integer NOT NULL,
  iteration_number integer NOT NULL,
  scenario text NOT NULL,
  time_scale integer NOT NULL,
  realism integer NOT NULL,
  scope integer NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  layers jsonb NOT NULL DEFAULT '["physical", "social", "economic", "psychological"]'::jsonb,
  result jsonb,
  status text,
  prompt_payload jsonb,
  raw_ai_response text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT what_if_iterations_pkey PRIMARY KEY (id),
  CONSTRAINT what_if_iterations_simulation_id_fkey FOREIGN KEY (simulation_id) REFERENCES public.what_if_simulations(id)
);
CREATE TABLE public.what_if_phases (
  id integer NOT NULL DEFAULT nextval('what_if_phases_id_seq'::regclass),
  iteration_id integer NOT NULL,
  phase_index integer NOT NULL,
  phase text NOT NULL,
  label text NOT NULL,
  impacts jsonb NOT NULL,
  prompt_payload jsonb,
  raw_ai_response text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT what_if_phases_pkey PRIMARY KEY (id),
  CONSTRAINT what_if_phases_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.what_if_iterations(id)
);
CREATE TABLE public.what_if_simulations (
  id integer NOT NULL DEFAULT nextval('what_if_simulations_id_seq'::regclass),
  user_id integer NOT NULL,
  name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT what_if_simulations_pkey PRIMARY KEY (id),
  CONSTRAINT what_if_simulations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);