import { comprimirImagen } from '@/lib/documentos/imagen'
import { esImagen, CALIDAD_JPEG, LADO_MAX, type Pagina } from '@/lib/documentos/paginas'

/**
 * Tope de tamaño del archivo ANTES de leerlo. La rama PDF carga el archivo
 * completo a memoria (`file.arrayBuffer()`, más abajo) — algo que `subirPaginas`
 * nunca hace (sube el `File` directo al `PUT`) — así que el OCR no debe imponer
 * un techo de memoria nuevo en un celular modesto sin que el usuario haya
 * pedido nada. 20 MB es holgado para una foto o un PDF de un documento vehicular.
 */
const TOPE_BYTES = 20 * 1024 * 1024

/**
 * La primera página lista para que la lea el modelo: un data URI de JPEG.
 *
 * Devuelve `null` si no se puede (PDF corrupto, foto ilegible, sin página,
 * archivo demasiado grande). Ahí no se llama al modelo y no se gasta nada — es
 * el camino barato del fallo. Best-effort: un archivo enorme simplemente se
 * queda sin fecha leída, no rompe nada.
 */
export async function primeraImagen(pagina: Pagina | undefined): Promise<string | null> {
  if (!pagina) return null
  if (pagina.file.size > TOPE_BYTES) return null
  try {
    const blob = esImagen(pagina.file.type)
      ? await comprimirImagen(pagina.file)
      : await primeraPaginaDePdf(pagina.file)
    return blob ? await aDataUri(blob) : null
  } catch {
    // Best-effort: leer la fecha es un extra, nunca puede romper el formulario.
    return null
  }
}

/**
 * Renderiza la primera página de un PDF a JPEG. Mismo procedimiento que
 * `components/documento/PdfPreview.tsx`, incluido el `import()` dinámico:
 * **pdfjs referencia APIs de browser y nunca puede ir en module scope**, o
 * rompe el render del servidor.
 */
async function primeraPaginaDePdf(file: File): Promise<Blob | null> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  // `file.arrayBuffer()` devuelve una copia fresca cada vez que se llama, no el
  // buffer interno del File — así que si pdf.js transfiere este `Uint8Array` a
  // su worker (y lo deja "detached"), la subida posterior del mismo PDF (que
  // vuelve a llamar `file.arrayBuffer()` en `subirPaginas`) no se ve afectada.
  // Ojo con "optimizar" esto reusando el buffer entre la lectura y la subida.
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    // Se renderiza a la misma resolución que usan las fotos: suficiente para
    // leer y sin inflar el cuerpo del request. Un PDF es vectorial, así que
    // ampliar mejora la nitidez del texto en vez de pixelarlo.
    const viewport = page.getViewport({ scale: LADO_MAX / Math.max(base.width, base.height) })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({ canvasContext: ctx, canvas, viewport }).promise
    return await new Promise<Blob | null>((resolver) =>
      canvas.toBlob(resolver, 'image/jpeg', CALIDAD_JPEG),
    )
  } finally {
    // Libera el transport y el worker de pdf.js en todos los caminos.
    await pdf.loadingTask.destroy()
  }
}

function aDataUri(blob: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result))
    lector.onerror = () => rechazar(lector.error)
    lector.readAsDataURL(blob)
  })
}
