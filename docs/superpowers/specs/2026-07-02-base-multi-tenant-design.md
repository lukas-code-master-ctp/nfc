# Base multi-tenant (equipo por empresa) — Diseño

**Fecha:** 2026-07-02
**Estado:** Aprobado (diseño). Pendiente: plan de implementación.

## Contexto

Hoy en TapCar los vehículos y documentos pertenecen a **una persona** (`ownerUid`), y `CompanyData` + `plan` viven en `users/{uid}`. Se pidió **multi-usuario por empresa**: invitar personas al equipo (máx. 5), con roles, y elegir qué miembros reciben las alertas por email.

Eso es un cambio de modelo (multi-tenant). Se descompone en 3 sub-proyectos; **este spec cubre solo el 1 (Base multi-tenant)**, que es la fundación de los otros dos:

1. **Base multi-tenant** ← este documento.
2. Invitaciones por email (máx. 5 miembros).
3. Configuración de qué miembros reciben alertas + adaptar el job de recordatorios.

## Objetivos

- Entidad **empresa** (`companies/{companyId}`).
- `users/{uid}` gana `companyId` + `role` (`admin` | `editor` | `viewer`).
- Flota, documentos, facturación y datos de empresa pasan a ser **de la empresa** (compartidos por el equipo).
- **Permisos por rol** enforced en la capa `/api`.
- **Migración** de los datos actuales (una vez, con Admin SDK).
- Mover **Datos de la empresa** de Perfil a Configuración.

## No-objetivos (sub-proyectos posteriores)

- Invitaciones por email y el flujo de aceptar (sub-2). En esta base, el único miembro de cada empresa es su Administrador (creado por migración/registro).
- Elegir qué miembros reciben alertas y cambiar el job de recordatorios (sub-3). **Por ahora los recordatorios siguen yendo al Administrador/owner de la empresa.**
- Multi-empresa por usuario (se decidió: una empresa por usuario).
- Autoservicio de cupo: el `maxVehiculos` lo sigue fijando el admin de plataforma (modelo concierge).

## Modelo de datos (Firestore)

### `companies/{companyId}` (nuevo)
```ts
interface Company {
  id: string
  ownerUid: string          // quién la creó (Administrador inicial)
  company: CompanyData      // razón social, RUT, giro, dirección, teléfono (movido desde el perfil)
  plan: PlanData            // { maxVehiculos }  (movido desde el perfil)
  createdAt: string         // ISO
}
```

### `users/{uid}` (modificado)
```ts
interface UserProfile {
  email: string
  displayName: string
  companyId: string                       // NUEVO
  role: 'admin' | 'editor' | 'viewer'     // NUEVO
  createdAt: string | null
  // se ELIMINAN: company (→ Company), plan (→ Company)
}
```

### `vehicles/{id}` y `documents/{id}` (modificado)
- La clave de acceso pasa de `ownerUid` → **`companyId`**.
- Se agrega `createdByUid` (auditoría: quién lo creó). `ownerUid` se elimina del modelo lógico tras la migración.
- El resto de campos igual (incluido `info?` en vehicles, `publicToken`, etc.).

## Roles y permisos

Lógica **pura y testeable** en `lib/auth/roles.ts`:

```ts
type Role = 'admin' | 'editor' | 'viewer'
type Action =
  | 'read'
  | 'document:write'      // crear / editar / eliminar documentos
  | 'vehicle:write'       // crear / eliminar vehículos, editar info del vehículo
  | 'billing:manage'      // ver plan, enviar solicitudes, editar datos de empresa
  | 'team:manage'         // cambiar roles de otros (sub-2: invitar)
export function can(role: Role, action: Action): boolean
```

| Acción | Visor | Editor | Administrador |
|---|:---:|:---:|:---:|
| `read` (ver flota y documentos) | ✅ | ✅ | ✅ |
| `document:write` | ❌ | ✅ | ✅ |
| `vehicle:write` | ❌ | ❌ | ✅ |
| `billing:manage` (incluye editar datos de empresa) | ❌ | ❌ | ✅ |
| `team:manage` | ❌ | ❌ | ✅ |

**Enforcement (capa `/api`, no se confía en el cliente):**
- Helper `getMembership()` en `lib/auth/session.ts` (o `membership.ts`): desde la cookie de sesión resuelve `{ uid, email, companyId, role }` leyendo `users/{uid}`. Devuelve `null` si no hay sesión o el usuario no tiene empresa.
- Cada route handler privado: valida `getMembership()` y `can(role, <acción>)` antes de mutar; responde `403` si no.
- Toda query de datos (`lib/data/*`) se scopea por `companyId` (no por `uid`). Las mutaciones validan que el recurso pertenezca al `companyId` del actor.

