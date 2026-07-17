import { describe, it, expect } from 'vitest'
import { buildDanoActivo } from '@/lib/usages/danoActivo'

describe('buildDanoActivo', () => {
  const now = '2026-07-09T12:00:00.000Z'
  it('arma el objeto sin claves undefined y normaliza a null', () => {
    const d = buildDanoActivo({}, 'admin', null, now)
    expect(d).toEqual({ nota: null, fotoPath: null, reportadoPor: 'admin', reportadoPorNombre: null, reportadoEn: now })
    expect(Object.values(d).includes(undefined as never)).toBe(false)
  })
  it('recorta la nota y guarda el conductor', () => {
    const d = buildDanoActivo({ nota: '  rayón en la puerta  ', fotoPath: 'vehicles/v1/dano/x' }, 'conductor', 'Ana', now)
    expect(d.nota).toBe('rayón en la puerta')
    expect(d.fotoPath).toBe('vehicles/v1/dano/x')
    expect(d.reportadoPor).toBe('conductor')
    expect(d.reportadoPorNombre).toBe('Ana')
  })
  it('nota vacía → null; tope 500', () => {
    expect(buildDanoActivo({ nota: '   ' }, 'admin', null, now).nota).toBeNull()
    expect(buildDanoActivo({ nota: 'x'.repeat(600) }, 'admin', null, now).nota!.length).toBe(500)
  })
})
