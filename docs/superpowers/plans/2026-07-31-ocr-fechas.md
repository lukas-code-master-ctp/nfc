# Lectura automática de fechas (OCR) — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que al elegir la foto o el PDF de un documento, la fecha de vencimiento aparezca escrita sola en el campo, para que el usuario solo la revise.

**Architecture:** Lógica pura de prompt y parseo en `lib/ai/documentoVision.ts` (calcada de `usageVision.ts`); un endpoint que exige membresía y llama a OpenRouter; un extractor que convierte la primera página —foto o PDF— en un data URI de JPEG; y un hook que dispara la lectura en segundo plano y corta la carrera cuando la página cambia.

**Tech Stack:** Next.js 16, OpenRouter vía `chatVision`, `pdfjs-dist` (import dinámico), canvas del navegador, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-31-ocr-fechas-design.md`

## Global Constraints

- **La fecha se rellena, nunca se guarda sola.** Se escribe en el campo **solo si sigue vacío**: lo que el usuario escribió es suyo y no se pisa.
- **`parseFechaVision` es estricta.** Formato exacto `AAAA-MM-DD`, fecha de calendario que existe, y dentro de ±20 años de `ahoraMs`. Fuera de eso, `null`. Motivo: una `fechaVencimiento` mal formada hace que `daysUntil` dé `NaN`, `documentStatus` caiga a `al_dia`, y **un documento vencido se pinte verde**.
- **`parseFechaVision` recibe `ahoraMs` como parámetro**, no lee `Date.now()` adentro: si no, el rango no se puede testear.
- El prompt debe decir que en Chile se escribe **DD-MM-AAAA** y pedir la respuesta ya en **AAAA-MM-DD**, y pedir la fecha **de vencimiento**, no la de emisión ni la de pago.
- **No se le pasa el tipo de documento al modelo**: así el resultado no depende de que el usuario haya elegido bien el tipo, y no hay que releer si lo cambia.
- El cuerpo del endpoint lleva `imagen`, un **data URI completo** (`data:image/jpeg;base64,…`), porque `chatVision` lo pasa tal cual como `image_url.url`.
- El endpoint **exige membresía**: cada llamada cuesta plata.
- Todo es **best-effort**: sin `OPENROUTER_API_KEY`, con el modelo caído o con un PDF corrupto, el formulario funciona exactamente como hoy y el usuario nunca ve un error.
- **`pdfjs-dist` va con `import()` dinámico, NUNCA en module scope**, o rompe el render del servidor.
- Se lee **solo la primera página**.
- Va **solo en `DocumentForm`** (alta), no en el de edición.
- Todo el código, UI, comentarios y mensajes en **español neutro (Chile)**, tratando de "tú".
- Tras cada tarea: `npx tsc --noEmit`, `npx eslint app components lib` y `npm run build`.
- **NO** correr `npm test` completo: incluye `lib/firebase/__tests__/rules.test.ts`, que necesita el emulador de Firestore y falla siempre en local. Usar `npx vitest run app components lib`.
- **Nota sobre eslint:** hoy hay **6 warnings preexistentes** de `react-hooks/set-state-in-effect`. La Tarea 4 agrega un `useEffect` que llama `setState`, así que ese número **va a subir**. Es esperado y está bajado a `warn` a propósito en `eslint.config.mjs`. Lo que no puede subir es el número de **errores**, que debe quedar en 0.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `lib/ai/documentoVision.ts` | El prompt y el parseo estricto (puro) | 1 |
| `app/api/documents/leer-fecha/route.ts` | Endpoint con membresía, best-effort | 2 |
| `lib/documentos/primeraImagen.ts` | Primera página (foto o PDF) → data URI de JPEG | 3 |
| `components/documento/useLecturaFecha.ts` | Dispara la lectura y corta la carrera | 4 |
| `components/DocumentForm.tsx` | Rellena si está vacío + el aviso | 4 |

---

## Task 1: El prompt y el parseo

**Files:**
- Create: `lib/ai/documentoVision.ts`
- Create: `lib/ai/__tests__/documentoVision.test.ts`

**Interfaces:**
- Produce: `buildFechaPrompt(): string`
- Produce: `parseFechaVision(raw: string, ahoraMs: number): string | null` — devuelve `AAAA-MM-DD` o `null`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/ai/__tests__/documentoVision.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildFechaPrompt, parseFechaVision } from '@/lib/ai/documentoVision'

/** Instante fijo de referencia: el rango de cordura se mide desde acá. */
const AHORA = Date.parse('2026-07-31T12:00:00.000Z')

const respuesta = (vence: string | null) =>
  JSON.stringify({ vence })

describe('lo que sí es una fecha', () => {
  it('devuelve una fecha ISO válida', () => {
    expect(parseFechaVision(respuesta('2027-04-03'), AHORA)).toBe('2027-04-03')
  })

  it('acepta una fecha ya vencida: subir un documento viejo es legítimo', () => {
    expect(parseFechaVision(respuesta('2024-01-15'), AHORA)).toBe('2024-01-15')
  })

  it('extrae el JSON aunque venga con texto alrededor', () => {
    const raw = `Claro, acá está:\n${respuesta('2027-04-03')}\n¡Espero que sirva!`
    expect(parseFechaVision(raw, AHORA)).toBe('2027-04-03')
  })
})

describe('formatos que NO se aceptan', () => {
  // El proyecto ya tiene documentado el bug: una fechaVencimiento mal formada
  // hace que daysUntil dé NaN, documentStatus caiga a al_dia, y un documento
  // VENCIDO se pinte verde. Por eso acá no se acepta "casi".
  it('rechaza el ISO sin ceros a la izquierda', () => {
    expect(parseFechaVision(respuesta('2027-3-4'), AHORA)).toBeNull()
  })

  it('rechaza el formato chileno sin convertir', () => {
    expect(parseFechaVision(respuesta('03/04/2027'), AHORA)).toBeNull()
    expect(parseFechaVision(respuesta('03-04-2027'), AHORA)).toBeNull()
  })

  it('rechaza un ISO con hora', () => {
    expect(parseFechaVision(respuesta('2027-04-03T00:00:00Z'), AHORA)).toBeNull()
  })
})

describe('fechas que no existen en el calendario', () => {
  // El regex de formato sola las deja pasar: 2027-02-31 tiene la forma correcta.
  it('rechaza el 31 de febrero', () => {
    expect(parseFechaVision(respuesta('2027-02-31'), AHORA)).toBeNull()
  })

  it('rechaza el 31 de abril', () => {
    expect(parseFechaVision(respuesta('2027-04-31'), AHORA)).toBeNull()
  })

  it('rechaza el mes 13', () => {
    expect(parseFechaVision(respuesta('2027-13-01'), AHORA)).toBeNull()
  })
})

describe('fechas fuera de todo rango razonable', () => {
  // Alucinaciones típicas de un modelo leyendo una foto borrosa.
  it('rechaza un año muy pasado', () => {
    expect(parseFechaVision(respuesta('0207-04-03'), AHORA)).toBeNull()
  })

  it('rechaza un año muy futuro', () => {
    expect(parseFechaVision(respuesta('9999-12-31'), AHORA)).toBeNull()
  })
})

describe('respuestas que no traen fecha', () => {
  it('null explícito', () => {
    expect(parseFechaVision(respuesta(null), AHORA)).toBeNull()
  })

  it('respuesta vacía', () => {
    expect(parseFechaVision('', AHORA)).toBeNull()
  })

  it('texto sin JSON', () => {
    expect(parseFechaVision('No pude leer la fecha del documento.', AHORA)).toBeNull()
  })

  it('JSON roto', () => {
    expect(parseFechaVision('{"vence": ', AHORA)).toBeNull()
  })

  it('el campo no es texto', () => {
    expect(parseFechaVision('{"vence": 20270403}', AHORA)).toBeNull()
  })
})

describe('el prompt', () => {
  it('pide la respuesta en formato ISO', () => {
    expect(buildFechaPrompt()).toContain('AAAA-MM-DD')
  })

  it('advierte que en Chile se escribe DD-MM, o el modelo invierte día y mes', () => {
    expect(buildFechaPrompt()).toContain('DD-MM-AAAA')
  })

  it('pide la fecha de VENCIMIENTO, no la de emisión', () => {
    expect(buildFechaPrompt().toLowerCase()).toContain('emisión')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run lib/ai/__tests__/documentoVision.test.ts`
