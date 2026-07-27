import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TransferenciasEntrantes from '@/components/transferencias/TransferenciasEntrantes'

describe('TransferenciasEntrantes', () => {
  it('no renderiza nada sin transferencias', () => {
    const { container } = render(<TransferenciasEntrantes items={[]} />)
    expect(container.textContent).toBe('')
  })

  it('nombra la patente y enlaza a la página de aceptación', () => {
    render(
      <TransferenciasEntrantes
        items={[{ token: 'tok', patente: 'ABCD-12', deCompanyNombre: 'Transportes Uno' }]}
      />,
    )
    expect(screen.getByText(/ABCD-12/)).toBeDefined()
    expect(screen.getByRole('link', { name: /revisar/i }).getAttribute('href')).toBe('/transferencias/tok')
  })

  it('lista todas las pendientes', () => {
    render(
      <TransferenciasEntrantes
        items={[
          { token: 'a', patente: 'AAAA-11', deCompanyNombre: 'Uno' },
          { token: 'b', patente: 'BBBB-22', deCompanyNombre: 'Dos' },
        ]}
      />,
    )
    expect(screen.getAllByRole('link', { name: /revisar/i })).toHaveLength(2)
  })
})
