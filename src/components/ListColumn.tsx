import { useState } from 'react'
import type { FormEvent } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Label, ListWithCards } from '../types'
import { CardFace, CardItem } from './CardItem'

export function ListOverlayPreview({
  list,
  cardLabelsByCardId,
  cardCoverUrlByCardId,
}: {
  list: ListWithCards
  cardLabelsByCardId: Record<string, Label[]>
  cardCoverUrlByCardId: Record<string, string>
}) {
  return (
    <div className="flex w-72 flex-shrink-0 flex-col gap-2 rounded-lg bg-gray-100 p-3 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <h2 className="w-full rounded px-2 py-1 text-sm font-semibold text-gray-800">{list.name}</h2>
      </div>
      <div className="flex flex-col gap-2">
        {list.cards.map((card) => (
          <div
            key={card.id}
            className="flex w-full flex-col gap-1 rounded border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 shadow-sm"
          >
            <CardFace card={card} labels={cardLabelsByCardId[card.id] ?? []} coverUrl={cardCoverUrlByCardId[card.id]} />
          </div>
        ))}
      </div>
    </div>
  )
}

interface ListColumnProps {
  list: ListWithCards
  boardLabels: Label[]
  cardLabelsByCardId: Record<string, Label[]>
  cardCoverUrlByCardId: Record<string, string>
  boardOwnerId: string
  onRename: (listId: string, name: string) => void
  onDelete: (listId: string) => void
  onAddCard: (listId: string, title: string) => void
  onUpdateCard: (cardId: string, updates: Partial<Pick<Card, 'title' | 'description'>>) => void
  onDeleteCard: (cardId: string) => void
  onToggleLabel: (cardId: string, labelId: string, assign: boolean) => void
  onCardModalClose: (cardId: string) => void
}

export function ListColumn({
  list,
  boardLabels,
  cardLabelsByCardId,
  cardCoverUrlByCardId,
  boardOwnerId,
  onRename,
  onDelete,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onToggleLabel,
  onCardModalClose,
}: ListColumnProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(list.name)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [addingCard, setAddingCard] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: 'list' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

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
    <div
      ref={setNodeRef}
      style={style}
      className={`flex w-72 flex-shrink-0 flex-col gap-2 rounded-lg bg-gray-100 p-3 shadow ${
        isDragging ? 'opacity-0' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab rounded px-1 py-1 text-gray-400 hover:bg-gray-200 active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          aria-label={`Arrastrar lista ${list.name}`}
          title="Arrastra para reordenar la lista"
        >
          ⠿
        </button>
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
          aria-label={`Eliminar lista ${list.name}`}
          title="Eliminar lista"
        >
          ✕
        </button>
      </div>

      <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {list.cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              listId={list.id}
              labels={cardLabelsByCardId[card.id] ?? []}
              boardLabels={boardLabels}
              boardOwnerId={boardOwnerId}
              coverUrl={cardCoverUrlByCardId[card.id]}
              onUpdate={onUpdateCard}
              onDelete={onDeleteCard}
              onToggleLabel={onToggleLabel}
              onCardModalClose={onCardModalClose}
            />
          ))}
        </div>
      </SortableContext>

      {addingCard ? (
        <form onSubmit={handleAddCardSubmit} className="flex flex-col gap-2">
          <label htmlFor={`new-card-${list.id}`} className="sr-only">
            Título de la nueva tarjeta
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
            placeholder="Escribe un título para esta tarjeta"
            className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Agregar tarjeta
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingCard(false)
                setNewCardTitle('')
              }}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingCard(true)}
          className="rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-200"
        >
          + Agregar una tarjeta
        </button>
      )}
    </div>
  )
}
