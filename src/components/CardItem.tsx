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
  onUpdate: (cardId: string, updates: Partial<Pick<Card, 'title' | 'description'>>) => void
  onDelete: (cardId: string) => void
  onToggleLabel: (cardId: string, labelId: string, assign: boolean) => void
}

export function CardItem({
  card,
  listId,
  labels,
  boardLabels,
  boardOwnerId,
  onUpdate,
  onDelete,
  onToggleLabel,
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
          isDragging ? 'opacity-50' : ''
        }`}
      >
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
      </button>
      {open && (
        <CardDetailModal
          card={card}
          boardLabels={boardLabels}
          assignedLabelIds={labels.map((l) => l.id)}
          boardOwnerId={boardOwnerId}
          onClose={() => setOpen(false)}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onToggleLabel={onToggleLabel}
        />
      )}
    </>
  )
}
