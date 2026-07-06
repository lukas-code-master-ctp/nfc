# Detección de entrega irregular — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando quien entrega un uso no es quien lo tomó (el conductor original no cerró su propio uso), generar la misma señal que el force-close (alerta `sin_entrega` + contador `sinEntrega` + email), atribuida al conductor original.

**Architecture:** Tres cambios acotados: (1) `usageAlertEmail` gana un parámetro opcional para que el copy sea correcto cuando lo entregó otro conductor; (2) `closeUsage` pasa a devolver un objeto con `entregaIrregular` y el conductor original en vez de solo el id; (3) la ruta `entregar` actúa sobre `entregaIrregular` disparando alerta+email+contador, reutilizando el patrón best-effort que ya existe en `tomar`.

**Tech Stack:** Next.js 16 (route handlers), TypeScript estricto, Firebase Admin SDK, Vitest 4, Resend.

## Global Constraints

- Idioma de todo el código/UI/copy: **español neutro (Chile)**, tratar de **"tú"**.
- **Firestore Admin rechaza `undefined`**: no escribir claves con valor `undefined`.
- Los efectos secundarios (alerta, email, contador) son **best-effort**: cada uno en su propio `try/catch`, nunca rompen el flujo de entrega.
- `companyId` siempre se resuelve por el token en el servidor; nunca confiar en el cliente.
- No cambiar el esquema: reutilizar `tipo: 'sin_entrega'` y el contador `sinEntrega`.
- Antes de commitear cada task: `npx tsc --noEmit`, `npx vitest run <archivos tocados>`, y `npx eslint <archivos tocados>`.

---

### Task 1: Copy del email con `entregadoPorNombre` opcional

**Files:**
- Modify: `lib/email/usageAlertEmail.ts`
- Modify: `lib/email/resend.ts:51-61` (`sendUsageAlertEmail`)
- Test: `lib/email/__tests__/usageAlertEmail.test.ts`

**Interfaces:**
- Produces: `usageAlertHtml(p: { patente: string; driverNombre: string; tomadoEn: string; entregadoPorNombre?: string }): string` — con `entregadoPorNombre` el copy dice "lo entregó {entregadoPorNombre}, no {driverNombre}"; sin él mantiene el copy actual de force-close ("se volvió a tomar…").
- Produces: `sendUsageAlertEmail(to, p: { patente; driverNombre; tomadoEn; entregadoPorNombre? })` — pasa `p` completo a `usageAlertHtml`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar dentro de `describe('usageAlertHtml', …)` en `lib/email/__tests__/usageAlertEmail.test.ts`:

```ts
  it('con entregadoPorNombre indica que lo entregó otro conductor', () => {
    const html = usageAlertHtml({ patente: 'ABCD12', driverNombre: 'Ana', tomadoEn: '2026-07-03T10:00:00.000Z', entregadoPorNombre: 'Beto' })
    expect(html).toContain('Beto')
    expect(html).toContain('Ana')
    expect(html).not.toContain('se volvió a tomar')
  })
  it('sin entregadoPorNombre mantiene el copy de force-close', () => {
    const html = usageAlertHtml({ patente: 'ABCD12', driverNombre: 'Ana', tomadoEn: '2026-07-03T10:00:00.000Z' })
    expect(html).toContain('se volvió a tomar')
  })
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run lib/email/__tests__/usageAlertEmail.test.ts`
Expected: FAIL — el test "con entregadoPorNombre" falla porque hoy el html siempre contiene "se volvió a tomar" y no menciona a Beto.

- [ ] **Step 3: Implementar el copy ramificado en `usageAlertEmail.ts`**

Reemplazar el cuerpo de `usageAlertHtml` en `lib/email/usageAlertEmail.ts` por:

```ts
export function usageAlertHtml(p: {
  patente: string
  driverNombre: string
  tomadoEn: string
  entregadoPorNombre?: string
}): string {
  const fecha = new Date(p.tomadoEn).toLocaleString('es-CL', { timeZone: 'America/Santiago' })
  const detalle = p.entregadoPorNombre
    ? `<p>El vehículo <strong>${p.patente}</strong> lo entregó <strong>${p.entregadoPorNombre}</strong>, no <strong>${p.driverNombre}</strong>, que era quien lo tenía en uso.</p>`
    : `<p>El vehículo <strong>${p.patente}</strong> se volvió a tomar sin que el uso anterior se cerrara con la entrega.</p>`
  return emailLayout({
    titulo: 'Uso sin entrega formal',
    contenidoHtml: `
      ${detalle}
      <p>Uso anterior: <strong>${p.driverNombre}</strong>, tomado el ${fecha}.</p>
      ${ctaButton('Ver la flota', `${appUrl()}/flota`)}
    `,
    motivo: 'Recibes este correo porque tienes activados los avisos de tu flota en TapCar.',
  })
}
```

