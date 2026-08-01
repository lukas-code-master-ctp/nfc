import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ useLecturaFecha: vi.fn() }))

// Se mockea el hook y se captura sus manejadores: así se puede disparar
// `alEmpezar`/`alLeer` a mano, sin pelear con el input de archivos del
// selector de páginas ni con el efecto asíncrono real del hook.
vi.mock('@/components/documento/useLecturaFecha', () => ({ useLecturaFecha: mocks.useLecturaFecha }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import DocumentForm from '@/components/DocumentForm'

type Manejadores = { alEmpezar: () => void; alLeer: (fecha: string) => boolean }

/** Los manejadores que el componente le pasó al hook en el último render. */
let manejadores: Manejadores

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Agregar documento/i }))
const campoFecha = () => screen.getByLabelText(/Fecha de vencimiento/i) as HTMLInputElement
const cancelar = () => fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }))

beforeEach(() => {
  mocks.useLecturaFecha.mockReset()
  mocks.useLecturaFecha.mockImplementation((_p: unknown, m: Manejadores) => {
    manejadores = m
    return 'no'
  })
})

describe('rellenar el campo', () => {
  it('escribe la fecha leída cuando el campo está vacío', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(campoFecha().value).toBe('')
    // Se invoca directo (no vía fireEvent), así que React no lo envuelve en
    // act() automáticamente: sin esto la aserción lee el DOM antes de que el
    // setState se aplique.
    act(() => { manejadores.alLeer('2027-04-03') })
    expect(campoFecha().value).toBe('2027-04-03')
  })

  // Lo que el usuario escribió es suyo: la IA no se lo pisa.
  it('NO pisa la fecha que el usuario ya había escrito', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    fireEvent.change(campoFecha(), { target: { value: '2028-12-01' } })
    act(() => { manejadores.alLeer('2027-04-03') })
    expect(campoFecha().value).toBe('2028-12-01')
  })
})

// C1: la fecha de la IA no puede sobrevivir al documento (página) que la originó.
describe('C1: la fecha de la IA no sobrevive a un documento distinto', () => {
  it('cambiar la primera página descarta la fecha que había puesto la IA y aplica la nueva', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    act(() => { manejadores.alLeer('2027-04-03') })
    expect(campoFecha().value).toBe('2027-04-03')

    // El hook real llama `alEmpezar` justo al arrancar la lectura de la nueva
    // página, antes de saber qué va a devolver.
    act(() => { manejadores.alEmpezar() })
    expect(campoFecha().value).toBe('')

    act(() => { manejadores.alLeer('2026-01-15') })
    expect(campoFecha().value).toBe('2026-01-15')
  })

  it('cambiar la primera página conserva la fecha que escribió el usuario', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    fireEvent.change(campoFecha(), { target: { value: '2028-12-01' } })

    act(() => { manejadores.alEmpezar() })
    expect(campoFecha().value).toBe('2028-12-01')

    act(() => { manejadores.alLeer('2027-04-03') })
    expect(campoFecha().value).toBe('2028-12-01')
  })

  it('cancelar y reabrir deja el campo vacío y sin aviso', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    act(() => { manejadores.alLeer('2027-04-03') })
    expect(campoFecha().value).toBe('2027-04-03')

    cancelar()
    abrir()
    expect(campoFecha().value).toBe('')
    expect(screen.queryByText(/Fecha leída del documento/i)).toBeNull()
    expect(screen.queryByText(/Leyendo la fecha/i)).toBeNull()
  })
})

// I2: una vez que el usuario tocó el campo (aunque lo deje vacío a propósito),
// el autorelleno queda apagado para siempre.
describe('I2: la IA no pisa un campo que el usuario vació a propósito', () => {
  it('escribir y borrar apaga el autorelleno; una lectura posterior no escribe nada', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    fireEvent.change(campoFecha(), { target: { value: '2028-12-01' } })
    fireEvent.change(campoFecha(), { target: { value: '' } })
    expect(campoFecha().value).toBe('')

    act(() => { manejadores.alLeer('2027-04-03') })
    expect(campoFecha().value).toBe('')
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

  // M8: el aviso lo tiene que poder encontrar un lector de pantalla, no solo
  // quien vea la pantalla.
  it('el aviso queda asociado al campo para un lector de pantalla', () => {
    mocks.useLecturaFecha.mockReturnValue('lista')
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    const aviso = screen.getByText(/Fecha leída del documento/i)
    expect(campoFecha().getAttribute('aria-describedby')).toBe(aviso.id)
    expect(aviso.getAttribute('aria-live')).toBe('polite')
  })
})
