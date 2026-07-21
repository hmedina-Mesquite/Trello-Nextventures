import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { NotificationsBell } from '../components/NotificationsBell'
import type { Board } from '../types'

const BOARD_COLORS = [
  '#0079bf',
  '#d29034',
  '#519839',
  '#b04632',
  '#89609e',
  '#cd5a91',
  '#4bbf6b',
  '#00aecc',
  '#838c91',
]

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(BOARD_COLORS[0])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('boards')
        .select('*')
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setBoards((data ?? []) as Board[])
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleCreateBoard(e: FormEvent) {
    e.preventDefault()
    if (!user || !newName.trim()) return
    setCreating(true)
    setError(null)

    const { data, error: insertError } = await supabase
      .from('boards')
      .insert({ name: newName.trim(), owner_id: user.id, background_color: newColor })
      .select()
      .single()

    setCreating(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    const board = data as Board
    setBoards((prev) => [board, ...prev])
    setNewName('')
    setNewColor(BOARD_COLORS[0])
    setShowForm(false)
    navigate(`/boards/${board.id}`)
  }

  async function handleDeleteBoard(board: Board) {
    if (!window.confirm(`¿Eliminar el tablero "${board.name}"? Esta acción no se puede deshacer.`)) return
    const { error: deleteError } = await supabase.from('boards').delete().eq('id', board.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setBoards((prev) => prev.filter((b) => b.id !== board.id))
  }

  return (
    <div className="min-h-screen bg-app-bg">
      <header className="flex items-center justify-between border-b border-border-subtle bg-surface px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            T
          </div>
          <h1 className="text-lg font-bold text-slate-900">Tus tableros</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/calendar"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-primary"
          >
            Calendario
          </Link>
          <Link
            to="/documentation"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-primary"
          >
            Documentación
          </Link>
          {user && <span className="text-sm text-slate-400">{user.email}</span>}
          <NotificationsBell />
          <button
            type="button"
            onClick={() => void signOut()}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {error && (
          <p className="mb-4 rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {loading ? (
          <p className="text-slate-400">Cargando tableros…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {boards.map((board) => (
              <div key={board.id} className="group relative">
                <Link
                  to={`/boards/${board.id}`}
                  className="block h-28 rounded-xl p-4 text-white shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
                  style={{ backgroundColor: board.background_color }}
                >
                  <span className="font-semibold">{board.name}</span>
                </Link>
                {board.owner_id === user?.id && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteBoard(board)}
                    className="absolute right-2 top-2 hidden cursor-pointer rounded-lg bg-black/30 px-1.5 py-1 text-xs text-white transition-colors hover:bg-black/50 group-hover:block"
                    aria-label={`Eliminar tablero ${board.name}`}
                    title="Eliminar tablero"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {showForm ? (
              <form
                onSubmit={handleCreateBoard}
                className="flex h-28 flex-col justify-between rounded-xl border border-border-subtle bg-surface p-3 shadow-card"
              >
                <label htmlFor="board-name" className="sr-only">
                  Nombre del tablero
                </label>
                <input
                  id="board-name"
                  autoFocus
                  type="text"
                  placeholder="Nombre del tablero"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle px-2 py-1 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {BOARD_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewColor(color)}
                        className={`h-5 w-5 cursor-pointer rounded-full transition-shadow ${
                          newColor === color ? 'ring-2 ring-offset-1 ring-primary' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Elegir color ${color}`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="submit"
                      disabled={creating || !newName.trim()}
                      className="cursor-pointer rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Crear
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="cursor-pointer rounded-lg px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex h-28 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border-subtle text-sm font-medium text-slate-500 transition-colors hover:border-primary hover:text-primary"
              >
                + Crear nuevo tablero
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
