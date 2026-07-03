# Bitácora de uso — SP4a: Panel de flota + alertas accionables — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página `/flota` con el estado en vivo de cada vehículo (disponible / en uso por quién) y una bandeja de alertas (daños + "sin entrega formal") accionable ("marcar como atendida").

**Architecture:** El panel se arma con datos denormalizados: `vehicles.usoActual` (mantenido por `openUsage`/`closeUsage`) da el estado en vivo sin leer `usages`, y una colección `alertas` que **solo contiene las abiertas** (se borran al atender) da la bandeja con una query de un solo campo. Las alertas se crean best-effort en las rutas públicas `tomar` (sin_entrega) y `entregar` (dano).

**Tech Stack:** Next.js 16 (App Router, TS estricto), Firebase Admin SDK, Vitest, Tailwind v4.

## Global Constraints

- Idioma: **español neutro (Chile)**, "tú" (no "vos"). Código/UI/comentarios en español.
- **Next 16:** `params` es `Promise` en route handlers dinámicos → tipar y `await`.
- Enforcement server-side: `/api/*` privados validan `getMembership()` + `can(role, action)`; nunca confían en el cliente.
- **Atender alerta** = `document:write` (Editor + Admin); el **Visor** solo ve el panel.
- **Panel `/flota`**: lo ven todos los miembros (lectura).
- Firestore: **queries de un solo campo** + filtrar/ordenar en memoria (la colección `alertas` es chica por diseño). `alertas` bloqueada al cliente en `firestore.rules`.
- Creación de alertas y escritura de `usoActual` son **best-effort / no deben romper** el flujo del conductor.
- Tras cambios: `npx tsc --noEmit` y `npm run build` deben pasar antes de commitear.
- Vitest 4: mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(...)`.

---

## Estructura de archivos

**Crear:**
- `lib/data/alertas.ts` (+ `__tests__/alertas.test.ts`) — CRUD de alertas.
- `app/api/alertas/[id]/route.ts` (+ `__tests__/route.test.ts`) — DELETE atender.
- `app/(app)/flota/page.tsx` — página del panel (server).
- `components/flota/FlotaGrid.tsx` — grilla de vehículos (server).
- `components/flota/AlertasBandeja.tsx` — bandeja de pendientes (server).
- `components/flota/AtenderAlertaButton.tsx` — botón atender (cliente).

**Modificar:**
- `lib/types.ts` — `Alerta`; `Vehicle` gana `usoActual?`.
- `lib/data/vehicles.ts` — `toVehicle` mapea `usoActual`.
- `lib/data/usages.ts` — `openUsage` setea `usoActual`; `closeUsage` lo limpia.
- `app/api/v/[token]/tomar/route.ts` — crear alerta `sin_entrega` en el forced-close.
- `app/api/v/[token]/entregar/route.ts` — crear alerta `dano` si corresponde.
- `app/(app)/layout.tsx` — enlace "Flota".
- `firestore.rules` — bloquear `alertas`.

---

## Task 1: Tipos + `usoActual` denormalizado en usages/vehicles

**Files:**
- Modify: `lib/types.ts`, `lib/data/vehicles.ts`, `lib/data/usages.ts`
- Test: `lib/data/__tests__/usages-flota.test.ts` (nuevo)

**Interfaces:**
- Produces (`lib/types.ts`):
  - `interface Alerta { id; companyId; vehicleId; patente; usageId; tipo: 'dano'|'sin_entrega'; driverNombre; nota?; creadaEn }`
  - `Vehicle` gana `usoActual?: { driverId: string; driverNombre: string; tomadoEn: string } | null`
- Produces: `openUsage` ahora también setea `vehicles/{vehicleId}.usoActual`; `closeUsage` lo pone en `null`. Sus firmas no cambian.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/data/__tests__/usages-flota.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const usageWhereGet = vi.fn()
const usageAdd = vi.fn()
const usageDocUpdate = vi.fn()
const vehicleDocUpdate = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === 'vehicles') return { doc: () => ({ update: vehicleDocUpdate }) }
      return { where: () => ({ get: usageWhereGet }), add: usageAdd, doc: () => ({ update: usageDocUpdate }) }
    },
  },
}))

import { openUsage, closeUsage } from '@/lib/data/usages'

beforeEach(() => {
  usageWhereGet.mockReset(); usageAdd.mockReset(); usageDocUpdate.mockReset(); vehicleDocUpdate.mockReset()
})

describe('openUsage denormaliza usoActual', () => {
  it('setea usoActual en el vehículo al abrir', async () => {
    usageWhereGet.mockResolvedValue({ docs: [] })
    usageAdd.mockResolvedValue({ id: 'u1' })
    await openUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' })
    expect(vehicleDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ usoActual: expect.objectContaining({ driverId: 'd1', driverNombre: 'Ana' }) }),
    )
  })
})

describe('closeUsage limpia usoActual', () => {
  it('pone usoActual en null al cerrar', async () => {
    usageWhereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'abierto', companyId: 'c1', tomadoEn: 't' }) },
    ] })
    await closeUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' })
    expect(vehicleDocUpdate).toHaveBeenCalledWith({ usoActual: null })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/usages-flota.test.ts`
