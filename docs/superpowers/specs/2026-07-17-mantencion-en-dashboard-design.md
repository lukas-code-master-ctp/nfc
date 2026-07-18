# Mantención en el dashboard (reemplaza la página /mantenciones)

**Fecha:** 2026-07-17
**Estado:** Aprobado (diseño)

## Problema

El estado de mantención de la flota vive en una página aparte (`/mantenciones`) que es solo lectura y hay que visitar aparte. El dashboard ya concentra el estado de cada vehículo (punto en vivo, pill de daño, chip de categoría, badge de documentos). Conviene sumar la mantención ahí y **jubilar la página** `/mantenciones`.

## Solución

Una **pill de mantención** en cada `VehicleCard` + un **filtro/orden de mantención** en el dashboard, y se elimina la ruta `/mantenciones` y su enlace del menú. La lógica de mantención (`estadoMantencion`, pauta, registros, cron de recordatorios, el `MantencionPanel` de la ficha) **no cambia**.

### 1. Pill en la card (`components/VehicleCard.tsx`)
Nuevos props: `mantencion: EstadoMantencion`, `mantencionDetalle: string`. Se muestra una pill **solo** cuando `mantencion` es:
- `'vencida'` → **"Mantención vencida"**, rojo (`bg-[#FCE7E7] text-[#C81E1E]`).
- `'proxima'` → **"Mantención próxima"**, ámbar (`bg-[#FDF1DC] text-[#B45309]`).

Los demás estados (`al_dia`/`sin_registro`/`sin_pauta`) no muestran pill. El **detalle** (`mantencionDetalle`, ej. "faltan 800 km · faltan 12 días" o "pasada 300 km · hace 5 días") va en el atributo **`title`** de la pill (tooltip nativo, sin conflicto con el click de la card). La pill se ubica en el grupo de pills existente (junto a "Dañado"/"Daño reportado"/badge).

### 2. Enlace de la card → panel de Mantención
Reusa el hash `#mantencion` (ya existente). Prioridad del `href` de la card:
1. `danoUsageId` → `/vehiculos/{id}#uso-{danoUsageId}` (daño, más urgente).
2. si no, y `mantencion` es `'proxima'`/`'vencida'` → `/vehiculos/{id}#mantencion`.
3. si no → `/vehiculos/{id}`.

### 3. Datos (server, `app/(app)/dashboard/page.tsx`)
La página ya carga `company`. Por cada vehículo (en el `map` async que ya existe) se agrega:
```ts
const pauta = v.pautaMantencion ?? company?.pautaMantencion ?? null
const ultima = await ultimaMantencion(v.id)
const em = estadoMantencion({ pauta, ultima, kmActual: v.kmActual ?? null, now })
```
y se arma `mantencionDetalle` con la misma lógica que hoy usa `/mantenciones` (partes de km y días). El item gana `mantencion: em.estado` y `mantencionDetalle: string`.

*(N+1 igual que hoy en `/mantenciones`: una query `ultimaMantencion` por vehículo. Adecuado a la escala actual; a futuro conviene denormalizar la última mantención en el vehículo, como `kmActual`. Follow-up, no bloquea.)*

### 4. Filtro y orden (`components/VehiclesBoard.tsx`)
- `Item` gana `mantencion: EstadoMantencion` y `mantencionDetalle: string`.
- Nuevo estado de filtro `mant: 'todas' | 'proxima' | 'vencida'` (default `'todas'`), que **resetea la página a 1** al cambiar (como los otros filtros).
- Conteos: `mantCounts = { proxima, vencida }` (memoizado sobre `items`). `hayMant = proxima + vencida > 0`.
- **Sección "Mantención" en el sidebar** (desktop) y chips equivalentes (mobile), **solo si `hayMant`** (igual que el filtro de categoría solo aparece si hay categorías): opciones **Todas · Próxima (n) · Vencida (n)**. Combinable [AND] con los filtros de Estado (documentos) y Categoría existentes.
- La cadena de `visible` (useMemo) agrega el filtro: `.filter(i => mant === 'todas' || i.mantencion === mant)`.
- **Orden:** nueva opción "Mantención" en `SORTS` que ordena por urgencia de mantención (`vencida → proxima → al_dia → sin_registro → sin_pauta`, con desempate por nombre), para replicar el orden que daba la página.

### 5. Se elimina
- La ruta `app/(app)/mantenciones/page.tsx` (borrada).
- El enlace **"Mantención"** del menú superior (en `AppNav`).
- El hash `#mantencion` **se mantiene** (ahora lo usa el `href` de la card del dashboard).

## Alcance / lo que NO cambia

- `estadoMantencion` y todo `lib/mantencion/*`, `lib/data/mantenciones.ts`, el `MantencionPanel` de la ficha (config + registro + historial), y el **cron** de recordatorios quedan **idénticos**.
- No hay nuevos endpoints, ni migración, ni cambios de datos.
- Español neutro (Chile), sin emojis, tokens/hex ya usados.

## Testing

- No hay lógica pura nueva propia de este cambio (reusa `estadoMantencion`, ya testeado). El filtro/orden y la pill son UI; verificación **manual**:
  - Un vehículo próximo/vencido muestra la pill correcta con el detalle en el tooltip; al día / sin pauta no muestran pill.
  - La sección "Mantención" del filtro aparece solo si hay ≥1 próximo/vencido; filtrar Próxima/Vencida acota la lista, combinable con Estado y Categoría.
  - El orden "Mantención" pone vencidas arriba.
  - Tocar una card con pill de mantención (sin daño) abre la ficha en el panel de Mantención.
  - El menú ya no tiene "Mantención" y `/mantenciones` ya no existe (404).

## Verificación pre-commit

`npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (sin tests nuevos; `rules.test.ts` requiere emulador y se salta en local). Merge a `master` **auto-despliega a producción**.
