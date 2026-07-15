import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { supabase } from '../lib/supabaseClient'
import { isImageAttachment } from '../lib/attachments'
import { useAuth } from '../contexts/AuthContext'
import type { Board, BoardRole, Card, Label, List, ListWithCards } from '../types'
import { ListColumn, ListOverlayPreview } from '../components/ListColumn'
import { CardOverlayPreview } from '../components/CardItem'
import { LabelsPanel } from '../components/LabelsPanel'
import { MembersPanel } from '../components/MembersPanel'
import { BackgroundPanel } from '../components/BackgroundPanel'
import { NotificationsBell } from '../components/NotificationsBell'

function computeFractionalPosition(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return 1
  if (prev === undefined) return next! - 1
  if (next === undefined) return prev + 1
  return (prev + next) / 2
}

interface CoverCandidate {
  id: string
  card_id: string
  storage_path: string | null
  file_type: string | null
  file_name: string
  created_at: string
}

/**
 * Card front cover image (T051): explicit `cover_attachment_id` if it's
 * still a valid image attachment on that card, else the most recently added
 * image attachment, else no cover. One batched `createSignedUrls()` call
 * for however many cards need one, matching the existing pattern for
 * attachment thumbnails inside CardDetailModal.
 */
async function computeCardCoverUrls(
  cardIds: string[],
  coverAttachmentIdByCardId: Record<string, string | null>,
): Promise<Record<string, string>> {
  if (cardIds.length === 0) return {}

  const { data, error } = await supabase
    .from('attachments')
    .select('id, card_id, storage_path, file_type, file_name, created_at')
    .in('card_id', cardIds)
    .order('created_at', { ascending: false })
  if (error || !data) return {}

  const imagesByCard = new Map<string, CoverCandidate[]>()
  for (const img of (data as CoverCandidate[]).filter(isImageAttachment)) {
    imagesByCard.set(img.card_id, [...(imagesByCard.get(img.card_id) ?? []), img])
  }

  const chosenByCard = new Map<string, CoverCandidate>()
  for (const cardId of cardIds) {
    // Already ordered by created_at desc from the query above, so [0] is the most recent.
    const candidates = imagesByCard.get(cardId)
    if (!candidates || candidates.length === 0) continue
    const explicitId = coverAttachmentIdByCardId[cardId]
    const explicit = explicitId ? candidates.find((c) => c.id === explicitId) : undefined
    chosenByCard.set(cardId, explicit ?? candidates[0])
  }

  const paths = [...chosenByCard.values()]
    .map((c) => c.storage_path)
    .filter((p): p is string => Boolean(p))
  if (paths.length === 0) return {}

  const { data: signedUrls, error: signedError } = await supabase.storage
    .from('card-attachments')
    .createSignedUrls(paths, 3600)
  if (signedError || !signedUrls) return {}

  const urlByPath = new Map(signedUrls.map((s) => [s.path, s.signedUrl]))
  const result: Record<string, string> = {}
  for (const [cardId, chosen] of chosenByCard) {
    const url = chosen.storage_path ? urlByPath.get(chosen.storage_path) : undefined
    if (url) result[cardId] = url
  }
  return result
}

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [board, setBoard] = useState<Board | null>(null)
  const [lists, setLists] = useState<ListWithCards[]>([])
  const [boardLabels, setBoardLabels] = useState<Label[]>([])
  const [cardLabelIds, setCardLabelIds] = useState<Record<string, string[]>>({})
  const [currentRole, setCurrentRole] = useState<BoardRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  const [showLabelsPanel, setShowLabelsPanel] = useState(false)
  const [showMembersPanel, setShowMembersPanel] = useState(false)
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false)
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null)
  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [activeList, setActiveList] = useState<ListWithCards | null>(null)
  const [cardCoverUrls, setCardCoverUrls] = useState<Record<string, string>>({})

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const isOwner = currentRole === 'owner'

  const cardLabelsByCardId: Record<string, Label[]> = {}
  for (const [cardId, labelIds] of Object.entries(cardLabelIds)) {
    cardLabelsByCardId[cardId] = labelIds
      .map((labelId) => boardLabels.find((l) => l.id === labelId))
      .filter((l): l is Label => Boolean(l))
  }

  useEffect(() => {
    if (!boardId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data: boardData, error: boardError } = await supabase
        .from('boards')
        .select('*')
        .eq('id', boardId)
        .single()

      if (cancelled) return
      if (boardError || !boardData) {
        setError(boardError?.message ?? 'Tablero no encontrado')
        setLoading(false)
        return
      }

      const { data: listsData, error: listsError } = await supabase
        .from('lists')
        .select('*')
        .eq('board_id', boardId)
        .order('position', { ascending: true })

      if (cancelled) return
      if (listsError) {
        setError(listsError.message)
        setLoading(false)
        return
      }

      const typedLists = (listsData ?? []) as List[]
      const listIds = typedLists.map((l) => l.id)
      let cardsData: Card[] = []

      if (listIds.length > 0) {
        const { data, error: cardsError } = await supabase
          .from('cards')
          .select('*')
          .in('list_id', listIds)
          .order('position', { ascending: true })

        if (cancelled) return
        if (cardsError) {
          setError(cardsError.message)
          setLoading(false)
          return
        }
        cardsData = (data ?? []) as Card[]
      }

      const { data: labelsData, error: labelsError } = await supabase
        .from('labels')
        .select('*')
        .eq('board_id', boardId)
        .order('name', { ascending: true })

      if (cancelled) return
      if (labelsError) {
        setError(labelsError.message)
        setLoading(false)
        return
      }

      const cardLabelMap: Record<string, string[]> = {}
      if (cardsData.length > 0) {
        const { data: cardLabelRows, error: cardLabelsError } = await supabase
          .from('card_labels')
          .select('card_id, label_id')
          .in(
            'card_id',
            cardsData.map((c) => c.id),
          )

        if (cancelled) return
        if (cardLabelsError) {
          setError(cardLabelsError.message)
          setLoading(false)
          return
        }
        for (const row of (cardLabelRows ?? []) as { card_id: string; label_id: string }[]) {
          cardLabelMap[row.card_id] = [...(cardLabelMap[row.card_id] ?? []), row.label_id]
        }
      }

      const coverAttachmentIdByCardId: Record<string, string | null> = {}
      for (const c of cardsData) coverAttachmentIdByCardId[c.id] = c.cover_attachment_id
      const coverUrls = await computeCardCoverUrls(cardsData.map((c) => c.id), coverAttachmentIdByCardId)
      if (cancelled) return
      setCardCoverUrls(coverUrls)

      if (user) {
        const { data: memberRow, error: memberError } = await supabase
          .from('board_members')
          .select('role')
          .eq('board_id', boardId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (cancelled) return
        if (!memberError) {
          setCurrentRole((memberRow?.role as BoardRole) ?? null)
        }
      }

      const merged: ListWithCards[] = typedLists.map((list) => ({
        ...list,
        cards: cardsData.filter((card) => card.list_id === list.id),
      }))

      const typedBoard = boardData as Board
      setBoard(typedBoard)
      setNameDraft(typedBoard.name)
      setLists(merged)
      setBoardLabels((labelsData ?? []) as Label[])
      setCardLabelIds(cardLabelMap)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [boardId, user])

  useEffect(() => {
    const path = board?.background_image_path
    if (!path) {
      setBackgroundImageUrl(null)
      return
    }
    let cancelled = false

    async function loadSignedUrl() {
      const { data, error: signedUrlError } = await supabase.storage
        .from('board-backgrounds')
        .createSignedUrl(path!, 3600)

      if (cancelled) return
      if (signedUrlError || !data) {
        setBackgroundImageUrl(null)
        return
      }
      setBackgroundImageUrl(data.signedUrl)
    }

    void loadSignedUrl()
    return () => {
      cancelled = true
    }
  }, [board?.background_image_path])

  async function handleRenameBoard() {
    if (!board) return
    setEditingName(false)
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === board.name) {
      setNameDraft(board.name)
      return
    }
    const { error: updateError } = await supabase
      .from('boards')
      .update({ name: trimmed })
      .eq('id', board.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setBoard({ ...board, name: trimmed })
  }

  function handleBackgroundChange(
    updates: Partial<Pick<Board, 'background_color' | 'background_image_path'>>,
  ) {
    setBoard((prev) => (prev ? { ...prev, ...updates } : prev))
  }

  async function handleCreateList(e: FormEvent) {
    e.preventDefault()
    if (!boardId || !newListName.trim()) return
    setCreatingList(true)
    const maxPosition = lists.reduce((max, l) => Math.max(max, l.position), 0)

    const { data, error: insertError } = await supabase
      .from('lists')
      .insert({
        board_id: boardId,
        name: newListName.trim(),
        position: lists.length > 0 ? maxPosition + 1 : 1,
      })
      .select()
      .single()

    setCreatingList(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    const newList = data as List
    setLists((prev) => [...prev, { ...newList, cards: [] }])
    setNewListName('')
  }

  async function handleRenameList(listId: string, name: string) {
    const { error: updateError } = await supabase.from('lists').update({ name }).eq('id', listId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name } : l)))
  }

  async function handleDeleteList(listId: string) {
    if (!window.confirm('¿Eliminar esta lista y todas sus tarjetas?')) return
    const { error: deleteError } = await supabase.from('lists').delete().eq('id', listId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setLists((prev) => prev.filter((l) => l.id !== listId))
  }

  async function handleAddCard(listId: string, title: string) {
    const list = lists.find((l) => l.id === listId)
    if (!list) return
    const maxPosition = list.cards.reduce((max, c) => Math.max(max, c.position), 0)

    const { data, error: insertError } = await supabase
      .from('cards')
      .insert({
        list_id: listId,
        title,
        position: list.cards.length > 0 ? maxPosition + 1 : 1,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    const newCard = data as Card
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, cards: [...l.cards, newCard] } : l)),
    )
  }

  async function handleUpdateCard(
    cardId: string,
    updates: Partial<Pick<Card, 'title' | 'description'>>,
  ) {
    const { error: updateError } = await supabase.from('cards').update(updates).eq('id', cardId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        cards: l.cards.map((c) => (c.id === cardId ? { ...c, ...updates } : c)),
      })),
    )
  }

  /**
   * Re-derives one card's cover from scratch -- covers the "Make cover"
   * button changing cover_attachment_id and the case CardDetailModal itself
   * doesn't report explicitly: a new image was uploaded (or the current
   * cover deleted) with no explicit cover set, changing the default.
   * Called whenever that card's detail modal closes; cheap enough per-card
   * that a single uniform refresh beats threading a change reason through.
   */
  async function refreshCardCover(cardId: string) {
    const { data: cardRow, error: cardRowError } = await supabase
      .from('cards')
      .select('cover_attachment_id')
      .eq('id', cardId)
      .maybeSingle()
    // Falls back to "no explicit cover" (still resolves the most-recent-image
    // default below) rather than aborting outright on error -- a card that
    // was deleted mid-request, or a transient network blip, shouldn't hide
    // the default cover too.
    const explicitCoverId = !cardRowError && cardRow ? cardRow.cover_attachment_id : null

    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        cards: l.cards.map((c) => (c.id === cardId ? { ...c, cover_attachment_id: explicitCoverId } : c)),
      })),
    )

    const coverUrls = await computeCardCoverUrls([cardId], { [cardId]: explicitCoverId })
    setCardCoverUrls((prev) => {
      const next = { ...prev }
      if (coverUrls[cardId]) next[cardId] = coverUrls[cardId]
      else delete next[cardId]
      return next
    })
  }

  async function handleDeleteCard(cardId: string) {
    if (!window.confirm('¿Eliminar esta tarjeta?')) return
    const { error: deleteError } = await supabase.from('cards').delete().eq('id', cardId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setLists((prev) => prev.map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== cardId) })))
    setCardLabelIds((prev) => {
      const next = { ...prev }
      delete next[cardId]
      return next
    })
  }

  async function handleCreateLabel(name: string, color: string) {
    if (!boardId) return
    const { data, error: insertError } = await supabase
      .from('labels')
      .insert({ board_id: boardId, name, color })
      .select()
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setBoardLabels((prev) => [...prev, data as Label])
  }

  async function handleDeleteLabel(labelId: string) {
    if (!window.confirm('¿Eliminar esta etiqueta? Se quitará de todas las tarjetas.')) return
    const { error: deleteError } = await supabase.from('labels').delete().eq('id', labelId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setBoardLabels((prev) => prev.filter((l) => l.id !== labelId))
    setCardLabelIds((prev) => {
      const next: Record<string, string[]> = {}
      for (const [cardId, labelIds] of Object.entries(prev)) {
        next[cardId] = labelIds.filter((id) => id !== labelId)
      }
      return next
    })
  }

  async function handleToggleCardLabel(cardId: string, labelId: string, assign: boolean) {
    if (assign) {
      const { error: insertError } = await supabase
        .from('card_labels')
        .insert({ card_id: cardId, label_id: labelId })
      if (insertError) {
        setError(insertError.message)
        return
      }
      setCardLabelIds((prev) => ({ ...prev, [cardId]: [...(prev[cardId] ?? []), labelId] }))
    } else {
      const { error: deleteError } = await supabase
        .from('card_labels')
        .delete()
        .eq('card_id', cardId)
        .eq('label_id', labelId)
      if (deleteError) {
        setError(deleteError.message)
        return
      }
      setCardLabelIds((prev) => ({
        ...prev,
        [cardId]: (prev[cardId] ?? []).filter((id) => id !== labelId),
      }))
    }
  }

  function resolveListIdForOver(overId: string): string | null {
    if (lists.some((l) => l.id === overId)) return overId
    const containingList = lists.find((l) => l.cards.some((c) => c.id === overId))
    return containingList?.id ?? null
  }

  function resolveCardDropTarget(
    listsSnapshot: ListWithCards[],
    overId: string,
  ): { listId: string; index: number } | null {
    const asList = listsSnapshot.find((l) => l.id === overId)
    if (asList) return { listId: asList.id, index: asList.cards.length }
    for (const list of listsSnapshot) {
      const idx = list.cards.findIndex((c) => c.id === overId)
      if (idx !== -1) return { listId: list.id, index: idx }
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const activeType = active.data.current?.type as 'card' | 'list' | undefined
    const activeId = String(active.id)

    if (activeType === 'card') {
      const sourceList = lists.find((l) => l.cards.some((c) => c.id === activeId))
      setActiveCard(sourceList?.cards.find((c) => c.id === activeId) ?? null)
    } else if (activeType === 'list') {
      setActiveList(lists.find((l) => l.id === activeId) ?? null)
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeType = active.data.current?.type as 'card' | 'list' | undefined
    if (activeType !== 'card') return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    setLists((prev) => {
      const sourceListIdx = prev.findIndex((l) => l.cards.some((c) => c.id === activeId))
      if (sourceListIdx === -1) return prev

      const target = resolveCardDropTarget(prev, overId)
      if (!target) return prev
      const destListIdx = prev.findIndex((l) => l.id === target.listId)
      if (destListIdx === -1 || destListIdx === sourceListIdx) return prev

      const sourceList = prev[sourceListIdx]
      const movingCard = sourceList.cards.find((c) => c.id === activeId)
      if (!movingCard) return prev

      const destList = prev[destListIdx]
      const insertIndex = Math.min(target.index, destList.cards.length)
      const newDestCards = [...destList.cards]
      newDestCards.splice(insertIndex, 0, { ...movingCard, list_id: destList.id })

      return prev.map((l, idx) => {
        if (idx === sourceListIdx) return { ...l, cards: l.cards.filter((c) => c.id !== activeId) }
        if (idx === destListIdx) return { ...l, cards: newDestCards }
        return l
      })
    })
  }

  async function finalizeCardDrag(activeId: string, overId: string | null) {
    const listIdx = lists.findIndex((l) => l.cards.some((c) => c.id === activeId))
    if (listIdx === -1) return
    const currentList = lists[listIdx]
    let cards = currentList.cards

    if (overId && overId !== activeId) {
      const oldIndex = cards.findIndex((c) => c.id === activeId)
      const overIndex = cards.findIndex((c) => c.id === overId)
      if (oldIndex !== -1 && overIndex !== -1 && overIndex !== oldIndex) {
        cards = arrayMove(cards, oldIndex, overIndex)
      }
    }

    const movedIndex = cards.findIndex((c) => c.id === activeId)
    const prevCard = cards[movedIndex - 1]
    const nextCard = cards[movedIndex + 1]
    const newPosition = computeFractionalPosition(prevCard?.position, nextCard?.position)
    const updatedCards = cards.map((c) => (c.id === activeId ? { ...c, position: newPosition } : c))

    setLists((prev) => prev.map((l, idx) => (idx === listIdx ? { ...l, cards: updatedCards } : l)))

    const { error: updateError } = await supabase
      .from('cards')
      .update({ position: newPosition, list_id: currentList.id })
      .eq('id', activeId)
    if (updateError) setError(updateError.message)
  }

  async function handleListDragEnd(activeId: string, overId: string) {
    const destListId = resolveListIdForOver(overId)
    if (!destListId) return
    const oldIndex = lists.findIndex((l) => l.id === activeId)
    const newIndex = lists.findIndex((l) => l.id === destListId)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    const reordered = arrayMove(lists, oldIndex, newIndex)
    const movedIndex = reordered.findIndex((l) => l.id === activeId)
    const prevList = reordered[movedIndex - 1]
    const nextList = reordered[movedIndex + 1]
    const newPosition = computeFractionalPosition(prevList?.position, nextList?.position)

    setLists(reordered.map((l) => (l.id === activeId ? { ...l, position: newPosition } : l)))

    const { error: updateError } = await supabase
      .from('lists')
      .update({ position: newPosition })
      .eq('id', activeId)
    if (updateError) setError(updateError.message)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCard(null)
    setActiveList(null)

    const activeId = String(active.id)
    const overId = over ? String(over.id) : null
    const activeType = active.data.current?.type as 'card' | 'list' | undefined

    if (activeType === 'list') {
      if (!overId || activeId === overId) return
      void handleListDragEnd(activeId, overId)
    } else if (activeType === 'card') {
      void finalizeCardDrag(activeId, overId)
    }
  }

  function handleDragCancel() {
    setActiveCard(null)
    setActiveList(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Cargando tablero…
      </div>
    )
  }

  if (!board) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-gray-700">
        <p>{error ?? 'Tablero no encontrado'}</p>
        <Link to="/" className="text-blue-600 underline">
          Volver al panel
        </Link>
      </div>
    )
  }

  const backgroundStyle: CSSProperties = board.background_image_path
    ? {
        backgroundColor: board.background_color,
        backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundColor: board.background_color }

  return (
    <div className="flex min-h-screen flex-col" style={backgroundStyle}>
      <header className="flex items-center justify-between gap-4 bg-black/20 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm font-medium text-white/80 hover:text-white">
            ← Tableros
          </Link>
          {isOwner && editingName ? (
            <>
              <label htmlFor="board-name" className="sr-only">
                Nombre del tablero
              </label>
              <input
                id="board-name"
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void handleRenameBoard()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') {
                    setNameDraft(board.name)
                    setEditingName(false)
                  }
                }}
                className="rounded bg-white/90 px-2 py-1 text-lg font-bold text-gray-900"
              />
            </>
          ) : (
            <h1
              className={`rounded px-2 py-1 text-lg font-bold text-white ${
                isOwner ? 'cursor-text hover:bg-white/10' : ''
              }`}
              onClick={() => {
                if (isOwner) setEditingName(true)
              }}
            >
              {board.name}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLabelsPanel(true)}
            className="rounded bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
          >
            Etiquetas
          </button>
          <button
            type="button"
            onClick={() => setShowMembersPanel(true)}
            className="rounded bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
          >
            Miembros
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => setShowBackgroundPanel(true)}
              className="rounded bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Fondo
            </button>
          )}
          <NotificationsBell buttonClassName="relative rounded bg-white/10 px-2 py-1.5 text-sm font-medium text-white hover:bg-white/20" />
        </div>
      </header>

      {error && <p className="bg-red-100 px-6 py-2 text-sm text-red-700">{error}</p>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
          {/* relative: without it, no ancestor in this chain is positioned,
              so absolutely-positioned sr-only <label>s nested anywhere inside
              (this form's, or any ListColumn's own add-card label) resolve
              their containing block all the way up to the document root.
              Their static position reflects the full unclipped row width,
              which stretches document.documentElement's scrollWidth past the
              viewport -- scrolling the actual page (not just this container)
              that far reveals plain white body background past the board's
              edge. relative here makes this div the containing block instead,
              so nothing escapes its own overflow-x-auto clipping. */}
          <div className="relative flex flex-1 items-start gap-4 overflow-x-auto p-4">
            {lists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                boardLabels={boardLabels}
                cardLabelsByCardId={cardLabelsByCardId}
                cardCoverUrlByCardId={cardCoverUrls}
                boardOwnerId={board.owner_id}
                onRename={handleRenameList}
                onDelete={(listId) => void handleDeleteList(listId)}
                onAddCard={(listId, title) => void handleAddCard(listId, title)}
                onUpdateCard={(cardId, updates) => void handleUpdateCard(cardId, updates)}
                onDeleteCard={(cardId) => void handleDeleteCard(cardId)}
                onToggleLabel={(cardId, labelId, assign) =>
                  void handleToggleCardLabel(cardId, labelId, assign)
                }
                onCardModalClose={(cardId) => void refreshCardCover(cardId)}
              />
            ))}

            <form
              onSubmit={handleCreateList}
              className="flex w-72 flex-shrink-0 flex-col gap-2 rounded-lg bg-black/20 p-3"
            >
              <label htmlFor="new-list-name" className="sr-only">
                Nombre de la nueva lista
              </label>
              <input
                id="new-list-name"
                type="text"
                placeholder="Agregar una lista"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="rounded border border-transparent bg-white/95 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={creatingList || !newListName.trim()}
                className="self-start rounded bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-white disabled:opacity-50"
              >
                Agregar lista
              </button>
            </form>
          </div>
        </SortableContext>

        <DragOverlay>
          {activeCard ? (
            <CardOverlayPreview
              card={activeCard}
              labels={cardLabelsByCardId[activeCard.id] ?? []}
              coverUrl={cardCoverUrls[activeCard.id]}
            />
          ) : activeList ? (
            <ListOverlayPreview
              list={activeList}
              cardLabelsByCardId={cardLabelsByCardId}
              cardCoverUrlByCardId={cardCoverUrls}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {showLabelsPanel && (
        <LabelsPanel
          labels={boardLabels}
          onClose={() => setShowLabelsPanel(false)}
          onCreate={(name, color) => void handleCreateLabel(name, color)}
          onDelete={(labelId) => void handleDeleteLabel(labelId)}
        />
      )}

      {showMembersPanel && user && (
        <MembersPanel
          boardId={board.id}
          currentUserId={user.id}
          isOwner={isOwner}
          onClose={() => setShowMembersPanel(false)}
          onLeave={() => navigate('/')}
        />
      )}

      {showBackgroundPanel && isOwner && (
        <BackgroundPanel
          board={board}
          onClose={() => setShowBackgroundPanel(false)}
          onBackgroundChange={handleBackgroundChange}
        />
      )}
    </div>
  )
}
