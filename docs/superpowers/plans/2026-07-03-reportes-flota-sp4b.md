# Bitácora de uso — SP4b: Reportes (responsabilidad por conductor + bitácora filtrable) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página `/reportes` con un reporte de responsabilidad por conductor (contadores todo-el-tiempo) y una bitácora de flota filtrable/paginada (por conductor o vehículo + rango de fecha, con cursor).

**Architecture:** El reporte usa contadores denormalizados en `drivers.stats` (incrementados best-effort en tomar/entregar) — se lee O(conductores) sin escanear historial. El log usa `listUsagesPage` (query con filtros + `orderBy tomadoEn` + `startAfter` cursor + `limit`) que requiere 3 índices compuestos; la API degrada con 503 si faltan, y la página no carga el log server-side (lo pide el cliente) para no romperse sin índices.

**Tech Stack:** Next.js 16 (App Router, TS estricto), Firebase Admin SDK (`FieldValue.increment`, queries paginadas), Vitest, Tailwind v4.

## Global Constraints

- Idioma: **español neutro (Chile)**, "tú" (no "vos"). Código/UI/comentarios en español.
- **Next 16:** `params`/route handlers dinámicos → `Promise`. `GET` lee query params de `new URL(req.url).searchParams`.
- Enforcement server-side: `/reportes` y `/api/reportes/usos` exigen `getMembership()`; `companyId` **siempre del servidor**, nunca del cliente. Lectura para todos los miembros; sin escritura nueva desde el cliente.
- Contadores: incrementos **best-effort** (`FieldValue.increment(1)` en try/catch) — no rompen el flujo del conductor. Sin backfill (parten en 0 desde el deploy).
- Log: `pageSize = 20`; cursor por `tomadoEn`; **solo un** filtro (driverId **o** vehicleId) a la vez; rango de fecha opcional sobre `tomadoEn`.
- Índices compuestos (3) son requisito de cutover; la API degrada con **503 + mensaje claro** si faltan (no 500 crudo).
- Firestore: los datos siguen bloqueados al cliente (defensa en profundidad ya existente); no hay reglas nuevas.
- Tras cambios: `npx tsc --noEmit` y `npm run build` deben pasar antes de commitear.
- Vitest 4: mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(...)`.

---

## Estructura de archivos

**Crear:**
- `app/api/reportes/usos/route.ts` (+ `__tests__/route.test.ts`) — GET paginado.
- `firestore.indexes.json` — referencia de los 3 índices.
- `app/(app)/reportes/page.tsx` — página (server).
- `components/reportes/ReporteConductores.tsx` — tabla de contadores (server).
- `components/reportes/BitacoraFlota.tsx` — log filtrable (cliente).

**Modificar:**
- `lib/types.ts` — `Driver` gana `stats?`.
- `lib/data/drivers.ts` — `toDriver` mapea `stats`; `incrementDriverStats`.
- `lib/data/usages.ts` — `listUsagesPage`.
- `app/api/v/[token]/tomar/route.ts` — incrementos `usos` + `sinEntrega`.
- `app/api/v/[token]/entregar/route.ts` — incremento `danos`.
- `app/(app)/layout.tsx` — enlace "Reportes".

---

## Task 1: Contadores en `drivers` (`stats` + `incrementDriverStats`)

**Files:**
- Modify: `lib/types.ts`, `lib/data/drivers.ts`
- Test: `lib/data/__tests__/drivers-stats.test.ts` (nuevo)

**Interfaces:**
- Produces (`lib/types.ts`): `Driver` gana `stats?: { usos: number; danos: number; sinEntrega: number }`.
- Produces (`lib/data/drivers.ts`):
  - `toDriver` mapea `stats` con default `{ usos: 0, danos: 0, sinEntrega: 0 }`.
  - `incrementDriverStats(driverId: string, campo: 'usos' | 'danos' | 'sinEntrega'): Promise<void>`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/data/__tests__/drivers-stats.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const docUpdate = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ update: docUpdate }) }) },
}))

import { incrementDriverStats } from '@/lib/data/drivers'

beforeEach(() => { docUpdate.mockReset() })

describe('incrementDriverStats', () => {
  it('incrementa el campo indicado con dot-path', async () => {
    await incrementDriverStats('d1', 'danos')
    const arg = docUpdate.mock.calls[0][0]
    expect(Object.keys(arg)).toEqual(['stats.danos'])
    expect(arg['stats.danos']).toBeDefined() // sentinel FieldValue.increment
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/drivers-stats.test.ts`
Expected: FAIL ("incrementDriverStats is not a function" / no exportada).

