import { useState } from 'react'
import type { Card } from '../types'
import { CardDetailModal } from './CardDetailModal'

interface CardItemProps {
  card: Card
  onUpdate: (cardId: string, updates: Partial<Pick<Card, 'title' | 'description'>>) => void
  onDelete: (cardId: string) => void
}

export function CardItem({ card, onUpdate, onDelete }: CardItemProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 shadow-sm hover:border-gray-300 hover:shadow"
      >
        {card.title}
      </button>
      {open && (
        <CardDetailModal
          card={card}
          onClose={() => setOpen(false)}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </>
  )
}
