# Forzar entrega manual de un uso desde la bitácora

**Fecha:** 2026-07-07
**Estado:** Aprobado, listo para plan de implementación

## Contexto y objetivo

Un uso puede quedar `abierto` para siempre si el conductor no entrega y **nadie** vuelve
a tomar el vehículo (el punto ámbar del dashboard lo señala, pero no había forma de
cerrarlo desde la app). Antes, la única manera de cerrar un uso colgado era que otro
conductor tomara el vehículo (el `openUsage` cerraba el anterior de forma forzada).

Se agrega un botón **"Forzar entrega"** en el uso abierto de la bitácora del vehículo,
que dispara ese mismo cierre forzado a mano — más cómodo.

## Decisiones (del brainstorming)

- **Quién:** Editor y Administrador (`can(role, 'document:write')`). El Visor no ve el
  botón.
- **Contador:** el cierre forzado manual **sí** suma 1 al contador `sinEntrega` del
  conductor (consistente con el cierre automático: el conductor no entregó).
- **Etiqueta del botón:** "Forzar entrega" (aunque internamente marca `cierreForzado`).

## Comportamiento

Al confirmar "Forzar entrega" sobre un uso `abierto`:
1. El uso pasa a `estado: 'cerrado'` + `cierreForzado: true` (sin fotos ni `entregadoEn`
   — igual que el cierre forzado que ya hace `openUsage`).
2. Se libera el vehículo: `vehicles.usoActual = null` (best-effort) → desaparece el
   punto del dashboard.
3. Se suma 1 al contador `sinEntrega` del conductor que tenía el uso (visible en
   Reportes).

**Sin doble conteo:** una vez forzado el cierre, el vehículo queda libre; si luego
alguien lo toma, `getOpenUsage` no encuentra un uso abierto → `openUsage` no fuerza nada
→ `sinEntrega` suma una sola vez.

## Cambios

### 1. Data — `forzarCierreUsage` (`lib/data/usages.ts`)

`forzarCierreUsage(companyId: string, usageId: string): Promise<{ driverId: string }>`:
- Lee el uso; si no existe o `companyId` no coincide → lanza `'forbidden'`.
- Si `estado !== 'abierto'` → lanza `'no_abierto'`.
- `update({ estado: 'cerrado', cierreForzado: true })` (espeja el force-close de
  `openUsage`; **no** escribe `undefined`).
- `vehicles/{vehicleId}.usoActual = null` en su propio `try/catch` (best-effort, igual
  que `closeUsage`).
- Devuelve `{ driverId }` (el conductor del uso, para el contador).

### 2. Endpoint — `POST /api/usages/[id]/forzar-entrega`

- `getMembership()` + `if (!can(m.role, 'document:write')) → 403`.
- `forzarCierreUsage(m.companyId, id)`; mapea `'forbidden'` → **404**, `'no_abierto'` →
  **409**, otro → **500** con log.
- Tras cerrar: `incrementDriverStats(driverId, 'sinEntrega')` best-effort.
- 200 `{ ok: true }`.

### 3. UI — `components/vehicle/ForzarEntregaButton.tsx` + `BitacoraUso`

- Nuevo componente cliente `ForzarEntregaButton({ usageId })` (patrón de
  `RevisarDanoButton`): botón **"Forzar entrega"** con **confirmación**
  (`window.confirm('¿Forzar la entrega de este uso? El vehículo quedará disponible.')`);
  `POST /api/usages/{id}/forzar-entrega` + `router.refresh()`; muestra error si falla.
- En `components/vehicle/BitacoraUso.tsx`, sobre el uso `abierto`, mostrar el botón solo
  cuando `puedeEditar` (que la página ya pasa como `can(role, 'document:write')`). Va
  junto al badge "En uso".

## Fuera de alcance

- Notificación por email del cierre forzado (no se pidió; el "sin entrega" no notifica).
- Cerrar usos con fotos/datos (el cierre forzado es sin entrega formal, por definición).

## Testing

- **Data** (`lib/data/__tests__/usages.test.ts`): `forzarCierreUsage` marca
  `estado:'cerrado'`+`cierreForzado:true`, limpia `usoActual`, devuelve el `driverId`;
  lanza `'forbidden'` (otra empresa) y `'no_abierto'` (uso ya cerrado).
- **Endpoint** (`app/api/usages/[id]/forzar-entrega/__tests__/route.test.ts`): 403 para
  Visor; 200 para Editor con `incrementDriverStats(driverId, 'sinEntrega')`; 404/409 en
  los errores; 401 sin sesión.
- **UI** (`ForzarEntregaButton`, `BitacoraUso`): tsc + eslint + build.

## Criterios de aceptación

1. En un uso abierto, un Editor/Administrador ve el botón "Forzar entrega"; el Visor no.
2. Al confirmarlo: el uso queda `cerrado` + `cierreForzado`, el vehículo queda
   disponible (sin punto en el dashboard), y el `sinEntrega` del conductor sube en 1.
3. Un uso ya cerrado no muestra el botón; el endpoint responde 404/409 si se llama sobre
   uno no abierto.
4. Forzar y luego tomar el vehículo no duplica el `sinEntrega`.
