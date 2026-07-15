import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Label } from '../types'
import { CardDetailModal } from './CardDetailModal'

interface CardItemProps {
  card: Card
  listId: string
  labels: Label[]
  boardLabels: Label[]
  boardOwnerId: string
  coverUrl?: string
  onUpdate: (cardId: string, updates: Partial<Pick<Card, 'title' | 'description'>>) => void
  onDelete: (cardId: string) => void
  onToggleLabel: (cardId: string, labelId: string, assign: boolean) => void
  onCardModalClose: (cardId: string) => void
}

export function CardFace({ card, labels, coverUrl }: { card: Card; labels: Label[]; coverUrl?: string }) {
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
          className="mb-1 max-h-48 w-full rounded bg-gray-100 object-contain"
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
      {card.title}
      <span className="text-xs text-gray-400">{new Date(card.created_at).toLocaleString()}</span>
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
    <div className="flex w-72 flex-col gap-1 rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-800 shadow-lg">
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
      <button
        type="button"
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => setOpen(true)}
        className={`flex w-full flex-col gap-1 rounded border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 shadow-sm hover:border-gray-300 hover:shadow ${
          isDragging ? 'opacity-0' : ''
        }`}
      >
        <CardFace card={card} labels={labels} coverUrl={coverUrl} />
      </button>
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
        />
      )}
    </>
  )
}
