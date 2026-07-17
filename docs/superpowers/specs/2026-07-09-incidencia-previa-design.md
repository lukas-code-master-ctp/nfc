# Incidencia previa (daño preexistente)

**Fecha:** 2026-07-09
**Estado:** Aprobado, listo para plan de implementación
**Sprint:** 3/3

## Objetivo

Que un **conductor** pueda reportar un daño **preexistente** de un vehículo al
tomarlo (para que al entregar no lo culpen), y que un **administrador** pueda
**marcar un vehículo como dañado** (con foto/comentario) para que quien vaya a
tomarlo lo vea antes y no lo re-reporte. El admin puede **desmarcarlo**.

## Decisiones (del brainstorming)

- El reporte del conductor va **integrado en la acción de tomar** (no hay reporte
  sin tomar).
- Cuando un **conductor** reporta, se avisa a la empresa: **pill en el dashboard**
  (desde el estado del vehículo) **+ email**. El marcado del **admin** no manda
  email (lo hizo el admin).
- Estado persistente: **un** daño activo por vehículo (el reporte más reciente
  reemplaza; la foto anterior se borra). Lo limpia el admin al desmarcar.
- Foto y comentario son opcionales en ambos casos y **visibles** para quien va a
  tomar el vehículo (banner en la ficha pública).

## Modelo de datos

- `lib/types.ts`:
  ```typescript
  export interface DanoActivo {
    nota: string | null
    fotoPath: string | null
    reportadoPor: 'admin' | 'conductor'
    reportadoPorNombre: string | null // nombre del conductor; null si lo marcó el admin
    reportadoEn: string // ISO
  }
  ```
  `Vehicle` gana `danoActivo?: DanoActivo | null` (denormalizado en `vehicles/{id}`).
- **Distinto** del daño de entrega (`usages.dano` + `alertas` tipo `dano`): aquel
  es por-uso y se revisa con `RevisarDanoButton`; este es un **estado del vehículo**
  que el admin marca/desmarca. Pueden coexistir.
- Foto en Storage: `vehicles/{vehicleId}/dano/{nanoid}-foto` (path propio, distinto
  de `/usages/`), vía `createDanoUrl` en `lib/storage/signedUrls.ts`.

## Lógica pura

- `lib/usages/danoActivo.ts` (nuevo, puro, testeable): `buildDanoActivo(input:
  { nota?: string | null; fotoPath?: string | null }, reportadoPor: 'admin' |
  'conductor', reportadoPorNombre: string | null, ahoraISO: string): DanoActivo`
  — arma el objeto **sin claves `undefined`** (Firestore las rechaza), normaliza
  `nota`/`fotoPath` a `string | null` (trim, tope 500 en nota).

## Data layer (`lib/data/vehicles.ts`)

- `toVehicle` mapea `danoActivo: data.danoActivo ?? null`.
- `setDanoActivo(vehicleId, companyId, dano: DanoActivo): Promise<void>` — valida
  `companyId`; si el vehículo ya tenía `danoActivo.fotoPath` **distinta**, borra la
  foto anterior de Storage (`ignoreNotFound`); escribe `danoActivo`.
- `clearDanoActivo(vehicleId, companyId): Promise<void>` — valida `companyId`;
  borra la foto (`ignoreNotFound`) y setea `danoActivo: null`.
- `deleteVehicle`: en la cascada, borra `danoActivo.fotoPath` si existe (sin
  huérfanos; consistente con documentos/usos/mantenciones). `deleteCompanyCascade`
  ya cascadea por `deleteVehicle`.

## Endpoints (`/api/*`, validan `getMembership()`/PIN + rol; `companyId` del server)

### Admin (autenticado)
- `POST /api/vehicles/[id]/dano` — `vehicle:write`. Body `{ nota?, fotoPath? }` →
  `setDanoActivo` con `reportadoPor: 'admin'`, `reportadoPorNombre: null`.
- `DELETE /api/vehicles/[id]/dano` — `vehicle:write` → `clearDanoActivo`.
- `POST /api/vehicles/[id]/dano/upload-url` — `vehicle:write`; valida vehículo→empresa;
  devuelve signed URL vía `createDanoUrl`.

### Público (ficha, PIN del conductor)
- `POST /api/v/[token]/upload-url` — **extender**: aceptar `tipo: 'incidencia'`, que
  **no** exige uso abierto (a diferencia de `tablero`/`cabina`), y usa `createDanoUrl`.
  `tablero`/`cabina`/`dano` siguen igual (con uso abierto).
