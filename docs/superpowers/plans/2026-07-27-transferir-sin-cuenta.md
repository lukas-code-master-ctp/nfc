# Transferir a correos sin cuenta — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para el seguimiento.

**Goal:** Que se pueda transferir un vehículo a un correo sin cuenta en TapCar: la transferencia queda pendiente, al destinatario le llega un correo para registrarse, y tanto él como el emisor ven el estado desde el dashboard.

**Architecture:** Delta sobre la transferencia ya implementada. El endpoint de crear deja de exigir que el correo tenga cuenta y elige entre dos plantillas de correo. Se repone el `GET /api/transferencias/[token]` **público** para que el banner del login pueda nombrar la patente sin sesión. El dashboard suma dos consultas de un solo campo: transferencias entrantes (por `paraEmail`) y salientes pendientes (por `deCompanyId`).

**Tech Stack:** Next 16 (App Router), TypeScript estricto, Firestore vía firebase-admin, Resend, Tailwind v4 con los tokens de `app/globals.css`, Vitest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-07-27-transferir-vehiculo-design.md`](../specs/2026-07-27-transferir-vehiculo-design.md) — sección «Transferencia a correos sin cuenta».

**Plan previo (ya implementado):** [`2026-07-27-transferir-vehiculo.md`](2026-07-27-transferir-vehiculo.md)

## Global Constraints

- **Idioma:** todo el código, UI, comentarios y mensajes en español neutro (Chile). Usa "tú", nunca "vos".
- **No cambian las reglas de aceptación.** `puedeAceptar` queda intacta: quien se registra pasa por el mismo filtro que quien ya tenía cuenta, incluida la comparación de correo.
- **El `GET /api/transferencias/[token]` es público** (sin sesión) y expone **solo** cuatro campos: `patente`, `deCompanyNombre`, `paraEmail`, `status`. Nada más — ni `vehicleId`, ni `deCompanyId`, ni `creadaPorUid`.
- **Correos best-effort:** un fallo de Resend nunca revierte ni bloquea la transferencia. Siempre dentro de `try/catch`.
- **Firestore Admin rechaza `undefined`:** construye los objetos sin claves `undefined` u omítelas.
- **Las consultas nuevas son de un solo campo** (`paraEmail`, `deCompanyId`) con filtro en memoria. No agregues índices compuestos.
- **Estilo visual:** tokens de `app/globals.css` (`tinta`, `acero`, `linea`, `lienzo`, `superficie`, `azul`, `vigente`, `vencido`). Iconos SVG inline, nunca emojis.
- **Tests** en `__tests__/` junto al módulo. Vitest los toma con `**/__tests__/**/*.test.{ts,tsx}`. No existe `@testing-library/user-event`: usa `fireEvent`.
- **Antes de cada commit:** `npx tsc --noEmit` y `npm test` (el suite `lib/firebase/__tests__/rules.test.ts` falla sin el emulador de Firestore: es esperado en local). Antes del commit final además `npm run build` y `npx eslint app components lib`.
- **Mensajes de commit** en español, terminados con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/data/transferencias.ts` (modificar) | Sumar `listPendientesPara(email)` y `listPendientesDe(companyId)`. |
| `lib/email/transferenciaEmail.ts` (modificar) | Sumar la plantilla para quien no tiene cuenta. |
| `lib/email/resend.ts` (modificar) | Sumar el sender correspondiente. |
| `app/api/vehicles/[id]/transferir/route.ts` (modificar) | Dejar de rechazar correos sin cuenta; elegir plantilla. |
| `app/api/transferencias/[token]/route.ts` (crear) | `GET` público y acotado. |
| `components/transferencias/TransferenciaBanner.tsx` (crear) | Banner del login. |
| `app/(auth)/login/page.tsx` (modificar) | Leer `?transferencia=` y montar el banner. |
| `components/LoginForm.tsx` (modificar) | Prop `destino` opcional para el redirect post-login. |
| `components/transferencias/TransferenciasEntrantes.tsx` (crear) | Banner de transferencias entrantes del dashboard. |
| `app/(app)/dashboard/page.tsx` (modificar) | Las dos consultas nuevas. |
| `components/VehiclesBoard.tsx` (modificar) | Prop `entrantes` + campo `transferenciaPendiente` en `Item`. |
| `components/VehicleCard.tsx` (modificar) | Pill «Transferencia pendiente». |

---

### Task 1: Consultas y plantilla de correo

**Files:**
- Modify: `lib/data/transferencias.ts` (agregar al final)
- Modify: `lib/email/transferenciaEmail.ts` (agregar al final)
- Modify: `lib/email/resend.ts`
- Test: `lib/data/__tests__/transferencias.test.ts` (agregar casos)
- Test: `lib/email/__tests__/transferenciaEmail.test.ts` (agregar casos)

