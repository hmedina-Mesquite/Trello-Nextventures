import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { NotificationsPanel } from './NotificationsPanel'

interface NotificationsBellProps {
  buttonClassName?: string
}

const DEFAULT_BUTTON_CLASSNAME =
  'relative rounded px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100'

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
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
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
