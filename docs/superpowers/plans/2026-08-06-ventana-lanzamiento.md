# Ventana de lanzamiento — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La prueba deja de ser "30 días desde el alta" y pasa a ser una fecha fija igual para todos (`2026-09-01`), y toda cuenta existente queda lista para que la pasarela pueda cobrarle.

**Architecture:** `plan.gratisHasta` sigue siendo el campo y toda la maquinaria que lo lee (`estadoPrueba`, `faseDelPlan`, `coberturaDe`, la franja, el CSV) queda intacta. Lo único que cambia es **quién estampa la fecha**. Un script one-time nivela las cuentas que ya existen y les siembra el bloque `suscripcion` que la pasarela va a necesitar.

**Tech Stack:** TypeScript, Firestore (Admin SDK), Vitest.

**Contexto:** Segundo entregable de tres del spec [2026-08-06-pasarela-flow-design.md](../specs/2026-08-06-pasarela-flow-design.md) (§3 y §12). Depende de que el plan de formato de fechas ya esté aplicado. Es desplegable solo: sin pasarela, una cuenta con `gratisHasta` vencida simplemente no se cobra, exactamente igual que hoy.

## Global Constraints

- **`LANZAMIENTO_HASTA = '2026-09-01'`**, y es el **último día gratis inclusive**: el primer cobro cae el 2 de septiembre. Todos los bordes de fecha del proyecto son inclusivos (`faseDelPlan`, `documentStatus`) y este no puede ser la excepción.
- **Esto tiene que estar en producción antes del 1 de septiembre de 2026**, y el script debe haber corrido antes de esa fecha.
- Fechas visibles en **`dd/mm/aaaa`** vía `lib/fecha.ts`. Nunca `toLocaleDateString`.
- `estadoPrueba`, `faseDelPlan` y `coberturaDe` **no cambian de comportamiento**.
- El tipo `EstadoPrueba` **conserva sus nombres** (`activa`/`por_terminar`/`vencida`/`sin_prueba`): renombrarlo es ruido en decenas de archivos sin ningún beneficio.
- Los scripts de operación son `.mjs`, cargan credenciales con `--env-file=.env.local`, y son **dry-run salvo `--apply`**.
- Firestore Admin **rechaza `undefined`**: construir los objetos sin claves `undefined` o usar `?? null`.
- Todo el código, comentarios y UI en español neutro de Chile, tratando de "tú".
- Tras cambios: `npx tsc --noEmit`, `npm run build` y `npx eslint app components lib`.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `lib/plan/prueba.ts` | **Modificado.** Aparece `LANZAMIENTO_HASTA`, se va `DIAS_PRUEBA`. `addDias` se conserva. |
| `lib/types.ts` | **Modificado.** Tipos `TarjetaRegistrada` y `Suscripcion`, y `PlanData.suscripcion`. |
| `lib/data/companies.ts` | **Modificado.** `createCompany` siembra `suscripcion`. |
| `app/api/plan/route.ts` | **Modificado.** Estampa la fecha de lanzamiento y siembra `suscripcion`. |
| `components/plan/SelectorPlan.tsx`, `components/plan/FranjaPrueba.tsx`, `app/(app)/facturacion/page.tsx` | **Modificados.** Los textos. |
| `scripts/migrar-suscripciones.mjs` | **Nuevo.** El one-time. |
| `scripts/backfill-prueba.mjs` | **Eliminado.** Lo reemplaza el anterior. |

---

### Task 1: La fecha de lanzamiento y los tipos de suscripción

**Files:**
- Modify: `lib/plan/prueba.ts`
- Modify: `lib/types.ts`
- Modify: `lib/data/companies.ts`
- Modify: `app/api/plan/route.ts`
- Test: `lib/plan/__tests__/prueba.test.ts`, `app/api/__tests__/plan-endpoint.test.ts`

**Interfaces:**
- Consumes: `addDias`, `hoyEnChile`, `savePlan`.
- Produces: `LANZAMIENTO_HASTA: string`, `gratisHastaDeAlta(hoy: string): string | null`, y los tipos `TarjetaRegistrada`, `Suscripcion`, `PlanData.suscripcion`, `suscripcionInicial(proximoCobro: string): Suscripcion`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `lib/plan/__tests__/prueba.test.ts`:

