# Sprint mejoras — Plan 2: Admin borrar empresa + Menú NFC (D+E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El admin de plataforma puede eliminar una empresa completa (con cascade correcto, arreglando de paso `/api/account`), y la ficha pública NFC abre con un menú de opciones (Tomar/Entregar · Documentos · Información).

**Architecture:** Un cascade compartido `deleteCompanyCascade` en un módulo nuevo (`lib/data/deleteCompany.ts`, evita import circular con `vehicles.ts`) es usado por el endpoint admin y por `/api/account` (que además se corrige: un miembro no-dueño ya no borra la empresa entera). La ficha pública se reestructura client-side en `PublicVehicleView` con un estado `vista` (menú → 3 vistas), sin rutas nuevas.

**Tech Stack:** Next.js 16 (App Router, TS estricto), Firebase Admin SDK (Firestore + Auth), Vitest 4, Tailwind v4.

## Global Constraints

- **Español neutro (Chile), "tú" no "vos"** en UI/copy/comentarios. Iconos SVG inline, sin emojis.
- **Next 16**: `params` de route handlers es `Promise` (`await params`).
- **Seguridad**: `deleteCompanyCascade` solo se invoca server-side tras validar `isAdminEmail` (admin de plataforma) o que el solicitante sea el **dueño** de SU empresa. `companyId` nunca viene del cliente en `/api/account`.
- **Borrado de Auth por miembro es best-effort**: si `adminAuth.deleteUser` falla para un usuario, se sigue con el resto (el perfil Firestore igual se borra).
- **Firestore Admin rechaza `undefined`** en writes (no aplica a deletes, pero rige para cualquier write nuevo).
- **Vitest 4**: mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(() => ({...}))`.
- Verificación antes de cada commit: `npx tsc --noEmit`, `npx eslint app components lib` (0 errores; hay ~4 warnings preexistentes de `react-hooks/set-state-in-effect`, están ok), tests de la tarea.

---

### Task 1: `deleteCompanyCascade` (D — data compartida)

**Files:**
- Create: `lib/data/deleteCompany.ts`
- Test: `lib/data/__tests__/deleteCompany.test.ts` (crear)

**Interfaces:**
- Consumes: `listVehicles(companyId)`, `deleteVehicle(id, companyId)` de `@/lib/data/vehicles`; `adminDb`, `adminAuth` de `@/lib/firebase/admin`.
- Produces: `deleteCompanyCascade(companyId: string): Promise<void>` — borra TODO lo de la empresa: vehículos (cascada docs+archivos), `drivers`/`usages`/`alertas`/`invitations`/`billingRequests` por `companyId`, perfiles `users` + usuarios de Auth (best-effort), y el doc `companies/{id}`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/data/__tests__/deleteCompany.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const borrados: string[] = []
  const authBorrados: string[] = []
  const fixtures: Record<string, string[]> = {
    drivers: ['dr1'],
    usages: ['u1', 'u2'],
    alertas: [],
    invitations: ['i1'],
    billingRequests: [],
    users: ['owner', 'miembro'],
  }
  const adminDb = {
    collection: (col: string) => ({
      where: () => ({
        get: async () => ({
          docs: (fixtures[col] ?? []).map((id) => ({
            id,
            ref: { delete: async () => { borrados.push(`${col}/${id}`) } },
          })),
        }),
      }),
      doc: (id: string) => ({ delete: async () => { borrados.push(`${col}/${id}`) } }),
    }),
  }
  const adminAuth = {
    deleteUser: async (uid: string) => {
      if (uid === 'miembro') throw new Error('auth/user-not-found')
      authBorrados.push(uid)
    },
  }
  return { borrados, authBorrados, adminDb, adminAuth }
})
vi.mock('@/lib/firebase/admin', () => ({ adminDb: h.adminDb, adminAuth: h.adminAuth }))
const listVehicles = vi.hoisted(() => vi.fn())
const deleteVehicle = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/vehicles', () => ({
  listVehicles: (...a: unknown[]) => listVehicles(...a),
  deleteVehicle: (...a: unknown[]) => deleteVehicle(...a),
}))

import { deleteCompanyCascade } from '@/lib/data/deleteCompany'

beforeEach(() => {
  h.borrados.length = 0
  h.authBorrados.length = 0
  listVehicles.mockReset(); deleteVehicle.mockReset()
  listVehicles.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }])
})

describe('deleteCompanyCascade', () => {
  it('borra vehículos en cascada, colecciones por companyId, miembros y la empresa', async () => {
    await deleteCompanyCascade('c1')
    expect(deleteVehicle).toHaveBeenCalledWith('v1', 'c1')
    expect(deleteVehicle).toHaveBeenCalledWith('v2', 'c1')
    expect(h.borrados).toEqual(expect.arrayContaining([
      'drivers/dr1', 'usages/u1', 'usages/u2', 'invitations/i1',
      'users/owner', 'users/miembro', 'companies/c1',
    ]))
  })
  it('si borrar un usuario de Auth falla, sigue con el resto (best-effort)', async () => {
    await deleteCompanyCascade('c1')
    // 'miembro' lanza en Auth pero su perfil igual se borró y el cascade terminó.
    expect(h.authBorrados).toEqual(['owner'])
    expect(h.borrados).toContain('users/miembro')
    expect(h.borrados).toContain('companies/c1')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/data/__tests__/deleteCompany.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el cascade**

Crear `lib/data/deleteCompany.ts`:

```ts
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { listVehicles, deleteVehicle } from '@/lib/data/vehicles'

