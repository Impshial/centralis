begin;

-- Creation is an explicit source edit for universe wikis. The page and its
-- selected-text link commit together; retries reuse the same IDs.
create function public.lexicon_create_linked_page(
  p_wiki_id uuid, p_page_id uuid, p_annotation_id uuid,
  p_source_article text, p_subject_type text, p_subject_id text,
  p_property text, p_anchor jsonb, p_title text,
  p_element_type text default null, p_introduction text default ''
) returns text
language plpgsql security invoker set search_path='' as $$
declare
  w public.lexicon_wikis;
  previous public.lexicon_annotations;
  page_x real;
begin
  select wiki.* into w from public.lexicon_wikis wiki
    join public.users owner on owner.id=wiki.user_id
    where wiki.id=p_wiki_id and owner.clerk_user_id=(select auth.uid())::text
    for update of wiki;
  if w.id is null then raise exception 'Wiki not found or access denied.'; end if;
  if p_page_id is null or p_annotation_id is null then raise exception 'Page and link IDs are required.'; end if;
  if coalesce(length(btrim(p_title)),0) not between 1 and 240 then
    raise exception 'Enter a page title between 1 and 240 characters.';
  end if;
  if coalesce(length(btrim(p_anchor->>'quote')),0)=0 then raise exception 'Select the text first.'; end if;
  if not public.lexicon_subject_available(w.id,p_source_article,p_subject_type,p_subject_id,p_property) then
    raise exception 'Selected passage unavailable.';
  end if;

  select * into previous from public.lexicon_annotations where id=p_annotation_id;
  if previous.id is not null then
    if previous.wiki_id<>w.id or previous.article_id<>p_source_article or
      previous.subject_type<>p_subject_type or previous.subject_id<>p_subject_id or
      previous.property<>p_property or previous.kind<>'link' or previous.anchor<>p_anchor then
      raise exception 'Link ID already belongs to another passage.';
    end if;
    if previous.target_id=p_page_id::text and public.lexicon_article_available(w.id,p_page_id::text) then
      return p_page_id::text;
    end if;
  end if;

  if w.kind='universe' then
    perform 1 from public.universes where id=w.universe_id and user_id=w.user_id and not deleted for update;
    if not found then raise exception 'The source universe is unavailable.'; end if;
    if not exists(select 1 from public.element_types where id=p_element_type and user_id=w.user_id and not deleted) then
      raise exception 'Choose an available element type.';
    end if;
    select coalesce(max(position_x),120)+360 into page_x from public.elements
      where universe_id=w.universe_id and user_id=w.user_id and not deleted;
    insert into public.elements(id,user_id,universe_id,element_type_id,name,description,position_x,position_y)
      values(p_page_id::text,w.user_id,w.universe_id,p_element_type,btrim(p_title),coalesce(p_introduction,''),page_x,120);
  else
    insert into public.lexicon_articles(id,wiki_id,title,introduction)
      values(p_page_id,w.id,btrim(p_title),coalesce(p_introduction,''));
    insert into public.lexicon_navigation(id,wiki_id,article_id,label,sort_order)
      values(p_page_id,w.id,p_page_id,btrim(p_title),
        (select coalesce(max(sort_order),-1)+1 from public.lexicon_navigation where wiki_id=w.id));
  end if;

  insert into public.lexicon_annotations(id,wiki_id,article_id,subject_type,subject_id,property,kind,anchor,target_id)
    values(p_annotation_id,w.id,p_source_article,p_subject_type,p_subject_id,p_property,'link',p_anchor,p_page_id::text)
    on conflict(id) do update set target_id=excluded.target_id;
  return p_page_id::text;
end;
$$;
revoke all on function public.lexicon_create_linked_page(uuid,uuid,uuid,text,text,text,text,jsonb,text,text,text) from public,anon;
grant execute on function public.lexicon_create_linked_page(uuid,uuid,uuid,text,text,text,text,jsonb,text,text,text) to authenticated;

commit;
