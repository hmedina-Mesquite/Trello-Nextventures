-- T010: lists/cards/labels/checklists/comments — any board member may read and write content.
alter table public.lists enable row level security;
alter table public.cards enable row level security;
alter table public.labels enable row level security;
alter table public.card_labels enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.comments enable row level security;

create policy "members manage lists"
  on public.lists for all
  to authenticated
  using (public.is_board_member(board_id))
  with check (public.is_board_member(board_id));

create policy "members manage cards"
  on public.cards for all
  to authenticated
  using (public.is_board_member((select board_id from public.lists where lists.id = cards.list_id)))
  with check (public.is_board_member((select board_id from public.lists where lists.id = cards.list_id)));

create policy "members manage labels"
  on public.labels for all
  to authenticated
  using (public.is_board_member(board_id))
  with check (public.is_board_member(board_id));

create policy "members manage card_labels"
  on public.card_labels for all
  to authenticated
  using (public.is_board_member(public.card_board_id(card_id)))
  with check (public.is_board_member(public.card_board_id(card_id)));

create policy "members manage checklists"
  on public.checklists for all
  to authenticated
  using (public.is_board_member(public.card_board_id(card_id)))
  with check (public.is_board_member(public.card_board_id(card_id)));

create policy "members manage checklist_items"
  on public.checklist_items for all
  to authenticated
  using (public.is_board_member(public.card_board_id((select card_id from public.checklists where checklists.id = checklist_items.checklist_id))))
  with check (public.is_board_member(public.card_board_id((select card_id from public.checklists where checklists.id = checklist_items.checklist_id))));

create policy "members view and add comments"
  on public.comments for select
  to authenticated
  using (public.is_board_member(public.card_board_id(card_id)));

create policy "members add own comments"
  on public.comments for insert
  to authenticated
  with check (public.is_board_member(public.card_board_id(card_id)) and author_id = auth.uid());

create policy "authors or board owner delete comments"
  on public.comments for delete
  to authenticated
  using (author_id = auth.uid() or public.is_board_owner(public.card_board_id(card_id)));