```ts
import { LANZAMIENTO_HASTA, gratisHastaDeAlta } from '@/lib/plan/prueba'

describe('gratisHastaDeAlta', () => {
  it('durante la ventana entrega la fecha de lanzamiento', () => {
    expect(gratisHastaDeAlta('2026-08-06')).toBe(LANZAMIENTO_HASTA)
  })

  // El último día es gratis: el borde es inclusivo, igual que en faseDelPlan.
  it('el último día de la ventana todavía cuenta', () => {
    expect(gratisHastaDeAlta(LANZAMIENTO_HASTA)).toBe(LANZAMIENTO_HASTA)
  })

  // Estampar una fecha ya vencida haría que `estadoPrueba` devolviera
  // 'vencida' y la franja le dijera "tu prueba terminó" a alguien que se
  // acaba de registrar. Por eso `null` y no la constante.
  it('pasada la ventana no entrega ninguna fecha', () => {
    expect(gratisHastaDeAlta('2026-09-02')).toBeNull()
    expect(gratisHastaDeAlta('2027-01-01')).toBeNull()
  })
})
```

Y en el mismo archivo, comprobar que la maquinaria existente no cambió:

```ts
describe('estadoPrueba sigue igual', () => {
  it('sin fecha no anuncia ningún plazo', () => {
    expect(estadoPrueba(null, new Date('2026-09-05T12:00:00Z')).estado).toBe('sin_prueba')
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/plan/__tests__/prueba.test.ts`
Expected: FAIL — `LANZAMIENTO_HASTA` y `gratisHastaDeAlta` no existen.

- [ ] **Step 3: Cambiar `lib/plan/prueba.ts`**

Borrar `export const DIAS_PRUEBA = 30` y agregar:

```ts
/**
 * Último día sin cobro de la promoción de lanzamiento, **inclusive**.
 *
 * Reemplaza a la prueba de 30 días por cuenta, que tenía un defecto de
 * origen: la ventana de regalo nunca se cerraba, porque cada alta nueva la
 * corría un mes más hacia adelante. Con una fecha fija, todos terminan el
 * mismo día — que es lo que una promoción de lanzamiento debe hacer.
 */
export const LANZAMIENTO_HASTA = '2026-09-01'

/**
 * Qué `gratisHasta` corresponde a una cuenta que se da de alta hoy.
 *
 * Devuelve `null` pasada la ventana, y eso no es un detalle: estampar una
 * fecha ya vencida haría que `estadoPrueba` respondiera `'vencida'` y la
 * franja le dijera "tu prueba terminó" a un cliente que acaba de registrarse.
 * Ambas son cadenas `YYYY-MM-DD`, así que el orden lexicográfico es el
 * cronológico y el borde es inclusivo, igual que en `faseDelPlan`.
 */
export function gratisHastaDeAlta(hoy: string): string | null {
  return hoy <= LANZAMIENTO_HASTA ? LANZAMIENTO_HASTA : null
}
```

**`addDias` se conserva**: la escalera de impago del tercer entregable lo usa.

- [ ] **Step 4: Agregar los tipos en `lib/types.ts`**