(El `import` y `usageAlertSubject` quedan igual.)

- [ ] **Step 4: Propagar el parámetro en `sendUsageAlertEmail`**

En `lib/email/resend.ts`, cambiar la firma de `sendUsageAlertEmail` para aceptar el campo opcional (el `html: usageAlertHtml(p)` ya pasa `p` completo, así que solo cambia el tipo):

```ts
export async function sendUsageAlertEmail(
  to: string,
  p: { patente: string; driverNombre: string; tomadoEn: string; entregadoPorNombre?: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: usageAlertSubject(p.patente),
    html: usageAlertHtml(p),
  })
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/email/__tests__/usageAlertEmail.test.ts`
Expected: PASS (todos, incluidos los 2 nuevos).

- [ ] **Step 6: Typecheck y lint**

Run: `npx tsc --noEmit && npx eslint lib/email/usageAlertEmail.ts lib/email/resend.ts lib/email/__tests__/usageAlertEmail.test.ts`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/email/usageAlertEmail.ts lib/email/resend.ts lib/email/__tests__/usageAlertEmail.test.ts
git commit -m "feat(email): copy de aviso distingue entrega por otro conductor"
```

---

### Task 2: `closeUsage` devuelve `entregaIrregular` y el conductor original

**Files:**
- Modify: `lib/data/usages.ts:76-99` (`closeUsage`)
- Modify: `app/api/v/[token]/entregar/route.ts:37-48` (consumir `.id`, sin nueva conducta)
- Test: `lib/data/__tests__/usages.test.ts`
- Test: `app/api/v/[token]/entregar/__tests__/route.test.ts` (ajustar mock de `closeUsage` para que devuelva objeto)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `closeUsage(...): Promise<{ id: string; entregaIrregular: boolean; driverOriginal: { id: string; nombre: string }; tomadoEn: string }>` — `entregaIrregular = entregadoPor.id !== uso.driverId`; `driverOriginal` = el conductor que había tomado el uso; `tomadoEn` del uso original. Sigue lanzando `'no_open'` si no hay uso abierto.

- [ ] **Step 1: Escribir los tests que fallan (forma del retorno)**

Agregar dentro de `describe('closeUsage', …)` en `lib/data/__tests__/usages.test.ts`:

```ts
  it('marca entregaIrregular cuando entrega otro conductor', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'abierto', companyId: 'c1', driverId: 'd1', driverNombre: 'Ana', tomadoEn: '2026-01-01' }) },
    ] })
    const r = await closeUsage('c1', 'v1', { id: 'd2', nombre: 'Beto' }, { tablero: 'a', cabina: 'b' })
    expect(r).toEqual({ id: 'u1', entregaIrregular: true, driverOriginal: { id: 'd1', nombre: 'Ana' }, tomadoEn: '2026-01-01' })
  })
  it('entregaIrregular es falso cuando entrega el mismo conductor', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'abierto', companyId: 'c1', driverId: 'd1', driverNombre: 'Ana', tomadoEn: '2026-01-01' }) },
    ] })
    const r = await closeUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' })
    expect(r.entregaIrregular).toBe(false)
  })
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run lib/data/__tests__/usages.test.ts`
Expected: FAIL — hoy `closeUsage` devuelve un string, no el objeto; `toEqual({...})` no matchea.

- [ ] **Step 3: Cambiar el retorno de `closeUsage`**

En `lib/data/usages.ts`, cambiar la firma y el `return` de `closeUsage` (el cuerpo del `update` y el `try/catch` de `usoActual` no cambian):

```ts
export async function closeUsage(
  companyId: string,
  vehicleId: string,
  entregadoPor: { id: string; nombre: string },
  fotos: { tablero: string; cabina: string },
  dano?: { hay: boolean; nota?: string; fotoPath?: string },
): Promise<{ id: string; entregaIrregular: boolean; driverOriginal: { id: string; nombre: string }; tomadoEn: string }> {
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
  try {
    await adminDb.collection('vehicles').doc(vehicleId).update({ usoActual: null })
  } catch {
    /* best-effort: la denormalización no debe romper el flujo del conductor */
  }
  return {
    id: open.id,
    entregaIrregular: entregadoPor.id !== open.driverId,
    driverOriginal: { id: open.driverId, nombre: open.driverNombre },
    tomadoEn: open.tomadoEn,
  }
}
```

- [ ] **Step 4: Ajustar la ruta `entregar` para consumir `.id` (sin nueva conducta)**

En `app/api/v/[token]/entregar/route.ts`, reemplazar el bloque `let usageId … catch` por (declarar `cierre` fuera del `try` para que la Task 3 lo use después):

```ts
  let usageId: string
  let cierre: Awaited<ReturnType<typeof closeUsage>>
  try {
    cierre = await closeUsage(vehicle.companyId, vehicle.id, { id: driver.id, nombre: driver.nombre }, { tablero, cabina }, dano)
    usageId = cierre.id
  } catch (e) {
    // `closeUsage` lanza 'no_open' solo cuando no hay uso abierto (409). Cualquier
    // otro error es un fallo real: 500 + log, no lo enmascaramos como 409.
    if (e instanceof Error && e.message === 'no_open') {
      return NextResponse.json({ error: 'Este vehículo no tiene un uso abierto.' }, { status: 409 })
    }
    console.error('[entregar]', e)
    return NextResponse.json({ error: 'No se pudo registrar la entrega. Inténtalo de nuevo.' }, { status: 500 })
  }
