# Pauta de mantención — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestión de la pauta de mantención por vehículo (por km y/o tiempo), con estándar de empresa + override por vehículo, registro de mantenciones con archivo, vista de flota y recordatorio por email.

**Architecture:** Lógica de estado pura y testeable en `lib/mantencion/`; persistencia vía Admin SDK en `lib/data/`; colección top-level `mantenciones` scopeada por `companyId`; UI en la ficha del vehículo + Configuración + una página de flota; el cron diario existente suma un pase de mantención.

**Tech Stack:** Next.js 16 (App Router, async params/cookies), TypeScript estricto, Firebase Admin SDK, Cloud Storage (signed URLs), Resend, Vitest.

## Global Constraints

- **Idioma:** todo el código, UI, comentarios y textos en **español neutro (Chile)**, "tú" (no "vos").
- **Iconos SVG inline** (no emojis). Tokens de color de `app/globals.css` (`tinta`, `acero`, `linea`, `lienzo`, `superficie`, `azul`/`azul-press`; estados verde `#15803D`, ámbar `#B45309`, rojo `#C81E1E`).
- **Firestore Admin rechaza `undefined`**: construir objetos sin claves `undefined` o usar `?? null`.
- **Nunca confiar en el cliente**: cada `/api/*` privado valida `getMembership()` + `can(role, action)` y resuelve `companyId` en el servidor.
- **Next 16**: `params`/`searchParams`/`cookies()` son async (`await`). Route handlers dinámicos tipan `params: Promise<{...}>`.
- **Init lazy** de Firebase/Resend (ya resuelto en los módulos existentes; reutilizarlos, no reinicializar).
- **Emails best-effort** (envueltos en try/catch; nunca rompen el flujo) y **brandeados** vía `lib/email/layout.ts` (`emailLayout` + `ctaButton` + `appUrl`).
- Roles (`lib/auth/roles.ts`): pauta estándar de empresa → `billing:manage`; override por vehículo → `vehicle:write`; registrar/borrar mantención → `document:write`; ver → cualquier rol.
- Tras cambios: `npx tsc --noEmit`, `npx eslint app components lib`, `npm test` (menos `rules.test.ts`, que requiere emulador), `npm run build`.

---

## File Structure

- `lib/types.ts` — MODIFICAR: `PautaMantencion`, `Mantencion`; `Company.pautaMantencion?`; `Vehicle.pautaMantencion?` + `mantencionReminders?`.
- `lib/mantencion/status.ts` — CREAR: lógica pura (`sanitizePauta`, `pautaVacia`, `addMeses`, `estadoMantencion`, constantes).
- `lib/mantencion/reminders.ts` — CREAR: `hitoMantencion` (qué hito de email toca).
- `lib/mantencion/__tests__/status.test.ts`, `reminders.test.ts` — CREAR.
- `lib/data/mantenciones.ts` — CREAR: CRUD + cascada + `ultimaMantencion`.
- `lib/data/__tests__/mantenciones.test.ts` — CREAR.
- `lib/data/companies.ts` — MODIFICAR: `pautaMantencion` en get/save + `listCompaniasParaMantencion`.
- `lib/data/vehicles.ts` — MODIFICAR: `toVehicle` mapea nuevos campos; `deleteVehicle` cascada.
- `lib/data/deleteCompany.ts` — MODIFICAR: cascada de `mantenciones`.
- `lib/storage/signedUrls.ts` — MODIFICAR: `createMantencionUrl`.
- `app/api/company/route.ts` — MODIFICAR: aceptar `pautaMantencion`.
- `app/api/vehicles/[id]/route.ts` — MODIFICAR: sanear `pautaMantencion`.
- `app/api/mantenciones/route.ts`, `upload-url/route.ts`, `[id]/route.ts` — CREAR.
- `components/company/PautaMantencionCard.tsx` — CREAR; `app/(app)/configuracion/page.tsx` — MODIFICAR.
- `components/vehicle/MantencionPanel.tsx` — CREAR; `app/(app)/vehiculos/[id]/page.tsx` — MODIFICAR.
- `app/(app)/mantenciones/page.tsx` — CREAR; `components/AppNav.tsx` — MODIFICAR.
- `lib/mantencion/runReminders.ts` — CREAR: `processMantencionReminders` (deps inyectadas).
- `lib/email/mantencionEmail.ts` — CREAR; `lib/email/resend.ts` — MODIFICAR: `sendMantencionEmail`.
- `app/api/cron/reminders/route.ts` — MODIFICAR: pase de mantención.
- `CLAUDE.md` — MODIFICAR: documentar la feature.

---

## Task 1: Tipos + lógica pura de estado

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/mantencion/status.ts`
- Test: `lib/mantencion/__tests__/status.test.ts`

**Interfaces:**
- Produces:
  - `interface PautaMantencion { cadaKm?: number | null; cadaMeses?: number | null }`
  - `interface Mantencion { id; companyId; vehicleId; fecha: string; km: number | null; nota?: string | null; filePath?: string | null; fileUrl?: string | null; createdByUid?: string; createdAt: string }`
  - `Company.pautaMantencion?: PautaMantencion`
  - `Vehicle.pautaMantencion?: PautaMantencion | null`, `Vehicle.mantencionReminders?: ('proxima'|'vencida')[]`
  - `type EstadoMantencion = 'sin_pauta'|'sin_registro'|'al_dia'|'proxima'|'vencida'`
  - `sanitizePauta(raw: unknown): PautaMantencion`
  - `pautaVacia(p: PautaMantencion | null | undefined): boolean`
  - `addMeses(fechaISO: string, meses: number): string`
  - `estadoMantencion(input: { pauta: PautaMantencion | null; ultima: { km: number|null; fecha: string } | null; kmActual: number | null; now: Date }): { estado: EstadoMantencion; detalle: { kmRestantes?: number; diasRestantes?: number; proximaKm?: number; proximaFecha?: string } }`
  - `UMBRAL_KM_PROXIMA = 1000`, `UMBRAL_DIAS_PROXIMA = 30`

- [ ] **Step 1: Añadir tipos en `lib/types.ts`**

Añade cerca de las demás interfaces de dominio:

```typescript
export interface PautaMantencion {
  cadaKm?: number | null
  cadaMeses?: number | null
}

export interface Mantencion {
  id: string
  companyId: string
  vehicleId: string
  fecha: string // YYYY-MM-DD
  km: number | null
  nota?: string | null
  filePath?: string | null
  fileUrl?: string | null
  createdByUid?: string
  createdAt: string // ISO
}
```

En `interface Vehicle`, añade tras `kmActualizadoEn?: string | null`:

```typescript
  pautaMantencion?: PautaMantencion | null
  mantencionReminders?: ('proxima' | 'vencida')[]
```

En `interface Company`, añade tras `categorias?: Categoria[]` (o donde estén los campos opcionales):

```typescript
  pautaMantencion?: PautaMantencion
```

- [ ] **Step 2: Escribir el test que falla** (`lib/mantencion/__tests__/status.test.ts`)

```typescript
import { describe, it, expect } from 'vitest'
import { sanitizePauta, pautaVacia, addMeses, estadoMantencion } from '@/lib/mantencion/status'