// Colecciones de nivel superior scopeadas por companyId (además de vehicles/documents,
// que se borran vía deleteVehicle para cascadear también los archivos de Storage).
const COLECCIONES_POR_EMPRESA = ['drivers', 'usages', 'alertas', 'invitations', 'billingRequests']

async function deleteByCompany(col: string, companyId: string): Promise<void> {
  const snap = await adminDb.collection(col).where('companyId', '==', companyId).get()
  for (const d of snap.docs) await d.ref.delete()
}

/**
 * Borra una empresa COMPLETA: vehículos (cascada: documentos + archivos),
 * conductores, usos, alertas, invitaciones, solicitudes de facturación,
 * perfiles de los miembros + sus usuarios de Firebase Auth (best-effort por
 * usuario), y el doc de la empresa. Irreversible. Solo llamar server-side
 * tras validar admin de plataforma o dueño de la empresa.
 */
export async function deleteCompanyCascade(companyId: string): Promise<void> {
  const vehicles = await listVehicles(companyId)
  for (const v of vehicles) await deleteVehicle(v.id, companyId)

  for (const col of COLECCIONES_POR_EMPRESA) await deleteByCompany(col, companyId)

  const users = await adminDb.collection('users').where('companyId', '==', companyId).get()
  for (const u of users.docs) {
    await u.ref.delete()
    try {
      await adminAuth.deleteUser(u.id)
    } catch {
      /* best-effort: el usuario de Auth puede no existir o fallar; el perfil ya se borró */
    }
  }

  await adminDb.collection('companies').doc(companyId).delete()
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/data/__tests__/deleteCompany.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/data/deleteCompany.ts lib/data/__tests__/deleteCompany.test.ts
git commit -m "feat(admin): deleteCompanyCascade compartido (empresa completa + Auth best-effort)"
```

---

### Task 2: Fix `/api/account` — dueño vs. miembro (D)

**Files:**
- Modify: `app/api/account/route.ts` (reescritura completa)
- Test: `app/api/account/__tests__/route.test.ts` (crear)

**Interfaces:**
- Consumes: `deleteCompanyCascade` (Task 1), `getMembership`, `getCompany`, `deleteProfile(uid)`, `adminAuth`, `SESSION_COOKIE`.
- Produces (HTTP): `DELETE /api/account` — dueño → cascade completo; miembro no-dueño → borra SOLO su perfil + su Auth (la empresa queda). Corrige el bug de que un Visor borraba la empresa entera.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/account/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/membership', () => ({ getMembership: (...a: unknown[]) => getMembership(...a) }))
const getCompany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/companies', () => ({ getCompany: (...a: unknown[]) => getCompany(...a) }))
const deleteCompanyCascade = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/deleteCompany', () => ({ deleteCompanyCascade: (...a: unknown[]) => deleteCompanyCascade(...a) }))
const deleteProfile = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/profile', () => ({ deleteProfile: (...a: unknown[]) => deleteProfile(...a) }))
const deleteUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { deleteUser: (...a: unknown[]) => deleteUser(...a) } }))

import { DELETE } from '@/app/api/account/route'

beforeEach(() => {
  getMembership.mockReset(); getCompany.mockReset()
  deleteCompanyCascade.mockReset(); deleteProfile.mockReset(); deleteUser.mockReset()
  getCompany.mockResolvedValue({ id: 'c1', ownerUid: 'owner' })
})

describe('DELETE /api/account', () => {
  it('dueño: borra la empresa completa (cascade)', async () => {
    getMembership.mockResolvedValue({ uid: 'owner', email: 'o@x.cl', companyId: 'c1', role: 'admin' })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(deleteCompanyCascade).toHaveBeenCalledWith('c1')
    expect(deleteProfile).not.toHaveBeenCalled()
  })
  it('miembro no-dueño: borra SOLO su perfil y su Auth; la empresa queda', async () => {
    getMembership.mockResolvedValue({ uid: 'visor', email: 'v@x.cl', companyId: 'c1', role: 'viewer' })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(deleteCompanyCascade).not.toHaveBeenCalled()
    expect(deleteProfile).toHaveBeenCalledWith('visor')
    expect(deleteUser).toHaveBeenCalledWith('visor')
  })
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await DELETE()).status).toBe(401)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run app/api/account/__tests__/route.test.ts`
Expected: FAIL (la ruta actual borra la empresa para cualquier miembro y no usa el cascade).

- [ ] **Step 3: Reescribir la ruta**

Reemplazar `app/api/account/route.ts` completo por:

```ts
import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { getCompany } from '@/lib/data/companies'
import { deleteCompanyCascade } from '@/lib/data/deleteCompany'
import { deleteProfile } from '@/lib/data/profile'
import { adminAuth } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

// Dueño de la empresa: borra la empresa COMPLETA (cascade: vehículos, documentos,
// archivos, conductores, usos, alertas, invitaciones, miembros + sus usuarios de
// Auth). Miembro no-dueño: borra SOLO su perfil y su usuario de Auth — la empresa
// y los demás miembros quedan intactos.
export async function DELETE() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const company = await getCompany(m.companyId)
  if (company && company.ownerUid === m.uid) {
    await deleteCompanyCascade(m.companyId)
  } else {
    await deleteProfile(m.uid)
    await adminAuth.deleteUser(m.uid)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run app/api/account/__tests__/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/account/route.ts app/api/account/__tests__/route.test.ts
git commit -m "fix(account): miembro no-dueno ya no borra la empresa; dueno usa cascade completo"
```

---

### Task 3: `DELETE /api/admin/companies/[id]` (D — endpoint admin)

**Files:**
- Modify: `app/api/admin/companies/[id]/route.ts` (agregar DELETE)
- Test: `app/api/admin/companies/[id]/__tests__/route.test.ts` (crear)

**Interfaces:**
- Consumes: `getCurrentUser`, `isAdminEmail`, `deleteCompanyCascade` (Task 1).
- Produces (HTTP): `DELETE /api/admin/companies/[id]` → `200 { ok: true }` | `401` sin sesión | `403` si no es admin de plataforma.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/admin/companies/[id]/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }))
const isAdminEmail = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/admin', () => ({ isAdminEmail: (...a: unknown[]) => isAdminEmail(...a) }))
vi.mock('@/lib/data/companies', () => ({ saveCompany: vi.fn() }))
const deleteCompanyCascade = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/deleteCompany', () => ({ deleteCompanyCascade: (...a: unknown[]) => deleteCompanyCascade(...a) }))

