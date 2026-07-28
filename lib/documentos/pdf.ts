/**
 * Arma un PDF con una página por imagen, del tamaño exacto de cada foto.
 *
 * Los JPEG entran SIN recodificar: PDF entiende JPEG de forma nativa (DCTDecode),
 * así que el archivo final pesa casi exactamente la suma de las fotos comprimidas.
 *
 * pdf-lib se carga con import() dinámico a propósito: solo se descarga cuando
 * alguien realmente arma un PDF, no en cada visita a la ficha del vehículo.
 *
 * Siempre se llama con al menos una imagen: quien la usa corta antes si la lista
 * está vacía. Por eso no hay una rama para el caso sin páginas.
 */
export async function construirPdf(jpegs: Blob[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()

  for (const jpeg of jpegs) {
    const img = await doc.embedJpg(await jpeg.arrayBuffer())
    const page = doc.addPage([img.width, img.height])
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
  }

  // new Uint8Array(...) copia a un ArrayBuffer plano: sin eso, según la versión
  // de las libs de TS, el Uint8Array que devuelve save() no calza con BlobPart.
  const bytes = await doc.save()
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
}
