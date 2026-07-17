# Incidencia previa (daño preexistente) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un conductor reporta un daño preexistente al tomar un vehículo (sin culpar a nadie), y un admin marca/desmarca vehículos como dañados; el estado (con foto/comentario) se ve antes de tomar, en el dashboard y por email.

**Architecture:** Estado persistente `Vehicle.danoActivo` denormalizado; lógica pura para armar el objeto sin `undefined`; data layer con set/clear + limpieza de foto en Storage; endpoints admin (autenticados) y públicos (PIN); UI en ficha pública, ficha del vehículo y dashboard; email best-effort en el reporte del conductor.

**Tech Stack:** Next.js 16 (App Router, async params), TypeScript estricto, Firebase Admin + Cloud Storage (signed URLs), Resend, Vitest.

## Global Constraints

- **Idioma:** todo en **español neutro (Chile)**, "tú" (no "vos").
- **Iconos SVG inline** (no emojis, salvo el glifo de advertencia ya usado en el repo). Tokens de color de `app/globals.css` (`tinta`/`acero`/`linea`/`superficie`/`azul`; estados verde `#15803D`/`#E6F4EA`, ámbar `#B45309`/`#FDF1DC`, rojo `#C81E1E`/`#FCE7E7`, neutro `#EEF0F3`).
- **Firestore Admin rechaza `undefined`**: objetos sin claves undefined o `?? null`.
- **Nunca confiar en el cliente** en `/api/*` autenticados: `getMembership()` + `can(role, action)`, `companyId` del servidor. En rutas públicas `/api/v/[token]/*`: autenticación por **PIN del conductor** (`verifyDriverPin`), `companyId` resuelto por el token.
- **Emails best-effort** (try/catch; nunca rompen el flujo) y **brandeados** (`emailLayout`/`ctaButton`/`appUrl`).
- **Storage**: borrar archivos con `{ ignoreNotFound: true }`. Sin archivos huérfanos.
- **Next 16**: `params` async.
- Roles: marcar/desmarcar daño (admin) → `vehicle:write`. El reporte del conductor es público (PIN).
- Tras cambios: `npx tsc --noEmit`, `npx eslint app components lib`, `npm test` (menos `rules.test.ts`, que necesita emulador), `npm run build`.

## File Structure

- `lib/types.ts` — MODIFICAR: `DanoActivo`; `Vehicle.danoActivo?`.
- `lib/usages/danoActivo.ts` — CREAR: `buildDanoActivo` (puro).
- `lib/usages/__tests__/danoActivo.test.ts` — CREAR.
- `lib/storage/signedUrls.ts` — MODIFICAR: `createDanoUrl`.
- `lib/data/vehicles.ts` — MODIFICAR: `toVehicle`, `setDanoActivo`, `clearDanoActivo`, cascada en `deleteVehicle`.
- `lib/data/__tests__/vehicles-dano.test.ts` — CREAR.
- `app/api/vehicles/[id]/dano/route.ts` — CREAR (POST/DELETE).
- `app/api/vehicles/[id]/dano/upload-url/route.ts` — CREAR (POST).
- `app/api/v/[token]/upload-url/route.ts` — MODIFICAR: tipo `incidencia` sin uso abierto.
- `app/api/v/[token]/tomar/route.ts` — MODIFICAR: `dano` opcional + email.
- `lib/email/incidenciaEmail.ts` — CREAR; `lib/email/resend.ts` — MODIFICAR: `sendIncidenciaEmail`.
- `app/v/[token]/page.tsx` — MODIFICAR: signed read URL del `danoActivo`.
- `components/PublicVehicleView.tsx` — MODIFICAR: banner.
- `components/uso/UsoPanel.tsx` — MODIFICAR: reporte al tomar.
- `components/vehicle/DanoActivoPanel.tsx` — CREAR; `app/(app)/vehiculos/[id]/page.tsx` — MODIFICAR.
- `components/VehicleCard.tsx`, `components/VehiclesBoard.tsx`, `app/(app)/dashboard/page.tsx` — MODIFICAR: pill "Dañado".
- `CLAUDE.md` — MODIFICAR.

---

