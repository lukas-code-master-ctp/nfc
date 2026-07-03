# Bitácora de uso de flota (SP1 padrón + SP2 bitácora con fotos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar quién usa cada vehículo (custodia) vía el chip NFC: padrón de conductores con PIN, y en la ficha pública "Tomar"/"Entregar" con fotos, más una vista de bitácora para los gestores.

**Architecture:** Dos colecciones nuevas server-only (`drivers`, `usages`). El conductor actúa en la ficha pública (`/v/<token>`, sin login), autenticado por PIN del padrón; los endpoints públicos resuelven vehículo/empresa por token y validan PIN antes de cualquier efecto. Los gestores administran el padrón en Configuración (solo Admin) y leen la bitácora en la página del vehículo (todos los roles).

**Tech Stack:** Next.js 16 (App Router, TS estricto), Firebase Admin SDK (Firestore + Cloud Storage), `node:crypto` (hash de PIN), Resend (aviso best-effort), Vitest, Tailwind v4.

## Global Constraints

- Idioma: **español neutro (Chile)**, "tú" (no "vos"). Todo el código/UI/comentarios en español.
- **Next 16:** en route handlers dinámicos `params` es `Promise` → tipar y `await params`.
- Enforcement server-side: los `/api/conductores*` exigen `getMembership()` + `can(role, 'driver:manage')`. Los públicos (`/api/v/[token]/*`) resuelven el vehículo por token y **validan el PIN** antes de cualquier efecto; **nunca** confían en `companyId`/`role` del cliente.
- **PIN**: 4 dígitos, guardado **hasheado** (`node:crypto` scrypt), nunca vuelve en respuestas (ni el hash).
- **Anti-fuerza-bruta**: 5 intentos fallidos → bloqueo 15 min; un PIN correcto resetea el contador.
- **Invariante**: a lo más **un `usage` `abierto`** por `vehicleId`.
- Firestore: **queries de un solo campo** + filtrar en memoria (sin índices compuestos).
- Storage: subidas vía signed URL (patrón existente en `lib/storage/signedUrls.ts`).
- `bencina/km/limpieza` en `usages` quedan **reservados vacíos** (los llena SP3).
- Tras cambios: `npx tsc --noEmit` y `npm run build` deben pasar antes de commitear.
- Vitest 4: mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(...)`.

---

## Estructura de archivos

**Crear:**
- `lib/drivers/pin.ts` (+ `__tests__/pin.test.ts`) — puro: formato/hash/verify de PIN + lógica de bloqueo.
- `lib/data/drivers.ts` (+ `__tests__/drivers.test.ts`) — padrón + verificación de PIN.
- `lib/data/usages.ts` (+ `__tests__/usages.test.ts`) — abrir/cerrar/listar usos.
- `lib/email/usageAlertEmail.ts` (+ `__tests__/usageAlertEmail.test.ts`) — copy del aviso.
- `app/api/conductores/route.ts` (GET/POST) + `app/api/conductores/[id]/route.ts` (PATCH/DELETE) (+ `__tests__/route.test.ts`).
- `app/api/v/[token]/tomar/route.ts`, `.../upload-url/route.ts`, `.../entregar/route.ts` (+ `__tests__/route.test.ts`).
- `components/drivers/DriversCard.tsx` — CRUD del padrón en Configuración.
- `components/vehicle/BitacoraUso.tsx` — historial en la página del vehículo.
- `components/uso/UsoPanel.tsx` — flujo Tomar/Entregar en la ficha pública.

**Modificar:**
- `lib/types.ts` — `Driver`, `VehicleUsage`.
- `lib/auth/roles.ts` (+ su test) — `Action` `driver:manage`.
- `lib/email/resend.ts` — `sendUsageAlertEmail`.
- `lib/storage/signedUrls.ts` — `createUsagePhotoUrl`.
- `app/(app)/configuracion/page.tsx` — montar `DriversCard` (solo Admin).
- `app/(app)/vehiculos/[id]/page.tsx` — sección `BitacoraUso` (server render).
- `app/v/[token]/page.tsx` — cargar uso abierto + conductores y pasarlos a la ficha.
- `components/PublicVehicleView.tsx` — banner de estado + `UsoPanel`.
- `firestore.rules` — bloquear `drivers` y `usages` al cliente.

---

## Task 1: Tipos, permiso `driver:manage` y lógica pura de PIN

**Files:**
- Modify: `lib/types.ts`, `lib/auth/roles.ts`, `lib/auth/__tests__/roles.test.ts`
- Create: `lib/drivers/pin.ts`, `lib/drivers/__tests__/pin.test.ts`

**Interfaces:**
- Produces (types en `lib/types.ts`):
  - `interface Driver { id; companyId; nombre; rut?; pinHash; activo: boolean; createdAt; createdByUid?; intentosFallidos?: number; bloqueadoHasta?: string | null }`
  - `interface VehicleUsage { id; companyId; vehicleId; driverId; driverNombre; tomadoEn: string; entregadoEn: string | null; estado: 'abierto'|'cerrado'; cierreForzado?: boolean; entregadoPorDriverId?: string; entregadoPorNombre?: string; fotos?: { tablero?: string; cabina?: string }; dano?: { hay: boolean; nota?: string; fotoPath?: string }; bencina?: string; km?: number; limpieza?: string; createdAt: string }`
- Produces (`lib/auth/roles.ts`): `Action` gana `'driver:manage'`; solo `admin` lo tiene.
- Produces (`lib/drivers/pin.ts`):
  - `isValidPinFormat(pin: string): boolean`
  - `hashPin(pin: string): string`
  - `verifyPin(pin: string, stored: string): boolean`
  - `MAX_INTENTOS = 5`, `BLOQUEO_MS = 900000`
  - `estaBloqueado(bloqueadoHasta: string | null | undefined, nowMs: number): boolean`
  - `trasIntentoFallido(intentosFallidos: number, nowMs: number): { intentosFallidos: number; bloqueadoHasta: string | null }`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/drivers/__tests__/pin.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  isValidPinFormat, hashPin, verifyPin, estaBloqueado, trasIntentoFallido, MAX_INTENTOS,
} from '@/lib/drivers/pin'

describe('isValidPinFormat', () => {
  it('acepta exactamente 4 dígitos', () => {
    expect(isValidPinFormat('1234')).toBe(true)
    expect(isValidPinFormat('12a4')).toBe(false)
    expect(isValidPinFormat('123')).toBe(false)
    expect(isValidPinFormat('12345')).toBe(false)
  })
})

describe('hashPin / verifyPin', () => {
  it('el hash no es el PIN y verify distingue', () => {
    const h = hashPin('1234')
    expect(h).not.toContain('1234')
    expect(verifyPin('1234', h)).toBe(true)
    expect(verifyPin('0000', h)).toBe(false)
  })
  it('verify tolera un hash malformado', () => {
    expect(verifyPin('1234', 'basura')).toBe(false)
  })
})

describe('estaBloqueado', () => {
  it('false si no hay bloqueo o ya pasó', () => {
    expect(estaBloqueado(null, 1000)).toBe(false)
    expect(estaBloqueado(new Date(500).toISOString(), 1000)).toBe(false)
  })
  it('true si el bloqueo es futuro', () => {
    expect(estaBloqueado(new Date(2000).toISOString(), 1000)).toBe(true)
  })
})

describe('trasIntentoFallido', () => {
  it('suma intentos y bloquea al llegar al máximo', () => {
    expect(trasIntentoFallido(0, 1000).bloqueadoHasta).toBeNull()
    const r = trasIntentoFallido(MAX_INTENTOS - 1, 1000)
    expect(r.intentosFallidos).toBe(MAX_INTENTOS)
    expect(r.bloqueadoHasta).not.toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/drivers/__tests__/pin.test.ts`
Expected: FAIL ("Cannot find module '@/lib/drivers/pin'").

- [ ] **Step 3: Agregar los tipos en `lib/types.ts`**