import { DELETE } from '@/app/api/admin/companies/[id]/route'

function ctx(id: string) { return { params: Promise.resolve({ id }) } }
const req = {} as import('next/server').NextRequest

beforeEach(() => {
  getCurrentUser.mockReset(); isAdminEmail.mockReset(); deleteCompanyCascade.mockReset()
  getCurrentUser.mockResolvedValue({ uid: 'me', email: 'admin@x.cl' })
  isAdminEmail.mockReturnValue(true)
})

describe('DELETE /api/admin/companies/[id]', () => {
  it('borra la empresa vía cascade', async () => {
    const res = await DELETE(req, ctx('c9'))
    expect(res.status).toBe(200)
    expect(deleteCompanyCascade).toHaveBeenCalledWith('c9')
  })
  it('403 si no es admin de plataforma', async () => {
    isAdminEmail.mockReturnValue(false)
    expect((await DELETE(req, ctx('c9'))).status).toBe(403)
    expect(deleteCompanyCascade).not.toHaveBeenCalled()
  })
  it('401 sin sesión', async () => {
    getCurrentUser.mockResolvedValue(null)
    expect((await DELETE(req, ctx('c9'))).status).toBe(401)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run "app/api/admin/companies/[id]/__tests__/route.test.ts"`
Expected: FAIL (`DELETE` no está exportado).

- [ ] **Step 3: Agregar el handler**

En `app/api/admin/companies/[id]/route.ts`, agregar el import:

```ts
import { deleteCompanyCascade } from '@/lib/data/deleteCompany'
```

Y al final del archivo:

```ts
// Elimina la empresa COMPLETA (vehículos, documentos, archivos, conductores,
// usos, alertas, invitaciones, miembros + usuarios de Auth). Irreversible.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  await deleteCompanyCascade(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run "app/api/admin/companies/[id]/__tests__/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/companies/[id]/route.ts" "app/api/admin/companies/[id]/__tests__/route.test.ts"
git commit -m "feat(admin): DELETE de empresa completa en el panel de plataforma"
```

---

### Task 4: Botón "Eliminar" con confirmación fuerte en `AdminCompaniesTable` (D — UI)

**Files:**
- Modify: `components/admin/AdminCompaniesTable.tsx`

**Interfaces:**
- Consumes (HTTP): `DELETE /api/admin/companies/[id]` (Task 3).

- [ ] **Step 1: Estado local de filas en el componente padre**

En `components/admin/AdminCompaniesTable.tsx`, reemplazar el componente default export por:

```tsx
export default function AdminCompaniesTable({ companies }: { companies: AdminCompanyRow[] }) {
  const [rows, setRows] = useState(companies)

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-12 text-center">
        <p className="text-sm text-acero">No hay empresas todavía.</p>
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {rows.map((c) => (
        <Row key={c.companyId} c={c} onDeleted={(id) => setRows((prev) => prev.filter((r) => r.companyId !== id))} />
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Confirmación fuerte y borrado en `Row`**

Cambiar la firma de `Row` a:

```tsx
function Row({ c, onDeleted }: { c: AdminCompanyRow; onDeleted: (id: string) => void }) {
```

Agregar estados (junto a los existentes de la fila):

```tsx
  const [confirmando, setConfirmando] = useState(false)
  const [textoConfirm, setTextoConfirm] = useState('')
  const [borrando, setBorrando] = useState(false)
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null)
```

Agregar el handler (tras la función `save`):

```tsx
  async function eliminar() {
    setBorrando(true)
    setErrorBorrar(null)
    const res = await fetch(`/api/admin/companies/${c.companyId}`, { method: 'DELETE' })
    setBorrando(false)
    if (res.ok) onDeleted(c.companyId)
    else setErrorBorrar('No se pudo eliminar la empresa.')
  }
```

En el JSX de la fila, dentro del `<div className="flex items-center gap-2">` (el de los controles de cupo), agregar al final (tras el botón Guardar):

```tsx
          <button
            onClick={() => { setConfirmando(!confirmando); setTextoConfirm(''); setErrorBorrar(null) }}
            className="text-sm font-medium text-vencido hover:underline"
          >
            Eliminar
          </button>
```

Y justo antes del cierre del `<li>` (después del `<div className="mt-1 h-4 text-right text-xs">…</div>`), agregar:

```tsx
      {confirmando && (
        <div className="mt-3 rounded-xl border border-vencido/30 bg-[#FCE7E7]/40 p-3">
          <p className="text-sm text-tinta">
            Se eliminará <span className="font-semibold">{c.razonSocial || c.ownerEmail || 'esta empresa'}</span> con{' '}
            <span className="font-semibold">{c.vehicleCount} {c.vehicleCount === 1 ? 'vehículo' : 'vehículos'}</span>, sus documentos,
            conductores, historial de usos y las cuentas de sus miembros. <span className="font-semibold">No se puede deshacer.</span>
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={textoConfirm}
              onChange={(e) => setTextoConfirm(e.target.value)}
              placeholder="Escribe ELIMINAR para confirmar"
              className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-acero/45 focus:border-vencido focus:outline-none sm:max-w-xs"
            />
            <div className="flex gap-2">
              <button
                onClick={eliminar}
                disabled={textoConfirm !== 'ELIMINAR' || borrando}
                className="rounded-lg bg-vencido px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {borrando ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
              <button
                onClick={() => { setConfirmando(false); setTextoConfirm('') }}
                className="rounded-lg border border-linea bg-superficie px-3 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo"
              >
                Cancelar
              </button>
            </div>
          </div>
          {errorBorrar && <p className="mt-2 text-sm text-vencido">{errorBorrar}</p>}
        </div>
      )}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx eslint app components lib && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 4: Verificación manual (describir en el reporte)**

Con `npm run dev` como admin de plataforma en `/admin`: "Eliminar" abre el bloque de confirmación con el conteo de vehículos; el botón rojo queda deshabilitado hasta escribir exactamente `ELIMINAR`; al confirmar, la fila desaparece.

- [ ] **Step 5: Commit**

```bash
git add components/admin/AdminCompaniesTable.tsx
git commit -m "feat(admin): eliminar empresa con confirmacion fuerte en el panel"
```

---

### Task 5: Menú inicial en la ficha pública (E)

**Files:**
- Modify: `components/PublicVehicleView.tsx` (solo el componente default export y helpers nuevos; `DocumentosView`, `SobreVehiculoView`, `CarIcon` e imports quedan igual)

**Interfaces:**
- Consumes: `UsoPanel` (sin cambios), `DocumentosView`, `SobreVehiculoView` existentes; props actuales del componente (sin cambios de contrato con `app/v/[token]/page.tsx`).

- [ ] **Step 1: Agregar helpers del menú**

En `components/PublicVehicleView.tsx`, agregar sobre el componente default export (después de `SobreVehiculoView`):

```tsx
function hora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

function MenuBoton({ titulo, subtitulo, onClick }: { titulo: string; subtitulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-linea bg-superficie p-5 text-left shadow-sm transition-colors hover:border-azul/40"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-lg font-semibold text-tinta">{titulo}</span>
          <span className="mt-0.5 block text-sm text-acero">{subtitulo}</span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0 text-acero" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Reemplazar el cuerpo del componente por el menú + vistas**

Reemplazar el componente default export completo por:

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
  const [vista, setVista] = useState<'menu' | 'uso' | 'docs' | 'info'>('menu')

  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-6 px-4 py-10">
      <div className="flex justify-center">
        <TapCarLockup iconClassName="size-6" wordClassName="text-lg" />
      </div>

      <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
          <CarIcon />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-tinta">
            {vehicle.marca} {vehicle.modelo} · {vehicle.patente}
          </h1>
          <p className="text-base text-acero">{vehicle.anio} · {vehicle.color}</p>
        </div>
      </div>

      {vista === 'menu' ? (
        <div className="space-y-3">
          {drivers.length > 0 && (
            <MenuBoton
              titulo={enUso ? 'Entregar vehículo' : 'Tomar vehículo'}
              subtitulo={enUso ? `En uso por ${enUso.driverNombre} · desde ${hora(enUso.tomadoEn)}` : 'Disponible · registra quién lo usa'}
              onClick={() => setVista('uso')}
            />
          )}
          <MenuBoton
            titulo="Documentos del vehículo"
            subtitulo="Permiso de circulación, revisión técnica, SOAP y más"
            onClick={() => setVista('docs')}
          />
          <MenuBoton
            titulo="Información del vehículo"
            subtitulo="Datos útiles para quien lo conduce"
            onClick={() => setVista('info')}
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setVista('menu')}
            className="flex items-center gap-1 text-sm font-medium text-azul hover:underline"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Volver
          </button>
          {vista === 'uso' && <UsoPanel token={token} drivers={drivers} enUso={enUso} />}
          {vista === 'docs' && <DocumentosView documents={documents} />}
          {vista === 'info' && <SobreVehiculoView vehicle={vehicle} />}
        </>
      )}

      <p className="pt-2 text-center text-xs text-acero">Ficha de fiscalización · solo lectura</p>
    </main>
  )
}
```

(Esto elimina el estado `tab`, la constante `pill` y el bloque de pestañas pills; `UsoPanel` deja de ser banner permanente y vive dentro de la vista `uso`.)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx eslint app components lib && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 4: Verificación manual (describir en el reporte)**

Con `npm run dev`, abrir `/v/<token>`: se ve el menú con 2 o 3 botones (el de Tomar/Entregar solo si hay conductores activos; su título cambia a "Entregar vehículo" con subtítulo "En uso por X" cuando hay uso abierto). Cada botón lleva a su vista con "← Volver". Los flujos Tomar/Entregar funcionan igual que antes dentro de la vista.

- [ ] **Step 5: Commit**

```bash
git add components/PublicVehicleView.tsx
git commit -m "feat(nfc): menu inicial en la ficha publica (tomar/entregar, documentos, informacion)"
```

---

### Task 6: Documentación + verificación final

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Actualizar CLAUDE.md**

- En la sección del **panel admin de plataforma** (`/admin`): agregar que además de editar `maxVehiculos`, el admin puede **eliminar una empresa completa** vía `DELETE /api/admin/companies/[id]` (confirmación fuerte escribiendo ELIMINAR en `AdminCompaniesTable`), usando `deleteCompanyCascade` de `lib/data/deleteCompany.ts` (borra vehículos con cascada de documentos/archivos, `drivers`/`usages`/`alertas`/`invitations`/`billingRequests`, perfiles + usuarios de Auth de los miembros —best-effort—, y la empresa). Irreversible.
- Donde se describa `/api/account` (sección de perfil/`lib/data`): anotar el fix — el **dueño** borra la empresa completa (mismo cascade); un **miembro no-dueño** borra solo su perfil y su usuario de Auth (antes cualquier miembro borraba la empresa entera: bug corregido).
- En la sección de la **ficha pública** (`/v/<token>` / `PublicVehicleView`): reemplazar la mención de las dos pestañas (pills) por el **menú inicial** de botones: "Tomar/Entregar vehículo" (solo si la empresa tiene conductores activos; título según haya uso abierto), "Documentos del vehículo" y "Información del vehículo", cada vista con "← Volver" (navegación client-side, sin rutas nuevas).
- NO inventes nombres; verifica contra los archivos reales si dudas.

- [ ] **Step 2: Verificación completa**

Run: `npx tsc --noEmit && npx eslint app components lib && npm test && npm run build`
Expected: tsc OK; eslint 0 errores (warnings de `set-state-in-effect` ok); `npm test` todo pasa salvo `rules.test.ts` (emulador, preexistente); build compila. Reporta números exactos.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: eliminar empresa (admin + account fix) y menu de la ficha publica"
```

---

## Self-Review (hecho por el autor del plan)

- **Cobertura del spec (D+E):** cascade compartido → Task 1; fix `/api/account` (huérfanos + bug del Visor) → Task 2; endpoint admin DELETE → Task 3; UI con confirmación fuerte mostrando qué se borra → Task 4; menú NFC con botón Tomar/Entregar condicionado a conductores activos, título según estado, 3 vistas con Volver, client-side → Task 5; docs → Task 6.
- **Import circular evitado:** el cascade vive en `lib/data/deleteCompany.ts` (módulo nuevo) porque `companies.ts` ya es importado por `vehicles.ts`.
- **Tipos consistentes:** `deleteCompanyCascade(companyId: string): Promise<void>` definido en Task 1 y consumido igual en Tasks 2 y 3; `Row({ c, onDeleted })` coincide entre los dos steps de Task 4; las props de `PublicVehicleView` no cambian (el page server no se toca).
- **Sin placeholders:** cada step trae código completo y comandos con resultado esperado.
- **Seguridad:** ambos endpoints validan antes de llamar el cascade; `/api/account` distingue dueño por `company.ownerUid === m.uid` (server-side); si `getCompany` devuelve null, se trata como no-dueño (solo se borra a sí mismo — conservador).
