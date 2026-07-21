-- T105: board-scoped outbound webhook endpoints, delivered by a future
-- Edge Function against the queue built in the next migration (T106).
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  target_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);
create index webhook_endpoints_board_id_idx on public.webhook_endpoints (board_id);

alter table public.webhook_endpoints enable row level security;

create policy "members can view webhook endpoints"
  on public.webhook_endpoints for select
  to authenticated
  using (public.is_board_member(board_id));

create policy "only owner creates webhook endpoints"
  on public.webhook_endpoints for insert
  to authenticated
  with check (public.is_board_owner(board_id));

create policy "only owner updates webhook endpoints"
  on public.webhook_endpoints for update
  to authenticated
  using (public.is_board_owner(board_id))
  with check (public.is_board_owner(board_id));

create policy "only owner deletes webhook endpoints"
  on public.webhook_endpoints for delete
  to authenticated
  using (public.is_board_owner(board_id));

-- https-only: this URL gets board data POSTed to it, so refuse to register
-- one over a plaintext scheme. Re-checks the owner requirement itself since
-- security definer bypasses table RLS (same style as invite_board_member).
create function public.register_webhook_endpoint(p_board_id uuid, p_target_url text)
returns public.webhook_endpoints
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.webhook_endpoints;
begin
  if not exists (
    select 1 from public.board_members
    where board_id = p_board_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the board owner can register webhook endpoints.';
  end if;

  if left(p_target_url, 8) != 'https://' then
    raise exception 'Webhook target URL must use https://.';
  end if;

  insert into public.webhook_endpoints (board_id, target_url, created_by)
  values (p_board_id, p_target_url, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.register_webhook_endpoint(uuid, text) to authenticated;

-- Single boolean toggle covers both "Desactivar" and "Reactivar" from the UI
-- -- no need for two RPCs over one flag flip.
create function public.set_webhook_endpoint_active(p_endpoint_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid;
begin
  select board_id into v_board_id from public.webhook_endpoints where id = p_endpoint_id;

  if v_board_id is null then
    raise exception 'Webhook endpoint not found.';
  end if;

  if not exists (
    select 1 from public.board_members
    where board_id = v_board_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the board owner can change webhook endpoint status.';
  end if;

  update public.webhook_endpoints set active = p_active where id = p_endpoint_id;
end;
$$;

grant execute on function public.set_webhook_endpoint_active(uuid, boolean) to authenticated;
