# Destinatarios de notificaciones por miembro

**Fecha:** 2026-07-05
**Estado:** aprobado (pendiente de plan de implementación)

## Problema

Hoy las notificaciones automáticas por email van **siempre y solo al dueño de la
empresa** (`company.ownerUid`, resuelto a su email vía Firebase Auth):

- **Recordatorios de vencimiento** (cron diario): `vehicleInfoForReminder` en
  `lib/data/vehicles.ts` devuelve el email del `ownerUid`; `processReminders`
  manda a esa única dirección.
- **Alertas de flota** (daño / sin-entrega): en `tomar`/`entregar` se resuelve
  `(await adminAuth.getUser(company.ownerUid)).email` y se manda ahí.

No hay forma de que otros miembros del equipo reciban, ni de sacar al dueño.

## Objetivo

Permitir, desde el panel de **Equipo** (Configuración, solo Administrador),
definir **por miembro** quién recibe las notificaciones. La misma configuración
aplica a **ambos** tipos de correo (vencimientos y alertas de flota).

## Decisiones (del brainstorming)

- **Modelo: por miembro** (un switch por persona), no por rol ni por vehículo.
- **Dueño y uno mismo son toggleables** (a diferencia del cambio de rol).
- **Default sin migración:** el dueño ON, el resto OFF. Se logra interpretando el
  campo ausente como `uid === ownerUid` (ver abajo). Si el admin desmarca a
  todos, **nadie recibe** (se respeta; se muestra un aviso).
- **Alcance: ambas notificaciones** comparten una sola lista de destinatarios.
- **Almacenamiento: flag por usuario** en `users/{uid}` (no una lista en la
  empresa). Se auto-limpia al quitar un miembro y evita la ambigüedad
  "vacío vs sin configurar".

## Modelo de datos

Agregar a `users/{uid}` (perfil del miembro) un campo opcional:

```
recibeAlertas?: boolean
```

- `UserProfile` en `lib/types.ts` gana `recibeAlertas?: boolean`.
- **Semántica del default:** al leer, si `recibeAlertas === undefined`, se
  interpreta como `uid === ownerUid`. Es decir: sin configurar, el dueño recibe y
  el resto no — idéntico al comportamiento actual, **sin script de migración**.
- Una vez que el admin toca el switch, el valor queda explícito (`true`/`false`).

## Componentes

### Resolver compartido — `lib/data/members.ts`

Nueva función, **única fuente de verdad** de destinatarios:

```
alertRecipientEmails(companyId: string, ownerUid: string): Promise<string[]>
```

- Lista los miembros (`users` where `companyId ==`), aplica el default del dueño,
  filtra los que reciben, resuelve cada email (campo `email` denormalizado o vía
  `adminAuth.getUser`), y devuelve la lista **deduplicada y sin vacíos**.
- Puede devolver `[]` (si el admin desmarcó a todos): los llamadores no mandan
  correo en ese caso.

### `listMembers` (mismo archivo)

- El `Member` que devuelve gana `recibeAlertas: boolean` (ya resuelto con el
  default), para que el switch del UI muestre el estado correcto.

### Mutación — `lib/data/members.ts`

```
setMemberNotificaciones(companyId: string, targetUid: string, value: boolean): Promise<void>
```

- Valida que `targetUid` pertenezca a `companyId` (como `assertSameCompany`) y
  hace `update({ recibeAlertas: value })`. **No** bloquea al dueño ni a uno mismo.

### Recordatorios de vencimiento

- `vehicleInfoForReminder(vehicleId)` pasa de `{ patente; email }` a
  `{ patente; emails: string[] }`, usando `alertRecipientEmails`.
- `ReminderDeps.vehicleInfo` y `processReminders` (`lib/documents/runReminders.ts`)
  se adaptan: por cada documento con hito, recorren `emails` y llaman
  `sendReminderEmail(email, params)` para cada uno. Si `emails` está vacío, se
  salta (no cuenta como enviado). `sendReminderEmail` **no** cambia de firma.

### Alertas de flota — `app/api/v/[token]/tomar` y `.../entregar`

- Reemplazar el bloque `getUser(company.ownerUid).email` por
  `alertRecipientEmails(vehicle.companyId, company.ownerUid)` y mandar a cada
  destinatario (loop). Sigue **best-effort** (try/catch, nunca rompe el flujo).

### API

- `GET /api/company/team`: cada miembro incluye `recibeAlertas`.
- `PATCH /api/company/members/[uid]`: acepta además `{ recibeAlertas: boolean }`.
  El endpoint **distingue la operación por el body**:
  - rama `role`: guard **estricto** actual (bloquea uno-mismo y al dueño).
  - rama `recibeAlertas`: guard **suave** (solo `team:manage` + misma empresa;
    **permite** al dueño y a uno mismo). Llama `setMemberNotificaciones`.

### UI — `components/company/TeamCard.tsx`

- Cada fila de miembro (incluidos dueño y uno mismo) muestra un **switch
  compacto de "Notificaciones"** que refleja `recibeAlertas`.
- Al cambiar, hace `PATCH /api/company/members/[uid]` con `{ recibeAlertas }`.
  Estado local + manejo de error visible (patrón ya usado en la card).
- Si **ningún** miembro queda activado, se muestra un aviso sutil:
  *"Nadie recibirá las notificaciones de vencimiento ni las alertas de flota."*
- El switch vive dentro de TeamCard, que ya es solo-Administrador
  (`can(role, 'team:manage')`).

## Flujo de datos

1. Admin abre Configuración → Equipo → ve el switch por miembro (estado desde
   `GET /api/company/team`).
2. Togglea → `PATCH .../members/[uid] { recibeAlertas }` → `setMemberNotificaciones`.
3. Cron de vencimientos / rutas de flota → `alertRecipientEmails` → correos a
   todos los miembros activos.

## Manejo de errores / no-regresión

- Correos siguen **best-effort**; un fallo de Resend no rompe nada.
- El default sin migración garantiza que, sin configuración, el comportamiento es
  exactamente el de hoy (solo el dueño recibe).
- El toggle exige `team:manage`; nunca confía en el cliente para `companyId`/rol.

## Tests

- `lib/data/members.test.ts` (o donde corresponda): `alertRecipientEmails` con el
  default del dueño (dueño ON por defecto, otros OFF; respeta valores explícitos;
  dedup; lista vacía).
- `lib/documents/__tests__/runReminders.test.ts`: `vehicleInfo` devuelve `emails[]`;
  se manda a cada uno; lista vacía = no envía.
- `app/api/v/[token]/tomar` y `entregar` (tests existentes): actualizar el mock del
  resolver de destinatarios.
- Endpoint `members/[uid]`: rama `recibeAlertas` permite dueño/uno-mismo; rama
  `role` sigue bloqueándolos.

## Fuera de alcance (YAGNI)

- Memoización por `companyId` en el cron (para el piloto ~50 vehículos no hace
  falta; se puede agregar después si escala).
- Ocultar el switch para Visores: se muestra para todos; un Visor simplemente
  queda OFF por defecto.
- Preferencias por tipo de notificación (separar vencimientos de alertas): una
  sola lista para ambos, como se decidió.
