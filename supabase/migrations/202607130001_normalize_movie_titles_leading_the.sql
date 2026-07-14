update public.movies
set
  title = regexp_replace(btrim(title), '^the\s+', '', 'i') || ', The',
  updated_at = now()
where title ~* '^\s*the\s+\S'
  and title !~* ',\s*the\s*$';
