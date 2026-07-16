// T064/T075: push a card's start_date/end_date to the acting user's own Google Calendar.
// Only ever acts on the caller's own credentials/mapping row -- see
// src/lib/googleCalendar.ts for why this is per-user rather than fanned out
// to every board member who has Google connected.
import { withSupabase } from 'npm:@supabase/server'
import {
  GOOGLE_CALENDAR_EVENTS_URL,
  ensureFreshAccessToken,
  toGoogleEvent,
  withCors,
} from '../_shared/google.ts'

const handler = withSupabase({ auth: 'user' }, async (req, ctx) => {
  const { card_id: cardId } = await req.json()
  if (!cardId) return Response.json({ error: 'missing card_id' }, { status: 400 })

  const userId = ctx.userClaims.id

  const { data: cred } = await ctx.supabase
    .from('google_oauth_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (!cred) return Response.json({ ok: true, skipped: 'not connected' })

  // Scoped through ctx.supabase (RLS), not supabaseAdmin: this also doubles
  // as the membership check -- if the caller can't read the card, they
  // aren't a board member and nothing gets synced.
  const { data: card, error: cardError } = await ctx.supabase
    .from('cards')
    .select('id, title, start_date, end_date')
    .eq('id', cardId)
    .maybeSingle()
  if (cardError || !card) return Response.json({ error: 'card not found or inaccessible' }, { status: 404 })

  const { data: mapping } = await ctx.supabase
    .from('card_google_events')
    .select('*')
    .eq('card_id', cardId)
    .eq('user_id', userId)
    .maybeSingle()

  const accessToken = await ensureFreshAccessToken(ctx.supabase, userId, cred)

  if (!card.start_date) {
    if (mapping) {
      await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/${mapping.google_event_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      await ctx.supabase.from('card_google_events').delete().eq('card_id', cardId).eq('user_id', userId)
    }
    return Response.json({ ok: true })
  }

  const body = JSON.stringify(toGoogleEvent(card.title, card.start_date, card.end_date))

  if (mapping) {
    const res = await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/${mapping.google_event_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) return Response.json({ error: 'Google event update failed' }, { status: 502 })
  } else {
    const res = await fetch(GOOGLE_CALENDAR_EVENTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body,
    })
    const data = await res.json()
    if (!res.ok || !data.id) return Response.json({ error: 'Google event create failed' }, { status: 502 })
    await ctx.supabase
      .from('card_google_events')
      .upsert({ card_id: cardId, user_id: userId, google_event_id: data.id, updated_at: new Date().toISOString() })
  }

  return Response.json({ ok: true })
})

export default { fetch: withCors(handler) }
