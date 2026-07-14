-- T032: invite by username OR email. A plain client-side query can't look up
-- by email (email lives in auth.users, not exposed to PostgREST, and
-- shouldn't be — an open email-lookup would let anyone enumerate registered
-- addresses). This RPC does the lookup and the insert together, server-side,
-- re-checking the owner requirement itself since security definer bypasses
-- table RLS.
create function public.invite_board_member(p_board_id uuid, p_identifier text)
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
    select 1 from public.board_members
    where board_id = p_board_id and user_id = v_caller and role = 'owner'
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
    select 1 from public.board_members where board_id = p_board_id and user_id = v_user_id
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

grant execute on function public.invite_board_member(uuid, text) to authenticated;
