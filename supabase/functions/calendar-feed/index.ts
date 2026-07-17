// T090: public, token-gated read-only ICS feed of a user's cards (any card
// with a start_date, across every board they're a member of). Deliberately
// not wrapped in withSupabase({auth: 'user'}) -- an external calendar app
// can't attach a Supabase JWT to its periodic feed fetch, so the token in
// the query string *is* the auth, validated against profiles.calendar_feed_token
// via the admin client (the only client that still has column-level SELECT
// on that column -- see the migration that revoked it from anon/authenticated).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { withCors } from '../_shared/google.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function toIcsDateTimeUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function toIcsDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '')
}

function addDaysToIcsDate(icsDate: string): string {
  const d = new Date(`${icsDate.slice(0, 4)}-${icsDate.slice(4, 6)}-${icsDate.slice(6, 8)}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

interface FeedCard {
  id: string
  title: string
  description: string | null
  start_date: string
  end_date: string | null
  list_id: string
}

// ponytail: no RFC 5545 75-octet line folding -- essentially every real
// parser (Google/Apple/Outlook calendar "subscribe from URL") accepts
// unfolded lines fine, and this app's card titles/descriptions are nowhere
// near long enough for folding to matter in practice. Add folding if a
// consuming calendar app is ever found to choke on a long line.
function buildIcs(cards: FeedCard[], listNameById: Map<string, string>, boardNameById: Map<string, string>): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trello Clone//Calendar Feed//ES',
    'CALSCALE:GREGORIAN',
  ]

  for (const card of cards) {
    const listName = listNameById.get(card.list_id)
    const boardName = boardNameById.get(card.list_id)
    const descriptionParts = [boardName, listName, card.description].filter(Boolean)

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${card.id}@trello.local`)
    lines.push(`SUMMARY:${escapeIcsText(card.title)}`)

    if (card.end_date) {
      lines.push(`DTSTART:${toIcsDateTimeUtc(card.start_date)}`)
      lines.push(`DTEND:${toIcsDateTimeUtc(card.end_date)}`)
    } else {
      const startDay = toIcsDate(card.start_date)
      lines.push(`DTSTART;VALUE=DATE:${startDay}`)
      lines.push(`DTEND;VALUE=DATE:${addDaysToIcsDate(startDay)}`)
    }

    if (descriptionParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join(' / '))}`)
    }

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

const handler = async (req: Request): Promise<Response> => {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) return new Response('Not found', { status: 404 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('calendar_feed_token', token)
    .maybeSingle()
  // Generic error only -- never echo the token back or log it, per T090.
  if (!profile) return new Response('Not found', { status: 404 })

  const { data: memberRows } = await supabaseAdmin
    .from('board_members')
    .select('board_id')
    .eq('user_id', profile.id)
  const boardIds = (memberRows ?? []).map((r) => r.board_id as string)
  if (boardIds.length === 0) {
    return new Response(buildIcs([], new Map(), new Map()), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="trello-feed.ics"' },
    })
  }

  const { data: boardsData } = await supabaseAdmin.from('boards').select('id, name').in('id', boardIds)
  const boardNameByBoardId = new Map((boardsData ?? []).map((b) => [b.id as string, b.name as string]))

  const { data: listsData } = await supabaseAdmin.from('lists').select('id, board_id, name').in('board_id', boardIds)
  const listIds = (listsData ?? []).map((l) => l.id as string)
  const listNameById = new Map((listsData ?? []).map((l) => [l.id as string, l.name as string]))
  const boardNameById = new Map(
    (listsData ?? []).map((l) => [l.id as string, boardNameByBoardId.get(l.board_id as string) ?? '']),
  )

  if (listIds.length === 0) {
    return new Response(buildIcs([], new Map(), new Map()), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="trello-feed.ics"' },
    })
  }

  const { data: cardsData } = await supabaseAdmin
    .from('cards')
    .select('id, title, description, start_date, end_date, list_id')
    .in('list_id', listIds)
    .not('start_date', 'is', null)

  const ics = buildIcs((cardsData ?? []) as FeedCard[], listNameById, boardNameById)

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="trello-feed.ics"',
    },
  })
}

export default { fetch: withCors(handler) }