Al final de `lib/types.ts`:
```ts
export interface Driver {
  id: string
  companyId: string
  nombre: string
  rut?: string
  pinHash: string // hash del PIN de 4 dígitos; nunca se devuelve al cliente
  activo: boolean
  createdAt: string // ISO
  createdByUid?: string
  intentosFallidos?: number
  bloqueadoHasta?: string | null
}

export interface VehicleUsage {
  id: string
  companyId: string
  vehicleId: string
  driverId: string
  driverNombre: string // denormalizado (el padrón puede cambiar)
  tomadoEn: string // ISO
  entregadoEn: string | null
  estado: 'abierto' | 'cerrado'
  cierreForzado?: boolean
  entregadoPorDriverId?: string
  entregadoPorNombre?: string
  fotos?: { tablero?: string; cabina?: string }
  dano?: { hay: boolean; nota?: string; fotoPath?: string }
  // Reservados para SP3 (IA) — vacíos en SP2:
  bencina?: string
  km?: number
  limpieza?: string
  createdAt: string // ISO
}
```

- [ ] **Step 4: Agregar el permiso en `lib/auth/roles.ts`**

Agregar `'driver:manage'` al tipo `Action` y al set de `admin`:
```ts
export type Action = 'read' | 'document:write' | 'vehicle:write' | 'billing:manage' | 'team:manage' | 'driver:manage'
```
En el `MATRIX`, agregar `'driver:manage'` al `Set` de `admin` (junto a los demás que ya tiene admin).

- [ ] **Step 5: Agregar la aserción en `lib/auth/__tests__/roles.test.ts`**

Agregar dentro del describe existente:
```ts
it('driver:manage solo lo tiene el admin', () => {
  expect(can('admin', 'driver:manage')).toBe(true)
  expect(can('editor', 'driver:manage')).toBe(false)
  expect(can('viewer', 'driver:manage')).toBe(false)
})
```

- [ ] **Step 6: Implementar `lib/drivers/pin.ts`**

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const MAX_INTENTOS = 5
export const BLOQUEO_MS = 15 * 60 * 1000

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = (stored ?? '').split(':')
  if (!salt || !hash) return false
  const computed = scryptSync(pin, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return computed.length === expected.length && timingSafeEqual(computed, expected)
}

export function estaBloqueado(bloqueadoHasta: string | null | undefined, nowMs: number): boolean {
  if (!bloqueadoHasta) return false
  return new Date(bloqueadoHasta).getTime() > nowMs
}

export function trasIntentoFallido(
  intentosFallidos: number,
  nowMs: number,
): { intentosFallidos: number; bloqueadoHasta: string | null } {
  const next = intentosFallidos + 1
  if (next >= MAX_INTENTOS) {
    return { intentosFallidos: next, bloqueadoHasta: new Date(nowMs + BLOQUEO_MS).toISOString() }
  }
  return { intentosFallidos: next, bloqueadoHasta: null }
}
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/drivers/__tests__/pin.test.ts lib/auth/__tests__/roles.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/types.ts lib/auth/roles.ts lib/auth/__tests__/roles.test.ts lib/drivers/
git commit -m "feat(bitacora): tipos Driver/VehicleUsage, permiso driver:manage y lógica de PIN"
```

---

## Task 2: Capa de datos del padrón (`lib/data/drivers.ts`)

**Files:**
- Create: `lib/data/drivers.ts`, `lib/data/__tests__/drivers.test.ts`

**Interfaces:**
- Consumes: `adminDb` de `@/lib/firebase/admin`; `hashPin`, `verifyPin`, `estaBloqueado`, `trasIntentoFallido` de `@/lib/drivers/pin`; `Driver` de `@/lib/types`.
- Produces:
  - `createDriver(companyId, createdByUid, input: { nombre: string; rut?: string; pin: string }): Promise<{ id: string }>`
  - `listDrivers(companyId): Promise<Driver[]>`
  - `listActiveDrivers(companyId): Promise<{ id: string; nombre: string }[]>`
  - `getDriver(driverId): Promise<Driver | null>`
  - `updateDriver(companyId, driverId, patch: { nombre?: string; rut?: string; activo?: boolean }): Promise<void>` (throw `'forbidden'` si no pertenece)
  - `resetDriverPin(companyId, driverId, pin: string): Promise<void>` (throw `'forbidden'` si no pertenece; resetea intentos/bloqueo)
  - `deleteDriver(companyId, driverId): Promise<void>` (throw `'forbidden'` si no pertenece)
  - `verifyDriverPin(companyId, driverId, pin): Promise<'ok' | 'bad_pin' | 'locked'>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/data/__tests__/drivers.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const whereGet = vi.fn()
const docGet = vi.fn()
const docUpdate = vi.fn()
const add = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({ get: whereGet }),
      doc: () => ({ get: docGet, update: docUpdate }),
      add,
    }),
  },
}))

import { listActiveDrivers, verifyDriverPin, createDriver } from '@/lib/data/drivers'
import { hashPin } from '@/lib/drivers/pin'

beforeEach(() => {
  whereGet.mockReset(); docGet.mockReset(); docUpdate.mockReset(); add.mockReset()
})

describe('createDriver', () => {
  it('hashea el PIN (no lo guarda plano)', async () => {
    add.mockResolvedValue({ id: 'd1' })
    await createDriver('c1', 'u1', { nombre: 'Ana', pin: '1234' })
    const saved = add.mock.calls[0][0]
    expect(saved.pinHash).not.toContain('1234')
    expect(saved.companyId).toBe('c1')
    expect(saved.activo).toBe(true)
  })
})

describe('listActiveDrivers', () => {
  it('filtra inactivos y devuelve solo id + nombre', async () => {
    whereGet.mockResolvedValue({
      docs: [
        { id: 'd1', data: () => ({ nombre: 'Ana', activo: true, pinHash: 'x' }) },
        { id: 'd2', data: () => ({ nombre: 'Beto', activo: false, pinHash: 'y' }) },
      ],
    })
    expect(await listActiveDrivers('c1')).toEqual([{ id: 'd1', nombre: 'Ana' }])
  })
})

