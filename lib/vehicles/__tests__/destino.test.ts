import { describe, it, expect } from 'vitest'
import { destinoVehiculo } from '@/lib/vehicles/destino'
import type { DocStatus } from '@/lib/documents/status'
import type { EstadoMantencion } from '@/lib/mantencion/status'

const destino = (p: { documentos?: DocStatus; mantencion?: EstadoMantencion; danoUsageId?: string | null }) =>
  destinoVehiculo({
    vehicleId: 'v1',
    documentos: p.documentos ?? 'al_dia',
    mantencion: p.mantencion ?? 'sin_pauta',
    danoUsageId: p.danoUsageId ?? null,
  })

const DOCS: DocStatus[] = ['vencido', 'por_vencer', 'al_dia', 'sin_vencimiento']
const MANTS: EstadoMantencion[] = ['vencida', 'proxima', 'al_dia', 'sin_registro', 'sin_pauta']

describe('el daño reportado gana siempre', () => {
  it('lleva al uso, no a la ficha', () => {
    expect(destino({ danoUsageId: 'u9' })).toBe('/vehiculos/v1#uso-u9')
  })

  it('incluso con documentos vencidos y mantención vencida encima', () => {
    for (const documentos of DOCS) {
      for (const mantencion of MANTS) {
        expect(destino({ danoUsageId: 'u9', documentos, mantencion })).toBe('/vehiculos/v1#uso-u9')
      }
    }
  })
})

describe('gravedad primero: lo que ya pasó gana a lo que va a pasar', () => {
  it('documentos vencidos le ganan a una mantención próxima', () => {
    // Este es el caso que motivó el cambio: antes ganaba la mantención.
    expect(destino({ documentos: 'vencido', mantencion: 'proxima' })).toBe('/vehiculos/v1#documentos')
  })

  it('una mantención vencida le gana a documentos por vencer', () => {
    expect(destino({ documentos: 'por_vencer', mantencion: 'vencida' })).toBe('/vehiculos/v1#mantencion')
  })

  it('una mantención próxima gana si los documentos están al día', () => {
    expect(destino({ documentos: 'al_dia', mantencion: 'proxima' })).toBe('/vehiculos/v1#mantencion')
    expect(destino({ documentos: 'sin_vencimiento', mantencion: 'proxima' })).toBe('/vehiculos/v1#mantencion')
  })
})

describe('a igual gravedad gana Documentos', () => {
  it('con ambos vencidos', () => {
    expect(destino({ documentos: 'vencido', mantencion: 'vencida' })).toBe('/vehiculos/v1#documentos')
  })

  it('con ambos por vencer', () => {
    expect(destino({ documentos: 'por_vencer', mantencion: 'proxima' })).toBe('/vehiculos/v1#documentos')
  })
})

describe('sin ninguna alerta', () => {
  it('cae en Documentos, que es la pestaña por defecto de la ficha', () => {
    for (const mantencion of ['al_dia', 'sin_registro', 'sin_pauta'] as EstadoMantencion[]) {
      expect(destino({ documentos: 'al_dia', mantencion })).toBe('/vehiculos/v1#documentos')
    }
  })

  it('los estados sin alerta de mantención nunca desvían el clic', () => {
    for (const mantencion of ['al_dia', 'sin_registro', 'sin_pauta'] as EstadoMantencion[]) {
      expect(destino({ documentos: 'vencido', mantencion })).toBe('/vehiculos/v1#documentos')
    }
  })
})

describe('cobertura de la tabla', () => {
  it('toda combinación produce una ruta de la ficha del vehículo', () => {
    for (const documentos of DOCS) {
      for (const mantencion of MANTS) {
        expect(destino({ documentos, mantencion })).toMatch(/^\/vehiculos\/v1#(documentos|mantencion)$/)
      }
    }
  })
})
