-- T009: profiles (needed to resolve member names) + board access by membership.
alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;

create policy "profiles are viewable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users manage their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

create policy "members can view their boards"
  on public.boards for select
  to authenticated
  using (public.is_board_member(id));

create policy "authenticated users can create boards"
  on public.boards for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "members can view board membership"
  on public.board_members for select
  to authenticated
  using (public.is_board_member(board_id));
