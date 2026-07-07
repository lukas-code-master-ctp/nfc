# Eliminar Flota + flujo de revisión de daño — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar la pestaña Flota; mover el uso prolongado al punto ámbar del dashboard y el daño a una pill roja → bitácora del vehículo → botón "marcar revisado" (cualquier rol) + email nuevo; "sin entrega" deja de alertar y de notificar (solo queda el contador en Reportes).

**Architecture:** El daño reutiliza la colección `alertas` (solo tipo `dano`) como store de "pendientes" para el dashboard; revisar borra la alerta y estampa `dano.revisadoPor*` en el uso. "Sin entrega" pierde su alerta y su email; conserva el contador. El scroll al uso usa ancla nativa por hash.

**Tech Stack:** Next.js 16 (App Router, server + client components, route handlers, `after()`), TypeScript estricto, Firebase Admin SDK, Vitest 4, Resend, Tailwind v4.

## Global Constraints

- Idioma de todo el código/UI/copy: **español neutro (Chile)**, "tú".
- **Firestore Admin rechaza `undefined`**: no escribir claves con valor `undefined`.
- Endpoints privados: `getMembership()` + `can(role, action)` según corresponda; el de **revisar daño** lo puede usar **cualquier miembro** (solo `getMembership()`, sin `can`).
- Efectos secundarios best-effort (alerta/email/contador) en su propio `try/catch`; nunca rompen la respuesta.
- Correos brandeados vía `emailLayout` + `ctaButton` (de `@/lib/email/layout`), siempre con CTA.
- CTA del email de daño y link de la pill del dashboard: **`${appUrl()}/vehiculos/{vehicleId}#uso-{usageId}`**.
- Verde `#15803D`; ámbar `#B45309` (texto) / `#FDF1DC` (fondo); rojo daño `#C81E1E` / `#FCE7E7`.
- Antes de commitear cada task: `npx tsc --noEmit`, `npx vitest run <tests tocados>` (si aplica), `npx eslint <archivos>`, y en tasks de UI/rutas también `npm run build`.

---

### Task 1: Datos — campos de revisión + `marcarDanoRevisado` + `deleteDanoAlertaByUsage`

**Files:**
- Modify: `lib/types.ts` (campos de revisión en `VehicleUsage.dano`)
- Modify: `lib/data/usages.ts` (`marcarDanoRevisado`)
- Modify: `lib/data/alertas.ts` (`deleteDanoAlertaByUsage`)
- Test: `lib/data/__tests__/usages.test.ts`, `lib/data/__tests__/alertas.test.ts`

**Interfaces:**
- Produces: `VehicleUsage.dano` gana `revisadoPorUid?: string`, `revisadoPorNombre?: string`, `revisadoEn?: string`.
- Produces: `marcarDanoRevisado(companyId: string, usageId: string, revisor: { uid: string; nombre: string }): Promise<void>` — lanza `'forbidden'` si el uso no existe o no es de la empresa, `'no_dano'` si el uso no tiene daño, `'ya_revisado'` si ya fue revisado; si no, estampa los 3 campos en `dano`.
- Produces: `deleteDanoAlertaByUsage(companyId: string, usageId: string): Promise<void>` — borra las alertas `dano` de ese uso en esa empresa.

- [ ] **Step 1: Escribir los tests que fallan**

En `lib/data/__tests__/usages.test.ts`: `marcarDanoRevisado` hace `doc().get()` **y** `doc().update()`. El mock actual de `adminDb` en ese archivo define `doc: () => ({ update: docUpdate })`; extiéndelo a `doc: () => ({ get: docGet, update: docUpdate })` agregando `const docGet = vi.fn()` arriba (junto a `docUpdate`) y `docGet.mockReset()` en el `beforeEach`. Agrega `marcarDanoRevisado` al import existente de `@/lib/data/usages` y estos 3 tests:

```ts
describe('marcarDanoRevisado', () => {
  it('estampa la revisión en un uso con daño no revisado', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', dano: { hay: true, nota: 'x' } }) })
    await marcarDanoRevisado('c1', 'u1', { uid: 'r1', nombre: 'Ana' })
    expect(docUpdate).toHaveBeenCalledWith(expect.objectContaining({
      'dano.revisadoPorUid': 'r1', 'dano.revisadoPorNombre': 'Ana',
    }))
  })
  it('lanza forbidden si el uso no es de la empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra', dano: { hay: true } }) })
    await expect(marcarDanoRevisado('c1', 'u1', { uid: 'r1', nombre: 'Ana' })).rejects.toThrow('forbidden')
  })
  it('lanza no_dano si el uso no tiene daño', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await expect(marcarDanoRevisado('c1', 'u1', { uid: 'r1', nombre: 'Ana' })).rejects.toThrow('no_dano')
  })
})
```

