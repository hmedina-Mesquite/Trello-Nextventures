-- Shared helper functions for RLS policies below. security definer + fixed
-- search_path so they can read board_members without recursing through its
-- own RLS policies (which themselves call these functions).
create function public.is_board_member(_board_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.board_members
    where board_id = _board_id and user_id = auth.uid()
  );
$$;

create function public.is_board_owner(_board_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.board_members
    where board_id = _board_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create function public.card_board_id(_card_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select lists.board_id from public.cards
  join public.lists on lists.id = cards.list_id
  where cards.id = _card_id;
$$;
