// T108: read side of the external REST pull/push API. Board-scoped via an
// API key (T104's authenticateApiKey), not a Supabase session -- see
// _shared/apiKeyAuth.ts for why. Mirrors calendar-feed's shape: public,
// manually-authenticated, wrapped in withCors, verify_jwt = false in
// config.toml.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { withCors } from '../_shared/google.ts'
import { authenticateApiKey } from '../_shared/apiKeyAuth.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type ResourceType = 'boards' | 'lists' | 'cards'
const VALID_TYPES: ReadonlySet<string> = new Set(['boards', 'lists', 'cards'])

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') {
    return Response.json({ error: 'method not allowed, use GET' }, { status: 405 })
  }

  const auth = await authenticateApiKey(req, supabaseAdmin)
  if (auth instanceof Response) return auth
  const { boardId } = auth

  const typeParam = new URL(req.url).searchParams.get('type')
  if (typeParam !== null && !VALID_TYPES.has(typeParam)) {
    return Response.json({ error: 'invalid type, expected one of: boards, lists, cards' }, { status: 400 })
  }
  const type = typeParam as ResourceType | null
  const includeBoard = type === null || type === 'boards'
  const includeLists = type === null || type === 'lists'
  const includeCards = type === null || type === 'cards'

  const result: Record<string, unknown> = {}

  if (includeBoard) {
    const { data: board, error } = await supabaseAdmin
      .from('boards')
      .select('id, name, background_color, background_image_path, created_at, updated_at')
      .eq('id', boardId)
      .maybeSingle()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    result.board = board
  }

  // Cards are scoped through their list's board_id, so lists must be fetched
  // whenever cards are requested even if the caller didn't ask for `lists`
  // itself (type=cards) -- just not included in the response in that case.
  let listIds: string[] = []
  let listsRows: unknown[] = []
  if (includeLists || includeCards) {
    const { data, error } = await supabaseAdmin
      .from('lists')
      .select('id, board_id, name, position, created_at')
      .eq('board_id', boardId)
      .order('position', { ascending: true })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    listsRows = data ?? []
    listIds = listsRows.map((l) => (l as { id: string }).id)
  }
  if (includeLists) result.lists = listsRows

  if (includeCards) {
    let cardsRows: unknown[] = []
    if (listIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('cards')
        .select(
          'id, list_id, title, description, position, start_date, end_date, complete, location_data, cover_attachment_id, created_at, updated_at',
        )
        .in('list_id', listIds)
        .order('position', { ascending: true })
      if (error) return Response.json({ error: error.message }, { status: 500 })
      cardsRows = data ?? []
    }
    result.cards = cardsRows
  }

  return Response.json(result)
}

export default { fetch: withCors(handler) }
