# Categorías de vehículos por empresa

**Fecha:** 2026-07-08
**Estado:** Aprobado, listo para plan de implementación

## Objetivo

Que cada empresa defina un conjunto de **categorías** (ej. "Camiones", "Reparto",
"Ejecutivos"), asigne **una** categoría a cada vehículo, y pueda **filtrar el dashboard**
por categoría.

## Decisiones (del brainstorming)

- **Una** categoría por vehículo (opcional; un vehículo puede no tener ninguna).
- Categorías **renombrables** → se guardan con `id` estable + `nombre` editable.
- Asignación **solo en la página del vehículo** (v1; no en el modal de creación).
- La categoría **se muestra** como un chip en la card del dashboard.

## Modelo de datos

- `lib/types.ts`:
  - `export interface Categoria { id: string; nombre: string }`
  - `Company` gana `categorias?: Categoria[]` (lista por empresa, en `companies/{id}`).
  - `Vehicle` gana `categoriaId?: string` (id de la categoría asignada; opcional).
- Las categorías viven en el doc `companies/{companyId}` (como `plan`/`avisoUsoHoras`);
  no hay colección nueva ni índices. Scopeado por `companyId` como el resto.
- El `id` de una categoría lo genera el cliente con `crypto.randomUUID()` al crearla; el
  servidor lo respeta (y genera uno con `nanoid` si faltara, defensivo).

## Cambios

### 1. Lógica pura de saneo + tipos

- `lib/company/categorias.ts` (nuevo, puro, testeable):
  `sanitizeCategorias(raw: unknown): Categoria[]` — si no es array, `[]`; por cada
  entrada válida (`{ id?, nombre }`): `nombre` trim y recortado a **40** chars, `id`
  string o `nanoid()`; descarta `nombre` vacío; **dedup por nombre** (case-insensitive,
  conserva el primero); tope **30** categorías.
- `lib/types.ts`: `Categoria`, `Company.categorias?`, `Vehicle.categoriaId?`.

### 2. Persistencia + endpoint de config

- `lib/data/companies.ts`: `getCompany` devuelve `categorias: d.categorias ?? []`;
  `saveCompany` acepta `categorias?: Categoria[]` en el patch y lo persiste (sin
  `undefined`; solo si viene).
- `PATCH /api/company` (`app/api/company/route.ts`): acepta un `categorias` opcional en
  el body; lo pasa por `sanitizeCategorias` y lo guarda. Sigue exigiendo
  `can(role, 'billing:manage')`. Mantiene `company`/`avisoUsoHoras` opcionales (el body
  puede traer solo `categorias`). Si no viene nada que actualizar → 400.

### 3. UI de configuración — `CategoriasCard`

- `components/company/CategoriasCard.tsx` (cliente, nuevo). Se muestra en Configuración
  solo al Administrador (junto a `PlataformaCard`), con las categorías actuales:
  - **Agregar**: input + botón (genera `id` con `crypto.randomUUID()`), en estado local.
  - **Renombrar**: edición inline del nombre.
  - **Eliminar**: quita de la lista local (con confirmación). **No** cascada: los
    vehículos con esa categoría quedan con `categoriaId` que ya no matchea → se tratan
    como "Sin categoría" en el filtro y en el chip.
  - **Guardar cambios**: un botón que hace `PATCH /api/company` con la lista completa
    `{ categorias }` + `router.refresh()` (patrón de `PlataformaCard`).
- `app/(app)/configuracion/page.tsx`: renderiza `<CategoriasCard initial={company?.categorias ?? []} />` en la rama `esAdmin`.

### 4. Asignación en la página del vehículo

- `app/(app)/vehiculos/[id]/page.tsx`: cargar también `getCompany(m.companyId)` para
  tener `categorias`. Pasar `categorias` + `vehicle.categoriaId` a un nuevo selector.
