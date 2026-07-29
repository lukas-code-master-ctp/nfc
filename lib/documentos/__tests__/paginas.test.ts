import { describe, it, expect } from 'vitest'
import {
  MAX_PAGINAS,
  esImagen,
  cabenPaginas,
  decidirSalida,
  dimensionesReescaladas,
  textoProgreso,
  type Pagina,
} from '@/lib/documentos/paginas'

function pagina(type: string, nombre = 'foto.jpg'): Pagina {
  return { id: nombre, file: new File([''], nombre, { type }) }
}

const JPG = 'image/jpeg'
const PDF = 'application/pdf'

describe('esImagen', () => {
  it('reconoce las imágenes, incluido el HEIC del iPhone', () => {
    expect(esImagen(JPG)).toBe(true)
    expect(esImagen('image/heic')).toBe(true)
  })
  it('no confunde un PDF ni un tipo vacío con una imagen', () => {
    expect(esImagen(PDF)).toBe(false)
    expect(esImagen('')).toBe(false)
  })
})

describe('cabenPaginas', () => {
  it('acepta todas cuando hay espacio de sobra', () => {
    expect(cabenPaginas(2, 3)).toEqual({ acepta: 3, rechaza: 0 })
  })
  it('acepta solo las que caben y reporta el resto', () => {
    expect(cabenPaginas(8, 5)).toEqual({ acepta: 2, rechaza: 3 })
  })
  it('rechaza todas cuando ya está en el tope', () => {
    expect(cabenPaginas(MAX_PAGINAS, 2)).toEqual({ acepta: 0, rechaza: 2 })
  })
})

describe('decidirSalida', () => {
  it('sin páginas no hay nada que subir', () => {
    expect(decidirSalida([])).toBe('ninguno')
  })
  it('una sola foto se sube como archivo, no como PDF', () => {
    expect(decidirSalida([pagina(JPG)])).toBe('archivo')
  })
  it('dos o más fotos se arman en un PDF', () => {
    expect(decidirSalida([pagina(JPG), pagina(JPG)])).toBe('pdf')
  })
  it('un PDF del usuario se sube tal cual', () => {
    expect(decidirSalida([pagina(PDF, 'doc.pdf')])).toBe('archivo')
  })
  it('si se colara un PDF junto a fotos, no intenta armar un PDF con él', () => {
    expect(decidirSalida([pagina(PDF, 'doc.pdf'), pagina(JPG)])).toBe('archivo')
  })
})

describe('dimensionesReescaladas', () => {
  it('no agranda una foto que ya es más chica que el tope', () => {
    expect(dimensionesReescaladas(800, 600, 2000)).toEqual({ w: 800, h: 600 })
  })
  it('reescala por el lado largo respetando la proporción', () => {
    expect(dimensionesReescaladas(4000, 3000, 2000)).toEqual({ w: 2000, h: 1500 })
  })
  it('toma el alto cuando la foto es vertical', () => {
    expect(dimensionesReescaladas(3000, 4000, 2000)).toEqual({ w: 1500, h: 2000 })
  })
  it('redondea a enteros', () => {
    const { w, h } = dimensionesReescaladas(3333, 2500, 2000)
    expect(Number.isInteger(w)).toBe(true)
    expect(Number.isInteger(h)).toBe(true)
  })
})

describe('textoProgreso', () => {
  it('cuenta las páginas en base 1, como las ve el usuario', () => {
    expect(textoProgreso({ hechas: 2, total: 10 })).toBe('Preparando página 3 de 10…')
  })
  it('avisa cuando ya está subiendo', () => {
    expect(textoProgreso('subiendo')).toBe('Subiendo…')
  })
  it('cae a un texto genérico si todavía no hay avance', () => {
    expect(textoProgreso(null)).toBe('Guardando…')
  })
})