describe('verifyDriverPin', () => {
  it('ok con PIN correcto y resetea intentos', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', activo: true, pinHash: hashPin('1234'), intentosFallidos: 2 }) })
    expect(await verifyDriverPin('c1', 'd1', '1234')).toBe('ok')
    expect(docUpdate).toHaveBeenCalledWith({ intentosFallidos: 0, bloqueadoHasta: null })
  })
  it('bad_pin con PIN incorrecto y suma intento', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', activo: true, pinHash: hashPin('1234'), intentosFallidos: 0 }) })
    expect(await verifyDriverPin('c1', 'd1', '9999')).toBe('bad_pin')
    expect(docUpdate).toHaveBeenCalled()
  })
  it('bad_pin si el conductor es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra', activo: true, pinHash: hashPin('1234') }) })
    expect(await verifyDriverPin('c1', 'd1', '1234')).toBe('bad_pin')
  })
  it('locked si está bloqueado', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', activo: true, pinHash: hashPin('1234'), bloqueadoHasta: new Date(Date.now() + 60000).toISOString() }) })
    expect(await verifyDriverPin('c1', 'd1', '1234')).toBe('locked')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/drivers.test.ts`
Expected: FAIL ("Cannot find module '@/lib/data/drivers'").

- [ ] **Step 3: Implementar `lib/data/drivers.ts`**

```ts
import { adminDb } from '@/lib/firebase/admin'
import { hashPin, verifyPin, estaBloqueado, trasIntentoFallido } from '@/lib/drivers/pin'
import type { Driver } from '@/lib/types'

const COL = 'drivers'

function toDriver(id: string, d: FirebaseFirestore.DocumentData): Driver {
  return {
    id,
    companyId: d.companyId,
    nombre: d.nombre,
    rut: d.rut ?? undefined,
    pinHash: d.pinHash,
    activo: d.activo !== false,
    createdAt: d.createdAt,
    createdByUid: d.createdByUid ?? undefined,
    intentosFallidos: d.intentosFallidos ?? 0,
    bloqueadoHasta: d.bloqueadoHasta ?? null,
  }
}

export async function createDriver(
  companyId: string,
  createdByUid: string,
  input: { nombre: string; rut?: string; pin: string },
): Promise<{ id: string }> {
  const data = {
    companyId,
    nombre: input.nombre.trim(),
    rut: input.rut?.trim() || null,
    pinHash: hashPin(input.pin),
    activo: true,
    intentosFallidos: 0,
    bloqueadoHasta: null,
    createdByUid,
    createdAt: new Date().toISOString(),
  }
  const ref = await adminDb.collection(COL).add(data)
  return { id: ref.id }
}

export async function listDrivers(companyId: string): Promise<Driver[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.docs.map((d) => toDriver(d.id, d.data())).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export async function listActiveDrivers(companyId: string): Promise<{ id: string; nombre: string }[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => (d as { activo?: boolean }).activo !== false)
    .map((d) => ({ id: d.id, nombre: (d as { nombre: string }).nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export async function getDriver(driverId: string): Promise<Driver | null> {
  const doc = await adminDb.collection(COL).doc(driverId).get()
  return doc.exists ? toDriver(doc.id, doc.data()!) : null
}

async function assertCompany(driverId: string, companyId: string) {
  const ref = adminDb.collection(COL).doc(driverId)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  return ref
}

export async function updateDriver(
  companyId: string,
  driverId: string,
  patch: { nombre?: string; rut?: string; activo?: boolean },
): Promise<void> {
  const ref = await assertCompany(driverId, companyId)
  const data: Record<string, unknown> = {}
  if (patch.nombre !== undefined) data.nombre = patch.nombre.trim()
  if (patch.rut !== undefined) data.rut = patch.rut.trim() || null
  if (patch.activo !== undefined) data.activo = patch.activo
  await ref.update(data)
}

export async function resetDriverPin(companyId: string, driverId: string, pin: string): Promise<void> {
  const ref = await assertCompany(driverId, companyId)
  await ref.update({ pinHash: hashPin(pin), intentosFallidos: 0, bloqueadoHasta: null })
}

export async function deleteDriver(companyId: string, driverId: string): Promise<void> {
  const ref = await assertCompany(driverId, companyId)
  await ref.delete()
}

export async function verifyDriverPin(
  companyId: string,
  driverId: string,
  pin: string,
): Promise<'ok' | 'bad_pin' | 'locked'> {
  const ref = adminDb.collection(COL).doc(driverId)
  const doc = await ref.get()
  if (!doc.exists) return 'bad_pin'
  const d = doc.data()!
  if (d.companyId !== companyId || d.activo === false) return 'bad_pin'
  const now = Date.now()
  if (estaBloqueado(d.bloqueadoHasta, now)) return 'locked'
  if (verifyPin(pin, d.pinHash)) {
    if (d.intentosFallidos) await ref.update({ intentosFallidos: 0, bloqueadoHasta: null })
    return 'ok'
  }
  const next = trasIntentoFallido(d.intentosFallidos ?? 0, now)
  await ref.update(next)
  return next.bloqueadoHasta ? 'locked' : 'bad_pin'
}
```

Nota: `assertCompany` usa `doc().delete()` en `deleteDriver`; el mock del test no ejercita `delete` (no hay test de delete aquí), pero el typecheck valida las firmas. En el mock, agrega `delete: vi.fn()` si el runtime lo requiere — no es el caso en estos tests.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/__tests__/drivers.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/data/drivers.ts lib/data/__tests__/drivers.test.ts
git commit -m "feat(bitacora): capa de datos del padrón de conductores"
```

---

## Task 3: Capa de datos de usos (`lib/data/usages.ts`)

**Files:**
- Create: `lib/data/usages.ts`, `lib/data/__tests__/usages.test.ts`

**Interfaces:**
- Consumes: `adminDb`; `VehicleUsage` de `@/lib/types`.
- Produces:
  - `getOpenUsage(vehicleId): Promise<VehicleUsage | null>`
  - `openUsage(companyId, vehicleId, driver: { id: string; nombre: string }): Promise<{ usage: VehicleUsage; forced: VehicleUsage | null }>`
  - `closeUsage(companyId, vehicleId, entregadoPor: { id: string; nombre: string }, fotos: { tablero: string; cabina: string }, dano?: { hay: boolean; nota?: string; fotoPath?: string }): Promise<void>` (throw `'no_open'` si no hay uso abierto)
  - `listUsages(vehicleId): Promise<VehicleUsage[]>` (desc por `tomadoEn`)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/data/__tests__/usages.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const whereGet = vi.fn()
const add = vi.fn()
const docUpdate = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({ get: whereGet }),
      add,
      doc: () => ({ update: docUpdate }),
    }),
  },
}))

import { openUsage, closeUsage, getOpenUsage, listUsages } from '@/lib/data/usages'

beforeEach(() => { whereGet.mockReset(); add.mockReset(); docUpdate.mockReset() })

describe('getOpenUsage', () => {
  it('devuelve el uso abierto (filtra cerrados en memoria)', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'cerrado', tomadoEn: '2026-01-01' }) },
      { id: 'u2', data: () => ({ vehicleId: 'v1', estado: 'abierto', tomadoEn: '2026-02-01' }) },
    ] })
    expect((await getOpenUsage('v1'))?.id).toBe('u2')
  })
})

describe('openUsage', () => {
  it('sin uso abierto: solo crea uno nuevo', async () => {
    whereGet.mockResolvedValue({ docs: [] })
    add.mockResolvedValue({ id: 'nuevo' })
    const r = await openUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' })
    expect(r.forced).toBeNull()
    expect(r.usage.id).toBe('nuevo')
    expect(add.mock.calls[0][0]).toMatchObject({ estado: 'abierto', driverId: 'd1', companyId: 'c1' })
  })
  it('con uso abierto: lo cierra como forzado y crea el nuevo', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'viejo', data: () => ({ vehicleId: 'v1', estado: 'abierto', tomadoEn: '2026-01-01', companyId: 'c1' }) },
    ] })
    add.mockResolvedValue({ id: 'nuevo' })
    const r = await openUsage('c1', 'v1', { id: 'd2', nombre: 'Beto' })
    expect(r.forced?.id).toBe('viejo')
    expect(docUpdate).toHaveBeenCalledWith({ estado: 'cerrado', cierreForzado: true })
  })
})

describe('closeUsage', () => {
  it('lanza no_open si no hay uso abierto', async () => {
    whereGet.mockResolvedValue({ docs: [] })
    await expect(
      closeUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' }),
    ).rejects.toThrow('no_open')
  })
  it('cierra el uso abierto con fotos', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'abierto', companyId: 'c1', tomadoEn: '2026-01-01' }) },
    ] })
    await closeUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' })
    expect(docUpdate).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'cerrado', entregadoPorDriverId: 'd1', fotos: { tablero: 'a', cabina: 'b' },
    }))
  })
})

describe('listUsages', () => {
  it('ordena desc por tomadoEn', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a', data: () => ({ tomadoEn: '2026-01-01' }) },
      { id: 'b', data: () => ({ tomadoEn: '2026-03-01' }) },
    ] })
    expect((await listUsages('v1')).map((u) => u.id)).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/usages.test.ts`
Expected: FAIL ("Cannot find module '@/lib/data/usages'").

- [ ] **Step 3: Implementar `lib/data/usages.ts`**

```ts
import { adminDb } from '@/lib/firebase/admin'
import type { VehicleUsage } from '@/lib/types'

const COL = 'usages'

function toUsage(id: string, d: FirebaseFirestore.DocumentData): VehicleUsage {
  return {
    id,
    companyId: d.companyId,
    vehicleId: d.vehicleId,
    driverId: d.driverId,
    driverNombre: d.driverNombre,
    tomadoEn: d.tomadoEn,
    entregadoEn: d.entregadoEn ?? null,
    estado: d.estado,
    cierreForzado: d.cierreForzado ?? undefined,
    entregadoPorDriverId: d.entregadoPorDriverId ?? undefined,
    entregadoPorNombre: d.entregadoPorNombre ?? undefined,
    fotos: d.fotos ?? undefined,
    dano: d.dano ?? undefined,
    bencina: d.bencina ?? undefined,
    km: d.km ?? undefined,
    limpieza: d.limpieza ?? undefined,
    createdAt: d.createdAt,
  }
}

