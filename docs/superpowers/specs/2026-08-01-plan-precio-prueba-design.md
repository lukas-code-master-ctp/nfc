# Plan, precio y prueba — Diseño

**Fecha:** 2026-08-01
**Historia:** Como nuevo usuario, quiero elegir cuántos vehículos voy a registrar y con qué periodicidad quiero pagar, para saber cuánto cuesta antes de empezar — en vez de recibir un cupo fijo que nadie eligió.

> Primera de tres piezas. **A — plan, precio y prueba** (este spec) · **B — códigos promocionales** · **C — pasarela de pago**. El orden es forzoso: B se apoya en el modelo de datos que define A, y C reemplaza el hueco que A deja marcado.

---

## 1. Qué existe ya

- **`DEFAULT_PLAN = { maxVehiculos: 3 }`** (`lib/types.ts`). Lo aplica `ensureProvisioned` en el primer login, vía `createCompany`. Nadie elige nada: el 3 está clavado.
- **`lib/billing.ts`** conoce solo el precio mensual ($2.990/vehículo) y la regla del tag NFC (incluido desde 5 vehículos; $1.000 + envío bajo ese umbral).
- **`/facturacion`** es concierge: muestra el plan, registra un `billingRequest` y manda un correo. El cobro se coordina a mano.
- **`/bienvenida`** ya es la pantalla del primer inicio (tipo de cuenta), fuera del grupo `(app)`, con guarda propia para no ser un callejón.
- **`daysUntil`** (`lib/documents/status.ts`) y **`addMeses`** (`lib/mantencion/status.ts`) trabajan sobre fechas calendario `YYYY-MM-DD` en zona `America/Santiago`.

La web (`tapcar.cl/planes`) ofrece además un **plan anual a $1.944/vehículo/mes (−35%)** que la app no sabe que existe.

## 2. Decisiones de producto

| Decisión | Valor | Por qué |
|---|---|---|
| Qué pasa donde irá la pasarela | **Prueba gratis de 30 días con fecha de término** | El cupo se aplica de inmediato, pero queda con fecha. Cuando llegue la pasarela, el fin de la prueba es exactamente el instante donde se cobra — y el mismo campo recibe los "meses gratis" del código promocional sin inventar nada nuevo. |
| Periodicidad | **Mensual y anual, ambas** | El usuario elige primero cómo paga y después cuánto, porque la periodicidad cambia todos los números de abajo. La pasarela necesita saber qué cobra y cada cuánto; modelarlo después sería rehacerlo. |
| Tope de self-service | **30 vehículos** | Aceptamos regalar cupo durante la prueba, pero no en cualquier cantidad. Sobre 30, el botón lleva a Facturación — una rama que ya está construida. |
| Cuentas que ya existen | **No se les fuerza ninguna pantalla** | Siguen con su cupo actual. Reciben una franja de prueba de 30 días con el llamado a elegir plan, y pueden entrar a `/plan` voluntariamente desde Facturación. Nadie que ya esté trabajando se topa con una pantalla obligatoria. |
| Qué pasa al vencer la prueba | **Solo avisa, no bloquea** | Mientras no exista la pasarela, cerrarle la puerta a alguien es castigarlo por algo que no le dimos cómo resolver. El mecanismo de bloqueo se diseña junto con C. |

**Riesgo aceptado explícitamente:** un plazo sin consecuencia deja de leerse como plazo. Se acepta a sabiendas, porque la alternativa —bloquear sin ofrecer forma de pagar— es peor.

## 3. Modelo de datos

Todo cuelga de `PlanData`, que hoy tiene un solo campo:

```ts
export type Periodicidad = 'mensual' | 'anual'

export interface PlanData {
  /** Cupo total de vehículos. Mínimo 1. (ya existe) */
  maxVehiculos: number
  /** null = cuenta nueva que todavía no elige · ausente = cuenta anterior al selector */
  periodicidad?: Periodicidad | null
  /** `YYYY-MM-DD`: hasta cuándo esta cuenta no se cobra. */
  gratisHasta?: string | null
  /** El código canjeado. Uno por empresa. Lo escribe B; A solo lo lee. */
  promo?: PromoAplicada | null
}
```

### La invariante que sostiene todo: `null` no es lo mismo que ausente

`periodicidad` es el marcador que decide **quién ve la pantalla obligatoria**:

