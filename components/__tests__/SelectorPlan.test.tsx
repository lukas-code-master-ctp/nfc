import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SelectorPlan from '@/components/plan/SelectorPlan'

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

describe('SelectorPlan', () => {
  it('arranca en mensual y muestra el cargo mensual del inicial', () => {
    render(<SelectorPlan inicial={3} />)
    const mensual = screen.getByRole('button', { name: /^Mensual/ })
    expect(mensual.getAttribute('aria-pressed')).toBe('true')
    // 3 vehículos × $2.990/mes = $8.970
    expect(screen.getByText('$8.970')).toBeTruthy()
  })

  it('al tocar "Anual" el monto cambia al anual y aparece "Ahorras al año"', () => {
    render(<SelectorPlan inicial={3} />)
    fireEvent.click(screen.getByRole('button', { name: /^Anual/ }))
    // 3 vehículos × $1.944 × 12 meses = $69.984
    expect(screen.getByText('$69.984')).toBeTruthy()
    expect(screen.getByText('Ahorras al año')).toBeTruthy()
  })

  it('los botones − y + cambian la cantidad; no baja de 1', () => {
    render(<SelectorPlan inicial={1} />)
    const input = screen.getByLabelText(/Cuántos vehículos/) as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Quitar un vehículo' }))
    expect(input.value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar un vehículo' }))
    expect(input.value).toBe('2')
  })

  it('con menos de 5 vehículos muestra el precio del chip; con 5 o más dice "Incluido"', () => {
    render(<SelectorPlan inicial={3} />)
    expect(screen.getByText(/\+ envío c\/u/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(screen.getByText(/Incluido \(pagas el envío\)/)).toBeTruthy()
  })

  it('con 31 vehículos desaparece "Continuar" y aparece el enlace a Facturación', () => {
    render(<SelectorPlan inicial={3} />)
    const input = screen.getByLabelText(/Cuántos vehículos/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '31' } })
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Hablemos de tu flota' })).toBeTruthy()
  })

  it('"Continuar" hace POST a /api/plan con { periodicidad, maxVehiculos }', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
    render(<SelectorPlan inicial={3} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/plan', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ periodicidad: 'mensual', maxVehiculos: 3 }),
      }))
    })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(refresh).toHaveBeenCalled()
  })

  it('si el POST responde !ok, muestra el mensaje de error y el botón vuelve a estar habilitado', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false } as Response)))
    render(<SelectorPlan inicial={3} />)
    const boton = screen.getByRole('button', { name: 'Continuar' })
    fireEvent.click(boton)
    await waitFor(() => expect(screen.getByText(/No se pudo guardar/)).toBeTruthy())
    expect(boton).not.toBeDisabled()
    expect(push).not.toHaveBeenCalled()
  })
})