## Task 1: Tipos + lógica pura + data layer + signed URL

**Files:**
- Modify: `lib/types.ts`, `lib/storage/signedUrls.ts`, `lib/data/vehicles.ts`
- Create: `lib/usages/danoActivo.ts`, `lib/usages/__tests__/danoActivo.test.ts`, `lib/data/__tests__/vehicles-dano.test.ts`

**Interfaces:**
- Produces:
  - `interface DanoActivo { nota: string | null; fotoPath: string | null; reportadoPor: 'admin' | 'conductor'; reportadoPorNombre: string | null; reportadoEn: string }`
  - `Vehicle.danoActivo?: DanoActivo | null`
  - `buildDanoActivo(input: { nota?: string | null; fotoPath?: string | null }, reportadoPor: 'admin' | 'conductor', reportadoPorNombre: string | null, ahoraISO: string): DanoActivo`
  - `createDanoUrl(vehicleId: string, contentType: string): Promise<{ uploadUrl: string; filePath: string }>`
  - `setDanoActivo(vehicleId: string, companyId: string, dano: DanoActivo): Promise<void>`
  - `clearDanoActivo(vehicleId: string, companyId: string): Promise<void>`

- [ ] **Step 1: Tipos en `lib/types.ts`**

Añade cerca de las interfaces de dominio:

```typescript
export interface DanoActivo {
  nota: string | null
  fotoPath: string | null
  reportadoPor: 'admin' | 'conductor'
  reportadoPorNombre: string | null // nombre del conductor; null si lo marcó el admin
  reportadoEn: string // ISO
}
```

En `interface Vehicle`, tras `mantencionReminders?: ...`:

```typescript
  danoActivo?: DanoActivo | null
```

- [ ] **Step 2: Test que falla — `lib/usages/__tests__/danoActivo.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { buildDanoActivo } from '@/lib/usages/danoActivo'

describe('buildDanoActivo', () => {
  const now = '2026-07-09T12:00:00.000Z'
  it('arma el objeto sin claves undefined y normaliza a null', () => {
    const d = buildDanoActivo({}, 'admin', null, now)
    expect(d).toEqual({ nota: null, fotoPath: null, reportadoPor: 'admin', reportadoPorNombre: null, reportadoEn: now })
    expect(Object.values(d).includes(undefined as never)).toBe(false)
  })
  it('recorta la nota y guarda el conductor', () => {
    const d = buildDanoActivo({ nota: '  rayón en la puerta  ', fotoPath: 'vehicles/v1/dano/x' }, 'conductor', 'Ana', now)
    expect(d.nota).toBe('rayón en la puerta')
    expect(d.fotoPath).toBe('vehicles/v1/dano/x')
    expect(d.reportadoPor).toBe('conductor')
    expect(d.reportadoPorNombre).toBe('Ana')
  })
  it('nota vacía → null; tope 500', () => {
    expect(buildDanoActivo({ nota: '   ' }, 'admin', null, now).nota).toBeNull()
    expect(buildDanoActivo({ nota: 'x'.repeat(600) }, 'admin', null, now).nota!.length).toBe(500)
  })
})
```

- [ ] **Step 3: Verificar que falla**

Run: `npx vitest run lib/usages/__tests__/danoActivo.test.ts` → FAIL (módulo no existe).

- [ ] **Step 4: Implementar `lib/usages/danoActivo.ts`**

```typescript
import type { DanoActivo } from '@/lib/types'

/** Arma el objeto danoActivo SIN claves undefined (Firestore las rechaza). */
export function buildDanoActivo(
  input: { nota?: string | null; fotoPath?: string | null },
  reportadoPor: 'admin' | 'conductor',
  reportadoPorNombre: string | null,
  ahoraISO: string,
): DanoActivo {
  const notaTrim = (input.nota ?? '').trim()
  return {
    nota: notaTrim ? notaTrim.slice(0, 500) : null,
    fotoPath: input.fotoPath ? input.fotoPath : null,
    reportadoPor,
    reportadoPorNombre: reportadoPorNombre ?? null,
    reportadoEn: ahoraISO,
  }
}
```

