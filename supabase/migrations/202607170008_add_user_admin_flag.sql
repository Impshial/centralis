begin;

alter table public.users
  add column if not exists admin boolean not null default false;

create or replace function public.prevent_non_admin_user_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user_is_admin boolean;
begin
  if (
      tg_op = 'INSERT'
      and coalesce(new.admin, false) = true
    )
    or (
      tg_op = 'UPDATE'
      and old.admin is distinct from new.admin
    )
  then
    if auth.uid() is null then
      return new;
    end if;

    select coalesce(users.admin, false)
    into acting_user_is_admin
    from public.users
    where users.clerk_user_id = auth.uid()::text;

    if not coalesce(acting_user_is_admin, false) then
      raise exception 'Only admins can change user admin status.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_users_prevent_non_admin_admin_change on public.users;
create trigger trg_users_prevent_non_admin_admin_change
before insert or update of admin on public.users
for each row execute function public.prevent_non_admin_user_admin_change();

commit;
