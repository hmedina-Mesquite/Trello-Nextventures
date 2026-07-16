// T065/T076: pull the acting user's own linked Google Calendar events back
// onto their cards' start_date/end_date. Invoked on calendar-page
// mount/focus and via a manual "Sincronizar ahora" button (see
// src/lib/googleCalendar.ts) rather than a server-side cron -- ponytail
// tradeoff noted there.
import { withSupabase } from 'npm:@supabase/server'
import { GOOGLE_CALENDAR_EVENTS_URL, ensureFreshAccessToken, withCors } from '../_shared/google.ts'

const handler = withSupabase({ auth: 'user' }, async (_req, ctx) => {
  const userId = ctx.userClaims.id

  const { data: cred } = await ctx.supabase
    .from('google_oauth_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (!cred) return Response.json({ ok: true, skipped: 'not connected' })

  const { data: mappings } = await ctx.supabase
    .from('card_google_events')
    .select('*')
    .eq('user_id', userId)
  if (!mappings || mappings.length === 0) return Response.json({ ok: true, synced: 0 })

  const accessToken = await ensureFreshAccessToken(ctx.supabase, userId, cred)
  let synced = 0

  for (const mapping of mappings) {
    const res = await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/${mapping.google_event_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (res.status === 404) {
      await ctx.supabase.from('cards').update({ start_date: null, end_date: null }).eq('id', mapping.card_id)
      await ctx.supabase.from('card_google_events').delete().eq('card_id', mapping.card_id).eq('user_id', userId)
      synced++
      continue
    }
    if (!res.ok) continue

    const event = await res.json()
    if (event.status === 'cancelled') {
      await ctx.supabase.from('cards').update({ start_date: null, end_date: null }).eq('id', mapping.card_id)
      await ctx.supabase.from('card_google_events').delete().eq('card_id', mapping.card_id).eq('user_id', userId)
      synced++
      continue
    }

    // event.start.date (a bare "YYYY-MM-DD") means Google has this as an
    // all-day event; event.start.dateTime (a full offset-aware timestamp)
    // means it's a real timed meeting -- these are mutually exclusive on
    // every Google Calendar event.
    const isAllDay = Boolean(event.start?.date)
    const newStart: string | undefined = isAllDay ? `${event.start.date}T12:00:00.000Z` : event.start?.dateTime
    const newEnd: string | null = isAllDay ? null : (event.end?.dateTime ?? null)
    if (!newStart) continue

    const { data: currentCard } = await ctx.supabase
      .from('cards')
      .select('start_date, end_date')
      .eq('id', mapping.card_id)
      .maybeSingle()

    // Compared as instants, not raw strings -- Google and Postgres don't
    // necessarily format an equal timestamp identically (different UTC
    // offset notation), so a naive string compare would falsely detect
    // "changed" on every pull and write needlessly.
    const startChanged =
      !currentCard?.start_date || new Date(currentCard.start_date).getTime() !== new Date(newStart).getTime()
    const currentEndTime = currentCard?.end_date ? new Date(currentCard.end_date).getTime() : null
    const newEndTime = newEnd ? new Date(newEnd).getTime() : null
    const endChanged = currentEndTime !== newEndTime

    if (startChanged || endChanged) {
      await ctx.supabase.from('cards').update({ start_date: newStart, end_date: newEnd }).eq('id', mapping.card_id)
      synced++
    }
  }

  return Response.json({ ok: true, synced })
})

export default { fetch: withCors(handler) }
