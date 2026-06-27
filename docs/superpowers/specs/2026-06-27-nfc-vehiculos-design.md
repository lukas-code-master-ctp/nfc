# Diseño — App de Documentos Vehiculares con NFC

**Fecha:** 2026-06-27
**Estado:** Aprobado (pendiente revisión final del usuario)

## 1. Resumen

Web app que centraliza la documentación de vehículos. Cada vehículo se vincula a un
chip NFC; al acercar un smartphone al chip se abre la ficha pública del vehículo con
toda su documentación. Objetivo: simplificar la fiscalización vehicular y mantener al
día los documentos mediante recordatorios automáticos.

Contexto: usuarios chilenos. Documentos vehiculares según normativa chilena.

## 2. Alcance

Producto completo (robusto, con validaciones, seguridad y tests). Funcionalidad v1:

- Autenticación (Google + email/contraseña).
- Panel con listado de vehículos del usuario, cada uno con badge de estado.
- Ficha privada del vehículo: ver info + documentos; agregar, actualizar, eliminar.
- Subida de archivos reales (PDF/imágenes) a almacenamiento en la nube.
- Ficha pública de solo lectura accesible vía token NFC (sin login).
- Recordatorios por email escalonados (30, 7 y 0 días antes del vencimiento).
- Indicadores visuales de estado en la app (al día / por vencer / vencido).

Fuera de alcance en v1: compartir vehículos entre usuarios, app móvil nativa,
escritura física del chip NFC desde la app (el chip se graba con la URL manualmente),
roles administrativos.

## 3. Stack tecnológico

| Capa | Elección |
|------|----------|
| Lenguaje/Framework | Next.js (TypeScript), App Router |
| Autenticación | Firebase Authentication (Google + Email/Password) |
| Base de datos | Cloud Firestore |
| Almacenamiento de archivos | Cloud Storage (GCS) |
| Emails | Resend |
| Cron / jobs | Cloud Scheduler → endpoint/Cloud Function |
| Hosting | Firebase App Hosting |

Decisión de base de datos: Firestore por ser serverless, integrar nativamente con
Firebase Auth y manejar bien la jerarquía simple usuario → vehículos → documentos.
Alternativa descartada: Cloud SQL (Postgres), por requerir administrar una instancia.
Migración futura posible si se necesita reportería relacional compleja.

## 4. Modelo de datos (Firestore)

### Colección `users/{uid}`
- `email: string`
- `displayName: string`
- `createdAt: timestamp`

### Colección `vehicles/{vehicleId}`
- `ownerUid: string` — dueño (referencia a users)
- `patente: string`
- `marca: string`
- `modelo: string`
- `anio: number`
- `color: string`
- `publicToken: string` — ID secreto (nanoid) embebido en el chip NFC
- `createdAt: timestamp`

### Colección `documents/{documentId}`
- `vehicleId: string`
- `ownerUid: string` — denormalizado para reglas de seguridad y queries
- `tipo: enum` — `permiso_circulacion | revision_tecnica | soap | certificado_gases | padron | otro`
- `nombrePersonalizado: string | null` — usado solo cuando `tipo == otro`
- `fechaVencimiento: timestamp | null` — opcional (ej. el padrón no vence)
- `fileUrl: string` — URL del archivo
- `filePath: string` — ruta en Cloud Storage (para borrado/firma)
- `remindersSent: string[]` — avisos ya enviados, ej. `["30","7","0"]`
- `createdAt: timestamp`

Notas:
- Colecciones de nivel superior (no subcolecciones) para simplificar reglas y queries
  por `ownerUid`.
- `publicToken` es la única clave de acceso a la ficha pública; debe ser largo y
  aleatorio (no adivinable). Regenerable si se pierde el chip.

## 5. Tipos de documento (Chile)

Lista fija + opción libre:
- `permiso_circulacion` — Permiso de Circulación
- `revision_tecnica` — Revisión Técnica
- `soap` — SOAP (Seguro Obligatorio)
- `certificado_gases` — Certificado de Gases / Emisiones
- `padron` — Padrón (no vence; `fechaVencimiento` opcional)
- `otro` — texto libre en `nombrePersonalizado`

## 6. Estado de documento (lógica de negocio)

Dado `fechaVencimiento` y la fecha actual:
- **vencido** (🔴): `fechaVencimiento < hoy`
- **por_vencer** (🟡): `0 <= díasRestantes <= 30`
- **al_dia** (🟢): `díasRestantes > 30`
- **sin_vencimiento** (⚪): `fechaVencimiento == null`

