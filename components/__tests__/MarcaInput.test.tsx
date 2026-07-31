import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MarcaInput from '@/components/vehicle/MarcaInput'

/** Envoltorio controlado, como lo usa el modal de alta. */
function Campo({ inicial = '' }: { inicial?: string }) {
  const [v, setV] = useState(inicial)
  return <MarcaInput value={v} onChange={setV} placeholder="Marca" />
}

const campo = () => screen.getByPlaceholderText('Marca') as HTMLInputElement
const escribir = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })
const opciones = () => screen.queryAllByRole('option')

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('sugerencias', () => {
  it('al escribir aparecen las marcas que calzan, en el orden de la librería', () => {
    render(<Campo />)
    escribir('sub')
    // Subaru primero porque EMPIEZA con "sub"; Mitsubishi después porque solo
    // lo contiene (Mit-sub-ishi).
    expect(opciones().map((o) => o.textContent)).toEqual(['Subaru', 'Mitsubishi'])
  })

  it('sin escribir nada no hay lista', () => {
    render(<Campo />)
    expect(opciones()).toHaveLength(0)
  })

  it('sin coincidencias tampoco: una lista vacía no aporta', () => {
    render(<Campo />)
    escribir('zzzz')
    expect(opciones()).toHaveLength(0)
  })
})

describe('elegir con el mouse', () => {
  // El clic va en onMouseDown y no en onClick: el blur del input dispara ANTES
  // que el click, así que con onClick la lista se cierra antes de que la opción
  // reciba el evento y el clic no hace nada.
  it('el clic en una opción la escribe en el campo y cierra la lista', () => {
    render(<Campo />)
    escribir('sub')
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Subaru' }))
    expect(campo().value).toBe('Subaru')
    expect(opciones()).toHaveLength(0)
  })
})

describe('elegir con el teclado', () => {
  it('flecha abajo y Enter eligen', () => {
    render(<Campo />)
    escribir('ge')
    fireEvent.keyDown(campo(), { key: 'ArrowDown' })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(campo().value).toBe('Dodge') // la segunda: Geely, Dodge, Peugeot, Volkswagen
  })

  it('Enter sin mover elige la primera', () => {
    render(<Campo />)
    escribir('ge')
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(campo().value).toBe('Geely')
  })

  it('flecha arriba desde la primera va a la última', () => {
    render(<Campo />)
    escribir('ge')
    fireEvent.keyDown(campo(), { key: 'ArrowUp' })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(campo().value).toBe('Volkswagen')
  })

  it('Escape cierra la lista y CONSERVA lo escrito', () => {
    render(<Campo />)
    escribir('sub')
    fireEvent.keyDown(campo(), { key: 'Escape' })
    expect(opciones()).toHaveLength(0)
    expect(campo().value).toBe('sub')
  })
})

describe('la lista es abierta', () => {
  // Es lo que la distingue de un <select> disfrazado.
  it('se puede escribir una marca que no está en la librería', () => {
    render(<Campo />)
    escribir('Marca Rara SpA')
    expect(campo().value).toBe('Marca Rara SpA')
  })
})

describe('accesibilidad', () => {
  it('el campo se anuncia como combobox y dice si está desplegado', () => {
    render(<Campo />)
    const input = screen.getByRole('combobox')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    escribir('sub')
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('true')
  })

  it('la opción resaltada se apunta con aria-activedescendant', () => {
    render(<Campo />)
    escribir('ge')
    const activa = campo().getAttribute('aria-activedescendant')
    expect(activa).toBeTruthy()
    expect(document.getElementById(activa!)?.textContent).toBe('Geely')
  })

  it('la lista es un listbox', () => {
    render(<Campo />)
    escribir('sub')
    expect(screen.getByRole('listbox')).toBeTruthy()
  })
})