- **`null`** → cuenta nueva que todavía no eligió → `/plan`.
- **ausente** → cuenta anterior al selector → franja, sin pantalla.
- **`'mensual' | 'anual'`** → ya eligió.

`createCompany` escribe `periodicidad: null` **explícito** en las cuentas nuevas. Las que ya existen tienen el campo ausente porque nadie lo escribió nunca.

Esto no es una sutileza gratuita: hace que la puerta **no dependa de que el script de migración haya corrido antes que el deploy**. Si se invierte el orden, la única consecuencia es que la franja aparece más tarde — nadie queda encerrado en una pantalla que no le tocaba. Es el mismo patrón que ya usa `resumenDocs` (ausente = nunca calculado).

**Consecuencia obligatoria en el mapeo:** el lector de `companies` (`getCompany`) **no puede** coalescer `periodicidad` con `?? null`. Tiene que pasar el valor tal cual, o borra la distinción de la que depende todo el feature. Hay un test que lo fija.

### Una sola fecha, no dos

> **Corregido por el spec de B** (`2026-08-01-codigos-promocionales-design.md`, §2). Esta regla vale mientras el código solo dé meses; al agregar cobertura de vehículos deja de servir, porque extender la fecha única haría que la cobertura aplicara también a los días de prueba que quedaban — y canjear dejaría al usuario **peor** que no canjear. En B la promoción empieza donde termina la prueba y lleva su propia fecha (`plan.promo.hasta`); `gratisHasta` ya no se toca al canjear. Lo de abajo queda como registro de por qué se intentó una sola fecha.

`gratisHasta` es "hasta cuándo no se te cobra". Los 30 días de prueba y los meses del código promocional escriben **ahí mismo**. La regla de canje que usará B es una sola y sirve igual en el alta que en Facturación:

```
gratisHasta = max(hoy, gratisHasta) + mesesGratis
```

Corre hacia adelante desde donde esté. La alternativa —que el código *reemplace* la prueba— produce un absurdo: canjear un código de 1 mes daría menos que no canjear nada.

**Va en formato `YYYY-MM-DD`, no timestamp.** Así `daysUntil` y `addMeses` sirven tal cual, con la zona horaria de Chile que ya está resuelta, y este spec no aporta ni una línea de aritmética de fechas nueva.

### Escritura: `savePlan`, no `saveCompany`

`saveCompany` **reconstruye el mapa `plan` desde cero** (`data.plan = { maxVehiculos: ... }`, `lib/data/companies.ts:45`): si le pasaras un plan con periodicidad, la descartaría en silencio. Es deliberadamente estrecho porque su único llamador de `plan` es el panel admin, que solo cambia el cupo. **Se deja como está**, con un comentario que diga por qué, y las escrituras nuevas van por una función aparte:

```ts
export async function savePlan(companyId: string, patch: Partial<PlanData>): Promise<void>
```

Escribe solo las claves definidas bajo `plan.*` con `set(..., { merge: true })`. Firestore hace merge recursivo de mapas anidados, así que escribir `{ plan: { periodicidad: 'anual' } }` conserva `maxVehiculos` — y por la misma razón el `PATCH` del panel admin sigue siendo seguro: cambiar el cupo no borra la periodicidad ni la fecha.

**Nada de `undefined`.** Firestore Admin los rechaza y hace lanzar el `update`. `savePlan` omite la clave o escribe `null`; nunca pasa `undefined`.

## 4. Precios y cálculo

En `lib/billing.ts`, puro y sin red:

```
mensual: $2.990 / vehículo / mes
anual:   $1.944 / vehículo / mes  →  $23.328 / vehículo, cobrados una vez al año
```

Verificado contra la web: 10 vehículos son $358.800/año en mensual contra $233.280/año en anual — diferencia $125.520, exactamente el ahorro que promete la página. Si esos números dejan de cuadrar, el precio cambió en un lado y no en el otro.

```ts
export const PRICE_PER_VEHICLE = 2990            // ya existe
export const PRICE_PER_VEHICLE_ANUAL_MES = 1944  // el anual, expresado por mes
export const MESES_ANUAL = 12
export const MAX_VEHICULOS_SELF_SERVICE = 30

export interface Cargo {
  vehiculosCobrados: number   // descontando los que cubre la promo
  monto: number               // lo que se cobra en este ciclo
  montoPleno: number          // lo que se cobrará cuando termine la promo
  unidad: 'mes' | 'año'
}

export function cargoDe(p: {
  vehiculos: number
  periodicidad: Periodicidad
  vehiculosIncluidos?: number  // cobertura del código promocional (B)
}): Cargo
```