Esperado: FALLA — no se puede resolver `@/lib/ai/documentoVision`.

- [ ] **Step 3: Escribir la lógica**

Crear `lib/ai/documentoVision.ts`:

```ts
/**
 * Lectura de la fecha de vencimiento de un documento vehicular chileno.
 * Puro: sin red y sin reloj, para poder testearlo. Mismo patrón que
 * `usageVision.ts` (prompt + parseo separados de la llamada).
 */

/** Ventana de cordura alrededor del presente, en años. */
const RANGO_ANIOS = 20
const MS_POR_ANIO = 365.25 * 24 * 60 * 60 * 1000

export function buildFechaPrompt(): string {
  return [
    'Estás leyendo la foto de un documento vehicular chileno (permiso de circulación, revisión técnica, SOAP, certificado de gases o similar).',
    'Busca la fecha HASTA LA CUAL el documento es válido. Suele aparecer como "válido hasta", "vence el", "hasta el" o "fecha de vencimiento".',
    'NO devuelvas la fecha de emisión, ni la de pago, ni la del trámite.',
    'OJO con el formato: en Chile las fechas se escriben DD-MM-AAAA. Por ejemplo "03-04-2027" es el 3 de abril de 2027, NO el 4 de marzo.',
    'Responde SOLO con un JSON válido, sin texto adicional, con este formato exacto:',
    '{"vence": "<AAAA-MM-DD, o null>"}',
    'Convierte la fecha al formato AAAA-MM-DD. Si no puedes leerla con seguridad, usa null. No inventes.',
  ].join('\n')
}

/**
 * La fecha leída, o `null`. **Estricta a propósito.**
 *
 * Una `fechaVencimiento` mal formada hace que `daysUntil` devuelva `NaN`,
 * `documentStatus` caiga a `al_dia`, y un documento **vencido** se pinte verde.
 * Preferimos no leer nada a rellenar basura: el campo vacío el usuario lo llena;
 * el campo con una fecha absurda quizás no lo mira.
 *
 * `ahoraMs` entra por parámetro y no se lee del reloj: si no, el rango de
 * cordura no se podría testear.
 */
export function parseFechaVision(raw: string, ahoraMs: number): string | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(match[0])
  } catch {
    return null
  }

  const vence = obj.vence
  if (typeof vence !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vence)) return null

  const ms = Date.parse(`${vence}T00:00:00.000Z`)
  if (Number.isNaN(ms)) return null
  // Ida y vuelta: el regex deja pasar 2027-02-31, que tiene la forma correcta
  // pero no existe. No se confía en que todos los motores rechacen el parseo.
  if (new Date(ms).toISOString().slice(0, 10) !== vence) return null

  if (Math.abs(ms - ahoraMs) > RANGO_ANIOS * MS_POR_ANIO) return null
  return vence
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run lib/ai/__tests__/documentoVision.test.ts`
Esperado: PASA (19 tests).

