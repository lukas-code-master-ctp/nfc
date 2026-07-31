import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  onIdTokenChanged: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('firebase/auth', () => ({ onIdTokenChanged: mocks.onIdTokenChanged }))
vi.mock('@/lib/firebase/client', () => ({ auth: {} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))

import SesionViva, { CLAVE_INTENTO_AUTO_ENTRADA } from '@/components/auth/SesionViva'

/** Captura el callback que registra el componente, para dispararlo a mano. */
let emitir: (u: unknown) => void

const usuario = { getIdToken: () => Promise.resolve('tok') }

/** `sessionStorage` real de jsdom, con `getItem`/`setItem`/`removeItem` sobre un Map. */
function crearSessionStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (clave: string) => (store.has(clave) ? store.get(clave)! : null),
    setItem: (clave: string, valor: string) => {
      store.set(clave, valor)
    },
    removeItem: (clave: string) => {
      store.delete(clave)
    },
    clear: () => store.clear(),
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
  vi.stubGlobal('sessionStorage', crearSessionStorageMock())
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

describe('el corte del bucle sobrevive a un remontaje (sessionStorage)', () => {
  // El caso real: sesión de Firebase viva sin `users/{uid}` (el POST de
  // provisión falló por red). Cualquier visita a `/login` remonta
  // `SesionViva`, que reinicia sus refs — sin la marca en `sessionStorage` el
  // componente auto-entraría de nuevo y el bucle login→dashboard→login no
  // tendría fin.
  it('si el intento ya quedó registrado, la primera invocación con usuario renueva la cookie pero no navega', async () => {
    sessionStorage.setItem(CLAVE_INTENTO_AUTO_ENTRADA, '1')
    render(<SesionViva autoEntrar />)
    emitir(usuario)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/session/renovar',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  // El componente sin `autoEntrar` es el que vive en el layout de `(app)`:
  // si se está montando es porque el usuario efectivamente entró, así que el
  // intento anterior (si lo hubo) queda rehabilitado para la próxima vez.
  it('al montar sin autoEntrar, borra la clave del intento', () => {
    sessionStorage.setItem(CLAVE_INTENTO_AUTO_ENTRADA, '1')
    render(<SesionViva />)
    expect(sessionStorage.getItem(CLAVE_INTENTO_AUTO_ENTRADA)).toBeNull()
  })

  // Degradación segura: si el navegador particiona o bloquea sessionStorage
  // (Safari privado, incógnito, webviews) y lanza al leerlo, es preferible
  // el comportamiento de hoy (con riesgo de bucle) a dejar al usuario sin
  // forma de entrar nunca.
  it('si sessionStorage lanza al leerla, la auto-entrada igual ocurre (degradación segura)', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('sessionStorage bloqueado')
      },
      setItem: () => {},
      removeItem: () => {},
    })
    render(<SesionViva autoEntrar />)
    emitir(usuario)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'))
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
