# Transferir un vehículo a otra cuenta — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para el seguimiento.

**Goal:** Que un Administrador pueda ceder un vehículo (con sus documentos y mantenciones) a la empresa de otra cuenta, previa aceptación del destinatario.

**Architecture:** Una colección `transferencias/{id}` guarda la solicitud pendiente con token y expiración a 7 días, calcada de `invitations`. Las reglas de aceptación viven puras en `lib/transferencias/estado.ts` y el movimiento de datos en `lib/data/transferirVehiculo.ts`, que reasigna `companyId` en el vehículo, sus documentos y sus mantenciones dentro de un `WriteBatch`. Los endpoints solo orquestan.

**Tech Stack:** Next 16 (App Router), TypeScript estricto, Firestore vía firebase-admin, Resend para correos, Tailwind v4 con los tokens de `app/globals.css`, Vitest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-07-27-transferir-vehiculo-design.md`](../specs/2026-07-27-transferir-vehiculo-design.md)

## Global Constraints

- **Idioma:** todo el código, UI, comentarios y mensajes en español neutro (Chile). Usa "tú", nunca "vos".
- **Nunca confiar en el cliente:** cada endpoint privado llama `getMembership()` y valida `can(role, action)` antes de mutar. El `companyId` sale siempre del servidor.
- **Permiso para transferir y para aceptar:** `vehicle:write` (solo rol `admin` de empresa).
- **Firestore Admin rechaza `undefined`:** construye los objetos sin claves `undefined` u omítelas. Usa `?? null`.
- **`publicToken` y `kmActual` NO se tocan** al transferir: el chip está pegado al vehículo y el odómetro es del fierro.
- **La bitácora de usos NO se transfiere.** Se queda con la empresa emisora.
- **Correos best-effort:** un fallo de Resend nunca revierte ni bloquea la transferencia. Siempre dentro de `try/catch`.
- **No enmascarar errores desconocidos** como un código específico: distingue el error esperado por su `message` y manda el resto a 500 con `console.error`.
- **Reutiliza `normalizeEmail`** de `@/lib/data/invitations` (ya exportada, pura). No escribas otra.
- **Colección nueva ⇒ reglas nuevas:** agregar `transferencias` a `firestore.rules` bloqueada al cliente y **desplegar** con `node --env-file=.env.local scripts/deploy-firestore-rules.mjs`.
- **Estilo visual:** tokens de `app/globals.css` (`tinta`, `acero`, `linea`, `lienzo`, `superficie`, `azul`, `vigente`, `vencido`). Iconos SVG inline, nunca emojis.
- **Tests** en `__tests__/` junto al módulo. Vitest los toma con `**/__tests__/**/*.test.{ts,tsx}`.
- **Antes de cada commit:** `npx tsc --noEmit` y `npm test` (el suite `lib/firebase/__tests__/rules.test.ts` falla sin el emulador de Firestore: es esperado en local). Antes del commit final además `npm run build` y `npx eslint app components lib`.
- **Mensajes de commit** en español, terminados con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/types.ts` (modificar) | Tipo `Transferencia`. |
| `lib/transferencias/estado.ts` (crear) | Reglas puras: `transferenciaVigente`, `puedeAceptar`. Acá vive la seguridad. |
| `lib/data/transferencias.ts` (crear) | CRUD de la colección. |
| `lib/data/transferirVehiculo.ts` (crear) | La mutación: mueve vehículo + documentos + mantenciones, limpia lo que no viaja. |
| `lib/data/usages.ts` (modificar) | `listUsages` acepta un `companyId` opcional. |
| `app/(app)/vehiculos/[id]/page.tsx` (modificar) | Pasa `m.companyId` a `listUsages` y monta el panel de transferencia. |
| `firestore.rules` (modificar) | `transferencias` bloqueada al cliente. |
| `lib/email/transferenciaEmail.ts` (crear) | Tres plantillas puras. |
| `lib/email/resend.ts` (modificar) | Tres senders. |
| `app/api/vehicles/[id]/transferir/route.ts` (crear) | `POST` crear, `DELETE` cancelar. |
| `app/api/transferencias/[token]/aceptar/route.ts` (crear) | `POST` aceptar. |
| `app/(app)/transferencias/[token]/page.tsx` (crear) | Página de aceptación (server component). |
| `components/vehicle/TransferirVehiculoPanel.tsx` (crear) | Panel en la pestaña Ajustes. |
| `components/transferencias/AceptarTransferencia.tsx` (crear) | Botón de aceptar con sus estados. |

**Nota sobre el spec:** el spec listaba además un `GET /api/transferencias/[token]`. Se elimina: la página de aceptación es un server component y lee la transferencia directo de la capa de datos, así que ese endpoint no tendría consumidor.

---

### Task 1: Tipo y reglas puras

**Files:**
- Modify: `lib/types.ts` (agregar al final, después de `Invitation`)
- Create: `lib/transferencias/estado.ts`
- Test: `lib/transferencias/__tests__/estado.test.ts`

**Interfaces:**
- Consumes: `can(role, action)` y `Role` de `@/lib/auth/roles`.
- Produces:
  - `interface Transferencia` (en `lib/types.ts`)
  - `type MotivoRechazo = 'no_pendiente' | 'expirada' | 'otro_destinatario' | 'sin_permiso' | 'plan_limit'`
  - `function transferenciaVigente(t: Transferencia, nowIso: string): boolean`
  - `function puedeAceptar(p: { transferencia: Transferencia; emailSesion: string; role: Role; vehiculosActuales: number; maxVehiculos: number; nowIso: string }): MotivoRechazo | null`

- [ ] **Step 1: Agregar el tipo**

En `lib/types.ts`, después del bloque `export interface Invitation { ... }`:

```ts
export interface Transferencia {
  id: string
  vehicleId: string
  patente: string // denormalizado: el correo y la página lo muestran sin leer el vehículo
  deCompanyId: string
  deCompanyNombre: string
  paraEmail: string // normalizado a minúsculas
  token: string
  status: 'pendiente' | 'aceptada' | 'cancelada'
  creadaPorUid: string
  createdAt: string // ISO
  expiresAt: string // ISO
  aceptadaPorUid?: string
  aceptadaEn?: string
}
```

- [ ] **Step 2: Escribir el test que falla**

Crea `lib/transferencias/__tests__/estado.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { transferenciaVigente, puedeAceptar } from '@/lib/transferencias/estado'
import type { Transferencia } from '@/lib/types'

const AHORA = '2026-07-27T12:00:00.000Z'
const FUTURO = '2026-08-03T12:00:00.000Z'
const PASADO = '2026-07-20T12:00:00.000Z'

const base: Transferencia = {
  id: 't1',
  vehicleId: 'v1',
  patente: 'ABCD-12',
  deCompanyId: 'c1',
  deCompanyNombre: 'Transportes Uno',
  paraEmail: 'nuevo@dueno.cl',
  token: 'tok',
  status: 'pendiente',
  creadaPorUid: 'u1',
  createdAt: PASADO,
  expiresAt: FUTURO,
}

const params = (over: Partial<Parameters<typeof puedeAceptar>[0]> = {}) => ({
  transferencia: base,
  emailSesion: 'nuevo@dueno.cl',
  role: 'admin' as const,
  vehiculosActuales: 2,
  maxVehiculos: 5,
  nowIso: AHORA,
  ...over,
})

describe('transferenciaVigente', () => {
  it('es true si está pendiente y no venció', () => {
    expect(transferenciaVigente(base, AHORA)).toBe(true)
  })
  it('es false si ya venció', () => {
    expect(transferenciaVigente({ ...base, expiresAt: PASADO }, AHORA)).toBe(false)
  })
  it('es false si ya fue aceptada o cancelada', () => {
    expect(transferenciaVigente({ ...base, status: 'aceptada' }, AHORA)).toBe(false)
    expect(transferenciaVigente({ ...base, status: 'cancelada' }, AHORA)).toBe(false)
  })
})

describe('puedeAceptar', () => {
  it('deja pasar el camino feliz', () => {
    expect(puedeAceptar(params())).toBeNull()
  })

  it('rechaza si no está pendiente', () => {
    expect(puedeAceptar(params({ transferencia: { ...base, status: 'cancelada' } }))).toBe('no_pendiente')
  })

  it('rechaza si venció', () => {
    expect(puedeAceptar(params({ transferencia: { ...base, expiresAt: PASADO } }))).toBe('expirada')
  })

  it('rechaza si el correo de la sesión no es el destinatario', () => {
    expect(puedeAceptar(params({ emailSesion: 'otro@dueno.cl' }))).toBe('otro_destinatario')
  })

  it('compara el correo sin distinguir mayúsculas ni espacios', () => {
    expect(puedeAceptar(params({ emailSesion: '  Nuevo@Dueno.CL ' }))).toBeNull()
  })

  it('rechaza a quien no puede gestionar vehículos', () => {
    expect(puedeAceptar(params({ role: 'editor' }))).toBe('sin_permiso')
    expect(puedeAceptar(params({ role: 'viewer' }))).toBe('sin_permiso')
  })

  it('rechaza si el plan del destinatario está lleno', () => {
    expect(puedeAceptar(params({ vehiculosActuales: 5, maxVehiculos: 5 }))).toBe('plan_limit')
    expect(puedeAceptar(params({ vehiculosActuales: 6, maxVehiculos: 5 }))).toBe('plan_limit')
  })

  it('acepta justo debajo del tope', () => {
    expect(puedeAceptar(params({ vehiculosActuales: 4, maxVehiculos: 5 }))).toBeNull()
  })
})
```

