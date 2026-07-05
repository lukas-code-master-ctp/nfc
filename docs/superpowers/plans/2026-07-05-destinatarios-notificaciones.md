# Destinatarios de notificaciones por miembro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir elegir, por miembro del equipo, quién recibe las notificaciones por email (recordatorios de vencimiento y el aviso de "sin entrega formal").

**Architecture:** Se agrega un flag `recibeAlertas` por usuario (`users/{uid}`) con default implícito (el dueño ON, el resto OFF — sin migración). Un resolver compartido `alertRecipientEmails` es la única fuente de destinatarios, usado por el cron de vencimientos y por la ruta pública `tomar`. La UI vive en `TeamCard` (solo Administrador).

**Tech Stack:** Next.js 16 (App Router, TS estricto), Firebase Admin SDK (Firestore + Auth), Resend, Vitest 4.

## Global Constraints

- **Español neutro (Chile), "tú" no "vos"** en toda UI/copy/comentarios.
- **Next 16**: `params` de route handlers es `Promise` (`await params`).
- **No confiar en el cliente**: los `/api/*` privados validan `getMembership()` + `can(role, action)` antes de mutar; `companyId` se resuelve en el servidor.
- **Correos best-effort**: un fallo de Resend nunca rompe el flujo (try/catch).
- **Sin migración**: el default (`recibeAlertas` ausente → `uid === ownerUid`) preserva el comportamiento actual.
- **Vitest 4**: mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(() => ({...}))`.
- Verificación antes de cada commit final de tarea: `npx eslint app components lib`, `npx tsc --noEmit`, tests de la tarea.

**Nota de alcance:** hoy el único email de "alerta de flota" es el de **sin-entrega** (en `app/api/v/[token]/tomar/route.ts`, al forzar cierre). El **daño** solo crea una alerta in-app (`/flota`), sin email — queda igual. Este plan cambia los destinatarios de los emails que **ya existen**; no agrega un email de daño.

---

### Task 1: Flag `recibeAlertas` en el modelo + resolución del default

**Files:**
- Modify: `lib/types.ts` (interface `UserProfile`)
- Modify: `lib/data/members.ts` (interface `Member`, `listMembers`, nuevo helper puro)
- Test: `lib/data/__tests__/members.test.ts` (crear)

**Interfaces:**
- Produces: `resolveRecibeAlertas(stored: unknown, isOwner: boolean): boolean`
- Produces: `Member` gana `recibeAlertas: boolean`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/data/__tests__/members.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveRecibeAlertas } from '@/lib/data/members'

describe('resolveRecibeAlertas', () => {
  it('respeta el valor explícito true', () => {
    expect(resolveRecibeAlertas(true, false)).toBe(true)
  })
  it('respeta el valor explícito false aunque sea el dueño', () => {
    expect(resolveRecibeAlertas(false, true)).toBe(false)
  })
  it('sin valor: el dueño recibe por defecto', () => {
    expect(resolveRecibeAlertas(undefined, true)).toBe(true)
  })
  it('sin valor: un no-dueño no recibe por defecto', () => {
    expect(resolveRecibeAlertas(undefined, false)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/data/__tests__/members.test.ts`
Expected: FAIL (`resolveRecibeAlertas` no existe / no exportado).

- [ ] **Step 3: Agregar el campo a `UserProfile`**

En `lib/types.ts`, en `interface UserProfile`, agregar tras `role: Role`:

```ts
  /** Si el miembro recibe las notificaciones por email (vencimientos + alertas de flota).
   *  Ausente = default: lo recibe solo el dueño de la empresa. */
  recibeAlertas?: boolean
```

- [ ] **Step 4: Agregar el helper puro y el campo en `Member`/`listMembers`**

En `lib/data/members.ts`:

Agregar a `interface Member` (tras `isOwner: boolean`):

```ts
  recibeAlertas: boolean
```

Agregar el helper puro (arriba, tras `const COL = 'users'`):

```ts
/** Resuelve si un miembro recibe alertas. Ausente = solo el dueño por defecto. */
export function resolveRecibeAlertas(stored: unknown, isOwner: boolean): boolean {
  return typeof stored === 'boolean' ? stored : isOwner
}
```

En `listMembers`, dentro del `members.push({...})`, agregar el campo:

```ts
      recibeAlertas: resolveRecibeAlertas(data.recibeAlertas, d.id === ownerUid),
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run lib/data/__tests__/members.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/data/members.ts lib/data/__tests__/members.test.ts
git commit -m "feat(team): flag recibeAlertas por miembro + default del dueno"
```