- [ ] **Step 5: Verificar que pasa** — `npx vitest run lib/usages/__tests__/danoActivo.test.ts` → PASS.

- [ ] **Step 6: `createDanoUrl` en `lib/storage/signedUrls.ts`**

```typescript
export async function createDanoUrl(
  vehicleId: string,
  contentType: string,
): Promise<{ uploadUrl: string; filePath: string }> {
  const filePath = `vehicles/${vehicleId}/dano/${nanoid(10)}-foto`
  const [uploadUrl] = await adminBucket.file(filePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
  })
  return { uploadUrl, filePath }
}
```

- [ ] **Step 7: Test que falla — `lib/data/__tests__/vehicles-dano.test.ts`**

Espeja el patrón de `usages.test.ts` (mock de admin con `doc().get/update`, `adminBucket.file().delete`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const docGet = vi.fn()
const docUpdate = vi.fn()
const bucketDelete = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: docGet, update: docUpdate }) }) },
  adminBucket: { file: (p: string) => ({ delete: (...a: unknown[]) => bucketDelete(p, ...a) }) },
}))

import { setDanoActivo, clearDanoActivo } from '@/lib/data/vehicles'

const dano = { nota: 'x', fotoPath: 'vehicles/v1/dano/nuevo', reportadoPor: 'admin' as const, reportadoPorNombre: null, reportadoEn: '2026-07-09T12:00:00Z' }

beforeEach(() => { docGet.mockReset(); docUpdate.mockReset(); bucketDelete.mockReset() })

describe('setDanoActivo', () => {
  it('valida companyId y escribe danoActivo', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await setDanoActivo('v1', 'c1', dano)
    expect(docUpdate).toHaveBeenCalledWith({ danoActivo: dano })
  })
  it('borra la foto anterior si se reemplaza por otra', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', danoActivo: { fotoPath: 'vehicles/v1/dano/vieja' } }) })
    await setDanoActivo('v1', 'c1', dano)
    expect(bucketDelete).toHaveBeenCalledWith('vehicles/v1/dano/vieja', { ignoreNotFound: true })
  })
  it('lanza forbidden si es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(setDanoActivo('v1', 'c1', dano)).rejects.toThrow('forbidden')
  })
})

describe('clearDanoActivo', () => {
  it('borra la foto y setea null', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', danoActivo: { fotoPath: 'vehicles/v1/dano/x' } }) })
    await clearDanoActivo('v1', 'c1')
    expect(bucketDelete).toHaveBeenCalledWith('vehicles/v1/dano/x', { ignoreNotFound: true })
    expect(docUpdate).toHaveBeenCalledWith({ danoActivo: null })
  })
})
```

- [ ] **Step 8: Verificar que falla** — `npx vitest run lib/data/__tests__/vehicles-dano.test.ts` → FAIL.

- [ ] **Step 9: Implementar en `lib/data/vehicles.ts`**

Imports (arriba, junto a los existentes): `adminBucket` desde `@/lib/firebase/admin` y el tipo:
```typescript
import { adminDb, adminBucket } from '@/lib/firebase/admin'
import type { Vehicle, DanoActivo } from '@/lib/types'
```
(Ajusta la línea de import de `adminDb` para incluir `adminBucket`, y la de tipos para incluir `DanoActivo`.)

En `toVehicle`, tras `mantencionReminders`:
```typescript
    danoActivo: data.danoActivo ?? null,
```

Añade las funciones (usan el `assertCompany` existente que valida pertenencia y devuelve el vehículo):
```typescript
export async function setDanoActivo(vehicleId: string, companyId: string, dano: DanoActivo): Promise<void> {
  const v = await assertCompany(vehicleId, companyId)
  const anterior = v.danoActivo?.fotoPath
  if (anterior && anterior !== dano.fotoPath) {
    await adminBucket.file(anterior).delete({ ignoreNotFound: true })
  }
  await adminDb.collection(COL).doc(vehicleId).update({ danoActivo: dano })
}

