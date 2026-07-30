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

// La tarjeta arranca contraída (solo el paso actual). Los casos que hablan de
// la lista completa la despliegan primero, igual que el usuario.
const desplegar = () => fireEvent.click(screen.getByRole('button', { name: 'Ver todos los pasos' }))

beforeEach(() => {
  refresh.mockClear()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
})

describe('contraída y desplegada', () => {
  it('contraída muestra solo el paso actual y esconde el resto', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    // documentos es el primer pendiente: es el único que se ve.
    expect(screen.getByText('Título documentos')).toBeTruthy()
    expect(screen.queryByText('Título vehiculo')).toBeNull()
    expect(screen.queryByText('Título chip')).toBeNull()
  })

  it('el contador y la barra de progreso siguen visibles contraída', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    expect(screen.getByText('1 de 3')).toBeTruthy()
  })

  it('el chevron despliega la lista completa', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    desplegar()
    for (const p of PASOS) expect(screen.getByText(p.titulo)).toBeTruthy()
  })

  it('el chevron vuelve a contraerla', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    desplegar()
    fireEvent.click(screen.getByRole('button', { name: 'Ver solo el paso actual' }))
    expect(screen.queryByText('Título vehiculo')).toBeNull()
    expect(screen.getByText('Título documentos')).toBeTruthy()
  })

  it('sin pasos pendientes muestra la lista completa y no ofrece el chevron', () => {
    const todos = PASOS.map((p) => ({ ...p, listo: true }))
    render(<TarjetaProgreso pasos={todos} tipoCuenta="personal" />)
    for (const p of todos) expect(screen.getByText(p.titulo)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Ver (todos los pasos|solo el paso actual)/ })).toBeNull()
  })
})

describe('ayuda por paso', () => {
  it('viene desplegada de entrada, sin tener que tocar nada', async () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    // Primera línea del cómo hacerlo real del paso `documentos`.
    await waitFor(() => expect(screen.getByText(/Abre la ficha del vehículo/)).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Ocultar cómo hacerlo: Título documentos' })).toBeTruthy()
  })

  it('un paso ya listo no la ofrece: no hay nada que enseñar', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    desplegar()
    expect(screen.queryByRole('button', { name: /cómo hacerlo: Título vehiculo/ })).toBeNull()
  })

  it('se puede cerrar y volver a abrir', async () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    await waitFor(() => expect(screen.getByText(/Abre la ficha del vehículo/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar cómo hacerlo: Título documentos' }))
    expect(screen.queryByText(/Abre la ficha del vehículo/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver cómo hacerlo: Título documentos' }))
    await waitFor(() => expect(screen.getByText(/Abre la ficha del vehículo/)).toBeTruthy())
  })

  it('cerrar la de un paso no cierra la del otro', async () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    desplegar()
    await waitFor(() => expect(screen.getByText(/viene en el llavero del auto/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar cómo hacerlo: Título documentos' }))
    expect(screen.queryByText(/Abre la ficha del vehículo/)).toBeNull()
    expect(screen.getByText(/viene en el llavero del auto/)).toBeTruthy()
  })
})

describe('render', () => {
  it('muestra cuántos pasos van de cuántos', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    expect(screen.getByText('1 de 3')).toBeTruthy()
  })

  it('el paso pendiente enlaza a su destino', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    const enlace = screen.getByRole('link', { name: /Título documentos/ })
    expect(enlace.getAttribute('href')).toBe('/dashboard')
  })

  it('un paso informativo pendiente ofrece "Entendido"', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    desplegar()
    expect(screen.getAllByRole('button', { name: 'Entendido' })).toHaveLength(1)
  })

  it('un paso informativo ya reconocido no lo ofrece', () => {
    const listos = PASOS.map((p) => (p.id === 'chip' ? { ...p, listo: true } : p))
    render(<TarjetaProgreso pasos={listos} tipoCuenta="personal" />)
    desplegar()
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
    desplegar()
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

  it('avisa al padre cuando ocultar se guardó bien, para que muestre el toast', async () => {
    const onOcultada = vi.fn()
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" onOcultada={onOcultada} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    await waitFor(() => expect(onOcultada).toHaveBeenCalledTimes(1))
  })

  it('NO avisa al padre si el servidor rechazó: la tarjeta sigue ahí, avisar seria mentir', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false } as Response)))
    const onOcultada = vi.fn()
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" onOcultada={onOcultada} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ocultar' })).not.toBeDisabled())
    expect(onOcultada).not.toHaveBeenCalled()
  })

  it('NO avisa al padre si la red falló', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin conexión'))))
    const onOcultada = vi.fn()
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" onOcultada={onOcultada} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ocultar' })).not.toBeDisabled())
    expect(onOcultada).not.toHaveBeenCalled()
  })

  it('los otros botones no avisan al padre: solo ocultar muestra el toast', async () => {
    const onOcultada = vi.fn()
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" onOcultada={onOcultada} />)
    desplegar()
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(onOcultada).not.toHaveBeenCalled()
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
