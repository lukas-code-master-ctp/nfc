# Eliminar Flota + flujo de revisión de daño en el dashboard

**Fecha:** 2026-07-07
**Estado:** Aprobado, listo para plan de implementación

## Contexto y objetivo

Con el punto "en vivo" ya en el dashboard, la pestaña **Flota** dejó de aportar valor
propio salvo por dos cosas: la bandeja de alertas (daño / sin entrega) y el badge de uso
prolongado. Se decidió **eliminar Flota** y reubicar esas señales:

- **Uso prolongado** → el punto verde del dashboard cambia a **ámbar** cuando el uso
  supera `avisoUsoHoras`.
- **Daño** → una **pill roja "Daño reportado"** en la card del dashboard que lleva a la
  bitácora del vehículo, donde se marca como revisado. Además, un **email** al caer el
  reporte.
- **Sin entrega** → deja de ser alerta y deja de notificar; solo queda en **Reportes**
  (contador de responsabilidad por conductor + pill "Sin entrega formal" en la bitácora).

## Decisiones (del brainstorming)

- "Sin entrega" **solo** vive en Reportes: sin pill, sin alerta, **sin email**.
- El daño **sí** notifica por email (nuevo), con CTA al mismo destino que la pill.
- **Cualquier rol** (Visor, Editor, Administrador) puede marcar un daño como revisado.

## Política de correos (definitiva)

| Evento | Email | Alerta in-app | CTA del email |
|---|---|---|---|
| Documentos por vencer | ✅ (ya existe, sin cambios) | — | página del vehículo |
| **Daño reportado** | ✅ **nuevo** | pill roja en dashboard | `/vehiculos/{id}#uso-{usageId}` |
| **Sin entrega** (fuerza-cierre / entrega irregular) | ❌ **se elimina** | ❌ se elimina | — |

## Modelo de datos

- `usages/{id}.dano` gana campos de revisión: `revisadoPorUid?`, `revisadoPorNombre?`,
  `revisadoEn?` (en `VehicleUsage.dano`, `lib/types.ts`). Los estampa el endpoint de
  revisión, no `closeUsage`.
- La colección `alertas` pasa a contener **solo** alertas de tipo `dano` (las
  `sin_entrega` dejan de crearse). Sigue siendo el store eficiente de "daños pendientes
  de revisar": un vehículo tiene daño pendiente si existe una alerta `dano` abierta para
  él. Al revisar, se **borra** esa alerta y se **estampa** `dano.revisadoPor*` en el uso
  (registro permanente).

## Cambios

### 1. Eliminar Flota

- Borrar `app/(app)/flota/page.tsx`.
- Borrar `components/flota/FlotaGrid.tsx`, `components/flota/AlertasBandeja.tsx`,
  `components/flota/AtenderAlertaButton.tsx`.
- Quitar el link `{ href: '/flota', label: 'Flota' }` de `components/AppNav.tsx`.
- Borrar `app/api/alertas/[id]/route.ts` (el `DELETE` que usaba la bandeja) — lo
  reemplaza el endpoint de revisión.
- `lib/data/alertas.ts`: `listAlertas` (lo usa el dashboard) y `createAlerta` (daño)
  quedan; se agrega `deleteDanoAlertaByUsage(companyId, usageId)` para el flujo de
  revisión. `deleteAlerta` (borrar por id) queda **sin uso** al eliminar la ruta
  `DELETE /api/alertas/[id]` → se borra junto con su cobertura de test.
- Ajustar el copy de `components/company/PlataformaCard.tsx`: "…se marcará en Flota" →
  "…se marcará en el panel de vehículos" (Flota ya no existe).

### 2. "Sin entrega" deja de notificar y de alertar

- En `app/api/v/[token]/tomar/route.ts` (bloque `forced`): **quitar** `createAlerta(sin_entrega)`
  y `sendUsageAlertEmail`; **mantener** `incrementDriverStats(forced.driverId, 'sinEntrega')`.
  Quitar los imports que queden sin uso (`getCompany`, `alertRecipientEmails`,
  `sendUsageAlertEmail`, `createAlerta` si ya no se usa en ese archivo).
