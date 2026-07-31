import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  onIdTokenChanged: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('firebase/auth', () => ({ onIdTokenChanged: mocks.onIdTokenChanged }))
vi.mock('@/lib/firebase/client', () => ({ auth: {} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))

import SesionViva from '@/components/auth/SesionViva'

/** Captura el callback que registra el componente, para dispararlo a mano. */
let emitir: (u: unknown) => void

const usuario = { getIdToken: () => Promise.resolve('tok') }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
  mocks.replace.mockReset()
  mocks.onIdTokenChanged.mockReset()
  mocks.onIdTokenChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
    emitir = cb
    return () => {}
  })
})

describe('con usuario de Firebase', () => {
  it('renueva la cookie del servidor', async () => {
    render(<SesionViva />)
    emitir(usuario)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/session/renovar',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('no navega a ningún lado si no se le pidió auto-entrada', async () => {
    render(<SesionViva />)
    emitir(usuario)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

describe('auto-entrada en el login', () => {
  it('entra al dashboard después de renovar', async () => {
    render(<SesionViva autoEntrar />)
    emitir(usuario)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'))
  })

  // El test del bucle: sin este corte, una sesión revocada renueva la cookie,
  // el dashboard rebota al login, y el componente vuelve a renovar. Para
  // siempre. El ID token cacheado sigue siendo válido hasta una hora después de
  // revocar, así que el bucle es real.
  it('SOLO una vez por carga, aunque el token cambie varias veces', async () => {
    render(<SesionViva autoEntrar />)
    emitir(usuario)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1))
    emitir(usuario)
    emitir(usuario)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(mocks.replace).toHaveBeenCalledTimes(1)
  })

  it('no entra si la renovación falló', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401 } as Response)))
    render(<SesionViva autoEntrar />)
    emitir(usuario)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

describe('sin usuario de Firebase', () => {
  it('borra la cookie del servidor', async () => {
    render(<SesionViva />)
    emitir(null)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/session',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
  })

  it('no intenta renovar', async () => {
    render(<SesionViva />)
    emitir(null)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(fetch).not.toHaveBeenCalledWith('/api/session/renovar', expect.anything())
  })
})

describe('cuando la red falla', () => {
  it('no explota: es best-effort', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))))
    render(<SesionViva autoEntrar />)
    expect(() => emitir(usuario)).not.toThrow()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
