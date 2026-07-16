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
Calendar sync below.

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