Expected: FAIL (aún no se escribe `usoActual`).

- [ ] **Step 3: Agregar los tipos en `lib/types.ts`**

En `interface Vehicle`, agregar tras `createdByUid?`:
```ts
  usoActual?: { driverId: string; driverNombre: string; tomadoEn: string } | null
```
Al final del archivo, agregar:
```ts
export interface Alerta {
  id: string
  companyId: string
  vehicleId: string
  patente: string // denormalizado
  usageId: string
  tipo: 'dano' | 'sin_entrega'
  driverNombre: string
  nota?: string
  creadaEn: string // ISO
}
```

- [ ] **Step 4: Mapear `usoActual` en `lib/data/vehicles.ts`**

En `toVehicle`, agregar al objeto retornado (tras `createdAt`):
```ts
    usoActual: data.usoActual ?? null,
```

- [ ] **Step 5: Escribir `usoActual` en `lib/data/usages.ts`**

En `openUsage`, después de `const ref = await adminDb.collection(COL).add(data)` y antes del `return`:
```ts
  await adminDb.collection('vehicles').doc(vehicleId).update({
    usoActual: { driverId: driver.id, driverNombre: driver.nombre, tomadoEn: now },
  })
```
En `closeUsage`, después del `await adminDb.collection(COL).doc(open.id).update({...})` y antes del `return open.id`:
```ts
  await adminDb.collection('vehicles').doc(vehicleId).update({ usoActual: null })
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/__tests__/usages-flota.test.ts lib/data/__tests__/usages.test.ts lib/data/__tests__/usages-ia.test.ts`
Expected: PASS (los 3 archivos; los existentes siguen verdes porque el mock de colección tolera el `.update` extra).

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/types.ts lib/data/vehicles.ts lib/data/usages.ts lib/data/__tests__/usages-flota.test.ts
git commit -m "feat(flota): tipo Alerta + usoActual denormalizado en el vehículo"
```

---

## Task 2: Capa de datos de alertas (`lib/data/alertas.ts`)

**Files:**
- Create: `lib/data/alertas.ts`, `lib/data/__tests__/alertas.test.ts`

**Interfaces:**
- Consumes: `adminDb`; `Alerta`.
- Produces:
  - `createAlerta(input: { companyId: string; vehicleId: string; patente: string; usageId: string; tipo: 'dano' | 'sin_entrega'; driverNombre: string; nota?: string }): Promise<void>`
  - `listAlertas(companyId: string): Promise<Alerta[]>` (desc por `creadaEn`)
  - `deleteAlerta(companyId: string, id: string): Promise<void>` (throw `'forbidden'` si no pertenece)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/data/__tests__/alertas.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const whereGet = vi.fn()
const add = vi.fn()
const docGet = vi.fn()
const docDelete = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: () => ({ get: whereGet }), add, doc: () => ({ get: docGet, delete: docDelete }) }) },
}))

import { createAlerta, listAlertas, deleteAlerta } from '@/lib/data/alertas'

beforeEach(() => { whereGet.mockReset(); add.mockReset(); docGet.mockReset(); docDelete.mockReset() })

describe('createAlerta', () => {
  it('escribe los campos + creadaEn', async () => {
    await createAlerta({ companyId: 'c1', vehicleId: 'v1', patente: 'ABCD12', usageId: 'u1', tipo: 'dano', driverNombre: 'Ana', nota: 'rayón' })
    const arg = add.mock.calls[0][0]
    expect(arg).toMatchObject({ companyId: 'c1', tipo: 'dano', patente: 'ABCD12', driverNombre: 'Ana', nota: 'rayón' })
    expect(typeof arg.creadaEn).toBe('string')
  })
})

describe('listAlertas', () => {
  it('ordena desc por creadaEn', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a', data: () => ({ creadaEn: '2026-01-01', tipo: 'dano' }) },
      { id: 'b', data: () => ({ creadaEn: '2026-03-01', tipo: 'sin_entrega' }) },
    ] })
    expect((await listAlertas('c1')).map((a) => a.id)).toEqual(['b', 'a'])
  })
})

describe('deleteAlerta', () => {
  it('rechaza si la alerta es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(deleteAlerta('c1', 'a1')).rejects.toThrow('forbidden')
  })
  it('borra si pertenece', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await deleteAlerta('c1', 'a1')
    expect(docDelete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/alertas.test.ts`
