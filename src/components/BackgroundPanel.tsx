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
        className="mt-10 w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Fondo</h2>
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

        <div className="flex flex-col gap-2 border-b border-gray-200 pb-4">
          <label htmlFor="background-color" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Color sólido
          </label>
          <div className="flex items-center gap-2">
            <input
              id="background-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-gray-300"
            />
            <button
              type="button"
              onClick={() => void handleApplyColor()}
              disabled={applyingColor}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {applyingColor ? 'Aplicando…' : 'Aplicar color'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <label htmlFor="background-image" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Foto de fondo
          </label>
          <input
            id="background-image"
            type="file"
            accept="image/*"
            onChange={(e) => void handleFileChange(e)}
            disabled={uploading}
            className="text-sm text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
          {uploading && <p className="text-sm text-gray-500">Subiendo imagen…</p>}
        </div>
      </div>
    </div>
  )
}