**Interfaces:**
- Consumes: `Transferencia`, `transferenciaVigente`, `toTransferencia` (helper privado ya existente en el módulo), `emailLayout`, `ctaButton`, `appUrl`.
- Produces:
  - `listPendientesPara(email: string): Promise<Transferencia[]>`
  - `listPendientesDe(companyId: string): Promise<Transferencia[]>`
  - `transferenciaSinCuentaSubject(patente: string): string`
  - `transferenciaSinCuentaHtml(p: { patente: string; deCompanyNombre: string; deEmail: string; paraEmail: string; registrarUrl: string }): string`
  - `sendTransferenciaSinCuentaEmail(to: string, p: <mismo objeto de arriba>): Promise<void>`

- [ ] **Step 1: Escribir los tests de datos que fallan**

En `lib/data/__tests__/transferencias.test.ts`, agrega al final del archivo:

```ts
describe('listPendientesPara', () => {
  it('devuelve solo las vigentes dirigidas a ese correo', async () => {
    mockGet.mockResolvedValue({ docs: [doc('t1'), doc('t2', { status: 'cancelada' }), doc('t3', { expiresAt: pasado })] })
    const lista = await listPendientesPara('a@b.cl')
    expect(lista.map((t) => t.id)).toEqual(['t1'])
  })

  it('normaliza el correo antes de consultar', async () => {
    mockGet.mockResolvedValue({ docs: [] })
    await listPendientesPara('  A@B.CL ')
    expect(mockWhere).toHaveBeenCalledWith('paraEmail', '==', 'a@b.cl')
  })
})

describe('listPendientesDe', () => {
  it('devuelve solo las vigentes de esa empresa', async () => {
    mockGet.mockResolvedValue({ docs: [doc('t1', { status: 'aceptada' }), doc('t2')] })
    const lista = await listPendientesDe('c1')
    expect(lista.map((t) => t.id)).toEqual(['t2'])
  })
})
```

Y actualiza el import de arriba del archivo para que quede:

```ts
import {
  getTransferenciaByToken,
  getPendienteByVehicle,
  listPendientesPara,
  listPendientesDe,
} from '@/lib/data/transferencias'
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
npx vitest run lib/data/__tests__/transferencias.test.ts
```

Esperado: FAIL — `listPendientesPara is not a function`.

- [ ] **Step 3: Implementar las consultas**

En `lib/data/transferencias.ts`, agrega el import de `normalizeEmail` junto a los otros de arriba:

```ts
import { normalizeEmail } from '@/lib/data/invitations'
```

Y al final del archivo:

```ts
/** Transferencias vigentes dirigidas a un correo (para el banner del dashboard). */
export async function listPendientesPara(email: string): Promise<Transferencia[]> {
  const snap = await adminDb.collection(COL).where('paraEmail', '==', normalizeEmail(email)).get()
  const nowIso = new Date().toISOString()
  return snap.docs
    .map((d) => toTransferencia(d.id, d.data()))
    .filter((t) => transferenciaVigente(t, nowIso))
}

/** Transferencias vigentes que envió una empresa (para la pill del dashboard). */
export async function listPendientesDe(companyId: string): Promise<Transferencia[]> {
  const snap = await adminDb.collection(COL).where('deCompanyId', '==', companyId).get()
  const nowIso = new Date().toISOString()
  return snap.docs
    .map((d) => toTransferencia(d.id, d.data()))
    .filter((t) => transferenciaVigente(t, nowIso))
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
npx vitest run lib/data/__tests__/transferencias.test.ts
```

Esperado: PASS, 8 tests (5 previos + 3 nuevos).

- [ ] **Step 5: Escribir el test del correo que falla**

En `lib/email/__tests__/transferenciaEmail.test.ts`, agrega al final:

```ts
describe('correo a quien no tiene cuenta', () => {
  const html = transferenciaSinCuentaHtml({
    patente: 'ABCD-12',
    deCompanyNombre: 'Transportes Uno',
    deEmail: 'jefe@uno.cl',
    paraEmail: 'nuevo@dos.cl',
    registrarUrl: 'https://app.tapcar.cl/login?transferencia=tok',
  })

  it('el asunto lleva la patente', () => {
    expect(transferenciaSinCuentaSubject('ABCD-12')).toContain('ABCD-12')
  })

  it('el CTA lleva a registrarse con el token', () => {
    expect(html).toContain('https://app.tapcar.cl/login?transferencia=tok')
    expect(html).toContain('Crear mi cuenta en TapCar')
  })

  it('insiste en que use ese mismo correo, o no podrá aceptar', () => {
    expect(html).toContain('nuevo@dos.cl')
    expect(html).toContain('mismo correo')
  })

  it('nombra a quién le está transfiriendo', () => {
    expect(html).toContain('Transportes Uno')
  })
})
```

