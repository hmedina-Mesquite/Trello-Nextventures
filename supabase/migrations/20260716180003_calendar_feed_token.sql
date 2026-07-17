-- T089: stable per-user secret token gating the read-only ICS feed (T090).
-- DEFAULT gives every existing profile a token immediately on migration and
-- every new signup one via the existing handle_new_user trigger, with no
-- separate backfill step needed.
alter table public.profiles add column calendar_feed_token text unique not null default (gen_random_uuid()::text);

-- profiles' own RLS ("profiles are viewable by any authenticated user", using
-- (true)) is row-level only -- it would otherwise let any authenticated user
-- read *any other* user's token in a plain `select calendar_feed_token from
-- profiles` and use it to pull that person's whole calendar feed. Column-
-- level privileges are enforced independently of RLS by PostgREST, so revoke
-- select on just this column from the client-facing roles; the calendar-feed
-- Edge Function validates tokens via the service_role admin client, which
-- already has table-level access untouched by this revoke.
revoke select (calendar_feed_token) on public.profiles from authenticated, anon;

-- Reads the caller's own token so CalendarPage (T091) can display the feed
-- URL on load, not just right after a regenerate call -- the column revoke
-- above blocks a plain `select calendar_feed_token`, so this getter is the
-- only way the client can ever see it, same trust boundary as the rotate RPC below.
create function public.get_calendar_feed_token()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select calendar_feed_token from public.profiles where id = auth.uid();
$$;

-- T092: rotate a user's own token, invalidating the old one immediately.
create function public.regenerate_calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := gen_random_uuid()::text;
begin
  update public.profiles set calendar_feed_token = v_token where id = auth.uid();
  return v_token;
end;
$$;
