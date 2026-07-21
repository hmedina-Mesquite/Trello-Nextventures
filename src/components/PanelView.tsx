import type { ListWithCards } from '../types'

interface PanelViewProps {
  lists: ListWithCards[]
}

// Plain stat tiles computed client-side from data the board already loaded
// -- no charting library, no new query.
export function PanelView({ lists }: PanelViewProps) {
  const allCards = lists.flatMap((l) => l.cards)
  const total = allCards.length
  const completed = allCards.filter((c) => c.complete).length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const now = new Date()
  const overdue = allCards.filter((c) => c.end_date && !c.complete && new Date(c.end_date) < now).length

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
      <div className="rounded-xl border border-border-subtle bg-surface p-4 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total de tarjetas</p>
        <p className="mt-1 text-3xl font-bold text-slate-900">{total}</p>
        <div className="mt-3 flex flex-col gap-1">
          {lists.map((list) => (
            <div key={list.id} className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span className="min-w-0 truncate">{list.name}</span>
              <span className="shrink-0 font-medium text-slate-700">{list.cards.length}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface p-4 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">% Completadas</p>
        <p className="mt-1 text-3xl font-bold text-slate-900">{pct}%</p>
        <p className="mt-1 text-xs text-slate-500">
          {completed} de {total} completadas
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface p-4 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tarjetas vencidas</p>
        <p className={`mt-1 text-3xl font-bold ${overdue > 0 ? 'text-danger' : 'text-slate-900'}`}>{overdue}</p>
        <p className="mt-1 text-xs text-slate-500">Con fecha de fin en el pasado, sin completar</p>
      </div>
    </div>
  )
}