Y agrega los dos nombres nuevos al import del principio del archivo:

```ts
import {
  transferenciaRecibidaSubject,
  transferenciaRecibidaHtml,
  transferenciaEnviadaSubject,
  transferenciaEnviadaHtml,
  transferenciaAceptadaSubject,
  transferenciaAceptadaHtml,
  transferenciaSinCuentaSubject,
  transferenciaSinCuentaHtml,
} from '@/lib/email/transferenciaEmail'
```

- [ ] **Step 6: Escribir la plantilla**

En `lib/email/transferenciaEmail.ts`, agrega al final:

```ts
export function transferenciaSinCuentaSubject(patente: string): string {
  return `Te quieren transferir el vehículo ${patente} en TapCar`
}

export function transferenciaSinCuentaHtml(p: {
  patente: string
  deCompanyNombre: string
  deEmail: string
  paraEmail: string
  registrarUrl: string
}): string {
  const empresa = p.deCompanyNombre.trim() || 'Otra empresa'
  return emailLayout({
    titulo: `Te quieren transferir el ${p.patente}`,
    contenidoHtml: `
      <p><strong>${empresa}</strong> (${p.deEmail}) quiere transferirte el vehículo <strong>${p.patente}</strong> en TapCar, donde se guardan sus documentos.</p>
      <p>Todavía no tienes cuenta. Crea una gratis y el vehículo te va a estar esperando con sus documentos y su historial de mantenciones.</p>
      ${ctaButton('Crear mi cuenta en TapCar', p.registrarUrl)}
      <p style="${GRIS}">Regístrate con este mismo correo (<strong>${p.paraEmail}</strong>): si usas otro, no vas a poder aceptar la transferencia.</p>
      <p style="${GRIS}">La transferencia vence en 7 días.</p>
    `,
    motivo: 'Si no esperabas este correo, puedes ignorarlo: sin tu aceptación no pasa nada.',
  })
}
```

- [ ] **Step 7: Agregar el sender**

En `lib/email/resend.ts`, suma los dos nombres al import de `transferenciaEmail` que ya existe:

```ts
import {
  transferenciaRecibidaSubject, transferenciaRecibidaHtml,
  transferenciaEnviadaSubject, transferenciaEnviadaHtml,
  transferenciaAceptadaSubject, transferenciaAceptadaHtml,
  transferenciaSinCuentaSubject, transferenciaSinCuentaHtml,
} from '@/lib/email/transferenciaEmail'
```

Y al final del archivo:

```ts
export async function sendTransferenciaSinCuentaEmail(
  to: string,
  p: { patente: string; deCompanyNombre: string; deEmail: string; paraEmail: string; registrarUrl: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: transferenciaSinCuentaSubject(p.patente),
    html: transferenciaSinCuentaHtml(p),
  })
}
```

- [ ] **Step 8: Correr los tests y commitear**

```bash
npx vitest run lib/data lib/email && npx tsc --noEmit
```

Esperado: PASS, con 4 tests de correo nuevos.

```bash
git add lib/data/transferencias.ts lib/data/__tests__/transferencias.test.ts lib/email
git commit -m "feat(transferencias): consultas de pendientes y correo para quien no tiene cuenta"
```

---

### Task 2: El endpoint deja de rechazar, y vuelve el GET público

**Files:**
- Modify: `app/api/vehicles/[id]/transferir/route.ts`
- Create: `app/api/transferencias/[token]/route.ts`
- Test: `app/api/vehicles/[id]/transferir/__tests__/route.test.ts` (reemplazar dos casos, agregar dos)
- Test: `app/api/transferencias/__tests__/route.test.ts`

**Interfaces:**
- Consumes de Task 1: `sendTransferenciaSinCuentaEmail`.
- Produces: `GET /api/transferencias/[token]` → `{ patente, deCompanyNombre, paraEmail, status }` o 404.

- [ ] **Step 1: Cambiar los tests del endpoint de crear**

En `app/api/vehicles/[id]/transferir/__tests__/route.test.ts`:

1. Suma el sender nuevo al mock de resend:

```ts
const sendSinCuenta = vi.fn()
vi.mock('@/lib/email/resend', () => ({
  sendTransferenciaRecibidaEmail: (...a: unknown[]) => sendRecibida(...a),
  sendTransferenciaEnviadaEmail: () => Promise.resolve(),
  sendTransferenciaSinCuentaEmail: (...a: unknown[]) => sendSinCuenta(...a),
}))
```

2. Declara también `sendRecibida` junto a los otros `vi.fn()` de arriba:

