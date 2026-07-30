import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pasosDe, type Senales } from '@/lib/onboarding/pasos'
import { tabDesdeHash } from '@/lib/vehicles/tabs'

/**
 * Los enlaces del checklist apuntan a pestañas y anclas de otras páginas, y
 * **un destino equivocado no rompe ni el build ni ningún otro test**: la página
 * carga igual, solo que en la sección que no era. Ya pasó una vez: el paso
 * "Vincula el chip NFC" abría Documentos.
 */
const VACIAS: Senales = {
  vehiculos: 1,
  documentos: 0,
  primerVehiculoId: 'v1',
  razonSocial: '',
  categorias: 0,
  pautaConfigurada: false,
  miembros: 1,
  invitacionesPendientes: 0,
  conductores: 0,
  vistos: [],
}

const PASOS = pasosDe('empresa', VACIAS)
const hrefDe = (id: string) => PASOS.find((p) => p.id === id)!.href

describe('enlaces a la ficha del vehículo', () => {
  it('cada uno abre la pestaña que su paso promete', () => {
    const esperado: Record<string, string> = { documentos: 'documentos', chip: 'ajustes' }
    for (const [paso, tab] of Object.entries(esperado)) {
      const href = hrefDe(paso)!
      const hash = href.slice(href.indexOf('#'))
      expect(tabDesdeHash(hash).tab, `el paso "${paso}" debe abrir la pestaña ${tab}`).toBe(tab)
    }
  })
})

describe('enlaces a Configuración', () => {
  // Leemos la página de verdad: un ancla renombrada allá dejaría estos enlaces
  // apuntando al vacío sin que nada más lo note.
  const fuente = readFileSync('app/(app)/configuracion/page.tsx', 'utf8')

  it('cada ancla existe como id en la página', () => {
    const anclas = PASOS.map((p) => p.href)
      .filter((h): h is string => Boolean(h?.startsWith('/configuracion#')))
      .map((h) => h.split('#')[1])

    expect(anclas.sort()).toEqual(['categorias', 'conductores', 'equipo', 'mantencion'])
    for (const ancla of anclas) {
      expect(fuente, `falta id="${ancla}" en /configuracion`).toContain(`id="${ancla}"`)
    }
  })
})

describe('enlaces a rutas propias', () => {
  it('apuntan a páginas que existen', () => {
    const rutas = { vehiculo: '/dashboard', empresa: '/configuracion', reportes: '/reportes' }
    for (const [paso, ruta] of Object.entries(rutas)) {
      expect(hrefDe(paso)).toBe(ruta)
      expect(() => readFileSync(`app/(app)${ruta}/page.tsx`, 'utf8')).not.toThrow()
    }
  })
})
