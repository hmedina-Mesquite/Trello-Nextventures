import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { NotificationsBell } from '../components/NotificationsBell'
import { CardDetailModal } from '../components/CardDetailModal'
import {
  buildGoogleAuthUrl,
  disconnectGoogle,
  getGoogleConnectionStatus,
  isGoogleConfigured,
  pullGoogleCalendarEvents,
} from '../lib/googleCalendar'
import type { GoogleConnectionStatus } from '../lib/googleCalendar'
import { formatTimeRangeOnly } from '../lib/cardDates'
import type { Card, Label } from '../types'

interface CalendarCard extends Card {
  boardId: string
  boardName: string
  listName: string
}

interface SelectedCardContext {
  card: CalendarCard
  boardOwnerId: string
  boardLabels: Label[]
  assignedLabelIds: string[]
}

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MAX_CARDS_PER_CELL = 3

/** Buckets by the viewer's own local calendar day, not UTC -- a card's
 * start_date is a real instant (timestamptz), and two different viewers in
 * different timezones should each see it land on "their" day, the same way
 * formatCardDateRange/formatTimeRangeOnly already format times locally. */
function localDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 6 weeks x 7 days covering the given month, padded with the tail of the
 * previous month and the head of the next so every row is a full week
 * (Sunday-start, matching WEEKDAY_LABELS above). */
function getMonthGridDays(viewDate: Date): Date[] {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
}