export async function listUsages(vehicleId: string): Promise<VehicleUsage[]> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  return snap.docs
    .map((d) => toUsage(d.id, d.data()))
    .sort((a, b) => (a.tomadoEn < b.tomadoEn ? 1 : -1))
}

export async function getOpenUsage(vehicleId: string): Promise<VehicleUsage | null> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  const abierto = snap.docs.map((d) => toUsage(d.id, d.data())).find((u) => u.estado === 'abierto')
  return abierto ?? null
}

export async function openUsage(
  companyId: string,
  vehicleId: string,
  driver: { id: string; nombre: string },
): Promise<{ usage: VehicleUsage; forced: VehicleUsage | null }> {
  const existing = await getOpenUsage(vehicleId)
  let forced: VehicleUsage | null = null
  if (existing) {
    await adminDb.collection(COL).doc(existing.id).update({ estado: 'cerrado', cierreForzado: true })
    forced = { ...existing, estado: 'cerrado', cierreForzado: true }
  }
  const now = new Date().toISOString()
  const data = {
    companyId,
    vehicleId,
    driverId: driver.id,
    driverNombre: driver.nombre,
    tomadoEn: now,
    entregadoEn: null,
    estado: 'abierto' as const,
    createdAt: now,
  }
  const ref = await adminDb.collection(COL).add(data)
  return { usage: { id: ref.id, ...data }, forced }
}

export async function closeUsage(
  companyId: string,
  vehicleId: string,
  entregadoPor: { id: string; nombre: string },
  fotos: { tablero: string; cabina: string },
  dano?: { hay: boolean; nota?: string; fotoPath?: string },
): Promise<void> {
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
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/__tests__/usages.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/data/usages.ts lib/data/__tests__/usages.test.ts
git commit -m "feat(bitacora): capa de datos de usos (abrir/cerrar/listar)"
```

---

## Task 4: Aviso por email de "sin entrega formal" (puro + sender)

**Files:**
- Create: `lib/email/usageAlertEmail.ts`, `lib/email/__tests__/usageAlertEmail.test.ts`
- Modify: `lib/email/resend.ts`

**Interfaces:**
- Produces:
  - `usageAlertSubject(patente: string): string`
  - `usageAlertHtml(p: { patente: string; driverNombre: string; tomadoEn: string }): string`
  - `sendUsageAlertEmail(to: string, p: { patente: string; driverNombre: string; tomadoEn: string }): Promise<void>` (en `resend.ts`)

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/email/__tests__/usageAlertEmail.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { usageAlertSubject, usageAlertHtml } from '@/lib/email/usageAlertEmail'

describe('usageAlertSubject', () => {
  it('incluye la patente', () => {
    expect(usageAlertSubject('ABCD12')).toContain('ABCD12')
  })
})

describe('usageAlertHtml', () => {
  it('incluye conductor y patente', () => {
    const html = usageAlertHtml({ patente: 'ABCD12', driverNombre: 'Ana', tomadoEn: '2026-07-03T10:00:00.000Z' })
    expect(html).toContain('ABCD12')
    expect(html).toContain('Ana')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/email/__tests__/usageAlertEmail.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implementar `lib/email/usageAlertEmail.ts`**

```ts
export function usageAlertSubject(patente: string): string {
  return `TapCar · Uso sin entrega formal — ${patente}`
}

export function usageAlertHtml(p: { patente: string; driverNombre: string; tomadoEn: string }): string {
  const fecha = new Date(p.tomadoEn).toLocaleString('es-CL', { timeZone: 'America/Santiago' })
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Uso sin entrega formal</h2>
      <p>El vehículo <strong>${p.patente}</strong> se volvió a tomar sin que el uso anterior se cerrara con la entrega.</p>
      <p>Uso anterior: <strong>${p.driverNombre}</strong>, tomado el ${fecha}.</p>
      <p>Revisa la bitácora del vehículo en TapCar para hacer el seguimiento.</p>
    </div>
  `
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/email/__tests__/usageAlertEmail.test.ts`
Expected: PASS.

- [ ] **Step 5: Agregar `sendUsageAlertEmail` en `lib/email/resend.ts`**

Agregar el import junto a los existentes:
```ts
import { usageAlertSubject, usageAlertHtml } from '@/lib/email/usageAlertEmail'
```
Agregar al final del archivo:
```ts
export async function sendUsageAlertEmail(
  to: string,
  p: { patente: string; driverNombre: string; tomadoEn: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: usageAlertSubject(p.patente),
    html: usageAlertHtml(p),
  })
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/email/
git commit -m "feat(bitacora): aviso por email de uso sin entrega formal"
```

---

## Task 5: API del padrón (`/api/conductores`)

**Files:**
- Create: `app/api/conductores/route.ts`, `app/api/conductores/[id]/route.ts`, `app/api/conductores/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getMembership`, `can`; `createDriver`, `listDrivers`, `updateDriver`, `resetDriverPin`, `deleteDriver`; `isValidPinFormat`.
- Produces (HTTP):
  - `GET /api/conductores` → `200 { drivers: [{ id, nombre, rut, activo, createdAt }] }` (sin `pinHash`) | `401` | `403`.
  - `POST /api/conductores` `{ nombre, rut?, pin }` → `200 { id }` | `400` nombre/pin inválido | `401` | `403`.
  - `PATCH /api/conductores/[id]` `{ nombre?, rut?, activo?, pin? }` → `200 { ok }` | `400` pin inválido | `401` | `403`.
  - `DELETE /api/conductores/[id]` → `200 { ok }` | `401` | `403`.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/conductores/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))

const createDriver = vi.fn()
const listDrivers = vi.fn()
vi.mock('@/lib/data/drivers', () => ({
  createDriver: (...a: unknown[]) => createDriver(...a),
  listDrivers: (...a: unknown[]) => listDrivers(...a),
}))

import { GET, POST } from '@/app/api/conductores/route'

const admin = { uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' }
function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  getMembership.mockReset(); createDriver.mockReset(); listDrivers.mockReset()
})

describe('GET /api/conductores', () => {
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ ...admin, role: 'editor' })
    expect((await GET()).status).toBe(403)
  })
  it('200 sin exponer pinHash', async () => {
    getMembership.mockResolvedValue(admin)
    listDrivers.mockResolvedValue([{ id: 'd1', nombre: 'Ana', rut: null, activo: true, createdAt: 'x', pinHash: 'SECRET' }])
    const res = await GET()
    const json = await res.json()
    expect(JSON.stringify(json)).not.toContain('SECRET')
    expect(json.drivers[0].nombre).toBe('Ana')
  })
})

