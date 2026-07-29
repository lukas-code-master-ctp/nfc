import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RecuperarGuia from '@/components/onboarding/RecuperarGuia'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const volverBtn = () => screen.queryByRole('button', { name: 'Volver a mostrarla' })
const cambiarBtn = () => screen.queryByRole('button', { name: 'Cambiar a cuenta de empresa' })

describe('RecuperarGuia — qué bloques aparecen según { descartada, completada, esPersonal }', () => {
  it('ninguna de las dos: no muestra ningún bloque', () => {
    render(<RecuperarGuia descartada={false} completada={false} esPersonal={false} />)
    expect(volverBtn()).toBeNull()
    expect(cambiarBtn()).toBeNull()
  })

  it('descartada y no completada: ofrece "Volver a mostrarla"', () => {
    render(<RecuperarGuia descartada={true} completada={false} esPersonal={false} />)
    expect(volverBtn()).toBeTruthy()
    expect(cambiarBtn()).toBeNull()
  })

  it('descartada Y completada: NO ofrece "Volver a mostrarla" (no hay nada que reaparezca)', () => {
    render(<RecuperarGuia descartada={true} completada={true} esPersonal={false} />)
    expect(volverBtn()).toBeNull()
    expect(cambiarBtn()).toBeNull()
    expect(screen.queryByText(/La ocultaste del dashboard/)).toBeNull()
  })

  it('cuenta personal: ofrece "Cambiar a cuenta de empresa"', () => {
    render(<RecuperarGuia descartada={false} completada={false} esPersonal={true} />)
    expect(cambiarBtn()).toBeTruthy()
    expect(volverBtn()).toBeNull()
  })

  it('personal, descartada y no completada: ofrece los dos bloques', () => {
    render(<RecuperarGuia descartada={true} completada={false} esPersonal={true} />)
    expect(volverBtn()).toBeTruthy()
    expect(cambiarBtn()).toBeTruthy()
  })

  it('personal, descartada Y completada: solo ofrece "Cambiar a cuenta de empresa"', () => {
    render(<RecuperarGuia descartada={true} completada={true} esPersonal={true} />)
    expect(volverBtn()).toBeNull()
    expect(cambiarBtn()).toBeTruthy()
  })
})

describe('RecuperarGuia — cada botón llama al endpoint con el cuerpo correcto', () => {
  it('"Volver a mostrarla" manda { descartado: false } y navega al dashboard', async () => {
    render(<RecuperarGuia descartada={true} completada={false} esPersonal={false} />)
    fireEvent.click(volverBtn()!)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ descartado: false }),
      }))
    })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(refresh).toHaveBeenCalled()
  })

  it('"Cambiar a cuenta de empresa" manda { tipoCuenta: "empresa" } y navega al dashboard', async () => {
    render(<RecuperarGuia descartada={false} completada={false} esPersonal={true} />)
    fireEvent.click(cambiarBtn()!)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ tipoCuenta: 'empresa' }),
      }))
    })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(refresh).toHaveBeenCalled()
  })

  it('si el fetch rechaza, el botón vuelve a habilitarse y no navega', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin conexión'))))
    render(<RecuperarGuia descartada={true} completada={false} esPersonal={false} />)
    const boton = volverBtn()!
    fireEvent.click(boton)
    await waitFor(() => expect(boton).not.toBeDisabled())
    expect(push).not.toHaveBeenCalled()
  })
})