export async function clearDanoActivo(vehicleId: string, companyId: string): Promise<void> {
  const v = await assertCompany(vehicleId, companyId)
  const foto = v.danoActivo?.fotoPath
  if (foto) await adminBucket.file(foto).delete({ ignoreNotFound: true })
  await adminDb.collection(COL).doc(vehicleId).update({ danoActivo: null })
}
```

En `deleteVehicle`, antes de borrar el doc del vehículo (tras `deleteMantencionesByVehicle`), limpia la foto del daño activo:
```typescript
  const vActual = await getVehicle(vehicleId)
  if (vActual?.danoActivo?.fotoPath) {
    await adminBucket.file(vActual.danoActivo.fotoPath).delete({ ignoreNotFound: true })
  }
```
(Colócalo justo antes de `await adminDb.collection(COL).doc(vehicleId).delete()`.)

- [ ] **Step 10: Verificar tests + tsc** — `npx vitest run lib/usages/__tests__/danoActivo.test.ts lib/data/__tests__/vehicles-dano.test.ts` → PASS; `npx tsc --noEmit` OK.

- [ ] **Step 11: Commit**

```bash
git add lib/types.ts lib/usages/danoActivo.ts lib/usages/__tests__/danoActivo.test.ts lib/storage/signedUrls.ts lib/data/vehicles.ts lib/data/__tests__/vehicles-dano.test.ts
git commit -m "feat(dano): tipos + lógica pura + data layer del daño activo"
```

---

## Task 2: Endpoints (admin dano + público tomar/upload-url) + email

**Files:**
- Create: `app/api/vehicles/[id]/dano/route.ts`, `app/api/vehicles/[id]/dano/upload-url/route.ts`, `lib/email/incidenciaEmail.ts`
- Modify: `app/api/v/[token]/upload-url/route.ts`, `app/api/v/[token]/tomar/route.ts`, `lib/email/resend.ts`

**Interfaces:**
- Consumes (Task 1): `buildDanoActivo`, `setDanoActivo`, `clearDanoActivo`, `createDanoUrl`.
- Produces: `sendIncidenciaEmail(to, { patente, vehicleId, driverNombre, nota })`.

- [ ] **Step 1: `POST/DELETE /api/vehicles/[id]/dano/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { setDanoActivo, clearDanoActivo } from '@/lib/data/vehicles'
import { buildDanoActivo } from '@/lib/usages/danoActivo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const dano = buildDanoActivo(
    { nota: typeof body?.nota === 'string' ? body.nota : null, fotoPath: typeof body?.fotoPath === 'string' && body.fotoPath ? body.fotoPath : null },
    'admin', null, new Date().toISOString(),
  )
  try {
    await setDanoActivo(id, m.companyId, dano)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    await clearDanoActivo(id, m.companyId)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: `POST /api/vehicles/[id]/dano/upload-url/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { createDanoUrl } from '@/lib/storage/signedUrls'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const v = await getVehicle(id)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const contentType = String(body?.contentType ?? 'image/jpeg')
  const { uploadUrl, filePath } = await createDanoUrl(id, contentType)
  return NextResponse.json({ uploadUrl, filePath })
}
```

- [ ] **Step 3: Extender `app/api/v/[token]/upload-url/route.ts`** (permitir `incidencia` sin uso abierto)

Cambia la lista de tipos y la lógica: `dano` sigue exigiendo uso abierto; `incidencia` NO (usa `createDanoUrl`).

```typescript
import { createUsagePhotoUrl, createDanoUrl } from '@/lib/storage/signedUrls'
// ...
const TIPOS = ['tablero', 'cabina', 'dano', 'incidencia']
// ... tras validar el PIN:
  if (tipo === 'incidencia') {
    const { uploadUrl, filePath } = await createDanoUrl(vehicle.id, contentType)
    return NextResponse.json({ uploadUrl, filePath })
  }
  const abierto = await getOpenUsage(vehicle.id)
  if (!abierto) return NextResponse.json({ error: 'Este vehículo no tiene un uso abierto.' }, { status: 409 })
  const { uploadUrl, filePath } = await createUsagePhotoUrl(vehicle.id, tipo, contentType)
  return NextResponse.json({ uploadUrl, filePath })
```

- [ ] **Step 4: `lib/email/incidenciaEmail.ts` + `sendIncidenciaEmail`**

```typescript
import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

export function incidenciaSubject(patente: string): string {
  return `TapCar · Daño reportado al tomar — ${patente}`
}

export function incidenciaHtml(p: { patente: string; vehicleId: string; driverNombre: string; nota?: string | null }): string {
  return emailLayout({
    titulo: 'Daño reportado al tomar',
    contenidoHtml: `
      <p><strong>${p.driverNombre}</strong> reportó un daño preexistente en el vehículo <strong>${p.patente}</strong> al tomarlo.</p>
      ${p.nota ? `<p>Detalle:<br>${p.nota.replace(/</g, '&lt;')}</p>` : ''}
      ${ctaButton('Ver el vehículo', `${appUrl()}/vehiculos/${p.vehicleId}`)}
    `,
    motivo: 'Recibes este correo porque tienes activados los avisos de tu flota en TapCar.',
  })
}
```

En `lib/email/resend.ts`:
```typescript
import { incidenciaSubject, incidenciaHtml } from '@/lib/email/incidenciaEmail'

export async function sendIncidenciaEmail(
  to: string,
  p: { patente: string; vehicleId: string; driverNombre: string; nota?: string | null },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: incidenciaSubject(p.patente),
    html: incidenciaHtml(p),
  })
}
```

- [ ] **Step 5: Extender `app/api/v/[token]/tomar/route.ts`** (dano opcional + email)

Tras `const { forced } = await openUsage(...)` y el `incrementDriverStats(..., 'usos')`, añade el manejo del daño reportado. Imports arriba:
```typescript
import { setDanoActivo } from '@/lib/data/vehicles'
import { buildDanoActivo } from '@/lib/usages/danoActivo'
import { getCompany } from '@/lib/data/companies'
import { alertRecipientEmails } from '@/lib/data/members'
import { sendIncidenciaEmail } from '@/lib/email/resend'
import { after } from 'next/server'
```
Cuerpo (antes del `return`):
```typescript
  const reporte = body?.dano
  if (reporte && (reporte.nota || reporte.fotoPath)) {
    const dano = buildDanoActivo(
      { nota: typeof reporte.nota === 'string' ? reporte.nota : null, fotoPath: typeof reporte.fotoPath === 'string' && reporte.fotoPath ? reporte.fotoPath : null },
      'conductor', driver.nombre, new Date().toISOString(),
    )
    try { await setDanoActivo(vehicle.id, vehicle.companyId, dano) } catch { /* best-effort */ }
    const nota = dano.nota
    after(async () => {
      try {
        const company = await getCompany(vehicle.companyId)
        const emails = company ? await alertRecipientEmails(vehicle.companyId, company.ownerUid) : []
        for (const to of emails) {
          await sendIncidenciaEmail(to, { patente: vehicle.patente, vehicleId: vehicle.id, driverNombre: driver.nombre, nota })
        }
      } catch { /* best-effort */ }
    })
  }
```
Añade `export const maxDuration = 30` al archivo (el email corre en `after()`). Verifica que `NextResponse`/`after` estén importados de `next/server`.

- [ ] **Step 6: Verificar tsc + eslint + build** — `npx tsc --noEmit && npx eslint app lib && npm run build` → OK.

- [ ] **Step 7: Commit**

```bash
git add app/api/vehicles/[id]/dano app/api/v/[token]/upload-url/route.ts app/api/v/[token]/tomar/route.ts lib/email/incidenciaEmail.ts lib/email/resend.ts
git commit -m "feat(dano): endpoints admin + reporte al tomar + email"
```

---

## Task 3: UI pública — banner + reporte al tomar

**Files:**
- Modify: `app/v/[token]/page.tsx`, `components/PublicVehicleView.tsx`, `components/uso/UsoPanel.tsx`

**Interfaces:**
- Consumes: `POST /api/v/[token]/upload-url` (tipo `incidencia`), `POST /api/v/[token]/tomar` (con `dano`). `createReadUrl` para la foto.

- [ ] **Step 1: `app/v/[token]/page.tsx` — read URL del daño**

Tras cargar `vehicle`, añade:
```typescript
  const danoFotoUrl = vehicle.danoActivo?.fotoPath ? await createReadUrl(vehicle.danoActivo.fotoPath) : null
```
Pásalo al componente: `<PublicVehicleView ... danoFotoUrl={danoFotoUrl} />`.

- [ ] **Step 2: `components/PublicVehicleView.tsx` — banner + prop**

Añade `danoFotoUrl` a las props del componente:
```typescript
export default function PublicVehicleView({
  vehicle, documents, token, drivers, enUso, danoFotoUrl,
}: {
  vehicle: Vehicle
  documents: Item[]
  token: string
  drivers: { id: string; nombre: string }[]
  enUso: { driverNombre: string; tomadoEn: string } | null
  danoFotoUrl: string | null
}) {
```
Justo después de la tarjeta de cabecera (tras el `</div>` del bloque `flex items-center gap-4 ...`), inserta el banner:
```tsx
      {vehicle.danoActivo && (
        <div className="rounded-2xl border border-[#F5C6C6] bg-[#FCE7E7] p-5 shadow-sm">
          <p className="flex items-center gap-2 text-base font-semibold text-[#C81E1E]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0" aria-hidden="true">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" />
            </svg>
            Este vehículo tiene un daño reportado
          </p>
          {vehicle.danoActivo.nota && <p className="mt-1 text-sm text-tinta">{vehicle.danoActivo.nota}</p>}
          {danoFotoUrl && (
            <a href={danoFotoUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={danoFotoUrl} alt="Daño reportado" loading="lazy" className="max-h-56 w-full rounded-xl border border-[#F5C6C6] bg-lienzo object-contain" />
            </a>
          )}
          <p className="mt-2 text-xs text-acero">Ya está registrado. Si tomas el vehículo, no se te atribuirá este daño.</p>
        </div>
      )}
```

- [ ] **Step 3: `components/uso/UsoPanel.tsx` — reporte al tomar**

Añade estado y campos al formulario "tomar". Junto a los otros `useState`:
```typescript
  const [reportaDano, setReportaDano] = useState(false)
  const [notaDanoTomar, setNotaDanoTomar] = useState('')
  const [fotoDanoTomar, setFotoDanoTomar] = useState<File | null>(null)
```
En `reset()`, agrega: `setReportaDano(false); setNotaDanoTomar(''); setFotoDanoTomar(null)`.

Reescribe `tomar` para subir la foto (si hay) y mandar `dano`:
```typescript
  async function tomar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      let fotoPath: string | null = null
      if (reportaDano && fotoDanoTomar) {
        fotoPath = await subirFoto(token, driverId, pin, 'incidencia', fotoDanoTomar)
      }
      const dano = reportaDano && (notaDanoTomar || fotoPath) ? { nota: notaDanoTomar || null, fotoPath } : undefined
      const res = await fetch(`/api/v/${token}/tomar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, pin, dano }),
      })
      setBusy(false)
      if (res.ok) { reset(); router.refresh() }
      else setError(errorDePin(res.status))
    } catch {
      setBusy(false)
      setError('No se pudo completar. Revisa tu conexión.')
    }
  }
