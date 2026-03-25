create table if not exists public.task_snapshots (
  id text primary key,
  workflow_id text not null,
  sentence text not null,
  book_name text not null,
  author text not null,
  status text not null,
  current_stage text not null,
  resume_route text,
  flow_mode text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz,
  task_data jsonb not null
);

create index if not exists task_snapshots_workflow_id_idx on public.task_snapshots (workflow_id);
create index if not exists task_snapshots_updated_at_idx on public.task_snapshots (updated_at desc);

alter table public.task_snapshots enable row level security;

drop policy if exists "task_snapshots_public_select" on public.task_snapshots;
drop policy if exists "task_snapshots_public_insert" on public.task_snapshots;
drop policy if exists "task_snapshots_public_update" on public.task_snapshots;
drop policy if exists "task_snapshots_public_delete" on public.task_snapshots;

create policy "task_snapshots_public_select"
on public.task_snapshots
for select
to public
using (true);

create policy "task_snapshots_public_insert"
on public.task_snapshots
for insert
to public
with check (true);

create policy "task_snapshots_public_update"
on public.task_snapshots
for update
to public
using (true)
with check (true);

create policy "task_snapshots_public_delete"
on public.task_snapshots
for delete
to public
using (true);
