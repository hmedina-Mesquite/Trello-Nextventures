import type { Card, ListWithCards } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_DAYS = 14
const LABEL_COL_PX = 160
const DAY_COL_PX = 36

function dayFloor(iso: string): Date {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

interface TimelineViewProps {
  lists: ListWithCards[]
  onSelectCard: (cardId: string) => void
}

// A CSS-grid Gantt-style timeline: date columns across the top, list names
// down the left, cards as bars spanning their start_date..end_date (a
// single-day block when end_date is null). Cards with no start_date are
// simply omitted -- not plottable, not an error state. Cards overlapping in
// the same list on the same days will visually overlap -- ponytail: fine
// for this app's card volume, revisit with a lane-packing algorithm only if
// that actually happens in practice.
export function TimelineView({ lists, onSelectCard }: TimelineViewProps) {
  const datedCards = lists.flatMap((list) =>
    list.cards.filter((c) => c.start_date).map((card) => ({ card, listId: list.id })),
  )

  let rangeStart = dayFloor(new Date().toISOString())
  let numDays = MIN_DAYS
  if (datedCards.length > 0) {
    const starts = datedCards.map(({ card }) => dayFloor(card.start_date!).getTime())
    const ends = datedCards.map(({ card }) => dayFloor(card.end_date ?? card.start_date!).getTime())
    rangeStart = new Date(Math.min(...starts))
    const rangeEndMs = Math.max(...ends)
    numDays = Math.max(MIN_DAYS, Math.round((rangeEndMs - rangeStart.getTime()) / DAY_MS) + 1)
  }

  const days = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(rangeStart)
    d.setDate(d.getDate() + i)
    return d
  })

  function dayIndexOf(iso: string): number {
    return Math.round((dayFloor(iso).getTime() - rangeStart.getTime()) / DAY_MS)
  }

  const gridTemplateColumns = `${LABEL_COL_PX}px repeat(${numDays}, ${DAY_COL_PX}px)`
  const gridTemplateRows = `auto repeat(${lists.length}, minmax(44px, auto))`

  return (
    <div className="overflow-x-auto p-4">
      {lists.length === 0 ? (
        <p className="p-4 text-sm text-slate-400">Este tablero no tiene listas todavía.</p>
      ) : (
        <div
          className="grid rounded-xl border border-border-subtle bg-surface shadow-card"
          style={{ gridTemplateColumns, gridTemplateRows, minWidth: LABEL_COL_PX + numDays * DAY_COL_PX }}
        >
          <div className="sticky left-0 z-10 border-b border-r border-border-subtle bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500" style={{ gridColumn: 1, gridRow: 1 }}>
            Lista
          </div>
          {days.map((day, i) => (
            <div
              key={i}
              className="border-b border-border-subtle bg-slate-50 py-2 text-center text-[10px] font-medium text-slate-500"
              style={{ gridColumn: i + 2, gridRow: 1 }}
            >
              {day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </div>
          ))}

          {lists.map((list, r) => (
            <div
              key={`label-${list.id}`}
              className="sticky left-0 z-10 flex items-center border-b border-r border-border-subtle bg-surface px-3 py-2 text-sm font-medium text-slate-700"
              style={{ gridColumn: 1, gridRow: r + 2 }}
            >
              {list.name}
            </div>
          ))}
          {lists.map((list, r) => (
            <div
              key={`track-${list.id}`}
              className="border-b border-border-subtle"
              style={{ gridColumn: `2 / span ${numDays}`, gridRow: r + 2 }}
            />
          ))}

          {datedCards.map(({ card, listId }) => (
            <TimelineBar key={card.id} card={card} listRowIndex={lists.findIndex((l) => l.id === listId)} dayIndexOf={dayIndexOf} onSelectCard={onSelectCard} />
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineBar({
  card,
  listRowIndex,
  dayIndexOf,
  onSelectCard,
}: {
  card: Card
  listRowIndex: number
  dayIndexOf: (iso: string) => number
  onSelectCard: (cardId: string) => void
}) {
  const startIdx = dayIndexOf(card.start_date!)
  const endIdx = dayIndexOf(card.end_date ?? card.start_date!)
  const span = Math.max(1, endIdx - startIdx + 1)

  return (
    <button
      type="button"
      onClick={() => onSelectCard(card.id)}
      title={card.title}
      className={`m-1 cursor-pointer self-center truncate rounded-md px-2 py-1 text-left text-xs font-medium text-white shadow-sm transition-colors hover:opacity-90 ${
        card.complete ? 'bg-slate-400' : 'bg-primary'
      }`}
      style={{ gridColumn: `${startIdx + 2} / span ${span}`, gridRow: listRowIndex + 2 }}
    >
      <span className={card.complete ? 'line-through' : ''}>{card.title}</span>
    </button>
  )
}
