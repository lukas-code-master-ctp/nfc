# Plan, precio y prueba — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una cuenta nueva elija periodicidad (mensual/anual) y cantidad de vehículos al crearse, vea el cargo calculado, y quede con una prueba de 30 días con fecha — reemplazando el cupo fijo de 3 que hoy está clavado en el código.

**Architecture:** Toda la lógica de precio y de estado de la prueba es pura y vive en `lib/billing.ts` y `lib/plan/prueba.ts`, sin Firebase. El marcador que decide quién ve la pantalla obligatoria es `plan.periodicidad === null` (explícito) contra el campo **ausente** en las cuentas anteriores. Las escrituras del plan van por una función nueva `savePlan`, porque `saveCompany` reconstruye el mapa `plan` desde cero.

**Tech Stack:** Next.js 16 (App Router, TypeScript estricto), Firestore vía Admin SDK, Tailwind v4 con tokens de `app/globals.css`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-01-plan-precio-prueba-design.md`

## Global Constraints

- Todo el código, UI, comentarios y mensajes en **español neutro (Chile)**, tratando de "tú".
- Precios exactos: **$2.990** por vehículo/mes (mensual) y **$1.944** por vehículo/mes facturado anual → **$23.328** por vehículo/año. Tope de self-service: **30** vehículos. Prueba: **30** días. Umbral "por terminar": **7** días.
- `gratisHasta` es una **fecha calendario `YYYY-MM-DD`**, nunca un timestamp ISO completo.
- **`DEFAULT_PLAN` no puede ganar una clave `periodicidad`.** `getCompany` hace `{ ...DEFAULT_PLAN, ...(d.plan ?? {}) }`; si el default trajera la clave, toda cuenta anterior leería un valor y el marcador de "ausente" dejaría de existir.
- **Firestore Admin rechaza `undefined`.** Nunca escribir una clave con `undefined`: omitirla o usar `null`.
- Next 16: `params` y `cookies()` son `Promise` (hay que `await`).
- Los endpoints privados llaman `getMembership()` y validan `can(role, action)`; nunca confían en el cliente.
- Antes de cada commit: `npx tsc --noEmit`, `npm test`, `npx eslint app components lib`.
- Se trabaja **directo en `master`**, sin PR. No hacer `git push` — lo aprueba el humano al final.

---

### Task 1: Precios, periodicidad y `cargoDe`

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/billing.ts`
- Modify: `app/(app)/facturacion/page.tsx`
- Modify: `app/(app)/admin/page.tsx:19`
- Modify: `components/billing/BillingRequestForm.tsx`
- Test: `lib/__tests__/billing.test.ts`

**Interfaces:**
- Produces: `Periodicidad`, `PlanData` extendido, `cargoDe`, `ahorroAnual`, `MAX_VEHICULOS_SELF_SERVICE`, `PRICE_PER_VEHICLE_ANUAL_MES`, `MESES_ANUAL`. Elimina `monthlyTotal`.

- [ ] **Step 1: Extender los tipos**

En `lib/types.ts`, justo antes de `export interface PlanData` (hoy alrededor de la línea 162):

```ts
export type Periodicidad = 'mensual' | 'anual'
```

Y reemplaza `PlanData` completo por:

```ts
export interface PlanData {
  /** Máximo de vehículos permitidos por el plan. Mínimo 1. */
  maxVehiculos: number
  /**
   * `null` = cuenta nueva que todavía no eligió (dispara /plan).
   * Ausente = cuenta anterior al selector: NO se le fuerza la pantalla.
   * Esa distinción es lo que hace que la puerta no dependa de que el script
   * de backfill haya corrido antes que el deploy.
   */
  periodicidad?: Periodicidad | null
  /** `YYYY-MM-DD`: hasta cuándo esta cuenta no se cobra. */
  gratisHasta?: string | null
}
```

`DEFAULT_PLAN` se queda **exactamente** como está (`{ maxVehiculos: 3 }`). No le agregues claves.

- [ ] **Step 2: Escribir los tests que fallan**

Crea `lib/__tests__/billing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  cargoDe,
  ahorroAnual,
  PRICE_PER_VEHICLE,
  PRICE_PER_VEHICLE_ANUAL_MES,
  MAX_VEHICULOS_SELF_SERVICE,
} from '@/lib/billing'
import { DEFAULT_PLAN } from '@/lib/types'

describe('cargoDe', () => {
  it('cobra el mensual por mes', () => {
    expect(cargoDe({ vehiculos: 10, periodicidad: 'mensual' })).toEqual({
      monto: 29900,
      porVehiculo: 2990,
      unidad: 'mes',
    })
  })

  it('cobra el anual una vez al año', () => {
    expect(cargoDe({ vehiculos: 10, periodicidad: 'anual' })).toEqual({
      monto: 233280,
      porVehiculo: 23328,
      unidad: 'año',
    })
  })

  it('sanea la cantidad: nunca negativa, siempre entera', () => {
    expect(cargoDe({ vehiculos: -5, periodicidad: 'mensual' }).monto).toBe(0)
    expect(cargoDe({ vehiculos: 2.7, periodicidad: 'mensual' }).monto).toBe(5980)
  })
})

describe('ahorroAnual', () => {
  // Este es el test que avisa si alguien cambia un precio en un solo lado:
  // $125.520 es el ahorro que promete tapcar.cl/planes para 10 vehículos.
  it('coincide con el número publicado en la web', () => {
    expect(ahorroAnual(10)).toBe(125520)
  })

  it('es cero sin vehículos', () => {
    expect(ahorroAnual(0)).toBe(0)
  })
})

describe('constantes', () => {
  it('el anual es 35% más barato que el mensual', () => {
    expect(Math.round((1 - PRICE_PER_VEHICLE_ANUAL_MES / PRICE_PER_VEHICLE) * 100)).toBe(35)
  })

  it('el tope de self-service es 30', () => {
    expect(MAX_VEHICULOS_SELF_SERVICE).toBe(30)
  })

  // DEFAULT_PLAN con una clave `periodicidad` rompería el marcador de
  // "ausente" para todas las cuentas anteriores al selector.
  it('DEFAULT_PLAN no trae periodicidad', () => {
    expect('periodicidad' in DEFAULT_PLAN).toBe(false)
  })
})
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

```bash
npx vitest run lib/__tests__/billing.test.ts
```

Esperado: FAIL — `cargoDe` no existe.

- [ ] **Step 4: Implementar en `lib/billing.ts`**

Reemplaza el archivo completo por:

```ts
// Lógica de facturación (pura, sin Firebase). Modelo: suscripción por
// vehículo, mensual o anual. El tag NFC va incluido en planes de 5+ (pagas
// solo el envío); bajo ese umbral, cada tag cuesta TAG_PRICE + envío.
import type { Periodicidad } from '@/lib/types'

export const PRICE_PER_VEHICLE = 2990 // CLP / vehículo / mes
/** El plan anual, expresado por mes para poder mostrarlo comparable. */
export const PRICE_PER_VEHICLE_ANUAL_MES = 1944 // −35% sobre el mensual
export const MESES_ANUAL = 12
export const FREE_TAG_THRESHOLD = 5 // planes de 5+ vehículos → tag incluido
export const TAG_PRICE = 1000 // CLP por tag cuando el plan es < umbral
/** Sobre este tope el alta no aplica cupo sola: deriva a Facturación. */
export const MAX_VEHICULOS_SELF_SERVICE = 30