En `lib/data/__tests__/alertas.test.ts`, agregar:

```ts
import { deleteDanoAlertaByUsage } from '@/lib/data/alertas'
// (agrégalo al import existente)

describe('deleteDanoAlertaByUsage', () => {
  it('borra las alertas dano de ese uso', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a1', ref: { delete: refDelete }, data: () => ({ tipo: 'dano', usageId: 'u1', companyId: 'c1' }) },
    ] })
    await deleteDanoAlertaByUsage('c1', 'u1')
    expect(refDelete).toHaveBeenCalled()
  })
})
```

> Nota: revisa cómo `alertas.test.ts` mockea `adminDb`. Si usa `doc().delete()`, adapta el
> test para exponer un `refDelete = vi.fn()` y que `where().get()` devuelva docs con un
> `ref` borrable o mapea por `doc(id).delete()`. Sigue el patrón ya presente en ese archivo.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run lib/data/__tests__/usages.test.ts lib/data/__tests__/alertas.test.ts`
Expected: FAIL — funciones inexistentes.

- [ ] **Step 3: Agregar los campos de revisión en `lib/types.ts`**

En la definición de `VehicleUsage`, en el campo `dano`, agregar los 3 campos opcionales. Buscar `dano?:` dentro de `VehicleUsage` y dejarlo:

```ts
  dano?: {
    hay: boolean
    nota?: string
    fotoPath?: string
    revisadoPorUid?: string
    revisadoPorNombre?: string
    revisadoEn?: string
  }
```

- [ ] **Step 4: Implementar `marcarDanoRevisado` en `lib/data/usages.ts`**

Agregar al final de `lib/data/usages.ts`:

```ts
export async function marcarDanoRevisado(
  companyId: string,
  usageId: string,
  revisor: { uid: string; nombre: string },
): Promise<void> {
  const ref = adminDb.collection(COL).doc(usageId)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  const dano = doc.data()?.dano
  if (!dano?.hay) throw new Error('no_dano')
  if (dano.revisadoPorUid) throw new Error('ya_revisado')
  await ref.update({
    'dano.revisadoPorUid': revisor.uid,
    'dano.revisadoPorNombre': revisor.nombre,
    'dano.revisadoEn': new Date().toISOString(),
  })
}
```

- [ ] **Step 5: Implementar `deleteDanoAlertaByUsage` en `lib/data/alertas.ts`**

Agregar (usa `adminDb`/`COL` ya definidos en el archivo):

```ts
export async function deleteDanoAlertaByUsage(companyId: string, usageId: string): Promise<void> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  const borrar = snap.docs.filter((d) => d.data().tipo === 'dano' && d.data().usageId === usageId)
  await Promise.all(borrar.map((d) => d.ref.delete()))
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/__tests__/usages.test.ts lib/data/__tests__/alertas.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint y commit**

Run: `npx tsc --noEmit && npx eslint lib/types.ts lib/data/usages.ts lib/data/alertas.ts lib/data/__tests__/usages.test.ts lib/data/__tests__/alertas.test.ts`

```bash
git add lib/types.ts lib/data/usages.ts lib/data/alertas.ts lib/data/__tests__/usages.test.ts lib/data/__tests__/alertas.test.ts
git commit -m "feat(usos): campos de revision de dano + marcarDanoRevisado + deleteDanoAlertaByUsage"
```

---

### Task 2: Email de daño (nuevo)

**Files:**
- Create: `lib/email/danoEmail.ts`
- Modify: `lib/email/resend.ts` (`sendDanoEmail`)
- Test: `lib/email/__tests__/danoEmail.test.ts`

**Interfaces:**
- Produces: `danoSubject(patente: string): string`; `danoHtml(p: { patente; vehicleId; usageId; driverNombre; nota? }): string`.
- Produces: `sendDanoEmail(to: string, p: { patente: string; vehicleId: string; usageId: string; driverNombre: string; nota?: string }): Promise<void>`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/email/__tests__/danoEmail.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { danoSubject, danoHtml } from '@/lib/email/danoEmail'

describe('danoSubject', () => {
  it('incluye patente y va brandeado', () => {
    const s = danoSubject('ABCD12')
    expect(s).toContain('ABCD12')
    expect(s).toContain('TapCar')
  })
})

