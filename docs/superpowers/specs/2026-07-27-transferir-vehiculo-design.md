# Transferir un vehículo a otra cuenta

**Fecha:** 2026-07-27
**Estado:** diseño aprobado

## Problema

> Como dueño de un vehículo, quiero poder transferir la propiedad de mi vehículo
> a otra cuenta mediante su correo electrónico, para ceder su gestión de forma
> rápida y segura.

Hoy no hay forma de mover un vehículo entre empresas. La única salida es que el
nuevo dueño lo cargue de cero y vuelva a subir todos los documentos, y que el
anterior lo borre.

## Contexto del modelo

En TapCar un vehículo no pertenece a un **usuario** sino a una **empresa**
(`companyId`), y ese `companyId` está denormalizado en todo lo que cuelga del
vehículo: `documents`, `usages`, `mantenciones` y `alertas`. Transferir "a otra
cuenta" significa reasignar el vehículo y la parte de su descendencia que
corresponda a la empresa del correo destinatario.

Los archivos en Cloud Storage se guardan bajo `vehicles/{vehicleId}/...`, sin el
`companyId` en la ruta: **no hay que mover ningún archivo**. El acceso se
resuelve por signed URLs que el servidor emite después de validar `companyId` en
Firestore.

## Decisiones tomadas

1. **El destinatario debe aceptar.** La transferencia queda `pendiente` y el
   vehículo se mueve recién al aceptar. Un tipeo en el correo, de otro modo,
   entregaría el padrón y el permiso de circulación a un desconocido sin vuelta
   atrás.
2. **Viajan documentos y mantenciones.** La bitácora de usos se queda con el
   emisor (son datos de sus conductores) y el daño activo no viaja.
3. **Si el correo no tiene cuenta en TapCar, se rechaza** con un mensaje
   accionable. No se crean transferencias a la espera de que alguien se registre.
4. **La transferencia vive en su propia colección** `transferencias/{id}`, no
   como campo del vehículo ni mezclada con `invitations`. Un cambio de propiedad
   merece dejar rastro.

## Modelo de datos

Colección `transferencias/{id}`, **bloqueada al cliente** en `firestore.rules`
(recordar desplegar con `scripts/deploy-firestore-rules.mjs`):

```ts
type Transferencia = {
  id: string
  vehicleId: string
  patente: string           // denormalizado: el email y la página lo muestran sin leer el vehículo
  deCompanyId: string
  deCompanyNombre: string   // razón social del emisor, para que el destinatario sepa quién le escribe
  paraEmail: string         // normalizado (trim + minúsculas)
  token: string             // nanoid(32)
  status: 'pendiente' | 'aceptada' | 'cancelada'
  creadaPorUid: string
  createdAt: string
  expiresAt: string         // +7 días
  aceptadaPorUid?: string
  aceptadaEn?: string
}
```

No se guarda `paraCompanyId` al crear: entre la creación y la aceptación el
destinatario podría cambiar de empresa. La empresa destino se resuelve **al
aceptar**, leyendo `users/{uid}` de quien acepta.

## Qué se mueve, exactamente

Operación `transferirVehiculo(vehicleId, deCompanyId, aCompanyId)`:

| Elemento | Qué pasa |
|---|---|
| Vehículo | `companyId` → destino |
| Documentos + archivos | `companyId` → destino (los archivos no se mueven) |
| Mantenciones + constancias | `companyId` → destino |
| `categoriaId` | **a `null`**: apunta a una categoría del emisor que en la empresa destino no existe |
| `danoActivo` | **se limpia** y se borra su foto en Storage: no viaja |
| Bitácora de usos | **se queda** con el emisor |
| Alertas de daño abiertas | **se borran**: apuntan a un vehículo que el emisor ya no tiene |
| Uso abierto | se cierra forzado antes de mover, para no dejar el vehículo "en uso" por un conductor de otra empresa |
| `publicToken` | **se mantiene igual** |
| `kmActual` | se mantiene |

`publicToken` y `kmActual` se conservan a propósito: el chip está pegado al
vehículo y se va con él —regenerar el token le entregaría al nuevo dueño un chip
muerto— y el odómetro es del fierro, no de la empresa.

Como la bitácora se queda con el emisor pero conserva el mismo `vehicleId`, el
nuevo dueño vería esos usos en la pestaña Bitácora. Para taparlo, `listUsages`
recibe un `companyId` **opcional** que filtra en memoria (la query es de un solo
campo; no hace falta índice). Solo la ficha del vehículo lo pasa: los otros dos
consumidores deben seguir viendo todos los usos —`deleteUsagesByVehicle` porque
es la cascada de borrado, y `refreshVehicleKm` porque el odómetro es físico.

## Arquitectura

