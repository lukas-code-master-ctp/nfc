import { dimensionesReescaladas, LADO_MAX, CALIDAD_JPEG } from '@/lib/documentos/paginas'

/**
 * Decodifica una foto, la endereza, la reescala y la recomprime a JPEG.
 *
 * Tres cosas importan acá:
 * - imageOrientation: 'from-image' aplica el giro que la cámara dejó en los metadatos.
 *   Sin eso, una foto sacada apaisada sale acostada en el PDF.
 * - Pasar por canvas normaliza de paso los HEIC del iPhone, que muchos visores no abren.
 * - El bitmap se cierra siempre: diez fotos de celular abiertas a la vez revientan
 *   la pestaña en un teléfono de gama baja.
 *
 * Lanza si la imagen no se puede decodificar; el llamador marca esa página.
 */
export async function comprimirImagen(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { w, h } = dimensionesReescaladas(bitmap.width, bitmap.height, LADO_MAX)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('sin_contexto_2d')
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolver) =>
      canvas.toBlob(resolver, 'image/jpeg', CALIDAD_JPEG),
    )
    if (!blob) throw new Error('sin_blob')
    return blob
  } finally {
    bitmap.close()
  }
}
