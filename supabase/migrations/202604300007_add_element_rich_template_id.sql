alter table public.elements
add column if not exists rich_template_id varchar;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'elements_rich_template_id_fkey'
      and conrelid = 'public.elements'::regclass
  ) then
    alter table public.elements
    add constraint elements_rich_template_id_fkey
    foreign key (rich_template_id)
    references public.element_type_templates(id)
    on delete set null;
  end if;
end $$;

create index if not exists idx_elements_rich_template_id
on public.elements(rich_template_id);
