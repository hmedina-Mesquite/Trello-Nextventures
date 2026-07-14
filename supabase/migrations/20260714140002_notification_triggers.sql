-- T041: notify on board invite and on member removal.
--
-- board_members gets a row in two situations: (1) the on_board_created
-- trigger auto-enrolling a board's creator as 'owner' - not an invite, no
-- notification; (2) invite_board_member inserting the invited user as
-- 'member' - notify them. Filtering on role = 'member' cleanly distinguishes
-- the two without needing a separate "was this an invite" flag.
--
-- auth.uid() inside these trigger bodies still resolves to the original
-- calling user (the invite_board_member RPC is itself SECURITY DEFINER, but
-- that only changes which role's privileges apply - the JWT claims backing
-- auth.uid() are set once per request and unaffected by the function's
-- privilege context), so it correctly identifies the inviter/remover.
create function public.handle_new_board_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_name text;
  v_inviter_username text;
begin
  if new.role = 'member' then
    select b.name into v_board_name from public.boards b where b.id = new.board_id;
    select p.username into v_inviter_username from public.profiles p where p.id = auth.uid();

    insert into public.notifications (user_id, event_type, related_board_id, related_user_id, message)
    values (
      new.user_id,
      'board_invite',
      new.board_id,
      auth.uid(),
      format('%s te invitó al tablero "%s"',
        coalesce(v_inviter_username, 'Alguien'),
        coalesce(v_board_name, 'un tablero'))
    );
  end if;
  return new;
end;
$$;

create trigger on_board_member_added
  after insert on public.board_members
  for each row execute function public.handle_new_board_member();

-- Only notify when someone else removed the member (owner kick, or the
-- cascade from a board deletion) - not when a member removed themselves
-- (MembersPanel's "leave board", where old.user_id = auth.uid()).
create function public.handle_board_member_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_name text;
begin
  if old.role = 'member' and (auth.uid() is null or old.user_id != auth.uid()) then
    select b.name into v_board_name from public.boards b where b.id = old.board_id;

    insert into public.notifications (user_id, event_type, related_board_id, related_user_id, message)
    values (
      old.user_id,
      'member_removed',
      old.board_id,
      auth.uid(),
      format('Fuiste eliminado del tablero "%s"', coalesce(v_board_name, 'un tablero'))
    );
  end if;
  return old;
end;
$$;

create trigger on_board_member_removed
  after delete on public.board_members
  for each row execute function public.handle_board_member_removed();
