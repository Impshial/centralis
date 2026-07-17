alter table public.image_generation_messages
  add column if not exists error_details jsonb;
