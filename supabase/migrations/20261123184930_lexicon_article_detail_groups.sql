-- Article Details organization is wiki-local; source fields remain unchanged.
create table public.lexicon_detail_groups (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  article_id text not null,
  label text not null check(length(btrim(label)) between 1 and 240),
  sort_order integer not null default 0,
  unique(id,wiki_id,article_id)
);
create index lexicon_detail_groups_article on public.lexicon_detail_groups(wiki_id,article_id);
create table public.lexicon_detail_group_items (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.lexicon_wikis(id) on delete cascade,
  article_id text not null,
  subject_type text not null,
  subject_id text not null,
  group_id uuid not null,
  unique(wiki_id,article_id,subject_type,subject_id),
  foreign key(group_id,wiki_id,article_id) references public.lexicon_detail_groups(id,wiki_id,article_id) on delete cascade
);
create index lexicon_detail_group_items_group on public.lexicon_detail_group_items(group_id,wiki_id,article_id);
alter table public.lexicon_facts drop constraint lexicon_facts_kind_check;
alter table public.lexicon_facts add constraint lexicon_facts_kind_check check(kind in ('fact','excerpt','relationship','links'));

create function public.lexicon_validate_details() returns trigger language plpgsql set search_path='' as $$
declare item jsonb;
begin
  if TG_OP='UPDATE' and (new.wiki_id<>old.wiki_id or new.article_id<>old.article_id) then raise exception 'Cannot move details between articles'; end if;
  if not public.lexicon_article_available(new.wiki_id,new.article_id) then raise exception 'Article unavailable'; end if;
  if TG_TABLE_NAME='lexicon_detail_group_items' then
    if not (
      (new.subject_type='wiki_fact' and exists(select 1 from public.lexicon_facts f where f.id::text=new.subject_id and f.wiki_id=new.wiki_id and f.article_id=new.article_id)) or
      (new.subject_type in ('custom_field','universe_field','template_field','standalone_field') and public.lexicon_subject_available(new.wiki_id,new.article_id,new.subject_type,new.subject_id,'value'))
    ) then raise exception 'Detail unavailable in this article'; end if;
  elsif TG_TABLE_NAME='lexicon_facts' then
    if new.kind<>'links' then return new; end if;
    if jsonb_typeof(new.reference->'links') is distinct from 'array' then raise exception 'Choose at least one article'; end if;
    if jsonb_array_length(new.reference->'links') not between 1 and 100 then raise exception 'Choose between 1 and 100 articles'; end if;
    for item in select * from jsonb_array_elements(new.reference->'links') loop
      if jsonb_typeof(item->'article_id') is distinct from 'string' or not public.lexicon_article_available(new.wiki_id,item->>'article_id') then raise exception 'Linked article unavailable'; end if;
      if item ? 'label' and (jsonb_typeof(item->'label') is distinct from 'string' or length(item->>'label')>240) then raise exception 'Link label is too long'; end if;
    end loop;
  end if;
  return new;
end $$;
create trigger lexicon_details_validate before insert or update on public.lexicon_facts for each row execute function public.lexicon_validate_details();

create function public.lexicon_cleanup_detail_group_item() returns trigger language plpgsql set search_path='' as $$
begin
  delete from public.lexicon_detail_group_items where wiki_id=old.wiki_id and article_id=old.article_id and subject_type='wiki_fact' and subject_id=old.id::text;
  return old;
end $$;
create trigger lexicon_detail_group_cleanup after delete on public.lexicon_facts for each row execute function public.lexicon_cleanup_detail_group_item();

do $$ declare t text; begin
  foreach t in array array['lexicon_detail_groups','lexicon_detail_group_items'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy lexicon_owner on public.%I for all to authenticated using(wiki_id in(select id from public.lexicon_wikis)) with check(wiki_id in(select id from public.lexicon_wikis))',t);
    execute format('create trigger lexicon_details_validate before insert or update on public.%I for each row execute function public.lexicon_validate_details()',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;

-- Save the detail and its group together, including retry-safe creation.
create function public.lexicon_save_detail(p_detail jsonb,p_group_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved public.lexicon_facts;
begin
  insert into public.lexicon_facts(id,wiki_id,article_id,label,value,kind,reference,placement,sort_order,hidden)
  values((p_detail->>'id')::uuid,(p_detail->>'wiki_id')::uuid,p_detail->>'article_id',p_detail->>'label',coalesce(p_detail->'value','""'::jsonb),coalesce(p_detail->>'kind','fact'),coalesce(p_detail->'reference','{}'::jsonb),'infobox',coalesce((p_detail->>'sort_order')::integer,0),coalesce((p_detail->>'hidden')::boolean,false))
  on conflict(id) do update set wiki_id=excluded.wiki_id,article_id=excluded.article_id,label=excluded.label,value=excluded.value,kind=excluded.kind,reference=excluded.reference,sort_order=excluded.sort_order,hidden=excluded.hidden
  returning * into saved;
  if p_group_id is null then
    delete from public.lexicon_detail_group_items where wiki_id=saved.wiki_id and article_id=saved.article_id and subject_type='wiki_fact' and subject_id=saved.id::text;
  else
    insert into public.lexicon_detail_group_items(wiki_id,article_id,subject_type,subject_id,group_id)
    values(saved.wiki_id,saved.article_id,'wiki_fact',saved.id::text,p_group_id)
    on conflict(wiki_id,article_id,subject_type,subject_id) do update set group_id=excluded.group_id;
  end if;
  return to_jsonb(saved);
end $$;
revoke all on function public.lexicon_save_detail(jsonb,uuid) from public,anon;
grant execute on function public.lexicon_save_detail(jsonb,uuid) to authenticated;
