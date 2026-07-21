-- T106: outbound webhook delivery queue, filled by triggers on cards/lists.
-- Drained later by a service-role Edge Function (a separate follow-up task);
-- no client (authenticated or anon) ever reads or writes this table directly.
create table public.webhook_queue (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  failed_at timestamptz,
  attempts int not null default 0
);
create index webhook_queue_board_id_idx on public.webhook_queue (board_id);
create index webhook_queue_undelivered_idx on public.webhook_queue (created_at) where delivered_at is null;

-- No RLS: nothing in this table is ever meant to be client-readable, so
-- there's no policy to write. That alone isn't enough, though -- this
-- project's default privileges grant every new public table full DML to
-- anon/authenticated regardless of RLS (the same table-wide grant that
-- bit calendar_feed_token in 20260716180005), so an un-RLS'd table with no
-- explicit revoke would be wide open. Lock it down instead.
revoke all on public.webhook_queue from authenticated, anon;

-- Fires on cards/lists insert/update/delete and enqueues a webhook event iff
-- the board has an active endpoint registered.
--
-- Deviates from a security-invoker trigger (the more common default for
-- plain triggers in this repo) on purpose: this function needs to INSERT
-- into webhook_queue, and that table intentionally has zero grants to
-- authenticated/anon above, so a security-invoker trigger firing inside an
-- ordinary member's card/list write would hit permission-denied on the
-- INSERT and roll back the *triggering* card/list change too. Security
-- definer lets the enqueue happen under the function owner's privileges
-- while auth.uid() below still resolves to the real acting user regardless
-- (JWT claims are fixed per request, unaffected by the function's privilege
-- context -- same point already noted in notification_triggers.sql).
create function public.enqueue_webhook_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid;
  v_table_singular text;
  v_event_type text;
  v_username text;
  v_record jsonb;
begin
  if TG_TABLE_NAME = 'lists' then
    v_board_id := coalesce(new.board_id, old.board_id);
    v_table_singular := 'list';
  else
    v_table_singular := 'card';
    select l.board_id into v_board_id
    from public.lists l
    where l.id = coalesce(new.list_id, old.list_id);
  end if;

  v_event_type := v_table_singular || '.' || lower(TG_OP);

  if not exists (
    select 1 from public.webhook_endpoints
    where board_id = v_board_id and active
  ) then
    -- ponytail: this existence check exists purely to avoid queuing
    -- dead-letter events for the vast majority of boards that never
    -- register a webhook, not for any correctness reason.
    if TG_OP = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if TG_OP = 'DELETE' then
    v_record := to_jsonb(old);
  else
    v_record := to_jsonb(new);
  end if;

  select p.username into v_username from public.profiles p where p.id = auth.uid();

  insert into public.webhook_queue (board_id, event_type, payload)
  values (
    v_board_id,
    v_event_type,
    jsonb_build_object(
      'record', v_record,
      'board_id', v_board_id,
      'user_id', auth.uid(),
      'username', v_username
    )
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger cards_enqueue_webhook_event
  after insert or update or delete on public.cards
  for each row execute function public.enqueue_webhook_event();

create trigger lists_enqueue_webhook_event
  after insert or update or delete on public.lists
  for each row execute function public.enqueue_webhook_event();
