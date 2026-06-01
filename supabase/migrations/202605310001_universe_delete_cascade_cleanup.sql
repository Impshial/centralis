begin;

create temp table if not exists pg_temp.orphan_universe_element_ids (
  id varchar primary key
) on commit drop;

insert into pg_temp.orphan_universe_element_ids (id)
select e.id
from public.elements e
where e.universe_id is not null
  and not exists (
    select 1
    from public.universes u
    where u.id = e.universe_id
  )
on conflict do nothing;

create temp table if not exists pg_temp.orphan_expanded_view_ids (
  id varchar primary key
) on commit drop;

insert into pg_temp.orphan_expanded_view_ids (id)
select ev.id
from public.expanded_views ev
where not exists (
    select 1
    from public.universes u
    where u.id = ev.universe_id
  )
  or not exists (
    select 1
    from public.elements e
    where e.id = ev.element_id
  )
  or exists (
    select 1
    from pg_temp.orphan_universe_element_ids orphan
    where orphan.id = ev.element_id
  )
on conflict do nothing;

delete from public.expanded_view_edges edge
where exists (
    select 1
    from pg_temp.orphan_expanded_view_ids orphan
    where orphan.id = edge.expanded_view_id
  )
  or not exists (
    select 1
    from public.expanded_views view_row
    where view_row.id = edge.expanded_view_id
  )
  or not exists (
    select 1
    from public.expanded_view_nodes node_row
    where node_row.id = edge.source_node_id
  )
  or not exists (
    select 1
    from public.expanded_view_nodes node_row
    where node_row.id = edge.target_node_id
  );

delete from public.expanded_view_node_fields field
where exists (
    select 1
    from public.expanded_view_nodes node_row
    join pg_temp.orphan_expanded_view_ids orphan on orphan.id = node_row.expanded_view_id
    where node_row.id = field.node_id
  )
  or not exists (
    select 1
    from public.expanded_view_nodes node_row
    where node_row.id = field.node_id
  );

delete from public.expanded_view_nodes node_row
where exists (
    select 1
    from pg_temp.orphan_expanded_view_ids orphan
    where orphan.id = node_row.expanded_view_id
  )
  or not exists (
    select 1
    from public.expanded_views view_row
    where view_row.id = node_row.expanded_view_id
  );

delete from public.expanded_views view_row
where exists (
    select 1
    from pg_temp.orphan_expanded_view_ids orphan
    where orphan.id = view_row.id
  )
  or not exists (
    select 1
    from public.universes u
    where u.id = view_row.universe_id
  )
  or not exists (
    select 1
    from public.elements e
    where e.id = view_row.element_id
  );

delete from public.image_table image_row
where exists (
  select 1
  from pg_temp.orphan_universe_element_ids orphan
  where orphan.id = image_row.object_id
);

delete from public.builder_images image_row
where exists (
  select 1
  from pg_temp.orphan_universe_element_ids orphan
  where orphan.id = image_row.object_id
);

delete from public.chronicle_modules module
where exists (
    select 1
    from pg_temp.orphan_universe_element_ids orphan
    where orphan.id = module.element_id
  )
  or not exists (
    select 1
    from public.elements e
    where e.id = module.element_id
  );

delete from public.element_template_field_values field_value
where exists (
    select 1
    from pg_temp.orphan_universe_element_ids orphan
    where orphan.id = field_value.element_id
  )
  or not exists (
    select 1
    from public.elements e
    where e.id = field_value.element_id
  );

delete from public.element_custom_fields custom_field
where exists (
    select 1
    from pg_temp.orphan_universe_element_ids orphan
    where orphan.id = custom_field.element_id
  )
  or not exists (
    select 1
    from public.elements e
    where e.id = custom_field.element_id
  );

delete from public.element_layer_assignments assignment
where exists (
    select 1
    from pg_temp.orphan_universe_element_ids orphan
    where orphan.id = assignment.element_id
  )
  or not exists (
    select 1
    from public.universes u
    where u.id = assignment.universe_id
  )
  or not exists (
    select 1
    from public.elements e
    where e.id = assignment.element_id
  )
  or not exists (
    select 1
    from public.universe_layers layer_row
    where layer_row.id = assignment.layer_id
  )
  or not exists (
    select 1
    from public.universe_layer_entries entry_row
    where entry_row.id = assignment.entry_id
  );

