# Pasarela de pago (Flow) — Diseño

**Fecha:** 2026-08-06
**Historia:** Como cliente, quiero registrar mi tarjeta una sola vez y que TapCar me cobre solo cada mes (o cada año), para no tener que coordinar el pago a mano con nadie.

> Tercera de tres piezas. **A — plan, precio y prueba** (desplegada) · **B — códigos promocionales** (desplegada) · **C — pasarela de pago** (este spec). C reemplaza el hueco que A y B dejaron marcado: hoy `POST /api/plan` registra una solicitud de facturación y el cobro se coordina por correo.

---

## 1. Qué dejaron A y B

- **`plan.gratisHasta`** (`YYYY-MM-DD`): hasta cuándo la cuenta no se cobra. Hoy lo estampa `POST /api/plan` como hoy + 30 días.
- **`plan.periodicidad`** (`'mensual' | 'anual' | null | ausente`), con la invariante de que `null` explícito ≠ campo ausente.
- **`plan.promo`** (`PromoAplicada`): copia congelada del código canjeado, con su propia fecha `hasta`.
- **`cargoDe({ vehiculos, periodicidad, vehiculosIncluidos })`** → `{ monto, montoPleno, vehiculosCobrados, porVehiculo, unidad }`, puro, en `lib/billing.ts`.
- **`faseDelPlan`** y **`coberturaDe`** en `lib/plan/fase.ts`: `prueba` → `promo` → `plena`, y cuántos vehículos cubre la promoción **hoy**.
- **`estadoPrueba`** y **`addDias`** en `lib/plan/prueba.ts`; **`hoyEnChile`** y **`daysUntil`** en `lib/documents/status.ts`; **`addMeses`** en `lib/mantencion/status.ts`.
- **`savePlan(companyId, patch)`** en `lib/data/companies.ts`: escribe claves sueltas bajo `plan.*` con merge recursivo.
- **`/plan`** (periodicidad → cantidad → cargo) y **`/facturacion`**.

**Este spec corrige dos cosas de A:**

1. La prueba **deja de ser "30 días desde el alta"** y pasa a ser una fecha fija para todos (§3). El plazo por-cuenta hacía que la ventana de regalo nunca se cerrara: cada alta nueva la corría un mes más.
2. La distinción `periodicidad` ausente vs `null` **deja de ser sostenible** (§12). Si no sabemos cada cuánto cobrarle a una cuenta, no podemos cobrarle.

---

## 2. La decisión de fondo: Cargo Automático, no Suscripciones

Flow ofrece dos mecanismos y para el cliente se ven idénticos — registra la tarjeta una vez y le llega el cobro solo:

| | Suscripciones (`/plans/create` + `/subscription/create`) | Cargo Automático (`/customer/register` + `/customer/charge`) |
|---|---|---|
| Quién corre el calendario | Flow | TapCar |
| Monto | **fijo por plan, sin cantidad** | el que le pasemos en cada llamada |
| Reintentos y dunning | Flow | TapCar |
| Promociones | cupones de Flow (% o monto fijo) | las nuestras, que ya existen |

**Se elige Cargo Automático.** Tres razones, en orden de peso:

1. **El precio de TapCar es N × $2.990 con N variable.** Un plan de Flow tiene monto fijo por ciclo y no acepta cantidad. Con suscripciones haría falta un catálogo de 60 planes (1…30 × mensual/anual) y cada cambio de cupo sería cancelar una suscripción y crear otra.
2. **El cupón de Flow no puede expresar nuestra promoción.** La nuestra es *"N vehículos incluidos por M meses"*, que en pesos **depende del tamaño de la flota**: un cliente con promoción de 5 vehículos que pasa de 5 a 8 debe empezar a pagar 3. Un `percent_off` o un monto fijo cargado en Flow queda mintiendo apenas cambia el cupo. Además dejaría la promoción viviendo en dos sistemas.
3. **El cálculo ya existe y está probado.** `cargoDe` + `faseDelPlan` + `coberturaDe` dan el monto exacto de hoy. La pasarela solo lo ejecuta.

**El precio de esta decisión:** TapCar se hace dueño del calendario de cobros, de los reintentos y del impago. Ese es el grueso del trabajo de este spec y donde está casi todo el riesgo.

### Alternativa descartada: una suscripción de Flow por vehículo

Es el modelo mental correcto (el negocio *es* por vehículo) y se descarta igual: le deja al cliente N cobros separados en su estado de cuenta cada mes y paga comisión por transacción N veces.

---

## 3. La prueba de 30 días pasa a ser una ventana de lanzamiento

La prueba se creó para el lanzamiento, no como parte del producto. Se reemplaza por **una fecha fija igual para todos**:

