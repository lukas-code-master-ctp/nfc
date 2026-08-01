import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ useLecturaFecha: vi.fn() }))

// Se mockea el hook y se captura su callback: así se puede disparar la lectura
// a mano, sin pelear con el input de archivos del selector de páginas.
vi.mock('@/components/documento/useLecturaFecha', () => ({ useLecturaFecha: mocks.useLecturaFecha }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import DocumentForm from '@/components/DocumentForm'

/** Dispara la fecha que "leyó" el hook. */
let alLeer: (fecha: string) => void

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Agregar documento/i }))
const campoFecha = () => screen.getByLabelText(/Fecha de vencimiento/i) as HTMLInputElement

beforeEach(() => {
  mocks.useLecturaFecha.mockReset()
  mocks.useLecturaFecha.mockImplementation((_p: unknown, cb: (f: string) => void) => {
    alLeer = cb
    return 'no'
  })
})

describe('rellenar el campo', () => {
  it('escribe la fecha leída cuando el campo está vacío', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(campoFecha().value).toBe('')
    // El callback se invoca directo (no vía fireEvent), así que React no lo
    // envuelve en act() automáticamente: sin esto la aserción lee el DOM antes
    // de que el setState se aplique.
    act(() => { alLeer('2027-04-03') })
    expect(campoFecha().value).toBe('2027-04-03')
  })

  // Lo que el usuario escribió es suyo: la IA no se lo pisa.
  it('NO pisa la fecha que el usuario ya había escrito', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    fireEvent.change(campoFecha(), { target: { value: '2028-12-01' } })
    act(() => { alLeer('2027-04-03') })
    expect(campoFecha().value).toBe('2028-12-01')
  })
})

describe('el aviso', () => {
  it('avisa mientras lee', () => {
    mocks.useLecturaFecha.mockReturnValue('leyendo')
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(screen.getByText(/Leyendo la fecha/i)).toBeTruthy()
  })

  it('avisa que la fecha se leyó, para que la revisen', () => {
    mocks.useLecturaFecha.mockReturnValue('lista')
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(screen.getByText(/Fecha leída del documento/i)).toBeTruthy()
  })

  it('sin lectura en curso no muestra nada', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(screen.queryByText(/Leyendo la fecha/i)).toBeNull()
    expect(screen.queryByText(/Fecha leída del documento/i)).toBeNull()
  })
})
