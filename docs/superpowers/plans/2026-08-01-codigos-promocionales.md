# Códigos promocionales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una empresa pueda canjear un código promocional —al crear la cuenta o desde Facturación— y obtener meses gratis y cobertura de vehículos, con la promoción empezando donde termina la prueba.

**Architecture:** El código canjeado se copia a `plan.promo` con su propia fecha de término; `plan.gratisHasta` no se toca nunca al canjear. El canje corre en una **transacción de Firestore** porque `maxCanjes` no significa nada sin ella. Toda la lógica de si un código sirve vive en `lib/promo/canje.ts`, puro y sin Firebase; los endpoints solo orquestan y traducen el motivo a un HTTP.

**Tech Stack:** Next.js 16 (App Router, TypeScript estricto), Firestore vía Admin SDK, Tailwind v4 con tokens de `app/globals.css`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-01-codigos-promocionales-design.md`

## Global Constraints

- Todo el código, UI, comentarios y mensajes en **español neutro (Chile)**, tratando de "tú".
- **El id del documento de `promoCodes` ES el código canónico.** No hay campo `codigo` separado en Firestore; al mapear se toma de `doc.id`. Eso da la unicidad gratis y permite leer por id **dentro de la transacción**.
- `normalizarCodigo`: mayúsculas, solo `A-Z`, `0-9` y `-`, tope **32** caracteres. Cadena vacía = inválido y nunca se busca.
- Límites de un código: `mesesGratis` 0..**24**, `vehiculosIncluidos` 0..**100**. Un código con ambos en 0 no otorga nada y se rechaza al crearlo.
- **`plan.gratisHasta` no se modifica al canjear.** La promoción arranca en `max(hoy, gratisHasta)` y vive en `plan.promo.hasta`.
- **`ya_canjeado` se comprueba ANTES que `no_existe`**: a quien ya tiene promoción hay que decirle eso, no filtrarle si el código que probó existe.
- `cargoDe` recibe `vehiculosIncluidos` **opcional con default 0**: los cinco llamadores que ya existen no cambian y siguen con `monto === montoPleno`.
- Fechas en `YYYY-MM-DD`: la comparación lexicográfica **es** la cronológica, así que no hace falta aritmética de fechas nueva. `addMeses` ya existe en `lib/mantencion/status.ts`.
- **Firestore Admin rechaza `undefined`**: omitir la clave o usar `null`.
- Los endpoints privados llaman `getMembership()` y validan `can(role, 'billing:manage')`; los de admin validan `isAdminEmail`, que falla cerrado.
- Antes de cada commit: `npx tsc --noEmit`, `npm test`, `npx eslint app components lib`. Las tareas que tocan rutas o componentes corren además `npm run build`.
- El test de reglas de Firestore (`lib/firebase/__tests__/rules.test.ts`) falla localmente por falta de emulador/Java: es esperado y no cuenta como fallo.
- Se trabaja **directo en `master`**, sin PR. **No hacer `git push`** — lo aprueba el humano al final.

---

### Task 1: Tipos, `cargoDe` con cobertura y `faseDelPlan`

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/billing.ts`
- Create: `lib/plan/fase.ts`
- Test: `lib/plan/__tests__/fase.test.ts`, `lib/__tests__/billing.test.ts` (ampliar)

**Interfaces:**
- Produces: `PromoAplicada`, `PromoCode`, `PlanData.promo`, `MAX_MESES_PROMO`, `MAX_VEHICULOS_PROMO`; `Cargo` con `montoPleno`/`vehiculosCobrados`; `cargoDe` con `vehiculosIncluidos?`; `faseDelPlan`, `FasePlan`.

- [ ] **Step 1: Agregar los tipos**

En `lib/types.ts`, justo después de `export interface PlanData { … }` (y antes de `DEFAULT_PLAN`):

```ts
/** Lo que un código promocional otorgó a una empresa. Copia congelada: editar
 *  el código después NO altera lo que ya se canjeó. */
export interface PromoAplicada {
  /** El código canjeado, en su forma canónica. */
  codigo: string
  mesesGratis: number
  vehiculosIncluidos: number
  /** ISO completo: cuándo se canjeó. */
  canjeadoEn: string
  /** `YYYY-MM-DD`: hasta cuándo dura la cobertura promocional. */
  hasta: string
}

/** Un código de campaña. En Firestore, el **id del documento es `codigo`**. */
export interface PromoCode {
  codigo: string
  descripcion: string
  mesesGratis: number
  vehiculosIncluidos: number
  activo: boolean
  /** `YYYY-MM-DD`: último día en que se puede canjear. `null` = sin vencimiento. */
  expiraEn: string | null
  /** Tope de empresas que pueden canjearlo. `null` = sin tope. */
  maxCanjes: number | null
  canjes: number
  createdAt: string | null
  createdByUid?: string
}

export const MAX_MESES_PROMO = 24
export const MAX_VEHICULOS_PROMO = 100
```

Y dentro de `PlanData`, después de `gratisHasta`:

```ts
  /** El código canjeado. Uno por empresa. */
  promo?: PromoAplicada | null
```

`DEFAULT_PLAN` **no cambia**: sigue siendo `{ maxVehiculos: 3 }`.

- [ ] **Step 2: Escribir los tests que fallan**

Crea `lib/plan/__tests__/fase.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { faseDelPlan } from '@/lib/plan/fase'

describe('faseDelPlan', () => {
  it('dentro de la prueba es prueba', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-08-15')).toBe('prueba')
  })

  // Borde inclusivo: el último día de prueba TODAVÍA es prueba, igual que
  // `estadoPrueba` trata el día 0 como "termina hoy" y no como vencida.
  it('el último día de prueba sigue siendo prueba', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-08-31')).toBe('prueba')
  })

  it('al día siguiente pasa a promo', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-09-01')).toBe('promo')
  })

  it('el último día de promo sigue siendo promo', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-11-30')).toBe('promo')
  })

  it('después de la promo es plena', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-12-01')).toBe('plena')
  })

  it('sin promo, al terminar la prueba pasa directo a plena', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31' }, '2026-09-01')).toBe('plena')
  })

  it('sin ninguna fecha es plena', () => {
    expect(faseDelPlan({}, '2026-09-01')).toBe('plena')
  })

  // Una cuenta que canjeó con la prueba ya vencida: no hay gratisHasta vigente
  // pero sí promo.
  it('con la prueba vencida y promo vigente, es promo', () => {
    expect(faseDelPlan({ gratisHasta: '2026-07-01', promoHasta: '2026-11-30' }, '2026-09-01')).toBe('promo')
  })
})
```