`vehiculosCobrados = max(0, vehiculos − vehiculosIncluidos)`. Durante la promo se cobra eso; al vencer, todos.

**`monto` y `montoPleno` son dos cifras distintas y la pantalla muestra las dos.** Enseñar solo lo que se paga hoy es venderle a alguien un precio que va a cambiar sin que se entere — que es justo la queja que la gente tiene con las suscripciones.

`monthlyTotal` **se elimina** y sus tres llamadores pasan a `cargoDe`: `/facturacion`, `/admin` (la recaudación estimada) y `BillingRequestForm`. Dos formas de calcular lo mismo es cómo se llega a que la app cobre un número y el panel muestre otro.

`tagIncluded`, `formatCLP`, `FREE_TAG_THRESHOLD` y `TAG_PRICE` quedan igual.

## 5. Estado de la prueba

`lib/plan/prueba.ts`, puro:

```ts
export type EstadoPrueba = 'sin_prueba' | 'activa' | 'por_terminar' | 'vencida'
export const DIAS_PRUEBA = 30
export const UMBRAL_POR_TERMINAR = 7

export function estadoPrueba(
  gratisHasta: string | null | undefined,
  ahora: Date,
): { estado: EstadoPrueba; diasRestantes: number | null }

/** `YYYY-MM-DD` + días, sobre fecha calendario. */
export function addDias(fechaISO: string, dias: number): string
```

- Sin `gratisHasta` → `sin_prueba`, y no se muestra nada. Es lo que ve una cuenta anterior a la que todavía no le corrió el script: **falla en silencio, no con una franja mintiendo**.
- `diasRestantes > UMBRAL_POR_TERMINAR` → `activa`.
- `0 ≤ diasRestantes ≤ 7` → `por_terminar`.
- `< 0` → `vencida`.

Reusa `daysUntil` para no reimplementar la zona horaria. El umbral de 7 días es el mismo hito que ya usan los recordatorios de documentos: dos umbrales distintos para "se te acaba el tiempo" en la misma app sería incoherencia sin motivo.

`lib/documents/status.ts` exporta además un helper nuevo, **`hoyEnChile(now: Date): string`**, que devuelve la fecha de hoy en `America/Santiago` como `YYYY-MM-DD`. Hoy esa lógica vive en `chileDateParts`, que es privada. La zona horaria de Chile tiene que tener un solo dueño en el proyecto; duplicar el `Intl.DateTimeFormat` en el módulo de planes es exactamente cómo se llega a que dos partes de la app no coincidan en qué día es.

`lib/plan.ts` gana la puerta:

```ts
export function debeElegirPlan(plan: PlanData | undefined): boolean  // true solo si periodicidad === null
```

## 6. La pantalla `/plan`

Ruta nueva `app/plan/page.tsx`, **fuera del grupo `(app)`** —igual que `/bienvenida`— para que sea una pantalla enfocada, sin barra de navegación. Lleva su `loading.tsx` con el mismo `max-w-md` que la página real, por la regla ya establecida: un skeleton que no calza en tamaño produce un salto que molesta más que no haber puesto nada.

**Guarda propia**, para no ser un callejón: quien ya eligió periodicidad se va a `/facturacion`, que es donde se piden los cambios de plan. Quien no es Administrador (`billing:manage`) también: no puede contratar nada.

**Orden en el primer inicio:** `/bienvenida` (tipo de cuenta) → `/plan` → dashboard. `/bienvenida` redirige directo a `/plan` en vez de rebotar por el dashboard.

**La puerta la pone el dashboard, no el layout de `(app)`.** El layout envuelve las nueve páginas y comprobarlo ahí costaría una lectura de Firestore en cada navegación, para siempre; el dashboard ya lee la empresa. Es la misma decisión —y el mismo precio aceptado— que el portero del onboarding: entrar por URL directa a otra página saltea la pantalla.

### Los tres bloques

1. **Periodicidad.** Dos tarjetas, Mensual y Anual con el −35% visible. Va primero porque cambia todos los números de abajo.
2. **Cantidad.** Campo numérico con botones −/+ y atajos (1, 3, 5, 10). Si la cuenta es personal, parte en 1. **Sin slider**: en un celular es impreciso justo donde más se usa la app, y acá un número equivocado es plata.
3. **El cargo, en vivo.** "$29.900 al mes" o "$233.280 una vez al año", con el valor por vehículo y la línea del tag NFC que ya calcula `tagIncluded`.