```ts
// lib/plan/prueba.ts
export const LANZAMIENTO_HASTA = '2026-09-01' // último día gratis, inclusive
```

- `DIAS_PRUEBA` se elimina.
- `POST /api/plan` estampa `gratisHasta = LANZAMIENTO_HASTA` **solo si esa fecha todavía no pasó**; si ya pasó, estampa `null`. Estampar una fecha vencida haría que `estadoPrueba` devolviera `'vencida'` y la franja le dijera *"tu prueba terminó"* a un cliente que acaba de registrarse.
- `estadoPrueba`, `faseDelPlan` y `coberturaDe` **no cambian**: siguen leyendo `plan.gratisHasta`. Lo único que cambia es quién estampa la fecha.
- Los textos de `FranjaPrueba` y `/facturacion` dejan de hablar de "prueba de 30 días" y hablan de la promoción de lanzamiento. El tipo `EstadoPrueba` conserva sus nombres: renombrarlo es ruido sin beneficio.
- `addDias` **se conserva** — la escalera de impago (§6) lo usa.

Después del 1 de septiembre no hay prueba que vencer, así que *"la tarjeta se ofrece al alta y se exige al vencer"* se convierte por construcción en *"la tarjeta es requisito del alta"*. Es una sola pieza sirviendo a las dos etapas, no dos flujos.

---

## 4. Modelo de datos

### `plan.suscripcion` (dentro de `companies/{companyId}`)

```ts
export interface TarjetaRegistrada {
  /** Lo que devuelve Flow en getRegisterStatus. Nunca guardamos más que esto. */
  marca: string          // 'Visa', 'Mastercard', …
  ultimos4: string
  registradaEn: string   // ISO completo
}

export interface Suscripcion {
  /** El cliente en Flow. `null` hasta que se crea. */
  flowCustomerId: string | null
  tarjeta: TarjetaRegistrada | null
  /**
   * `YYYY-MM-DD`: inicio del ciclo actualmente pagado.
   * `null` = todavía no se ha cobrado ni una vez (no hay ciclo que prorratear).
   */
  cicloDesde: string | null
  /** `YYYY-MM-DD`: el día en que toca ejecutar el próximo cargo. */
  proximoCobro: string
  /**
   * `YYYY-MM-DD`: el día del PRIMER cobro rechazado. `null` = al día.
   * Es el único campo que mueve la escalera de impago completa (§6).
   */
  impagoDesde: string | null
  /** El cupo que reemplaza a `maxVehiculos` al cerrar el ciclo. `null` = sin cambio pendiente. */
  cupoProximoCiclo: number | null
  /** `YYYY-MM-DD`: baja pedida, efectiva al cerrar el ciclo pagado. `null` = vigente. */
  cancelaEn: string | null
}
```

`PlanData` suma `suscripcion?: Suscripcion`. Se escribe con `savePlan`, que ya hace merge recursivo bajo `plan.*`.

**Por qué `cupoProximoCiclo` y no mutar `maxVehiculos`:** `maxVehiculos` es el cupo **vigente y pagado**, y todo el resto de la app lo lee para decidir si se puede crear un vehículo. Una bajada de plan no puede tocarlo hasta que cierre el ciclo que el cliente ya pagó — si no, un cliente que pagó por 11 vehículos y baja a 8 quedaría por encima de su propio cupo el mismo día. Ningún otro código necesita enterarse de este campo.

**Por qué `impagoDesde` y no un estado guardado:** el proyecto ya aprendió esto con `resumenDocs` — un documento pasa de "al día" a "por vencer" a medianoche sin que nadie escriba, así que el estado guardado queda viejo solo. Aquí pasa igual: una cuenta cruza de `solo_lectura` a `bloqueada` por el mero paso del tiempo. Se guarda la fecha y el estado se deriva.

### `pagos/{commerceOrder}` — colección nueva

```ts
/** `pendiente` es el estado con que se RESERVA el documento antes de llamar a Flow (§7). */
export type EstadoPago = 'pendiente' | 'ok' | 'rechazado' | 'sin_cargo'
export type MotivoPago = 'ciclo' | 'prorrateo'

export interface Pago {
  /** Es el ID del documento. Determinista — ver §7. */
  commerceOrder: string
  companyId: string
  motivo: MotivoPago
  estado: EstadoPago
  /** CLP, entero. `0` cuando la promoción cubre toda la flota. */
  monto: number
  vehiculos: number
  vehiculosCobrados: number
  periodicidad: Periodicidad
  /** `YYYY-MM-DD` del ciclo que este pago cubre. */
  cicloDesde: string
  cicloHasta: string
  /** Lo que devolvió Flow, para poder auditar un reclamo. */
  flowOrder: number | null
  flowStatus: number | null
  flowError: string | null
  createdAt: string
}
```

