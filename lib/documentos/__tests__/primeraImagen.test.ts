import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  comprimirImagen: vi.fn(),
  getDocument: vi.fn(),
}))

vi.mock('@/lib/documentos/imagen', () => ({ comprimirImagen: mocks.comprimirImagen }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: mocks.getDocument,
}))

import { primeraImagen } from '@/lib/documentos/primeraImagen'

const pagina = (tipo: string) => ({
  id: 'p1',
  file: new File(['contenido'], 'doc', { type: tipo }),
})

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
})

describe('sin página', () => {
  it('no hace nada: no se llama al modelo ni se gasta', async () => {
    expect(await primeraImagen(undefined)).toBeNull()
    expect(mocks.comprimirImagen).not.toHaveBeenCalled()
  })
})

// M3+M5: el PDF se carga entero a memoria (`file.arrayBuffer()`) para leerlo,
// algo que `subirPaginas` nunca hace. Un tope de tamaño evita el techo de
// memoria nuevo en un celular modesto.
describe('archivo demasiado grande', () => {
  it('devuelve null sin intentar procesarlo, ni siquiera para una imagen', async () => {
    const grande = { id: 'p1', file: new File([new Uint8Array(21 * 1024 * 1024)], 'doc', { type: 'image/jpeg' }) }
    expect(await primeraImagen(grande)).toBeNull()
    expect(mocks.comprimirImagen).not.toHaveBeenCalled()
  })

  it('un archivo justo bajo el tope sí se procesa', async () => {
    mocks.comprimirImagen.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
    const chico = { id: 'p1', file: new File([new Uint8Array(19 * 1024 * 1024)], 'doc', { type: 'image/jpeg' }) }
    expect(await primeraImagen(chico)).not.toBeNull()
    expect(mocks.comprimirImagen).toHaveBeenCalled()
  })
})

describe('una foto', () => {
  it('la comprime y la devuelve como data URI', async () => {
    mocks.comprimirImagen.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
    const uri = await primeraImagen(pagina('image/jpeg'))
    expect(mocks.comprimirImagen).toHaveBeenCalled()
    expect(uri?.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('si la foto no se puede decodificar devuelve null en vez de explotar', async () => {
    mocks.comprimirImagen.mockRejectedValue(new Error('sin_bitmap'))
    expect(await primeraImagen(pagina('image/jpeg'))).toBeNull()
  })
})

describe('un PDF', () => {
  it('no pasa por el compresor de fotos', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error('pdf roto')) })
    await primeraImagen(pagina('application/pdf'))
    expect(mocks.comprimirImagen).not.toHaveBeenCalled()
  })

  it('si el PDF está corrupto devuelve null y no se llama al modelo', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error('pdf roto')) })
    expect(await primeraImagen(pagina('application/pdf'))).toBeNull()
  })
})
