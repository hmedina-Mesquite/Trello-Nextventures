// Shared by google-oauth-exchange / google-calendar-push / google-calendar-pull.
// Not deployed as its own function -- Supabase's CLI skips any `_`-prefixed
// directory under supabase/functions/.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Wraps a withSupabase-produced fetch handler so OPTIONS preflight never
// hits the auth check inside it, and every real response carries CORS
// headers regardless of whether the wrapper already sets its own.
export function withCors(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const res = await handler(req)
    const headers = new Headers(res.headers)
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value)
    return new Response(res.body, { status: res.status, headers })
  }
}

export const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
export const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

interface GoogleCredentialRow {
  user_id: string
  access_token: string
  refresh_token: string
  expires_at: string
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

/** Refreshes the access token if it's expired (or about to, within a minute), persists it, and returns a usable token. */
export async function ensureFreshAccessToken(
  supabase: SupabaseClient,
  userId: string,
  cred: GoogleCredentialRow,
): Promise<string> {
  if (new Date(cred.expires_at).getTime() > Date.now() + 60_000) return cred.access_token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: cred.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    // Logged server-side only -- Google's error_description isn't a secret,
    // but there's no reason to hand callers google-internal error text either.
    console.error('Google token refresh failed', data)
    throw new Error('Google token refresh failed')
  }
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  await supabase
    .from('google_oauth_credentials')
    .update({ access_token: data.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  return data.access_token as string
}

/** No end_date -- a bare deadline, mapped to an all-day Google Calendar event. */
function toAllDayEvent(title: string, startDate: string) {
  const day = startDate.slice(0, 10)
  const end = new Date(`${day}T00:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  return {
    summary: title,
    description: 'Sincronizado automáticamente desde el tablero Trello.',
    start: { date: day },
    end: { date: end.toISOString().slice(0, 10) },
  }
}

/** end_date set -- a real meeting, mapped to a timed Google Calendar event. */
function toTimedEvent(title: string, startDate: string, endDate: string) {
  return {
    summary: title,
    description: 'Sincronizado automáticamente desde el tablero Trello.',
    start: { dateTime: startDate },
    end: { dateTime: endDate },
  }
}

/** Picks the right Google event shape based on whether the card has an end_date. */
export function toGoogleEvent(title: string, startDate: string, endDate: string | null) {
  return endDate ? toTimedEvent(title, startDate, endDate) : toAllDayEvent(title, startDate)
}

export const GOOGLE_CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