Bloqueada al cliente en `firestore.rules` (`allow read, write: if false`), como `usages`, `mantenciones` y `transferencias`. **Recordar desplegar las reglas** con `scripts/deploy-firestore-rules.mjs`.

**`listPagos(companyId)` filtra por `companyId` y ordena en memoria**, sin `orderBy`. Combinar igualdad con `orderBy` sobre otro campo exigiría un **índice compuesto**, y con eso el historial responde 503 hasta que alguien lo cree — el mismo modo de falla que ya tiene la bitácora de `/reportes`. Una empresa acumula 12 pagos al año: ordenar en memoria es gratis y no agrega una dependencia de despliegue.

---

## 5. El ciclo de cobro

### `cobrarCiclo(companyId, hoy)` — una función, dos disparadores

Vive en `lib/data/pagos.ts` y la llaman **el cron** (§8) y **el retorno del registro de tarjeta** (§9). Que la llamen dos caminos no importa porque es idempotente (§7); lo que se gana es que un cliente que acaba de poner su tarjeta ve el cobro en el momento, en vez de esperar hasta el cron del día siguiente.

Pasos:

1. Lee la empresa y cuenta sus vehículos (`listVehicles`).
2. `fase = faseDelPlan(...)` y `cobertura = coberturaDe(...)` con `hoy`.
3. Si `fase === 'prueba'` → no hay nada que cobrar. Avanza `proximoCobro` a `gratisHasta + 1 día` y termina.
4. `cargo = cargoDe({ vehiculos: maxVehiculos, periodicidad, vehiculosIncluidos: cobertura })`.
5. **Si `cargo.monto === 0`** (la promoción cubre toda la flota) → registra el pago con `estado: 'sin_cargo'`, **avanza el ciclo igual** y termina, sin llamar a Flow. Avanzar es obligatorio: si no, el cron intentaría cobrar a esa empresa todos los días para siempre.
6. Si no hay tarjeta registrada → se trata como un rechazo (paso 8), sin llamar a Flow.
7. **Reserva `pagos/{commerceOrder}` en estado `pendiente`** (§7) y llama a `customer/charge`. Si responde bien: actualiza a `estado: 'ok'`, `cicloDesde = hoy`, `proximoCobro = proximoCobroDesde(hoy, periodicidad)`, `impagoDesde = null`, y aplica `cupoProximoCiclo` a `maxVehiculos` si estaba pendiente. Envía el comprobante.
8. Si falla: actualiza a `estado: 'rechazado'` con el error de Flow, **no avanza el ciclo**, y estampa `impagoDesde = hoy` **solo si estaba en `null`** (la fecha marca el primer rechazo, no el último). Envía el aviso.

Si la reserva del paso 7 falla porque el documento ya existe, otra ejecución ya está cobrando ese ciclo: se sale sin hacer nada.

**El ciclo no avanza mientras el cobro falla.** Esa es la propiedad que hace que el cron no necesite una segunda consulta para encontrar a los morosos: siguen teniendo `proximoCobro <= hoy`.

### `proximoCobroDesde(fecha, periodicidad)`

`addMeses(fecha, 1)` o `addMeses(fecha, 12)` — reusa el helper que ya existe en `lib/mantencion/status.ts`, que ya resuelve el caso del 31 de enero.

---

## 6. La escalera de impago

`lib/billing/ciclo.ts`, puro:

```ts
export type EstadoCobranza = 'al_dia' | 'reintentando' | 'solo_lectura' | 'bloqueada'

/** Días del impago en que se reintenta el cobro. */
export const REINTENTOS = [1, 3, 7]
/** Desde este día del impago la cuenta no puede escribir. */
export const DIA_SOLO_LECTURA = 8
/** Y 30 días después tampoco puede leer. */
export const DIA_BLOQUEO = DIA_SOLO_LECTURA + 30 // 38

export function estadoCobranza(impagoDesde: string | null | undefined, hoy: string): EstadoCobranza
export function puedeEscribir(e: EstadoCobranza): boolean  // 'al_dia' | 'reintentando'
export function puedeLeer(e: EstadoCobranza): boolean      // todo menos 'bloqueada'
export function tocaReintentar(impagoDesde: string, hoy: string): boolean
```

| Días desde `impagoDesde` | Estado | App | Ficha pública |
|---|---|---|---|
| — (sin impago) | `al_dia` | completa | funciona |
| 0 – 7 | `reintentando` | completa, con franja roja | funciona |
| 8 – 37 | `solo_lectura` | lee, no escribe | funciona |
| 38 en adelante | `bloqueada` | bloqueada | **bloqueada** |

