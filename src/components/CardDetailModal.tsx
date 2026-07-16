import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { sanitizeFileName } from '../lib/storage'
import { isImageAttachment } from '../lib/attachments'
import { linkifyText } from '../lib/linkify'
import { syncCardDatesToGoogle } from '../lib/googleCalendar'
import { fromDatetimeLocalValue, toAllDayNoonUtc, toDatetimeLocalValue } from '../lib/cardDates'
import { useAuth } from '../contexts/AuthContext'
import type {
  Attachment,
  Card,
  Checklist,
  ChecklistItem,
  ChecklistWithItems,
  Comment,
  CommentWithAuthor,
  Label,
} from '../types'

const ATTACHMENTS_BUCKET = 'card-attachments'

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface CardDetailModalProps {
  card: Card
  boardLabels: Label[]
  assignedLabelIds: string[]
  boardOwnerId: string
  onClose: (cardId: string) => void
  onUpdate: (cardId: string, updates: Partial<Pick<Card, 'title' | 'description' | 'start_date' | 'end_date' | 'complete'>>) => void
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
  const [startDate, setStartDate] = useState(card.start_date)
  const [endDate, setEndDate] = useState(card.end_date)
  const [editingDescription, setEditingDescription] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const [checklists, setChecklists] = useState<ChecklistWithItems[]>([])
  const [checklistsLoading, setChecklistsLoading] = useState(true)
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [newItemDrafts, setNewItemDrafts] = useState<Record<string, string>>({})

  const [comments, setComments] = useState<CommentWithAuthor[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(true)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [coverAttachmentId, setCoverAttachmentId] = useState(card.cover_attachment_id)
  const [newLinkName, setNewLinkName] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [imageThumbnails, setImageThumbnails] = useState<Record<string, string>>({})

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

    async function loadAttachments() {
      setAttachmentsLoading(true)
      const { data, error: attachmentsError } = await supabase
        .from('attachments')
        .select('*')
        .eq('card_id', card.id)
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (attachmentsError) {
        setModalError(attachmentsError.message)
        setAttachmentsLoading(false)
        return
      }
      setAttachments((data ?? []) as Attachment[])
      setAttachmentsLoading(false)
    }

    void loadChecklists()
    void loadComments()
    void loadAttachments()
    return () => {
      cancelled = true
    }
  }, [card.id])

  useEffect(() => {
    const imageAttachments = attachments.filter(
      (a): a is Attachment & { storage_path: string } => isImageAttachment(a),
    )
    if (imageAttachments.length === 0) return
    let cancelled = false

    async function loadThumbnails() {
      const { data, error: signedUrlsError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrls(
          imageAttachments.map((a) => a.storage_path),
          3600,
        )
      if (cancelled || signedUrlsError || !data) return

      const byPath = new Map(data.map((d) => [d.path, d.signedUrl]))
      const next: Record<string, string> = {}
      for (const a of imageAttachments) {
        const url = byPath.get(a.storage_path)
        if (url) next[a.id] = url
      }
      setImageThumbnails((prev) => ({ ...prev, ...next }))
    }

    void loadThumbnails()
    return () => {
      cancelled = true
    }
  }, [attachments])

  function commitTitle() {
    const trimmed = title.trim()
    if (trimmed && trimmed !== card.title) {
      onUpdate(card.id, { title: trimmed })
    } else {
      setTitle(card.title)
    }
  }

  function handleStartDateChange(value: string) {
    if (!value) {
      // Clearing the start clears the whole date -- there's no such thing
      // as an end time with no start.
      setStartDate(null)
      setEndDate(null)
      onUpdate(card.id, { start_date: null, end_date: null })
      void syncCardDatesToGoogle(card.id)
      return
    }
    // Always the exact instant the user picked -- NOT conditional on
    // whether `endDate` happens to be set yet. Inicio is filled in before
    // Fin in the UI, so branching on endDate here silently clamped a
    // freshly-created meeting's start time to noon UTC (discarding the
    // real time) every time, since endDate was still null at that point.
    // "All-day, no end time" is represented entirely by end_date being
    // null; start_date itself is never lossy.
    const next = fromDatetimeLocalValue(value)
    setStartDate(next)
    onUpdate(card.id, { start_date: next })
    void syncCardDatesToGoogle(card.id)
  }

  function handleEndDateChange(value: string) {
    if (!value) {
      // Clearing the end reverts to all-day/deadline mode -- re-stamp the
      // start to noon UTC so it doesn't keep whatever specific time it had
      // as a meeting, matching the "(all-day)" display used everywhere else.
      const revertedStart = startDate ? toAllDayNoonUtc(toDatetimeLocalValue(startDate)) : null
      setEndDate(null)
      setStartDate(revertedStart)
      onUpdate(card.id, { start_date: revertedStart, end_date: null })
      void syncCardDatesToGoogle(card.id)
      return
    }
    const next = fromDatetimeLocalValue(value)
    setEndDate(next)
    onUpdate(card.id, { end_date: next })
    void syncCardDatesToGoogle(card.id)
  }

  function commitDescription() {
    setEditingDescription(false)
    const current = card.description ?? ''
    if (description !== current) {
      onUpdate(card.id, { description: description.trim() ? description : null })
    }
  }

  function handleDelete() {
    onDelete(card.id)
    onClose(card.id)
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

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return

    setUploadingFile(true)
    const path = `${card.id}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`

    const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file)
    if (uploadError) {
      setModalError(uploadError.message)
      setUploadingFile(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('attachments')
      .insert({
        card_id: card.id,
        user_id: user.id,
        file_name: file.name,
        file_type: file.type || null,
        storage_path: path,
        size: file.size,
      })
      .select()
      .single()

    if (insertError) {
      setModalError(insertError.message)
      setUploadingFile(false)
      return
    }
    setAttachments((prev) => [...prev, data as Attachment])
    setUploadingFile(false)
  }

  async function handleAddLink(e: FormEvent) {
    e.preventDefault()
    const rawUrl = newLinkUrl.trim()
    if (!rawUrl || !user) return
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const fileName = newLinkName.trim() || rawUrl

    const { data, error: insertError } = await supabase
      .from('attachments')
      .insert({ card_id: card.id, user_id: user.id, file_name: fileName, url })
      .select()
      .single()

    if (insertError) {
      setModalError(insertError.message)
      return
    }
    setAttachments((prev) => [...prev, data as Attachment])
    setNewLinkName('')
    setNewLinkUrl('')
  }

  async function handleOpenFileAttachment(storagePath: string) {
    const { data, error: signedUrlError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(storagePath, 60)
    if (signedUrlError) {
      setModalError(signedUrlError.message)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  async function handleDeleteAttachment(attachment: Attachment) {
    if (!window.confirm('¿Eliminar este archivo adjunto?')) return
    if (attachment.storage_path) {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([attachment.storage_path])
    }
    const { error: deleteError } = await supabase.from('attachments').delete().eq('id', attachment.id)
    if (deleteError) {
      setModalError(deleteError.message)
      return
    }
    setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
    // Mirrors the DB's `on delete set null` on cards.cover_attachment_id.
    if (coverAttachmentId === attachment.id) setCoverAttachmentId(null)
  }

  async function handleSetCover(attachmentId: string | null) {
    const { error: updateError } = await supabase
      .from('cards')
      .update({ cover_attachment_id: attachmentId })
      .eq('id', card.id)
    if (updateError) {
      setModalError(updateError.message)
      return
    }
    setCoverAttachmentId(attachmentId)
  }

  function canDeleteAttachment(attachment: Attachment): boolean {
    if (!user) return false
    return attachment.user_id === user.id || user.id === boardOwnerId
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6"
      onClick={() => onClose(card.id)}
    >
      <div
        className="mt-10 w-full max-w-lg rounded-2xl bg-surface p-6 shadow-elevated"
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
            className="w-full rounded-lg border border-transparent px-2 py-1 text-lg font-semibold text-slate-900 transition-colors hover:border-border-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => onClose(card.id)}
            className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {modalError && (
          <p className="mb-3 rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{modalError}</p>
        )}

        <div className="mb-4 flex flex-col gap-2 text-sm">
          <span className="text-slate-500">
            Creada: {new Date(card.created_at).toLocaleString()}
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <label htmlFor="card-start-date" className="flex items-center gap-2 text-slate-700">
              <span className="font-medium">Inicio:</span>
              <input
                id="card-start-date"
                type="datetime-local"
                value={toDatetimeLocalValue(startDate)}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="rounded-lg border border-border-subtle px-2 py-1 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {startDate && (
                <button
                  type="button"
                  onClick={() => handleStartDateChange('')}
                  className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-danger"
                >
                  Quitar
                </button>
              )}
            </label>
            <label htmlFor="card-end-date" className="flex items-center gap-2 text-slate-700">
              <span className="font-medium">Fin:</span>
              <input
                id="card-end-date"
                type="datetime-local"
                value={toDatetimeLocalValue(endDate)}
                onChange={(e) => handleEndDateChange(e.target.value)}
                disabled={!startDate}
                className="rounded-lg border border-border-subtle px-2 py-1 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100 disabled:text-slate-400"
              />
              {endDate && (
                <button
                  type="button"
                  onClick={() => handleEndDateChange('')}
                  className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-danger"
                >
                  Quitar
                </button>
              )}
            </label>
          </div>
          {startDate && !endDate && (
            <span className="text-xs text-slate-400">
              Sin hora de fin: se trata como una fecha límite de todo el día.
            </span>
          )}
        </div>

        <label
          htmlFor="card-description"
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Descripción
        </label>
        {editingDescription ? (
          <textarea
            id="card-description"
            autoFocus
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
            placeholder="Agrega una descripción más detallada…"
            className="mb-4 w-full resize-y rounded-lg border border-primary px-2 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        ) : (
          <div
            onClick={() => setEditingDescription(true)}
            className="mb-4 min-h-[3rem] w-full cursor-text whitespace-pre-wrap rounded-lg border border-transparent px-2 py-2 text-sm transition-colors hover:border-border-subtle hover:bg-slate-50"
          >
            {description.trim() ? (
              <span className="text-slate-800">{linkifyText(description)}</span>
            ) : (
              <span className="text-slate-400">Agrega una descripción más detallada…</span>
            )}
          </div>
        )}

        {/* Labels */}
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Etiquetas</h3>
          {boardLabels.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay etiquetas en este tablero.</p>
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Listas de verificación</h3>
          {checklistsLoading ? (
            <p className="text-sm text-slate-500">Cargando listas de verificación…</p>
          ) : (
            <div className="flex flex-col gap-3">
              {checklists.map((checklist) => {
                const total = checklist.items.length
                const completed = checklist.items.filter((i) => i.is_complete).length
                const progress = total > 0 ? Math.round((completed / total) * 100) : 0
                const draft = newItemDrafts[checklist.id] ?? ''
                return (
                  <div key={checklist.id} className="rounded-lg border border-border-subtle p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{checklist.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {completed}/{total}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteChecklist(checklist.id)}
                          className="cursor-pointer rounded-lg px-1.5 py-0.5 text-xs text-slate-400 transition-colors hover:bg-danger-light hover:text-danger"
                          aria-label={`Eliminar lista de verificación ${checklist.title}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-success"
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
                              item.is_complete ? 'text-slate-400 line-through' : 'text-slate-800'
                            }`}
                          >
                            {item.text}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDeleteItem(checklist.id, item.id)}
                            className="cursor-pointer rounded-lg px-1 text-xs text-slate-400 transition-colors hover:bg-danger-light hover:text-danger"
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
                        className="flex-1 rounded-lg border border-border-subtle px-2 py-1 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <button
                        type="submit"
                        disabled={!draft.trim()}
                        className="cursor-pointer rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="flex-1 rounded-lg border border-border-subtle px-2 py-1.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
                >
                  Agregar lista de verificación
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Attachments */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Archivos adjuntos</h3>
          {attachmentsLoading ? (
            <p className="text-sm text-slate-500">Cargando archivos adjuntos…</p>
          ) : (
            <div className="mb-2 flex flex-col gap-2">
              {attachments.length === 0 && (
                <p className="text-sm text-slate-500">Aún no hay archivos adjuntos.</p>
              )}
              {attachments.map((attachment) => {
                const showImage = isImageAttachment(attachment) && imageThumbnails[attachment.id]
                const nameAndMeta = (
                  <div className="min-w-0 flex-1">
                    {attachment.url ? (
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-medium text-primary hover:underline"
                      >
                        {attachment.file_name}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          attachment.storage_path && void handleOpenFileAttachment(attachment.storage_path)
                        }
                        className="block truncate text-left text-sm font-medium text-primary hover:underline"
                      >
                        {attachment.file_name}
                      </button>
                    )}
                    {!attachment.url && (
                      <span className="text-xs text-slate-500">
                        {attachment.file_type ?? 'archivo'}
                        {attachment.size !== null ? ` · ${formatFileSize(attachment.size)}` : ''}
                      </span>
                    )}
                  </div>
                )
                const deleteButton = canDeleteAttachment(attachment) && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteAttachment(attachment)}
                    className="shrink-0 cursor-pointer rounded-lg px-1 text-xs text-slate-400 transition-colors hover:bg-danger-light hover:text-danger"
                    aria-label={`Eliminar archivo adjunto ${attachment.file_name}`}
                  >
                    ✕
                  </button>
                )

                if (showImage) {
                  return (
                    <div key={attachment.id} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
                      <button
                        type="button"
                        onClick={() =>
                          attachment.storage_path && void handleOpenFileAttachment(attachment.storage_path)
                        }
                      >
                        <img
                          src={imageThumbnails[attachment.id]}
                          alt={attachment.file_name}
                          className="max-h-96 w-full rounded-lg border border-border-subtle object-contain"
                        />
                      </button>
                      <div className="flex items-center justify-between gap-2">
                        {nameAndMeta}
                        <div className="flex shrink-0 items-center gap-2">
                          {coverAttachmentId === attachment.id ? (
                            <span className="flex items-center gap-1 rounded-lg bg-primary-light px-1.5 py-0.5 text-xs font-medium text-primary">
                              Portada actual
                              <button
                                type="button"
                                onClick={() => void handleSetCover(null)}
                                className="text-primary hover:text-primary"
                                aria-label="Quitar portada"
                              >
                                ✕
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleSetCover(attachment.id)}
                              className="cursor-pointer rounded-lg px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:bg-slate-200"
                            >
                              Usar como portada
                            </button>
                          )}
                          {deleteButton}
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2"
                  >
                    {nameAndMeta}
                    {deleteButton}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor="new-attachment-file"
                className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
              >
                Subir archivo
              </label>
              <input
                id="new-attachment-file"
                type="file"
                onChange={(e) => void handleFileSelected(e)}
                disabled={uploadingFile}
                className="sr-only"
              />
              {uploadingFile && <span className="text-xs text-slate-500">Subiendo…</span>}
            </div>

            <form onSubmit={handleAddLink} className="flex gap-2">
              <label htmlFor="new-attachment-name" className="sr-only">
                Nombre del enlace (opcional)
              </label>
              <input
                id="new-attachment-name"
                type="text"
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                placeholder="Nombre (opcional)"
                className="w-32 rounded-lg border border-border-subtle px-2 py-1.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <label htmlFor="new-attachment-url" className="sr-only">
                URL del enlace
              </label>
              <input
                id="new-attachment-url"
                type="text"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="Pega un enlace…"
                className="flex-1 rounded-lg border border-border-subtle px-2 py-1.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                disabled={!newLinkUrl.trim()}
                className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Agregar enlace
              </button>
            </form>
          </div>
        </div>

        {/* Comments */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Comentarios</h3>
          {commentsLoading ? (
            <p className="text-sm text-slate-500">Cargando comentarios…</p>
          ) : (
            <div className="mb-2 flex flex-col gap-2">
              {comments.length === 0 && <p className="text-sm text-slate-500">Aún no hay comentarios.</p>}
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-lg bg-slate-50 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      {comment.profiles?.username ?? '(usuario desconocido)'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                      {canDeleteComment(comment) && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteComment(comment.id)}
                          className="cursor-pointer rounded-lg px-1 text-xs text-slate-400 transition-colors hover:bg-danger-light hover:text-danger"
                          aria-label="Eliminar comentario"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{linkifyText(comment.body)}</p>
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
              className="w-full resize-y rounded-lg border border-border-subtle px-2 py-1.5 text-sm text-slate-800 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="submit"
              disabled={!newComment.trim()}
              className="self-start cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Comentar
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={handleDelete}
          className="cursor-pointer rounded-lg bg-danger-light px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger hover:text-white"
        >
          Eliminar tarjeta
        </button>
      </div>
    </div>
  )
}