- [ ] **Step 3: Agregar `stats` al tipo `Driver` en `lib/types.ts`**

En `interface Driver`, tras `bloqueadoHasta?`:
```ts
  stats?: { usos: number; danos: number; sinEntrega: number }
```

- [ ] **Step 4: Mapear `stats` + implementar `incrementDriverStats` en `lib/data/drivers.ts`**

Agregar el import de `FieldValue` al inicio (junto al import de `adminDb`):
```ts
import { FieldValue } from 'firebase-admin/firestore'
```
En `toDriver`, tras `bloqueadoHasta`:
```ts
    stats: {
      usos: d.stats?.usos ?? 0,
      danos: d.stats?.danos ?? 0,
      sinEntrega: d.stats?.sinEntrega ?? 0,
    },
```
Agregar la función (p.ej. tras `listDrivers`):
```ts
// Incremento best-effort de un contador del conductor (para el reporte de responsabilidad).
export async function incrementDriverStats(
  driverId: string,
  campo: 'usos' | 'danos' | 'sinEntrega',
): Promise<void> {
  await adminDb.collection(COL).doc(driverId).update({ [`stats.${campo}`]: FieldValue.increment(1) })
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run lib/data/__tests__/drivers-stats.test.ts lib/data/__tests__/drivers.test.ts`
Expected: PASS (ambos; el de drivers existente sigue verde).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/types.ts lib/data/drivers.ts lib/data/__tests__/drivers-stats.test.ts
git commit -m "feat(reportes): contadores stats en el conductor + incrementDriverStats"
```

---

## Task 2: Incrementar contadores en `tomar` y `entregar`

**Files:**
- Modify: `app/api/v/[token]/tomar/route.ts`, `app/api/v/[token]/entregar/route.ts`
- Modify: `app/api/v/[token]/tomar/__tests__/route.test.ts`, `app/api/v/[token]/entregar/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `incrementDriverStats` de `@/lib/data/drivers`.

- [ ] **Step 1: Actualizar el test de `tomar`**

En `app/api/v/[token]/tomar/__tests__/route.test.ts`: al mock de `@/lib/data/drivers` (que hoy expone `verifyDriverPin`, `getDriver`) agregar `incrementDriverStats`; declarar `const incrementDriverStats = vi.fn()` y añadirlo al `vi.mock('@/lib/data/drivers', ...)`. Agregar `incrementDriverStats.mockReset()` en `beforeEach`. En el test existente de forced-close, cambiar el mock de `forced` para incluir `driverId`, p.ej. `forced: { id: 'viejo', driverId: 'dViejo', driverNombre: 'Beto', tomadoEn: 't' }`, y agregar:
```ts
  expect(incrementDriverStats).toHaveBeenCalledWith('d1', 'usos')
  expect(incrementDriverStats).toHaveBeenCalledWith('dViejo', 'sinEntrega')
```
(el taker `d1` viene de `getDriver.mockResolvedValue({ id: 'd1', ... })`). En el test "200 abre el uso" (sin forced), agregar `expect(incrementDriverStats).toHaveBeenCalledWith('d1', 'usos')`.

- [ ] **Step 2: Modificar la ruta `tomar`**

Agregar `incrementDriverStats` al import de `@/lib/data/drivers`:
```ts
import { verifyDriverPin, getDriver, incrementDriverStats } from '@/lib/data/drivers'
```
Después de `const { forced } = await openUsage(...)`, agregar (best-effort):
```ts
  try { await incrementDriverStats(driver.id, 'usos') } catch { /* best-effort */ }
```
Dentro del `if (forced) { ... }`, agregar (junto a los otros best-effort):
```ts
    try { await incrementDriverStats(forced.driverId, 'sinEntrega') } catch { /* best-effort */ }
```

- [ ] **Step 3: Actualizar el test de `entregar`**

En `app/api/v/[token]/entregar/__tests__/route.test.ts`: al mock de `@/lib/data/drivers` agregar `incrementDriverStats` (`const incrementDriverStats = vi.fn()`), y `incrementDriverStats.mockReset()` en `beforeEach`. Asegurar que el mock de `getUsage` devuelva un `driverId` (p.ej. `getUsage.mockResolvedValue({ driverNombre: 'Ana', driverId: 'dAna' })`). En el test de daño, agregar:
```ts
  expect(incrementDriverStats).toHaveBeenCalledWith('dAna', 'danos')
```

