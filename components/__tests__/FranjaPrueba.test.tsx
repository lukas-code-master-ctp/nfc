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

  // I2: la franja pasaba a "vencida" (roja, "tu prueba terminó") durante los
  // meses que dura la promoción de quien acaba de canjear un código, aunque
  // /facturacion le mostrara "Promoción hasta el …" al mismo tiempo. `prueba`
  // y `promo` son fases mutuamente excluyentes, así que si `promo` llega
  // no-null la prueba YA terminó de verdad — pero eso no es lo que hay que
  // anunciar.
  describe('con promoción vigente', () => {
    it('NO dice que la prueba terminó, aunque estado sea "vencida"', () => {
      render(
        <FranjaPrueba
          estado="vencida"
          diasRestantes={-10}
          destino="/facturacion"
          promo={{ diasRestantes: 45, hasta: '2026-11-30' }}
        />,
      )
      expect(screen.queryByText(/Tu prueba terminó/)).toBeNull()
      expect(screen.getByText(/Tienes una promoción activa/)).toBeTruthy()
    })

    it('muestra los días que quedan de promoción y hasta cuándo, en tono neutro (no rojo/ámbar)', () => {
      const { container } = render(
        <FranjaPrueba
          estado="vencida"
          diasRestantes={-10}
          destino="/facturacion"
          promo={{ diasRestantes: 19, hasta: '2026-11-30' }}
        />,
      )
      expect(screen.getByText(/quedan 19 días/)).toBeTruthy()
      expect(screen.getByText(/hasta el 30\/11\/2026/)).toBeTruthy()
      const franja = container.firstElementChild as HTMLElement
      expect(franja.className).not.toMatch(/vencido/)
      expect(franja.className).not.toMatch(/por-vencer/)
    })

    it('singular: 1 día muestra "queda 1 día"', () => {
      render(
        <FranjaPrueba
          estado="vencida"
          diasRestantes={-10}
          destino="/facturacion"
          promo={{ diasRestantes: 1, hasta: '2026-11-30' }}
        />,
      )
      expect(screen.getByText(/queda 1 día/)).toBeTruthy()
      expect(screen.queryByText(/quedan 1 días/)).toBeNull()
    })

    it('0 días muestra "termina hoy"', () => {
      render(
        <FranjaPrueba
          estado="vencida"
          diasRestantes={-10}
          destino="/facturacion"
          promo={{ diasRestantes: 0, hasta: '2026-11-30' }}
        />,
      )
      expect(screen.getByText(/Tu promoción termina hoy/)).toBeTruthy()
    })

    it('el enlace usa el destino y la etiqueta que le pasan ("Ver mi plan" para /facturacion)', () => {
      render(
        <FranjaPrueba
          estado="vencida"
          diasRestantes={-10}
          destino="/facturacion"
          promo={{ diasRestantes: 19, hasta: '2026-11-30' }}
        />,
      )
      const link = screen.getByRole('link', { name: 'Ver mi plan' })
      expect(link.getAttribute('href')).toBe('/facturacion')
    })
  })

  it('sin promoción (promo=null), el comportamiento actual se conserva', () => {
    render(<FranjaPrueba estado="por_terminar" diasRestantes={5} destino="/plan" promo={null} />)
    expect(screen.getByText(/quedan 5 días/)).toBeTruthy()
    expect(screen.queryByText(/promoción/)).toBeNull()
  })
})
