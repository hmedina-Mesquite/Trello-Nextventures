// T030: this is the test that actually proves RLS (T009-T011) works, as
// opposed to ../permissions.spec.ts, which only proves the UI *hides*
// owner-only controls from a member. See ./README.md for why those are
// different claims and why a naive "expect an error" assertion is wrong
// here (RLS-blocked writes usually affect zero rows silently, they don't
// throw).
//
// No Playwright `page` fixture is used -- this drives @supabase/supabase-js
// directly (already a runtime dependency, see package.json) as two
// independently-created users, so it belongs in this suite and runs via
// `npx playwright test` like everything else, but it never touches a
// browser.
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { makeTestUser } from '../fixtures'

// Playwright's test runner is plain Node, not Vite, so `import.meta.env`
// isn't available here -- load the same .env the app uses via Node's
// built-in env-file loader (no extra dependency required).
if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env')
  } catch {
    // Older Node without process.loadEnvFile (added Node 20.6+): fall back
    // to whatever is already in process.env (e.g. exported by the shell).
  }
}

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

test.describe('RLS: direct supabase-js queries bypassing the UI entirely', () => {
  test.skip(
    !url || !anonKey,
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set -- needs a live Supabase project with supabase/migrations/*.sql applied (blocked on T002). See ./README.md.',
  )

  test('a non-member cannot update or delete a board they do not own, at the database level', async () => {
    const ownerClient = createClient(url!, anonKey!)
    const outsiderClient = createClient(url!, anonKey!)

    const owner = makeTestUser('rlsowner')
    const outsider = makeTestUser('rlsoutsider')

    const { data: ownerSignUp, error: ownerSignUpError } = await ownerClient.auth.signUp({
      email: owner.email,
      password: owner.password,
      options: { data: { username: owner.username } },
    })
    expect(ownerSignUpError, ownerSignUpError?.message).toBeNull()
    const ownerId = ownerSignUp.user?.id
    expect(ownerId).toBeTruthy()

    const { error: outsiderSignUpError } = await outsiderClient.auth.signUp({
      email: outsider.email,
      password: outsider.password,
      options: { data: { username: outsider.username } },
    })
    expect(outsiderSignUpError, outsiderSignUpError?.message).toBeNull()

    // owner_id = auth.uid() is required by the "authenticated users can
    // create boards" insert policy (T009) -- this also exercises the
    // on_board_created trigger (T008) that auto-enrolls the owner.
    const { data: board, error: insertError } = await ownerClient
      .from('boards')
      .insert({ name: 'RLS probe board', owner_id: ownerId, background_color: '#0079bf' })
      .select()
      .single()
    expect(insertError, insertError?.message).toBeNull()
    expect(board).toBeTruthy()

    // The outsider was never added to board_members, so both
    // "members can view their boards" (T009) and "only owner updates board"
    // (T011) should hide/deny this row for them.
    const { data: updateData, error: updateError } = await outsiderClient
      .from('boards')
      .update({ name: 'hacked by outsider' })
      .eq('id', board.id)
      .select()

    // Not a thrown error -- RLS-filtered rows just don't match, so this is
    // a "successful" update of zero rows. See README.md.
    expect(updateError, updateError?.message).toBeNull()
    expect(updateData ?? []).toHaveLength(0)

    const { data: verifyUnchanged } = await ownerClient
      .from('boards')
      .select('name')
      .eq('id', board.id)
      .single()
    expect(verifyUnchanged?.name).toBe('RLS probe board')

    const { data: deleteData, error: deleteError } = await outsiderClient
      .from('boards')
      .delete()
      .eq('id', board.id)
      .select()
    expect(deleteError, deleteError?.message).toBeNull()
    expect(deleteData ?? []).toHaveLength(0)

    const { data: stillThere } = await ownerClient
      .from('boards')
      .select('id')
      .eq('id', board.id)
      .maybeSingle()
    expect(stillThere).toBeTruthy()

    // The outsider shouldn't even be able to *see* the board via SELECT.
    const { data: outsiderView } = await outsiderClient
      .from('boards')
      .select('id')
      .eq('id', board.id)
      .maybeSingle()
    expect(outsiderView).toBeNull()
  })
})
