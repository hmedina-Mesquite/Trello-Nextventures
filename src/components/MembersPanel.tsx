import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { BoardMemberWithProfile, BoardRole } from '../types'

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
    const username = inviteUsername.trim()
    if (!username) return
    setInviting(true)
    setError(null)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', username)
      .maybeSingle()

    if (profileError || !profile) {
      setError(`No user found with username "${username}"`)
      setInviting(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('board_members')
      .insert({ board_id: boardId, user_id: profile.id, role: 'member' })
      .select('*, profiles(username)')
      .single()

    setInviting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    setMembers((prev) => [...prev, data as BoardMemberWithProfile])
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
    if (!window.confirm('Remove this member from the board?')) return
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
    if (!window.confirm('Leave this board?')) return
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
        className="mt-10 w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Members</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500">Loading members…</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {members.map((member) => (
              <li
                key={member.user_id}
                className="flex items-center justify-between gap-2 rounded border border-gray-100 px-3 py-2"
              >
                <span className="text-sm text-gray-800">
                  {member.profiles?.username ?? '(unknown user)'}
                  {member.user_id === currentUserId && (
                    <span className="ml-1 text-xs text-gray-400">(you)</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {isOwner && member.user_id !== currentUserId ? (
                    <>
                      <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                        Role for {member.profiles?.username ?? member.user_id}
                      </label>
                      <select
                        id={`role-${member.user_id}`}
                        value={member.role}
                        onChange={(e) => void handleRoleChange(member.user_id, e.target.value as BoardRole)}
                        className="rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-700"
                      >
                        <option value="owner">Owner</option>
                        <option value="member">Member</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleRemove(member.user_id)}
                        className="rounded px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-xs capitalize text-gray-500">{member.role}</span>
                  )}
                  {!isOwner && member.user_id === currentUserId && (
                    <button
                      type="button"
                      onClick={() => void handleLeave()}
                      className="rounded px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Leave board
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isOwner && (
          <form onSubmit={handleInvite} className="flex flex-col gap-2 border-t border-gray-200 pt-3">
            <label htmlFor="invite-username" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Invite by username
            </label>
            <div className="flex gap-2">
              <input
                id="invite-username"
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="username"
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={inviting || !inviteUsername.trim()}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Invite
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
