# Sprint de mejoras: flota, conductores, admin y ficha pública

**Fecha:** 2026-07-05
**Estado:** aprobado (pendiente de planes de implementación)

Cinco sub-proyectos independientes, ordenados de menor a mayor. Se ejecutan con
**dos planes**: Plan 1 = A+B+C (flota + conductores), Plan 2 = D+E (admin +
ficha pública). Cada plan con su ciclo spec → plan → subagentes → review → merge.

## A — Flota: cards de vehículo a ancho completo

`components/flota/FlotaGrid.tsx` usa `grid gap-3 sm:grid-cols-2`. Pasa a lista
de **una columna** (cards a todo el ancho), como pidió el usuario. Sin otros
cambios de contenido.

## B — PIN de conductor visible + "Actualizar PIN"

**Decisión (usuario):** guardar el PIN **recuperable** para poder mostrarlo.
Trade-off aceptado: comodidad del administrador (recordar el PIN a un conductor
que lo olvidó) sobre la práctica de hash-only. Mitigación: la colección
`drivers` está bloqueada al cliente (`firestore.rules`); el PIN solo viaja por
el endpoint solo-Administrador.

- `drivers/{id}` gana `pin: string` (texto plano) **junto** al `pinHash`
  existente. La **verificación no cambia**: sigue scrypt (`verifyDriverPin`) +
  bloqueo de intentos. El campo `pin` es solo para mostrarlo al admin.
- `createDriver` y `resetDriverPin` guardan ambos (`pin` + `pinHash`).
- `GET /api/conductores` (ya gateado por `driver:manage`) incluye `pin` por
  conductor (`string | null`).
- UI `components/drivers/DriversCard.tsx`, por fila:
  - PIN como `••••` + botón **ojito** (revela/oculta localmente, mismo patrón
    visual de `PasswordInput`).
  - El botón "PIN" pasa a **"Actualizar PIN"**: input inline de 4 dígitos +
    guardar (usa el PATCH existente de reset).
