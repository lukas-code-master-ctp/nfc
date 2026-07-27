import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/lib/firebase/client', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: { getIdToken: () => Promise.resolve('tok') } })),
  createUserWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: { getIdToken: () => Promise.resolve('tok') } })),
}))

import LoginForm from '@/components/LoginForm'

function iniciarSesion() {
  fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'a@b.cl' } })
  fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'secreta1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
}

beforeEach(() => {
  push.mockReset(); refresh.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LoginForm', () => {
  it('sin destino entra al dashboard', async () => {
    render(<LoginForm />)
    iniciarSesion()
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('con destino entra ahí, para no perder la transferencia', async () => {
    render(<LoginForm destino="/transferencias/tok" />)
    iniciarSesion()
    await waitFor(() => expect(push).toHaveBeenCalledWith('/transferencias/tok'))
  })
})
