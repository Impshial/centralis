begin;

alter table public.element_links
drop constraint if exists element_links_source_element_id_fkey;

alter table public.element_links
drop constraint if exists element_links_target_element_id_fkey;

commit;
