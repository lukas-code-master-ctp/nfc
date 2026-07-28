/**
 * Arma un PDF con una página por imagen, del tamaño exacto de cada foto.
 *
 * Los JPEG entran SIN recodificar: PDF entiende JPEG de forma nativa (DCTDecode),
 * así que el archivo final pesa casi exactamente la suma de las fotos comprimidas.
 *
 * pdf-lib se carga con import() dinámico a propósito: solo se descarga cuando
 * alguien realmente arma un PDF, no en cada visita a la ficha del vehículo.
 */
export async function construirPdf(jpegs: Blob[]): Promise<Blob> {
  // Caso especial: PDF completamente vacío (sin páginas).
  // pdf-lib agrega una página por defecto al crear un documento, así que
  // para devolver un PDF con 0 páginas creamos uno vacío a mano.
  if (jpegs.length === 0) {
    // PDF mínimo válido sin páginas.
    const pdfText = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj
xref
0 3
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
trailer<</Size 3/Root 1 0 R>>
startxref
111
%%EOF`
    const bytes = new TextEncoder().encode(pdfText)
    return new Blob([bytes], { type: 'application/pdf' })
  }

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
