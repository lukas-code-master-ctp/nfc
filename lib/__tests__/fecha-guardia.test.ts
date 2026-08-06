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
const PROHIBIDO = /toLocaleDateString|toLocaleTimeString|dateStyle|timeStyle/

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p)
    return /\.tsx?$/.test(n) ? [p] : []
  })
}

describe('formato de fechas', () => {
  it('solo lib/fecha.ts sabe formatear fechas', () => {
    const infractores = ['app', 'components', 'lib']
      .flatMap((d) => archivos(d))
      .filter((p) => !p.endsWith(join('lib', 'fecha.ts')))
      .filter((p) => PROHIBIDO.test(readFileSync(p, 'utf8')))

    expect(infractores).toEqual([])
  })
})