```ts
const sendRecibida = vi.fn()
```

3. Agrégalos al `beforeEach` de reseteo:

```ts
  sendRecibida.mockReset(); sendSinCuenta.mockReset()
```

4. **Borra** estos dos tests, que ahora prueban lo contrario de lo que queremos:

```ts
  it('404 sin_cuenta si el correo no tiene cuenta', async () => { /* ... */ })
  it('404 sin_cuenta si el usuario existe pero no tiene empresa', async () => { /* ... */ })
```

5. En su lugar, agrega:

```ts
  it('crea la transferencia aunque el correo no tenga cuenta', async () => {
    getUserByEmail.mockRejectedValue(new Error('user not found'))
    const res = await POST(req({ email: 'nadie@x.cl' }), ctx('v1'))
    expect(res.status).toBe(200)
    expect(createTransferencia).toHaveBeenCalledWith(expect.objectContaining({ paraEmail: 'nadie@x.cl' }))
  })

  it('crea la transferencia si el usuario existe pero no tiene empresa', async () => {
    userDocGet.mockResolvedValue({ exists: true, data: () => ({}) })
    expect((await POST(req({ email: 'a@b.cl' }), ctx('v1'))).status).toBe(200)
  })

  it('usa la plantilla de registro cuando el correo no tiene cuenta', async () => {
    getUserByEmail.mockRejectedValue(new Error('user not found'))
    await POST(req({ email: 'nadie@x.cl' }), ctx('v1'))
    expect(sendSinCuenta).toHaveBeenCalledWith('nadie@x.cl', expect.objectContaining({
      patente: 'ABCD-12', paraEmail: 'nadie@x.cl',
    }))
    expect(sendRecibida).not.toHaveBeenCalled()
  })

  it('usa la plantilla normal cuando el correo sí tiene cuenta', async () => {
    await POST(req({ email: 'nuevo@dos.cl' }), ctx('v1'))
    expect(sendRecibida).toHaveBeenCalled()
    expect(sendSinCuenta).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
npx vitest run app/api/vehicles
```

Esperado: FAIL — los nuevos dan 404 en vez de 200.

- [ ] **Step 3: Quitar el rechazo del endpoint**

En `app/api/vehicles/[id]/transferir/route.ts`:

1. Suma el sender al import de resend:

```ts
import {
  sendTransferenciaRecibidaEmail,
  sendTransferenciaEnviadaEmail,
  sendTransferenciaSinCuentaEmail,
} from '@/lib/email/resend'
```

2. **Borra** este bloque completo:

```ts
  if (!destino) {
    return NextResponse.json(
      { error: 'sin_cuenta', mensaje: 'Ese correo no tiene cuenta en TapCar. Pídele que se registre primero.' },
      { status: 404 },
    )
  }
```

3. Cambia la comparación de misma empresa para que tolere el `null` (si no hay cuenta, no hay empresa que comparar):

```ts
  if (destino && destino === m.companyId) {
```

4. Reemplaza el bloque del correo al destinatario —el `try` que llama a `sendTransferenciaRecibidaEmail`— por este, que elige plantilla:

```ts
  // Dos caminos: quien ya tiene cuenta va directo a aceptar; quien no, primero se registra.
  const aceptarUrl = `${appUrl()}/transferencias/${t.token}`
  const registrarUrl = `${appUrl()}/login?transferencia=${t.token}`
  try {
    if (destino) {
      await sendTransferenciaRecibidaEmail(email, {
        patente: vehicle.patente,
        deCompanyNombre: razonSocial,
        deEmail: m.email,
        aceptarUrl,
      })
    } else {
      await sendTransferenciaSinCuentaEmail(email, {
        patente: vehicle.patente,
        deCompanyNombre: razonSocial,
        deEmail: m.email,
        paraEmail: email,
        registrarUrl,
      })
    }
  } catch (err) {
    console.error('[transferir] correo al destinatario', err)
  }
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
npx vitest run app/api/vehicles
```

Esperado: PASS, 14 tests.

- [ ] **Step 5: Escribir el test del GET público**

