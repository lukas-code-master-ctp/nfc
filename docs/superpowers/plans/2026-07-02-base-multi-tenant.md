# Base multi-tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir TapCar de "flota por persona" a "flota por empresa" con roles (admin/editor/viewer), moviendo facturación y datos de empresa a la empresa, sin romper la ficha pública.

**Architecture:** Estrategia **aditiva/transición**: se agregan `companyId`/`role` como campos opcionales, se crea la entidad `companies`, se migran los datos existentes, se cambia la capa de datos + API a `companyId` + permisos por rol, y recién al final se elimina lo viejo (`ownerUid` como clave de acceso, `company`/`plan` en el user). Así el `build` queda verde entre tareas. El enforcement de permisos vive en la capa `/api` (Admin SDK server-side); Firestore rules son defensa en profundidad.

**Tech Stack:** Next.js 16 (App Router, TS estricto), Firebase Admin SDK, Firestore, Vitest.

## Global Constraints

- **Next 16 `params`/`cookies()` async**: `await params`, `await cookies()`.
- **jose fijo en v5** (`overrides` en package.json) — no tocar.
- **Init lazy de Firebase** (patrón Proxy) — no inicializar en module-scope.
- **Español neutro (Chile), "tú"** en toda UI/copy/comentarios.
- **Enforcement en `/api`** — nunca confiar en el cliente para `companyId`/rol.
- **Distinguir** el rol `admin` **de empresa** del admin **de plataforma** (`ADMIN_EMAILS`, `lib/auth/admin.ts` → `isAdminEmail`). Son cosas distintas.
- Tras cada tarea: `npx tsc --noEmit` y `npm run build` deben pasar antes de commitear.
- Alcance: solo Base multi-tenant. **Invitaciones (sub-2) y config de alertas (sub-3) NO se implementan aquí.** En esta base cada empresa tiene un único miembro (rol `admin`).

---

### Task 1: Roles puros — `can(role, action)`

**Files:**
- Create: `lib/auth/roles.ts`
- Test: `lib/auth/__tests__/roles.test.ts`

**Interfaces:**
- Produces: `type Role = 'admin' | 'editor' | 'viewer'`; `type Action = 'read' | 'document:write' | 'vehicle:write' | 'billing:manage' | 'team:manage'`; `can(role: Role, action: Action): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/auth/__tests__/roles.test.ts
import { describe, it, expect } from 'vitest'
import { can } from '@/lib/auth/roles'

describe('can', () => {
  it('viewer solo lee', () => {
    expect(can('viewer', 'read')).toBe(true)
    expect(can('viewer', 'document:write')).toBe(false)
    expect(can('viewer', 'vehicle:write')).toBe(false)
    expect(can('viewer', 'billing:manage')).toBe(false)
  })
  it('editor lee y escribe documentos, no vehículos ni facturación', () => {
    expect(can('editor', 'read')).toBe(true)
    expect(can('editor', 'document:write')).toBe(true)
    expect(can('editor', 'vehicle:write')).toBe(false)
    expect(can('editor', 'billing:manage')).toBe(false)
    expect(can('editor', 'team:manage')).toBe(false)
  })
  it('admin puede todo', () => {
    for (const a of ['read', 'document:write', 'vehicle:write', 'billing:manage', 'team:manage'] as const) {
      expect(can('admin', a)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/__tests__/roles.test.ts`
Expected: FAIL (`can` no existe / módulo no encontrado).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/auth/roles.ts
// Roles de un miembro DENTRO de una empresa (distinto del admin de plataforma).
export type Role = 'admin' | 'editor' | 'viewer'
export type Action = 'read' | 'document:write' | 'vehicle:write' | 'billing:manage' | 'team:manage'

const MATRIX: Record<Role, Set<Action>> = {
  viewer: new Set<Action>(['read']),
  editor: new Set<Action>(['read', 'document:write']),
  admin: new Set<Action>(['read', 'document:write', 'vehicle:write', 'billing:manage', 'team:manage']),
}