```
En el `<form onSubmit={tomar}>`, tras el input del PIN y antes del botón "Confirmar", añade:
```tsx
          <label className="flex items-center gap-2 text-sm text-tinta">
            <input type="checkbox" checked={reportaDano} onChange={(e) => setReportaDano(e.target.checked)} />
            Este vehículo ya tiene un daño (repórtalo)
          </label>
          {reportaDano && (
            <>
              <textarea value={notaDanoTomar} onChange={(e) => setNotaDanoTomar(e.target.value)} rows={2} placeholder="Describe el daño que ya tiene" className={inputCls} />
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoDanoTomar(e.target.files?.[0] ?? null)} className={fileCls} />
            </>
          )}
```
(Nota: `subirFoto`, `inputCls`, `fileCls`, `errorDePin` ya existen en el archivo.)

- [ ] **Step 4: Verificar tsc + eslint + build** — `npx tsc --noEmit && npx eslint app components && npm run build` → OK.

- [ ] **Step 5: Commit**

```bash
git add app/v/[token]/page.tsx components/PublicVehicleView.tsx components/uso/UsoPanel.tsx
git commit -m "feat(dano): banner en la ficha pública + reporte al tomar"
```

---

## Task 4: UI admin — panel de daño en la ficha del vehículo

**Files:**
- Create: `components/vehicle/DanoActivoPanel.tsx`
- Modify: `app/(app)/vehiculos/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/vehicles/[id]/dano/upload-url`, `POST /api/vehicles/[id]/dano`, `DELETE /api/vehicles/[id]/dano`. `createReadUrl` para la foto.

- [ ] **Step 1: Cargar el read URL en la página del vehículo**

En `app/(app)/vehiculos/[id]/page.tsx`, tras cargar los demás datos:
```typescript
import DanoActivoPanel from '@/components/vehicle/DanoActivoPanel'
// ...
  const danoFotoUrl = vehicle.danoActivo?.fotoPath ? await createReadUrl(vehicle.danoActivo.fotoPath) : null
