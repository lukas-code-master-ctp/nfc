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
3. **Se puede transferir a un correo sin cuenta.** La transferencia se crea igual
   y al destinatario le llega un correo pidiéndole que se registre. *(Revisado el
   2026-07-27: la versión original rechazaba estos correos con 404 `sin_cuenta`.
   Ver «Transferencia a correos sin cuenta» al final.)*
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
- Deshacer una transferencia ya aceptada: la vuelta se hace transfiriendo de
  regreso.
- Historial de transferencias visible en la UI. Los documentos quedan en
  Firestore, pero no hay pantalla que los liste.
- Congelar el vehículo mientras la transferencia está pendiente. Sigue operando
  normal: la aceptación puede tardar días y entretanto el vehículo circula y sus
  documentos vencen.

---

# Transferencia a correos sin cuenta

**Fecha:** 2026-07-27 (revisión del diseño anterior)
**Estado:** diseño aprobado

## Qué cambia

La versión original rechazaba con 404 `sin_cuenta` cualquier transferencia a un
correo sin cuenta en TapCar. Eso deja fuera el caso más común de un traspaso
real: le vendes el auto a alguien que todavía no usa la plataforma.

Ahora la transferencia **se crea igual** y el destinatario recibe un correo
pidiéndole que se registre. Para el emisor no cambia nada conceptual: el
vehículo queda pendiente hasta que acepten, tuviera o no cuenta el destinatario.

## Creación

`POST /api/vehicles/[id]/transferir` resuelve la empresa del correo; si es
`null`, sigue adelante en vez de cortar. La única validación que sobrevive de las
tres anteriores es `misma_empresa` (y `ya_pendiente`, que no depende del
destinatario).

El correo al destinatario tiene **dos variantes**:

| Caso | Asunto y CTA |
|---|---|
| Tiene cuenta | El actual: «Revisar la transferencia» → `/transferencias/<token>` |
| No tiene cuenta | «Crear mi cuenta en TapCar» → `/login?transferencia=<token>`, avisando explícitamente que debe registrarse **con ese mismo correo** o no podrá aceptar |

## Llegada del destinatario

El login siempre redirige a `/dashboard` tras autenticar, así que sin cambios
alguien se registraría y perdería el enlace. Tres piezas lo resuelven:

1. **`GET /api/transferencias/[token]` vuelve al diseño**, ahora **público** y
   acotado a patente, empresa de origen, correo destino y estado. El plan lo
   había eliminado por no tener consumidor; ese razonamiento valía mientras el
   destinatario siempre tuviera cuenta. El banner del login lo consume sin sesión.
2. **`components/transferencias/TransferenciaBanner.tsx`** en `/login`, hermano
   de `InvitationBanner`: nombra la patente y el correo con el que hay que entrar.
3. **`LoginForm` aprende un destino:** si la URL traía `?transferencia=<token>`,
   después de `establishSession` empuja a `/transferencias/<token>` en vez de
   `/dashboard`.

Y como red de seguridad —para quien cerró el correo o se registró por su
cuenta— el **dashboard muestra un banner de transferencias entrantes**
consultando por `paraEmail`. Es lo único que sobrevive a que el enlace se pierda.

## Estado pendiente para el emisor

El dashboard consulta las transferencias pendientes de la empresa y muestra una
pill **«Transferencia pendiente»** en la card del vehículo ofrecido. El vehículo
sigue operando normal: documentos, bitácora y chip NFC intactos.

Son dos consultas nuevas por render del dashboard (`paraEmail` y `deCompanyId`),
ambas de un solo campo, sin índice compuesto.

## Qué NO cambia

- Las cinco reglas de `puedeAceptar`, incluida la comparación de correo: quien se
  registra pasa por exactamente el mismo filtro que quien ya tenía cuenta.
- `ensureProvisioned` ya crea una empresa propia para el usuario nuevo y lo deja
  como Administrador, que es el permiso que exige aceptar. Sin cambios.
- La expiración de 7 días.

**Borde conocido, sin código:** si ese correo tuviera además una invitación de
equipo pendiente, la invitación gana y el usuario entra a otra empresa, quizá sin
rol de Administrador. Ahí vería «Necesitas ser Administrador de tu empresa» al
intentar aceptar. Es un cruce muy improbable y el mensaje ya es accionable.

## Pruebas

- **Endpoint de crear:** los dos tests de `sin_cuenta` se reemplazan por su
  opuesto —que **sí** cree la transferencia sin cuenta— más uno que verifique
  que elige la plantilla de correo correcta en cada caso.
- **Plantilla nueva:** que el CTA apunte a `/login?transferencia=` y mencione el
  correo con el que hay que registrarse.
- **`GET` público:** que responda sin sesión y que no exponga más que los cuatro
  campos acordados.
- **Banners:** el del login y el del dashboard, con @testing-library.
- **`LoginForm`:** que redirija al token cuando viene en la URL y al dashboard
  cuando no.
