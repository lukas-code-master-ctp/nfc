# Subir varias fotos como un solo PDF — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda acumular varias fotos desde la cámara del celular en un mismo documento y que la app las suba como un solo PDF.

**Architecture:** Lógica pura sin DOM en `lib/documentos/paginas.ts`; adaptadores finos del navegador (`imagen.ts`, `pdf.ts`) y un orquestador de subida (`subir.ts`) sobre ella; un componente `SelectorPaginas` que reemplaza el `<input type="file">` en los dos formularios de documentos. El PDF se arma en el navegador con `pdf-lib` cargada por `import()` dinámico. El servidor no cambia.

**Tech Stack:** Next.js 16 (App Router), TypeScript estricto, React 19, Tailwind v4, Vitest 4 + @testing-library/react (jsdom), `pdf-lib` (nueva dependencia), `nanoid` (ya presente).

**Spec:** `docs/superpowers/specs/2026-07-27-varias-fotos-a-pdf-design.md`

## Global Constraints

- Todo el código, UI, comentarios y mensajes en **español neutro (Chile)**, tratando de "tú".
- `MAX_PAGINAS = 10`, `LADO_MAX = 2000` px de lado largo, `CALIDAD_JPEG = 0.8`.
- Una sola imagen → se sube como **imagen JPEG comprimida**, no como PDF. Dos o más → PDF.
- Un PDF elegido por el usuario ocupa la lista completa y se sube **tal cual, sin recomprimir**.
- Las imágenes se comprimen **de a una, en secuencia**, liberando cada bitmap antes de la siguiente.
- Si una imagen no se puede decodificar: **no se sube nada**, se marca esa página. Nunca se arma el PDF saltándose una página.
- `pdf-lib` se importa **solo con `import()` dinámico**, nunca en el module scope.
- Tests en `__tests__/` junto al módulo. Include de Vitest: `**/__tests__/**/*.test.{ts,tsx}`.
- **No hay `@testing-library/user-event`** en el proyecto: usar `fireEvent`.
- Iconos SVG inline, sin emojis. Tokens de color: `tinta`, `acero`, `linea`, `lienzo`, `superficie`, `azul`, `azul-press`, `vencido`.
- Al terminar: `npx tsc --noEmit`, `npm test`, `npx eslint app components lib`, `npm run build`.

## Estructura de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `lib/documentos/paginas.ts` (nuevo) | Tipos, constantes y **toda la lógica pura**: tope, decisión de salida, reescalado, copy de progreso. Sin DOM ni red. |
| `lib/documentos/pdf.ts` (nuevo) | `construirPdf`: una página por JPEG, con `pdf-lib` dinámica. |
| `lib/documentos/imagen.ts` (nuevo) | `comprimirImagen`: decodificar + enderezar EXIF + reescalar + JPEG. Único módulo que toca canvas. |
| `lib/documentos/subir.ts` (nuevo) | `subirPaginas`: orquesta comprimir → armar → signed URL → `PUT`. Reemplaza el bloque hoy duplicado en los dos formularios. |
| `components/documento/SelectorPaginas.tsx` (nuevo) | UI de la lista de páginas: agregar, miniaturas, borrar, reordenar, contador. |
| `components/DocumentForm.tsx` (modificar) | Cambia su input de archivo por `SelectorPaginas` y su bloque de subida por `subirPaginas`. |
| `components/DocumentEditForm.tsx` (modificar) | Igual, con la lista opcional ("Reemplazar archivo"). |

---

### Task 1: Lógica pura de páginas

