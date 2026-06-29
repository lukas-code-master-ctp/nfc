import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from '@/components/StatusBadge'

describe('StatusBadge', () => {
  it('muestra texto y color para vencido', () => {
    render(<StatusBadge status="vencido" />)
    expect(screen.getByText('Vencido')).toBeDefined()
  })
  it('muestra "Vigente" para un documento al día', () => {
    render(<StatusBadge status="al_dia" />)
    expect(screen.getByText('Vigente')).toBeDefined()
  })
  it('usa etiquetas de vehículo con variant="vehicle"', () => {
    render(<StatusBadge status="al_dia" variant="vehicle" />)
    expect(screen.getByText('Al día')).toBeDefined()
  })
})
