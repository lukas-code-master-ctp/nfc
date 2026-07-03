# Bitácora de uso — SP4a: Panel de flota + alertas accionables — Diseño

**Fecha:** 2026-07-03
**Estado:** Aprobado (diseño). Pendiente: plan de implementación.

## Contexto

La bitácora de uso (SP1–SP3, en producción) registra por vehículo quién lo usó, en qué
estado lo dejó (fotos + IA), y marca daños y "sin entrega formal" como badges dentro de la
página de cada vehículo. Falta una **vista transversal de la flota** y una forma de **atender**
esas alertas para que no se pierdan entre vehículos.

SP4 se descompone en dos sub-proyectos; **este spec cubre SP4a** (operativo). **SP4b**
(reportes: responsabilidad por conductor + bitácora de flota filtrable/paginada) queda fuera
de alcance — ahí viven la agregación histórica, los índices compuestos y la paginación.

## Objetivos

- **Página `/flota`**: estado en vivo de todos los vehículos (disponible / en uso por quién,
  desde cuándo) + banderas de alertas abiertas.
- **Bandeja de alertas accionable**: lista de daños + "sin entrega formal" pendientes, con
  acción **"marcar como atendida"**.
- **Diseño acotado**: el panel NO carga el historial de usos; se arma con datos denormalizados
  y una colección de alertas que solo contiene las abiertas.
- Enforcement server-side; el padrón/plan no cambian.

## No-objetivos (SP4b)

- Responsabilidad por conductor (agregación sobre todo el historial).
- Bitácora de flota filtrable/paginada.
- Auditoría de quién atendió cada alerta (se decidió: atender = borrar; el `usage` conserva
  el daño/marca como historial).

## Modelo de datos (Firestore)

### `alertas/{id}` (nueva colección) — solo alertas ABIERTAS
```ts
interface Alerta {
  id: string
  companyId: string
  vehicleId: string
  patente: string          // denormalizado (para la bandeja, sin leer el vehículo)
  usageId: string          // el uso que la originó
  tipo: 'dano' | 'sin_entrega'
  driverNombre: string     // quién lo tenía / lo dejó así
  nota?: string            // para 'dano': la nota del conductor
  creadaEn: string         // ISO
}
```
Se **crea** al ocurrir el evento y se **borra** al marcarla atendida. Como las atendidas se
eliminan, `alertas where companyId == X` es **de un solo campo y siempre chica** (no crece con
el historial). Solo server-side (Admin SDK); bloqueada al cliente en `firestore.rules`.

### `vehicles/{id}` (modificado) — estado en vivo denormalizado
```ts
usoActual?: { driverId: string; driverNombre: string; tomadoEn: string } | null
```
- `openUsage` lo **setea** al tomar; `closeUsage` lo **limpia** (`null`) al entregar.
- El panel lee solo `listVehicles(companyId)` (≈50 docs) para el estado — sin tocar `usages`.

## Página `/flota` (nueva, en la barra superior)

Ruta autenticada `app/(app)/flota/page.tsx` (server component). La **ven todos los miembros**
(lectura). Dos secciones:

1. **Grilla de flota** — por vehículo: patente + marca/modelo; estado **Disponible** o
   **En uso por {driverNombre} desde {HH:MM}** (de `usoActual`); y **banderas** si tiene
   alertas abiertas (daño / sin-entrega). Clic en un vehículo → su página (`/vehiculos/[id]`).
2. **Pendientes** (bandeja) — lista de `alertas` abiertas: patente, tipo, conductor, nota,
   cuándo; cada una con botón **"Marcar como atendida"** (visible solo si el rol puede).

Enlace **"Flota"** en la barra superior (`app/(app)/layout.tsx`), junto a los existentes.

## Acción "atender"

- `DELETE /api/alertas/[id]` → `getMembership()` + `can(role, 'document:write')` (Editor y
  Administrador atienden; el **Visor** solo ve → 403). Valida que la alerta pertenezca al
  `companyId` del actor (403 cross-company). Borra la alerta; el `usage` no se toca (conserva
  `dano`/`cierreForzado` en la bitácora del vehículo).

## Creación de alertas