**Invariante:** los roles no se auto-escalan; solo un Administrador cambia roles (la UI de equipo llega en sub-2).

## Superficies afectadas

- **`lib/types.ts`**: `Company`, `Role`; `UserProfile` gana `companyId`/`role` y pierde `company`/`plan`; `Vehicle`/`VehicleDocument` cambian `ownerUid` → `companyId` (+ `createdByUid`).
- **`lib/data/`**: `vehicles.ts`, `documents.ts` scopean por `companyId`; `profile.ts` deja de manejar company/plan; nuevo `companies.ts` (get/save company, plan). `admin.ts` pasa a listar **empresas** (no usuarios) con su cupo y conteo de vehículos. `billing.ts` referencia `companyId`.
- **`lib/auth/`**: `roles.ts` (nuevo, puro), `getMembership()`.
- **`lib/plan.ts` / `lib/billing.ts`**: `maxVehiculos` se lee de la empresa; enforcement de cupo por empresa.
- **`app/api/*`**: vehicles, documents, profile, account, billing/request, admin/*, cron/reminders → migran a membership + permisos por rol. Editar `datos de empresa` = `billing:manage` (solo admin).
- **Páginas**: dashboard, `vehiculos/[id]` (acciones según rol: editar docs = editor+, eliminar auto/editar info = admin), **`configuracion`** (Datos de empresa, solo admin), **`perfil`** (pierde Datos de empresa), **`facturacion`** (por empresa, solo admin gestiona), **`admin`** de plataforma (por empresa).
- **`firestore.rules`**: pasar de `ownerUid == request.auth.uid` a acceso por `companyId` (defensa en profundidad; el enforcement real es la API, que usa Admin SDK).
- **Recordatorios** (`lib/data/vehicles.ts` → `vehicleInfoForReminder`, `runReminders`): resolver el email destino vía la empresa (Administrador/owner) en vez de `ownerUid`. La selección de destinatarios es sub-3.

## Migración (una vez, script con Admin SDK contra producción)

Por cada `users/{uid}` existente:
1. Crear `companies/{companyId}` con su `company` (CompanyData) + `plan` actuales + `ownerUid = uid`.
2. Setear `users/{uid}.companyId = companyId`, `role = 'admin'`; borrar `company`/`plan` del user doc.
3. Estampar `companyId` en todos sus `vehicles` y `documents` (donde `ownerUid == uid`), agregando `createdByUid = uid`.

El script es **idempotente** (si el user ya tiene `companyId`, se salta). Se corre **antes** de desplegar el código que lee `companyId`. Alternativa de transición: el código lee `companyId` con fallback a `ownerUid` durante la ventana de migración (se decide en el plan).

## Seguridad

- Enforcement primario: capa `/api` (membership + `can()`), igual patrón que hoy (nunca confía en el cliente).
- `firestore.rules`: actualizar a scope por `companyId` como backstop. El cliente no consulta Firestore de la flota directamente (todo vía Admin SDK), así que las reglas son defensa en profundidad.
- La ficha pública (`/v/<token>`) **no cambia**: resuelve por token en el servidor, sin exponer la empresa ni el dueño.

## Testing

- **Unit (puro):** `lib/auth/roles.ts` → `can(role, action)` para las 9 combinaciones clave.
- **Unit:** `lib/plan.ts` / cupo por empresa.
- **Integración (mock Admin SDK):** que las queries scopeen por `companyId` y que las mutaciones rechacen recursos de otra empresa / roles insuficientes (403).
- Los tests de reglas (emulador) se actualizan al nuevo scope.

## Riesgos / cuidados

- **Migración sobre datos reales de producción** (la cuenta del usuario ya tiene vehículos). Correr con cuidado, idempotente, y validar conteos antes/después.
- **Toca casi todas las queries y endpoints** → hacerlo por capas con typecheck/build entre pasos.
- Distinguir siempre **admin de empresa** (rol `admin`) del **admin de plataforma** (`ADMIN_EMAILS`) — no confundir en el código ni en la UI.
- El panel `/admin` de plataforma cambia de "por usuario" a "por empresa" (afecta `listAllUsers`, la tabla y el PATCH de cupo).