delete from public.element_links link
where not exists (
    select 1
    from public.universes u
    where u.id = link.universe_id
  )
  or not exists (
    select 1
    from public.elements e
    where e.id = link.source_element_id
  )
  or not exists (
    select 1
    from public.elements e
    where e.id = link.target_element_id
  )
  or exists (
    select 1
    from pg_temp.orphan_universe_element_ids orphan
    where orphan.id in (link.source_element_id, link.target_element_id)
  );

delete from public.elements e
where exists (
  select 1
  from pg_temp.orphan_universe_element_ids orphan
  where orphan.id = e.id
);

update public.elements e
set group_id = null,
    group_position_x = null,
    group_position_y = null,
    updated_at = now()
where e.group_id is not null
  and not exists (
    select 1
    from public.element_groups group_row
    where group_row.id = e.group_id
  );

delete from public.universe_layer_entries entry_row
where not exists (
  select 1
  from public.universe_layers layer_row
  where layer_row.id = entry_row.layer_id
);

delete from public.universe_layers layer_row
where not exists (
  select 1
  from public.universes u
  where u.id = layer_row.universe_id
);

delete from public.element_groups group_row
where not exists (
  select 1
  from public.universes u
  where u.id = group_row.universe_id
);

delete from public.canvas_groups group_row
where not exists (
  select 1
  from public.universes u
  where u.id = group_row.universe_id
);

delete from public.canvas_notes note_row
where not exists (
  select 1
  from public.universes u
  where u.id = note_row.universe_id
);

delete from public.universe_custom_fields custom_field
where not exists (
  select 1
  from public.universes u
  where u.id = custom_field.universe_id
);

create or replace function pg_temp.drop_foreign_keys_for_column(target_table regclass, target_column name)
returns void
language plpgsql
as $$
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
    where con.contype = 'f'
      and con.conrelid = target_table
      and att.attname = target_column
  loop
    execute format('alter table %s drop constraint if exists %I', target_table, constraint_record.conname);
  end loop;
end $$;

select pg_temp.drop_foreign_keys_for_column('public.canvas_groups'::regclass, 'universe_id');
select pg_temp.drop_foreign_keys_for_column('public.canvas_notes'::regclass, 'universe_id');
select pg_temp.drop_foreign_keys_for_column('public.element_groups'::regclass, 'universe_id');
select pg_temp.drop_foreign_keys_for_column('public.element_layer_assignments'::regclass, 'universe_id');
select pg_temp.drop_foreign_keys_for_column('public.element_links'::regclass, 'universe_id');
select pg_temp.drop_foreign_keys_for_column('public.elements'::regclass, 'universe_id');
select pg_temp.drop_foreign_keys_for_column('public.expanded_views'::regclass, 'universe_id');
select pg_temp.drop_foreign_keys_for_column('public.universe_custom_fields'::regclass, 'universe_id');
select pg_temp.drop_foreign_keys_for_column('public.universe_layers'::regclass, 'universe_id');

select pg_temp.drop_foreign_keys_for_column('public.chronicle_modules'::regclass, 'element_id');
select pg_temp.drop_foreign_keys_for_column('public.element_custom_fields'::regclass, 'element_id');
select pg_temp.drop_foreign_keys_for_column('public.element_template_field_values'::regclass, 'element_id');
select pg_temp.drop_foreign_keys_for_column('public.expanded_views'::regclass, 'element_id');
select pg_temp.drop_foreign_keys_for_column('public.element_links'::regclass, 'source_element_id');
select pg_temp.drop_foreign_keys_for_column('public.element_links'::regclass, 'target_element_id');

select pg_temp.drop_foreign_keys_for_column('public.universe_layer_entries'::regclass, 'layer_id');
select pg_temp.drop_foreign_keys_for_column('public.element_layer_assignments'::regclass, 'layer_id');
select pg_temp.drop_foreign_keys_for_column('public.element_layer_assignments'::regclass, 'entry_id');
select pg_temp.drop_foreign_keys_for_column('public.expanded_view_nodes'::regclass, 'expanded_view_id');
select pg_temp.drop_foreign_keys_for_column('public.expanded_view_edges'::regclass, 'expanded_view_id');
select pg_temp.drop_foreign_keys_for_column('public.expanded_view_edges'::regclass, 'source_node_id');
select pg_temp.drop_foreign_keys_for_column('public.expanded_view_edges'::regclass, 'target_node_id');
select pg_temp.drop_foreign_keys_for_column('public.expanded_view_node_fields'::regclass, 'node_id');

