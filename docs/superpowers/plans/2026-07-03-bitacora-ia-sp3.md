# Bitácora de uso — SP3: Análisis con IA (OpenRouter) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tras cada entrega, un modelo de visión (vía OpenRouter) lee las 2 fotos y rellena bencina/km/limpieza del uso —de forma asíncrona y best-effort—, y el gestor puede corregir la lectura en la bitácora.

**Architecture:** La ruta `entregar` cierra el uso y, con `after()` de Next (post-respuesta, sin bloquear al conductor), dispara `analyzeUsage(usageId)`. Ese glue resuelve signed read URLs de las fotos, llama a OpenRouter pidiendo JSON, y guarda los campos. La bitácora muestra la lectura con badge "estimado por IA" y un editor inline (Editor/Admin) que hace `PATCH /api/usages/[id]`.

**Tech Stack:** Next.js 16 (App Router, `after` de `next/server`), TS estricto, Firebase Admin SDK, OpenRouter (API OpenAI-compatible, `fetch`), Vitest, Tailwind v4.

## Global Constraints

- Idioma: **español neutro (Chile)**, "tú" (no "vos"). Código/UI/comentarios en español.
- **Next 16:** `params` es `Promise` en route handlers dinámicos → tipar y `await`. `after` se importa de `next/server`.
- **Best-effort**: el análisis IA nunca puede tumbar la entrega ni el request; todo en try/catch. Sin `OPENROUTER_API_KEY`, no corre.
- **Confirmación humana**: la IA rellena pero NO marca confirmado; solo el gestor (Editor/Admin, `document:write`) marca `datosConfirmados` al editar. El **Visor** solo lee (403 en el PATCH).
- Credenciales de IA **solo server-side**; imágenes a OpenRouter como **signed read URLs**.
- Formatos: bencina ∈ `Lleno | 3/4 | 1/2 | 1/4 | Reserva`; limpieza ∈ `limpio | aceptable | sucio`; km entero ≥ 0. La IA nunca inventa → `null` ante duda.
- Firestore: queries de un solo campo (no aplica aquí, son lecturas/updates por id).
- Enforcement server-side en `/api/*` (`getMembership()` + `can()` + validación + `companyId`); nunca confiar en el cliente.
- Tras cambios: `npx tsc --noEmit` y `npm run build` deben pasar antes de commitear.
- Vitest 4: mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(...)`.

---

## Estructura de archivos

**Crear:**
- `lib/ai/usageVision.ts` (+ `__tests__/usageVision.test.ts`) — puro: tipos, prompt, parse, orquestación.
- `lib/ai/openrouter.ts` — cliente OpenRouter (wrapper, sin test de red).
- `lib/ai/analyzeUsage.ts` (+ `__tests__/analyzeUsage.test.ts`) — glue que dispara el análisis.
- `app/api/usages/[id]/route.ts` (+ `__tests__/route.test.ts`) — PATCH corrección del gestor.
- `components/vehicle/UsageDatosEditor.tsx` — editor inline (cliente).

**Modificar:**
- `lib/types.ts` — `VehicleUsage` gana `iaAnalizadoEn?`, `datosConfirmados?`.
- `lib/data/usages.ts` — `toUsage` mapea los nuevos campos; `closeUsage` devuelve `id`; `getUsage`, `setUsageAnalysis`, `updateUsageDatos`.
- `app/api/v/[token]/entregar/route.ts` — `after(() => analyzeUsage(usageId))`.
- `components/vehicle/BitacoraUso.tsx` — muestra bencina/km/limpieza + badge + editor si `puedeEditar`.
- `app/(app)/vehiculos/[id]/page.tsx` — extiende el mapeo de `usos` + pasa `puedeEditar`.
- `.env.example` — `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.

---

## Task 1: Visión pura (prompt/parse) + cliente OpenRouter + tipos + env

**Files:**
- Modify: `lib/types.ts`, `.env.example`
- Create: `lib/ai/usageVision.ts`, `lib/ai/__tests__/usageVision.test.ts`, `lib/ai/openrouter.ts`

