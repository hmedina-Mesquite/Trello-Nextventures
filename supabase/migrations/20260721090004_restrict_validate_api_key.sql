-- Fixes 20260721090001: `grant execute ... to service_role` alone did not
-- actually restrict validate_api_key -- confirmed live via pg_proc.proacl
-- that this project's default privileges grant EXECUTE on every new public
-- function to anon/authenticated/postgres/service_role automatically (the
-- same class of pre-existing-default-grant gap 20260716180005 found for
-- table-wide SELECT). Every other RPC in this repo relies on its own
-- internal caller/owner check and is fine left reachable by anyone;
-- validate_api_key has no such check by design (it just tests a key
-- string), so it's the one place that default reachability actually
-- matters -- explicitly revoke it here instead of just adding a grant on
-- top of an already-permissive default.
revoke execute on function public.validate_api_key(text) from public, anon, authenticated;
grant execute on function public.validate_api_key(text) to service_role;