describe('danoHtml', () => {
  const html = danoHtml({ patente: 'ABCD12', vehicleId: 'v1', usageId: 'u1', driverNombre: 'Ana', nota: 'Rayón' })
  it('lleva CTA al uso específico y va brandeado', () => {
    expect(html).toContain('/vehiculos/v1#uso-u1')
    expect(html).toContain('Tap<span')
  })
  it('incluye patente, conductor y nota', () => {
    expect(html).toContain('ABCD12')
    expect(html).toContain('Ana')
    expect(html).toContain('Rayón')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/email/__tests__/danoEmail.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Crear `lib/email/danoEmail.ts`**

```ts
import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

export function danoSubject(patente: string): string {
  return `TapCar · Daño reportado — ${patente}`
}

export function danoHtml(p: {
  patente: string
  vehicleId: string
  usageId: string
  driverNombre: string
  nota?: string
}): string {
  return emailLayout({
    titulo: 'Daño reportado',
    contenidoHtml: `
      <p>Se reportó un daño en el vehículo <strong>${p.patente}</strong>.</p>
      <p>Lo reportó <strong>${p.driverNombre}</strong> al entregar.</p>
      ${p.nota ? `<p>Detalle:<br>${p.nota.replace(/</g, '&lt;')}</p>` : ''}
      ${ctaButton('Ver el daño', `${appUrl()}/vehiculos/${p.vehicleId}#uso-${p.usageId}`)}
    `,
    motivo: 'Recibes este correo porque tienes activados los avisos de tu flota en TapCar.',
  })
}
```

- [ ] **Step 4: Agregar `sendDanoEmail` en `lib/email/resend.ts`**

Agregar el import junto a los otros y la función (NO tocar todavía `sendUsageAlertEmail`, se retira en Task 3):

```ts
import { danoSubject, danoHtml } from '@/lib/email/danoEmail'
```

```ts
export async function sendDanoEmail(
  to: string,
  p: { patente: string; vehicleId: string; usageId: string; driverNombre: string; nota?: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: danoSubject(p.patente),
    html: danoHtml(p),
  })
}
```

- [ ] **Step 5: Correr, lint, commit**

Run: `npx vitest run lib/email/__tests__/danoEmail.test.ts && npx tsc --noEmit && npx eslint lib/email/danoEmail.ts lib/email/resend.ts lib/email/__tests__/danoEmail.test.ts`

```bash
git add lib/email/danoEmail.ts lib/email/resend.ts lib/email/__tests__/danoEmail.test.ts
git commit -m "feat(email): correo de dano reportado con CTA al uso"
```

---

### Task 3: Rutas `tomar`/`entregar` — quitar "sin entrega", agregar email de daño, retirar `usageAlertEmail`

**Files:**
- Modify: `app/api/v/[token]/tomar/route.ts`
- Modify: `app/api/v/[token]/entregar/route.ts`
- Modify: `lib/email/resend.ts` (quitar `sendUsageAlertEmail`)
- Delete: `lib/email/usageAlertEmail.ts`, `lib/email/__tests__/usageAlertEmail.test.ts`
- Test: `app/api/v/[token]/tomar/__tests__/route.test.ts`, `app/api/v/[token]/entregar/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `sendDanoEmail` (Task 2), `alertRecipientEmails`, `getCompany`, `createAlerta`, `incrementDriverStats` (existentes).

- [ ] **Step 1: Actualizar `tomar` (quitar alerta+email de sin_entrega; mantener contador)**

En `app/api/v/[token]/tomar/route.ts`, reemplazar el bloque `if (forced) { … }` completo por:

```ts
  // El conductor anterior no cerró su uso (fuerza-cierre). Solo cuenta para el
  // reporte de responsabilidad; ya no genera alerta ni email.
  if (forced) {
    try { await incrementDriverStats(forced.driverId, 'sinEntrega') } catch { /* best-effort */ }
  }
```

Y **quitar los imports** que quedan sin uso al inicio del archivo: `getCompany`, `alertRecipientEmails`, `sendUsageAlertEmail`, `createAlerta`. El archivo debe quedar importando solo: `getVehicleByToken`, `verifyDriverPin`/`getDriver`/`incrementDriverStats`, `openUsage`.

- [ ] **Step 2: Actualizar `entregar` (quitar sin_entrega; agregar email de daño)**

En `app/api/v/[token]/entregar/route.ts`:

(a) En el bloque `if (dano?.hay) { … }`, después del `incrementDriverStats(u.driverId, 'danos')`, agregar el envío de email best-effort. Reemplazar el bloque `if (dano?.hay)` por:

```ts
  // Daño reportado: alerta in-app (pill del dashboard), contador y email de aviso.
  if (dano?.hay) {
    const u = await getUsage(usageId).catch(() => null)
    const driverNombre = u?.driverNombre ?? driver.nombre
    try {
      await createAlerta({
        companyId: vehicle.companyId,
        vehicleId: vehicle.id,
        patente: vehicle.patente,
        usageId,
        tipo: 'dano',
        driverNombre,
        nota: dano.nota,
      })
    } catch {
      /* best-effort */
    }
    if (u?.driverId) {
      try { await incrementDriverStats(u.driverId, 'danos') } catch { /* best-effort */ }
    }
    try {
      const company = await getCompany(vehicle.companyId)
      const emails = company ? await alertRecipientEmails(vehicle.companyId, company.ownerUid) : []
      for (const to of emails) {
        await sendDanoEmail(to, {
          patente: vehicle.patente,
          vehicleId: vehicle.id,
          usageId,
          driverNombre,
          nota: dano.nota,
        })
      }
    } catch {
      /* best-effort */
    }
  }
```

(b) **Eliminar por completo** el bloque `if (cierre.entregaIrregular) { … }`, reemplazándolo por solo el contador:

```ts
  // Entrega irregular (la cerró otro conductor): solo cuenta para el reporte de
  // responsabilidad del conductor original. Ya no genera alerta ni email.
  if (cierre.entregaIrregular) {
    try { await incrementDriverStats(cierre.driverOriginal.id, 'sinEntrega') } catch { /* best-effort */ }
  }
```

(c) Ajustar los imports: quitar `sendUsageAlertEmail`; agregar `sendDanoEmail`. Mantener `getCompany`, `alertRecipientEmails`, `createAlerta`, `getUsage`. Import final de email:

```ts
import { sendDanoEmail } from '@/lib/email/resend'
```

- [ ] **Step 3: Retirar `sendUsageAlertEmail` y el email `usageAlertEmail`**

En `lib/email/resend.ts`: borrar la función `sendUsageAlertEmail` y su import `import { usageAlertSubject, usageAlertHtml } from '@/lib/email/usageAlertEmail'`.

Borrar los archivos:

```bash
git rm lib/email/usageAlertEmail.ts lib/email/__tests__/usageAlertEmail.test.ts
```

- [ ] **Step 4: Actualizar los tests de rutas**

En `app/api/v/[token]/tomar/__tests__/route.test.ts`:
- Quitar los `vi.mock` de `@/lib/data/companies`, `@/lib/email/resend`, `@/lib/data/members`, y el mock/uso de `createAlerta` **si ya no se usan** en las aserciones.
- Reemplazar el test "crea una alerta sin_entrega cuando hay forced-close" por uno que verifique el contador y la ausencia de alerta:

```ts
  it('en forced-close solo incrementa sinEntrega del conductor anterior (sin alerta)', async () => {
    verifyDriverPin.mockResolvedValue('ok')
    openUsage.mockResolvedValue({ usage: { id: 'u2' }, forced: { id: 'viejo', driverId: 'dViejo', driverNombre: 'Beto', tomadoEn: 't' } })
    const res = await POST(req({ driverId: 'd1', pin: '1234' }), ctx('t'))
    expect(res.status).toBe(200)
    expect(incrementDriverStats).toHaveBeenCalledWith('dViejo', 'sinEntrega')
    expect(createAlerta).not.toHaveBeenCalled()
  })
```
(Mantén el mock de `createAlerta` solo para poder aseverar `not.toHaveBeenCalled()`.)

En `app/api/v/[token]/entregar/__tests__/route.test.ts`:
- Cambiar el mock de `@/lib/email/resend` a `sendDanoEmail`:
```ts
const sendDanoEmail = vi.fn()
vi.mock('@/lib/email/resend', () => ({ sendDanoEmail: (...a: unknown[]) => sendDanoEmail(...a) }))
```
- En `beforeEach`, `sendDanoEmail.mockReset()`.
- Actualizar el test de daño para aseverar el email:
```ts
  it('con daño: alerta dano + contador danos + email de daño', async () => {
    getVehicleByToken.mockResolvedValue({ id: 'v1', companyId: 'c1', patente: 'ABCD12' })
    closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: false, driverOriginal: { id: 'd1', nombre: 'Ana' }, tomadoEn: 't' })
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' }, dano: { hay: true, nota: 'rayón' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(createAlerta).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'dano', usageId: 'u1', nota: 'rayón' }))
    expect(sendDanoEmail).toHaveBeenCalledWith('o@b.cl', expect.objectContaining({ patente: 'ABCD12', vehicleId: 'v1', usageId: 'u1' }))
  })
```
- Reemplazar el test de "entrega irregular" por uno que verifique **solo** el contador (sin alerta ni email):
```ts
  it('entrega irregular: solo incrementa sinEntrega (sin alerta ni email)', async () => {
    closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: true, driverOriginal: { id: 'dViejo', nombre: 'Beto' }, tomadoEn: 't' })
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(incrementDriverStats).toHaveBeenCalledWith('dViejo', 'sinEntrega')
    expect(createAlerta).not.toHaveBeenCalled()
    expect(sendDanoEmail).not.toHaveBeenCalled()
  })