**Files:**
- Create: `lib/documentos/paginas.ts`
- Test: `lib/documentos/__tests__/paginas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type Pagina = { id: string; file: File; url: string }`; `type Salida = 'ninguno' | 'archivo' | 'pdf'`; `type Progreso = { hechas: number; total: number } | 'subiendo'`; `MAX_PAGINAS: 10`; `LADO_MAX: 2000`; `CALIDAD_JPEG: 0.8`; `esImagen(contentType: string): boolean`; `cabenPaginas(actuales: number, nuevas: number): { acepta: number; rechaza: number }`; `decidirSalida(paginas: Pagina[]): Salida`; `dimensionesReescaladas(w: number, h: number, ladoMax: number): { w: number; h: number }`; `textoProgreso(p: Progreso | null): string`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/documentos/__tests__/paginas.test.ts`:

```ts
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
  return { id: nombre, file: new File([''], nombre, { type }), url: 'blob:x' }
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- paginas`
Expected: FAIL — `Failed to resolve import "@/lib/documentos/paginas"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/documentos/paginas.ts`:

```ts
// Lógica pura de la lista de páginas de un documento: sin DOM, sin red, sin Firebase.
// El único tipo del navegador que aparece acá es File, y solo como tipo.

/** Una página de la lista: el archivo elegido y su objectURL para la miniatura. */
export type Pagina = { id: string; file: File; url: string }

/** Qué se termina subiendo a Storage. */
export type Salida = 'ninguno' | 'archivo' | 'pdf'

/** Avance visible en el botón mientras se prepara y sube el documento. */
export type Progreso = { hechas: number; total: number } | 'subiendo'

/** Tope de páginas por documento. Con la compresión, ~300 KB por página. */
export const MAX_PAGINAS = 10

/** Lado largo al que se reescalan las fotos. Un permiso de circulación se lee de sobra. */
export const LADO_MAX = 2000

/** Calidad del JPEG al recomprimir. */
export const CALIDAD_JPEG = 0.8

export function esImagen(contentType: string): boolean {
  return contentType.startsWith('image/')
}

/** Cuántas de las que eligió el usuario caben bajo el tope, y cuántas quedan fuera. */
export function cabenPaginas(actuales: number, nuevas: number): { acepta: number; rechaza: number } {
  const libres = Math.max(0, MAX_PAGINAS - actuales)
  const acepta = Math.min(libres, nuevas)
  return { acepta, rechaza: nuevas - acepta }
}

export function decidirSalida(paginas: Pagina[]): Salida {
  if (paginas.length === 0) return 'ninguno'
  // Un PDF del usuario se sube tal cual. La UI garantiza que va solo, pero si algo
  // se colara junto a fotos, subir el PDF es mejor que intentar armar uno con él adentro.
  if (paginas.some((p) => !esImagen(p.file.type))) return 'archivo'
  return paginas.length === 1 ? 'archivo' : 'pdf'
}

export function dimensionesReescaladas(w: number, h: number, ladoMax: number): { w: number; h: number } {
  const largo = Math.max(w, h)
  if (largo <= ladoMax) return { w, h }
  const factor = ladoMax / largo
  return { w: Math.round(w * factor), h: Math.round(h * factor) }
}

