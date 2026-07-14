-- Bug fix: the RETURNS TABLE(user_id, username, role) columns become
-- implicit PL/pgSQL variables in scope, which collided with the identically
-- named columns on board_members/profiles inside the function body ("column
-- reference \"user_id\" is ambiguous"). Fully qualify every column reference
-- with its table alias instead of renaming the output columns, since the
-- client already destructures the RPC result by these names.
create or replace function public.invite_board_member(p_board_id uuid, p_identifier text)
returns table (user_id uuid, username text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_user_id uuid;
begin
  if not exists (
    select 1 from public.board_members bm
    where bm.board_id = p_board_id and bm.user_id = v_caller and bm.role = 'owner'
  ) then
    raise exception 'Only the board owner can invite members.';
  end if;

  select p.id into v_user_id
  from public.profiles p
  where p.username = p_identifier;

  if v_user_id is null then
    select u.id into v_user_id
    from auth.users u
    where lower(u.email) = lower(p_identifier);
  end if;

  if v_user_id is null then
    raise exception 'No user found with that username or email.';
  end if;

  if exists (
    select 1 from public.board_members bm
    where bm.board_id = p_board_id and bm.user_id = v_user_id
  ) then
    raise exception 'That user is already a member of this board.';
  end if;

  insert into public.board_members (board_id, user_id, role)
  values (p_board_id, v_user_id, 'member');

  return query
    select bm.user_id, pr.username, bm.role
    from public.board_members bm
    join public.profiles pr on pr.id = bm.user_id
    where bm.board_id = p_board_id and bm.user_id = v_user_id;
end;
$$;
