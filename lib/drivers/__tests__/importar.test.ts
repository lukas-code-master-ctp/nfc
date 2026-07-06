import { describe, it, expect } from 'vitest'
import { parseImportacion } from '@/lib/drivers/importar'

const gen = () => '9999'

describe('parseImportacion', () => {
  it('parsea filas tab-separadas (nombre, rut, pin)', () => {
    const filas = parseImportacion('Ana Pérez\t11.111.111-1\t1234\nBeto\t\t5678', [], gen)
    expect(filas).toEqual([
      { nombre: 'Ana Pérez', rut: '11.111.111-1', pin: '1234', pinGenerado: false, estado: 'ok' },
      { nombre: 'Beto', rut: undefined, pin: '5678', pinGenerado: false, estado: 'ok' },
    ])
  })
  it('acepta ; y , como separador cuando no hay tab', () => {
    expect(parseImportacion('Ana;;1234', [], gen)[0].estado).toBe('ok')
    expect(parseImportacion('Ana,,1234', [], gen)[0].estado).toBe('ok')
  })
  it('genera PIN de 4 dígitos cuando viene vacío', () => {
    const [f] = parseImportacion('Ana', [], gen)
    expect(f).toMatchObject({ pin: '9999', pinGenerado: true, estado: 'ok' })
  })
  it('marca sin_nombre y pin_invalido', () => {
    const filas = parseImportacion('\t\t1234\nBeto\t\t12', [], gen)
    expect(filas[0].estado).toBe('sin_nombre')
    expect(filas[1].estado).toBe('pin_invalido')
  })
  it('marca duplicados contra el padrón y dentro del pegado (case-insensitive)', () => {
    const filas = parseImportacion('ana\t\t1234\nBeto\t\t5678\nBETO\t\t1111', ['Ana'], gen)
    expect(filas[0].estado).toBe('duplicado')
    expect(filas[1].estado).toBe('ok')
    expect(filas[2].estado).toBe('duplicado')
  })
  it('ignora líneas vacías', () => {
    expect(parseImportacion('\n\nAna\t\t1234\n\n', [], gen)).toHaveLength(1)
  })
})
