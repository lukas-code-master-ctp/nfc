import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TarjetaProgreso from '@/components/onboarding/TarjetaProgreso'
import type { Paso } from '@/lib/onboarding/pasos'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const paso = (over: Partial<Paso> & Pick<Paso, 'id'>): Paso => ({
  titulo: `Título ${over.id}`,
  detalle: 'Detalle',
  href: '/dashboard',
  listo: false,
  informativo: false,
  ...over,
})

const PASOS: Paso[] = [
  paso({ id: 'vehiculo', listo: true }),
  paso({ id: 'documentos' }),
  paso({ id: 'chip', informativo: true }),
]

beforeEach(() => {
  refresh.mockClear()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
})

describe('render', () => {
  it('muestra cuántos pasos van de cuántos', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    expect(screen.getByText('1 de 3')).toBeTruthy()
  })

  it('lista todos los pasos por su título', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    for (const p of PASOS) expect(screen.getByText(p.titulo)).toBeTruthy()
  })

  it('el paso pendiente enlaza a su destino', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    const enlace = screen.getByRole('link', { name: /Título documentos/ })
    expect(enlace.getAttribute('href')).toBe('/dashboard')
  })

  it('un paso informativo pendiente ofrece "Entendido"', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    expect(screen.getAllByRole('button', { name: 'Entendido' })).toHaveLength(1)
  })

  it('un paso informativo ya reconocido no lo ofrece', () => {
    const listos = PASOS.map((p) => (p.id === 'chip' ? { ...p, listo: true } : p))
    render(<TarjetaProgreso pasos={listos} tipoCuenta="personal" />)
    expect(screen.queryByRole('button', { name: 'Entendido' })).toBeNull()
  })

  it('un paso pendiente que NO es informativo tampoco lo ofrece', () => {
    render(<TarjetaProgreso pasos={[paso({ id: 'documentos' })]} tipoCuenta="personal" />)
    expect(screen.queryByRole('button', { name: 'Entendido' })).toBeNull()
  })

  it('un paso pendiente sin destino (href null) no es un enlace, solo texto', () => {
    render(<TarjetaProgreso pasos={[paso({ id: 'documentos', href: null })]} tipoCuenta="personal" />)
    expect(screen.queryByRole('link', { name: /Título documentos/ })).toBeNull()
    expect(screen.getByText('Título documentos')).toBeTruthy()
  })

  it('el paso "vehiculo" pendiente con onNuevoVehiculo se renderiza como botón e invoca la función al hacer clic', () => {
    const onNuevoVehiculo = vi.fn()
    render(
      <TarjetaProgreso
        pasos={[paso({ id: 'vehiculo' })]}
        tipoCuenta="personal"
        onNuevoVehiculo={onNuevoVehiculo}
      />,
    )
    const boton = screen.getByRole('button', { name: 'Título vehiculo' })
    fireEvent.click(boton)
    expect(onNuevoVehiculo).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link', { name: /Título vehiculo/ })).toBeNull()
  })
})

describe('acciones', () => {
  it('"Entendido" marca ese paso como visto', async () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ visto: 'chip' }),
      }))
    })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('"Ocultar" descarta la tarjeta', async () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({
        body: JSON.stringify({ descartado: true }),
      }))
    })
  })

  it('en cuenta personal ofrece cambiar a flota, y eso cambia el tipo', async () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    fireEvent.click(screen.getByRole('button', { name: /administro una flota/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({
        body: JSON.stringify({ tipoCuenta: 'empresa' }),
      }))
    })
  })

  it('en cuenta de empresa no ofrece cambiar a flota: ya lo es', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="empresa" />)
    expect(screen.queryByRole('button', { name: /administro una flota/i })).toBeNull()
  })

  it('si el fetch rechaza (sin conexión), el botón vuelve a habilitarse', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin conexión'))))
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    const boton = screen.getByRole('button', { name: 'Ocultar' })
    fireEvent.click(boton)
    await waitFor(() => expect(boton).not.toBeDisabled())
    expect(refresh).not.toHaveBeenCalled()
  })
})
