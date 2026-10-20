-- Backup control-plane only. No changes to existing application tables.
create table public.centralis_backup_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default true,
  retention_days integer not null default 30 check(retention_days between 7 and 365),
  destination_bucket text not null default 'centralis-backups' check(destination_bucket='centralis-backups'),
  last_worker_check timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.centralis_backup_settings(id) values(true);
create table public.centralis_backup_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by integer references public.users(id) on delete set null,
  source text not null check(source in ('manual','daily')),
  status text not null default 'queued' check(status in ('queued','running','completed','failed','expired')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  backup_prefix text,
  file_count bigint,
  total_bytes bigint,
  error text,
  retention_warning text,
  workflow_url text
);
create unique index centralis_backup_one_active on public.centralis_backup_runs((true))
where status in ('queued','running');
alter table public.centralis_backup_settings enable row level security;
alter table public.centralis_backup_runs enable row level security;
revoke all on public.centralis_backup_settings,public.centralis_backup_runs from public,anon,authenticated;
grant all on public.centralis_backup_settings,public.centralis_backup_runs to service_role;

create function public.centralis_backup_control(p_action text default 'status',p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor integer; settings public.centralis_backup_settings; run_id uuid;
begin
  select id into actor from public.users where clerk_user_id=auth.uid()::text and admin;
  if actor is null then raise exception 'Only administrators can manage backups'; end if;
  select * into settings from public.centralis_backup_settings where id for update;
  if p_action='settings' then
    update public.centralis_backup_settings set
      enabled=coalesce((p_options->>'enabled')::boolean,enabled),
      retention_days=coalesce((p_options->>'retention_days')::integer,retention_days),updated_at=now()
    where id returning * into settings;
  elsif p_action='queue' then
    if settings.last_worker_check is null or settings.last_worker_check<now()-interval '3 days' then
      raise exception 'The backup worker needs setup or attention. Check the setup instructions.';
    end if;
    select id into run_id from public.centralis_backup_runs where status in ('queued','running');
    if run_id is null then
      insert into public.centralis_backup_runs(requested_by,source) values(actor,'manual') returning id into run_id;
    end if;
  elsif p_action<>'status' then raise exception 'Invalid backup action';
  end if;
  return jsonb_build_object('settings',to_jsonb(settings),'run_id',run_id,
    'runs',coalesce((select jsonb_agg(to_jsonb(r) order by requested_at desc)
      from (select * from public.centralis_backup_runs order by requested_at desc limit 50) r),'[]'::jsonb));
end; $$;
revoke all on function public.centralis_backup_control(text,jsonb) from public,anon;
grant execute on function public.centralis_backup_control(text,jsonb) to authenticated;
notify pgrst,'reload schema';
