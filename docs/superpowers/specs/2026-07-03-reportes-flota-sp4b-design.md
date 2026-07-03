# Bitácora de uso — SP4b: Reportes (responsabilidad por conductor + bitácora filtrable) — Diseño

**Fecha:** 2026-07-03
**Estado:** Aprobado (diseño). Pendiente: plan de implementación.

## Contexto

Con SP1–SP4a en producción, la flota tiene bitácora por vehículo, IA que lee las fotos, y un
panel operativo (`/flota`) con alertas accionables. Falta la **capa de reportes/analítica**:
saber, sobre todo el historial, **quién deja los vehículos mal** (responsabilidad por conductor)
y poder **auditar** los usos de la flota filtrando y paginando.

SP4b es el **último** sub-proyecto. Es donde aparece la **escala**: la agregación histórica y el
log cruzado no pueden cargar todo `usages` en memoria. Se resuelve con **contadores
denormalizados** (para el reporte, O(conductores)) y **paginación con índices compuestos** (para
el log).

## Objetivos

- **Reporte de responsabilidad por conductor**: contadores todo-el-tiempo (usos, daños,
  sin-entrega) por conductor, leídos al instante.
- **Bitácora de flota filtrable/paginada**: log cruzado de todos los usos, filtrable por un
  conductor **o** un vehículo + rango de fechas, con paginación por cursor.
- Nueva página `/reportes`, lectura para todos los miembros.
- Enforcement server-side; `companyId` siempre del servidor.

## No-objetivos

- Backfill del historial previo al deploy: los contadores **parten en 0 desde el deploy** y se
  llenan con los próximos usos. Un script one-time de recálculo desde `usages` es candidato
  futuro, no de este spec.
- Filtrar por conductor **y** vehículo a la vez (se soporta uno u otro, para acotar los índices).
- Export a CSV/PDF (candidato futuro).

## 1. Responsabilidad por conductor (contadores)

### Datos
- **`drivers/{id}`** gana `stats?: { usos: number; danos: number; sinEntrega: number }`.
- `toDriver` mapea `stats` con default `{ usos: 0, danos: 0, sinEntrega: 0 }`.

### Incrementos (best-effort, `FieldValue.increment(1)`)
Se escriben server-side, en los mismos puntos donde ya se crean las alertas (SP4a), envueltos en
try/catch (no rompen el flujo del conductor):
- `usos` → en **`tomar`**, para el conductor que toma (`driver.id`). +1 por cada retiro.
- `sinEntrega` → en **`tomar`**, cuando hay forced-close, para el conductor del uso forzado
  (`forced.driverId`). +1.
- `danos` → en **`entregar`**, si `dano.hay`, para el conductor que **tenía** el vehículo
  (`getUsage(usageId).driverId`, el "taker"). +1.
- Helper: `incrementDriverStats(driverId: string, campo: 'usos' | 'danos' | 'sinEntrega'): Promise<void>`
  en `lib/data/drivers.ts` (`update({ ['stats.'+campo]: FieldValue.increment(1) })`).
- Si el conductor fue borrado del padrón, el `update` falla → se traga (best-effort).

### Reporte
- Lee `listDrivers(companyId)` (ya trae `stats`), **O(conductores)**, sin índices ni escaneo de
  historial. Tabla: nombre, usos, daños, sin-entrega, **ordenada por daños desc, luego
  sin-entrega desc**. Todo-el-tiempo.

## 2. Bitácora de flota filtrable/paginada

### Datos
- `listUsagesPage(companyId, filtros: { driverId?: string; vehicleId?: string; desde?: string; hasta?: string; cursor?: string }, pageSize = 20): Promise<{ items: VehicleUsage[]; nextCursor: string | null }>`
  en `lib/data/usages.ts`.
- Query Firestore: `collection('usages').where('companyId','==',companyId)` +
  (opcional `.where('driverId','==',driverId)` **o** `.where('vehicleId','==',vehicleId)`) +
  (opcional `.where('tomadoEn','>=',desde)` / `.where('tomadoEn','<=',hasta)`) +
  `.orderBy('tomadoEn','desc').startAfter(cursor?).limit(pageSize)`.
- `cursor` = el `tomadoEn` del último item de la página anterior. `nextCursor` = `tomadoEn` del
  último item si la página vino llena (`items.length === pageSize`), si no `null`.
- **Solo uno** de `driverId`/`vehicleId` a la vez (validado en la API).

### Índices compuestos (3)
Se crean **a mano en la consola de Firestore** (link automático que Firestore entrega al primer
query fallido) o con `firebase deploy --only firestore:indexes`. Se incluye un
`firestore.indexes.json` de referencia:
- `usages`: `companyId ASC, tomadoEn DESC`  — log base + rango de fecha.
- `usages`: `companyId ASC, driverId ASC, tomadoEn DESC`  — filtro por conductor.
- `usages`: `companyId ASC, vehicleId ASC, tomadoEn DESC`  — filtro por vehículo.
(El rango sobre `tomadoEn` combina dentro de cada índice porque es el campo de `orderBy`.)

