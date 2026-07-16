import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { BoardMemberWithProfile, BoardRole } from '../types'

const ROLE_LABELS: Record<BoardRole, string> = {
  owner: 'Propietario',
  member: 'Miembro',
}

interface MembersPanelProps {
  boardId: string
  currentUserId: string
  isOwner: boolean
  onClose: () => void
  onLeave: () => void
}

export function MembersPanel({ boardId, currentUserId, isOwner, onClose, onLeave }: MembersPanelProps) {
  const [members, setMembers] = useState<BoardMemberWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('board_members')
        .select('*, profiles(username)')
        .eq('board_id', boardId)
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setMembers((data ?? []) as BoardMemberWithProfile[])
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [boardId])

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    const identifier = inviteUsername.trim()
    if (!identifier) return
    setInviting(true)
    setError(null)

    const { data, error: rpcError } = await supabase
      .rpc('invite_board_member', { p_board_id: boardId, p_identifier: identifier })
      .single()

    setInviting(false)
    if (rpcError || !data) {
      setError(rpcError?.message ?? 'No se pudo invitar a ese usuario.')
      return
    }

    const invited = data as { user_id: string; username: string | null; role: BoardRole }
    setMembers((prev) => [
      ...prev,
      {
        board_id: boardId,
        user_id: invited.user_id,
        role: invited.role,
        created_at: new Date().toISOString(),
        profiles: { username: invited.username },
      } as BoardMemberWithProfile,
    ])
    setInviteUsername('')
  }

  async function handleRoleChange(userId: string, role: BoardRole) {
    const { error: updateError } = await supabase
      .from('board_members')
      .update({ role })
      .eq('board_id', boardId)
      .eq('user_id', userId)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)))
  }

  async function handleRemove(userId: string) {
    if (!window.confirm('¿Quitar a este miembro del tablero?')) return
    const { error: deleteError } = await supabase
      .from('board_members')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', userId)

    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
  }

  async function handleLeave() {
    if (!window.confirm('¿Salir de este tablero?')) return
    const { error: deleteError } = await supabase
      .from('board_members')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', currentUserId)

    if (deleteError) {
      setError(deleteError.message)
      return
    }
    onLeave()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Miembros</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-slate-500">Cargando miembros…</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {members.map((member) => (
              <li
                key={member.user_id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2"
              >
                <span className="text-sm text-slate-800">
                  {member.profiles?.username ?? '(usuario desconocido)'}
                  {member.user_id === currentUserId && (
                    <span className="ml-1 text-xs text-slate-400">(tú)</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {isOwner && member.user_id !== currentUserId ? (
                    <>
                      <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                        Rol de {member.profiles?.username ?? member.user_id}
                      </label>
                      <select
                        id={`role-${member.user_id}`}
                        value={member.role}
                        onChange={(e) => void handleRoleChange(member.user_id, e.target.value as BoardRole)}
                        className="cursor-pointer rounded-lg border border-border-subtle px-1.5 py-1 text-xs text-slate-700"
                      >
                        <option value="owner">Propietario</option>
                        <option value="member">Miembro</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleRemove(member.user_id)}
                        className="cursor-pointer rounded-lg px-1.5 py-1 text-xs text-danger transition-colors hover:bg-danger-light"
                      >
                        Quitar
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">{ROLE_LABELS[member.role]}</span>
                  )}
                  {!isOwner && member.user_id === currentUserId && (
                    <button
                      type="button"
                      onClick={() => void handleLeave()}
                      className="cursor-pointer rounded-lg px-1.5 py-1 text-xs text-danger transition-colors hover:bg-danger-light"
                    >
                      Salir del tablero
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isOwner && (
          <form onSubmit={handleInvite} className="flex flex-col gap-2 border-t border-border-subtle pt-3">
            <label htmlFor="invite-username" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Invitar por nombre de usuario o correo
            </label>
            <div className="flex gap-2">
              <input
                id="invite-username"
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="nombre de usuario o correo"
                className="flex-1 rounded-lg border border-border-subtle px-2 py-1.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                disabled={inviting || !inviteUsername.trim()}
                className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Invitar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