---

### Task 2: Resolver de destinatarios + mutación

**Files:**
- Modify: `lib/data/members.ts` (`alertRecipientEmails`, `setMemberNotificaciones`)
- Test: `lib/data/__tests__/members.test.ts` (agregar casos)

**Interfaces:**
- Consumes: `listMembers(companyId, ownerUid)` (ya devuelve `recibeAlertas`), `resolveRecibeAlertas`
- Produces: `alertRecipientEmails(companyId: string, ownerUid: string): Promise<string[]>`
- Produces: `setMemberNotificaciones(companyId: string, targetUid: string, value: boolean): Promise<void>`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/data/__tests__/members.test.ts` (arriba del todo, antes de los `describe`, el mock de `listMembers`; usar `vi.hoisted`):

```ts
import { vi } from 'vitest'
const listMembersMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/firebase/admin', () => ({ adminDb: {}, adminAuth: {} }))
```

Y un nuevo `describe` que espía `listMembers`. Como `alertRecipientEmails` llama a `listMembers` del mismo módulo, testeamos el filtrado con datos armados directamente (no Firestore): reimplementamos la expectativa sobre la salida de `listMembers`. Para poder inyectar, `alertRecipientEmails` recibe la lista vía `listMembers` real, así que este test mockea `adminDb`. Simplificamos: probamos el **filtrado** exponiendo la lógica sobre un arreglo de `Member`.

Agregar el helper puro testeable y su test:

```ts
import { pickRecipientEmails } from '@/lib/data/members'

