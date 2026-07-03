# Invitaciones por email y gestión de equipo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un Administrador invite personas por correo (con rol) a su empresa en TapCar, con tope de 5 miembros, y gestionar miembros e invitaciones desde Configuración.

**Architecture:** Nueva colección `invitations/{id}` (solo Admin SDK). El auto-unir ocurre en `ensureProvisioned` (camino de login): si el correo tiene una invitación `pending` no expirada, se une a esa empresa con el rol invitado en vez de crear una propia. Endpoints `/api/company/*` (todos exigen `team:manage`) para invitar / cancelar / cambiar rol / quitar. UI en `components/company/TeamCard.tsx` dentro de Configuración.

**Tech Stack:** Next.js 16 (App Router, TS estricto), Firebase Admin SDK (Firestore + Auth), Resend, Vitest, Tailwind v4.

## Global Constraints

- Idioma: **español neutro (Chile)**, "tú" (no "vos"). Todo el código/UI/comentarios en español.
- **Next 16:** en route handlers dinámicos `params` es `Promise` → tipar `params: Promise<{ ... }>` y `await params`.
- Enforcement en la capa `/api`: cada endpoint privado valida `getMembership()` + `can(role, action)`. **Nunca** confiar en `companyId`/`role` del cliente.
- No confundir **rol `admin` de empresa** (roles.ts) con **admin de plataforma** (`ADMIN_EMAILS`).
- Tope duro: **5 miembros por empresa** (`miembros activos + invitaciones pendientes ≤ 5`).
- **El dueño (`company.ownerUid`) es intocable**: no se puede degradar ni quitar vía el panel de equipo.
- Firestore: usar **queries de un solo campo** + filtrar en memoria (los volúmenes son ≤5) para no requerir índices compuestos.
- Tras cambios: `npx tsc --noEmit` y `npm run build` deben pasar antes de commitear.
- Vitest 4: mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(...)`.

---

## Estructura de archivos

**Crear:**
- `lib/team/capacity.ts` — lógica pura de cupo de equipo.
- `lib/team/__tests__/capacity.test.ts`
- `lib/email/invitationEmail.ts` — copy puro del correo de invitación.
- `lib/email/__tests__/invitationEmail.test.ts`
- `lib/data/invitations.ts` — capa de datos de invitaciones.
- `lib/data/__tests__/invitations.test.ts`
- `lib/data/members.ts` — capa de datos de miembros.
- `lib/data/__tests__/members.test.ts`
- `app/api/company/team/route.ts` — GET lista de equipo.
- `app/api/company/invitations/route.ts` — POST crear invitación.
- `app/api/company/invitations/[id]/route.ts` — DELETE revocar.
- `app/api/company/members/[uid]/route.ts` — PATCH rol / DELETE quitar.
- `app/api/company/invitations/__tests__/route.test.ts`
- `app/api/company/members/__tests__/route.test.ts`
- `app/api/invitations/[token]/route.ts` — GET público acotado (banner).
- `components/company/TeamCard.tsx` — UI del panel de equipo.

**Modificar:**
- `lib/types.ts` — `Invitation`, `MAX_MIEMBROS_EQUIPO`.
- `lib/email/resend.ts` — `sendInvitationEmail`.
- `lib/data/companies.ts` — `ensureProvisioned` auto-une por invitación.
- `app/(app)/configuracion/page.tsx` — montar `TeamCard` para admins.
- `firestore.rules` — bloquear `invitations` al cliente.
- `app/(auth)/login/*` — banner opcional al traer `?invite=<token>` (Task 11, opcional).

---

## Task 1: Tipos + lógica pura de cupo de equipo

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/team/capacity.ts`
- Test: `lib/team/__tests__/capacity.test.ts`

**Interfaces:**
- Produces:
  - `MAX_MIEMBROS_EQUIPO = 5` (en `lib/types.ts`)
  - `interface Invitation { id; companyId; email; role: Role; token; status: 'pending'|'accepted'|'revoked'; invitedByUid; createdAt; expiresAt; acceptedByUid?; acceptedAt? }` (en `lib/types.ts`)
  - `remainingSlots(activeMembers: number, pendingInvites: number): number`
  - `canInvite(activeMembers: number, pendingInvites: number): boolean`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/team/__tests__/capacity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { remainingSlots, canInvite } from '@/lib/team/capacity'

describe('remainingSlots', () => {
  it('descuenta miembros y pendientes del tope de 5', () => {
    expect(remainingSlots(1, 0)).toBe(4)
    expect(remainingSlots(3, 1)).toBe(1)
  })
  it('nunca es negativo', () => {
    expect(remainingSlots(5, 3)).toBe(0)
  })
})

describe('canInvite', () => {
  it('permite invitar mientras haya cupo', () => {
    expect(canInvite(2, 2)).toBe(true)
  })
  it('bloquea al llegar a 5', () => {
    expect(canInvite(4, 1)).toBe(false)
    expect(canInvite(5, 0)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/team/__tests__/capacity.test.ts`
Expected: FAIL ("Cannot find module '@/lib/team/capacity'").

- [ ] **Step 3: Agregar los tipos en `lib/types.ts`**

Al final de `lib/types.ts` (ya importa `Role` en la línea 1):
```ts
export const MAX_MIEMBROS_EQUIPO = 5

export interface Invitation {
  id: string
  companyId: string
  email: string // normalizado a minúsculas
  role: Role
  token: string
  status: 'pending' | 'accepted' | 'revoked'
  invitedByUid: string
  createdAt: string // ISO
  expiresAt: string // ISO
  acceptedByUid?: string
  acceptedAt?: string
}
```

- [ ] **Step 4: Implementar `lib/team/capacity.ts`**

```ts
import { MAX_MIEMBROS_EQUIPO } from '@/lib/types'

/** Cupos disponibles: 5 − miembros activos − invitaciones pendientes (nunca < 0). */
export function remainingSlots(activeMembers: number, pendingInvites: number): number {
  return Math.max(0, MAX_MIEMBROS_EQUIPO - activeMembers - pendingInvites)
}

