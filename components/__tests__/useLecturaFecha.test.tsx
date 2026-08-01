import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ primeraImagen: vi.fn() }))
vi.mock('@/lib/documentos/primeraImagen', () => ({ primeraImagen: mocks.primeraImagen }))

import { useLecturaFecha, type ManejadoresLecturaFecha } from '@/components/documento/useLecturaFecha'
import type { Pagina } from '@/lib/documentos/paginas'

const pagina = (id: string): Pagina => ({ id, file: new File(['x'], id, { type: 'image/jpeg' }) })

/** Respuesta del endpoint. */
const responde = (fecha: string | null) =>
  vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ fecha }) } as unknown as Response))

/** Manejadores por defecto: `alLeer` aplica siempre (devuelve `true`). */
const manejadores = (alLeer: (fecha: string) => boolean = () => true, alEmpezar = vi.fn()): ManejadoresLecturaFecha => ({
  alEmpezar,
  alLeer,
})

beforeEach(() => {
  mocks.primeraImagen.mockReset()
  mocks.primeraImagen.mockResolvedValue('data:image/jpeg;base64,AAAA')
})

describe('sin página', () => {
  it('no lee nada', async () => {
    const alLeer = vi.fn(() => true)
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(undefined, manejadores(alLeer)))
    expect(result.current).toBe('no')
    expect(fetch).not.toHaveBeenCalled()
    expect(alLeer).not.toHaveBeenCalled()
  })
})

describe('con una página', () => {
  it('entrega la fecha leída', async () => {
    const alLeer = vi.fn(() => true)
    vi.stubGlobal('fetch', responde('2027-04-03'))
    renderHook(() => useLecturaFecha(pagina('p1'), manejadores(alLeer)))
    await waitFor(() => expect(alLeer).toHaveBeenCalledWith('2027-04-03'))
  })

  it('queda en "lista" cuando llegó la fecha y se aplicó', async () => {
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), manejadores(() => true)))
    await waitFor(() => expect(result.current).toBe('lista'))
  })

  it('si el modelo no leyó nada, no avisa ni deja el aviso puesto', async () => {
    const alLeer = vi.fn(() => true)
    vi.stubGlobal('fetch', responde(null))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), manejadores(alLeer)))
    await waitFor(() => expect(result.current).toBe('no'))
    expect(alLeer).not.toHaveBeenCalled()
  })

  it('si la imagen no se pudo preparar, no llama al endpoint', async () => {
    mocks.primeraImagen.mockResolvedValue(null)
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), manejadores(() => true)))
    await waitFor(() => expect(result.current).toBe('no'))
    expect(fetch).not.toHaveBeenCalled()
  })
})

// I1: el aviso ("lista") solo puede afirmar que la fecha se aplicó de verdad.
describe('I1: el estado no puede mentir sobre si la fecha se aplicó', () => {
  it('si `alLeer` no aplica la fecha, el estado no queda en "lista"', async () => {
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), manejadores(() => false)))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await waitFor(() => expect(result.current).toBe('no'))
  })
})

describe('alEmpezar: se avisa al arrancar cada lectura nueva', () => {
  it('se llama al montar con una página, y de nuevo al cambiar de página', async () => {
    const alEmpezar = vi.fn()
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { rerender } = renderHook(({ p }) => useLecturaFecha(p, manejadores(() => true, alEmpezar)), {
      initialProps: { p: pagina('p1') as Pagina | undefined },
    })
    expect(alEmpezar).toHaveBeenCalledTimes(1)

    rerender({ p: pagina('p2') })
    expect(alEmpezar).toHaveBeenCalledTimes(2)

    // También al perder la página (ej. el usuario la borra sin elegir otra).
    rerender({ p: undefined })
    expect(alEmpezar).toHaveBeenCalledTimes(3)
  })
})

describe('la carrera al cambiar de página', () => {
  // Sin el corte, la respuesta de la página vieja llega después y escribe la
  // fecha del documento anterior, en silencio, sobre un documento distinto.
  it('descarta el resultado de una página que ya no está', async () => {
    const alLeer = vi.fn(() => true)
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

    const { rerender } = renderHook(({ p }) => useLecturaFecha(p, manejadores(alLeer)), {
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

// I4: cambiar de foto N veces no puede seguir pagando N llamadas en paralelo.
describe('I4: aborta la petición anterior al cambiar de página', () => {
  it('la señal de la petición vieja queda abortada', async () => {
    let signalVieja: AbortSignal | undefined
    let resolverVieja: ((v: unknown) => void) | null = null
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (resolverVieja) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ fecha: '2030-01-01' }) } as unknown as Response)
      }
      signalVieja = init?.signal as AbortSignal
      return new Promise((r) => {
        resolverVieja = r as (v: unknown) => void
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = renderHook(({ p }) => useLecturaFecha(p, manejadores(() => true)), {
      initialProps: { p: pagina('vieja') },
    })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(signalVieja).toBeInstanceOf(AbortSignal)
    expect(signalVieja!.aborted).toBe(false)

    rerender({ p: pagina('nueva') })

    expect(signalVieja!.aborted).toBe(true)
  })
})

describe('cuando la red falla', () => {
  it('no explota: leer la fecha es un extra', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), manejadores(() => true)))
    await waitFor(() => expect(result.current).toBe('no'))
  })

  it('no explota cuando la petición fue abortada (rechazo de `fetch`)', async () => {
    const err = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(err)))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), manejadores(() => true)))
    await waitFor(() => expect(result.current).toBe('no'))
  })
})