### API
- `GET /api/reportes/usos?driverId=&vehicleId=&desde=&hasta=&cursor=` → `getMembership()`
  (cualquier miembro lee; 401 sin sesión), `companyId` del servidor. Valida que **no** venga
  `driverId` **y** `vehicleId` a la vez (400). Llama a `listUsagesPage`. Si la query falla por
  índice faltante (Firestore `FAILED_PRECONDITION`), responde `503` con un mensaje claro (la UI
  muestra "no se pudo cargar; falta configurar índices"). Devuelve `{ items, nextCursor }`.

### UI
- `/reportes` (server): `getMembership()`; carga `listDrivers` (reporte + selects) y
  `listVehicles` (selects + mapa `vehicleId→patente`); renderiza:
  - `components/reportes/ReporteConductores.tsx` (server) — la tabla de contadores.
  - `components/reportes/BitacoraFlota.tsx` (**cliente**) — barra de filtros (select conductor |
    select vehículo | rango de fechas) + lista de usos + **"Cargar más"**. Al cambiar filtros
    refetch a `/api/reportes/usos`; "cargar más" usa `nextCursor`. Muestra por uso: fecha
    tomó/entregó, patente (del mapa), conductor, badges (daño / sin-entrega). Recibe los
    conductores, la lista de vehículos y el mapa patente vía props del server.
- Enlace **"Reportes"** en la barra superior (`app/(app)/layout.tsx`), junto a "Flota".

## Roles / seguridad

- `/reportes` y `/api/reportes/usos`: **lectura para todos los miembros**; nada de escritura nueva
  desde el cliente. `companyId` siempre resuelto en el servidor vía `getMembership()`; nunca del
  cliente.
- Los contadores se escriben solo server-side (best-effort en las rutas públicas, tras la
  validación de PIN ya existente). `stats` viaja dentro de `drivers`, ya bloqueado al cliente en
  `firestore.rules`.

## Superficies afectadas

- **`lib/types.ts`**: `Driver` gana `stats?`.
- **`lib/data/drivers.ts`**: `toDriver` mapea `stats`; `incrementDriverStats(driverId, campo)`.
- **`lib/data/usages.ts`**: `listUsagesPage(...)`.
- **`app/api/v/[token]/tomar/route.ts`**: incrementos `usos` (taker) y `sinEntrega` (forced).
- **`app/api/v/[token]/entregar/route.ts`**: incremento `danos` si hay daño.
- **`app/api/reportes/usos/route.ts`** (nuevo): GET paginado.
- **`app/(app)/reportes/page.tsx`** (nuevo) + `components/reportes/ReporteConductores.tsx` +
  `components/reportes/BitacoraFlota.tsx`.
- **`app/(app)/layout.tsx`**: enlace "Reportes".
- **`firestore.indexes.json`** (nuevo, referencia de los 3 índices).

## Testing

- **Data (mock Admin SDK):**
  - `incrementDriverStats`: `update` con `FieldValue.increment` en el campo correcto; best-effort.
  - `listUsagesPage`: arma la cadena de query según filtros (companyId; + driverId **o**
    vehicleId; + rango); devuelve `nextCursor` cuando la página viene llena y `null` cuando no.
  - `toDriver` default de `stats`.
- **Integración:**
  - `GET /api/reportes/usos`: 401 sin sesión; 400 si vienen driverId **y** vehicleId; usa el
    `companyId` del servidor; `nextCursor` propagado.
  - `tomar`/`entregar`: los incrementos se llaman best-effort (no rompen el flujo; try/catch).
- **UI:** typecheck + build; verificación manual (reporte + filtros + cargar más).

## Riesgos / cuidados

- **Índices compuestos obligatorios**: la bitácora filtrable falla hasta que existan los 3
  índices. Cutover: crearlos en la consola. La API degrada con un `503` + mensaje claro, no un 500
  crudo.
- **Contadores sin backfill**: parten en 0; el reporte solo refleja usos posteriores al deploy.
  Comunicar al usuario; script de recálculo es futuro.
- **Drift de contadores**: son best-effort (`FieldValue.increment` en try/catch); si una escritura
  falla, el contador queda corto. Aceptable para un reporte (no es facturación); el recálculo
  futuro lo corrige.
- **Escala del log**: acotada por `limit(pageSize)` + cursor; nunca carga todo el historial. El
  reporte es O(conductores). Objetivo de escala cumplido.
- **`cursor` por `tomadoEn`**: dos usos con el mismo `tomadoEn` (mismo milisegundo) son
  extremadamente improbables en uso real; si ocurriera, se podría saltar uno en el borde de página
  (aceptable para un log de auditoría).
