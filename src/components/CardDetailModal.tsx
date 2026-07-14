import { useState } from 'react'
import type { Card } from '../types'

interface CardDetailModalProps {
  card: Card
  onClose: () => void
  onUpdate: (cardId: string, updates: Partial<Pick<Card, 'title' | 'description'>>) => void
  onDelete: (cardId: string) => void
}

export function CardDetailModal({ card, onClose, onUpdate, onDelete }: CardDetailModalProps) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description ?? '')

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
            Card title
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
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <label htmlFor="card-description" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Description
        </label>
        <textarea
          id="card-description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          placeholder="Add a more detailed description…"
          className="mb-4 w-full resize-y rounded border border-gray-300 px-2 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
        />

        <button
          type="button"
          onClick={handleDelete}
          className="rounded bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Delete card
        </button>
      </div>
    </div>
  )
}
