-- Supabase default privileges can grant anon EXECUTE directly, independently of PUBLIC.
revoke all on function public.update_movie_memberships(integer[], text, text, integer[]) from anon;
notify pgrst, 'reload schema';