```
(Mantén los mocks de `@/lib/data/companies` → `getCompany` y `@/lib/data/members` → `alertRecipientEmails` devolviendo `['o@b.cl']`, que ahora los usa el email de daño.)

- [ ] **Step 5: Verificar todo**

Run: `npx tsc --noEmit && npx vitest run "app/api/v/[token]" lib/email && npx eslint "app/api/v/[token]/tomar/route.ts" "app/api/v/[token]/entregar/route.ts" lib/email/resend.ts && npm run build`
Expected: sin errores; tests verdes; build compila.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(usos): dano notifica por email; sin entrega deja de alertar y notificar"
```

---

### Task 4: Endpoint `POST /api/usages/[id]/revisar-dano`

**Files:**
- Create: `app/api/usages/[id]/revisar-dano/route.ts`
- Test: `app/api/usages/[id]/revisar-dano/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `marcarDanoRevisado`, `deleteDanoAlertaByUsage` (Task 1); `getMembership`; `getProfile`.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/usages/[id]/revisar-dano/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const marcarDanoRevisado = vi.fn()
const deleteDanoAlertaByUsage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ marcarDanoRevisado: (...a: unknown[]) => marcarDanoRevisado(...a) }))
vi.mock('@/lib/data/alertas', () => ({ deleteDanoAlertaByUsage: (...a: unknown[]) => deleteDanoAlertaByUsage(...a) }))
vi.mock('@/lib/data/profile', () => ({ getProfile: () => Promise.resolve({ displayName: 'Ana', email: 'a@b.cl' }) }))

import { POST } from '@/app/api/usages/[id]/revisar-dano/route'
function ctx(id: string) { return { params: Promise.resolve({ id }) } }

beforeEach(() => {
  getMembership.mockReset(); marcarDanoRevisado.mockReset(); deleteDanoAlertaByUsage.mockReset()
  getMembership.mockResolvedValue({ uid: 'r1', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
})

describe('POST revisar-dano', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await POST({} as Request, ctx('u1'))).status).toBe(401)
  })
  it('200 y estampa + borra alerta (cualquier rol, incl. viewer)', async () => {
    const res = await POST({} as Request, ctx('u1'))
    expect(res.status).toBe(200)
    expect(marcarDanoRevisado).toHaveBeenCalledWith('c1', 'u1', { uid: 'r1', nombre: 'Ana' })
    expect(deleteDanoAlertaByUsage).toHaveBeenCalledWith('c1', 'u1')
  })
  it('404 si marcarDanoRevisado lanza forbidden', async () => {
    marcarDanoRevisado.mockRejectedValue(new Error('forbidden'))
    expect((await POST({} as Request, ctx('u1'))).status).toBe(404)
  })
  it('409 si ya fue revisado', async () => {
    marcarDanoRevisado.mockRejectedValue(new Error('ya_revisado'))
    expect((await POST({} as Request, ctx('u1'))).status).toBe(409)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run "app/api/usages/[id]/revisar-dano/__tests__/route.test.ts"`
