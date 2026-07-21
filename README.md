# Trello clone

React + TypeScript + Vite frontend on a Supabase backend (Postgres + Auth + RLS).

## Local setup

```
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
supabase link --project-ref <ref>
supabase db push        # applies supabase/migrations/*.sql
npm run dev
```

## Deployment (Vercel)

`vercel.json` adds a catch-all rewrite to `index.html` so client-side routes
(e.g. `/boards/:id`) don't 404 on a hard refresh. Set the two `VITE_SUPABASE_*`
env vars in the Vercel project settings — Vite bakes them in at build time, so
they must be set before each deploy. No other config is needed; Vercel's Vite
preset already knows the build command (`vite build`) and output dir (`dist`).

## Deployment (Railway)

No Dockerfile or railway.json needed — Railway's Nixpacks builder auto-detects
this as a Node project and runs `npm install`, then `npm run build`
(`tsc -b && vite build`), then `npm start`. `npm start` runs
`vite preview --host 0.0.0.0 --port $PORT`, which serves the built `dist/`
and falls back unmatched routes to `index.html` by default (Vite's preview
server enables this SPA fallback automatically), so client-side routes like
`/boards/:id` work on a hard refresh — same requirement the Vercel rewrite
above handles, just via a different mechanism since there's no static-rewrite
config on Railway.

1. Push this repo to GitHub, then in Railway: New Project → Deploy from GitHub repo.
2. In the Railway project's Variables tab, set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (same values as your local `.env`) — Vite bakes
   these into the build, so they must be set before the first deploy and
   before any redeploy that should pick up a change.
3. Railway assigns a public domain automatically (Settings → Networking →
   Generate Domain) once the deploy succeeds.

## Schema

See `supabase/migrations/` — profiles, boards, lists, cards, board_members
(roles), labels, checklists, comments, all with row-level security scoped to
board membership (content) and board ownership (settings/membership changes).
Also `google_oauth_credentials` and `card_google_events` for the Google
Calendar sync below, and `api_keys`, `webhook_endpoints`, `webhook_queue`
for the external API & webhooks section further down.

## Google Calendar sync

Each user can connect their own Google account to push their cards' due
dates to Google Calendar and pull changes back. This needs real external
setup the code can't do for you.

### 1. Google Cloud project

Create a project at [console.cloud.google.com](https://console.cloud.google.com),
then enable the **Google Calendar API** (APIs & Services → Library).

### 2. OAuth consent screen

APIs & Services → OAuth consent screen:
- User type: External.
- Publish status: **Testing** (do not submit for verification). The
  `https://www.googleapis.com/auth/calendar.events` scope this app requests
  is a Google "sensitive" scope, and public verification is a slow manual
  review. Since this app is for one known organization, not the public,
  "Testing" mode is enough — see `goal.md`.
- Under Test users, add the Google account email of every org member who
  will use the sync. Testing-mode apps only work for accounts on this list.

### 3. OAuth 2.0 Client ID

APIs & Services → Credentials → Create Credentials → OAuth client ID:
- Application type: **Web application**.
- Authorized redirect URI: `<app origin>/google-callback` — exactly, no
  trailing slash. The app computes this itself as
  `${window.location.origin}/google-callback` (see `googleRedirectUri()` in
  `src/lib/googleCalendar.ts`), so add one URI per origin you use it from,
  e.g. `http://localhost:5173/google-callback` for local dev and
  `https://<your-deployed-domain>/google-callback` for production.

Save the resulting Client ID and Client Secret.

### 4. Where the credentials go

- `VITE_GOOGLE_CLIENT_ID` in `.env` — public, safe to expose, since Vite
  bakes it into the built bundle like the `VITE_SUPABASE_*` vars.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must **also** be set as
  Supabase Edge Function secrets — Edge Functions never read the project
  root `.env`:
  ```
  supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
  ```
  For local `supabase functions serve` testing, put the same two vars in
  `supabase/functions/.env` (copy from `supabase/functions/.env.example`).

### 5. Deploy the Edge Functions

```
supabase functions deploy google-oauth-exchange google-calendar-push google-calendar-pull
```

### 6. Known limitation: no server-side pull

There's no cron job pulling Google Calendar changes into cards. Pulling
happens only when a user has the app open: on `/calendar` page mount, when
the browser tab regains focus, and via the "Sincronizar ahora" button. A
change made purely on the Google Calendar side while the user's tab is
closed won't appear on the card until they next open `/calendar`. Pushing
(card due-date edit → Google Calendar) has no such gap — it fires
immediately on save. Real always-on pull would need a scheduled job
(pg_cron + pg_net), which this app's backend doesn't otherwise use anywhere
else.

## External API & webhooks

Board owners can generate a scoped API key so an external tool can read a
board's lists/cards over REST, push changes back the same way, and register
a webhook that fires when a card or list changes. Everything here is
board-scoped: a key only ever sees the one board it was minted for.

### 1. Generate an API key

Open a board, click **Integraciones** in the board header, and use
**Generar nueva clave API** under "Claves API". Or, if you're scripting it,
call the RPC directly with the app's own Supabase client:

```js
await supabase.rpc('generate_api_key', { p_board_id: '<board id>', p_label: 'zapier' })
// -> { id, api_key, key_prefix, label, created_at }
```

`api_key` (format `tk_<48 hex chars>`) is shown **exactly once** — the panel
displays it with a "Copiar" button and a warning that you won't see it again
after closing. Only its bcrypt hash is ever stored
(`supabase/migrations/20260721090001_api_keys.sql`), so there's no way to
retrieve it again later. If it's lost, revoke it (the "Revocar" button next
to the key, or `supabase.rpc('revoke_api_key', { p_key_id })`) and generate
a new one.

