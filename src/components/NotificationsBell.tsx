import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { NotificationsPanel } from './NotificationsPanel'

interface NotificationsBellProps {
  buttonClassName?: string
}

const DEFAULT_BUTTON_CLASSNAME =
  'relative cursor-pointer rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100'

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

export function NotificationsBell({ buttonClassName }: NotificationsBellProps) {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [showPanel, setShowPanel] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('read', false)

      if (cancelled) return
      setUnreadCount(count ?? 0)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user, reloadTick])

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPanel(true)}
        className={buttonClassName ?? DEFAULT_BUTTON_CLASSNAME}
        aria-label="Notificaciones"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {showPanel && (
        <NotificationsPanel
          onClose={() => {
            setShowPanel(false)
            setReloadTick((t) => t + 1)
          }}
        />
      )}
    </>
  )
}