```

- [ ] **Step 5: Ajustar el mock de `closeUsage` en el test de la ruta**

En `app/api/v/[token]/entregar/__tests__/route.test.ts`, cambiar las 3 apariciones de `closeUsage.mockResolvedValue('u1')` (una en `beforeEach` línea ~40, dos dentro de tests) para que devuelvan el objeto nuevo:

```ts
closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: false, driverOriginal: { id: 'd1', nombre: 'Ana' }, tomadoEn: '2026-01-01' })
```

(El resto de asserts de ese archivo no cambian: `analyzeUsage` sigue recibiendo `'u1'` porque `usageId = cierre.id`.)

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/data/__tests__/usages.test.ts lib/data/__tests__/usages-flota.test.ts "app/api/v/[token]/entregar/__tests__/route.test.ts"`
Expected: PASS (los nuevos de forma del retorno + los existentes que no cambiaron de conducta).

- [ ] **Step 7: Typecheck y lint**

Run: `npx tsc --noEmit && npx eslint lib/data/usages.ts "app/api/v/[token]/entregar/route.ts"`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add lib/data/usages.ts "app/api/v/[token]/entregar/route.ts" lib/data/__tests__/usages.test.ts "app/api/v/[token]/entregar/__tests__/route.test.ts"
git commit -m "refactor(usages): closeUsage informa entrega irregular y conductor original"
```

---

### Task 3: La ruta `entregar` actúa sobre la entrega irregular

**Files:**
- Modify: `app/api/v/[token]/entregar/route.ts` (imports + bloque nuevo)
- Test: `app/api/v/[token]/entregar/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `cierre.entregaIrregular`, `cierre.driverOriginal`, `cierre.tomadoEn` (Task 2); `sendUsageAlertEmail(to, { …, entregadoPorNombre })` (Task 1); `getCompany`, `alertRecipientEmails`, `createAlerta`, `incrementDriverStats` (existentes).
- Produces: nada nuevo (efecto final de la feature).

- [ ] **Step 1: Escribir los tests que fallan**

En `app/api/v/[token]/entregar/__tests__/route.test.ts`:

(a) Agregar mocks arriba (junto a los otros `vi.mock`), y un handle para el email:

```ts
const sendUsageAlertEmail = vi.fn()
vi.mock('@/lib/email/resend', () => ({ sendUsageAlertEmail: (...a: unknown[]) => sendUsageAlertEmail(...a) }))
vi.mock('@/lib/data/companies', () => ({ getCompany: () => Promise.resolve({ ownerUid: 'o1' }) }))
vi.mock('@/lib/data/members', () => ({ alertRecipientEmails: () => Promise.resolve(['o@b.cl']) }))
```

(b) En `beforeEach`, agregar `sendUsageAlertEmail.mockReset()` y darle patente al vehículo:

```ts
getVehicleByToken.mockResolvedValue({ id: 'v1', companyId: 'c1', patente: 'ABCD12' })
```

(c) Agregar dos tests dentro de `describe('POST entregar', …)`:

