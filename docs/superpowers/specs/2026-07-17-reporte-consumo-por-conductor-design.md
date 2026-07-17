# Columna "Consumo anormal" en el reporte por conductor

**Fecha:** 2026-07-17
**Estado:** Aprobado (diseño)

## Problema

El reporte "Responsabilidad por conductor" (`/reportes`, `ReporteConductores`) muestra por conductor los contadores Usos · Daños · Sin entrega. Falta ver cuántos usos de cada conductor gatillaron la señal de **consumo anómalo de bencina** (ya visible como pill en la bitácora del vehículo), para tener el dato consolidado por persona.

## Enfoque: conteo on-read (no un contador guardado)

La señal de consumo se calcula al leer (`calcularConsumo`, `lib/usages/consumo.ts`), no se persiste. Para el reporte se hace lo mismo: en la carga de `/reportes` se recorren los usos de la empresa, se recalcula la señal por uso y se **cuenta por conductor** los usos con `revisar === true`. Se atribuye al conductor del uso anómalo (`driverId`).

**Por qué on-read y no un contador `drivers.stats.consumoAnomalo`:** el contador se desincronizaría cuando el Admin corrige el rendimiento/capacidad del vehículo o edita una lectura de la IA (la señal es dinámica), necesitaría backfill de lo ya cargado, y contradice la naturaleza on-read de la señal. On-read siempre refleja los datos y params actuales, sin migración ni drift.

**Caveat de escala (follow-up, no bloquea):** recorrer todos los usos de la empresa en cada carga de `/reportes` es adecuado para la flota actual; a escala de miles de usos habría que cachear/denormalizar (o mover a un contador con recomputación).

## Cambios

### Datos
- `lib/data/usages.ts`: nueva `listUsagesByCompany(companyId): Promise<VehicleUsage[]>` — una sola query `where('companyId','==',companyId).get()` (espeja la que ya usa `deleteUsagesByCompany` para leer, sin borrar).

### Lógica pura (en `lib/usages/consumo.ts`)
```ts
export function contarConsumoAnomaloPorConductor(
  usos: { vehicleId: string; driverId: string; tomadoEn: string; km: number | null; bencina: string | null }[],
  paramsPorVehiculo: Map<string, ConsumoBencina | null>,
): Map<string, number>
```
- Agrupa los usos por `vehicleId`.
- Ordena cada grupo **desc por `tomadoEn`** (igual que la bitácora), así el uso previo de `grupo[i]` es `grupo[i + 1]`.
- Para cada uso, calcula `calcularConsumo(actual, previo, paramsPorVehiculo.get(vehicleId) ?? null)`; si el resultado existe y `revisar === true`, suma 1 al `driverId` en el mapa.
- Devuelve `Map<driverId, number>` (solo con conductores que tengan ≥ 1; los demás se leen como 0 desde el consumidor con `?? 0`).

### Página `app/(app)/reportes/page.tsx`
- Cargar además `listUsagesByCompany(m.companyId)`.
- Armar `paramsPorVehiculo = new Map(vehicles.map((v) => [v.id, v.consumo ?? null]))`.
- `const consumoPorConductor = contarConsumoAnomaloPorConductor(usos.map(u => ({ vehicleId: u.vehicleId, driverId: u.driverId, tomadoEn: u.tomadoEn, km: u.km ?? null, bencina: u.bencina ?? null })), paramsPorVehiculo)`.
- Agregar a cada fila `consumoAnomalo: consumoPorConductor.get(d.id) ?? 0`.
- Orden de filas: agregar `consumoAnomalo` como criterio (ej. `b.danos - a.danos || b.sinEntrega - a.sinEntrega || b.consumoAnomalo - a.consumoAnomalo`).

### Componente `components/reportes/ReporteConductores.tsx`
- `Fila` gana `consumoAnomalo: number`.
- Nueva columna **"Consumo anormal"** (header en mayúsculas como las otras), en **ámbar** (`#B45309`, resaltada en negrita solo cuando el valor es > 0; igual patrón que "Sin entrega"). La tabla ya tiene `overflow-x-auto`, así que el ancho extra no rompe el layout.

## Alcance / lo que NO cambia

- Cero cambios al flujo de tomar/entregar, a la IA, a la ficha pública, ni a la pill de la bitácora del vehículo.
- No hay contador nuevo en Firestore, ni migración, ni endpoint nuevo. Reusa `calcularConsumo` y los datos existentes.
- Español neutro (Chile), sin emojis, tokens de la app.

## Testing

- **Unit test (Vitest)** de `contarConsumoAnomaloPorConductor` en `lib/usages/__tests__/consumo.test.ts`:
  - Cuenta un uso anómalo y lo atribuye al `driverId` correcto.
  - Suma anomalías de un mismo conductor a través de varios vehículos.
  - No cuenta usos que `calcularConsumo` descarta (sin previo, recarga, viaje corto, sin params) — devuelve mapa sin ese conductor (o 0).
  - Ordena por vehículo correctamente (el "previo" es el uso anterior en el tiempo del **mismo** vehículo, no de otro).
- La `listUsagesByCompany` (data) y la columna (UI) se verifican manualmente.

## Verificación pre-commit

`npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (incluye los nuevos tests; `rules.test.ts` requiere emulador y se salta en local). Merge a `master` **auto-despliega a producción**.
