-- T008: board membership with roles. The board creator is auto-enrolled as owner.
create table public.board_members (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create function public.handle_new_board()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.board_members (board_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger on_board_created
  after insert on public.boards
  for each row execute function public.handle_new_board();