- **sin_entrega**: en `POST /api/v/[token]/tomar`, cuando `openUsage` fuerza-cierra un uso
  anterior (`forced != null`) — junto al email best-effort que ya existe — crear una `Alerta`
  `tipo: 'sin_entrega'` (usageId = `forced.id`, driverNombre = `forced.driverNombre`).
- **dano**: en `POST /api/v/[token]/entregar`, si `dano.hay`, crear una `Alerta` `tipo: 'dano'`
  (usageId = el uso cerrado, `nota` = `dano.nota`). `closeUsage` ya devuelve el id del uso.
- Ambas creaciones son **best-effort** (try/catch): no deben romper el flujo del conductor.

## Roles / visibilidad

- **Panel `/flota`**: lo ven todos los miembros de la empresa (lectura).
- **Atender**: `document:write` (Editor + Administrador). El Visor solo ve.
- El padrón de conductores y el plan no cambian.

## Superficies afectadas

- **`lib/types.ts`**: `Alerta`; `Vehicle` gana `usoActual?`.
- **`lib/data/usages.ts`**: `openUsage` setea `vehicles/{id}.usoActual`; `closeUsage` lo limpia.
- **`lib/data/alertas.ts`** (nuevo): `createAlerta`, `listAlertas(companyId)`,
  `deleteAlerta(companyId, id)` (valida pertenencia).
- **`lib/data/vehicles.ts`**: `toVehicle` mapea `usoActual`.
- **`app/api/v/[token]/tomar/route.ts`**: crear alerta `sin_entrega` en el forced-close.
- **`app/api/v/[token]/entregar/route.ts`**: crear alerta `dano` si corresponde.
- **`app/api/alertas/[id]/route.ts`** (nuevo): DELETE atender.
- **`app/(app)/flota/page.tsx`** (nuevo) + `components/flota/FlotaGrid.tsx` +
  `components/flota/AlertasBandeja.tsx` (+ `AtenderAlertaButton` cliente).
- **`app/(app)/layout.tsx`**: enlace "Flota".
- **`firestore.rules`**: bloquear `alertas` al cliente.

## Seguridad

- `alertas` solo server-side (Admin SDK); `firestore.rules` la niega al cliente (defensa en
  profundidad).
- `DELETE /api/alertas/[id]` valida `getMembership()` + `can(role,'document:write')` + pertenencia
  a `companyId`; nunca confía en el cliente.
- La creación de alertas en las rutas públicas ocurre **después** de la validación de PIN ya
  existente (mismo punto que el email/`closeUsage`); no agrega superficie pública nueva.
- La denormalización `usoActual` no expone datos nuevos (el panel es del app autenticado, ya
  scopeado por `companyId` vía `getMembership()`).

## Testing

- **Data (mock Admin SDK):**
  - `createAlerta` escribe los campos; `listAlertas(companyId)` (single-field); `deleteAlerta`
    valida pertenencia (throw `'forbidden'` cross-company).
  - `openUsage` setea `usoActual` en el vehículo; `closeUsage` lo limpia (`null`).
- **Integración:**
  - `DELETE /api/alertas/[id]`: 403 Visor, 403 cross-company, 200 ok.
  - `tomar` con forced-close crea la alerta `sin_entrega` (best-effort, no rompe si falla);
    `entregar` con daño crea la alerta `dano`.
- **UI:** typecheck + build; verificación manual del panel (grilla + pendientes + atender).

## Riesgos / cuidados

- **Consistencia de `usoActual`**: `openUsage` (incluido el fuerza-cierre) y `closeUsage` deben
  mantenerlo bien; un vehículo con uso abierto debe reflejar su conductor, y quedar `null` al
  entregar. Cubrir con tests.
- **Alertas best-effort**: su creación no debe tumbar el flujo del conductor (try/catch), igual
  que el email de "sin entrega".
- **Escala del panel**: acotado por diseño (vehicles + alertas abiertas). La bitácora completa
  y la agregación histórica son SP4b.
- **Reglas Firestore**: recordar desplegarlas (`scripts/deploy-firestore-rules.mjs`) en el
  cutover para bloquear `alertas`.
