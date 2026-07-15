# Pauta de mantención

**Fecha:** 2026-07-09
**Estado:** Aprobado, listo para plan de implementación
**Sprint:** 2/3 (usa el kilometraje automático del sprint 1)

## Objetivo

Que el administrador gestione la **pauta de mantención** de cada vehículo: cuándo
toca la próxima mantención (por kilometraje y/o por tiempo), con qué estado está
(al día / próxima / vencida), y que pueda **registrar** cada mantención realizada
subiendo un archivo de constancia. Con recordatorio por email y una vista de flota.

## Decisiones (del brainstorming)

- **Pauta estándar a nivel de empresa** (default para toda la flota) +
  **override por vehículo** cuando uno tenga una pauta especial.
- Criterio: **km y/o periodo**; si el vehículo tiene ambos, **lo que ocurra
  primero** marca la mantención.
- Alcance v1: ficha del vehículo + **vista de flota** + **recordatorio por email**.

## Modelo de datos

- `Company.pautaMantencion?: PautaMantencion` — default de la empresa.
- `Vehicle.pautaMantencion?: PautaMantencion | null` — override; si está, reemplaza
  el default para ese vehículo. **Pauta efectiva** = `vehicle.pautaMantencion ?? company.pautaMantencion`.
- `Vehicle.mantencionReminders?: ('proxima' | 'vencida')[]` — hitos de email ya
  enviados; se **resetea a `[]`** al registrar una mantención nueva (evita spam diario).
- `interface PautaMantencion { cadaKm?: number | null; cadaMeses?: number | null }`
  en `lib/types.ts`. Ambos opcionales; sin ninguno = sin pauta.
- **Registros** `mantenciones/{id}` (colección top-level scopeada por `companyId`):
  `{ id, companyId, vehicleId, fecha (YYYY-MM-DD), km: number | null, nota?: string | null,
  filePath?: string | null, fileUrl?: string | null, createdByUid?, createdAt (ISO) }`.
  La más reciente por `fecha` define la línea base (`ultimaKm`, `ultimaFecha`).

## Lógica pura de estado (`lib/mantencion/status.ts`, testeable, sin Firebase)

- `type EstadoMantencion = 'sin_pauta' | 'sin_registro' | 'al_dia' | 'proxima' | 'vencida'`.
- Constantes: `UMBRAL_KM_PROXIMA = 1000`, `UMBRAL_DIAS_PROXIMA = 30`.
- `addMeses(fechaISO: string, meses: number): string` — suma meses a una fecha
  `YYYY-MM-DD` (maneja overflow de fin de mes). Reutiliza `daysUntil` de
  `lib/documents/status.ts` para los días restantes (misma zona `America/Santiago`).
- `estadoMantencion(input): { estado, detalle }` donde
  `input = { pauta: PautaMantencion | null, ultima: { km: number | null; fecha: string } | null, kmActual: number | null, now: Date }`:
  - Sin `pauta` (ni `cadaKm` ni `cadaMeses`) → `sin_pauta`.
  - Con pauta pero sin `ultima` → `sin_registro`.
  - Criterio **km** (solo si `cadaKm` y `ultima.km != null` y `kmActual != null`):
    `proximaKm = ultima.km + cadaKm`; `kmRestantes = proximaKm - kmActual`.
    Estado km: `vencida` si `kmRestantes <= 0`; `proxima` si `<= UMBRAL_KM_PROXIMA`; si no `al_dia`.
  - Criterio **tiempo** (solo si `cadaMeses` y `ultima.fecha`):
    `proximaFecha = addMeses(ultima.fecha, cadaMeses)`; `diasRestantes = daysUntil(proximaFecha, now)`.
    Estado tiempo: `vencida` si `< 0`; `proxima` si `<= UMBRAL_DIAS_PROXIMA`; si no `al_dia`.
  - Estado final = **el peor** de los criterios aplicables (vencida > proxima > al_dia).
    Si ninguno es computable (ej. `cadaKm` pero `kmActual` null y sin `cadaMeses`) → `sin_registro`.
  - `detalle` devuelve `{ kmRestantes?, diasRestantes?, proximaKm?, proximaFecha? }` para la UI.
- `sanitizePauta(raw): PautaMantencion` (puro) — `cadaKm`/`cadaMeses` enteros ≥ 1 o
  `null`; descarta valores inválidos. Se aplica al persistir en empresa y vehículo.

## Data layer

- `lib/data/companies.ts`: `getCompany` devuelve `pautaMantencion` (`?? {}`),
  `saveCompany` acepta `pautaMantencion?` en el patch.
- `lib/data/vehicles.ts`: `toVehicle` mapea `pautaMantencion` + `mantencionReminders`;
  `updateVehicle` ya acepta patch parcial (se usa para el override y el reset de hitos).
- `lib/data/mantenciones.ts` (nuevo):
  - `createMantencion(companyId, createdByUid, input)` — crea el registro y **resetea**
    `vehicles/{vehicleId}.mantencionReminders = []` (best-effort).
  - `listMantenciones(vehicleId)` — historial ordenado por `fecha` desc.
  - `ultimaMantencion(vehicleId)` — la más reciente (km + fecha) o null.
  - `deleteMantencion(id, companyId)` — valida `companyId`, borra el archivo de
    Storage (`ignoreNotFound`) y el doc.
  - `mantencionPhotoPaths` / `deleteMantencionesByVehicle` / `deleteMantencionesByCompany`
    para la cascada (patrón de `usages`).
