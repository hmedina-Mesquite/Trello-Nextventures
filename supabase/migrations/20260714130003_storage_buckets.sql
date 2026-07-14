-- T033/T034: private storage buckets for card attachments and board background
-- photos, with RLS on storage.objects mirroring the same board-membership
-- rules as the rest of the app. Paths are namespaced so board membership can
-- be derived straight from the object path: card-attachments/<card_id>/...,
-- board-backgrounds/<board_id>/...
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('card-attachments', 'card-attachments', false, 52428800),
  ('board-backgrounds', 'board-backgrounds', false, 20971520)
on conflict (id) do nothing;

create policy "members read attachment files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'card-attachments'
    and public.is_board_member(public.card_board_id((storage.foldername(name))[1]::uuid))
  );

create policy "members upload attachment files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'card-attachments'
    and public.is_board_member(public.card_board_id((storage.foldername(name))[1]::uuid))
  );

create policy "uploader or owner deletes attachment files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'card-attachments'
    and (
      owner_id::uuid = auth.uid()
      or public.is_board_owner(public.card_board_id((storage.foldername(name))[1]::uuid))
    )
  );

create policy "members read board background files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'board-backgrounds'
    and public.is_board_member((storage.foldername(name))[1]::uuid)
  );

create policy "owner uploads board background files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'board-backgrounds'
    and public.is_board_owner((storage.foldername(name))[1]::uuid)
  );

create policy "owner deletes board background files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'board-backgrounds'
    and public.is_board_owner((storage.foldername(name))[1]::uuid)
  );