export interface Cargo {
  /** Lo que se cobra en un ciclo. */
  monto: number
  /** Valor unitario en la unidad del ciclo. */
  porVehiculo: number
  unidad: 'mes' | 'año'
}

function sanear(vehiculos: number): number {
  return Math.max(0, Math.floor(vehiculos))
}

export function cargoDe({
  vehiculos,
  periodicidad,
}: {
  vehiculos: number
  periodicidad: Periodicidad
}): Cargo {
  const v = sanear(vehiculos)
  const porVehiculo =
    periodicidad === 'anual' ? PRICE_PER_VEHICLE_ANUAL_MES * MESES_ANUAL : PRICE_PER_VEHICLE
  return {
    monto: v * porVehiculo,
    porVehiculo,
    unidad: periodicidad === 'anual' ? 'año' : 'mes',
  }
}

/** Cuánto se ahorra al año pagando anual en vez de mensual. */
export function ahorroAnual(vehiculos: number): number {
  return sanear(vehiculos) * (PRICE_PER_VEHICLE - PRICE_PER_VEHICLE_ANUAL_MES) * MESES_ANUAL
}

export function tagIncluded(vehiculos: number): boolean {
  return Math.floor(vehiculos) >= FREE_TAG_THRESHOLD
}

export function formatCLP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CL')
}
```

Fíjate que `monthlyTotal` **ya no existe**: tener dos formas de calcular el mismo precio es cómo se llega a que la app cobre un número y el panel muestre otro.

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
npx vitest run lib/__tests__/billing.test.ts
```

Esperado: PASS (10 tests).

- [ ] **Step 6: Migrar los tres llamadores de `monthlyTotal`**

En `app/(app)/admin/page.tsx`, cambia el import de la línea 5 y la línea 19:

```ts
import { PRICE_PER_VEHICLE, cargoDe, formatCLP } from '@/lib/billing'
```

```ts
  // Estimación a tarifa mensual: el panel no distingue periodicidad por empresa.
  const recaudacion = cargoDe({ vehiculos: totalVehiculos, periodicidad: 'mensual' }).monto
```

En `app/(app)/facturacion/page.tsx`, cambia el import (líneas 7-14) y el cálculo (línea 30):

```ts
import {
  PRICE_PER_VEHICLE,
  TAG_PRICE,
  FREE_TAG_THRESHOLD,
  cargoDe,
  tagIncluded,
  formatCLP,
} from '@/lib/billing'
```

```ts
  const periodicidad = company?.plan?.periodicidad ?? 'mensual'
  const cargo = cargoDe({ vehiculos: cupo, periodicidad })
```

Y en el JSX, reemplaza `{formatCLP(total)}` por `{formatCLP(cargo.monto)}`, `/ mes` por `/ {cargo.unidad}` y la fila "Valor por vehículo" por:

```tsx
          <div className="flex justify-between gap-4">
            <dt className="text-acero">Valor por vehículo</dt>
            <dd className="font-medium text-tinta tabular-nums">
              {formatCLP(cargo.porVehiculo)} / {cargo.unidad}
            </dd>
          </div>
```

Pasa la periodicidad al formulario: `<BillingRequestForm currentCupo={cupo} periodicidad={periodicidad} />`.

En `components/billing/BillingRequestForm.tsx`, cambia el import de la línea 3, la firma de la línea 5 y la línea 69:

```ts
import { cargoDe, formatCLP } from '@/lib/billing'
import type { Periodicidad } from '@/lib/types'
```

```ts
export default function BillingRequestForm({
  currentCupo,
  periodicidad,
}: {
  currentCupo: number
  periodicidad: Periodicidad
}) {
```

```tsx
            <span className="text-sm text-acero">
              × {formatCLP(cargoDe({ vehiculos: 1, periodicidad }).porVehiculo)} ={' '}
              <span className="font-semibold text-tinta">
                {invalid
                  ? '—'
                  : `${formatCLP(cargoDe({ vehiculos: n, periodicidad }).monto)} / ${
                      periodicidad === 'anual' ? 'año' : 'mes'
                    }`}
              </span>
            </span>
```

Borra el import ya inservible de `PRICE_PER_VEHICLE` en ese archivo si queda sin uso.

- [ ] **Step 7: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib
```

Esperado: sin errores; `monthlyTotal` no aparece en ningún archivo (`grep -r monthlyTotal app components lib` sin resultados).

```bash
git add lib/types.ts lib/billing.ts lib/__tests__/billing.test.ts app/\(app\)/admin/page.tsx app/\(app\)/facturacion/page.tsx components/billing/BillingRequestForm.tsx
git commit -m "feat(plan): periodicidad mensual/anual y calculo de cargo"
```

---

### Task 2: Estado de la prueba y la puerta

**Files:**
- Modify: `lib/documents/status.ts`
- Create: `lib/plan/prueba.ts`
- Modify: `lib/plan.ts`
- Test: `lib/plan/__tests__/prueba.test.ts`

**Interfaces:**
- Consumes: `PlanData` con `periodicidad`/`gratisHasta` (Task 1).
- Produces: `hoyEnChile(now)`, `addDias(fechaISO, dias)`, `estadoPrueba(gratisHasta, ahora)`, `EstadoPrueba`, `DIAS_PRUEBA`, `UMBRAL_POR_TERMINAR`, `debeElegirPlan(plan)`.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `lib/plan/__tests__/prueba.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { estadoPrueba, addDias, DIAS_PRUEBA, UMBRAL_POR_TERMINAR } from '@/lib/plan/prueba'
import { hoyEnChile } from '@/lib/documents/status'
import { debeElegirPlan } from '@/lib/plan'

// 2026-08-01 12:00 UTC = 2026-08-01 en Chile.
const AHORA = new Date('2026-08-01T12:00:00Z')

describe('estadoPrueba', () => {
  it('sin fecha no hay prueba que mostrar', () => {
    expect(estadoPrueba(undefined, AHORA)).toEqual({ estado: 'sin_prueba', diasRestantes: null })
    expect(estadoPrueba(null, AHORA)).toEqual({ estado: 'sin_prueba', diasRestantes: null })
  })

  it('lejos del final está activa', () => {
    expect(estadoPrueba('2026-08-20', AHORA)).toEqual({ estado: 'activa', diasRestantes: 19 })
  })

  it('en el borde de 8 días todavía está activa', () => {
    expect(estadoPrueba('2026-08-09', AHORA).estado).toBe('activa')
  })

  it('en el borde de 7 días pasa a por terminar', () => {
    expect(estadoPrueba('2026-08-08', AHORA).estado).toBe('por_terminar')
  })

  it('el último día sigue siendo por terminar, no vencida', () => {
    expect(estadoPrueba('2026-08-01', AHORA)).toEqual({ estado: 'por_terminar', diasRestantes: 0 })
  })

  it('ayer ya está vencida', () => {
    expect(estadoPrueba('2026-07-31', AHORA)).toEqual({ estado: 'vencida', diasRestantes: -1 })
  })
})

