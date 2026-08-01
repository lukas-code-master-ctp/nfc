import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  chatVision: vi.fn(),
  isOpenRouterConfigured: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/ai/openrouter', () => ({
  chatVision: mocks.chatVision,
  isOpenRouterConfigured: mocks.isOpenRouterConfigured,
}))

const { POST } = await import('@/app/api/documents/leer-fecha/route')

const IMAGEN = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  mocks.isOpenRouterConfigured.mockReturnValue(true)
})

describe('quién puede llamarlo', () => {
  // Cada llamada cuesta plata: esto no puede quedar abierto.
  it('sin sesión responde 401 y no llama al modelo', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await POST(req({ imagen: IMAGEN }))
    expect(res.status).toBe(401)
    expect(mocks.chatVision).not.toHaveBeenCalled()
  })
})

describe('qué acepta', () => {
  it('rechaza lo que no sea un data URI, sin llamar al modelo', async () => {
    for (const imagen of ['https://ejemplo.cl/foto.jpg', '', 123, undefined]) {
      const res = await POST(req({ imagen }))
      expect(res.status).toBe(400)
    }
    expect(mocks.chatVision).not.toHaveBeenCalled()
  })
})

describe('camino normal', () => {
  it('devuelve la fecha parseada', async () => {
    mocks.chatVision.mockResolvedValue('{"vence": "2027-04-03"}')
    const res = await POST(req({ imagen: IMAGEN }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ fecha: '2027-04-03' })
  })

  it('le pasa el data URI al modelo tal cual', async () => {
    mocks.chatVision.mockResolvedValue('{"vence": null}')
    await POST(req({ imagen: IMAGEN }))
    expect(mocks.chatVision).toHaveBeenCalledWith([IMAGEN], expect.any(String))
  })

  it('devuelve null si el modelo no pudo leerla', async () => {
    mocks.chatVision.mockResolvedValue('{"vence": null}')
    const res = await POST(req({ imagen: IMAGEN }))
    expect(await res.json()).toEqual({ fecha: null })
  })
})

describe('best-effort: nunca rompe el formulario', () => {
  it('sin la clave configurada responde null sin llamar al modelo', async () => {
    mocks.isOpenRouterConfigured.mockReturnValue(false)
    const res = await POST(req({ imagen: IMAGEN }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ fecha: null })
    expect(mocks.chatVision).not.toHaveBeenCalled()
  })

  it('si el modelo se cae, responde null y no propaga el error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.chatVision.mockRejectedValue(new Error('openrouter_404'))
    const res = await POST(req({ imagen: IMAGEN }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ fecha: null })
    err.mockRestore()
  })
})
