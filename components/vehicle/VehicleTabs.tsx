'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { tabDesdeHash, TABS_FICHA, type TabFicha } from '@/lib/vehicles/tabs'

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
  useEffect(() => {
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

  // Cambiar el hash dispara `hashchange` → sync() actualiza la pestaña y suma una
  // entrada al historial, así atrás/adelante navegan entre pestañas.
  function irA(tab: TabFicha) {
    // eslint-disable-next-line react-hooks/immutability
    window.location.hash = tab
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