- [ ] **Step 5: Comprobar que el rango muerde**

Cambia temporalmente `RANGO_ANIOS` a `10000` y vuelve a correr el test.
Esperado: FALLAN los dos tests de "fechas fuera de todo rango razonable".
**Deshaz el cambio** y confirma que vuelven a pasar. Sin esto no sabemos si el rango hace algo.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/documentoVision.ts lib/ai/__tests__/documentoVision.test.ts
git commit -m "feat(ocr): prompt y parseo estricto de la fecha de vencimiento"
```

---

## Task 2: El endpoint

**Files:**
- Create: `app/api/documents/leer-fecha/route.ts`
- Create: `app/api/__tests__/leer-fecha.test.ts`

**Interfaces:**
- Consume: `buildFechaPrompt()`, `parseFechaVision(raw, ahoraMs)` (Task 1); `chatVision(imageUrls, prompt)`, `isOpenRouterConfigured()` de `lib/ai/openrouter.ts`; `getMembership()` de `lib/auth/membership.ts`
- Produce: `POST /api/documents/leer-fecha` — recibe `{ imagen: string }` (data URI), responde `{ fecha: string | null }`

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/__tests__/leer-fecha.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  chatVision: vi.fn(),
  isOpenRouterConfigured: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/ai/openrouter', () => ({
  chatVision: mocks.chatVision,
  isOpenRouterConfigured: mocks.isOpenRouterConfigured,
}))

const { POST } = await import('@/app/api/documents/leer-fecha/route')

const IMAGEN = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  mocks.isOpenRouterConfigured.mockReturnValue(true)
})

describe('quién puede llamarlo', () => {
  // Cada llamada cuesta plata: esto no puede quedar abierto.
  it('sin sesión responde 401 y no llama al modelo', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await POST(req({ imagen: IMAGEN }))
    expect(res.status).toBe(401)
    expect(mocks.chatVision).not.toHaveBeenCalled()
  })
})

describe('qué acepta', () => {
  it('rechaza lo que no sea un data URI, sin llamar al modelo', async () => {
    for (const imagen of ['https://ejemplo.cl/foto.jpg', '', 123, undefined]) {
      const res = await POST(req({ imagen }))
      expect(res.status).toBe(400)
    }
    expect(mocks.chatVision).not.toHaveBeenCalled()
  })
})

describe('camino normal', () => {
  it('devuelve la fecha parseada', async () => {
    mocks.chatVision.mockResolvedValue('{"vence": "2027-04-03"}')
    const res = await POST(req({ imagen: IMAGEN }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ fecha: '2027-04-03' })
  })

  it('le pasa el data URI al modelo tal cual', async () => {
    mocks.chatVision.mockResolvedValue('{"vence": null}')
    await POST(req({ imagen: IMAGEN }))
    expect(mocks.chatVision).toHaveBeenCalledWith([IMAGEN], expect.any(String))
  })

  it('devuelve null si el modelo no pudo leerla', async () => {
    mocks.chatVision.mockResolvedValue('{"vence": null}')
    const res = await POST(req({ imagen: IMAGEN }))
    expect(await res.json()).toEqual({ fecha: null })
  })
})

describe('best-effort: nunca rompe el formulario', () => {
  it('sin la clave configurada responde null sin llamar al modelo', async () => {
    mocks.isOpenRouterConfigured.mockReturnValue(false)
    const res = await POST(req({ imagen: IMAGEN }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ fecha: null })
    expect(mocks.chatVision).not.toHaveBeenCalled()
  })

  it('si el modelo se cae, responde null y no propaga el error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.chatVision.mockRejectedValue(new Error('openrouter_404'))
    const res = await POST(req({ imagen: IMAGEN }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ fecha: null })
    err.mockRestore()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run app/api/__tests__/leer-fecha.test.ts`