Crea `app/api/transferencias/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getTransferenciaByToken = vi.fn()
vi.mock('@/lib/data/transferencias', () => ({
  getTransferenciaByToken: (...a: unknown[]) => getTransferenciaByToken(...a),
}))

import { GET } from '@/app/api/transferencias/[token]/route'

const ctx = (token: string) => ({ params: Promise.resolve({ token }) })
const futuro = '2999-01-01T00:00:00.000Z'

const completa = {
  id: 't1', vehicleId: 'v1', patente: 'ABCD-12', deCompanyId: 'c1', deCompanyNombre: 'Uno',
  paraEmail: 'nuevo@dos.cl', token: 'tok', status: 'pendiente', creadaPorUid: 'u1',
  createdAt: futuro, expiresAt: futuro,
}

beforeEach(() => {
  getTransferenciaByToken.mockReset()
  getTransferenciaByToken.mockResolvedValue(completa)
})

describe('GET transferencia por token', () => {
  it('404 si el token no existe', async () => {
    getTransferenciaByToken.mockResolvedValue(null)
    expect((await GET({} as Request, ctx('tok'))).status).toBe(404)
  })

  it('404 si ya no está vigente', async () => {
    getTransferenciaByToken.mockResolvedValue({ ...completa, status: 'cancelada' })
    expect((await GET({} as Request, ctx('tok'))).status).toBe(404)
  })

  it('responde sin sesión con los cuatro campos acordados', async () => {
    const res = await GET({} as Request, ctx('tok'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      patente: 'ABCD-12',
      deCompanyNombre: 'Uno',
      paraEmail: 'nuevo@dos.cl',
      status: 'pendiente',
    })
  })

  it('no filtra identificadores internos', async () => {
    const data = await (await GET({} as Request, ctx('tok'))).json()
    expect(data).not.toHaveProperty('vehicleId')
    expect(data).not.toHaveProperty('deCompanyId')
    expect(data).not.toHaveProperty('creadaPorUid')
    expect(data).not.toHaveProperty('token')
  })
})
```

- [ ] **Step 6: Escribir el GET**

Crea `app/api/transferencias/[token]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getTransferenciaByToken } from '@/lib/data/transferencias'
import { transferenciaVigente } from '@/lib/transferencias/estado'

export const dynamic = 'force-dynamic'

/**
 * Público a propósito: lo consume el banner de `/login`, donde el destinatario
 * todavía no tiene cuenta. Expone solo lo justo para que reconozca de qué se
 * trata — nunca identificadores internos.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTransferenciaByToken(token)
  if (!t || !transferenciaVigente(t, new Date().toISOString())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({
    patente: t.patente,
    deCompanyNombre: t.deCompanyNombre,
    paraEmail: t.paraEmail,
    status: t.status,
  })
}
```

- [ ] **Step 7: Correr todo y commitear**

```bash
npx vitest run app/api && npx tsc --noEmit
```

Esperado: PASS, 4 tests nuevos del GET.

```bash
git add "app/api/vehicles/[id]/transferir" "app/api/transferencias"
git commit -m "feat(transferencias): aceptar correos sin cuenta y reponer el GET publico"
```

---

### Task 3: Llegada por el enlace del correo

**Files:**
- Create: `components/transferencias/TransferenciaBanner.tsx`
- Modify: `app/(auth)/login/page.tsx`
- Modify: `components/LoginForm.tsx`
- Test: `components/transferencias/__tests__/TransferenciaBanner.test.tsx`
- Test: `components/__tests__/LoginForm.test.tsx`

**Interfaces:**
- Consumes de Task 2: `GET /api/transferencias/[token]`.
- Produces: `TransferenciaBanner({ token })` y `LoginForm({ destino })` con `destino?: string`.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `components/transferencias/__tests__/TransferenciaBanner.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TransferenciaBanner from '@/components/transferencias/TransferenciaBanner'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TransferenciaBanner', () => {
  it('nombra la patente, la empresa y el correo con el que hay que entrar', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        patente: 'ABCD-12', deCompanyNombre: 'Transportes Uno',
        paraEmail: 'nuevo@dos.cl', status: 'pendiente',
      }),
    })
    render(<TransferenciaBanner token="tok" />)

    await waitFor(() => expect(screen.getByText(/ABCD-12/)).toBeDefined())
    expect(screen.getByText(/Transportes Uno/)).toBeDefined()
    expect(screen.getByText(/nuevo@dos\.cl/)).toBeDefined()
  })

  it('no muestra nada si el token ya no sirve', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })
    const { container } = render(<TransferenciaBanner token="tok" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
```

Crea `components/__tests__/LoginForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/lib/firebase/client', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: { getIdToken: () => Promise.resolve('tok') } })),
  createUserWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: { getIdToken: () => Promise.resolve('tok') } })),
}))

import LoginForm from '@/components/LoginForm'

function iniciarSesion() {
  fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'a@b.cl' } })
  fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'secreta1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
}

beforeEach(() => {
  push.mockReset(); refresh.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LoginForm', () => {
  it('sin destino entra al dashboard', async () => {
    render(<LoginForm />)
    iniciarSesion()
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('con destino entra ahí, para no perder la transferencia', async () => {
    render(<LoginForm destino="/transferencias/tok" />)
    iniciarSesion()
    await waitFor(() => expect(push).toHaveBeenCalledWith('/transferencias/tok'))
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
npx vitest run components/transferencias components/__tests__/LoginForm.test.tsx
```