describe('sanitizePauta', () => {
  it('acepta enteros ≥ 1 y descarta el resto', () => {
    expect(sanitizePauta({ cadaKm: 10000, cadaMeses: 6 })).toEqual({ cadaKm: 10000, cadaMeses: 6 })
    expect(sanitizePauta({ cadaKm: 0, cadaMeses: -3 })).toEqual({ cadaKm: null, cadaMeses: null })
    expect(sanitizePauta({ cadaKm: '10000' })).toEqual({ cadaKm: null, cadaMeses: null })
    expect(sanitizePauta(null)).toEqual({ cadaKm: null, cadaMeses: null })
    expect(sanitizePauta({ cadaKm: 10000.7 })).toEqual({ cadaKm: 10000, cadaMeses: null })
  })
})

describe('pautaVacia', () => {
  it('true si no hay ningún criterio', () => {
    expect(pautaVacia(null)).toBe(true)
    expect(pautaVacia({ cadaKm: null, cadaMeses: null })).toBe(true)
    expect(pautaVacia({ cadaKm: 10000 })).toBe(false)
  })
})

describe('addMeses', () => {
  it('suma meses simples', () => {
    expect(addMeses('2026-01-15', 6)).toBe('2026-07-15')
  })
  it('maneja overflow de año', () => {
    expect(addMeses('2026-10-10', 6)).toBe('2027-04-10')
  })
  it('recorta al último día del mes destino', () => {
    expect(addMeses('2026-01-31', 1)).toBe('2026-02-28')
  })
})

describe('estadoMantencion', () => {
  const now = new Date('2026-07-09T12:00:00Z')
  it('sin pauta', () => {
    expect(estadoMantencion({ pauta: null, ultima: null, kmActual: 100, now }).estado).toBe('sin_pauta')
  })
  it('con pauta pero sin registro', () => {
    expect(estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: null, kmActual: 100, now }).estado).toBe('sin_registro')
  })
  it('km al día', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 6000, now })
    expect(r.estado).toBe('al_dia')
    expect(r.detalle.kmRestantes).toBe(9000)
  })
  it('km próxima (dentro de 1000)', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 14500, now })
    expect(r.estado).toBe('proxima')
    expect(r.detalle.kmRestantes).toBe(500)
  })
  it('km vencida', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 16000, now })
    expect(r.estado).toBe('vencida')
  })
  it('tiempo vencida', () => {
    const r = estadoMantencion({ pauta: { cadaMeses: 6 }, ultima: { km: null, fecha: '2026-01-01' }, kmActual: null, now })
    expect(r.estado).toBe('vencida') // próxima era 2026-07-01, ya pasó
  })
  it('lo que ocurra primero: gana el peor criterio', () => {
    // km al día (faltan 9000) pero tiempo vencido
    const r = estadoMantencion({ pauta: { cadaKm: 10000, cadaMeses: 6 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 6000, now })
    expect(r.estado).toBe('vencida')
  })
  it('km no computable por kmActual null cae a tiempo', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000, cadaMeses: 60 }, ultima: { km: 5000, fecha: '2026-06-01' }, kmActual: null, now })
    expect(r.estado).toBe('al_dia')
  })
  it('solo km configurado pero sin kmActual → sin_registro (no computable)', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: null, now })
    expect(r.estado).toBe('sin_registro')
  })
})
```

- [ ] **Step 3: Verificar que falla**

Run: `npx vitest run lib/mantencion/__tests__/status.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 4: Implementar `lib/mantencion/status.ts`**