Esperado: FALLA — no se puede resolver `@/app/api/documents/leer-fecha/route`.

- [ ] **Step 3: Escribir el endpoint**

Crear `app/api/documents/leer-fecha/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { chatVision, isOpenRouterConfigured } from '@/lib/ai/openrouter'
import { buildFechaPrompt, parseFechaVision } from '@/lib/ai/documentoVision'

export const dynamic = 'force-dynamic'
// Una llamada de visión puede tardar bastante más que una respuesta normal.
export const maxDuration = 30

const PREFIJO_DATA_URI = 'data:image/'

/**
 * Lee la fecha de vencimiento de la imagen de un documento.
 *
 * Best-effort de punta a punta: cualquier fallo devuelve `{ fecha: null }` y el
 * formulario sigue funcionando como antes (el usuario escribe la fecha a mano).
 * El usuario nunca ve un error por esto; el log del servidor es donde sirve.
 */
export async function POST(req: NextRequest) {
  // Exige membresía porque cada llamada cuesta plata: no puede quedar abierto.
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { imagen } = await req.json()
  // Data URI completo, no base64 suelto: `chatVision` lo pasa tal cual como
  // `image_url.url`, y ahí OpenRouter necesita el prefijo para saber qué recibe.
  if (typeof imagen !== 'string' || !imagen.startsWith(PREFIJO_DATA_URI)) {
    return NextResponse.json({ error: 'imagen inválida' }, { status: 400 })
  }

  // Sin la clave, el feature simplemente no corre. Permite desplegar antes de
  // configurarla, igual que `analyzeUsage`.
  if (!isOpenRouterConfigured()) return NextResponse.json({ fecha: null })

  try {
    const raw = await chatVision([imagen], buildFechaPrompt())
    return NextResponse.json({ fecha: parseFechaVision(raw, Date.now()) })
  } catch (err) {
    // Ej. `openrouter_404` cuando el slug del modelo se deprecó — ya pasó una vez.
    console.error('[leer-fecha]', err)
    return NextResponse.json({ fecha: null })
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run app/api/__tests__/leer-fecha.test.ts`
Esperado: PASA (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/documents/leer-fecha app/api/__tests__/leer-fecha.test.ts
git commit -m "feat(ocr): endpoint que lee la fecha, con membresia y best-effort"
```

---

## Task 3: La primera página como imagen

**Files:**
- Create: `lib/documentos/primeraImagen.ts`
- Create: `lib/documentos/__tests__/primeraImagen.test.ts`

**Interfaces:**
- Consume: `comprimirImagen(file: File): Promise<Blob>` de `lib/documentos/imagen.ts`; `esImagen(contentType: string): boolean`, `dimensionesReescaladas(w, h, ladoMax)`, `LADO_MAX`, `CALIDAD_JPEG`, `type Pagina = { id: string; file: File }` de `lib/documentos/paginas.ts`
- Produce: `primeraImagen(pagina: Pagina | undefined): Promise<string | null>` — data URI de JPEG, o `null`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/documentos/__tests__/primeraImagen.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run lib/documentos/__tests__/primeraImagen.test.ts`
Esperado: FALLA — no se puede resolver `@/lib/documentos/primeraImagen`.

- [ ] **Step 3: Escribir el extractor**

Crear `lib/documentos/primeraImagen.ts`:

```ts
import { comprimirImagen } from '@/lib/documentos/imagen'
import { esImagen, CALIDAD_JPEG, LADO_MAX, type Pagina } from '@/lib/documentos/paginas'

/**
 * La primera página lista para que la lea el modelo: un data URI de JPEG.
 *
 * Devuelve `null` si no se puede (PDF corrupto, foto ilegible, sin página). Ahí
 * no se llama al modelo y no se gasta nada — es el camino barato del fallo.
 */
export async function primeraImagen(pagina: Pagina | undefined): Promise<string | null> {
  if (!pagina) return null
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
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run lib/documentos/__tests__/primeraImagen.test.ts`
Esperado: PASA (5 tests).

**Lo que estos tests NO cubren, y hay que saberlo:** jsdom no tiene canvas ni `createImageBitmap`, así que el render real del PDF y la compresión real de la foto **no se ejecutan en ningún test**. Es la misma limitación que ya tiene `comprimirImagen`, que tampoco tiene test. Lo que sí queda cubierto es el ruteo (foto vs PDF) y que todos los caminos de fallo devuelvan `null` en vez de lanzar.

- [ ] **Step 5: Commit**

```bash
git add lib/documentos/primeraImagen.ts lib/documentos/__tests__/primeraImagen.test.ts
git commit -m "feat(ocr): primera pagina (foto o PDF) como data URI de JPEG"
```

---

## Task 4: El hook, el formulario y la documentación

**Files:**
- Create: `components/documento/useLecturaFecha.ts`
- Create: `components/__tests__/useLecturaFecha.test.tsx`
- Create: `components/__tests__/DocumentFormOcr.test.tsx`
- Modify: `components/DocumentForm.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consume: `primeraImagen(pagina: Pagina | undefined): Promise<string | null>` (Task 3); `POST /api/documents/leer-fecha` con `{ imagen }` → `{ fecha: string | null }` (Task 2)
- Produce: `useLecturaFecha(primera: Pagina | undefined, alLeer: (fecha: string) => void): EstadoLectura`, con `type EstadoLectura = 'no' | 'leyendo' | 'lista'`

- [ ] **Step 1: Escribir el test del hook**

Crear `components/__tests__/useLecturaFecha.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ primeraImagen: vi.fn() }))
vi.mock('@/lib/documentos/primeraImagen', () => ({ primeraImagen: mocks.primeraImagen }))

