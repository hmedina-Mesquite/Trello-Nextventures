-- Bug fix: `on_board_created` populates board_members in an AFTER INSERT
-- trigger, which fires after PostgREST's RETURNING clause is evaluated for
-- `insert ... returning` (what supabase-js's .insert().select() sends). That
-- made "members can view their boards" (using is_board_member(id)) reject
-- the creator's own just-inserted row, so every board creation failed on
-- the read-back with "new row violates row-level security policy" even
-- though the insert itself succeeded. Owners can always see their own
-- board directly, independent of the membership row's timing.
drop policy "members can view their boards" on public.boards;

create policy "members can view their boards"
  on public.boards for select
  to authenticated
  using (owner_id = auth.uid() or public.is_board_member(id));