Y **agrega** a `lib/__tests__/billing.test.ts` (sin borrar lo que ya está):

```ts
describe('cargoDe con cobertura promocional', () => {
  it('descuenta los vehículos cubiertos', () => {
    const c = cargoDe({ vehiculos: 8, periodicidad: 'mensual', vehiculosIncluidos: 5 })
    expect(c.vehiculosCobrados).toBe(3)
    expect(c.monto).toBe(8970)
    expect(c.montoPleno).toBe(23920)
  })

  it('si la cobertura alcanza para todos, no se cobra nada', () => {
    const c = cargoDe({ vehiculos: 3, periodicidad: 'mensual', vehiculosIncluidos: 5 })
    expect(c.vehiculosCobrados).toBe(0)
    expect(c.monto).toBe(0)
    expect(c.montoPleno).toBe(8970)
  })

  it('cubre también en anual', () => {
    const c = cargoDe({ vehiculos: 8, periodicidad: 'anual', vehiculosIncluidos: 5 })
    expect(c.monto).toBe(69984)
    expect(c.montoPleno).toBe(186624)
  })

  // La garantía de que los cinco llamadores que ya existen no cambiaron de
  // comportamiento al crecer la firma.
  it('sin cobertura, monto y montoPleno son el mismo número', () => {
    const c = cargoDe({ vehiculos: 8, periodicidad: 'mensual' })
    expect(c.monto).toBe(c.montoPleno)
    expect(c.vehiculosCobrados).toBe(8)
  })

  it('una cobertura negativa o basura no infla el cargo', () => {
    expect(cargoDe({ vehiculos: 5, periodicidad: 'mensual', vehiculosIncluidos: -3 }).monto).toBe(14950)
  })
})
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

```bash
npx vitest run lib/plan/__tests__/fase.test.ts lib/__tests__/billing.test.ts
```

Esperado: FAIL — no existe `lib/plan/fase.ts` y `Cargo` no tiene `montoPleno`.

- [ ] **Step 4: Ampliar `cargoDe`**

En `lib/billing.ts`, reemplaza la interfaz `Cargo` y la función `cargoDe` por:

```ts
export interface Cargo {
  /** Lo que se cobra en un ciclo, ya descontada la cobertura promocional. */
  monto: number
  /** Lo que se cobrará cuando no haya cobertura. Sin promo, igual a `monto`. */
  montoPleno: number
  vehiculosCobrados: number
  /** Valor unitario en la unidad del ciclo. */
  porVehiculo: number
  unidad: 'mes' | 'año'
}

export function cargoDe({
  vehiculos,
  periodicidad,
  // Opcional con default 0 a propósito: los llamadores que ya existen siguen
  // funcionando sin cambios y obtienen `monto === montoPleno`.
  vehiculosIncluidos = 0,
}: {
  vehiculos: number
  periodicidad: Periodicidad
  vehiculosIncluidos?: number
}): Cargo {
  const v = sanear(vehiculos)
  const cobrados = Math.max(0, v - sanear(vehiculosIncluidos))
  const porVehiculo =
    periodicidad === 'anual' ? PRICE_PER_VEHICLE_ANUAL_MES * MESES_ANUAL : PRICE_PER_VEHICLE
  return {
    monto: cobrados * porVehiculo,
    montoPleno: v * porVehiculo,
    vehiculosCobrados: cobrados,
    porVehiculo,
    unidad: periodicidad === 'anual' ? 'año' : 'mes',
  }
}
```

- [ ] **Step 5: Crear `lib/plan/fase.ts`**

```ts
// En qué fase de cobro está una empresa (puro, sin Firebase).
//
// Son dos fechas y no una: durante la prueba no se cobra nada, así que si la
// cobertura de un código aplicara también a los días de prueba que quedaban,
// canjear dejaría al usuario PEOR que no canjear. Por eso la promoción empieza
// donde termina la prueba y lleva su propia fecha.

export type FasePlan = 'prueba' | 'promo' | 'plena'

/**
 * Ambas fechas son `YYYY-MM-DD`, así que la comparación de strings es la
 * comparación cronológica. Los dos bordes son inclusivos: el último día de
 * cada fase todavía pertenece a esa fase.
 */
export function faseDelPlan(
  { gratisHasta, promoHasta }: { gratisHasta?: string | null; promoHasta?: string | null },
  hoy: string,
): FasePlan {
  if (gratisHasta && hoy <= gratisHasta) return 'prueba'
  if (promoHasta && hoy <= promoHasta) return 'promo'
  return 'plena'
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

```bash
npx vitest run lib/plan/__tests__/fase.test.ts lib/__tests__/billing.test.ts
```

Esperado: PASS.

- [ ] **Step 7: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib
git add lib/types.ts lib/billing.ts lib/plan/fase.ts lib/plan/__tests__/fase.test.ts lib/__tests__/billing.test.ts
git commit -m "feat(promo): tipos, cobertura en cargoDe y fases del plan"
```

---

### Task 2: `lib/promo/canje.ts` — la lógica pura

**Files:**
- Create: `lib/promo/canje.ts`
- Test: `lib/promo/__tests__/canje.test.ts`

**Interfaces:**
- Consumes: `PromoCode`, `PromoAplicada` (Task 1); `addMeses` de `lib/mantencion/status.ts`.
- Produces: `MotivoRechazo`, `normalizarCodigo`, `puedeCanjear`, `aplicarCanje`.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `lib/promo/__tests__/canje.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizarCodigo, puedeCanjear, aplicarCanje } from '@/lib/promo/canje'
import type { PromoCode, PromoAplicada } from '@/lib/types'

const code = (over: Partial<PromoCode> = {}): PromoCode => ({
  codigo: 'LANZAMIENTO',
  descripcion: 'Lanzamiento agosto',
  mesesGratis: 3,
  vehiculosIncluidos: 5,
  activo: true,
  expiraEn: null,
  maxCanjes: null,
  canjes: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
})

const promo: PromoAplicada = {
  codigo: 'OTRO',
  mesesGratis: 1,
  vehiculosIncluidos: 0,
  canjeadoEn: '2026-07-01T00:00:00.000Z',
  hasta: '2026-09-01',
}

describe('normalizarCodigo', () => {
  it('pasa a mayúsculas y recorta', () => {
    expect(normalizarCodigo('  lanzamiento  ')).toBe('LANZAMIENTO')
  })

  it('conserva números y guiones', () => {
    expect(normalizarCodigo('tapcar-2026')).toBe('TAPCAR-2026')
  })

  // El código es el id del documento y Firestore prohíbe la barra.
  it('descarta las barras', () => {
    expect(normalizarCodigo('a/b')).toBe('AB')
  })

  it('descarta espacios, tildes y símbolos', () => {
    expect(normalizarCodigo('promo ñandú!')).toBe('PROMOAND')
  })

  it('corta a 32 caracteres', () => {
    expect(normalizarCodigo('A'.repeat(40))).toHaveLength(32)
  })

  it('una entrada sin nada aprovechable queda vacía', () => {
    expect(normalizarCodigo('   ¡!¿?   ')).toBe('')
  })
})