- [ ] **Step 4: Modificar la ruta `entregar`**

Agregar `incrementDriverStats` al import de `@/lib/data/drivers`:
```ts
import { verifyDriverPin, getDriver, incrementDriverStats } from '@/lib/data/drivers'
```
Reemplazar el bloque `if (dano?.hay) { ... }` por (desacopla las tres operaciones best-effort y reutiliza `u`):
```ts
  if (dano?.hay) {
    const u = await getUsage(usageId).catch(() => null)
    try {
      await createAlerta({
        companyId: vehicle.companyId,
        vehicleId: vehicle.id,
        patente: vehicle.patente,
        usageId,
        tipo: 'dano',
        driverNombre: u?.driverNombre ?? driver.nombre,
        nota: dano.nota,
      })
    } catch {
      /* best-effort */
    }
    if (u?.driverId) {
      try { await incrementDriverStats(u.driverId, 'danos') } catch { /* best-effort */ }
    }
  }
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run "app/api/v/[token]/tomar/__tests__/route.test.ts" "app/api/v/[token]/entregar/__tests__/route.test.ts"`
Expected: PASS (nuevos + existentes).

- [ ] **Step 6: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add "app/api/v/[token]/tomar/" "app/api/v/[token]/entregar/"
git commit -m "feat(reportes): incrementar contadores usos/sinEntrega/danos best-effort"
```

---

## Task 3: `listUsagesPage` (log paginado con filtros)

**Files:**
- Modify: `lib/data/usages.ts`
- Test: `lib/data/__tests__/usages-page.test.ts` (nuevo)

**Interfaces:**
- Consumes: `adminDb`; `VehicleUsage`; `toUsage` (interno, ya existe en el archivo).
- Produces:
  - `listUsagesPage(companyId: string, filtros: { driverId?: string; vehicleId?: string; desde?: string; hasta?: string; cursor?: string }, pageSize?: number): Promise<{ items: VehicleUsage[]; nextCursor: string | null }>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/data/__tests__/usages-page.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const where = vi.fn()
const orderBy = vi.fn()
const startAfter = vi.fn()
const limit = vi.fn()
const get = vi.fn()
const q = { where, orderBy, startAfter, limit, get }
vi.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: () => q } }))

import { listUsagesPage } from '@/lib/data/usages'

function doc(id: string, tomadoEn: string) {
  return { id, data: () => ({ vehicleId: 'v', companyId: 'c1', estado: 'cerrado', tomadoEn }) }
}

beforeEach(() => {
  where.mockReturnValue(q); orderBy.mockReturnValue(q); startAfter.mockReturnValue(q); limit.mockReturnValue(q)
  get.mockReset(); where.mockClear(); orderBy.mockClear(); startAfter.mockClear(); limit.mockClear()
  where.mockReturnValue(q); orderBy.mockReturnValue(q); startAfter.mockReturnValue(q); limit.mockReturnValue(q)
})