describe('pickRecipientEmails', () => {
  const base = { displayName: '', role: 'viewer' as const, isOwner: false }
  it('toma solo los que reciben y tienen email, deduplicado', () => {
    const emails = pickRecipientEmails([
      { uid: 'a', email: 'a@x.cl', recibeAlertas: true, ...base },
      { uid: 'b', email: 'b@x.cl', recibeAlertas: false, ...base },
      { uid: 'c', email: '', recibeAlertas: true, ...base },
      { uid: 'd', email: 'a@x.cl', recibeAlertas: true, ...base },
    ])
    expect(emails).toEqual(['a@x.cl'])
  })
  it('lista vacía si nadie recibe', () => {
    expect(pickRecipientEmails([{ uid: 'a', email: 'a@x.cl', recibeAlertas: false, ...base }])).toEqual([])
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/data/__tests__/members.test.ts`
Expected: FAIL (`pickRecipientEmails` no existe).

- [ ] **Step 3: Implementar `pickRecipientEmails`, `alertRecipientEmails` y `setMemberNotificaciones`**

En `lib/data/members.ts`:

```ts
/** Filtra los emails de los miembros que reciben alertas (dedup, sin vacíos). */
export function pickRecipientEmails(members: Member[]): string[] {
  const emails = members.filter((m) => m.recibeAlertas && m.email).map((m) => m.email)
  return [...new Set(emails)]
}

/** Emails de los miembros de la empresa que reciben notificaciones. */
export async function alertRecipientEmails(companyId: string, ownerUid: string): Promise<string[]> {
  const members = await listMembers(companyId, ownerUid)
  return pickRecipientEmails(members)
}

/** Activa/desactiva las notificaciones de un miembro. Permite al dueño y a uno mismo. */
export async function setMemberNotificaciones(
  companyId: string,
  targetUid: string,
  value: boolean,
): Promise<void> {
  const ref = await assertSameCompany(targetUid, companyId)
  await ref.update({ recibeAlertas: value })
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/__tests__/members.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/members.ts lib/data/__tests__/members.test.ts
git commit -m "feat(team): alertRecipientEmails + setMemberNotificaciones"
```

---

### Task 3: Cron de vencimientos manda a todos los destinatarios

**Files:**
- Modify: `lib/data/vehicles.ts` (`vehicleInfoForReminder`)
- Modify: `lib/documents/runReminders.ts` (`ReminderDeps.vehicleInfo`, `processReminders`)
- Test: `lib/documents/__tests__/runReminders.test.ts` (actualizar)

**Interfaces:**
- Consumes: `alertRecipientEmails(companyId, ownerUid)` (Task 2), `getCompany`
- Produces: `vehicleInfoForReminder(vehicleId): Promise<{ patente: string; emails: string[] } | null>`
- Produces: `ReminderDeps.vehicleInfo: (vehicleId: string) => Promise<{ patente: string; emails: string[] } | null>`

- [ ] **Step 1: Actualizar el test (que ahora falla)**

En `lib/documents/__tests__/runReminders.test.ts`, cambiar los tres `vehicleInfo` para devolver `emails: string[]` y el primer test para verificar envío a cada uno:

Test "envía y marca el hito de 30 días":

```ts
    const deps = {
      allDocuments: async () => [doc({})],
      vehicleInfo: async () => ({ patente: 'ABCD12', emails: ['a@b.cl', 'c@d.cl'] }),
      sendReminderEmail: send,
      markReminderSent: mark,
    }
    const res = await processReminders(deps, now)
    expect(res.sent).toBe(1)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith('a@b.cl', expect.objectContaining({ patente: 'ABCD12', milestone: '30' }))
    expect(send).toHaveBeenCalledWith('c@d.cl', expect.objectContaining({ milestone: '30' }))
    expect(mark).toHaveBeenCalledWith('d1', 'c1', ['30'])
```

En los otros dos tests, cambiar `vehicleInfo` a `async () => ({ patente: 'ABCD12', emails: ['a@b.cl'] })` y `async () => ({ patente: 'X', emails: ['a@b.cl'] })` respectivamente.

Agregar un cuarto test (lista vacía = no envía):

```ts
  it('no envía si no hay destinatarios', async () => {
    const send = vi.fn()
    const deps = {
      allDocuments: async () => [doc({})],
      vehicleInfo: async () => ({ patente: 'ABCD12', emails: [] }),
      sendReminderEmail: send,
      markReminderSent: vi.fn(),
    }
    expect((await processReminders(deps, now)).sent).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/documents/__tests__/runReminders.test.ts`
Expected: FAIL (aún se manda a `info.email`, no a `info.emails`).

- [ ] **Step 3: Actualizar `runReminders.ts`**

En `lib/documents/runReminders.ts`, cambiar la firma de `vehicleInfo` en `ReminderDeps`:

```ts
  vehicleInfo: (vehicleId: string) => Promise<{ patente: string; emails: string[] } | null>
```

Y el cuerpo del loop en `processReminders` (reemplazar desde `const info = ...` hasta el `sent++`):

```ts
    const info = await deps.vehicleInfo(d.vehicleId)
    if (!info || info.emails.length === 0) continue
    const label = d.tipo === 'otro' ? d.nombrePersonalizado ?? 'Documento' : DOCUMENT_TYPE_LABELS[d.tipo]
    for (const email of info.emails) {
      await deps.sendReminderEmail(email, {
        patente: info.patente,
        label,
        fechaVencimiento: d.fechaVencimiento!,
        milestone,
      })
    }
    await deps.markReminderSent(d.id, d.companyId, [...d.remindersSent, milestone])
    sent++
```

- [ ] **Step 4: Actualizar `vehicleInfoForReminder`**

En `lib/data/vehicles.ts`, reemplazar la función `vehicleInfoForReminder` completa por:

```ts
export async function vehicleInfoForReminder(
  vehicleId: string,
): Promise<{ patente: string; emails: string[] } | null> {
  const v = await getVehicle(vehicleId)
  if (!v || !v.companyId) return null
  try {
    const company = await getCompany(v.companyId)
    if (!company) return { patente: v.patente, emails: [] }
    const emails = await alertRecipientEmails(v.companyId, company.ownerUid)
    return { patente: v.patente, emails }
  } catch {
    return { patente: v.patente, emails: [] }
  }
}
```

Agregar el import arriba de `lib/data/vehicles.ts` (junto a los imports existentes):

```ts
import { alertRecipientEmails } from '@/lib/data/members'
```

(Ya existe el import de `getCompany`; si no, agregarlo desde `@/lib/data/companies`.)

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/documents/__tests__/runReminders.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. (El route del cron `app/api/cron/reminders/route.ts` no cambia: sigue pasando `vehicleInfoForReminder`, cuya firma nueva calza con `ReminderDeps`.)

- [ ] **Step 7: Commit**

```bash
git add lib/data/vehicles.ts lib/documents/runReminders.ts lib/documents/__tests__/runReminders.test.ts
git commit -m "feat(reminders): mandar recordatorios a todos los destinatarios configurados"
```

---

### Task 4: Endpoint — rama `recibeAlertas` en `PATCH /api/company/members/[uid]`

**Files:**
- Modify: `app/api/company/members/[uid]/route.ts`
- Test: `app/api/company/members/[uid]/__tests__/route.test.ts` (crear)

**Interfaces:**
- Consumes: `getMembership`, `can`, `getCompany`, `changeMemberRole`, `removeMember`, `setMemberNotificaciones` (Task 2)
- Produces (HTTP): `PATCH .../members/[uid]` acepta `{ role }` (guard estricto) **o** `{ recibeAlertas: boolean }` (guard suave: `team:manage` + misma empresa, permite dueño/uno-mismo).

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/company/members/[uid]/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/membership', () => ({ getMembership: (...a: unknown[]) => getMembership(...a) }))
const getCompany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/companies', () => ({ getCompany: (...a: unknown[]) => getCompany(...a) }))
const changeMemberRole = vi.hoisted(() => vi.fn())
const setMemberNotificaciones = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/members', () => ({
  changeMemberRole: (...a: unknown[]) => changeMemberRole(...a),
  removeMember: vi.fn(),
  setMemberNotificaciones: (...a: unknown[]) => setMemberNotificaciones(...a),
}))

import { PATCH } from '@/app/api/company/members/[uid]/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(uid: string) { return { params: Promise.resolve({ uid }) } }

beforeEach(() => {
  getMembership.mockReset(); getCompany.mockReset(); changeMemberRole.mockReset(); setMemberNotificaciones.mockReset()
  getMembership.mockResolvedValue({ uid: 'me', email: 'me@x.cl', companyId: 'c1', role: 'admin' })
  getCompany.mockResolvedValue({ ownerUid: 'owner' })
})

describe('PATCH members/[uid]', () => {
  it('recibeAlertas: permite tocar al dueño', async () => {
    const res = await PATCH(req({ recibeAlertas: false }), ctx('owner'))
    expect(res.status).toBe(200)
    expect(setMemberNotificaciones).toHaveBeenCalledWith('c1', 'owner', false)
  })
  it('recibeAlertas: permite tocarse a uno mismo', async () => {
    const res = await PATCH(req({ recibeAlertas: true }), ctx('me'))
    expect(res.status).toBe(200)
    expect(setMemberNotificaciones).toHaveBeenCalledWith('c1', 'me', true)
  })
  it('role: sigue bloqueando al dueño', async () => {
    const res = await PATCH(req({ role: 'editor' }), ctx('owner'))
    expect(res.status).toBe(403)
    expect(changeMemberRole).not.toHaveBeenCalled()
  })
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ uid: 'me', email: 'me@x.cl', companyId: 'c1', role: 'editor' })
    const res = await PATCH(req({ recibeAlertas: true }), ctx('owner'))
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run "app/api/company/members/[uid]/__tests__/route.test.ts"`
Expected: FAIL (la rama `recibeAlertas` no existe; hoy `{recibeAlertas}` cae en la validación de rol y da 400/403).

- [ ] **Step 3: Reescribir el route handler**

Reemplazar `app/api/company/members/[uid]/route.ts` completo por:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership, type Membership } from '@/lib/auth/membership'
import { can, type Role } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { changeMemberRole, removeMember, setMemberNotificaciones } from '@/lib/data/members'

export const dynamic = 'force-dynamic'

const ROLES: Role[] = ['admin', 'editor', 'viewer']

// Guard estricto: para cambio de rol y baja. Bloquea uno-mismo y al dueño.
type Guard = { error: NextResponse } | { m: Membership }
async function strictGuard(targetUid: string): Promise<Guard> {
  const m = await getMembership()
  if (!m) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!can(m.role, 'team:manage')) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  if (targetUid === m.uid) {
    return { error: NextResponse.json({ error: 'No puedes cambiarte a ti mismo.' }, { status: 403 }) }
  }
  const company = await getCompany(m.companyId)
  if (company?.ownerUid === targetUid) {
    return { error: NextResponse.json({ error: 'No se puede modificar al dueño de la empresa.' }, { status: 403 }) }
  }
  return { m }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params
  const body = await req.json().catch(() => ({}))

  // Rama notificaciones: guard suave (permite al dueño y a uno mismo).
  if (typeof body?.recibeAlertas === 'boolean') {
    const m = await getMembership()
    if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!can(m.role, 'team:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    try {
      await setMemberNotificaciones(m.companyId, uid, body.recibeAlertas)
    } catch {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    return NextResponse.json({ ok: true })
  }

  // Rama rol: guard estricto.
  const g = await strictGuard(uid)
  if ('error' in g) return g.error
  const role = body?.role as Role
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 })
  try {
    await changeMemberRole(g.m.companyId, uid, role)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params
  const g = await strictGuard(uid)
  if ('error' in g) return g.error
  try {
    await removeMember(g.m.companyId, uid)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run "app/api/company/members/[uid]/__tests__/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/company/members/[uid]/route.ts" "app/api/company/members/[uid]/__tests__/route.test.ts"
git commit -m "feat(team): rama recibeAlertas en PATCH members/[uid]"
```

---

### Task 5: Alerta "sin entrega" usa la lista de destinatarios

**Files:**
- Modify: `app/api/v/[token]/tomar/route.ts`
- Test: `app/api/v/[token]/tomar/__tests__/route.test.ts` (actualizar mocks)

**Interfaces:**
- Consumes: `alertRecipientEmails(companyId, ownerUid)` (Task 2), `getCompany`, `sendUsageAlertEmail`

- [ ] **Step 1: Actualizar el test (mock del resolver)**

En `app/api/v/[token]/tomar/__tests__/route.test.ts`:

Reemplazar la línea del mock de `firebase/admin` (línea 17) por un mock de `members`:

```ts
vi.mock('@/lib/data/members', () => ({ alertRecipientEmails: () => Promise.resolve(['o@b.cl']) }))
```

(Se elimina el `vi.mock('@/lib/firebase/admin', ...)`: el route ya no importa `adminAuth`.)

- [ ] **Step 2: Correr el test y verificar que falla (o rompe por import)**

Run: `npx vitest run "app/api/v/[token]/tomar/__tests__/route.test.ts"`
Expected: FAIL (el route aún importa `adminAuth`, que ya no está mockeado; o el mock de members no se usa todavía).

- [ ] **Step 3: Actualizar el route**

En `app/api/v/[token]/tomar/route.ts`:

Reemplazar el import de `adminAuth` (línea 6) por el resolver:

```ts
import { alertRecipientEmails } from '@/lib/data/members'
```

Reemplazar el bloque de envío del email (dentro de `if (forced) { try { ... } catch {...} }`) por:

```ts
    try {
      const company = await getCompany(vehicle.companyId)
      const emails = company ? await alertRecipientEmails(vehicle.companyId, company.ownerUid) : []
      for (const to of emails) {
        await sendUsageAlertEmail(to, {
          patente: vehicle.patente,
          driverNombre: forced.driverNombre,
          tomadoEn: forced.tomadoEn,
        })
      }
    } catch {
      /* best-effort: el uso ya se abrió */
    }
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run "app/api/v/[token]/tomar/__tests__/route.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/v/[token]/tomar/route.ts" "app/api/v/[token]/tomar/__tests__/route.test.ts"
git commit -m "feat(flota): aviso sin-entrega a los destinatarios configurados"
```

---

### Task 6: UI — switch de notificaciones por miembro en `TeamCard`

**Files:**
- Modify: `components/company/TeamCard.tsx`

**Interfaces:**
- Consumes (HTTP): `GET /api/company/team` (cada `member` ahora trae `recibeAlertas`), `PATCH /api/company/members/[uid]` con `{ recibeAlertas }`

- [ ] **Step 1: Agregar el campo al tipo local y el handler**

En `components/company/TeamCard.tsx`:

Agregar `recibeAlertas` a la interface local `Member` (tras `isOwner: boolean`):

```ts
  recibeAlertas: boolean
```

Agregar el handler junto a `cambiarRol`/`quitar`:

```ts
  async function toggleNotif(uid: string, value: boolean) {
    const res = await fetch(`/api/company/members/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recibeAlertas: value }),
    })
    if (res.ok) {
      setError(null)
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo cambiar las notificaciones.')
      load()
    }
  }
```

- [ ] **Step 2: Insertar el toggle en cada fila de miembro**

Reemplazar el bloque de la derecha de la fila de miembro (el ternario `mem.isOwner || mem.uid === currentUid ? ... : ...`) por una versión que **siempre** muestra el toggle de notificaciones antes del control de rol:

```tsx
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleNotif(mem.uid, !mem.recibeAlertas)}
                    aria-pressed={mem.recibeAlertas}
                    title={mem.recibeAlertas ? 'Recibe notificaciones por email' : 'No recibe notificaciones'}
                    className={
                      mem.recibeAlertas
                        ? 'flex items-center gap-1 rounded-full border border-azul/30 bg-azul/10 px-2.5 py-1 text-xs font-medium text-azul'
                        : 'flex items-center gap-1 rounded-full border border-linea px-2.5 py-1 text-xs font-medium text-acero hover:text-tinta'
                    }
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    Avisos
                  </button>
                  {mem.isOwner || mem.uid === currentUid ? (
                    <span className="rounded-full bg-lienzo px-2.5 py-1 text-xs font-medium text-acero">{ROLE_LABELS[mem.role]}</span>
                  ) : (
                    <>
                      <select
                        value={mem.role}
                        onChange={(e) => cambiarRol(mem.uid, e.target.value as Role)}
                        className="rounded-lg border border-linea bg-superficie px-2 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none"
                      >
                        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      <button onClick={() => quitar(mem.uid)} className="text-sm text-vencido hover:underline">Quitar</button>
                    </>
                  )}
                </div>
```

- [ ] **Step 3: Agregar el aviso "nadie recibe"**

Justo después de `</ul>` (antes del bloque `{lleno ? ... }`), agregar:

```tsx
          {members.length > 0 && members.every((m) => !m.recibeAlertas) && (
            <p className="mt-3 rounded-lg bg-[#FEF3C7] px-3 py-2 text-xs text-[#92400E]">
              Nadie recibirá las notificaciones de vencimiento ni las alertas de flota.
            </p>
          )}
```

- [ ] **Step 4: Verificar typecheck, lint y build**

Run: `npx tsc --noEmit && npx eslint app components lib && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 5: Verificación manual**

Levantar `npm run dev`, entrar como Administrador a Configuración → Equipo:
- Cada miembro (incluido el dueño y uno mismo) muestra el chip "Avisos", azul si recibe.
- Al hacer clic alterna y persiste (recargar la página lo confirma).
- Desmarcar a todos muestra el aviso ámbar.

- [ ] **Step 6: Commit**

```bash
git add components/company/TeamCard.tsx
git commit -m "feat(team): switch de notificaciones por miembro en TeamCard"
```

---

### Task 7: Verificación final + documentación

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Actualizar CLAUDE.md**

En la sección de "Bitácora de uso de flota" / pendientes, actualizar el texto del **sub-proyecto 3**: ya no está pendiente elegir destinatarios. Reemplazar la frase que dice que los recordatorios van al `ownerUid` por:

> Los destinatarios de las notificaciones (recordatorios de vencimiento + aviso de sin-entrega) se configuran **por miembro** en el panel de Equipo (`TeamCard`, switch "Avisos"): flag `recibeAlertas` en `users/{uid}` (ausente = solo el dueño, sin migración); resolver `alertRecipientEmails` en `lib/data/members.ts` es la única fuente, usado por el cron de vencimientos y por `tomar` (sin-entrega). El **daño** sigue siendo solo alerta in-app (sin email).

Y en `lib/data/` de la sección Arquitectura, agregar a `members.ts` la mención de `alertRecipientEmails`/`setMemberNotificaciones`.

- [ ] **Step 2: Verificación completa**

Run: `npx tsc --noEmit && npx eslint app components lib && npm test && npm run build`
Expected: typecheck OK, 0 errores de eslint, todos los tests pasan, build compila.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: destinatarios de notificaciones configurables por miembro"
```

---

## Self-Review (hecho por el autor del plan)

- **Cobertura del spec:** modelo `recibeAlertas` (T1) ✓; resolver + mutación (T2) ✓; cron vencimientos (T3) ✓; endpoint rama recibeAlertas con guard suave (T4) ✓; alertas de flota / sin-entrega (T5) ✓; UI switch + aviso "nadie recibe" (T6) ✓; default sin migración (T1, semántica) ✓; docs (T7) ✓.
- **Ajuste respecto al spec:** el spec mencionaba modificar `tomar` **y** `entregar`; en la realidad solo `tomar` manda email (sin-entrega). `entregar` (daño) solo crea alerta in-app y queda igual. Anotado en "Nota de alcance".
- **Consistencia de tipos:** `{ patente; emails: string[] }` usado igual en `vehicleInfoForReminder` (T3) y `ReminderDeps.vehicleInfo` (T3); `alertRecipientEmails(companyId, ownerUid): Promise<string[]>` consumido igual en T3 y T5; `setMemberNotificaciones(companyId, targetUid, value)` definido en T2 y consumido en T4; `Member.recibeAlertas: boolean` en T1 usado por T2 y T6.
- **Sin placeholders:** cada step trae código real y comandos con resultado esperado.