```typescript
import { daysUntil } from '@/lib/documents/status'
import type { PautaMantencion } from '@/lib/types'

export type EstadoMantencion = 'sin_pauta' | 'sin_registro' | 'al_dia' | 'proxima' | 'vencida'

export const UMBRAL_KM_PROXIMA = 1000
export const UMBRAL_DIAS_PROXIMA = 30

/** Sanea la pauta: cadaKm/cadaMeses enteros ≥ 1, o null. */
export function sanitizePauta(raw: unknown): PautaMantencion {
  const r = (raw ?? {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : null)
  return { cadaKm: num(r.cadaKm), cadaMeses: num(r.cadaMeses) }
}

export function pautaVacia(p: PautaMantencion | null | undefined): boolean {
  return !p || (p.cadaKm == null && p.cadaMeses == null)
}

/** Suma `meses` a una fecha YYYY-MM-DD, recortando al último día del mes destino. */
export function addMeses(fechaISO: string, meses: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const total = (m - 1) + meses
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12 // 0-11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const RANK: Record<'al_dia' | 'proxima' | 'vencida', number> = { al_dia: 0, proxima: 1, vencida: 2 }

export interface EstadoInput {
  pauta: PautaMantencion | null
  ultima: { km: number | null; fecha: string } | null
  kmActual: number | null
  now: Date
}
export interface EstadoResult {
  estado: EstadoMantencion
  detalle: { kmRestantes?: number; diasRestantes?: number; proximaKm?: number; proximaFecha?: string }
}

export function estadoMantencion(input: EstadoInput): EstadoResult {
  const { pauta, ultima, kmActual, now } = input
  if (pautaVacia(pauta)) return { estado: 'sin_pauta', detalle: {} }
  if (!ultima) return { estado: 'sin_registro', detalle: {} }

  const detalle: EstadoResult['detalle'] = {}
  const criterios: ('al_dia' | 'proxima' | 'vencida')[] = []

  if (pauta!.cadaKm != null && ultima.km != null && kmActual != null) {
    const proximaKm = ultima.km + pauta!.cadaKm
    const kmRestantes = proximaKm - kmActual
    detalle.proximaKm = proximaKm
    detalle.kmRestantes = kmRestantes
    criterios.push(kmRestantes <= 0 ? 'vencida' : kmRestantes <= UMBRAL_KM_PROXIMA ? 'proxima' : 'al_dia')
  }

  if (pauta!.cadaMeses != null) {
    const proximaFecha = addMeses(ultima.fecha, pauta!.cadaMeses)
    const dias = daysUntil(proximaFecha, now)
    detalle.proximaFecha = proximaFecha
    if (dias != null) {
      detalle.diasRestantes = dias
      criterios.push(dias < 0 ? 'vencida' : dias <= UMBRAL_DIAS_PROXIMA ? 'proxima' : 'al_dia')
    }
  }

  if (criterios.length === 0) return { estado: 'sin_registro', detalle }
  const estado = criterios.reduce<'al_dia' | 'proxima' | 'vencida'>(
    (worst, c) => (RANK[c] > RANK[worst] ? c : worst),
    'al_dia',
  )
  return { estado, detalle }
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npx vitest run lib/mantencion/__tests__/status.test.ts`
Expected: PASS (todos). Luego `npx tsc --noEmit` OK.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/mantencion/status.ts lib/mantencion/__tests__/status.test.ts
git commit -m "feat(mantencion): tipos + lógica pura de estado de la pauta"
```

---

## Task 2: Data layer — mantenciones, pauta de empresa/vehículo, cascada, signed URL

**Files:**
- Create: `lib/data/mantenciones.ts`
- Test: `lib/data/__tests__/mantenciones.test.ts`
- Modify: `lib/data/companies.ts`, `lib/data/vehicles.ts`, `lib/data/deleteCompany.ts`, `lib/storage/signedUrls.ts`

**Interfaces:**
- Consumes (Task 1): `Mantencion`, `PautaMantencion` (de `lib/types`).
- Produces:
  - `createMantencion(companyId: string, createdByUid: string, input: { vehicleId: string; fecha: string; km: number | null; nota?: string | null; filePath?: string | null; fileUrl?: string | null }): Promise<Mantencion>`
  - `listMantenciones(vehicleId: string): Promise<Mantencion[]>` (desc por `fecha`)
  - `ultimaMantencion(vehicleId: string): Promise<{ km: number | null; fecha: string } | null>`
  - `deleteMantencion(id: string, companyId: string): Promise<void>`
  - `deleteMantencionesByVehicle(vehicleId: string): Promise<void>`
  - `deleteMantencionesByCompany(companyId: string): Promise<void>`
  - `createMantencionUrl(vehicleId: string, fileName: string, contentType: string): Promise<{ uploadUrl: string; filePath: string }>` (en `signedUrls.ts`)
  - `listCompaniasParaMantencion(): Promise<{ id: string; ownerUid: string; pauta: PautaMantencion | null }[]>` (en `companies.ts`)
  - `saveCompany` acepta `pautaMantencion?: PautaMantencion`; `getCompany` devuelve `pautaMantencion`.
  - `toVehicle` mapea `pautaMantencion` (`?? null`) y `mantencionReminders` (`?? []`).

- [ ] **Step 1: `createMantencionUrl` en `lib/storage/signedUrls.ts`**

Añade (espeja `createUsagePhotoUrl`):

```typescript
export async function createMantencionUrl(
  vehicleId: string,
  fileName: string,
  contentType: string,
): Promise<{ uploadUrl: string; filePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `vehicles/${vehicleId}/mantenciones/${nanoid(8)}-${safeName}`
  const [uploadUrl] = await adminBucket.file(filePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
  })
  return { uploadUrl, filePath }
}
```

- [ ] **Step 2: Escribir el test que falla** (`lib/data/__tests__/mantenciones.test.ts`)

Espeja el patrón de `usages.test.ts` (mock de `@/lib/firebase/admin`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const whereGet = vi.fn()
const add = vi.fn()
const docGet = vi.fn()
const docDelete = vi.fn()
const vehicleUpdate = vi.fn()
const bucketDelete = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (col: string) => ({
      where: () => ({ get: whereGet }),
      add,
      doc: () => (col === 'vehicles'
        ? { update: vehicleUpdate }
        : { get: docGet, delete: docDelete }),
    }),
  },
  adminBucket: { file: (p: string) => ({ delete: (...a: unknown[]) => bucketDelete(p, ...a) }) },
}))

import {
  createMantencion, listMantenciones, ultimaMantencion,
  deleteMantencion, deleteMantencionesByVehicle,
} from '@/lib/data/mantenciones'

beforeEach(() => {
  whereGet.mockReset(); add.mockReset(); docGet.mockReset()
  docDelete.mockReset(); vehicleUpdate.mockReset(); bucketDelete.mockReset()
  add.mockResolvedValue({ id: 'm1' })
})

describe('createMantencion', () => {
  it('crea el registro y resetea los hitos de email del vehículo', async () => {
    const r = await createMantencion('c1', 'u1', { vehicleId: 'v1', fecha: '2026-07-01', km: 12000, nota: 'aceite', filePath: 'p/f', fileUrl: 'p/f' })
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1', vehicleId: 'v1', km: 12000, createdByUid: 'u1' }))
    expect(vehicleUpdate).toHaveBeenCalledWith({ mantencionReminders: [] })
    expect(r.id).toBe('m1')
  })
})

describe('ultimaMantencion', () => {
  it('devuelve la más reciente por fecha', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a', data: () => ({ vehicleId: 'v1', fecha: '2026-01-01', km: 1000 }) },
      { id: 'b', data: () => ({ vehicleId: 'v1', fecha: '2026-06-01', km: 9000 }) },
    ] })
    expect(await ultimaMantencion('v1')).toEqual({ km: 9000, fecha: '2026-06-01' })
  })
  it('null si no hay', async () => {
    whereGet.mockResolvedValue({ docs: [] })
    expect(await ultimaMantencion('v1')).toBeNull()
  })
})

describe('deleteMantencion', () => {
  it('borra el archivo de Storage y el doc', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', filePath: 'p/f' }) })
    await deleteMantencion('m1', 'c1')
    expect(bucketDelete).toHaveBeenCalledWith('p/f', { ignoreNotFound: true })
    expect(docDelete).toHaveBeenCalled()
  })
  it('lanza forbidden si es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(deleteMantencion('m1', 'c1')).rejects.toThrow('forbidden')
  })
})

describe('deleteMantencionesByVehicle', () => {
  it('borra archivos + docs de todas las mantenciones del vehículo', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a', data: () => ({ vehicleId: 'v1', filePath: 'p/a' }), ref: { delete: docDelete } },
      { id: 'b', data: () => ({ vehicleId: 'v1', filePath: null }), ref: { delete: docDelete } },
    ] })
    await deleteMantencionesByVehicle('v1')
    expect(bucketDelete).toHaveBeenCalledWith('p/a', { ignoreNotFound: true })
    expect(docDelete).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 3: Verificar que falla**

Run: `npx vitest run lib/data/__tests__/mantenciones.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 4: Implementar `lib/data/mantenciones.ts`**

```typescript
import { adminDb, adminBucket } from '@/lib/firebase/admin'
import type { Mantencion } from '@/lib/types'

const COL = 'mantenciones'

function toMantencion(id: string, d: FirebaseFirestore.DocumentData): Mantencion {
  return {
    id,
    companyId: d.companyId,
    vehicleId: d.vehicleId,
    fecha: d.fecha,
    km: d.km ?? null,
    nota: d.nota ?? null,
    filePath: d.filePath ?? null,
    fileUrl: d.fileUrl ?? null,
    createdByUid: d.createdByUid ?? undefined,
    createdAt: d.createdAt,
  }
}

export async function createMantencion(
  companyId: string,
  createdByUid: string,
  input: { vehicleId: string; fecha: string; km: number | null; nota?: string | null; filePath?: string | null; fileUrl?: string | null },
): Promise<Mantencion> {
  const full = {
    companyId,
    vehicleId: input.vehicleId,
    fecha: input.fecha,
    km: input.km ?? null,
    nota: input.nota ?? null,
    filePath: input.filePath ?? null,
    fileUrl: input.fileUrl ?? null,
    createdByUid,
    createdAt: new Date().toISOString(),
  }
  const ref = await adminDb.collection(COL).add(full)
  // Resetea los hitos de email: tras registrar, el estado vuelve a "al día".
  try {
    await adminDb.collection('vehicles').doc(input.vehicleId).update({ mantencionReminders: [] })
  } catch {
    /* best-effort */
  }
  return { id: ref.id, ...full }
}

export async function listMantenciones(vehicleId: string): Promise<Mantencion[]> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  return snap.docs.map((d) => toMantencion(d.id, d.data())).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
}

export async function ultimaMantencion(vehicleId: string): Promise<{ km: number | null; fecha: string } | null> {
  const lista = await listMantenciones(vehicleId)
  if (lista.length === 0) return null
  return { km: lista[0].km, fecha: lista[0].fecha }
}

export async function deleteMantencion(id: string, companyId: string): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  const filePath = doc.data()?.filePath
  if (filePath) await adminBucket.file(filePath).delete({ ignoreNotFound: true })
  await ref.delete()
}

async function borrarDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<void> {
  for (const d of docs) {
    const filePath = d.data().filePath
    if (filePath) await adminBucket.file(filePath).delete({ ignoreNotFound: true })
    await d.ref.delete()
  }
}

export async function deleteMantencionesByVehicle(vehicleId: string): Promise<void> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  await borrarDocs(snap.docs)
}

export async function deleteMantencionesByCompany(companyId: string): Promise<void> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  await borrarDocs(snap.docs)
}
```