Expected: FAIL — ruta inexistente.

- [ ] **Step 3: Crear la ruta**

Crear `app/api/usages/[id]/revisar-dano/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { getProfile } from '@/lib/data/profile'
import { marcarDanoRevisado } from '@/lib/data/usages'
import { deleteDanoAlertaByUsage } from '@/lib/data/alertas'

export const dynamic = 'force-dynamic'

// Cualquier miembro de la empresa (Visor/Editor/Administrador) puede marcar un
// daño como revisado. Estampa quién lo revisó y borra la alerta (pill del dashboard).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const profile = await getProfile(m.uid, m.email)
  const nombre = profile.displayName || m.email

  try {
    await marcarDanoRevisado(m.companyId, id, { uid: m.uid, nombre })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'ya_revisado') return NextResponse.json({ error: 'Ya estaba revisado.' }, { status: 409 })
    if (msg === 'forbidden' || msg === 'no_dano') return NextResponse.json({ error: 'No encontrado.' }, { status: 404 })
    console.error('[revisar-dano]', e)
    return NextResponse.json({ error: 'No se pudo registrar la revisión.' }, { status: 500 })
  }

  try { await deleteDanoAlertaByUsage(m.companyId, id) } catch { /* best-effort */ }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Correr, verificar, lint, build, commit**

Run: `npx vitest run "app/api/usages/[id]/revisar-dano/__tests__/route.test.ts" && npx tsc --noEmit && npx eslint "app/api/usages/[id]/revisar-dano/route.ts" && npm run build`

```bash
git add "app/api/usages/[id]/revisar-dano"
git commit -m "feat(usos): endpoint para marcar dano revisado (cualquier rol)"
```

---

### Task 5: Eliminar la pestaña Flota

**Files:**
- Delete: `app/(app)/flota/page.tsx`, `components/flota/FlotaGrid.tsx`, `components/flota/AlertasBandeja.tsx`, `components/flota/AtenderAlertaButton.tsx`, `app/api/alertas/[id]/route.ts`, `app/api/alertas/__tests__/route.test.ts`
- Modify: `components/AppNav.tsx`, `components/company/PlataformaCard.tsx`, `lib/data/alertas.ts` (quitar `deleteAlerta`)

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Borrar la ruta, la página y los componentes de Flota**

```bash
git rm "app/(app)/flota/page.tsx" components/flota/FlotaGrid.tsx components/flota/AlertasBandeja.tsx components/flota/AtenderAlertaButton.tsx "app/api/alertas/[id]/route.ts" "app/api/alertas/__tests__/route.test.ts"
```

(Si `components/flota/` queda vacío, no importa.)

- [ ] **Step 2: Quitar el link de la barra**

En `components/AppNav.tsx`, dejar `LINKS` con solo Reportes:

```ts
const LINKS = [
  { href: '/reportes', label: 'Reportes' },
]
```

- [ ] **Step 3: Quitar `deleteAlerta` de `lib/data/alertas.ts`**

Borrar la función `deleteAlerta` (queda sin uso al eliminar su ruta). Verificar que nada más la importe:

Run: `grep -rn "deleteAlerta\b" app components lib --include=*.ts --include=*.tsx`
Expected: sin resultados (aparte de la definición que borras).

- [ ] **Step 4: Ajustar el copy de `PlataformaCard`**

En `components/company/PlataformaCard.tsx`, cambiar el texto de ayuda:

```tsx
          <p className="text-xs text-acero">
            Un vehículo que lleve más de estas horas &quot;en uso&quot; sin entregar se marcará en el panel de vehículos.
          </p>