**Por qué la ficha pública sí se bloquea, al final.** El valor que el cliente consume es la ficha: si se mantiene viva para siempre, el producto se convierte en *"paga un mes, sube tus documentos, da de baja y quédate con el chip el resto del año"*. Y por qué **no** se apaga el día 0: el que lee esa ficha es un carabinero fiscalizando, y apagarla sin aviso convierte un problema de cobranza en una multa para un tercero. Los 30 días de solo lectura son exactamente ese aviso — y en ellos el cliente puede descargar todos sus documentos.

**Bloquear no es borrar.** Nada se elimina. El día que paga, `impagoDesde` vuelve a `null` y todo reaparece donde estaba.

### La baja voluntaria usa la misma escalera, con una diferencia

Al cerrar el ciclo pagado, el cron estampa `impagoDesde = cancelaEn` y `estadoCobranza` hace el resto — un solo camino de código, no dos. La diferencia está en la ficha pública: **se apaga de inmediato** al cerrar el ciclo, sin esperar los 38 días. Para eso `PublicVehicleView` consulta también `cancelaEn`.

Los dos tratos distintos son deliberados. La ficha es lo que el cliente está pagando y su corte no sorprende a nadie: quien se dio de baja lo hizo a propósito y puede avisarle a sus conductores. La app, en cambio, muestra **sus propios datos**, así que conserva la escalera completa: siete días de acceso pleno —que en la práctica son la ventana para arrepentirse y deshacer la baja— y después 30 días de solo lectura para descargar todo.

---

## 7. Idempotencia: donde un error cuesta plata de verdad

Un cron diario que ejecuta cobros tiene una falla catastrófica posible: **cobrar dos veces**. Un timeout de red, un reintento de la plataforma, un deploy a mitad de ejecución, o el cron y el retorno del registro de tarjeta corriendo a la vez.

```
ciclo:      `${companyId}-ciclo-${cicloDesde}`
prorrateo:  `${companyId}-prorrateo-${cicloDesde}-${cupoNuevo}`
```

Ese string es **el id del documento** en `pagos/{commerceOrder}`, y el pago se registra con `.create()`, que **falla si el documento ya existe**. Es la misma técnica que hace que `promoCodes/{CODIGO}` no necesite comprobar unicidad.

**El prorrateo lleva el cupo nuevo en la clave y eso no es decorativo:** un cliente puede subir de 10 a 11 y días después de 11 a 12, dentro del **mismo ciclo**. Sin el cupo en la clave, la segunda subida chocaría con la primera y quedaría con el cupo aumentado sin haberse cobrado nunca. Con el cupo incluido, las dos son cobros distintos, y repetir la *misma* subida sigue siendo imposible — que es exactamente lo que se quería.

El orden importa: **se reserva el documento antes de llamar a Flow**, no después. Se crea el `pagos/{id}` en estado `pendiente`, se llama a Flow, y se actualiza con el resultado. Si se hiciera al revés, dos ejecuciones simultáneas cobrarían las dos antes de que ninguna escribiera.

Un pago que quede en `pendiente` significa que el proceso murió entre la reserva y la respuesta de Flow — el único caso que hay que resolver a mano, consultando en el panel de Flow si el cargo salió. Es un estado raro y visible, que es mucho mejor que un cobro doble silencioso.

Flow además rechaza un `commerceOrder` repetido, así que hay dos redes independientes. La nuestra es la que manda porque es la única que actúa **antes** del cargo.

---

## 8. `/api/cron/cobros`

Ruta nueva, **separada de `/api/cron/reminders`** a propósito: mezclar cobros con envío de correos hace que un fallo en uno se lleve puesto al otro, y son trabajos con perfiles de riesgo completamente distintos. Mismo guard: `Authorization: Bearer ${CRON_SECRET}`, fallando cerrado. Entrada en `vercel.json` y `export const maxDuration`.

**La consulta:**

```ts
adminDb.collection('companies').where('plan.suscripcion.proximoCobro', '<=', hoy).get()
```

Un rango sobre **un solo campo**, así que le basta el índice de campo único automático de Firestore: **no necesita índice compuesto** y por lo tanto no hay riesgo de orden de despliegue. Es la misma propiedad que aprovecha `listDocumentsPorVencer`.

Y trae de una sola vez a los dos grupos que interesan, porque `proximoCobro` no avanza mientras el cobro falla:

```
por cada empresa:
  si impagoDesde == null            → cobrarCiclo()
  si tocaReintentar(impagoDesde, hoy) → cobrarCiclo()
  si no                              → saltar
```

Después del último reintento (día 7) el cron deja de intentar. Reintentar a diario durante un mes solo suma rechazos en el estado de cuenta del cliente y comisiones. Desde ahí la reactivación es del cliente: actualizar la tarjeta o apretar "Pagar ahora" en Facturación, y ambos caminos llaman a `cobrarCiclo`.

