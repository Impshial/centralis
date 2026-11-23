begin;

-- Placement belongs to a record's assigned module, never to the shared template.
alter table public.element_custom_fields add column chronicle_module_id varchar
  references public.chronicle_modules(id) on delete set null;
create index element_custom_fields_module on public.element_custom_fields(chronicle_module_id);
create function public.chronicle_validate_custom_placement() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.chronicle_module_id is not null and not exists (
    select 1 from public.chronicle_modules m join public.elements e on e.id=m.element_id
    where m.id=new.chronicle_module_id and m.element_id=new.element_id and m.user_id=e.user_id and not m.deleted and not e.deleted
      and m.module_type='template_section' and exists(select 1 from public.element_template_sections s where s.id=m.data->>'section_id' and not s.deleted)
  ) then raise exception 'Choose a section assigned to this record'; end if;
  return new;
end $$;
create trigger chronicle_custom_placement before insert or update on public.element_custom_fields
for each row execute function public.chronicle_validate_custom_placement();
create function public.chronicle_relocate_custom_fields() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.deleted or new.element_id is distinct from old.element_id or new.data->>'section_id' is distinct from old.data->>'section_id' then
    update public.element_custom_fields set chronicle_module_id=null where chronicle_module_id=old.id;
  end if;
  return new;
end $$;
create trigger chronicle_custom_relocate after update of deleted,element_id,data on public.chronicle_modules
for each row execute function public.chronicle_relocate_custom_fields();
revoke all on function public.chronicle_validate_custom_placement(),public.chronicle_relocate_custom_fields() from public,anon;
grant execute on function public.chronicle_validate_custom_placement(),public.chronicle_relocate_custom_fields() to authenticated,service_role;

alter table public.lexicon_sections add column body text not null default '';
alter table public.lexicon_overrides drop constraint lexicon_overrides_check;
alter table public.lexicon_overrides add constraint lexicon_override_property check (
  (subject_type='article' and property in ('title','introduction','body','hidden')) or
  (subject_type='section' and property in ('label','sort_order','hidden')) or
  (subject_type in ('template_field','custom_field','universe_field') and property in ('label','value','sort_order','placement','hidden')) or
  (subject_type in ('source_link','wiki_link') and property in ('label','hidden','page_hidden'))
);
alter table public.lexicon_overrides drop constraint lexicon_overrides_check1;
alter table public.lexicon_overrides add constraint lexicon_override_value check (
  property='value' or (property in ('title','introduction','body','label') and jsonb_typeof(value)='string') or
  (property in ('hidden','page_hidden') and jsonb_typeof(value)='boolean') or
  (property='sort_order' and jsonb_typeof(value)='number') or
  (property='placement' and value in ('"body"'::jsonb,'"infobox"'::jsonb))
);

create table public.lexicon_media (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  source_image_id varchar references public.image_table(id) on delete cascade,
  storage_key text,
  name text not null default '',
  created_at timestamptz not null default now(),
  unique(id,wiki_id),
  check ((source_image_id is not null) <> (storage_key is not null))
);
create index lexicon_media_source on public.lexicon_media(source_image_id);
create table public.lexicon_annotations (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  article_id text not null,
  subject_type text not null,
  subject_id text not null,
  property text not null,
  kind text not null check(kind in ('link','unlink','auto_suppress','image')),
  anchor jsonb not null default '{}' check(jsonb_typeof(anchor)='object' and octet_length(anchor::text)<64000),
  target_id text,
  media_id uuid,
  alt text not null default '',
  caption text not null default '',
  foreign key(media_id,wiki_id) references public.lexicon_media(id,wiki_id) on delete cascade,
  check(kind not in ('link','auto_suppress') or target_id is not null),
  check(kind<>'image' or media_id is not null)
);
create index lexicon_annotations_media on public.lexicon_annotations(media_id,wiki_id);
create unique index lexicon_auto_suppression on public.lexicon_annotations(wiki_id,article_id,target_id) where kind='auto_suppress';
create table public.lexicon_facts (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  article_id text not null,
  label text not null check(length(btrim(label))>0),
  value jsonb not null default '""',
  kind text not null default 'fact' check(kind in ('fact','excerpt','relationship')),
  reference jsonb not null default '{}' check(jsonb_typeof(reference)='object' and octet_length(reference::text)<64000),
  placement text not null default 'infobox' check(placement in ('body','infobox')),
  sort_order integer not null default 0,
  hidden boolean not null default false
);
create table public.lexicon_aliases (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  article_id text not null,
  alias text not null check(length(btrim(alias)) between 1 and 240)
);
create unique index lexicon_alias_name on public.lexicon_aliases(wiki_id,article_id,lower(btrim(alias)));

