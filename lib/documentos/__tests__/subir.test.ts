import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Pagina } from '@/lib/documentos/paginas'

const mocks = vi.hoisted(() => ({
  comprimirImagen: vi.fn(),
  construirPdf: vi.fn(),
}))

vi.mock('@/lib/documentos/imagen', () => ({ comprimirImagen: mocks.comprimirImagen }))
vi.mock('@/lib/documentos/pdf', () => ({ construirPdf: mocks.construirPdf }))

const { subirPaginas, ErrorPagina } = await import('@/lib/documentos/subir')

function pagina(id: string, type: string, nombre: string): Pagina {
  return { id, file: new File(['x'], nombre, { type }), url: 'blob:x' }
}

const fetchMock = vi.fn()

beforeEach(() => {
  mocks.comprimirImagen.mockReset()
  mocks.construirPdf.mockReset()
  mocks.comprimirImagen.mockResolvedValue(new Blob(['jpg'], { type: 'image/jpeg' }))
  mocks.construirPdf.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ uploadUrl: 'https://up', filePath: 'vehicles/v1/abc' }) })
    }
    return Promise.resolve({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Lo que se le pidió al endpoint de signed URL en la última llamada. */
function cuerpoDeUploadUrl() {
  const llamada = fetchMock.mock.calls.find((c) => c[0] === '/api/documents/upload-url')!
  return JSON.parse(llamada[1].body)
}

describe('subirPaginas', () => {
  it('sin páginas no toca la red y devuelve null', async () => {
    expect(await subirPaginas('v1', [])).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con dos fotos arma un PDF y lo sube como PDF', async () => {
    const r = await subirPaginas('v1', [pagina('a', 'image/jpeg', 'a.jpg'), pagina('b', 'image/jpeg', 'b.jpg')])
    expect(mocks.construirPdf).toHaveBeenCalledOnce()
    expect(cuerpoDeUploadUrl()).toMatchObject({ vehicleId: 'v1', fileName: 'documento.pdf', contentType: 'application/pdf' })
    expect(r).toEqual({ filePath: 'vehicles/v1/abc' })
  })

  it('con una sola foto sube la imagen comprimida, no un PDF', async () => {
    await subirPaginas('v1', [pagina('a', 'image/jpeg', 'a.jpg')])
    expect(mocks.construirPdf).not.toHaveBeenCalled()
    expect(cuerpoDeUploadUrl()).toMatchObject({ fileName: 'documento.jpg', contentType: 'image/jpeg' })
  })

  it('una foto HEIC del iPhone se sube como JPEG, no con su tipo original', async () => {
    await subirPaginas('v1', [pagina('a', 'image/heic', 'IMG_0001.HEIC')])
    expect(mocks.comprimirImagen).toHaveBeenCalledOnce()
    expect(cuerpoDeUploadUrl()).toMatchObject({ fileName: 'documento.jpg', contentType: 'image/jpeg' })
  })

  it('un PDF del usuario se sube tal cual, sin comprimir ni rearmar', async () => {
    await subirPaginas('v1', [pagina('a', 'application/pdf', 'permiso.pdf')])
    expect(mocks.comprimirImagen).not.toHaveBeenCalled()
    expect(mocks.construirPdf).not.toHaveBeenCalled()
    expect(cuerpoDeUploadUrl()).toMatchObject({ fileName: 'permiso.pdf', contentType: 'application/pdf' })
  })

  it('una foto ilegible corta todo antes de subir nada, y dice cuál fue', async () => {
    mocks.comprimirImagen
      .mockResolvedValueOnce(new Blob(['ok'], { type: 'image/jpeg' }))
      .mockRejectedValueOnce(new Error('no se pudo decodificar'))
    const fallo = await subirPaginas('v1', [
      pagina('a', 'image/jpeg', 'a.jpg'),
      pagina('b', 'image/jpeg', 'b.jpg'),
      pagina('c', 'image/jpeg', 'c.jpg'),
    ]).catch((e) => e)

    expect(fallo).toBeInstanceOf(ErrorPagina)
    expect((fallo as InstanceType<typeof ErrorPagina>).paginaId).toBe('b')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('informa el avance página por página y después la subida', async () => {
    const avances: unknown[] = []
    await subirPaginas('v1', [pagina('a', 'image/jpeg', 'a.jpg'), pagina('b', 'image/jpeg', 'b.jpg')], (p) => avances.push(p))
    expect(avances).toEqual([{ hechas: 0, total: 2 }, { hechas: 1, total: 2 }, 'subiendo'])
  })

  it('propaga el fallo del PUT a Storage', async () => {
    fetchMock.mockImplementation((url: string) =>
      typeof url === 'string' && url.startsWith('/api/')
        ? Promise.resolve({ ok: true, json: () => Promise.resolve({ uploadUrl: 'https://up', filePath: 'p' }) })
        : Promise.resolve({ ok: false }),
    )
    await expect(subirPaginas('v1', [pagina('a', 'image/jpeg', 'a.jpg')])).rejects.toThrow('upload')
  })
})