- [ ] **Step 3: Correr el test para verificar que falla**

```bash
npx vitest run lib/transferencias
```

Esperado: FAIL — `Failed to resolve import "@/lib/transferencias/estado"`.

- [ ] **Step 4: Escribir la implementación**

Crea `lib/transferencias/estado.ts`:

```ts
// Reglas puras de una transferencia de vehículo (sin Firebase). Acá vive la
// seguridad del feature: el endpoint solo orquesta y responde lo que diga esto.
import type { Transferencia } from '@/lib/types'
import { can, type Role } from '@/lib/auth/roles'

export type MotivoRechazo =
  | 'no_pendiente'
  | 'expirada'
  | 'otro_destinatario'
  | 'sin_permiso'
  | 'plan_limit'

export function transferenciaVigente(t: Transferencia, nowIso: string): boolean {
  return t.status === 'pendiente' && t.expiresAt > nowIso
}

/**
 * Devuelve el motivo por el que NO se puede aceptar, o `null` si se puede.
 * Recibe los datos ya leídos para no tocar Firestore desde acá.
 */
export function puedeAceptar(p: {
  transferencia: Transferencia
  emailSesion: string
  role: Role
  vehiculosActuales: number
  maxVehiculos: number
  nowIso: string
}): MotivoRechazo | null {
  const { transferencia: t, emailSesion, role, vehiculosActuales, maxVehiculos, nowIso } = p
  if (t.status !== 'pendiente') return 'no_pendiente'
  if (t.expiresAt <= nowIso) return 'expirada'
  // El token no basta: un enlace reenviado no puede servir para quedarse con el vehículo.
  if (emailSesion.trim().toLowerCase() !== t.paraEmail) return 'otro_destinatario'
  if (!can(role, 'vehicle:write')) return 'sin_permiso'
  if (vehiculosActuales >= maxVehiculos) return 'plan_limit'
  return null
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

```bash
npx vitest run lib/transferencias
```

Esperado: PASS, 11 tests.

- [ ] **Step 6: Verificar tipos y commitear**

```bash
npx tsc --noEmit
```

```bash
git add lib/types.ts lib/transferencias
git commit -m "feat(transferencias): tipo y reglas puras de aceptacion"
```

---

### Task 2: Capa de datos de la colección

**Files:**
- Create: `lib/data/transferencias.ts`
- Modify: `firestore.rules`
- Test: `lib/data/__tests__/transferencias.test.ts`

**Interfaces:**
- Consumes de Task 1: `Transferencia`, `transferenciaVigente`.
- Produces:
  - `createTransferencia(p: { vehicleId: string; patente: string; deCompanyId: string; deCompanyNombre: string; paraEmail: string; creadaPorUid: string }): Promise<Transferencia>`
  - `getTransferenciaByToken(token: string): Promise<Transferencia | null>`
  - `getPendienteByVehicle(vehicleId: string): Promise<Transferencia | null>`
  - `cancelTransferencia(id: string, deCompanyId: string): Promise<void>` — lanza `Error('forbidden')` si la transferencia no es de esa empresa
  - `markAceptada(id: string, aceptadaPorUid: string): Promise<void>`

- [ ] **Step 1: Escribir el test que falla**

Crea `lib/data/__tests__/transferencias.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockAdd = vi.fn()
const mockWhere = vi.fn(() => ({ get: mockGet, limit: () => ({ get: mockGet }) }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: mockWhere, add: mockAdd }) },
}))

import { getTransferenciaByToken, getPendienteByVehicle } from '@/lib/data/transferencias'

const futuro = '2999-01-01T00:00:00.000Z'
const pasado = '2000-01-01T00:00:00.000Z'

const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  data: () => ({
    vehicleId: 'v1',
    patente: 'ABCD-12',
    deCompanyId: 'c1',
    deCompanyNombre: 'Uno',
    paraEmail: 'a@b.cl',
    token: 'tok',
    status: 'pendiente',
    creadaPorUid: 'u1',
    createdAt: pasado,
    expiresAt: futuro,
    ...over,
  }),
})

beforeEach(() => {
  mockGet.mockReset()
  mockAdd.mockReset()
  mockWhere.mockClear()
})

describe('getTransferenciaByToken', () => {
  it('devuelve null si no existe', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })
    expect(await getTransferenciaByToken('tok')).toBeNull()
  })

  it('mapea el documento, incluso si ya no está pendiente', async () => {
    mockGet.mockResolvedValue({ empty: false, docs: [doc('t1', { status: 'aceptada' })] })
    const t = await getTransferenciaByToken('tok')
    expect(t?.id).toBe('t1')
    expect(t?.status).toBe('aceptada')
    expect(t?.patente).toBe('ABCD-12')
  })
})