export function textoProgreso(p: Progreso | null): string {
  if (p === 'subiendo') return 'Subiendo…'
  if (p) return `Preparando página ${p.hechas + 1} de ${p.total}…`
  return 'Guardando…'
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- paginas`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/documentos/paginas.ts lib/documentos/__tests__/paginas.test.ts
git commit -m "feat(documentos): logica pura de la lista de paginas"
```

---

### Task 2: Armar el PDF con pdf-lib

**Files:**
- Modify: `package.json` (agregar `pdf-lib` a `dependencies`)
- Create: `lib/documentos/pdf.ts`
- Test: `lib/documentos/__tests__/pdf.test.ts`

**Interfaces:**
- Consumes: nada de Task 1.
- Produces: `construirPdf(jpegs: Blob[]): Promise<Blob>` — devuelve un Blob `application/pdf` con una página por imagen, del tamaño exacto de cada una.

- [ ] **Step 1: Instalar pdf-lib**

Run:

```bash
npm install pdf-lib
```

Expected: se agrega a `dependencies` en `package.json`. El `postinstall` (`copy-pdf-worker.mjs`) corre y termina sin error.

- [ ] **Step 2: Escribir el test que falla**

Crear `lib/documentos/__tests__/pdf.test.ts`. El JPEG de abajo es una imagen real de 1×1 px en base64; sirve para que `pdf-lib` lea sus dimensiones del marcador SOF.

```ts
import { describe, it, expect } from 'vitest'
import { construirPdf } from '@/lib/documentos/pdf'

const JPEG_1X1 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
  'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
  'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
  'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
  'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA' +
  'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx' +
  'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK' +
  'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3' +
  'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii' +
  'gD//2Q=='

function jpeg(): Blob {
  const bin = atob(JPEG_1X1)
  return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: 'image/jpeg' })
}

describe('construirPdf', () => {
  it('devuelve un PDF de verdad', async () => {
    const pdf = await construirPdf([jpeg()])
    expect(pdf.type).toBe('application/pdf')
    const cabecera = new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))
    expect(cabecera).toBe('%PDF-')
  })

  it('deja una página por imagen, del tamaño de la imagen', async () => {
    const pdf = await construirPdf([jpeg(), jpeg(), jpeg()])
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(await pdf.arrayBuffer())
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getPage(0).getWidth()).toBe(1)
    expect(doc.getPage(0).getHeight()).toBe(1)
  })

})
```

`construirPdf` **no** lleva un caso para la lista vacía: quien la usa (`subirPaginas`, Task 3)
corta antes cuando no hay páginas y solo la invoca con dos o más imágenes. Un test del caso
vacío obliga a inventar una rama que escriba bytes de PDF a mano, que es justo lo que este
diseño descartó.

```
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- documentos/__tests__/pdf`
Expected: FAIL — `Failed to resolve import "@/lib/documentos/pdf"`.

- [ ] **Step 4: Escribir la implementación mínima**

Crear `lib/documentos/pdf.ts`:

```ts
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
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- documentos/__tests__/pdf`
Expected: PASS, 2 tests.

- [ ] **Step 6: Verificar que el import dinámico no arrastró pdf-lib al bundle inicial**

Run: `npx tsc --noEmit`
Expected: sin errores.

Confirmar a ojo que `lib/documentos/pdf.ts` **no** tiene ningún `import { PDFDocument } from 'pdf-lib'` en el module scope: el único acceso a la librería debe ser el `await import('pdf-lib')` dentro de la función.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/documentos/pdf.ts lib/documentos/__tests__/pdf.test.ts
git commit -m "feat(documentos): armar un PDF con una pagina por foto"
```

---

### Task 3: Comprimir imágenes y orquestar la subida

**Files:**
- Create: `lib/documentos/imagen.ts`
- Create: `lib/documentos/subir.ts`
- Test: `lib/documentos/__tests__/subir.test.ts`

**Interfaces:**
- Consumes: de Task 1 `Pagina`, `Progreso`, `Salida`, `LADO_MAX`, `CALIDAD_JPEG`, `esImagen`, `decidirSalida`, `dimensionesReescaladas`; de Task 2 `construirPdf`.
- Produces: `comprimirImagen(file: File): Promise<Blob>`; `class ErrorPagina extends Error` con propiedad pública `paginaId: string`; `subirPaginas(vehicleId: string, paginas: Pagina[], onProgreso?: (p: Progreso) => void): Promise<{ filePath: string } | null>` — devuelve `null` si la lista está vacía.

**Nota sobre cobertura:** `comprimirImagen` **no** lleva test automático. jsdom no tiene canvas real, así que decodificar, reescalar y enderezar EXIF solo se verifican en un celular. La lógica calculable (`dimensionesReescaladas`) ya quedó cubierta en Task 1. Los tests de este task cubren `subirPaginas` con `comprimirImagen` mockeado.

- [ ] **Step 1: Escribir `imagen.ts`**

Crear `lib/documentos/imagen.ts`:

```ts
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
```

- [ ] **Step 2: Escribir el test que falla**

Crear `lib/documentos/__tests__/subir.test.ts`:

```ts
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
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- subir`
Expected: FAIL — `Failed to resolve import "@/lib/documentos/subir"`.

- [ ] **Step 4: Escribir la implementación mínima**

Crear `lib/documentos/subir.ts`:

```ts
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
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- subir`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/documentos/imagen.ts lib/documentos/subir.ts lib/documentos/__tests__/subir.test.ts
git commit -m "feat(documentos): comprimir fotos y orquestar la subida"
```

---

### Task 4: Componente SelectorPaginas

**Files:**
- Create: `components/documento/SelectorPaginas.tsx`
- Test: `components/documento/__tests__/SelectorPaginas.test.tsx`

**Interfaces:**
- Consumes: de Task 1 `Pagina`, `MAX_PAGINAS`, `cabenPaginas`, `esImagen`; `nanoid` de `nanoid`.
- Produces: `export default function SelectorPaginas({ paginas, onChange, paginaConError }: { paginas: Pagina[]; onChange: (p: Pagina[]) => void; paginaConError?: string | null })` — componente **controlado**: el padre es dueño del estado.

- [ ] **Step 1: Escribir el test que falla**

Crear `components/documento/__tests__/SelectorPaginas.test.tsx`. Dos cosas a saber: jsdom no trae `URL.createObjectURL`, y asignar `files` a un input se hace con `Object.defineProperty` porque en jsdom la propiedad es de solo lectura.

```tsx
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import SelectorPaginas from '@/components/documento/SelectorPaginas'
import { MAX_PAGINAS, type Pagina } from '@/lib/documentos/paginas'

beforeAll(() => {
  // Una URL distinta por archivo: así el src de la miniatura delata QUÉ foto es,
  // que es lo único que hace observable el reordenamiento desde afuera.
  URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`)
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.mocked(URL.createObjectURL).mockClear()
})

