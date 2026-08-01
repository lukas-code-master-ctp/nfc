import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ElegirTipo from '@/components/onboarding/ElegirTipo'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ElegirTipo', () => {
  it('muestra las dos opciones', () => {
    render(<ElegirTipo />)
    expect(screen.getByRole('button', { name: /Un vehículo particular/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Una flota de la empresa/ })).toBeTruthy()
  })

  it('al elegir, guarda el tipo y entra al selector de plan', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
    render(<ElegirTipo />)
    fireEvent.click(screen.getByRole('button', { name: /Un vehículo particular/ }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ tipoCuenta: 'personal' }),
      }))
    })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/plan'))
    expect(refresh).toHaveBeenCalled()
  })

  it('si el servidor responde !ok, muestra un error y no navega', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false } as Response)))
    render(<ElegirTipo />)
    fireEvent.click(screen.getByRole('button', { name: /Una flota de la empresa/ }))
    await waitFor(() => expect(screen.getByText(/No se pudo guardar/)).toBeTruthy())
    expect(push).not.toHaveBeenCalled()
  })

  it('/bienvenida deja claro que se puede sumar la flota después, sin perder nada', () => {
    render(<ElegirTipo />)
    expect(screen.getByText(/más adelante puedes sumar tu flota sin perder nada/i)).toBeTruthy()
  })

  // /bienvenida no tiene barra de navegación: si el fetch rechaza (sin conexión,
  // timeout, DNS) el try/catch tiene que liberar los botones o el usuario queda
  // sin salida. Este caso es el que un revisor confirmó que ningún test cubría.
  it('si el fetch rechaza (sin conexión), los botones vuelven a habilitarse', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin conexión'))))
    render(<ElegirTipo />)
    const boton = screen.getByRole('button', { name: /Un vehículo particular/ })
    fireEvent.click(boton)
    await waitFor(() => expect(boton).not.toBeDisabled())
    expect(screen.getByText(/No se pudo guardar/)).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })
})