create function public.lexicon_article_available(wiki uuid,article text) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from public.lexicon_wikis w where w.id=wiki and (
    (w.kind='standalone' and exists(select 1 from public.lexicon_articles a where a.wiki_id=w.id and a.id::text=article)) or
    (w.kind='universe' and exists(select 1 from public.universes u where u.id=w.universe_id and u.user_id=w.user_id and not u.deleted)
      and (article=w.universe_id or exists(select 1 from public.elements e where e.id=article and e.universe_id=w.universe_id and e.user_id=w.user_id and not e.deleted)))
  ));
$$;
create function public.lexicon_subject_available(wiki uuid,article text,kind text,subject text,prop text) returns boolean
language sql stable set search_path='' as $$
  select public.lexicon_article_available(wiki,article) and case
    when kind='article' then subject=article and prop in ('introduction','body')
    when kind='standalone_article' then subject=article and prop='introduction' and exists(select 1 from public.lexicon_articles a where a.id::text=article and a.wiki_id=wiki)
    when kind='standalone_section' then prop='body' and exists(select 1 from public.lexicon_sections s where s.id::text=subject and s.article_id::text=article and s.wiki_id=wiki)
    when kind='standalone_field' then prop='value' and exists(select 1 from public.lexicon_fields f where f.id::text=subject and f.article_id::text=article and f.wiki_id=wiki)
    when kind='wiki_fact' then prop='value' and exists(select 1 from public.lexicon_facts f where f.id::text=subject and f.article_id=article and f.wiki_id=wiki and f.kind='fact')
    when kind='template_field' then prop='value' and exists(select 1 from public.element_type_template_fields f join public.chronicle_modules m on m.data->>'section_id'=f.section_id where f.id=subject and m.element_id=article and m.module_type='template_section' and not m.deleted and not f.deleted)
    when kind='custom_field' then prop='value' and exists(select 1 from public.element_custom_fields f where f.id=subject and f.element_id=article and not f.deleted)
    when kind='universe_field' then prop='value' and exists(select 1 from public.universe_custom_fields f where f.id=subject and f.universe_id=article and not f.deleted)
    else false end;
$$;
create function public.lexicon_validate_content() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' and (new.wiki_id<>old.wiki_id or new.article_id<>old.article_id) then raise exception 'Cannot move content between articles'; end if;
  if not public.lexicon_article_available(new.wiki_id,new.article_id) then raise exception 'Article unavailable'; end if;
  if TG_TABLE_NAME='lexicon_annotations' then
    if not public.lexicon_subject_available(new.wiki_id,new.article_id,new.subject_type,new.subject_id,new.property) then raise exception 'Annotation subject unavailable'; end if;
    if new.target_id is not null and (new.target_id=new.article_id or not public.lexicon_article_available(new.wiki_id,new.target_id)) then raise exception 'Link target unavailable'; end if;
  elsif TG_TABLE_NAME='lexicon_facts' then
    if new.kind='excerpt' and not public.lexicon_subject_available(new.wiki_id,new.article_id,new.reference->>'subject_type',new.reference->>'subject_id',new.reference->>'property') then raise exception 'Excerpt subject unavailable'; end if;
    if new.kind='relationship' and not (
      (new.reference->>'subject_type'='wiki_link' and exists(select 1 from public.lexicon_links l where l.id::text=new.reference->>'subject_id' and l.wiki_id=new.wiki_id and new.article_id in(l.source_id,l.target_id))) or
      (new.reference->>'subject_type'='source_link' and exists(select 1 from public.element_links l join public.lexicon_wikis w on w.universe_id=l.universe_id where w.id=new.wiki_id and l.id=new.reference->>'subject_id' and not l.deleted and new.article_id in(l.source_element_id,l.target_element_id)))
    ) then raise exception 'Relationship unavailable'; end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['lexicon_annotations','lexicon_facts','lexicon_aliases','lexicon_media'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create index %I on public.%I(wiki_id)',t||'_wiki',t);
    execute format('create policy lexicon_owner on public.%I for all to authenticated using(wiki_id in(select id from public.lexicon_wikis)) with check(wiki_id in(select id from public.lexicon_wikis))',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    if t<>'lexicon_media' then
      execute format('create trigger lexicon_content before insert or update on public.%I for each row execute function public.lexicon_validate_content()',t);
    end if;
  end loop;
end $$;
-- Only the authenticated media endpoint can register storage keys or source assets.
revoke insert,update,delete on public.lexicon_media from authenticated;
grant select,insert on public.lexicon_media to service_role;
revoke all on function public.lexicon_article_available(uuid,text),public.lexicon_subject_available(uuid,text,text,text,text),public.lexicon_validate_content() from public,anon;
grant execute on function public.lexicon_article_available(uuid,text),public.lexicon_subject_available(uuid,text,text,text,text),public.lexicon_validate_content() to authenticated,service_role;
commit;
