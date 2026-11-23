begin;

create table public.lexicon_wikis (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 240),
  kind text not null check (kind in ('universe', 'standalone')),
  universe_id varchar references public.universes(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'universe' or universe_id is null)
);
create index lexicon_wikis_owner on public.lexicon_wikis(user_id, created_at);
create index lexicon_wikis_universe on public.lexicon_wikis(universe_id);

create table public.lexicon_articles (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  title text not null default 'Untitled article',
  introduction text not null default '',
  hidden boolean not null default false,
  unique (id, wiki_id)
);
create table public.lexicon_navigation (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  article_id uuid,
  parent_id uuid,
  label text not null check (length(btrim(label)) between 1 and 240),
  sort_order integer not null default 0,
  unique (id, wiki_id),
  foreign key (article_id, wiki_id) references public.lexicon_articles(id, wiki_id) on delete cascade,
  foreign key (parent_id, wiki_id) references public.lexicon_navigation(id, wiki_id),
  check (parent_id is distinct from id)
);
create table public.lexicon_sections (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  article_id uuid not null,
  label text not null default 'Section',
  sort_order integer not null default 0,
  hidden boolean not null default false,
  unique (id, article_id, wiki_id),
  foreign key (article_id, wiki_id) references public.lexicon_articles(id, wiki_id) on delete cascade
);
create table public.lexicon_fields (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  article_id uuid not null,
  section_id uuid not null,
  label text not null default 'Field',
  field_type text not null default 'text' check (field_type in ('text','textarea','number','checkbox','url','relationship')),
  value jsonb not null default '""',
  placement text not null default 'body' check (placement in ('body','infobox')),
  sort_order integer not null default 0,
  hidden boolean not null default false,
  foreign key (section_id, article_id, wiki_id) references public.lexicon_sections(id, article_id, wiki_id) on delete cascade
);

-- One row per property, never a read/modify/write JSON object of all overrides.
-- Empty strings are explicit values; absence of a row means inherit.
create table public.lexicon_overrides (
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  subject_type text not null check (subject_type in ('article','section','template_field','custom_field','universe_field','source_link','wiki_link')),
  article_id text not null default '',
  subject_id text not null check (length(subject_id) > 0),
  property text not null,
  value jsonb not null,
  primary key (wiki_id, subject_type, article_id, subject_id, property),
  check (
    (subject_type = 'article' and property in ('title','introduction','hidden')) or
    (subject_type = 'section' and property in ('label','sort_order','hidden')) or
    (subject_type in ('template_field','custom_field','universe_field') and property in ('label','value','sort_order','placement','hidden')) or
    (subject_type in ('source_link','wiki_link') and property in ('label','hidden','page_hidden'))
  ),
  check (
    property = 'value' or
    (property in ('title','introduction','label') and jsonb_typeof(value) = 'string') or
    (property in ('hidden','page_hidden') and jsonb_typeof(value) = 'boolean') or
    (property = 'sort_order' and jsonb_typeof(value) = 'number') or
    (property = 'placement' and value in ('"body"'::jsonb, '"infobox"'::jsonb))
  ),
  check (subject_type not in ('source_link','wiki_link') or
    (property = 'page_hidden' and article_id <> '') or
    (property <> 'page_hidden' and article_id = ''))
);
create table public.lexicon_links (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  source_id text not null,
  target_id text not null,
  label text not null default '',
  direction text not null default 'directed' check (direction in ('directed','both')),
  check (source_id <> target_id)
);

