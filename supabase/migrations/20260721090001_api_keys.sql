-- T103: board-scoped API keys for the external REST pull/push API (T107+).
-- The raw key is shown to the owner exactly once at generation time; only a
-- bcrypt hash is ever persisted, looked up later by validate_api_key().
create extension if not exists pgcrypto with schema extensions;

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  key_hash text not null,
  key_prefix text not null,
  label text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id)
);
create index api_keys_board_id_idx on public.api_keys (board_id);
create index api_keys_key_prefix_idx on public.api_keys (key_prefix);

alter table public.api_keys enable row level security;

create policy "members can view api keys"
  on public.api_keys for select
  to authenticated
  using (public.is_board_member(board_id));

create policy "only owner creates api keys"
  on public.api_keys for insert
  to authenticated
  with check (public.is_board_owner(board_id));

create policy "only owner updates api keys"
  on public.api_keys for update
  to authenticated
  using (public.is_board_owner(board_id))
  with check (public.is_board_owner(board_id));

create policy "only owner deletes api keys"
  on public.api_keys for delete
  to authenticated
  using (public.is_board_owner(board_id));

-- A row-level SELECT grant (from the policy above) must never translate into
-- being able to fetch key_hash itself over PostgREST, same trust boundary as
-- calendar_feed_token (20260716180003). That migration's first attempt did a
-- bare column-level revoke and it did nothing -- 20260716180005 found live
-- that a pre-existing table-wide SELECT grant (every new public table gets
-- one from this project's default privileges) implies every column
-- regardless of a column-level revoke layered on top. So: revoke the
-- table-wide grant outright and re-grant SELECT column-by-column for
-- everything except key_hash, which is the only way to actually wall it off.
revoke select on public.api_keys from authenticated, anon;
grant select (id, board_id, key_prefix, label, created_at, expires_at, revoked_at, created_by)
  on public.api_keys to authenticated, anon;

-- Generates and returns a new key exactly once; only its bcrypt hash is
-- stored. Re-checks the owner requirement itself since security definer
-- bypasses table RLS (same style as invite_board_member).
create function public.generate_api_key(p_board_id uuid, p_label text)
returns table (id uuid, api_key text, key_prefix text, label text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_key_prefix text;
  v_key_hash text;
  v_id uuid;
  v_created_at timestamptz;
begin
  if not exists (
    select 1 from public.board_members
    where board_id = p_board_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the board owner can generate API keys.';
  end if;

  v_key := 'tk_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_key_prefix := left(v_key, 10);
  v_key_hash := extensions.crypt(v_key, extensions.gen_salt('bf'));

  insert into public.api_keys (board_id, key_hash, key_prefix, label, created_by)
  values (p_board_id, v_key_hash, v_key_prefix, p_label, auth.uid())
  returning api_keys.id, api_keys.created_at into v_id, v_created_at;

  return query select v_id, v_key, v_key_prefix, p_label, v_created_at;
end;
$$;

grant execute on function public.generate_api_key(uuid, text) to authenticated;

-- Soft-revoke: sets revoked_at once, idempotent against being called twice.
create function public.revoke_api_key(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid;
begin
  select board_id into v_board_id from public.api_keys where id = p_key_id;

  if v_board_id is null then
    raise exception 'API key not found.';
  end if;

  if not exists (
    select 1 from public.board_members
    where board_id = v_board_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the board owner can revoke API keys.';
  end if;

  update public.api_keys set revoked_at = now() where id = p_key_id and revoked_at is null;
end;
$$;

grant execute on function public.revoke_api_key(uuid) to authenticated;

-- Looked up by service-role Edge Functions only (external callers never hit
-- this RPC directly -- they hit an Edge Function that calls it with the
-- admin client), hence execute is granted to service_role and nobody else.
-- Empty result set (not an exception) on no match, by design.
create function public.validate_api_key(p_key text)
returns table (board_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select ak.board_id
  from public.api_keys ak
  where ak.key_prefix = left(p_key, 10)
    and ak.key_hash = extensions.crypt(p_key, ak.key_hash)
    and ak.revoked_at is null
    and (ak.expires_at is null or ak.expires_at > now());
$$;

grant execute on function public.validate_api_key(text) to service_role;
