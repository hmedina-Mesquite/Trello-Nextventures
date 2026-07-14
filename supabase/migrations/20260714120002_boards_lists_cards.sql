-- T005 + T007: boards, lists, cards, with fractional `position` columns for drag-and-drop reordering.
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  background_color text not null default '#0079bf',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null,
  position double precision not null,
  created_at timestamptz not null default now()
);
create index lists_board_id_idx on public.lists (board_id);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null,
  description text,
  position double precision not null,
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cards_list_id_idx on public.cards (list_id);
