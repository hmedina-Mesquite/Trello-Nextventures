import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Label } from '../types'

const LABEL_COLORS = [
  { name: 'verde', hex: '#61bd4f' },
  { name: 'amarillo', hex: '#f2d600' },
  { name: 'naranja', hex: '#ff9f1a' },
  { name: 'rojo', hex: '#eb5a46' },
  { name: 'morado', hex: '#c377e0' },
  { name: 'azul', hex: '#0079bf' },
  { name: 'celeste', hex: '#00c2e0' },
  { name: 'verde lima', hex: '#51e898' },
]

interface LabelsPanelProps {
  labels: Label[]
  onClose: () => void
  onCreate: (name: string, color: string) => void
  onDelete: (labelId: string) => void
}

export function LabelsPanel({ labels, onClose, onCreate, onDelete }: LabelsPanelProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(LABEL_COLORS[0].hex)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim(), color)
    setName('')
    setColor(LABEL_COLORS[0].hex)
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
          <h2 className="text-lg font-semibold text-gray-900">Etiquetas</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <ul className="mb-4 flex flex-col gap-2">
          {labels.length === 0 && <li className="text-sm text-gray-500">Aún no hay etiquetas.</li>}
          {labels.map((label) => (
            <li
              key={label.id}
              className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
              style={{ backgroundColor: label.color }}
            >
              <span className="text-sm font-medium text-white drop-shadow">
                {label.name || '(sin nombre)'}
              </span>
              <button
                type="button"
                onClick={() => onDelete(label.id)}
                className="rounded bg-black/20 px-1.5 py-0.5 text-xs text-white hover:bg-black/40"
                aria-label={`Eliminar etiqueta ${label.name}`}
                title="Eliminar etiqueta"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-gray-200 pt-3">
          <label htmlFor="label-name" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Nueva etiqueta
          </label>
          <input
            id="label-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de la etiqueta"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {LABEL_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                className={`h-6 w-6 rounded ${color === c.hex ? 'ring-2 ring-gray-800 ring-offset-1' : ''}`}
                style={{ backgroundColor: c.hex }}
                aria-label={`Elegir color ${c.name}`}
                title={c.name}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="self-start rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Agregar etiqueta
          </button>
        </form>
      </div>
    </div>
  )
}