select pg_temp.drop_foreign_keys_for_column('public.elements'::regclass, 'group_id');

alter table public.canvas_groups
add constraint canvas_groups_universe_id_fkey
foreign key (universe_id)
references public.universes(id)
on delete cascade;

alter table public.canvas_notes
add constraint canvas_notes_universe_id_fkey
foreign key (universe_id)
references public.universes(id)
on delete cascade;

alter table public.element_groups
add constraint element_groups_universe_id_fkey
foreign key (universe_id)
references public.universes(id)
on delete cascade;

alter table public.element_layer_assignments
add constraint element_layer_assignments_universe_id_fkey
foreign key (universe_id)
references public.universes(id)
on delete cascade;

alter table public.element_links
add constraint element_links_universe_id_fkey
foreign key (universe_id)
references public.universes(id)
on delete cascade;

alter table public.elements
add constraint elements_universe_id_fkey
foreign key (universe_id)
references public.universes(id)
on delete cascade;

alter table public.expanded_views
add constraint expanded_views_universe_id_fkey
foreign key (universe_id)
references public.universes(id)
on delete cascade;

alter table public.universe_custom_fields
add constraint universe_custom_fields_universe_id_fkey
foreign key (universe_id)
references public.universes(id)
on delete cascade;

alter table public.universe_layers
add constraint universe_layers_universe_id_fkey
foreign key (universe_id)
references public.universes(id)
on delete cascade;

alter table public.chronicle_modules
add constraint chronicle_modules_element_id_fkey
foreign key (element_id)
references public.elements(id)
on delete cascade;

alter table public.element_custom_fields
add constraint element_custom_fields_element_id_fkey
foreign key (element_id)
references public.elements(id)
on delete cascade;

alter table public.element_template_field_values
add constraint element_template_field_values_element_id_fkey
foreign key (element_id)
references public.elements(id)
on delete cascade;

alter table public.expanded_views
add constraint expanded_views_element_id_fkey
foreign key (element_id)
references public.elements(id)
on delete cascade;

alter table public.element_links
add constraint element_links_source_element_id_fkey
foreign key (source_element_id)
references public.elements(id)
on delete cascade;

alter table public.element_links
add constraint element_links_target_element_id_fkey
foreign key (target_element_id)
references public.elements(id)
on delete cascade;

alter table public.universe_layer_entries
add constraint universe_layer_entries_layer_id_fkey
foreign key (layer_id)
references public.universe_layers(id)
on delete cascade;

alter table public.element_layer_assignments
add constraint element_layer_assignments_layer_id_fkey
foreign key (layer_id)
references public.universe_layers(id)
on delete cascade;

alter table public.element_layer_assignments
add constraint element_layer_assignments_entry_id_fkey
foreign key (entry_id)
references public.universe_layer_entries(id)
on delete cascade;

alter table public.expanded_view_nodes
add constraint expanded_view_nodes_expanded_view_id_fkey
foreign key (expanded_view_id)
references public.expanded_views(id)
on delete cascade;

alter table public.expanded_view_edges
add constraint expanded_view_edges_expanded_view_id_fkey
foreign key (expanded_view_id)
references public.expanded_views(id)
on delete cascade;

alter table public.expanded_view_edges
add constraint expanded_view_edges_source_node_id_fkey
foreign key (source_node_id)
references public.expanded_view_nodes(id)
on delete cascade;

alter table public.expanded_view_edges
add constraint expanded_view_edges_target_node_id_fkey
foreign key (target_node_id)
references public.expanded_view_nodes(id)
on delete cascade;

alter table public.expanded_view_node_fields
add constraint expanded_view_node_fields_node_id_fkey
foreign key (node_id)
references public.expanded_view_nodes(id)
on delete cascade;

alter table public.elements
add constraint elements_group_id_fkey
foreign key (group_id)
references public.element_groups(id)
on delete set null;

commit;
