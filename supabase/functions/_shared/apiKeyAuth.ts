// T104: shared board-scope auth for the external REST API (api-board-data,
// api-board-mutation). Kept as a shared helper rather than its own deployed
// Edge Function -- having every other function call it over HTTP would just
// add a network hop for no benefit; same shared-module precedent as
// _shared/google.ts (used by google-oauth-exchange/google-calendar-push/pull
// instead of those calling each other over HTTP).
//
// External callers have no Supabase session (no JWT) -- they authenticate
// with a per-board API key instead, minted via public.generate_api_key() and
// sent as `Authorization: Bearer <key>`. Validated against
// public.validate_api_key(), which is only reachable by service_role (see
// 20260721090004_restrict_validate_api_key.sql), hence this helper requires
// callers to pass in their service-role admin client rather than creating
// its own -- there's exactly one already constructed per-function, no reason
// to build a second.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

const AUTH_HEADER_RE = /^Bearer\s+(.+)$/i

/**
 * Reads `Authorization: Bearer <key>` off the request and resolves it to the
 * board it's scoped to via the `validate_api_key` RPC.
 *
 * Returns `{ boardId }` on success, or a ready-to-return 401 `Response` on
 * any failure. Callers do:
 *   const auth = await authenticateApiKey(req, supabaseAdmin)
 *   if (auth instanceof Response) return auth
 *   // auth.boardId is now trusted
 */
export async function authenticateApiKey(
  req: Request,
  supabaseAdmin: SupabaseClient,
): Promise<{ boardId: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const match = AUTH_HEADER_RE.exec(authHeader)
  const key = match?.[1]?.trim()
  if (!key) {
    return Response.json(
      { error: 'missing or malformed Authorization header, expected "Bearer <api key>"' },
      { status: 401 },
    )
  }

  const { data, error } = await supabaseAdmin.rpc('validate_api_key', { p_key: key })
  // validate_api_key never raises (empty result set on invalid/revoked/
  // expired, by design -- see 20260721090001_api_keys.sql) so `error` here
  // would only ever be a genuine infra problem, not "bad key". Either way
  // the caller gets the same generic message: never distinguish
  // invalid-vs-expired-vs-revoked-vs-db-error in the response body.
  if (error || !data || data.length === 0) {
    return Response.json({ error: 'invalid or expired API key' }, { status: 401 })
  }

  return { boardId: data[0].board_id as string }
}
