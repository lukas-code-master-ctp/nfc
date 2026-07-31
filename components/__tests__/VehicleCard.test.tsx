import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VehicleCard from '@/components/VehicleCard'
import type { Vehicle } from '@/lib/types'

const vehiculo = {
  id: 'v1', companyId: 'c1', patente: 'ABCD-12', marca: 'BMW', modelo: 'X6',
  anio: 2024, color: 'Verde', publicToken: 'tok', createdAt: '2026-01-01T00:00:00.000Z',
} as Vehicle

const enUso = {
  ...vehiculo,
  usoActual: { driverId: 'd1', driverNombre: 'Ana Soto', tomadoEn: '2026-03-12T12:15:00.000Z' },
} as Vehicle

/** El enlace de la tarjeta: no tiene texto propio, se nombra con aria-label. */
const enlace = () => screen.getByRole('link', { name: 'BMW X6 · ABCD-12' })

describe('pills informativas', () => {
  it('sin transferencia pendiente no muestra la pill', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" />)
    expect(screen.queryByText('Transferencia pendiente')).toBeNull()
  })

  it('con transferencia pendiente muestra la pill', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" transferenciaPendiente />)
    expect(screen.getByText('Transferencia pendiente')).toBeDefined()
  })
})

describe('a dónde lleva el clic', () => {
  it('toda la tarjeta es un solo enlace', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" mantencion="proxima" mantencionDetalle="faltan 500 km" />)
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('documentos vencidos le ganan a una mantención próxima', () => {
    render(<VehicleCard vehicle={vehiculo} status="vencido" mantencion="proxima" mantencionDetalle="faltan 500 km" />)
    expect(enlace().getAttribute('href')).toBe('/vehiculos/v1#documentos')
  })

  it('una mantención vencida gana si los documentos están al día', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" mantencion="vencida" mantencionDetalle="pasada 300 km" />)
    expect(enlace().getAttribute('href')).toBe('/vehiculos/v1#mantencion')
  })

  it('el daño reportado gana sobre todo lo demás', () => {
    render(<VehicleCard vehicle={vehiculo} status="vencido" mantencion="vencida" danoUsageId="u9" />)
    expect(enlace().getAttribute('href')).toBe('/vehiculos/v1#uso-u9')
  })
})

describe('el detalle se abre con un toque, no con el mouse encima', () => {
  // El `title` no existe en un celular: sin hover, ese texto era invisible.
  it('la pill de mantención guarda su detalle detrás de un botón', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" mantencion="proxima" mantencionDetalle="faltan 500 km" />)
    expect(screen.queryByText('faltan 500 km')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Mantención próxima' }))
    expect(screen.getByRole('tooltip').textContent).toContain('faltan 500 km')
  })

  it('el punto de «en uso» dice quién lo tiene y desde cuándo', () => {
    render(<VehicleCard vehicle={enUso} status="al_dia" />)
    fireEvent.click(screen.getByRole('button', { name: 'Vehículo en uso' }))

    const tip = screen.getByRole('tooltip').textContent ?? ''
    expect(tip).toContain('Ana Soto')
    expect(tip).toContain('Desde')
  })

  it('y avisa cuando el uso lleva demasiado tiempo sin entregar', () => {
    render(<VehicleCard vehicle={enUso} status="al_dia" prolongado horasUso={14} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vehículo en uso, sin entregar' }))
    expect(screen.getByRole('tooltip').textContent).toContain('Sin entregar hace 14 h')
  })

  it('sin uso abierto no hay punto que tocar', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" />)
    expect(screen.queryByRole('button', { name: /Vehículo en uso/ })).toBeNull()
  })

  it('abrir el detalle no navega a la ficha', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" mantencion="vencida" mantencionDetalle="pasada 300 km" />)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    fireEvent(screen.getByRole('button', { name: 'Mantención vencida' }), click)
    expect(click.defaultPrevented).toBe(true)
  })
})