export function can(role: Role, action: Action): boolean {
  return MATRIX[role]?.has(action) ?? false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/__tests__/roles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/roles.ts lib/auth/__tests__/roles.test.ts
git commit -m "feat(roles): lógica pura can(role, action) para roles de empresa"
```

---

### Task 2: Tipos — `Company`, campos nuevos opcionales (aditivo)

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: `Role` de `lib/auth/roles.ts`.
- Produces: `interface Company { id; ownerUid; company: CompanyData; plan: PlanData; createdAt }`. `UserProfile` gana `companyId?: string` y `role?: Role` (opcionales durante la transición). `Vehicle` y `VehicleDocument` ganan `companyId?: string` y `createdByUid?: string` (opcionales).

- [ ] **Step 1: Add the Company interface and Role import**

En `lib/types.ts`, agregar cerca de `UserProfile`:

```ts
import type { Role } from '@/lib/auth/roles'

export interface Company {
  id: string
  ownerUid: string        // Administrador que la creó
  company: CompanyData
  plan: PlanData
  createdAt: string | null
}
```

- [ ] **Step 2: Extend UserProfile, Vehicle, VehicleDocument (opcionales)**

En `UserProfile` agregar (sin quitar aún `company`/`plan`):

```ts
  companyId?: string
  role?: Role
```

En `Vehicle` agregar:

```ts
  companyId?: string
  createdByUid?: string
```

En `VehicleDocument` agregar:

```ts
  companyId?: string
  createdByUid?: string
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS (los campos son opcionales, nada se rompe).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): Company + campos companyId/role/createdByUid (aditivo)"
```

---

### Task 3: Capa de datos de empresa — `lib/data/companies.ts`

**Files:**
- Create: `lib/data/companies.ts`

**Interfaces:**
- Consumes: `Company`, `CompanyData`, `PlanData`, `DEFAULT_PLAN`, `EMPTY_COMPANY` de `lib/types`.
- Produces: `getCompany(companyId: string): Promise<Company | null>`; `saveCompany(companyId: string, patch: { company?: CompanyData; plan?: PlanData }): Promise<void>`; `createCompany(ownerUid: string, data: { company: CompanyData; plan: PlanData }): Promise<string>`.

- [ ] **Step 1: Write the module**

```ts
// lib/data/companies.ts
import { adminDb } from '@/lib/firebase/admin'
import { DEFAULT_PLAN, EMPTY_COMPANY, type Company, type CompanyData, type PlanData } from '@/lib/types'

const COL = 'companies'

export async function getCompany(companyId: string): Promise<Company | null> {
  const doc = await adminDb.collection(COL).doc(companyId).get()
  if (!doc.exists) return null
  const d = doc.data()!
  return {
    id: doc.id,
    ownerUid: d.ownerUid,
    company: { ...EMPTY_COMPANY, ...(d.company ?? {}) },
    plan: { ...DEFAULT_PLAN, ...(d.plan ?? {}) },
    createdAt: d.createdAt ?? null,
  }
}

export async function createCompany(
  ownerUid: string,
  data: { company: CompanyData; plan: PlanData },
): Promise<string> {
  const ref = await adminDb.collection(COL).add({
    ownerUid,
    company: data.company,
    plan: { maxVehiculos: Math.max(1, Math.floor(data.plan.maxVehiculos)) },
    createdAt: new Date().toISOString(),
  })
  return ref.id
}

