# Detección de entrega irregular (bitácora de uso)

**Fecha:** 2026-07-06
**Estado:** Aprobado, listo para plan de implementación

## Problema

En la bitácora de uso de flota, un conductor toma un vehículo (`tomar`) y debería
cerrarlo con la entrega (`entregar`, con fotos + PIN) al terminar. En la práctica,
el conductor **no cierra su propio uso**: lo deja abierto y se va.

Cuando el siguiente conductor llega, la ficha pública muestra **"Entregar"** (no
"Tomar"), porque hay un uso abierto. Entonces el nuevo conductor se elige a sí mismo
en "¿Quién entrega?", pone **su** PIN, sube las fotos, y recién ahí toma el vehículo.

Resultado: el uso queda cerrado con `entregadoPorDriverId` = el nuevo conductor, pero
`driverId` = el conductor original. **Ese desajuste hoy no genera ninguna señal**: no
hay alerta, no suma al reporte de responsabilidad, no avisa a nadie. La negligencia
del conductor original es invisible.

### Qué se detecta hoy y qué no

Un uso se cierra por **un solo** camino:

| Camino | Cuándo ocurre | ¿Detecta que el original no entregó? |
|---|---|---|
| **Force-close** (`openUsage`): alguien aprieta *Tomar* con un uso abierto | Casi nunca — la UI muestra "Entregar", no "Tomar", cuando hay uso abierto | ✅ Sí: alerta `sin_entrega` + `incrementDriverStats(original, 'sinEntrega')` + email |
| **Entrega por otro** (`closeUsage`): el nuevo conductor entrega el uso del anterior | **El caso normal** | ❌ No: guarda `entregadoPorDriverId` distinto y no hace nada más |

El mecanismo de detección (`sin_entrega`) existe, pero está enganchado al camino que
casi nunca se recorre. Este spec cierra esa brecha en el camino real.

## Objetivo

Detectar la **entrega irregular**: cuando quien entrega un uso no es quien lo tomó,
tratarlo igual que el force-close (alerta + contador + email), atribuido al conductor
original.

## Fuera de alcance

- **Brecha 2 — uso abandonado que nadie retoma**: si el conductor deja el uso abierto
  y *nadie* lo toma después, queda abierto indefinidamente y ningún camino lo detecta.
  Requiere una detección **por tiempo** (cron nocturno o aviso en `/flota` de "uso
  abierto hace más de N horas"). Se evaluará en una iteración posterior.
- Distinguir en el modelo de datos "entregado por otro" (hay fotos) vs "abandonado"
  (sin fotos). Se decidió **unificar** ambos bajo `sin_entrega`; la distinción vive en
  el texto de la alerta y del email, no en el esquema.

## Diseño

### La señal

Al cerrar un uso, comparar el conductor que entrega contra el que lo tomó:

```
entregaIrregular = entregadoPor.id !== usoAbierto.driverId
```

El dato para calcularlo ya existe en el uso abierto; solo falta actuar sobre él.

### Comportamiento

Cuando `entregaIrregular` es verdadero, **además** de registrar la entrega normal
(fotos, km, daño, análisis IA — no se pierde nada; `entregadoPorDriverId`/`Nombre`
quedan como el conductor que entregó):

1. **Alerta** `sin_entrega` atribuida al **conductor original**, con nota que aclara
   que lo entregó otro conductor en su lugar.
2. **Contador**: `incrementDriverStats(driverOriginal.id, 'sinEntrega')` — al original,
   no a quien entregó.
3. **Email** de aviso a los destinatarios configurados (`alertRecipientEmails`), igual
   que el force-close.

Todo best-effort (try/catch): nada de esto puede romper el flujo de entrega del
conductor.

Esto es **simétrico** con el bloque que ya existe en la ruta `tomar` para el caso
`forced` (force-close).

### Sin cambio de esquema

Se reutiliza `tipo: 'sin_entrega'` (colección `alertas`) y el contador `sinEntrega`
(en `drivers.stats`). No se agregan campos nuevos ni tipos nuevos.

### No hay doble conteo

Un uso se cierra por un único camino (`closeUsage` en la entrega **o** el force-close
en `openUsage`), nunca ambos: una vez cerrado, `getOpenUsage` ya no lo encuentra. Por
lo tanto `sinEntrega` suma como máximo una vez por uso. Se documenta en el código.

## Cambios de código

### 1. `closeUsage` (`lib/data/usages.ts`)

Hoy devuelve `Promise<string>` (el id). Pasa a devolver la info que la ruta necesita
sin re-leer Firestore:

```ts
// antes: Promise<string>
// después:
Promise<{
  id: string
  entregaIrregular: boolean
  driverOriginal: { id: string; nombre: string }
  tomadoEn: string
}>
```

Internamente compara `entregadoPor.id !== open.driverId` para fijar `entregaIrregular`,
y expone `driverOriginal` = `{ id: open.driverId, nombre: open.driverNombre }`.

**Impacto en llamadores:** el único consumidor es la ruta `entregar`, que hoy usa el
`string` retornado como `usageId`. Se ajusta a `.id`.

### 2. Ruta `entregar` (`app/api/v/[token]/entregar/route.ts`)

Tras `closeUsage`, si `entregaIrregular`, ejecutar el mismo patrón best-effort que
`tomar` usa con `forced`:

- `createAlerta({ ..., tipo: 'sin_entrega', driverNombre: driverOriginal.nombre, nota: <lo entregó {quien entrega}> })`
- `sendUsageAlertEmail(to, { patente, driverNombre: driverOriginal.nombre, tomadoEn, entregadoPorNombre: <quien entrega> })` para cada destinatario de `alertRecipientEmails`
- `incrementDriverStats(driverOriginal.id, 'sinEntrega')`

El bloque de daño existente (que atribuye al `u.driverId`, es decir el original) no
cambia y sigue siendo correcto.

### 3. Copy del email (`lib/email/usageAlertEmail.ts`)

Hoy el texto asume force-close ("El vehículo X se volvió a tomar sin que el uso
anterior se cerrara"). Se agrega un parámetro **opcional** `entregadoPorNombre?` para
que el copy sea correcto en ambos casos:

- **Force-close** (sin `entregadoPorNombre`): "…se volvió a tomar sin cerrar el uso
  anterior."
- **Entrega irregular** (con `entregadoPorNombre`): "…lo entregó {nuevo}, no {original}
  que lo tenía."

`sendUsageAlertEmail` gana el parámetro opcional; la llamada desde `tomar` no lo pasa,
así que su comportamiento queda idéntico a hoy.

## Testing

- **Unitario** (`lib/email/usageAlertEmail.ts`): `usageAlertHtml` con y sin
  `entregadoPorNombre` produce el copy correcto en cada caso.
- La comparación de "entrega irregular" vive dentro de `closeUsage` (que toca
  Firestore); se valida vía el test de integración de la ruta `entregar` si existe, o
  se deja verificado manualmente. No se introduce lógica pura extra solo por testear.

## Criterios de aceptación

1. Conductor A toma; conductor B entrega (con su PIN) → se crea alerta `sin_entrega`
   atribuida a **A**, el `sinEntrega` de **A** sube en 1, y se envía email.
2. Conductor A toma y **A** entrega → **no** se crea alerta ni sube contador (caso
   normal).
3. El contador `sinEntrega` de un uso irregular sube exactamente una vez (no se duplica
   con el force-close).
4. La entrega se registra completa (fotos, km, daño, IA) aunque sea irregular.
5. El email del force-close sigue diciendo lo mismo que hoy (sin `entregadoPorNombre`).
