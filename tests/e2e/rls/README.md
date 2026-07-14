# RLS verification (T030)

Row-Level Security is enforced by Postgres, inside the database
(`supabase/migrations/*.sql`, specifically the policies added in
T009-T011: `20260714120005_rls_helpers.sql`, `20260714120006_rls_profiles_boards.sql`,
`20260714120007_rls_content.sql`, `20260714120008_rls_owner_only.sql`). It is
**not** something the UI layer can prove.

The rest of this suite (`../permissions.spec.ts`) checks that the UI *hides*
owner-only controls from a member (T027) -- that's a courtesy for the
80% case of a well-behaved client, and worth testing on its own. It is
**not** the security boundary. Anyone with the anon key and an authenticated
session can call `supabase-js` (or hit PostgREST directly) with whatever
query they want, regardless of what buttons the React app renders. If the
real security boundary were a missing button, this whole app would be
insecure the moment someone opened devtools.

Proving RLS actually works means bypassing the UI entirely: authenticate as
a user who is *not* a member/owner of a given board, and issue the same
`.update()` / `.delete()` calls an attacker would, directly against
Supabase, then assert the database refuses the effect.

## The gotcha: RLS failures are usually silent, not thrown errors

A naive test might expect `.update(...)` on a row hidden by RLS to return an
error (e.g. "permission denied"). In practice, Postgres RLS policies scope
*which rows the query can see* -- an `UPDATE ... WHERE id = X` against a row
the policy hides simply matches **zero rows**. Supabase/PostgREST returns
`error: null` and `data: []`, not a thrown permission error. The correct
assertion is:

1. the affected-rows count / returned `data` array is empty, **and**
2. re-reading the row as someone who *can* see it (e.g. the owner) shows it
   unchanged.

An explicit error *can* still happen in narrower cases (e.g. a `.single()`
call raising `PGRST116` because zero rows matched, or an `INSERT` violating
a `WITH CHECK` clause), but "zero rows silently affected" is the general
shape to test for.

## What's here

`rls-direct-query.spec.ts` is a Playwright test that needs no browser page --
it drives two `@supabase/supabase-js` clients directly (already a runtime
dependency of the app, see `package.json`) as two independently signed-up
users, and asserts that a non-member cannot mutate a board they don't own.
It's structured as a real (if minimal) probe of the T009/T011 policies, not a
placeholder.

It `test.skip()`s itself if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
aren't set, since it needs a live Supabase project with the migrations
applied (blocked on T002 as of this writing) -- once that exists, it runs as
part of `npx playwright test` like everything else in this directory.

This one test does not replace a full RLS audit. Once T002 unblocks and the
migrations are live, worth extending this file with: a member (not just a
non-member) attempting an owner-only action (e.g. changing another member's
role, per the `is_board_owner` policy in T011), and a non-member attempting
to read/insert content rows (lists/cards/comments/etc., per T009/T010).
