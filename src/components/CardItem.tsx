import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Label } from '../types'
import { CardDetailModal } from './CardDetailModal'
import { formatCardDateRange } from '../lib/cardDates'

type CardUpdate = Partial<Pick<Card, 'title' | 'description' | 'start_date' | 'end_date' | 'complete' | 'location_data'>>

interface CardItemProps {
  card: Card
  listId: string
  labels: Label[]
  boardLabels: Label[]
  boardOwnerId: string
  coverUrl?: string
  onUpdate: (cardId: string, updates: CardUpdate) => void
  onDelete: (cardId: string) => void
  onToggleLabel: (cardId: string, labelId: string, assign: boolean) => void
  onCreateLabel: (name: string, color: string) => Promise<Label | null>
  onDeleteLabel: (labelId: string) => void
  onCardModalClose: (cardId: string) => void
}

export function CardFace({
  card,
  labels,
  coverUrl,
  onToggleComplete,
}: {
  card: Card
  labels: Label[]
  coverUrl?: string
  onToggleComplete?: (complete: boolean) => void
}) {
  return (
    <>
      {coverUrl && (
        // object-contain (not cover): the source image can be any aspect
        // ratio (tall screenshot, wide panorama, square icon...) and the
        // full picture must always be visible, never cropped. max-height
        // only bounds extreme outliers (a very tall image) so one card
        // doesn't dwarf its neighbors in the list -- it still never crops,
        // just scales the whole image down further within that cap.
        <img
          src={coverUrl}
          alt=""
          className="mb-1 max-h-48 w-full rounded-lg bg-slate-100 object-contain"
        />
      )}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              title={label.name}
              className="h-2 w-8 rounded-full"
              style={{ backgroundColor: label.color }}
            />
          ))}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className={card.complete ? 'text-slate-400 line-through' : 'text-slate-800'}>
          {card.title}
        </span>
        {onToggleComplete ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleComplete(!card.complete)
            }}
            aria-pressed={card.complete}
            aria-label={card.complete ? 'Marcar como no completada' : 'Marcar como completada'}
            title={card.complete ? 'Marcar como no completada' : 'Marcar como completada'}
            className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border text-xs leading-none transition-colors ${
              card.complete
                ? 'border-success bg-success text-white'
                : 'border-slate-300 bg-white hover:border-success'
            }`}
          >
            {/* Only rendered as a real text node when complete -- an empty,
                unchecked circle needs no glyph, and keeping "✓" out of the
                DOM otherwise stops it from polluting the card's plain-text
                content (e.g. e2e title matching that reads the whole
                card's accessible text). */}
            {card.complete ? '✓' : ''}
          </button>
        ) : (
          card.complete && (
            <span className="shrink-0 text-success" aria-label="Completada">
              ✓
            </span>
          )
        )}
      </div>
      {card.start_date && (
        <span className="text-xs font-medium text-primary">
          {formatCardDateRange(card.start_date, card.end_date)}
        </span>
      )}
      <span className="text-xs text-slate-400">{new Date(card.created_at).toLocaleString()}</span>
    </>
  )
}

export function CardOverlayPreview({
  card,
  labels,
  coverUrl,
}: {
  card: Card
  labels: Label[]
  coverUrl?: string
}) {
  return (
    <div className="flex w-72 flex-col gap-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-left text-sm text-slate-800 shadow-elevated">
      <CardFace card={card} labels={labels} coverUrl={coverUrl} />
    </div>
  )
}

export function CardItem({
  card,
  listId,
  labels,
  boardLabels,
  boardOwnerId,
  coverUrl,
  onUpdate,
  onDelete,
  onToggleLabel,
  onCreateLabel,
  onDeleteLabel,
  onCardModalClose,
}: CardItemProps) {
  const [open, setOpen] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', listId },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none' as const,
  }

  return (
    <>
      {/* div, not button: the completion checkmark below is itself a real
          <button>, and a <button> can't legally contain another <button>. */}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={`flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-left text-sm text-slate-800 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover ${
          isDragging ? 'opacity-0' : ''
        }`}
      >
        <CardFace
          card={card}
          labels={labels}
          coverUrl={coverUrl}
          onToggleComplete={(complete) => onUpdate(card.id, { complete })}
        />
      </div>
      {open && (
        <CardDetailModal
          card={card}
          boardLabels={boardLabels}
          assignedLabelIds={labels.map((l) => l.id)}
          boardOwnerId={boardOwnerId}
          onClose={(cardId) => {
            setOpen(false)
            onCardModalClose(cardId)
          }}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onToggleLabel={onToggleLabel}
          onCreateLabel={onCreateLabel}
          onDeleteLabel={onDeleteLabel}
        />
      )}
    </>
  )
}
