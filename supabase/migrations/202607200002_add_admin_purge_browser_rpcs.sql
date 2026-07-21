create or replace function public.list_admin_purge_users()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user public.users%rowtype;
  users_payload jsonb;
begin
  select *
    into actor_user
    from public.users
    where clerk_user_id = auth.uid()::text;

  if actor_user.id is null or coalesce(actor_user.admin, false) is not true then
    raise exception 'Only admins can view purge users.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'display_name', u.display_name,
      'avatar_url', u.avatar_url,
      'admin', u.admin,
      'created_at', u.created_at,
      'is_current_user', u.id = actor_user.id
    )
    order by u.email
  ), '[]'::jsonb)
    into users_payload
    from public.users u;

  return jsonb_build_object(
    'actingUserId', actor_user.id,
    'users', users_payload
  );
end;
$$;

create or replace function public.admin_purge_data_for_current_user(
  p_user_ids integer[] default '{}'::integer[],
  p_all_users boolean default false,
  p_datasets text[] default '{}'::text[],
  p_confirmation text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_confirmation, '') <> 'PURGE' then
    raise exception 'Type PURGE to confirm this destructive action.';
  end if;

  return public.admin_purge_data(
    auth.uid()::text,
    coalesce(p_user_ids, '{}'::integer[]),
    coalesce(p_all_users, false),
    coalesce(p_datasets, '{}'::text[])
  );
end;
$$;

revoke all on function public.list_admin_purge_users() from public;
revoke all on function public.list_admin_purge_users() from anon;
grant execute on function public.list_admin_purge_users() to authenticated;

revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from public;
revoke all on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) from anon;
grant execute on function public.admin_purge_data_for_current_user(integer[], boolean, text[], text) to authenticated;
