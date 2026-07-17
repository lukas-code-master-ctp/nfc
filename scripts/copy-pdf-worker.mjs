// Copia el worker de pdf.js a public/ para servirlo same-origin (workerSrc =
// '/pdf.worker.min.mjs' en components/documento/PdfPreview.tsx). La versión del
// worker DEBE calzar con la de pdfjs-dist; copiarlo desde node_modules lo
// garantiza. Se ejecuta en `postinstall` (local y en el build de Vercel).
// Best-effort: si el worker no está, avisa pero NO rompe la instalación — el
// componente cae a su botón de fallback si el worker falta.
import { copyFile, mkdir, access } from 'node:fs/promises'
import { dirname } from 'node:path'

const src = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
const dest = 'public/pdf.worker.min.mjs'

try {
  await access(src)
} catch {
  console.warn(`[copy-pdf-worker] No se encontró ${src}; se omite la copia.`)
  process.exit(0)
}

await mkdir(dirname(dest), { recursive: true })
await copyFile(src, dest)
console.log(`[copy-pdf-worker] Copiado ${src} -> ${dest}`)