import { useLecturaFecha } from '@/components/documento/useLecturaFecha'
import type { Pagina } from '@/lib/documentos/paginas'

const pagina = (id: string): Pagina => ({ id, file: new File(['x'], id, { type: 'image/jpeg' }) })

/** Respuesta del endpoint. */
const responde = (fecha: string | null) =>
  vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ fecha }) } as unknown as Response))

beforeEach(() => {
  mocks.primeraImagen.mockReset()
  mocks.primeraImagen.mockResolvedValue('data:image/jpeg;base64,AAAA')
})

describe('sin página', () => {
  it('no lee nada', async () => {
    const alLeer = vi.fn()
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(undefined, alLeer))
    expect(result.current).toBe('no')
    expect(fetch).not.toHaveBeenCalled()
    expect(alLeer).not.toHaveBeenCalled()
  })
})

describe('con una página', () => {
  it('entrega la fecha leída', async () => {
    const alLeer = vi.fn()
    vi.stubGlobal('fetch', responde('2027-04-03'))
    renderHook(() => useLecturaFecha(pagina('p1'), alLeer))
    await waitFor(() => expect(alLeer).toHaveBeenCalledWith('2027-04-03'))
  })

  it('queda en "lista" cuando llegó la fecha', async () => {
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), vi.fn()))
    await waitFor(() => expect(result.current).toBe('lista'))
  })

  it('si el modelo no leyó nada, no avisa ni deja el aviso puesto', async () => {
    const alLeer = vi.fn()
    vi.stubGlobal('fetch', responde(null))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), alLeer))
    await waitFor(() => expect(result.current).toBe('no'))
    expect(alLeer).not.toHaveBeenCalled()
  })

  it('si la imagen no se pudo preparar, no llama al endpoint', async () => {
    mocks.primeraImagen.mockResolvedValue(null)
    vi.stubGlobal('fetch', responde('2027-04-03'))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), vi.fn()))
    await waitFor(() => expect(result.current).toBe('no'))
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('la carrera al cambiar de página', () => {
  // Sin el corte, la respuesta de la página vieja llega después y escribe la
  // fecha del documento anterior, en silencio, sobre un documento distinto.
  it('descarta el resultado de una página que ya no está', async () => {
    const alLeer = vi.fn()
    let resolverPrimera: ((v: unknown) => void) | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        resolverPrimera
          ? Promise.resolve({ ok: true, json: () => Promise.resolve({ fecha: '2030-01-01' }) } as unknown as Response)
          : new Promise((r) => {
              resolverPrimera = r as (v: unknown) => void
            }),
      ),
    )

    const { rerender } = renderHook(({ p }) => useLecturaFecha(p, alLeer), {
      initialProps: { p: pagina('vieja') },
    })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    // Cambia la página ANTES de que responda la primera lectura.
    rerender({ p: pagina('nueva') })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    // Ahora responde la vieja: no debe aplicarse.
    resolverPrimera!({ ok: true, json: () => Promise.resolve({ fecha: '1999-01-01' }) })

    await waitFor(() => expect(alLeer).toHaveBeenCalledWith('2030-01-01'))
    expect(alLeer).not.toHaveBeenCalledWith('1999-01-01')
  })
})