**Interfaces:**
- Produces (`lib/types.ts`): `VehicleUsage` gana `iaAnalizadoEn?: string`, `datosConfirmados?: boolean`.
- Produces (`lib/ai/usageVision.ts`):
  - `type BencinaNivel = 'Lleno' | '3/4' | '1/2' | '1/4' | 'Reserva'`
  - `type Limpieza = 'limpio' | 'aceptable' | 'sucio'`
  - `interface UsageVision { bencina: string | null; km: number | null; limpieza: Limpieza | null }`
  - `buildUsagePrompt(): string`
  - `parseUsageVision(raw: string): UsageVision`
  - `analyzeUsagePhotos(chat: (images: string[], prompt: string) => Promise<string>, fotos: { tableroUrl: string; cabinaUrl: string }): Promise<UsageVision>`
- Produces (`lib/ai/openrouter.ts`):
  - `isOpenRouterConfigured(): boolean`
  - `chatVision(imageUrls: string[], prompt: string): Promise<string>`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/ai/__tests__/usageVision.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { buildUsagePrompt, parseUsageVision, analyzeUsagePhotos } from '@/lib/ai/usageVision'

describe('buildUsagePrompt', () => {
  it('pide JSON con el esquema y las categorías', () => {
    const p = buildUsagePrompt()
    expect(p).toContain('JSON')
    expect(p).toContain('bencina')
    expect(p).toContain('limpieza')
    expect(p).toMatch(/Reserva/)
    expect(p).toMatch(/sucio/)
  })
})

describe('parseUsageVision', () => {
  it('extrae valores de un JSON válido', () => {
    expect(parseUsageVision('{"bencina":"1/2","km":45230,"limpieza":"aceptable"}')).toEqual({
      bencina: '1/2', km: 45230, limpieza: 'aceptable',
    })
  })
  it('tolera texto/fences alrededor del JSON', () => {
    const raw = 'Claro, aquí está:\n```json\n{"bencina":"Lleno","km":1000,"limpieza":"limpio"}\n```'
    expect(parseUsageVision(raw)).toEqual({ bencina: 'Lleno', km: 1000, limpieza: 'limpio' })
  })
  it('anula valores fuera de la enumeración o de tipo inválido', () => {
    expect(parseUsageVision('{"bencina":"medio","km":"muchos","limpieza":"mugriento"}')).toEqual({
      bencina: null, km: null, limpieza: null,
    })
  })
  it('km negativo o no entero → null', () => {
    expect(parseUsageVision('{"bencina":null,"km":-5,"limpieza":null}').km).toBeNull()
    expect(parseUsageVision('{"km":12.5}').km).toBeNull()
  })
  it('respuesta sin JSON → todo null', () => {
    expect(parseUsageVision('no pude leer las fotos')).toEqual({ bencina: null, km: null, limpieza: null })
  })
})

