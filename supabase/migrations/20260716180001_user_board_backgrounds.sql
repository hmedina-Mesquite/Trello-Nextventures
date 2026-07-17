-- T080: per-member board background overrides. background_color/
-- background_image_path stay on boards as the board-wide default; this
-- table layers an optional per-(user, board) override on top, read back by
-- BoardPage (T083) ahead of the board's own values. Both columns nullable
-- independently - a user can override just the color, just the image, or
-- both; null on a column means "use the board's default" for that property.
create table public.user_board_backgrounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  board_id uuid not null references public.boards (id) on delete cascade,
  background_color text,
  background_image_path text,
  updated_at timestamptz not null default now(),
  unique (user_id, board_id)
);
create index user_board_backgrounds_board_id_idx on public.user_board_backgrounds (board_id);

alter table public.user_board_backgrounds enable row level security;

create policy "users manage their own board background override"
  on public.user_board_backgrounds for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- SECURITY DEFINER purely to run as one round-trip upsert; re-checks board
-- membership itself since definer bypasses the table's own RLS on insert.
create function public.upsert_user_board_background(
  p_board_id uuid,
  p_color text,
  p_image_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_board_member(p_board_id) then
    raise exception 'not a member of this board';
  end if;

  insert into public.user_board_backgrounds (user_id, board_id, background_color, background_image_path, updated_at)
  values (auth.uid(), p_board_id, p_color, p_image_path, now())
  on conflict (user_id, board_id) do update
    set background_color = excluded.background_color,
        background_image_path = excluded.background_image_path,
        updated_at = now();
end;
$$;

-- Personal background image uploads live in the existing board-backgrounds
-- bucket, namespaced under <board_id>/user/<user_id>/... so the existing
-- board-wide read policy (any board member, keyed on path segment 1 = board_id)
-- already covers reading these too, with no new SELECT policy needed.
create policy "members upload their personal background files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'board-backgrounds'
    and (storage.foldername(name))[2] = 'user'
    and (storage.foldername(name))[3] = auth.uid()::text
    and public.is_board_member((storage.foldername(name))[1]::uuid)
  );

create policy "members delete their personal background files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'board-backgrounds'
    and (storage.foldername(name))[2] = 'user'
    and (storage.foldername(name))[3] = auth.uid()::text
  );
