-- T011: owner-only operations — board settings and membership management.
-- Content CRUD (T010) is open to any member; these are the actions members must not be able to do.
create policy "only owner updates board"
  on public.boards for update
  to authenticated
  using (public.is_board_owner(id))
  with check (public.is_board_owner(id));

create policy "only owner deletes board"
  on public.boards for delete
  to authenticated
  using (public.is_board_owner(id));

create policy "only owner invites members"
  on public.board_members for insert
  to authenticated
  with check (public.is_board_owner(board_id));

create policy "only owner changes member roles"
  on public.board_members for update
  to authenticated
  using (public.is_board_owner(board_id))
  with check (public.is_board_owner(board_id));

create policy "owner removes members or member removes self"
  on public.board_members for delete
  to authenticated
  using (public.is_board_owner(board_id) or user_id = auth.uid());
