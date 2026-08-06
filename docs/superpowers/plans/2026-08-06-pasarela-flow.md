# Pasarela de pago (Flow) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El cliente registra su tarjeta una vez y TapCar le cobra solo cada mes o cada año, con prorrateo al subir de plan, códigos promocionales descontados, y una escalera de impago que termina apagando la ficha pública.

**Architecture:** Cargo Automático de Flow (`customer/register` + `customer/charge`), con TapCar como motor de cobros. Toda la lógica de cuándo y cuánto vive en módulos puros; Flow solo ejecuta el cargo. Un cron diario recorre a quien le toca. La idempotencia se apoya en el id del documento de Firestore.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Firestore (Admin SDK), Flow API, Resend, Vitest.

**Contexto:** Tercer y último entregable del spec [2026-08-06-pasarela-flow-design.md](../specs/2026-08-06-pasarela-flow-design.md). **Requiere que los dos anteriores estén desplegados** — usa `lib/fecha.ts` y el bloque `plan.suscripcion` que siembra la migración. A diferencia de ellos, **no se puede desplegar a medias**: el bloqueo por impago no debe salir antes de que exista la forma de pagar.

## Global Constraints

- **Nunca cobrar dos veces.** Todo cargo pasa por la reserva de `pagos/{commerceOrder}` con `.create()` **antes** de llamar a Flow.
- **`FLOW_SECRET_KEY` no sale del servidor.** Ninguna llamada a Flow desde el navegador.
- **El retorno de Flow no se cree**: el `token` del query string se valida contra `customer/getRegisterStatus`.
- **No se guarda ningún dato de tarjeta** salvo marca y últimos 4.
- Escalera de impago: reintentos los días **1, 3 y 7**; solo lectura desde el día **8**; bloqueo total desde el día **38** (8 + 30).
- **La ficha pública se bloquea recién en el día 38**, nunca antes. Excepción única: la baja voluntaria la apaga al cerrar el ciclo pagado.
- **Bloquear no es borrar.** Ningún dato se elimina por impago.
- `requireCuentaActiva` **no** se aplica a `/api/pagos/*` ni `/api/plan/*`, o el cliente no podría pagar para salir del bloqueo.
- Todos los endpoints privados: `getMembership()` + `can(role, 'billing:manage')`. Nunca confiar en un `companyId` del cliente.
- Fechas visibles en **`dd/mm/aaaa`** vía `lib/fecha.ts`. Montos con `formatCLP`.
- Firestore Admin **rechaza `undefined`**: objetos sin claves `undefined`, o `?? null`.
- **Ninguna consulta nueva puede requerir un índice compuesto.** Un índice faltante responde 503 y crea riesgo de orden de despliegue.
- Todo segmento que use `after()` fija `export const maxDuration` explícito.
- Todo el código, comentarios y UI en español neutro de Chile, tratando de "tú".
- Tras cambios: `npx tsc --noEmit`, `npm run build` y `npx eslint app components lib`.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `lib/billing/ciclo.ts` | **Nuevo.** Puro: la escalera de impago, el avance del ciclo y el prorrateo. |
| `lib/flow/firma.ts` | **Nuevo.** Puro: la firma HMAC de cada request. |
| `lib/flow/client.ts` | **Nuevo.** Las cinco llamadas a Flow, con init lazy. |
| `lib/data/pagos.ts` | **Nuevo.** La colección `pagos` y `cobrarCiclo`, el orquestador. |
| `lib/email/pagoEmail.ts`, `cobranzaEmail.ts`, `bajaEmail.ts` | **Nuevos.** Cinco plantillas. |
| `lib/auth/cuenta.ts` | **Nuevo.** `requireCuentaActiva`, el guard de escritura. |
| `app/api/pagos/*`, `app/api/plan/cupo`, `app/api/plan/cancelar` | **Nuevos.** Los endpoints. |
| `app/api/cron/cobros/route.ts` | **Nuevo.** El cron, separado del de recordatorios. |
| `components/plan/*` | **Nuevos.** Tarjeta, cupo, historial, baja y la franja de cobranza. |

---

### Task 1: `lib/billing/ciclo.ts` — la lógica pura

**Files:**
- Create: `lib/billing/ciclo.ts`
- Test: `lib/billing/__tests__/ciclo.test.ts`

**Interfaces:**
- Consumes: `cargoDe` de `lib/billing.ts`, `addMeses` de `lib/mantencion/status.ts`.
- Produces: `EstadoCobranza`, `REINTENTOS`, `DIA_SOLO_LECTURA`, `DIA_BLOQUEO`, `estadoCobranza`, `puedeEscribir`, `puedeLeer`, `tocaReintentar`, `proximoCobroDesde`, `prorrateo`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/billing/__tests__/ciclo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  DIA_BLOQUEO, DIA_SOLO_LECTURA, estadoCobranza, prorrateo,
  proximoCobroDesde, puedeEscribir, puedeLeer, tocaReintentar,
} from '@/lib/billing/ciclo'

describe('estadoCobranza', () => {
  it('sin impago está al día', () => {
    expect(estadoCobranza(null, '2026-09-10')).toBe('al_dia')
    expect(estadoCobranza(undefined, '2026-09-10')).toBe('al_dia')
  })

  // Los bordes son lo único que importa acá: un día de más o de menos capa
  // a un cliente antes de tiempo, o le regala un mes de servicio.
  it('respeta los bordes exactos', () => {
    const i = '2026-09-01'
    expect(estadoCobranza(i, '2026-09-01')).toBe('reintentando')  // día 0
    expect(estadoCobranza(i, '2026-09-08')).toBe('reintentando')  // día 7
    expect(estadoCobranza(i, '2026-09-09')).toBe('solo_lectura')  // día 8
    expect(estadoCobranza(i, '2026-10-07')).toBe('solo_lectura')  // día 36
    expect(estadoCobranza(i, '2026-10-09')).toBe('bloqueada')     // día 38
  })

  it('los umbrales son 8 y 38', () => {
    expect(DIA_SOLO_LECTURA).toBe(8)
    expect(DIA_BLOQUEO).toBe(38)
  })
})