El estado del vehículo en el panel = el peor estado entre sus documentos
(vencido > por_vencer > al_dia).

## 7. Flujos clave

### 7.1 Login → Panel
Usuario inicia sesión (Google o email/contraseña) → ve listado de sus vehículos como
cards (patente, marca/modelo, badge de estado). Botón para registrar nuevo vehículo.

### 7.2 Ficha privada del vehículo
Click en vehículo → detalle con info editable + lista de documentos. Acciones:
- **Agregar documento:** subir archivo + seleccionar tipo + fecha de vencimiento.
- **Actualizar documento:** reemplazar archivo y/o fecha (resetea `remindersSent`).
- **Eliminar documento:** borra registro Firestore + archivo en Storage.
Cada documento muestra su estado por color.

### 7.3 Ficha pública (NFC)
El chip NFC contiene `https://<dominio>/v/{publicToken}`.
Al abrir la URL → página SSR de solo lectura, sin login, que muestra info del vehículo
y sus documentos (visibles/descargables vía URL firmada de corta expiración).
Un endpoint del servidor resuelve el `publicToken` contra Firestore usando credenciales
de servidor; Firestore nunca se expone directamente al público.

### 7.4 Recordatorios automáticos
Cloud Scheduler dispara un endpoint protegido 1 vez al día. El job:
1. Recorre documentos con `fechaVencimiento != null`.
2. Calcula días restantes.
3. Para cada hito (30, 7, 0) cumplido y aún no enviado (`remindersSent` no lo contiene):
   envía email vía Resend al dueño y agrega el hito a `remindersSent`.

## 8. Arquitectura de componentes

```
/app
  /(auth)/login                 → pantalla de login
  /(app)/dashboard              → panel: listado de vehículos (privado)
  /(app)/vehiculos/[id]         → ficha privada del vehículo (privado)
  /v/[publicToken]              → ficha pública NFC (SSR, sin auth)
  /api/cron/reminders           → endpoint del job diario (protegido por secreto)
  /api/documents/[id]/file      → genera URL firmada para descarga
/lib
  /firebase                     → init cliente y admin (server) de Firebase
  /documents                    → lógica de estado y recordatorios (testeable, pura)
  /auth                         → helpers de sesión
/components                     → UI (cards, badges, formularios, uploader)
```

Principios:
- La lógica de negocio pura (estado de documento, selección de recordatorio) vive en
  `/lib/documents` sin dependencias de Firebase → testeable de forma aislada.
- Acceso a datos centralizado; los componentes no hablan con Firestore directamente
  más allá de hooks bien definidos.

## 9. Seguridad

- **Reglas de Firestore:** un usuario solo puede leer/escribir `vehicles` y `documents`
  donde `ownerUid == request.auth.uid`.
- **Ficha pública:** servida solo a través de un endpoint server que valida el
  `publicToken`; el cliente público nunca recibe credenciales de Firestore.
- **Token NFC:** largo y aleatorio (nanoid). Regenerable desde la ficha privada si el
  chip se pierde o se reasigna.
- **Archivos:** URLs firmadas de Cloud Storage con expiración corta.
- **Endpoint de cron:** protegido por un secreto compartido / verificación de origen
  de Cloud Scheduler.

## 10. Estrategia de testing

- **Unit:** lógica de estado de documentos (al día / por vencer / vencido /
  sin vencimiento) y cálculo de qué recordatorio corresponde enviar.
- **Integración:** reglas de Firestore (aislamiento entre usuarios), endpoint público
  por token, endpoint de recordatorios (no reenviar avisos ya marcados).
- **E2E (Playwright):** login → crear vehículo → subir documento → abrir ficha pública
  por token.

## 11. Riesgos y consideraciones

- **Privacidad de la ficha pública:** expone documentos del vehículo a cualquiera con
  el token. Es intencional para fiscalización. Mitigación: token no adivinable y
  posibilidad de regenerarlo.
- **Costos GCP:** Firestore/Storage/App Hosting bajo plan Blaze; volumen v1 esperado bajo.
- **Zona horaria:** el cálculo de vencimientos usa la zona horaria de Chile para evitar
  desfases de ±1 día.
- **Grabado del chip NFC:** fuera de alcance v1; la URL se escribe en el chip con una
  app externa de NFC. La app solo provee la URL/token.