```ts
export interface TarjetaRegistrada {
  /** Lo que devuelve Flow en getRegisterStatus. Nunca guardamos más que esto. */
  marca: string
  ultimos4: string
  /** ISO completo. */
  registradaEn: string
}

export interface Suscripcion {
  /** El cliente en Flow. `null` hasta que se crea. */
  flowCustomerId: string | null
  tarjeta: TarjetaRegistrada | null
  /**
   * `YYYY-MM-DD`: inicio del ciclo actualmente pagado.
   * `null` = todavía no se cobró ni una vez, así que no hay ciclo que prorratear.
   */
  cicloDesde: string | null
  /** `YYYY-MM-DD`: el día en que toca ejecutar el próximo cargo. */
  proximoCobro: string
  /**
   * `YYYY-MM-DD`: el día del PRIMER cobro rechazado. `null` = al día.
   * Es el único campo que mueve la escalera de impago completa.
   */
  impagoDesde: string | null
  /** El cupo que reemplaza a `maxVehiculos` al cerrar el ciclo. `null` = sin cambio. */
  cupoProximoCiclo: number | null
  /** `YYYY-MM-DD`: baja pedida, efectiva al cerrar el ciclo pagado. */
  cancelaEn: string | null
}

/** Un bloque nuevo, con todo en su estado inicial. Sin claves `undefined`. */
export function suscripcionInicial(proximoCobro: string): Suscripcion {
  return {
    flowCustomerId: null,
    tarjeta: null,
    cicloDesde: null,
    proximoCobro,
    impagoDesde: null,
    cupoProximoCiclo: null,
    cancelaEn: null,
  }
}
```

Y sumar a `PlanData`:

```ts
  /** El estado de cobro. Ausente en cuentas anteriores a la pasarela. */
  suscripcion?: Suscripcion
```

**No agregar `suscripcion` a `DEFAULT_PLAN`.** `getCompany` hace `{ ...DEFAULT_PLAN, ...(d.plan ?? {}) }`, así que un default inyectaría un bloque falso en toda cuenta que no lo tenga — el mismo error que `periodicidad` ya tiene fijado con un test.

- [ ] **Step 5: `createCompany` NO siembra la suscripción — corrección al plan**

Una versión anterior de este paso mandaba sembrar `suscripcion` en `createCompany`. **Es incorrecto y no se hace.** Se deja escrito para que nadie lo reintroduzca:

`createCompany` (`lib/data/companies.ts:29-39`) escribe `plan: { maxVehiculos, periodicidad: null }` y **nada más**. No conoce `gratisHasta` — esa fecha la estampa `POST /api/plan` más tarde. Y una empresa recién creada todavía no eligió periodicidad, así que **no existe ningún `proximoCobro` que se pueda calcular** para ella: cualquier valor que se sembrara ahí sería inventado.

La invariante correcta es más simple: **`periodicidad` y `suscripcion` se escriben juntas, en `POST /api/plan`** (Step 6). No hay forma de llegar a una empresa con `periodicidad` y sin `suscripcion`, porque el mismo `savePlan` pone las dos. Y una empresa sin `periodicidad` no puede cobrarse de todos modos — `debeElegirPlan` la manda a `/plan` antes de dejarla usar la app.

Las cuentas que ya existen en producción las cubre el script de migración (Task 3), que es donde sí hay que sembrar.

**Verificación de que la invariante se sostiene:** buscar todos los llamadores de `savePlan` y confirmar que ninguno escribe `periodicidad` sin `suscripcion`. Si aparece alguno además de `POST /api/plan`, reportarlo antes de seguir.

- [ ] **Step 6: `POST /api/plan` usa la fecha de lanzamiento**

En `app/api/plan/route.ts`, reemplazar:

```ts
  const gratisHasta = addDias(hoyEnChile(new Date()), DIAS_PRUEBA)
  await savePlan(m.companyId, { periodicidad: periodicidad as Periodicidad, maxVehiculos: vehiculos, gratisHasta })
```

por:

```ts
  const hoy = hoyEnChile(new Date())
  const gratisHasta = gratisHastaDeAlta(hoy)
  await savePlan(m.companyId, {
    periodicidad: periodicidad as Periodicidad,
    maxVehiculos: vehiculos,
    gratisHasta,
    // El primer cobro cae al día siguiente del último día gratis, o hoy mismo
    // si la ventana de lanzamiento ya pasó.
    suscripcion: suscripcionInicial(gratisHasta ? addDias(gratisHasta, 1) : hoy),
  })
```

Actualizar el import (`gratisHastaDeAlta` en vez de `DIAS_PRUEBA`) y el texto del `billingRequest` de las líneas 102-103: `prueba hasta ${gratisHasta}` pasa a `sin cobro hasta ${gratisHasta ?? 'no aplica'}`.

- [ ] **Step 7: Correr los tests**

