# TapCar — Documentos Vehiculares con NFC

App web para que **empresas con flota** gestionen la documentación de sus vehículos. Cada vehículo se vincula a un chip NFC: al acercar un smartphone se abre una **ficha pública de solo lectura** (`/v/<token>`) con sus documentos, pensada para fiscalización (ej. un carabinero valida la documentación). El equipo de la empresa gestiona vehículos y documentos tras iniciar sesión (según su rol), y recibe recordatorios por email antes de cada vencimiento.

Además de los documentos, la app lleva la **bitácora de uso de la flota**: quién usa cada vehículo y cuándo. Un padrón de conductores (sin cuentas, autenticados por **PIN**) permite **tomar y entregar** el vehículo desde la misma ficha pública, adjuntando fotos del tablero y la cabina; una **IA** (OpenRouter) lee esas fotos para estimar bencina, kilometraje y limpieza. Un panel de **flota** muestra el estado en vivo de cada vehículo (disponible / en uso por quién) y las alertas pendientes (daños, entregas no formalizadas), y la sección de **reportes** entrega responsabilidad por conductor y una bitácora filtrable de todos los usos.

- **Producción:** https://app.tapcar.cl
- **Contexto:** Chile. Documentos chilenos (Permiso de Circulación, Revisión Técnica, SOAP, Certificado de Gases, Padrón).

> Para el detalle de arquitectura, modelo de datos y convenciones, ver **[CLAUDE.md](CLAUDE.md)**.

## Stack

Next.js 16 (App Router, TypeScript estricto) · Tailwind CSS v4 · Firebase (Authentication, Cloud Firestore, Cloud Storage) · firebase-admin · Resend (emails) · **Vercel** (hosting, auto-deploy en push a `master`) + **Vercel Cron** (job diario de recordatorios).

## Modelo multi-tenant (equipo por empresa)

- `companies/{companyId}` — la empresa: datos tributarios + `plan` (cupo de vehículos).
- `users/{uid}` — perfil personal + `companyId` + `role` (`admin` | `editor` | `viewer`).
- La **flota** (`vehicles`/`documents`) se comparte por empresa (scope `companyId`).
- **Roles:** Visor (solo lee) · Editor (+ documentos) · Administrador (+ vehículos, facturación, datos de empresa, equipo y conductores). El enforcement vive en `/api/*` (`getMembership()` + `can(role, action)`); las reglas de Firestore son defensa en profundidad.
- **Equipo:** el Administrador invita miembros por correo (máx. 5 por empresa) desde Configuración; quien acepta se une automáticamente a esa empresa con el rol asignado.
- **Admin de plataforma** (aparte, allowlist `ADMIN_EMAILS`): panel `/admin` para configurar el cupo de cada empresa.

## Requisitos

- **Node.js** 20+
- Proyecto **Firebase/GCP** en plan **Blaze** (Storage)
- Cuenta **Resend** (emails de recordatorios)

## Configuración Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com) (plan Blaze).
2. **Authentication** → habilita **Google** y **Email/Password**.
   - **Settings → Authorized domains**: agrega tu dominio de producción (`app.tapcar.cl`) y `localhost`, o el login con Google fallará con `auth/unauthorized-domain`.
3. **Firestore Database** → crea la base en modo producción (región `southamerica-east1` para Chile).
4. **Storage** → crea el bucket. Las subidas requieren **CORS** en el bucket para el dominio de la app + `localhost`.
5. **Project Settings → Service Accounts** → genera una clave privada (JSON) para el Admin SDK; en **General**, copia la config web (claves públicas).

## Variables de entorno

