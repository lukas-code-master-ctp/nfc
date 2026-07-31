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

  it('navega a `destino` en vez de a /dashboard cuando se lo pasan', async () => {
    render(<SesionViva autoEntrar destino="/transferencias/abc123" />)
    emitir(usuario)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/transferencias/abc123'))
  })
})

describe('primera invocación vs. login recién hecho', () => {
  // `onIdTokenChanged` dispara al montar con el estado actual. Si ese primer
  // disparo YA trae usuario, es una sesión que estaba viva antes de llegar a
  // `/login`: corresponde auto-entrar.
  it('si la PRIMERA invocación trae usuario, navega', async () => {
    render(<SesionViva autoEntrar />)
    emitir(usuario)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'))
  })

  // Si el primer disparo es `null`, no había sesión viva al llegar. Un login
  // hecho a mano en `LoginForm` dispara un evento posterior con usuario, pero
  // NO debe navegar acá: `LoginForm` ya navega por su cuenta después de
  // `establishSession` (que además provisiona la cuenta en Firestore). Si acá
  // también navegáramos, en una cuenta recién creada llegaríamos al dashboard
  // antes de que exista `users/{uid}` y se armaría el bucle con el rebote a
  // `/login`.
  it('si la primera invocación es null y la segunda trae usuario, renueva pero NO navega', async () => {
    render(<SesionViva autoEntrar />)
    emitir(null)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/session', expect.objectContaining({ method: 'DELETE' })),
    )
    emitir(usuario)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/session/renovar',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
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