// Solo un Administrador de la empresa llama esto (validado en la capa /api).
export async function saveCompany(
  companyId: string,
  patch: { company?: CompanyData; plan?: PlanData },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.company !== undefined) data.company = patch.company
  if (patch.plan !== undefined) data.plan = { maxVehiculos: Math.max(1, Math.floor(patch.plan.maxVehiculos)) }
  await adminDb.collection(COL).doc(companyId).set(data, { merge: true })
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/data/companies.ts
git commit -m "feat(data): capa companies (get/create/save)"
```

---

### Task 4: `getMembership()` — resolver empresa + rol desde la sesión

**Files:**
- Create: `lib/auth/membership.ts`
- Test: `lib/auth/__tests__/membership.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser` de `lib/auth/session`, `adminDb` de `lib/firebase/admin`, `Role`.
- Produces: `getMembership(): Promise<Membership | null>` donde `interface Membership { uid: string; email: string; companyId: string; role: Role }`. Devuelve `null` si no hay sesión o el user no tiene `companyId`/`role`.

- [ ] **Step 1: Write the failing test (con mocks)**

```ts
// lib/auth/__tests__/membership.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  userDoc: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: mocks.userDoc }) }) },
}))

import { getMembership } from '@/lib/auth/membership'

beforeEach(() => {
  mocks.getCurrentUser.mockReset()
  mocks.userDoc.mockReset()
})

it('devuelve null sin sesión', async () => {
  mocks.getCurrentUser.mockResolvedValue(null)
  expect(await getMembership()).toBeNull()
})

it('devuelve null si el user no tiene companyId', async () => {
  mocks.getCurrentUser.mockResolvedValue({ uid: 'u1', email: 'a@x.cl' })
  mocks.userDoc.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) })
  expect(await getMembership()).toBeNull()
})