Debajo va el campo colapsado "¿Tienes un código promocional?" — **lo monta B**. A deja el hueco en el layout y nada más; sin B la pantalla funciona completa.

Sobre 30 vehículos el botón no aplica el cupo: lleva a `/facturacion`, con el texto explicando que para flotas más grandes coordinamos el plan contigo.

## 7. `POST /api/plan`

Recibe `{ periodicidad, maxVehiculos }` y devuelve `{ ok: true }`.

- `getMembership()` + `can(role, 'billing:manage')`. Un Editor o Visor no contrata nada.
- Valida `periodicidad ∈ {mensual, anual}` y `1 ≤ maxVehiculos ≤ 30` (el mismo tope, comprobado **en el servidor**: el cliente no se consulta para decidir cuánto cupo se regala).
- **Rechaza si la empresa ya tiene periodicidad** (409). Este endpoint es el alta, no el cambio de plan; sin esa comprobación alguien podría reiniciarse la prueba llamándolo de nuevo.
- Escribe con `savePlan`: `{ periodicidad, maxVehiculos, gratisHasta: addDias(hoyEnChile(new Date()), 30) }`.
- Registra el `billingRequest` y manda el correo con `after()` — **best-effort, y con el `try/catch` alrededor de la llamada a `after()`, no solo dentro del callback**: si `after()` lanzara, se llevaría puesta la respuesta y el usuario quedaría sin plan por un correo de cortesía. El segmento fija `export const maxDuration = 30`.

Que el correo falle no puede impedir que el plan quede guardado. Que el plan no se guarde sí es un fallo real y devuelve error.

## 8. La franja

`components/plan/FranjaPrueba.tsx`, montada en el **dashboard** (que ya carga la empresa), sobre la tarjeta de onboarding.

| Estado | Tono | Texto |
|---|---|---|
| `activa` | neutro/azul | "Estás en la versión de prueba · quedan N días" + "Elegir plan" |
| `por_terminar` | ámbar | igual, con los días en primer plano |
| `vencida` | rojo | "Tu prueba terminó. Sigue usando TapCar mientras coordinamos tu plan." + "Elegir plan" |

El botón lleva a `/plan` si la cuenta nunca eligió (periodicidad ausente) y a `/facturacion` si ya tiene plan.

**El texto de `vencida` dice la verdad**: la app no se bloquea. Un aviso que amenaza con algo que no ocurre entrena a la gente a ignorar todos los avisos, incluidos los de vencimiento de documentos, que son el producto.

**Sin toast.** La franja dice lo mismo, se queda mientras dure la prueba y muestra los días restantes. Un toast, además, se cierra solo a los 7 segundos y necesitaría una marca persistida de "ya lo vio" —una escritura por usuario— para no repetirse en cada carga: más piezas, por un mensaje que dura menos que leerlo.

## 9. Facturación

`/facturacion` pasa a mostrar periodicidad, cantidad, el cargo de hoy, el cargo pleno cuando termine la promo, y la fecha de `gratisHasta`. Una cuenta anterior (sin periodicidad) ve ahí el botón **"Elegir plan"** → `/plan`. El formulario de solicitud actual se queda para los cambios de plan.

## 10. Migración de las cuentas existentes

`scripts/backfill-prueba.mjs`, con las mismas reglas que los otros scripts del proyecto: **dry-run por defecto**, escribe solo con `--apply`, idempotente.

Le pone `plan.gratisHasta = hoy + 30 días` a toda empresa que **no tenga el campo**. No toca `periodicidad` (tiene que quedar ausente, o las mandaría a la pantalla obligatoria) ni `maxVehiculos`.

Idempotente por la comprobación de ausencia: correrlo dos veces no reinicia la prueba de nadie.

## 11. Archivos

**Crear**
- `lib/plan/prueba.ts` — `estadoPrueba`, `addDias`, constantes
- `app/plan/page.tsx` + `app/plan/loading.tsx` — la pantalla y su skeleton
- `components/plan/SelectorPlan.tsx` — periodicidad + cantidad + cargo (client)
- `components/plan/FranjaPrueba.tsx` — la franja del dashboard
- `app/api/plan/route.ts` — `POST`
- `scripts/backfill-prueba.mjs` — la migración