Esperado: FAIL — no existe `TransferenciaBanner`, y `LoginForm` empuja siempre a `/dashboard`.

- [ ] **Step 3: Escribir el banner**

Crea `components/transferencias/TransferenciaBanner.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'

type Info = {
  patente: string
  deCompanyNombre: string
  paraEmail: string
  status: string
}

export default function TransferenciaBanner({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      try {
        const res = await fetch('/api/transferencias/' + encodeURIComponent(token))
        if (!res.ok) return
        const data = (await res.json()) as Info
        if (!cancelado) setInfo(data)
      } catch {
        // sin conexión o error de red: no mostramos el aviso
      }
    }
    cargar()
    return () => {
      cancelado = true
    }
  }, [token])

  if (!info) return null

  return (
    <div className="mb-4 rounded-lg border border-azul/30 bg-azul/5 px-4 py-3 text-sm text-tinta">
      <strong>{info.deCompanyNombre || 'Otra empresa'}</strong> quiere transferirte el vehículo{' '}
      <strong>{info.patente}</strong>. Crea tu cuenta o inicia sesión con{' '}
      <strong>{info.paraEmail}</strong> para aceptarla.
    </div>
  )
}
```

- [ ] **Step 4: Que el login lleve al destino**

En `components/LoginForm.tsx`:

1. Cambia la firma del componente:

```tsx
export default function LoginForm({ destino }: { destino?: string }) {
```

2. Cambia el `push` de `afterAuth`:

```tsx
  async function afterAuth(user: User) {
    await establishSession(user)
    // `destino` viene del enlace de una transferencia: sin esto, quien se
    // registra desde el correo cae al dashboard y pierde el enlace.
    router.push(destino ?? '/dashboard')
    router.refresh()
  }
```

En `app/(auth)/login/page.tsx`, reemplaza el componente completo por:

```tsx
import LoginForm from '@/components/LoginForm'
import InvitationBanner from '@/components/InvitationBanner'
import TransferenciaBanner from '@/components/transferencias/TransferenciaBanner'
import { TapCarIsotipo, TapCarWordmark } from '@/components/brand/Logo'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; transferencia?: string }>
}) {
  const { invite, transferencia } = await searchParams

  return (
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <TapCarIsotipo className="mx-auto mb-2 size-14" />
          <TapCarWordmark className="text-3xl" />
          <p className="mt-2 text-sm text-acero">Ingresa para gestionar tu flota: documentos, uso y estado de cada vehículo.</p>
        </div>
        {invite && <InvitationBanner token={invite} />}
        {transferencia && <TransferenciaBanner token={transferencia} />}
        <div className="rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
          <LoginForm destino={transferencia ? `/transferencias/${transferencia}` : undefined} />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Correr los tests y commitear**

```bash
npx vitest run components && npx tsc --noEmit
```

Esperado: PASS, 4 tests nuevos.

```bash
git add components/transferencias components/LoginForm.tsx components/__tests__/LoginForm.test.tsx "app/(auth)/login/page.tsx"
git commit -m "feat(transferencias): banner en login y redirect al aceptar tras registrarse"
```

---

### Task 4: Estado en el dashboard

**Files:**
- Create: `components/transferencias/TransferenciasEntrantes.tsx`
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `components/VehiclesBoard.tsx`
- Modify: `components/VehicleCard.tsx`
- Test: `components/transferencias/__tests__/TransferenciasEntrantes.test.tsx`
- Test: `components/__tests__/VehicleCard.test.tsx`

**Interfaces:**
- Consumes de Task 1: `listPendientesPara`, `listPendientesDe`.
- Produces: `TransferenciasEntrantes({ items })` con `items: { token: string; patente: string; deCompanyNombre: string }[]`; `VehicleCard` acepta `transferenciaPendiente?: boolean`; `VehiclesBoard` acepta `entrantes` y el `Item` gana `transferenciaPendiente: boolean`.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `components/transferencias/__tests__/TransferenciasEntrantes.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TransferenciasEntrantes from '@/components/transferencias/TransferenciasEntrantes'