- En `app/api/v/[token]/entregar/route.ts` (bloque `entregaIrregular`): **quitar**
  `createAlerta(sin_entrega)` y `sendUsageAlertEmail`; **mantener**
  `incrementDriverStats(cierre.driverOriginal.id, 'sinEntrega')`.
- Retirar el email `sin entrega`: borrar `lib/email/usageAlertEmail.ts` y su test
  `lib/email/__tests__/usageAlertEmail.test.ts`; quitar `sendUsageAlertEmail` de
  `lib/email/resend.ts` y sus imports en las rutas.

### 3. Email de daño (nuevo)

- `lib/email/danoEmail.ts` (nuevo, plantilla pura, brandeada con `emailLayout` +
  `ctaButton`): asunto `TapCar · Daño reportado — {patente}`; cuerpo con patente,
  conductor, nota del daño; CTA **"Ver el daño"** → `${appUrl()}/vehiculos/{vehicleId}#uso-{usageId}`.
- `lib/email/resend.ts`: `sendDanoEmail(to, { patente, vehicleId, usageId, driverNombre, nota })`.
- En `entregar`, dentro del bloque `if (dano?.hay)`: además de la alerta y el contador,
  enviar `sendDanoEmail` a `alertRecipientEmails(companyId, ownerUid)` (best-effort). Se
  puede disparar en el `after()` existente para no demorar la respuesta del conductor.

### 4. Endpoint de revisión

- `POST /api/usages/[id]/revisar-dano` — **cualquier miembro** (solo `getMembership()`;
  sin `can(...)`). Valida que el uso pertenezca a `m.companyId`, que tenga daño y que no
  esté ya revisado. Estampa `dano.revisadoPorUid = m.uid`, `revisadoPorNombre` (nombre
  del miembro), `revisadoEn = now`, y borra la alerta `dano` de ese uso vía
  `deleteDanoAlertaByUsage`. Data: `marcarDanoRevisado(companyId, usageId, revisor)` en
  `lib/data/usages.ts`.
- El nombre del revisor sale del perfil del miembro (`users/{uid}.displayName`, con
  fallback al email). `getMembership()` ya trae `email`; para el `displayName` se lee el
  perfil o se usa el email como fallback.

### 5. Dashboard: punto ámbar + pill de daño

- `app/(app)/dashboard/page.tsx`: además de vehículos/docs/company, cargar
  `listAlertas(m.companyId)` y armar un mapa `vehicleId → usageId` de daños pendientes;
  leer `avisoUsoHoras`; con `now = new Date()`, por cada vehículo calcular
  `prolongado = usoActual ? usoProlongado(usoActual.tomadoEn, avisoUsoHoras, now) : false`
  y `danoUsageId` (del mapa). Pasar ambos en cada `Item` a `VehiclesBoard`.
- `components/VehiclesBoard.tsx`: extender `Item` con `prolongado: boolean` y
  `danoUsageId: string | null`; pasarlos a `VehicleCard`.
- `components/VehicleCard.tsx`:
  - **Punto**: si `usoActual`, mostrar el punto; **ámbar** (`#B45309`/fondo ámbar) si
    `prolongado`, **verde** (`#15803D`) si no. El `title` incluye "En uso por X · desde
    {hora}" y, si `prolongado`, "· sin entregar hace Xh".
  - **Pill roja "Daño reportado"** si `danoUsageId` no es null.
  - **Link de la card**: `/vehiculos/{id}` normalmente; `/vehiculos/{id}#uso-{danoUsageId}`
    si hay daño (para que el click scrollee al uso). Sin links anidados: la card sigue
    siendo un solo `<Link>` cuyo `href` cambia.

### 6. Página del vehículo: ancla + botón de revisión