export function canInvite(activeMembers: number, pendingInvites: number): boolean {
  return remainingSlots(activeMembers, pendingInvites) > 0
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run lib/team/__tests__/capacity.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/types.ts lib/team/
git commit -m "feat(equipo): tipo Invitation + lógica pura de cupo (máx 5)"
```

---

## Task 2: Copy del correo de invitación + sender

**Files:**
- Create: `lib/email/invitationEmail.ts`
- Test: `lib/email/__tests__/invitationEmail.test.ts`
- Modify: `lib/email/resend.ts`

**Interfaces:**
- Consumes: `Role` de `@/lib/auth/roles`.
- Produces:
  - `ROLE_LABELS: Record<Role, string>` (`admin: 'Administrador'`, `editor: 'Editor'`, `viewer: 'Visor'`)
  - `invitationSubject(companyName: string): string`
  - `invitationHtml(params: { companyName: string; role: Role; inviterEmail: string; acceptUrl: string }): string`
  - `sendInvitationEmail(to: string, params: { companyName: string; role: Role; inviterEmail: string; acceptUrl: string }): Promise<void>` (en `resend.ts`)

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/email/__tests__/invitationEmail.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { invitationSubject, invitationHtml, ROLE_LABELS } from '@/lib/email/invitationEmail'

describe('invitationSubject', () => {
  it('incluye el nombre de la empresa', () => {
    expect(invitationSubject('Transportes Sur')).toContain('Transportes Sur')
  })
  it('tolera empresa sin nombre', () => {
    expect(invitationSubject('')).toContain('TapCar')
  })
})

describe('invitationHtml', () => {
  it('incluye rol, quién invita y el enlace', () => {
    const html = invitationHtml({
      companyName: 'Transportes Sur',
      role: 'editor',
      inviterEmail: 'jefe@sur.cl',
      acceptUrl: 'https://app.tapcar.cl/login?invite=abc',
    })
    expect(html).toContain('Transportes Sur')
    expect(html).toContain(ROLE_LABELS.editor)
    expect(html).toContain('jefe@sur.cl')
    expect(html).toContain('https://app.tapcar.cl/login?invite=abc')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/email/__tests__/invitationEmail.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implementar `lib/email/invitationEmail.ts`**

```ts
import type { Role } from '@/lib/auth/roles'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visor',
}

export function invitationSubject(companyName: string): string {
  const empresa = companyName.trim() || 'tu equipo'
  return `Te invitaron a ${empresa} en TapCar`
}

