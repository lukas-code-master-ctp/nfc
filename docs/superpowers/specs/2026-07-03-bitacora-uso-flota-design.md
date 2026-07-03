# Bitácora de uso de flota — Diseño (SP1 padrón + SP2 bitácora con fotos)

**Fecha:** 2026-07-03
**Estado:** Aprobado (diseño). Pendiente: plan de implementación.

## Contexto

La empresa piloto tiene ~50 vehículos usados por muchas personas que rotan (caso típico
de flota). Hoy no hay registro de quién usó cada vehículo: cuando uno vuelve sucio o con un
desperfecto, **nadie sabe quién fue**. Queremos una **bitácora de custodia** anclada en el
chip NFC que ya tiene cada vehículo: el conductor hace *tap → tomar* al retirar y *tap →
entregar* al devolver (con fotos), de modo que siempre se sepa quién tuvo el vehículo y en
qué estado lo dejó.

El sistema completo ("Bitácora de uso de flota") se descompone en 4 sub-proyectos. **Este
spec cubre SP1 + SP2** (el primer entregable que funciona solo y resuelve el grueso):

1. **Padrón de conductores** (SP1) — este documento.
2. **Bitácora de custodia + fotos, sin IA** (SP2) — este documento.
3. **Análisis con IA** (SP3) — fuera de alcance: lee bencina/km del tablero y evalúa
   limpieza desde las fotos, con confirmación humana.
4. **Panel de uso + alertas** (SP4) — fuera de alcance: historial rico, alertas de daño y
   de "sin entrega formal", reportes de responsabilidad.

## Objetivos

- **Padrón de conductores** liviano por empresa (nombre, RUT opcional, PIN de 4 dígitos),
  sin cuentas ni login, gestionado por el Administrador.
- **Bitácora de custodia** en la ficha pública del chip (`/v/<token>`): tomar / entregar,
  autenticado por PIN del conductor.
- En la **entrega**: 2 fotos obligatorias (tablero + cabina) + marca de daño opcional.
- **Vista básica para gestores**: historial de usos por vehículo, con miniaturas y marcas
  de daño / sin-entrega-formal.
- Enforcement server-side; la ficha pública sigue sin exponer Firestore ni datos del dueño.

## No-objetivos (SP3 / SP4)

- Análisis con IA de las fotos (bencina, km, limpieza) — SP3. El modelo `usages` **reserva**
  los campos `bencina/km/limpieza` vacíos para que SP3 los rellene sin migración.
- Panel de uso rico + alertas (daño, sin-entrega) + reportes de responsabilidad — SP4. En
  SP2 la "alerta" es una marca visible en la bitácora + un email best-effort al dueño/admin.
- Cuentas/login para conductores (se decidió: padrón + PIN, sin cuentas).
- Tope de conductores (los conductores no cuentan para el plan, que es por vehículo).

## Modelo de datos (Firestore)

### `drivers/{id}` (nuevo)
```ts
interface Driver {
  id: string
  companyId: string
  nombre: string
  rut?: string
  pinHash: string          // hash del PIN de 4 dígitos; nunca se devuelve al cliente
  activo: boolean          // permite desactivar sin borrar el historial
  createdAt: string        // ISO
  createdByUid?: string
}
```
Scopeado por `companyId`. Solo se lee/escribe **server-side** (Admin SDK).

### `usages/{id}` (nuevo)
```ts
interface VehicleUsage {
  id: string
  companyId: string
  vehicleId: string
  driverId: string
  driverNombre: string             // denormalizado (el padrón puede cambiar)
  tomadoEn: string                 // ISO
  entregadoEn: string | null
  estado: 'abierto' | 'cerrado'
  cierreForzado?: boolean          // true si lo cerró un "tomar" posterior (sin entrega)
  entregadoPorDriverId?: string    // quién hizo la entrega (puede diferir del que tomó)
  entregadoPorNombre?: string
  fotos?: { tablero?: string; cabina?: string }   // filePaths en Cloud Storage
  dano?: { hay: boolean; nota?: string; fotoPath?: string }
  // Reservados para SP3 (IA) — vacíos en SP2:
  bencina?: string
  km?: number
  limpieza?: string
  createdAt: string                // ISO
}
```
**Invariante:** a lo más **un `usage` `abierto`** por `vehicleId`.

## Identidad y PIN

- El **Administrador** gestiona el padrón (nuevo `Action` `driver:manage` en
  `lib/auth/roles.ts`, solo rol `admin`). Editor/Visor no gestionan el padrón.
