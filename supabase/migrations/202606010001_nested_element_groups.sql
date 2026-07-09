alter table public.element_groups
add column if not exists parent_group_id varchar;

alter table public.element_groups
add column if not exists group_position_x float4;

alter table public.element_groups
add column if not exists group_position_y float4;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join unnest(con.conkey) as key(attnum) on true
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = key.attnum
    where nsp.nspname = 'public'
      and rel.relname = 'element_groups'
      and con.contype = 'f'
      and att.attname = 'parent_group_id'
  loop
    execute format('alter table public.element_groups drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.element_groups
add constraint element_groups_parent_group_id_fkey
foreign key (parent_group_id)
references public.element_groups(id)
on delete set null;

alter table public.element_groups
drop constraint if exists element_groups_no_self_parent;

alter table public.element_groups
add constraint element_groups_no_self_parent
check (parent_group_id is null or parent_group_id <> id);

create index if not exists idx_element_groups_parent_group_id
on public.element_groups(parent_group_id);