- Cascada: `deleteVehicle` → `deleteMantencionesByVehicle`; `deleteCompanyCascade`
  → `deleteMantencionesByCompany` (backstop). Sin archivos huérfanos.

## Endpoints (`/api/*`, todos validan `getMembership()` + `can(...)`, `companyId` del server)

- `PATCH /api/company` — acepta `pautaMantencion` (además de lo actual), `billing:manage`,
  saneado con `sanitizePauta`.
- `PATCH /api/vehicles/[id]` — acepta `pautaMantencion` (override o `null` para heredar),
  `vehicle:write`. **Whitelist:** el handler ya pasa el body crudo; se saneará el
  `pautaMantencion` con `sanitizePauta` antes de escribir (no confiar en el cliente).
- `POST /api/mantenciones` — crea un registro, `document:write`. `GET` (por `vehicleId`) lectura.
- `POST /api/mantenciones/upload-url` — signed URL de subida del archivo de constancia
  (`document:write`); Storage en `vehicles/{vehicleId}/mantenciones/...` vía
  `createMantencionUrl` en `lib/storage/signedUrls.ts`.
- `DELETE /api/mantenciones/[id]` — borra un registro + su archivo, `document:write`.

## UI

- **Configuración** (`components/company/PautaMantencionCard.tsx`, solo Admin, junto a
  `PlataformaCard`/`CategoriasCard`): inputs `cadaKm` y `cadaMeses` (opcionales) →
  `PATCH /api/company` con `{ pautaMantencion }` + `router.refresh()`.
- **Ficha del vehículo** (`components/vehicle/MantencionPanel.tsx`): badge de estado
  (`StatusBadge`-like) + detalle ("faltan 3.200 km" / "faltan 12 días" / "vencida hace X"
  / "sin registro" / "sin pauta"); muestra la pauta efectiva e indica si es la estándar
  o un override. Admin puede editar el override (inputs km/meses, `null` para heredar).
  Botón **"Registrar mantención"** (`document:write`): fecha (default hoy), km (default
  `kmActual`), nota, archivo (PDF/imagen) → `POST /api/mantenciones` → refresh. Historial
  de mantenciones con link a cada archivo (signed read URL) y botón borrar (`document:write`).
- **Vista de flota** (`app/(app)/mantenciones/page.tsx` + link "Mantención" en `AppNav`):
  lista los vehículos con su estado de mantención, ordenados por urgencia (vencida →
  próxima → al día → sin registro/sin pauta), con patente, pauta efectiva y el detalle.
  Lectura para todo rol. Server-side: carga vehículos (con `kmActual`+`pautaMantencion`),
  la empresa (default) y la última mantención por vehículo.

## Recordatorio por email (cron diario existente)

- `/api/cron/reminders`: además del pase de documentos, un pase de mantención. Por cada
  vehículo con pauta cuyo estado sea `proxima` o `vencida` y cuyo hito **no** esté en
  `mantencionReminders`, enviar email (plantilla `lib/email/mantencionEmail.ts`, brandeada,
  CTA a `/vehiculos/{id}`) a los destinatarios (`alertRecipientEmails`), y agregar el hito
  a `mantencionReminders`. Reset de hitos al registrar una mantención (ya en `createMantencion`).
- Lógica pura reutilizable (qué hito toca) testeable, al estilo `lib/documents/reminders.ts`.

## Fuera de alcance

- Pauta con múltiples ítems (ej. "aceite cada 10k, correa cada 60k"): v1 es **una** pauta
  por vehículo (km y/o tiempo). Ítems múltiples = v2.
- Señal de mantención en la card del dashboard (la vista de flota cubre el overview).
- Historial/log de cambios de la pauta.

## Testing

- **Unit** (`lib/mantencion/status.ts`): `estadoMantencion` — sin_pauta; sin_registro;
  km vencida/próxima/al_dia; tiempo vencida/próxima/al_dia; "lo que ocurra primero" (peor
  criterio gana); km no computable por `kmActual` null cae a tiempo; `addMeses` (overflow
  fin de mes); `sanitizePauta` (enteros ≥1, descarta inválidos).
- **Data** (`lib/data/mantenciones.ts`, mocks admin): create resetea hitos; delete borra
  archivo+doc; cascada borra por vehículo/empresa.
- **Cron** (pase de mantención, deps inyectadas): envía sólo hitos nuevos; dedup vía
  `mantencionReminders`.
- **Verificación estática:** tsc + eslint + build (UI tras login, no manejable en preview).

## Criterios de aceptación

1. El Admin configura la pauta estándar de la empresa (km y/o meses) en Configuración.
2. Un vehículo hereda la pauta estándar; el Admin puede darle un override propio.
3. La ficha muestra el estado (al día/próxima/vencida/sin registro/sin pauta) con el detalle
   de km o días restantes, según lo que ocurra primero.
4. Editor/Admin registran una mantención (fecha, km, nota, archivo); queda en el historial y
   resetea la línea base (el estado vuelve a "al día") y los hitos de email.
5. La vista de flota lista todos los vehículos ordenados por urgencia de mantención.
6. El cron envía email cuando una mantención pasa a próxima o vencida, una vez por hito.
7. Borrar un vehículo/empresa no deja registros ni archivos de mantención huérfanos.