it('resuelve membership completo', async () => {
  mocks.getCurrentUser.mockResolvedValue({ uid: 'u1', email: 'a@x.cl' })
  mocks.userDoc.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', role: 'editor' }) })
  expect(await getMembership()).toEqual({ uid: 'u1', email: 'a@x.cl', companyId: 'c1', role: 'editor' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/__tests__/membership.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Write implementation**

```ts
// lib/auth/membership.ts
import { getCurrentUser } from '@/lib/auth/session'
import { adminDb } from '@/lib/firebase/admin'
import type { Role } from '@/lib/auth/roles'

export interface Membership {
  uid: string
  email: string
  companyId: string
  role: Role
}

export async function getMembership(): Promise<Membership | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const doc = await adminDb.collection('users').doc(user.uid).get()
  if (!doc.exists) return null
  const d = doc.data()!
  if (!d.companyId || !d.role) return null
  return { uid: user.uid, email: user.email, companyId: d.companyId, role: d.role as Role }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/__tests__/membership.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/membership.ts lib/auth/__tests__/membership.test.ts
git commit -m "feat(auth): getMembership() resuelve companyId + role desde la sesión"
```

---

### Task 5: Script de migración (idempotente)

**Files:**
- Create: `scripts/migrate-multitenant.mjs`

**Interfaces:**
- Consume: credenciales via las mismas env vars que `lib/firebase/admin` (`FIREBASE_*`). Se corre a mano: `node scripts/migrate-multitenant.mjs`.

- [ ] **Step 1: Write the migration script**

```js
// scripts/migrate-multitenant.mjs
// Migración one-time a multi-tenant. Idempotente: si un user ya tiene companyId, se salta.
// Por cada user: crea su company (con su company/plan actuales), lo marca admin,
// y estampa companyId + createdByUid en sus vehicles y documents.
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
if (!projectId || !clientEmail || !privateKey) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  process.exit(1)
}
if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
const db = getFirestore()

const DEFAULT_PLAN = { maxVehiculos: 3 }
const EMPTY_COMPANY = { razonSocial: '', rut: '', giro: '', direccion: '', telefono: '' }

async function stampCollection(col, uid, companyId) {
  const snap = await db.collection(col).where('ownerUid', '==', uid).get()
  let n = 0
  for (const doc of snap.docs) {
    if (doc.data().companyId) continue
    await doc.ref.update({ companyId, createdByUid: uid })
    n++
  }
  return n
}

async function main() {
  const users = await db.collection('users').get()
  let migrated = 0
  for (const u of users.docs) {
    const d = u.data()
    if (d.companyId) { console.log(`- ${u.id}: ya migrado, skip`); continue }
    const companyRef = await db.collection('companies').add({
      ownerUid: u.id,
      company: { ...EMPTY_COMPANY, ...(d.company ?? {}) },
      plan: { ...DEFAULT_PLAN, ...(d.plan ?? {}) },
      createdAt: new Date().toISOString(),
    })
    await u.ref.set({ companyId: companyRef.id, role: 'admin' }, { merge: true })
    const v = await stampCollection('vehicles', u.id, companyRef.id)
    const docs = await stampCollection('documents', u.id, companyRef.id)
    console.log(`+ ${u.id} → company ${companyRef.id} (${v} vehículos, ${docs} documentos)`)
    migrated++
  }
  // Vehículos/documentos sin dueño en users (por si acaso): reportar, no tocar.
  console.log(`Listo. ${migrated} usuario(s) migrado(s).`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Dry-run mental / revisar contra un usuario**

No hay test automatizado (script one-time). Verificar leyendo: idempotencia (`if (d.companyId) skip`, `if (doc.data().companyId) continue`), y que crea company antes de estampar. **No correr todavía contra producción** — se corre en Task 12 (cutover), tras validar en local/emulador si está disponible.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-multitenant.mjs
git commit -m "feat(migración): script one-time idempotente a multi-tenant"
```

---

### Task 6: Cupo por empresa — `lib/plan.ts`

**Files:**
- Modify: `lib/plan.ts`
- Modify: `lib/plan.ts` test si existe, o Create `lib/__tests__/plan.test.ts`

**Interfaces:**
- Produces: `maxVehiculosDe(plan: PlanData): number` (nuevo, toma un `PlanData` directo). Mantener `maxVehiculos(profile)` deprecado temporalmente NO — reemplazar usos (Task 8/9). `planCapacity` sin cambios.

- [ ] **Step 1: Add pure helper + test**

```ts
// lib/__tests__/plan.test.ts
import { describe, it, expect } from 'vitest'
import { maxVehiculosDe } from '@/lib/plan'

describe('maxVehiculosDe', () => {
  it('respeta mínimo 1 y piso entero', () => {
    expect(maxVehiculosDe({ maxVehiculos: 5 })).toBe(5)
    expect(maxVehiculosDe({ maxVehiculos: 0 })).toBe(1)
    expect(maxVehiculosDe({ maxVehiculos: 3.9 })).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/plan.test.ts`
Expected: FAIL (`maxVehiculosDe` no existe).

- [ ] **Step 3: Implement**

En `lib/plan.ts` agregar:

```ts
import { DEFAULT_PLAN, type PlanData } from '@/lib/types'

export function maxVehiculosDe(plan: PlanData | undefined): number {
  const n = plan?.maxVehiculos ?? DEFAULT_PLAN.maxVehiculos
  return Math.max(1, Math.floor(n))
}
```

(Dejar `maxVehiculos(profile)` existente por ahora; se elimina en Task 11 al cortar `plan` del profile.)

- [ ] **Step 4: Run test + build**

Run: `npx vitest run lib/__tests__/plan.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/plan.ts lib/__tests__/plan.test.ts
git commit -m "feat(plan): maxVehiculosDe(plan) para cupo por empresa"
```

---

### Task 7: Capa de datos scopeada por `companyId`

**Files:**
- Modify: `lib/data/vehicles.ts`
- Modify: `lib/data/documents.ts`

**Interfaces:**
- Consumes: `getMembership`/`companyId` desde los callers (API).
- Produces: `listVehicles(companyId)`, `createVehicle(companyId, createdByUid, data)`, `assertCompany(vehicleId, companyId)` (reemplaza `assertOwner`); análogo en documents. `getVehicleByToken` sin cambios (público por token).

- [ ] **Step 1: Modificar `lib/data/vehicles.ts`**

Cambiar las firmas y queries de `ownerUid` a `companyId`:

```ts
// toVehicle: mapear companyId + createdByUid
function toVehicle(id, data) {
  return {
    id,
    companyId: data.companyId,
    createdByUid: data.createdByUid ?? data.ownerUid ?? null,
    patente: data.patente, marca: data.marca, modelo: data.modelo,
    anio: data.anio, color: data.color, info: data.info ?? {},
    publicToken: data.publicToken, createdAt: data.createdAt,
  }
}

export async function createVehicle(companyId, createdByUid, data) {
  const publicToken = nanoid(21)
  const createdAt = new Date().toISOString()
  const ref = await adminDb.collection(COL).add({ ...data, companyId, createdByUid, publicToken, createdAt })
  return { id: ref.id, companyId, createdByUid, publicToken, createdAt, ...data }
}

export async function listVehicles(companyId) {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.docs.map((d) => toVehicle(d.id, d.data()))
}

async function assertCompany(vehicleId, companyId) {
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== companyId) throw new Error('forbidden')
  return v
}
// updateVehicle(vehicleId, companyId, patch), deleteVehicle(vehicleId, companyId),
// regenerateToken(vehicleId, companyId) → usan assertCompany.
```

`vehicleInfoForReminder(vehicleId)`: resolver el email del **owner de la empresa** — leer `companies/{v.companyId}.ownerUid` → `adminAuth.getUser(ownerUid).email`. (La selección configurable es sub-3.)

- [ ] **Step 2: Modificar `lib/data/documents.ts`**

Análogo: `listDocuments` sigue por `vehicleId` (los documentos cuelgan del vehículo), pero `createDocument`/`updateDocument`/`deleteDocument` validan pertenencia vía `companyId` en vez de `ownerUid`. Firmas: `createDocument(companyId, createdByUid, data)`, `updateDocument(id, companyId, patch)`, `deleteDocument(id, companyId)`. `assertOwner` → `assertCompany` (chequea el doc.companyId).

- [ ] **Step 3: Typecheck (fallará en los callers — esperado)**

Run: `npx tsc --noEmit`
Expected: FAIL en `app/api/*` y páginas que aún llaman con `ownerUid`. Se arreglan en Task 8-10. **No commitear hasta que compile** → esta tarea se fusiona con Task 8 para el commit, o se dejan los callers con un shim temporal. Para mantener commits verdes: hacer Task 7 + Task 8 juntas antes de commitear.

- [ ] **Step 4: (Ver Task 8 para el commit conjunto)**

---

### Task 8: API — membership + permisos por rol (vehicles y documents)

**Files:**
- Modify: `app/api/vehicles/route.ts`
- Modify: `app/api/vehicles/[id]/route.ts`
- Modify: `app/api/vehicles/[id]/token/route.ts`
- Modify: `app/api/documents/route.ts`
- Modify: `app/api/documents/[id]/route.ts`
- Modify: `app/api/documents/upload-url/route.ts`

**Interfaces:**
- Consumes: `getMembership`, `can`, `getCompany`, `maxVehiculosDe`, capa de datos scopeada (Task 7).

- [ ] **Step 1: `POST /api/vehicles` (crear vehículo = `vehicle:write`, admin)**

```ts
const m = await getMembership()
if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
// cupo por empresa:
const [vehicles, company] = await Promise.all([listVehicles(m.companyId), getCompany(m.companyId)])
const limit = maxVehiculosDe(company?.plan)
if (vehicles.length >= limit) return NextResponse.json({ error: 'plan_limit', limit }, { status: 409 })
const vehicle = await createVehicle(m.companyId, m.uid, { patente, marca, modelo, anio: Number(anio) || 0, color: color ?? '' })
```
`GET /api/vehicles`: `getMembership()` + `listVehicles(m.companyId)` (cualquier rol, `read`).

- [ ] **Step 2: `PATCH/DELETE /api/vehicles/[id]` y `/token`**

- `PATCH` (editar `info` del vehículo) = `vehicle:write` (admin). `updateVehicle(id, m.companyId, patch)`.
- `DELETE` = `vehicle:write` (admin). `deleteVehicle(id, m.companyId)`.
- `POST /token` (regenerar) = `vehicle:write` (admin). `regenerateToken(id, m.companyId)`.
- `GET` = `read`.

- [ ] **Step 3: documents endpoints**

- `POST /api/documents` = `document:write` (editor+). Validar que el vehículo pertenece a `m.companyId` (via `getVehicle(vehicleId).companyId === m.companyId`). `createDocument(m.companyId, m.uid, {...})`. Mantener el forzado de Padrón sin fecha (`tipoTieneVencimiento`).
- `PATCH/DELETE /api/documents/[id]` = `document:write`. `updateDocument(id, m.companyId, patch)` / `deleteDocument(id, m.companyId)`.
- `POST /api/documents/upload-url` = `document:write`; validar vehículo de la empresa.

- [ ] **Step 4: Typecheck + build (ya con Task 7)**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit (Task 7 + 8 juntas)**

```bash
git add lib/data/vehicles.ts lib/data/documents.ts app/api/vehicles app/api/documents
git commit -m "feat(api): flota y documentos scopeados por companyId + permisos por rol"
```

---

### Task 9: Páginas de flota — leer por empresa + acciones por rol

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `app/(app)/vehiculos/[id]/page.tsx`
- Modify: `components/VehiclesBoard.tsx`
- Modify: `components/DocumentList.tsx`, `components/DocumentForm.tsx`, `components/DeleteVehicleButton.tsx`, `components/VehicleInfoForm.tsx`

**Interfaces:**
- Consumes: `getMembership`, `getCompany`, `maxVehiculosDe`, `can`.

- [ ] **Step 1: Dashboard**

```ts
const m = await getMembership()
if (!m) redirect('/login')
const [vehicles, company] = await Promise.all([listVehicles(m.companyId), getCompany(m.companyId)])
const limit = maxVehiculosDe(company?.plan)
// ...items igual... pasar canWrite={can(m.role,'vehicle:write')} a VehiclesBoard
```
`VehiclesBoard`: recibe `canWrite: boolean`; si es `false`, oculta "Nuevo vehículo", slots fantasma y el CTA de plan (un viewer/editor no agrega autos). El filtro/orden se mantiene.

- [ ] **Step 2: Página del vehículo — gates por rol**

`vehiculos/[id]/page.tsx`: usar `getMembership`, cargar el vehículo por `getVehicle(id)` y verificar `vehicle.companyId === m.companyId` (si no, `notFound()`). Pasar flags: `canEditDocs = can(m.role,'document:write')`, `canManageVehicle = can(m.role,'vehicle:write')`.
- `DocumentForm` / `DocumentList` (editar/eliminar docs): solo si `canEditDocs`.
- `VehicleInfoForm` (editar info) y `DeleteVehicleButton`: solo si `canManageVehicle`.
Un **Visor** ve todo en solo lectura.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/dashboard app/(app)/vehiculos components/VehiclesBoard.tsx components/DocumentList.tsx components/DocumentForm.tsx components/DeleteVehicleButton.tsx components/VehicleInfoForm.tsx
git commit -m "feat(flota): páginas por empresa con acciones según rol"
```

---

### Task 10: Datos de empresa en Configuración + Facturación por empresa

**Files:**
- Modify: `app/(app)/configuracion/page.tsx`
- Modify: `app/(app)/perfil/page.tsx`
- Modify: `components/profile/CompanyCard.tsx` → mover a `components/company/CompanyCard.tsx` (editar company de la empresa)
- Modify: `app/api/profile/route.ts`
- Create: `app/api/company/route.ts` (PATCH company data, `billing:manage`)
- Modify: `app/(app)/facturacion/page.tsx`
- Modify: `app/api/billing/request/route.ts`
- Modify: `app/api/account/route.ts`
- Modify: `lib/data/profile.ts`

**Interfaces:**
- Produces: `PATCH /api/company` (solo admin, `saveCompany(companyId, { company })`).

- [ ] **Step 1: Configuración muestra Datos de empresa (solo admin)**

`configuracion/page.tsx`: `getMembership` + `getCompany(m.companyId)`; si `can(m.role,'billing:manage')`, renderiza `<CompanyCard initial={company.company} />` (editable); si no, muestra los datos en solo lectura o nada. La CompanyCard hace `PATCH /api/company` con `{ company }`.

- [ ] **Step 2: `PATCH /api/company`**

```ts
const m = await getMembership()
if (!m) return 401
if (!can(m.role, 'billing:manage')) return 403
const { company } = await req.json()
await saveCompany(m.companyId, { company: sanitizeCompany(company) })
return NextResponse.json({ ok: true })
```
(`sanitizeCompany` se mueve/duplica desde el `PATCH /api/profile` actual.)

- [ ] **Step 3: Perfil pierde Datos de empresa**

`perfil/page.tsx`: quitar `<CompanyCard>`. `PATCH /api/profile` deja de aceptar `company` (solo `displayName`). `lib/data/profile.ts` `saveProfile` deja de manejar `company`/`plan` (se elimina en Task 11 del getProfile).

- [ ] **Step 3b: Eliminar cuenta borra la empresa**

`app/api/account/route.ts` (DELETE): usar `getMembership`; listar vehículos por `m.companyId`, `deleteVehicle(id, m.companyId)` cada uno (cascada), borrar el doc `companies/{m.companyId}`, `deleteProfile(m.uid)`, `adminAuth.deleteUser(m.uid)`, limpiar cookie. (En esta base 1 empresa = 1 usuario, así que borrar la cuenta borra la empresa completa.)

- [ ] **Step 4: Facturación por empresa**

`facturacion/page.tsx`: `getMembership` + `getCompany`; `limit = maxVehiculosDe(company?.plan)`, `used = listVehicles(m.companyId).length`. Mostrar solo si tiene sentido; el formulario de solicitud solo para `can(m.role,'billing:manage')` (admin); viewers/editors ven el plan en lectura. `POST /api/billing/request`: `getMembership` + `can(billing:manage)`; guarda `companyId` en la solicitud.

- [ ] **Step 5: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add app/(app)/configuracion app/(app)/perfil app/(app)/facturacion app/api/profile app/api/company app/api/billing components/company lib/data/profile.ts
git commit -m "feat(empresa): datos de empresa en Configuración + facturación por empresa"
```

---

### Task 11: Panel admin de plataforma por empresa + limpieza de campos viejos

**Files:**
- Modify: `lib/data/admin.ts`
- Modify: `app/(app)/admin/page.tsx`, `components/admin/AdminUsersTable.tsx`
- Modify: `app/api/admin/users/[uid]/route.ts` → `app/api/admin/companies/[id]/route.ts`
- Modify: `lib/data/profile.ts`, `lib/types.ts`, `lib/plan.ts` (quitar lo viejo)

**Interfaces:**
- Produces: `listAllCompanies(): Promise<AdminCompanyRow[]>` (empresa + razón social + owner email + conteo de vehículos + maxVehiculos). `PATCH /api/admin/companies/[id]` (plataforma-admin, setea `plan.maxVehiculos`).

- [ ] **Step 1: `listAllCompanies` en `lib/data/admin.ts`**

Cruza `companies` + conteo de `vehicles` por `companyId` + email del `ownerUid` (via `adminAuth.getUser`). Reemplaza `listAllUsers`.

- [ ] **Step 2: `/admin` lista empresas; PATCH cupo por empresa**

`admin/page.tsx` usa `listAllCompanies`; la tabla edita `maxVehiculos` vía `PATCH /api/admin/companies/[id]` → `saveCompany(id, { plan: { maxVehiculos } })` (revalida `isAdminEmail`, mínimo 1). La recaudación mensual suma `maxVehiculos` de todas las empresas × precio.

- [ ] **Step 3: Cortar lo viejo (build sigue verde porque ya nadie lo usa)**

- `lib/types.ts`: quitar `company` y `plan` de `UserProfile`; volver `companyId`/`role` **requeridos** (ya migrados); en `Vehicle`/`VehicleDocument` volver `companyId` requerido y quitar `ownerUid` del tipo (dejar `createdByUid`).
- `lib/data/profile.ts`: `getProfile` deja de devolver `company`/`plan`.
- `lib/plan.ts`: eliminar `maxVehiculos(profile)` viejo (ya reemplazado por `maxVehiculosDe`).

- [ ] **Step 4: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add lib app components/admin
git commit -m "feat(admin): panel de plataforma por empresa + limpieza de campos legacy"
```

---

### Task 12: Firestore rules + cutover (migración en prod)

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Actualizar `firestore.rules`**

Cambiar el aislamiento de `vehicles`/`documents` de `ownerUid == request.auth.uid` a scope por `companyId` (el user pertenece a la company). Como el cliente no lee la flota directo (todo Admin SDK), estas reglas son defensa en profundidad: permitir lectura/escritura solo si `request.auth != null` y el `companyId` del recurso coincide con el del user (`get(/databases/.../users/$(request.auth.uid)).data.companyId`). `companies` y `users`: el user solo su propio doc / su company.

- [ ] **Step 2: Correr los tests de reglas (emulador, si disponible)**

Run: `npm run test:rules`
Expected: PASS (actualizar los tests al nuevo scope si fallan).

- [ ] **Step 3: Cutover — correr la migración en producción**

Con las env vars de producción cargadas localmente (`FIREBASE_*`):
```bash
node scripts/migrate-multitenant.mjs
```
Verificar el output (cada usuario → company, conteos de vehículos/documentos). Idempotente: se puede re-correr sin daño.

- [ ] **Step 4: Deploy + commit**

```bash
git add firestore.rules
git commit -m "feat(seguridad): reglas Firestore por companyId + migración multi-tenant"
git push origin master
```
Desplegar `firestore.rules` (Firebase CLI) y confirmar en prod que la flota se ve correctamente con la cuenta existente (ahora Administrador de su empresa).

---

### Task 13: Actualizar CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documentar el modelo multi-tenant**

Actualizar "Modelo de datos": `companies/{id}` (company + plan), `users/{uid}` con `companyId`+`role`, `vehicles`/`documents` por `companyId`. Roles (`lib/auth/roles.ts`) y `getMembership`. Facturación/datos de empresa por empresa. Panel `/admin` por empresa. Marcar Invitaciones (sub-2) y Config de alertas (sub-3) como pendientes. Actualizar "Seguridad" (scope por companyId) y "Alcance actual" (ya no "1 empresa por usuario" en el sentido de single-user; ahora equipo con roles, 1 empresa por usuario).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: modelo multi-tenant (empresa + roles) en CLAUDE.md"
```

---

## Notas de ejecución

- **Orden importa**: Tasks 1-6 son aditivas (build verde por sí solas). Tasks 7-8 van **juntas** en un commit (el cambio de firmas rompe callers hasta arreglarlos). Tasks 9-11 van encima. Task 12 es el cutover (migración prod + reglas). Task 13 cierra docs.
- **La migración (Task 12 Step 3) es sobre datos reales** — correrla con las env de prod, revisar el output, es idempotente.
- Invitaciones (sub-2) y configuración de destinatarios de alertas (sub-3) son planes aparte que se apoyan en esta base.
