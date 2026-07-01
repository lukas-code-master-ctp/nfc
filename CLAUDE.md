@AGENTS.md

# TapCar (Documentos Vehiculares NFC)

**Nombre del producto: TapCar** (dominio elegido: `tapcar.cl`, disponible al 2026-06-28 — aún sin registrar; marca INAPI sin verificar). Combina el gesto NFC (*Tap*) + vehículo (*Car*).

App web para almacenar la documentación de vehículos. Cada vehículo se vincula a un chip NFC: al acercar un smartphone se abre una **ficha pública de solo lectura** (`/v/<token>`) con sus documentos, pensada para fiscalización vehicular (ej. un carabinero valida los documentos). El dueño gestiona vehículos y documentos tras iniciar sesión, y recibe recordatorios por email antes de cada vencimiento.

Contexto: usuarios de **Chile**. Documentos vehiculares chilenos (Permiso de Circulación, Revisión Técnica, SOAP, Certificado de Gases, Padrón).

## Idioma

Todo el código, UI, comentarios y mensajes en **español neutro (Chile)**. Usa "tú" (no "vos").

## Stack

- **Next.js 16** (App Router, TypeScript estricto) — OJO: APIs cambiadas respecto a versiones anteriores, ver AGENTS.md.
- **Tailwind CSS v4** — tokens de color definidos en `app/globals.css` con `@theme` (NO hay `tailwind.config`).
- **Firebase**: Authentication (Google + email/contraseña), Cloud Firestore, Cloud Storage. Proyecto: `nfc-vehiculo`.
- **firebase-admin** (servidor) + Firebase JS SDK (cliente).
- **Resend** para emails. **Vercel Cron** para el job diario de recordatorios.
- Tests: **Vitest** (unit/integración), `@firebase/rules-unit-testing` (reglas), **Playwright** (E2E).
- Despliegue: **Vercel** (prod: https://nfc-roan-nine.vercel.app).

## Comandos

```bash
npm run dev          # desarrollo local (usa .env.local)
npm run build        # build de producción (corre lint)
npm test             # Vitest (unit/integración)
npm run test:rules   # reglas Firestore — REQUIERE emulador + Java
npm run test:e2e     # Playwright — requiere dev server
npx tsc --noEmit     # typecheck
```

Tras cambios de código: corre `npx tsc --noEmit` y `npm run build` antes de commitear. Vercel **auto-despliega** al hacer push a `master`.

## Arquitectura

- `lib/types.ts` — tipos del dominio (`Vehicle` con `info?: VehicleInfo`, `VehicleDocument`, `CompanyData`, `UserProfile` con `plan: PlanData`, enums de tipos de documento) + helpers de dominio: `VEHICLE_INFO_FIELDS` (campos/labels de "Sobre el vehículo"), `DOCUMENT_TYPES_SIN_VENCIMIENTO` + `tipoTieneVencimiento()` (el **Padrón no vence** → sin campo de fecha, forzado también en el servidor).
- `lib/plan.ts` / `lib/billing.ts` — lógica pura de cupo del plan y de precios (ver Modelo de datos).
- `lib/documents/` — **lógica de negocio pura, sin Firebase** (testeable): `status.ts` (estado de documento: al_dia/por_vencer/vencido/sin_vencimiento, zona horaria `America/Santiago`), `reminders.ts` (qué recordatorio toca: hitos 30/7/0 días), `runReminders.ts` (job con dependencias inyectadas).
- `lib/firebase/` — `client.ts` (SDK navegador) y `admin.ts` (Admin SDK). Ambos con **init lazy** (ver Gotchas).
- `lib/data/` — acceso a Firestore vía Admin SDK (`vehicles.ts`, `documents.ts`, `profile.ts`, `admin.ts` → `listAllUsers`, `billing.ts` → `createBillingRequest`). Toda mutación valida `ownerUid`. `deleteVehicle` borra en cascada documentos + archivos.
- `lib/auth/` — `constants.ts` (`SESSION_COOKIE`, sin imports), `session.ts` (`getCurrentUser`), `admin.ts` (`isAdminEmail`, allowlist por env), `AuthProvider.tsx` (contexto cliente).
- `lib/storage/signedUrls.ts` — signed URLs de subida/lectura de Cloud Storage.
- `lib/email/` — copy de recordatorios (puro) + cliente Resend (`getResend()` lazy).
- `app/(auth)/login`, `app/(app)/*` (dashboard, vehiculos/[id], perfil, facturacion, **admin** — con `layout.tsx` que pone la barra superior con **logo TapCar** + avatar y exige sesión), `app/v/[token]` (ficha pública), `app/api/*` (route handlers: vehicles [+`/[id]`, `/[id]/token`], documents [+`/[id]`, `/upload-url`], session, cron/reminders, profile, account, **admin/users/[uid]**, **billing/request**). Favicon en `app/icon.svg`.
- `components/` — UI. Reutilizables clave: `brand/Logo` (`TapCarIsotipo`/`TapCarWordmark`/`TapCarLockup`), `StatusBadge` (variantes `document`/`vehicle`), `PasswordInput` (toggle ojito), `UserMenu` (avatar + menú; muestra "Administración" solo a admins), `BackLink` (flecha volver), `InfoTip` (botón "i" + popover), `LoadingDots` (puntitos de carga). Dashboard: `VehiclesBoard` + `NewVehicleModal`. Vehículo: `NfcTokenPanel`, `DocumentForm`/`DocumentEditForm`/`DocumentList`, `VehicleInfoForm`, `DeleteVehicleButton`. `profile/*`, `admin/*`, `billing/*`. Diseño en `docs/superpowers/specs/` y plan en `docs/superpowers/plans/`.

### Modelo de datos (Firestore)
- `vehicles/{id}` y `documents/{id}` — colecciones de nivel superior con `ownerUid` denormalizado. `vehicles/{id}` incluye `info?` (`VehicleInfo`: combustible, presión/medida de neumáticos, transmisión, aceite, estanque, notas — todo opcional; campos y labels en `VEHICLE_INFO_FIELDS`). El dueño lo edita en `components/VehicleInfoForm.tsx`. La **ficha pública** (`app/v/[token]`, `PublicVehicleView`) tiene dos pestañas (pills): **Documentación** y **Sobre el vehículo** (muestra los `info` que estén llenos), pensada para que quien maneje el auto lo conozca.
- `users/{uid}` — perfil del usuario: `displayName` + `company` (`CompanyData`: razón social, RUT, giro, dirección, teléfono) + `plan` (`PlanData`: `maxVehiculos`, mínimo 1). Capa: `lib/data/profile.ts`; endpoints `/api/profile` (GET/PATCH — **solo `displayName`/`company`**, nunca `plan`) y `/api/account` (DELETE, borra todo + usuario de Auth).
- **Cupo del plan**: `plan.maxVehiculos` limita cuántos vehículos puede crear el usuario. Lógica pura en `lib/plan.ts` (`maxVehiculos`, `planCapacity`); default `DEFAULT_PLAN` (3). Se **enforca en el servidor** (`POST /api/vehicles` responde 409 `plan_limit` al tope) y se muestra en el dashboard (`components/VehiclesBoard.tsx`: slots fantasma "+ Nuevo vehículo" por cupo disponible, texto "M disponibles" y CTA "Agrega vehículos a tu plan" cuando está lleno; alta vía `components/NewVehicleModal.tsx`). **Lo configura un admin**, no el usuario.
- **Panel admin** (`/admin`): lo configuran los admins de la plataforma. Admins = allowlist por env `ADMIN_EMAILS` (`lib/auth/admin.ts` → `isAdminEmail`, falla cerrado). La ruta `app/(app)/admin` hace `notFound()` si no es admin; lista todos los usuarios (`lib/data/admin.ts` → `listAllUsers`, cruza Auth + perfil + conteo de vehículos) y edita `maxVehiculos` vía `PATCH /api/admin/users/[uid]` (revalida admin, mínimo 1). El acceso aparece en `UserMenu` solo para admins. **Escalas pendientes**: paginación de `listUsers` (>1000) y gestión de admins desde la UI (hoy solo por env).
- **Facturación (modelo concierge, sin pasarela aún)**: suscripción **por vehículo** ($2.990 c/u·mes); tag NFC incluido en planes de 5+ (pagas envío), $1.000 + envío si <5; **factura electrónica SII** indispensable a futuro. Lógica pura en `lib/billing.ts`. La tab `/facturacion` muestra el plan (cupo × precio) + regla del tag + un formulario que **registra la solicitud en `billingRequests/{id}`** (`lib/data/billing.ts`) y notifica por email (best-effort, `sendBillingRequestEmail`) a `BILLING_EMAIL` (o el primer `ADMIN_EMAILS`). El cobro/factura se coordinan a mano por ahora. **Pendiente (Fase 2)**: pasarela (Flow/Mercado Pago, facturación de cantidad variable manejada por nosotros) + DTE mensual automático; ahí el billing pasa a alimentar `plan.maxVehiculos`.
- **Alcance actual: 1 empresa por usuario** (los vehículos pertenecen al usuario vía `ownerUid`). Multi-usuario por empresa (roles, invitaciones, vehículos de la empresa) sería una fase aparte y un cambio de modelo.

### Seguridad
- Reglas de Firestore aíslan datos por `ownerUid == request.auth.uid` (`firestore.rules`).
- `/api/*` privados validan `getCurrentUser()` y propiedad antes de actuar; nunca confían en `ownerUid` del cliente.
- `/v/[token]` (pública) resuelve por token vía servidor; no expone Firestore al cliente ni datos del dueño.
- `/api/cron/reminders` exige `Authorization: Bearer ${CRON_SECRET}` (falla cerrado si el secreto no está).

## Diseño / UI

Tokens en `app/globals.css` (`@theme`): `tinta` (texto), `acero` (texto 2º), `linea` (bordes), `lienzo` (fondo), `superficie` (cards), `azul`/`azul-press` (primario), `ambar`, estados `vigente`/`por-vencer`/`vencido`. Cards blancas con sombra suave sobre fondo lienzo; badges tipo pill. Sin dark mode. Iconos SVG inline (no emojis).

**Marca TapCar**: logo (auto + ondas NFC, azul de marca) vía `components/brand/Logo.tsx`; SVG fuente en `Brand/` y servibles en `public/brand/` (isotipo, lockup, apilado, favicon + variantes oscuras para un futuro dark mode). El wordmark "**Tap**Car" usa la tipografía real de la app (Geist), no el texto incrustado en el SVG.

## Gotchas (errores ya resueltos — NO reintroducir)

- **Next 16 `params` es async**: en páginas y route handlers dinámicos, `params` (y `searchParams`) son `Promise`. Tipar `params: Promise<{ id: string }>` y `await params`. Igual `cookies()` es async (`await cookies()`).
- **`jose` debe quedar en v5**: `package.json` tiene `overrides: { jose: "^5.9.6" }`. firebase-admin → jwks-rsa hace `require()` de `jose`, y `jose@6` es ESM-only → rompe en el runtime de Vercel con `ERR_REQUIRE_ESM` (500 en `/api/session`). NO actualizar jose a 6 sin que jwks-rsa use `import()` dinámico. `next.config.ts` también externaliza estos paquetes (`serverExternalPackages`).
- **Init lazy de Firebase obligatorio**: `lib/firebase/admin.ts` y `client.ts` difieren la init a primer uso (patrón Proxy). Si se inicializa en module-scope, el build de Vercel falla sin credenciales. Igual `getResend()` en `lib/email/resend.ts`.
- **CORS de Cloud Storage**: las subidas (`PUT` a signed URL) requieren CORS en el bucket. Ya configurado para el dominio Vercel + localhost. Si cambia el dominio, reaplicar `bucket.setCorsConfiguration`.
- **Middleware en edge**: `middleware.ts` solo importa `SESSION_COOKIE` de `lib/auth/constants` (sin firebase-admin), o rompe el edge runtime.
- **Vitest 4**: mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(() => ({...}))`.
- **Tests de reglas/E2E**: requieren emulador de Firestore (Java) o credenciales reales; corren en CI, no necesariamente en local.

## Variables de entorno

Ver `.env.example`. Las `NEXT_PUBLIC_FIREBASE_*` son públicas (config web). `FIREBASE_PRIVATE_KEY` y `CRON_SECRET` son secretos. En Vercel, Vercel Cron inyecta el `Authorization: Bearer ${CRON_SECRET}` solo. `NEXT_PUBLIC_APP_URL` debe ser la URL de producción (base de los enlaces NFC). `ADMIN_EMAILS` (correos separados por coma) define los admins del panel `/admin`; **debe setearse en Vercel** o no habrá admins en producción. `BILLING_EMAIL` (opcional) define a dónde llegan las solicitudes de plan de `/facturacion`; si se omite, usa el primer `ADMIN_EMAILS`.