export default function CalendarPage() {
  const { user } = useAuth()
  const [cards, setCards] = useState<CalendarCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedCardContext | null>(null)
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus>({ connected: false, email: null })
  const [syncing, setSyncing] = useState(false)
  const [viewDate, setViewDate] = useState(() => new Date())

  async function load() {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data: memberRows, error: memberError } = await supabase
      .from('board_members')
      .select('board_id')
      .eq('user_id', user.id)
    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }
    const boardIds = (memberRows ?? []).map((r) => r.board_id as string)
    if (boardIds.length === 0) {
      setCards([])
      setLoading(false)
      return
    }

    const { data: boardsData, error: boardsError } = await supabase
      .from('boards')
      .select('id, name')
      .in('id', boardIds)
    if (boardsError) {
      setError(boardsError.message)
      setLoading(false)
      return
    }
    const boardNameById = new Map((boardsData ?? []).map((b) => [b.id as string, b.name as string]))

    const { data: listsData, error: listsError } = await supabase
      .from('lists')
      .select('id, board_id, name')
      .in('board_id', boardIds)
    if (listsError) {
      setError(listsError.message)
      setLoading(false)
      return
    }
    const listIds = (listsData ?? []).map((l) => l.id as string)
    if (listIds.length === 0) {
      setCards([])
      setLoading(false)
      return
    }
    const listInfoById = new Map(
      (listsData ?? []).map((l) => [l.id as string, { boardId: l.board_id as string, name: l.name as string }]),
    )

    const { data: cardsData, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .in('list_id', listIds)
      .not('start_date', 'is', null)
      .order('start_date', { ascending: true })
    if (cardsError) {
      setError(cardsError.message)
      setLoading(false)
      return
    }

    const merged: CalendarCard[] = (cardsData ?? []).flatMap((c) => {
      const card = c as Card
      const listInfo = listInfoById.get(card.list_id)
      if (!listInfo) return []
      return [
        {
          ...card,
          boardId: listInfo.boardId,
          boardName: boardNameById.get(listInfo.boardId) ?? '(tablero)',
          listName: listInfo.name,
        },
      ]
    })

    setCards(merged)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    void getGoogleConnectionStatus().then(setGoogleStatus)
    void pullGoogleCalendarEvents().then(() => load())
    // Refresh from Google whenever the user comes back to this tab, since
    // there's no server-side push notification wiring this app in the
    // other direction -- see lib/googleCalendar.ts for the tradeoff.
    function onFocus() {
      void pullGoogleCalendarEvents().then(() => load())
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function handleManualSync() {
    setSyncing(true)
    await pullGoogleCalendarEvents()
    await load()
    setSyncing(false)
  }

  async function handleDisconnectGoogle() {
    if (!window.confirm('¿Desconectar tu cuenta de Google? Dejará de sincronizarse el calendario.')) return
    await disconnectGoogle()
    setGoogleStatus({ connected: false, email: null })
  }

  async function handleSelectCard(card: CalendarCard) {
    const [{ data: boardRow }, { data: labelsData }, { data: cardLabelRows }] = await Promise.all([
      supabase.from('boards').select('owner_id').eq('id', card.boardId).single(),
      supabase.from('labels').select('*').eq('board_id', card.boardId),
      supabase.from('card_labels').select('label_id').eq('card_id', card.id),
    ])
    setSelected({
      card,
      boardOwnerId: (boardRow?.owner_id as string) ?? '',
      boardLabels: (labelsData ?? []) as Label[],
      assignedLabelIds: (cardLabelRows ?? []).map((r) => r.label_id as string),
    })
  }

  async function handleUpdate(cardId: string, updates: Partial<Pick<Card, 'title' | 'description' | 'start_date' | 'end_date' | 'complete'>>) {
    const { error: updateError } = await supabase.from('cards').update(updates).eq('id', cardId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    if ('start_date' in updates && !updates.start_date) {
      setCards((prev) => prev.filter((c) => c.id !== cardId))
    } else {
      setCards((prev) =>
        prev
          .map((c) => (c.id === cardId ? { ...c, ...updates } : c))
          .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '')),
      )
    }
  }

  async function handleDelete(cardId: string) {
    const { error: deleteError } = await supabase.from('cards').delete().eq('id', cardId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setCards((prev) => prev.filter((c) => c.id !== cardId))
  }

  async function handleToggleLabel(cardId: string, labelId: string, assign: boolean) {
    if (assign) {
      await supabase.from('card_labels').insert({ card_id: cardId, label_id: labelId })
    } else {
      await supabase.from('card_labels').delete().eq('card_id', cardId).eq('label_id', labelId)
    }
    setSelected((prev) =>
      prev
        ? {
            ...prev,
            assignedLabelIds: assign
              ? [...prev.assignedLabelIds, labelId]
              : prev.assignedLabelIds.filter((id) => id !== labelId),
          }
        : prev,
    )
  }

  const cardsByDay = new Map<string, CalendarCard[]>()
  for (const card of cards) {
    const key = localDateKey(card.start_date!)
    cardsByDay.set(key, [...(cardsByDay.get(key) ?? []), card])
  }

  const today = new Date()
  const todayKey = localDateKey(today.toISOString())
  const gridDays = getMonthGridDays(viewDate)
  const viewMonth = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  function changeMonth(delta: number) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  return (
    <div className="min-h-screen bg-app-bg">
      <header className="flex items-center justify-between border-b border-border-subtle bg-surface px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            ← Tableros
          </Link>
          <h1 className="text-lg font-bold text-slate-900">Calendario</h1>
        </div>
        <div className="flex items-center gap-3">
          {googleStatus.connected ? (
            <>
              <span className="text-sm text-slate-500">
                Google: {googleStatus.email ?? 'conectado'}
              </span>
              <button
                type="button"
                onClick={() => void handleManualSync()}
                disabled={syncing}
                className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnectGoogle()}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100"
              >
                Desconectar
              </button>
            </>
          ) : isGoogleConfigured() ? (
            <a
              href={buildGoogleAuthUrl()}
              className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              Conectar Google Calendar
            </a>
          ) : (
            <span className="text-sm text-slate-400" title="Falta VITE_GOOGLE_CLIENT_ID">
              Google Calendar no configurado
            </span>
          )}
          <NotificationsBell />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {error && <p className="mb-4 rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize text-slate-900">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Mes anterior"
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setViewDate(new Date())}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="Mes siguiente"
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              ›
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-500">Cargando calendario…</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-border-subtle shadow-card">
            <div className="grid grid-cols-7 gap-px">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {gridDays.map((day) => {
                const key = localDateKey(day.toISOString())
                const dayCards = cardsByDay.get(key) ?? []
                const inMonth = day.getMonth() === viewMonth
                const isToday = key === todayKey
                const visibleCards = dayCards.slice(0, MAX_CARDS_PER_CELL)
                const overflowCount = dayCards.length - visibleCards.length

                return (
                  <div
                    key={key}
                    className={`flex min-h-[110px] flex-col gap-1 p-1.5 ${inMonth ? 'bg-white' : 'bg-slate-50'}`}
                  >
                    <span
                      className={`self-end text-xs font-medium ${
                        isToday
                          ? 'flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white'
                          : inMonth
                            ? 'text-slate-600'
                            : 'text-slate-300'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    <div className="flex flex-col gap-1">
                      {visibleCards.map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => void handleSelectCard(card)}
                          title={card.title}
                          className="cursor-pointer truncate rounded-md bg-primary-light px-1.5 py-0.5 text-left text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white"
                        >
                          {card.end_date && (
                            <span className="mr-1 opacity-80">
                              {formatTimeRangeOnly(card.start_date!, card.end_date).split(' - ')[0]}
                            </span>
                          )}
                          <span className={card.complete ? 'line-through' : ''}>{card.title}</span>
                        </button>
                      ))}
                      {/* ponytail: overflow is a plain count, not a "show more" popover --
                          a day view/expansion is more UI than this app's card volume needs yet. */}
                      {overflowCount > 0 && (
                        <span className="px-1.5 text-xs text-slate-400">+{overflowCount} más</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {selected && (
        <CardDetailModal
          card={selected.card}
          boardLabels={selected.boardLabels}
          assignedLabelIds={selected.assignedLabelIds}
          boardOwnerId={selected.boardOwnerId}
          onClose={() => setSelected(null)}
          onUpdate={(cardId, updates) => void handleUpdate(cardId, updates)}
          onDelete={(cardId) => void handleDelete(cardId)}
          onToggleLabel={(cardId, labelId, assign) => void handleToggleLabel(cardId, labelId, assign)}
        />
      )}
    </div>
  )
}
