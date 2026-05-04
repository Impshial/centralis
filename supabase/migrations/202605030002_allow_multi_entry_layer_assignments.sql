alter table public.element_layer_assignments
drop constraint if exists unique_element_layer_assignment;

alter table public.element_layer_assignments
add constraint unique_element_layer_entry_assignment
unique (element_id, layer_id, entry_id);
