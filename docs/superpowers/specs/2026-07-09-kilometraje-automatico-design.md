# Kilometraje automático

**Fecha:** 2026-07-09
**Estado:** Aprobado, listo para plan de implementación
**Sprint:** 1/3 (prerrequisito de "Pauta de mantención")

## Objetivo

Que el administrador vea el **kilometraje actualizado de cada vehículo**. La IA
ya lee el km del odómetro desde la foto del tablero en cada entrega; falta
subir ese valor al nivel del vehículo y mostrarlo.

## Decisiones (del brainstorming)

- **Captura:** solo en la entrega (reutiliza la foto del tablero + IA que ya
  existen). No se agrega foto al tomar (cero fricción nueva).
- **Dónde se muestra:** solo en la ficha del vehículo (no en el dashboard ni en
  reportes por ahora).
- **Corrección:** el admin ya puede corregir el km de un uso con
  `UsageDatosEditor` (existente); ese valor corregido debe reconciliar el km del
  vehículo.
- **Denormalizar** `kmActual` en el vehículo (no solo calcularlo en la página):
  la Pauta de mantención (sprint 2/3) lo necesita a nivel de vehículo.

## Modelo de datos

- `lib/types.ts` → `Vehicle` gana:
  - `kmActual?: number | null` — último kilometraje conocido (odómetro).
  - `kmActualizadoEn?: string | null` — fecha ISO de la lectura que lo fijó.
- Ambos opcionales, denormalizados en `vehicles/{id}`. Sin migración de esquema.

**Semántica monotónica:** el odómetro solo sube, así que `kmActual` = **el km
máximo** entre los usos del vehículo. Robustez: una lectura baja o mal leída
nunca pisa una alta; corregir un uso reconcilia (recalcula el máximo).

## Cambios

### 1. Tipos
- `Vehicle.kmActual?` y `Vehicle.kmActualizadoEn?` en `lib/types.ts`.
- `lib/data/vehicles.ts` → `toVehicle` mapea ambos (`data.kmActual ?? null`,
  `data.kmActualizadoEn ?? null`).

### 2. Recálculo del km del vehículo
- `lib/data/usages.ts` → `refreshVehicleKm(vehicleId: string): Promise<void>`
  (best-effort, no lanza hacia afuera):
  - Lee `listUsages(vehicleId)`.
  - Calcula el km máximo entre los usos con `km != null`.
  - Si hay al menos una lectura: `update` del vehículo con
    `{ kmActual: max, kmActualizadoEn: <entregadoEn ?? createdAt del uso con ese max> }`.
  - Si no hay ninguna lectura: no escribe (deja lo que haya).
- **Lógica pura testeable:** extraer el cálculo a una función pura
  `kmDeUsos(usos): { km: number; fecha: string } | null` (en `lib/usages/km.ts`),
  para testear el máximo/empates/null sin Firebase. `refreshVehicleKm` la usa.
- Llamadas a `refreshVehicleKm` (best-effort, envueltas en try/catch):
  - En `setUsageAnalysis` (tras escribir el km leído por la IA). Como corre en
    `after()` desde `entregar`, no bloquea la respuesta.
  - En `updateUsageDatos` (tras la corrección manual del admin) — reconcilia.

### 3. UI — ficha del vehículo
- `app/(app)/vehiculos/[id]/page.tsx`: en la tarjeta de cabecera, bajo
  "{anio} · {color}", una línea de km:
  - Con lectura: **"Kilometraje: 45.320 km"** (formato es-CL, separador de miles)
    + texto sutil "actualizado el DD/MM/AAAA" (zona `America/Santiago`).
  - Sin lectura: "Kilometraje: sin lectura todavía" + hint "se toma de la foto
    del tablero al entregar el vehículo".
- Solo lectura para todos los roles (el valor viene de la bitácora/IA).
- Formato de miles con `toLocaleString('es-CL')`.

### 4. Backfill (one-time)
- `scripts/backfill-km.mjs` (Admin SDK, patrón de los scripts existentes):
  recorre todos los vehículos, calcula `kmDeUsos` desde sus usos y escribe
  `kmActual`/`kmActualizadoEn` cuando corresponde. Idempotente. Correr una vez
  en prod tras el deploy.

## Fuera de alcance

- Mostrar km en el dashboard o en `/reportes` (se decidió solo ficha).
- Capturar km al tomar (se decidió solo en la entrega).
- Fijar km manual a nivel de vehículo (la corrección por-uso ya cubre el caso).
- Historial/gráfico de km (la bitácora ya guarda el km por uso).

## Testing

- **Unit** (`lib/usages/km.ts`): `kmDeUsos` — vacío/sin lecturas → null; toma el
  máximo; ignora `km` null; devuelve la fecha del uso con el km máximo.
- **Data** (`refreshVehicleKm`, patrón Vitest con mocks de admin): escribe
  `kmActual`/`kmActualizadoEn` cuando hay lectura; no escribe cuando no hay.
- **UI/verificación estática:** tsc + eslint + build (la ficha está tras login;
  no se puede manejar el flujo real en preview).

## Criterios de aceptación

1. Tras una entrega, cuando la IA lee el km, el vehículo muestra ese km en su
   ficha (formato es-CL) con la fecha de actualización.
2. Si el admin corrige el km de un uso, el km del vehículo se reconcilia al
   máximo entre sus usos.
3. Una lectura menor a la actual no baja el `kmActual` del vehículo.
4. Un vehículo sin ninguna lectura muestra "sin lectura todavía".
5. El backfill llena `kmActual` de los vehículos con usos previos que ya tenían
   km leído.
