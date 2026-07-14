-- T006: labels, checklists, checklist items, comments.
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null default '',
  color text not null
);

create table public.card_labels (
  card_id uuid not null references public.cards (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (card_id, label_id)
);

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  title text not null default 'Checklist',
  position double precision not null default 0
);
create index checklists_card_id_idx on public.checklists (card_id);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  text text not null,
  is_complete boolean not null default false,
  position double precision not null default 0
);
create index checklist_items_checklist_id_idx on public.checklist_items (checklist_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);
create index comments_card_id_idx on public.comments (card_id);
