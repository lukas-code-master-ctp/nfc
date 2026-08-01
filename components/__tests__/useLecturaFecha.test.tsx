import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ primeraImagen: vi.fn() }))
vi.mock('@/lib/documentos/primeraImagen', () => ({ primeraImagen: mocks.primeraImagen }))

import { useLecturaFecha } from '@/components/documento/useLecturaFecha'
import type { Pagina } from '@/lib/documentos/paginas'

const pagina = (id: string): Pagina => ({ id, file: new File(['x'], id, { type: 'image/jpeg' }) })

/** Respuesta del endpoint. */
const responde = (fecha: string | null) =>
  vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ fecha }) } as unknown as Response))

beforeEach(() => {
  mocks.primeraImagen.mockReset()
  mocks.primeraImagen.mockResolvedValue('data:image/jpeg;base64,AAAA')
})

describe('sin página', () => {
  it('no lee nada', async () => {
    const alLeer = vi.fn()
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(undefined, alLeer))
    expect(result.current).toBe('no')
    expect(fetch).not.toHaveBeenCalled()
    expect(alLeer).not.toHaveBeenCalled()
  })
})

describe('con una página', () => {
  it('entrega la fecha leída', async () => {
    const alLeer = vi.fn()
    vi.stubGlobal('fetch', responde('2027-04-03'))
    renderHook(() => useLecturaFecha(pagina('p1'), alLeer))
    await waitFor(() => expect(alLeer).toHaveBeenCalledWith('2027-04-03'))
  })

  it('queda en "lista" cuando llegó la fecha', async () => {
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), vi.fn()))
    await waitFor(() => expect(result.current).toBe('lista'))
  })

  it('si el modelo no leyó nada, no avisa ni deja el aviso puesto', async () => {
    const alLeer = vi.fn()
    vi.stubGlobal('fetch', responde(null))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), alLeer))
    await waitFor(() => expect(result.current).toBe('no'))
    expect(alLeer).not.toHaveBeenCalled()
  })

  it('si la imagen no se pudo preparar, no llama al endpoint', async () => {
    mocks.primeraImagen.mockResolvedValue(null)
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), vi.fn()))
    await waitFor(() => expect(result.current).toBe('no'))
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('la carrera al cambiar de página', () => {
  // Sin el corte, la respuesta de la página vieja llega después y escribe la
  // fecha del documento anterior, en silencio, sobre un documento distinto.
  it('descarta el resultado de una página que ya no está', async () => {
    const alLeer = vi.fn()
    let resolverPrimera: ((v: unknown) => void) | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        resolverPrimera
          ? Promise.resolve({ ok: true, json: () => Promise.resolve({ fecha: '2030-01-01' }) } as unknown as Response)
          : new Promise((r) => {
              resolverPrimera = r as (v: unknown) => void
            }),
      ),
    )

    const { rerender } = renderHook(({ p }) => useLecturaFecha(p, alLeer), {
      initialProps: { p: pagina('vieja') },
    })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    // Cambia la página ANTES de que responda la primera lectura.
    rerender({ p: pagina('nueva') })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    // Ahora responde la vieja: no debe aplicarse.
    resolverPrimera!({ ok: true, json: () => Promise.resolve({ fecha: '1999-01-01' }) })

    await waitFor(() => expect(alLeer).toHaveBeenCalledWith('2030-01-01'))
    expect(alLeer).not.toHaveBeenCalledWith('1999-01-01')
  })
})

describe('cuando la red falla', () => {
  it('no explota: leer la fecha es un extra', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), vi.fn()))
    await waitFor(() => expect(result.current).toBe('no'))
  })
})
