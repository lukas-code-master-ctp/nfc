import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VehicleCard from '@/components/VehicleCard'
import type { Vehicle } from '@/lib/types'

const vehiculo = {
  id: 'v1', companyId: 'c1', patente: 'ABCD-12', marca: 'BMW', modelo: 'X6',
  anio: 2024, color: 'Verde', publicToken: 'tok', createdAt: '2026-01-01T00:00:00.000Z',
} as Vehicle

describe('VehicleCard', () => {
  it('sin transferencia pendiente no muestra la pill', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" />)
    expect(screen.queryByText('Transferencia pendiente')).toBeNull()
  })

  it('con transferencia pendiente muestra la pill', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" transferenciaPendiente />)
    expect(screen.getByText('Transferencia pendiente')).toBeDefined()
  })
})
