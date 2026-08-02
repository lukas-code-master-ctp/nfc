# Códigos promocionales — Diseño

**Fecha:** 2026-08-01
**Historia:** Como nuevo usuario, quiero ingresar un código promocional al crear mi cuenta, para acceder a los beneficios y promociones de la plataforma.

> Segunda de tres piezas. **A — plan, precio y prueba** (desplegada) · **B — códigos promocionales** (este spec) · **C — pasarela de pago**. B se apoya en el modelo que dejó A; C reemplaza el hueco que ambas dejan marcado.

---

## 1. Qué dejó A

- **`plan.gratisHasta`** (`YYYY-MM-DD`): hasta cuándo la cuenta no se cobra. Lo estampa `POST /api/plan` como hoy + 30 días.
- **`plan.periodicidad`** (`'mensual' | 'anual' | null | ausente`), con la invariante de que `null` explícito ≠ campo ausente.
- **`cargoDe({ vehiculos, periodicidad })`** → `{ monto, porVehiculo, unidad }`, puro, en `lib/billing.ts`.
- **`estadoPrueba`** y `addDias` en `lib/plan/prueba.ts`; **`hoyEnChile`** en `lib/documents/status.ts`; **`addMeses`** en `lib/mantencion/status.ts`.
- **`savePlan(companyId, patch)`** en `lib/data/companies.ts`, que escribe claves sueltas bajo `plan.*` con merge recursivo.
- **La pantalla `/plan`** (periodicidad → cantidad → cargo) y **`/facturacion`**, que muestra el plan y registra solicitudes.

**Corrección a A:** su §3 afirmaba que bastaba **una sola fecha** y que el canje la correría hacia adelante. Esa regla no sobrevive al agregar cobertura de vehículos — ver §2. Este spec la reemplaza.

## 2. Las tres fases, y por qué son dos fechas

Durante la prueba **no se cobra nada**. Un código que cubre 5 vehículos cuando la flota tiene 8 significa empezar a pagar por 3. Si el canje simplemente extendiera `gratisHasta`, esa cobertura aplicaría también a los días de prueba que quedaban: **canjear te dejaría peor que no canjear**. Una promoción no puede tener ese caso.

Por eso la promo **empieza donde termina la prueba** y trae su propia fecha:

| Fase | Cuándo | Qué se cobra |
|---|---|---|
| `prueba` | hasta `plan.gratisHasta` | nada |
| `promo` | hasta `plan.promo.hasta` | `max(0, vehículos − vehiculosIncluidos)` |
| `plena` | después | todos los vehículos |

Si la flota cabe dentro de la cobertura, la fase `promo` también da $0: "3 meses gratis" es literal. Si no cabe, se paga la diferencia — que es la regla que ya se eligió al definir el paquete.

**`gratisHasta` no se toca nunca al canjear.** La prueba es la prueba. Lo que el canje escribe es `plan.promo`.

## 3. Modelo de datos

### `plan.promo` (dentro de `companies/{companyId}`)

```ts
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
```

y `PlanData` gana `promo?: PromoAplicada | null`.

```
hasta = addMeses(max(hoy, gratisHasta), mesesGratis)
```

El `max(hoy, …)` es para quien canjea con la prueba ya vencida: la promo arranca hoy, no retroactiva. Como ambas son `YYYY-MM-DD`, el `max` es una comparación de strings — el orden lexicográfico y el cronológico coinciden en ese formato, y por eso este spec no aporta ni una línea de aritmética de fechas nueva.

**Un código por empresa.** `promo` presente ⇒ `ya_canjeado`.

### `promoCodes/{CODIGO}` — colección nueva

**El id del documento ES el código canónico.** No es un detalle cosmético: da la unicidad gratis (Firestore no deja dos docs con el mismo id) y permite leer el código **por id dentro de la transacción** de canje, sin consultas. Una `where('codigo','==',…)` obligaría a resolver una query dentro de la transacción y a defender la unicidad a mano.