Run: `npx vitest run lib/plan lib/data app/api`
Expected: PASS. Los tests de `plan-endpoint.test.ts` que afirmaban `hoy + 30` hay que actualizarlos a la fecha de lanzamiento. Agregar uno nuevo: **el alta después de la ventana guarda `gratisHasta: null` y un `proximoCobro` de hoy**.

- [ ] **Step 8: Verificar que el test muerde**

Cambiar `gratisHastaDeAlta` para que devuelva siempre `LANZAMIENTO_HASTA` y confirmar que falla el caso "pasada la ventana no entrega ninguna fecha". Revertir.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(plan): la prueba pasa a ser una ventana de lanzamiento con fecha fija"
```

---

### Task 2: Los textos

**Files:**
- Modify: `components/plan/SelectorPlan.tsx`
- Modify: `components/plan/FranjaPrueba.tsx`
- Modify: `app/(app)/facturacion/page.tsx`

**Interfaces:**
- Consumes: `LANZAMIENTO_HASTA` (Task 1), `fechaCalendario` de `lib/fecha.ts`.
- Produces: nada.

- [ ] **Step 1: `SelectorPlan.tsx` línea 291**

Reemplazar:

```tsx
        Empiezas con 30 días de prueba. Coordinamos el pago contigo antes de que terminen.
```

por un texto que dependa de si la ventana sigue abierta:

```tsx
        {gratisHastaDeAlta(hoy)
          ? `Promoción de lanzamiento: no se cobra nada hasta el ${fechaCalendario(LANZAMIENTO_HASTA)}.`
          : 'El cobro empieza al contratar.'}
```

`hoy` llega como prop desde el servidor (`hoyEnChile(new Date())`), **no** se calcula en el cliente: el reloj del navegador puede estar en cualquier zona horaria y esta decisión tiene que coincidir con la que tomó el servidor al guardar.

- [ ] **Step 2: `FranjaPrueba.tsx`**

Cambiar los textos de la rama sin promoción:

```tsx
  const texto =
    estado === 'vencida'
      ? 'La promoción de lanzamiento terminó. Sigue usando TapCar mientras coordinamos tu plan.'
      : dias === 0
        ? 'La promoción de lanzamiento termina hoy.'
        : `Promoción de lanzamiento · ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}.`
```

**Conservar el comentario de las líneas 100-102 tal cual.** Dice que el texto promete a propósito que la app no se bloquea, porque un aviso que amenaza con algo que no ocurre entrena a la gente a ignorar todos los avisos — incluidos los de vencimiento de documentos, que son el producto. Eso sigue siendo cierto en este entregable. **Cuando la pasarela agregue el bloqueo real, este texto tiene que cambiar**; el tercer plan lo hace.

- [ ] **Step 3: `app/(app)/facturacion/page.tsx` línea 98**

```tsx
<dt className="text-acero">{prueba.estado === 'vencida' ? 'Promoción de lanzamiento terminada el' : 'Sin cobro hasta'}</dt>
```

- [ ] **Step 4: Verificar en el navegador**

Levantar el preview y abrir el dashboard de una cuenta con `gratisHasta` futura: la franja debe decir "Promoción de lanzamiento · quedan N días" con la fecha en `dd/mm/aaaa`. Sacar una captura para el commit.

- [ ] **Step 5: Correr tests, tipos, build y lint**

```bash
npx vitest run && npx tsc --noEmit && npm run build && npx eslint app components lib
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(plan): los textos hablan de la promocion de lanzamiento"
```

---

### Task 3: El script de migración

**Files:**
- Create: `scripts/migrar-suscripciones.mjs`
- Delete: `scripts/backfill-prueba.mjs`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: los tipos de Task 1 (replicados en JS, porque un `.mjs` no puede importar TypeScript).
- Produces: nada en código.

- [ ] **Step 1: Escribir el script**

Crear `scripts/migrar-suscripciones.mjs`, siguiendo la forma de `scripts/backfill-resumen.mjs` (init del Admin SDK desde las variables de entorno, dry-run salvo `--apply`, resumen al final).

Por cada documento de `companies`, calcular el parche:

```js
const LANZAMIENTO_HASTA = '2026-09-01'

