import { describe, it, expect } from 'vitest'
import { MARCAS, sugerirMarcas, normalizarMarca } from '@/lib/vehicles/marcas'

describe('la lista', () => {
  it('está ordenada alfabéticamente, ignorando acentos y mayúsculas', () => {
    const clave = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const ordenada = [...MARCAS].sort((a, b) => clave(a).localeCompare(clave(b), 'es'))
    expect([...MARCAS]).toEqual(ordenada)
  })

  it('no tiene repetidas ni espacios sobrantes', () => {
    expect(new Set(MARCAS).size).toBe(MARCAS.length)
    for (const m of MARCAS) expect(m).toBe(m.trim())
  })
})

describe('sugerirMarcas', () => {
  // El caso que motivó el feature. "Mitsubishi" también contiene "sub", pero
  // quien escribe "sub" busca Subaru: por eso el que EMPIEZA va primero, aunque
  // Mitsubishi aparezca antes en la lista alfabética.
  it('encuentra por el principio, y eso manda sobre el orden alfabético', () => {
    expect(sugerirMarcas('sub')).toEqual(['Subaru', 'Mitsubishi'])
  })

  it('también encuentra en medio de la palabra', () => {
    expect(sugerirMarcas('aru')).toEqual(['Subaru'])
  })

  // Lo que empieza con el texto va primero AUNQUE alfabéticamente vaya después:
  // Dodge y Peugeot contienen "ge", pero quien escribe "ge" busca Geely.
  it('prioriza las que empiezan con el texto sobre las que solo lo contienen', () => {
    expect(sugerirMarcas('ge')).toEqual(['Geely', 'Dodge', 'Peugeot', 'Volkswagen'])
  })

  it('ignora acentos en los dos sentidos', () => {
    expect(sugerirMarcas('citroen')).toEqual(['Citroën'])
    expect(sugerirMarcas('skoda')).toEqual(['Škoda'])
  })

  it('ignora mayúsculas y espacios alrededor', () => {
    expect(sugerirMarcas('  SUB  ')).toEqual(['Subaru', 'Mitsubishi'])
  })

  it('con la query vacía no sugiere nada: abrir el modal no debe llenarse de marcas', () => {
    expect(sugerirMarcas('')).toEqual([])
    expect(sugerirMarcas('   ')).toEqual([])
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(sugerirMarcas('zzzz')).toEqual([])
  })

  it('corta en 8 por defecto: una lista más larga tapa el formulario en un celular', () => {
    expect(sugerirMarcas('a').length).toBeLessThanOrEqual(8)
  })

  it('respeta un tope explícito', () => {
    expect(sugerirMarcas('a', 3)).toHaveLength(3)
  })
})

describe('normalizarMarca', () => {
  it('lleva a la forma canónica lo que calza con la librería', () => {
    expect(normalizarMarca('  subaru ')).toBe('Subaru')
    expect(normalizarMarca('MERCEDES-BENZ')).toBe('Mercedes-Benz')
  })

  it('recupera los acentos que el usuario no escribió', () => {
    expect(normalizarMarca('citroen')).toBe('Citroën')
  })

  it('colapsa espacios internos', () => {
    expect(normalizarMarca('great   wall')).toBe('Great Wall')
  })

  // Una lista abierta no puede imponerle una escritura a lo que no conoce.
  it('a una marca desconocida solo le saca los espacios, sin tocar su escritura', () => {
    expect(normalizarMarca('  JMC ')).toBe('JMC')
    expect(normalizarMarca('jmc')).toBe('jmc')
  })

  it('una cadena vacía sigue vacía', () => {
    expect(normalizarMarca('')).toBe('')
    expect(normalizarMarca('   ')).toBe('')
  })
})
