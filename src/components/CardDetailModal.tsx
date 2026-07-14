import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import type {
  Card,
  Checklist,
  ChecklistItem,
  ChecklistWithItems,
  Comment,
  CommentWithAuthor,
  Label,
} from '../types'

interface CardDetailModalProps {
  card: Card
  boardLabels: Label[]
  assignedLabelIds: string[]
  boardOwnerId: string
  onClose: () => void
  onUpdate: (cardId: string, updates: Partial<Pick<Card, 'title' | 'description'>>) => void
  onDelete: (cardId: string) => void
  onToggleLabel: (cardId: string, labelId: string, assign: boolean) => void
}

export function CardDetailModal({
  card,
  boardLabels,
  assignedLabelIds,
  boardOwnerId,
  onClose,
  onUpdate,
  onDelete,
  onToggleLabel,
}: CardDetailModalProps) {
  const { user } = useAuth()
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description ?? '')
  const [modalError, setModalError] = useState<string | null>(null)

  const [checklists, setChecklists] = useState<ChecklistWithItems[]>([])
  const [checklistsLoading, setChecklistsLoading] = useState(true)
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [newItemDrafts, setNewItemDrafts] = useState<Record<string, string>>({})

  const [comments, setComments] = useState<CommentWithAuthor[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadChecklists() {
      setChecklistsLoading(true)
      const { data: checklistData, error: checklistError } = await supabase
        .from('checklists')
        .select('*')
        .eq('card_id', card.id)
        .order('position', { ascending: true })

      if (cancelled) return
      if (checklistError) {
        setModalError(checklistError.message)
        setChecklistsLoading(false)
        return
      }

      const typedChecklists = (checklistData ?? []) as Checklist[]
      const checklistIds = typedChecklists.map((c) => c.id)
      let items: ChecklistItem[] = []

      if (checklistIds.length > 0) {
        const { data: itemData, error: itemError } = await supabase
          .from('checklist_items')
          .select('*')
          .in('checklist_id', checklistIds)
          .order('position', { ascending: true })

        if (cancelled) return
        if (itemError) {
          setModalError(itemError.message)
          setChecklistsLoading(false)
          return
        }
        items = (itemData ?? []) as ChecklistItem[]
      }

      setChecklists(
        typedChecklists.map((c) => ({ ...c, items: items.filter((i) => i.checklist_id === c.id) })),
      )
      setChecklistsLoading(false)
    }

    async function loadComments() {
      setCommentsLoading(true)
      const { data, error: commentsError } = await supabase
        .from('comments')
        .select('*, profiles(username)')
        .eq('card_id', card.id)
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (commentsError) {
        setModalError(commentsError.message)
        setCommentsLoading(false)
        return
      }
      setComments((data ?? []) as CommentWithAuthor[])
      setCommentsLoading(false)
    }

    void loadChecklists()
    void loadComments()
    return () => {
      cancelled = true
    }
  }, [card.id])

  function commitTitle() {
    const trimmed = title.trim()
    if (trimmed && trimmed !== card.title) {
      onUpdate(card.id, { title: trimmed })
    } else {
      setTitle(card.title)
    }
  }

  function commitDescription() {
    const current = card.description ?? ''
    if (description !== current) {
      onUpdate(card.id, { description: description.trim() ? description : null })
    }
  }

  function handleDelete() {
    onDelete(card.id)
    onClose()
  }

  function handleLabelToggle(labelId: string) {
    const assigned = assignedLabelIds.includes(labelId)
    onToggleLabel(card.id, labelId, !assigned)
  }

  async function handleAddChecklist(e: FormEvent) {
    e.preventDefault()
    const checklistTitle = newChecklistTitle.trim() || 'Checklist'
    const maxPosition = checklists.reduce((max, c) => Math.max(max, c.position), 0)

    const { data, error: insertError } = await supabase
      .from('checklists')
      .insert({
        card_id: card.id,
        title: checklistTitle,
        position: checklists.length > 0 ? maxPosition + 1 : 1,
      })
      .select()
      .single()

    if (insertError) {
      setModalError(insertError.message)
      return
    }
    const newChecklist = data as Checklist
    setChecklists((prev) => [...prev, { ...newChecklist, items: [] }])
    setNewChecklistTitle('')
  }

  async function handleDeleteChecklist(checklistId: string) {
    if (!window.confirm('¿Eliminar esta lista de verificación?')) return
    const { error: deleteError } = await supabase.from('checklists').delete().eq('id', checklistId)
    if (deleteError) {
      setModalError(deleteError.message)
      return
    }
    setChecklists((prev) => prev.filter((c) => c.id !== checklistId))
  }

  async function handleAddItem(checklistId: string) {
    const text = (newItemDrafts[checklistId] ?? '').trim()
    if (!text) return
    const checklist = checklists.find((c) => c.id === checklistId)
    if (!checklist) return
    const maxPosition = checklist.items.reduce((max, i) => Math.max(max, i.position), 0)

    const { data, error: insertError } = await supabase
      .from('checklist_items')
      .insert({
        checklist_id: checklistId,
        text,
        position: checklist.items.length > 0 ? maxPosition + 1 : 1,
      })
      .select()
      .single()

    if (insertError) {
      setModalError(insertError.message)
      return
    }
    const newItem = data as ChecklistItem
    setChecklists((prev) =>
      prev.map((c) => (c.id === checklistId ? { ...c, items: [...c.items, newItem] } : c)),
    )
    setNewItemDrafts((prev) => ({ ...prev, [checklistId]: '' }))
  }

  async function handleToggleItem(checklistId: string, itemId: string, isComplete: boolean) {
    const { error: updateError } = await supabase
      .from('checklist_items')
      .update({ is_complete: isComplete })
      .eq('id', itemId)
    if (updateError) {
      setModalError(updateError.message)
      return
    }
    setChecklists((prev) =>
      prev.map((c) =>
        c.id === checklistId
          ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, is_complete: isComplete } : i)) }
          : c,
      ),
    )
  }

  async function handleDeleteItem(checklistId: string, itemId: string) {
    const { error: deleteError } = await supabase.from('checklist_items').delete().eq('id', itemId)
    if (deleteError) {
      setModalError(deleteError.message)
      return
    }
    setChecklists((prev) =>
      prev.map((c) => (c.id === checklistId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c)),
    )
  }

  async function handleAddComment(e: FormEvent) {
    e.preventDefault()
    const body = newComment.trim()
    if (!body || !user) return

    const { data, error: insertError } = await supabase
      .from('comments')
      .insert({ card_id: card.id, author_id: user.id, body })
      .select('*, profiles(username)')
      .single()

    if (insertError) {
      setModalError(insertError.message)
      return
    }
    setComments((prev) => [...prev, data as CommentWithAuthor])
    setNewComment('')
  }

  async function handleDeleteComment(commentId: string) {
    if (!window.confirm('¿Eliminar este comentario?')) return
    const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId)
    if (deleteError) {
      setModalError(deleteError.message)
      return
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  function canDeleteComment(comment: Comment): boolean {
    if (!user) return false
    return comment.author_id === user.id || user.id === boardOwnerId
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <label htmlFor="card-title" className="sr-only">
            Título de la tarjeta
          </label>
          <input
            id="card-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-full rounded border border-transparent px-2 py-1 text-lg font-semibold text-gray-900 hover:border-gray-200 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {modalError && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>
        )}

        <label
          htmlFor="card-description"
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          Descripción
        </label>
        <textarea
          id="card-description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          placeholder="Agrega una descripción más detallada…"
          className="mb-4 w-full resize-y rounded border border-gray-300 px-2 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
        />

        {/* Labels */}
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Etiquetas</h3>
          {boardLabels.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay etiquetas en este tablero.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {boardLabels.map((label) => {
                const assigned = assignedLabelIds.includes(label.id)
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => handleLabelToggle(label.id)}
                    className={`rounded px-2 py-1 text-xs font-medium text-white ${
                      assigned ? '' : 'opacity-40 hover:opacity-70'
                    }`}
                    style={{ backgroundColor: label.color }}
                    aria-pressed={assigned}
                  >
                    {label.name || '(sin nombre)'}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Checklists */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Listas de verificación</h3>
          {checklistsLoading ? (
            <p className="text-sm text-gray-500">Cargando listas de verificación…</p>
          ) : (
            <div className="flex flex-col gap-3">
              {checklists.map((checklist) => {
                const total = checklist.items.length
                const completed = checklist.items.filter((i) => i.is_complete).length
                const progress = total > 0 ? Math.round((completed / total) * 100) : 0
                const draft = newItemDrafts[checklist.id] ?? ''
                return (
                  <div key={checklist.id} className="rounded border border-gray-200 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-800">{checklist.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {completed}/{total}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteChecklist(checklist.id)}
                          className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-700"
                          aria-label={`Eliminar lista de verificación ${checklist.title}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full rounded-full bg-green-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                    <ul className="mb-2 flex flex-col gap-1">
                      {checklist.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={item.is_complete}
                            onChange={(e) => void handleToggleItem(checklist.id, item.id, e.target.checked)}
                            aria-label={item.text}
                          />
                          <span
                            className={`flex-1 text-sm ${
                              item.is_complete ? 'text-gray-400 line-through' : 'text-gray-800'
                            }`}
                          >
                            {item.text}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDeleteItem(checklist.id, item.id)}
                            className="rounded px-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Eliminar elemento ${item.text}`}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        void handleAddItem(checklist.id)
                      }}
                      className="flex gap-2"
                    >
                      <label htmlFor={`item-${checklist.id}`} className="sr-only">
                        Nuevo elemento de la lista
                      </label>
                      <input
                        id={`item-${checklist.id}`}
                        type="text"
                        value={draft}
                        onChange={(e) =>
                          setNewItemDrafts((prev) => ({ ...prev, [checklist.id]: e.target.value }))
                        }
                        placeholder="Agregar un elemento"
                        className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!draft.trim()}
                        className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                      >
                        Agregar
                      </button>
                    </form>
                  </div>
                )
              })}

              <form onSubmit={handleAddChecklist} className="flex gap-2">
                <label htmlFor="new-checklist-title" className="sr-only">
                  Título de la nueva lista de verificación
                </label>
                <input
                  id="new-checklist-title"
                  type="text"
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  placeholder="Lista de verificación"
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Agregar lista de verificación
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Comentarios</h3>
          {commentsLoading ? (
            <p className="text-sm text-gray-500">Cargando comentarios…</p>
          ) : (
            <div className="mb-2 flex flex-col gap-2">
              {comments.length === 0 && <p className="text-sm text-gray-500">Aún no hay comentarios.</p>}
              {comments.map((comment) => (
                <div key={comment.id} className="rounded bg-gray-50 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-700">
                      {comment.profiles?.username ?? '(usuario desconocido)'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                      {canDeleteComment(comment) && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteComment(comment.id)}
                          className="rounded px-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-700"
                          aria-label="Eliminar comentario"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{comment.body}</p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddComment} className="flex flex-col gap-2">
            <label htmlFor="new-comment" className="sr-only">
              Agregar un comentario
            </label>
            <textarea
              id="new-comment"
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escribe un comentario…"
              className="w-full resize-y rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newComment.trim()}
              className="self-start rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Comentar
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={handleDelete}
          className="rounded bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Eliminar tarjeta
        </button>
      </div>
    </div>
  )
}
