# Invitaciones por email y gestión de equipo (sub-proyecto 2) — Diseño

**Fecha:** 2026-07-03
**Estado:** Aprobado (diseño). Pendiente: plan de implementación.

## Contexto

La **base multi-tenant** (sub-proyecto 1, ya desplegada) dejó cada empresa con un único
miembro: su Administrador (creado por migración o por el provisioning del primer login).
Este sub-proyecto agrega **sumar personas al equipo**: invitar por correo con un rol,
gestionar los miembros y las invitaciones pendientes. Tope de **5 miembros por empresa**.

Sigue pendiente para el **sub-proyecto 3**: elegir qué miembros reciben las alertas de
vencimiento + adaptar el job de recordatorios. **Por ahora los recordatorios siguen yendo
al Administrador/dueño de la empresa** (sin cambios en esa ruta).

## Objetivos

- Colección **`invitations/{id}`** para invitaciones por correo con rol y expiración.
- **Auto-unir al entrar**: quien fue invitado se une a la empresa que lo invitó (con su
  rol) en vez de crear una empresa propia, aunque no haga clic en el enlace del correo.
- **Panel de equipo** en Configuración (solo Administrador): invitar, ver/cancelar
  invitaciones pendientes, cambiar rol de un miembro, quitar un miembro.
- Enforcement de todo en la capa `/api` (`getMembership()` + `can(role, 'team:manage')`).

## No-objetivos

- Elegir qué miembros reciben alertas + cambiar el job de recordatorios (sub-proyecto 3).
- Multi-empresa por usuario (sigue: **una empresa por usuario**).
- Mover un usuario que **ya pertenece a otra empresa** a la tuya (se **rechaza** al invitar,
  para no huérfanar sus datos). Las invitaciones son para personas sin empresa aún.
- Autoservicio de cupo de vehículos (lo sigue fijando el admin de plataforma).

## Modelo de datos (Firestore)

### `invitations/{id}` (nueva colección)
```ts
interface Invitation {
  id: string
  companyId: string
  email: string            // normalizado a minúsculas / trim
  role: 'admin' | 'editor' | 'viewer'
  token: string            // opaco, para el enlace del correo
  status: 'pending' | 'accepted' | 'revoked'
  invitedByUid: string
  createdAt: string        // ISO
  expiresAt: string        // ISO = createdAt + 7 días
  acceptedByUid?: string   // seteado al aceptar
  acceptedAt?: string      // ISO, al aceptar
}
```

Solo se lee/escribe **server-side** (Admin SDK). El cliente nunca la toca.

### Miembros
No hay colección nueva para miembros: se resuelven con `users where companyId == X`.
Cada `users/{uid}` ya tiene `email`, `displayName`, `companyId`, `role`. Si a algún doc
migrado le falta `email`, se resuelve desde Firebase Auth por `uid` (igual que hace hoy el
panel de plataforma para el correo del dueño).

### Tope de 5
`miembros activos + invitaciones pendientes (no expiradas) ≤ 5`. Se valida al crear
invitación. Lógica pura: `teamCapacity(activos, pendientes)` / `canInvite(...)`.

## Flujo de invitación (pieza clave: auto-unir al entrar)

`ensureProvisioned(uid, email)` (en `lib/data/companies.ts`) gana un paso intermedio:

1. Si `users/{uid}.companyId` existe → return *(sin cambios; ya provisionado/migrado)*.
2. **NUEVO:** buscar una invitación `status == 'pending'` **no expirada** cuyo `email`
   coincida (minúsculas). Si existe:
   - Setear `users/{uid} = { email, displayName?: '', companyId: inv.companyId, role: inv.role, createdAt }`.
   - Marcar la invitación `status: 'accepted'`, `acceptedByUid: uid`, `acceptedAt`.
   - Return.
   - Si hay varias pendientes para el mismo correo (raro), tomar la más reciente no expirada.
3. Si no hay invitación → crear su propia empresa como `admin` *(comportamiento actual)*.

Consecuencias:
- El **auto-unir no depende del enlace**: basta con que la persona entre con ese correo
  (Google o correo/contraseña). El enlace del email es comodidad, no requisito.
- Una **cuenta nueva** invitada se une a la empresa en vez de crear una propia.
- El token del enlace permite una **landing/banner opcional** ("Te invitaron a *Empresa X*
  como *Editor*") antes de iniciar sesión, vía `GET /api/invitations/[token]` (público
  acotado: devuelve solo `companyName`, `role`, `email`; sin datos sensibles).

## Reglas / invariantes

- **El dueño (`company.ownerUid`) siempre es Administrador**: no se puede degradar ni quitar
  vía el panel de equipo. Garantiza que *siempre* quede ≥1 admin sin lógica frágil de
  "último admin".
- Nadie puede **quitarse a sí mismo** ni cambiar su propio rol vía estos endpoints.
- Al **invitar** se valida (además de `can(role, 'team:manage')`):
  - `role` ∈ {admin, editor, viewer}; email con forma válida, normalizado.
  - El correo **no es ya miembro** de esta empresa.
  - **No** hay otra invitación `pending` no expirada para ese correo en esta empresa.
  - El correo **no pertenece ya a una cuenta TapCar con empresa** (se resuelve vía
    Firebase Auth `getUserByEmail` → si existe y su `users/{uid}` tiene `companyId`, se
    rechaza con mensaje claro). Evita huérfanar los datos de esa persona.
  - Hay **cupo**: `activos + pendientes < 5`.

## Endpoints (`/api/company/…`; todos exigen `getMembership()` + `can(role, 'team:manage')`)

- `GET    /api/company/team` → `{ members: [{ uid, email, displayName, role, isOwner }],
  invitations: [{ id, email, role, expiresAt }] }` (solo pendientes no expiradas).
