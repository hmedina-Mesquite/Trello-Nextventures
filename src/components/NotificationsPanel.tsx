import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import type { Notification } from '../types'

interface NotificationsPanelProps {
  onClose: () => void
}

const EVENT_LABELS: Record<string, string> = {
  board_invite: 'Invitación a tablero',
  member_removed: 'Eliminado de un tablero',
}

export function NotificationsPanel({ onClose }: NotificationsPanelProps) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setNotifications((data ?? []) as Notification[])
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleMarkRead(id: string) {
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Notificaciones</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500">Cargando notificaciones…</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-gray-500">No tienes notificaciones.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`rounded border border-gray-100 p-3 ${n.read ? 'bg-white' : 'bg-blue-50'}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {EVENT_LABELS[n.event_type] ?? n.event_type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mb-2 text-sm text-gray-800">{n.message}</p>
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => void handleMarkRead(n.id)}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    Marcar como leída
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
