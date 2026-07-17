-- Fixes 20260716180003: a column-level REVOKE does nothing against a
-- pre-existing table-level SELECT grant (confirmed live: anon/authenticated
-- both had table-wide SELECT on profiles from Supabase's default project
-- bootstrap) -- table-level SELECT implies every column regardless of any
-- column-level revoke layered on top. The only way to actually wall off one
-- column is to revoke the table-wide grant and re-grant SELECT column-by-
-- column for everything except calendar_feed_token.
revoke select on public.profiles from authenticated, anon;
grant select (id, username, full_name, avatar_url, created_at) on public.profiles to authenticated, anon;