-- All functions are invoker functions. Source tables are only read.
create function public.lexicon_validate_row() returns trigger
language plpgsql set search_path = '' as $$
declare w public.lexicon_wikis; allowed boolean := false; endpoint text; seen uuid[]; parent uuid;
begin
  if TG_TABLE_NAME = 'lexicon_wikis' then
    if TG_OP = 'UPDATE' and (new.kind <> old.kind or new.user_id <> old.user_id or
       (new.universe_id is distinct from old.universe_id and new.universe_id is not null)) then
      raise exception 'Wiki ownership and source cannot be changed';
    end if;
    if new.universe_id is not null and not exists (select 1 from public.universes u
      where u.id = new.universe_id and u.user_id = new.user_id and not u.deleted) then
      raise exception 'Universe unavailable';
    end if;
    if TG_OP = 'INSERT' and new.kind = 'universe' and new.universe_id is null then
      raise exception 'Select a universe';
    end if;
    return new;
  end if;
  select * into w from public.lexicon_wikis where id = new.wiki_id;
  if w.id is null then raise exception 'Wiki unavailable'; end if;
  if TG_OP = 'UPDATE' and new.wiki_id <> old.wiki_id then raise exception 'Cannot move records between wikis'; end if;
  if TG_TABLE_NAME in ('lexicon_articles','lexicon_navigation','lexicon_sections','lexicon_fields') then
    if w.kind <> 'standalone' then raise exception 'Standalone content requires an empty wiki'; end if;
    if TG_TABLE_NAME = 'lexicon_navigation' then
      -- Serialize parent edits so simultaneous moves cannot introduce a cycle.
      perform 1 from public.lexicon_wikis where id = w.id for update;
      parent := new.parent_id; seen := array[new.id];
      while parent is not null loop
        if parent = any(seen) then raise exception 'Navigation cannot contain a cycle'; end if;
        seen := array_append(seen, parent);
        select parent_id into parent from public.lexicon_navigation where id = parent and wiki_id = w.id;
      end loop;
    end if;
    return new;
  end if;
  if TG_TABLE_NAME = 'lexicon_links' then
    foreach endpoint in array array[new.source_id, new.target_id] loop
      if w.kind = 'standalone' then
        allowed := exists (select 1 from public.lexicon_articles a where a.wiki_id = w.id and a.id::text = endpoint);
      else
        allowed := endpoint = w.universe_id or exists (select 1 from public.elements e where
          e.id = endpoint and e.universe_id = w.universe_id and e.user_id = w.user_id and not e.deleted);
      end if;
      if not coalesce(allowed,false) then raise exception 'Connection endpoint unavailable in this wiki'; end if;
    end loop;
    return new;
  end if;
  if TG_TABLE_NAME = 'lexicon_overrides' then
    case new.subject_type
      when 'wiki_link' then
        allowed := exists (select 1 from public.lexicon_links l where l.wiki_id = w.id and l.id::text = new.subject_id
          and (new.article_id = '' or new.article_id in (l.source_id, l.target_id)));
      when 'source_link' then
        allowed := exists (select 1 from public.element_links l where l.universe_id = w.universe_id and l.id = new.subject_id
          and not l.deleted and (new.article_id = '' or new.article_id in (l.source_element_id,l.target_element_id)));
      when 'article' then
        allowed := new.subject_id = new.article_id and (new.article_id = w.universe_id or exists
          (select 1 from public.elements e where e.id = new.article_id and e.universe_id = w.universe_id and e.user_id = w.user_id and not e.deleted));
      when 'section' then
        allowed := exists (select 1 from public.chronicle_modules m join public.elements e on e.id = m.element_id
          where m.id = new.subject_id and e.id = new.article_id and e.universe_id = w.universe_id
          and e.user_id = w.user_id and not e.deleted and not m.deleted and m.module_type = 'template_section');
      when 'template_field' then
        allowed := exists (select 1 from public.element_type_template_fields f
          join public.chronicle_modules m on m.data->>'section_id' = f.section_id and m.module_type = 'template_section'
          join public.elements e on e.id = m.element_id where f.id = new.subject_id and e.id = new.article_id
          and e.universe_id = w.universe_id and e.user_id = w.user_id and not e.deleted and not m.deleted and not f.deleted);
      when 'custom_field' then
        allowed := exists (select 1 from public.element_custom_fields f join public.elements e on e.id = f.element_id
          where f.id = new.subject_id and e.id = new.article_id and e.universe_id = w.universe_id
          and e.user_id = w.user_id and not e.deleted and not f.deleted);
      when 'universe_field' then
        allowed := new.article_id = w.universe_id and exists (select 1 from public.universe_custom_fields f
          where f.id = new.subject_id and f.universe_id = w.universe_id and not f.deleted);
      else allowed := false;
    end case;
    if not coalesce(allowed,false) then raise exception 'Override subject unavailable in this wiki'; end if;
    return new;
  end if;
  raise exception 'Unsupported Lexicon table';
end;
$$;

alter table public.lexicon_wikis enable row level security;
create policy lexicon_wiki_owner on public.lexicon_wikis for all to authenticated
  using (user_id in (select id from public.users where clerk_user_id = (select auth.uid())::text))
  with check (user_id in (select id from public.users where clerk_user_id = (select auth.uid())::text));
create trigger lexicon_wiki_validate before insert or update on public.lexicon_wikis
for each row execute function public.lexicon_validate_row();

do $$ declare t text; begin
  foreach t in array array['lexicon_articles','lexicon_navigation','lexicon_sections','lexicon_fields','lexicon_overrides','lexicon_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create index %I on public.%I(wiki_id)', t || '_wiki', t);
    execute format('create policy lexicon_owner on public.%I for all to authenticated using
      (wiki_id in (select id from public.lexicon_wikis)) with check
      (wiki_id in (select id from public.lexicon_wikis))', t);
    execute format('create trigger lexicon_validate before insert or update on public.%I
      for each row execute function public.lexicon_validate_row()', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
create index lexicon_nav_parent on public.lexicon_navigation(parent_id, wiki_id);
create index lexicon_nav_article on public.lexicon_navigation(article_id, wiki_id);
create index lexicon_sections_article on public.lexicon_sections(article_id, wiki_id);
create index lexicon_fields_section on public.lexicon_fields(section_id, article_id, wiki_id);
revoke all on public.lexicon_wikis from anon;
grant select, insert, update, delete on public.lexicon_wikis to authenticated;
revoke all on function public.lexicon_validate_row() from public, anon;
grant execute on function public.lexicon_validate_row() to authenticated;
commit;
