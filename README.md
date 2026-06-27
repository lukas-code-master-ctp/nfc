# Gestor de Fichas Vehiculares con NFC

Aplicación web para almacenar y gestionar documentos vehiculares, con fichas públicas accesibles vía código NFC y recordatorios automáticos de renovación.

## Descripción

Esta aplicación permite:
- Registrar y almacenar documentos vehiculares (póliza, permiso de circulación, revisión técnica, etc.)
- Generar fichas públicas de solo lectura mediante tokens públicos
- Escribir tokens públicos en chips NFC para acceso rápido a la ficha
- Recibir recordatorios automáticos vía email para renovaciones próximas
- Autenticación con Google o email/contraseña

**Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Firebase Authentication, Cloud Firestore, Cloud Storage, Resend (email), Cloud Scheduler.

---

## Requisitos

- **Node.js** 20 o superior
- **Cuenta Firebase/GCP** en plan Blaze (requerido para Cloud Scheduler y Cloud Storage)
- **Cuenta Resend** (para envío de emails de recordatorios)
- **firebase-tools** instalado globalmente: `npm install -g firebase-tools`

---

## Configuración Firebase

### 1. Crear un proyecto en Firebase Console

Ve a [Firebase Console](https://console.firebase.google.com) y crea un nuevo proyecto en el plan Blaze.

### 2. Habilitar autenticación

En **Authentication** (Autenticación):
- Habilita **Google** como proveedor
- Habilita **Email/Password** como proveedor

### 3. Crear base de datos Firestore

En **Firestore Database** (Base de datos):
- Crea una base de datos en modo **producción**
- Elige la región más cercana (ej. `southamerica-east1` para Chile)

### 4. Crear bucket de Cloud Storage

En **Storage** (Almacenamiento):
- Crea un bucket nuevo
- Elige la región correspondiente

### 5. Obtener credenciales

- Ve a **Project Settings** (Configuración del proyecto)
- En la pestaña **Service Accounts** (Cuentas de servicio):
  - Genera una nueva clave privada (JSON) para Firebase Admin SDK
- En la pestaña **General**:
  - Copia la configuración de Firebase (claves públicas para el cliente)

---

## Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores:

```bash
cp .env.example .env.local
```

### Firebase Cliente (públicas, prefijo `NEXT_PUBLIC_`)

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Obtén estos valores de Firebase Console → Configuración del proyecto → General → Configuración de aplicación web.

### Firebase Admin (servidor)

```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Obtén estos de la clave JSON de la cuenta de servicio descargada.

**Nota:** Si prefieres usar la clave JSON completa:
- Guarda el JSON en un archivo (ej. `firebase-key.json`)
- No la subas al repositorio (está en `.gitignore`)
- En el servidor, lee el archivo directamente si es necesario

### Resend

```
RESEND_API_KEY=
RESEND_FROM="Documentos Vehiculares <no-reply@tudominio.cl>"
```

Obtén la API key de [Resend Console](https://resend.com/api-keys).

### Aplicación

```
CRON_SECRET=
NEXT_PUBLIC_APP_URL=https://tudominio.cl
```

- `CRON_SECRET`: token secreto para autenticar Cloud Scheduler (genera uno seguro, ej. `openssl rand -hex 32`)
- `NEXT_PUBLIC_APP_URL`: URL pública de la aplicación (para emails y fichas públicas)

---

## Comandos

### Desarrollo

```bash
npm run dev
```

Inicia el servidor de desarrollo en `http://localhost:3000`.

### Testing

**Tests unitarios e integración:**
```bash
npm run test
```

**Tests en modo watch:**
```bash
npm run test:watch
```

**Tests de reglas Firestore:**
```bash
npm run test:rules
```

**Nota:** Este comando requiere:
- El emulador de Firestore instalado (firebase-tools)
- Java instalado en el sistema

**Tests E2E (Playwright):**
```bash
npm run test:e2e
```

**Nota:** Este comando requiere:
- El servidor de desarrollo ejecutándose (`npm run dev`)
- Credenciales reales de Firebase en `.env.local` (o usar el emulador de Firebase)
- La ruta `/v/[token]` necesita un token público válido en Firestore o usar el emulador

### Compilación

```bash
npm run build
```

Compila la aplicación para producción en la carpeta `.next`.

### Iniciar en producción

```bash
npm start
```

Inicia el servidor compilado.

### Linting

```bash
npm run lint
```

---

## Despliegue

### 1. Desplegar reglas Firestore

Antes de desplegar la aplicación, asegúrate de desplegar las reglas de seguridad:

```bash
firebase deploy --only firestore:rules
```

### 2. Desplegar en Firebase App Hosting

La configuración de Firebase App Hosting se encuentra en `apphosting.yaml`. 

Para desplegar:

```bash
firebase deploy --only apphosting
```

**Nota:** Las variables secretas (como `RESEND_API_KEY`, `FIREBASE_PRIVATE_KEY`, etc.) se configuran como **secretos de Firebase App Hosting**, no en el archivo `apphosting.yaml`.

---

## Cloud Scheduler: Recordatorios diarios

Para enviar recordatorios automáticos, configura un job en **Cloud Scheduler** de GCP:

### Crear el job

1. Ve a [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler)
2. Crea un nuevo job:
   - **Nombre:** `reminders-daily` (o similar)
   - **Frecuencia:** `0 9 * * *` (9:00 AM todos los días)
   - **Timezone:** `America/Santiago`
   - **Tipo de ejecución:** HTTP
   - **URL:** `https://<tudominio.cl>/api/cron/reminders`
   - **Método HTTP:** GET
   - **Headers HTTP:** Añade un header:
     ```
     Authorization: Bearer <CRON_SECRET>
     ```
     (reemplaza `<CRON_SECRET>` con el valor de tu variable de entorno)

### Verificación

El endpoint `/api/cron/reminders`:
- Valida el header `Authorization`
- Busca documentos que expiran en 30 días
- Envía emails de recordatorio vía Resend
- Retorna 200 OK si se ejecuta correctamente

---

## Chip NFC

El chip NFC se escribe con la URL pública de la ficha:

```
https://<tudominio.cl>/v/<publicToken>
```

**Nota:** La escritura del chip se realiza con una app externa (fuera del alcance de esta aplicación web). Algunas opciones:
- [NFC Tools](https://www.nfctools.com/) (iOS/Android)
- [TagWriter by NXP](https://www.nxp.com/products/wireless-connectivity/nfc/nfc-tools:NDEF-TAGWRITER-MAN) (Android)
- Cualquier app de lectura/escritura NFC que soporte URLs en NDEF

El token público es único y seguro; permite leer la ficha pero no modificarla.

---

## Estructura del proyecto

```
.
├── app/                    # Next.js App Router
│   ├── api/                # Rutas API
│   ├── (auth)/             # Rutas autenticadas
│   └── v/                  # Fichas públicas
├── lib/                    # Utilidades y configuración
│   ├── firebase.ts         # Cliente Firebase
│   ├── firestore.rules     # Reglas de seguridad Firestore
│   └── ...
├── components/             # Componentes React
├── public/                 # Archivos estáticos
├── .env.example            # Plantilla de variables de entorno
├── apphosting.yaml         # Configuración de Firebase App Hosting
└── README.md               # Este archivo
```

---

## Seguridad

- **Autenticación:** Firebase Authentication con proveedores Google y email/password
- **Autorización:** Reglas de Firestore que limitan acceso a documentos propios del usuario
- **Ficha pública:** Token público opaco que permite leer solo una ficha específica
- **Cloud Scheduler:** Protegido con token Bearer en header `Authorization`
- **Datos sensibles:** Claves privadas y tokens se almacenan en variables de entorno (no versionadas)

---

## Solución de problemas

### "NEXT_PUBLIC_* no definidos en cliente"

Asegúrate de:
- Haber creado `.env.local` (no `.env`)
- Haber reiniciado el servidor de desarrollo (`npm run dev`)

### "Error autenticando con Firebase"

- Verifica que `NEXT_PUBLIC_FIREBASE_PROJECT_ID` sea correcto
- Verifica que los proveedores (Google, Email) estén habilitados en Firebase Console

### "Error escribiendo en Firestore"

- Verifica que la base de datos Firestore exista
- Revisa que las reglas de Firestore hayan sido desplegadas (`firebase deploy --only firestore:rules`)

### "Emulador de Firestore no inicia"

Asegúrate de tener:
- `firebase-tools` instalado: `npm install -g firebase-tools`
- Java instalado (requiere JDK 11+)
- Ejecuta: `firebase emulators:start --only firestore`

---

## Contacto y soporte

Para reportar bugs o sugerencias, contacta al equipo de desarrollo.
