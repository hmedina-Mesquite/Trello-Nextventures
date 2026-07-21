import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { sanitizeFileName } from '../lib/storage'
import { useAuth } from '../contexts/AuthContext'
import type { Board } from '../types'

interface BackgroundPanelProps {
  board: Board
  isOwner: boolean
  onClose: () => void
  onBackgroundChange: (updates: Partial<Pick<Board, 'background_color' | 'background_image_path'>>) => void
  onUserBackgroundChange: (
    updates: Partial<Pick<Board, 'userBackgroundColor' | 'userBackgroundImage'>>,
  ) => void
}

export function BackgroundPanel({
  board,
  isOwner,
  onClose,
  onBackgroundChange,
  onUserBackgroundChange,
}: BackgroundPanelProps) {
  const { user } = useAuth()
  const [color, setColor] = useState(board.background_color)
  const [applyingColor, setApplyingColor] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [myColor, setMyColor] = useState(board.userBackgroundColor ?? '#4f46e5')
  const [savingMyColor, setSavingMyColor] = useState(false)
  const [uploadingMyImage, setUploadingMyImage] = useState(false)
  const [myError, setMyError] = useState<string | null>(null)

  async function handleApplyColor() {
    setApplyingColor(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('boards')
      .update({ background_color: color, background_image_path: null })
      .eq('id', board.id)

    setApplyingColor(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onBackgroundChange({ background_color: color, background_image_path: null })
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)

    const path = `${board.id}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
    const { error: uploadError } = await supabase.storage
      .from('board-backgrounds')
      .upload(path, file)

    if (uploadError) {
      setUploading(false)
      setError(uploadError.message)
      return
    }

    const { error: updateError } = await supabase
      .from('boards')
      .update({ background_image_path: path })
      .eq('id', board.id)

    setUploading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onBackgroundChange({ background_image_path: path })
  }

  async function applyMyOverride(updates: { color?: string | null; imagePath?: string | null }) {
    const nextColor = updates.color !== undefined ? updates.color : (board.userBackgroundColor ?? null)
    const nextImagePath =
      updates.imagePath !== undefined ? updates.imagePath : (board.userBackgroundImage ?? null)

    const { error: rpcError } = await supabase.rpc('upsert_user_board_background', {
      p_board_id: board.id,
      p_color: nextColor,
      p_image_path: nextImagePath,
    })
    if (rpcError) {
      setMyError(rpcError.message)
      return false
    }
    onUserBackgroundChange({ userBackgroundColor: nextColor, userBackgroundImage: nextImagePath })
    return true
  }

  async function handleApplyMyColor() {
    setSavingMyColor(true)
    setMyError(null)
    await applyMyOverride({ color: myColor })
    setSavingMyColor(false)
  }

  async function handleClearMyColor() {
    setSavingMyColor(true)
    setMyError(null)
    await applyMyOverride({ color: null })
    setSavingMyColor(false)
  }

  async function handleMyFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return

    setUploadingMyImage(true)
    setMyError(null)

    const path = `${board.id}/user/${user.id}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
    const { error: uploadError } = await supabase.storage.from('board-backgrounds').upload(path, file)
    if (uploadError) {
      setUploadingMyImage(false)
      setMyError(uploadError.message)
      return
    }

    await applyMyOverride({ imagePath: path })
    setUploadingMyImage(false)
  }

  async function handleClearMyImage() {
    setUploadingMyImage(true)
    setMyError(null)
    await applyMyOverride({ imagePath: null })
    setUploadingMyImage(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="mt-4 w-full max-w-sm rounded-2xl bg-surface p-4 shadow-elevated sm:mt-10 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Fondo</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {isOwner && (
          <>
            {error && <p className="mb-3 rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{error}</p>}

            <div className="flex flex-col gap-2 border-b border-border-subtle pb-4">
              <label htmlFor="background-color" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Color sólido (todo el tablero)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="background-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-11 w-14 cursor-pointer rounded-lg border border-border-subtle"
                />
                <button
                  type="button"
                  onClick={() => void handleApplyColor()}
                  disabled={applyingColor}
                  className="cursor-pointer rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {applyingColor ? 'Aplicando…' : 'Aplicar color'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-b border-border-subtle py-4">
              <label htmlFor="background-image" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Foto de fondo (todo el tablero)
              </label>
              <input
                id="background-image"
                type="file"
                accept="image/*"
                onChange={(e) => void handleFileChange(e)}
                disabled={uploading}
                className="text-sm text-slate-700 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 file:transition-colors hover:file:bg-slate-200"
              />
              {uploading && <p className="text-sm text-slate-500">Subiendo imagen…</p>}
            </div>
          </>
        )}

        <div className={`flex flex-col gap-3 ${isOwner ? 'pt-4' : ''}`}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mi fondo personalizado
          </h3>
          <p className="-mt-1 text-xs text-slate-400">
            Solo tú ves este fondo; no cambia lo que ven los demás miembros.
          </p>

          {myError && <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{myError}</p>}

          <div className="flex flex-col gap-2">
            <label htmlFor="my-background-color" className="text-xs font-medium text-slate-600">
              Color
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="my-background-color"
                type="color"
                value={myColor}
                onChange={(e) => setMyColor(e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-lg border border-border-subtle"
              />
              <button
                type="button"
                onClick={() => void handleApplyMyColor()}
                disabled={savingMyColor}
                className="cursor-pointer rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingMyColor ? 'Aplicando…' : 'Aplicar'}
              </button>
              {board.userBackgroundColor && (
                <button
                  type="button"
                  onClick={() => void handleClearMyColor()}
                  disabled={savingMyColor}
                  className="cursor-pointer rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100"
                >
                  Quitar
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="my-background-image" className="text-xs font-medium text-slate-600">
              Foto
            </label>
            <input
              id="my-background-image"
              type="file"
              accept="image/*"
              onChange={(e) => void handleMyFileChange(e)}
              disabled={uploadingMyImage}
              className="text-sm text-slate-700 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 file:transition-colors hover:file:bg-slate-200"
            />
            {uploadingMyImage && <p className="text-sm text-slate-500">Subiendo imagen…</p>}
            {board.userBackgroundImage && (
              <button
                type="button"
                onClick={() => void handleClearMyImage()}
                disabled={uploadingMyImage}
                className="cursor-pointer self-start text-xs text-slate-500 underline transition-colors hover:text-slate-700"
              >
                Quitar mi foto
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
