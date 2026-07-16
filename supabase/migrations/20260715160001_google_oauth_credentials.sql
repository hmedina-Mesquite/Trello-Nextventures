-- T062: per-user Google OAuth credentials for two-way Calendar sync.
--
-- Security requirement: access_token/refresh_token must never reach any
-- client other than the owning user's, and must never be inserted by the
-- client directly. There is deliberately NO insert policy below -- rows are
-- created only by the google-oauth-exchange Edge Function using the service
-- role key (which bypasses RLS entirely, the same trust boundary the
-- notification triggers already rely on via SECURITY DEFINER).
create table google_oauth_credentials (
  user_id uuid primary key references profiles(id) on delete cascade,
  google_email text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table google_oauth_credentials enable row level security;

create policy "select own google credentials"
  on google_oauth_credentials for select
  using (user_id = auth.uid());

create policy "update own google credentials"
  on google_oauth_credentials for update
  using (user_id = auth.uid());

create policy "delete own google credentials"
  on google_oauth_credentials for delete
  using (user_id = auth.uid());

-- Per-user mapping from a card to that user's own mirrored Google Calendar
-- event (each connected member gets their own event/calendar, since Google
-- accounts are personal -- there is no single shared event to point to).
create table card_google_events (
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  google_event_id text not null,
  updated_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

alter table card_google_events enable row level security;

create policy "manage own calendar event links"
  on card_google_events for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