- `POST /api/v/[token]/tomar` — **extender**: aceptar `dano?: { nota?, fotoPath? }`
  opcional. Si viene, tras abrir el uso, `setDanoActivo(reportadoPor: 'conductor',
  reportadoPorNombre: driver.nombre)` (best-effort), y dispara el email a la empresa
  (post-respuesta con `after()`, best-effort). El resto del flujo de tomar intacto.

## UI

### Ficha pública (`components/PublicVehicleView.tsx`)
- Si `vehicle.danoActivo`: **banner de aviso** arriba (ámbar/rojo suave) con
  "⚠ Este vehículo tiene un daño reportado", el comentario, y la foto (thumbnail
  clickeable si hay). El banner se ve en el menú y al entrar a "Tomar".
- La página `app/v/[token]/page.tsx` genera el signed read URL de
  `danoActivo.fotoPath` y lo pasa al componente.

### Tomar (`components/uso/UsoPanel.tsx`)
- En el formulario "tomar": checkbox "Este vehículo ya tiene un daño (repórtalo)"
  → al activarlo, campo de comentario + input de foto (opcional). Al confirmar:
  si hay foto, sube por `upload-url` tipo `incidencia`, luego `POST tomar` con
  `dano: { nota, fotoPath }`. Sin daño reportado, el flujo es idéntico al actual.

### Ficha del vehículo (`components/vehicle/DanoActivoPanel.tsx`, nuevo)
- Muestra el estado actual (con quién lo reportó y cuándo, comentario, foto).
- **Admin** (`vehicle:write`): "Marcar como dañado" (comentario + foto opcional →
  `dano/upload-url` + `POST /dano`) y "Desmarcar" (`DELETE /dano`). Editor/Visor:
  solo lectura del estado. Se renderiza en `app/(app)/vehiculos/[id]/page.tsx`.

### Dashboard (`components/VehicleCard.tsx` + `VehiclesBoard.tsx` + `dashboard/page.tsx`)
- `VehicleCard` muestra una **pill "Dañado"** (roja) cuando `vehicle.danoActivo`
  (distinta de la pill "Daño reportado" de la entrega). Click en la card → ficha
  del vehículo. El `Item` del board gana `danoActivo: boolean`; la página lo pasa.

## Email (`lib/email/incidenciaEmail.ts` + `sendIncidenciaEmail` en `resend.ts`)

- Solo cuando un **conductor** reporta al tomar. Brandeado (`emailLayout`/`ctaButton`/
  `appUrl`), asunto "TapCar · Daño reportado al tomar — {patente}", CTA "Ver el
  vehículo" → `/vehiculos/{id}`. A los destinatarios `alertRecipientEmails`.
  Best-effort (no rompe la toma).

## Fuera de alcance

- Historial de incidencias (se guarda solo el daño activo vigente; el reemplazo no
  archiva el anterior). v2 si se quiere un log.
- Reportar daño **sin** tomar el vehículo (se decidió integrado al tomar).
- Flujo de "revisado por" como el daño de entrega (aquí el admin simplemente
  desmarca cuando se resuelve).

## Testing

- **Unit** (`lib/usages/danoActivo.ts`): `buildDanoActivo` — sin claves undefined;
  normaliza nota (trim, tope 500) y fotoPath a null; setea `reportadoPor`/`reportadoPorNombre`/`reportadoEn`.
- **Data** (`lib/data/vehicles.ts`, mocks admin): `setDanoActivo` borra la foto
  anterior al reemplazar y valida `companyId`; `clearDanoActivo` borra foto + setea null;
  `deleteVehicle` borra `danoActivo.fotoPath`.
- **Endpoints/UI**: tsc + eslint + build (tras login/PIN; no manejable en preview).

## Criterios de aceptación

1. Un conductor, al tomar, puede marcar "este vehículo ya tiene un daño" con
   comentario y foto opcionales; queda registrado en el vehículo sin culpar a nadie.
2. Tras ese reporte, la empresa ve una **pill "Dañado"** en el dashboard y recibe un
   **email**.
3. Quien luego abra la ficha pública para tomar el vehículo ve un **banner** con el
   daño reportado (comentario + foto) antes de tomar.
4. Un admin puede **marcar** un vehículo como dañado (comentario + foto) desde la ficha
   y **desmarcarlo**; el marcado del admin no manda email.
5. Al desmarcar (o al reemplazar por un nuevo reporte, o al borrar el vehículo) la foto
   anterior no queda huérfana en Storage.
6. El daño de entrega (`usages.dano`) y su flujo de "revisado" siguen intactos y son
   independientes de este estado.