```

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit && npx eslint components/AppNav.tsx components/company/PlataformaCard.tsx lib/data/alertas.ts && npm run build`
Expected: sin errores. (Si el build o tsc se queja de un import colgante a `flota/*` o `alertas/[id]`, resolverlo — no debería haber ninguno.)

```bash
git add -A
git commit -m "feat(flota): eliminar la pestana Flota (reemplazada por dashboard + bitacora)"
```

---

### Task 6: Dashboard — punto ámbar + pill de daño

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`, `components/VehiclesBoard.tsx`, `components/VehicleCard.tsx`

**Interfaces:**
- Consumes: `listAlertas` (existente), `getCompany`, `DEFAULT_AVISO_USO_HORAS`, `usoProlongado`/`horasEnUso` (existentes).
- Produces: `Item` gana `prolongado: boolean`, `horasUso: number`, `danoUsageId: string | null`; `VehicleCard` recibe esos 3 props.

- [ ] **Step 1: `dashboard/page.tsx` calcula prolongado + daño por vehículo**

En `app/(app)/dashboard/page.tsx`:

(a) Agregar imports:

```ts
import { listAlertas } from '@/lib/data/alertas'
import { DEFAULT_AVISO_USO_HORAS } from '@/lib/types'
import { usoProlongado, horasEnUso } from '@/lib/usages/prolongado'
```

(b) Traer alertas junto a lo demás y armar el mapa de daño + umbral:

```ts
  const [vehicles, company, alertas] = await Promise.all([
    listVehicles(m.companyId),
    getCompany(m.companyId),
    listAlertas(m.companyId),
  ])
  const limit = maxVehiculosDe(company?.plan)
  const avisoUsoHoras = company?.avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS
  const danoPorVehiculo = new Map<string, string>() // vehicleId -> usageId
  for (const a of alertas) if (a.tipo === 'dano') danoPorVehiculo.set(a.vehicleId, a.usageId)
```

(c) En el `items` (map con `Promise.all`), agregar `prolongado`, `horasUso`, `danoUsageId`:

```ts
  const items = await Promise.all(
    vehicles.map(async (v) => {
      const docs = await listDocuments(v.id)
      const statuses: DocStatus[] = docs.map((d) => documentStatus(d.fechaVencimiento, now))
      const uso = v.usoActual ?? null
      return {
        vehicle: v,
        status: worstStatus(statuses),
        docCount: docs.length,
        prolongado: uso ? usoProlongado(uso.tomadoEn, avisoUsoHoras, now) : false,
        horasUso: uso ? Math.floor(horasEnUso(uso.tomadoEn, now)) : 0,
        danoUsageId: danoPorVehiculo.get(v.id) ?? null,
      }
    }),
  )
