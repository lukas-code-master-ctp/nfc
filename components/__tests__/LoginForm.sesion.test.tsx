import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/lib/firebase/client', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  signInWithPopup: mocks.signInWithPopup,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
}))

const LoginForm = (await import('@/components/LoginForm')).default
const { CLAVE_INTENTO_AUTO_ENTRADA } = await import('@/components/auth/SesionViva')

const usuario = { getIdToken: () => Promise.resolve('tok') }

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.signInWithPopup.mockResolvedValue({ user: usuario })
  mocks.signInWithEmailAndPassword.mockResolvedValue({ user: usuario })
})

const google = () => screen.getByRole('button', { name: /Continuar con Google/ })

describe('cuando /api/session falla', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)))
  })

  it('no navega: sin cookie, el proxy rebotaría al login y quedaría pegado', async () => {
    render(<LoginForm />)
    fireEvent.click(google())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('muestra el error con el status, para poder diagnosticarlo', async () => {
    render(<LoginForm />)
    fireEvent.click(google())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('500'))
  })

  it('deja los botones usables para reintentar', async () => {
    render(<LoginForm />)
    fireEvent.click(google())
    await waitFor(() => expect(google()).not.toBeDisabled())
  })

  it('con correo y contraseña no dice "credenciales inválidas": la clave estaba bien', async () => {
    render(<LoginForm />)
    fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'ana@flota.cl' } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'secreta123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('sesión'))
    expect(screen.getByRole('alert').textContent).not.toContain('Credenciales inválidas')
  })
})

describe('cuando /api/session responde ok', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)))
  })

  it('entra a la app y no muestra ningún error', async () => {
    render(<LoginForm />)
    fireEvent.click(google())
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('respeta el destino de una transferencia', async () => {
    render(<LoginForm destino="/transferencias/abc" />)
    fireEvent.click(google())
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/transferencias/abc'))
  })

  // C1: acá la membresía queda PROBADA (`establishSession` pasó por
  // `ensureProvisioned`, así que `users/{uid}` existe con certeza). Es el
  // único lugar que limpia la marca de auto-entrada — el layout de `(app)`
  // no puede, porque monta durante el rebote de un usuario sin membresía y
  // borrarla ahí reabre el bucle. Ver `SesionViva.tsx`.
  it('limpia la marca de auto-entrada tras un login exitoso', async () => {
    sessionStorage.setItem(CLAVE_INTENTO_AUTO_ENTRADA, '1')
    render(<LoginForm />)
    fireEvent.click(google())
    await waitFor(() => expect(mocks.push).toHaveBeenCalled())
    expect(sessionStorage.getItem(CLAVE_INTENTO_AUTO_ENTRADA)).toBeNull()
  })
})