- [ ] **Step 5: `companies.ts` — pauta en get/save + listado para el cron**

En `getCompany`, añade al objeto devuelto: `pautaMantencion: d.pautaMantencion ?? undefined,`.
En `saveCompany`, amplía el tipo del patch con `pautaMantencion?: PautaMantencion` (importa el tipo) y añade:

```typescript
  if (patch.pautaMantencion !== undefined) data.pautaMantencion = patch.pautaMantencion
```

Añade al final del archivo:

```typescript
import type { PautaMantencion } from '@/lib/types' // (agregar a los imports de tipos existentes)

export async function listCompaniasParaMantencion(): Promise<{ id: string; ownerUid: string; pauta: PautaMantencion | null }[]> {
  const snap = await adminDb.collection(COL).get()
  return snap.docs.map((d) => ({ id: d.id, ownerUid: d.data().ownerUid, pauta: d.data().pautaMantencion ?? null }))
}
```

- [ ] **Step 6: `vehicles.ts` — mapear campos + cascada**

En `toVehicle`, añade tras `kmActualizadoEn`:

```typescript
    pautaMantencion: data.pautaMantencion ?? null,
    mantencionReminders: data.mantencionReminders ?? [],
```

En `deleteVehicle`, añade la cascada (import arriba):

```typescript
import { deleteMantencionesByVehicle } from '@/lib/data/mantenciones'
```
y dentro de `deleteVehicle`, tras `await deleteUsagesByVehicle(vehicleId)`:
```typescript
  await deleteMantencionesByVehicle(vehicleId)
```

- [ ] **Step 7: `deleteCompany.ts` — cascada de mantenciones**

Añade import `import { deleteMantencionesByCompany } from '@/lib/data/mantenciones'` y, tras `await deleteUsagesByCompany(companyId)`:

```typescript
  await deleteMantencionesByCompany(companyId)
```

- [ ] **Step 8: Verificar tests + tsc**

Run: `npx vitest run lib/data/__tests__/mantenciones.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: OK.

- [ ] **Step 9: Commit**

```bash
git add lib/data/mantenciones.ts lib/data/__tests__/mantenciones.test.ts lib/data/companies.ts lib/data/vehicles.ts lib/data/deleteCompany.ts lib/storage/signedUrls.ts
git commit -m "feat(mantencion): data layer + cascada + signed URL"
```

---

## Task 3: Endpoints

**Files:**
- Modify: `app/api/company/route.ts`, `app/api/vehicles/[id]/route.ts`
- Create: `app/api/mantenciones/route.ts`, `app/api/mantenciones/upload-url/route.ts`, `app/api/mantenciones/[id]/route.ts`

**Interfaces:**
- Consumes (Task 1, 2): `sanitizePauta`, `createMantencion`, `listMantenciones`, `deleteMantencion`, `createMantencionUrl`, `getMembership`, `can`.
- Produces (endpoints consumidos por Task 4/5): `POST/GET /api/mantenciones`, `POST /api/mantenciones/upload-url`, `DELETE /api/mantenciones/[id]`; `PATCH /api/company` acepta `pautaMantencion`; `PATCH /api/vehicles/[id]` acepta `pautaMantencion` saneado.

- [ ] **Step 1: `PATCH /api/company` acepta `pautaMantencion`**

En `app/api/company/route.ts`: importa `import { sanitizePauta } from '@/lib/mantencion/status'` y, antes del chequeo `Object.keys(patch).length === 0`:

```typescript
  if (body.pautaMantencion !== undefined) patch.pautaMantencion = sanitizePauta(body.pautaMantencion)