describe('cuando la red falla', () => {
  it('no explota: leer la fecha es un extra', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))))
    const { result } = renderHook(() => useLecturaFecha(pagina('p1'), vi.fn()))
    await waitFor(() => expect(result.current).toBe('no'))
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run components/__tests__/useLecturaFecha.test.tsx`
Esperado: FALLA — no se puede resolver `@/components/documento/useLecturaFecha`.

- [ ] **Step 3: Escribir el hook**

Crear `components/documento/useLecturaFecha.ts`:

```ts
'use client'
import { useEffect, useRef, useState } from 'react'
import { primeraImagen } from '@/lib/documentos/primeraImagen'
import type { Pagina } from '@/lib/documentos/paginas'

export type EstadoLectura = 'no' | 'leyendo' | 'lista'

/**
 * Lee la fecha de vencimiento de la primera página, en segundo plano.
 *
 * **Nunca bloquea nada**: el formulario se puede guardar mientras esto corre, y
 * si no llega nada, se guarda sin fecha como antes.
 *
 * `alLeer` se llama solo cuando hay una fecha; quien la recibe decide qué hacer
 * con ella (en el formulario, escribirla **solo si el campo sigue vacío**).
 */
export function useLecturaFecha(
  primera: Pagina | undefined,
  alLeer: (fecha: string) => void,
): EstadoLectura {
  const [estado, setEstado] = useState<EstadoLectura>('no')
  // Cada lectura lleva su número. Si al volver ya no es la vigente, se descarta:
  // sin esto, cambiar de página deja llegar la respuesta de la anterior y
  // escribe la fecha de otro documento, en silencio.
  const secuencia = useRef(0)
  // El callback en un ref para no reiniciar la lectura cada vez que el padre
  // se vuelve a renderizar con una función nueva.
  const alLeerRef = useRef(alLeer)
  alLeerRef.current = alLeer

  const paginaId = primera?.id

  useEffect(() => {
    const mia = ++secuencia.current
    if (!primera) {
      setEstado('no')
      return
    }
    setEstado('leyendo')
    void (async () => {
      try {
        const imagen = await primeraImagen(primera)
        if (mia !== secuencia.current) return
        if (!imagen) {
          setEstado('no')
          return
        }
        const res = await fetch('/api/documents/leer-fecha', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagen }),
        })
        if (mia !== secuencia.current) return
        const fecha: string | null = res.ok ? ((await res.json())?.fecha ?? null) : null
        if (mia !== secuencia.current) return
        if (fecha) {
          alLeerRef.current(fecha)
          setEstado('lista')
        } else {
          setEstado('no')
        }
      } catch {
        // Best-effort: leer la fecha es un extra. El usuario la escribe a mano.
        if (mia === secuencia.current) setEstado('no')
      }
    })()
    // `primera` se lee adentro pero la dependencia es su id: reordenar o agregar
    // páginas más atrás no debe volver a gastar una lectura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaId])

  return estado
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run components/__tests__/useLecturaFecha.test.tsx`
Esperado: PASA (7 tests).

- [ ] **Step 5: Escribir el test del formulario**

Crear `components/__tests__/DocumentFormOcr.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ useLecturaFecha: vi.fn() }))