describe('puedeCanjear', () => {
  it('un código sano se puede canjear', () => {
    expect(puedeCanjear({ code: code(), promoActual: null, hoy: '2026-08-01' })).toBeNull()
  })

  // El orden importa: a quien ya tiene promoción hay que decirle eso, y no
  // filtrarle de paso si el código que probó existe o no.
  it('ya_canjeado gana a no_existe', () => {
    expect(puedeCanjear({ code: null, promoActual: promo, hoy: '2026-08-01' })).toBe('ya_canjeado')
  })

  it('sin código es no_existe', () => {
    expect(puedeCanjear({ code: null, promoActual: null, hoy: '2026-08-01' })).toBe('no_existe')
  })

  it('desactivado', () => {
    expect(puedeCanjear({ code: code({ activo: false }), promoActual: null, hoy: '2026-08-01' })).toBe('inactivo')
  })

  it('el día exacto de expiraEn todavía sirve', () => {
    expect(puedeCanjear({ code: code({ expiraEn: '2026-08-01' }), promoActual: null, hoy: '2026-08-01' })).toBeNull()
  })

  it('al día siguiente de expiraEn ya no', () => {
    expect(puedeCanjear({ code: code({ expiraEn: '2026-08-01' }), promoActual: null, hoy: '2026-08-02' })).toBe('expirado')
  })

  it('agotado cuando los canjes alcanzan el tope', () => {
    expect(puedeCanjear({ code: code({ maxCanjes: 50, canjes: 50 }), promoActual: null, hoy: '2026-08-01' })).toBe('agotado')
  })

  it('con un canje menos todavía se puede', () => {
    expect(puedeCanjear({ code: code({ maxCanjes: 50, canjes: 49 }), promoActual: null, hoy: '2026-08-01' })).toBeNull()
  })

  it('maxCanjes null nunca se agota', () => {
    expect(puedeCanjear({ code: code({ maxCanjes: null, canjes: 9999 }), promoActual: null, hoy: '2026-08-01' })).toBeNull()
  })
})