// 1. Nivelar la promoción de lanzamiento.
//    Es una promoción de lanzamiento: no tiene sentido que quien llegó
//    primero reciba menos días que quien llegó después.
const actual = plan.gratisHasta ?? null
const gratisHasta = !actual || actual < LANZAMIENTO_HASTA ? LANZAMIENTO_HASTA : actual

// 2. Cerrar el hueco de `periodicidad` ausente.
//    La distinción "ausente ≠ null" existía para que la puerta de /plan no
//    dependiera de que un backfill hubiera corrido. Con pasarela deja de ser
//    sostenible: si no sabemos cada cuánto cobrarle a una cuenta, no podemos
//    cobrarle. En `null`, `debeElegirPlan` la manda a /plan a elegir, usando
//    maquinaria que ya existe y ya está probada.
const tocaPeriodicidad = !('periodicidad' in plan)

// 3. Sembrar el bloque de suscripción.
//    Sin esto, la empresa nunca aparecería en la consulta del cron: no se le
//    cobraría jamás, y tampoco se la bloquearía.
const tocaSuscripcion = !plan.suscripcion
```

El parche se arma con notación de punto (`'plan.gratisHasta'`, `'plan.periodicidad'`, `'plan.suscripcion'`) y se escribe con `update`, para no pisar el resto del mapa `plan`.

`proximoCobro` del bloque nuevo es `addDias(gratisHasta, 1)` — el día siguiente al último día gratis.

- [ ] **Step 2: Hacerlo idempotente y verificarlo**

Cada uno de los tres cambios se aplica **solo si hace falta**, así que correr el script dos veces no altera nada la segunda vez. Comprobarlo: correr en dry-run, aplicar, y volver a correr en dry-run — la segunda pasada debe reportar 0 empresas por tocar.

- [ ] **Step 3: Correr en dry-run contra producción**

```bash
node --env-file=.env.local scripts/migrar-suscripciones.mjs
```

Expected: lista de empresas con lo que cambiaría en cada una, y ninguna escritura. **Revisar la salida antes de aplicar**: si alguna empresa aparece con una `gratisHasta` posterior al 1 de septiembre, es una cuenta a la que ya se le prometió más y el script debe estar dejándola intacta.

- [ ] **Step 4: Aplicar**

```bash
node --env-file=.env.local scripts/migrar-suscripciones.mjs --apply
```

- [ ] **Step 5: Borrar el script obsoleto**

`scripts/backfill-prueba.mjs` queda reemplazado: hacía el paso 1 y nada más.

```bash
git rm scripts/backfill-prueba.mjs
```

- [ ] **Step 6: Actualizar `CLAUDE.md`**

Tres cambios en la sección de scripts y en la de `lib/plan.ts`:

1. Sacar `backfill-prueba.mjs` de la lista y poner `migrar-suscripciones.mjs` con su descripción.
2. En la descripción de `lib/plan.ts` / `lib/plan/prueba.ts`: `DIAS_PRUEBA = 30` pasa a `LANZAMIENTO_HASTA`, explicando que la prueba por cuenta corría la ventana con cada alta nueva.
3. En el modelo de datos de `companies/{companyId}`: documentar `plan.suscripcion` y **que la distinción `periodicidad` ausente vs `null` dejó de ser portante** una vez corrida la migración. Ese párrafo hoy explica lo contrario, así que dejarlo como está induciría al error exacto que la migración vino a cerrar.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore(plan): migracion one-time de la ventana de lanzamiento y las suscripciones"
```

---

## Verificación final del entregable

- [ ] El dry-run del script reporta 0 empresas por tocar (o sea, ya se aplicó).
- [ ] Una cuenta nueva creada hoy queda con `gratisHasta = '2026-09-01'` y `suscripcion.proximoCobro = '2026-09-02'`.
- [ ] Ninguna empresa en producción tiene `plan.periodicidad` ausente.
- [ ] Ninguna empresa en producción tiene `plan.suscripcion` ausente.
- [ ] La franja del dashboard muestra la fecha en `dd/mm/aaaa`.