- **Sin migración**: conductores creados antes no tienen `pin` recuperable →
  la UI muestra `—` (title: "PIN asignado antes de este cambio; actualízalo
  para verlo"). El hash sigue funcionando para tomar/entregar.

## C — Importar conductores pegando desde Excel

**Decisión (usuario):** pegar filas copiadas desde Excel/Sheets (no subir
archivo). Cero dependencias nuevas.

- Botón **"Importar"** en `DriversCard` → se abre un panel con `textarea`:
  el admin pega filas `nombre ⇥ rut ⇥ pin` (separador: tab; fallback `;` y
  `,` si la línea no tiene tab). `rut` y `pin` opcionales.
- **Parser puro** (`lib/drivers/importar.ts`, testeable):
  `parseImportacion(texto, nombresExistentes): FilaImport[]` donde cada fila
  queda `ok` | `sin_nombre` | `pin_invalido` | `duplicado`:
  - nombre requerido (trim, no vacío);
  - pin: 4 dígitos o vacío → si vacío, **se genera aleatorio de 4 dígitos**
    (el admin lo puede ver después gracias a B);
  - duplicado = nombre ya existente en el padrón o repetido en el pegado
    (case-insensitive) → se omite.
- **Vista previa** en tabla con el estado por fila y el PIN que quedará;
  botón "Crear N conductores" + "Cancelar".
- `POST /api/conductores/import` (`driver:manage`): recibe las filas ya
  válidas, **re-valida en el servidor** (mismo parser), tope **100 filas**,
  crea con `createDriver`, responde `{ creados, omitidos }`.

## D — Admin de plataforma: eliminar una empresa (+ 2 fixes de deuda)

**Decisión (usuario):** borrar la **empresa completa + usuarios de Auth** de
sus miembros, con confirmación fuerte.

**Deuda encontrada en `DELETE /api/account`** (pre-multi-tenant), se arregla
en este sub-proyecto:
1. No borra `drivers`, `usages`, `alertas` ni `invitations` de la empresa
   (huérfanos).
2. **Bug**: cualquier miembro (incluso Visor) que borra su cuenta borra la
   empresa entera.

Diseño:
- **`deleteCompanyCascade(companyId)`** compartido (en `lib/data/companies.ts`):
  1. vehículos vía `deleteVehicle` (ya cascadea documentos + archivos Storage);
  2. `drivers`, `usages`, `alertas`, `invitations`, `billingRequests` de la
     empresa (batch por `companyId`);
  3. perfiles `users` de los miembros + sus usuarios de **Firebase Auth**
     (best-effort por usuario: si uno falla, sigue con el resto y reporta);
  4. el doc `companies/{id}`.
- **`DELETE /api/admin/companies/[id]`**: revalida `isAdminEmail` (fail-closed),
  llama al cascade. UI en `AdminCompaniesTable`: botón "Eliminar" por fila →
  confirmación fuerte (escribir `ELIMINAR`) mostrando qué se borrará
  (N vehículos, miembros). Sin deshacer.
- **Fix `/api/account`**: si el solicitante es **dueño** (`ownerUid`) → usa el
  cascade completo; si es **miembro no-dueño** → borra solo su perfil + su
  usuario de Auth (la empresa y los demás quedan intactos).

## E — Ficha pública NFC: menú inicial

**Decisión (usuario):** menú → 3 vistas; el botón Tomar/Entregar **solo
aparece si la empresa tiene conductores activos**.

- `/v/<token>` abre con: header del vehículo (igual que hoy) + **menú de
  botones grandes**:
  1. **"Tomar vehículo"** o **"Entregar vehículo"** según haya uso abierto
     (subtítulo: "En uso por X · desde H"). Solo se muestra si
     `listActiveDrivers(companyId)` no está vacío (dato que la página ya
     carga server-side).
  2. **"Documentos del vehículo"** → la vista de documentación actual
     (badges de estado, pensada para fiscalización).
  3. **"Información del vehículo"** → la vista "Sobre el vehículo" actual.
- Navegación **client-side** (estado local en `PublicVehicleView`; sin rutas
  nuevas). Cada vista con "← Volver" al menú. Reemplaza las pestañas (pills)
  actuales.
- Los flujos Tomar/Entregar (`UsoPanel`) no cambian de lógica: solo se
  montan dentro de la vista 1 en vez del banner superior.

## Seguridad / no-regresión

- Todos los endpoints nuevos validan `getMembership()` + `can(role, ...)`
  (o `isAdminEmail` para admin de plataforma). Nada confía en el cliente.
- La verificación de PIN no cambia (scrypt + bloqueo). El PIN recuperable
  nunca se expone en la ficha pública ni a roles sin `driver:manage`.
- El cascade de empresa es **server-side** con confirmación fuerte en UI;
  `/api/account` mantiene su semántica para el dueño y se corrige para
  miembros.
- Firestore Admin rechaza `undefined` → los objetos nuevos se construyen sin
  claves undefined (gotcha conocido).

## Tests

- Parser de importación (`lib/drivers/importar.ts`): casos ok, sin nombre,
  pin inválido, pin vacío → generado, duplicado contra padrón y dentro del
  pegado, separadores tab/`;`/`,`.
- `deleteCompanyCascade`: unit con mocks (borra todas las colecciones por
  companyId; Auth best-effort).
- `/api/account`: dueño → cascade; no-dueño → solo él.
- `/api/admin/companies/[id]` DELETE: 404 si no es admin de plataforma.
- Endpoints de conductores: `pin` presente en GET; import re-valida y respeta
  el tope.

## Fuera de alcance (YAGNI)

- Subir archivo .xlsx real (se eligió pegar).
- Migración de PINs antiguos (imposible: solo hay hash).
- Export CSV de reportes, foto del daño, editor manual sin IA (pendientes
  previos, no entran en este sprint).
