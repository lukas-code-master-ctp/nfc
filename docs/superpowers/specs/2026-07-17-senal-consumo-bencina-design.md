# Señal de consumo anómalo de bencina

**Fecha:** 2026-07-17
**Estado:** Aprobado (diseño)

## Problema

Un administrador de flota quiere detectar posible robo/desvío de bencina: que un conductor haya consumido mucha más bencina de la que los kilómetros recorridos justifican.

**Historia de usuario:** Como administrador de flota, quiero detectar si los conductores están gastando más bencina de la esperada, para llevar control del costo asociado.

## Enfoque

Una **señal informativa** (no una alerta dura ni una acusación): por cada uso cerrado, comparar la **bajada de estanque observada** contra la **bajada esperada** según los km recorridos, y marcar el uso con una pill "Revisar consumo" cuando la diferencia es grande. El administrador decide.

**Sin cambios al flujo de tomar/entregar:** se reutiliza lo que la IA ya lee en la entrega (nivel de bencina + km). La línea base de cada uso es la **entrega anterior del mismo vehículo**. Los niveles de bencina son discretos (`Lleno · 3/4 · 1/2 · 1/4 · Reserva`), así que el umbral es generoso para no generar falsos positivos.

## Cálculo (función pura)

Módulo `lib/usages/consumo.ts`.

Mapa de nivel → fracción de estanque:
```
Lleno = 1.0 · 3/4 = 0.75 · 1/2 = 0.5 · 1/4 = 0.25 · Reserva = 0.1
```

Constantes: `UMBRAL_FRACCION = 0.25` (un nivel completo "de más"), `MIN_KM = 20` (viajes muy cortos no se evalúan).

```ts
export interface ConsumoBencina {
  rendimientoKmL: number | null  // km por litro
  estanqueLitros: number | null  // capacidad del estanque
}

export interface ConsumoCalc {
  kmRecorridos: number
  litrosEsperados: number
  litrosObservados: number
  fraccionEsperada: number
  fraccionObservada: number
  revisar: boolean
}

// null = no se puede/no corresponde evaluar (sin params, sin uso previo,
// lecturas faltantes, recarga, o viaje demasiado corto).
export function calcularConsumo(
  actual: { km: number | null; bencina: string | null },
  previo: { km: number | null; bencina: string | null } | null,
  params: ConsumoBencina | null,
): ConsumoCalc | null
```

Lógica:
- Si falta `params.rendimientoKmL` o `params.estanqueLitros` → `null`.
- Si no hay `previo`, o falta `km`/`bencina` en `actual` o `previo`, o algún nivel no está en el mapa → `null`.
- `kmRecorridos = actual.km − previo.km`; si `< MIN_KM` → `null`.
- `fraccionObservada = fraccion(previo.bencina) − fraccion(actual.bencina)`; si `<= 0` (recarga o sin bajada) → `null`.
- `litrosEsperados = kmRecorridos / rendimientoKmL`; `fraccionEsperada = litrosEsperados / estanqueLitros`.
- `litrosObservados = fraccionObservada * estanqueLitros`.
- `revisar = (fraccionObservada − fraccionEsperada) >= UMBRAL_FRACCION`.
- Devuelve el `ConsumoCalc`. El consumidor muestra la señal solo si `revisar === true`.

**Saneo de los params del vehículo** (misma filosofía que `sanitizePauta`; el servidor nunca confía en el cliente), en el mismo módulo:
```ts
export function sanitizeConsumo(raw: unknown): ConsumoBencina | null
```
- Parsea `rendimientoKmL` y `estanqueLitros` a número **finito y > 0**; cualquier otra cosa → `null`.
- Si ambos quedan `null` → devuelve `null` (nada que guardar).

## Datos del vehículo