- PIN de **4 dígitos**, asignado por el admin al crear el conductor (editable después),
  guardado **hasheado** (helper puro `hashPin`/`verifyPin`). El PIN nunca vuelve en ninguna
  respuesta (ni el hash).
- Selección de conductor en la ficha pública: se elige el **nombre** de una lista (el token
  ya limita quién ve la ficha; contexto de flota → exponer nombres es aceptable).

## Flujo en la ficha pública (`/v/<token>`, sin login)

Se agrega, arriba de las pestañas actuales (Documentación / Sobre el vehículo), un **banner
de estado + acción**:

- **Disponible** → botón **"Tomar vehículo"**:
  1. Elegir conductor del padrón + ingresar PIN.
  2. Confirmar → se crea un `usage` `abierto` (`tomadoEn = now`). Estado pasa a *En uso por X*.
- **En uso por X desde HH:MM** → botón **"Entregar vehículo"**:
  1. Cualquier conductor del padrón confirma con su PIN (queda como `entregadoPor*`).
  2. Sube **foto del tablero** (obligatoria) + **foto de cabina** (obligatoria).
  3. Opcional: marca **daño** (`dano.hay = true`) con nota y/o foto.
  4. Confirmar → el `usage` abierto pasa a `cerrado` (`entregadoEn = now`), con las fotos.
- **Colisión** (tomar un vehículo que ya tiene un `usage` abierto):
  - Se toma igual: el `usage` anterior se cierra con `estado='cerrado'`,
    `cierreForzado=true`, sin `entregadoEn`/fotos.
  - Se **avisa al admin**: marca visible en la bitácora (badge "Sin entrega formal") **y**
    email best-effort al dueño/admin (`sendUsageAlertEmail`, no rompe si Resend falla).
  - Luego se abre el `usage` nuevo del conductor que tomó.

Atribución: el uso siempre se atribuye a quien lo **tomó** (`driverId`), aunque otro haga la
entrega.

## Fotos y storage

Reutiliza el patrón existente (`lib/storage/signedUrls.ts`, Cloud Storage con CORS ya
configurado). El endpoint público de subida valida el PIN server-side **antes** de emitir la
signed URL; el cliente sube directo a Storage y el path se guarda en el `usage`. Las
miniaturas/enlaces de lectura para los gestores se resuelven con `createReadUrl` (como los
documentos).

## Endpoints

### Públicos (token + PIN; sin sesión)
- `GET  /api/v/[token]/estado` → `{ estado: 'disponible'|'en_uso', uso?: { driverNombre, tomadoEn }, conductores: [{ id, nombre }] }` (lista del padrón activo para el selector; sin PIN ni datos del dueño).
- `POST /api/v/[token]/tomar` `{ driverId, pin }` → valida PIN; si hay uso abierto lo fuerza-cierra + notifica; abre el nuevo. `200 { ok }` | `401` PIN inválido | `429` bloqueado.
- `POST /api/v/[token]/upload-url` `{ driverId, pin, tipo: 'tablero'|'cabina'|'dano' }` → valida PIN; devuelve `{ uploadUrl, filePath }`.
- `POST /api/v/[token]/entregar` `{ driverId, pin, fotos: { tablero, cabina }, dano? }` → valida PIN; exige las 2 fotos; cierra el uso abierto. `200 { ok }` | `400` faltan fotos | `401` | `409` no hay uso abierto.

### Autenticados (gestores)
- `GET/POST/PATCH/DELETE /api/conductores[/[id]]` — CRUD del padrón. Todos exigen
  `getMembership()` + `can(role, 'driver:manage')` (admin). PATCH permite cambiar
  nombre/rut/activo y **resetear PIN**. GET devuelve la lista **sin** `pinHash`.
- Historial de usos: server-side en la página del vehículo vía `listUsages(vehicleId)`
  (lectura para cualquier rol miembro de la empresa). No requiere endpoint nuevo si se
  resuelve en el server component; si se necesita refresco en cliente, `GET
  /api/vehicles/[id]/usos`.

## UI

- **Ficha pública** (`components/PublicVehicleView.tsx`): banner de estado + botones
  Tomar/Entregar + los modales/pasos (selector de conductor, PIN, captura de fotos, daño).
- **Página del vehículo** (`app/(app)/vehiculos/[id]`): nueva sección **"Bitácora de uso"**
  (lectura para todo rol) — línea de tiempo de usos con conductor, tomó/entregó, miniaturas
  de las 2 fotos, badges de **daño** y **"sin entrega formal"**.