/** El componente es controlado; el test necesita un padre que guarde el estado. */
function Host({ inicial = [], error = null }: { inicial?: Pagina[]; error?: string | null }) {
  const [paginas, setPaginas] = useState<Pagina[]>(inicial)
  return <SelectorPaginas paginas={paginas} onChange={setPaginas} paginaConError={error} />
}

function foto(nombre: string): File {
  return new File(['x'], nombre, { type: 'image/jpeg' })
}

function elegir(archivos: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: archivos, configurable: true })
  fireEvent.change(input)
}

function paginaFalsa(i: number): Pagina {
  return { id: `p${i}`, file: foto(`f${i}.jpg`), url: 'blob:falso' }
}

describe('SelectorPaginas', () => {
  it('parte vacío, invitando a agregar', () => {
    render(<Host />)
    expect(screen.getByRole('button', { name: /agregar archivo o foto/i })).toBeDefined()
  })

  it('acumula las fotos elegidas como miniaturas', () => {
    render(<Host />)
    elegir([foto('a.jpg')])
    expect(screen.getAllByRole('img')).toHaveLength(1)
    elegir([foto('b.jpg'), foto('c.jpg')])
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText(new RegExp(`3 de ${MAX_PAGINAS} páginas`))).toBeDefined()
  })

  it('borrar una página la saca de la lista', () => {
    render(<Host />)
    elegir([foto('a.jpg'), foto('b.jpg')])
    fireEvent.click(screen.getAllByRole('button', { name: /quitar página/i })[0])
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('al llegar al tope desactiva el botón y avisa cuántas quedaron fuera', () => {
    render(<Host inicial={Array.from({ length: 9 }, (_, i) => paginaFalsa(i))} />)
    elegir([foto('x.jpg'), foto('y.jpg'), foto('z.jpg')])
    expect(screen.getAllByRole('img')).toHaveLength(MAX_PAGINAS)
    expect(screen.getByRole('button', { name: /agregar otra página/i })).toHaveProperty('disabled', true)
    expect(screen.getByText(/2 quedaron fuera/i)).toBeDefined()
  })

  it('un PDF ocupa la lista completa y bloquea agregar más', () => {
    render(<Host />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'permiso.pdf', { type: 'application/pdf' })],
      configurable: true,
    })
    fireEvent.change(input)
    expect(screen.getByText('permiso.pdf')).toBeDefined()
    expect(screen.getByRole('button', { name: /agregar otra página/i })).toHaveProperty('disabled', true)
  })

  it('reordena con las flechas', () => {
    render(<Host />)
    elegir([foto('a.jpg'), foto('b.jpg')])
    const orden = () => screen.getAllByRole('img').map((i) => i.getAttribute('src'))
    expect(orden()).toEqual(['blob:a.jpg', 'blob:b.jpg'])
    fireEvent.click(screen.getByRole('button', { name: /mover página 1 a la derecha/i }))
    expect(orden()).toEqual(['blob:b.jpg', 'blob:a.jpg'])
  })

  it('marca con un aviso la página que no se pudo leer', () => {
    const paginas = [paginaFalsa(0), paginaFalsa(1)]
    render(<Host inicial={paginas} error="p1" />)
    expect(screen.getByText(/no pudimos leer esta foto/i)).toBeDefined()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- SelectorPaginas`
Expected: FAIL — `Failed to resolve import "@/components/documento/SelectorPaginas"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `components/documento/SelectorPaginas.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { MAX_PAGINAS, cabenPaginas, esImagen, type Pagina } from '@/lib/documentos/paginas'

/**
 * Cada miniatura revoca su propio objectURL al desmontarse (al borrarla o al cerrar
 * el formulario). Las keys son el id de la página, así que reordenar no desmonta nada.
 */
function Miniatura({
  pagina,
  indice,
  total,
  conError,
  onQuitar,
  onMover,
}: {
  pagina: Pagina
  indice: number
  total: number
  conError: boolean
  onQuitar: () => void
  onMover: (delta: number) => void
}) {
  useEffect(() => () => URL.revokeObjectURL(pagina.url), [pagina.url])

  const flecha = 'flex size-7 items-center justify-center rounded-md border border-linea bg-superficie text-acero disabled:opacity-30'

  return (
    <li className={`rounded-xl border p-2 ${conError ? 'border-vencido bg-[#FCE7E7]' : 'border-linea bg-superficie'}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-lienzo">
        {esImagen(pagina.file.type) ? (
          <img src={pagina.url} alt={`Página ${indice + 1}`} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 p-2 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-7 text-acero" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </svg>
            <span className="break-all text-[11px] leading-tight text-acero">{pagina.file.name}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar página ${indice + 1}`}
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-tinta/70 text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-3.5" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {conError && (
        <p className="mt-1.5 text-[11px] leading-tight text-vencido">
          No pudimos leer esta foto. Bórrala y sácala de nuevo.
        </p>
      )}

      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" onClick={() => onMover(-1)} disabled={indice === 0} className={flecha} aria-label={`Mover página ${indice + 1} a la izquierda`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="text-xs font-medium text-acero">{indice + 1}</span>
        <button type="button" onClick={() => onMover(1)} disabled={indice === total - 1} className={flecha} aria-label={`Mover página ${indice + 1} a la derecha`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </li>
  )
}

export default function SelectorPaginas({
  paginas,
  onChange,
  paginaConError,
}: {
  paginas: Pagina[]
  onChange: (p: Pagina[]) => void
  paginaConError?: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Un PDF va solo: mezclarlo con fotos obligaría a rasterizarlo.
  const hayPdf = paginas.some((p) => !esImagen(p.file.type))
  const lleno = hayPdf || paginas.length >= MAX_PAGINAS

  function nueva(file: File): Pagina {
    return { id: nanoid(8), file, url: URL.createObjectURL(file) }
  }

  function agregar(lista: FileList | File[] | null) {
    const elegidos = lista ? Array.from(lista) : []
    if (elegidos.length === 0) return

    const pdf = elegidos.find((f) => !esImagen(f.type))
    if (pdf) {
      onChange([nueva(pdf)])
      setAviso(elegidos.length > 1 ? 'Un PDF se sube solo, sin más páginas.' : null)
      return
    }

    const { acepta, rechaza } = cabenPaginas(paginas.length, elegidos.length)
    onChange([...paginas, ...elegidos.slice(0, acepta).map(nueva)])
    setAviso(
      rechaza > 0
        ? `Se agregaron ${acepta} y ${rechaza} quedaron fuera: el máximo es ${MAX_PAGINAS} páginas.`
        : null,
    )
  }

  function quitar(id: string) {
    onChange(paginas.filter((p) => p.id !== id))
    setAviso(null)
  }

  function mover(i: number, delta: number) {
    const j = i + delta
    if (j < 0 || j >= paginas.length) return
    const copia = [...paginas]
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    onChange(copia)
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          agregar(e.target.files)
          // Sin esto, volver a elegir el mismo archivo no dispara el change.
          e.target.value = ''
        }}
      />

      {paginas.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {paginas.map((p, i) => (
            <Miniatura
              key={p.id}
              pagina={p}
              indice={i}
              total={paginas.length}
              conError={paginaConError === p.id}
              onQuitar={() => quitar(p.id)}
              onMover={(d) => mover(i, d)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={lleno}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-linea bg-lienzo px-4 py-3 text-sm font-medium text-azul transition-colors hover:bg-azul/5 disabled:cursor-not-allowed disabled:text-acero disabled:hover:bg-lienzo"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {paginas.length === 0 ? 'Agregar archivo o foto' : 'Agregar otra página'}
      </button>

      {paginas.length > 0 && !hayPdf && (
        <p className="text-xs text-acero">
          {paginas.length} de {MAX_PAGINAS} páginas
          {paginas.length > 1 && ' · se subirán como un solo PDF, en este orden'}
        </p>
      )}
      {paginas.length === 0 && (
        <p className="text-xs text-acero">
          Puedes sacar varias fotos, una por cada cara del documento, y se guardan en un solo archivo.
        </p>
      )}
      {aviso && <p className="text-xs text-ambar">{aviso}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- SelectorPaginas`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add components/documento/SelectorPaginas.tsx components/documento/__tests__/SelectorPaginas.test.tsx
git commit -m "feat(documentos): selector de paginas con miniaturas"
```

---

### Task 5: Montar el selector en los dos formularios

**Files:**
- Modify: `components/DocumentForm.tsx` (reemplaza el `<input type="file">` de las líneas 95-100 y el bloque de subida de las líneas 23-37)
- Modify: `components/DocumentEditForm.tsx` (reemplaza el input de las líneas 85-89 y el bloque de subida de las líneas 35-47)

**Interfaces:**
- Consumes: de Task 1 `Pagina`, `Progreso`, `textoProgreso`; de Task 3 `subirPaginas`, `ErrorPagina`; de Task 4 `SelectorPaginas`.
- Produces: nada para tasks posteriores.

- [ ] **Step 1: Reescribir `DocumentForm`**

Reemplazar el contenido completo de `components/DocumentForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_LABELS, tipoTieneVencimiento, type DocumentType } from '@/lib/types'
import { textoProgreso, type Pagina, type Progreso } from '@/lib/documentos/paginas'
import { subirPaginas, ErrorPagina } from '@/lib/documentos/subir'
import SelectorPaginas from '@/components/documento/SelectorPaginas'

const TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]

export default function DocumentForm({ vehicleId }: { vehicleId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<DocumentType>('permiso_circulacion')
  const [nombrePersonalizado, setNombre] = useState('')
  const [fechaVencimiento, setFecha] = useState('')
  const [paginas, setPaginas] = useState<Pagina[]>([])
  const [paginaConError, setPaginaConError] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPaginaConError(null)
    setLoading(true)
    try {
      const subida = await subirPaginas(vehicleId, paginas, setProgreso)
      const create = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId, tipo,
          nombrePersonalizado: tipo === 'otro' ? nombrePersonalizado : null,
          fechaVencimiento: tipoTieneVencimiento(tipo) ? fechaVencimiento || null : null,
          fileUrl: subida?.filePath ?? '', filePath: subida?.filePath ?? '',
        }),
      })
      if (!create.ok) throw new Error('create')
      setOpen(false)
      setPaginas([]); setFecha(''); setNombre('')
      router.refresh()
    } catch (err) {
      if (err instanceof ErrorPagina) {
        setPaginaConError(err.paginaId)
        setError('Una de las fotos no se pudo leer. Bórrala del listado y vuelve a intentarlo.')
      } else {
        setError('No se pudo agregar el documento.')
      }
    } finally {
      setLoading(false)
      setProgreso(null)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'
  const labelCls = 'block text-sm font-medium text-acero'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Agregar documento
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="space-y-1.5">
        <label className={labelCls}>Tipo de documento</label>
        <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as DocumentType)}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {tipo === 'otro' && (
        <input className={inputCls} placeholder="Nombre del documento"
          value={nombrePersonalizado} onChange={(e) => setNombre(e.target.value)} required />
      )}
      {tipoTieneVencimiento(tipo) && (
        <div className="space-y-1.5">
          <label className={labelCls}>Fecha de vencimiento <span className="font-normal text-acero/70">(opcional)</span></label>
          <input type="date" className={inputCls} value={fechaVencimiento} onChange={(e) => setFecha(e.target.value)} />
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelCls}>Archivo del documento</label>
        <SelectorPaginas paginas={paginas} onChange={setPaginas} paginaConError={paginaConError} />
      </div>
      {error && <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading || paginas.length === 0}
          className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
          {loading ? textoProgreso(progreso) : 'Guardar'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
          Cancelar
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Reescribir `DocumentEditForm`**

Reemplazar el contenido completo de `components/DocumentEditForm.tsx`. La diferencia con el anterior: la lista parte vacía y es **opcional** — si el usuario no agrega nada, `subirPaginas` devuelve `null` y el `PATCH` no toca `filePath`.

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_LABELS, tipoTieneVencimiento, type DocumentType, type VehicleDocument } from '@/lib/types'
import { textoProgreso, type Pagina, type Progreso } from '@/lib/documentos/paginas'
import { subirPaginas, ErrorPagina } from '@/lib/documentos/subir'
import SelectorPaginas from '@/components/documento/SelectorPaginas'

const TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]

