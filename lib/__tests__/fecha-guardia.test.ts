import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Nada fuera de `lib/fecha.ts` puede formatear una fecha por su cuenta.
 *
 * Sin esta guardia, el próximo componente que muestre una fecha va a escribir
 * su propio `toLocaleDateString` —es lo que pasó trece veces— y vamos a
 * terminar otra vez con cinco formatos distintos conviviendo. El costo de
 * mantenerla es cero; el de descubrirlo es que un cliente vea `01-09-26`.
 */
// `new Intl\.DateTimeFormat` (y no `toLocaleString` sin más) porque es lo
// primero que alguien prueba al encontrarse `toLocaleDateString` bloqueado —
// y porque un `toLocaleString` a secas también formatea números
// (`km.toLocaleString('es-CL')`, `formatCLP`), que son 7 usos legítimos que
// esta guardia no debe tocar.
const PROHIBIDO = /toLocaleDateString|toLocaleTimeString|dateStyle|timeStyle|new Intl\.DateTimeFormat/

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p)
    return /\.tsx?$/.test(n) ? [p] : []
  })
}

// Los dos únicos archivos con permiso para construir un `Intl.DateTimeFormat`
// a mano: `lib/fecha.ts` (el módulo dueño del formato) y
// `lib/documents/status.ts` (dueño de `hoyEnChile`, que necesita el mismo
// truco de zona horaria para saber qué día es "hoy" en Chile).
const PERMITIDOS = [join('lib', 'fecha.ts'), join('lib', 'documents', 'status.ts')]

describe('formato de fechas', () => {
  it('solo lib/fecha.ts (y hoyEnChile) saben formatear fechas', () => {
    const infractores = ['app', 'components', 'lib']
      .flatMap((d) => archivos(d))
      .filter((p) => !PERMITIDOS.some((permitido) => p.endsWith(permitido)))
      .filter((p) => PROHIBIDO.test(readFileSync(p, 'utf8')))

    expect(infractores).toEqual([])
  })
})