export function invitationHtml(params: {
  companyName: string
  role: Role
  inviterEmail: string
  acceptUrl: string
}): string {
  const { companyName, role, inviterEmail, acceptUrl } = params
  const empresa = companyName.trim() || 'un equipo'
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Te invitaron a ${empresa} en TapCar</h2>
      <p><strong>${inviterEmail}</strong> te invitó a unirte como <strong>${ROLE_LABELS[role]}</strong>.</p>
      <p style="margin: 20px 0;">
        <a href="${acceptUrl}" style="display:inline-block;background:#1D4ED8;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Aceptar invitación</a>
      </p>
      <p style="font-size:13px;color:#64748b;">O abre este enlace:<br>${acceptUrl}</p>
      <p style="font-size:13px;color:#64748b;">La invitación vence en 7 días. Si no esperabas este correo, puedes ignorarlo.</p>
    </div>
  `
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/email/__tests__/invitationEmail.test.ts`
Expected: PASS.

- [ ] **Step 5: Agregar `sendInvitationEmail` en `lib/email/resend.ts`**

Agregar al inicio los imports (junto a los existentes de `reminderEmail`):
```ts
import { invitationSubject, invitationHtml } from '@/lib/email/invitationEmail'
import type { Role } from '@/lib/auth/roles'
```
Agregar al final del archivo:
```ts
export async function sendInvitationEmail(
  to: string,
  params: { companyName: string; role: Role; inviterEmail: string; acceptUrl: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: invitationSubject(params.companyName),
    html: invitationHtml(params),
  })
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/email/
git commit -m "feat(equipo): correo de invitación (copy puro + sender Resend)"
```

---

## Task 3: Capa de datos de invitaciones

**Files:**
- Create: `lib/data/invitations.ts`
- Test: `lib/data/__tests__/invitations.test.ts`

**Interfaces:**
- Consumes: `adminDb` de `@/lib/firebase/admin`; `nanoid`; `Invitation` de `@/lib/types`; `Role` de `@/lib/auth/roles`.
- Produces:
  - `normalizeEmail(email: string): string`
  - `createInvitation(p: { companyId: string; email: string; role: Role; invitedByUid: string }): Promise<Invitation>`
  - `listPendingInvitations(companyId: string): Promise<Invitation[]>` (solo pending no expiradas)
  - `countPendingInvitations(companyId: string): Promise<number>`
  - `hasPendingInvitation(companyId: string, email: string): Promise<boolean>`
  - `findPendingInvitationByEmail(email: string): Promise<Invitation | null>` (la más reciente válida)
  - `getInvitationByToken(token: string): Promise<Invitation | null>`
  - `revokeInvitation(id: string, companyId: string): Promise<void>` (throw `'forbidden'` si no pertenece)
  - `markInvitationAccepted(id: string, acceptedByUid: string): Promise<void>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/data/__tests__/invitations.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockWhere = vi.fn(() => ({ get: mockGet, limit: () => ({ get: mockGet }) }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: mockWhere }) },
}))

import { findPendingInvitationByEmail, listPendingInvitations, normalizeEmail } from '@/lib/data/invitations'

const futuro = '2999-01-01T00:00:00.000Z'
const pasado = '2000-01-01T00:00:00.000Z'

beforeEach(() => {
  mockGet.mockReset()
  mockWhere.mockClear()
})

describe('normalizeEmail', () => {
  it('recorta y baja a minúsculas', () => {
    expect(normalizeEmail('  Foo@Bar.CL ')).toBe('foo@bar.cl')
  })
})

describe('findPendingInvitationByEmail', () => {
  it('ignora invitaciones expiradas', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'i1', data: () => ({ email: 'a@b.cl', status: 'pending', expiresAt: pasado, createdAt: pasado }) }],
    })
    expect(await findPendingInvitationByEmail('a@b.cl')).toBeNull()
  })
  it('devuelve la pendiente vigente', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'i2', data: () => ({ email: 'a@b.cl', status: 'pending', role: 'editor', companyId: 'c1', expiresAt: futuro, createdAt: futuro }) }],
    })
    const inv = await findPendingInvitationByEmail('a@b.cl')
    expect(inv?.id).toBe('i2')
    expect(inv?.companyId).toBe('c1')
  })
})

describe('listPendingInvitations', () => {
  it('filtra las que no están pending o están expiradas', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { id: 'i1', data: () => ({ companyId: 'c1', status: 'pending', expiresAt: futuro, createdAt: futuro }) },
        { id: 'i2', data: () => ({ companyId: 'c1', status: 'revoked', expiresAt: futuro, createdAt: futuro }) },
        { id: 'i3', data: () => ({ companyId: 'c1', status: 'pending', expiresAt: pasado, createdAt: pasado }) },
      ],
    })
    const res = await listPendingInvitations('c1')
    expect(res.map((i) => i.id)).toEqual(['i1'])
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/data/__tests__/invitations.test.ts`
Expected: FAIL ("Cannot find module '@/lib/data/invitations'").

- [ ] **Step 3: Implementar `lib/data/invitations.ts`**

```ts
import { adminDb } from '@/lib/firebase/admin'
import { nanoid } from 'nanoid'
import type { Invitation } from '@/lib/types'
import type { Role } from '@/lib/auth/roles'

const COL = 'invitations'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toInvitation(id: string, d: FirebaseFirestore.DocumentData): Invitation {
  return {
    id,
    companyId: d.companyId,
    email: d.email,
    role: d.role,
    token: d.token,
    status: d.status,
    invitedByUid: d.invitedByUid,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt,
    acceptedByUid: d.acceptedByUid ?? undefined,
    acceptedAt: d.acceptedAt ?? undefined,
  }
}

function vigente(inv: Invitation, nowIso: string): boolean {
  return inv.status === 'pending' && inv.expiresAt > nowIso
}

export async function createInvitation(p: {
  companyId: string
  email: string
  role: Role
  invitedByUid: string
}): Promise<Invitation> {
  const now = new Date()
  const data = {
    companyId: p.companyId,
    email: normalizeEmail(p.email),
    role: p.role,
    token: nanoid(32),
    status: 'pending' as const,
    invitedByUid: p.invitedByUid,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
  }
  const ref = await adminDb.collection(COL).add(data)
  return { id: ref.id, ...data }
}

// Query de un solo campo + filtro en memoria (evita índices compuestos).
export async function listPendingInvitations(companyId: string): Promise<Invitation[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  const nowIso = new Date().toISOString()
  return snap.docs.map((d) => toInvitation(d.id, d.data())).filter((i) => vigente(i, nowIso))
}

export async function countPendingInvitations(companyId: string): Promise<number> {
  return (await listPendingInvitations(companyId)).length
}

export async function hasPendingInvitation(companyId: string, email: string): Promise<boolean> {
  const e = normalizeEmail(email)
  return (await listPendingInvitations(companyId)).some((i) => i.email === e)
}

export async function findPendingInvitationByEmail(email: string): Promise<Invitation | null> {
  const e = normalizeEmail(email)
  const snap = await adminDb.collection(COL).where('email', '==', e).get()
  const nowIso = new Date().toISOString()
  const vigentes = snap.docs.map((d) => toInvitation(d.id, d.data())).filter((i) => vigente(i, nowIso))
  if (vigentes.length === 0) return null
  vigentes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return vigentes[0]
}

export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const snap = await adminDb.collection(COL).where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return toInvitation(snap.docs[0].id, snap.docs[0].data())
}

export async function revokeInvitation(id: string, companyId: string): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  await ref.update({ status: 'revoked' })
}

export async function markInvitationAccepted(id: string, acceptedByUid: string): Promise<void> {
  await adminDb.collection(COL).doc(id).update({
    status: 'accepted',
    acceptedByUid,
    acceptedAt: new Date().toISOString(),
  })
}
```

Nota: el mock del test provee `collection().where().get()`; `doc()` no se ejercita en estos tests. El typecheck valida las firmas.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/__tests__/invitations.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/data/invitations.ts lib/data/__tests__/invitations.test.ts
git commit -m "feat(equipo): capa de datos de invitaciones"
```

---

## Task 4: Auto-unir por invitación en `ensureProvisioned`

**Files:**
- Modify: `lib/data/companies.ts`
- Test: `lib/data/__tests__/companies-provision.test.ts` (nuevo)

**Interfaces:**
- Consumes: `findPendingInvitationByEmail`, `markInvitationAccepted` de `@/lib/data/invitations`.
- Modifica el comportamiento de `ensureProvisioned(uid, email)` (misma firma).

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/data/__tests__/companies-provision.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const userSet = vi.fn()
const userGet = vi.fn()
const companyWhereGet = vi.fn()
const companyAdd = vi.fn()

// adminDb.collection('users').doc(uid) → { get, set }
// adminDb.collection('companies').where(...).limit(1).get() / .add(...)
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === 'users') return { doc: () => ({ get: userGet, set: userSet }) }
      return {
        where: () => ({ limit: () => ({ get: companyWhereGet }) }),
        add: companyAdd,
        doc: () => ({ set: vi.fn() }),
      }
    },
  },
}))

const findPending = vi.fn()
const markAccepted = vi.fn()
vi.mock('@/lib/data/invitations', () => ({
  findPendingInvitationByEmail: (...a: unknown[]) => findPending(...a),
  markInvitationAccepted: (...a: unknown[]) => markAccepted(...a),
}))

import { ensureProvisioned } from '@/lib/data/companies'

beforeEach(() => {
  userSet.mockReset(); userGet.mockReset(); companyWhereGet.mockReset()
  companyAdd.mockReset(); findPending.mockReset(); markAccepted.mockReset()
})

describe('ensureProvisioned', () => {
  it('no hace nada si el usuario ya tiene companyId', async () => {
    userGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await ensureProvisioned('u1', 'a@b.cl')
    expect(userSet).not.toHaveBeenCalled()
    expect(findPending).not.toHaveBeenCalled()
  })

  it('une al usuario a la empresa de la invitación pendiente', async () => {
    userGet.mockResolvedValue({ exists: false, data: () => undefined })
    findPending.mockResolvedValue({ id: 'i1', companyId: 'cX', role: 'editor' })
    await ensureProvisioned('u2', 'nuevo@b.cl')
    expect(userSet).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'cX', role: 'editor', email: 'nuevo@b.cl' }),
      { merge: true },
    )
    expect(markAccepted).toHaveBeenCalledWith('i1', 'u2')
    expect(companyAdd).not.toHaveBeenCalled()
  })

  it('sin invitación, crea empresa propia como admin', async () => {
    userGet.mockResolvedValue({ exists: false, data: () => undefined })
    findPending.mockResolvedValue(null)
    companyWhereGet.mockResolvedValue({ empty: true, docs: [] })
    companyAdd.mockResolvedValue({ id: 'cNueva' })
    await ensureProvisioned('u3', 'solo@b.cl')
    expect(companyAdd).toHaveBeenCalled()
    expect(userSet).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'cNueva', role: 'admin' }),
      { merge: true },
    )
    expect(markAccepted).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/companies-provision.test.ts`
Expected: FAIL (aún no existe el paso de auto-unir; el 2º test falla).

- [ ] **Step 3: Modificar `ensureProvisioned` en `lib/data/companies.ts`**

Agregar el import cerca de los existentes:
```ts
import { findPendingInvitationByEmail, markInvitationAccepted } from '@/lib/data/invitations'
```
Reemplazar el cuerpo de `ensureProvisioned` por:
```ts
export async function ensureProvisioned(uid: string, email: string): Promise<void> {
  const userRef = adminDb.collection('users').doc(uid)
  const userDoc = await userRef.get()
  if (userDoc.exists && userDoc.data()?.companyId) return

  // ¿Fue invitado? Unirlo a esa empresa con su rol en vez de crear una propia.
  const invite = email ? await findPendingInvitationByEmail(email) : null
  if (invite) {
    const patch: Record<string, unknown> = { email, companyId: invite.companyId, role: invite.role }
    if (!userDoc.exists) {
      patch.displayName = ''
      patch.createdAt = new Date().toISOString()
    }
    await userRef.set(patch, { merge: true })
    await markInvitationAccepted(invite.id, uid)
    return
  }

  let companyId: string
  const existing = await adminDb.collection('companies').where('ownerUid', '==', uid).limit(1).get()
  if (!existing.empty) {
    companyId = existing.docs[0].id
  } else {
    companyId = await createCompany(uid, { company: { ...EMPTY_COMPANY }, plan: { ...DEFAULT_PLAN } })
  }

  const patch: Record<string, unknown> = { email, companyId, role: 'admin' }
  if (!userDoc.exists) {
    patch.displayName = ''
    patch.createdAt = new Date().toISOString()
  }
  await userRef.set(patch, { merge: true })
}
```

Nota: `createCompany` usa `adminDb.collection('companies').add(...)`, cubierto por el mock del test.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/data/__tests__/companies-provision.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/data/companies.ts lib/data/__tests__/companies-provision.test.ts
git commit -m "feat(equipo): auto-unir por invitación en el primer login"
```

---

## Task 5: Capa de datos de miembros

**Files:**
- Create: `lib/data/members.ts`
- Test: `lib/data/__tests__/members.test.ts`

**Interfaces:**
- Consumes: `adminDb`, `adminAuth` de `@/lib/firebase/admin`; `Role` de `@/lib/auth/roles`.
- Produces:
  - `interface Member { uid: string; email: string; displayName: string; role: Role; isOwner: boolean }`
  - `listMembers(companyId: string, ownerUid: string): Promise<Member[]>`
  - `countMembers(companyId: string): Promise<number>`
  - `changeMemberRole(companyId: string, targetUid: string, role: Role): Promise<void>` (throw `'forbidden'` si no pertenece)
  - `removeMember(companyId: string, targetUid: string): Promise<void>` (throw `'forbidden'` si no pertenece; borra `users/{uid}`)

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/data/__tests__/members.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const usersWhereGet = vi.fn()
const docUpdate = vi.fn()
const docDelete = vi.fn()
const docGet = vi.fn()
const getUser = vi.fn()

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({ get: usersWhereGet }),
      doc: () => ({ get: docGet, update: docUpdate, delete: docDelete }),
    }),
  },
  adminAuth: { getUser: (...a: unknown[]) => getUser(...a) },
}))

import { listMembers, countMembers, changeMemberRole, removeMember } from '@/lib/data/members'

beforeEach(() => {
  usersWhereGet.mockReset(); docUpdate.mockReset(); docDelete.mockReset(); docGet.mockReset(); getUser.mockReset()
})

describe('listMembers', () => {
  it('marca al dueño y usa el email del doc', async () => {
    usersWhereGet.mockResolvedValue({
      docs: [
        { id: 'owner', data: () => ({ email: 'o@b.cl', displayName: 'Jefe', role: 'admin' }) },
        { id: 'u2', data: () => ({ email: 'e@b.cl', displayName: '', role: 'editor' }) },
      ],
    })
    const res = await listMembers('c1', 'owner')
    expect(res.find((m) => m.uid === 'owner')?.isOwner).toBe(true)
    expect(res.find((m) => m.uid === 'u2')?.isOwner).toBe(false)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('resuelve el email desde Auth si falta en el doc', async () => {
    usersWhereGet.mockResolvedValue({
      docs: [{ id: 'u3', data: () => ({ displayName: '', role: 'viewer' }) }],
    })
    getUser.mockResolvedValue({ email: 'desde-auth@b.cl' })
    const res = await listMembers('c1', 'owner')
    expect(res[0].email).toBe('desde-auth@b.cl')
  })
})

describe('countMembers', () => {
  it('cuenta los docs', async () => {
    usersWhereGet.mockResolvedValue({ size: 3, docs: [] })
    expect(await countMembers('c1')).toBe(3)
  })
})

describe('changeMemberRole', () => {
  it('rechaza si el target es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(changeMemberRole('c1', 'u2', 'editor')).rejects.toThrow('forbidden')
  })
  it('actualiza el rol si pertenece', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await changeMemberRole('c1', 'u2', 'editor')
    expect(docUpdate).toHaveBeenCalledWith({ role: 'editor' })
  })
})

describe('removeMember', () => {
  it('borra el doc si pertenece', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await removeMember('c1', 'u2')
    expect(docDelete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/members.test.ts`
Expected: FAIL ("Cannot find module '@/lib/data/members'").

- [ ] **Step 3: Implementar `lib/data/members.ts`**

```ts
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import type { Role } from '@/lib/auth/roles'

export interface Member {
  uid: string
  email: string
  displayName: string
  role: Role
  isOwner: boolean
}

const COL = 'users'

export async function listMembers(companyId: string, ownerUid: string): Promise<Member[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  const members: Member[] = []
  for (const d of snap.docs) {
    const data = d.data()
    let email: string = data.email ?? ''
    if (!email) {
      try {
        email = (await adminAuth.getUser(d.id)).email ?? ''
      } catch {
        email = ''
      }
    }
    members.push({
      uid: d.id,
      email,
      displayName: data.displayName ?? '',
      role: data.role,
      isOwner: d.id === ownerUid,
    })
  }
  return members
}

export async function countMembers(companyId: string): Promise<number> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.size
}

async function assertSameCompany(targetUid: string, companyId: string) {
  const ref = adminDb.collection(COL).doc(targetUid)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  return ref
}

export async function changeMemberRole(companyId: string, targetUid: string, role: Role): Promise<void> {
  const ref = await assertSameCompany(targetUid, companyId)
  await ref.update({ role })
}

export async function removeMember(companyId: string, targetUid: string): Promise<void> {
  const ref = await assertSameCompany(targetUid, companyId)
  await ref.delete()
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/data/__tests__/members.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/data/members.ts lib/data/__tests__/members.test.ts
git commit -m "feat(equipo): capa de datos de miembros (listar/cambiar rol/quitar)"
```

---

## Task 6: API — POST crear invitación + DELETE revocar

**Files:**
- Create: `app/api/company/invitations/route.ts`
- Create: `app/api/company/invitations/[id]/route.ts`
- Test: `app/api/company/invitations/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getMembership`, `can`, `Role`; `adminAuth`, `adminDb`; `getCompany`; `countMembers`; `createInvitation`, `hasPendingInvitation`, `countPendingInvitations`, `normalizeEmail`, `revokeInvitation`; `canInvite`; `sendInvitationEmail`.
- Produces (contrato HTTP):
  - `POST /api/company/invitations` `{ email, role }` → `200 { invitation, acceptUrl }` | `400` inválido | `403` no-admin | `409` cupo | `422` ya-miembro/ya-cuenta/ya-invitado.
  - `DELETE /api/company/invitations/[id]` → `200 { ok: true }` | `401/403`.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/company/invitations/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))