- `components/vehicle/CategoriaSelector.tsx` (cliente, nuevo): un `<select>` con las
  categorías + "Sin categoría"; al cambiar hace `PATCH /api/vehicles/[id]` con
  `{ categoriaId: string | null }` + `router.refresh()`. Se muestra editable solo si
  `can(role, 'vehicle:write')` (Administrador); para Editor/Visor, muestra la categoría
  en solo lectura (texto/chip).
- `PATCH /api/vehicles/[id]` (`app/api/vehicles/[id]/route.ts`): aceptar `categoriaId`
  (string o null) en el patch, validando `vehicle:write` + `companyId` (como ya hace
  para los demás campos). `null`/'' = quitar la categoría.
- `lib/data/vehicles.ts`: `VehicleInput` ya deriva de `Vehicle` (incluirá `categoriaId?`
  automáticamente); `updateVehicle` acepta `{ categoriaId }` en el `Partial`. Cuidar que
  Firestore no reciba `undefined` (si se quita, escribir `categoriaId: null`).

### 5. Filtro + chip en el dashboard

- `app/(app)/dashboard/page.tsx`: ya carga `company`; usar `company.categorias ?? []`.
  Construir un mapa `id → nombre`. Cada `Item` gana `categoriaId: string | null` y
  `categoriaNombre: string | null` (resuelto contra el mapa; si el id no matchea una
  categoría vigente → `null`). Pasar la lista de categorías a `VehiclesBoard`.
- `components/VehiclesBoard.tsx`: nuevo estado `categoriaFiltro` (`'todas' | id`). El
  `visible` filtra además por categoría (`categoriaFiltro === 'todas' || item.categoriaId === categoriaFiltro`),
  combinable con el filtro de estado. UI:
  - **Desktop** (sidebar): un `<select>` "Categoría" (Todas + nombres) en una card, junto
    a Estado y Ordenar. Solo se muestra si hay categorías.
  - **Mobile** (barra compacta): un `<select>` "Categoría" junto al de orden. Solo si hay
    categorías.
- `components/VehicleCard.tsx`: nueva prop `categoriaNombre?: string | null`; si existe,
  muestra un **chip** sutil (gris/neutro, tokens existentes) junto al nombre o en la
  línea de subtítulo. Reutiliza el layout responsive ya arreglado (no debe reintroducir
  desborde en mobile).

## Fuera de alcance

- Asignar categoría al **crear** el vehículo (modal). v2 si se quiere.
- Múltiples categorías por vehículo (se eligió una).
- Filtrar por categoría en `/reportes` (solo el dashboard por ahora).
- Cascada al borrar una categoría (los vehículos quedan "sin categoría" por diseño).

## Testing

- **Unit** (`lib/company/categorias.ts`): `sanitizeCategorias` — no-array → `[]`; trim +
  recorte a 40; descarta vacíos; dedup por nombre case-insensitive; tope 30; genera id si
  falta.
- **Endpoints** (patrón Vitest existente):
  - `PATCH /api/company`: acepta `categorias` (saneado) sin `company`; sigue con guard
    `billing:manage`.
  - `PATCH /api/vehicles/[id]`: acepta `categoriaId` con guard `vehicle:write`; `null`
    quita la categoría.
- **UI** (`CategoriasCard`, `CategoriaSelector`, filtro/chip del dashboard): tsc + eslint
  + build.

## Criterios de aceptación

1. El Administrador crea/renombra/elimina categorías en Configuración → "Categorías" y se
   persisten (tope 30, sin vacíos ni duplicados por nombre).
2. En la página de un vehículo, el Administrador asigna/cambia/quita su categoría; los
   demás roles la ven en solo lectura.
3. El dashboard tiene un filtro "Categoría" (desktop y mobile) que, combinado con Estado,
   muestra solo los vehículos de esa categoría.
4. La card del dashboard muestra un chip con el nombre de la categoría del vehículo (si
   tiene una vigente).
5. Borrar una categoría no rompe nada: los vehículos que la tenían aparecen como "Sin
   categoría" (sin chip, no filtrables por una categoría inexistente).
6. Nada escribe `undefined` a Firestore; el filtro de categoría solo aparece si la
   empresa tiene al menos una categoría.