describe('getPendienteByVehicle', () => {
  it('ignora las expiradas', async () => {
    mockGet.mockResolvedValue({ docs: [doc('t1', { expiresAt: pasado })] })
    expect(await getPendienteByVehicle('v1')).toBeNull()
  })

  it('ignora las canceladas y aceptadas', async () => {
    mockGet.mockResolvedValue({ docs: [doc('t1', { status: 'cancelada' }), doc('t2', { status: 'aceptada' })] })
    expect(await getPendienteByVehicle('v1')).toBeNull()
  })

  it('devuelve la pendiente vigente', async () => {
    mockGet.mockResolvedValue({ docs: [doc('t1', { status: 'cancelada' }), doc('t2')] })
    expect((await getPendienteByVehicle('v1'))?.id).toBe('t2')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/data/__tests__/transferencias.test.ts
```

Esperado: FAIL — `Failed to resolve import "@/lib/data/transferencias"`.

- [ ] **Step 3: Escribir la implementación**

Crea `lib/data/transferencias.ts`:

```ts
import { adminDb } from '@/lib/firebase/admin'
import { nanoid } from 'nanoid'
import type { Transferencia } from '@/lib/types'
import { transferenciaVigente } from '@/lib/transferencias/estado'

const COL = 'transferencias'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

function toTransferencia(id: string, d: FirebaseFirestore.DocumentData): Transferencia {
  return {
    id,
    vehicleId: d.vehicleId,
    patente: d.patente,
    deCompanyId: d.deCompanyId,
    deCompanyNombre: d.deCompanyNombre,
    paraEmail: d.paraEmail,
    token: d.token,
    status: d.status,
    creadaPorUid: d.creadaPorUid,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt,
    aceptadaPorUid: d.aceptadaPorUid ?? undefined,
    aceptadaEn: d.aceptadaEn ?? undefined,
  }
}

export async function createTransferencia(p: {
  vehicleId: string
  patente: string
  deCompanyId: string
  deCompanyNombre: string
  paraEmail: string
  creadaPorUid: string
}): Promise<Transferencia> {
  const now = new Date()
  const data = {
    ...p,
    token: nanoid(32),
    status: 'pendiente' as const,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
  }
  const ref = await adminDb.collection(COL).add(data)
  return { id: ref.id, ...data }
}

export async function getTransferenciaByToken(token: string): Promise<Transferencia | null> {
  const snap = await adminDb.collection(COL).where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return toTransferencia(snap.docs[0].id, snap.docs[0].data())
}

// Query de un solo campo + filtro en memoria (evita índices compuestos).
export async function getPendienteByVehicle(vehicleId: string): Promise<Transferencia | null> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  const nowIso = new Date().toISOString()
  const vigentes = snap.docs
    .map((d) => toTransferencia(d.id, d.data()))
    .filter((t) => transferenciaVigente(t, nowIso))
  return vigentes[0] ?? null
}

export async function cancelTransferencia(id: string, deCompanyId: string): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.deCompanyId !== deCompanyId) throw new Error('forbidden')
  await ref.update({ status: 'cancelada' })
}

export async function markAceptada(id: string, aceptadaPorUid: string): Promise<void> {
  await adminDb.collection(COL).doc(id).update({
    status: 'aceptada',
    aceptadaPorUid,
    aceptadaEn: new Date().toISOString(),
  })
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npx vitest run lib/data/__tests__/transferencias.test.ts
```

Esperado: PASS, 5 tests.

- [ ] **Step 5: Bloquear la colección al cliente**

En `firestore.rules`, junto a los otros bloques `allow read, write: if false` (después del bloque de `mantenciones`), agrega:

```
    match /transferencias/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 6: Commit**

```bash
git add lib/data/transferencias.ts lib/data/__tests__/transferencias.test.ts firestore.rules
git commit -m "feat(transferencias): capa de datos y regla de firestore"
```

**Nota para el humano:** las reglas hay que desplegarlas cuando el feature esté listo, con
`node --env-file=.env.local scripts/deploy-firestore-rules.mjs`. No es urgente porque el
acceso real es server-side vía Admin SDK, pero la defensa en profundidad se pierde hasta que se despliegue.

---

### Task 3: La mutación que mueve el vehículo

**Files:**
- Create: `lib/data/transferirVehiculo.ts`
- Modify: `lib/data/usages.ts:31-36` (firma de `listUsages`)
- Modify: `app/(app)/vehiculos/[id]/page.tsx:52`
- Test: `lib/data/__tests__/transferirVehiculo.test.ts`

**Interfaces:**
- Consumes: `getVehicle` de `@/lib/data/vehicles`, `getOpenUsage` y `forzarCierreUsage(companyId, usageId)` de `@/lib/data/usages`.
- Produces: `transferirVehiculo(vehicleId: string, deCompanyId: string, aCompanyId: string): Promise<void>` — lanza `Error('ya_transferido')` si el vehículo ya no pertenece a `deCompanyId`. Y `listUsages(vehicleId: string, companyId?: string)`.

- [ ] **Step 1: Escribir el test que falla**

Crea `lib/data/__tests__/transferirVehiculo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getVehicle = vi.fn()
const getOpenUsage = vi.fn()
const forzarCierreUsage = vi.fn()
vi.mock('@/lib/data/vehicles', () => ({ getVehicle: (...a: unknown[]) => getVehicle(...a) }))
vi.mock('@/lib/data/usages', () => ({
  getOpenUsage: (...a: unknown[]) => getOpenUsage(...a),
  forzarCierreUsage: (...a: unknown[]) => forzarCierreUsage(...a),
}))

const batchUpdate = vi.fn()
const batchCommit = vi.fn()
const deleteAlerta = vi.fn()
const deleteFile = vi.fn()
const colGet = vi.fn()

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ _col: name, _id: id }),
      where: () => ({ get: () => colGet(name) }),
    }),
    batch: () => ({ update: batchUpdate, commit: batchCommit }),
  },
  adminBucket: { file: () => ({ delete: deleteFile }) },
}))

import { transferirVehiculo } from '@/lib/data/transferirVehiculo'

beforeEach(() => {
  batchUpdate.mockReset(); batchCommit.mockReset(); deleteAlerta.mockReset()
  deleteFile.mockReset(); colGet.mockReset(); getVehicle.mockReset()
  getOpenUsage.mockReset(); forzarCierreUsage.mockReset()

  getVehicle.mockResolvedValue({ id: 'v1', companyId: 'c1', patente: 'ABCD-12' })
  getOpenUsage.mockResolvedValue(null)
  colGet.mockImplementation((name: string) => {
    if (name === 'documents') return Promise.resolve({ docs: [{ ref: { _id: 'd1' } }, { ref: { _id: 'd2' } }] })
    if (name === 'mantenciones') return Promise.resolve({ docs: [{ ref: { _id: 'm1' } }] })
    return Promise.resolve({ docs: [] }) // alertas
  })
})

describe('transferirVehiculo', () => {
  it('corta si el vehículo ya no es de la empresa que transfiere', async () => {
    getVehicle.mockResolvedValue({ id: 'v1', companyId: 'otra' })
    await expect(transferirVehiculo('v1', 'c1', 'c2')).rejects.toThrow('ya_transferido')
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('corta si el vehículo ya no existe', async () => {
    getVehicle.mockResolvedValue(null)
    await expect(transferirVehiculo('v1', 'c1', 'c2')).rejects.toThrow('ya_transferido')
  })

  it('mueve el vehículo limpiando categoría y daño activo', async () => {
    await transferirVehiculo('v1', 'c1', 'c2')
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _col: 'vehicles', _id: 'v1' }),
      { companyId: 'c2', categoriaId: null, danoActivo: null },
    )
  })

  it('mueve documentos y mantenciones, y confirma el batch', async () => {
    await transferirVehiculo('v1', 'c1', 'c2')
    expect(batchUpdate).toHaveBeenCalledWith({ _id: 'd1' }, { companyId: 'c2' })
    expect(batchUpdate).toHaveBeenCalledWith({ _id: 'd2' }, { companyId: 'c2' })
    expect(batchUpdate).toHaveBeenCalledWith({ _id: 'm1' }, { companyId: 'c2' })
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('no toca publicToken ni kmActual', async () => {
    await transferirVehiculo('v1', 'c1', 'c2')
    const patchVehiculo = batchUpdate.mock.calls.find((c) => c[0]?._col === 'vehicles')?.[1]
    expect(patchVehiculo).not.toHaveProperty('publicToken')
    expect(patchVehiculo).not.toHaveProperty('kmActual')
  })

  it('cierra el uso abierto antes de mover', async () => {
    getOpenUsage.mockResolvedValue({ id: 'u9' })
    await transferirVehiculo('v1', 'c1', 'c2')
    expect(forzarCierreUsage).toHaveBeenCalledWith('c1', 'u9')
  })

  it('sigue adelante si el cierre forzado falla', async () => {
    getOpenUsage.mockResolvedValue({ id: 'u9' })
    forzarCierreUsage.mockRejectedValue(new Error('no_abierto'))
    await expect(transferirVehiculo('v1', 'c1', 'c2')).resolves.toBeUndefined()
    expect(batchCommit).toHaveBeenCalled()
  })

  it('borra la foto del daño activo', async () => {
    getVehicle.mockResolvedValue({
      id: 'v1', companyId: 'c1', danoActivo: { fotoPath: 'vehicles/v1/dano/x' },
    })
    await transferirVehiculo('v1', 'c1', 'c2')
    expect(deleteFile).toHaveBeenCalledWith({ ignoreNotFound: true })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/data/__tests__/transferirVehiculo.test.ts
```

Esperado: FAIL — `Failed to resolve import "@/lib/data/transferirVehiculo"`.

- [ ] **Step 3: Escribir la implementación**

Crea `lib/data/transferirVehiculo.ts`:

```ts
import { adminDb, adminBucket } from '@/lib/firebase/admin'
import { getVehicle } from '@/lib/data/vehicles'
import { getOpenUsage, forzarCierreUsage } from '@/lib/data/usages'

/**
 * Mueve un vehículo (con sus documentos y mantenciones) de una empresa a otra.
 *
 * NO viaja: la bitácora de usos —se queda con quien la generó—, el daño activo
 * ni la categoría. NO se tocan `publicToken` ni `kmActual`: el chip está pegado
 * al vehículo y el odómetro es del fierro, no de la empresa.
 *
 * Lanza `Error('ya_transferido')` si el vehículo desapareció o ya cambió de dueño.
 */
export async function transferirVehiculo(
  vehicleId: string,
  deCompanyId: string,
  aCompanyId: string,
): Promise<void> {
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== deCompanyId) throw new Error('ya_transferido')

  // 1. Cerrar el uso abierto: el conductor pertenece a la empresa que entrega.
  const abierto = await getOpenUsage(vehicleId)
  if (abierto) {
    try {
      await forzarCierreUsage(deCompanyId, abierto.id)
    } catch (err) {
      console.error('[transferirVehiculo] cierre forzado', vehicleId, err)
    }
  }

  // 2. Borrar alertas de daño abiertas: apuntan a un vehículo que el emisor ya no tiene.
  const alertas = await adminDb.collection('alertas').where('vehicleId', '==', vehicleId).get()
  await Promise.all(alertas.docs.map((d) => d.ref.delete()))

  // 3. Borrar la foto del daño activo, que no viaja.
  if (v.danoActivo?.fotoPath) {
    try {
      await adminBucket.file(v.danoActivo.fotoPath).delete({ ignoreNotFound: true })
    } catch (err) {
      console.error('[transferirVehiculo] foto de daño', vehicleId, err)
    }
  }

  // 4. Vehículo + documentos + mantenciones, atómico.
  const [docs, mants] = await Promise.all([
    adminDb.collection('documents').where('vehicleId', '==', vehicleId).get(),
    adminDb.collection('mantenciones').where('vehicleId', '==', vehicleId).get(),
  ])
  const batch = adminDb.batch()
  batch.update(adminDb.collection('vehicles').doc(vehicleId), {
    companyId: aCompanyId,
    categoriaId: null,
    danoActivo: null,
  })
  for (const d of docs.docs) batch.update(d.ref, { companyId: aCompanyId })
  for (const mt of mants.docs) batch.update(mt.ref, { companyId: aCompanyId })
  await batch.commit()
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npx vitest run lib/data/__tests__/transferirVehiculo.test.ts
```

Esperado: PASS, 8 tests.

- [ ] **Step 5: Que el nuevo dueño no vea la bitácora ajena**

En `lib/data/usages.ts`, reemplaza `listUsages` (líneas 31-36) por:

```ts
/**
 * Usos de un vehículo. Con `companyId` filtra a los de esa empresa: tras una
 * transferencia los usos del dueño anterior siguen apuntando al mismo
 * `vehicleId` y el nuevo dueño no debe verlos. Sin el parámetro devuelve todos,
 * que es lo que necesitan la cascada de borrado y el recálculo de kilometraje.
 */
export async function listUsages(vehicleId: string, companyId?: string): Promise<VehicleUsage[]> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  return snap.docs
    .map((d) => toUsage(d.id, d.data()))
    .filter((u) => !companyId || u.companyId === companyId)
    .sort((a, b) => (a.tomadoEn < b.tomadoEn ? 1 : -1))
}
```

En `app/(app)/vehiculos/[id]/page.tsx`, línea 52, reemplaza:

```tsx
    (await listUsages(vehicle.id)).map(async (u) => ({
```

por:

```tsx
    (await listUsages(vehicle.id, m.companyId)).map(async (u) => ({
```

- [ ] **Step 6: Verificar que no se rompió nada**

```bash
npx vitest run lib/data && npx tsc --noEmit
```

Esperado: PASS. El test existente `lib/data/__tests__/usages.test.ts:110` sigue verde porque el parámetro es opcional.

- [ ] **Step 7: Commit**

```bash
git add lib/data/transferirVehiculo.ts lib/data/__tests__/transferirVehiculo.test.ts lib/data/usages.ts "app/(app)/vehiculos/[id]/page.tsx"
git commit -m "feat(transferencias): mutacion que mueve el vehiculo entre empresas"
```

---

### Task 4: Correos

**Files:**
- Create: `lib/email/transferenciaEmail.ts`
- Modify: `lib/email/resend.ts`
- Test: `lib/email/__tests__/transferenciaEmail.test.ts`

**Interfaces:**
- Consumes: `emailLayout`, `ctaButton`, `appUrl` de `@/lib/email/layout`.
- Produces (plantillas puras):
  - `transferenciaRecibidaSubject(patente: string): string`
  - `transferenciaRecibidaHtml(p: { patente: string; deCompanyNombre: string; deEmail: string; aceptarUrl: string }): string`
  - `transferenciaEnviadaSubject(patente: string): string`
  - `transferenciaEnviadaHtml(p: { patente: string; paraEmail: string; vehicleId: string }): string`
  - `transferenciaAceptadaSubject(patente: string): string`
  - `transferenciaAceptadaHtml(p: { patente: string; paraEmail: string }): string`
- Produces (senders en `resend.ts`): `sendTransferenciaRecibidaEmail(to, p)`, `sendTransferenciaEnviadaEmail(to, p)`, `sendTransferenciaAceptadaEmail(to, p)` con los mismos `p` de arriba.

- [ ] **Step 1: Escribir el test que falla**

Crea `lib/email/__tests__/transferenciaEmail.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  transferenciaRecibidaSubject,
  transferenciaRecibidaHtml,
  transferenciaEnviadaSubject,
  transferenciaEnviadaHtml,
  transferenciaAceptadaSubject,
  transferenciaAceptadaHtml,
} from '@/lib/email/transferenciaEmail'

describe('correo al destinatario', () => {
  const html = transferenciaRecibidaHtml({
    patente: 'ABCD-12',
    deCompanyNombre: 'Transportes Uno',
    deEmail: 'jefe@uno.cl',
    aceptarUrl: 'https://app.tapcar.cl/transferencias/tok',
  })

  it('el asunto lleva la patente', () => {
    expect(transferenciaRecibidaSubject('ABCD-12')).toContain('ABCD-12')
  })
  it('nombra a quién transfiere y lleva el CTA al enlace de aceptación', () => {
    expect(html).toContain('Transportes Uno')
    expect(html).toContain('https://app.tapcar.cl/transferencias/tok')
    expect(html).toContain('Revisar la transferencia')
  })
  it('avisa que vence en 7 días', () => {
    expect(html).toContain('7 días')
  })
})

describe('respaldo al emisor', () => {
  it('el asunto lleva la patente y el cuerpo el destinatario', () => {
    expect(transferenciaEnviadaSubject('ABCD-12')).toContain('ABCD-12')
    expect(transferenciaEnviadaHtml({ patente: 'ABCD-12', paraEmail: 'nuevo@dos.cl', vehicleId: 'v1' }))
      .toContain('nuevo@dos.cl')
  })
  it('el CTA apunta a la ficha del vehículo, que todavía es suyo', () => {
    expect(transferenciaEnviadaHtml({ patente: 'ABCD-12', paraEmail: 'nuevo@dos.cl', vehicleId: 'v1' }))
      .toContain('/vehiculos/v1')
  })
})

describe('aviso de aceptación al emisor', () => {
  const html = transferenciaAceptadaHtml({ patente: 'ABCD-12', paraEmail: 'nuevo@dos.cl' })
  it('el asunto lleva la patente', () => {
    expect(transferenciaAceptadaSubject('ABCD-12')).toContain('ABCD-12')
  })
  it('el CTA va al dashboard porque el vehículo ya no es suyo', () => {
    expect(html).toContain('/dashboard')
    expect(html).not.toContain('/vehiculos/')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/email/__tests__/transferenciaEmail.test.ts
```

Esperado: FAIL — `Failed to resolve import "@/lib/email/transferenciaEmail"`.

- [ ] **Step 3: Escribir las plantillas**

Crea `lib/email/transferenciaEmail.ts`:

```ts
import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

const GRIS = 'font-size:13px;color:#64748b;'

export function transferenciaRecibidaSubject(patente: string): string {
  return `Te quieren transferir el vehículo ${patente}`
}

export function transferenciaRecibidaHtml(p: {
  patente: string
  deCompanyNombre: string
  deEmail: string
  aceptarUrl: string
}): string {
  const empresa = p.deCompanyNombre.trim() || 'Otra empresa'
  return emailLayout({
    titulo: `Te quieren transferir el ${p.patente}`,
    contenidoHtml: `
      <p><strong>${empresa}</strong> (${p.deEmail}) quiere transferirte el vehículo <strong>${p.patente}</strong>.</p>
      <p>Si aceptas, el vehículo pasa a tu flota con sus documentos y su historial de mantenciones, y ocupará un cupo de tu plan.</p>
      ${ctaButton('Revisar la transferencia', p.aceptarUrl)}
      <p style="${GRIS}">O abre este enlace:<br>${p.aceptarUrl}</p>
      <p style="${GRIS}">La transferencia vence en 7 días.</p>
    `,
    motivo: 'Si no esperabas este correo, puedes ignorarlo: sin tu aceptación no pasa nada.',
  })
}

export function transferenciaEnviadaSubject(patente: string): string {
  return `Enviaste la transferencia del ${patente}`
}

export function transferenciaEnviadaHtml(p: {
  patente: string
  paraEmail: string
  vehicleId: string
}): string {
  return emailLayout({
    titulo: `Transferencia enviada: ${p.patente}`,
    contenidoHtml: `
      <p>Le ofreciste el vehículo <strong>${p.patente}</strong> a <strong>${p.paraEmail}</strong>.</p>
      <p>Sigue siendo tuyo hasta que la otra cuenta acepte. Puedes cancelarla desde la pestaña Ajustes del vehículo.</p>
      ${ctaButton('Ver el vehículo', `${appUrl()}/vehiculos/${p.vehicleId}`)}
      <p style="${GRIS}">La transferencia vence en 7 días.</p>
    `,
    motivo: 'Recibes este correo porque enviaste una transferencia en TapCar.',
  })
}

export function transferenciaAceptadaSubject(patente: string): string {
  return `${patente} ya es de su nuevo dueño`
}

export function transferenciaAceptadaHtml(p: { patente: string; paraEmail: string }): string {
  return emailLayout({
    titulo: `Transferencia completada: ${p.patente}`,
    contenidoHtml: `
      <p><strong>${p.paraEmail}</strong> aceptó la transferencia del vehículo <strong>${p.patente}</strong>.</p>
      <p>Ya no está en tu flota, junto con sus documentos y mantenciones. Tu bitácora de usos se mantiene.</p>
      ${ctaButton('Abrir TapCar', `${appUrl()}/dashboard`)}
    `,
    motivo: 'Recibes este correo porque transferiste un vehículo en TapCar.',
  })
}
```

- [ ] **Step 4: Agregar los senders**

En `lib/email/resend.ts`, agrega el import junto a los otros de arriba:

```ts
import {
  transferenciaRecibidaSubject, transferenciaRecibidaHtml,
  transferenciaEnviadaSubject, transferenciaEnviadaHtml,
  transferenciaAceptadaSubject, transferenciaAceptadaHtml,
} from '@/lib/email/transferenciaEmail'
```

Y al final del archivo:

```ts
export async function sendTransferenciaRecibidaEmail(
  to: string,
  p: { patente: string; deCompanyNombre: string; deEmail: string; aceptarUrl: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: transferenciaRecibidaSubject(p.patente),
    html: transferenciaRecibidaHtml(p),
  })
}

export async function sendTransferenciaEnviadaEmail(
  to: string,
  p: { patente: string; paraEmail: string; vehicleId: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: transferenciaEnviadaSubject(p.patente),
    html: transferenciaEnviadaHtml(p),
  })
}

export async function sendTransferenciaAceptadaEmail(
  to: string,
  p: { patente: string; paraEmail: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: transferenciaAceptadaSubject(p.patente),
    html: transferenciaAceptadaHtml(p),
  })
}
```

- [ ] **Step 5: Correr el test y commitear**

```bash
npx vitest run lib/email && npx tsc --noEmit
```

Esperado: PASS, 7 tests nuevos.

```bash
git add lib/email
git commit -m "feat(transferencias): correos de solicitud, respaldo y aceptacion"
```

---

### Task 5: Endpoints

**Files:**
- Create: `app/api/vehicles/[id]/transferir/route.ts`
- Create: `app/api/transferencias/[token]/aceptar/route.ts`
- Test: `app/api/vehicles/[id]/transferir/__tests__/route.test.ts`
- Test: `app/api/transferencias/[token]/aceptar/__tests__/route.test.ts`

**Interfaces:**
- Consumes de Tasks 1-4: `puedeAceptar`, `MotivoRechazo`, `createTransferencia`, `getPendienteByVehicle`, `getTransferenciaByToken`, `cancelTransferencia`, `markAceptada`, `transferirVehiculo`, los tres senders.
- Produces: `POST`/`DELETE` en `/api/vehicles/[id]/transferir` y `POST` en `/api/transferencias/[token]/aceptar`.

- [ ] **Step 1: Escribir el test del endpoint de crear/cancelar**

Crea `app/api/vehicles/[id]/transferir/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
const getVehicle = vi.fn()
const getCompany = vi.fn()
const createTransferencia = vi.fn()
const getPendienteByVehicle = vi.fn()
const cancelTransferencia = vi.fn()
const getUserByEmail = vi.fn()
const userDocGet = vi.fn()

vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
vi.mock('@/lib/data/vehicles', () => ({ getVehicle: (...a: unknown[]) => getVehicle(...a) }))
vi.mock('@/lib/data/companies', () => ({ getCompany: (...a: unknown[]) => getCompany(...a) }))
vi.mock('@/lib/data/transferencias', () => ({
  createTransferencia: (...a: unknown[]) => createTransferencia(...a),
  getPendienteByVehicle: (...a: unknown[]) => getPendienteByVehicle(...a),
  cancelTransferencia: (...a: unknown[]) => cancelTransferencia(...a),
}))
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { getUserByEmail: (...a: unknown[]) => getUserByEmail(...a) },
  adminDb: { collection: () => ({ doc: () => ({ get: () => userDocGet() }) }) },
}))
vi.mock('@/lib/email/resend', () => ({
  sendTransferenciaRecibidaEmail: () => Promise.resolve(),
  sendTransferenciaEnviadaEmail: () => Promise.resolve(),
}))

import { POST, DELETE } from '@/app/api/vehicles/[id]/transferir/route'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as Request

beforeEach(() => {
  getMembership.mockReset(); getVehicle.mockReset(); getCompany.mockReset()
  createTransferencia.mockReset(); getPendienteByVehicle.mockReset(); cancelTransferencia.mockReset()
  getUserByEmail.mockReset(); userDocGet.mockReset()

  getMembership.mockResolvedValue({ uid: 'u1', email: 'jefe@uno.cl', companyId: 'c1', role: 'admin' })
  getVehicle.mockResolvedValue({ id: 'v1', companyId: 'c1', patente: 'ABCD-12' })
  getCompany.mockResolvedValue({ company: { razonSocial: 'Uno' } })
  getPendienteByVehicle.mockResolvedValue(null)
  getUserByEmail.mockResolvedValue({ uid: 'u2' })
  userDocGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c2' }) })
  createTransferencia.mockResolvedValue({ id: 't1', token: 'tok' })
})

describe('POST transferir', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await POST(req({ email: 'a@b.cl' }), ctx('v1'))).status).toBe(401)
  })

  it('403 si el rol no gestiona vehículos', async () => {
    getMembership.mockResolvedValue({ uid: 'u1', email: 'e@e.cl', companyId: 'c1', role: 'editor' })
    expect((await POST(req({ email: 'a@b.cl' }), ctx('v1'))).status).toBe(403)
  })

  it('403 si el vehículo es de otra empresa', async () => {
    getVehicle.mockResolvedValue({ id: 'v1', companyId: 'otra' })
    expect((await POST(req({ email: 'a@b.cl' }), ctx('v1'))).status).toBe(403)
  })

  it('400 si el correo es inválido', async () => {
    expect((await POST(req({ email: 'no-es-correo' }), ctx('v1'))).status).toBe(400)
  })

  it('404 sin_cuenta si el correo no tiene cuenta', async () => {
    getUserByEmail.mockRejectedValue(new Error('user not found'))
    const res = await POST(req({ email: 'nadie@x.cl' }), ctx('v1'))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('sin_cuenta')
  })

  it('404 sin_cuenta si el usuario existe pero no tiene empresa', async () => {
    userDocGet.mockResolvedValue({ exists: true, data: () => ({}) })
    expect((await POST(req({ email: 'a@b.cl' }), ctx('v1'))).status).toBe(404)
  })

  it('400 misma_empresa si el correo es de la misma empresa', async () => {
    userDocGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    const res = await POST(req({ email: 'colega@uno.cl' }), ctx('v1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('misma_empresa')
  })

  it('409 ya_pendiente si ya hay una en curso', async () => {
    getPendienteByVehicle.mockResolvedValue({ id: 't0' })
    const res = await POST(req({ email: 'a@b.cl' }), ctx('v1'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('ya_pendiente')
  })

  it('200 y crea la transferencia con el correo normalizado', async () => {
    const res = await POST(req({ email: '  Nuevo@Dos.CL ' }), ctx('v1'))
    expect(res.status).toBe(200)
    expect(createTransferencia).toHaveBeenCalledWith(expect.objectContaining({
      vehicleId: 'v1', patente: 'ABCD-12', deCompanyId: 'c1', paraEmail: 'nuevo@dos.cl', creadaPorUid: 'u1',
    }))
  })
})

describe('DELETE transferir', () => {
  it('404 si no hay pendiente', async () => {
    expect((await DELETE({} as Request, ctx('v1'))).status).toBe(404)
  })

  it('404 si la pendiente es de otra empresa', async () => {
    getPendienteByVehicle.mockResolvedValue({ id: 't1', deCompanyId: 'otra' })
    expect((await DELETE({} as Request, ctx('v1'))).status).toBe(404)
  })

  it('200 y cancela', async () => {
    getPendienteByVehicle.mockResolvedValue({ id: 't1', deCompanyId: 'c1' })
    expect((await DELETE({} as Request, ctx('v1'))).status).toBe(200)
    expect(cancelTransferencia).toHaveBeenCalledWith('t1', 'c1')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run app/api/vehicles
```

Esperado: FAIL — no existe la ruta.

- [ ] **Step 3: Escribir el endpoint de crear/cancelar**

Crea `app/api/vehicles/[id]/transferir/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getVehicle } from '@/lib/data/vehicles'
import { getCompany } from '@/lib/data/companies'
import { normalizeEmail } from '@/lib/data/invitations'
import {
  createTransferencia,
  getPendienteByVehicle,
  cancelTransferencia,
} from '@/lib/data/transferencias'
import { sendTransferenciaRecibidaEmail, sendTransferenciaEnviadaEmail } from '@/lib/email/resend'
import { appUrl } from '@/lib/email/layout'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Empresa a la que pertenece el correo, o null si no tiene cuenta con empresa. */
async function companyIdDelCorreo(email: string): Promise<string | null> {
  try {
    const u = await adminAuth.getUserByEmail(email)
    const doc = await adminDb.collection('users').doc(u.uid).get()
    return (doc.exists ? doc.data()?.companyId : null) ?? null
  } catch {
    return null // getUserByEmail lanza si el correo no existe
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const vehicle = await getVehicle(id)
  if (!vehicle || vehicle.companyId !== m.companyId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(String(body?.email ?? ''))
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'correo_invalido', mensaje: 'Revisa el correo.' }, { status: 400 })
  }

  const destino = await companyIdDelCorreo(email)
  if (!destino) {
    return NextResponse.json(
      { error: 'sin_cuenta', mensaje: 'Ese correo no tiene cuenta en TapCar. Pídele que se registre primero.' },
      { status: 404 },
    )
  }
  if (destino === m.companyId) {
    return NextResponse.json(
      { error: 'misma_empresa', mensaje: 'Ese correo pertenece a tu misma empresa.' },
      { status: 400 },
    )
  }
  if (await getPendienteByVehicle(id)) {
    return NextResponse.json(
      { error: 'ya_pendiente', mensaje: 'Este vehículo ya tiene una transferencia pendiente.' },
      { status: 409 },
    )
  }

  const company = await getCompany(m.companyId)
  const razonSocial = company?.company.razonSocial ?? ''
  const t = await createTransferencia({
    vehicleId: id,
    patente: vehicle.patente,
    deCompanyId: m.companyId,
    deCompanyNombre: razonSocial,
    paraEmail: email,
    creadaPorUid: m.uid,
  })

  // Correos best-effort: si Resend falla, la transferencia igual queda creada.
  const aceptarUrl = `${appUrl()}/transferencias/${t.token}`
  try {
    await sendTransferenciaRecibidaEmail(email, {
      patente: vehicle.patente,
      deCompanyNombre: razonSocial,
      deEmail: m.email,
      aceptarUrl,
    })
  } catch (err) {
    console.error('[transferir] correo al destinatario', err)
  }
  try {
    await sendTransferenciaEnviadaEmail(m.email, {
      patente: vehicle.patente,
      paraEmail: email,
      vehicleId: id,
    })
  } catch (err) {
    console.error('[transferir] correo de respaldo', err)
  }

  return NextResponse.json({ transferencia: t })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const t = await getPendienteByVehicle(id)
  if (!t || t.deCompanyId !== m.companyId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  await cancelTransferencia(t.id, m.companyId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npx vitest run app/api/vehicles
```

Esperado: PASS, 12 tests.

- [ ] **Step 5: Escribir el test del endpoint de aceptar**

Crea `app/api/transferencias/[token]/aceptar/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
const getTransferenciaByToken = vi.fn()
const markAceptada = vi.fn()
const transferirVehiculo = vi.fn()
const getCompany = vi.fn()
const listVehicles = vi.fn()
const getUser = vi.fn()
const sendAceptada = vi.fn()

vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
vi.mock('@/lib/data/transferencias', () => ({
  getTransferenciaByToken: (...a: unknown[]) => getTransferenciaByToken(...a),
  markAceptada: (...a: unknown[]) => markAceptada(...a),
}))
vi.mock('@/lib/data/transferirVehiculo', () => ({
  transferirVehiculo: (...a: unknown[]) => transferirVehiculo(...a),
}))
vi.mock('@/lib/data/companies', () => ({ getCompany: (...a: unknown[]) => getCompany(...a) }))
vi.mock('@/lib/data/vehicles', () => ({ listVehicles: (...a: unknown[]) => listVehicles(...a) }))
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { getUser: (...a: unknown[]) => getUser(...a) } }))
vi.mock('@/lib/email/resend', () => ({
  sendTransferenciaAceptadaEmail: (...a: unknown[]) => sendAceptada(...a),
}))

import { POST } from '@/app/api/transferencias/[token]/aceptar/route'

const ctx = (token: string) => ({ params: Promise.resolve({ token }) })
const futuro = '2999-01-01T00:00:00.000Z'

beforeEach(() => {
  getMembership.mockReset(); getTransferenciaByToken.mockReset(); markAceptada.mockReset()
  transferirVehiculo.mockReset(); getCompany.mockReset(); listVehicles.mockReset()
  getUser.mockReset(); sendAceptada.mockReset()

  getMembership.mockResolvedValue({ uid: 'u2', email: 'nuevo@dos.cl', companyId: 'c2', role: 'admin' })
  getTransferenciaByToken.mockResolvedValue({
    id: 't1', vehicleId: 'v1', patente: 'ABCD-12', deCompanyId: 'c1',
    paraEmail: 'nuevo@dos.cl', status: 'pendiente', expiresAt: futuro, creadaPorUid: 'u1',
  })
  getCompany.mockResolvedValue({ plan: { maxVehiculos: 5 } })
  listVehicles.mockResolvedValue([{ id: 'x' }])
  getUser.mockResolvedValue({ email: 'jefe@uno.cl' })
})

describe('POST aceptar', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await POST({} as Request, ctx('tok'))).status).toBe(401)
  })

  it('404 si el token no existe', async () => {
    getTransferenciaByToken.mockResolvedValue(null)
    expect((await POST({} as Request, ctx('tok'))).status).toBe(404)
  })

  it('403 si el correo de la sesión no es el destinatario', async () => {
    getMembership.mockResolvedValue({ uid: 'u9', email: 'colado@x.cl', companyId: 'c9', role: 'admin' })
    const res = await POST({} as Request, ctx('tok'))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('otro_destinatario')
    expect(transferirVehiculo).not.toHaveBeenCalled()
  })

  it('410 si venció', async () => {
    getTransferenciaByToken.mockResolvedValue({
      id: 't1', vehicleId: 'v1', patente: 'ABCD-12', deCompanyId: 'c1',
      paraEmail: 'nuevo@dos.cl', status: 'pendiente', expiresAt: '2000-01-01T00:00:00.000Z', creadaPorUid: 'u1',
    })
    expect((await POST({} as Request, ctx('tok'))).status).toBe(410)
  })

  it('409 plan_limit si el plan del destinatario está lleno', async () => {
    listVehicles.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }])
    const res = await POST({} as Request, ctx('tok'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('plan_limit')
  })

  it('200: transfiere, marca aceptada y avisa al emisor', async () => {
    const res = await POST({} as Request, ctx('tok'))
    expect(res.status).toBe(200)
    expect(transferirVehiculo).toHaveBeenCalledWith('v1', 'c1', 'c2')
    expect(markAceptada).toHaveBeenCalledWith('t1', 'u2')
    expect(sendAceptada).toHaveBeenCalledWith('jefe@uno.cl', { patente: 'ABCD-12', paraEmail: 'nuevo@dos.cl' })
  })

  it('409 ya_transferido si el vehículo cambió de dueño entremedio', async () => {
    transferirVehiculo.mockRejectedValue(new Error('ya_transferido'))
    const res = await POST({} as Request, ctx('tok'))
    expect(res.status).toBe(409)
    expect(markAceptada).not.toHaveBeenCalled()
  })

  it('500 ante un error desconocido, sin marcarla aceptada', async () => {
    transferirVehiculo.mockRejectedValue(new Error('boom'))
    expect((await POST({} as Request, ctx('tok'))).status).toBe(500)
    expect(markAceptada).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Escribir el endpoint de aceptar**

Crea `app/api/transferencias/[token]/aceptar/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { adminAuth } from '@/lib/firebase/admin'
import { getTransferenciaByToken, markAceptada } from '@/lib/data/transferencias'
import { transferirVehiculo } from '@/lib/data/transferirVehiculo'
import { getCompany } from '@/lib/data/companies'
import { listVehicles } from '@/lib/data/vehicles'
import { maxVehiculosDe } from '@/lib/plan'
import { puedeAceptar, type MotivoRechazo } from '@/lib/transferencias/estado'
import { sendTransferenciaAceptadaEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

const HTTP: Record<MotivoRechazo, number> = {
  no_pendiente: 409,
  expirada: 410,
  otro_destinatario: 403,
  sin_permiso: 403,
  plan_limit: 409,
}

const MENSAJE: Record<MotivoRechazo, string> = {
  no_pendiente: 'Esta transferencia ya fue aceptada o cancelada.',
  expirada: 'Esta transferencia venció. Pídele al dueño que la envíe de nuevo.',
  otro_destinatario: 'Esta transferencia es para otro correo.',
  sin_permiso: 'Necesitas ser Administrador de tu empresa para recibir un vehículo.',
  plan_limit: 'Tu plan no tiene cupo para otro vehículo.',
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const t = await getTransferenciaByToken(token)
  if (!t) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [company, vehiculos] = await Promise.all([getCompany(m.companyId), listVehicles(m.companyId)])
  const motivo = puedeAceptar({
    transferencia: t,
    emailSesion: m.email,
    role: m.role,
    vehiculosActuales: vehiculos.length,
    maxVehiculos: maxVehiculosDe(company?.plan),
    nowIso: new Date().toISOString(),
  })
  if (motivo) {
    return NextResponse.json({ error: motivo, mensaje: MENSAJE[motivo] }, { status: HTTP[motivo] })
  }

  try {
    await transferirVehiculo(t.vehicleId, t.deCompanyId, m.companyId)
  } catch (err) {
    // Solo `ya_transferido` es esperado; el resto es un 500 de verdad.
    if (err instanceof Error && err.message === 'ya_transferido') {
      return NextResponse.json(
        { error: 'ya_transferido', mensaje: 'Ese vehículo ya no está disponible.' },
        { status: 409 },
      )
    }
    console.error('[aceptar-transferencia]', token, err)
    return NextResponse.json({ error: 'error' }, { status: 500 })
  }

  // Recién acá: si el movimiento falló, la transferencia sigue pendiente y se puede reintentar.
  await markAceptada(t.id, m.uid)

  try {
    const emisor = await adminAuth.getUser(t.creadaPorUid)
    if (emisor.email) {
      await sendTransferenciaAceptadaEmail(emisor.email, { patente: t.patente, paraEmail: t.paraEmail })
    }
  } catch (err) {
    console.error('[aceptar-transferencia] aviso al emisor', err)
  }

  return NextResponse.json({ ok: true, vehicleId: t.vehicleId })
}
```

- [ ] **Step 7: Correr los tests y commitear**

```bash
npx vitest run app/api && npx tsc --noEmit
```

Esperado: PASS, 20 tests nuevos y ninguno previo roto.

```bash
git add "app/api/vehicles/[id]/transferir" "app/api/transferencias"
git commit -m "feat(transferencias): endpoints de crear, cancelar y aceptar"
```

---

### Task 6: Interfaz

**Files:**
- Create: `components/vehicle/TransferirVehiculoPanel.tsx`
- Create: `components/transferencias/AceptarTransferencia.tsx`
- Create: `app/(app)/transferencias/[token]/page.tsx`
- Modify: `app/(app)/vehiculos/[id]/page.tsx` (montar el panel en la pestaña Ajustes)
- Test: `components/vehicle/__tests__/TransferirVehiculoPanel.test.tsx`

**Interfaces:**
- Consumes de Task 5: `POST`/`DELETE /api/vehicles/[id]/transferir`, `POST /api/transferencias/[token]/aceptar`. De Task 2: `getTransferenciaByToken`, `getPendienteByVehicle`. De Task 1: `transferenciaVigente`.
- Produces: `TransferirVehiculoPanel({ vehicleId, patente, pendiente })` y `AceptarTransferencia({ token })`.

- [ ] **Step 1: Escribir el test que falla**

Crea `components/vehicle/__tests__/TransferirVehiculoPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import TransferirVehiculoPanel from '@/components/vehicle/TransferirVehiculoPanel'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('confirm', () => true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TransferirVehiculoPanel', () => {
  it('sin transferencia pendiente pide el correo', () => {
    render(<TransferirVehiculoPanel vehicleId="v1" patente="ABCD-12" pendiente={null} />)
    expect(screen.getByLabelText(/correo/i)).toBeDefined()
  })

  it('envía el correo escrito al endpoint', async () => {
    render(<TransferirVehiculoPanel vehicleId="v1" patente="ABCD-12" pendiente={null} />)
    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'nuevo@dos.cl' } })
    fireEvent.click(screen.getByRole('button', { name: /transferir/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/v1/transferir', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'nuevo@dos.cl' }),
    })))
  })

  it('muestra el mensaje que devuelve el servidor cuando falla', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'sin_cuenta', mensaje: 'Ese correo no tiene cuenta en TapCar.' }),
    })
    render(<TransferirVehiculoPanel vehicleId="v1" patente="ABCD-12" pendiente={null} />)
    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'nadie@x.cl' } })
    fireEvent.click(screen.getByRole('button', { name: /transferir/i }))

    await waitFor(() => expect(screen.getByText(/no tiene cuenta en TapCar/i)).toBeDefined())
  })

  it('con una pendiente muestra a quién y ofrece cancelar', async () => {
    render(
      <TransferirVehiculoPanel
        vehicleId="v1"
        patente="ABCD-12"
        pendiente={{ paraEmail: 'nuevo@dos.cl', expiresAt: '2026-08-03T12:00:00.000Z' }}
      />,
    )
    expect(screen.getByText(/nuevo@dos.cl/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/v1/transferir', { method: 'DELETE' }))
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run components/vehicle
```

Esperado: FAIL — no existe el componente.

- [ ] **Step 3: Escribir el panel**

Crea `components/vehicle/TransferirVehiculoPanel.tsx`:

```tsx
'use client'
import { useState } from 'react'

type Pendiente = { paraEmail: string; expiresAt: string }

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long' })

export default function TransferirVehiculoPanel({
  vehicleId,
  patente,
  pendiente,
}: {
  vehicleId: string
  patente: string
  pendiente: Pendiente | null
}) {
  const [email, setEmail] = useState('')
  const [actual, setActual] = useState<Pendiente | null>(pendiente)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function transferir(e: React.FormEvent) {
    e.preventDefault()
    const destino = email.trim()
    if (!destino) return
    if (!confirm(`¿Transferir ${patente} a ${destino}? El vehículo se moverá recién cuando esa cuenta acepte.`)) return

    setCargando(true)
    setError(null)
    const res = await fetch(`/api/vehicles/${vehicleId}/transferir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: destino }),
    })
    const data = await res.json().catch(() => ({}))
    setCargando(false)
    if (!res.ok) {
      setError(data?.mensaje ?? 'No pudimos enviar la transferencia.')
      return
    }
    setActual({ paraEmail: destino, expiresAt: data?.transferencia?.expiresAt ?? '' })
    setEmail('')
  }

  async function cancelar() {
    setCargando(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/transferir`, { method: 'DELETE' })
    setCargando(false)
    if (res.ok) setActual(null)
  }

  return (
    <div className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h3 className="font-semibold text-tinta">Transferir vehículo</h3>

      {actual ? (
        <>
          <p className="mt-2 text-sm text-acero">
            Pendiente de aceptación por <strong className="text-tinta">{actual.paraEmail}</strong>
            {actual.expiresAt ? ` · vence el ${fecha(actual.expiresAt)}` : ''}.
          </p>
          <p className="mt-1 text-xs text-acero">El vehículo sigue siendo tuyo hasta que acepten.</p>
          <button
            type="button"
            onClick={cancelar}
            disabled={cargando}
            className="mt-3 rounded-lg px-3 py-1.5 text-sm font-medium text-vencido transition-colors hover:bg-[#FCE7E7] disabled:opacity-50"
          >
            Cancelar transferencia
          </button>
        </>
      ) : (
        <form onSubmit={transferir} className="mt-3 space-y-3">
          <p className="text-sm text-acero">
            Se van con el vehículo sus documentos y su historial de mantenciones. Tu bitácora de usos se queda contigo.
          </p>
          <div>
            <label htmlFor="transferir-email" className="block text-sm font-medium text-tinta">
              Correo de la cuenta que lo recibe
            </label>
            <input
              id="transferir-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@empresa.cl"
              className="mt-1 w-full rounded-lg border border-linea bg-lienzo px-3 py-2 text-sm text-tinta focus:border-azul focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-vencido">{error}</p>}
          <button
            type="submit"
            disabled={cargando || !email.trim()}
            className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
          >
            Transferir
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npx vitest run components/vehicle
```

Esperado: PASS, 4 tests.

- [ ] **Step 5: Montar el panel en la ficha**

En `app/(app)/vehiculos/[id]/page.tsx`:

1. Agrega los imports junto a los otros:

```tsx
import { getPendienteByVehicle } from '@/lib/data/transferencias'
import TransferirVehiculoPanel from '@/components/vehicle/TransferirVehiculoPanel'
```

2. Después de la línea `const canManageVehicle = can(m.role, 'vehicle:write')`, agrega:

```tsx
  const transferenciaPendiente = canManageVehicle ? await getPendienteByVehicle(vehicle.id) : null
```

3. En el slot `ajustes`, entre `<NfcTokenPanel ... />` y el bloque de `DeleteVehicleButton`, agrega:

```tsx
            {canManageVehicle && (
              <TransferirVehiculoPanel
                vehicleId={vehicle.id}
                patente={vehicle.patente}
                pendiente={
                  transferenciaPendiente
                    ? { paraEmail: transferenciaPendiente.paraEmail, expiresAt: transferenciaPendiente.expiresAt }
                    : null
                }
              />
            )}
```

- [ ] **Step 6: Escribir la página de aceptación**

Crea `components/transferencias/AceptarTransferencia.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AceptarTransferencia({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function aceptar() {
    setCargando(true)
    setError(null)
    const res = await fetch(`/api/transferencias/${token}/aceptar`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setCargando(false)
      setError(data?.mensaje ?? 'No pudimos completar la transferencia.')
      return
    }
    router.push(`/vehiculos/${data.vehicleId}`)
  }

  return (
    <>
      <button
        type="button"
        onClick={aceptar}
        disabled={cargando}
        className="w-full rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
      >
        {cargando ? 'Recibiendo…' : 'Aceptar el vehículo'}
      </button>
      {error && <p className="mt-3 text-sm text-vencido">{error}</p>}
    </>
  )
}
```

Crea `app/(app)/transferencias/[token]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { getTransferenciaByToken } from '@/lib/data/transferencias'
import { transferenciaVigente } from '@/lib/transferencias/estado'
import BackLink from '@/components/BackLink'
import AceptarTransferencia from '@/components/transferencias/AceptarTransferencia'

export const dynamic = 'force-dynamic'

export default async function TransferenciaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const m = await getMembership()
  if (!m) redirect('/login')

  const t = await getTransferenciaByToken(token)
  if (!t) notFound()

  const vigente = transferenciaVigente(t, new Date().toISOString())
  const esParaMi = m.email.trim().toLowerCase() === t.paraEmail
  const empresa = t.deCompanyNombre.trim() || 'Otra empresa'

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <BackLink href="/dashboard" label="Volver al dashboard" />

      <div className="rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-tinta">Transferencia de vehículo</h1>
        <p className="mt-2 text-base text-acero">
          <strong className="text-tinta">{empresa}</strong> quiere transferirte el vehículo{' '}
          <strong className="text-tinta">{t.patente}</strong>.
        </p>

        {!vigente ? (
          <p className="mt-4 rounded-lg bg-lienzo px-4 py-3 text-sm text-acero">
            {t.status === 'aceptada'
              ? 'Esta transferencia ya fue aceptada.'
              : t.status === 'cancelada'
                ? 'Esta transferencia fue cancelada por quien la envió.'
                : 'Esta transferencia venció. Pídele al dueño que la envíe de nuevo.'}
          </p>
        ) : !esParaMi ? (
          <p className="mt-4 rounded-lg bg-lienzo px-4 py-3 text-sm text-acero">
            Esta transferencia es para <strong className="text-tinta">{t.paraEmail}</strong> y tu sesión es{' '}
            <strong className="text-tinta">{m.email}</strong>. Entra con la cuenta correcta para aceptarla.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-acero">
              Al aceptar, el vehículo pasa a tu flota con sus documentos y su historial de mantenciones, y ocupa
              un cupo de tu plan. La bitácora de usos se queda con el dueño anterior.
            </p>
            <div className="mt-5">
              <AceptarTransferencia token={token} />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Verificación completa**

```bash
npm test
```

Esperado: PASS salvo `lib/firebase/__tests__/rules.test.ts` (necesita el emulador de Firestore; falla igual antes de este cambio).

```bash
npx tsc --noEmit && npm run build && npx eslint app components lib
```

Esperado: los tres sin errores. ESLint puede tirar warnings de `react-hooks/set-state-in-effect` en archivos preexistentes: están en `warn` a propósito.

- [ ] **Step 8: Commit**

```bash
git add components/vehicle/TransferirVehiculoPanel.tsx components/vehicle/__tests__/TransferirVehiculoPanel.test.tsx components/transferencias "app/(app)/transferencias" "app/(app)/vehiculos/[id]/page.tsx"
git commit -m "feat(transferencias): panel en ajustes y pagina de aceptacion"
```

- [ ] **Step 9: Desplegar las reglas de Firestore**

Esto lo corre un humano con las credenciales de producción en `.env.local`:

```bash
node --env-file=.env.local scripts/deploy-firestore-rules.mjs
```

- [ ] **Step 10: Verificación manual (requiere dos cuentas)**

Ningún agente puede hacer esto: necesita dos cuentas de TapCar en empresas distintas, y ambos correos reales para revisar los envíos.

1. **Camino feliz.** Desde la cuenta A, ficha de un vehículo → Ajustes → Transferir al correo de B. Verificar: llega el correo a B con el enlace y a A el respaldo. B abre el enlace, acepta y aterriza en la ficha del vehículo. Confirmar que el vehículo desapareció del dashboard de A y aparece en el de B **con sus documentos y mantenciones**.
2. **La bitácora no viaja.** Si el vehículo tenía usos, la pestaña Bitácora en la cuenta B debe verse vacía, y en `/reportes` de la cuenta A los usos deben seguir apareciendo.
3. **El chip sigue funcionando.** Acercar el chip NFC del vehículo: debe abrir la misma ficha pública, ahora bajo la cuenta B.
4. **Correo sin cuenta:** transferir a un correo que no existe en TapCar → mensaje «Ese correo no tiene cuenta en TapCar».
5. **Cancelar:** crear una transferencia y cancelarla desde A; el enlace que recibió B debe mostrar «fue cancelada».
6. **Enlace ajeno:** abrir con la cuenta A el enlace dirigido a B → debe decir que la transferencia es para otro correo, sin botón de aceptar.
7. **Cupo lleno:** con la cuenta B en su tope de vehículos, aceptar debe responder «Tu plan no tiene cupo para otro vehículo».

Si algo falla en los pasos 1 a 3, **no** cierres la tarea: revisa los logs de Vercel del endpoint correspondiente antes de dar por terminado.

---

## Notas de implementación

- **No dupliques `normalizeEmail`**: importa la de `@/lib/data/invitations`.
- **No transfieras la bitácora ni el daño activo**, y **no toques `publicToken` ni `kmActual`**. Está decidido en el spec.
- **No agregues un `GET /api/transferencias/[token]`**: la página es un server component y lee la capa de datos directo.
- **No agregues E2E de Playwright**: el flujo cruza dos cuentas de empresas distintas y montarlo cuesta más de lo que aporta.
- **Fuera de alcance** (no lo agregues por iniciativa propia): transferir varios vehículos de una vez, transferir a correos sin cuenta, deshacer una transferencia aceptada, y cualquier pantalla de historial de transferencias.