const getUserByEmail = vi.fn()
const userDocGet = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { getUserByEmail: (...a: unknown[]) => getUserByEmail(...a) },
  adminDb: { collection: () => ({ doc: () => ({ get: userDocGet }) }) },
}))

const countMembers = vi.fn()
vi.mock('@/lib/data/members', () => ({ countMembers: () => countMembers() }))

const hasPending = vi.fn()
const countPending = vi.fn()
const createInvitation = vi.fn()
vi.mock('@/lib/data/invitations', () => ({
  hasPendingInvitation: (...a: unknown[]) => hasPending(...a),
  countPendingInvitations: () => countPending(),
  createInvitation: (...a: unknown[]) => createInvitation(...a),
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
}))

vi.mock('@/lib/data/companies', () => ({ getCompany: () => Promise.resolve({ company: { razonSocial: 'X' } }) }))
const sendInvitationEmail = vi.fn()
vi.mock('@/lib/email/resend', () => ({ sendInvitationEmail: (...a: unknown[]) => sendInvitationEmail(...a) }))

import { POST } from '@/app/api/company/invitations/route'

function reqBody(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  getMembership.mockReset(); getUserByEmail.mockReset(); userDocGet.mockReset()
  countMembers.mockReset(); hasPending.mockReset(); countPending.mockReset()
  createInvitation.mockReset(); sendInvitationEmail.mockReset()
  getUserByEmail.mockRejectedValue(new Error('not found')) // correo libre por defecto
  hasPending.mockResolvedValue(false)
  countMembers.mockResolvedValue(1); countPending.mockResolvedValue(0)
  createInvitation.mockResolvedValue({ id: 'i1', token: 'tok' })
})