export default function DocumentEditForm({
  vehicleId,
  document,
  onClose,
}: {
  vehicleId: string
  document: VehicleDocument
  onClose: () => void
}) {
  const router = useRouter()
  const [tipo, setTipo] = useState<DocumentType>(document.tipo)
  const [nombrePersonalizado, setNombre] = useState(document.nombrePersonalizado ?? '')
  const [fechaVencimiento, setFecha] = useState(document.fechaVencimiento ?? '')
  const [paginas, setPaginas] = useState<Pagina[]>([])
  const [paginaConError, setPaginaConError] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPaginaConError(null)
    setLoading(true)
    try {
      const patch: Record<string, unknown> = {
        tipo,
        nombrePersonalizado: tipo === 'otro' ? nombrePersonalizado : null,
        fechaVencimiento: tipoTieneVencimiento(tipo) ? fechaVencimiento || null : null,
      }
      const subida = await subirPaginas(vehicleId, paginas, setProgreso)
      if (subida) {
        patch.filePath = subida.filePath
        patch.fileUrl = subida.filePath
      }
      const update = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!update.ok) throw new Error('update')
      onClose()
      router.refresh()
    } catch (err) {
      if (err instanceof ErrorPagina) {
        setPaginaConError(err.paginaId)
        setError('Una de las fotos no se pudo leer. Bórrala del listado y vuelve a intentarlo.')
      } else {
        setError('No se pudo actualizar el documento.')
      }
    } finally {
      setLoading(false)
      setProgreso(null)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'
  const labelCls = 'block text-sm font-medium text-acero'

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-linea bg-lienzo p-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Tipo de documento</label>
        <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as DocumentType)}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {tipo === 'otro' && (
        <input className={inputCls} placeholder="Nombre del documento"
          value={nombrePersonalizado} onChange={(e) => setNombre(e.target.value)} required />
      )}
      {tipoTieneVencimiento(tipo) && (
        <div className="space-y-1.5">
          <label className={labelCls}>Fecha de vencimiento <span className="font-normal text-acero/70">(opcional)</span></label>
          <input type="date" className={inputCls} value={fechaVencimiento} onChange={(e) => setFecha(e.target.value)} />
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelCls}>Reemplazar archivo <span className="font-normal text-acero/70">(opcional)</span></label>
        <SelectorPaginas paginas={paginas} onChange={setPaginas} paginaConError={paginaConError} />
      </div>
      {error && <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading}
          className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
          {loading ? textoProgreso(progreso) : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onClose}
          className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
          Cancelar
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Verificación completa**

Run, en este orden:

```bash
npx tsc --noEmit
```
Expected: sin salida.

```bash
npm test
```
Expected: toda la suite verde, incluidos los 34 tests nuevos de los tasks 1-4.

```bash
npx eslint app components lib
```
Expected: sin errores. (Warnings de `react-hooks/set-state-in-effect` son aceptables: la regla está bajada a `warn` a propósito en `eslint.config.mjs`.)

```bash
npm run build
```
Expected: build exitoso. Confirmar que `pdf-lib` **no** aparece en el bundle de la primera carga (`First Load JS`) de `/vehiculos/[id]`: al ser `import()` dinámico debe salir como un chunk aparte.

- [ ] **Step 4: Commit**

```bash
git add components/DocumentForm.tsx components/DocumentEditForm.tsx
git commit -m "feat(documentos): subir varias fotos como un solo PDF"
```

---

## Verificación manual (requiere celulares reales)

`comprimirImagen` no tiene tests automáticos: jsdom no tiene canvas, así que la decodificación, el reescalado y la rotación EXIF solo se comprueban en un teléfono. Correr esto antes de dar el feature por listo.

**En Android + Chrome:**

- [ ] Ficha de un vehículo → Documentos → Agregar documento → "Agregar archivo o foto" → Cámara → sacar una foto. Aparece la miniatura.
- [ ] "Agregar otra página" → Cámara → segunda foto. Ahora hay dos miniaturas y dice "2 de 10 páginas · se subirán como un solo PDF, en este orden".
- [ ] Sacar una tercera foto **apaisada** (girando el teléfono). Guardar.
- [ ] El botón muestra "Preparando página 1 de 3…", "2 de 3…", "3 de 3…" y después "Subiendo…".
- [ ] Abrir el documento recién creado: es un PDF de 3 páginas, en el mismo orden, y **la foto apaisada se ve derecha** (esta es la que valida el EXIF).
- [ ] Ver el documento en la ficha pública `/v/<token>`: la vista previa del PDF renderiza la primera página.

**En iPhone + Safari:**

- [ ] Repetir el flujo de 2 fotos desde la cámara. Verificar que el PDF abre bien (esto valida que el HEIC se normalizó a JPEG).
- [ ] Subir **una sola** foto. El archivo resultante debe verse como imagen a pantalla completa en la ficha pública, **no** dentro del visor de PDF.

**Casos borde, en cualquiera de los dos:**

- [ ] Agregar 10 páginas: el botón "Agregar otra página" queda desactivado.
- [ ] Con 9 páginas, elegir 3 de la galería de una vez: se agregan las que caben y aparece el aviso de cuántas quedaron fuera.
- [ ] Elegir un PDF desde Archivos: ocupa la lista solo y bloquea agregar más. Al guardar, el PDF sube **idéntico** (mismo peso que el original).
- [ ] Reordenar con las flechas y confirmar que el PDF respeta el orden final.
- [ ] Revisar el peso: un documento de 3 fotos de cámara debería quedar bajo 1 MB.
