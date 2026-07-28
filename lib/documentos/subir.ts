import { decidirSalida, esImagen, type Pagina, type Progreso } from '@/lib/documentos/paginas'
import { comprimirImagen } from '@/lib/documentos/imagen'
import { construirPdf } from '@/lib/documentos/pdf'

/** Una foto de la lista no se pudo leer. Lleva el id para que la UI marque esa miniatura. */
export class ErrorPagina extends Error {
  constructor(public paginaId: string) {
    super('pagina_ilegible')
    this.name = 'ErrorPagina'
  }
}

/**
 * Prepara las páginas y las sube a Storage como un solo archivo.
 *
 * Toda la compresión ocurre ANTES de la primera llamada de red: así una foto
 * ilegible se detecta sin haber subido nada a medias.
 */
export async function subirPaginas(
  vehicleId: string,
  paginas: Pagina[],
  onProgreso?: (p: Progreso) => void,
): Promise<{ filePath: string } | null> {
  const salida = decidirSalida(paginas)
  if (salida === 'ninguno') return null

  let cuerpo: Blob
  let fileName: string
  let contentType: string

  const soloArchivo = salida === 'archivo' && !esImagen(paginas[0].file.type)
  if (soloArchivo) {
    // Un PDF del usuario viaja intacto.
    cuerpo = paginas[0].file
    fileName = paginas[0].file.name
    contentType = paginas[0].file.type
  } else {
    const jpegs: Blob[] = []
    // De a una y en orden: nunca hay más de una foto descomprimida en memoria.
    for (let i = 0; i < paginas.length; i++) {
      onProgreso?.({ hechas: i, total: paginas.length })
      try {
        jpegs.push(await comprimirImagen(paginas[i].file))
      } catch {
        throw new ErrorPagina(paginas[i].id)
      }
    }
    if (salida === 'pdf') {
      cuerpo = await construirPdf(jpegs)
      fileName = 'documento.pdf'
      contentType = 'application/pdf'
    } else {
      // El nombre y el tipo salen de lo que realmente se sube, no del archivo original:
      // un HEIC que ya pasó por canvas es un JPEG y hay que etiquetarlo como tal.
      cuerpo = jpegs[0]
      fileName = 'documento.jpg'
      contentType = 'image/jpeg'
    }
  }

  onProgreso?.('subiendo')
  const res = await fetch('/api/documents/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId, fileName, contentType }),
  })
  if (!res.ok) throw new Error('upload-url')
  const { uploadUrl, filePath } = await res.json()
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: cuerpo })
  if (!put.ok) throw new Error('upload')
  return { filePath }
}
