import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('firebase/auth', () => ({ signOut: mocks.signOut }))
vi.mock('@/lib/firebase/client', () => ({ auth: {} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))

import CerrarSesionesCard from '@/components/profile/CerrarSesionesCard'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.signOut.mockResolvedValue(undefined)
})

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión en todos/i }))
const confirmar = () => fireEvent.click(screen.getByRole('button', { name: /Sí, cerrar todas/i }))

describe('confirmación', () => {
  it('no hace nada hasta confirmar: también cierra tu sesión actual', () => {
    render(<CerrarSesionesCard />)
    abrir()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('al confirmar', () => {
  it('llama al endpoint', async () => {
    render(<CerrarSesionesCard />)
    abrir()
    confirmar()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/session/revocar', expect.objectContaining({ method: 'POST' })),
    )
  })

  // Sin el signOut quedas con sesión de Firebase viva pero sin cookie, y
  // SesionViva te la vuelve a acuñar en la siguiente carga: habrías revocado
  // todos los dispositivos MENOS el que apretó el botón.
  it('también cierra la sesión de Firebase en este dispositivo', async () => {
    render(<CerrarSesionesCard />)
    abrir()
    confirmar()
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
  })

  it('lleva al login', async () => {
    render(<CerrarSesionesCard />)
    abrir()
    confirmar()
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login'))
  })
})

describe('si el endpoint falla', () => {
  it('avisa y NO cierra la sesión local', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)))
    render(<CerrarSesionesCard />)
    abrir()
    confirmar()
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