describe('POST /api/conductores', () => {
  it('400 con PIN inválido', async () => {
    getMembership.mockResolvedValue(admin)
    expect((await POST(req({ nombre: 'Ana', pin: '12' }))).status).toBe(400)
  })
  it('200 crea con PIN válido', async () => {
    getMembership.mockResolvedValue(admin)
    createDriver.mockResolvedValue({ id: 'd1' })
    const res = await POST(req({ nombre: 'Ana', pin: '1234' }))
    expect(res.status).toBe(200)
    expect(createDriver).toHaveBeenCalledWith('c1', 'u1', { nombre: 'Ana', rut: undefined, pin: '1234' })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run app/api/conductores/__tests__/route.test.ts`
Expected: FAIL ("Cannot find module '.../route'").

- [ ] **Step 3: Implementar `app/api/conductores/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { createDriver, listDrivers } from '@/lib/data/drivers'
import { isValidPinFormat } from '@/lib/drivers/pin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const drivers = await listDrivers(m.companyId)
  return NextResponse.json({
    drivers: drivers.map((d) => ({ id: d.id, nombre: d.nombre, rut: d.rut ?? null, activo: d.activo, createdAt: d.createdAt })),
  })
}

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const nombre = String(body?.nombre ?? '').trim()
  const rut = body?.rut ? String(body.rut).trim() : undefined
  const pin = String(body?.pin ?? '')
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 })
  if (!isValidPinFormat(pin)) return NextResponse.json({ error: 'El PIN debe ser de 4 dígitos.' }, { status: 400 })
  const { id } = await createDriver(m.companyId, m.uid, { nombre, rut, pin })
  return NextResponse.json({ id })
}
```

- [ ] **Step 4: Implementar `app/api/conductores/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { updateDriver, resetDriverPin, deleteDriver } from '@/lib/data/drivers'
import { isValidPinFormat } from '@/lib/drivers/pin'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  try {
    if (typeof body?.pin === 'string' && body.pin.length > 0) {
      if (!isValidPinFormat(body.pin)) return NextResponse.json({ error: 'El PIN debe ser de 4 dígitos.' }, { status: 400 })
      await resetDriverPin(m.companyId, id, body.pin)
    }
    const patch: { nombre?: string; rut?: string; activo?: boolean } = {}
    if (typeof body?.nombre === 'string') patch.nombre = body.nombre
    if (typeof body?.rut === 'string') patch.rut = body.rut
    if (typeof body?.activo === 'boolean') patch.activo = body.activo
    if (Object.keys(patch).length > 0) await updateDriver(m.companyId, id, patch)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    await deleteDriver(m.companyId, id)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run app/api/conductores/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add app/api/conductores/
git commit -m "feat(bitacora): API del padrón de conductores (admin)"
```

---

## Task 6: Storage helper + endpoint público `tomar`

**Files:**
- Modify: `lib/storage/signedUrls.ts`
- Create: `app/api/v/[token]/tomar/route.ts`, `app/api/v/[token]/tomar/__tests__/route.test.ts`

**Interfaces:**
- Produces (`signedUrls.ts`): `createUsagePhotoUrl(vehicleId: string, tipo: string, contentType: string): Promise<{ uploadUrl: string; filePath: string }>`
- Consumes: `getVehicleByToken` de `@/lib/data/vehicles`; `verifyDriverPin`, `getDriver` de `@/lib/data/drivers`; `openUsage` de `@/lib/data/usages`; `getCompany` de `@/lib/data/companies`; `sendUsageAlertEmail`; `adminAuth`.
- Produces (HTTP): `POST /api/v/[token]/tomar` `{ driverId, pin }` → `200 { ok }` | `401` PIN inválido | `429` bloqueado | `404` token inválido | `400` faltan datos.

- [ ] **Step 1: Agregar `createUsagePhotoUrl` en `lib/storage/signedUrls.ts`**

```ts
export async function createUsagePhotoUrl(
  vehicleId: string,
  tipo: string,
  contentType: string,
): Promise<{ uploadUrl: string; filePath: string }> {
  const safeTipo = tipo.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `vehicles/${vehicleId}/usages/${nanoid(10)}-${safeTipo}`
  const [uploadUrl] = await adminBucket.file(filePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
  })
  return { uploadUrl, filePath }
}
```
(`nanoid` y `adminBucket` ya están importados en el archivo.)

- [ ] **Step 2: Escribir el test que falla**

Crear `app/api/v/[token]/tomar/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getVehicleByToken = vi.fn()
vi.mock('@/lib/data/vehicles', () => ({ getVehicleByToken: (...a: unknown[]) => getVehicleByToken(...a) }))
const verifyDriverPin = vi.fn()
const getDriver = vi.fn()
vi.mock('@/lib/data/drivers', () => ({
  verifyDriverPin: (...a: unknown[]) => verifyDriverPin(...a),
  getDriver: (...a: unknown[]) => getDriver(...a),
}))
const openUsage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ openUsage: (...a: unknown[]) => openUsage(...a) }))
vi.mock('@/lib/data/companies', () => ({ getCompany: () => Promise.resolve({ ownerUid: 'o1' }) }))
vi.mock('@/lib/email/resend', () => ({ sendUsageAlertEmail: vi.fn() }))
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { getUser: () => Promise.resolve({ email: 'o@b.cl' }) } }))

import { POST } from '@/app/api/v/[token]/tomar/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(token: string) { return { params: Promise.resolve({ token }) } }

beforeEach(() => {
  getVehicleByToken.mockReset(); verifyDriverPin.mockReset(); getDriver.mockReset(); openUsage.mockReset()
  getVehicleByToken.mockResolvedValue({ id: 'v1', companyId: 'c1', patente: 'ABCD12' })
  getDriver.mockResolvedValue({ id: 'd1', nombre: 'Ana', companyId: 'c1' })
  openUsage.mockResolvedValue({ usage: { id: 'u1' }, forced: null })
})

describe('POST tomar', () => {
  it('404 token inválido', async () => {
    getVehicleByToken.mockResolvedValue(null)
    expect((await POST(req({ driverId: 'd1', pin: '1234' }), ctx('x'))).status).toBe(404)
  })
  it('401 PIN inválido', async () => {
    verifyDriverPin.mockResolvedValue('bad_pin')
    expect((await POST(req({ driverId: 'd1', pin: '9999' }), ctx('t'))).status).toBe(401)
  })
  it('429 bloqueado', async () => {
    verifyDriverPin.mockResolvedValue('locked')
    expect((await POST(req({ driverId: 'd1', pin: '1234' }), ctx('t'))).status).toBe(429)
  })
  it('200 abre el uso', async () => {
    verifyDriverPin.mockResolvedValue('ok')
    const res = await POST(req({ driverId: 'd1', pin: '1234' }), ctx('t'))
    expect(res.status).toBe(200)
    expect(openUsage).toHaveBeenCalledWith('c1', 'v1', { id: 'd1', nombre: 'Ana' })
  })
})
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npx vitest run "app/api/v/[token]/tomar/__tests__/route.test.ts"`
Expected: FAIL ("Cannot find module '.../route'").

- [ ] **Step 4: Implementar `app/api/v/[token]/tomar/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { verifyDriverPin, getDriver } from '@/lib/data/drivers'
import { openUsage } from '@/lib/data/usages'
import { getCompany } from '@/lib/data/companies'
import { adminAuth } from '@/lib/firebase/admin'
import { sendUsageAlertEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const vehicle = await getVehicleByToken(token)
  if (!vehicle) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const driverId = String(body?.driverId ?? '')
  const pin = String(body?.pin ?? '')
  if (!driverId || !pin) return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 })

  const estado = await verifyDriverPin(vehicle.companyId, driverId, pin)
  if (estado === 'locked') return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 })
  if (estado !== 'ok') return NextResponse.json({ error: 'PIN incorrecto.' }, { status: 401 })

  const driver = await getDriver(driverId)
  if (!driver) return NextResponse.json({ error: 'Conductor no encontrado.' }, { status: 404 })

  const { forced } = await openUsage(vehicle.companyId, vehicle.id, { id: driver.id, nombre: driver.nombre })

  // Aviso best-effort al dueño/admin si el uso anterior quedó sin entrega formal.
  if (forced) {
    try {
      const company = await getCompany(vehicle.companyId)
      const to = company ? (await adminAuth.getUser(company.ownerUid)).email : null
      if (to) {
        await sendUsageAlertEmail(to, {
          patente: vehicle.patente,
          driverNombre: forced.driverNombre,
          tomadoEn: forced.tomadoEn,
        })
      }
    } catch {
      /* best-effort: el uso ya se abrió */
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run "app/api/v/[token]/tomar/__tests__/route.test.ts"`
Expected: PASS.

- [ ] **Step 6: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add lib/storage/signedUrls.ts "app/api/v/[token]/tomar/"
git commit -m "feat(bitacora): endpoint público tomar (con aviso de sin-entrega)"
```

---

## Task 7: Endpoints públicos `upload-url` y `entregar`

**Files:**
- Create: `app/api/v/[token]/upload-url/route.ts`, `app/api/v/[token]/entregar/route.ts`, `app/api/v/[token]/entregar/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getVehicleByToken`; `verifyDriverPin`, `getDriver`; `closeUsage`; `createUsagePhotoUrl`.
- Produces (HTTP):
  - `POST /api/v/[token]/upload-url` `{ driverId, pin, tipo, contentType }` → `200 { uploadUrl, filePath }` | `401` | `429` | `404`.
  - `POST /api/v/[token]/entregar` `{ driverId, pin, fotos: { tablero, cabina }, dano? }` → `200 { ok }` | `400` faltan fotos | `401` | `429` | `409` sin uso abierto | `404`.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/v/[token]/entregar/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getVehicleByToken = vi.fn()
vi.mock('@/lib/data/vehicles', () => ({ getVehicleByToken: (...a: unknown[]) => getVehicleByToken(...a) }))
const verifyDriverPin = vi.fn()
const getDriver = vi.fn()
vi.mock('@/lib/data/drivers', () => ({
  verifyDriverPin: (...a: unknown[]) => verifyDriverPin(...a),
  getDriver: (...a: unknown[]) => getDriver(...a),
}))
const closeUsage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ closeUsage: (...a: unknown[]) => closeUsage(...a) }))