describe('addDias', () => {
  it('cruza el fin de mes', () => {
    expect(addDias('2026-08-01', 30)).toBe('2026-08-31')
    expect(addDias('2026-08-15', 30)).toBe('2026-09-14')
  })

  it('cruza el fin de año', () => {
    expect(addDias('2026-12-20', 30)).toBe('2027-01-19')
  })

  it('respeta los años bisiestos', () => {
    expect(addDias('2028-02-01', 30)).toBe('2028-03-02')
  })
})

describe('hoyEnChile', () => {
  it('devuelve YYYY-MM-DD', () => {
    expect(hoyEnChile(AHORA)).toBe('2026-08-01')
  })

  // Chile va detrás de UTC: a las 02:00 UTC allá todavía es el día anterior.
  it('usa la zona de Chile y no UTC', () => {
    expect(hoyEnChile(new Date('2026-08-02T02:00:00Z'))).toBe('2026-08-01')
  })
})

describe('debeElegirPlan', () => {
  it('null explícito manda a la pantalla', () => {
    expect(debeElegirPlan({ maxVehiculos: 3, periodicidad: null })).toBe(true)
  })

  // El caso que protege a las cuentas que ya existían: campo ausente.
  it('el campo ausente NO manda a la pantalla', () => {
    expect(debeElegirPlan({ maxVehiculos: 3 })).toBe(false)
  })

  it('quien ya eligió no vuelve', () => {
    expect(debeElegirPlan({ maxVehiculos: 3, periodicidad: 'mensual' })).toBe(false)
  })

  it('sin plan tampoco', () => {
    expect(debeElegirPlan(undefined)).toBe(false)
  })
})