- **Configuración** (`app/(app)/configuracion`): nueva tarjeta **"Conductores"** (solo
  Administrador, junto a Equipo) — CRUD del padrón: alta (nombre, RUT, PIN), editar,
  activar/desactivar, resetear PIN.

## Seguridad

- **PIN hasheado**; nunca se devuelve. Verificación server-side.
- **Anti-fuerza-bruta**: 4 dígitos = 10.000 combinaciones. Contador de intentos fallidos por
  conductor con **bloqueo temporal** (**5 intentos fallidos → bloqueo de 15 minutos**),
  persistido en el doc del conductor (`intentosFallidos`, `bloqueadoHasta`); un PIN correcto
  resetea el contador. El atacante debe acertar **nombre + PIN**.
- El **camino de escritura público** (tomar/entregar/upload-url) solo procede tras validar
  el PIN server-side y resolver el vehículo/empresa por el token; la ficha sigue sin exponer
  Firestore ni datos del dueño.
- Toda mutación autenticada valida `getMembership()` + `can(role, 'driver:manage')`; nunca
  confía en `companyId`/`role` del cliente.
- **`firestore.rules`**: `drivers` y `usages` → `allow read, write: if false` (solo Admin
  SDK; el cliente nunca los consulta directo). Defensa en profundidad.

## Testing

- **Puro (Vitest):**
  - `hashPin`/`verifyPin` (hash distinto del PIN; verify true/false; formato 4 dígitos).
  - Lógica de "abrir uso": si hay uno abierto, se cierra con `cierreForzado` y se abre el
    nuevo; si no, solo se abre.
  - Validación de entrega: exige `fotos.tablero` y `fotos.cabina`.
  - Lógica de bloqueo por intentos (cuenta/reset/bloqueo).
- **Integración (mock Admin SDK):**
  - CRUD `/api/conductores` con permisos (403 no-admin), sin filtrar `pinHash`.
  - `tomar`/`entregar`: PIN válido/ inválido (401), colisión (fuerza cierre + flag +
    intento de notificación), scoping por `companyId`.
  - `upload-url`: 401 sin PIN válido.

## Superficies afectadas

- **`lib/types.ts`**: `Driver`, `VehicleUsage`.
- **`lib/auth/roles.ts`**: nuevo `Action` `driver:manage` (solo `admin`).
- **`lib/drivers/pin.ts`** (nuevo, puro): `hashPin`, `verifyPin`, validación de formato,
  lógica de intentos/bloqueo.
- **`lib/data/drivers.ts`** (nuevo): CRUD padrón + verificación de PIN + intentos/bloqueo.
- **`lib/data/usages.ts`** (nuevo): `openUsage` (con fuerza-cierre), `closeUsage`,
  `getOpenUsage(vehicleId)`, `listUsages(vehicleId)`.
- **`lib/email/usageAlertEmail.ts`** (nuevo, puro) + `sendUsageAlertEmail` en `resend.ts`
  (best-effort): aviso de "sin entrega formal".
- **`app/api/v/[token]/{estado,tomar,entregar,upload-url}/route.ts`** (públicos).
- **`app/api/conductores/route.ts`** + `app/api/conductores/[id]/route.ts` (autenticados).
- **`components/PublicVehicleView.tsx`**: banner + flujos tomar/entregar (nuevos
  sub-componentes cliente para el flujo de PIN/fotos).
- **`components/vehicle/BitacoraUso.tsx`** (nuevo): historial en la página del vehículo.
- **`components/drivers/DriversCard.tsx`** (nuevo): CRUD del padrón en Configuración.
- **`firestore.rules`**: bloquear `drivers` y `usages` al cliente.

## Riesgos / cuidados

- **Camino de escritura público nuevo**: la ficha pasa de solo-lectura a permitir escritura
  (gated por PIN). Cuidar validación estricta del token→empresa y del PIN antes de cualquier
  efecto; rate-limit obligatorio.
- **Subida de fotos desde la ficha pública** (sin sesión): las signed URLs de subida deben
  emitirse solo tras validar PIN; el path se genera server-side (no confiar en el cliente).
- **Colisión / usos abiertos colgados**: el modelo tolera "sin entrega formal"; asegurar que
  el invariante "≤1 abierto por vehículo" se mantenga al fuerza-cerrar.
- **Denormalización de `driverNombre`**: si el padrón cambia, el historial conserva el
  nombre del momento (correcto para trazabilidad).
- **Reglas Firestore**: recordar desplegarlas (`scripts/deploy-firestore-rules.mjs`) en el
  cutover.
- No confundir `driver:manage` (gestión del padrón, admin de empresa) con el admin de
  plataforma (`ADMIN_EMAILS`).
