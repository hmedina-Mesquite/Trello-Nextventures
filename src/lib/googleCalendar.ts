import { supabase } from './supabaseClient'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const GOOGLE_SCOPES = 'openid email https://www.googleapis.com/auth/calendar.events'

export function isGoogleConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID)
}

function googleRedirectUri(): string {
  return `${window.location.origin}/google-callback`
}

const OAUTH_STATE_KEY = 'google_oauth_state'

export function buildGoogleAuthUrl(): string {
  // CSRF/account-linking guard: without a state round-trip, an attacker can
  // send a victim their own authorization code (e.g. via a crafted
  // /google-callback?code=... link) and get the victim's Trello account
  // silently linked to the attacker's Google Calendar -- the victim's
  // Supabase session only proves who they are, not which Google account the
  // code belongs to. Stored in sessionStorage (not a cookie) since it only
  // needs to survive this tab's redirect round-trip.
  const state = crypto.randomUUID()
  sessionStorage.setItem(OAUTH_STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID ?? '',
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    // Forces Google to always hand back a refresh_token, not just on first
    // consent -- otherwise reconnecting after a revoke leaves no way to
    // refresh the access token later.
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function consumeGoogleOAuthState(receivedState: string | null): boolean {
  const expected = sessionStorage.getItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  return Boolean(expected) && expected === receivedState
}

export async function exchangeGoogleCode(code: string): Promise<{ error: string | null }> {
  const { error } = await supabase.functions.invoke('google-oauth-exchange', {
    body: { code, redirect_uri: googleRedirectUri() },
  })
  return { error: error ? error.message : null }
}

export interface GoogleConnectionStatus {
  connected: boolean
  email: string | null
}

export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { connected: false, email: null }
  const { data: row } = await supabase
    .from('google_oauth_credentials')
    .select('google_email')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  return { connected: Boolean(row), email: (row?.google_email as string | undefined) ?? null }
}

export async function disconnectGoogle(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return
  await supabase.from('google_oauth_credentials').delete().eq('user_id', userData.user.id)
}

/**
 * Push: fire-and-forget after a start/end date edit. Never throws back into
 * the card-editing UI -- a Google Calendar hiccup shouldn't block saving the
 * card itself (matches T064's "graceful failure" requirement).
 */
export async function syncCardDatesToGoogle(cardId: string): Promise<void> {
  try {
    await supabase.functions.invoke('google-calendar-push', { body: { card_id: cardId } })
  } catch (err) {
    console.error('Google Calendar push sync failed', err)
  }
}

/**
 * Pull: no server-side cron. Real two-way sync would need a scheduled job
 * (pg_cron + pg_net + a stored secret to authenticate the cron call) -- more
 * moving parts than the rest of this app's backend uses anywhere else.
 * Instead this runs whenever the calendar page mounts or the tab regains
 * focus: it satisfies "changes in Google Calendar propagate back to the
 * card" for as long as the user actually opens the app, but a same-day edit
 * made purely on the Google side won't appear until they do.
 * ponytail: polling-on-focus ceiling; upgrade to a pg_cron-scheduled edge
 * function invocation if always-on sync (app closed) is ever required.
 */
export async function pullGoogleCalendarEvents(): Promise<void> {
  try {
    await supabase.functions.invoke('google-calendar-pull', { body: {} })
  } catch (err) {
    console.error('Google Calendar pull sync failed', err)
  }
}
