# Previsualización de PDFs en la ficha pública — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En la ficha pública `/v/[token]`, mostrar la primera página de cada documento PDF como imagen inline (hoy es solo un botón), para que se vea parejo con las fotos durante una fiscalización.

**Architecture:** Un componente cliente `PdfPreview` renderiza la página 1 del PDF en un `<canvas>` usando pdf.js (`pdfjs-dist`, importado dinámicamente solo en el cliente). El worker de pdf.js se sirve same-origin desde `public/`, copiado desde `node_modules` por un script de `postinstall` (versión siempre calzada). Si el render falla, cae al botón actual. Se integra en un solo punto (`DocumentosView` de `PublicVehicleView`). No se toca subida, endpoints, datos ni la ficha privada.

**Tech Stack:** Next.js 16 (App Router, client components, dynamic import), React, `pdfjs-dist`, Tailwind v4 (tokens en `app/globals.css`).

## Global Constraints

- Todo el código, UI y comentarios en **español neutro (Chile)**, usando "tú".
- Íconos SVG inline, **no emojis**. Colores vía tokens de la app (`azul`, `azul-press`, `acero`, `tinta`, `linea`, `lienzo`).
- **Solo la ficha pública** `/v/[token]`. No se toca la subida de documentos, endpoints, datos, reglas de Firestore, ni la ficha privada `/vehiculos/[id]`.
- El `import('pdfjs-dist')` ocurre **solo dentro de un `useEffect` client-side**; nunca en module-scope (pdfjs referencia APIs de browser y rompe el SSR).
- **Fallback obligatorio:** si el render del PDF falla, se muestra el botón azul "Ver documento (PDF)" actual (mismo markup que hoy). Nunca se pierde el acceso al documento.
- La rama de imágenes (`isImage`) y la de "Sin archivo adjunto" en `DocumentosView` quedan **idénticas**.
- Sin tests nuevos: el render con canvas/worker no es unit-testeable de forma útil; la red de seguridad es el fallback + verificación manual.

---

### Task 1: Dependencia pdf.js + worker en public/ vía postinstall

**Files:**
- Modify: `package.json` (agregar dependencia `pdfjs-dist` y script `postinstall`)
- Create: `scripts/copy-pdf-worker.mjs`
- Modify: `.gitignore` (ignorar el worker copiado)

**Interfaces:**
- Consumes: nada.
- Produces: el archivo `public/pdf.worker.min.mjs` disponible same-origin en runtime; lo consume `PdfPreview` (Task 2) vía `workerSrc = '/pdf.worker.min.mjs'`.

- [ ] **Step 1: Instalar la dependencia**

Run: `npm install pdfjs-dist`
Expected: se agrega `pdfjs-dist` a `dependencies` en `package.json` y aparece `node_modules/pdfjs-dist/`. Anota la versión resuelta en tu reporte.

- [ ] **Step 2: Verificar el nombre real del archivo del worker**

Run: `ls node_modules/pdfjs-dist/build/ | grep worker`
Expected: existe `pdf.worker.min.mjs` (pdfjs v4). Si el minificado tuviera otro nombre, usa ESE como `src` en el script del Step 3 (el destino `public/pdf.worker.min.mjs` no cambia — es el nombre que referencia el componente).

- [ ] **Step 3: Crear el script de copia del worker**

Crear `scripts/copy-pdf-worker.mjs`:

```javascript
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
```

- [ ] **Step 4: Agregar el script `postinstall` en package.json**

En la sección `"scripts"` de `package.json`, agregar (junto a los demás scripts):

```json
    "postinstall": "node scripts/copy-pdf-worker.mjs",
```

(No hay un `postinstall` previo, así que no se pisa nada.)

- [ ] **Step 5: Ignorar el worker copiado en .gitignore**

Agregar al final de `.gitignore`:

```
# Worker de pdf.js copiado desde node_modules en postinstall (artefacto de build)
/public/pdf.worker.min.mjs
```

- [ ] **Step 6: Correr la copia y verificar**

Run: `node scripts/copy-pdf-worker.mjs`
Expected: imprime `Copiado ... -> public/pdf.worker.min.mjs`.

Run: `ls public/pdf.worker.min.mjs`
Expected: el archivo existe.

Run: `git status --porcelain public/pdf.worker.min.mjs`
Expected: **sin salida** (el archivo está ignorado por git).

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/copy-pdf-worker.mjs .gitignore
git commit -m "build(pdf): pdfjs-dist + worker a public/ vía postinstall"
```

---

### Task 2: Componente `PdfPreview`

**Files:**
- Create: `components/documento/PdfPreview.tsx`

**Interfaces:**
- Consumes: `LoadingDots` de `@/components/LoadingDots` (`{ className?: string }`); `pdfjs-dist` (dynamic import, Task 1); el worker en `/pdf.worker.min.mjs` (Task 1).
- Produces: `export default function PdfPreview(props: { url: string; label: string }): JSX.Element` — consumido por `DocumentosView` (Task 3).

- [ ] **Step 1: Crear el componente**

Crear `components/documento/PdfPreview.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import LoadingDots from '@/components/LoadingDots'

type Estado = 'cargando' | 'ok' | 'error'

