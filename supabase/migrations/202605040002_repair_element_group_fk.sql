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
      and rel.relname = 'elements'
      and con.contype = 'f'
      and att.attname = 'group_id'
  loop
    execute format('alter table public.elements drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.elements
add constraint elements_group_id_fkey
foreign key (group_id)
references public.element_groups(id)
on delete set null;
