# Mantención por km anclada al odómetro (sin registro)

**Fecha:** 2026-07-17
**Estado:** Aprobado (diseño)

## Problema

Un vehículo con pauta de km (ej. "cada 10.000 km") pero **sin ninguna mantención registrada** queda en estado `sin_registro` y no muestra ninguna señal, aunque su kilometraje ya esté cerca del primer hito. Ejemplo real: Suzuki Swift con 9.500 km y pauta cada 10.000 km → debería avisar "próxima" (faltan 500 km), pero hoy no avisa porque falta la línea base.

## Enfoque (aprobado: anclar al odómetro cuando no hay registro)

Las pautas "cada X km" son hitos del odómetro (10.000, 20.000, …). Cuando **no hay mantención registrada**, el criterio de km se ancla al odómetro: la próxima mantención es el **múltiplo de la pauta inmediatamente superior al km actual**. Con una mantención **sí** registrada, se cuenta desde su km (comportamiento actual, más preciso).

- Sin registro, kmActual 9.500, cadaKm 10.000 → base 0 → próxima **10.000** → faltan 500 → **próxima**.
- Sin registro, kmActual 12.000, cadaKm 10.000 → base 10.000 → próxima **20.000** → faltan 8.000 → **al día**.
- **Nunca marca "vencida" sin registro** (la base es el múltiplo inferior, así que siempre faltan entre 1 y `cadaKm` km): asume que los hitos pasados se cumplieron aunque no se registraran → sin falsas alarmas en flota antigua.

El **criterio de tiempo** ("cada N meses") necesita una fecha de referencia, que solo existe con una mantención registrada. Por eso el tiempo **no participa** hasta el primer registro; con solo pauta de tiempo y sin registro, el vehículo sigue en `sin_registro`.

## Cambio (una función pura)

`lib/mantencion/status.ts` → `estadoMantencion`:
- Quitar el `if (!ultima) return sin_registro` temprano.
- **Criterio km:** aplica si `pauta.cadaKm != null && kmActual != null` (ya no exige `ultima.km`). La base es:
  - `ultima.km` si hay una mantención registrada con km;
  - si no, `Math.floor(kmActual / cadaKm) * cadaKm` (múltiplo inferior del odómetro).
  - `proximaKm = base + cadaKm`; `kmRestantes = proximaKm - kmActual`; estado por `<=0 vencida / <= UMBRAL_KM_PROXIMA proxima / al_dia`.
- **Criterio tiempo:** aplica solo si `pauta.cadaMeses != null && ultima != null` (necesita fecha base). Igual que hoy.
- Si no hay ningún criterio computable → `sin_registro` (ej. solo tiempo sin registro; o km sin `kmActual` y sin registro).
- El resto (peor criterio "lo que ocurra primero", `detalle`, umbrales) queda igual.

## Efectos (automáticos, sin más cambios de código)

`estadoMantencion` es puro y lo consumen tres lugares, que se benefician sin tocar nada más:
1. **Dashboard** (pill "Mantención próxima/vencida") → el Swift a 9.500 km ahora muestra la pill. **Es el objetivo principal.**
2. **Ficha del vehículo** (`MantencionPanel`, badge + detalle) → refleja el estado computado en vez de "Sin registro".
3. **Cron de recordatorios** → puede enviar el email "próxima" de estos vehículos.

## Limitación conocida (follow-up, no bloquea)

El cron deduplica por `vehicle.mantencionReminders` (se resetea al **registrar** una mantención). Con el anclaje al odómetro y sin registros, el vehículo cicla próxima→al día→próxima al cruzar cada múltiplo **sin** que nada resetee el dedup, así que el cron enviaría el email **solo del primer hito**. La **pill del dashboard siempre es correcta** (se recomputa en cada carga). Reajustar el dedup del cron (resetear al volver a "al día") queda como follow-up separado.

## Alcance / lo que NO cambia

- Solo `estadoMantencion` (+ sus tests). El `MantencionPanel`, el cron, los endpoints y los datos **no se tocan**.
- Los casos **con** mantención registrada quedan **idénticos** (la base sigue siendo `ultima.km`).
- Español neutro (Chile).

## Testing

`lib/mantencion/__tests__/status.test.ts`:
- **Actualizar** el test "con pauta pero sin registro" (hoy espera `sin_registro` con `kmActual: 100`): ese caso ahora computa `al_dia` (base 0, faltan 9.900). Repuntarlo a los nuevos casos de anclaje.
- **Agregar:**
  - Sin registro, km 9.500 / cadaKm 10.000 → `proxima`, `proximaKm` 10.000, `kmRestantes` 500 (el caso del Swift).
  - Sin registro, km 3.000 → `al_dia`, `kmRestantes` 7.000.
  - Sin registro, km 12.000 → `al_dia`, `proximaKm` 20.000, `kmRestantes` 8.000 (apunta al siguiente múltiplo, nunca vencida).
  - Sin registro, solo `cadaMeses` → `sin_registro` (no hay fecha base).
  - Sin registro, `cadaKm` con `kmActual: null` → `sin_registro` (km no computable).
  - Sin registro, pauta km+meses → estado por km; el tiempo no participa (`detalle.proximaFecha` undefined).
- **Mantener** intactos los tests con mantención registrada (base = `ultima.km`): al día / próxima / vencida / peor criterio / km no computable → sin cambios.

## Verificación pre-commit

`npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (incluye `status.test.ts`; `rules.test.ts` requiere emulador y se salta en local). Merge a `master` **auto-despliega a producción**.