describe('listUsagesPage', () => {
  it('sin filtros: solo companyId + orderBy tomadoEn desc + limit', async () => {
    get.mockResolvedValue({ docs: [] })
    await listUsagesPage('c1', {}, 20)
    expect(where).toHaveBeenCalledWith('companyId', '==', 'c1')
    expect(orderBy).toHaveBeenCalledWith('tomadoEn', 'desc')
    expect(limit).toHaveBeenCalledWith(20)
    expect(startAfter).not.toHaveBeenCalled()
  })
  it('con driverId agrega el where; con cursor agrega startAfter', async () => {
    get.mockResolvedValue({ docs: [] })
    await listUsagesPage('c1', { driverId: 'd1', cursor: '2026-01-01' }, 20)
    expect(where).toHaveBeenCalledWith('driverId', '==', 'd1')
    expect(startAfter).toHaveBeenCalledWith('2026-01-01')
  })
  it('nextCursor = tomadoEn del último si la página vino llena', async () => {
    get.mockResolvedValue({ docs: [doc('a', '2026-03-01'), doc('b', '2026-02-01')] })
    const r = await listUsagesPage('c1', {}, 2)
    expect(r.items.map((u) => u.id)).toEqual(['a', 'b'])
    expect(r.nextCursor).toBe('2026-02-01')
  })
  it('nextCursor = null si la página no vino llena', async () => {
    get.mockResolvedValue({ docs: [doc('a', '2026-03-01')] })
    const r = await listUsagesPage('c1', {}, 2)
    expect(r.nextCursor).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/usages-page.test.ts`
Expected: FAIL ("listUsagesPage is not a function").

- [ ] **Step 3: Implementar `listUsagesPage` en `lib/data/usages.ts`**

Agregar al final del archivo (usa `toUsage` y `COL`, ya definidos arriba en el mismo archivo):
```ts
export async function listUsagesPage(
  companyId: string,
  filtros: { driverId?: string; vehicleId?: string; desde?: string; hasta?: string; cursor?: string },
  pageSize = 20,
): Promise<{ items: VehicleUsage[]; nextCursor: string | null }> {
  let q: FirebaseFirestore.Query = adminDb.collection(COL).where('companyId', '==', companyId)
  if (filtros.driverId) q = q.where('driverId', '==', filtros.driverId)
  else if (filtros.vehicleId) q = q.where('vehicleId', '==', filtros.vehicleId)
  if (filtros.desde) q = q.where('tomadoEn', '>=', filtros.desde)
  if (filtros.hasta) q = q.where('tomadoEn', '<=', filtros.hasta)
  q = q.orderBy('tomadoEn', 'desc')
  if (filtros.cursor) q = q.startAfter(filtros.cursor)
  q = q.limit(pageSize)
  const snap = await q.get()
  const items = snap.docs.map((d) => toUsage(d.id, d.data()))
  const nextCursor = items.length === pageSize ? items[items.length - 1].tomadoEn : null
  return { items, nextCursor }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/data/__tests__/usages-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/data/usages.ts lib/data/__tests__/usages-page.test.ts
git commit -m "feat(reportes): listUsagesPage (log paginado por cursor + filtros)"
```

---

## Task 4: API `GET /api/reportes/usos` + `firestore.indexes.json`

**Files:**
- Create: `app/api/reportes/usos/route.ts`, `app/api/reportes/__tests__/route.test.ts`, `firestore.indexes.json`

**Interfaces:**
- Consumes: `getMembership`; `listUsagesPage`.
- Produces (HTTP): `GET /api/reportes/usos?driverId=&vehicleId=&desde=&hasta=&cursor=` → `200 { items, nextCursor }` | `400` (ambos filtros) | `401` | `503` (índice faltante / error de query).

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/reportes/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const listUsagesPage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ listUsagesPage: (...a: unknown[]) => listUsagesPage(...a) }))

import { GET } from '@/app/api/reportes/usos/route'

function req(qs: string) {
  return { url: `http://x/api/reportes/usos${qs}` } as unknown as import('next/server').NextRequest
}
const m = { uid: 'u1', email: 'e@b.cl', companyId: 'c1', role: 'viewer' }

beforeEach(() => {
  getMembership.mockReset(); listUsagesPage.mockReset()
  getMembership.mockResolvedValue(m)
  listUsagesPage.mockResolvedValue({ items: [{ id: 'u1' }], nextCursor: null })
})

describe('GET /api/reportes/usos', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await GET(req(''))).status).toBe(401)
  })
  it('400 si vienen driverId y vehicleId', async () => {
    expect((await GET(req('?driverId=d1&vehicleId=v1'))).status).toBe(400)
  })
  it('200 con items usando el companyId del servidor', async () => {
    const res = await GET(req('?driverId=d1&cursor=x'))
    expect(res.status).toBe(200)
    expect(listUsagesPage).toHaveBeenCalledWith('c1', expect.objectContaining({ driverId: 'd1', cursor: 'x' }))
    expect((await res.json()).items[0].id).toBe('u1')
  })
  it('503 si la query falla (índice faltante)', async () => {
    listUsagesPage.mockRejectedValue(new Error('FAILED_PRECONDITION: index'))
    expect((await GET(req(''))).status).toBe(503)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run "app/api/reportes/__tests__/route.test.ts"`
Expected: FAIL ("Cannot find module '.../route'").

- [ ] **Step 3: Implementar `app/api/reportes/usos/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { listUsagesPage } from '@/lib/data/usages'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const driverId = p.get('driverId') || undefined
  const vehicleId = p.get('vehicleId') || undefined
  if (driverId && vehicleId) {
    return NextResponse.json({ error: 'Filtra por conductor o por vehículo, no ambos.' }, { status: 400 })
  }
  const desde = p.get('desde') || undefined
  const hasta = p.get('hasta') || undefined
  const cursor = p.get('cursor') || undefined

  try {
    const { items, nextCursor } = await listUsagesPage(m.companyId, { driverId, vehicleId, desde, hasta, cursor })
    return NextResponse.json({ items, nextCursor })
  } catch {
    // Típicamente falta un índice compuesto (Firestore FAILED_PRECONDITION).
    return NextResponse.json(
      { error: 'No se pudo cargar el reporte. Puede faltar configurar los índices de Firestore.' },
      { status: 503 },
    )
  }
}
```

- [ ] **Step 4: Crear `firestore.indexes.json` (referencia de los 3 índices)**

```json
{
  "indexes": [
    {
      "collectionGroup": "usages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "companyId", "order": "ASCENDING" },
        { "fieldPath": "tomadoEn", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "usages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "companyId", "order": "ASCENDING" },
        { "fieldPath": "driverId", "order": "ASCENDING" },
        { "fieldPath": "tomadoEn", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "usages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "companyId", "order": "ASCENDING" },
        { "fieldPath": "vehicleId", "order": "ASCENDING" },
        { "fieldPath": "tomadoEn", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 5: Correr el test + build y verificar que pasan**

Run: `npx vitest run "app/api/reportes/__tests__/route.test.ts" && npx tsc --noEmit && npm run build`
Expected: PASS; build sin errores; `/api/reportes/usos` en la tabla de rutas.

- [ ] **Step 6: Commit**

```bash
git add app/api/reportes/ firestore.indexes.json
git commit -m "feat(reportes): API GET /api/reportes/usos + firestore.indexes.json"
```

---

## Task 5: UI — página `/reportes` (reporte + log) + enlace en la barra

**Files:**
- Create: `app/(app)/reportes/page.tsx`, `components/reportes/ReporteConductores.tsx`, `components/reportes/BitacoraFlota.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `getMembership`; `listDrivers` de `@/lib/data/drivers` (trae `stats`); `listVehicles` de `@/lib/data/vehicles`; `GET /api/reportes/usos`.

- [ ] **Step 1: Implementar `components/reportes/ReporteConductores.tsx`**

```tsx
interface Fila {
  id: string
  nombre: string
  usos: number
  danos: number
  sinEntrega: number
}

export default function ReporteConductores({ filas }: { filas: Fila[] }) {
  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Responsabilidad por conductor</h2>
      <p className="mt-1 text-sm text-acero">Acumulado desde que se activó el registro.</p>
      {filas.length === 0 ? (
        <p className="mt-4 text-sm text-acero">Aún no hay conductores.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-acero">
                <th className="py-2 pr-4 font-medium">Conductor</th>
                <th className="py-2 pr-4 font-medium">Usos</th>
                <th className="py-2 pr-4 font-medium">Daños</th>
                <th className="py-2 font-medium">Sin entrega</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-linea/60">
                  <td className="py-2 pr-4 font-medium text-tinta">{f.nombre}</td>
                  <td className="py-2 pr-4 text-tinta">{f.usos}</td>
                  <td className={`py-2 pr-4 ${f.danos > 0 ? 'font-semibold text-[#C81E1E]' : 'text-tinta'}`}>{f.danos}</td>
                  <td className={`py-2 ${f.sinEntrega > 0 ? 'font-semibold text-[#B45309]' : 'text-tinta'}`}>{f.sinEntrega}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Implementar `components/reportes/BitacoraFlota.tsx`**

```tsx
'use client'
import { useCallback, useEffect, useState } from 'react'

interface Opcion { id: string; nombre: string }
interface Vehiculo { id: string; patente: string }
interface Uso {
  id: string
  vehicleId: string
  driverNombre: string
  tomadoEn: string
  entregadoEn: string | null
  cierreForzado?: boolean
  dano?: { hay: boolean }
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

export default function BitacoraFlota({
  conductores, vehiculos,
}: {
  conductores: Opcion[]
  vehiculos: Vehiculo[]
}) {
  const patentePorId = new Map(vehiculos.map((v) => [v.id, v.patente]))
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [items, setItems] = useState<Uso[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (reset: boolean) => {
    setLoading(true); setError(null)
    const p = new URLSearchParams()
    if (driverId) p.set('driverId', driverId)
    if (vehicleId) p.set('vehicleId', vehicleId)
    if (desde) p.set('desde', desde)
    if (hasta) p.set('hasta', hasta)
    if (!reset && cursor) p.set('cursor', cursor)
    const res = await fetch(`/api/reportes/usos?${p.toString()}`)
    setLoading(false)
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'No se pudo cargar.')
      return
    }
    const data = await res.json()
    setItems((prev) => (reset ? data.items : [...prev, ...data.items]))
    setCursor(data.nextCursor)
  }, [driverId, vehicleId, desde, hasta, cursor])

  // Recarga desde cero cuando cambian los filtros.
  useEffect(() => { cargar(true) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [driverId, vehicleId, desde, hasta])

  const sel = 'rounded-lg border border-linea bg-superficie px-2 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none'

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Bitácora de la flota</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-acero">Conductor
          <select value={driverId} onChange={(e) => { setDriverId(e.target.value); setVehicleId('') }} className={sel}>
            <option value="">Todos</option>
            {conductores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-acero">Vehículo
          <select value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setDriverId('') }} className={sel}>
            <option value="">Todos</option>
            {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.patente}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-acero">Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={sel} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-acero">Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={sel} />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-vencido">{error}</p>}

      {!error && (
        <ul className="mt-4 space-y-2">
          {items.length === 0 && !loading && <li className="text-sm text-acero">Sin usos para el filtro.</li>}
          {items.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-tinta">{patentePorId.get(u.vehicleId) ?? u.vehicleId} · {u.driverNombre}</p>
                <p className="text-xs text-acero">
                  Tomó {fecha(u.tomadoEn)}{u.entregadoEn ? ` · Entregó ${fecha(u.entregadoEn)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {u.dano?.hay && <span className="rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Daño</span>}
                {u.cierreForzado && <span className="rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">Sin entrega</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!error && cursor && (
        <button onClick={() => cargar(false)} disabled={loading} className="mt-3 rounded-lg border border-linea px-4 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo disabled:opacity-50">
          {loading ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Implementar `app/(app)/reportes/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { listDrivers } from '@/lib/data/drivers'
import { listVehicles } from '@/lib/data/vehicles'
import BackLink from '@/components/BackLink'
import ReporteConductores from '@/components/reportes/ReporteConductores'
import BitacoraFlota from '@/components/reportes/BitacoraFlota'

export const dynamic = 'force-dynamic'

export default async function ReportesPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  const [drivers, vehicles] = await Promise.all([listDrivers(m.companyId), listVehicles(m.companyId)])

  const filas = drivers
    .map((d) => ({
      id: d.id,
      nombre: d.nombre,
      usos: d.stats?.usos ?? 0,
      danos: d.stats?.danos ?? 0,
      sinEntrega: d.stats?.sinEntrega ?? 0,
    }))
    .sort((a, b) => b.danos - a.danos || b.sinEntrega - a.sinEntrega)

  const conductores = drivers.map((d) => ({ id: d.id, nombre: d.nombre }))
  const vehiculos = vehicles
    .map((v) => ({ id: v.id, patente: v.patente }))
    .sort((a, b) => a.patente.localeCompare(b.patente))

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-bold tracking-tight text-tinta">Reportes</h1>
      <ReporteConductores filas={filas} />
      <BitacoraFlota conductores={conductores} vehiculos={vehiculos} />
    </main>
  )
}
```

- [ ] **Step 4: Agregar el enlace "Reportes" en `app/(app)/layout.tsx`**

En la `<nav>` que ya tiene el enlace "Flota", agregar junto a él:
```tsx
              <Link href="/reportes" className="text-acero transition-colors hover:text-tinta">Reportes</Link>
```

- [ ] **Step 5: Verificar typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; `/reportes` aparece como ruta dinámica.

- [ ] **Step 6: Verificación manual (opcional, dev server)**

`npm run dev`: entra a `/reportes`. La tabla de conductores muestra usos/daños/sin-entrega (0 al inicio; suben con nuevos usos). La bitácora carga la primera página (o muestra el mensaje de 503 si aún no están los índices); los filtros por conductor/vehículo/fecha recargan; "Cargar más" pagina.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/reportes/" components/reportes/ "app/(app)/layout.tsx"
git commit -m "feat(reportes): página /reportes (reporte por conductor + bitácora filtrable) + enlace"
```

---

## Cierre

- [ ] **Suite completa + build final**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: todo verde (salvo `rules.test.ts`, que requiere emulador y falla en local).

- [ ] **Recordatorio al usuario (cutover):**
  - **Crear los 3 índices compuestos** de `usages` (consola de Firestore, con el link automático que aparece al primer query fallido de la bitácora, o `firebase deploy --only firestore:indexes` con `firestore.indexes.json`). Sin ellos, la bitácora filtrable muestra el aviso de 503; el reporte por conductor y el resto de la app funcionan igual.
  - Los contadores **parten en 0**; el reporte refleja solo los usos posteriores al deploy (sin backfill).
