-- T033: card attachments (any file type) + plain link attachments.
-- file_type/size are null for link-only rows (storage_path is also null then, url is used instead).
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  file_name text not null,
  file_type text,
  storage_path text,
  url text,
  size bigint,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  constraint attachments_storage_or_url check (storage_path is not null or url is not null)
);
create index attachments_card_id_idx on public.attachments (card_id);

alter table public.attachments enable row level security;

create policy "members view attachments"
  on public.attachments for select
  to authenticated
  using (public.is_board_member(public.card_board_id(card_id)));

create policy "members add attachments"
  on public.attachments for insert
  to authenticated
  with check (public.is_board_member(public.card_board_id(card_id)) and user_id = auth.uid());

create policy "uploader or owner deletes attachment"
  on public.attachments for delete
  to authenticated
  using (user_id = auth.uid() or public.is_board_owner(public.card_board_id(card_id)));