```
Renderiza el panel tras `MantencionPanel` (antes de `BitacoraUso`):
```tsx
      <DanoActivoPanel
        vehicleId={vehicle.id}
        danoActivo={vehicle.danoActivo ?? null}
        danoFotoUrl={danoFotoUrl}
        puedeGestionar={canManageVehicle}
      />
```

- [ ] **Step 2: `components/vehicle/DanoActivoPanel.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DanoActivo } from '@/lib/types'

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

export default function DanoActivoPanel({
  vehicleId, danoActivo, danoFotoUrl, puedeGestionar,
}: {
  vehicleId: string
  danoActivo: DanoActivo | null
  danoFotoUrl: string | null
  puedeGestionar: boolean
}) {
  const router = useRouter()
  const [openMarcar, setOpenMarcar] = useState(false)
  const [nota, setNota] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  async function marcar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      let fotoPath: string | null = null
      if (file) {
        const res = await fetch(`/api/vehicles/${vehicleId}/dano/upload-url`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type }),
        })
        if (!res.ok) throw new Error('upload-url')
        const { uploadUrl, filePath } = await res.json()
        const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!put.ok) throw new Error('upload')
        fotoPath = filePath
      }
      const res = await fetch(`/api/vehicles/${vehicleId}/dano`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota: nota || null, fotoPath }),
      })
      if (!res.ok) throw new Error('marcar')
      setOpenMarcar(false); setNota(''); setFile(null); router.refresh()
    } catch {
      setError('No se pudo marcar el daño.')
    } finally {
      setBusy(false)
    }
  }

  async function desmarcar() {
    if (!confirm('¿Marcar este vehículo como sin daño?')) return
    setBusy(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/dano`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) router.refresh()
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-tinta">Estado de daño</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${danoActivo ? 'bg-[#FCE7E7] text-[#C81E1E]' : 'bg-[#E6F4EA] text-[#15803D]'}`}>
          {danoActivo ? 'Dañado' : 'Sin daño'}
        </span>
      </div>

      {danoActivo ? (
        <div className="space-y-2">
          <p className="text-sm text-acero">
            Reportado {danoActivo.reportadoPor === 'conductor' ? `por ${danoActivo.reportadoPorNombre ?? 'un conductor'}` : 'por un administrador'} · {fecha(danoActivo.reportadoEn)}
          </p>
          {danoActivo.nota && <p className="text-sm text-tinta">{danoActivo.nota}</p>}
          {danoFotoUrl && (
            <a href={danoFotoUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={danoFotoUrl} alt="Daño reportado" loading="lazy" className="max-h-64 w-full rounded-xl border border-linea bg-lienzo object-contain" />
            </a>
          )}
          {puedeGestionar && (
            <button onClick={desmarcar} disabled={busy} className="rounded-lg border border-linea bg-superficie px-4 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo disabled:opacity-50">
              Marcar como reparado
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-acero">Este vehículo no tiene un daño reportado.</p>
      )}

      {puedeGestionar && !danoActivo && (
        <>
          {!openMarcar ? (
            <button onClick={() => setOpenMarcar(true)} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-azul-press">
              Marcar como dañado
            </button>
          ) : (
            <form onSubmit={marcar} className="space-y-3 rounded-xl border border-linea p-4">
              <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Describe el daño (opcional)" className={inputCls} />
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-acero file:mr-3 file:rounded-lg file:border-0 file:bg-azul/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-azul hover:file:bg-azul/15" />
              {error && <p className="text-sm text-vencido">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
                <button type="button" onClick={() => setOpenMarcar(false)} className="rounded-lg border border-linea px-4 py-2 text-sm text-tinta">Cancelar</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Verificar tsc + eslint + build** — OK.

- [ ] **Step 4: Commit**

```bash
git add components/vehicle/DanoActivoPanel.tsx app/(app)/vehiculos/[id]/page.tsx
git commit -m "feat(dano): panel de estado de daño en la ficha (marcar/desmarcar)"
```

---

## Task 5: Pill "Dañado" en el dashboard

**Files:**
- Modify: `components/VehicleCard.tsx`, `components/VehiclesBoard.tsx`, `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `vehicle.danoActivo` (ya en el tipo desde Task 1).

- [ ] **Step 1: `app/(app)/dashboard/page.tsx` — pasar el flag**

En el `map` que arma `items`, añade al objeto devuelto:
```typescript
        danoActivo: v.danoActivo != null,
```

- [ ] **Step 2: `components/VehiclesBoard.tsx` — extender `Item` y pasar la prop**

En `type Item`, añade `danoActivo: boolean`. En el `visible.map(...)` que renderiza `<VehicleCard .../>`, añade `danoActivo={danoActivo}` (desestructura `danoActivo` en el map). En el destructuring `{ vehicle, status, docCount, prolongado, horasUso, danoUsageId, categoriaNombre }` añade `danoActivo`.

- [ ] **Step 3: `components/VehicleCard.tsx` — pill "Dañado"**

Añade `danoActivo = false` a las props (tipo `danoActivo?: boolean`). En el bloque de badges (junto a `danoUsageId` / `categoriaNombre`), añade:
```tsx
          {danoActivo && (
            <span className="whitespace-nowrap rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Dañado</span>
          )}
```

- [ ] **Step 4: Verificar tsc + eslint + build** — OK.

- [ ] **Step 5: Commit**

```bash
git add components/VehicleCard.tsx components/VehiclesBoard.tsx app/(app)/dashboard/page.tsx
git commit -m "feat(dano): pill 'Dañado' en la card del dashboard"
```

---

## Task 6: Documentación

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documentar en `CLAUDE.md`**

Añade en las secciones correspondientes:
- Modelo de datos: `Vehicle.danoActivo?: DanoActivo | null` (estado persistente de daño, distinto del `usages.dano` de entrega); foto en `vehicles/{id}/dano/...`.
- `lib/data/vehicles.ts`: `setDanoActivo`/`clearDanoActivo` (limpian la foto anterior) + `deleteVehicle` cascada de la foto.
- `lib/usages/danoActivo.ts` (puro), `lib/storage/signedUrls.ts` → `createDanoUrl`.
- Endpoints: `/api/vehicles/[id]/dano` (POST/DELETE, `vehicle:write`) + `/dano/upload-url`; `/api/v/[token]/upload-url` acepta `incidencia`; `/api/v/[token]/tomar` acepta `dano` opcional + email `sendIncidenciaEmail` (best-effort, `after()`).
- UI: banner en `PublicVehicleView`, reporte en `UsoPanel`, `DanoActivoPanel` en la ficha, pill "Dañado" en `VehicleCard`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: incidencia previa (daño activo del vehículo)"
```

---

## Notas de verificación final (whole-branch)

- Suite completa: `npm test` (todo verde salvo `rules.test.ts`, ambiental).
- `npx tsc --noEmit`, `npx eslint app components lib`, `npm run build` limpios.
- La UI (pública tras PIN, admin tras login) no se maneja en preview: verificación estática + unitaria + build.
- Higiene: confirmar que `setDanoActivo` (reemplazo), `clearDanoActivo` (desmarcar) y `deleteVehicle` borran la foto del daño (sin huérfanos), consistente con documentos/usos/mantenciones.
- Confirmar que el flujo de daño **de entrega** (`usages.dano`, `alertas`, `RevisarDanoButton`) queda intacto e independiente.