- `app/(app)/vehiculos/[id]/page.tsx`: en el map de `usos`, pasar también
  `dano.revisadoPorNombre` y `revisadoEn`.
- `components/vehicle/BitacoraUso.tsx`:
  - Cada `<li>` lleva `id={\`uso-${u.id}\`}` (ancla del scroll nativo por hash).
  - En un uso con `dano.hay`:
    - Si **no** revisado (`!dano.revisadoPorNombre`): botón **"Marcar daño como revisado"**
      (nuevo componente cliente `components/vehicle/RevisarDanoButton.tsx`, prop
      `usageId`; `POST /api/usages/{id}/revisar-dano` + `router.refresh()`). Visible para
      **cualquier rol** (sin gate `puedeEditar`).
    - Si **revisado**: texto **"Daño registrado por {revisadoPorNombre}"** en vez del botón.
  - Extender `UsageRow.dano` con `revisadoPorNombre?`, `revisadoEn?`.

### 7. Reportes: tooltip con el revisor

- `components/reportes/BitacoraFlota.tsx`: extender `Uso.dano` con `revisadoPorNombre?`.
  En el `PillTip` de "Daño", además de la nota, mostrar
  **"Daño registrado por: {revisadoPorNombre}"** cuando exista (el endpoint
  `/api/reportes/usos` ya devuelve el `dano` completo).

## Fuera de alcance

- Notificación de "sin entrega" de cualquier tipo (se elimina por decisión).
- Resaltado visual (highlight) del uso al llegar por el ancla — basta el scroll nativo
  del navegador por `#uso-{id}`. Si el scroll por hash no funciona con la navegación de
  Next, se agrega un pequeño helper cliente; no se diseña por adelantado.
- Fotos del daño en el email (solo texto + CTA).

## Testing

- **Unit** (email de daño): `danoEmail.ts` produce asunto con patente, CTA al ancla
  correcto (`/vehiculos/{id}#uso-{usageId}`), y va brandeado.
- **Integración de rutas** (Vitest, patrón existente con mocks):
  - `tomar`: ya no llama `createAlerta`/`sendUsageAlertEmail`; sí incrementa `sinEntrega`
    en el fuerza-cierre.
  - `entregar`: con daño → `createAlerta(dano)` + `incrementDriverStats(danos)` +
    `sendDanoEmail`; con entrega irregular → solo `incrementDriverStats(sinEntrega)`
    (sin alerta ni email).
  - `revisar-dano`: cualquier rol; estampa el uso y borra la alerta; 404/403 si el uso no
    es de la empresa o no tiene daño.
- **Data**: `marcarDanoRevisado` y `deleteDanoAlertaByUsage` con el mock de Firestore
  existente.
- UI (dashboard, BitacoraUso, BitacoraFlota, RevisarDanoButton): tsc + eslint + build.

## Criterios de aceptación

1. La pestaña Flota ya no existe (ni ruta, ni link, ni componentes).
2. Un vehículo en uso muestra punto **verde**; si superó `avisoUsoHoras`, **ámbar** (con
   el dato en el tooltip). Disponible → sin punto.
3. Un vehículo con daño pendiente muestra la pill roja "Daño reportado"; al hacer click
   en la card, se navega a `/vehiculos/{id}#uso-{usageId}` y el navegador scrollea a ese
   uso.
4. En la bitácora del vehículo, un daño no revisado muestra el botón "Marcar daño como
   revisado" para cualquier rol; al usarlo, se registra quién lo revisó, desaparece la
   pill del dashboard y el botón pasa a "Daño registrado por {nombre}".
5. Al caer un reporte de daño (entrega con daño), se envía un email a los destinatarios
   configurados con CTA a `/vehiculos/{id}#uso-{usageId}`.
6. "Sin entrega" no genera email ni alerta; solo incrementa el contador `sinEntrega` que
   se ve en Reportes.
7. El tooltip de la pill "Daño" en Reportes muestra "Daño registrado por: {nombre}"
   cuando el daño fue revisado.