Expected: FAIL ("Cannot find module '@/lib/data/alertas'").

- [ ] **Step 3: Implementar `lib/data/alertas.ts`**

```ts
import { adminDb } from '@/lib/firebase/admin'
import type { Alerta } from '@/lib/types'

const COL = 'alertas'

function toAlerta(id: string, d: FirebaseFirestore.DocumentData): Alerta {
  return {
    id,
    companyId: d.companyId,
    vehicleId: d.vehicleId,
    patente: d.patente,
    usageId: d.usageId,
    tipo: d.tipo,
    driverNombre: d.driverNombre,
    nota: d.nota ?? undefined,
    creadaEn: d.creadaEn,
  }
}

export async function createAlerta(input: {
  companyId: string
  vehicleId: string
  patente: string
  usageId: string
  tipo: 'dano' | 'sin_entrega'
  driverNombre: string
  nota?: string
}): Promise<void> {
  await adminDb.collection(COL).add({
    companyId: input.companyId,
    vehicleId: input.vehicleId,
    patente: input.patente,
    usageId: input.usageId,
    tipo: input.tipo,
    driverNombre: input.driverNombre,
    nota: input.nota ?? null,
    creadaEn: new Date().toISOString(),
  })
}

// Query de un solo campo; la colección solo contiene alertas ABIERTAS (las
// atendidas se borran), así que se mantiene chica sin importar el historial.
export async function listAlertas(companyId: string): Promise<Alerta[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.docs.map((d) => toAlerta(d.id, d.data())).sort((a, b) => (a.creadaEn < b.creadaEn ? 1 : -1))
}

export async function deleteAlerta(companyId: string, id: string): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  await ref.delete()
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/__tests__/alertas.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/data/alertas.ts lib/data/__tests__/alertas.test.ts
git commit -m "feat(flota): capa de datos de alertas (crear/listar/borrar)"
```

---

## Task 3: Crear alertas en `tomar` (sin_entrega) y `entregar` (dano)

**Files:**
- Modify: `app/api/v/[token]/tomar/route.ts`, `app/api/v/[token]/entregar/route.ts`
- Modify: `app/api/v/[token]/tomar/__tests__/route.test.ts`, `app/api/v/[token]/entregar/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `createAlerta` de `@/lib/data/alertas`; `getUsage` de `@/lib/data/usages` (ya existe).

- [ ] **Step 1: Actualizar el test de `tomar`**

En `app/api/v/[token]/tomar/__tests__/route.test.ts`, agregar el mock (junto a los otros):
```ts
const createAlerta = vi.fn()
vi.mock('@/lib/data/alertas', () => ({ createAlerta: (...a: unknown[]) => createAlerta(...a) }))
```
Agregar `createAlerta.mockReset()` en el `beforeEach`. Agregar un test:
```ts
it('crea una alerta sin_entrega cuando hay forced-close', async () => {
  verifyDriverPin.mockResolvedValue('ok')
  openUsage.mockResolvedValue({ usage: { id: 'u2' }, forced: { id: 'viejo', driverNombre: 'Beto', tomadoEn: 't' } })
  const res = await POST(req({ driverId: 'd1', pin: '1234' }), ctx('t'))
  expect(res.status).toBe(200)
  expect(createAlerta).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'sin_entrega', usageId: 'viejo', driverNombre: 'Beto', companyId: 'c1', vehicleId: 'v1' }))
})
```

- [ ] **Step 2: Modificar la ruta `tomar`**

Agregar el import:
```ts
import { createAlerta } from '@/lib/data/alertas'
```
Dentro del bloque `if (forced) { ... }`, antes o después del `try` del email, agregar (best-effort, propio try/catch):
```ts
    try {
      await createAlerta({
        companyId: vehicle.companyId,
        vehicleId: vehicle.id,
        patente: vehicle.patente,
        usageId: forced.id,
        tipo: 'sin_entrega',
        driverNombre: forced.driverNombre,
      })
    } catch {
      /* best-effort */
    }
