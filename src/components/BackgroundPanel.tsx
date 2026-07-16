import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { sanitizeFileName } from '../lib/storage'
import type { Board } from '../types'

interface BackgroundPanelProps {
  board: Board
  onClose: () => void
  onBackgroundChange: (updates: Partial<Pick<Board, 'background_color' | 'background_image_path'>>) => void
}

export function BackgroundPanel({ board, onClose, onBackgroundChange }: BackgroundPanelProps) {
  const [color, setColor] = useState(board.background_color)
  const [applyingColor, setApplyingColor] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-sm rounded-2xl bg-surface p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Fondo</h2>
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

        <div className="flex flex-col gap-2 border-b border-border-subtle pb-4">
          <label htmlFor="background-color" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Color sólido
          </label>
          <div className="flex items-center gap-2">
            <input
              id="background-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-lg border border-border-subtle"
            />
            <button
              type="button"
              onClick={() => void handleApplyColor()}
              disabled={applyingColor}
              className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applyingColor ? 'Aplicando…' : 'Aplicar color'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <label htmlFor="background-image" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Foto de fondo
          </label>
          <input
            id="background-image"
            type="file"
            accept="image/*"
            onChange={(e) => void handleFileChange(e)}
            disabled={uploading}
            className="text-sm text-slate-700 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 file:transition-colors hover:file:bg-slate-200"
          />
          {uploading && <p className="text-sm text-slate-500">Subiendo imagen…</p>}
        </div>
      </div>
    </div>
  )
}
