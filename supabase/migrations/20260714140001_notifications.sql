-- T040: notifications. Clients may only read/mark-read their own rows;
-- rows are populated exclusively by triggers (T041), which run as
-- SECURITY DEFINER and so bypass RLS - no INSERT/DELETE policy exists for
-- the authenticated role at all, matching "insert and delete blocked".
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  related_board_id uuid references public.boards (id) on delete cascade,
  related_user_id uuid references public.profiles (id),
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_id_idx on public.notifications (user_id);

alter table public.notifications enable row level security;

create policy "users view own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "users mark own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
