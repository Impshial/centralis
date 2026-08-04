begin;

drop trigger if exists trg_elements_mark_ai_dirty on public.elements;
create trigger trg_elements_mark_ai_dirty
after insert or update of universe_id, name, description, element_type_id, rich_template_id, deleted, deleted_at, deleted_by or delete on public.elements
for each row
execute function public.mark_universe_ai_source_dirty();

drop trigger if exists trg_element_links_mark_ai_dirty on public.element_links;
create trigger trg_element_links_mark_ai_dirty
after insert or update of universe_id, source_element_id, target_element_id, label, deleted, deleted_at, deleted_by or delete on public.element_links
for each row
execute function public.mark_universe_ai_source_dirty();

commit;
