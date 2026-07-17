import type { Card, Label, ListWithCards } from '../types'

interface TableViewProps {
  lists: ListWithCards[]
  cardLabelsByCardId: Record<string, Label[]>
  onSelectCard: (cardId: string) => void
}

// ponytail: a plain list-order table, no sorting/filtering -- add if this
// app's card volume ever actually needs it.
export function TableView({ lists, cardLabelsByCardId, onSelectCard }: TableViewProps) {
  const rows = lists.flatMap((list) => list.cards.map((card) => ({ card, listName: list.name })))

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 overflow-hidden rounded-xl bg-surface shadow-card">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5">Título</th>
            <th className="px-4 py-2.5">Lista</th>
            <th className="px-4 py-2.5">Etiquetas</th>
            <th className="px-4 py-2.5">Inicio</th>
            <th className="px-4 py-2.5">Fin</th>
            <th className="px-4 py-2.5">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                Este tablero no tiene tarjetas todavía.
              </td>
            </tr>
          )}
          {rows.map(({ card, listName }) => (
            <TableRow key={card.id} card={card} listName={listName} labels={cardLabelsByCardId[card.id] ?? []} onSelectCard={onSelectCard} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableRow({
  card,
  listName,
  labels,
  onSelectCard,
}: {
  card: Card
  listName: string
  labels: Label[]
  onSelectCard: (cardId: string) => void
}) {
  return (
    <tr className="cursor-pointer border-t border-border-subtle text-sm text-slate-700 transition-colors hover:bg-primary-light" onClick={() => onSelectCard(card.id)}>
      <td className={`px-4 py-2.5 font-medium ${card.complete ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{card.title}</td>
      <td className="px-4 py-2.5">{listName}</td>
      <td className="px-4 py-2.5">
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <span key={label.id} title={label.name} className="h-2 w-6 rounded-full" style={{ backgroundColor: label.color }} />
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">{card.start_date ? new Date(card.start_date).toLocaleString() : ''}</td>
      <td className="px-4 py-2.5 whitespace-nowrap">{card.end_date ? new Date(card.end_date).toLocaleString() : ''}</td>
      <td className="px-4 py-2.5 text-center">{card.complete ? <span className="text-success">✓</span> : ''}</td>
    </tr>
  )
}