// Renderiza la primera página de un PDF como imagen inline (un "print"), para que
// en la ficha pública los PDFs se vean como las fotos. Usa pdf.js en el cliente;
// si algo falla, cae al botón de "Ver documento (PDF)".
export default function PdfPreview({ url, label }: { url: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [estado, setEstado] = useState<Estado>('cargando')

  useEffect(() => {
    let cancelado = false
    async function render() {
      try {
        // pdfjs referencia APIs de browser: se importa SOLO en el cliente.
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const pdf = await pdfjs.getDocument(url).promise
        if (cancelado) { await pdf.destroy(); return }
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) { await pdf.destroy(); return }
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: ctx, viewport }).promise
        await pdf.destroy()
        if (!cancelado) setEstado('ok')
      } catch {
        if (!cancelado) setEstado('error')
      }
    }
    render()
    return () => { cancelado = true }
  }, [url])

  // Fallback: si el render falla, el botón azul de siempre (mismo markup que
  // usaba DocumentosView para los PDFs).
  if (estado === 'error') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-azul px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-azul-press"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
        </svg>
        Ver documento (PDF)
      </a>
    )
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {estado === 'cargando' && (
        <div className="flex h-40 w-full items-center justify-center gap-2 rounded-xl border border-linea bg-lienzo text-acero">
          <LoadingDots />
          <span className="text-sm">Cargando vista previa…</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        aria-label={`Documento: ${label}`}
        className={`max-h-96 w-full rounded-xl border border-linea bg-lienzo object-contain ${estado === 'ok' ? '' : 'hidden'}`}
      />
      {estado === 'ok' && (
        <span className="mt-2 block text-center text-sm text-acero">Toca para ver el PDF completo</span>
      )}
    </a>
  )
}
```

Nota: el código apunta a la API de pdfjs v4 (`getDocument(url).promise`, `getPage(1)`, `getViewport({ scale })`, `render({ canvasContext, viewport }).promise`). Si los tipos de la versión instalada exigen un campo adicional en `render(...)` (p. ej. `canvas`), agrégalo siguiendo el tipo — no cambies la lógica.

- [ ] **Step 2: Typecheck y lint**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint components lib`
Expected: sin errores (los 3 warnings preexistentes de `react-hooks/set-state-in-effect` en TeamCard/DriversCard/BitacoraFlota son ajenos y no bloquean).

- [ ] **Step 3: Commit**

```bash
git add components/documento/PdfPreview.tsx
git commit -m "feat(pdf): componente PdfPreview (render de la 1ª página con pdf.js)"
```

---

### Task 3: Integrar PdfPreview en la ficha pública

**Files:**
- Modify: `components/PublicVehicleView.tsx` (función `DocumentosView`: rama PDF del ternario + un import)

**Interfaces:**
- Consumes: `PdfPreview` de `@/components/documento/PdfPreview` (Task 2).
- Produces: nada nuevo.

- [ ] **Step 1: Importar PdfPreview**

En `components/PublicVehicleView.tsx`, junto a los imports de componentes de arriba (después de `import UsoPanel from '@/components/uso/UsoPanel'`), agregar:

```tsx
import PdfPreview from '@/components/documento/PdfPreview'
```

- [ ] **Step 2: Reemplazar la rama del botón PDF por el preview**

En la función `DocumentosView`, la rama final del ternario (cuando hay `readUrl` y **no** es imagen) es hoy este bloque:

```tsx
                  ) : (
                    <a
                      href={d.readUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-azul px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-azul-press"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                      </svg>
                      Ver documento (PDF)
                    </a>
                  )}
```

Reemplazarlo por:

```tsx
                  ) : (
                    <PdfPreview url={d.readUrl} label={label ?? 'Documento'} />
                  )}
```

Las otras dos ramas del ternario (`!d.readUrl` → "Sin archivo adjunto", y `isImage(d.filePath)` → `<img>`) **no se tocan**.

- [ ] **Step 3: Typecheck, lint y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint app components lib`
Expected: sin errores (mismos 3 warnings preexistentes ajenos).

Run: `npm run build`
Expected: build exitoso (corre `postinstall`/copia del worker; `pdfjs-dist` se code-splitea por el dynamic import y no debe entrar al chunk inicial de la ficha pública).

- [ ] **Step 4: Verificación manual (checklist para el revisor humano)**

- Abrir `/v/{token}` de un vehículo con un documento **PDF** → se ve la primera página inline (mismo estilo que las fotos); tocarla abre el PDF completo en otra pestaña.
- Un documento **imagen** sigue viéndose igual que antes.
- Un documento **sin archivo** sigue mostrando "Sin archivo adjunto".
- (Si se puede) probar en un teléfono, que es el caso de uso real de fiscalización.

- [ ] **Step 5: Commit**

```bash
git add components/PublicVehicleView.tsx
git commit -m "feat(pdf): previsualizar PDFs inline en la ficha pública"
```

---

## Notas de verificación final

Antes del merge: `npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (sin tests nuevos; `rules.test.ts` requiere emulador y se salta en local). Recordar que merge a `master` **auto-despliega a producción**. Tras el deploy, verificar en `app.tapcar.cl` (idealmente en móvil) que un PDF real se previsualiza; si no, el fallback deja el botón "Ver documento (PDF)" funcionando.