Copia `.env.example` a `.env.local` y complétalo (`cp .env.example .env.local`). En Vercel, configúralas en **Settings → Environment Variables**.

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Config web (pública) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Admin SDK (servidor; secretas) |
| `RESEND_API_KEY` / `RESEND_FROM` | Envío de emails (`RESEND_FROM="TapCar <no-reply@tapcar.cl>"`) |
| `CRON_SECRET` | Autentica el cron de recordatorios (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | Base de los enlaces NFC públicos = `https://app.tapcar.cl`. Es **build-time** → redeploy al cambiarla |
| `ADMIN_EMAILS` | Correos (coma) de los admins de plataforma del panel `/admin` |
| `BILLING_EMAIL` | (Opcional) destino de las solicitudes de plan de `/facturacion`; si falta usa el primer `ADMIN_EMAILS` |
| `OPENROUTER_API_KEY` | Habilita el análisis con IA de las fotos de entrega (bencina/km/limpieza); sin ella el análisis no corre (best-effort) |
| `OPENROUTER_MODEL` | (Opcional) modelo de OpenRouter a usar; default `google/gemini-2.0-flash-001` |

## Comandos

```bash
npm run dev          # desarrollo local (usa .env.local)
npm run build        # build de producción (corre lint)
npm test             # Vitest (unit/integración)
npm run test:rules   # reglas Firestore — REQUIERE emulador + Java
npm run test:e2e     # Playwright — requiere dev server
npx tsc --noEmit     # typecheck
```

Scripts de operación (Admin SDK, cargan credenciales de prod desde `.env.local`):

```bash
node --env-file=.env.local scripts/migrate-multitenant.mjs        # migración one-time a multi-tenant (idempotente)
node --env-file=.env.local scripts/deploy-firestore-rules.mjs     # despliega firestore.rules sin CLI de Firebase
node --env-file=.env.local scripts/deploy-firestore-indexes.mjs   # crea los 3 índices compuestos de usages (requiere rol datastore.indexAdmin en el service account; también se pueden crear a mano en la consola de Firebase)
```

## Despliegue

- **App:** Vercel auto-despliega al hacer **push a `master`**.
- **Reglas de Firestore:** Vercel no las despliega. Usa el script `deploy-firestore-rules.mjs` (arriba) o `firebase deploy --only firestore:rules`.
- **Índices de Firestore:** tampoco los despliega Vercel. Usa `deploy-firestore-indexes.mjs` (arriba) o créalos a mano en la consola de Firebase; sin ellos, la bitácora filtrable de `/reportes` responde 503.
- **Recordatorios diarios:** configurados vía **Vercel Cron** en `vercel.json` (`GET /api/cron/reminders`, protegido con `Authorization: Bearer ${CRON_SECRET}` que Vercel inyecta).

## Chip NFC

El chip se graba con la URL pública de la ficha: `https://app.tapcar.cl/v/<publicToken>`. Grábalo como registro **URL/URI** (no "Texto") con una app externa como **NFC Tools** (Android/iOS) — el tipo URL/URI es necesario para que abra en iPhone. El token es opaco: permite leer la ficha, no modificarla. La app muestra el enlace y un tutorial (botón "i") en la página del vehículo.

## Seguridad

- **Enforcement primario en `/api/*`**: cada endpoint privado valida `getMembership()` + `can(role, action)`; nunca confía en `companyId`/`role` del cliente.
- **Reglas de Firestore** (`firestore.rules`): aíslan por `companyId` (defensa en profundidad; el camino real es Admin SDK server-side).
- **Ficha pública** (`/v/[token]`): resuelve por token vía servidor; no expone Firestore ni datos del dueño.
- **Cron** (`/api/cron/reminders`): exige `Authorization: Bearer ${CRON_SECRET}` (falla cerrado).

## Solución de problemas

- **Login con Google falla (`auth/unauthorized-domain`):** agrega el dominio a Firebase → Authentication → Settings → Authorized domains.
- **`NEXT_PUBLIC_*` no definidos:** usa `.env.local` (no `.env`) y reinicia `npm run dev`; en Vercel, redeploy tras cambiar una `NEXT_PUBLIC_*`.
- **Subida de archivos falla (CORS):** reaplica el CORS del bucket de Storage para el dominio actual.
- **`npm run test:rules` no corre:** requiere `firebase-tools` + Java (JDK 11+) y el emulador de Firestore.