const admin = { uid: 'u1', email: 'jefe@b.cl', companyId: 'c1', role: 'admin' }

describe('POST /api/company/invitations', () => {
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ ...admin, role: 'editor' })
    const res = await POST(reqBody({ email: 'a@b.cl', role: 'viewer' }))
    expect(res.status).toBe(403)
  })

  it('400 con correo inválido', async () => {
    getMembership.mockResolvedValue(admin)
    const res = await POST(reqBody({ email: 'no-es-correo', role: 'viewer' }))
    expect(res.status).toBe(400)
  })

  it('422 si el correo ya tiene cuenta con empresa', async () => {
    getMembership.mockResolvedValue(admin)
    getUserByEmail.mockResolvedValue({ uid: 'uX' })
    userDocGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'cOtra' }) })
    const res = await POST(reqBody({ email: 'ya@b.cl', role: 'viewer' }))
    expect(res.status).toBe(422)
  })

  it('409 si no hay cupo', async () => {
    getMembership.mockResolvedValue(admin)
    countMembers.mockResolvedValue(4); countPending.mockResolvedValue(1)
    const res = await POST(reqBody({ email: 'a@b.cl', role: 'viewer' }))
    expect(res.status).toBe(409)
  })

  it('200 crea la invitación y devuelve acceptUrl', async () => {
    getMembership.mockResolvedValue(admin)
    const res = await POST(reqBody({ email: 'A@B.cl', role: 'editor' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.acceptUrl).toContain('invite=tok')
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', email: 'a@b.cl', role: 'editor', invitedByUid: 'u1' }),
    )
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run app/api/company/invitations/__tests__/route.test.ts`
Expected: FAIL ("Cannot find module '.../route'").

- [ ] **Step 3: Implementar `app/api/company/invitations/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can, type Role } from '@/lib/auth/roles'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getCompany } from '@/lib/data/companies'
import { countMembers } from '@/lib/data/members'
import {
  createInvitation,
  hasPendingInvitation,
  countPendingInvitations,
  normalizeEmail,
} from '@/lib/data/invitations'
import { canInvite } from '@/lib/team/capacity'
import { sendInvitationEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

const ROLES: Role[] = ['admin', 'editor', 'viewer']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'team:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(String(body?.email ?? ''))
  const role = body?.role as Role
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Correo inválido.' }, { status: 400 })
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 })

  // ¿El correo ya pertenece a una cuenta TapCar con empresa? (evita huérfanar sus datos)
  try {
    const u = await adminAuth.getUserByEmail(email)
    const udoc = await adminDb.collection('users').doc(u.uid).get()
    if (udoc.exists && udoc.data()?.companyId) {
      return NextResponse.json({ error: 'Ese correo ya pertenece a una cuenta de TapCar.' }, { status: 422 })
    }
  } catch {
    /* getUserByEmail lanza si el correo no existe: está libre */
  }

  if (await hasPendingInvitation(m.companyId, email)) {
    return NextResponse.json({ error: 'Ya hay una invitación pendiente para ese correo.' }, { status: 422 })
  }

  const [members, pending] = await Promise.all([countMembers(m.companyId), countPendingInvitations(m.companyId)])
  if (!canInvite(members, pending)) {
    return NextResponse.json({ error: 'Alcanzaste el máximo de 5 miembros.' }, { status: 409 })
  }

  const invitation = await createInvitation({ companyId: m.companyId, email, role, invitedByUid: m.uid })
  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login?invite=${invitation.token}`

  // Enviar el correo es best-effort: si falla, la invitación igual queda creada.
  try {
    const company = await getCompany(m.companyId)
    await sendInvitationEmail(email, {
      companyName: company?.company.razonSocial ?? '',
      role,
      inviterEmail: m.email,
      acceptUrl,
    })
  } catch {
    /* la invitación ya existe; la UI ofrece copiar el enlace */
  }

  return NextResponse.json({ invitation, acceptUrl })
}
```

