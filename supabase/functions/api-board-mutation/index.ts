// T109: write side of the external REST pull/push API. Board-scoped via an
// API key (T104's authenticateApiKey), not a Supabase session. POST and
// PATCH are accepted and behave identically -- both are dispatched by the
// `action` field in the body, PATCH is just the semantically-correct alias
// since every action here is a partial write.
//
// Minimal action set for now (matches the DB task's own "start minimal"
// scope): create_card, update_card, create_list, update_list. Attachment
// upload is deliberately out of scope -- it needs multipart/storage
// handling this function doesn't do.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { withCors } from '../_shared/google.ts'
import { authenticateApiKey } from '../_shared/apiKeyAuth.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// deno-lint-ignore no-explicit-any
type Body = Record<string, any>

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

/** Looks up a list and confirms it belongs to boardId. 404 if it doesn't
 * exist at all, 403 if it exists but is scoped to a different board -- a
 * caller must not be able to tell "wrong board" from "doesn't exist" any
 * more precisely than that, but the two are still worth distinguishing from
 * each other since a 403 for a real board-scope violation is what T111's
 * docs describe. */
async function resolveListInBoard(listId: string, boardId: string): Promise<{ id: string; board_id: string } | Response> {
  const { data: list, error } = await supabaseAdmin
    .from('lists')
    .select('id, board_id')
    .eq('id', listId)
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!list) return Response.json({ error: 'list not found' }, { status: 404 })
  if (list.board_id !== boardId) {
    return Response.json({ error: 'list does not belong to this board' }, { status: 403 })
  }
  return list
}

async function createCard(boardId: string, body: Body): Promise<Response> {
  const listId = body.list_id
  const title = body.title
  if (typeof listId !== 'string' || !listId) return badRequest('missing list_id')
  if (typeof title !== 'string' || !title.trim()) return badRequest('missing title')
  if ('description' in body && body.description !== null && typeof body.description !== 'string') {
    return badRequest('description must be a string or null')
  }

  const listOrError = await resolveListInBoard(listId, boardId)
  if (listOrError instanceof Response) return listOrError

  // cards.position is NOT NULL with no default; the DB task's spec doesn't
  // mention position for create_card at all, so default it the same way
  // the app's own UI does (src/pages/BoardPage.tsx: max existing position
  // in the list + 1, or 1 for the first card).
  const { data: maxRow, error: maxError } = await supabaseAdmin
    .from('cards')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxError) return Response.json({ error: maxError.message }, { status: 500 })
  const position = (maxRow?.position ?? 0) + 1

  const { data: created, error: insertError } = await supabaseAdmin
    .from('cards')
    .insert({ list_id: listId, title, description: body.description ?? null, position })
    .select()
    .single()
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 })

  return Response.json({ card: created }, { status: 201 })
}

async function updateCard(boardId: string, body: Body): Promise<Response> {
  const cardId = body.card_id
  if (typeof cardId !== 'string' || !cardId) return badRequest('missing card_id')

  const { data: card, error: cardError } = await supabaseAdmin
    .from('cards')
    .select('id, list_id')
    .eq('id', cardId)
    .maybeSingle()
  if (cardError) return Response.json({ error: cardError.message }, { status: 500 })
  if (!card) return Response.json({ error: 'card not found' }, { status: 404 })

  const listOrError = await resolveListInBoard(card.list_id, boardId)
  if (listOrError instanceof Response) {
    // A list lookup failure here means the *card's* list is missing/foreign,
    // which from this endpoint's perspective is a card-scope problem, not a
    // list one -- reword a 404 (shouldn't happen, cards.list_id is a FK) but
    // keep 403 verbatim since that's the real board-scope-mismatch case.
    if (listOrError.status === 404) {
      return Response.json({ error: 'card not found' }, { status: 404 })
    }
    return Response.json({ error: 'card does not belong to this board' }, { status: 403 })
  }

  const updates: Body = {}
  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) return badRequest('title must be a non-empty string')
    updates.title = body.title
  }
  if ('description' in body) {
    if (body.description !== null && typeof body.description !== 'string') {
      return badRequest('description must be a string or null')
    }
    updates.description = body.description
  }
  if ('complete' in body) {
    if (typeof body.complete !== 'boolean') return badRequest('complete must be a boolean')
    updates.complete = body.complete
  }
  if ('start_date' in body) {
    if (body.start_date !== null && typeof body.start_date !== 'string') {
      return badRequest('start_date must be an ISO date string or null')
    }
    updates.start_date = body.start_date
  }
  if ('end_date' in body) {
    if (body.end_date !== null && typeof body.end_date !== 'string') {
      return badRequest('end_date must be an ISO date string or null')
    }
    updates.end_date = body.end_date
  }
  if (Object.keys(updates).length === 0) {
    return badRequest('no updatable fields provided (title, description, complete, start_date, end_date)')
  }
  updates.updated_at = new Date().toISOString()

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('cards')
    .update(updates)
    .eq('id', cardId)
    .select()
    .single()
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })

  return Response.json({ card: updated })
}

async function createList(boardId: string, body: Body): Promise<Response> {
  const title = body.title
  if (typeof title !== 'string' || !title.trim()) return badRequest('missing title')

  let position = body.position
  if (position === undefined || position === null) {
    const { data: maxRow, error: maxError } = await supabaseAdmin
      .from('lists')
      .select('position')
      .eq('board_id', boardId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxError) return Response.json({ error: maxError.message }, { status: 500 })
    position = (maxRow?.position ?? 0) + 1
  } else if (typeof position !== 'number') {
    return badRequest('position must be a number')
  }

  // Request field is `title` (matching create_card's field for a consistent
  // external API surface) but the underlying column is `lists.name`, not
  // `lists.title` -- see supabase/migrations/20260714120002_boards_lists_cards.sql.
  const { data: created, error: insertError } = await supabaseAdmin
    .from('lists')
    .insert({ board_id: boardId, name: title, position })
    .select()
    .single()
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 })

  return Response.json({ list: created }, { status: 201 })
}

async function updateList(boardId: string, body: Body): Promise<Response> {
  const listId = body.list_id
  if (typeof listId !== 'string' || !listId) return badRequest('missing list_id')

  const listOrError = await resolveListInBoard(listId, boardId)
  if (listOrError instanceof Response) return listOrError

  const updates: Body = {}
  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) return badRequest('title must be a non-empty string')
    updates.name = body.title
  }
  if ('position' in body) {
    if (typeof body.position !== 'number') return badRequest('position must be a number')
    updates.position = body.position
  }
  if (Object.keys(updates).length === 0) {
    return badRequest('no updatable fields provided (title, position)')
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('lists')
    .update(updates)
    .eq('id', listId)
    .select()
    .single()
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })

  return Response.json({ list: updated })
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return Response.json({ error: 'method not allowed, use POST or PATCH' }, { status: 405 })
  }

  const auth = await authenticateApiKey(req, supabaseAdmin)
  if (auth instanceof Response) return auth

  let body: Body
  try {
    body = await req.json()
  } catch {
    return badRequest('invalid JSON body')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return badRequest('request body must be a JSON object')
  }

  switch (body.action) {
    case 'create_card':
      return await createCard(auth.boardId, body)
    case 'update_card':
      return await updateCard(auth.boardId, body)
    case 'create_list':
      return await createList(auth.boardId, body)
    case 'update_list':
      return await updateList(auth.boardId, body)
    default:
      return badRequest(
        `unknown action "${String(body.action)}", expected one of: create_card, update_card, create_list, update_list`,
      )
  }
}

export default { fetch: withCors(handler) }