**Modificar**
- `lib/types.ts` — `Periodicidad`, los tres campos de `PlanData`
- `lib/billing.ts` — precios anuales, `cargoDe`, `MAX_VEHICULOS_SELF_SERVICE`; fuera `monthlyTotal`
- `lib/plan.ts` — `debeElegirPlan`
- `lib/documents/status.ts` — exportar `hoyEnChile`
- `lib/data/companies.ts` — `savePlan`; `createCompany` siembra `periodicidad: null`; el mapeo de lectura conserva ausente vs `null`
- `app/bienvenida/page.tsx` — redirige a `/plan`
- `app/(app)/dashboard/page.tsx` — la puerta a `/plan` + la franja
- `app/(app)/facturacion/page.tsx`, `app/(app)/admin/page.tsx`, `components/billing/BillingRequestForm.tsx` — migran a `cargoDe`
- `CLAUDE.md` — el modelo, la invariante de `null` vs ausente y el script

## 12. Testing

**Puro** (`lib/billing`, `lib/plan/prueba`, `lib/plan`)
- `cargoDe` mensual y anual, con y sin cobertura de promo; `montoPleno` siempre sobre el total.
- Cobertura mayor que la cantidad → `vehiculosCobrados` 0, nunca negativo.
- Los dos números de la web: 10 vehículos anual = $233.280/año y la diferencia de $125.520 contra el mensual. **Este test es el que avisa si alguien cambia un precio en un solo lado.**
- `estadoPrueba` en los cuatro estados, incluyendo el borde exacto de 7 y de 0 días.
- `estadoPrueba(undefined)` y `(null)` → `sin_prueba`.
- `addDias` cruzando fin de mes y fin de año.
- `debeElegirPlan`: `null` → true; ausente → **false**; `'mensual'` → false. Los tres, porque el caso "ausente" es el que protege a las cuentas existentes.

**Endpoint** (`app/api/__tests__/plan.test.ts`)
- Sin sesión → 401. Rol Visor/Editor → 403.
- `maxVehiculos` 0, 31 o no numérico → 400.
- Empresa que ya tiene periodicidad → 409, sin escribir.
- Camino feliz → `savePlan` con la fecha correcta, y el `billingRequest` registrado.
- El correo falla → el plan igual queda guardado y responde ok.

**Datos** (`lib/data/__tests__/companies.test.ts`)
- `createCompany` siembra `periodicidad: null`.
- La lectura distingue ausente de `null` — el test que protege la invariante de la §3.
- `savePlan` con un solo campo no borra los otros.

**Componente**
- `FranjaPrueba` no renderiza nada con `sin_prueba`.
- El destino del botón cambia según haya periodicidad o no.

**Lo que no se puede testear automáticamente:** que los precios sean los correctos. El test fija que la app y la web digan lo mismo *hoy*; si suben los precios, hay que cambiar los dos lados y el test.

## 13. Fuera de alcance

- La pasarela y el cobro real (spec C).
- El código promocional (spec B). A solo deja el hueco en la pantalla y el campo `promo` en el tipo.
- Bloqueo al vencer la prueba.
- Correo de aviso de vencimiento de prueba: sin pasarela no hay nada que el usuario pueda hacer al recibirlo.
- Cambio self-service de plan después del alta: sigue siendo una solicitud por `/facturacion`.
- Prorrateo al subir o bajar la cantidad; planes con precio distinto por cuenta; renovación automática.

## 14. El hueco que queda marcado

Un solo punto del código es el que cambia cuando llegue la pasarela: **el final de `POST /api/plan`**, donde hoy se registra el `billingRequest` y se estampa `gratisHasta`. Ahí es donde se redirige al checkout, y `gratisHasta` pasa a ser la fecha del primer cobro en vez del fin de la prueba — el campo no cambia de significado, solo de quién lo hace cumplir.

Y para B: `gratisHasta` es el campo que va a recibir los meses gratis, y `cargoDe` es el lugar donde va el descuento por vehículos cubiertos por el código promocional. Pero B **sí** tendrá que ampliar la firma de `cargoDe` y el tipo `Cargo`, porque A los dejó sin esos campos a propósito: el plan de implementación recortó `vehiculosIncluidos`/`montoPleno` de `cargoDe` y el campo `promo` de `PlanData` (son del spec B, y sin código promocional `monto` y `montoPleno` serían siempre el mismo número).