| Archivo | Responsabilidad |
|---|---|
| `lib/types.ts` | Tipo `Transferencia`. |
| `lib/transferencias/estado.ts` | **Lógica pura**: `transferenciaVigente(t, nowIso)` y `puedeAceptar(...)`. Sin Firebase. Es donde vive la seguridad del feature. |
| `lib/data/transferencias.ts` | CRUD de la colección: `createTransferencia`, `getTransferenciaByToken`, `getPendienteByVehicle`, `cancelTransferencia`, `markAceptada`. |
| `lib/data/transferirVehiculo.ts` | La mutación: reasigna vehículo + documentos + mantenciones en un `WriteBatch`, limpia `categoriaId`/`danoActivo`/alertas y cierra el uso abierto. |
| `lib/email/transferenciaEmail.ts` | Tres plantillas con `emailLayout` + CTA. |
| `app/api/vehicles/[id]/transferir/route.ts` | `POST` (crear) y `DELETE` (cancelar). |
| `app/api/transferencias/[token]/route.ts` | `GET` acotado: patente, empresa origen, estado. **Exige sesión** (a diferencia del `GET` de invitaciones, que es público porque el invitado todavía no tiene cuenta; acá siempre la tiene). |
| `app/api/transferencias/[token]/aceptar/route.ts` | `POST` que ejecuta la transferencia. |
| `app/(app)/transferencias/[token]/page.tsx` | Página de aceptación (exige sesión por el layout de `(app)`). |
| `components/vehicle/TransferirVehiculoPanel.tsx` | Panel en la pestaña Ajustes, solo `vehicle:write`. |
| `components/transferencias/AceptarTransferencia.tsx` | Botón de aceptar con sus estados. |

## Flujo

**Emisor** (Administrador, ficha → pestaña Ajustes, junto a Eliminar):

1. Escribe el correo y confirma. `POST /api/vehicles/[id]/transferir` valida y
   crea la transferencia `pendiente`.
2. Salen dos correos: al destinatario (CTA a la página de aceptación) y al
   emisor como respaldo de lo que hizo.
3. El panel muestra a quién se envió y cuándo expira, con **Cancelar** →
   `DELETE /api/vehicles/[id]/transferir`.

**Destinatario:**

4. Abre el enlace → `/transferencias/[token]`. Si no tiene sesión, el layout de
   `(app)` lo manda a login.
5. Ve patente, empresa de origen y qué implica aceptar. Botón **Aceptar** →
   `POST /api/transferencias/[token]/aceptar`.
6. Al concretarse, un tercer correo avisa al emisor que fue aceptada.

La mutación va en un `WriteBatch`: vehículo, documentos y mantenciones se mueven
atómicamente. El cierre del uso abierto y el borrado de alertas van antes,
best-effort, siguiendo el patrón de `deleteCompanyCascade`. Los tres envíos de
correo son best-effort: un fallo de Resend nunca revierte la transferencia.

## Errores y seguridad

**Al crear:**

| Caso | Respuesta |
|---|---|
| Sin `vehicle:write` | 403 |
| Vehículo de otra empresa | 403 |
| Correo sin cuenta en TapCar | 404 `sin_cuenta` |
| Correo de tu propia empresa | 400 `misma_empresa` |
| Ya hay una pendiente para ese vehículo | 409 `ya_pendiente` |

**Al aceptar** — cuatro reglas, todas en la función pura
`puedeAceptar({ transferencia, emailSesion, role, vehiculosActuales, maxVehiculos, nowIso })`,
que recibe los datos ya leídos y devuelve `null` (puede) o el código de error a
responder. Así el endpoint queda como orquestador y las reglas se testean solas:

- El **correo de la sesión debe coincidir** con `paraEmail`. El token solo no
  alcanza: un enlace reenviado no puede servir para quedarse con el vehículo.
- Quien acepta necesita `vehicle:write` en su empresa: recibe un activo que
  consume cupo.
- La transferencia debe estar `pendiente` y no expirada → 410 si venció.
- **Cupo del plan del destinatario**, evaluado en ese instante → 409
  `plan_limit`. Se valida al aceptar y no al crear: entremedio el destinatario
  puede haber llenado su plan.

Además, justo antes de mover se revalida que el vehículo siga perteneciendo a
`deCompanyId`. Si el emisor lo borró o ya lo transfirió a otro, corta con 409
`ya_transferido` en vez de escribir sobre datos que cambiaron.

`markAceptada` se ejecuta **después** de mover: si la mutación falla, la
transferencia queda `pendiente` y se puede reintentar.

## Pruebas

**Puras (Vitest)** — `lib/transferencias/estado.ts`: `transferenciaVigente` y
`puedeAceptar`, con un caso por cada regla de rechazo más el camino feliz.

**Capa de datos** — `transferirVehiculo` con Firestore mockeado (patrón de
`lib/data/__tests__/deleteCompany.test.ts`): que mueva vehículo, documentos y
mantenciones; que anule `categoriaId` y `danoActivo`; que **no** toque los usos;
que conserve `publicToken`.

**Endpoints** — los cuatro, con `getMembership` mockeado (patrón de
`app/api/**/__tests__`), cubriendo cada código de error de las tablas de arriba.

**Emails** — que las tres plantillas incluyan la patente y el CTA correcto.

**Sin E2E:** el flujo cruza dos cuentas de empresas distintas y montarlo en
Playwright cuesta más de lo que aporta. Queda una verificación manual en el plan.

## Fuera de alcance

- Transferir varios vehículos de una vez.
- Transferir a un correo sin cuenta (queda rechazado).
- Deshacer una transferencia ya aceptada: la vuelta se hace transfiriendo de
  regreso.
- Historial de transferencias visible en la UI. Los documentos quedan en
  Firestore, pero no hay pantalla que los liste.
