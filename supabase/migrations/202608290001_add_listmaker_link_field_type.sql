begin;

alter table public.listmaker_fields
  drop constraint if exists listmaker_fields_field_type_check;

alter table public.listmaker_fields
  add constraint listmaker_fields_field_type_check
  check (field_type in ('text', 'link', 'number', 'checkbox', 'date', 'dropdown', 'long_text'));

commit;
