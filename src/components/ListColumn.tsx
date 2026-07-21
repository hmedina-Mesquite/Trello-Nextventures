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
    <div className="flex w-[85vw] max-w-xs flex-shrink-0 flex-col gap-2 rounded-xl bg-slate-50 p-3 shadow-elevated sm:w-72">
      <div className="flex items-center justify-between gap-2">
        <h2 className="w-full rounded-lg px-2 py-1 text-sm font-semibold text-slate-800">{list.name}</h2>
      </div>
      <div className="flex flex-col gap-2">
        {list.cards.map((card) => (
          <div
            key={card.id}
            className="flex w-full flex-col gap-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-left text-sm text-slate-800 shadow-card"
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
  onUpdateCard: (cardId: string, updates: Partial<Pick<Card, 'title' | 'description' | 'start_date' | 'end_date' | 'complete' | 'location_data'>>) => void
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
      className={`flex h-full w-[85vw] max-w-xs flex-shrink-0 flex-col gap-2 rounded-xl bg-slate-50 p-3 shadow-card sm:w-72 ${
        isDragging ? 'opacity-0' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab rounded-lg px-1 py-1 text-slate-400 transition-colors hover:bg-slate-200 active:cursor-grabbing"
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
            className="w-full rounded-lg border border-primary px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        ) : (
          <h2
            className="w-full cursor-text rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-200"
            onClick={() => setEditingName(true)}
          >
            {list.name}
          </h2>
        )}
        <button
          type="button"
          onClick={() => onDelete(list.id)}
          className="shrink-0 cursor-pointer rounded-lg px-1.5 py-1 text-xs text-slate-400 transition-colors hover:bg-danger-light hover:text-danger"
          aria-label={`Eliminar lista ${list.name}`}
          title="Eliminar lista"
        >
          ✕
        </button>
      </div>

      <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {/* min-h-0: same flex-1-in-a-flex-column gotcha as BoardPage's row --
            without it this scrolls the whole column (or page) instead of
            just the card list. */}
        <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto">
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
            className="w-full resize-none rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              Agregar tarjeta
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingCard(false)
                setNewCardTitle('')
              }}
              className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-slate-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingCard(true)}
          className="cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-200"
        >
          + Agregar una tarjeta
        </button>
      )}
    </div>
  )
}
