import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Board, Card, List, ListWithCards } from '../types'
import { ListColumn } from '../components/ListColumn'

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const [board, setBoard] = useState<Board | null>(null)
  const [lists, setLists] = useState<ListWithCards[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)

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
        setError(boardError?.message ?? 'Board not found')
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

      const merged: ListWithCards[] = typedLists.map((list) => ({
        ...list,
        cards: cardsData.filter((card) => card.list_id === list.id),
      }))

      const typedBoard = boardData as Board
      setBoard(typedBoard)
      setNameDraft(typedBoard.name)
      setLists(merged)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [boardId])

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
    if (!window.confirm('Delete this list and all its cards?')) return
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

  async function handleDeleteCard(cardId: string) {
    if (!window.confirm('Delete this card?')) return
    const { error: deleteError } = await supabase.from('cards').delete().eq('id', cardId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setLists((prev) => prev.map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== cardId) })))
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading board…
      </div>
    )
  }

  if (!board) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-gray-700">
        <p>{error ?? 'Board not found'}</p>
        <Link to="/" className="text-blue-600 underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: board.background_color }}>
      <header className="flex items-center justify-between gap-4 bg-black/20 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm font-medium text-white/80 hover:text-white">
            ← Boards
          </Link>
          {editingName ? (
            <>
              <label htmlFor="board-name" className="sr-only">
                Board name
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
              className="cursor-text rounded px-2 py-1 text-lg font-bold text-white hover:bg-white/10"
              onClick={() => setEditingName(true)}
            >
              {board.name}
            </h1>
          )}
        </div>
      </header>

      {error && <p className="bg-red-100 px-6 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-1 items-start gap-4 overflow-x-auto p-4">
        {lists.map((list) => (
          <ListColumn
            key={list.id}
            list={list}
            onRename={handleRenameList}
            onDelete={(listId) => void handleDeleteList(listId)}
            onAddCard={(listId, title) => void handleAddCard(listId, title)}
            onUpdateCard={(cardId, updates) => void handleUpdateCard(cardId, updates)}
            onDeleteCard={(cardId) => void handleDeleteCard(cardId)}
          />
        ))}

        <form
          onSubmit={handleCreateList}
          className="flex w-72 flex-shrink-0 flex-col gap-2 rounded-lg bg-black/20 p-3"
        >
          <label htmlFor="new-list-name" className="sr-only">
            New list name
          </label>
          <input
            id="new-list-name"
            type="text"
            placeholder="Add a list"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            className="rounded border border-transparent bg-white/95 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creatingList || !newListName.trim()}
            className="self-start rounded bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-white disabled:opacity-50"
          >
            Add list
          </button>
        </form>
      </div>
    </div>
  )
}