// Se mockea el hook y se captura su callback: así se puede disparar la lectura
// a mano, sin pelear con el input de archivos del selector de páginas.
vi.mock('@/components/documento/useLecturaFecha', () => ({ useLecturaFecha: mocks.useLecturaFecha }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import DocumentForm from '@/components/DocumentForm'

/** Dispara la fecha que "leyó" el hook. */
let alLeer: (fecha: string) => void

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Agregar documento/i }))
const campoFecha = () => screen.getByLabelText(/Fecha de vencimiento/i) as HTMLInputElement

beforeEach(() => {
  mocks.useLecturaFecha.mockReset()
  mocks.useLecturaFecha.mockImplementation((_p: unknown, cb: (f: string) => void) => {
    alLeer = cb
    return 'no'
  })
})

describe('rellenar el campo', () => {
  it('escribe la fecha leída cuando el campo está vacío', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(campoFecha().value).toBe('')
    alLeer('2027-04-03')
    expect(campoFecha().value).toBe('2027-04-03')
  })

  // Lo que el usuario escribió es suyo: la IA no se lo pisa.
  it('NO pisa la fecha que el usuario ya había escrito', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    fireEvent.change(campoFecha(), { target: { value: '2028-12-01' } })
    alLeer('2027-04-03')
    expect(campoFecha().value).toBe('2028-12-01')
  })
})

describe('el aviso', () => {
  it('avisa mientras lee', () => {
    mocks.useLecturaFecha.mockReturnValue('leyendo')
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(screen.getByText(/Leyendo la fecha/i)).toBeTruthy()
  })

  it('avisa que la fecha se leyó, para que la revisen', () => {
    mocks.useLecturaFecha.mockReturnValue('lista')
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(screen.getByText(/Fecha leída del documento/i)).toBeTruthy()
  })

  it('sin lectura en curso no muestra nada', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(screen.queryByText(/Leyendo la fecha/i)).toBeNull()
    expect(screen.queryByText(/Fecha leída del documento/i)).toBeNull()
  })
})
```

- [ ] **Step 6: Correr el test y verificar que falla**

Ejecutar: `npx vitest run components/__tests__/DocumentFormOcr.test.tsx`
Esperado: FALLA — `DocumentForm` todavía no usa el hook y el campo de fecha no tiene `<label>` asociado, así que `getByLabelText` no lo encuentra.

- [ ] **Step 7: Cablear el formulario**

En `components/DocumentForm.tsx`, agregar los imports después de la línea 8:

```tsx
import { useLecturaFecha } from '@/components/documento/useLecturaFecha'
```

Justo después de la última declaración de estado (hoy `const [loading, setLoading] = useState(false)`, línea 31), agregar **estas dos cosas, en este orden**:

```tsx
  // Se apaga en cuanto el usuario toca el campo: de ahí en adelante la fecha es
  // suya, y seguir diciendo que la leyó una máquina sería mentir.
  const [avisoApagado, setAvisoApagado] = useState(false)

  // La fecha leída se escribe SOLO si el campo sigue vacío: lo que el usuario
  // escribió es suyo. El actualizador funcional evita leer un valor viejo.
  const estadoLectura = useLecturaFecha(paginas[0], (fecha) =>
    setFecha((actual) => actual || fecha),
  )
```

Reemplazar el bloque del campo de fecha (líneas 99-104) por:

```tsx
      {tipoTieneVencimiento(tipo) && (
        <div className="space-y-1.5">
          <label htmlFor="fechaVencimiento" className={labelCls}>
            Fecha de vencimiento <span className="font-normal text-acero/70">(opcional)</span>
          </label>
          <input
            id="fechaVencimiento"
            type="date"
            className={inputCls}
            value={fechaVencimiento}
            // Tocar el campo apaga el aviso: de ahí en adelante la fecha es del
            // usuario, y seguir diciendo que la leyó una máquina sería mentir.
            onChange={(e) => { setFecha(e.target.value); setAvisoApagado(true) }}
          />
          {!avisoApagado && estadoLectura === 'leyendo' && (
            <p className="text-xs text-acero">Leyendo la fecha del documento…</p>
          )}
          {!avisoApagado && estadoLectura === 'lista' && (
            <p className="text-xs text-acero">Fecha leída del documento — revísala.</p>
          )}
        </div>
      )}
