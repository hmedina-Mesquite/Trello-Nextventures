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

## Schema

See `supabase/migrations/` — profiles, boards, lists, cards, board_members
(roles), labels, checklists, comments, all with row-level security scoped to
board membership (content) and board ownership (settings/membership changes).

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
