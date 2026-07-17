# Sub-menús de la ficha del vehículo

**Fecha:** 2026-07-17
**Estado:** Aprobado (diseño)

## Problema

La ficha privada del vehículo (`app/(app)/vehiculos/[id]/page.tsx`) apila 8 secciones de arriba a abajo (encabezado, NFC, Documentos, Información, Mantención, Daño activo, Bitácora, Eliminar). Queda **demasiado larga y difícil de navegar**: encontrar una sección obliga a hacer scroll por toda la página.

**Historia de usuario:** Como administrador de flota, quiero ver la ficha del vehículo de forma más ordenada, para encontrar más fácil lo que ando buscando.

## Solución

Reorganizar las secciones (menos el encabezado) en **4 pestañas** (sub-menús), sin tocar la lógica de datos, endpoints, roles ni la ficha pública. Es una reorganización puramente visual.

### Estructura

**Encabezado fijo** (siempre visible, sobre las pestañas, tal cual hoy): ícono, `marca modelo · patente`, `año · color`, kilometraje (si hay lectura), y selector/etiqueta de categoría.

| Pestaña | Hash | Contenido (componentes actuales, sin cambios internos) |
|---|---|---|
| **Documentos** (default) | `#documentos` | `DocumentForm` (si `document:write`) + `DocumentList` |
| **Vehículo** | `#vehiculo` | `VehicleInfoForm`/`VehicleInfoView` + `MantencionPanel` + `DanoActivoPanel` |
| **Bitácora** | `#bitacora` | `BitacoraUso` |
| **Ajustes** | `#ajustes` | `NfcTokenPanel` + `DeleteVehicleButton` (si `vehicle:write`) |

Pestaña inicial (sin hash o hash desconocido): **Documentos**.

### Navegación (hash en la URL)

- Clic en una pestaña → cambia el hash de la URL (`#vehiculo`, etc.). Los botones **atrás/adelante** del navegador saltan entre pestañas.
- Al **recargar** con un hash de pestaña, se abre esa pestaña.
- **Enlaces profundos a un uso** (`/vehiculos/{id}#uso-{usageId}`, usados hoy por la pill "Daño reportado" del dashboard y el botón del email de daño): al detectar un hash que empieza con `uso-`, se abre la pestaña **Bitácora** y se hace scroll al `<li id="uso-{id}">` (que ya existe, con `scroll-mt-20`). Este comportamiento se preserva 100%.

### Enfoque técnico

- **`page.tsx` sigue siendo server component** y hace exactamente el mismo fetch de datos que hoy. Solo cambia el ensamblado final: en vez de apilar las secciones, arma cada grupo y lo pasa como **slot** (`ReactNode`) a un nuevo shell de pestañas.
- **Nuevo componente cliente `components/vehicle/VehicleTabs.tsx`:**
  - Props: 4 slots (`documentos`, `vehiculo`, `bitacora`, `ajustes`: `ReactNode`).
  - Estado `activa` derivado del hash. En el montaje lee `window.location.hash`; escucha `hashchange` para atrás/adelante.
  - Si el hash empieza con `uso-`: fija `activa = 'bitacora'` y, tras el render, hace `document.getElementById(hash)?.scrollIntoView()`.
  - Renderiza la **barra de pestañas** + las 4 secciones **montadas siempre**, ocultando las inactivas con CSS (atributo `hidden`). Montar-y-ocultar (en vez de desmontar) preserva el estado de los formularios a medio llenar al cambiar de pestaña, y evita re-scroll issues.
- **Helper puro `lib/vehicles/tabs.ts`:**
  - `export type TabFicha = 'documentos' | 'vehiculo' | 'bitacora' | 'ajustes'`
  - `tabDesdeHash(hash: string): { tab: TabFicha; scrollA: string | null }`
    - Normaliza quitando el `#` inicial.
    - `'documentos' | 'vehiculo' | 'bitacora' | 'ajustes'` → esa pestaña, `scrollA: null`.
    - Empieza con `uso-` → `{ tab: 'bitacora', scrollA: 'uso-...' }` (el id completo).
    - Vacío o desconocido → `{ tab: 'documentos', scrollA: null }`.

### UI

- Barra de pestañas horizontal bajo el encabezado. Pestaña activa marcada con color `azul` + borde inferior; inactivas en `acero`. Las 4 etiquetas cortas entran sin scroll horizontal en mobile. Sigue los tokens de `app/globals.css`. Íconos SVG inline opcionales (no emojis).

## Alcance / lo que NO cambia

- Cero cambios en lógica de datos, route handlers, reglas de Firestore, roles o permisos. Cada slot ya viene con su gating por rol resuelto en el server (p. ej. `DocumentForm` solo si `document:write`, `DeleteVehicleButton` solo si `vehicle:write`); las pestañas no tocan seguridad.
- No se toca la ficha pública `app/v/[token]` ni sus componentes.
- No cambia el encabezado (km, categoría, etc.).

## Testing

- **Unit test (Vitest)** del helper puro `lib/vehicles/tabs.ts` → `tabDesdeHash`:
  - Cada hash de pestaña válido (con y sin `#`).
  - `uso-abc123` → `{ tab: 'bitacora', scrollA: 'uso-abc123' }`.
  - Vacío / desconocido → `{ tab: 'documentos', scrollA: null }`.
- El resto es UI (shell de pestañas), sin tests automatizados nuevos. Verificación manual: navegación entre pestañas, atrás/adelante, recarga con hash, y el salto `#uso-{id}` desde la pill del dashboard y el email de daño.

## Verificación pre-commit

`npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (el nuevo test de `tabDesdeHash` incluido; `rules.test.ts` requiere emulador y se salta en local).
