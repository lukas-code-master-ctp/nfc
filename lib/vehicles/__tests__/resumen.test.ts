import { describe, it, expect, vi } from 'vitest'
import { resolverResumen } from '@/lib/vehicles/resumen'

const ULTIMA = { km: 30000, fecha: '2026-05-01' }

function cargas(docs = [{ fechaVencimiento: '2026-09-01' }], ultima = ULTIMA) {
  return {
    cargarDocumentos: vi.fn().mockResolvedValue(docs),
    cargarUltimaMantencion: vi.fn().mockResolvedValue(ultima),
  }
}

describe('resolverResumen', () => {
  it('con ambos resúmenes guardados no consulta nada', async () => {
    const c = cargas()
    const r = await resolverResumen(
      {
        id: 'v1',
        resumenDocs: { total: 3, proximoVencimiento: '2026-08-10' },
        resumenMantencion: { ultima: ULTIMA },
      },
      c,
    )
    expect(c.cargarDocumentos).not.toHaveBeenCalled()
    expect(c.cargarUltimaMantencion).not.toHaveBeenCalled()
    expect(r).toEqual({ docs: { total: 3, proximoVencimiento: '2026-08-10' }, ultimaMantencion: ULTIMA })
  })

  it('sin resumen de documentos los consulta y los resume', async () => {
    const c = cargas([{ fechaVencimiento: '2026-09-01' }, { fechaVencimiento: '2026-08-10' }])
    const r = await resolverResumen({ id: 'v1', resumenMantencion: { ultima: null } }, c)
    expect(c.cargarDocumentos).toHaveBeenCalledWith('v1')
    expect(r.docs).toEqual({ total: 2, proximoVencimiento: '2026-08-10' })
  })

  it('sin resumen de mantención la consulta', async () => {
    const c = cargas()
    const r = await resolverResumen({ id: 'v1', resumenDocs: { total: 0, proximoVencimiento: null } }, c)
    expect(c.cargarUltimaMantencion).toHaveBeenCalledWith('v1')
    expect(r.ultimaMantencion).toEqual(ULTIMA)
  })

  it('distingue "no hay mantenciones" de "no se ha calculado"', async () => {
    const c = cargas()
    const r = await resolverResumen(
      { id: 'v1', resumenDocs: { total: 0, proximoVencimiento: null }, resumenMantencion: { ultima: null } },
      c,
    )
    // El envoltorio con ultima: null significa "calculado, no hay": no debe consultar.
    expect(c.cargarUltimaMantencion).not.toHaveBeenCalled()
    expect(r.ultimaMantencion).toBeNull()
  })

  it('sin ningún resumen consulta las dos cosas', async () => {
    const c = cargas()
    await resolverResumen({ id: 'v1' }, c)
    expect(c.cargarDocumentos).toHaveBeenCalledWith('v1')
    expect(c.cargarUltimaMantencion).toHaveBeenCalledWith('v1')
  })
})
