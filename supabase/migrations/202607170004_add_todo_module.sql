begin;

drop table if exists public.todo_tasks cascade;
drop table if exists public.todos cascade;

create table public.todo_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text,
  status text check (status is null or status in ('todo', 'in_progress', 'completed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  category text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.todo_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.todo_tasks(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  is_required boolean not null default false,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_todo_tasks_user_created
on public.todo_tasks(user_id, created_at desc);

create index idx_todo_tasks_user_due_date
on public.todo_tasks(user_id, due_date);

create index idx_todo_tasks_user_status
on public.todo_tasks(user_id, status);

create index idx_todo_tasks_user_priority
on public.todo_tasks(user_id, priority);

create index idx_todo_tasks_user_category
on public.todo_tasks(user_id, category);

create index idx_todo_subtasks_task_sort
on public.todo_subtasks(task_id, sort_order, created_at);

alter table public.todo_tasks enable row level security;
alter table public.todo_subtasks enable row level security;

create policy "Users can view their own todo tasks"
on public.todo_tasks
for select
using (
  exists (
    select 1
    from public.users
    where users.id = todo_tasks.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create policy "Users can insert their own todo tasks"
on public.todo_tasks
for insert
with check (
  exists (
    select 1
    from public.users
    where users.id = todo_tasks.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create policy "Users can update their own todo tasks"
on public.todo_tasks
for update
using (
  exists (
    select 1
    from public.users
    where users.id = todo_tasks.user_id
      and users.clerk_user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = todo_tasks.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create policy "Users can delete their own todo tasks"
on public.todo_tasks
for delete
using (
  exists (
    select 1
    from public.users
    where users.id = todo_tasks.user_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create policy "Users can view their own todo subtasks"
on public.todo_subtasks
for select
using (
  exists (
    select 1
    from public.todo_tasks
    join public.users on users.id = todo_tasks.user_id
    where todo_tasks.id = todo_subtasks.task_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create policy "Users can insert their own todo subtasks"
on public.todo_subtasks
for insert
with check (
  exists (
    select 1
    from public.todo_tasks
    join public.users on users.id = todo_tasks.user_id
    where todo_tasks.id = todo_subtasks.task_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create policy "Users can update their own todo subtasks"
on public.todo_subtasks
for update
using (
  exists (
    select 1
    from public.todo_tasks
    join public.users on users.id = todo_tasks.user_id
    where todo_tasks.id = todo_subtasks.task_id
      and users.clerk_user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.todo_tasks
    join public.users on users.id = todo_tasks.user_id
    where todo_tasks.id = todo_subtasks.task_id
      and users.clerk_user_id = auth.uid()::text
  )
);

create policy "Users can delete their own todo subtasks"
on public.todo_subtasks
for delete
using (
  exists (
    select 1
    from public.todo_tasks
    join public.users on users.id = todo_tasks.user_id
    where todo_tasks.id = todo_subtasks.task_id
      and users.clerk_user_id = auth.uid()::text
  )
);

commit;
