// T107: drains public.webhook_queue (rows enqueued by the cards/lists
// triggers in 20260721090003_webhook_queue_triggers.sql) by POSTing each
// row's payload to every active endpoint registered for its board.
//
// Not gated by an API key (T104) -- this isn't called by external systems
// with a board's key, it's triggered manually from the UI (a board owner's
// "test webhook delivery" button, T110) or by an external scheduler hitting
// this URL directly on a timer. Keeps the architecture light: no pg_cron
// dependency, delivery is just an on-demand drain instead of a DB-side
// background job.
//
// verify_jwt = false (config.toml) so an external scheduler can call this
// without a Supabase session -- but that means the platform gateway does NOT
// gate this function at all, so the handler below does its own auth: a
// logged-in org member's own Supabase access token (what the UI's button
// already sends automatically), OR a shared secret for the external-
// scheduler case (set via `supabase secrets set WEBHOOK_DELIVERY_SECRET=...`,
// then have the scheduler send it as `Authorization: Bearer <secret>`).
// Security-reviewer finding (2026-07-21): without this, the function was
// fully anonymous -- anyone who found the URL could drain the queue, and
// repeated calls against a transiently-failing endpoint could burn through
// MAX_ATTEMPTS and mark real events failed_at prematurely.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { withCors } from '../_shared/google.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const BATCH_SIZE = 100
const MAX_ATTEMPTS = 3
const DELIVERY_TIMEOUT_MS = 10_000
const WEBHOOK_DELIVERY_SECRET = Deno.env.get('WEBHOOK_DELIVERY_SECRET') ?? ''

interface QueueRow {
  id: string
  board_id: string
  event_type: string
  payload: unknown
  attempts: number
}

interface EndpointRow {
  id: string
  board_id: string
  target_url: string
}

async function isAuthorized(req: Request): Promise<boolean> {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')
  const token = match?.[1]?.trim()
  if (!token) return false
  if (WEBHOOK_DELIVERY_SECRET && token === WEBHOOK_DELIVERY_SECRET) return true
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  return !error && !!data.user
}

// Security-reviewer finding W2 (2026-07-21): target_url is only checked for
// an `https://` prefix at registration (20260721090002_webhook_endpoints.sql)
// -- nothing stops a board owner (or, before the auth fix above, anyone) from
// pointing delivery at the Edge Function's own cloud-internal network (e.g. a
// cloud metadata endpoint at 169.254.169.254) or localhost/private ranges.
// This is a best-effort literal-hostname check, not a DNS-rebinding-proof
// resolver -- a hostname that resolves to a private IP only at fetch time
// (not registration time) would slip through. Acceptable residual risk for a
// private single-org tool where every endpoint is owner-registered; revisit
// with an actual resolve-then-check-the-IP guard if this app ever opens
// webhook registration to less-trusted users.
function isPrivateOrLocalTarget(rawUrl: string): boolean {
  let host: string
  try {
    host = new URL(rawUrl).hostname.toLowerCase()
  } catch {
    return true
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true // link-local, incl. cloud metadata
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true // IPv6 ULA/link-local
  return false
}

async function deliverOne(endpoint: EndpointRow, payload: unknown): Promise<boolean> {
  if (isPrivateOrLocalTarget(endpoint.target_url)) return false
  try {
    const res = await fetch(endpoint.target_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'manual', // don't let a redirect hop this off an approved host onto an internal one
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    // Network error, DNS failure, or the AbortSignal timeout firing --
    // all treated the same as a non-2xx response.
    return false
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (!(await isAuthorized(req))) {
    return Response.json({ error: 'missing or invalid credentials' }, { status: 401 })
  }

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('webhook_queue')
    .select('id, board_id, event_type, payload, attempts')
    .is('delivered_at', null)
    .is('failed_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)
  if (rowsError) return Response.json({ error: rowsError.message }, { status: 500 })

  const queueRows = (rows ?? []) as QueueRow[]
  if (queueRows.length === 0) {
    return Response.json({ processed: 0, delivered: 0, failed: 0, retried: 0 })
  }

  const boardIds = [...new Set(queueRows.map((r) => r.board_id))]
  const { data: endpoints, error: endpointsError } = await supabaseAdmin
    .from('webhook_endpoints')
    .select('id, board_id, target_url')
    .in('board_id', boardIds)
    .eq('active', true)
  if (endpointsError) return Response.json({ error: endpointsError.message }, { status: 500 })

  const endpointsByBoard = new Map<string, EndpointRow[]>()
  for (const ep of (endpoints ?? []) as EndpointRow[]) {
    const list = endpointsByBoard.get(ep.board_id) ?? []
    list.push(ep)
    endpointsByBoard.set(ep.board_id, list)
  }

  let delivered = 0
  let failed = 0
  let retried = 0

  for (const row of queueRows) {
    const boardEndpoints = endpointsByBoard.get(row.board_id) ?? []

    if (boardEndpoints.length === 0) {
      // ponytail: the enqueue trigger only queues a row when the board has
      // at least one active endpoint *at insert time*; if every endpoint
      // for the board was deactivated since, there's nothing to deliver to
      // and nothing to retry against. Leave the row exactly as-is (neither
      // delivered nor failed, attempts untouched) so it resolves itself the
      // moment an endpoint is reactivated, instead of burning a retry
      // attempt on an outcome that has nothing to do with delivery actually
      // failing.
      continue
    }

    // ponytail: per-endpoint delivery state isn't tracked across
    // invocations (no separate delivery-attempts table). A row that
    // succeeds against endpoint A but fails against endpoint B in this
    // invocation will re-POST to *both* A and B on the next retry -- a
    // genuinely partial delivery spanning invocations re-sends to
    // already-succeeded endpoints too. Acceptable for this internal
    // admin-triggered tool with a handful of boards/endpoints, not built
    // for a public webhook platform where that would need a real
    // webhook_delivery_attempts join table tracking success per
    // (queue_row, endpoint) pair instead. Only mark delivered_at once
    // every active endpoint succeeds together in the same invocation.
    const results = await Promise.all(boardEndpoints.map((ep) => deliverOne(ep, row.payload)))
    const allSucceeded = results.every(Boolean)

    if (allSucceeded) {
      await supabaseAdmin.from('webhook_queue').update({ delivered_at: new Date().toISOString() }).eq('id', row.id)
      delivered++
      continue
    }

    const newAttempts = row.attempts + 1
    if (newAttempts >= MAX_ATTEMPTS) {
      await supabaseAdmin
        .from('webhook_queue')
        .update({ attempts: newAttempts, failed_at: new Date().toISOString() })
        .eq('id', row.id)
      failed++
    } else {
      await supabaseAdmin.from('webhook_queue').update({ attempts: newAttempts }).eq('id', row.id)
      retried++
    }
  }

  return Response.json({ processed: queueRows.length, delivered, failed, retried })
}

export default { fetch: withCors(handler) }