describe('aplicarCanje', () => {
  it('con la prueba vigente, la promo empieza cuando la prueba termina', () => {
    const p = aplicarCanje({
      code: code(),
      gratisHasta: '2026-08-31',
      hoy: '2026-08-05',
      ahoraIso: '2026-08-05T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2026-11-30')
    expect(p.codigo).toBe('LANZAMIENTO')
    expect(p.mesesGratis).toBe(3)
    expect(p.vehiculosIncluidos).toBe(5)
    expect(p.canjeadoEn).toBe('2026-08-05T12:00:00.000Z')
  })

  // Con la prueba ya vencida la promoción arranca HOY, no retroactiva: si
  // contara desde `gratisHasta`, parte de la promo se consumiría en el pasado.
  it('con la prueba vencida, la promo empieza hoy', () => {
    const p = aplicarCanje({
      code: code(),
      gratisHasta: '2026-06-30',
      hoy: '2026-08-05',
      ahoraIso: '2026-08-05T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2026-11-05')
  })

  it('sin gratisHasta también empieza hoy', () => {
    const p = aplicarCanje({
      code: code(),
      gratisHasta: null,
      hoy: '2026-08-05',
      ahoraIso: '2026-08-05T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2026-11-05')
  })

  it('cruza el fin de año', () => {
    const p = aplicarCanje({
      code: code({ mesesGratis: 6 }),
      gratisHasta: '2026-10-15',
      hoy: '2026-09-20',
      ahoraIso: '2026-09-20T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2027-04-15')
  })

  it('un código de 0 meses deja la promo terminando el mismo día', () => {
    const p = aplicarCanje({
      code: code({ mesesGratis: 0 }),
      gratisHasta: '2026-08-31',
      hoy: '2026-08-05',
      ahoraIso: '2026-08-05T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2026-08-31')
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run lib/promo/__tests__/canje.test.ts
```

Esperado: FAIL — no existe `lib/promo/canje.ts`.

- [ ] **Step 3: Implementar**

```ts
// Reglas del canje de un código promocional (puro, sin Firebase). Acá vive la
// seguridad del feature: el endpoint solo orquesta y traduce el motivo a un
// HTTP. Mismo patrón que `lib/transferencias/estado.ts`.
import { addMeses } from '@/lib/mantencion/status'
import type { PromoAplicada, PromoCode } from '@/lib/types'

export type MotivoRechazo = 'no_existe' | 'inactivo' | 'expirado' | 'agotado' | 'ya_canjeado'

const LARGO_MAX = 32

/**
 * Forma canónica de un código.
 *
 * Es más estricta de lo que parece necesario a propósito: el código es el **id
 * del documento** en Firestore, que prohíbe la barra, y una lista blanca evita
 * tener que razonar sobre espacios, tildes o emojis. De paso hace que
 * "tapcar-agosto", "TapCar Agosto" y el mismo texto pegado desde un correo no
 * sean tres códigos distintos.
 */
export function normalizarCodigo(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, LARGO_MAX)
}

export function puedeCanjear({
  code,
  promoActual,
  hoy,
}: {
  code: PromoCode | null
  promoActual?: PromoAplicada | null
  hoy: string
}): MotivoRechazo | null {
  // Antes que `no_existe` a propósito: a quien ya tiene promoción hay que
  // decirle eso, y no filtrarle de paso si el código que probó existe.
  if (promoActual) return 'ya_canjeado'
  if (!code) return 'no_existe'
  if (!code.activo) return 'inactivo'
  if (code.expiraEn && hoy > code.expiraEn) return 'expirado'
  if (code.maxCanjes != null && code.canjes >= code.maxCanjes) return 'agotado'
  return null
}

/**
 * Arma la promoción a guardar. **No toca `gratisHasta`**: la promo empieza
 * donde termina la prueba, o hoy si la prueba ya venció (si contara desde una
 * `gratisHasta` pasada, parte de la promoción se consumiría en el pasado).
 */
export function aplicarCanje({
  code,
  gratisHasta,
  hoy,
  ahoraIso,
}: {
  code: PromoCode
  gratisHasta?: string | null
  hoy: string
  ahoraIso: string
}): PromoAplicada {
  // Ambas son `YYYY-MM-DD`: el orden lexicográfico es el cronológico.
  const desde = gratisHasta && gratisHasta > hoy ? gratisHasta : hoy
  return {
    codigo: code.codigo,
    mesesGratis: code.mesesGratis,
    vehiculosIncluidos: code.vehiculosIncluidos,
    canjeadoEn: ahoraIso,
    hasta: addMeses(desde, code.mesesGratis),
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
npx vitest run lib/promo/__tests__/canje.test.ts
```

Esperado: PASS (21 tests).

- [ ] **Step 5: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib
git add lib/promo
git commit -m "feat(promo): reglas puras del canje de codigos"
```

---

### Task 3: Capa de datos y reglas de Firestore

**Files:**
- Create: `lib/data/promoCodes.ts`
- Modify: `lib/data/companies.ts` (`savePlan` acepta `promo`)
- Modify: `firestore.rules`
- Test: `lib/data/__tests__/promoCodes.test.ts`

**Interfaces:**
- Consumes: `puedeCanjear`, `aplicarCanje`, `MotivoRechazo` (Task 2); `PromoCode`, `PromoAplicada` (Task 1).
- Produces: `createPromoCode`, `listPromoCodes`, `getPromoCode`, `setPromoCodeActivo`, `canjearPromo`, `ResultadoCanje`.

**Patrón de test:** sigue `lib/data/__tests__/companies-plan.test.ts`, que ya mockea `@/lib/firebase/admin` para este mismo módulo. Vitest 4: los mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(() => ({...}))`.

- [ ] **Step 1: Bloquear la colección en las reglas**

En `firestore.rules`, junto al bloque de `transferencias` (antes del cierre de `match /databases/...`), agrega:

```
    // Códigos promocionales: solo server-side (Admin SDK). Cliente sin acceso.
    match /promoCodes/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Escribir los tests que fallan**

Crea `lib/data/__tests__/promoCodes.test.ts` cubriendo **exactamente** estos casos:

```
1. createPromoCode escribe en el doc cuyo ID es el código canónico
   (`collection('promoCodes').doc('LANZAMIENTO')`), con `canjes: 0` y `activo: true`.
2. getPromoCode mapea `codigo` desde `doc.id`, no desde un campo del documento.
3. getPromoCode de un doc inexistente devuelve `null`.
4. canjearPromo con un código sano: incrementa `canjes` en el doc del código
   Y escribe `plan.promo` en la empresa, ambos DENTRO de la misma transacción.
5. canjearPromo con la empresa que ya tiene `plan.promo`: devuelve
   `{ ok: false, motivo: 'ya_canjeado' }` y NO escribe nada.
6. canjearPromo con un código agotado: `{ ok: false, motivo: 'agotado' }`, sin escribir.
7. canjearPromo lee el código DENTRO de la transacción (no antes): el mock de
   `runTransaction` debe recibir un callback que use `tx.get`, y el test lo verifica.
   Es lo que hace que `maxCanjes` signifique algo bajo dos canjes simultáneos.
8. canjearPromo escribe la empresa con `{ merge: true }` (no pisa el resto del plan).
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

```bash
npx vitest run lib/data/__tests__/promoCodes.test.ts
```

Esperado: FAIL — no existe `lib/data/promoCodes.ts`.

- [ ] **Step 4: `savePlan` acepta `promo`**

En `lib/data/companies.ts`, dentro de `savePlan`, después de la línea de `gratisHasta`:

```ts
  if (patch.promo !== undefined) plan.promo = patch.promo
```

- [ ] **Step 5: Implementar `lib/data/promoCodes.ts`**

```ts
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { puedeCanjear, aplicarCanje, type MotivoRechazo } from '@/lib/promo/canje'
import type { PromoAplicada, PromoCode } from '@/lib/types'

const COL = 'promoCodes'
const COL_COMPANIES = 'companies'

// El id del documento ES el código: da unicidad gratis y permite leerlo por id
// dentro de la transacción de canje, sin resolver una query ahí adentro.
function toPromoCode(id: string, d: FirebaseFirestore.DocumentData): PromoCode {
  return {
    codigo: id,
    descripcion: d.descripcion ?? '',
    mesesGratis: d.mesesGratis ?? 0,
    vehiculosIncluidos: d.vehiculosIncluidos ?? 0,
    activo: d.activo ?? false,
    expiraEn: d.expiraEn ?? null,
    maxCanjes: d.maxCanjes ?? null,
    canjes: d.canjes ?? 0,
    createdAt: d.createdAt ?? null,
    createdByUid: d.createdByUid,
  }
}

export async function createPromoCode(
  input: {
    codigo: string
    descripcion: string
    mesesGratis: number
    vehiculosIncluidos: number
    expiraEn: string | null
    maxCanjes: number | null
  },
  createdByUid: string,
): Promise<void> {
  await adminDb.collection(COL).doc(input.codigo).set({
    descripcion: input.descripcion,
    mesesGratis: input.mesesGratis,
    vehiculosIncluidos: input.vehiculosIncluidos,
    activo: true,
    expiraEn: input.expiraEn,
    maxCanjes: input.maxCanjes,
    canjes: 0,
    createdAt: new Date().toISOString(),
    createdByUid,
  })
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const snap = await adminDb.collection(COL).get()
  return snap.docs
    .map((d) => toPromoCode(d.id, d.data()))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

export async function getPromoCode(codigo: string): Promise<PromoCode | null> {
  if (!codigo) return null
  const doc = await adminDb.collection(COL).doc(codigo).get()
  return doc.exists ? toPromoCode(doc.id, doc.data()!) : null
}

export async function setPromoCodeActivo(codigo: string, activo: boolean): Promise<void> {
  await adminDb.collection(COL).doc(codigo).update({ activo })
}

export type ResultadoCanje =
  | { ok: true; promo: PromoAplicada }
  | { ok: false; motivo: MotivoRechazo }

/**
 * Canjea un código para una empresa.
 *
 * Va en transacción y eso NO es opcional: `maxCanjes` es lo que hace que "los
 * primeros 50" signifique algo, y sin transacción dos canjes simultáneos leen
 * el mismo contador y ambos pasan — que es exactamente el escenario de una
 * campaña, donde la gente entra al mismo tiempo.
 */
export async function canjearPromo({
  companyId,
  codigo,
  hoy,
  ahoraIso,
}: {
  companyId: string
  codigo: string
  hoy: string
  ahoraIso: string
}): Promise<ResultadoCanje> {
  if (!codigo) return { ok: false, motivo: 'no_existe' }
  const codeRef = adminDb.collection(COL).doc(codigo)
  const companyRef = adminDb.collection(COL_COMPANIES).doc(companyId)

  return adminDb.runTransaction(async (tx) => {
    // Todas las lecturas antes de cualquier escritura: Firestore lo exige.
    const [codeSnap, companySnap] = await Promise.all([tx.get(codeRef), tx.get(companyRef)])
    const code = codeSnap.exists ? toPromoCode(codeSnap.id, codeSnap.data()!) : null
    const plan = (companySnap.data()?.plan ?? {}) as { promo?: PromoAplicada | null; gratisHasta?: string | null }

    const motivo = puedeCanjear({ code, promoActual: plan.promo ?? null, hoy })
    if (motivo) return { ok: false, motivo }

    const promo = aplicarCanje({ code: code!, gratisHasta: plan.gratisHasta ?? null, hoy, ahoraIso })
    tx.update(codeRef, { canjes: FieldValue.increment(1) })
    // `merge: true` para no pisar maxVehiculos/periodicidad/gratisHasta.
    tx.set(companyRef, { plan: { promo } }, { merge: true })
    return { ok: true, promo }
  })
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

```bash
npx vitest run lib/data/__tests__/promoCodes.test.ts
```

Esperado: PASS (8 tests).

- [ ] **Step 7: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib
git add lib/data/promoCodes.ts lib/data/companies.ts firestore.rules lib/data/__tests__/promoCodes.test.ts
git commit -m "feat(promo): coleccion de codigos y canje en transaccion"
```

**Recordatorio para el humano (no lo hagas tú):** al desplegar hay que correr `node --env-file=.env.local scripts/deploy-firestore-rules.mjs`, o `promoCodes` queda sin la regla que la bloquea al cliente.

---

### Task 4: Los endpoints de canje

**Files:**
- Create: `app/api/promo/validar/route.ts`
- Create: `app/api/promo/canjear/route.ts`
- Test: `app/api/__tests__/promo-endpoints.test.ts`

**Interfaces:**
- Consumes: `normalizarCodigo`, `puedeCanjear` (Task 2); `getPromoCode`, `canjearPromo` (Task 3); `getCompany`; `hoyEnChile` de `lib/documents/status.ts`.

**Patrón de test:** sigue `app/api/__tests__/plan-endpoint.test.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `app/api/__tests__/promo-endpoints.test.ts` cubriendo **exactamente** estos casos:

```
validar:
 1. Sin sesión -> 401, sin consultar el código.
 2. Rol 'viewer' -> 403. Rol 'editor' -> 403.
 3. Código inexistente -> 200 { valido: false, motivo: 'no_existe' }.
 4. Código sano -> 200 { valido: true, mesesGratis, vehiculosIncluidos }.
 5. Empresa que ya canjeó -> { valido: false, motivo: 'ya_canjeado' }.
 6. NO incrementa el contador de canjes en ningún caso (canjearPromo nunca se llama).
 7. Un código con basura ('  ¡!  ') -> { valido: false, motivo: 'no_existe' } sin ir a Firestore.

canjear:
 8. Sin sesión -> 401. Rol 'viewer'/'editor' -> 403.
 9. Camino feliz -> 200 { ok: true, promo }, con canjearPromo llamado con el código NORMALIZADO.
10. Motivo de rechazo -> 409 { error: <motivo> }.
11. Cuerpo sin `codigo` -> 400.
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run app/api/__tests__/promo-endpoints.test.ts
```

Esperado: FAIL — las rutas no existen.

- [ ] **Step 3: Implementar `app/api/promo/validar/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { getPromoCode } from '@/lib/data/promoCodes'
import { normalizarCodigo, puedeCanjear } from '@/lib/promo/canje'
import { hoyEnChile } from '@/lib/documents/status'

export const dynamic = 'force-dynamic'

/**
 * Vista previa de un código, SOLO LECTURA: no muta nada y no incrementa el
 * contador de canjes. Alimenta lo que el usuario ve mientras escribe.
 *
 * Exige sesión y rol Administrador porque cuesta una lectura por pulsación
 * potencial, y porque canjear es cosa del Administrador de todas formas.
 */
export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const { codigo } = body as Record<string, unknown>
  if (typeof codigo !== 'string') return NextResponse.json({ error: 'codigo requerido' }, { status: 400 })

  const canonico = normalizarCodigo(codigo)
  // Un código que queda vacío tras normalizar no se busca: no existe y punto.
  if (!canonico) return NextResponse.json({ valido: false, motivo: 'no_existe' })

  const [code, company] = await Promise.all([getPromoCode(canonico), getCompany(m.companyId)])
  const motivo = puedeCanjear({
    code,
    promoActual: company?.plan?.promo ?? null,
    hoy: hoyEnChile(new Date()),
  })
  if (motivo) return NextResponse.json({ valido: false, motivo })

  return NextResponse.json({
    valido: true,
    mesesGratis: code!.mesesGratis,
    vehiculosIncluidos: code!.vehiculosIncluidos,
  })
}
```

- [ ] **Step 4: Implementar `app/api/promo/canjear/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { canjearPromo } from '@/lib/data/promoCodes'
import { normalizarCodigo } from '@/lib/promo/canje'
import { hoyEnChile } from '@/lib/documents/status'

export const dynamic = 'force-dynamic'

/**
 * Canjea un código. Canjear cambia lo que la empresa paga, así que es cosa del
 * Administrador. La revalidación de si el código sirve ocurre DENTRO de la
 * transacción de `canjearPromo`, no acá: entre esta comprobación y la escritura
 * el código puede agotarse.
 */
export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const { codigo } = body as Record<string, unknown>
  if (typeof codigo !== 'string') return NextResponse.json({ error: 'codigo requerido' }, { status: 400 })

  const ahora = new Date()
  const res = await canjearPromo({
    companyId: m.companyId,
    codigo: normalizarCodigo(codigo),
    hoy: hoyEnChile(ahora),
    ahoraIso: ahora.toISOString(),
  })
  if (!res.ok) return NextResponse.json({ error: res.motivo }, { status: 409 })
  return NextResponse.json({ ok: true, promo: res.promo })
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
npx vitest run app/api/__tests__/promo-endpoints.test.ts
```

Esperado: PASS.

- [ ] **Step 6: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib && npm run build
git add app/api/promo app/api/__tests__/promo-endpoints.test.ts
git commit -m "feat(promo): endpoints de validacion y canje"
```

---

### Task 5: Administración de códigos en `/admin`

**Files:**
- Create: `app/api/admin/promo-codes/route.ts`
- Create: `app/api/admin/promo-codes/[id]/route.ts`
- Create: `components/admin/PromoCodesPanel.tsx`
- Modify: `app/(app)/admin/page.tsx`
- Test: `app/api/__tests__/admin-promo-codes.test.ts`

**Interfaces:**
- Consumes: `createPromoCode`, `listPromoCodes`, `setPromoCodeActivo` (Task 3); `normalizarCodigo` (Task 2); `MAX_MESES_PROMO`, `MAX_VEHICULOS_PROMO` (Task 1); `isAdminEmail`.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `app/api/__tests__/admin-promo-codes.test.ts` cubriendo **exactamente**:

```
1. POST sin sesión -> 401. Con sesión pero email fuera de ADMIN_EMAILS -> 403.
   (El guard es `isAdminEmail`, distinto del rol 'admin' de empresa: un
   Administrador de empresa NO puede crear códigos.)
2. POST con código que queda vacío tras normalizar -> 400.
3. POST con mesesGratis 0 Y vehiculosIncluidos 0 -> 400 (no otorga nada).
4. POST con mesesGratis 25 -> 400. Con vehiculosIncluidos 101 -> 400.
5. POST camino feliz -> createPromoCode llamado con el código NORMALIZADO.
6. PATCH sin ser admin de plataforma -> 403.
7. PATCH camino feliz -> setPromoCodeActivo llamado con el id y el booleano.
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run app/api/__tests__/admin-promo-codes.test.ts
```

Esperado: FAIL — las rutas no existen.

- [ ] **Step 3: Implementar `app/api/admin/promo-codes/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { isAdminEmail } from '@/lib/auth/admin'
import { createPromoCode } from '@/lib/data/promoCodes'
import { normalizarCodigo } from '@/lib/promo/canje'
import { MAX_MESES_PROMO, MAX_VEHICULOS_PROMO } from '@/lib/types'

export const dynamic = 'force-dynamic'

// `getMembership()` y no `getCurrentUser()`: este endpoint MUTA, y
// `getCurrentUser()` por diseño no comprueba revocación de sesión.
export async function POST(req: NextRequest) {
  const me = await getMembership()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Admin de PLATAFORMA, no el rol 'admin' de empresa: crear códigos es del equipo.
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  const codigo = normalizarCodigo(typeof b.codigo === 'string' ? b.codigo : '')
  if (!codigo) return NextResponse.json({ error: 'codigo inválido' }, { status: 400 })

  const meses = Number(b.mesesGratis)
  const vehiculos = Number(b.vehiculosIncluidos)
  if (!Number.isFinite(meses) || meses < 0 || meses > MAX_MESES_PROMO) {
    return NextResponse.json({ error: 'mesesGratis inválido' }, { status: 400 })
  }
  if (!Number.isFinite(vehiculos) || vehiculos < 0 || vehiculos > MAX_VEHICULOS_PROMO) {
    return NextResponse.json({ error: 'vehiculosIncluidos inválido' }, { status: 400 })
  }
  // Un código que no otorga nada es un error de captura, no una campaña.
  if (meses === 0 && vehiculos === 0) {
    return NextResponse.json({ error: 'el código no otorga nada' }, { status: 400 })
  }

  const maxCanjes = b.maxCanjes == null || b.maxCanjes === '' ? null : Math.floor(Number(b.maxCanjes))
  if (maxCanjes != null && (!Number.isFinite(maxCanjes) || maxCanjes < 1)) {
    return NextResponse.json({ error: 'maxCanjes inválido' }, { status: 400 })
  }
  const expiraEn =
    typeof b.expiraEn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.expiraEn) ? b.expiraEn : null

  await createPromoCode(
    {
      codigo,
      descripcion: typeof b.descripcion === 'string' ? b.descripcion.slice(0, 200) : '',
      mesesGratis: Math.floor(meses),
      vehiculosIncluidos: Math.floor(vehiculos),
      expiraEn,
      maxCanjes,
    },
    me.uid,
  )
  return NextResponse.json({ ok: true, codigo })
}
```

- [ ] **Step 4: Implementar `app/api/admin/promo-codes/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { isAdminEmail } from '@/lib/auth/admin'
import { setPromoCodeActivo } from '@/lib/data/promoCodes'

export const dynamic = 'force-dynamic'

// Next 16: `params` es una Promise.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMembership()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const { activo } = body as Record<string, unknown>
  if (typeof activo !== 'boolean') return NextResponse.json({ error: 'activo requerido' }, { status: 400 })

  await setPromoCodeActivo(id, activo)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: El panel**

Crea `components/admin/PromoCodesPanel.tsx`: un client component que recibe `codigos: PromoCode[]`, muestra una tabla (código, qué otorga, canjes / tope, vence, estado) con un switch para activar/desactivar vía `PATCH`, y un formulario para crear uno nuevo (código, descripción, meses, vehículos, expira, tope) vía `POST`. Sigue el estilo y el manejo de estado de `components/admin/AdminCompaniesTable.tsx`, que ya resuelve este mismo problema para las empresas.

Tres cosas obligatorias:
- **No mutes props ni estado directamente** (`react-hooks/immutability` es error en este repo): copia a estado local, como hace `AdminCompaniesTable`.
- Todo camino de fallo del `fetch` —incluido el que **rechaza**— tiene que apagar el estado de carga y mostrar un mensaje. Ya mordió dos veces en este proyecto.
- No hay borrado, solo activar/desactivar: `plan.promo` guarda una copia de lo otorgado, así que borrar el código no rompería nada pero perdería el rastro de la campaña.

Y en `app/(app)/admin/page.tsx`, carga `listPromoCodes()` junto a `listAllCompanies()` y renderiza `<PromoCodesPanel codigos={codigos} />` bajo la tabla de empresas.

- [ ] **Step 6: Correr los tests y verificar**

```bash
npx vitest run app/api/__tests__/admin-promo-codes.test.ts
npx tsc --noEmit && npm test && npx eslint app components lib && npm run build
```

- [ ] **Step 7: Commitear**

```bash
git add app/api/admin/promo-codes components/admin/PromoCodesPanel.tsx app/\(app\)/admin/page.tsx app/api/__tests__/admin-promo-codes.test.ts
git commit -m "feat(promo): administracion de codigos en el panel"
```

---

### Task 6: El campo de canje y su montaje en `/plan`

**Files:**
- Create: `components/plan/CampoPromo.tsx`
- Modify: `components/plan/SelectorPlan.tsx`
- Test: `components/__tests__/CampoPromo.test.tsx`

**Interfaces:**
- Consumes: `POST /api/promo/validar`, `POST /api/promo/canjear` (Task 4); `cargoDe` con `vehiculosIncluidos` (Task 1).

- [ ] **Step 1: Crear `components/plan/CampoPromo.tsx`**

```tsx
'use client'
import { useState } from 'react'

export interface PromoValidada {
  codigo: string
  mesesGratis: number
  vehiculosIncluidos: number
}

const MOTIVOS: Record<string, string> = {
  no_existe: 'Ese código no existe.',
  inactivo: 'Ese código ya no está disponible.',
  expirado: 'Ese código venció.',
  agotado: 'Ese código ya se usó todas las veces disponibles.',
  ya_canjeado: 'Ya canjeaste un código promocional en esta cuenta.',
}

/**
 * Campo de código promocional, compartido por `/plan` y `/facturacion`.
 *
 * Solo VALIDA: quién canjea y cuándo lo decide el padre, porque en el alta el
 * canje tiene que ocurrir después de guardar el plan (la promoción empieza
 * donde termina la prueba, y esa fecha no existe hasta que el plan se guardó).
 */
export default function CampoPromo({
  onValidada,
}: {
  onValidada: (p: PromoValidada | null) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [validando, setValidando] = useState(false)
  const [ok, setOk] = useState<PromoValidada | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function validar() {
    if (!codigo.trim()) return
    setValidando(true)
    setError(null)
    setOk(null)
    onValidada(null)
    try {
      const res = await fetch('/api/promo/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      if (!res.ok) {
        setError('No se pudo revisar el código. Inténtalo de nuevo.')
        return
      }
      const data = await res.json()
      if (!data.valido) {
        setError(MOTIVOS[data.motivo] ?? 'Ese código no se puede usar.')
        return
      }
      const p: PromoValidada = {
        codigo: codigo.trim(),
        mesesGratis: data.mesesGratis,
        vehiculosIncluidos: data.vehiculosIncluidos,
      }
      setOk(p)
      onValidada(p)
    } catch {
      // Si el fetch RECHAZA (sin conexión, timeout, DNS) el catch es lo único
      // que apaga el estado de carga: sin él el botón queda muerto.
      setError('No se pudo revisar el código. Inténtalo de nuevo.')
    } finally {
      setValidando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm text-azul hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        ¿Tienes un código promocional?
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <label htmlFor="promo" className="block text-sm font-medium text-acero">
        Código promocional
      </label>
      <div className="flex gap-2">
        <input
          id="promo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-xl border border-linea bg-superficie px-3 py-2.5 uppercase text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
        />
        <button
          type="button"
          onClick={validar}
          disabled={validando}
          className="shrink-0 rounded-xl border border-linea bg-superficie px-4 py-2.5 font-medium text-tinta hover:bg-lienzo disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
        >
          {validando ? 'Revisando…' : 'Aplicar'}
        </button>
      </div>
      {error && <p className="text-sm text-vencido">{error}</p>}
      {ok && (
        <p className="text-sm text-vigente">
          {ok.mesesGratis > 0 && `${ok.mesesGratis} ${ok.mesesGratis === 1 ? 'mes' : 'meses'} gratis`}
          {ok.mesesGratis > 0 && ok.vehiculosIncluidos > 0 && ' · '}
          {ok.vehiculosIncluidos > 0 &&
            `cubre ${ok.vehiculosIncluidos} ${ok.vehiculosIncluidos === 1 ? 'vehículo' : 'vehículos'}`}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Montarlo en `SelectorPlan`**

En `components/plan/SelectorPlan.tsx`:

1. Importa `CampoPromo` y su tipo, y agrega estado: `const [promo, setPromo] = useState<PromoValidada | null>(null)`.

2. Renderiza `<CampoPromo onValidada={setPromo} />` **entre** la card del cargo y el botón de continuar.

3. Bajo el campo, cuando hay `promo` y `promo.vehiculosIncluidos > 0`, muestra qué se pagaría durante la promoción, calculado con la firma nueva:

```tsx
      {promo && promo.vehiculosIncluidos > 0 && (
        <p className="text-sm text-acero">
          Durante {promo.mesesGratis === 1 ? 'el mes' : `los ${promo.mesesGratis} meses`} de promoción
          pagarías{' '}
          <strong className="text-tinta">
            {formatCLP(cargoDe({ vehiculos, periodicidad, vehiculosIncluidos: promo.vehiculosIncluidos }).monto)}
          </strong>{' '}
          {periodicidad === 'anual' ? 'al año' : 'al mes'}.
        </p>
      )}
```

**El titular del cargo NO cambia**: sigue mostrando el precio pleno. Convertir el número grande en un acertijo de tres cifras es peor que mostrar el precio real y explicar el descuento aparte.

4. En `enviar`, **después** de que el plan se guardó y **antes** de navegar, canjea si hay código:

```ts
    // El canje va DESPUÉS de guardar: `promo.hasta` se calcula desde
    // `gratisHasta`, que no existe hasta que el plan está guardado. Si falla
    // acá, el plan ya quedó a salvo y el usuario puede canjear en Facturación,
    // que es la segunda puerta — por eso el mensaje lo manda ahí y no reintenta.
    if (promo) {
      try {
        const res = await fetch('/api/promo/canjear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo: promo.codigo }),
        })
        if (!res.ok) {
          setGuardando(false)
          setError('Tu plan quedó guardado, pero el código no se pudo canjear. Inténtalo desde Facturación.')
          return
        }
      } catch {
        setGuardando(false)
        setError('Tu plan quedó guardado, pero el código no se pudo canjear. Inténtalo desde Facturación.')
        return
      }
    }
```

- [ ] **Step 3: Escribir los tests**

Crea `components/__tests__/CampoPromo.test.tsx` cubriendo **exactamente**:

```
1. Arranca colapsado: solo se ve el enlace "¿Tienes un código promocional?".
2. Al abrirlo y validar un código bueno, muestra lo que otorga y llama a
   `onValidada` con el código, los meses y los vehículos.
3. Con un motivo de rechazo, muestra el mensaje en español y llama a
   `onValidada(null)`.
4. Si el fetch RECHAZA (red caída), muestra el error y el botón vuelve a estar
   habilitado — no queda muerto.
5. Validar de nuevo limpia el resultado anterior antes de pedir (no se queda el
   "3 meses gratis" de un código que ya no está aplicado).
```

Y **agrega** a `components/__tests__/SelectorPlan.test.tsx`:

```
6. Con un código validado, "Continuar" hace primero POST a /api/plan y después
   POST a /api/promo/canjear, en ese orden.
7. Si el canje falla, se muestra el mensaje que dice que el plan quedó guardado
   y NO se navega.
```

- [ ] **Step 4: Verificar y commitear**

```bash
npx vitest run components/__tests__/CampoPromo.test.tsx components/__tests__/SelectorPlan.test.tsx
npx tsc --noEmit && npm test && npx eslint app components lib && npm run build
git add components/plan components/__tests__/CampoPromo.test.tsx components/__tests__/SelectorPlan.test.tsx
git commit -m "feat(promo): campo de canje en el alta de plan"
```

---

### Task 7: Facturación y documentación

**Files:**
- Modify: `app/(app)/facturacion/page.tsx`
- Create: `components/plan/PanelPromo.tsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Leer el archivo antes de editarlo**

`app/(app)/facturacion/page.tsx` ya trae de tareas anteriores: `periodicidad`, `cargo`, `prueba`, `yaEligio`, el helper `fechaCL` y el botón "Elegir plan". **Léelo completo antes de tocar nada** y suma solo lo que falta.

- [ ] **Step 2: El panel de promoción**

Crea `components/plan/PanelPromo.tsx`, un client component que recibe `promo: PromoAplicada | null` y monta `CampoPromo` **solo si no hay promo**, canjeando directo (acá el plan ya existe, así que no hay orden que respetar):

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CampoPromo, { type PromoValidada } from '@/components/plan/CampoPromo'

export default function PanelPromo() {
  const router = useRouter()
  const [canjeando, setCanjeando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function canjear(p: PromoValidada | null) {
    if (!p) return
    setCanjeando(true)
    setError(null)
    try {
      const res = await fetch('/api/promo/canjear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: p.codigo }),
      })
      if (!res.ok) {
        setError('No se pudo canjear el código. Inténtalo de nuevo.')
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo canjear el código. Inténtalo de nuevo.')
    } finally {
      setCanjeando(false)
    }
  }

  return (
    <div className="space-y-2">
      <CampoPromo onValidada={canjear} />
      {canjeando && <p className="text-sm text-acero">Canjeando…</p>}
      {error && <p className="text-sm text-vencido">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Montarlo en Facturación**

En la página, calcula la fase y el cargo con cobertura:

```ts
  const promo = company?.plan?.promo ?? null
  const fase = faseDelPlan({ gratisHasta: company?.plan?.gratisHasta, promoHasta: promo?.hasta }, hoyEnChile(new Date()))
  const cobertura = fase === 'promo' ? (promo?.vehiculosIncluidos ?? 0) : 0
  const cargo = cargoDe({ vehiculos: cupo, periodicidad, vehiculosIncluidos: cobertura })
```

(reemplaza el `cargoDe` que ya estaba). En la sección "Tu plan", agrega dos filas al `<dl>` cuando hay promoción:

```tsx
          {promo && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-acero">Código aplicado</dt>
                <dd className="font-medium text-tinta">{promo.codigo}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-acero">Promoción hasta</dt>
                <dd className="font-medium text-tinta tabular-nums">{fechaCL(promo.hasta)}</dd>
              </div>
            </>
          )}
```

Y cuando `cargo.monto !== cargo.montoPleno`, una línea que diga qué se pagará después:

```tsx
          <div className="flex justify-between gap-4">
            <dt className="text-acero">Al terminar la promoción</dt>
            <dd className="font-medium text-tinta tabular-nums">
              {formatCLP(cargo.montoPleno)} / {cargo.unidad}
            </dd>
          </div>
```

Dentro del bloque `esAdmin`, si **no** hay promo, monta `<PanelPromo />`.

- [ ] **Step 4: Documentar en `CLAUDE.md`**

Suma al párrafo de `companies/{companyId}` (después de lo que ya dice de `plan`):

```
`plan.promo?: PromoAplicada | null` guarda el código canjeado (uno por empresa) como **copia congelada** de lo que otorgó: editar el código después no altera lo ya canjeado. **`gratisHasta` NO se toca al canjear** — la promoción empieza donde termina la prueba y lleva su propia fecha (`promo.hasta = addMeses(max(hoy, gratisHasta), mesesGratis)`), porque durante la prueba no se cobra nada y si la cobertura aplicara a los días de prueba que quedaban, canjear dejaría al usuario **peor** que no canjear. De ahí las tres fases de `faseDelPlan` (`lib/plan/fase.ts`): `prueba` (no se cobra), `promo` (se cobra `max(0, vehículos − vehiculosIncluidos)`) y `plena` (todos).
```

Y agrega un bullet en **Arquitectura**:

```
- `lib/promo/canje.ts` — **reglas puras del canje de códigos** (sin Firebase): `normalizarCodigo` (mayúsculas, solo `A-Z0-9-`, tope 32 — estricta porque el código **es el id del documento** en `promoCodes/{CODIGO}`, y Firestore prohíbe la barra), `puedeCanjear` → `MotivoRechazo | null` (mismo patrón que `lib/transferencias/estado.ts`; **`ya_canjeado` se comprueba antes que `no_existe`** para no filtrar si un código existe a quien ya no puede usarlo) y `aplicarCanje`. La colección `promoCodes/{CODIGO}` está **bloqueada al cliente** en `firestore.rules`; el id del documento es el código canónico, lo que da la unicidad gratis y permite leerlo **por id dentro de la transacción**. `canjearPromo` (`lib/data/promoCodes.ts`) corre en **transacción de Firestore** y eso no es opcional: `maxCanjes` es lo que hace que "los primeros 50" signifique algo, y sin transacción dos canjes simultáneos leen el mismo contador. Endpoints: `POST /api/promo/validar` (solo lectura, alimenta la vista previa) y `POST /api/promo/canjear`, ambos con `billing:manage`; más `/api/admin/promo-codes` bajo `isAdminEmail`. **En el alta el canje va DESPUÉS de guardar el plan**, porque `promo.hasta` se calcula desde `gratisHasta`, que no existe hasta entonces; si falla ahí, el plan ya quedó a salvo y el mensaje manda a Facturación, que es la segunda puerta de canje.
```

Verifica cada afirmación contra el código real antes de escribirla.

- [ ] **Step 5: Verificar y commitear**

```bash
npx tsc --noEmit && npm test && npx eslint app components lib && npm run build
git add app/\(app\)/facturacion/page.tsx components/plan/PanelPromo.tsx CLAUDE.md
git commit -m "feat(promo): canje y estado de la promocion en facturacion"
```

---

## Verificación final

```bash
npx tsc --noEmit && npm run build && npx eslint app components lib && npm test
```

Y dos cosas que ningún test cubre y que hace el humano:

1. **Desplegar las reglas de Firestore** (`node --env-file=.env.local scripts/deploy-firestore-rules.mjs`), o `promoCodes` queda sin la regla que la bloquea al cliente.
2. Crear un código real en `/admin` y canjearlo de punta a punta: en el alta de una cuenta nueva y desde Facturación en una cuenta existente.