```ts
  it('entrega irregular: alerta sin_entrega al conductor original + email + contador', async () => {
    closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: true, driverOriginal: { id: 'dViejo', nombre: 'Beto' }, tomadoEn: '2026-01-01' })
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(createAlerta).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'sin_entrega', usageId: 'u1', driverNombre: 'Beto', companyId: 'c1', vehicleId: 'v1' }))
    expect(incrementDriverStats).toHaveBeenCalledWith('dViejo', 'sinEntrega')
    expect(sendUsageAlertEmail).toHaveBeenCalledWith('o@b.cl', expect.objectContaining({ patente: 'ABCD12', driverNombre: 'Beto', entregadoPorNombre: 'Ana' }))
  })
  it('entrega normal (mismo conductor): no crea alerta sin_entrega ni suma sinEntrega', async () => {
    closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: false, driverOriginal: { id: 'd1', nombre: 'Ana' }, tomadoEn: '2026-01-01' })
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(createAlerta).not.toHaveBeenCalled()
    expect(incrementDriverStats).not.toHaveBeenCalledWith('d1', 'sinEntrega')
    expect(sendUsageAlertEmail).not.toHaveBeenCalled()
  })
```

Nota: en el primer test, `driver` (getDriver) es Ana → `entregadoPorNombre: 'Ana'`; el original es Beto.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run "app/api/v/[token]/entregar/__tests__/route.test.ts"`
Expected: FAIL — `createAlerta`/`incrementDriverStats`/`sendUsageAlertEmail` no se llaman todavía en el caso irregular.

- [ ] **Step 3: Agregar los imports en la ruta**

En `app/api/v/[token]/entregar/route.ts`, agregar junto a los imports existentes:

```ts
import { getCompany } from '@/lib/data/companies'
import { alertRecipientEmails } from '@/lib/data/members'
import { sendUsageAlertEmail } from '@/lib/email/resend'
```

- [ ] **Step 4: Agregar el bloque de entrega irregular**

En `app/api/v/[token]/entregar/route.ts`, después del bloque de daño (`if (dano?.hay) { … }`) y **antes** de `after(() => analyzeUsage(usageId))`, insertar:

```ts
  // Entrega irregular: quien entrega no es quien tomó el vehículo → el conductor
  // original nunca cerró su propio uso. Simétrico con el force-close de `tomar`.
  // Un uso se cierra por un solo camino (esta entrega o el force-close), así que
  // `sinEntrega` suma como máximo una vez por uso.
  if (cierre.entregaIrregular) {
    try {
      await createAlerta({
        companyId: vehicle.companyId,
        vehicleId: vehicle.id,
        patente: vehicle.patente,
        usageId: cierre.id,
        tipo: 'sin_entrega',
        driverNombre: cierre.driverOriginal.nombre,
        nota: `Lo entregó ${driver.nombre} en su lugar.`,
      })
    } catch {
      /* best-effort */
    }
    try {
      const company = await getCompany(vehicle.companyId)
      const emails = company ? await alertRecipientEmails(vehicle.companyId, company.ownerUid) : []
      for (const to of emails) {
        await sendUsageAlertEmail(to, {
          patente: vehicle.patente,
          driverNombre: cierre.driverOriginal.nombre,
          tomadoEn: cierre.tomadoEn,
          entregadoPorNombre: driver.nombre,
        })
      }
    } catch {
      /* best-effort */
    }
    try { await incrementDriverStats(cierre.driverOriginal.id, 'sinEntrega') } catch { /* best-effort */ }
  }
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run "app/api/v/[token]/entregar/__tests__/route.test.ts"`
Expected: PASS (los 2 nuevos + los existentes).

- [ ] **Step 6: Typecheck, lint y build**

Run: `npx tsc --noEmit && npx eslint "app/api/v/[token]/entregar/route.ts" "app/api/v/[token]/entregar/__tests__/route.test.ts" && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 7: Suite completa de uso/email para no romper nada**

Run: `npx vitest run lib/email lib/data/__tests__/usages.test.ts "app/api/v/[token]"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/api/v/[token]/entregar/route.ts" "app/api/v/[token]/entregar/__tests__/route.test.ts"
git commit -m "feat(usos): detectar entrega irregular (alerta + email + contador al conductor original)"
```

---

## Notas de cierre (tras las 3 tasks)

- Actualizar `CLAUDE.md`: en la línea de `usages.ts`/bitácora, dejar constancia de que `closeUsage` devuelve `{ id, entregaIrregular, driverOriginal, tomadoEn }` y que la entrega por otro conductor genera `sin_entrega` (además del force-close). Mencionar que `sendUsageAlertEmail`/`usageAlertHtml` aceptan `entregadoPorNombre?`.
- Este plan **no** cubre la brecha 2 (uso abandonado que nadie retoma, detección por tiempo) — queda fuera de alcance por decisión del spec.
