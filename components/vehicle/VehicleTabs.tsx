'use client'
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { tabDesdeHash, TABS_FICHA, type TabFicha } from '@/lib/vehicles/tabs'

// useLayoutEffect en el cliente (evita el parpadeo de pestaña en deep-links);
// useEffect en SSR para no gatillar el warning de React en el servidor.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const LABELS: Record<TabFicha, string> = {
  documentos: 'Documentos',
  vehiculo: 'Vehículo',
  bitacora: 'Bitácora',
  ajustes: 'Ajustes',
}

export default function VehicleTabs({
  documentos,
  vehiculo,
  bitacora,
  ajustes,
}: {
  documentos: ReactNode
  vehiculo: ReactNode
  bitacora: ReactNode
  ajustes: ReactNode
}) {
  const [activa, setActiva] = useState<TabFicha>('documentos')

  // Sincroniza la pestaña con el hash de la URL: al montar y ante atrás/adelante
  // del navegador (evento `hashchange`). Un hash `uso-{id}` abre la Bitácora y
  // hace scroll al <li id="uso-{id}"> una vez que es visible.
  useIsoLayoutEffect(() => {
    function sync() {
      const { tab, scrollA } = tabDesdeHash(window.location.hash)
      setActiva(tab)
      if (scrollA) {
        requestAnimationFrame(() => document.getElementById(scrollA)?.scrollIntoView())
      }
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  // Navegar al fragmento dispara `hashchange` → sync() actualiza la pestaña y
  // suma una entrada al historial (atrás/adelante funcionan). Usamos assign()
  // en vez de asignar location.hash para no mutar una referencia externa.
  function irA(tab: TabFicha) {
    window.location.assign(`#${tab}`)
  }

  const slots: Record<TabFicha, ReactNode> = { documentos, vehiculo, bitacora, ajustes }

  return (
    <div className="space-y-6">
      <nav
        className="flex gap-1 overflow-x-auto border-b border-linea"
        role="tablist"
        aria-label="Secciones del vehículo"
      >
        {TABS_FICHA.map((id) => {
          const sel = id === activa
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={sel}
              onClick={() => irA(id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                sel ? 'border-azul text-azul' : 'border-transparent text-acero hover:text-tinta'
              }`}
            >
              {LABELS[id]}
            </button>
          )
        })}
      </nav>
      {TABS_FICHA.map((id) => (
        <div key={id} role="tabpanel" hidden={id !== activa}>
          {slots[id]}
        </div>
      ))}
    </div>
  )
}