```

- [ ] **Step 3: Actualizar el test de `entregar`**

En `app/api/v/[token]/entregar/__tests__/route.test.ts`, agregar mocks:
```ts
const createAlerta = vi.fn()
vi.mock('@/lib/data/alertas', () => ({ createAlerta: (...a: unknown[]) => createAlerta(...a) }))
```
Y extender el mock existente de `@/lib/data/usages` para incluir `getUsage` (además de `closeUsage`):
```ts
vi.mock('@/lib/data/usages', () => ({
  closeUsage: (...a: unknown[]) => closeUsage(...a),
  getUsage: (...a: unknown[]) => getUsage(...a),
}))
```
(declara `const getUsage = vi.fn()` arriba). En `beforeEach`, `createAlerta.mockReset(); getUsage.mockReset(); getUsage.mockResolvedValue({ driverNombre: 'Ana' })`. Agregar un test:
```ts
it('crea una alerta de daño cuando se reporta daño', async () => {
  closeUsage.mockResolvedValue('u1')
  const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' }, dano: { hay: true, nota: 'rayón' } }), ctx('t'))
  expect(res.status).toBe(200)
  expect(createAlerta).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'dano', usageId: 'u1', nota: 'rayón', companyId: 'c1', vehicleId: 'v1' }))
})
```

- [ ] **Step 4: Modificar la ruta `entregar`**

Agregar imports:
```ts
import { createAlerta } from '@/lib/data/alertas'
import { getUsage } from '@/lib/data/usages'
```
(`closeUsage` ya se importa de `@/lib/data/usages`; agrega `getUsage` a ese import). Después de `usageId = await closeUsage(...)` (y antes del `after(...)`), agregar:
```ts
  if (dano?.hay) {
    try {
      const u = await getUsage(usageId)
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
  }
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run "app/api/v/[token]/tomar/__tests__/route.test.ts" "app/api/v/[token]/entregar/__tests__/route.test.ts"`
Expected: PASS (los tests nuevos + los existentes).

- [ ] **Step 6: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add "app/api/v/[token]/tomar/" "app/api/v/[token]/entregar/"
git commit -m "feat(flota): crear alertas sin_entrega (tomar) y dano (entregar)"
```

---

## Task 4: API atender (`DELETE /api/alertas/[id]`)

**Files:**
- Create: `app/api/alertas/[id]/route.ts`, `app/api/alertas/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getMembership`, `can`; `deleteAlerta`.
- Produces (HTTP): `DELETE /api/alertas/[id]` → `200 { ok }` | `401` | `403` (Visor / cross-company).

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/alertas/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const deleteAlerta = vi.fn()
vi.mock('@/lib/data/alertas', () => ({ deleteAlerta: (...a: unknown[]) => deleteAlerta(...a) }))

import { DELETE } from '@/app/api/alertas/[id]/route'

function ctx(id: string) { return { params: Promise.resolve({ id }) } }
const editor = { uid: 'u1', email: 'e@b.cl', companyId: 'c1', role: 'editor' }

beforeEach(() => {
  getMembership.mockReset(); deleteAlerta.mockReset()
  getMembership.mockResolvedValue(editor)
})

describe('DELETE /api/alertas/[id]', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await DELETE(new Request('http://x'), ctx('a1'))).status).toBe(401)
  })
  it('403 para el Visor', async () => {
    getMembership.mockResolvedValue({ ...editor, role: 'viewer' })
    expect((await DELETE(new Request('http://x'), ctx('a1'))).status).toBe(403)
  })
  it('403 si es de otra empresa', async () => {
    deleteAlerta.mockRejectedValue(new Error('forbidden'))
    expect((await DELETE(new Request('http://x'), ctx('a1'))).status).toBe(403)
  })
  it('200 atiende (borra) la alerta', async () => {
    const res = await DELETE(new Request('http://x'), ctx('a1'))
    expect(res.status).toBe(200)
    expect(deleteAlerta).toHaveBeenCalledWith('c1', 'a1')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run "app/api/alertas/__tests__/route.test.ts"`
Expected: FAIL ("Cannot find module '.../route'").

- [ ] **Step 3: Implementar `app/api/alertas/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { deleteAlerta } from '@/lib/data/alertas'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    await deleteAlerta(m.companyId, id)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run "app/api/alertas/__tests__/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add app/api/alertas/
git commit -m "feat(flota): API atender alerta (DELETE /api/alertas/[id])"
```

---

## Task 5: Reglas Firestore — bloquear `alertas`

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Agregar el match en `firestore.rules`**

Dentro de `match /databases/{database}/documents { ... }`, junto a los otros bloques `if false`, agregar:
```
    // Alertas: solo server-side (Admin SDK). Cliente sin acceso.
    match /alertas/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Verificar balance de llaves**

Run: `node -e "const s=require('fs').readFileSync('firestore.rules','utf8'); const o=(s.match(/{/g)||[]).length, c=(s.match(/}/g)||[]).length; if(o!==c) throw new Error('llaves '+o+'/'+c); console.log('OK', o)"`
Expected: `OK <n>`.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(flota): reglas Firestore bloquean alertas al cliente"
```

Nota cutover: desplegar con `node --env-file=.env.local scripts/deploy-firestore-rules.mjs`.

---

## Task 6: UI — página `/flota` (grilla + bandeja) + enlace en la barra

**Files:**
- Create: `app/(app)/flota/page.tsx`, `components/flota/FlotaGrid.tsx`, `components/flota/AlertasBandeja.tsx`, `components/flota/AtenderAlertaButton.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `getMembership`, `can`; `listVehicles` de `@/lib/data/vehicles`; `listAlertas` de `@/lib/data/alertas`; `Alerta` de `@/lib/types`; `DELETE /api/alertas/[id]`.

- [ ] **Step 1: Implementar `components/flota/AtenderAlertaButton.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AtenderAlertaButton({ alertaId }: { alertaId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function atender() {
    setBusy(true)
    const res = await fetch(`/api/alertas/${alertaId}`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) router.refresh()
  }
  return (
    <button
      onClick={atender}
      disabled={busy}
      className="shrink-0 rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo disabled:opacity-50"
    >
      {busy ? '…' : 'Atender'}
    </button>
  )
}
```

- [ ] **Step 2: Implementar `components/flota/AlertasBandeja.tsx`**

```tsx
import type { Alerta } from '@/lib/types'
import AtenderAlertaButton from '@/components/flota/AtenderAlertaButton'

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

const LABEL: Record<Alerta['tipo'], string> = { dano: 'Daño reportado', sin_entrega: 'Sin entrega formal' }

export default function AlertasBandeja({ alertas, puedeAtender }: { alertas: Alerta[]; puedeAtender: boolean }) {
  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Pendientes</h2>
      <p className="mt-1 text-sm text-acero">Daños y entregas sin cerrar que requieren atención.</p>
      {alertas.length === 0 ? (
        <p className="mt-4 text-sm text-acero">No hay alertas pendientes.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {alertas.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-tinta">{a.patente} · {LABEL[a.tipo]}</p>
                <p className="text-xs text-acero">
                  {a.driverNombre} · {fecha(a.creadaEn)}{a.nota ? ` · ${a.nota}` : ''}
                </p>
              </div>
              {puedeAtender && <AtenderAlertaButton alertaId={a.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Implementar `components/flota/FlotaGrid.tsx`**

```tsx
import Link from 'next/link'

interface VehiculoItem {
  id: string
  patente: string
  marca: string
  modelo: string
  usoActual: { driverNombre: string; tomadoEn: string } | null
  tiposAlerta: ('dano' | 'sin_entrega')[]
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

export default function FlotaGrid({ vehiculos }: { vehiculos: VehiculoItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-tinta">Vehículos</h2>
      {vehiculos.length === 0 ? (
        <p className="text-sm text-acero">Aún no hay vehículos.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {vehiculos.map((v) => (
            <li key={v.id}>
              <Link
                href={`/vehiculos/${v.id}`}
                className="block rounded-2xl border border-linea bg-superficie p-4 shadow-sm transition-colors hover:border-azul/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-tinta">{v.patente}</p>
                  <div className="flex gap-1">
                    {v.tiposAlerta.includes('dano') && (
                      <span className="rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Daño</span>
                    )}
                    {v.tiposAlerta.includes('sin_entrega') && (
                      <span className="rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">Sin entrega</span>
                    )}
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-acero">{v.marca} {v.modelo}</p>
                <p className="mt-2 text-sm">
                  {v.usoActual ? (
                    <span className="text-tinta">En uso por <span className="font-medium">{v.usoActual.driverNombre}</span> · desde {hora(v.usoActual.tomadoEn)}</span>
                  ) : (
                    <span className="text-[#15803D]">Disponible</span>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Implementar `app/(app)/flota/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { listVehicles } from '@/lib/data/vehicles'
import { listAlertas } from '@/lib/data/alertas'
import BackLink from '@/components/BackLink'
import FlotaGrid from '@/components/flota/FlotaGrid'
import AlertasBandeja from '@/components/flota/AlertasBandeja'

export const dynamic = 'force-dynamic'

export default async function FlotaPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  const [vehicles, alertas] = await Promise.all([listVehicles(m.companyId), listAlertas(m.companyId)])
  const puedeAtender = can(m.role, 'document:write')

  const alertasPorVehiculo = new Map<string, ('dano' | 'sin_entrega')[]>()
  for (const a of alertas) {
    const arr = alertasPorVehiculo.get(a.vehicleId) ?? []
    arr.push(a.tipo)
    alertasPorVehiculo.set(a.vehicleId, arr)
  }

  const vehiculos = vehicles
    .slice()
    .sort((a, b) => a.patente.localeCompare(b.patente))
    .map((v) => ({
      id: v.id,
      patente: v.patente,
      marca: v.marca,
      modelo: v.modelo,
      usoActual: v.usoActual ?? null,
      tiposAlerta: alertasPorVehiculo.get(v.id) ?? [],
    }))

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-bold tracking-tight text-tinta">Flota</h1>
      <FlotaGrid vehiculos={vehiculos} />
      <AlertasBandeja alertas={alertas} puedeAtender={puedeAtender} />
    </main>
  )
}
```

- [ ] **Step 5: Agregar el enlace "Flota" en `app/(app)/layout.tsx`**

Reemplazar el `<Link href="/dashboard" ...>` (el del logo) por un contenedor con el logo + una nav:
```tsx
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2" aria-label="TapCar — ir al inicio">
              <TapCarIsotipo className="size-8" />
              <TapCarWordmark className="hidden text-xl sm:inline" />
            </Link>
            <nav className="flex items-center gap-3 text-sm font-medium">
              <Link href="/flota" className="text-acero transition-colors hover:text-tinta">Flota</Link>
            </nav>
          </div>
```
(El `<UserMenu ... />` queda igual, a la derecha.)

- [ ] **Step 6: Verificar typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; `/flota` aparece como ruta dinámica.

- [ ] **Step 7: Verificación manual (opcional, dev server)**

`npm run dev`: entra a `/flota`. La grilla muestra los vehículos (Disponible / En uso por X); si hay alertas, aparecen las banderas y la bandeja de Pendientes; como Editor/Admin, "Atender" borra la alerta y refresca; como Visor, no aparece el botón.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/flota/" components/flota/ "app/(app)/layout.tsx"
git commit -m "feat(flota): página /flota (grilla + bandeja de pendientes) + enlace en la barra"
```

---

## Cierre

- [ ] **Suite completa + build final**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: todo verde (salvo `rules.test.ts`, que requiere emulador y falla en local).

- [ ] **Recordatorio al usuario (cutover):**
  - Desplegar reglas: `node --env-file=.env.local scripts/deploy-firestore-rules.mjs` (bloquea `alertas`).
  - `usoActual` se rellena a partir de los próximos "tomar"/"entregar"; los vehículos que ya estaban en uso antes del deploy aparecerán como "Disponible" hasta su próximo ciclo (comportamiento aceptable).