describe('analyzeUsagePhotos', () => {
  it('llama al chat con las 2 imágenes y devuelve el parse', async () => {
    const chat = vi.fn().mockResolvedValue('{"bencina":"3/4","km":100,"limpieza":"limpio"}')
    const res = await analyzeUsagePhotos(chat, { tableroUrl: 'A', cabinaUrl: 'B' })
    expect(chat).toHaveBeenCalledWith(['A', 'B'], expect.any(String))
    expect(res).toEqual({ bencina: '3/4', km: 100, limpieza: 'limpio' })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/ai/__tests__/usageVision.test.ts`
Expected: FAIL ("Cannot find module '@/lib/ai/usageVision'").

- [ ] **Step 3: Implementar `lib/ai/usageVision.ts`**

```ts
export type BencinaNivel = 'Lleno' | '3/4' | '1/2' | '1/4' | 'Reserva'
export type Limpieza = 'limpio' | 'aceptable' | 'sucio'

export interface UsageVision {
  bencina: string | null
  km: number | null
  limpieza: Limpieza | null
}

const NIVELES: string[] = ['Lleno', '3/4', '1/2', '1/4', 'Reserva']
const LIMPIEZAS: string[] = ['limpio', 'aceptable', 'sucio']

export function buildUsagePrompt(): string {
  return [
    'Analiza dos fotos de un vehículo.',
    'Foto 1 (tablero): lee el nivel de bencina y el kilometraje (odómetro).',
    'Foto 2 (cabina): evalúa la limpieza general del interior.',
    'Responde SOLO con un JSON válido, sin texto adicional, con este formato exacto:',
    '{"bencina": "<uno de: Lleno, 3/4, 1/2, 1/4, Reserva, o null>", "km": <entero o null>, "limpieza": "<uno de: limpio, aceptable, sucio, o null>"}',
    'Si no puedes leer un dato con seguridad, usa null en ese campo. No inventes.',
  ].join('\n')
}

export function parseUsageVision(raw: string): UsageVision {
  const vacio: UsageVision = { bencina: null, km: null, limpieza: null }
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return vacio
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(match[0])
  } catch {
    return vacio
  }
  const bencina = typeof obj.bencina === 'string' && NIVELES.includes(obj.bencina) ? obj.bencina : null
  const km = typeof obj.km === 'number' && Number.isInteger(obj.km) && obj.km >= 0 ? obj.km : null
  const limpieza = typeof obj.limpieza === 'string' && LIMPIEZAS.includes(obj.limpieza) ? (obj.limpieza as Limpieza) : null
  return { bencina, km, limpieza }
}

export async function analyzeUsagePhotos(
  chat: (images: string[], prompt: string) => Promise<string>,
  fotos: { tableroUrl: string; cabinaUrl: string },
): Promise<UsageVision> {
  const raw = await chat([fotos.tableroUrl, fotos.cabinaUrl], buildUsagePrompt())
  return parseUsageVision(raw)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/ai/__tests__/usageVision.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar el cliente `lib/ai/openrouter.ts`**

```ts
// Cliente de OpenRouter (API compatible con OpenAI). Sin estado; lee el env en
// cada llamada. Wrapper de red (sin test unitario), igual que el cliente Resend.
const BASE = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001'

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

export async function chatVision(imageUrls: string[], prompt: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('openrouter_no_key')
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL
  const content = [
    { type: 'text', text: prompt },
    ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
  ]
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }] }),
  })
  if (!res.ok) throw new Error(`openrouter_${res.status}`)
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}
```

- [ ] **Step 6: Agregar los campos en `lib/types.ts`**

En la interfaz `VehicleUsage`, junto a los campos reservados `bencina/km/limpieza`, agregar:
```ts
  iaAnalizadoEn?: string // ISO; cuándo corrió la IA
  datosConfirmados?: boolean // true cuando un gestor edita/confirma
```

- [ ] **Step 7: Documentar el env en `.env.example`**

Agregar al final de `.env.example`:
```
# OpenRouter (análisis IA de las fotos de uso). Sin la key, el análisis no corre (best-effort).
OPENROUTER_API_KEY=
# Opcional; modelo de visión. Default: google/gemini-2.0-flash-001
OPENROUTER_MODEL=
```

- [ ] **Step 8: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/ai/usageVision.ts lib/ai/__tests__/usageVision.test.ts lib/ai/openrouter.ts lib/types.ts .env.example
git commit -m "feat(ia): visión pura (prompt/parse) + cliente OpenRouter + campos de uso"
```

---

## Task 2: Capa de datos de usos (adiciones para IA + edición)

**Files:**
- Modify: `lib/data/usages.ts`
- Test: `lib/data/__tests__/usages-ia.test.ts` (nuevo)

**Interfaces:**
- Consumes: `adminDb`; `VehicleUsage`.
- Produces:
  - `closeUsage(...)` cambia su retorno de `Promise<void>` a `Promise<string>` (el `id` del uso cerrado).
  - `getUsage(id: string): Promise<VehicleUsage | null>`
  - `setUsageAnalysis(id: string, datos: { bencina: string | null; km: number | null; limpieza: string | null }): Promise<void>` (setea los 3 campos + `iaAnalizadoEn` = now; NO marca confirmado)
  - `updateUsageDatos(companyId: string, id: string, patch: { bencina?: string; km?: number; limpieza?: string }): Promise<void>` (valida `companyId` → throw `'forbidden'`; setea el patch + `datosConfirmados: true`)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/data/__tests__/usages-ia.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const docGet = vi.fn()
const docUpdate = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: docGet, update: docUpdate }) }) },
}))

import { getUsage, setUsageAnalysis, updateUsageDatos } from '@/lib/data/usages'

beforeEach(() => { docGet.mockReset(); docUpdate.mockReset() })

describe('getUsage', () => {
  it('devuelve el uso o null', async () => {
    docGet.mockResolvedValue({ exists: true, id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'cerrado', tomadoEn: 't' }) })
    expect((await getUsage('u1'))?.id).toBe('u1')
    docGet.mockResolvedValue({ exists: false })
    expect(await getUsage('nope')).toBeNull()
  })
})

describe('setUsageAnalysis', () => {
  it('escribe los 3 campos + iaAnalizadoEn (sin confirmar)', async () => {
    await setUsageAnalysis('u1', { bencina: '1/2', km: 100, limpieza: 'limpio' })
    const arg = docUpdate.mock.calls[0][0]
    expect(arg).toMatchObject({ bencina: '1/2', km: 100, limpieza: 'limpio' })
    expect(typeof arg.iaAnalizadoEn).toBe('string')
    expect(arg.datosConfirmados).toBeUndefined()
  })
})

describe('updateUsageDatos', () => {
  it('rechaza si el uso es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(updateUsageDatos('c1', 'u1', { km: 200 })).rejects.toThrow('forbidden')
  })
  it('actualiza y marca confirmado si pertenece', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await updateUsageDatos('c1', 'u1', { km: 200 })
    expect(docUpdate).toHaveBeenCalledWith({ km: 200, datosConfirmados: true })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/usages-ia.test.ts`
Expected: FAIL (funciones no exportadas aún).

- [ ] **Step 3: Modificar `lib/data/usages.ts`**

En `toUsage`, agregar el mapeo de los nuevos campos (después de `limpieza`):
```ts
    iaAnalizadoEn: d.iaAnalizadoEn ?? undefined,
    datosConfirmados: d.datosConfirmados ?? undefined,
```

Cambiar el final de `closeUsage` para devolver el id (la firma pasa a `Promise<string>`):
```ts
export async function closeUsage(
  companyId: string,
  vehicleId: string,
  entregadoPor: { id: string; nombre: string },
  fotos: { tablero: string; cabina: string },
  dano?: { hay: boolean; nota?: string; fotoPath?: string },
): Promise<string> {
  const open = await getOpenUsage(vehicleId)
  if (!open || open.companyId !== companyId) throw new Error('no_open')
  await adminDb.collection(COL).doc(open.id).update({
    estado: 'cerrado',
    entregadoEn: new Date().toISOString(),
    entregadoPorDriverId: entregadoPor.id,
    entregadoPorNombre: entregadoPor.nombre,
    fotos,
    ...(dano ? { dano } : {}),
  })
  return open.id
}
```

Agregar al final del archivo:
```ts
export async function getUsage(id: string): Promise<VehicleUsage | null> {
  const doc = await adminDb.collection(COL).doc(id).get()
  return doc.exists ? toUsage(doc.id, doc.data()!) : null
}

export async function setUsageAnalysis(
  id: string,
  datos: { bencina: string | null; km: number | null; limpieza: string | null },
): Promise<void> {
  await adminDb.collection(COL).doc(id).update({
    bencina: datos.bencina,
    km: datos.km,
    limpieza: datos.limpieza,
    iaAnalizadoEn: new Date().toISOString(),
  })
}

export async function updateUsageDatos(
  companyId: string,
  id: string,
  patch: { bencina?: string; km?: number; limpieza?: string },
): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  await ref.update({ ...patch, datosConfirmados: true })
}
```

Nota: el test de `closeUsage` existente (`lib/data/__tests__/usages.test.ts`) sigue pasando — solo agregamos un valor de retorno; no cambia el `update`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/__tests__/usages-ia.test.ts lib/data/__tests__/usages.test.ts`
Expected: PASS (ambos archivos).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/data/usages.ts lib/data/__tests__/usages-ia.test.ts
git commit -m "feat(ia): capa de datos de uso (getUsage/setUsageAnalysis/updateUsageDatos; closeUsage devuelve id)"
```

---

## Task 3: Glue `analyzeUsage`

**Files:**
- Create: `lib/ai/analyzeUsage.ts`, `lib/ai/__tests__/analyzeUsage.test.ts`

**Interfaces:**
- Consumes: `getUsage`, `setUsageAnalysis` de `@/lib/data/usages`; `createReadUrl` de `@/lib/storage/signedUrls`; `chatVision`, `isOpenRouterConfigured` de `@/lib/ai/openrouter`; `analyzeUsagePhotos` de `@/lib/ai/usageVision`.
- Produces: `analyzeUsage(usageId: string): Promise<void>` (best-effort; nunca lanza).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/ai/__tests__/analyzeUsage.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUsage = vi.fn()
const setUsageAnalysis = vi.fn()
vi.mock('@/lib/data/usages', () => ({
  getUsage: (...a: unknown[]) => getUsage(...a),
  setUsageAnalysis: (...a: unknown[]) => setUsageAnalysis(...a),
}))
vi.mock('@/lib/storage/signedUrls', () => ({ createReadUrl: (p: string) => Promise.resolve(`url:${p}`) }))
const isConfigured = vi.fn()
const chatVision = vi.fn()
vi.mock('@/lib/ai/openrouter', () => ({
  isOpenRouterConfigured: () => isConfigured(),
  chatVision: (...a: unknown[]) => chatVision(...a),
}))

import { analyzeUsage } from '@/lib/ai/analyzeUsage'

beforeEach(() => {
  getUsage.mockReset(); setUsageAnalysis.mockReset(); isConfigured.mockReset(); chatVision.mockReset()
  isConfigured.mockReturnValue(true)
})

describe('analyzeUsage', () => {
  it('no hace nada si OpenRouter no está configurado', async () => {
    isConfigured.mockReturnValue(false)
    await analyzeUsage('u1')
    expect(getUsage).not.toHaveBeenCalled()
  })
  it('no hace nada si ya fue analizado', async () => {
    getUsage.mockResolvedValue({ id: 'u1', fotos: { tablero: 't', cabina: 'c' }, iaAnalizadoEn: 'ayer' })
    await analyzeUsage('u1')
    expect(chatVision).not.toHaveBeenCalled()
    expect(setUsageAnalysis).not.toHaveBeenCalled()
  })
  it('no hace nada si faltan fotos', async () => {
    getUsage.mockResolvedValue({ id: 'u1', fotos: { tablero: 't' } })
    await analyzeUsage('u1')
    expect(chatVision).not.toHaveBeenCalled()
  })
  it('analiza y guarda cuando corresponde', async () => {
    getUsage.mockResolvedValue({ id: 'u1', fotos: { tablero: 't', cabina: 'c' } })
    chatVision.mockResolvedValue('{"bencina":"1/2","km":50,"limpieza":"aceptable"}')
    await analyzeUsage('u1')
    expect(chatVision).toHaveBeenCalledWith(['url:t', 'url:c'], expect.any(String))
    expect(setUsageAnalysis).toHaveBeenCalledWith('u1', { bencina: '1/2', km: 50, limpieza: 'aceptable' })
  })
  it('no lanza si algo falla (best-effort)', async () => {
    getUsage.mockRejectedValue(new Error('boom'))
    await expect(analyzeUsage('u1')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/ai/__tests__/analyzeUsage.test.ts`
Expected: FAIL ("Cannot find module '@/lib/ai/analyzeUsage'").

- [ ] **Step 3: Implementar `lib/ai/analyzeUsage.ts`**

```ts
import { getUsage, setUsageAnalysis } from '@/lib/data/usages'
import { createReadUrl } from '@/lib/storage/signedUrls'
import { chatVision, isOpenRouterConfigured } from '@/lib/ai/openrouter'
import { analyzeUsagePhotos } from '@/lib/ai/usageVision'

// Best-effort: analiza las fotos de un uso ya cerrado y rellena bencina/km/limpieza.
// Nunca lanza; si algo falla, el uso queda sin lectura (la foto sigue siendo la evidencia).
export async function analyzeUsage(usageId: string): Promise<void> {
  try {
    if (!isOpenRouterConfigured()) return
    const u = await getUsage(usageId)
    if (!u || u.iaAnalizadoEn) return
    if (!u.fotos?.tablero || !u.fotos?.cabina) return
    const [tableroUrl, cabinaUrl] = await Promise.all([
      createReadUrl(u.fotos.tablero),
      createReadUrl(u.fotos.cabina),
    ])
    const datos = await analyzeUsagePhotos(chatVision, { tableroUrl, cabinaUrl })
    await setUsageAnalysis(usageId, datos)
  } catch {
    /* best-effort */
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/ai/__tests__/analyzeUsage.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/ai/analyzeUsage.ts lib/ai/__tests__/analyzeUsage.test.ts
git commit -m "feat(ia): glue analyzeUsage (best-effort)"
```

---

## Task 4: Disparar el análisis tras la entrega (`after`)

**Files:**
- Modify: `app/api/v/[token]/entregar/route.ts`
- Modify: `app/api/v/[token]/entregar/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `after` de `next/server`; `analyzeUsage` de `@/lib/ai/analyzeUsage`; `closeUsage` (ahora devuelve el `id`).

- [ ] **Step 1: Actualizar el test existente**

En `app/api/v/[token]/entregar/__tests__/route.test.ts`, agregar mocks arriba (junto a los existentes):
```ts
const after = vi.fn()
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => void) => after(fn),
}))
const analyzeUsage = vi.fn()
vi.mock('@/lib/ai/analyzeUsage', () => ({ analyzeUsage: (...a: unknown[]) => analyzeUsage(...a) }))
```
Hacer que el mock de `closeUsage` devuelva un id en el caso feliz (donde ya está el test de 200), p.ej. `closeUsage.mockResolvedValue('u1')`. Agregar `after.mockReset()` y `analyzeUsage.mockReset()` en el `beforeEach`.
Agregar un test nuevo:
```ts
it('agenda el análisis IA tras cerrar el uso', async () => {
  closeUsage.mockResolvedValue('u1')
  const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
  expect(res.status).toBe(200)
  expect(after).toHaveBeenCalledTimes(1)
  // ejecutar el callback agendado y verificar que llama a analyzeUsage con el id
  const cb = after.mock.calls[0][0]
  cb()
  expect(analyzeUsage).toHaveBeenCalledWith('u1')
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run "app/api/v/[token]/entregar/__tests__/route.test.ts"`
Expected: FAIL (el route todavía no importa/llama `after`/`analyzeUsage`).

- [ ] **Step 3: Modificar el route `entregar`**

Imports (arriba):
```ts
import { NextRequest, NextResponse, after } from 'next/server'
import { analyzeUsage } from '@/lib/ai/analyzeUsage'
```
Reemplazar el bloque final (`try { await closeUsage(...) } catch { 409 }` + `return { ok }`) por:
```ts
  let usageId: string
  try {
    usageId = await closeUsage(vehicle.companyId, vehicle.id, { id: driver.id, nombre: driver.nombre }, { tablero, cabina }, dano)
  } catch {
    return NextResponse.json({ error: 'Este vehículo no tiene un uso abierto.' }, { status: 409 })
  }
  // Análisis IA en segundo plano (post-respuesta, best-effort).
  after(() => analyzeUsage(usageId))
  return NextResponse.json({ ok: true })
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run "app/api/v/[token]/entregar/__tests__/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add "app/api/v/[token]/entregar/"
git commit -m "feat(ia): disparar analyzeUsage tras la entrega (after)"
```

---

## Task 5: API de corrección del gestor (`PATCH /api/usages/[id]`)

**Files:**
- Create: `app/api/usages/[id]/route.ts`, `app/api/usages/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getMembership`, `can`; `updateUsageDatos`.
- Produces (HTTP): `PATCH /api/usages/[id]` `{ bencina?, km?, limpieza? }` → `200 { ok }` | `400` valor inválido | `401` | `403` (Visor / cross-company).

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/usages/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const updateUsageDatos = vi.fn()
vi.mock('@/lib/data/usages', () => ({ updateUsageDatos: (...a: unknown[]) => updateUsageDatos(...a) }))

import { PATCH } from '@/app/api/usages/[id]/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(id: string) { return { params: Promise.resolve({ id }) } }

const editor = { uid: 'u1', email: 'e@b.cl', companyId: 'c1', role: 'editor' }

beforeEach(() => {
  getMembership.mockReset(); updateUsageDatos.mockReset()
  getMembership.mockResolvedValue(editor)
})

describe('PATCH /api/usages/[id]', () => {
  it('403 para el Visor', async () => {
    getMembership.mockResolvedValue({ ...editor, role: 'viewer' })
    expect((await PATCH(req({ km: 100 }), ctx('u1'))).status).toBe(403)
  })
  it('400 con bencina fuera de la enumeración', async () => {
    expect((await PATCH(req({ bencina: 'medio' }), ctx('u1'))).status).toBe(400)
  })
  it('400 con km no entero', async () => {
    expect((await PATCH(req({ km: 12.5 }), ctx('u1'))).status).toBe(400)
  })
  it('403 si el uso es de otra empresa', async () => {
    updateUsageDatos.mockRejectedValue(new Error('forbidden'))
    expect((await PATCH(req({ km: 100 }), ctx('u1'))).status).toBe(403)
  })
  it('200 corrige y llama a updateUsageDatos', async () => {
    const res = await PATCH(req({ bencina: '1/2', km: 100, limpieza: 'limpio' }), ctx('u1'))
    expect(res.status).toBe(200)
    expect(updateUsageDatos).toHaveBeenCalledWith('c1', 'u1', { bencina: '1/2', km: 100, limpieza: 'limpio' })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run "app/api/usages/__tests__/route.test.ts"`
Expected: FAIL ("Cannot find module '.../route'").

- [ ] **Step 3: Implementar `app/api/usages/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { updateUsageDatos } from '@/lib/data/usages'

export const dynamic = 'force-dynamic'

const NIVELES = ['Lleno', '3/4', '1/2', '1/4', 'Reserva']
const LIMPIEZAS = ['limpio', 'aceptable', 'sucio']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const patch: { bencina?: string; km?: number; limpieza?: string } = {}
  if (body?.bencina !== undefined) {
    if (typeof body.bencina !== 'string' || !NIVELES.includes(body.bencina)) {
      return NextResponse.json({ error: 'Nivel de bencina inválido.' }, { status: 400 })
    }
    patch.bencina = body.bencina
  }
  if (body?.km !== undefined) {
    const n = Number(body.km)
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: 'Kilometraje inválido.' }, { status: 400 })
    }
    patch.km = n
  }
  if (body?.limpieza !== undefined) {
    if (typeof body.limpieza !== 'string' || !LIMPIEZAS.includes(body.limpieza)) {
      return NextResponse.json({ error: 'Estado de limpieza inválido.' }, { status: 400 })
    }
    patch.limpieza = body.limpieza
  }

  try {
    await updateUsageDatos(m.companyId, id, patch)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run "app/api/usages/__tests__/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add app/api/usages/
git commit -m "feat(ia): API de corrección del gestor (PATCH /api/usages/[id])"
```

---

## Task 6: UI — datos de IA en la bitácora + editor inline

**Files:**
- Create: `components/vehicle/UsageDatosEditor.tsx`
- Modify: `components/vehicle/BitacoraUso.tsx`, `app/(app)/vehiculos/[id]/page.tsx`

**Interfaces:**
- Consumes (HTTP): `PATCH /api/usages/[id]`.
- `BitacoraUso` gana en cada `UsageRow`: `bencina?: string | null`, `km?: number | null`, `limpieza?: string | null`, `iaAnalizadoEn?: string`, `datosConfirmados?: boolean`; y un prop `puedeEditar: boolean`.

- [ ] **Step 1: Implementar `components/vehicle/UsageDatosEditor.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const NIVELES = ['Lleno', '3/4', '1/2', '1/4', 'Reserva']
const LIMPIEZAS = ['limpio', 'aceptable', 'sucio']

export default function UsageDatosEditor({
  usageId, bencina, km, limpieza,
}: {
  usageId: string
  bencina: string | null
  km: number | null
  limpieza: string | null
}) {
  const router = useRouter()
  const [b, setB] = useState(bencina ?? '')
  const [k, setK] = useState(km != null ? String(km) : '')
  const [l, setL] = useState(limpieza ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setBusy(true); setError(null)
    const payload: Record<string, unknown> = {}
    if (b) payload.bencina = b
    if (k) payload.km = Number(k)
    if (l) payload.limpieza = l
    const res = await fetch(`/api/usages/${usageId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setBusy(false)
    if (res.ok) router.refresh()
    else setError((await res.json().catch(() => ({}))).error ?? 'No se pudo guardar.')
  }

  const sel = 'rounded-lg border border-linea bg-superficie px-2 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none'
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-acero">Bencina
        <select value={b} onChange={(e) => setB(e.target.value)} className={sel}>
          <option value="">—</option>
          {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-acero">Kilometraje
        <input value={k} onChange={(e) => setK(e.target.value)} inputMode="numeric" placeholder="km" className={`${sel} w-24`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-acero">Limpieza
        <select value={l} onChange={(e) => setL(e.target.value)} className={sel}>
          <option value="">—</option>
          {LIMPIEZAS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <button onClick={guardar} disabled={busy} className="rounded-lg bg-azul px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
        {busy ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <span className="text-xs text-vencido">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Modificar `components/vehicle/BitacoraUso.tsx`**

Extender la interfaz `UsageRow` con:
```ts
  bencina?: string | null
  km?: number | null
  limpieza?: string | null
  iaAnalizadoEn?: string
  datosConfirmados?: boolean
```
Cambiar la firma del componente para recibir `puedeEditar`:
```tsx
import UsageDatosEditor from '@/components/vehicle/UsageDatosEditor'

export default function BitacoraUso({ usos, puedeEditar }: { usos: UsageRow[]; puedeEditar: boolean }) {
```
Dentro del `<li>`, después del bloque de fotos (antes de cerrar el `<li>`), agregar el bloque de datos:
```tsx
              {(u.bencina || u.km != null || u.limpieza || u.iaAnalizadoEn) && (
                <div className="mt-3 border-t border-linea pt-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-acero">
                    <span>Bencina: <span className="font-medium text-tinta">{u.bencina ?? '—'}</span></span>
                    <span>Kilometraje: <span className="font-medium text-tinta">{u.km != null ? u.km.toLocaleString('es-CL') : '—'}</span></span>
                    <span>Limpieza: <span className="font-medium text-tinta">{u.limpieza ?? '—'}</span></span>
                    {u.iaAnalizadoEn && !u.datosConfirmados && (
                      <span className="rounded-full bg-azul/10 px-2 py-0.5 font-medium text-azul">estimado por IA</span>
                    )}
                  </div>
                  {puedeEditar && (
                    <UsageDatosEditor usageId={u.id} bencina={u.bencina ?? null} km={u.km ?? null} limpieza={u.limpieza ?? null} />
                  )}
                </div>
              )}
```

- [ ] **Step 3: Pasar los datos + `puedeEditar` desde la página del vehículo**

En `app/(app)/vehiculos/[id]/page.tsx`, en el mapeo de `usos` (dentro del `.map(async (u) => ({...}))`), agregar los campos:
```ts
      bencina: u.bencina ?? null,
      km: u.km ?? null,
      limpieza: u.limpieza ?? null,
      iaAnalizadoEn: u.iaAnalizadoEn,
      datosConfirmados: u.datosConfirmados,
```
Y cambiar el render de la sección a pasar `puedeEditar` (la página ya calcula `canEditDocs = can(m.role, 'document:write')`):
```tsx
      <BitacoraUso usos={usos} puedeEditar={canEditDocs} />
```

- [ ] **Step 4: Verificar typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 5: Verificación manual (opcional, dev server)**

`npm run dev`: como Editor/Admin, en la página de un vehículo con un uso analizado, se ven Bencina/Kilometraje/Limpieza + badge "estimado por IA"; el editor inline guarda y quita el badge. Como Visor, los datos se ven sin editor.

- [ ] **Step 6: Commit**

```bash
git add components/vehicle/ "app/(app)/vehiculos/[id]/page.tsx"
git commit -m "feat(ia): datos estimados por IA + editor inline en la bitácora"
```

---

## Cierre

- [ ] **Suite completa + build final**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: todo verde (salvo `rules.test.ts`, que requiere emulador y falla en local).

- [ ] **Recordatorio al usuario (cutover):**
  - Setear `OPENROUTER_API_KEY` (y opcional `OPENROUTER_MODEL`) en Vercel para que el análisis IA corra. Sin la key, la bitácora funciona igual, solo sin lectura automática.
  - No hay cambios de reglas Firestore en SP3 (`usages` ya está bloqueado al cliente desde SP2).