```

(Recuerda ampliar el tipo del patch en `saveCompany` — hecho en Task 2. `patch` aquí es `Parameters<typeof saveCompany>[1]`, así que ya lo acepta.)

- [ ] **Step 2: `PATCH /api/vehicles/[id]` sanea `pautaMantencion`**

En `app/api/vehicles/[id]/route.ts`, reemplaza el cuerpo del `PATCH` para no confiar en el body crudo respecto a la pauta:

```typescript
import { sanitizePauta } from '@/lib/mantencion/status'
// ...
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.categoriaId !== undefined) patch.categoriaId = body.categoriaId || null
  if (body.pautaMantencion !== undefined) {
    patch.pautaMantencion = body.pautaMantencion === null ? null : sanitizePauta(body.pautaMantencion)
  }
  if (body.info !== undefined) patch.info = body.info
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 })
  try {
    await updateVehicle(id, m.companyId, patch)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

Nota: esto endurece el PATCH con whitelist (`categoriaId`/`pautaMantencion`/`info`). Verifica que `CategoriaSelector` y `VehicleInfoForm` mandan esos campos (lo hacen). Si `VehicleInfoForm` manda otra forma, ajusta la whitelist para incluir sus campos.

- [ ] **Step 3: `POST/GET /api/mantenciones/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { createMantencion, listMantenciones } from '@/lib/data/mantenciones'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const vehicleId = req.nextUrl.searchParams.get('vehicleId') ?? ''
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ mantenciones: await listMantenciones(vehicleId) })
}

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const vehicleId = String(body?.vehicleId ?? '')
  const fecha = String(body?.fecha ?? '')
  if (!vehicleId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Faltan datos (vehículo y fecha).' }, { status: 400 })
  }
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const km = typeof body?.km === 'number' && Number.isFinite(body.km) && body.km >= 0 ? Math.floor(body.km) : null
  const nota = typeof body?.nota === 'string' && body.nota.trim() ? body.nota.trim().slice(0, 500) : null
  const filePath = typeof body?.filePath === 'string' && body.filePath ? body.filePath : null
  const mant = await createMantencion(m.companyId, m.uid, { vehicleId, fecha, km, nota, filePath, fileUrl: filePath })
  return NextResponse.json({ ok: true, id: mant.id })
}
```

- [ ] **Step 4: `POST /api/mantenciones/upload-url/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { createMantencionUrl } from '@/lib/storage/signedUrls'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const vehicleId = String(body?.vehicleId ?? '')
  const fileName = String(body?.fileName ?? 'constancia')
  const contentType = String(body?.contentType ?? 'application/octet-stream')
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { uploadUrl, filePath } = await createMantencionUrl(vehicleId, fileName, contentType)
  return NextResponse.json({ uploadUrl, filePath })
}
```

- [ ] **Step 5: `DELETE /api/mantenciones/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { deleteMantencion } from '@/lib/data/mantenciones'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    await deleteMantencion(id, m.companyId)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Verificar tsc + build + lint**

Run: `npx tsc --noEmit && npx eslint app lib && npm run build`
Expected: OK (sin errores).

- [ ] **Step 7: Commit**

```bash
git add app/api/company/route.ts app/api/vehicles/[id]/route.ts app/api/mantenciones
git commit -m "feat(mantencion): endpoints (company/vehicle pauta + CRUD mantenciones)"
```

---

## Task 4: Configuración — card de pauta estándar de la empresa

**Files:**
- Create: `components/company/PautaMantencionCard.tsx`
- Modify: `app/(app)/configuracion/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/company` con `{ pautaMantencion }`; `Company.pautaMantencion`.

- [ ] **Step 1: `components/company/PautaMantencionCard.tsx`** (espeja `PlataformaCard`)

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PautaMantencion } from '@/lib/types'

export default function PautaMantencionCard({ initial }: { initial: PautaMantencion }) {
  const router = useRouter()
  const [cadaKm, setCadaKm] = useState<string>(initial.cadaKm != null ? String(initial.cadaKm) : '')
  const [cadaMeses, setCadaMeses] = useState<string>(initial.cadaMeses != null ? String(initial.cadaMeses) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    const pauta = {
      cadaKm: cadaKm ? Math.max(1, Math.floor(Number(cadaKm))) : null,
      cadaMeses: cadaMeses ? Math.max(1, Math.floor(Number(cadaMeses))) : null,
    }
    const res = await fetch('/api/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pautaMantencion: pauta }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2500) }
    else setError('No se pudo guardar.')
  }

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Pauta de mantención estándar</h2>
      <p className="mt-1 text-sm text-acero">La pauta por defecto para toda la flota. Cada vehículo puede tener una pauta propia en su ficha.</p>
      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="cadaKm" className="block text-sm font-medium text-acero">Cada cuántos kilómetros <span className="font-normal text-acero/70">(opcional)</span></label>
          <input id="cadaKm" type="number" min={1} value={cadaKm} onChange={(e) => setCadaKm(e.target.value)} placeholder="Ej. 10000" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cadaMeses" className="block text-sm font-medium text-acero">Cada cuántos meses <span className="font-normal text-acero/70">(opcional)</span></label>
          <input id="cadaMeses" type="number" min={1} value={cadaMeses} onChange={(e) => setCadaMeses(e.target.value)} placeholder="Ej. 6" className={inputCls} />
        </div>
        <p className="text-xs text-acero">Si defines ambos, la mantención se marca por lo que ocurra primero. Deja vacío para no usar ese criterio.</p>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {saved && <span className="text-sm text-[#15803D]">Guardado ✓</span>}
          {error && <span className="text-sm text-vencido">{error}</span>}
        </div>
      </form>
    </section>
  )
}
```

- [ ] **Step 2: Renderizar en Configuración**

En `app/(app)/configuracion/page.tsx`: importa `PautaMantencionCard` y, en la rama `esAdmin`, tras `<CategoriasCard .../>`:

```typescript
      {esAdmin && <PautaMantencionCard initial={company?.pautaMantencion ?? {}} />}
```

- [ ] **Step 3: Verificar tsc + build**

Run: `npx tsc --noEmit && npx eslint app components && npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add components/company/PautaMantencionCard.tsx app/(app)/configuracion/page.tsx
git commit -m "feat(mantencion): card de pauta estándar en Configuración"
```

---

## Task 5: Ficha del vehículo — panel de mantención

**Files:**
- Create: `components/vehicle/MantencionPanel.tsx`
- Modify: `app/(app)/vehiculos/[id]/page.tsx`

**Interfaces:**
- Consumes: `estadoMantencion` + `EstadoMantencion` (Task 1); `listMantenciones`, `ultimaMantencion` (Task 2); `POST /api/mantenciones`, `POST /api/mantenciones/upload-url`, `DELETE /api/mantenciones/[id]`, `PATCH /api/vehicles/[id]` con `{ pautaMantencion }`.

- [ ] **Step 1: Cargar datos en la página del vehículo**

En `app/(app)/vehiculos/[id]/page.tsx`, tras cargar `usos`, añade:

```typescript
import { listMantenciones, ultimaMantencion } from '@/lib/data/mantenciones'
import { estadoMantencion } from '@/lib/mantencion/status'
import MantencionPanel from '@/components/vehicle/MantencionPanel'
// ...
  const [mantenciones, ultima] = await Promise.all([
    listMantenciones(vehicle.id),
    ultimaMantencion(vehicle.id),
  ])
  const mantencionesConUrl = await Promise.all(
    mantenciones.map(async (mt) => ({
      id: mt.id, fecha: mt.fecha, km: mt.km, nota: mt.nota ?? null,
      fileUrl: mt.filePath ? await createReadUrl(mt.filePath) : null,
    })),
  )
  const pautaEfectiva = vehicle.pautaMantencion ?? company?.pautaMantencion ?? null
  const esOverride = vehicle.pautaMantencion != null
  const estado = estadoMantencion({ pauta: pautaEfectiva, ultima, kmActual: vehicle.kmActual ?? null, now })
```

Y renderiza el panel (tras `VehicleInfo*`, antes de `BitacoraUso`):

```typescript
      <MantencionPanel
        vehicleId={vehicle.id}
        estado={estado.estado}
        detalle={estado.detalle}
        pautaEfectiva={pautaEfectiva}
        esOverride={esOverride}
        pautaEstandar={company?.pautaMantencion ?? null}
        kmActual={vehicle.kmActual ?? null}
        mantenciones={mantencionesConUrl}
        puedeRegistrar={canEditDocs}
        puedeConfigurar={canManageVehicle}
      />
```

- [ ] **Step 2: `components/vehicle/MantencionPanel.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PautaMantencion } from '@/lib/types'
import type { EstadoMantencion } from '@/lib/mantencion/status'

type Mant = { id: string; fecha: string; km: number | null; nota: string | null; fileUrl: string | null }

const BADGE: Record<EstadoMantencion, { label: string; cls: string }> = {
  al_dia: { label: 'Al día', cls: 'bg-[#E6F4EA] text-[#15803D]' },
  proxima: { label: 'Próxima', cls: 'bg-[#FDF1DC] text-[#B45309]' },
  vencida: { label: 'Vencida', cls: 'bg-[#FCE7E7] text-[#C81E1E]' },
  sin_registro: { label: 'Sin registro', cls: 'bg-[#EEF0F3] text-acero' },
  sin_pauta: { label: 'Sin pauta', cls: 'bg-[#EEF0F3] text-acero' },
}

function fecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function MantencionPanel({
  vehicleId, estado, detalle, pautaEfectiva, esOverride, kmActual,
  mantenciones, puedeRegistrar, puedeConfigurar,
}: {
  vehicleId: string
  estado: EstadoMantencion
  detalle: { kmRestantes?: number; diasRestantes?: number; proximaKm?: number; proximaFecha?: string }
  pautaEfectiva: PautaMantencion | null
  esOverride: boolean
  pautaEstandar: PautaMantencion | null
  kmActual: number | null
  mantenciones: Mant[]
  puedeRegistrar: boolean
  puedeConfigurar: boolean
}) {
  const router = useRouter()
  const [openReg, setOpenReg] = useState(false)
  const [openPauta, setOpenPauta] = useState(false)
  const [fechaReg, setFechaReg] = useState('')
  const [kmReg, setKmReg] = useState<string>(kmActual != null ? String(kmActual) : '')
  const [nota, setNota] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cadaKm, setCadaKm] = useState<string>(esOverride && pautaEfectiva?.cadaKm != null ? String(pautaEfectiva.cadaKm) : '')
  const [cadaMeses, setCadaMeses] = useState<string>(esOverride && pautaEfectiva?.cadaMeses != null ? String(pautaEfectiva.cadaMeses) : '')

  const badge = BADGE[estado]
  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  const detalleTexto = (() => {
    if (estado === 'sin_pauta') return 'Este vehículo no tiene una pauta configurada.'
    if (estado === 'sin_registro') return 'Registra la última mantención para empezar a controlar la pauta.'
    const partes: string[] = []
    if (detalle.kmRestantes != null) partes.push(detalle.kmRestantes <= 0 ? `pasada por ${Math.abs(detalle.kmRestantes).toLocaleString('es-CL')} km` : `faltan ${detalle.kmRestantes.toLocaleString('es-CL')} km`)
    if (detalle.diasRestantes != null) partes.push(detalle.diasRestantes < 0 ? `vencida hace ${Math.abs(detalle.diasRestantes)} días` : `faltan ${detalle.diasRestantes} días`)
    return partes.join(' · ') || '—'
  })()

  async function registrar(e: React.FormEvent) {
    e.preventDefault()
    if (!fechaReg) { setError('Indica la fecha de la mantención.'); return }
    setBusy(true); setError(null)
    try {
      let filePath: string | null = null
      if (file) {
        const res = await fetch('/api/mantenciones/upload-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId, fileName: file.name, contentType: file.type }),
        })
        if (!res.ok) throw new Error('upload-url')
        const { uploadUrl, filePath: fp } = await res.json()
        const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!put.ok) throw new Error('upload')
        filePath = fp
      }
      const create = await fetch('/api/mantenciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, fecha: fechaReg, km: kmReg ? Math.floor(Number(kmReg)) : null, nota: nota || null, filePath }),
      })
      if (!create.ok) throw new Error('create')
      setOpenReg(false); setFile(null); setNota(''); router.refresh()
    } catch {
      setError('No se pudo registrar la mantención.')
    } finally {
      setBusy(false)
    }
  }

  async function guardarPauta(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const pauta = (!cadaKm && !cadaMeses)
      ? null
      : { cadaKm: cadaKm ? Math.max(1, Math.floor(Number(cadaKm))) : null, cadaMeses: cadaMeses ? Math.max(1, Math.floor(Number(cadaMeses))) : null }
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pautaMantencion: pauta }),
    })
    setBusy(false)
    if (res.ok) { setOpenPauta(false); router.refresh() }
    else setError('No se pudo guardar la pauta.')
  }

  async function borrar(id: string) {
    if (!confirm('¿Eliminar esta mantención?')) return
    const res = await fetch(`/api/mantenciones/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-tinta">Mantención</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
      </div>
      <p className="text-sm text-acero">{detalleTexto}</p>
      <p className="text-sm text-acero">
        Pauta: {pautaEfectiva && (pautaEfectiva.cadaKm || pautaEfectiva.cadaMeses)
          ? [pautaEfectiva.cadaKm ? `cada ${pautaEfectiva.cadaKm.toLocaleString('es-CL')} km` : null, pautaEfectiva.cadaMeses ? `cada ${pautaEfectiva.cadaMeses} meses` : null].filter(Boolean).join(' · ')
          : 'sin definir'}
        {esOverride && <span className="ml-1 rounded bg-[#EEF0F3] px-1.5 py-0.5 text-xs text-acero">propia del vehículo</span>}
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        {puedeRegistrar && (
          <button onClick={() => setOpenReg((v) => !v)} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-azul-press">
            Registrar mantención
          </button>
        )}
        {puedeConfigurar && (
          <button onClick={() => setOpenPauta((v) => !v)} className="rounded-lg border border-linea bg-superficie px-4 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
            {esOverride ? 'Editar pauta del vehículo' : 'Pauta propia'}
          </button>
        )}
      </div>

      {openReg && puedeRegistrar && (
        <form onSubmit={registrar} className="space-y-3 rounded-xl border border-linea p-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Fecha de la mantención</label>
            <input type="date" value={fechaReg} onChange={(e) => setFechaReg(e.target.value)} required className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Kilometraje <span className="font-normal text-acero/70">(opcional)</span></label>
            <input type="number" min={0} value={kmReg} onChange={(e) => setKmReg(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Nota <span className="font-normal text-acero/70">(opcional)</span></label>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Archivo de constancia <span className="font-normal text-acero/70">(opcional)</span></label>
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-acero file:mr-3 file:rounded-lg file:border-0 file:bg-azul/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-azul hover:file:bg-azul/15" />
          </div>
          {error && <p className="text-sm text-vencido">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" onClick={() => setOpenReg(false)} className="rounded-lg border border-linea px-4 py-2 text-sm text-tinta">Cancelar</button>
          </div>
        </form>
      )}

      {openPauta && puedeConfigurar && (
        <form onSubmit={guardarPauta} className="space-y-3 rounded-xl border border-linea p-4">
          <p className="text-xs text-acero">Deja ambos vacíos para que el vehículo use la pauta estándar de la empresa.</p>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Cada cuántos km</label>
            <input type="number" min={1} value={cadaKm} onChange={(e) => setCadaKm(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Cada cuántos meses</label>
            <input type="number" min={1} value={cadaMeses} onChange={(e) => setCadaMeses(e.target.value)} className={inputCls} />
          </div>
          {error && <p className="text-sm text-vencido">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Guardar</button>
            <button type="button" onClick={() => setOpenPauta(false)} className="rounded-lg border border-linea px-4 py-2 text-sm text-tinta">Cancelar</button>
          </div>
        </form>
      )}

      {mantenciones.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-acero">Historial</p>
          {mantenciones.map((mt) => (
            <div key={mt.id} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-tinta">{fecha(mt.fecha)}</span>
                {mt.km != null && <span className="text-acero"> · {mt.km.toLocaleString('es-CL')} km</span>}
                {mt.nota && <span className="block truncate text-acero">{mt.nota}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {mt.fileUrl && <a href={mt.fileUrl} target="_blank" rel="noopener noreferrer" className="text-azul hover:underline">Constancia</a>}
                {puedeRegistrar && <button onClick={() => borrar(mt.id)} className="text-acero hover:text-[#C81E1E]" aria-label="Eliminar">✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Verificar tsc + build + lint**

Run: `npx tsc --noEmit && npx eslint app components && npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add components/vehicle/MantencionPanel.tsx app/(app)/vehiculos/[id]/page.tsx
git commit -m "feat(mantencion): panel de mantención en la ficha del vehículo"
```

---

## Task 6: Vista de flota + link en la barra

**Files:**
- Create: `app/(app)/mantenciones/page.tsx`
- Modify: `components/AppNav.tsx`

**Interfaces:**
- Consumes: `listVehicles`, `getCompany`, `ultimaMantencion`, `estadoMantencion`.

- [ ] **Step 1: Añadir link en `components/AppNav.tsx`**

Añade a `LINKS`: `{ href: '/mantenciones', label: 'Mantención' }` (tras Reportes).

- [ ] **Step 2: `app/(app)/mantenciones/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMembership } from '@/lib/auth/membership'
import { listVehicles } from '@/lib/data/vehicles'
import { getCompany } from '@/lib/data/companies'
import { ultimaMantencion } from '@/lib/data/mantenciones'
import { estadoMantencion, type EstadoMantencion } from '@/lib/mantencion/status'
import BackLink from '@/components/BackLink'

export const dynamic = 'force-dynamic'

const ORDEN: Record<EstadoMantencion, number> = { vencida: 0, proxima: 1, al_dia: 2, sin_registro: 3, sin_pauta: 4 }
const BADGE: Record<EstadoMantencion, { label: string; cls: string }> = {
  vencida: { label: 'Vencida', cls: 'bg-[#FCE7E7] text-[#C81E1E]' },
  proxima: { label: 'Próxima', cls: 'bg-[#FDF1DC] text-[#B45309]' },
  al_dia: { label: 'Al día', cls: 'bg-[#E6F4EA] text-[#15803D]' },
  sin_registro: { label: 'Sin registro', cls: 'bg-[#EEF0F3] text-acero' },
  sin_pauta: { label: 'Sin pauta', cls: 'bg-[#EEF0F3] text-acero' },
}

export default async function MantencionesPage() {
  const m = await getMembership()
  if (!m) redirect('/login')
  const [vehicles, company] = await Promise.all([listVehicles(m.companyId), getCompany(m.companyId)])
  const now = new Date()

  const filas = await Promise.all(
    vehicles.map(async (v) => {
      const pauta = v.pautaMantencion ?? company?.pautaMantencion ?? null
      const ultima = await ultimaMantencion(v.id)
      const { estado, detalle } = estadoMantencion({ pauta, ultima, kmActual: v.kmActual ?? null, now })
      const partes: string[] = []
      if (detalle.kmRestantes != null) partes.push(detalle.kmRestantes <= 0 ? `pasada ${Math.abs(detalle.kmRestantes).toLocaleString('es-CL')} km` : `faltan ${detalle.kmRestantes.toLocaleString('es-CL')} km`)
      if (detalle.diasRestantes != null) partes.push(detalle.diasRestantes < 0 ? `hace ${Math.abs(detalle.diasRestantes)} días` : `faltan ${detalle.diasRestantes} días`)
      return { id: v.id, patente: v.patente, marca: v.marca, modelo: v.modelo, estado, detalle: partes.join(' · ') }
    }),
  )
  filas.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.patente.localeCompare(b.patente, 'es'))

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <BackLink />
      <h1 className="mb-4 mt-5 text-2xl font-bold tracking-tight text-tinta">Mantención de la flota</h1>
      <div className="space-y-2">
        {filas.map((f) => (
          <Link key={f.id} href={`/vehiculos/${f.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-linea bg-superficie p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="min-w-0">
              <p className="truncate font-semibold text-tinta">{f.marca} {f.modelo} · {f.patente}</p>
              {f.detalle && <p className="truncate text-sm text-acero">{f.detalle}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[f.estado].cls}`}>{BADGE[f.estado].label}</span>
          </Link>
        ))}
        {filas.length === 0 && <p className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-10 text-center text-sm text-acero">Aún no hay vehículos.</p>}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verificar tsc + build + lint**

Run: `npx tsc --noEmit && npx eslint app components && npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/mantenciones/page.tsx components/AppNav.tsx
git commit -m "feat(mantencion): vista de flota + link en la barra"
```

---

## Task 7: Recordatorio por email (cron)

**Files:**
- Create: `lib/mantencion/reminders.ts`, `lib/mantencion/runReminders.ts`, `lib/email/mantencionEmail.ts`
- Test: `lib/mantencion/__tests__/reminders.test.ts`, `lib/mantencion/__tests__/runReminders.test.ts`
- Modify: `lib/email/resend.ts`, `app/api/cron/reminders/route.ts`

**Interfaces:**
- Consumes: `estadoMantencion` (Task 1), `listCompaniasParaMantencion` (Task 2), `listVehicles`, `ultimaMantencion`, `alertRecipientEmails`, `updateVehicle`.
- Produces: `hitoMantencion(estado, enviados): 'proxima'|'vencida'|null`; `processMantencionReminders(deps, now): Promise<{ sent: number }>`; `sendMantencionEmail(to, params)`.

- [ ] **Step 1: `lib/mantencion/reminders.ts` + test**

Test (`lib/mantencion/__tests__/reminders.test.ts`):

```typescript
import { describe, it, expect } from 'vitest'
import { hitoMantencion } from '@/lib/mantencion/reminders'

describe('hitoMantencion', () => {
  it('vencida no enviada → vencida', () => { expect(hitoMantencion('vencida', [])).toBe('vencida') })
  it('próxima no enviada → proxima', () => { expect(hitoMantencion('proxima', [])).toBe('proxima') })
  it('no repite un hito ya enviado', () => {
    expect(hitoMantencion('proxima', ['proxima'])).toBeNull()
    expect(hitoMantencion('vencida', ['vencida'])).toBeNull()
  })
  it('al día / sin pauta / sin registro → null', () => {
    expect(hitoMantencion('al_dia', [])).toBeNull()
    expect(hitoMantencion('sin_pauta', [])).toBeNull()
    expect(hitoMantencion('sin_registro', [])).toBeNull()
  })
})
```

Implementación:

```typescript
import type { EstadoMantencion } from '@/lib/mantencion/status'

export function hitoMantencion(estado: EstadoMantencion, enviados: string[]): 'proxima' | 'vencida' | null {
  if (estado === 'vencida' && !enviados.includes('vencida')) return 'vencida'
  if (estado === 'proxima' && !enviados.includes('proxima')) return 'proxima'
  return null
}
```

- [ ] **Step 2: `lib/mantencion/runReminders.ts` + test**

Test (`lib/mantencion/__tests__/runReminders.test.ts`):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { processMantencionReminders } from '@/lib/mantencion/runReminders'

describe('processMantencionReminders', () => {
  it('envía solo hitos nuevos y marca el hito', async () => {
    const sendMantencionEmail = vi.fn().mockResolvedValue(undefined)
    const markHito = vi.fn().mockResolvedValue(undefined)
    const now = new Date('2026-07-09T12:00:00Z')
    const res = await processMantencionReminders({
      allCompanies: async () => [{ id: 'c1', ownerUid: 'o1', pauta: { cadaMeses: 6 } }],
      vehiclesOf: async () => [
        { id: 'v1', companyId: 'c1', patente: 'AA', pautaMantencion: null, kmActual: null, mantencionReminders: [] } as never,
        { id: 'v2', companyId: 'c1', patente: 'BB', pautaMantencion: null, kmActual: null, mantencionReminders: ['vencida'] } as never,
      ],
      ultimaMantencion: async () => ({ km: null, fecha: '2026-01-01' }), // próxima era 2026-07-01 → vencida
      recipients: async () => ['a@b.cl'],
      sendMantencionEmail,
      markHito,
    }, now)
    expect(res.sent).toBe(1) // v1 manda 'vencida'; v2 ya lo tenía
    expect(sendMantencionEmail).toHaveBeenCalledTimes(1)
    expect(markHito).toHaveBeenCalledWith('v1', 'c1', ['vencida'])
  })
})
```

Implementación:

```typescript
import { estadoMantencion } from '@/lib/mantencion/status'
import { hitoMantencion } from '@/lib/mantencion/reminders'
import type { PautaMantencion, Vehicle } from '@/lib/types'

export interface MantencionReminderDeps {
  allCompanies: () => Promise<{ id: string; ownerUid: string; pauta: PautaMantencion | null }[]>
  vehiclesOf: (companyId: string) => Promise<Vehicle[]>
  ultimaMantencion: (vehicleId: string) => Promise<{ km: number | null; fecha: string } | null>
  recipients: (companyId: string, ownerUid: string) => Promise<string[]>
  sendMantencionEmail: (to: string, p: { patente: string; vehicleId: string; estado: 'proxima' | 'vencida'; detalle: string }) => Promise<void>
  markHito: (vehicleId: string, companyId: string, hitos: string[]) => Promise<void>
}

export async function processMantencionReminders(deps: MantencionReminderDeps, now: Date): Promise<{ sent: number }> {
  const companies = await deps.allCompanies()
  let sent = 0
  for (const c of companies) {
    const vehicles = await deps.vehiclesOf(c.id)
    let emails: string[] | null = null
    for (const v of vehicles) {
      const pauta = v.pautaMantencion ?? c.pauta ?? null
      const ultima = await deps.ultimaMantencion(v.id)
      const { estado, detalle } = estadoMantencion({ pauta, ultima, kmActual: v.kmActual ?? null, now })
      if (estado !== 'proxima' && estado !== 'vencida') continue
      const enviados = v.mantencionReminders ?? []
      const hito = hitoMantencion(estado, enviados)
      if (!hito) continue
      if (emails === null) emails = await deps.recipients(c.id, c.ownerUid)
      if (emails.length === 0) continue
      const texto = detalle.kmRestantes != null && detalle.kmRestantes <= 0 ? 'kilometraje cumplido'
        : detalle.diasRestantes != null && detalle.diasRestantes < 0 ? 'fecha cumplida' : 'pronto'
      for (const to of emails) {
        await deps.sendMantencionEmail(to, { patente: v.patente, vehicleId: v.id, estado: hito, detalle: texto })
      }
      await deps.markHito(v.id, c.id, [...enviados, hito])
      sent++
    }
  }
  return { sent }
}
```

- [ ] **Step 3: `lib/email/mantencionEmail.ts` + `sendMantencionEmail`**

```typescript
import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

export function mantencionSubject(estado: 'proxima' | 'vencida', patente: string): string {
  return `TapCar · Mantención ${estado === 'vencida' ? 'vencida' : 'próxima'} — ${patente}`
}

export function mantencionHtml(p: { patente: string; vehicleId: string; estado: 'proxima' | 'vencida'; detalle: string }): string {
  return emailLayout({
    titulo: p.estado === 'vencida' ? 'Mantención vencida' : 'Mantención próxima',
    contenidoHtml: `
      <p>La mantención del vehículo <strong>${p.patente}</strong> está <strong>${p.estado === 'vencida' ? 'vencida' : 'próxima'}</strong> (${p.detalle}).</p>
      ${ctaButton('Ver el vehículo', `${appUrl()}/vehiculos/${p.vehicleId}`)}
    `,
    motivo: 'Recibes este correo porque tienes activados los avisos de tu flota en TapCar.',
  })
}
```

En `lib/email/resend.ts` añade:

```typescript
import { mantencionSubject, mantencionHtml } from '@/lib/email/mantencionEmail'

export async function sendMantencionEmail(
  to: string,
  p: { patente: string; vehicleId: string; estado: 'proxima' | 'vencida'; detalle: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: mantencionSubject(p.estado, p.patente),
    html: mantencionHtml(p),
  })
}
```

- [ ] **Step 4: Cablear en el cron** (`app/api/cron/reminders/route.ts`)

Tras el `processReminders` existente, añade el pase de mantención y suma ambos resultados:

```typescript
import { processMantencionReminders } from '@/lib/mantencion/runReminders'
import { listCompaniasParaMantencion } from '@/lib/data/companies'
import { listVehicles } from '@/lib/data/vehicles'
import { ultimaMantencion } from '@/lib/data/mantenciones'
import { alertRecipientEmails } from '@/lib/data/members'
import { updateVehicle } from '@/lib/data/vehicles'
import { sendMantencionEmail } from '@/lib/email/resend'
// ... dentro del GET, tras obtener `result`:
  const mant = await processMantencionReminders(
    {
      allCompanies: listCompaniasParaMantencion,
      vehiclesOf: listVehicles,
      ultimaMantencion,
      recipients: alertRecipientEmails,
      sendMantencionEmail,
      markHito: (vehicleId, companyId, hitos) => updateVehicle(vehicleId, companyId, { mantencionReminders: hitos as ('proxima' | 'vencida')[] }),
    },
    new Date(),
  )
  return NextResponse.json({ documentos: result, mantenciones: mant })
```

Nota: `updateVehicle(id, companyId, patch)` valida `companyId`; `mantencionReminders` debe estar permitido en el `Partial<VehicleInput>`. Si `VehicleInput` excluye `mantencionReminders`, amplía el tipo del patch de `updateVehicle` para aceptarlo (o castea el patch), sin romper el resto.

- [ ] **Step 5: Verificar tests + tsc + build**

Run: `npx vitest run lib/mantencion && npx tsc --noEmit && npx eslint app lib && npm run build`
Expected: PASS / OK.

- [ ] **Step 6: Commit**

```bash
git add lib/mantencion/reminders.ts lib/mantencion/runReminders.ts lib/mantencion/__tests__ lib/email/mantencionEmail.ts lib/email/resend.ts app/api/cron/reminders/route.ts
git commit -m "feat(mantencion): recordatorio por email en el cron diario"
```

---

## Task 8: Documentación

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documentar en `CLAUDE.md`**

Añade en las secciones correspondientes (Arquitectura, Modelo de datos, componentes, gotchas si aplica):
- `lib/mantencion/` (status + reminders + runReminders puros).
- `lib/data/mantenciones.ts` (CRUD + cascada) y su inclusión en `deleteVehicle`/`deleteCompanyCascade`.
- `Company.pautaMantencion`, `Vehicle.pautaMantencion`/`mantencionReminders`, `mantenciones/{id}`.
- Endpoints `/api/mantenciones*` y que `PATCH /api/vehicles/[id]` ahora usa whitelist.
- UI: `PautaMantencionCard`, `MantencionPanel`, página `/mantenciones` + link en `AppNav`.
- Cron: pase de mantención (dedup con `mantencionReminders`, reset al registrar).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: pauta de mantención"
```

---

## Notas de verificación final (whole-branch)

- Suite completa: `npm test` (todo verde salvo `rules.test.ts`, que necesita emulador/Java — ambiental).
- `npx tsc --noEmit`, `npx eslint app components lib`, `npm run build` limpios.
- La UI vive tras login: la verificación es estática + unitaria + build (no se puede manejar el flujo real en preview).
- Higiene de Storage: confirmar que `deleteVehicle`/`deleteCompanyCascade` incluyen la cascada de `mantenciones` (sin archivos huérfanos), consistente con la de documentos/usos.