```ts
export interface PromoCode {
  /** El id del documento: forma canónica, MAYÚSCULAS. */
  codigo: string
  descripcion: string       // para el panel: "Lanzamiento agosto"
  mesesGratis: number       // 0..24
  vehiculosIncluidos: number // 0..100
  activo: boolean
  expiraEn: string | null   // `YYYY-MM-DD`: hasta cuándo se puede canjear
  maxCanjes: number | null  // tope de empresas
  canjes: number            // contador
  createdAt: string | null
  createdByUid?: string
}
```

`activo`, `expiraEn` y `maxCanjes` son las tres perillas para apagar una campaña que se escapó. Un código con `mesesGratis: 0` y `vehiculosIncluidos: 0` no otorga nada y se rechaza al crearlo.

Bloqueada al cliente en `firestore.rules` (`allow read, write: if false`), como `transferencias`, `invitations` y `mantenciones`. **Recordar desplegar las reglas** con `scripts/deploy-firestore-rules.mjs`.

## 4. `lib/promo/canje.ts` — lógica pura, sin Firebase

Calcado del patrón de `lib/transferencias/estado.ts`: ahí vive la seguridad del feature, y el endpoint solo orquesta y traduce el motivo a un HTTP.

```ts
export type MotivoRechazo = 'no_existe' | 'inactivo' | 'expirado' | 'agotado' | 'ya_canjeado'

export function normalizarCodigo(raw: string): string

export function puedeCanjear(p: {
  code: PromoCode | null
  promoActual: PromoAplicada | null | undefined
  hoy: string            // `YYYY-MM-DD`
}): MotivoRechazo | null  // null = se puede

export function aplicarCanje(p: {
  code: PromoCode
  gratisHasta: string | null | undefined
  hoy: string
  ahoraIso: string
}): PromoAplicada
```

### `normalizarCodigo` es más estricta de lo que parece necesario, a propósito

Pasa a mayúsculas, recorta, y **descarta todo lo que no sea `A-Z`, `0-9` o `-`**, con tope de 32 caracteres. Devuelve `''` si no queda nada, y un `''` nunca se busca.

Dos motivos: el código es el **id del documento**, y Firestore prohíbe `/` y los ids `.` y `..`; y una lista blanca evita tener que razonar sobre qué pasa con un código con espacios, tildes o emojis. Además hace que "tapcar-agosto", "TapCar Agosto" y "  tapcar–agosto  " no sean tres códigos distintos según cómo lo pegue el usuario desde un correo.

`ya_canjeado` se comprueba **antes** que `no_existe`: a quien ya tiene una promo hay que decirle eso, y no filtrarle si el código que probó existe o no.

## 5. `cargoDe` crece, y aparece `faseDelPlan`

```ts
export interface Cargo {
  monto: number              // lo que se cobra en este ciclo, ya descontada la cobertura
  montoPleno: number         // lo que se cobrará cuando no haya cobertura
  vehiculosCobrados: number
  porVehiculo: number
  unidad: 'mes' | 'año'
}

export function cargoDe(p: {
  vehiculos: number
  periodicidad: Periodicidad
  vehiculosIncluidos?: number   // default 0
}): Cargo
```

`vehiculosIncluidos` es **opcional con default 0**, así que los llamadores que ya existen (`/facturacion`, `/admin`, `BillingRequestForm`, `SelectorPlan`, `POST /api/plan`) siguen funcionando sin cambios y con `monto === montoPleno`.

```ts
// lib/plan/fase.ts
export type FasePlan = 'prueba' | 'promo' | 'plena'
export function faseDelPlan(
  p: { gratisHasta?: string | null; promoHasta?: string | null },
  hoy: string,
): FasePlan
```

Comparación de strings `YYYY-MM-DD`, inclusiva en ambos bordes (`hoy <= gratisHasta` sigue siendo `prueba`, igual que `estadoPrueba` trata el día 0 como "termina hoy" y no como vencida).

Se mantiene la separación: `cargoDe` sabe de precios y `faseDelPlan` sabe de fechas. Quien las junta es la pantalla, que decide la cobertura según la fase (todos durante la prueba, `vehiculosIncluidos` durante la promo, 0 después).

## 6. Los endpoints