import { POST } from '@/app/api/v/[token]/entregar/route'
function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(token: string) { return { params: Promise.resolve({ token }) } }

beforeEach(() => {
  getVehicleByToken.mockReset(); verifyDriverPin.mockReset(); getDriver.mockReset(); closeUsage.mockReset()
  getVehicleByToken.mockResolvedValue({ id: 'v1', companyId: 'c1' })
  getDriver.mockResolvedValue({ id: 'd1', nombre: 'Ana', companyId: 'c1' })
  verifyDriverPin.mockResolvedValue('ok')
})

describe('POST entregar', () => {
  it('400 si faltan fotos', async () => {
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a' } }), ctx('t'))
    expect(res.status).toBe(400)
  })
  it('401 PIN inválido', async () => {
    verifyDriverPin.mockResolvedValue('bad_pin')
    const res = await POST(req({ driverId: 'd1', pin: '9', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(401)
  })
  it('409 si no hay uso abierto', async () => {
    closeUsage.mockRejectedValue(new Error('no_open'))
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(409)
  })
  it('200 cierra el uso con fotos', async () => {
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' }, dano: { hay: true, nota: 'rayón' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(closeUsage).toHaveBeenCalledWith('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' }, { hay: true, nota: 'rayón' })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run "app/api/v/[token]/entregar/__tests__/route.test.ts"`
Expected: FAIL ("Cannot find module '.../route'").

- [ ] **Step 3: Implementar `app/api/v/[token]/upload-url/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { verifyDriverPin } from '@/lib/data/drivers'
import { createUsagePhotoUrl } from '@/lib/storage/signedUrls'

export const dynamic = 'force-dynamic'

const TIPOS = ['tablero', 'cabina', 'dano']

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const vehicle = await getVehicleByToken(token)
  if (!vehicle) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const driverId = String(body?.driverId ?? '')
  const pin = String(body?.pin ?? '')
  const tipo = String(body?.tipo ?? '')
  const contentType = String(body?.contentType ?? 'image/jpeg')
  if (!TIPOS.includes(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })

  const estado = await verifyDriverPin(vehicle.companyId, driverId, pin)
  if (estado === 'locked') return NextResponse.json({ error: 'Demasiados intentos.' }, { status: 429 })
  if (estado !== 'ok') return NextResponse.json({ error: 'PIN incorrecto.' }, { status: 401 })

  const { uploadUrl, filePath } = await createUsagePhotoUrl(vehicle.id, tipo, contentType)
  return NextResponse.json({ uploadUrl, filePath })
}
```

- [ ] **Step 4: Implementar `app/api/v/[token]/entregar/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { verifyDriverPin, getDriver } from '@/lib/data/drivers'
import { closeUsage } from '@/lib/data/usages'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const vehicle = await getVehicleByToken(token)
  if (!vehicle) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const driverId = String(body?.driverId ?? '')
  const pin = String(body?.pin ?? '')
  const tablero = body?.fotos?.tablero
  const cabina = body?.fotos?.cabina
  if (typeof tablero !== 'string' || typeof cabina !== 'string' || !tablero || !cabina) {
    return NextResponse.json({ error: 'Faltan las fotos del tablero y la cabina.' }, { status: 400 })
  }

  const estado = await verifyDriverPin(vehicle.companyId, driverId, pin)
  if (estado === 'locked') return NextResponse.json({ error: 'Demasiados intentos.' }, { status: 429 })
  if (estado !== 'ok') return NextResponse.json({ error: 'PIN incorrecto.' }, { status: 401 })

  const driver = await getDriver(driverId)
  if (!driver) return NextResponse.json({ error: 'Conductor no encontrado.' }, { status: 404 })

  const dano = body?.dano?.hay
    ? { hay: true, nota: typeof body.dano.nota === 'string' ? body.dano.nota.slice(0, 500) : undefined, fotoPath: typeof body.dano.fotoPath === 'string' ? body.dano.fotoPath : undefined }
    : undefined

  try {
    await closeUsage(vehicle.companyId, vehicle.id, { id: driver.id, nombre: driver.nombre }, { tablero, cabina }, dano)
  } catch {
    return NextResponse.json({ error: 'Este vehículo no tiene un uso abierto.' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run "app/api/v/[token]/entregar/__tests__/route.test.ts"`
Expected: PASS.

- [ ] **Step 6: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add "app/api/v/[token]/upload-url/" "app/api/v/[token]/entregar/"
git commit -m "feat(bitacora): endpoints públicos upload-url y entregar"
```

---

## Task 8: Reglas Firestore — bloquear `drivers` y `usages`

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Agregar los match en `firestore.rules`**

Dentro de `match /databases/{database}/documents { ... }`, junto a los otros match, agregar:
```
    // Padrón y bitácora: solo server-side (Admin SDK). Cliente sin acceso.
    match /drivers/{id} {
      allow read, write: if false;
    }
    match /usages/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Verificar balance de llaves**

Run: `node -e "const s=require('fs').readFileSync('firestore.rules','utf8'); const o=(s.match(/{/g)||[]).length, c=(s.match(/}/g)||[]).length; if(o!==c) throw new Error('llaves '+o+'/'+c); console.log('OK', o)"`
Expected: `OK <n>`.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(bitacora): reglas Firestore bloquean drivers y usages al cliente"
```

Nota cutover: desplegar con `node --env-file=.env.local scripts/deploy-firestore-rules.mjs`.

---

## Task 9: UI — padrón de conductores en Configuración

**Files:**
- Create: `components/drivers/DriversCard.tsx`
- Modify: `app/(app)/configuracion/page.tsx`

**Interfaces:**
- Consumes (HTTP): `/api/conductores` (GET/POST), `/api/conductores/[id]` (PATCH/DELETE).
- `DriversCard` no recibe props (carga vía `GET /api/conductores`).

- [ ] **Step 1: Implementar `components/drivers/DriversCard.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'

interface Driver { id: string; nombre: string; rut: string | null; activo: boolean }

export default function DriversCard() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [rut, setRut] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch('/api/conductores')
    if (res.ok) setDrivers((await res.json()).drivers)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/conductores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, rut: rut || undefined, pin }),
    })
    setBusy(false)
    if (res.ok) { setNombre(''); setRut(''); setPin(''); load() }
    else setError((await res.json().catch(() => ({}))).error ?? 'No se pudo agregar.')
  }

  async function toggleActivo(d: Driver) {
    await fetch(`/api/conductores/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !d.activo }),
    })
    load()
  }
  async function resetPin(d: Driver) {
    const nuevo = prompt(`Nuevo PIN de 4 dígitos para ${d.nombre}:`)
    if (!nuevo) return
    const res = await fetch(`/api/conductores/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: nuevo }),
    })
    if (!res.ok) alert('PIN inválido (deben ser 4 dígitos).')
  }
  async function eliminar(d: Driver) {
    if (!confirm(`¿Eliminar a ${d.nombre} del padrón? Su historial de usos se conserva.`)) return
    await fetch(`/api/conductores/${d.id}`, { method: 'DELETE' })
    load()
  }

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Conductores</h2>
      <p className="mt-1 text-sm text-acero">Padrón de quienes usan la flota. Cada uno confirma con su PIN al tomar o entregar un vehículo.</p>

      {loading ? (
        <p className="mt-4 text-sm text-acero">Cargando…</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {drivers.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tinta">{d.nombre} {!d.activo && <span className="text-xs text-acero">(inactivo)</span>}</p>
                  {d.rut && <span className="text-xs text-acero">{d.rut}</span>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <button onClick={() => resetPin(d)} className="text-azul hover:underline">PIN</button>
                  <button onClick={() => toggleActivo(d)} className="text-acero hover:underline">{d.activo ? 'Desactivar' : 'Activar'}</button>
                  <button onClick={() => eliminar(d)} className="text-vencido hover:underline">Eliminar</button>
                </div>
              </li>
            ))}
            {drivers.length === 0 && <li className="text-sm text-acero">Aún no hay conductores.</li>}
          </ul>

          <form onSubmit={agregar} className="mt-4 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Nombre" className={inputCls} />
              <input value={rut} onChange={(e) => setRut(e.target.value)} placeholder="RUT (opcional)" className={inputCls} />
              <input value={pin} onChange={(e) => setPin(e.target.value)} required inputMode="numeric" maxLength={4} placeholder="PIN (4 dígitos)" className={inputCls} />
              <button type="submit" disabled={busy} className="shrink-0 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
                {busy ? 'Agregando…' : 'Agregar'}
              </button>
            </div>
            {error && <p className="text-sm text-vencido">{error}</p>}
          </form>
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Montar en `app/(app)/configuracion/page.tsx`**

Agregar el import:
```tsx
import DriversCard from '@/components/drivers/DriversCard'
```
Después de `{esAdmin && <TeamCard />}` (dentro del `<main>`), agregar:
```tsx
      {esAdmin && <DriversCard />}
```
(`esAdmin` ya está calculado como `can(m.role, 'billing:manage')`; el padrón es acción de Administrador, mismo grupo.)

- [ ] **Step 3: Verificar typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/drivers/ "app/(app)/configuracion/page.tsx"
git commit -m "feat(bitacora): padrón de conductores en Configuración (admin)"
```

---

## Task 10: UI — sección "Bitácora de uso" en la página del vehículo

**Files:**
- Create: `components/vehicle/BitacoraUso.tsx`
- Modify: `app/(app)/vehiculos/[id]/page.tsx`

**Interfaces:**
- Consumes: `listUsages` de `@/lib/data/usages`; `createReadUrl` de `@/lib/storage/signedUrls`.
- `BitacoraUso` recibe `usos: UsageRow[]` donde `UsageRow = { id; driverNombre; tomadoEn; entregadoEn; estado; cierreForzado?; entregadoPorNombre?; dano?; fotoTableroUrl: string|null; fotoCabinaUrl: string|null }`.

- [ ] **Step 1: Implementar `components/vehicle/BitacoraUso.tsx`**

```tsx
interface UsageRow {
  id: string
  driverNombre: string
  tomadoEn: string
  entregadoEn: string | null
  estado: 'abierto' | 'cerrado'
  cierreForzado?: boolean
  entregadoPorNombre?: string
  dano?: { hay: boolean; nota?: string }
  fotoTableroUrl: string | null
  fotoCabinaUrl: string | null
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

export default function BitacoraUso({ usos }: { usos: UsageRow[] }) {
  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Bitácora de uso</h2>
      <p className="mt-1 text-sm text-acero">Quién usó el vehículo y en qué estado lo dejó.</p>

      {usos.length === 0 ? (
        <p className="mt-4 text-sm text-acero">Aún no hay registros de uso.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {usos.map((u) => (
            <li key={u.id} className="rounded-xl border border-linea p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-tinta">{u.driverNombre}</p>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {u.estado === 'abierto' && <span className="rounded-full bg-azul/10 px-2 py-0.5 text-xs font-medium text-azul">En uso</span>}
                  {u.cierreForzado && <span className="rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">Sin entrega formal</span>}
                  {u.dano?.hay && <span className="rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Daño reportado</span>}
                </div>
              </div>
              <p className="mt-1 text-xs text-acero">
                Tomó: {fecha(u.tomadoEn)}
                {u.entregadoEn ? ` · Entregó: ${fecha(u.entregadoEn)}` : ''}
                {u.entregadoPorNombre && u.entregadoPorNombre !== u.driverNombre ? ` (por ${u.entregadoPorNombre})` : ''}
              </p>
              {u.dano?.nota && <p className="mt-1 text-xs text-[#C81E1E]">Daño: {u.dano.nota}</p>}
              {(u.fotoTableroUrl || u.fotoCabinaUrl) && (
                <div className="mt-3 flex gap-2">
                  {u.fotoTableroUrl && (
                    <a href={u.fotoTableroUrl} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u.fotoTableroUrl} alt="Tablero" loading="lazy" className="h-20 w-28 rounded-lg border border-linea object-cover" />
                    </a>
                  )}
                  {u.fotoCabinaUrl && (
                    <a href={u.fotoCabinaUrl} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u.fotoCabinaUrl} alt="Cabina" loading="lazy" className="h-20 w-28 rounded-lg border border-linea object-cover" />
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Cargar los usos en `app/(app)/vehiculos/[id]/page.tsx`**

Agregar imports:
```tsx
import { listUsages } from '@/lib/data/usages'
import BitacoraUso from '@/components/vehicle/BitacoraUso'
```
Después de calcular `items` (documentos), agregar la resolución de usos + sus read URLs:
```tsx
  const usos = await Promise.all(
    (await listUsages(vehicle.id)).map(async (u) => ({
      id: u.id,
      driverNombre: u.driverNombre,
      tomadoEn: u.tomadoEn,
      entregadoEn: u.entregadoEn,
      estado: u.estado,
      cierreForzado: u.cierreForzado,
      entregadoPorNombre: u.entregadoPorNombre,
      dano: u.dano ? { hay: u.dano.hay, nota: u.dano.nota } : undefined,
      fotoTableroUrl: u.fotos?.tablero ? await createReadUrl(u.fotos.tablero) : null,
      fotoCabinaUrl: u.fotos?.cabina ? await createReadUrl(u.fotos.cabina) : null,
    })),
  )
```
Y en el `return`, después de la sección "Sobre el vehículo" (el bloque `canManageVehicle ? VehicleInfoForm : VehicleInfoView`) y antes del `DeleteVehicleButton`, agregar:
```tsx
      <BitacoraUso usos={usos} />
```

- [ ] **Step 3: Verificar typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/vehicle/ "app/(app)/vehiculos/[id]/page.tsx"
git commit -m "feat(bitacora): sección de bitácora de uso en la página del vehículo"
```

---

## Task 11: UI — flujo Tomar/Entregar en la ficha pública

**Files:**
- Create: `components/uso/UsoPanel.tsx`
- Modify: `app/v/[token]/page.tsx`, `components/PublicVehicleView.tsx`

**Interfaces:**
- Consumes (HTTP): `/api/v/[token]/tomar`, `/api/v/[token]/upload-url`, `/api/v/[token]/entregar`.
- `UsoPanel` recibe `{ token: string; drivers: { id: string; nombre: string }[]; enUso: { driverNombre: string; tomadoEn: string } | null }`.
- `PublicVehicleView` gana props `token: string`, `drivers`, `enUso` (además de las actuales `vehicle`, `documents`).

- [ ] **Step 1: Implementar `components/uso/UsoPanel.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Driver = { id: string; nombre: string }
type Modo = 'idle' | 'tomar' | 'entregar'

function hora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

async function subirFoto(token: string, driverId: string, pin: string, tipo: string, file: File): Promise<string> {
  const res = await fetch(`/api/v/${token}/upload-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId, pin, tipo, contentType: file.type }),
  })
  if (!res.ok) throw new Error('upload-url')
  const { uploadUrl, filePath } = await res.json()
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
  if (!put.ok) throw new Error('upload')
  return filePath
}

export default function UsoPanel({ token, drivers, enUso }: { token: string; drivers: Driver[]; enUso: { driverNombre: string; tomadoEn: string } | null }) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>('idle')
  const [driverId, setDriverId] = useState('')
  const [pin, setPin] = useState('')
  const [tablero, setTablero] = useState<File | null>(null)
  const [cabina, setCabina] = useState<File | null>(null)
  const [hayDano, setHayDano] = useState(false)
  const [notaDano, setNotaDano] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setModo('idle'); setDriverId(''); setPin(''); setTablero(null); setCabina(null)
    setHayDano(false); setNotaDano(''); setError(null)
  }

  function errorDePin(status: number): string {
    if (status === 429) return 'Demasiados intentos. Espera unos minutos.'
    if (status === 401) return 'PIN incorrecto.'
    return 'No se pudo completar la acción.'
  }

  async function tomar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch(`/api/v/${token}/tomar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, pin }),
    })
    setBusy(false)
    if (res.ok) { reset(); router.refresh() }
    else setError(errorDePin(res.status))
  }

  async function entregar(e: React.FormEvent) {
    e.preventDefault()
    if (!tablero || !cabina) { setError('Sube la foto del tablero y la de la cabina.'); return }
    setBusy(true); setError(null)
    try {
      const fTablero = await subirFoto(token, driverId, pin, 'tablero', tablero)
      const fCabina = await subirFoto(token, driverId, pin, 'cabina', cabina)
      const res = await fetch(`/api/v/${token}/entregar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, pin, fotos: { tablero: fTablero, cabina: fCabina }, dano: hayDano ? { hay: true, nota: notaDano } : undefined }),
      })
      setBusy(false)
      if (res.ok) { reset(); router.refresh() }
      else setError(errorDePin(res.status))
    } catch {
      setBusy(false)
      setError('No se pudieron subir las fotos. Revisa tu conexión.')
    }
  }

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-base text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'
  const btnPrimary = 'w-full rounded-lg bg-azul px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50'
  const fileCls = 'block w-full text-sm text-acero file:mr-3 file:rounded-lg file:border-0 file:bg-azul/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-azul'

  // Banner de estado
  const banner = (
    <div className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      {enUso ? (
        <>
          <p className="text-base font-semibold text-tinta">En uso por {enUso.driverNombre}</p>
          <p className="text-sm text-acero">Desde el {hora(enUso.tomadoEn)}</p>
          {modo === 'idle' && (
            <button onClick={() => setModo('entregar')} className={`mt-3 ${btnPrimary}`}>Entregar vehículo</button>
          )}
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-tinta">Vehículo disponible</p>
          {modo === 'idle' && (
            <button onClick={() => setModo('tomar')} className={`mt-3 ${btnPrimary}`} disabled={drivers.length === 0}>Tomar vehículo</button>
          )}
          {modo === 'idle' && drivers.length === 0 && (
            <p className="mt-2 text-sm text-acero">No hay conductores registrados. Pídele a un administrador que te agregue.</p>
          )}
        </>
      )}

      {modo === 'tomar' && (
        <form onSubmit={tomar} className="mt-3 space-y-3">
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} required className={inputCls}>
            <option value="">¿Quién eres?</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <input value={pin} onChange={(e) => setPin(e.target.value)} required inputMode="numeric" maxLength={4} placeholder="Tu PIN" className={inputCls} />
          {error && <p className="text-sm text-vencido">{error}</p>}
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Tomando…' : 'Confirmar'}</button>
          <button type="button" onClick={reset} className="w-full text-sm text-acero">Cancelar</button>
        </form>
      )}

      {modo === 'entregar' && (
        <form onSubmit={entregar} className="mt-3 space-y-3">
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} required className={inputCls}>
            <option value="">¿Quién entrega?</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <input value={pin} onChange={(e) => setPin(e.target.value)} required inputMode="numeric" maxLength={4} placeholder="Tu PIN" className={inputCls} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-acero">Foto del tablero (bencina + kilometraje)</label>
            <input type="file" accept="image/*" capture="environment" required onChange={(e) => setTablero(e.target.files?.[0] ?? null)} className={fileCls} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-acero">Foto general de la cabina</label>
            <input type="file" accept="image/*" capture="environment" required onChange={(e) => setCabina(e.target.files?.[0] ?? null)} className={fileCls} />
          </div>
          <label className="flex items-center gap-2 text-sm text-tinta">
            <input type="checkbox" checked={hayDano} onChange={(e) => setHayDano(e.target.checked)} />
            El vehículo sufrió algún daño
          </label>
          {hayDano && (
            <textarea value={notaDano} onChange={(e) => setNotaDano(e.target.value)} rows={2} placeholder="Describe el daño" className={inputCls} />
          )}
          {error && <p className="text-sm text-vencido">{error}</p>}
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Entregando…' : 'Confirmar entrega'}</button>
          <button type="button" onClick={reset} className="w-full text-sm text-acero">Cancelar</button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Pasar estado + conductores desde `app/v/[token]/page.tsx`**

Agregar imports:
```tsx
import { getOpenUsage } from '@/lib/data/usages'
import { listActiveDrivers } from '@/lib/data/drivers'
```
Después de resolver `items`, agregar:
```tsx
  const [openUsage, drivers] = await Promise.all([
    getOpenUsage(vehicle.id),
    listActiveDrivers(vehicle.companyId),
  ])
  const enUso = openUsage ? { driverNombre: openUsage.driverNombre, tomadoEn: openUsage.tomadoEn } : null
```
Y cambiar el render:
```tsx
  return <PublicVehicleView vehicle={vehicle} documents={items} token={token} drivers={drivers} enUso={enUso} />
```

- [ ] **Step 3: Renderizar el `UsoPanel` en `components/PublicVehicleView.tsx`**

Agregar el import y las props. Cambiar la firma del componente exportado por defecto para aceptar las nuevas props:
```tsx
import UsoPanel from '@/components/uso/UsoPanel'
```
En la firma del componente principal (el `export default function ...({ vehicle, documents })`), agregar las props:
```tsx
export default function PublicVehicleView({
  vehicle, documents, token, drivers, enUso,
}: {
  vehicle: Vehicle
  documents: Item[]
  token: string
  drivers: { id: string; nombre: string }[]
  enUso: { driverNombre: string; tomadoEn: string } | null
}) {
```
Y renderizar `<UsoPanel token={token} drivers={drivers} enUso={enUso} />` **arriba de las pills** (justo antes del `<div>` que contiene los botones de pestañas Documentación / Sobre el vehículo), con una separación `mb-4` o dentro del contenedor existente.

- [ ] **Step 4: Verificar typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 5: Verificación manual (opcional, dev server)**

`npm run dev`, abrir `/v/<token>` de un vehículo. Estado "Disponible" → Tomar (elige conductor + PIN). Vuelve a abrir → "En uso por X" → Entregar (2 fotos + daño). En el app autenticado, la página del vehículo muestra el uso en "Bitácora de uso".

- [ ] **Step 6: Commit**

```bash
git add components/uso/ components/PublicVehicleView.tsx "app/v/[token]/page.tsx"
git commit -m "feat(bitacora): flujo Tomar/Entregar en la ficha pública del chip"
```

---

## Cierre

- [ ] **Suite completa + build final**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: todo verde (salvo `rules.test.ts`, que requiere emulador y falla en local).

- [ ] **Recordatorio al usuario (cutover):**
  - Desplegar reglas: `node --env-file=.env.local scripts/deploy-firestore-rules.mjs`.
  - Confirmar `RESEND_FROM`/`RESEND_API_KEY` en Vercel para que salga el aviso de "sin entrega formal" (best-effort; la bitácora funciona igual sin email).
  - Verificar que el bucket de Storage tenga CORS para el dominio (ya configurado para las subidas de documentos; las fotos de uso usan el mismo bucket).