describe('TransferenciasEntrantes', () => {
  it('no renderiza nada sin transferencias', () => {
    const { container } = render(<TransferenciasEntrantes items={[]} />)
    expect(container.textContent).toBe('')
  })

  it('nombra la patente y enlaza a la página de aceptación', () => {
    render(
      <TransferenciasEntrantes
        items={[{ token: 'tok', patente: 'ABCD-12', deCompanyNombre: 'Transportes Uno' }]}
      />,
    )
    expect(screen.getByText(/ABCD-12/)).toBeDefined()
    expect(screen.getByRole('link', { name: /revisar/i }).getAttribute('href')).toBe('/transferencias/tok')
  })

  it('lista todas las pendientes', () => {
    render(
      <TransferenciasEntrantes
        items={[
          { token: 'a', patente: 'AAAA-11', deCompanyNombre: 'Uno' },
          { token: 'b', patente: 'BBBB-22', deCompanyNombre: 'Dos' },
        ]}
      />,
    )
    expect(screen.getAllByRole('link', { name: /revisar/i })).toHaveLength(2)
  })
})
```

Crea `components/__tests__/VehicleCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VehicleCard from '@/components/VehicleCard'
import type { Vehicle } from '@/lib/types'

const vehiculo = {
  id: 'v1', companyId: 'c1', patente: 'ABCD-12', marca: 'BMW', modelo: 'X6',
  anio: 2024, color: 'Verde', publicToken: 'tok', createdAt: '2026-01-01T00:00:00.000Z',
} as Vehicle

