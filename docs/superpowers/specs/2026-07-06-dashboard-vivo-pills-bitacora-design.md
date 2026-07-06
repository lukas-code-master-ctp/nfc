# Punto "en vivo" en el dashboard + pills clickeables en la bitácora

**Fecha:** 2026-07-06
**Estado:** Aprobado, listo para plan de implementación

## Contexto

Dos mejoras de UI independientes, ambas **frontend puro** (sin tocar endpoints ni
datos — los datos ya están disponibles). Se agrupan en una sola spec/plan porque tocan
archivos distintos y son de alcance similar.

Un tercer ítem del lote original ("bug" de estados de miembros en Equipo invertidos) se
**descartó**: al revisar los registros reales de producción, el panel muestra
correctamente los datos (Denisse aceptó, Valeria quedó pendiente). No hay bug de UI ni
de código. No se hace ningún cambio ahí.

## Feature B — Punto "en vivo" en el dashboard

**Qué:** en el dashboard ("Mis vehículos"), un vehículo que está **en uso** muestra un
indicador visual sutil (punto verde con animación de "ping") con un tooltip que dice
quién lo tiene.

**Dónde:** `components/VehicleCard.tsx`. La card ya recibe el `Vehicle` completo, que
incluye `usoActual: { driverNombre: string; tomadoEn: string } | null` (denormalizado).
No hay que cambiar `app/(app)/dashboard/page.tsx` ni `VehiclesBoard.tsx` ni pasar props
nuevas.

**Diseño:**
- Cuando `vehicle.usoActual` es truthy, renderizar un punto verde de presencia sobre la
  esquina superior derecha del badge del ícono del auto (el `<span>` con `CarIcon`).
- Animación "ping": un `<span>` absoluto con `animate-ping` (anillo que se expande y
  desvanece) detrás de un punto sólido verde. Puro CSS de Tailwind — `VehicleCard`
  **sigue siendo server component** (no se agrega `'use client'`).
- Color verde: usar el mismo verde de "Disponible"/vigente ya usado en la app
  (`text-[#15803D]` / equivalente de fondo). El punto sólido es verde; el anillo ping es
  el mismo verde con opacidad.
- Tooltip: atributo `title` nativo en el contenedor del punto, con el texto
  **"En uso por {driverNombre} · desde {hora}"**, donde `hora` se formatea con
  `toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })`
  (mismo formato que el resto de la app).
- El punto no debe interferir con el click de la card (que navega a `/vehiculos/{id}`):
  es decorativo, dentro del `<Link>`, sin handlers propios.

**Criterios de aceptación B:**
1. Un vehículo con `usoActual` muestra el punto verde animado; uno sin uso, no.
2. El `title` del punto dice "En uso por {conductor} · desde {fecha/hora}".
3. `VehicleCard` sigue sin `'use client'` (server component).
4. Hacer click en la card sigue navegando a la página del vehículo.

## Feature C — Pills clickeables en la bitácora

**Qué:** en la bitácora de flota (`/reportes`), cada uso muestra pills con la
información capturada (tablero, limpieza, daño); al hacer click, un tooltip muestra el
detalle en texto.

**Dónde:** `components/reportes/BitacoraFlota.tsx` (ya es client component) + un
componente nuevo reutilizable `components/PillTip.tsx`. El endpoint
`GET /api/reportes/usos` **ya devuelve** los campos necesarios (retorna el
`VehicleUsage` completo vía `listUsagesPage`): `km`, `bencina`, `limpieza`, `dano`. No
se toca el backend.

**Diseño:**
- Extender la interfaz `Uso` de `BitacoraFlota` para leer los campos que ya vienen:
  `km?: number`, `bencina?: string`, `limpieza?: string`, `dano?: { hay: boolean; nota?: string }`.
  (`cierreForzado?` y `dano?.hay` ya están.)
- Nuevo componente `components/PillTip.tsx`: una pill clickeable que abre/cierra un
  popover. Props: `{ label: string; tono: 'azul' | 'rojo'; children: React.ReactNode }`.
  Reutiliza el patrón de `components/InfoTip.tsx` (estado `open`, cierra con click-fuera
  vía `mousedown` y con `Escape`, `role="tooltip"`, popover posicionado absoluto). La
  pill es un `<button type="button">` con los estilos de pill existentes; el popover
  muestra `children`.
  - Tono `azul`: fondo/borde azul suave (armonizar con los tokens; el mockup usa una
    pill azul — usar `bg-azul/10 text-azul` o equivalente de la app).
  - Tono `rojo`: los tokens del badge "Daño" actual (`bg-[#FCE7E7]` / `text-[#C81E1E]`).
- En cada fila de `BitacoraFlota`, renderizar las pills según los datos disponibles:

  | Pill | Condición | Contenido del tooltip |
  |---|---|---|
  | **Tablero** (azul) | `u.km != null \|\| u.bencina` | "Kilometraje: {km} km · Bencina: {bencina}" (omitir el campo que falte) |
  | **Limpieza** (azul) | `u.limpieza` | "Limpieza: {limpieza}" |
  | **Daño** (rojo) | `u.dano?.hay` | `u.dano.nota` o "Sin nota" |

- La pill **"Sin entrega"** actual (`u.cierreForzado`, ámbar) se **mantiene tal cual**
  (no es clickeable, es un marcador de estado).
- Las pills conviven en el mismo contenedor `flex gap-1` de la derecha de la fila.

**Criterios de aceptación C:**
1. Un uso con `km`/`bencina` muestra la pill "Tablero"; al click, el tooltip muestra el
   kilometraje y la bencina.
2. Un uso con `limpieza` muestra la pill "Limpieza" con su valor en el tooltip.
3. Un uso con daño muestra la pill "Daño" (roja) con la nota (o "Sin nota").
4. Un uso sin ningún dato capturado no muestra pills de tablero/limpieza/daño.
5. El popover se cierra con click-fuera y con Escape; abrir uno no afecta a los demás.
6. No se modifica el backend ni el endpoint.

## Fuera de alcance

- Mostrar las **fotos** (tablero/cabina) en el tooltip — se decidió mostrar solo los
  datos en texto (las fotos requerirían signed URLs, backend). Queda para después si se
  quiere.
- Cualquier cambio en el flujo de invitaciones/aceptación (el "bug" no era bug).

## Testing

Ambas features son presentacionales; se verifican con `npx tsc --noEmit`,
`npx eslint` y `npm run build`. No se agregan tests unitarios (consistente con las
tareas de UI previas del proyecto). `PillTip` replica el patrón ya probado de `InfoTip`.
