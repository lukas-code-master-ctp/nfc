import { describe, it, expect } from 'vitest'
import { resumirDocumentos } from '@/lib/documents/resumen'
import { documentStatus, worstStatus, type DocStatus } from '@/lib/documents/status'

const AHORA = new Date('2026-07-28T12:00:00-04:00')

function doc(fechaVencimiento: string | null) {
  return { fechaVencimiento }
}

// Cada caso es una lista de documentos de un vehículo.
const CASOS: { nombre: string; docs: { fechaVencimiento: string | null }[] }[] = [
  { nombre: 'sin documentos', docs: [] },
  { nombre: 'solo el padrón, que no vence', docs: [doc(null)] },
  { nombre: 'todos al día', docs: [doc('2027-01-15'), doc('2026-12-01')] },
  { nombre: 'uno por vencer entre varios al día', docs: [doc('2027-01-15'), doc('2026-08-10')] },
  { nombre: 'uno vencido arrastra el resto', docs: [doc('2027-01-15'), doc('2026-01-01')] },
  { nombre: 'padrón sin fecha junto a uno vencido', docs: [doc(null), doc('2026-01-01')] },
  { nombre: 'padrón sin fecha junto a uno al día', docs: [doc(null), doc('2027-01-15')] },
]

describe('equivalencia con worstStatus (el test que sostiene la denormalización)', () => {
  for (const caso of CASOS) {
    it(`coincide: ${caso.nombre}`, () => {
      const statuses: DocStatus[] = caso.docs.map((d) => documentStatus(d.fechaVencimiento, AHORA))
      const viaLista = worstStatus(statuses)
      const viaResumen = documentStatus(resumirDocumentos(caso.docs).proximoVencimiento, AHORA)
      expect(viaResumen).toBe(viaLista)
    })
  }
})

describe('resumirDocumentos', () => {
  it('cuenta todos los documentos, incluidos los que no vencen', () => {
    expect(resumirDocumentos([doc(null), doc('2027-01-15')]).total).toBe(2)
  })
  it('elige la fecha más próxima, sin importar el orden de la lista', () => {
    expect(resumirDocumentos([doc('2027-01-15'), doc('2026-08-10'), doc('2026-12-01')]).proximoVencimiento)
      .toBe('2026-08-10')
  })
  it('ignora los documentos sin fecha al elegir la más próxima', () => {
    expect(resumirDocumentos([doc(null), doc('2027-01-15')]).proximoVencimiento).toBe('2027-01-15')
  })
  it('sin documentos que venzan, la fecha es null', () => {
    expect(resumirDocumentos([doc(null), doc(null)])).toEqual({ total: 2, proximoVencimiento: null })
  })
  it('sin documentos, total 0 y fecha null', () => {
    expect(resumirDocumentos([])).toEqual({ total: 0, proximoVencimiento: null })
  })
})