Además cierra las bajas: si `cancelaEn <= hoy`, estampa `impagoDesde = cancelaEn` para que arranque la escalera de solo lectura.

El trabajo por empresa va con `try/catch` propio: un error en una empresa no puede detener el cron para las demás.

---

## 9. `lib/flow/` — el cliente de la API

### `firma.ts` (puro)

Flow firma cada request así: se ordenan los parámetros alfabéticamente por clave, se concatena `clave + valor` sin separadores, y se firma con **HMAC-SHA256** usando la `secretKey`, en hexadecimal. El resultado va como parámetro `s`.

```ts
export function firmar(params: Record<string, string | number>, secretKey: string): string
export function conFirma(params: Record<string, string | number>, secretKey: string): URLSearchParams
```

Va en su propio archivo y con tests de vector conocido porque es exactamente el lugar donde se pierde una tarde: un parámetro de más, un orden distinto o un número convertido a string de otra forma producen un `401` sin ninguna pista de por qué.

### `client.ts`

`flowPost(endpoint, params)` y `flowGet(endpoint, params)`, con `Content-Type: application/x-www-form-urlencoded` en los POST. Credenciales con **init lazy** (patrón `getResend()`): leerlas en module scope rompe el build de Vercel cuando no están definidas.

Endpoints usados:

| Endpoint | Para qué |
|---|---|
| `customer/create` | crear el cliente la primera vez |
| `customer/register` | devuelve `{ url, token }`; se redirige al cliente a `{url}?token={token}` |
| `customer/getRegisterStatus` | tras el retorno: confirma el registro y da marca y últimos 4 |
| `customer/charge` | el cargo. Falla si no hay tarjeta registrada |
| `customer/unRegister` | quitar la tarjeta |

`FLOW_API_URL` decide sandbox (`https://sandbox.flow.cl/api`) o producción (`https://www.flow.cl/api`), y es lo que permite probar en local sin tocar tarjetas reales. Sandbox y producción tienen **credenciales distintas**: `FLOW_API_KEY` y `FLOW_SECRET_KEY` cambian junto con la URL.

---

## 10. Endpoints de TapCar

Todos exigen `getMembership()` + `can(role, 'billing:manage')` — o sea, solo el Administrador de la empresa, igual que el resto de Facturación.

| Endpoint | Qué hace |
|---|---|
| `POST /api/pagos/tarjeta` | Crea el cliente en Flow si `flowCustomerId` es `null`, llama `customer/register` y devuelve la URL a la que redirigir |
| `GET /api/pagos/retorno` | Flow devuelve al usuario acá con un `token`. Llama `getRegisterStatus`, guarda `tarjeta`, dispara `cobrarCiclo` si `proximoCobro <= hoy`, y redirige a `/facturacion` |
| `DELETE /api/pagos/tarjeta` | `customer/unRegister` y limpia `tarjeta` |
| `POST /api/pagos/cobrar-ahora` | Llama `cobrarCiclo`. Para el cliente que arregló su tarjeta o cuyo banco rechazó por una vez |
| `PATCH /api/plan/cupo` | Sube: prorratea y cobra al instante. Baja: escribe `cupoProximoCiclo` |
| `POST /api/plan/cancelar` | Escribe `cancelaEn = proximoCobro` |
| `DELETE /api/plan/cancelar` | Deshace la baja mientras el ciclo no haya cerrado |

### `PATCH /api/plan/cupo` y el prorrateo

```ts
// lib/billing/ciclo.ts, puro
export function prorrateo({
  cupoAnterior, cupoNuevo, periodicidad, vehiculosIncluidos,
  cicloDesde, proximoCobro, hoy,
}): { monto: number; fraccion: number }
```

`monto = (cobradosNuevo − cobradosAnterior) × precioUnitario × (días hasta proximoCobro / días del ciclo)`, donde los "cobrados" salen de `cargoDe`, así que **la cobertura promocional entra sola**: si la promoción cubre 5 vehículos y el cliente pasa de 5 a 6, el prorrateo cobra 1, no 6.

Reglas del endpoint:

- **Subir** cobra la diferencia en el momento, con `commerceOrder` de motivo `prorrateo`. Si el cobro falla, **el cupo no sube** — responde 402 y no deja a la empresa con más cupo del que pagó.
- **Bajar** no devuelve plata ni deja saldo a favor: escribe `cupoProximoCiclo` y el cliente conserva su cupo actual hasta que el ciclo cierre. La pantalla lo dice explícitamente: *"conservas tus 11 vehículos hasta el 01/09/2026"*.
- **No se puede bajar por debajo de los vehículos ya registrados** — 409 `cupo_menor_al_uso`, la misma comprobación que ya hace `POST /api/plan`.
- Con `cicloDesde === null` (todavía no hubo un solo cobro) no hay prorrateo: subir el cupo solo cambia lo que se cobrará.
- El tope `MAX_VEHICULOS_SELF_SERVICE = 30` sigue rigiendo.