describe('puedeEscribir / puedeLeer', () => {
  it('reintentando conserva el acceso completo', () => {
    expect(puedeEscribir('reintentando')).toBe(true)
    expect(puedeLeer('reintentando')).toBe(true)
  })

  it('solo_lectura lee pero no escribe', () => {
    expect(puedeEscribir('solo_lectura')).toBe(false)
    expect(puedeLeer('solo_lectura')).toBe(true)
  })

  it('bloqueada no hace nada', () => {
    expect(puedeEscribir('bloqueada')).toBe(false)
    expect(puedeLeer('bloqueada')).toBe(false)
  })
})

describe('tocaReintentar', () => {
  it('solo en los días 1, 3 y 7', () => {
    const i = '2026-09-01'
    expect(tocaReintentar(i, '2026-09-02')).toBe(true)   // día 1
    expect(tocaReintentar(i, '2026-09-04')).toBe(true)   // día 3
    expect(tocaReintentar(i, '2026-09-08')).toBe(true)   // día 7
    expect(tocaReintentar(i, '2026-09-01')).toBe(false)  // día 0: ya se cobró hoy
    expect(tocaReintentar(i, '2026-09-03')).toBe(false)  // día 2
    expect(tocaReintentar(i, '2026-09-15')).toBe(false)  // día 14
  })

  // Reintentar a diario durante un mes solo acumula rechazos en el estado de
  // cuenta del cliente y comisiones. Después del día 7 la reactivación es suya.
  it('deja de reintentar pasado el último hito', () => {
    expect(tocaReintentar('2026-09-01', '2026-10-01')).toBe(false)
  })
})

describe('proximoCobroDesde', () => {
  it('avanza un mes o un año', () => {
    expect(proximoCobroDesde('2026-09-02', 'mensual')).toBe('2026-10-02')
    expect(proximoCobroDesde('2026-09-02', 'anual')).toBe('2027-09-02')
  })

  // `addMeses` recorta con `Math.min(día, últimoDelMes)`. Consecuencia
  // aceptada: un cliente que contrata un 31 queda cobrándose el 28 desde
  // febrero en adelante — la fecha se ancla hacia atrás y no vuelve a subir.
  // Se cobra antes, nunca después, así que no perdemos plata y el cliente no
  // paga de más; arreglarlo exigiría guardar el día ancla original aparte.
  it('sobrevive al 31 de enero', () => {
    expect(proximoCobroDesde('2026-01-31', 'mensual')).toBe('2026-02-28')
    expect(proximoCobroDesde('2026-02-28', 'mensual')).toBe('2026-03-28')
  })
})

