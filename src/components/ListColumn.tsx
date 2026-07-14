import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Card, ListWithCards } from '../types'
import { CardItem } from './CardItem'

interface ListColumnProps {
  list: ListWithCards
  onRename: (listId: string, name: string) => void
  onDelete: (listId: string) => void
  onAddCard: (listId: string, title: string) => void
  onUpdateCard: (cardId: string, updates: Partial<Pick<Card, 'title' | 'description'>>) => void
  onDeleteCard: (cardId: string) => void
}

export function ListColumn({
  list,
  onRename,
  onDelete,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
}: ListColumnProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(list.name)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [addingCard, setAddingCard] = useState(false)

  function commitRename() {
    setEditingName(false)
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === list.name) {
      setNameDraft(list.name)
      return
    }
    onRename(list.id, trimmed)
  }

  function submitNewCard() {
    const trimmed = newCardTitle.trim()
    if (!trimmed) return
    onAddCard(list.id, trimmed)
    setNewCardTitle('')
    setAddingCard(false)
  }

  function handleAddCardSubmit(e: FormEvent) {
    e.preventDefault()
    submitNewCard()
  }

  return (
    <div className="flex w-72 flex-shrink-0 flex-col gap-2 rounded-lg bg-gray-100 p-3 shadow">
      <div className="flex items-center justify-between gap-2">
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setNameDraft(list.name)
                setEditingName(false)
              }
            }}
            className="w-full rounded border border-blue-400 px-2 py-1 text-sm font-semibold text-gray-900"
          />
        ) : (
          <h2
            className="w-full cursor-text rounded px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-200"
            onClick={() => setEditingName(true)}
          >
            {list.name}
          </h2>
        )}
        <button
          type="button"
          onClick={() => onDelete(list.id)}
          className="shrink-0 rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-red-100 hover:text-red-700"
          aria-label={`Delete list ${list.name}`}
          title="Delete list"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {list.cards.map((card) => (
          <CardItem key={card.id} card={card} onUpdate={onUpdateCard} onDelete={onDeleteCard} />
        ))}
      </div>

      {addingCard ? (
        <form onSubmit={handleAddCardSubmit} className="flex flex-col gap-2">
          <label htmlFor={`new-card-${list.id}`} className="sr-only">
            New card title
          </label>
          <textarea
            id={`new-card-${list.id}`}
            autoFocus
            rows={2}
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitNewCard()
              }
              if (e.key === 'Escape') {
                setAddingCard(false)
                setNewCardTitle('')
              }
            }}
            placeholder="Enter a title for this card"
            className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingCard(false)
                setNewCardTitle('')
              }}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingCard(true)}
          className="rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-200"
        >
          + Add a card
        </button>
      )}
    </div>
  )
}