---

## 11. Dónde se aplica el bloqueo

**Endpoints de escritura** → helper `requireCuentaActiva(m)` en `lib/auth/`, que lee la empresa y responde **402** si `!puedeEscribir(estado)`. Cuesta una lectura de Firestore por request que muta; las escrituras son mucho menos frecuentes que las lecturas, así que el costo es despreciable. Se aplica a los endpoints de vehículos, documentos, mantenciones, conductores, transferencias y equipo. **No** se aplica a `/api/pagos/*` ni a `/api/plan/*`, o el cliente no podría pagar para salir del bloqueo.

**Ficha pública `/v/[token]`** → una lectura extra de la empresa por visita. Si `!puedeLeer(estado)` o la baja ya cerró, muestra una página neutra **sin documentos**: "Esta ficha no está disponible". No un 404, que se lee como que el chip está roto.

**Bloqueo de lectura en la app** → el dashboard y la ficha del vehículo **ya cargan la empresa** con `getCompany`, así que ahí no cuesta nada. Se acepta que entrar por URL directa a `/reportes` se saltee el bloqueo de lectura: es cosmético, porque escribir sigue bloqueado en el servidor y los datos que se ven son los del propio cliente. La alternativa —el portero en el layout de `(app)`— cuesta una lectura en **cada** navegación de **todos** los clientes, para siempre; es la misma razón por la que el portero del onboarding vive en el dashboard y no en el layout.

**Franja de aviso** → `components/plan/FranjaCobranza.tsx`, hermana de `FranjaPrueba`, en el dashboard. Muestra el estado y la fecha del próximo hito en `dd/mm/aaaa`, con CTA a Facturación.

---

## 12. Migración de las cuentas que ya existen

Script `scripts/migrar-suscripciones.mjs` (dry-run sin `--apply`, como todos). **Debe correr antes de `LANZAMIENTO_HASTA`.** Reemplaza a `scripts/backfill-prueba.mjs`, que queda obsoleto.

Por cada empresa:

1. **`gratisHasta` → `LANZAMIENTO_HASTA`** si está ausente o es anterior. Es una promoción de lanzamiento: no tiene sentido que quien llegó primero reciba menos.
2. **`periodicidad` ausente → `null`.** Esto retira a propósito la distinción "ausente ≠ null" que A había introducido. Su motivo era no depender de que el backfill corriera antes del deploy; con pasarela deja de ser sostenible, porque **si no sabemos cada cuánto cobrarle a una cuenta, no podemos cobrarle**. Poniéndolo en `null`, `debeElegirPlan` las manda a `/plan` a elegir, usando maquinaria que ya existe y ya está probada.
3. **Siembra `plan.suscripcion`** con `flowCustomerId: null`, `tarjeta: null`, `cicloDesde: null`, `proximoCobro = addDias(gratisHasta, 1)`, `impagoDesde: null`, `cupoProximoCiclo: null`, `cancelaEn: null`.

Sin el paso 3 esas empresas nunca aparecerían en la consulta del cron: no se les cobraría jamás, y tampoco se las bloquearía. Igual que `createVehicle` siembra `resumenDocs`, **`createCompany` pasa a sembrar `suscripcion`**, para que una cuenta nueva no dependa de que un backfill vuelva a correr.

---

## 13. Formato de fechas: `dd/mm/aaaa` en todo lo que ve una persona

Va **primero y en su propio commit**, antes de la pasarela. Si no, las pantallas nuevas de facturación nacen con el problema y hay que volver a pasar por ellas.

`es-CL` **no** produce `dd/mm/aaaa`. Lo que la app muestra hoy, verificado en el runtime:

| Formato real | Dónde |
|---|---|
| `01-09-26` (año de **dos dígitos**) | `VehicleCard`, `BitacoraUso`, `BitacoraFlota`, `UsoPanel`, `DanoActivoPanel` y la **ficha pública** |
| `01-09-2026` | km actualizado en la ficha del vehículo |
| `1 de septiembre de 2026` | `/facturacion`, `FranjaPrueba` |
| `1 de septiembre` (sin año) | `TransferirVehiculoPanel` |
| `2026-09-01` | el CSV de `/admin` |

Cinco formatos y ninguno es el pedido. El peor es el primero: al carabinero se le muestra el año truncado.

