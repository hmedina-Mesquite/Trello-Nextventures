import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
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
    if (!window.confirm(`Delete board "${board.name}"? This cannot be undone.`)) return
    const { error: deleteError } = await supabase.from('boards').delete().eq('id', board.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setBoards((prev) => prev.filter((b) => b.id !== board.id))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Your boards</h1>
        <div className="flex items-center gap-4">
          {user && <span className="text-sm text-gray-500">{user.email}</span>}
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {error && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {loading ? (
          <p className="text-gray-500">Loading boards…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {boards.map((board) => (
              <div key={board.id} className="group relative">
                <Link
                  to={`/boards/${board.id}`}
                  className="block h-24 rounded-lg p-3 text-white shadow hover:brightness-95"
                  style={{ backgroundColor: board.background_color }}
                >
                  <span className="font-semibold">{board.name}</span>
                </Link>
                {board.owner_id === user?.id && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteBoard(board)}
                    className="absolute right-2 top-2 hidden rounded bg-black/30 px-1.5 py-1 text-xs text-white hover:bg-black/50 group-hover:block"
                    aria-label={`Delete board ${board.name}`}
                    title="Delete board"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {showForm ? (
              <form
                onSubmit={handleCreateBoard}
                className="flex h-24 flex-col justify-between rounded-lg border border-gray-200 bg-white p-3 shadow"
              >
                <label htmlFor="board-name" className="sr-only">
                  Board name
                </label>
                <input
                  id="board-name"
                  autoFocus
                  type="text"
                  placeholder="Board name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {BOARD_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewColor(color)}
                        className={`h-5 w-5 rounded ${
                          newColor === color ? 'ring-2 ring-offset-1 ring-gray-800' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Choose color ${color}`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="submit"
                      disabled={creating || !newName.trim()}
                      className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
              >
                + Create new board
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
