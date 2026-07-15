import { describe, it, expect } from 'vitest'
import { kmDeUsos } from '@/lib/usages/km'

describe('kmDeUsos', () => {
  it('sin usos o sin lecturas → null', () => {
    expect(kmDeUsos([])).toBeNull()
    expect(kmDeUsos([{ km: null }, { km: undefined }])).toBeNull()
  })
  it('toma el km máximo e ignora null', () => {
    const r = kmDeUsos([
      { km: 1000, entregadoEn: '2026-01-01' },
      { km: null, entregadoEn: '2026-02-01' },
      { km: 4200, entregadoEn: '2026-03-01' },
      { km: 3000, entregadoEn: '2026-04-01' },
    ])
    expect(r).toEqual({ km: 4200, fecha: '2026-03-01' })
  })
  it('usa createdAt cuando no hay entregadoEn', () => {
    expect(kmDeUsos([{ km: 500, createdAt: '2026-05-01' }])).toEqual({ km: 500, fecha: '2026-05-01' })
  })
  it('ignora km negativo o no numérico', () => {
    expect(kmDeUsos([{ km: -5 }, { km: 10, entregadoEn: '2026-01-01' }])).toEqual({ km: 10, fecha: '2026-01-01' })
  })
})