```

- [ ] **Step 2: `VehiclesBoard` propaga los nuevos campos**

En `components/VehiclesBoard.tsx`:

(a) Extender el tipo `Item`:

```ts
type Item = { vehicle: Vehicle; status: DocStatus; docCount: number; prolongado: boolean; horasUso: number; danoUsageId: string | null }
```

(b) En el `.map` que renderiza `VehicleCard` (dentro de `visible.map(...)`), pasar los props. Reemplazar el render por:

```tsx
                {visible.map(({ vehicle, status, docCount, prolongado, horasUso, danoUsageId }) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} docCount={docCount} prolongado={prolongado} horasUso={horasUso} danoUsageId={danoUsageId} />
                ))}
```

- [ ] **Step 3: `VehicleCard` — punto verde/ámbar, pill de daño, link con ancla**

Reemplazar el contenido de `components/VehicleCard.tsx` por:

```tsx
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import type { DocStatus } from '@/lib/documents/status'
import type { Vehicle } from '@/lib/types'

function horaUso(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

function CarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
    </svg>
  )
}

export default function VehicleCard({
  vehicle, status, docCount = 0, prolongado = false, horasUso = 0, danoUsageId = null,
}: {
  vehicle: Vehicle
  status: DocStatus
  docCount?: number
  prolongado?: boolean
  horasUso?: number
  danoUsageId?: string | null
}) {
  const uso = vehicle.usoActual ?? null
  const puntoColor = prolongado ? '#B45309' : '#15803D'
  const tituloPunto = uso
    ? `En uso por ${uso.driverNombre} · desde ${horaUso(uso.tomadoEn)}${prolongado ? ` · sin entregar hace ${horasUso}h` : ''}`
    : ''
  const href = danoUsageId ? `/vehiculos/${vehicle.id}#uso-${danoUsageId}` : `/vehiculos/${vehicle.id}`

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
    >
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
        <CarIcon className="size-6" />
        {uso && (
          <span className="absolute -right-1 -top-1 flex size-3" title={tituloPunto}>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: puntoColor }} />
            <span className="relative inline-flex size-3 rounded-full border-2 border-superficie" style={{ backgroundColor: puntoColor }} />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-tinta">
          {vehicle.marca} {vehicle.modelo} · {vehicle.patente}
        </p>
        <p className="truncate text-sm text-acero">
          Documentación · {docCount} {docCount === 1 ? 'archivo' : 'archivos'}
        </p>
      </div>
      {danoUsageId && (
        <span className="shrink-0 rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Daño reportado</span>
      )}
      <StatusBadge status={status} variant="vehicle" />
    </Link>
  )
}
```

(Nota: el color del punto se aplica con `style` inline porque es dinámico verde/ámbar; el resto sigue con tokens/clases.)

- [ ] **Step 4: Typecheck, lint, build, commit**

Run: `npx tsc --noEmit && npx eslint "app/(app)/dashboard/page.tsx" components/VehiclesBoard.tsx components/VehicleCard.tsx && npm run build`

```bash
git add "app/(app)/dashboard/page.tsx" components/VehiclesBoard.tsx components/VehicleCard.tsx
git commit -m "feat(dashboard): punto ambar de uso prolongado + pill de dano con enlace al uso"
```

---

### Task 7: Página del vehículo — ancla + botón "marcar revisado"

**Files:**
- Create: `components/vehicle/RevisarDanoButton.tsx`
- Modify: `components/vehicle/BitacoraUso.tsx`, `app/(app)/vehiculos/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/usages/[id]/revisar-dano` (Task 4).
- Produces: `RevisarDanoButton({ usageId: string })`.

- [ ] **Step 1: Crear `components/vehicle/RevisarDanoButton.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RevisarDanoButton({ usageId }: { usageId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function revisar() {
    setBusy(true); setError(false)
    const res = await fetch(`/api/usages/${usageId}/revisar-dano`, { method: 'POST' })
    setBusy(false)
    if (res.ok) router.refresh()
    else setError(true)
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={revisar}
        disabled={busy}
        className="rounded-lg border border-[#C81E1E]/30 bg-[#FCE7E7] px-3 py-1.5 text-xs font-medium text-[#C81E1E] transition-colors hover:bg-[#FCE7E7]/70 disabled:opacity-50"
      >
        {busy ? 'Registrando…' : 'Marcar daño como revisado'}
      </button>
      {error && <span className="ml-2 text-xs text-vencido">No se pudo registrar.</span>}
    </div>
  )
}
```

- [ ] **Step 2: `BitacoraUso` — ancla, campos de revisión y botón/texto**

En `components/vehicle/BitacoraUso.tsx`:

(a) Agregar el import arriba:

```ts
import RevisarDanoButton from '@/components/vehicle/RevisarDanoButton'
```

(b) Extender el `dano` de la interfaz `UsageRow`:

```ts
  dano?: { hay: boolean; nota?: string; revisadoPorNombre?: string; revisadoEn?: string }
```

(c) Poner el ancla en el `<li>` (línea del `.map`): cambiar `<li key={u.id} className="rounded-xl border border-linea p-4">` por:

```tsx
            <li key={u.id} id={`uso-${u.id}`} className="scroll-mt-20 rounded-xl border border-linea p-4">
```

(d) Debajo de la línea del daño (`{u.dano?.nota && ...}`, línea ~50), agregar el botón o el texto de revisado:

```tsx
              {u.dano?.hay && (
                u.dano.revisadoPorNombre
                  ? <p className="mt-2 text-xs text-acero">Daño registrado por <span className="font-medium text-tinta">{u.dano.revisadoPorNombre}</span></p>
                  : <RevisarDanoButton usageId={u.id} />
              )}
```

- [ ] **Step 3: La página del vehículo pasa los campos de revisión**

En `app/(app)/vehiculos/[id]/page.tsx`, en el map de `usos`, cambiar la línea del `dano` por:

```ts
      dano: u.dano ? { hay: u.dano.hay, nota: u.dano.nota, revisadoPorNombre: u.dano.revisadoPorNombre, revisadoEn: u.dano.revisadoEn } : undefined,
```

- [ ] **Step 4: Typecheck, lint, build, commit**

Run: `npx tsc --noEmit && npx eslint components/vehicle/RevisarDanoButton.tsx components/vehicle/BitacoraUso.tsx "app/(app)/vehiculos/[id]/page.tsx" && npm run build`

```bash
git add components/vehicle/RevisarDanoButton.tsx components/vehicle/BitacoraUso.tsx "app/(app)/vehiculos/[id]/page.tsx"
git commit -m "feat(vehiculo): ancla al uso + boton para marcar dano revisado (cualquier rol)"
```

---

### Task 8: Reportes — revisor en el tooltip de la pill "Daño"

**Files:**
- Modify: `components/reportes/BitacoraFlota.tsx`

**Interfaces:** ninguna nueva. El endpoint `/api/reportes/usos` ya devuelve el `dano` completo (`toUsage` mapea `dano` crudo, incluidos los campos de revisión).

- [ ] **Step 1: Extender `Uso` y el tooltip**

En `components/reportes/BitacoraFlota.tsx`:

(a) Extender el `dano` de la interfaz `Uso`:

```ts
  dano?: { hay: boolean; nota?: string; revisadoPorNombre?: string }
```

(b) En el `PillTip` de "Daño", agregar la línea del revisor. Reemplazar el `PillTip` de daño por:

```tsx
                {u.dano?.hay && (
                  <PillTip label="Daño" tono="rojo">
                    <p>{u.dano.nota || 'Sin nota'}</p>
                    {u.dano.revisadoPorNombre && (
                      <p className="mt-1 text-xs text-acero">Daño registrado por: {u.dano.revisadoPorNombre}</p>
                    )}
                  </PillTip>
                )}
```

- [ ] **Step 2: Typecheck, lint, build, commit**

Run: `npx tsc --noEmit && npx eslint components/reportes/BitacoraFlota.tsx && npm run build`

```bash
git add components/reportes/BitacoraFlota.tsx
git commit -m "feat(reportes): tooltip de dano muestra quien lo registro"
```

---

## Notas de cierre (tras las 8 tasks)

- Actualizar `CLAUDE.md`: eliminar las referencias a la pestaña **Flota** y sus componentes; documentar que el uso prolongado ahora es el punto ámbar del dashboard, que el daño se revisa desde la bitácora del vehículo (`RevisarDanoButton` + `POST /api/usages/[id]/revisar-dano`, cualquier rol) con `dano.revisadoPor*`, que la colección `alertas` es solo `dano`, y que "sin entrega" ya no genera alerta ni email (solo el contador `sinEntrega`). Documentar `lib/email/danoEmail.ts` y la baja de `usageAlertEmail.ts`.
- Revisar `firestore.indexes.json` / reglas: no cambian (no hay nuevas queries compuestas; `deleteDanoAlertaByUsage` y el dashboard usan la query de un solo campo `companyId` ya existente).