- [ ] **Step 4: Implementar `app/api/company/invitations/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { revokeInvitation } from '@/lib/data/invitations'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'team:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    await revokeInvitation(id, m.companyId)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run app/api/company/invitations/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/api/company/invitations/
git commit -m "feat(equipo): API para crear y revocar invitaciones"
```

---

## Task 7: API — GET equipo + PATCH/DELETE miembro

**Files:**
- Create: `app/api/company/team/route.ts`
- Create: `app/api/company/members/[uid]/route.ts`
- Test: `app/api/company/members/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getMembership`, `can`, `Role`; `getCompany`; `listMembers`, `changeMemberRole`, `removeMember`; `listPendingInvitations`.
- Produces (contrato HTTP):
  - `GET /api/company/team` → `200 { members, invitations }` | `401/403`.
  - `PATCH /api/company/members/[uid]` `{ role }` → `200 { ok }` | `400` rol inválido | `403` no-admin / target=dueño / target=uno mismo.
  - `DELETE /api/company/members/[uid]` → `200 { ok }` | `403` mismas guardas.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/company/members/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
vi.mock('@/lib/data/companies', () => ({ getCompany: () => Promise.resolve({ ownerUid: 'owner' }) }))

const changeMemberRole = vi.fn()
const removeMember = vi.fn()
vi.mock('@/lib/data/members', () => ({
  changeMemberRole: (...a: unknown[]) => changeMemberRole(...a),
  removeMember: (...a: unknown[]) => removeMember(...a),
}))

import { PATCH, DELETE } from '@/app/api/company/members/[uid]/route'

const admin = { uid: 'u1', email: 'j@b.cl', companyId: 'c1', role: 'admin' }
function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest
}
function ctx(uid: string) {
  return { params: Promise.resolve({ uid }) }
}

beforeEach(() => {
  getMembership.mockReset(); changeMemberRole.mockReset(); removeMember.mockReset()
  getMembership.mockResolvedValue(admin)
})

describe('PATCH members', () => {
  it('403 al dueño', async () => {
    const res = await PATCH(req({ role: 'editor' }), ctx('owner'))
    expect(res.status).toBe(403)
    expect(changeMemberRole).not.toHaveBeenCalled()
  })
  it('403 a uno mismo', async () => {
    const res = await PATCH(req({ role: 'editor' }), ctx('u1'))
    expect(res.status).toBe(403)
  })
  it('400 rol inválido', async () => {
    const res = await PATCH(req({ role: 'jefe' }), ctx('u2'))
    expect(res.status).toBe(400)
  })
  it('200 cambia rol de otro miembro', async () => {
    const res = await PATCH(req({ role: 'viewer' }), ctx('u2'))
    expect(res.status).toBe(200)
    expect(changeMemberRole).toHaveBeenCalledWith('c1', 'u2', 'viewer')
  })
})