### `POST /api/promo/validar` — solo lectura

Recibe `{ codigo }`, responde `{ valido: true, mesesGratis, vehiculosIncluidos }` o `{ valido: false, motivo }`. Alimenta la vista previa mientras el usuario escribe. **No muta nada y no incrementa el contador.**

### `POST /api/promo/canjear` — el que muta

Recibe `{ codigo }`, responde `{ ok: true, promo }` o **409** con el motivo.

**Va en una transacción de Firestore, y eso no es opcional.** `maxCanjes` es lo que hace que "los primeros 50" signifique algo; sin transacción, dos canjes simultáneos leen el mismo contador y ambos pasan — que es exactamente el escenario de una campaña, donde la gente entra al mismo tiempo. La transacción lee el código por id, revalida con `puedeCanjear`, incrementa `canjes` y escribe `plan.promo` de la empresa.

**Los dos exigen sesión y `can(role, 'billing:manage')`**: canjear cambia lo que la empresa paga, así que es cosa del Administrador. Y `validar` cuesta una lectura por pulsación potencial: no puede quedar abierto.

### El orden en `/plan`, que no es arbitrario

Primero se guarda el plan (`POST /api/plan`), después se canjea. **`promo.hasta` se calcula desde `gratisHasta`, que no existe hasta que el plan está guardado.** Si el canje falla justo ahí, el plan ya quedó a salvo y el mensaje manda a Facturación — que es la segunda puerta de canje que el diseño ya contemplaba. El usuario nunca queda sin plan por un código.

## 7. La interfaz

**`components/plan/CampoPromo.tsx`**, compartido por las dos puertas: campo colapsado tras "¿Tienes un código promocional?", con vista previa al validar ("3 meses gratis · cubre 5 vehículos") y el motivo traducido a español cuando no sirve.

**En `/plan`** el titular del cargo **sigue siendo el precio pleno**. El efecto del código va en una línea bajo el campo: "Durante los 3 meses de promoción pagarías $8.970 al mes". Convertir el número grande en un acertijo de tres cifras es peor que mostrar el precio real y explicar el descuento aparte.

**En `/facturacion`** se muestra la fase actual, el código canjeado con lo que otorga y hasta cuándo, el cargo de hoy y el cargo pleno. Y el campo de canje para quien todavía no usó ninguno.

## 8. Administración

`/admin` gana una sección **Códigos promocionales** (`components/admin/PromoCodesPanel.tsx`): crear, activar/desactivar y ver los canjes de cada uno. Endpoints `POST /api/admin/promo-codes` y `PATCH /api/admin/promo-codes/[id]`, ambos bajo el guard `isAdminEmail`, que ya falla cerrado.

No se ofrece **borrar** un código: `plan.promo` guarda una copia de lo que otorgó, así que borrarlo no rompería a nadie, pero perdería el rastro de la campaña. `activo: false` cumple la misma función y conserva el historial.

## 9. Seguridad

- La colección está bloqueada al cliente; el único camino es el Admin SDK server-side.
- Ambos endpoints de canje validan `getMembership()` + `can(role, 'billing:manage')`. Nunca confían en `companyId` que mande el cliente.
- El tope `maxCanjes` se hace cumplir **dentro de la transacción**, no antes.
- `plan.promo` guarda una **copia** de `mesesGratis` y `vehiculosIncluidos` al momento del canje: editar un código después no altera lo que ya se otorgó.

**Riesgo aceptado, escrito para que nadie lo descubra después:** un Administrador con cuenta puede probar códigos a mano contra `validar`. No hay rate-limit y no se propone uno — sería sobre-ingeniería hoy. Lo que acota el daño es que los códigos no son adivinables (los genera el equipo), más `maxCanjes` y `expiraEn`, que apagan una campaña filtrada en un clic.

## 10. Archivos

