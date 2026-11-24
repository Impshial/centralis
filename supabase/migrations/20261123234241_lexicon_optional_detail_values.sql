-- Article Details labels and text values are optional. Keep existing rows and ownership rules.
alter table public.lexicon_facts drop constraint lexicon_facts_label_check;
alter table public.lexicon_facts alter column label set default '';

create or replace function public.lexicon_validate_details() returns trigger
language plpgsql set search_path='' as $$
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
    if jsonb_typeof(new.reference->'links') is distinct from 'array' then raise exception 'Add at least one item'; end if;
    if jsonb_array_length(new.reference->'links') not between 1 and 100 then raise exception 'Add between 1 and 100 items'; end if;
    if new.reference ? 'presentation' and (jsonb_typeof(new.reference->'presentation') is distinct from 'string' or new.reference->>'presentation' not in ('item','group')) then raise exception 'Invalid detail presentation'; end if;
    if new.reference->>'presentation'='item' and jsonb_array_length(new.reference->'links')<>1 then raise exception 'A standalone item must contain one value'; end if;
    for item in select * from jsonb_array_elements(new.reference->'links') loop
      if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid detail item'; end if;
      if item ? 'article_id' then
        if item ? 'text' then raise exception 'Choose text or an article link'; end if;
        if jsonb_typeof(item->'article_id') is distinct from 'string' or not public.lexicon_article_available(new.wiki_id,item->>'article_id') then raise exception 'Linked article unavailable'; end if;
        if item ? 'label' and (jsonb_typeof(item->'label') is distinct from 'string' or length(item->>'label')>240) then raise exception 'Link label is too long'; end if;
      elsif jsonb_typeof(item->'text') is distinct from 'string' or length(item->>'text')>10000 then
        raise exception 'Text items must contain at most 10000 characters';
      end if;
    end loop;
  end if;
  return new;
end $$;