- Nuevo campo `Vehicle.consumo?: ConsumoBencina | null` (en `lib/types.ts`), denormalizado en `vehicles/{id}`.
- `toVehicle` (en `lib/data/vehicles.ts`) lo mapea: `consumo: data.consumo ?? null`.
- `PATCH /api/vehicles/[id]` gana una rama en la whitelist (como `pautaMantencion`):
  ```ts
  if (body.consumo !== undefined) patch.consumo = body.consumo === null ? null : sanitizeConsumo(body.consumo)
  ```
  Sigue exigiendo `can(role, 'vehicle:write')` (Administrador).

## UI

### Configuración (Administrador)
Nuevo componente `components/vehicle/ConsumoBencinaPanel.tsx`, ubicado en la **pestaña "Vehículo"** de la ficha (`app/(app)/vehiculos/[id]/page.tsx`), junto a `MantencionPanel`/`DanoActivoPanel`. Dos inputs numéricos — **Rendimiento (km/litro)** y **Capacidad del estanque (litros)** — que guardan vía `PATCH /api/vehicles/[id]` con `{ consumo: { rendimientoKmL, estanqueLitros } }`. Editable solo con `vehicle:write`; para Editor/Visor se muestra en solo lectura (o no se muestra el form). Estilo consistente con `VehicleInfoForm`/`MantencionPanel` (tokens de la app, sin emojis).

### Señal en la bitácora
En `components/vehicle/BitacoraUso.tsx`: los usos ya llegan ordenados por `tomadoEn` **descendente**, e incluyen `km` y `bencina`. Para cada uso en el índice `i`, el uso **previo en el tiempo** es `usos[i + 1]`. Se calcula `calcularConsumo(usos[i], usos[i + 1] ?? null, consumoParams)` y, si el resultado existe y `revisar === true`, se muestra una **pill "Revisar consumo"** (patrón `PillTip`, ya usado en `/reportes`) cuyo popover dice algo como:
> "Esperabas gastar ~{litrosEsperados} L en {kmRecorridos} km, pero el estanque bajó ~{litrosObservados} L. Revisa un posible consumo anómalo."

`BitacoraUso` recibe un nuevo prop `consumoParams: ConsumoBencina | null`, que `page.tsx` pasa desde `vehicle.consumo`. Si es `null` (vehículo sin configurar), nunca se muestra la pill.

## Umbral / filosofía anti-falsos-positivos

- Solo se marca cuando la bajada observada excede la esperada por **≥ 0.25 de estanque** (un nivel completo), y hubo `≥ 20 km`.
- Recargas (la bencina sube) y lecturas faltantes (cierres forzados sin fotos) **se omiten**, no marcan.
- Es señal informativa: no hay email, ni alerta, ni bloqueo. Es una constante calibrable.

## Alcance / lo que NO cambia

- **Cero cambios** al flujo de tomar/entregar, a la IA, a la ficha pública, ni a la subida de fotos.
- No hay email ni alertas ni nuevos endpoints (se reusa el `PATCH /api/vehicles/[id]`).
- La señal vive **solo en la bitácora del vehículo**. Mostrarla en `/reportes` (cross-flota, paginado) queda como posible follow-up.
- Español neutro (Chile), SVG inline, tokens de la app.

## Testing

- **Unit tests (Vitest)** del módulo puro `lib/usages/consumo.ts`:
  - `sanitizeConsumo`: números válidos, strings numéricos, valores ≤ 0 / no numéricos → null, ambos null → null.
  - `calcularConsumo`: caso que marca (ej. 250 km, 10 km/l, estanque 100 L, Lleno→1/2 = marca), caso normal que no marca (bajada acorde), sin uso previo → null, lectura faltante → null, recarga (bencina sube) → null, viaje corto (< 20 km) → null, sin params → null.
- El resto (formulario de config, pill en la bitácora) es UI; verificación manual.

## Verificación pre-commit

`npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (incluye los nuevos tests de `consumo.ts`; `rules.test.ts` requiere emulador y se salta en local). Merge a `master` **auto-despliega a producción**.