describe('VehicleCard', () => {
  it('sin transferencia pendiente no muestra la pill', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" />)
    expect(screen.queryByText('Transferencia pendiente')).toBeNull()
  })

  it('con transferencia pendiente muestra la pill', () => {
    render(<VehicleCard vehicle={vehiculo} status="al_dia" transferenciaPendiente />)
    expect(screen.getByText('Transferencia pendiente')).toBeDefined()
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
npx vitest run components/transferencias components/__tests__/VehicleCard.test.tsx
```

Esperado: FAIL — no existe `TransferenciasEntrantes` ni la prop `transferenciaPendiente`.

- [ ] **Step 3: Escribir el banner de entrantes**

Crea `components/transferencias/TransferenciasEntrantes.tsx`:

```tsx
import Link from 'next/link'

type Entrante = { token: string; patente: string; deCompanyNombre: string }

/**
 * Red de seguridad del flujo de transferencia: quien cerró el correo o se
 * registró por su cuenta igual encuentra acá el vehículo que le ofrecieron.
 */
export default function TransferenciasEntrantes({ items }: { items: Entrante[] }) {
  if (items.length === 0) return null

  return (
    <div className="mb-6 space-y-2">
      {items.map((t) => (
        <div
          key={t.token}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-azul/30 bg-azul/5 px-4 py-3"
        >
          <p className="text-sm text-tinta">
            <strong>{t.deCompanyNombre || 'Otra empresa'}</strong> te quiere transferir el vehículo{' '}
            <strong>{t.patente}</strong>.
          </p>
          <Link
            href={`/transferencias/${t.token}`}
            className="shrink-0 rounded-lg bg-azul px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
          >
            Revisar
          </Link>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Agregar la pill a la card**

En `components/VehicleCard.tsx`:

1. Agrega el parámetro a la desestructuración y al tipo:

```tsx
export default function VehicleCard({
  vehicle, status, docCount = 0, prolongado = false, horasUso = 0, danoUsageId = null, categoriaNombre = null, danoActivo = false, mantencion = 'sin_pauta', mantencionDetalle = '', transferenciaPendiente = false,
}: {
  vehicle: Vehicle
  status: DocStatus
  docCount?: number
  prolongado?: boolean
  horasUso?: number
  danoUsageId?: string | null
  categoriaNombre?: string | null
  danoActivo?: boolean
  mantencion?: EstadoMantencion
  mantencionDetalle?: string
  transferenciaPendiente?: boolean
}) {
```

2. Agrega la pill justo **antes** de `<StatusBadge status={status} variant="vehicle" />`:

```tsx
          {transferenciaPendiente && (
            <span className="whitespace-nowrap rounded-full bg-[#EEF0F3] px-2 py-0.5 text-xs font-medium text-acero">Transferencia pendiente</span>
          )}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

```bash
npx vitest run components/transferencias components/__tests__/VehicleCard.test.tsx
```

Esperado: PASS, 5 tests.

- [ ] **Step 6: Pasar los datos desde el dashboard**

En `components/VehiclesBoard.tsx`:

1. Agrega el campo al tipo `Item` (línea ~13), después de `mantencionDetalle`:

```ts
  transferenciaPendiente: boolean
```

2. Importa el banner junto a los otros imports de arriba:

```ts
import TransferenciasEntrantes from '@/components/transferencias/TransferenciasEntrantes'
```

3. Agrega la prop `entrantes` a la firma del componente, junto a `items`, `limit`, `canWrite` y `categorias`, con default `[]`:

```ts
  entrantes = [],
```

y en su tipo:

```ts
  entrantes?: { token: string; patente: string; deCompanyNombre: string }[]
```

4. Renderiza el banner dentro del `<main>`, **justo después** del `<div className="mb-6 flex items-end justify-between gap-4">…</div>` del encabezado:

```tsx
      <TransferenciasEntrantes items={entrantes} />
```

5. En el `.map` de los paginados (línea ~446), suma `transferenciaPendiente` a la desestructuración y pásala a la card:

```tsx
                  {paginados.map(({ vehicle, status, docCount, prolongado, horasUso, danoUsageId, categoriaNombre, danoActivo, mantencion, mantencionDetalle, transferenciaPendiente }) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} docCount={docCount} prolongado={prolongado} horasUso={horasUso} danoUsageId={danoUsageId} categoriaNombre={categoriaNombre} danoActivo={danoActivo} mantencion={mantencion} mantencionDetalle={mantencionDetalle} transferenciaPendiente={transferenciaPendiente} />
                  ))}
```

En `app/(app)/dashboard/page.tsx`:

1. Agrega el import:

```ts
import { listPendientesPara, listPendientesDe } from '@/lib/data/transferencias'
```

2. Suma las dos consultas al `Promise.all` que ya existe:

```ts
  const [vehicles, company, alertas, entrantes, salientes] = await Promise.all([
    listVehicles(m.companyId),
    getCompany(m.companyId),
    listAlertas(m.companyId),
    listPendientesPara(m.email),
    listPendientesDe(m.companyId),
  ])
```

3. Después de la línea `for (const a of alertas) …`, agrega:

```ts
  const conTransferencia = new Set(salientes.map((t) => t.vehicleId))
```

4. Agrega el campo al objeto que devuelve el `map`, después de `mantencionDetalle`:

```ts
        transferenciaPendiente: conTransferencia.has(v.id),
```

5. Cambia el `return` final por:

```tsx
  return (
    <VehiclesBoard
      items={items}
      limit={limit}
      canWrite={can(m.role, 'vehicle:write')}
      categorias={categorias}
      entrantes={entrantes.map((t) => ({ token: t.token, patente: t.patente, deCompanyNombre: t.deCompanyNombre }))}
    />
  )
```

- [ ] **Step 7: Verificación completa**

```bash
npm test
```

Esperado: PASS salvo `lib/firebase/__tests__/rules.test.ts` (necesita el emulador de Firestore).

```bash
npx tsc --noEmit && npm run build && npx eslint app components lib
```

Esperado: los tres sin errores. ESLint puede tirar warnings de `react-hooks/set-state-in-effect`: están en `warn` a propósito.

- [ ] **Step 8: Commit**

```bash
git add components/transferencias components/VehiclesBoard.tsx components/VehicleCard.tsx components/__tests__/VehicleCard.test.tsx "app/(app)/dashboard/page.tsx"
git commit -m "feat(transferencias): banner de entrantes y pill de pendiente en el dashboard"
```

- [ ] **Step 9: Verificación manual (requiere un correo sin cuenta)**

Ningún agente puede hacer esto. Necesitas una cuenta de TapCar y un correo real **que no tenga cuenta**.

1. Desde tu cuenta, ficha de un vehículo → Ajustes → Transferir a ese correo sin cuenta. Debe crearse la transferencia (ya no el error rojo «Ese correo no tiene cuenta en TapCar»).
2. En el dashboard, la card de ese vehículo debe mostrar la pill **«Transferencia pendiente»**.
3. Revisa el correo que llegó: debe decir «Crear mi cuenta en TapCar» y nombrar el correo con el que hay que registrarse.
4. Abre ese enlace en una ventana de incógnito: el login debe mostrar el banner con la patente y el correo.
5. Regístrate ahí con ese mismo correo → debes aterrizar **directo en la página de aceptación**, no en el dashboard.
6. Acepta → el vehículo aparece en tu flota nueva con sus documentos, y desaparece de la flota del emisor.
7. Repite el flujo hasta el paso 3 con otro correo, pero esta vez ignora el enlace: entra al dashboard de la cuenta nueva y confirma que el **banner de entrantes** ofrece «Revisar».
8. **Registrarse con otro correo:** abre el enlace y regístrate con un correo distinto al destinatario → la página debe decir que la transferencia es para otro correo, sin botón de aceptar.

---

## Notas de implementación

- **No toques `puedeAceptar`.** Las cinco reglas siguen igual: el que se registra pasa por el mismo filtro que el que ya tenía cuenta.
- **El `GET` es público a propósito**, pero solo con cuatro campos. No agregues `vehicleId` ni `deCompanyId` "por comodidad": el token circula por correo y no está autenticado.
- **No agregues índices compuestos:** las dos consultas nuevas son de un solo campo con filtro en memoria.
- **Fuera de alcance:** congelar el vehículo mientras está pendiente, transferir varios a la vez, deshacer una transferencia aceptada, y cualquier pantalla de historial.
