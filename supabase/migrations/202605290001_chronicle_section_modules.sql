begin;

drop index if exists public.idx_chronicle_modules_element_source_type_unique;
drop index if exists public.idx_chronicle_modules_element_section_unique;

delete from public.chronicle_modules
where module_type in ('rich_details', 'overview')
   or source in ('rich_details_backfill', 'chronicle_workspace');

create unique index if not exists idx_chronicle_modules_element_section_unique
on public.chronicle_modules(element_id, ((data ->> 'section_id')))
where module_type = 'template_section'
  and data ? 'section_id';

create index if not exists idx_chronicle_modules_template_section
on public.chronicle_modules(((data ->> 'template_id')), ((data ->> 'section_id')))
where module_type = 'template_section';

commit;