```ts
// lib/fecha.ts
/** `'2026-09-01'` → `'01/09/2026'`. Sin `Date`: es reordenar tres números. */
export function fechaCalendario(iso: string | null | undefined): string
/** Instante ISO → `'01/09/2026'` en hora de Chile. */
export function fecha(iso: string | null | undefined): string
/** Instante ISO → `'01/09/2026 11:30'` (24h). */
export function fechaHora(iso: string | null | undefined): string
```

Dos decisiones:

- **Locale `en-GB`**, que produce `01/09/2026` de forma estable. Es el mismo criterio que ya usa `hoyEnChile` con `en-CA` para obtener `YYYY-MM-DD`: se elige el locale por el formato que garantiza, no por el país.
- **`fechaCalendario` no usa `Date`.** Eso *elimina* la clase de bug que hoy `/facturacion` tiene que documentar y esquivar: `new Date('2026-09-01')` es medianoche UTC y en Chile se ve como el día anterior. Sin `Date`, no hay zona horaria de la cual defenderse.

Entrada inválida o vacía devuelve `''` en las tres, para que una fecha corrupta no tumbe una página.

Se reemplazan **todos** los `toLocaleDateString` / `toLocaleString` de fecha en `app/` y `components/`, incluidos los dos textos largos. El CSV de `/admin` también pasa a `dd/mm/aaaa`: ahí además se gana que Excel las reconozca como fecha real y se puedan ordenar y filtrar. Los `toLocaleString('es-CL')` de **números** (kilometraje, montos) no se tocan.

---

## 14. Correos

Cinco plantillas nuevas en `lib/email/`, todas con el `emailLayout` y su CTA, como las ocho que ya existen. **Actualizar la lista de `CLAUDE.md`**, que pasa de ocho a trece.

| Plantilla | Cuándo | CTA |
|---|---|---|
| `pagoOkEmail` | cobro exitoso — es el comprobante que el cliente espera | "Ver el detalle" → `/facturacion` |
| `pagoFallidoEmail` | en cada intento rechazado (días 0, 1, 3 y 7) | "Actualizar mi tarjeta" |
| `cuentaSoloLecturaEmail` | día 8: dice la fecha exacta del bloqueo | "Regularizar" |
| `bloqueoProximoEmail` | 7 días antes del bloqueo total | "Regularizar" |
| `bajaConfirmadaEmail` | al pedir la baja: dice hasta cuándo tiene servicio | "Deshacer la baja" |

Van a los destinatarios que ya resuelve `alertRecipientEmails`. Envío **best-effort**: que un correo falle no puede alterar el resultado de un cobro.

---

## 15. Seguridad

- `FLOW_SECRET_KEY` **nunca** sale del servidor. La firma se calcula en el servidor; no hay ninguna llamada a Flow desde el navegador.
- **El retorno de Flow no se cree.** `GET /api/pagos/retorno` recibe un `token` por query string y **debe** validarlo llamando a `customer/getRegisterStatus`. Confiar en los parámetros del retorno permitiría a cualquiera marcar su cuenta como "tarjeta registrada" visitando una URL.
- El `commerceOrder` contiene el `companyId`, pero la autoridad es siempre `getMembership()`: ningún endpoint acepta un `companyId` del cliente.
- **No se guarda ningún dato de tarjeta.** Solo marca y últimos 4, que es lo que Flow devuelve. El número nunca pasa por TapCar: lo captura una página de Flow.
- `pagos` bloqueada al cliente en `firestore.rules`.
- `requireCuentaActiva` **no** se aplica a `/api/pagos/*` ni `/api/plan/*`.

---

## 16. Archivos

**Nuevos**
- `lib/fecha.ts` + tests
- `lib/flow/firma.ts` + tests
- `lib/flow/client.ts`
- `lib/billing/ciclo.ts` + tests (`estadoCobranza`, `puedeEscribir`, `puedeLeer`, `tocaReintentar`, `proximoCobroDesde`, `prorrateo`)
- `lib/data/pagos.ts` (`cobrarCiclo`, `registrarPago`, `listPagos`)
- `lib/email/pagoEmail.ts` (`pagoOkEmail` + `pagoFallidoEmail`), `lib/email/cobranzaEmail.ts` (`cuentaSoloLecturaEmail` + `bloqueoProximoEmail`), `lib/email/bajaEmail.ts` (`bajaConfirmadaEmail`)
- `app/api/cron/cobros/route.ts`
- `app/api/pagos/tarjeta/route.ts`, `app/api/pagos/retorno/route.ts`, `app/api/pagos/cobrar-ahora/route.ts`
- `app/api/plan/cupo/route.ts`, `app/api/plan/cancelar/route.ts`
- `components/plan/FranjaCobranza.tsx`, `components/plan/TarjetaPanel.tsx`, `components/plan/CambiarCupoPanel.tsx`, `components/plan/HistorialPagos.tsx`
- `scripts/migrar-suscripciones.mjs`