```

Reiniciar el aviso al limpiar el formulario tras guardar, dentro del `try` del `submit` (donde ya está `setPaginas([]); setFecha(''); setNombre('')`):

```tsx
      setPaginas([]); setFecha(''); setNombre(''); setAvisoApagado(false)
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run components/__tests__/DocumentFormOcr.test.tsx`
Esperado: PASA (5 tests).

- [ ] **Step 9: Verificar todo**

Ejecutar: `npx vitest run app components lib && npx tsc --noEmit && npx eslint app components lib && npm run build`
Esperado: todos los tests pasan salvo `lib/firebase/__tests__/rules.test.ts` (necesita el emulador, falla siempre en local); tsc sin salida; eslint con **`0 errors`** (los warnings de `react-hooks/set-state-in-effect` suben de 6 a 7 por el `useEffect` del hook — es esperado); build exitoso.

- [ ] **Step 10: Documentar en CLAUDE.md**

En `CLAUDE.md`, en la descripción de `lib/ai/`, reemplazar la línea existente por:

```
- `lib/ai/` — integración con OpenRouter: `openrouter.ts` (`chatVision`, `isOpenRouterConfigured`), `usageVision.ts` (`buildUsagePrompt`/`parseUsageVision`/`analyzeUsagePhotos`), `analyzeUsage.ts` (orquesta el análisis de la bitácora, best-effort, nunca lanza) y **`documentoVision.ts`** (`buildFechaPrompt`/`parseFechaVision`, la lectura de la fecha de vencimiento de un documento). `parseFechaVision(raw, ahoraMs)` es **estricta a propósito**: exige `AAAA-MM-DD`, comprueba que la fecha exista en el calendario (el regex deja pasar `2027-02-31`) y la acota a ±20 años del presente. Motivo: una `fechaVencimiento` mal formada hace que `daysUntil` dé `NaN`, `documentStatus` caiga a `al_dia` y **un documento vencido se pinte verde**. Recibe `ahoraMs` por parámetro para que el rango se pueda testear.
```

En la sección de `lib/documentos/`, agregar al final de la descripción:

```
`primeraImagen.ts` (`primeraImagen(pagina)`: la primera página lista para que la lea el modelo, como data URI de JPEG — comprime si es foto, y si es PDF renderiza la primera página con `pdfjs` cargado por `import()` **dinámico**; devuelve `null` en cualquier fallo y ahí no se llama al modelo).
```

En la lista de endpoints de `app/api/*`, agregar `documents/leer-fecha` junto a los otros de documents.

Y agregar a la sección de Gotchas:

```
- **La fecha que lee la IA se rellena, nunca se guarda sola**: `components/documento/useLecturaFecha.ts` dispara la lectura al elegir la primera página y `DocumentForm` la escribe **solo si el campo sigue vacío** (actualizador funcional, para no leer un valor viejo). Dos cosas que hay que conservar: (1) el hook lleva un **contador de secuencia** y descarta el resultado si la primera página cambió mientras la lectura iba en camino — sin eso, la respuesta vieja escribe la fecha de otro documento en silencio; (2) todo el camino es **best-effort** (sin `OPENROUTER_API_KEY`, con el modelo caído o con un PDF corrupto el formulario funciona como antes y el usuario nunca ve un error). Solo se lee la **primera página**, y solo en el formulario de alta: en el de edición la fecha ya está llena y la regla de "solo si está vacío" haría que nunca se aplicara.
```

- [ ] **Step 11: Commit**

```bash
git add components/documento/useLecturaFecha.ts components/DocumentForm.tsx components/__tests__/useLecturaFecha.test.tsx components/__tests__/DocumentFormOcr.test.tsx CLAUDE.md
git commit -m "feat(ocr): rellenar la fecha leida en el alta de documentos"
```

---

## Verificación manual

**En el navegador**, con el viewport de móvil (375px), en el formulario de alta de un documento:

1. Elegir una foto y confirmar que aparece "Leyendo la fecha del documento…" y que el botón Guardar **sigue habilitado** mientras tanto.
2. Cambiar la foto por otra antes de que termine la primera lectura, y confirmar que se aplica la fecha de la **segunda**.
3. Escribir una fecha a mano y confirmar que la lectura **no la pisa** y que el aviso desaparece.

**Lo único que dice si el feature sirve de verdad**, y lo hace el usuario con documentos reales:

4. Una **foto de una Revisión Técnica** real: ¿lee la fecha correcta?
5. Un **PDF de SOAP** real: ¿lee la fecha correcta?
6. Un **Permiso de Circulación** real, que trae varias fechas: ¿elige la de vencimiento y no la de emisión ni la de pago?

Si el punto 6 falla, el ajuste va en `buildFechaPrompt`, no en el código.

**Requisito de entorno:** sin `OPENROUTER_API_KEY` configurada en Vercel el feature no hace nada (silenciosamente, por diseño). Confirmar que esté puesta antes de probar.
