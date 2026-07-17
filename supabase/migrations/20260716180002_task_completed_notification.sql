-- T087: notify every other board member when a card flips incomplete -> complete.
-- Same trigger shape as T041 (handle_new_board_member/handle_board_member_removed):
-- SECURITY DEFINER, auth.uid() inside the body still resolves to the actual
-- caller (JWT claims, unaffected by the function's own privilege context),
-- skips the completer themselves so they don't get notified of their own action.
create function public.handle_card_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid;
  v_completer_username text;
  v_member record;
begin
  select lists.board_id into v_board_id
  from public.lists
  where lists.id = new.list_id;

  select p.username into v_completer_username
  from public.profiles p
  where p.id = auth.uid();

  for v_member in
    select user_id from public.board_members
    where board_id = v_board_id
      and (auth.uid() is null or user_id != auth.uid())
  loop
    insert into public.notifications (user_id, event_type, related_board_id, related_user_id, message)
    values (
      v_member.user_id,
      'task_completed',
      v_board_id,
      auth.uid(),
      format('"%s" fue marcada como completada por %s',
        new.title,
        coalesce(v_completer_username, 'un miembro'))
    );
  end loop;

  return new;
end;
$$;

create trigger on_card_completed
  after update on public.cards
  for each row
  when (old.complete is false and new.complete is true)
  execute function public.handle_card_completed();