describe('constantes', () => {
  it('la prueba dura 30 días y avisa a los 7', () => {
    expect(DIAS_PRUEBA).toBe(30)
    expect(UMBRAL_POR_TERMINAR).toBe(7)
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run lib/plan/__tests__/prueba.test.ts
```

Esperado: FAIL — no existe `lib/plan/prueba.ts`.

- [ ] **Step 3: Exportar `hoyEnChile`**

En `lib/documents/status.ts`, justo después de `chileDateParts` (línea 16), agrega:

```ts
/**
 * La fecha de hoy en Chile, como `YYYY-MM-DD`.
 *
 * Vive acá y no en el módulo de planes a propósito: la zona horaria de Chile
 * tiene que tener un solo dueño en el proyecto. Duplicar el
 * `Intl.DateTimeFormat` es exactamente cómo se llega a que dos partes de la
 * app no coincidan en qué día es.
 */
export function hoyEnChile(now: Date): string {
  const { y, m, day } = chileDateParts(now)
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
```

- [ ] **Step 4: Crear `lib/plan/prueba.ts`**

```ts
// Estado del período de prueba (puro, sin Firebase). La fecha de término vive
// en `plan.gratisHasta` como fecha calendario `YYYY-MM-DD`, así que reusa el
// `daysUntil` de documentos y hereda la zona horaria de Chile ya resuelta.
import { daysUntil } from '@/lib/documents/status'

export type EstadoPrueba = 'sin_prueba' | 'activa' | 'por_terminar' | 'vencida'

export const DIAS_PRUEBA = 30
// El mismo hito que ya usan los recordatorios de documentos: dos umbrales
// distintos para "se te acaba el tiempo" en la misma app sería incoherencia.
export const UMBRAL_POR_TERMINAR = 7

/** `YYYY-MM-DD` + días, sobre fecha calendario. */
export function addDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(t.getUTCDate()).padStart(2, '0')
  return `${t.getUTCFullYear()}-${mm}-${dd}`
}

export function estadoPrueba(
  gratisHasta: string | null | undefined,
  ahora: Date,
): { estado: EstadoPrueba; diasRestantes: number | null } {
  const dias = daysUntil(gratisHasta ?? null, ahora)
  // Sin fecha no se muestra nada. Es lo que ve una cuenta anterior a la que
  // todavía no le corrió el backfill: falla en silencio, no con una franja
  // mintiendo sobre un plazo que nadie fijó.
  if (dias === null) return { estado: 'sin_prueba', diasRestantes: null }
  if (dias < 0) return { estado: 'vencida', diasRestantes: dias }
  if (dias <= UMBRAL_POR_TERMINAR) return { estado: 'por_terminar', diasRestantes: dias }
  return { estado: 'activa', diasRestantes: dias }
}
```

- [ ] **Step 5: Agregar `debeElegirPlan`**

Al final de `lib/plan.ts`:

```ts
/**
 * ¿Esta empresa tiene que pasar por la pantalla de elección de plan?
 *
 * Solo con `periodicidad === null` explícito, que es lo que siembra
 * `createCompany`. El campo **ausente** es una cuenta anterior al selector y
 * NO se le fuerza ninguna pantalla: por eso la comparación es estricta contra
 * `null` y no un chequeo de falsy.
 */
export function debeElegirPlan(plan: PlanData | undefined): boolean {
  return plan?.periodicidad === null
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

```bash
npx vitest run lib/plan/__tests__/prueba.test.ts
```

Esperado: PASS (16 tests).

- [ ] **Step 7: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib
git add lib/documents/status.ts lib/plan/prueba.ts lib/plan.ts lib/plan/__tests__/prueba.test.ts
git commit -m "feat(plan): estado del periodo de prueba y puerta de eleccion"
```

---

### Task 3: Capa de datos — `savePlan` y la siembra de `periodicidad: null`

**Files:**
- Modify: `lib/data/companies.ts`
- Test: `lib/data/__tests__/companies-plan.test.ts`

**Interfaces:**
- Consumes: `PlanData` (Task 1), `debeElegirPlan` (Task 2).
- Produces: `savePlan(companyId, patch: Partial<PlanData>): Promise<void>`.

**Patrón de test:** sigue `lib/data/__tests__/companies-provision.test.ts`, que ya mockea `@/lib/firebase/admin`. Recuerda el gotcha de Vitest 4: los mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(() => ({...}))`.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `lib/data/__tests__/companies-plan.test.ts`. Toma el andamiaje del mock de `companies-provision.test.ts` y cubre exactamente estos casos:

```ts
// 1. createCompany siembra `periodicidad: null` explícito.
//    expect(add).toHaveBeenCalledWith(objectContaining({
//      plan: { maxVehiculos: 3, periodicidad: null },
//    }))

// 2. getCompany conserva `periodicidad: null` cuando el doc la trae.
//    doc.data() -> { plan: { maxVehiculos: 5, periodicidad: null } }
//    expect(company.plan.periodicidad).toBeNull()

// 3. getCompany deja `periodicidad` AUSENTE cuando el doc no la trae.
//    Es la invariante que protege a las cuentas anteriores: si el spread de
//    DEFAULT_PLAN inyectara la clave, todas irían a la pantalla obligatoria.
//    doc.data() -> { plan: { maxVehiculos: 5 } }
//    expect('periodicidad' in company.plan).toBe(false)
//    expect(debeElegirPlan(company.plan)).toBe(false)

// 4. savePlan con un solo campo escribe solo ese campo bajo `plan`.
//    savePlan('c1', { periodicidad: 'anual' })
//    expect(set).toHaveBeenCalledWith({ plan: { periodicidad: 'anual' } }, { merge: true })

// 5. savePlan aplica el mínimo de 1 a maxVehiculos.
//    savePlan('c1', { maxVehiculos: 0 }) -> plan.maxVehiculos === 1

// 6. savePlan con un patch vacío no escribe nada.
//    expect(set).not.toHaveBeenCalled()

// 7. savePlan nunca manda `undefined` a Firestore (Admin lo rechaza).
//    savePlan('c1', { periodicidad: undefined, gratisHasta: '2026-09-01' })
//    -> el objeto escrito no tiene la clave `periodicidad`
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run lib/data/__tests__/companies-plan.test.ts
```

Esperado: FAIL — `savePlan` no existe y `createCompany` no siembra `periodicidad`.

- [ ] **Step 3: Sembrar `periodicidad: null` en `createCompany`**

En `lib/data/companies.ts`, línea 32, cambia:

```ts
    plan: { maxVehiculos: Math.max(1, Math.floor(data.plan.maxVehiculos)) },
```

por:

```ts
    // `periodicidad: null` explícito (y no ausente) es el marcador de "cuenta
    // nueva que todavía no eligió". Lo lee `debeElegirPlan` para mandarla a
    // /plan. Las cuentas anteriores al selector tienen el campo ausente y por
    // eso nunca se topan con esa pantalla.
    plan: { maxVehiculos: Math.max(1, Math.floor(data.plan.maxVehiculos)), periodicidad: null },
```

- [ ] **Step 4: Agregar `savePlan` y comentar `saveCompany`**

Justo antes de `saveCompany` (línea 38), reemplaza el comentario existente por:

```ts
// Solo un Administrador de la empresa llama esto (validado en la capa /api).
//
// OJO: la rama de `plan` reconstruye el mapa desde cero y descarta cualquier
// otro campo. Es deliberado y estrecho — su único llamador de `plan` es el
// panel admin, que solo cambia el cupo. Para escribir periodicidad o la fecha
// de la prueba usa `savePlan`, no esto.
```

Y justo después del cierre de `saveCompany` (línea 50), agrega:

```ts
/**
 * Escribe campos sueltos del plan sin pisar los demás.
 *
 * Firestore hace merge recursivo de mapas anidados con `{ merge: true }`, así
 * que escribir `{ plan: { periodicidad: 'anual' } }` conserva `maxVehiculos`
 * y `gratisHasta`. Por lo mismo, el PATCH del panel admin sigue siendo seguro:
 * cambiar el cupo no borra la periodicidad ni la fecha.
 */
export async function savePlan(companyId: string, patch: Partial<PlanData>): Promise<void> {
  const plan: Record<string, unknown> = {}
  if (patch.maxVehiculos !== undefined) plan.maxVehiculos = Math.max(1, Math.floor(patch.maxVehiculos))
  // `!== undefined` y no truthy: `periodicidad: null` y `gratisHasta: null`
  // son valores legítimos que hay que poder escribir.
  if (patch.periodicidad !== undefined) plan.periodicidad = patch.periodicidad
  if (patch.gratisHasta !== undefined) plan.gratisHasta = patch.gratisHasta
  if (Object.keys(plan).length === 0) return
  await adminDb.collection(COL).doc(companyId).set({ plan }, { merge: true })
}
```

`getCompany` **no se toca**: el spread `{ ...DEFAULT_PLAN, ...(d.plan ?? {}) }` ya conserva la distinción, porque `DEFAULT_PLAN` no tiene la clave.

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
npx vitest run lib/data/__tests__/companies-plan.test.ts
```

Esperado: PASS (7 tests).

- [ ] **Step 6: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib
git add lib/data/companies.ts lib/data/__tests__/companies-plan.test.ts
git commit -m "feat(plan): savePlan y siembra del marcador de eleccion"
```

---

### Task 4: `POST /api/plan`

**Files:**
- Create: `app/api/plan/route.ts`
- Test: `app/api/__tests__/plan-endpoint.test.ts`

**Files (adicionales):**
- Modify: `lib/email/resend.ts` (exportar `billingNotifyEmail`)
- Modify: `app/api/billing/request/route.ts:9-14` (usar el `billingNotifyEmail` compartido)

**Interfaces:**
- Consumes: `savePlan` (Task 3), `cargoDe`/`MAX_VEHICULOS_SELF_SERVICE` (Task 1), `addDias`/`DIAS_PRUEBA` (Task 2), `hoyEnChile` (Task 2).
- Firmas reales que hay que respetar (ya existen, **no** las cambies):
  - `createBillingRequest({ uid, email, companyId, razonSocial, currentCupo, desiredVehicles, message })` — `lib/data/billing.ts`
  - `sendBillingRequestEmail(to, { fromEmail, razonSocial, currentCupo, desiredVehicles, message })` — `lib/email/resend.ts`
- Produces: `POST /api/plan` con cuerpo `{ periodicidad, maxVehiculos }`; `billingNotifyEmail()` exportada.

**Patrón de test:** sigue `app/api/__tests__/onboarding-endpoint.test.ts` para mockear `getMembership` y la capa de datos.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `app/api/__tests__/plan-endpoint.test.ts` con estos casos:

```ts
// 1. Sin sesión -> 401, y savePlan NO se llamó.
// 2. Rol 'viewer' -> 403. Rol 'editor' -> 403. (Contratar es de Administrador.)
// 3. periodicidad 'semanal' -> 400.
// 4. maxVehiculos 0 -> 400. maxVehiculos 31 -> 400. maxVehiculos 'tres' -> 400.
//    El tope se comprueba EN EL SERVIDOR: el cliente no decide cuánto cupo se regala.
// 5. La empresa ya tiene periodicidad 'mensual' -> 409, y savePlan NO se llamó.
//    Sin esto, alguien reiniciaría su prueba llamando el endpoint de nuevo.
// 6. Camino feliz: savePlan llamado con
//    { periodicidad: 'anual', maxVehiculos: 8, gratisHasta: <hoy + 30 días> }
//    y createBillingRequest llamado.
// 7. El correo lanza -> la respuesta sigue siendo 200 y el plan quedó guardado.
```

Para el caso 6, congela el reloj con `vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))` y espera `gratisHasta: '2026-08-31'`.

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run app/api/__tests__/plan-endpoint.test.ts
```

Esperado: FAIL — la ruta no existe.

- [ ] **Step 3: Sacar `billingNotifyEmail` a un solo lugar**

Hoy vive privada en `app/api/billing/request/route.ts:9-14` y la ruta nueva la necesita igual. Duplicarla significa que un día `BILLING_EMAIL` va a estar bien resuelto en un endpoint y mal en el otro. Muévela **tal cual** al final de `lib/email/resend.ts`, exportada:

```ts
/** A quién le llegan las solicitudes de plan. `BILLING_EMAIL`, o el primer `ADMIN_EMAILS`. */
export function billingNotifyEmail(): string | null {
  const explicit = process.env.BILLING_EMAIL?.trim()
  if (explicit) return explicit
  const firstAdmin = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim()
  return firstAdmin || null
}
```

Y en `app/api/billing/request/route.ts` borra la función local y agrégala al import que ya trae `sendBillingRequestEmail`.

- [ ] **Step 4: Implementar `app/api/plan/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany, savePlan } from '@/lib/data/companies'
import { createBillingRequest } from '@/lib/data/billing'
import { sendBillingRequestEmail, billingNotifyEmail } from '@/lib/email/resend'
import { MAX_VEHICULOS_SELF_SERVICE, cargoDe } from '@/lib/billing'
import { addDias, DIAS_PRUEBA } from '@/lib/plan/prueba'
import { hoyEnChile } from '@/lib/documents/status'
import type { Periodicidad } from '@/lib/types'

export const dynamic = 'force-dynamic'
// El `after()` del correo corre después de responder pero sigue contando
// contra el límite de ejecución, igual que en tomar/entregar.
export const maxDuration = 30

const PERIODICIDADES: Periodicidad[] = ['mensual', 'anual']

/**
 * El alta del plan: la empresa elige periodicidad y cantidad, y queda con una
 * prueba de 30 días con fecha.
 *
 * Es el punto exacto que reemplaza la pasarela cuando exista: hoy registra una
 * solicitud de facturación y estampa `gratisHasta`; mañana redirige al
 * checkout y `gratisHasta` pasa a ser la fecha del primer cobro.
 */
export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Contratar cambia lo que la empresa paga: solo el Administrador.
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const { periodicidad, maxVehiculos } = body as Record<string, unknown>

  if (typeof periodicidad !== 'string' || !PERIODICIDADES.includes(periodicidad as Periodicidad)) {
    return NextResponse.json({ error: 'periodicidad inválida' }, { status: 400 })
  }
  const n = Number(maxVehiculos)
  // El tope se comprueba acá y no solo en el formulario: el cliente no decide
  // cuánto cupo se regala durante la prueba.
  if (!Number.isFinite(n) || n < 1 || n > MAX_VEHICULOS_SELF_SERVICE) {
    return NextResponse.json({ error: 'cantidad inválida' }, { status: 400 })
  }
  const vehiculos = Math.floor(n)

  // Este endpoint es el alta, no el cambio de plan. Sin esta comprobación
  // alguien reiniciaría su prueba llamándolo de nuevo.
  const company = await getCompany(m.companyId)
  if (company?.plan?.periodicidad) {
    return NextResponse.json({ error: 'plan_ya_elegido' }, { status: 409 })
  }

  const gratisHasta = addDias(hoyEnChile(new Date()), DIAS_PRUEBA)
  await savePlan(m.companyId, { periodicidad: periodicidad as Periodicidad, maxVehiculos: vehiculos, gratisHasta })

  // Best-effort: que el correo falle no puede dejar a la empresa sin plan. El
  // try/catch va ALREDEDOR de after(), no solo dentro del callback: si after()
  // mismo lanzara, se llevaría puesta la respuesta.
  try {
    const cargo = cargoDe({ vehiculos, periodicidad: periodicidad as Periodicidad })
    const razonSocial = company?.company.razonSocial ?? ''
    const message = `Alta ${periodicidad}: ${cargo.monto} CLP / ${cargo.unidad} · prueba hasta ${gratisHasta}`
    after(async () => {
      try {
        await createBillingRequest({
          uid: m.uid,
          email: m.email,
          companyId: m.companyId,
          razonSocial,
          // El cupo anterior al alta: siempre el default, porque esta ruta solo
          // corre cuando la empresa todavía no había elegido plan.
          currentCupo: company?.plan?.maxVehiculos ?? vehiculos,
          desiredVehicles: vehiculos,
          message,
        })
        const to = billingNotifyEmail()
        if (to) {
          await sendBillingRequestEmail(to, {
            fromEmail: m.email,
            razonSocial,
            currentCupo: company?.plan?.maxVehiculos ?? vehiculos,
            desiredVehicles: vehiculos,
            message,
          })
        }
      } catch (e) {
        console.error('[plan] aviso de alta', e)
      }
    })
  } catch (e) {
    console.error('[plan] after()', e)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
npx vitest run app/api/__tests__/plan-endpoint.test.ts
```

Esperado: PASS.

- [ ] **Step 6: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib
git add app/api/plan app/api/__tests__/plan-endpoint.test.ts lib/email/resend.ts app/api/billing/request/route.ts
git commit -m "feat(plan): endpoint de alta de plan con periodo de prueba"
```

---

### Task 5: La pantalla `/plan`

**Files:**
- Create: `app/plan/page.tsx`
- Create: `app/plan/loading.tsx`
- Create: `components/plan/SelectorPlan.tsx`
- Modify: `components/onboarding/ElegirTipo.tsx:53`
- Modify: `app/(app)/dashboard/page.tsx`
- Test: `components/__tests__/SelectorPlan.test.tsx`

**Interfaces:**
- Consumes: `cargoDe`, `ahorroAnual`, `tagIncluded`, `formatCLP`, `MAX_VEHICULOS_SELF_SERVICE` (Task 1); `debeElegirPlan` (Task 2); `POST /api/plan` (Task 4).

- [ ] **Step 1: Crear el selector**

`components/plan/SelectorPlan.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  cargoDe,
  ahorroAnual,
  tagIncluded,
  formatCLP,
  FREE_TAG_THRESHOLD,
  TAG_PRICE,
  MAX_VEHICULOS_SELF_SERVICE,
} from '@/lib/billing'
import type { Periodicidad } from '@/lib/types'

const ATAJOS = [1, 3, 5, 10]

export default function SelectorPlan({ inicial }: { inicial: number }) {
  const router = useRouter()
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>('mensual')
  const [vehiculos, setVehiculos] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const excede = vehiculos > MAX_VEHICULOS_SELF_SERVICE
  const cargo = cargoDe({ vehiculos, periodicidad })
  const ahorro = ahorroAnual(vehiculos)

  function cambiar(n: number) {
    // Se deja escribir por encima del tope para poder mostrar la salida a
    // Facturación en vez de un error mudo.
    setVehiculos(Math.min(99, Math.max(1, Math.floor(n) || 1)))
  }

  async function continuar() {
    setGuardando(true)
    setError(null)
    // /plan es un embudo obligatorio sin navegación: si el fetch rechaza (sin
    // conexión, timeout, DNS) en vez de responder !ok, sin este catch el botón
    // queda disabled para siempre y el usuario no tiene salida.
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodicidad, maxVehiculos: vehiculos }),
      })
      if (!res.ok) {
        setGuardando(false)
        setError('No se pudo guardar. Inténtalo de nuevo.')
        return
      }
    } catch {
      setGuardando(false)
      setError('No se pudo guardar. Inténtalo de nuevo.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  const tarjeta = (valor: Periodicidad, titulo: string, detalle: string, pill?: string) => (
    <button
      type="button"
      onClick={() => setPeriodicidad(valor)}
      aria-pressed={periodicidad === valor}
      className={`flex-1 rounded-2xl border p-4 text-left transition-shadow ${
        periodicidad === valor
          ? 'border-azul bg-azul/5 shadow-sm'
          : 'border-linea bg-superficie hover:shadow-sm'
      } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul`}
    >
      <span className="flex items-center gap-2">
        <span className="font-semibold text-tinta">{titulo}</span>
        {pill && (
          <span className="rounded-full bg-vigente/15 px-2 py-0.5 text-xs font-medium text-vigente">
            {pill}
          </span>
        )}
      </span>
      <span className="mt-1 block text-sm text-acero">{detalle}</span>
    </button>
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 text-sm font-medium text-acero">¿Cómo prefieres pagar?</h2>
        <div className="flex gap-3">
          {tarjeta('mensual', 'Mensual', 'Se cobra todos los meses.')}
          {tarjeta('anual', 'Anual', 'Un pago al año.', '−35%')}
        </div>
      </div>

      <div>
        <label htmlFor="vehiculos" className="mb-2 block text-sm font-medium text-acero">
          ¿Cuántos vehículos vas a registrar?
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => cambiar(vehiculos - 1)}
            aria-label="Quitar un vehículo"
            className="size-11 shrink-0 rounded-xl border border-linea bg-superficie text-lg font-medium text-tinta hover:bg-lienzo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
          >
            −
          </button>
          <input
            id="vehiculos"
            type="number"
            min={1}
            inputMode="numeric"
            value={vehiculos}
            onChange={(e) => cambiar(Number(e.target.value))}
            className="w-20 rounded-xl border border-linea bg-superficie px-3 py-2.5 text-center text-lg font-semibold text-tinta tabular-nums focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
          />
          <button
            type="button"
            onClick={() => cambiar(vehiculos + 1)}
            aria-label="Agregar un vehículo"
            className="size-11 shrink-0 rounded-xl border border-linea bg-superficie text-lg font-medium text-tinta hover:bg-lienzo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
          >
            +
          </button>
          <div className="ml-1 flex gap-1.5">
            {ATAJOS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => cambiar(n)}
                className="rounded-lg border border-linea bg-superficie px-2.5 py-1.5 text-sm text-acero hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-acero">Tu plan</span>
          <span className="text-right">
            <span className="block text-2xl font-bold tracking-tight text-tinta">
              {formatCLP(cargo.monto)}
            </span>
            <span className="text-xs text-acero">
              {periodicidad === 'anual' ? 'una vez al año' : 'al mes'}
            </span>
          </span>
        </div>
        <dl className="mt-4 space-y-2 border-t border-linea pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-acero">Valor por vehículo</dt>
            <dd className="font-medium text-tinta tabular-nums">
              {formatCLP(cargo.porVehiculo)} / {cargo.unidad}
            </dd>
          </div>
          {periodicidad === 'anual' && (
            <div className="flex justify-between gap-4">
              <dt className="text-acero">Ahorras al año</dt>
              <dd className="font-medium text-vigente tabular-nums">{formatCLP(ahorro)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-acero">Chip NFC</dt>
            <dd className="text-right font-medium text-tinta">
              {tagIncluded(vehiculos)
                ? 'Incluido (pagas el envío)'
                : `${formatCLP(TAG_PRICE)} + envío c/u`}
            </dd>
          </div>
        </dl>
        {!tagIncluded(vehiculos) && (
          <p className="mt-3 text-xs text-acero">
            Desde {FREE_TAG_THRESHOLD} vehículos el chip va incluido.
          </p>
        )}
      </div>

      {excede ? (
        <div className="space-y-3 rounded-2xl border border-linea bg-azul/5 p-5">
          <p className="text-sm text-acero">
            Para flotas de más de {MAX_VEHICULOS_SELF_SERVICE} vehículos coordinamos el plan
            contigo directamente.
          </p>
          <Link
            href="/facturacion"
            className="block w-full rounded-xl bg-azul px-4 py-3 text-center font-medium text-white hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
          >
            Hablemos de tu flota
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={continuar}
          disabled={guardando}
          className="w-full rounded-xl bg-azul px-4 py-3 font-medium text-white hover:bg-azul-press disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
        >
          {guardando ? 'Preparando tu cuenta…' : 'Continuar'}
        </button>
      )}

      {error && <p className="text-sm text-vencido">{error}</p>}

      <p className="text-center text-sm text-acero">
        Empiezas con 30 días de prueba. Coordinamos el pago contigo antes de que terminen.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Crear la página y su skeleton**

`app/plan/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import SelectorPlan from '@/components/plan/SelectorPlan'
import { TapCarIsotipo, TapCarWordmark } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const m = await getMembership()
  if (!m) redirect('/login')
  // Un Editor o Visor no contrata nada.
  if (!can(m.role, 'billing:manage')) redirect('/dashboard')

  const company = await getCompany(m.companyId)
  // Guarda propia para no ser un callejón: quien ya eligió va a Facturación,
  // que es donde se piden los cambios de plan. Una cuenta anterior al selector
  // (periodicidad ausente) SÍ puede entrar acá voluntariamente.
  if (company?.plan?.periodicidad) redirect('/facturacion')

  const inicial = company?.onboarding?.tipoCuenta === 'personal' ? 1 : 3

  return (
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <div className="w-full max-w-md py-8">
        <div className="mb-6 text-center">
          <TapCarIsotipo className="mx-auto mb-2 size-14" />
          <TapCarWordmark className="text-3xl" />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-tinta">Arma tu plan</h1>
          <p className="mt-1 text-sm text-acero">Puedes cambiarlo después desde Facturación.</p>
        </div>
        <SelectorPlan inicial={inicial} />
      </div>
    </main>
  )
}
```

`app/plan/loading.tsx` — el skeleton **tiene que calzar en tamaño** con la página real (mismo `max-w-md`), o al cargar hay un salto:

```tsx
import { Bloque, Linea } from '@/components/skeleton/Skeleton'

export default function Loading() {
  return (
    // El role="status" va en el <p className="sr-only">, NO en el <main>:
    // ponerlo en el main reemplaza el landmark y no deja nada anunciable
    // adentro, porque todo lo demás es aria-hidden. Ver Skeleton.tsx.
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <p className="sr-only" role="status">Cargando…</p>
      <div className="w-full max-w-md py-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Bloque className="size-14 rounded-2xl" />
          <Linea className="h-8 w-32" />
          <Linea className="mt-2 h-6 w-40" />
          <Linea className="h-4 w-56" />
        </div>
        <div className="space-y-5">
          <div className="flex gap-3">
            <Bloque className="h-20 flex-1 rounded-2xl" />
            <Bloque className="h-20 flex-1 rounded-2xl" />
          </div>
          <Bloque className="h-11 w-full rounded-xl" />
          <Bloque className="h-44 w-full rounded-2xl" />
          <Bloque className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </main>
  )
}
```

`Bloque` y `Linea` reciben solo `className` (`components/skeleton/Skeleton.tsx`); ambas ya vienen con `animate-pulse` y `aria-hidden`.

- [ ] **Step 3: Encadenar `/bienvenida` → `/plan`**

En `components/onboarding/ElegirTipo.tsx`, línea 53, cambia `router.push('/dashboard')` por:

```ts
    // Al plan y no al dashboard: rebotar por el dashboard solo para que el
    // portero vuelva a mandarte acá es una carga de página regalada.
    router.push('/plan')
```

- [ ] **Step 4: Poner la puerta en el dashboard**

En `app/(app)/dashboard/page.tsx`, agrega el import junto al de `maxVehiculosDe` (línea 8):

```ts
import { maxVehiculosDe, debeElegirPlan } from '@/lib/plan'
```

Y justo después de la línea 46 (`if (debeElegirTipo(...)) redirect('/bienvenida')`):

```ts
  // Segunda puerta, misma razón que la primera: acá la empresa ya está leída.
  // Solo aplica al Administrador y solo con `periodicidad === null` explícito,
  // así que ninguna cuenta anterior al selector se topa con esta pantalla.
  if (puedeConfigurar && debeElegirPlan(company?.plan)) redirect('/plan')
```

- [ ] **Step 5: Escribir los tests del selector**

Crea `components/__tests__/SelectorPlan.test.tsx` con `@testing-library/react`, siguiendo el patrón de los tests de componentes que ya existen en `components/__tests__/`:

```
1. Arranca en mensual y muestra el cargo mensual del `inicial`.
2. Al tocar "Anual" el monto cambia al anual y aparece la línea "Ahorras al año".
3. Los botones − y + cambian la cantidad; no baja de 1.
4. Con menos de 5 vehículos muestra el precio del chip; con 5 o más dice "Incluido".
5. Con 31 vehículos desaparece "Continuar" y aparece el enlace a Facturación.
   (Es la salida al tope: sin esto el usuario quedaría con un botón que el
   servidor va a rechazar con 400.)
6. "Continuar" hace POST a /api/plan con { periodicidad, maxVehiculos }.
7. Si el POST responde !ok, muestra el mensaje de error y el botón vuelve a
   estar habilitado (no queda colgado).
```

- [ ] **Step 6: Correr todo y verificar**

```bash
npx vitest run components/__tests__/SelectorPlan.test.tsx
npx tsc --noEmit && npm test && npx eslint app components lib && npm run build
```

Esperado: todo verde.

- [ ] **Step 7: Commitear**

```bash
git add app/plan components/plan components/__tests__/SelectorPlan.test.tsx components/onboarding/ElegirTipo.tsx app/\(app\)/dashboard/page.tsx
git commit -m "feat(plan): pantalla de eleccion de plan en el alta"
```

---

### Task 6: La franja de prueba y Facturación

**Files:**
- Create: `components/plan/FranjaPrueba.tsx`
- Modify: `components/VehiclesBoard.tsx`
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `app/(app)/facturacion/page.tsx`
- Test: `components/__tests__/FranjaPrueba.test.tsx`

**Interfaces:**
- Consumes: `estadoPrueba`, `EstadoPrueba` (Task 2).

- [ ] **Step 1: Crear la franja**

`components/plan/FranjaPrueba.tsx`:

```tsx
import Link from 'next/link'
import type { EstadoPrueba } from '@/lib/plan/prueba'

const TONO: Record<Exclude<EstadoPrueba, 'sin_prueba'>, string> = {
  activa: 'border-azul/30 bg-azul/5 text-acero',
  por_terminar: 'border-por-vencer/40 bg-por-vencer/10 text-tinta',
  vencida: 'border-vencido/40 bg-vencido/10 text-tinta',
}

export default function FranjaPrueba({
  estado,
  diasRestantes,
  destino,
}: {
  estado: EstadoPrueba
  diasRestantes: number | null
  destino: string
}) {
  // Sin fecha no hay plazo que anunciar. Una franja acá sería inventarse uno.
  if (estado === 'sin_prueba') return null

  const dias = diasRestantes ?? 0
  const texto =
    estado === 'vencida'
      ? // Dice la verdad: la app NO se bloquea. Un aviso que amenaza con algo
        // que no ocurre entrena a la gente a ignorar todos los avisos,
        // incluidos los de vencimiento de documentos, que son el producto.
        'Tu prueba terminó. Sigue usando TapCar mientras coordinamos tu plan.'
      : dias === 0
        ? 'Tu prueba termina hoy.'
        : `Estás en la versión de prueba · ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}.`

  return (
    <div
      className={`mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${TONO[estado]}`}
    >
      <p className="text-sm">{texto}</p>
      <Link
        href={destino}
        className="shrink-0 rounded-lg bg-azul px-3 py-2 text-center text-sm font-medium text-white hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        Elegir plan
      </Link>
    </div>
  )
}
```

Los tokens de estado son `vigente` / `por-vencer` / `vencido`, definidos con `@theme` en `app/globals.css` (no hay `tailwind.config`).

- [ ] **Step 2: Montarla en el board**

En `components/VehiclesBoard.tsx`, agrega el import junto a `TarjetaProgreso` (línea 13):

```ts
import FranjaPrueba from '@/components/plan/FranjaPrueba'
import type { EstadoPrueba } from '@/lib/plan/prueba'
```

Agrega la prop a la firma (después de `onboarding = null,` en la línea 94 y su tipo en la 101):

```ts
  prueba = null,
```

```ts
  prueba?: { estado: EstadoPrueba; diasRestantes: number | null; destino: string } | null
```

Y renderízala **justo antes** del bloque `{onboarding && (` (línea 345):

```tsx
      {prueba && (
        <FranjaPrueba
          estado={prueba.estado}
          diasRestantes={prueba.diasRestantes}
          destino={prueba.destino}
        />
      )}
```

- [ ] **Step 3: Calcularla en el dashboard**

En `app/(app)/dashboard/page.tsx`, agrega el import:

```ts
import { estadoPrueba } from '@/lib/plan/prueba'
```

Después de `const now = new Date()` (línea 56):

```ts
  // El destino depende de si la cuenta llegó a elegir plan alguna vez: una
  // anterior al selector todavía no tiene qué revisar en Facturación.
  const prueba = {
    ...estadoPrueba(company?.plan?.gratisHasta, now),
    destino: company?.plan?.periodicidad ? '/facturacion' : '/plan',
  }
```

Y pásala en el JSX de `<VehiclesBoard>`:

```tsx
      prueba={prueba}
```

- [ ] **Step 4: Mostrar el estado en Facturación**

En `app/(app)/facturacion/page.tsx`, agrega el import y el cálculo:

```ts
import { estadoPrueba } from '@/lib/plan/prueba'
```

```ts
  const prueba = estadoPrueba(company?.plan?.gratisHasta, new Date())
  const yaEligio = Boolean(company?.plan?.periodicidad)
```

En la sección "Tu plan", agrega dos filas al `<dl>`:

```tsx
          <div className="flex justify-between gap-4">
            <dt className="text-acero">Periodicidad</dt>
            <dd className="font-medium text-tinta">{periodicidad === 'anual' ? 'Anual' : 'Mensual'}</dd>
          </div>
          {company?.plan?.gratisHasta && (
            <div className="flex justify-between gap-4">
              <dt className="text-acero">{prueba.estado === 'vencida' ? 'Prueba terminada el' : 'Sin cobro hasta'}</dt>
              <dd className="font-medium text-tinta tabular-nums">{company.plan.gratisHasta}</dd>
            </div>
          )}
```

Y para una cuenta anterior al selector, arriba del `BillingRequestForm` (dentro del bloque `esAdmin`):

```tsx
          {!yaEligio && (
            <Link
              href="/plan"
              className="block rounded-xl bg-azul px-4 py-3 text-center font-medium text-white hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
            >
              Elegir plan
            </Link>
          )}
```

Agrega `import Link from 'next/link'` si no está.

- [ ] **Step 5: Escribir los tests de la franja**

Crea `components/__tests__/FranjaPrueba.test.tsx`:

```
1. `sin_prueba` no renderiza nada (container vacío).
2. `activa` con 19 días muestra "quedan 19 días".
3. Singular: 1 día muestra "queda 1 día", no "quedan 1 días".
4. 0 días muestra "termina hoy".
5. `vencida` NO dice que la app se bloquea; el texto contiene "Sigue usando".
6. El enlace apunta al `destino` que se le pasa.
```

- [ ] **Step 6: Correr todo y verificar**

```bash
npx vitest run components/__tests__/FranjaPrueba.test.tsx
npx tsc --noEmit && npm test && npx eslint app components lib && npm run build
```

- [ ] **Step 7: Commitear**

```bash
git add components/plan/FranjaPrueba.tsx components/__tests__/FranjaPrueba.test.tsx components/VehiclesBoard.tsx app/\(app\)/dashboard/page.tsx app/\(app\)/facturacion/page.tsx
git commit -m "feat(plan): franja de periodo de prueba y estado en facturacion"
```

---

### Task 7: Backfill de las cuentas existentes y documentación

**Files:**
- Create: `scripts/backfill-prueba.mjs`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Escribir el script**

`scripts/backfill-prueba.mjs`, calcado de `scripts/backfill-km.mjs` (dry-run por defecto, `--apply` para escribir, idempotente):

```js
// Backfill one-time del período de prueba para las cuentas que ya existían
// antes del selector de plan: les pone `plan.gratisHasta` a 30 días desde hoy.
//
// NO toca `plan.periodicidad`: tiene que quedar AUSENTE, porque el campo
// presente (aunque sea null) es lo que manda a una cuenta a la pantalla
// obligatoria de elección de plan. Tampoco toca `maxVehiculos`.
//
// SEGURO POR DEFECTO: dry-run (solo lista). Para escribir hay que pasar --apply.
// Idempotente: salta las empresas que ya tienen `gratisHasta`, así que correrlo
// dos veces no le reinicia la prueba a nadie.
//
// Uso:
//   node --env-file=.env.local scripts/backfill-prueba.mjs           # dry-run
//   node --env-file=.env.local scripts/backfill-prueba.mjs --apply    # escribe
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
if (!projectId || !clientEmail || !privateKey) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const DIAS_PRUEBA = 30

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
const db = getFirestore()

function hoyEnChile(now) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(now)
}

function addDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(t.getUTCDate()).padStart(2, '0')
  return `${t.getUTCFullYear()}-${mm}-${dd}`
}

const hasta = addDias(hoyEnChile(new Date()), DIAS_PRUEBA)
const empresas = await db.collection('companies').get()
let actualizadas = 0
let saltadas = 0

for (const c of empresas.docs) {
  const plan = c.data().plan ?? {}
  if (plan.gratisHasta) {
    saltadas++
    continue
  }
  const nombre = c.data().company?.razonSocial || c.id
  console.log(`  ${nombre}: sin fecha → ${hasta}`)
  actualizadas++
  if (APPLY) {
    await c.ref.set({ plan: { gratisHasta: hasta } }, { merge: true })
  }
}

console.log(`\nEmpresas: ${empresas.size} · por actualizar: ${actualizadas} · ya tenían fecha: ${saltadas}`)
console.log(APPLY ? '\nBackfill aplicado. ✅' : '\n[DRY-RUN] No se escribió nada. Corre con --apply para aplicar.')
process.exit(0)
```

El campo es `company.razonSocial` (`CompanyData` en `lib/types.ts`), y puede venir vacío: por eso el fallback al id del documento.

- [ ] **Step 2: Verificar el script en dry-run**

```bash
node --env-file=.env.local scripts/backfill-prueba.mjs
```

Esperado: lista las empresas sin `gratisHasta` y termina con `[DRY-RUN] No se escribió nada.` **No correr con `--apply`**: eso lo decide el humano tras desplegar.

- [ ] **Step 3: Documentar en `CLAUDE.md`**

Tres cambios:

1. En la lista de **Scripts de operación**, después de la línea de `backfill-resumen.mjs`:

```
node --env-file=.env.local scripts/backfill-prueba.mjs [--apply]   # backfill one-time de gratisHasta (prueba de 30 días) en cuentas previas al selector de plan (dry-run sin --apply)
```

2. En **Modelo de datos**, en el bloque de `companies/{companyId}`, después de la mención de `plan` (`PlanData`), agrega:

```
`plan` ahora lleva además `periodicidad?: Periodicidad | null` (`'mensual' | 'anual'`) y `gratisHasta?: string | null` (`YYYY-MM-DD`, hasta cuándo no se cobra). **`null` explícito y campo ausente NO son lo mismo**: `null` lo siembra `createCompany` y significa "cuenta nueva que todavía no eligió" (la manda a `/plan` vía `debeElegirPlan`); **ausente** es una cuenta anterior al selector, que nunca ve esa pantalla y solo recibe la franja de prueba. Esa distinción es lo que hace que la puerta no dependa de que `scripts/backfill-prueba.mjs` haya corrido antes que el deploy. Por lo mismo, **`DEFAULT_PLAN` no puede ganar una clave `periodicidad`**: `getCompany` hace `{ ...DEFAULT_PLAN, ...(d.plan ?? {}) }` y el default inyectaría un valor en todas las cuentas viejas (hay un test que lo fija). Las escrituras del plan van por **`savePlan`** y no por `saveCompany`, que reconstruye el mapa `plan` desde cero y descartaría los campos nuevos.
```

3. En **Arquitectura**, después de la línea de `lib/plan.ts` / `lib/billing.ts`, reemplázala por:

```
- `lib/plan.ts` / `lib/billing.ts` / `lib/plan/prueba.ts` — lógica pura del cupo (`maxVehiculosDe`, `planCapacity`, `debeElegirPlan`), del precio (`cargoDe` mensual/anual, `ahorroAnual`, `MAX_VEHICULOS_SELF_SERVICE = 30`) y del período de prueba (`estadoPrueba`, `addDias`, `DIAS_PRUEBA = 30`, `UMBRAL_POR_TERMINAR = 7`, el mismo hito que los recordatorios de documentos). **El alta elige plan**: `/plan` (fuera de `(app)`, con `SelectorPlan`) pide periodicidad → cantidad → muestra el cargo, y `POST /api/plan` lo guarda con `gratisHasta = hoy + 30 días`. La puerta la pone el **dashboard**, no el layout de `(app)`, por la misma razón que el portero del onboarding. Ese endpoint es el punto exacto que reemplazará la pasarela: hoy registra un `billingRequest` y estampa la fecha; mañana redirige al checkout y `gratisHasta` pasa a ser la del primer cobro. `hoyEnChile` vive en `lib/documents/status.ts` porque la zona horaria de Chile tiene un solo dueño en el proyecto.
```

- [ ] **Step 4: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib && npm run build
git add scripts/backfill-prueba.mjs CLAUDE.md
git commit -m "chore(plan): backfill de la prueba y documentacion"
```

---

## Verificación final

Antes de dar por cerrada la rama:

```bash
npx tsc --noEmit && npm run build && npx eslint app components lib && npm test
```

Y una comprobación manual que ningún test cubre: entrar con una cuenta nueva y confirmar el recorrido completo `/login → /bienvenida → /plan → /dashboard`, con la franja visible al llegar.
