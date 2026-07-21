import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import type { Card, ListWithCards } from '../types'

// Bundlers break Leaflet's default marker icon lookup (it expects to find
// its images relative to a script URL that doesn't exist post-bundling) --
// the standard fix is pointing it at the bundler-resolved image imports
// instead. Module-level (runs once), not per-render.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

interface MapViewProps {
  lists: ListWithCards[]
  onSelectCard: (cardId: string) => void
}

export function MapView({ lists, onSelectCard }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])

  const located = lists.flatMap((list) =>
    list.cards
      .filter((c): c is Card & { location_data: { lat: number; lng: number } } => Boolean(c.location_data))
      .map((card) => ({ card, listName: list.name })),
  )

  // Only re-sync the map's markers when the actual set of located
  // cards/coordinates changes, not on every unrelated board re-render.
  const locatedKey = useMemo(
    () =>
      located
        .map(({ card }) => `${card.id}:${card.location_data.lat}:${card.location_data.lng}:${card.complete}`)
        .join('|'),
    [located],
  )

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current).setView([20, 0], 2)
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const marker of markersRef.current) marker.remove()
    markersRef.current = located.map(({ card, listName }) => {
      const marker = L.marker([card.location_data.lat, card.location_data.lng])
        .addTo(map)
        .bindPopup(`<strong>${escapeHtml(card.title)}</strong><br/>${escapeHtml(listName)}`)
      marker.on('click', () => onSelectCard(card.id))
      return marker
    })

    if (located.length === 1) {
      map.setView([located[0].card.location_data.lat, located[0].card.location_data.lng], 13)
    } else if (located.length > 1) {
      map.fitBounds(L.latLngBounds(located.map(({ card }) => [card.location_data.lat, card.location_data.lng])), {
        padding: [32, 32],
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locatedKey])

  return (
    <div className="p-3 sm:p-4">
      <div className="relative">
        <div
          ref={containerRef}
          className="h-[20rem] w-full rounded-xl border border-border-subtle shadow-card sm:h-[28rem]"
        />
        {located.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2 rounded-xl bg-surface/90 px-4 text-center text-slate-400">
            <p className="text-sm">No hay tarjetas con ubicación.</p>
            <p className="text-xs">Abre una tarjeta y usa "Ubicación" para agregarle una.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