describe('prorrateo', () => {
  const base = {
    periodicidad: 'anual' as const,
    vehiculosIncluidos: 0,
    cicloDesde: '2026-01-01',
    proximoCobro: '2027-01-01',
  }

  // El caso que motivó todo el diseño: plan anual de 10 autos facturado el 1
  // de enero, agrega el 11 el 1 de junio. Un vehículo anual son $23.328 y
  // quedan 214 de los 365 días del ciclo.
  it('cobra la fracción del ciclo que queda', () => {
    const { monto } = prorrateo({ ...base, cupoAnterior: 10, cupoNuevo: 11, hoy: '2026-06-01' })
    expect(monto).toBe(Math.round(23328 * (214 / 365)))
  })

  // La cobertura entra sola porque el cálculo pasa por `cargoDe`: si la promo
  // cubre 5 y el cliente va de 5 a 6, se cobra 1 vehículo, no 6.
  it('descuenta la cobertura promocional', () => {
    const conPromo = prorrateo({ ...base, vehiculosIncluidos: 5, cupoAnterior: 5, cupoNuevo: 6, hoy: '2026-06-01' })
    const sinPromo = prorrateo({ ...base, cupoAnterior: 0, cupoNuevo: 1, hoy: '2026-06-01' })
    expect(conPromo.monto).toBe(sinPromo.monto)
  })

  it('bajar no cobra ni devuelve nada', () => {
    expect(prorrateo({ ...base, cupoAnterior: 11, cupoNuevo: 8, hoy: '2026-06-01' }).monto).toBe(0)
  })

  // Sin un ciclo pagado no hay fracción que calcular: subir el cupo antes del
  // primer cobro solo cambia lo que se cobrará.
  it('sin ciclo pagado no cobra', () => {
    expect(prorrateo({ ...base, cicloDesde: null, cupoAnterior: 3, cupoNuevo: 9, hoy: '2026-06-01' }).monto).toBe(0)
  })

  it('el día del próximo cobro ya no prorratea', () => {
    expect(prorrateo({ ...base, cupoAnterior: 10, cupoNuevo: 11, hoy: '2027-01-01' }).monto).toBe(0)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/billing/__tests__/ciclo.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/billing/ciclo"`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/billing/ciclo.ts`:

```ts
// El calendario de cobro y la escalera de impago (puro, sin Firebase).
//
// Todo esto vive fuera de la capa de datos por el mismo motivo que
// `lib/documents/status.ts`: son las reglas que deciden si a un cliente se le
// cobra, se le capa o se le apaga el chip, y tienen que ser verificables sin
// levantar Firestore ni llamar a una pasarela.
import { cargoDe } from '@/lib/billing'
import { addMeses } from '@/lib/mantencion/status'
import type { Periodicidad } from '@/lib/types'

export type EstadoCobranza = 'al_dia' | 'reintentando' | 'solo_lectura' | 'bloqueada'

/** Días del impago en que se reintenta el cobro. */
export const REINTENTOS = [1, 3, 7]
/** Desde este día del impago la cuenta no puede escribir. */
export const DIA_SOLO_LECTURA = 8
/**
 * Y 30 días después tampoco puede leer — ahí se apaga también la ficha
 * pública. Escrito como suma para que los "30 días de gracia" acordados sean
 * visibles en el código y no un 38 mágico.
 */
export const DIA_BLOQUEO = DIA_SOLO_LECTURA + 30

const MS_DIA = 24 * 60 * 60 * 1000

/** Días calendario entre dos fechas `YYYY-MM-DD`. */
function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_DIA)
}

/**
 * En qué punto de la escalera de impago está la cuenta.
 *
 * Se deriva de UNA fecha, y eso no es economía de campos: una cuenta cruza de
 * `solo_lectura` a `bloqueada` por el mero paso del tiempo, sin que nadie
 * escriba nada. Un estado guardado quedaría viejo solo — la misma razón por la
 * que `resumenDocs` guarda fechas y no el estado de los documentos.
 */
export function estadoCobranza(impagoDesde: string | null | undefined, hoy: string): EstadoCobranza {
  if (!impagoDesde) return 'al_dia'
  const dias = diasEntre(impagoDesde, hoy)
  if (dias >= DIA_BLOQUEO) return 'bloqueada'
  if (dias >= DIA_SOLO_LECTURA) return 'solo_lectura'
  return 'reintentando'
}

export function puedeEscribir(estado: EstadoCobranza): boolean {
  return estado === 'al_dia' || estado === 'reintentando'
}

export function puedeLeer(estado: EstadoCobranza): boolean {
  return estado !== 'bloqueada'
}

export function tocaReintentar(impagoDesde: string, hoy: string): boolean {
  return REINTENTOS.includes(diasEntre(impagoDesde, hoy))
}

export function proximoCobroDesde(fecha: string, periodicidad: Periodicidad): string {
  return addMeses(fecha, periodicidad === 'anual' ? 12 : 1)
}

/**
 * Lo que hay que cobrar al instante por subir el cupo a mitad de ciclo.
 *
 * Pasa por `cargoDe` en vez de multiplicar por el precio unitario, y por eso
 * **la cobertura promocional entra sola**: si la promoción cubre 5 vehículos y
 * el cliente pasa de 5 a 6, la diferencia entre ambos cargos es de 1 vehículo.
 * Calcularlo a mano habría cobrado 6.
 *
 * Bajar devuelve 0 por diseño: no se reembolsa ni queda saldo a favor. Eso es
 * lo que evita tener que llevar saldos y emitir notas de crédito, que era la
 * mitad del proyecto.
 */
export function prorrateo({
  cupoAnterior,
  cupoNuevo,
  periodicidad,
  vehiculosIncluidos,
  cicloDesde,
  proximoCobro,
  hoy,
}: {
  cupoAnterior: number
  cupoNuevo: number
  periodicidad: Periodicidad
  vehiculosIncluidos: number
  /** `null` = todavía no hubo un ciclo pagado, así que no hay nada que prorratear. */
  cicloDesde: string | null
  proximoCobro: string
  hoy: string
}): { monto: number; fraccion: number } {
  if (cupoNuevo <= cupoAnterior || !cicloDesde) return { monto: 0, fraccion: 0 }

  const total = diasEntre(cicloDesde, proximoCobro)
  const restantes = diasEntre(hoy, proximoCobro)
  if (total <= 0 || restantes <= 0) return { monto: 0, fraccion: 0 }

  const fraccion = Math.min(1, restantes / total)
  const antes = cargoDe({ vehiculos: cupoAnterior, periodicidad, vehiculosIncluidos })
  const despues = cargoDe({ vehiculos: cupoNuevo, periodicidad, vehiculosIncluidos })
  return { monto: Math.round((despues.monto - antes.monto) * fraccion), fraccion }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/billing/__tests__/ciclo.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Verificar que los tests muerden**

Cambiar `dias >= DIA_SOLO_LECTURA` por `dias > DIA_SOLO_LECTURA` y confirmar que falla el borde del día 8. Después cambiar `prorrateo` para que multiplique por el precio unitario en vez de usar `cargoDe`, y confirmar que falla "descuenta la cobertura promocional". Revertir ambos.

- [ ] **Step 7: Commit**

```bash
git add lib/billing && git commit -m "feat(cobros): la escalera de impago y el prorrateo, puros"
```

---

### Task 2: `lib/flow/` — firma y cliente

**Files:**
- Create: `lib/flow/firma.ts`, `lib/flow/client.ts`
- Test: `lib/flow/__tests__/firma.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `node:crypto`.
- Produces: `firmar(params, secretKey): string`, `cuerpoFirmado(params, secretKey): URLSearchParams`, y del cliente: `crearCliente`, `registrarTarjeta`, `estadoRegistro`, `cobrar`, `quitarTarjeta`, `ErrorFlow`.

- [ ] **Step 1: Escribir el test de la firma**

Crear `lib/flow/__tests__/firma.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { cuerpoFirmado, firmar } from '@/lib/flow/firma'

const SECRETO = 'secreto-de-prueba'

/** La misma regla, escrita a mano: ordenar por clave, concatenar clave+valor. */
function esperado(pares: [string, string][]): string {
  const texto = [...pares].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => k + v).join('')
  return createHmac('sha256', SECRETO).update(texto).digest('hex')
}

describe('firmar', () => {
  it('ordena alfabéticamente por clave, no por orden de escritura', () => {
    // Escritos al revés a propósito: si la implementación no ordenara, esto
    // pasaría igual y el bug aparecería recién contra la API real, como un
    // 401 sin ninguna pista de por qué.
    const s = firmar({ subject: 'Plan', apiKey: 'K', amount: 2990 }, SECRETO)
    expect(s).toBe(esperado([['amount', '2990'], ['apiKey', 'K'], ['subject', 'Plan']]))
  })

  it('convierte los números a texto', () => {
    expect(firmar({ amount: 2990 }, SECRETO)).toBe(firmar({ amount: '2990' }, SECRETO))
  })

  it('un cambio en cualquier valor cambia la firma', () => {
    expect(firmar({ amount: 2990 }, SECRETO)).not.toBe(firmar({ amount: 2991 }, SECRETO))
  })
})

describe('cuerpoFirmado', () => {
  it('incluye los parámetros y agrega s', () => {
    const body = cuerpoFirmado({ apiKey: 'K', amount: 2990 }, SECRETO)
    expect(body.get('apiKey')).toBe('K')
    expect(body.get('amount')).toBe('2990')
    expect(body.get('s')).toBe(firmar({ apiKey: 'K', amount: 2990 }, SECRETO))
  })

  // `s` no puede entrar en su propio cálculo.
  it('no firma el parámetro s', () => {
    const body = cuerpoFirmado({ apiKey: 'K' }, SECRETO)
    expect(body.get('s')).toBe(firmar({ apiKey: 'K' }, SECRETO))
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/flow/__tests__/firma.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir `lib/flow/firma.ts`**

```ts
// La firma de cada request a Flow (puro).
//
// Vive en su propio archivo y con tests de vector conocido porque es
// exactamente el lugar donde se pierde una tarde: un parámetro de más, un
// orden distinto o un número convertido a texto de otra forma producen un 401
// sin ninguna pista de cuál de las tres cosas fue.
import { createHmac } from 'node:crypto'

export type ParamsFlow = Record<string, string | number>

/**
 * Flow ordena los parámetros alfabéticamente por clave, concatena
 * `clave + valor` **sin separadores** y firma el resultado con HMAC-SHA256
 * usando la `secretKey`, en hexadecimal.
 */
export function firmar(params: ParamsFlow, secretKey: string): string {
  const texto = Object.keys(params)
    .sort()
    .map((k) => k + String(params[k]))
    .join('')
  return createHmac('sha256', secretKey).update(texto).digest('hex')
}

/** Los parámetros más su firma, listos para enviar como formulario. */
export function cuerpoFirmado(params: ParamsFlow, secretKey: string): URLSearchParams {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) body.set(k, String(v))
  body.set('s', firmar(params, secretKey))
  return body
}
```

- [ ] **Step 4: Escribir `lib/flow/client.ts`**

```ts
// Las llamadas a Flow. Todo lo que decide CUÁNDO y CUÁNTO vive en
// `lib/billing/ciclo.ts` y `lib/data/pagos.ts`; acá solo se ejecuta.
import { cuerpoFirmado, type ParamsFlow } from '@/lib/flow/firma'

export class ErrorFlow extends Error {
  constructor(public readonly code: number | null, message: string) {
    super(message)
    this.name = 'ErrorFlow'
  }
}

/**
 * Init lazy, igual que `getResend()` y el Admin SDK: leer las credenciales en
 * module scope rompe el build de Vercel, que compila sin ellas definidas.
 */
function credenciales(): { apiKey: string; secretKey: string; base: string } {
  const apiKey = process.env.FLOW_API_KEY
  const secretKey = process.env.FLOW_SECRET_KEY
  const base = process.env.FLOW_API_URL ?? 'https://www.flow.cl/api'
  if (!apiKey || !secretKey) throw new ErrorFlow(null, 'Flow no está configurado')
  return { apiKey, secretKey, base }
}

export function flowConfigurado(): boolean {
  return Boolean(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY)
}

async function llamar(
  endpoint: string,
  params: ParamsFlow,
  metodo: 'GET' | 'POST',
): Promise<Record<string, unknown>> {
  const { apiKey, secretKey, base } = credenciales()
  const body = cuerpoFirmado({ ...params, apiKey }, secretKey)
  const url = metodo === 'GET' ? `${base}/${endpoint}?${body}` : `${base}/${endpoint}`
  const res = await fetch(url, {
    method: metodo,
    headers: metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: metodo === 'POST' ? body : undefined,
  })
  const texto = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(texto) as Record<string, unknown>
  } catch {
    throw new ErrorFlow(res.status, `Respuesta no JSON de ${endpoint}: ${texto.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new ErrorFlow(res.status, String(json.message ?? texto.slice(0, 200)))
  }
  return json
}
```

Y sobre `llamar`, las cinco operaciones, cada una tipando lo que devuelve:

- `crearCliente({ email, name, externalId })` → `POST customer/create` → `{ customerId }`
- `registrarTarjeta({ customerId, urlRetorno })` → `POST customer/register` → `{ url, token }`; el destino final es `` `${url}?token=${token}` ``
- `estadoRegistro(token)` → `GET customer/getRegisterStatus` → `{ status, creditCardType, last4CardDigits }`
- `cobrar({ customerId, amount, subject, commerceOrder })` → `POST customer/charge` → `{ flowOrder, status }`
- `quitarTarjeta(customerId)` → `POST customer/unRegister`

- [ ] **Step 5: Documentar las variables de entorno**

En `.env.example`:

```
# Pasarela de pago (Flow). Cargo Automático se contrata aparte de la cuenta.
# Sandbox y producción tienen credenciales DISTINTAS: las tres cambian juntas.
FLOW_API_KEY=
FLOW_SECRET_KEY=
FLOW_API_URL=https://sandbox.flow.cl/api
```

- [ ] **Step 6: Correr los tests, tipos y lint**

Run: `npx vitest run lib/flow && npx tsc --noEmit && npx eslint lib`
Expected: PASS.

- [ ] **Step 7: Verificar que el test muerde**

Sacar el `.sort()` de `firmar` y confirmar que falla "ordena alfabéticamente por clave". Revertir.

- [ ] **Step 8: Commit**

```bash
git add lib/flow .env.example && git commit -m "feat(flow): firma y cliente de la API"
```

---

### Task 3: La colección `pagos`

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/data/pagos.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `adminDb`.
- Produces: `Pago`, `EstadoPago`, `MotivoPago`, `commerceOrderDe`, `reservarPago`, `cerrarPago`, `listPagos`.

- [ ] **Step 1: Los tipos en `lib/types.ts`**

```ts
/** `pendiente` es el estado con que se RESERVA el pago antes de llamar a Flow. */
export type EstadoPago = 'pendiente' | 'ok' | 'rechazado' | 'sin_cargo'
export type MotivoPago = 'ciclo' | 'prorrateo'

export interface Pago {
  /** Es el ID del documento. Determinista: ver `commerceOrderDe`. */
  commerceOrder: string
  companyId: string
  motivo: MotivoPago
  estado: EstadoPago
  /** CLP entero. `0` cuando la promoción cubre toda la flota. */
  monto: number
  vehiculos: number
  vehiculosCobrados: number
  periodicidad: Periodicidad
  cicloDesde: string
  cicloHasta: string
  flowOrder: number | null
  flowStatus: number | null
  flowError: string | null
  createdAt: string
}
```

- [ ] **Step 2: `commerceOrderDe` y la reserva**

En `lib/data/pagos.ts`:

```ts
/**
 * El identificador determinista de un cobro. Es el id del documento, así que
 * Firestore da la unicidad gratis — la misma técnica de `promoCodes/{CODIGO}`.
 *
 * El prorrateo lleva el cupo nuevo en la clave y eso no es decorativo: un
 * cliente puede subir de 10 a 11 y días después de 11 a 12 dentro del MISMO
 * ciclo. Sin el cupo, la segunda subida chocaría con la primera y la
 * protección anti-doble-cobro le subiría el cupo sin cobrarle nunca. Con él,
 * son dos cobros distintos y repetir la MISMA subida sigue siendo imposible.
 */
export function commerceOrderDe(
  companyId: string,
  motivo: MotivoPago,
  cicloDesde: string,
  cupoNuevo?: number,
): string {
  return motivo === 'prorrateo'
    ? `${companyId}-prorrateo-${cicloDesde}-${cupoNuevo}`
    : `${companyId}-ciclo-${cicloDesde}`
}
```

`reservarPago(pago)` hace `.create()` sobre `pagos/{commerceOrder}` en estado `pendiente` y **devuelve `false` si el documento ya existe** (capturando el error `ALREADY_EXISTS` de Firestore) en vez de lanzar. `cerrarPago(commerceOrder, patch)` lo actualiza con el resultado.

- [ ] **Step 3: `listPagos` sin índice compuesto**

```ts
/**
 * Filtra por `companyId` y ordena EN MEMORIA, sin `orderBy`.
 *
 * Combinar igualdad con `orderBy` sobre otro campo exigiría un índice
 * compuesto, y sin él la consulta responde 503 hasta que alguien lo cree — el
 * mismo modo de falla que ya tiene la bitácora de /reportes. Una empresa
 * acumula 12 pagos al año: ordenar acá es gratis y no agrega una dependencia
 * de despliegue.
 */
export async function listPagos(companyId: string): Promise<Pago[]>
```

- [ ] **Step 4: `updateSuscripcion` — escrituras parciales atómicas**

Hallazgo del entregable anterior, que hay que resolver **antes** de `cobrarCiclo`: `savePlan` trata `suscripcion` como un campo entero, y `Suscripcion` no tiene ningún campo opcional. O sea que escribir solo `impagoDesde` obliga a leer el bloque completo, copiarlo, cambiar un campo y volver a escribirlo — **read-modify-write, que no es atómico**.

Eso importa acá porque este entregable escribe campos sueltos todo el tiempo y hay dos escritores concurrentes reales: el cron diario y el retorno del registro de tarjeta, que llaman ambos a `cobrarCiclo`. La reserva de `pagos/{commerceOrder}` impide el cobro doble, pero no impide que uno de los dos pise el `impagoDesde` que el otro acaba de escribir.

En `lib/data/companies.ts`:

```ts
/**
 * Escribe campos SUELTOS de `plan.suscripcion` sin tocar los demás.
 *
 * Existe aparte de `savePlan` porque ese trata `suscripcion` como un objeto
 * entero: escribir `impagoDesde` a través de él exige leerlo completo,
 * copiarlo y devolverlo, y dos escritores concurrentes —el cron y el retorno
 * de Flow, que llaman los dos a `cobrarCiclo`— se pisan el cambio del otro sin
 * que nadie se entere. El `set(..., { merge: true })` de Firestore fusiona los
 * mapas anidados de verdad, así que un parche de un solo campo deja los otros
 * seis intactos.
 */
export async function updateSuscripcion(
  companyId: string,
  patch: Partial<Suscripcion>,
): Promise<void>
```

Test obligatorio: escribir solo `impagoDesde` sobre una suscripción existente **deja los otros seis campos intactos**. Es el que impide que alguien lo "simplifique" a `savePlan` más adelante.

Todas las escrituras de suscripción de este entregable (`cobrarCiclo`, `/api/plan/cupo`, `/api/plan/cancelar`, el cron) pasan por acá, **no** por `savePlan`.

- [ ] **Step 5: Bloquear la colección al cliente**

En `firestore.rules`, junto a `usages` y `mantenciones`:

```
    match /pagos/{pagoId} {
      allow read, write: if false;
    }
```

- [ ] **Step 6: Desplegar las reglas**

```bash
node --env-file=.env.local scripts/deploy-firestore-rules.mjs
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(cobros): la coleccion pagos y su idempotencia"
```

---

### Task 4: `cobrarCiclo`, el orquestador

**Files:**
- Modify: `lib/data/pagos.ts`
- Test: `lib/data/__tests__/cobrarCiclo.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2 y 3; `faseDelPlan`, `coberturaDe`, `cargoDe`, `savePlan`, `listVehicles`.
- Produces: `cobrarCiclo(deps, companyId, hoy): Promise<ResultadoCobro>` con `ResultadoCobro = { estado: EstadoPago; monto: number } | null`.

Las dependencias van **inyectadas** (patrón de `lib/documents/runReminders.ts`) para poder probar todo el árbol de decisiones sin Firestore ni Flow.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/data/__tests__/cobrarCiclo.test.ts` cubriendo estos casos, cada uno con `vi.fn()` en las dependencias:

1. **En fase de lanzamiento no cobra, pero avanza.** `gratisHasta` futura ⇒ no se llama a `cobrar` de Flow, y `proximoCobro` queda en `gratisHasta + 1 día`.
2. **Monto 0 no llama a Flow pero avanza igual.** Promoción que cubre toda la flota ⇒ `estado: 'sin_cargo'`, `cobrar` no se llama, y `proximoCobro` avanza. *Si no avanzara, el cron intentaría cobrarle a esa empresa todos los días para siempre.*
3. **Sin tarjeta se trata como rechazo, sin llamar a Flow.**
4. **Cobro exitoso** ⇒ `cicloDesde = hoy`, `proximoCobro` avanzado, `impagoDesde = null`, y `cupoProximoCiclo` aplicado a `maxVehiculos` y limpiado.
5. **Cobro rechazado** ⇒ no avanza el ciclo y estampa `impagoDesde = hoy`.
6. **Un segundo rechazo NO mueve `impagoDesde`.** Es el test que fija que la fecha marca el primer rechazo y no el último — sin él, un cliente con la tarjeta vencida nunca llegaría al día 8 y la escalera no avanzaría jamás.
7. **Idempotencia:** dos `cobrarCiclo` seguidos producen **una** llamada a `cobrar`.
8. **La reserva ocupada corta la ejecución** sin llamar a Flow.

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/data/__tests__/cobrarCiclo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `cobrarCiclo`**

El orden exacto de los pasos, que es lo que los tests fijan:

```
1. Lee la empresa. Sin `plan.suscripcion` o sin `periodicidad`, devuelve null.
2. fase = faseDelPlan(...), cobertura = coberturaDe(...)
3. fase === 'prueba' → avanza proximoCobro a gratisHasta + 1 día. Fin.
4. cargo = cargoDe({ vehiculos: maxVehiculos, periodicidad, vehiculosIncluidos: cobertura })
5. cargo.monto === 0 → registra 'sin_cargo', AVANZA EL CICLO. Fin.
6. sin tarjeta → salta al paso 8 sin llamar a Flow.
7. reservarPago(...) → si devuelve false, otra ejecución ya está cobrando. Fin.
   Llama a cobrar(). Éxito → cerrarPago 'ok', cicloDesde = hoy,
   proximoCobro = proximoCobroDesde(hoy, periodicidad), impagoDesde = null,
   aplica cupoProximoCiclo. Envía el comprobante.
8. Fallo → cerrarPago 'rechazado' con el error, NO avanza el ciclo,
   impagoDesde = hoy SOLO SI estaba en null. Envía el aviso.
```

Con un comentario sobre el paso 8:

```ts
// `impagoDesde` marca el PRIMER rechazo, no el último. Si se pisara en cada
// reintento, la cuenta nunca llegaría al día 8 y la escalera de impago no
// avanzaría jamás: un cliente con la tarjeta vencida seguiría con acceso
// completo para siempre.
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/data/__tests__/cobrarCiclo.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Verificar que los tests muerden**

Quitar la condición `solo si estaba en null` del paso 8 y confirmar que falla el caso 6. Quitar el avance del ciclo del paso 5 y confirmar que falla el caso 2. Revertir ambos.

- [ ] **Step 7: Commit**

```bash
git add lib/data && git commit -m "feat(cobros): cobrarCiclo, con idempotencia y escalera de impago"
```

---

### Task 5: Los cinco correos

**Files:**
- Create: `lib/email/pagoEmail.ts`, `lib/email/cobranzaEmail.ts`, `lib/email/bajaEmail.ts`
- Modify: `lib/email/resend.ts`
- Test: `lib/email/__tests__/` (siguiendo los tests de plantilla existentes)

**Interfaces:**
- Consumes: `emailLayout`, `ctaButton`, `appUrl` de `lib/email/layout.ts`; `fechaCalendario`, `formatCLP`.
- Produces: `pagoOkEmail`, `pagoFallidoEmail`, `cuentaSoloLecturaEmail`, `bloqueoProximoEmail`, `bajaConfirmadaEmail`, y sus `send*` en `resend.ts`.

- [ ] **Step 1: Escribir las plantillas**

| Plantilla | Archivo | Cuándo | CTA |
|---|---|---|---|
| `pagoOkEmail` | `pagoEmail.ts` | cobro exitoso — es el comprobante que el cliente espera | "Ver el detalle" → `/facturacion` |
| `pagoFallidoEmail` | `pagoEmail.ts` | cada intento rechazado (días 0, 1, 3 y 7) | "Actualizar mi tarjeta" → `/facturacion` |
| `cuentaSoloLecturaEmail` | `cobranzaEmail.ts` | día 8; **dice la fecha exacta del bloqueo** | "Regularizar" → `/facturacion` |
| `bloqueoProximoEmail` | `cobranzaEmail.ts` | 7 días antes del bloqueo total | "Regularizar" → `/facturacion` |
| `bajaConfirmadaEmail` | `bajaEmail.ts` | al pedir la baja; dice hasta cuándo tiene servicio | "Deshacer la baja" → `/facturacion` |

Todas con `emailLayout`, todas con CTA, todas con montos en `formatCLP` y fechas en `fechaCalendario`. `cuentaSoloLecturaEmail` y `bloqueoProximoEmail` deben decir explícitamente **que la ficha pública de sus vehículos va a dejar de funcionar**: es la consecuencia que le importa a un cliente de flota y la que lo hace pagar.

- [ ] **Step 2: Los envíos en `resend.ts`**

Cinco `sendXEmail`, **best-effort**: que un correo falle no puede alterar el resultado de un cobro. Van a los destinatarios de `alertRecipientEmails`.

- [ ] **Step 3: Tests**

Un test por plantilla comprobando que el asunto y el cuerpo contienen los datos clave (monto, fecha, patente donde aplique) y que el CTA apunta a `/facturacion`.

- [ ] **Step 4: Commit**

```bash
git add lib/email && git commit -m "feat(cobros): los cinco correos de pago y cobranza"
```

---

### Task 6: Endpoints de tarjeta

**Files:**
- Create: `app/api/pagos/tarjeta/route.ts`, `app/api/pagos/retorno/route.ts`, `app/api/pagos/cobrar-ahora/route.ts`
- Test: `app/api/__tests__/pagos-endpoints.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3 y 4.
- Produces: los tres endpoints.

- [ ] **Step 1: `POST /api/pagos/tarjeta`**

`getMembership()` + `can(role, 'billing:manage')`. Si `flowCustomerId` es `null`, llama a `crearCliente` y lo guarda. Después `registrarTarjeta({ customerId, urlRetorno: `${appUrl()}/api/pagos/retorno` })` y devuelve `{ url }` con el destino completo.

- [ ] **Step 2: `GET /api/pagos/retorno`**

**Este es el endpoint con más riesgo de seguridad del entregable.** Recibe un `token` por query string y **debe** validarlo llamando a `estadoRegistro(token)`. Confiar en los parámetros del retorno permitiría a cualquiera marcar su cuenta como "tarjeta registrada" visitando una URL.

Guarda `tarjeta` con lo que devuelve Flow, y **si `proximoCobro <= hoy` llama a `cobrarCiclo`** — así el cliente que acaba de poner su tarjeta ve el cobro en el momento y no al día siguiente. Redirige a `/facturacion` con un parámetro que la página traduce a un aviso.

Fija `export const maxDuration = 30`.

- [ ] **Step 3: `DELETE /api/pagos/tarjeta` y `POST /api/pagos/cobrar-ahora`**

El primero llama a `quitarTarjeta` y limpia el campo. El segundo llama a `cobrarCiclo` y devuelve el resultado; es la salida para el cliente cuyo banco rechazó una vez, y la única forma de reactivarse pasado el día 7.

- [ ] **Step 4: Tests**

401 sin sesión, 403 sin `billing:manage`, y —el importante— **el retorno con un token que `estadoRegistro` rechaza no guarda ninguna tarjeta**.

- [ ] **Step 5: Commit**

```bash
git add app/api/pagos && git commit -m "feat(cobros): endpoints de registro y cobro de tarjeta"
```

---

### Task 7: Cambiar el cupo y darse de baja

**Files:**
- Create: `app/api/plan/cupo/route.ts`, `app/api/plan/cancelar/route.ts`
- Test: `app/api/__tests__/plan-cupo.test.ts`

**Interfaces:**
- Consumes: `prorrateo` (Task 1), `commerceOrderDe`/`reservarPago`/`cerrarPago` (Task 3), `cobrar` (Task 2).
- Produces: los dos endpoints.

- [ ] **Step 1: `PATCH /api/plan/cupo`**

Reglas, todas comprobadas en el servidor:

- **Subir** ⇒ calcula `prorrateo`, cobra al instante con `commerceOrderDe(..., 'prorrateo', cicloDesde, cupoNuevo)`. **Si el cobro falla, el cupo NO sube**: responde 402 y la empresa no queda con más cupo del que pagó.
- **Bajar** ⇒ escribe `cupoProximoCiclo`. No devuelve plata ni deja saldo.
- **No se puede bajar por debajo de los vehículos ya registrados** ⇒ 409 `cupo_menor_al_uso`, contra `listVehicles`, igual que `POST /api/plan`.
- El tope `MAX_VEHICULOS_SELF_SERVICE` sigue rigiendo ⇒ 400 por encima.
- Con `cicloDesde === null` no hay prorrateo: sube el cupo sin cobrar nada.

- [ ] **Step 2: `POST` y `DELETE /api/plan/cancelar`**

`POST` escribe `cancelaEn = suscripcion.proximoCobro` y manda `bajaConfirmadaEmail`. `DELETE` lo vuelve a `null` mientras el ciclo no haya cerrado.

- [ ] **Step 3: Tests**

Los cinco casos del paso 1, más: **un cobro de prorrateo rechazado deja `maxVehiculos` intacto**.

- [ ] **Step 4: Commit**

```bash
git add app/api/plan && git commit -m "feat(cobros): cambiar de cupo con prorrateo y darse de baja"
```

---

### Task 8: El cron de cobros

**Files:**
- Create: `app/api/cron/cobros/route.ts`, `lib/billing/runCobros.ts`
- Modify: `vercel.json`
- Test: `lib/billing/__tests__/runCobros.test.ts`

**Interfaces:**
- Consumes: `cobrarCiclo` (Task 4), `tocaReintentar` (Task 1).
- Produces: `procesarCobros(deps, hoy)`.

- [ ] **Step 1: La consulta**

```ts
adminDb.collection('companies').where('plan.suscripcion.proximoCobro', '<=', hoy).get()
```

Un rango sobre **un solo campo**: le basta el índice de campo único automático, **no necesita índice compuesto**, y por lo tanto no hay riesgo de orden de despliegue. Es la misma propiedad que aprovecha `listDocumentsPorVencer`.

Con un comentario explicando por qué no hace falta una segunda consulta para los morosos:

```ts
// Esta consulta trae a los dos grupos de una sola vez porque `proximoCobro`
// NO avanza mientras el cobro falla: una cuenta en impago sigue teniendo su
// fecha en el pasado. Agregar un `where` sobre `impagoDesde` obligaría a un
// índice compuesto para no ganar nada.
```

- [ ] **Step 2: La lógica por empresa**

```
si impagoDesde == null              → cobrarCiclo()
si tocaReintentar(impagoDesde, hoy) → cobrarCiclo()
si no                               → saltar
si cancelaEn && cancelaEn <= hoy    → impagoDesde = cancelaEn (arranca la escalera)
```

Cada empresa con su propio `try/catch`: un error en una no puede detener el cron para las demás. Se manda `bloqueoProximoEmail` cuando faltan 7 días para `DIA_BLOQUEO`.

- [ ] **Step 3: El endpoint y el schedule**

`Authorization: Bearer ${CRON_SECRET}`, fallando cerrado si el secreto no está. `export const maxDuration`. Entrada en `vercel.json` con un horario **distinto al de recordatorios**, para que no compitan.

- [ ] **Step 4: Tests con deps inyectadas**

Solo cobra a quien le toca; un error en una empresa no detiene a las demás; la baja cumplida estampa `impagoDesde`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cobros): el cron diario de cobros"
```

---

### Task 9: El bloqueo

**Files:**
- Create: `lib/auth/cuenta.ts`
- Modify: los endpoints de escritura de `app/api/`
- Modify: `app/v/[token]/page.tsx`, `components/PublicVehicleView.tsx`
- Modify: `app/(app)/dashboard/page.tsx`, `app/(app)/vehiculos/[id]/page.tsx`
- Test: `lib/auth/__tests__/cuenta.test.ts`

**Interfaces:**
- Consumes: `estadoCobranza`, `puedeEscribir`, `puedeLeer` (Task 1).
- Produces: `requireCuentaActiva(m): Promise<NextResponse | null>`.

- [ ] **Step 1: El guard**

`requireCuentaActiva` lee la empresa y devuelve una `NextResponse` con **402** si `!puedeEscribir(estado)`, o `null` si puede seguir. Cuesta una lectura de Firestore por request que muta; las escrituras son mucho menos frecuentes que las lecturas.

**No se aplica a `/api/pagos/*` ni `/api/plan/*`** — un comentario en el archivo lo dice, porque es exactamente el tipo de "consistencia" que alguien agrega después y deja al cliente sin forma de pagar para salir del bloqueo.

- [ ] **Step 2: Aplicarlo**

A los endpoints que mutan vehículos, documentos, mantenciones, conductores, transferencias y equipo. **No** a los de lectura, ni a los públicos de `/v/`, ni a los de pago.

- [ ] **Step 3: La ficha pública**

`app/v/[token]/page.tsx` lee la empresa del vehículo. Si `!puedeLeer(estado)` **o** la baja ya cerró, renderiza una página neutra, sin documentos: *"Esta ficha no está disponible"*. **No un 404**, que se lee como que el chip está roto.

La baja se comprueba aparte porque apaga la ficha de inmediato al cerrar el ciclo, sin esperar los 38 días — quien se dio de baja lo hizo a propósito y puede avisarle a sus conductores; quien tuvo un problema con la tarjeta, no.

- [ ] **Step 4: El bloqueo de lectura en la app**

En el dashboard y en la ficha del vehículo, que **ya cargan la empresa con `getCompany`** y por lo tanto no pagan ninguna consulta extra. Si `!puedeLeer(estado)`, redirigen a `/facturacion`.

Se acepta que entrar por URL directa a `/reportes` se saltee el bloqueo de lectura: es cosmético, porque escribir sigue bloqueado en el servidor y lo que se ve son los datos del propio cliente. La alternativa —el portero en el layout de `(app)`— cuesta una lectura en cada navegación de todos los clientes, para siempre; es la misma razón por la que el portero del onboarding vive en el dashboard.

- [ ] **Step 5: Tests**

402 en `solo_lectura` y `bloqueada`, paso libre en `reintentando` y `al_dia`; y que la ficha pública bloqueada **no incluya ninguna URL de documento** en su HTML.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(cobros): solo lectura y bloqueo por impago"
```

---

### Task 10: La interfaz

**Files:**
- Create: `components/plan/TarjetaPanel.tsx`, `CambiarCupoPanel.tsx`, `HistorialPagos.tsx`, `CancelarPlanPanel.tsx`, `FranjaCobranza.tsx`
- Modify: `app/(app)/facturacion/page.tsx`, `components/VehiclesBoard.tsx`, `components/plan/FranjaPrueba.tsx`

**Interfaces:**
- Consumes: los endpoints de Tasks 6 y 7; `estadoCobranza`; `fechaCalendario`; `formatCLP`.
- Produces: los cinco componentes.

- [ ] **Step 1: `TarjetaPanel`**

Sin tarjeta: explica que se necesita y ofrece "Registrar tarjeta". Con tarjeta: muestra `Visa ••••1234 · registrada el 01/09/2026`, con "Cambiar" y "Quitar".

- [ ] **Step 2: `CambiarCupoPanel`**

Selector de cantidad que muestra en vivo, **antes de confirmar**, lo que se va a cobrar ahora y lo que se cobrará en el próximo ciclo. Al bajar, dice explícitamente: *"conservas tus 11 vehículos hasta el 01/09/2026"*. Sin esa frase, la bajada parece que no hizo nada.

- [ ] **Step 3: `HistorialPagos` y `CancelarPlanPanel`**

Tabla con fecha, monto, estado y motivo. La baja va con confirmación y dice hasta cuándo conserva el servicio y qué pasa después con la ficha pública de sus vehículos.

- [ ] **Step 4: `FranjaCobranza` en el dashboard**

Hermana de `FranjaPrueba`, con los tonos existentes (`por-vencer` y `vencido`). Dice el estado y la fecha del próximo hito, con CTA a Facturación.

- [ ] **Step 5: Corregir la promesa de `FranjaPrueba`**

Sus líneas 100-102 llevan un comentario que dice que el texto promete a propósito que la app **no** se bloquea, porque un aviso que amenaza con algo que no ocurre entrena a la gente a ignorar todos los avisos. **Con este entregable eso pasa a ser falso**: la app sí se bloquea. Cambiar el texto y el comentario juntos, para que sigan diciendo la verdad.

- [ ] **Step 6: Verificar en el navegador**

Levantar el preview y recorrer Facturación en los cuatro estados, forzando `impagoDesde` en Firestore. Revisar a 375px: los paneles no pueden desbordar. Capturas de los estados `solo_lectura` y `bloqueada`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(cobros): la interfaz de facturacion"
```

---

### Task 11: Cierre

**Files:**
- Modify: `app/(app)/admin/page.tsx`, `CLAUDE.md`, `.env.example`

- [ ] **Step 1: Arreglar la "recaudación estimada" de `/admin`**

Hoy llama a `cargoDe` sin `vehiculosIncluidos` sobre la suma de `maxVehiculos`, así que **no descuenta promociones ni prueba** y no coincide con la columna "Cobro actual" del CSV que se baja justo debajo. Pasa a sumar `cargoDe` por empresa con `faseDelPlan` + `coberturaDe`. Es la deuda que `CLAUDE.md` dejó anotada para ir junto con la pasarela.

- [ ] **Step 2: Actualizar `CLAUDE.md`**

- La sección de facturación: el modelo concierge pasa a ser la pasarela; sacar "Pendiente (Fase 2)" y "sin pasarela aún".
- **La lista de correos pasa de ocho a trece.** El archivo dice explícitamente que al agregar una plantilla hay que sumarla ahí, o la lista deja de servir para saber qué manda la app.
- La sección de comandos: el nuevo cron y las variables `FLOW_*`.
- El modelo de datos: `plan.suscripcion` y la colección `pagos`.
- Un bullet nuevo con la escalera de impago y **por qué la ficha pública se apaga al final y no al principio**.
- Sacar de "Fuera de alcance" la vista de cobranza mensual y la recaudación estimada.

- [ ] **Step 3: Verificación completa**

```bash
npx vitest run && npx tsc --noEmit && npm run build && npx eslint app components lib
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs(cobros): documentar la pasarela y corregir la recaudacion de admin"
```

---

## Checklist de despliegue

Nada de esto se puede probar automáticamente y todo puede fallar en producción:

- [ ] `FLOW_API_KEY`, `FLOW_SECRET_KEY` y `FLOW_API_URL` cargadas en Vercel, apuntando a **producción**.
- [ ] `CRON_SECRET` ya existe; confirmar que el nuevo cron está en `vercel.json` y aparece en el panel de Vercel.
- [ ] Registro de tarjeta de punta a punta en **sandbox**, con una tarjeta de prueba.
- [ ] Un cargo real en sandbox, verificando que aparece en `pagos` y en el panel de Flow.
- [ ] Una tarjeta de prueba **rechazada**: confirmar que estampa `impagoDesde` y que el segundo intento no la mueve.
- [ ] Correr el cron a mano una vez y revisar el log.
- [ ] Confirmar que la ficha pública de un vehículo de una cuenta al día **sigue funcionando** — es lo que un carabinero necesita y lo único que no puede romperse.
