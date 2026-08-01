import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FranjaPrueba from '@/components/plan/FranjaPrueba'

describe('FranjaPrueba', () => {
  it('sin_prueba no renderiza nada', () => {
    const { container } = render(
      <FranjaPrueba estado="sin_prueba" diasRestantes={null} destino="/plan" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('activa con 19 días muestra "quedan 19 días"', () => {
    render(<FranjaPrueba estado="activa" diasRestantes={19} destino="/plan" />)
    expect(screen.getByText(/quedan 19 días/)).toBeTruthy()
  })

  it('singular: 1 día muestra "queda 1 día", no "quedan 1 días"', () => {
    render(<FranjaPrueba estado="por_terminar" diasRestantes={1} destino="/plan" />)
    expect(screen.getByText(/queda 1 día\./)).toBeTruthy()
    expect(screen.queryByText(/quedan 1 días/)).toBeNull()
  })

  it('0 días muestra "termina hoy"', () => {
    render(<FranjaPrueba estado="por_terminar" diasRestantes={0} destino="/plan" />)
    expect(screen.getByText('Tu prueba termina hoy.')).toBeTruthy()
  })

  it('vencida NO dice que la app se bloquea; el texto contiene "Sigue usando"', () => {
    render(<FranjaPrueba estado="vencida" diasRestantes={-3} destino="/facturacion" />)
    expect(screen.getByText(/Sigue usando/)).toBeTruthy()
  })

  it('el enlace apunta al destino que se le pasa', () => {
    render(<FranjaPrueba estado="activa" diasRestantes={10} destino="/plan" />)
    const link = screen.getByRole('link', { name: 'Elegir plan' })
    expect(link.getAttribute('href')).toBe('/plan')
  })

  it('destino /plan usa la etiqueta "Elegir plan" (todavía no eligió)', () => {
    render(<FranjaPrueba estado="activa" diasRestantes={10} destino="/plan" />)
    expect(screen.getByRole('link', { name: 'Elegir plan' })).toBeTruthy()
  })

  it('destino /facturacion usa la etiqueta "Ver mi plan" (ya eligió)', () => {
    render(<FranjaPrueba estado="activa" diasRestantes={10} destino="/facturacion" />)
    const link = screen.getByRole('link', { name: 'Ver mi plan' })
    expect(link.getAttribute('href')).toBe('/facturacion')
  })
})