**Modificados**
- `lib/types.ts` (`Suscripcion`, `TarjetaRegistrada`, `Pago`, `PlanData.suscripcion`)
- `lib/plan/prueba.ts` (`LANZAMIENTO_HASTA`, se va `DIAS_PRUEBA`)
- `lib/data/companies.ts` (`createCompany` siembra `suscripcion`)
- `app/api/plan/route.ts` (estampa la fecha de lanzamiento; siembra `suscripcion`)
- `app/(app)/facturacion/page.tsx` (tarjeta, cupo, historial, baja)
- `app/(app)/dashboard/page.tsx` + `components/VehiclesBoard.tsx` (`FranjaCobranza`)
- `app/v/[token]/page.tsx` + `components/PublicVehicleView.tsx` (bloqueo)
- `app/(app)/admin/page.tsx` (la "recaudación estimada" pasa a sumar `cargoDe` por empresa con `faseDelPlan` + `coberturaDe`, para que deje de contradecir a la columna "Cobro actual" del CSV — deuda ya anotada en `CLAUDE.md`)
- los ~10 archivos con `toLocaleDateString` (§13)
- los endpoints de escritura (`requireCuentaActiva`)
- `firestore.rules`, `vercel.json`, `.env.example`, `CLAUDE.md`
- `scripts/backfill-prueba.mjs` → se elimina

---

## 17. Testing

Lo que **sí** se prueba automáticamente:

- **`lib/fecha.ts`**: las tres funciones, el borde de las 23:30 UTC (donde Chile todavía va un día atrás), y entrada vacía o corrupta.
- **`lib/flow/firma.ts`**: vector conocido, orden alfabético con claves que se ordenan distinto de como se escriben, y valores numéricos.
- **`lib/billing/ciclo.ts`**: los cuatro estados con sus **bordes exactos** (día 7 vs 8, día 37 vs 38); `tocaReintentar` en días que sí y que no; `prorrateo` con y sin cobertura promocional, con `cicloDesde` nulo, y con bajada (que no cobra).
- **`cobrarCiclo`** con dependencias inyectadas (patrón `runReminders`): fase prueba no cobra pero avanza; monto 0 no llama a Flow pero avanza; rechazo no avanza y estampa `impagoDesde`; un segundo rechazo **no** mueve `impagoDesde`; cobro exitoso limpia el impago y aplica `cupoProximoCiclo`.
- **Idempotencia**: dos `cobrarCiclo` seguidos producen **un** cargo.
- **El cron**: solo cobra a quien le toca, y un error en una empresa no detiene a las demás.
- **`requireCuentaActiva`**: 402 en `solo_lectura` y `bloqueada`, paso libre en `reintentando`.

Lo que **no** se puede probar automáticamente y hay que hacer a mano en el sandbox de Flow: el registro de tarjeta de punta a punta, el cargo real, y el comportamiento con una tarjeta de prueba rechazada. Se documenta como checklist de despliegue.

---

## 18. Orden de ejecución

El spec es grande y sus partes no dependen todas entre sí. El orden importa por dos razones concretas, no por gusto:

1. **Formato de fechas (§13).** Primero, porque las pantallas nuevas de facturación muestran fechas y deben nacer usando el helper. Es autocontenido y desplegable solo.
2. **Ventana de lanzamiento (§3) + migración (§12).** Segundo, y **tiene que estar en producción antes del 1 de septiembre**. También es desplegable solo: sin pasarela, una cuenta con `gratisHasta` vencida simplemente no se cobra, igual que hoy.
3. **La pasarela (§4–§11, §14).** El grueso. No se puede desplegar a medias: el bloqueo por impago (§11) **no debe salir antes** de que exista la forma de pagar, o dejaría cuentas capadas sin salida.

Los pasos 1 y 2 son entregables independientes; el 3 es uno solo.

## 19. Fuera de alcance

- **El DTE del SII.** Flow entrega comprobante de pago, no boleta ni factura electrónica. La colección `pagos` queda con todo lo necesario para alimentarlo, pero emitirlo es un proyecto propio con su propio proveedor.
- **Cambiar de periodicidad** (mensual ↔ anual) una vez elegida. Requiere decidir qué pasa con el ciclo pagado y no hay urgencia.
- **Más de una tarjeta** por empresa, y elegir con cuál cobrar.
- **Reembolsos y notas de crédito.** La bajada de plan no devuelve plata por diseño (§10).
- **La vista de cobranza mensual en `/admin`** ("¿a quién le cobro este mes y cuánto?"). Con este spec la pregunta pasa a responderla el propio sistema: el CSV ya trae fase y cobro real por empresa.
- **Retención de fotos de bitácora** — sigue sin política, por las razones ya anotadas en `CLAUDE.md`.