Both RPCs re-check board ownership server-side, so only the board's owner
can generate or revoke its keys — non-owners see the same panel in a
read-only view. Keys never expire by default — `expires_at` is nullable and
nothing currently sets it.

### 2. Authentication

Every request to the two REST endpoints below needs:

```
Authorization: Bearer tk_...
```

A key that's wrong, revoked, or expired gets a generic `401`:

```json
{ "error": "invalid or expired API key" }
```

(a missing/malformed header gets a different message describing the
expected `Bearer <key>` format, but the principle is the same either way —
the API never says *which* part of the auth was wrong, same reason a login
form doesn't confirm which of username/password was bad.)

### 3. Read board data — `GET /functions/v1/api-board-data`

```
GET {SUPABASE_URL}/functions/v1/api-board-data?type=cards
```

`type` is optional: `boards`, `lists`, or `cards`. Omit it to get all three.
The response only includes the keys you asked for:

```json
{
  "board": { "id": "...", "name": "...", "background_color": "...", "background_image_path": null, "created_at": "...", "updated_at": "..." },
  "lists": [{ "id": "...", "board_id": "...", "name": "...", "position": 1, "created_at": "..." }],
  "cards": [{ "id": "...", "list_id": "...", "title": "...", "description": null, "position": 1, "start_date": null, "end_date": null, "complete": false, "location_data": null, "cover_attachment_id": null, "created_at": "...", "updated_at": "..." }]
}
```

Non-`GET` requests get `405`; an unrecognized `type` gets `400`.

### 4. Write to a board — `POST`/`PATCH /functions/v1/api-board-mutation`

`POST` and `PATCH` behave identically — dispatch is by an `action` field in
the JSON body, `PATCH` is just the semantically-closer alias since every
action here is a partial write. Four actions are supported:

**`create_card`** — required `list_id`, `title`; optional `description`.
Position is auto-appended to the end of the list.

```json
{ "action": "create_card", "list_id": "<list id>", "title": "Ping the vendor", "description": "optional" }
```
→ `201 { "card": { "id": "...", "list_id": "...", "title": "Ping the vendor", "position": 4, ... } }`

**`update_card`** — required `card_id`; at least one of `title`,
`description`, `complete`, `start_date`, `end_date`.

```json
{ "action": "update_card", "card_id": "<card id>", "complete": true }
```
→ `200 { "card": { ...updated row... } }`

**`create_list`** — required `title`; optional `position` (defaults to
end-of-board). The request field is `title`, to match `create_card`'s field
for a consistent API surface, even though the underlying column is
`lists.name`, which is what comes back in the response.

```json
{ "action": "create_list", "title": "Backlog" }
```
→ `201 { "list": { "id": "...", "board_id": "...", "name": "Backlog", "position": 4, ... } }`

**`update_list`** — required `list_id`; at least one of `title`, `position`.

```json
{ "action": "update_list", "list_id": "<list id>", "position": 2 }
```
→ `200 { "list": { ...updated row... } }`

Attachment upload isn't supported through this API yet — only the text
fields and dates/`complete` above. An unknown `action` or a missing required
field returns `400`; a `list_id`/`card_id` that exists but belongs to a
different board than the key's own returns `403`; one that doesn't exist at
all returns `404`.

### 5. Webhooks

In the same **Integraciones** panel, under "Webhooks", enter a target URL
and click **Registrar** — it **must** be `https://`; plain `http://` is
rejected. Scripted equivalent:

```js
await supabase.rpc('register_webhook_endpoint', { p_board_id: '<board id>', p_target_url: 'https://example.com/hook' })
```

Each registered endpoint shows a **Desactivar**/**Reactivar** toggle (same
RPC, `set_webhook_endpoint_active(p_endpoint_id, p_active)`, either
direction — there's no separate delete).

A webhook fires on every insert/update/delete of a card or list on a board
with at least one active endpoint. `event_type` is one of `card.insert`,
`card.update`, `card.delete`, `list.insert`, `list.update`, `list.delete`.
The body POSTed to your URL:

```json
{
  "record": { "...": "the full card or list row (the old row, for a delete)" },
  "board_id": "...",
  "user_id": "...",
  "username": "..."
}
```

Delivery isn't automatic or real-time — the `webhook-delivery` Edge
Function only drains the queue when something invokes it. That's a
deliberate choice to keep the architecture light (no `pg_cron` dependency),
the same tradeoff this README already makes for Google Calendar pull above.
Trigger it from the panel's **Probar entrega de webhooks** button (shows a
processed/delivered/failed/retried summary — this just works, the panel's
own logged-in session is accepted automatically), or point an external
scheduler/cron at it directly. Unlike the two REST endpoints above, this one
isn't API-key-gated (it's not called by external systems using a board's
key) but it still requires *some* credential — either a logged-in org
member's Supabase access token, or a shared secret set via
`supabase secrets set WEBHOOK_DELIVERY_SECRET=<random value>` for a scheduler
that has no user session:

```
curl -X POST -H "Authorization: Bearer <WEBHOOK_DELIVERY_SECRET>" \
  "https://<project>.supabase.co/functions/v1/webhook-delivery"
```

Each delivery attempt gets a 10s timeout, follows no redirects, and skips
any target that resolves to a localhost/private/link-local address (a
best-effort guard, not a DNS-rebinding-proof one — every endpoint here is
board-owner-registered, so this is defense in depth, not the primary
control). A queued event is retried up to 3 times total, and only marked
failed (`failed_at` set) once the 3rd attempt fails.

### 6. Deploy the Edge Functions

```
supabase functions deploy api-board-data api-board-mutation webhook-delivery
```

### 7. Examples

```
# Read a board's cards
curl -H "Authorization: Bearer tk_..." \
  "https://<project>.supabase.co/functions/v1/api-board-data?type=cards"

# Create a card
curl -X POST -H "Authorization: Bearer tk_..." -H "Content-Type: application/json" \
  -d '{"action":"create_card","list_id":"<list id>","title":"New card"}' \
  "https://<project>.supabase.co/functions/v1/api-board-mutation"
```

To see a live webhook payload without writing a receiver, register a
throwaway inspector URL as the endpoint (e.g. `https://webhook.site/<your
id>`) and then trigger delivery as in step 5 above.

## End-to-end tests

Playwright covers the critical user flow (signup/login, board/list/card CRUD,
drag-and-drop, labels, checklists, comments), the owner-vs-member permission
scenarios, and a direct-query RLS check that bypasses the UI. See
`tests/e2e/` (and `tests/e2e/rls/README.md` for why UI-hiding a control isn't
the same claim as RLS actually enforcing it).

```
npm install
npx playwright install --with-deps chromium   # once, to fetch a browser
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npx playwright test
```

The config's `webServer` starts `npm run dev` automatically, so a separate
terminal running the dev server isn't required. These tests need a live
Supabase project with `supabase/migrations/*.sql` applied — without one,
`npx playwright test` will still boot the app and confirm routing/redirects,
but every test that talks to Supabase will fail on the network/auth call,
not on a broken selector.