describe('DELETE members', () => {
  it('403 al dueño', async () => {
    const res = await DELETE(req({}), ctx('owner'))
    expect(res.status).toBe(403)
    expect(removeMember).not.toHaveBeenCalled()
  })
  it('200 quita a otro miembro', async () => {
    const res = await DELETE(req({}), ctx('u2'))
    expect(res.status).toBe(200)
    expect(removeMember).toHaveBeenCalledWith('c1', 'u2')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run app/api/company/members/__tests__/route.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implementar `app/api/company/members/[uid]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership, type Membership } from '@/lib/auth/membership'
import { can, type Role } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { changeMemberRole, removeMember } from '@/lib/data/members'

export const dynamic = 'force-dynamic'

const ROLES: Role[] = ['admin', 'editor', 'viewer']

type Guard = { error: NextResponse } | { m: Membership }

async function guard(targetUid: string): Promise<Guard> {
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
  const g = await guard(uid)
  if ('error' in g) return g.error
  const body = await req.json().catch(() => ({}))
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
  const g = await guard(uid)
  if ('error' in g) return g.error
  try {
    await removeMember(g.m.companyId, uid)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

Nota: `Membership` ya se exporta desde `lib/auth/membership.ts` (interfaz `Membership`).

- [ ] **Step 4: Implementar `app/api/company/team/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { listMembers } from '@/lib/data/members'
import { listPendingInvitations } from '@/lib/data/invitations'

export const dynamic = 'force-dynamic'

export async function GET() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'team:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const company = await getCompany(m.companyId)
  const [members, invitations] = await Promise.all([
    listMembers(m.companyId, company?.ownerUid ?? ''),
    listPendingInvitations(m.companyId),
  ])
  return NextResponse.json({
    members,
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
  })
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run app/api/company/members/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/api/company/team/ app/api/company/members/
git commit -m "feat(equipo): API de equipo (listar) y gestión de miembros (rol/quitar)"
```

---

## Task 8: API pública acotada — invitación por token (banner)

**Files:**
- Create: `app/api/invitations/[token]/route.ts`

**Interfaces:**
- Consumes: `getInvitationByToken`; `getCompany`.
- Produces: `GET /api/invitations/[token]` → `200 { companyName, role, email }` si vigente | `404` si no.

- [ ] **Step 1: Implementar la ruta**

```ts
import { NextResponse } from 'next/server'
import { getInvitationByToken } from '@/lib/data/invitations'
import { getCompany } from '@/lib/data/companies'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inv = await getInvitationByToken(token)
  if (!inv || inv.status !== 'pending' || inv.expiresAt <= new Date().toISOString()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const company = await getCompany(inv.companyId)
  return NextResponse.json({
    companyName: company?.company.razonSocial ?? '',
    role: inv.role,
    email: inv.email,
  })
}
```

- [ ] **Step 2: Verificar typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; la ruta aparece en el output del build.

- [ ] **Step 3: Commit**

```bash
git add app/api/invitations/
git commit -m "feat(equipo): endpoint público acotado de invitación por token"
```

---

## Task 9: Reglas Firestore — bloquear `invitations`

**Files:**
- Modify: `firestore.rules`

**Interfaces:** ninguna (defensa en profundidad; el cliente nunca consulta `invitations`).

- [ ] **Step 1: Agregar el match en `firestore.rules`**

Dentro de `service cloud.firestore { match /databases/{database}/documents { ... } }`, junto a los otros `match`, agregar:
```
    // Invitaciones: solo se acceden server-side (Admin SDK). Cliente sin acceso.
    match /invitations/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Verificar la sintaxis desplegando a un proyecto de prueba o revisando en consola**

El despliegue real lo hace el usuario. Verificación local mínima: confirmar que el archivo no tiene llaves sin cerrar.
Run: `node -e "const s=require('fs').readFileSync('firestore.rules','utf8'); const o=(s.match(/{/g)||[]).length, c=(s.match(/}/g)||[]).length; if(o!==c) throw new Error('llaves desbalanceadas '+o+'/'+c); console.log('OK llaves', o)"`
Expected: `OK llaves <n>`.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(equipo): reglas Firestore bloquean invitations al cliente"
```

Nota para el usuario: desplegar con `node --env-file=.env.local scripts/deploy-firestore-rules.mjs` cuando corresponda.

---

## Task 10: UI — panel de equipo en Configuración

**Files:**
- Create: `components/company/TeamCard.tsx`
- Modify: `app/(app)/configuracion/page.tsx`

**Interfaces:**
- Consumes (HTTP): `GET/POST /api/company/*` de las tasks 6-7.
- `TeamCard` no recibe props (carga su estado vía `GET /api/company/team` al montar).

- [ ] **Step 1: Implementar `components/company/TeamCard.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'

type Role = 'admin' | 'editor' | 'viewer'
const ROLE_LABELS: Record<Role, string> = { admin: 'Administrador', editor: 'Editor', viewer: 'Visor' }
const ROLE_OPTIONS: Role[] = ['viewer', 'editor', 'admin']

interface Member { uid: string; email: string; displayName: string; role: Role; isOwner: boolean }
interface Invitation { id: string; email: string; role: Role; expiresAt: string }

function diasRestantes(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export default function TeamCard() {
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLink, setLastLink] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/company/team')
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members)
      setInvitations(data.invitations)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const total = members.length + invitations.length
  const lleno = total >= 5

  async function invitar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setLastLink(null)
    const res = await fetch('/api/company/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    setBusy(false)
    if (res.ok) {
      const data = await res.json()
      setLastLink(data.acceptUrl)
      setEmail('')
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo invitar.')
    }
  }

  async function cancelar(id: string) {
    await fetch(`/api/company/invitations/${id}`, { method: 'DELETE' })
    load()
  }
  async function cambiarRol(uid: string, nuevo: Role) {
    await fetch(`/api/company/members/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nuevo }),
    })
    load()
  }
  async function quitar(uid: string) {
    if (!confirm('¿Quitar a este miembro del equipo?')) return
    await fetch(`/api/company/members/${uid}`, { method: 'DELETE' })
    load()
  }

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-tinta">Equipo</h2>
        <span className="text-sm text-acero">{total} de 5 miembros</span>
      </div>
      <p className="mt-1 text-sm text-acero">Invita personas y define qué pueden hacer con tu flota.</p>

      {loading ? (
        <p className="mt-4 text-sm text-acero">Cargando…</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {members.map((mem) => (
              <li key={mem.uid} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tinta">{mem.email || mem.displayName || mem.uid}</p>
                  {mem.isOwner && <span className="text-xs text-acero">Dueño</span>}
                </div>
                {mem.isOwner ? (
                  <span className="rounded-full bg-lienzo px-2.5 py-1 text-xs font-medium text-acero">{ROLE_LABELS[mem.role]}</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={mem.role}
                      onChange={(e) => cambiarRol(mem.uid, e.target.value as Role)}
                      className="rounded-lg border border-linea bg-superficie px-2 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none"
                    >
                      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <button onClick={() => quitar(mem.uid)} className="text-sm text-vencido hover:underline">Quitar</button>
                  </div>
                )}
              </li>
            ))}

            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-linea px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tinta">{inv.email}</p>
                  <span className="text-xs text-acero">Invitación pendiente · {ROLE_LABELS[inv.role]} · expira en {diasRestantes(inv.expiresAt)} días</span>
                </div>
                <button onClick={() => cancelar(inv.id)} className="text-sm text-vencido hover:underline">Cancelar</button>
              </li>
            ))}
          </ul>

          {lleno ? (
            <p className="mt-4 text-sm text-acero">Alcanzaste el máximo de 5 miembros.</p>
          ) : (
            <form onSubmit={invitar} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@empresa.cl"
                className="flex-1 rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta focus:border-azul focus:outline-none"
              >
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
              >
                {busy ? 'Invitando…' : 'Invitar'}
              </button>
            </form>
          )}

          {error && <p className="mt-2 text-sm text-vencido">{error}</p>}
          {lastLink && (
            <p className="mt-2 text-sm text-acero">
              Invitación creada. Si el correo no llega, comparte este enlace:{' '}
              <button
                onClick={() => navigator.clipboard?.writeText(lastLink)}
                className="font-medium text-azul hover:underline"
              >
                copiar enlace
              </button>
            </p>
          )}
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Montar `TeamCard` en `app/(app)/configuracion/page.tsx`**

Agregar el import:
```tsx
import TeamCard from '@/components/company/TeamCard'
```
Dentro del `return`, después del bloque `{esAdmin ? (<CompanyCard .../>) : (...)}`, agregar (solo para admins):
```tsx
      {esAdmin && <TeamCard />}
```
(Queda dentro del `<main>`, debajo de la tarjeta de datos de empresa.)

- [ ] **Step 3: Verificar typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Verificación manual (dev server)**

Run: `npm run dev`, entra a `/configuracion` como Administrador. Verifica: se lista el dueño con su rol; el formulario de invitar aparece; invitar un correo de prueba muestra la invitación pendiente y el enlace "copiar enlace"; cancelar la quita; el contador dice "N de 5". Como Editor/Visor, el panel no aparece.

- [ ] **Step 5: Commit**

```bash
git add components/company/TeamCard.tsx "app/(app)/configuracion/page.tsx"
git commit -m "feat(equipo): panel de equipo en Configuración (invitar/gestionar)"
```

---

## Task 11 (opcional): Banner de invitación en el login

**Files:**
- Modify: `app/(auth)/login/*` (el componente de la página de login)

**Interfaces:**
- Consumes (HTTP): `GET /api/invitations/[token]` (Task 8).

**Objetivo:** cuando el login recibe `?invite=<token>`, mostrar un aviso "Te invitaron a *Empresa X* como *Rol*. Inicia sesión con *correo* para aceptar." Es un nice-to-have; el auto-unir ya funciona sin esto.

- [ ] **Step 1: Localizar el componente de login**

Run: `git ls-files "app/(auth)/login"`
Leer el archivo de la página para ver si es client component y cómo lee search params.

- [ ] **Step 2: Leer el token y traer el contexto**

En el componente cliente del login, con `useSearchParams()` de `next/navigation`, si hay `invite`, hacer `fetch('/api/invitations/' + token)` y si responde 200 guardar `{ companyName, role, email }` en estado.

- [ ] **Step 3: Renderizar el aviso**

Encima del formulario, si hay contexto de invitación:
```tsx
{invite && (
  <div className="mb-4 rounded-lg border border-azul/30 bg-azul/5 px-4 py-3 text-sm text-tinta">
    Te invitaron a <strong>{invite.companyName || 'un equipo'}</strong> como{' '}
    <strong>{{ admin: 'Administrador', editor: 'Editor', viewer: 'Visor' }[invite.role]}</strong>.
    Inicia sesión con <strong>{invite.email}</strong> para aceptar.
  </div>
)}
```

- [ ] **Step 4: Verificar typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/login"
git commit -m "feat(equipo): banner de invitación en el login (?invite=token)"
```

---

## Cierre

- [ ] **Suite completa + build final**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: todo verde.

- [ ] **Recordatorio al usuario:** desplegar reglas Firestore (`node --env-file=.env.local scripts/deploy-firestore-rules.mjs`) y confirmar `RESEND_API_KEY` / `RESEND_FROM` en el entorno para que el correo de invitación salga. El auto-unir funciona aunque el correo no salga.