**Crear**
- `lib/promo/canje.ts` — `normalizarCodigo`, `puedeCanjear`, `aplicarCanje`, `MotivoRechazo`
- `lib/plan/fase.ts` — `faseDelPlan`, `FasePlan`
- `lib/data/promoCodes.ts` — CRUD + `canjearPromo` (la transacción)
- `app/api/promo/validar/route.ts`, `app/api/promo/canjear/route.ts`
- `app/api/admin/promo-codes/route.ts`, `app/api/admin/promo-codes/[id]/route.ts`
- `components/plan/CampoPromo.tsx`
- `components/admin/PromoCodesPanel.tsx`

**Modificar**
- `lib/types.ts` — `PromoAplicada`, `PromoCode`, `PlanData.promo`
- `lib/billing.ts` — `cargoDe` con `vehiculosIncluidos`, `montoPleno`, `vehiculosCobrados`
- `lib/data/companies.ts` — `savePlan` acepta `promo`
- `components/plan/SelectorPlan.tsx` — monta el campo y canjea tras guardar
- `app/(app)/facturacion/page.tsx` — fase, código y campo de canje
- `app/(app)/admin/page.tsx` — la sección nueva
- `firestore.rules` — bloquear `promoCodes` (y **desplegar**)
- `CLAUDE.md`

## 11. Testing

**Puro** (`lib/promo/__tests__/canje.test.ts`, `lib/plan/__tests__/fase.test.ts`, `lib/__tests__/billing.test.ts`)
- `normalizarCodigo`: minúsculas → mayúsculas; espacios y tildes fuera; `/` fuera (rompería el id del documento); tope de 32; entrada basura → `''`.
- `puedeCanjear`: los cinco motivos, cada uno por separado, y el caso que devuelve `null`.
- **`ya_canjeado` gana a `no_existe`** — el orden importa y hay un test que lo fija.
- `expirado`: el día exacto de `expiraEn` **todavía sirve**; el siguiente no.
- `agotado`: `canjes === maxCanjes` rechaza; `maxCanjes: null` nunca agota.
- `aplicarCanje`: con prueba vigente cuenta desde `gratisHasta`; con prueba vencida cuenta desde **hoy** (el `max`); cruzando fin de año.
- `faseDelPlan`: las tres fases, los dos bordes inclusivos, sin promo, sin `gratisHasta`.
- `cargoDe`: cobertura menor, igual y mayor que la flota; `vehiculosCobrados` nunca negativo; **sin `vehiculosIncluidos`, `monto === montoPleno`** (la garantía de que los llamadores de A no cambiaron de comportamiento).

**Transacción** (`lib/data/__tests__/promoCodes.test.ts`)
- El canje incrementa `canjes` y escribe `plan.promo` en la misma transacción.
- Un código agotado no escribe nada.
- Revalida **dentro** de la transacción: si el código se agota entre la validación y el canje, se rechaza.

**Endpoints**
- Sin sesión → 401. Rol `viewer` y `editor` → 403, en los dos endpoints.
- `validar` con un código inexistente → `{ valido: false, motivo: 'no_existe' }`, **sin** incrementar el contador.
- `canjear` con la empresa que ya tiene promo → 409 `ya_canjeado`.
- Admin: crear un código sin ser admin de plataforma → 403.
- Crear un código con `mesesGratis: 0` y `vehiculosIncluidos: 0` → 400.

**Componente** (`components/__tests__/CampoPromo.test.tsx`)
- Vista previa al validar un código bueno; motivo traducido al validar uno malo.
- El `fetch` que **rechaza** (red caída) no deja el botón muerto — el mismo caso que ya mordió dos veces en este proyecto.
- En `/plan`, si el canje falla después de guardar el plan, el mensaje dice que el plan quedó guardado y manda a Facturación.

**Lo que no se puede testear automáticamente:** que la transacción sea realmente atómica bajo carga real. Los tests la ejercen con mocks; la garantía la da Firestore.

## 12. Fuera de alcance

- Varios códigos acumulables por empresa.
- Descuentos porcentuales: los códigos dan meses y cobertura, no %.
- Códigos nominales atados a un correo (`maxCanjes: 1` cubre el caso práctico).
- Revertir o transferir un canje.
- Que la recaudación estimada de `/admin` descuente las promociones vigentes.
- El cobro real, que sigue siendo de C.