- `POST   /api/company/invitations` `{ email, role }` → valida, crea la invitación, envía
  el correo (best-effort) y devuelve `{ invitation, acceptUrl }` (fallback "copiar enlace").
  `409` si cupo lleno; `409`/`422` si el correo ya es miembro / ya tiene cuenta / ya invitado.
- `DELETE /api/company/invitations/[id]` → revoca una pendiente (`status: 'revoked'`),
  validando que pertenezca al `companyId` del actor.
- `PATCH  /api/company/members/[uid]` `{ role }` → cambia el rol; `403` si el target es el
  dueño o es uno mismo; valida mismo `companyId`.
- `DELETE /api/company/members/[uid]` → quita al miembro **borrando su `users/{uid}`** (en su
  próximo login `ensureProvisioned` le crea una empresa nueva vacía; **no** se toca su cuenta
  de Auth). `403` si el target es el dueño o es uno mismo.

Endpoint público acotado (para el banner de la landing, opcional):
- `GET /api/invitations/[token]` → `{ companyName, role, email }` si la invitación está
  `pending` y no expirada; `404` si no. No expone datos de la flota.

## Email

- `lib/email/invitationEmail.ts` — **copy pura y testeable** (estilo `reminderEmail.ts`):
  `invitationSubject(companyName)` + `invitationHtml({ companyName, role, inviterEmail, acceptUrl })`.
- `sendInvitationEmail(to, params)` en `lib/email/resend.ts` (usa `getResend()` lazy).
- **Best-effort**: si el envío falla, la invitación igual queda creada (el auto-unir por
  correo sigue funcionando) y la UI muestra el `acceptUrl` para copiar y compartir a mano.

`acceptUrl = ${NEXT_PUBLIC_APP_URL}/login?invite=<token>`.

## UI

`components/company/TeamCard.tsx`, montado en `app/(app)/configuracion/page.tsx` **solo si
`can(role, 'team:manage')`** (Administrador). Debajo de `CompanyCard`.

- **Miembros**: lista con correo, badge de rol, etiqueta "Dueño" en el `ownerUid`; para los
  demás, selector de rol (Visor/Editor/Admin) y botón "Quitar". Sin acciones sobre uno mismo
  ni sobre el dueño.
- **Invitaciones pendientes**: correo, rol, "expira en N días", botón "Cancelar". Si el
  correo no se pudo enviar, botón "Copiar enlace".
- **Invitar**: input de correo + selector de rol + botón "Invitar". Contador "**X de 5**
  miembros" y deshabilita el formulario al llegar a 5.

Los no-administradores no ven el panel de equipo (consistente con que Datos de empresa es
editable solo por admin).

## Reglas Firestore

`match /invitations/{id}`: `allow read, write: if false;` (solo Admin SDK). Defensa en
profundidad; el cliente nunca consulta esta colección.

## Testing

- **Puro (Vitest):**
  - `lib/email/invitationEmail.ts` → subject/html incluyen empresa, rol y `acceptUrl`.
  - `teamCapacity(activos, pendientes)` / `canInvite(...)` → borde en 5.
- **Integración (mock Admin SDK):**
  - `POST invitations`: 403 no-admin, 409 cupo lleno, rechazo de correo ya-miembro /
    ya-con-cuenta / ya-invitado, éxito crea doc `pending`.
  - `ensureProvisioned`: con invitación pendiente → une con el rol correcto y marca
    `accepted`; sin invitación → crea empresa propia (regresión).
  - `PATCH/DELETE members`: proteger al dueño y a uno mismo (403); mismo `companyId`.
- Tests de reglas (emulador): `invitations` inaccesible desde el cliente.

## Superficies afectadas

- **`lib/types.ts`**: `Invitation` (+ `InvitationRole` reutiliza `Role`).
- **`lib/data/`**: nuevo `invitations.ts` (crear/listar/revocar/aceptar, resolver por token);
  `companies.ts` → `ensureProvisioned` gana el paso de auto-unir; helper para listar miembros
  (`listMembers(companyId)`), quizá en un nuevo `members.ts` o en `companies.ts`.
- **`lib/auth/`**: sin cambios de `roles.ts` (ya existe `team:manage`).
- **`lib/email/`**: `invitationEmail.ts` + `sendInvitationEmail`.
- **`app/api/company/`**: `team/route.ts` (GET), `invitations/route.ts` (POST),
  `invitations/[id]/route.ts` (DELETE), `members/[uid]/route.ts` (PATCH, DELETE);
  `app/api/invitations/[token]/route.ts` (GET público acotado).
- **`components/company/TeamCard.tsx`** (nuevo) + montaje en `configuracion/page.tsx`.
- **`firestore.rules`**: bloquear `invitations` para el cliente.
- **Login**: banner opcional al traer `?invite=<token>` (nice-to-have; puede ir al final).

## Riesgos / cuidados

- `ensureProvisioned` es **camino crítico de todo login**: el paso nuevo debe fallar-cerrado
  con cuidado (si la query de invitaciones falla, mejor caer al comportamiento actual de
  crear empresa propia solo si es seguro; idealmente propagar el error para no crear una
  empresa equivocada). Cubrir con test de regresión el caso "sin invitación".
- **Cupo bajo carrera**: dos invitaciones simultáneas podrían pasar el `<5`. Aceptable para
  el volumen actual (equipos ≤5, uso concierge); si importa, usar transacción al crear.
- No confundir **rol `admin` de empresa** con **admin de plataforma** (`ADMIN_EMAILS`).
- Correo `RESEND_FROM` / `RESEND_API_KEY` deben estar en el entorno (el usuario está creando
  la credencial de Resend). Sin ellos, el envío falla pero la invitación se crea igual.
