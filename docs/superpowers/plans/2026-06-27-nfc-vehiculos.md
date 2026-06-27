# App de Documentos Vehiculares con NFC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una web app donde un usuario gestiona la documentación de sus vehículos, cada vehículo se vincula a un chip NFC que abre una ficha pública de solo lectura, con recordatorios por email de vencimientos.

**Architecture:** Next.js (App Router, TypeScript) full-stack. Firebase Authentication para login, Cloud Firestore para datos, Cloud Storage para archivos, Resend para emails y Cloud Scheduler para el job diario de recordatorios. La lógica de negocio pura (estado de documento y selección de recordatorio) vive aislada en `/lib/documents` sin dependencias de Firebase, para ser testeable. El acceso a Firestore desde el servidor usa el Admin SDK; las reglas de seguridad aíslan datos por usuario.

**Tech Stack:** Next.js 14+, TypeScript, Firebase (Auth + Firestore + Storage), firebase-admin, Resend, Vitest (unit/integración), @firebase/rules-unit-testing (reglas), Playwright (E2E), nanoid, Tailwind CSS.

## Global Constraints

- Lenguaje: TypeScript estricto (`"strict": true` en tsconfig).
- Zona horaria para cálculo de vencimientos: `America/Santiago` (Chile).
- Tipos de documento (enum exacto): `permiso_circulacion | revision_tecnica | soap | certificado_gases | padron | otro`.
- Hitos de recordatorio (días antes del vencimiento): `30`, `7`, `0`.
- `publicToken` generado con `nanoid` de 21 caracteres.
- Colecciones Firestore de nivel superior: `users`, `vehicles`, `documents` (no subcolecciones).
- `ownerUid` denormalizado en `vehicles` y `documents`.
- Toda escritura/lectura privada filtrada por `ownerUid == request.auth.uid`.
- Textos de UI en español (Chile).

---

## Fase 0 — Fundación

### Task 1: Scaffold del proyecto Next.js + Tailwind + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: proyecto Next.js ejecutable (`npm run dev`), runner Vitest (`npm test`).

- [ ] **Step 1: Crear el proyecto base**

Ejecutar en la raíz del repo:

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --no-turbopack
```

Si pregunta por sobrescribir archivos existentes (docs/, .gitignore), conservar los existentes.

- [ ] **Step 2: Instalar dependencias del proyecto**

```bash
npm install firebase firebase-admin nanoid resend
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @firebase/rules-unit-testing @playwright/test
```

- [ ] **Step 3: Configurar Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
```

Agregar a `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Escribir un smoke test**

Create `lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runner funciona', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Crear `.env.example`**

Create `.env.example`:

```bash
# Firebase cliente (público)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (servidor) — service account JSON en una línea o variables separadas
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM="Documentos Vehiculares <no-reply@tudominio.cl>"

# Cron
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 6: Verificar test y build**

Run: `npm test`
Expected: PASS (smoke test verde)

Run: `npm run build`
Expected: build exitoso

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Tailwind + Vitest"
```

---

### Task 2: Tipos del dominio

**Files:**
- Create: `lib/types.ts`
- Test: `lib/__tests__/types.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type DocumentType = 'permiso_circulacion' | 'revision_tecnica' | 'soap' | 'certificado_gases' | 'padron' | 'otro'`
  - `interface Vehicle { id, ownerUid, patente, marca, modelo, anio, color, publicToken, createdAt }`
  - `interface VehicleDocument { id, vehicleId, ownerUid, tipo, nombrePersonalizado, fechaVencimiento, fileUrl, filePath, remindersSent, createdAt }`
  - `const DOCUMENT_TYPE_LABELS: Record<DocumentType, string>`
  - `const REMINDER_MILESTONES = [30, 7, 0] as const`

- [ ] **Step 1: Escribir el test**

Create `lib/__tests__/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DOCUMENT_TYPE_LABELS, REMINDER_MILESTONES } from '@/lib/types'

describe('tipos del dominio', () => {
  it('tiene etiqueta para cada tipo de documento', () => {
    expect(DOCUMENT_TYPE_LABELS.permiso_circulacion).toBe('Permiso de Circulación')
    expect(DOCUMENT_TYPE_LABELS.revision_tecnica).toBe('Revisión Técnica')
    expect(DOCUMENT_TYPE_LABELS.soap).toBe('SOAP')
    expect(DOCUMENT_TYPE_LABELS.certificado_gases).toBe('Certificado de Gases')
    expect(DOCUMENT_TYPE_LABELS.padron).toBe('Padrón')
    expect(DOCUMENT_TYPE_LABELS.otro).toBe('Otro')
  })

  it('define los hitos de recordatorio', () => {
    expect(REMINDER_MILESTONES).toEqual([30, 7, 0])
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- types`
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar los tipos**

Create `lib/types.ts`:

```ts
export type DocumentType =
  | 'permiso_circulacion'
  | 'revision_tecnica'
  | 'soap'
  | 'certificado_gases'
  | 'padron'
  | 'otro'

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  permiso_circulacion: 'Permiso de Circulación',
  revision_tecnica: 'Revisión Técnica',
  soap: 'SOAP',
  certificado_gases: 'Certificado de Gases',
  padron: 'Padrón',
  otro: 'Otro',
}

export const REMINDER_MILESTONES = [30, 7, 0] as const

export interface Vehicle {
  id: string
  ownerUid: string
  patente: string
  marca: string
  modelo: string
  anio: number
  color: string
  publicToken: string
  createdAt: string // ISO
}

export interface VehicleDocument {
  id: string
  vehicleId: string
  ownerUid: string
  tipo: DocumentType
  nombrePersonalizado: string | null
  fechaVencimiento: string | null // ISO date (YYYY-MM-DD)
  fileUrl: string
  filePath: string
  remindersSent: string[] // p.ej. ['30','7','0']
  createdAt: string // ISO
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/__tests__/types.test.ts
git commit -m "feat: tipos del dominio (vehículo, documento, enums)"
```

---

## Fase 1 — Lógica de negocio pura (TDD)

### Task 3: Estado de documento

**Files:**
- Create: `lib/documents/status.ts`
- Test: `lib/documents/__tests__/status.test.ts`

**Interfaces:**
- Consumes: `DocumentType` de `@/lib/types`.
- Produces:
  - `type DocStatus = 'al_dia' | 'por_vencer' | 'vencido' | 'sin_vencimiento'`
  - `function daysUntil(fechaVencimiento: string | null, now: Date): number | null`
  - `function documentStatus(fechaVencimiento: string | null, now: Date): DocStatus`
  - `function worstStatus(statuses: DocStatus[]): DocStatus`

- [ ] **Step 1: Escribir el test**

Create `lib/documents/__tests__/status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { daysUntil, documentStatus, worstStatus } from '@/lib/documents/status'

const now = new Date('2026-06-27T12:00:00-04:00')

describe('daysUntil', () => {
  it('null cuando no hay fecha', () => {
    expect(daysUntil(null, now)).toBeNull()
  })
  it('positivo en el futuro', () => {
    expect(daysUntil('2026-07-27', now)).toBe(30)
  })
  it('cero el mismo día', () => {
    expect(daysUntil('2026-06-27', now)).toBe(0)
  })
  it('negativo si ya pasó', () => {
    expect(daysUntil('2026-06-20', now)).toBe(-7)
  })
})

describe('documentStatus', () => {
  it('sin_vencimiento cuando no hay fecha', () => {
    expect(documentStatus(null, now)).toBe('sin_vencimiento')
  })
  it('vencido cuando la fecha ya pasó', () => {
    expect(documentStatus('2026-06-26', now)).toBe('vencido')
  })
  it('por_vencer dentro de 30 días inclusive', () => {
    expect(documentStatus('2026-06-27', now)).toBe('por_vencer')
    expect(documentStatus('2026-07-27', now)).toBe('por_vencer')
  })
  it('al_dia a más de 30 días', () => {
    expect(documentStatus('2026-07-28', now)).toBe('al_dia')
  })
})

describe('worstStatus', () => {
  it('prioriza vencido', () => {
    expect(worstStatus(['al_dia', 'vencido', 'por_vencer'])).toBe('vencido')
  })
  it('por_vencer sobre al_dia', () => {
    expect(worstStatus(['al_dia', 'por_vencer'])).toBe('por_vencer')
  })
  it('al_dia si todos al día', () => {
    expect(worstStatus(['al_dia', 'al_dia'])).toBe('al_dia')
  })
  it('sin_vencimiento si lista vacía', () => {
    expect(worstStatus([])).toBe('sin_vencimiento')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- status`
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar**

Create `lib/documents/status.ts`:

```ts
export type DocStatus = 'al_dia' | 'por_vencer' | 'vencido' | 'sin_vencimiento'

const MS_PER_DAY = 1000 * 60 * 60 * 24

// Calcula días entre hoy y la fecha de vencimiento en zona horaria de Chile,
// comparando fechas calendario (sin horas) para evitar desfases de ±1 día.
function chileDateParts(d: Date): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, day] = fmt.format(d).split('-').map(Number)
  return { y, m, day }
}

export function daysUntil(fechaVencimiento: string | null, now: Date): number | null {
  if (!fechaVencimiento) return null
  const { y, m, day } = chileDateParts(now)
  const today = Date.UTC(y, m - 1, day)
  const [vy, vm, vd] = fechaVencimiento.split('-').map(Number)
  const venc = Date.UTC(vy, vm - 1, vd)
  return Math.round((venc - today) / MS_PER_DAY)
}

export function documentStatus(fechaVencimiento: string | null, now: Date): DocStatus {
  const d = daysUntil(fechaVencimiento, now)
  if (d === null) return 'sin_vencimiento'
  if (d < 0) return 'vencido'
  if (d <= 30) return 'por_vencer'
  return 'al_dia'
}

const RANK: Record<DocStatus, number> = {
  vencido: 3,
  por_vencer: 2,
  al_dia: 1,
  sin_vencimiento: 0,
}

export function worstStatus(statuses: DocStatus[]): DocStatus {
  if (statuses.length === 0) return 'sin_vencimiento'
  return statuses.reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'sin_vencimiento' as DocStatus)
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- status`
Expected: PASS (todos verdes)

- [ ] **Step 5: Commit**

```bash
git add lib/documents/status.ts lib/documents/__tests__/status.test.ts
git commit -m "feat: lógica pura de estado de documento"
```

---

### Task 4: Selección de recordatorios

**Files:**
- Create: `lib/documents/reminders.ts`
- Test: `lib/documents/__tests__/reminders.test.ts`

**Interfaces:**
- Consumes: `daysUntil` de `@/lib/documents/status`, `REMINDER_MILESTONES` de `@/lib/types`.
- Produces:
  - `function dueReminder(fechaVencimiento: string | null, remindersSent: string[], now: Date): string | null`
    — devuelve el hito (`'30'|'7'|'0'`) que corresponde enviar ahora y aún no fue enviado, o `null`.

- [ ] **Step 1: Escribir el test**

Create `lib/documents/__tests__/reminders.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { dueReminder } from '@/lib/documents/reminders'

const now = new Date('2026-06-27T12:00:00-04:00')

describe('dueReminder', () => {
  it('null sin fecha de vencimiento', () => {
    expect(dueReminder(null, [], now)).toBeNull()
  })
  it("devuelve '30' cuando faltan exactamente 30 días y no se ha enviado", () => {
    expect(dueReminder('2026-07-27', [], now)).toBe('30')
  })
  it("devuelve '7' cuando faltan 7 días o menos pero más de 0, sin enviar", () => {
    expect(dueReminder('2026-07-03', [], now)).toBe('7')
  })
  it("devuelve '0' cuando ya venció o vence hoy", () => {
    expect(dueReminder('2026-06-27', [], now)).toBe('0')
    expect(dueReminder('2026-06-20', [], now)).toBe('0')
  })
  it('no reenvía un hito ya enviado', () => {
    expect(dueReminder('2026-07-27', ['30'], now)).toBeNull()
  })
  it("a 20 días devuelve '30' si no se envió (hito 30 ya alcanzado)", () => {
    expect(dueReminder('2026-07-17', [], now)).toBe('30')
  })
  it("a 20 días con '30' enviado devuelve null (aún no llega a 7)", () => {
    expect(dueReminder('2026-07-17', ['30'], now)).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- reminders`
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar**

Create `lib/documents/reminders.ts`:

```ts
import { daysUntil } from '@/lib/documents/status'
import { REMINDER_MILESTONES } from '@/lib/types'

// Devuelve el hito más urgente ya alcanzado y aún no enviado, o null.
// Un hito M está "alcanzado" cuando díasRestantes <= M.
export function dueReminder(
  fechaVencimiento: string | null,
  remindersSent: string[],
  now: Date,
): string | null {
  const d = daysUntil(fechaVencimiento, now)
  if (d === null) return null
  // De menor a mayor urgencia: 0 (vencido/hoy) es lo más urgente.
  const sorted = [...REMINDER_MILESTONES].sort((a, b) => a - b) // [0, 7, 30]
  for (const m of sorted) {
    if (d <= m && !remindersSent.includes(String(m))) {
      return String(m)
    }
  }
  return null
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- reminders`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/documents/reminders.ts lib/documents/__tests__/reminders.test.ts
git commit -m "feat: lógica pura de selección de recordatorios"
```

---

## Fase 2 — Firebase (cliente + admin) y datos

### Task 5: Inicialización de Firebase (cliente y admin)

**Files:**
- Create: `lib/firebase/client.ts`
- Create: `lib/firebase/admin.ts`

**Interfaces:**
- Consumes: variables de entorno de `.env`.
- Produces:
  - cliente: `auth`, `db`, `storage` (Firebase JS SDK)
  - admin: `adminAuth`, `adminDb`, `adminBucket` (firebase-admin), `verifyIdToken(token: string)`

- [ ] **Step 1: Cliente Firebase**

Create `lib/firebase/client.ts`:

```ts
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length ? getApp() : initializeApp(config)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
```

- [ ] **Step 2: Admin Firebase**

Create `lib/firebase/admin.ts`:

```ts
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const app = getApps().length
  ? getApp()
  : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })

export const adminAuth = getAuth(app)
export const adminDb = getFirestore(app)
export const adminBucket = getStorage(app).bucket()

export async function verifyIdToken(token: string) {
  return adminAuth.verifyIdToken(token)
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add lib/firebase/
git commit -m "feat: inicialización Firebase cliente y admin"
```

---

### Task 6: Reglas de seguridad de Firestore + test con emulador

**Files:**
- Create: `firestore.rules`
- Create: `firebase.json`
- Test: `lib/firebase/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: nada de código de app (prueba reglas directamente).
- Produces: `firestore.rules` que aísla datos por `ownerUid`.

- [ ] **Step 1: Escribir las reglas**

Create `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function owns(uid) { return signedIn() && request.auth.uid == uid; }

    match /users/{uid} {
      allow read, write: if owns(uid);
    }

    match /vehicles/{vehicleId} {
      allow read: if owns(resource.data.ownerUid);
      allow create: if owns(request.resource.data.ownerUid);
      allow update, delete: if owns(resource.data.ownerUid);
    }

    match /documents/{documentId} {
      allow read: if owns(resource.data.ownerUid);
      allow create: if owns(request.resource.data.ownerUid);
      allow update, delete: if owns(resource.data.ownerUid);
    }
  }
}
```

- [ ] **Step 2: Configurar emulador**

Create `firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "emulators": {
    "firestore": { "port": 8080 },
    "ui": { "enabled": false }
  }
}
```

- [ ] **Step 3: Escribir el test de reglas**

Create `lib/firebase/__tests__/rules.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, setDoc, getDoc } from 'firebase/firestore'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-nfc',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('reglas de firestore', () => {
  it('un usuario puede crear su propio vehículo', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      setDoc(doc(alice, 'vehicles/v1'), { ownerUid: 'alice', patente: 'ABCD12' }),
    )
  })

  it('un usuario NO puede leer el vehículo de otro', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'vehicles/v2'), { ownerUid: 'bob', patente: 'XYZ' })
    })
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(getDoc(doc(alice, 'vehicles/v2')))
  })

  it('un usuario NO puede crear un vehículo a nombre de otro', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'vehicles/v3'), { ownerUid: 'bob', patente: 'AAAA11' }),
    )
  })
})
```

- [ ] **Step 4: Agregar script y verificar**

Agregar a `package.json`:

```json
"test:rules": "firebase emulators:exec --only firestore \"vitest run rules\""
```

Run: `npm run test:rules`
Expected: PASS (requiere firebase-tools; instalar con `npm i -D firebase-tools` si falta). Los tres tests verdes.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firebase.json lib/firebase/__tests__/rules.test.ts package.json
git commit -m "feat: reglas de seguridad de Firestore + tests con emulador"
```

---

### Task 7: Capa de datos del lado servidor (Admin SDK)

**Files:**
- Create: `lib/data/vehicles.ts`
- Create: `lib/data/documents.ts`
- Test: `lib/data/__tests__/vehicles.test.ts`

**Interfaces:**
- Consumes: `adminDb`, `adminBucket` de `@/lib/firebase/admin`; tipos de `@/lib/types`; `nanoid`.
- Produces:
  - `createVehicle(ownerUid, data): Promise<Vehicle>`
  - `listVehicles(ownerUid): Promise<Vehicle[]>`
  - `getVehicle(vehicleId): Promise<Vehicle | null>`
  - `getVehicleByToken(publicToken): Promise<Vehicle | null>`
  - `updateVehicle(vehicleId, ownerUid, patch): Promise<void>`
  - `deleteVehicle(vehicleId, ownerUid): Promise<void>`
  - `regenerateToken(vehicleId, ownerUid): Promise<string>`
  - `createDocument(ownerUid, data): Promise<VehicleDocument>`
  - `listDocuments(vehicleId): Promise<VehicleDocument[]>`
  - `getDocument(documentId): Promise<VehicleDocument | null>`
  - `updateDocument(documentId, ownerUid, patch): Promise<void>`
  - `deleteDocument(documentId, ownerUid): Promise<void>`

- [ ] **Step 1: Escribir test de `getVehicleByToken` con mock de adminDb**

Create `lib/data/__tests__/vehicles.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockWhere = vi.fn(() => ({ limit: () => ({ get: mockGet }) }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: mockWhere }) },
  adminBucket: {},
}))

import { getVehicleByToken } from '@/lib/data/vehicles'

beforeEach(() => {
  mockGet.mockReset()
  mockWhere.mockClear()
})

describe('getVehicleByToken', () => {
  it('devuelve null si no hay match', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })
    expect(await getVehicleByToken('nope')).toBeNull()
  })

  it('devuelve el vehículo cuando hay match', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'v1', data: () => ({ ownerUid: 'a', patente: 'ABCD12', publicToken: 'tok' }) }],
    })
    const v = await getVehicleByToken('tok')
    expect(v?.id).toBe('v1')
    expect(v?.patente).toBe('ABCD12')
    expect(mockWhere).toHaveBeenCalledWith('publicToken', '==', 'tok')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- vehicles`
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar `lib/data/vehicles.ts`**

Create `lib/data/vehicles.ts`:

```ts
import { adminDb, adminBucket } from '@/lib/firebase/admin'
import { nanoid } from 'nanoid'
import type { Vehicle } from '@/lib/types'

const COL = 'vehicles'

type VehicleInput = Omit<Vehicle, 'id' | 'ownerUid' | 'publicToken' | 'createdAt'>

function toVehicle(id: string, data: FirebaseFirestore.DocumentData): Vehicle {
  return {
    id,
    ownerUid: data.ownerUid,
    patente: data.patente,
    marca: data.marca,
    modelo: data.modelo,
    anio: data.anio,
    color: data.color,
    publicToken: data.publicToken,
    createdAt: data.createdAt,
  }
}

export async function createVehicle(ownerUid: string, data: VehicleInput): Promise<Vehicle> {
  const publicToken = nanoid(21)
  const createdAt = new Date().toISOString()
  const ref = await adminDb.collection(COL).add({ ...data, ownerUid, publicToken, createdAt })
  return { id: ref.id, ownerUid, publicToken, createdAt, ...data }
}

export async function listVehicles(ownerUid: string): Promise<Vehicle[]> {
  const snap = await adminDb.collection(COL).where('ownerUid', '==', ownerUid).get()
  return snap.docs.map((d) => toVehicle(d.id, d.data()))
}

export async function getVehicle(vehicleId: string): Promise<Vehicle | null> {
  const doc = await adminDb.collection(COL).doc(vehicleId).get()
  return doc.exists ? toVehicle(doc.id, doc.data()!) : null
}

export async function getVehicleByToken(publicToken: string): Promise<Vehicle | null> {
  const snap = await adminDb.collection(COL).where('publicToken', '==', publicToken).limit(1).get()
  if (snap.empty) return null
  const d = snap.docs[0]
  return toVehicle(d.id, d.data())
}

async function assertOwner(vehicleId: string, ownerUid: string) {
  const v = await getVehicle(vehicleId)
  if (!v || v.ownerUid !== ownerUid) throw new Error('forbidden')
  return v
}

export async function updateVehicle(
  vehicleId: string,
  ownerUid: string,
  patch: Partial<VehicleInput>,
): Promise<void> {
  await assertOwner(vehicleId, ownerUid)
  await adminDb.collection(COL).doc(vehicleId).update(patch)
}

export async function deleteVehicle(vehicleId: string, ownerUid: string): Promise<void> {
  await assertOwner(vehicleId, ownerUid)
  await adminDb.collection(COL).doc(vehicleId).delete()
}

export async function regenerateToken(vehicleId: string, ownerUid: string): Promise<string> {
  await assertOwner(vehicleId, ownerUid)
  const publicToken = nanoid(21)
  await adminDb.collection(COL).doc(vehicleId).update({ publicToken })
  return publicToken
}
```

- [ ] **Step 4: Implementar `lib/data/documents.ts`**

Create `lib/data/documents.ts`:

```ts
import { adminDb, adminBucket } from '@/lib/firebase/admin'
import type { VehicleDocument } from '@/lib/types'

const COL = 'documents'

type DocInput = Omit<VehicleDocument, 'id' | 'ownerUid' | 'remindersSent' | 'createdAt'>

function toDoc(id: string, data: FirebaseFirestore.DocumentData): VehicleDocument {
  return {
    id,
    vehicleId: data.vehicleId,
    ownerUid: data.ownerUid,
    tipo: data.tipo,
    nombrePersonalizado: data.nombrePersonalizado ?? null,
    fechaVencimiento: data.fechaVencimiento ?? null,
    fileUrl: data.fileUrl,
    filePath: data.filePath,
    remindersSent: data.remindersSent ?? [],
    createdAt: data.createdAt,
  }
}

export async function createDocument(ownerUid: string, data: DocInput): Promise<VehicleDocument> {
  const createdAt = new Date().toISOString()
  const full = { ...data, ownerUid, remindersSent: [] as string[], createdAt }
  const ref = await adminDb.collection(COL).add(full)
  return { id: ref.id, ...full }
}

export async function listDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  return snap.docs.map((d) => toDoc(d.id, d.data()))
}

export async function getDocument(documentId: string): Promise<VehicleDocument | null> {
  const doc = await adminDb.collection(COL).doc(documentId).get()
  return doc.exists ? toDoc(doc.id, doc.data()!) : null
}

async function assertDocOwner(documentId: string, ownerUid: string) {
  const d = await getDocument(documentId)
  if (!d || d.ownerUid !== ownerUid) throw new Error('forbidden')
  return d
}

export async function updateDocument(
  documentId: string,
  ownerUid: string,
  patch: Partial<DocInput> & { remindersSent?: string[] },
): Promise<void> {
  await assertDocOwner(documentId, ownerUid)
  await adminDb.collection(COL).doc(documentId).update(patch)
}

export async function deleteDocument(documentId: string, ownerUid: string): Promise<void> {
  const d = await assertDocOwner(documentId, ownerUid)
  if (d.filePath) {
    await adminBucket.file(d.filePath).delete({ ignoreNotFound: true })
  }
  await adminDb.collection(COL).doc(documentId).delete()
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test -- vehicles`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add lib/data/
git commit -m "feat: capa de datos servidor para vehículos y documentos"
```

---

## Fase 3 — Autenticación y sesión

### Task 8: Sesión del servidor y helpers de auth

**Files:**
- Create: `lib/auth/constants.ts`
- Create: `lib/auth/session.ts`
- Create: `app/api/session/route.ts`
- Test: `lib/auth/__tests__/session.test.ts`

**Interfaces:**
- Consumes: `verifyIdToken` de `@/lib/firebase/admin`; cookies de Next.
- Produces:
  - `SESSION_COOKIE` (constante, en `lib/auth/constants.ts`, sin dependencias — segura para importar desde el middleware edge)
  - `getCurrentUser(): Promise<{ uid: string; email: string } | null>` (lee cookie de sesión)
  - Endpoint `POST /api/session` (set cookie desde idToken), `DELETE /api/session` (logout)

- [ ] **Step 0: Constante de cookie sin dependencias**

Create `lib/auth/constants.ts`:

```ts
// Sin imports: seguro para edge runtime (middleware) y server.
export const SESSION_COOKIE = 'session_token'
```

- [ ] **Step 1: Escribir test de getCurrentUser**

Create `lib/auth/__tests__/session.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVerify = vi.fn()
const mockCookieGet = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({ verifyIdToken: mockVerify }))
vi.mock('next/headers', () => ({ cookies: () => ({ get: mockCookieGet }) }))

import { getCurrentUser } from '@/lib/auth/session'

beforeEach(() => {
  mockVerify.mockReset()
  mockCookieGet.mockReset()
})

describe('getCurrentUser', () => {
  it('null sin cookie', async () => {
    mockCookieGet.mockReturnValue(undefined)
    expect(await getCurrentUser()).toBeNull()
  })
  it('devuelve uid/email con token válido', async () => {
    mockCookieGet.mockReturnValue({ value: 'tok' })
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.cl' })
    expect(await getCurrentUser()).toEqual({ uid: 'u1', email: 'a@b.cl' })
  })
  it('null si el token es inválido', async () => {
    mockCookieGet.mockReturnValue({ value: 'bad' })
    mockVerify.mockRejectedValue(new Error('invalid'))
    expect(await getCurrentUser()).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- session`
Expected: FAIL

- [ ] **Step 3: Implementar `lib/auth/session.ts`**

Create `lib/auth/session.ts`:

```ts
import { cookies } from 'next/headers'
import { verifyIdToken } from '@/lib/firebase/admin'
import { SESSION_COOKIE } from '@/lib/auth/constants'

export { SESSION_COOKIE }

export async function getCurrentUser(): Promise<{ uid: string; email: string } | null> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const decoded = await verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email ?? '' }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Implementar endpoint de sesión**

Create `app/api/session/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { verifyIdToken } from '@/lib/firebase/admin'

export async function POST(req: NextRequest) {
  const { idToken } = await req.json()
  try {
    await verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1h (token de Firebase expira en 1h)
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
```

> Nota: para v1 la cookie guarda el idToken (expira en 1h). Mejora futura: usar
> session cookies de Firebase Admin (`createSessionCookie`) para duración larga.

- [ ] **Step 5: Verificar que pasa**

Run: `npm test -- session`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/auth/ app/api/session/
git commit -m "feat: sesión de servidor y endpoint de login/logout"
```

---

### Task 9: UI de login (Google + email/contraseña)

**Files:**
- Create: `lib/auth/AuthProvider.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `components/LoginForm.tsx`
- Modify: `app/layout.tsx` (envolver con AuthProvider)

**Interfaces:**
- Consumes: `auth` de `@/lib/firebase/client`; endpoint `/api/session`.
- Produces: pantalla `/login` funcional que tras autenticar hace POST a `/api/session` y redirige a `/dashboard`.

- [ ] **Step 1: AuthProvider (cliente)**

Create `lib/auth/AuthProvider.tsx`:

```tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

const AuthCtx = createContext<{ user: User | null; loading: boolean }>({ user: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false) }), [])
  return <AuthCtx.Provider value={{ user, loading }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
```

- [ ] **Step 2: LoginForm**

Create `components/LoginForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

async function establishSession() {
  const idToken = await auth.currentUser!.getIdToken()
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
}

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function afterAuth() {
    await establishSession()
    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogle() {
    setError(null)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
      await afterAuth()
    } catch (e) {
      setError('No se pudo iniciar sesión con Google.')
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (isRegister) await createUserWithEmailAndPassword(auth, email, password)
      else await signInWithEmailAndPassword(auth, email, password)
      await afterAuth()
    } catch {
      setError(isRegister ? 'No se pudo crear la cuenta.' : 'Credenciales inválidas.')
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <button onClick={handleGoogle} className="w-full rounded border p-2 font-medium">
        Continuar con Google
      </button>
      <div className="text-center text-sm text-gray-400">o</div>
      <form onSubmit={handleEmail} className="space-y-3">
        <input className="w-full rounded border p-2" type="email" placeholder="Correo"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded border p-2" type="password" placeholder="Contraseña"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" className="w-full rounded bg-blue-600 p-2 text-white">
          {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={() => setIsRegister(!isRegister)} className="w-full text-sm text-blue-600">
        {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Página de login**

Create `app/(auth)/login/page.tsx`:

```tsx
import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold">Documentos Vehiculares</h1>
        <LoginForm />
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Envolver layout con AuthProvider**

Modify `app/layout.tsx` — envolver `{children}` con `<AuthProvider>`:

```tsx
import { AuthProvider } from '@/lib/auth/AuthProvider'
// ...dentro de <body>:
//   <AuthProvider>{children}</AuthProvider>
```

- [ ] **Step 5: Verificar build y arranque manual**

Run: `npm run build`
Expected: build exitoso

Verificación manual: `npm run dev`, ir a `/login`, la pantalla renderiza con botón Google y formulario.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/AuthProvider.tsx components/LoginForm.tsx "app/(auth)" app/layout.tsx
git commit -m "feat: pantalla de login con Google y email/contraseña"
```

---

### Task 10: Protección de rutas privadas (middleware)

**Files:**
- Create: `middleware.ts`

**Interfaces:**
- Consumes: cookie `session_token`.
- Produces: redirección a `/login` para rutas privadas sin sesión.

- [ ] **Step 1: Implementar middleware**

Create `middleware.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/constants'

const PRIVATE_PREFIXES = ['/dashboard', '/vehiculos']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPrivate = PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))
  if (!isPrivate) return NextResponse.next()
  const hasSession = req.cookies.has(SESSION_COOKIE)
  if (!hasSession) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/vehiculos/:path*'],
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build exitoso

Verificación manual: ir a `/dashboard` sin sesión → redirige a `/login`.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: middleware de protección de rutas privadas"
```

---

## Fase 4 — Panel y ficha privada

### Task 11: API de vehículos (REST server)

**Files:**
- Create: `app/api/vehicles/route.ts` (GET lista, POST crear)
- Create: `app/api/vehicles/[id]/route.ts` (GET, PATCH, DELETE)
- Create: `app/api/vehicles/[id]/token/route.ts` (POST regenerar token)

**Interfaces:**
- Consumes: `getCurrentUser` de `@/lib/auth/session`; funciones de `@/lib/data/vehicles`.
- Produces: endpoints REST que validan sesión y delegan en la capa de datos.

- [ ] **Step 1: Endpoint lista/crear**

Create `app/api/vehicles/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { listVehicles, createVehicle } from '@/lib/data/vehicles'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await listVehicles(user.uid))
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const { patente, marca, modelo, anio, color } = body
  if (!patente || !marca || !modelo) {
    return NextResponse.json({ error: 'faltan campos' }, { status: 400 })
  }
  const vehicle = await createVehicle(user.uid, { patente, marca, modelo, anio: Number(anio) || 0, color: color ?? '' })
  return NextResponse.json(vehicle, { status: 201 })
}
```

- [ ] **Step 2: Endpoint por id**

Create `app/api/vehicles/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { getVehicle, updateVehicle, deleteVehicle } from '@/lib/data/vehicles'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const v = await getVehicle(params.id)
  if (!v || v.ownerUid !== user.uid) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(v)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const patch = await req.json()
  try {
    await updateVehicle(params.id, user.uid, patch)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    await deleteVehicle(params.id, user.uid)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Endpoint regenerar token**

Create `app/api/vehicles/[id]/token/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { regenerateToken } from '@/lib/data/vehicles'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const publicToken = await regenerateToken(params.id, user.uid)
    return NextResponse.json({ publicToken })
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
}
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build exitoso

- [ ] **Step 5: Commit**

```bash
git add app/api/vehicles/
git commit -m "feat: API REST de vehículos"
```

---

### Task 12: Componentes de estado (badge) + dashboard

**Files:**
- Create: `components/StatusBadge.tsx`
- Create: `app/(app)/dashboard/page.tsx`
- Create: `components/VehicleCard.tsx`
- Create: `components/NewVehicleForm.tsx`
- Test: `components/__tests__/StatusBadge.test.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`, `listVehicles`, `listDocuments`, `documentStatus`, `worstStatus`.
- Produces: `/dashboard` (Server Component) que lista vehículos con su peor estado.

- [ ] **Step 1: Test del StatusBadge**

Create `components/__tests__/StatusBadge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from '@/components/StatusBadge'

describe('StatusBadge', () => {
  it('muestra texto y color para vencido', () => {
    render(<StatusBadge status="vencido" />)
    expect(screen.getByText('Vencido')).toBeDefined()
  })
  it('muestra "Al día"', () => {
    render(<StatusBadge status="al_dia" />)
    expect(screen.getByText('Al día')).toBeDefined()
  })
})
```

Agregar a `vitest.config.ts` un setup para jest-dom: crear `vitest.setup.ts` con `import '@testing-library/jest-dom'` y referenciarlo en `test.setupFiles: ['./vitest.setup.ts']`.

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- StatusBadge`
Expected: FAIL

- [ ] **Step 3: Implementar StatusBadge**

Create `components/StatusBadge.tsx`:

```tsx
import type { DocStatus } from '@/lib/documents/status'

const MAP: Record<DocStatus, { label: string; cls: string }> = {
  al_dia: { label: 'Al día', cls: 'bg-green-100 text-green-800' },
  por_vencer: { label: 'Por vencer', cls: 'bg-yellow-100 text-yellow-800' },
  vencido: { label: 'Vencido', cls: 'bg-red-100 text-red-800' },
  sin_vencimiento: { label: 'Sin vencimiento', cls: 'bg-gray-100 text-gray-700' },
}

export default function StatusBadge({ status }: { status: DocStatus }) {
  const { label, cls } = MAP[status]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- StatusBadge`
Expected: PASS

- [ ] **Step 5: VehicleCard**

Create `components/VehicleCard.tsx`:

```tsx
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import type { DocStatus } from '@/lib/documents/status'
import type { Vehicle } from '@/lib/types'

export default function VehicleCard({ vehicle, status }: { vehicle: Vehicle; status: DocStatus }) {
  return (
    <Link href={`/vehiculos/${vehicle.id}`}
      className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50">
      <div>
        <p className="font-semibold">{vehicle.patente}</p>
        <p className="text-sm text-gray-600">{vehicle.marca} {vehicle.modelo} · {vehicle.anio}</p>
      </div>
      <StatusBadge status={status} />
    </Link>
  )
}
```

- [ ] **Step 6: NewVehicleForm**

Create `components/NewVehicleForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewVehicleForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ patente: '', marca: '', modelo: '', anio: '', color: '' })
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) { setError('No se pudo crear el vehículo.'); return }
    setOpen(false)
    setForm({ patente: '', marca: '', modelo: '', anio: '', color: '' })
    router.refresh()
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded bg-blue-600 px-4 py-2 text-white">+ Nuevo vehículo</button>
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border p-4">
      {(['patente', 'marca', 'modelo', 'anio', 'color'] as const).map((f) => (
        <input key={f} className="w-full rounded border p-2" placeholder={f}
          value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}
          required={f !== 'color'} />
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">Guardar</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border px-4 py-2">Cancelar</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 7: Página dashboard**

Create `app/(app)/dashboard/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { listVehicles } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { documentStatus, worstStatus, type DocStatus } from '@/lib/documents/status'
import VehicleCard from '@/components/VehicleCard'
import NewVehicleForm from '@/components/NewVehicleForm'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const vehicles = await listVehicles(user.uid)
  const now = new Date()
  const withStatus = await Promise.all(
    vehicles.map(async (v) => {
      const docs = await listDocuments(v.id)
      const statuses: DocStatus[] = docs.map((d) => documentStatus(d.fechaVencimiento, now))
      return { vehicle: v, status: worstStatus(statuses) }
    }),
  )

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis vehículos</h1>
        <NewVehicleForm />
      </div>
      {withStatus.length === 0 ? (
        <p className="text-gray-500">Aún no tienes vehículos registrados.</p>
      ) : (
        <div className="space-y-3">
          {withStatus.map(({ vehicle, status }) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} />
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 8: Verificar test y build**

Run: `npm test -- StatusBadge`
Expected: PASS

Run: `npm run build`
Expected: build exitoso

- [ ] **Step 9: Commit**

```bash
git add components/ "app/(app)/dashboard" vitest.config.ts vitest.setup.ts
git commit -m "feat: dashboard con listado de vehículos y estado"
```

---

### Task 13: Subida de archivos a Cloud Storage

**Files:**
- Create: `app/api/documents/upload-url/route.ts` (genera signed URL de subida)
- Create: `lib/storage/signedUrls.ts`
- Test: `lib/storage/__tests__/signedUrls.test.ts`

**Interfaces:**
- Consumes: `adminBucket` de `@/lib/firebase/admin`.
- Produces:
  - `createUploadUrl(ownerUid, vehicleId, fileName, contentType): Promise<{ uploadUrl, filePath, publicPath }>`
  - `createReadUrl(filePath): Promise<string>` (URL firmada de lectura, expiración corta)

- [ ] **Step 1: Test de path de subida**

Create `lib/storage/__tests__/signedUrls.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://signed.example/upload'])
const mockFile = vi.fn(() => ({ getSignedUrl: mockGetSignedUrl }))
vi.mock('@/lib/firebase/admin', () => ({ adminBucket: { file: mockFile, name: 'bucket' } }))

import { createUploadUrl } from '@/lib/storage/signedUrls'

describe('createUploadUrl', () => {
  it('genera filePath namespaced por owner y vehículo', async () => {
    const res = await createUploadUrl('u1', 'v1', 'permiso.pdf', 'application/pdf')
    expect(res.filePath).toMatch(/^vehicles\/v1\/u1\/.*permiso\.pdf$/)
    expect(res.uploadUrl).toBe('https://signed.example/upload')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- signedUrls`
Expected: FAIL

- [ ] **Step 3: Implementar**

Create `lib/storage/signedUrls.ts`:

```ts
import { adminBucket } from '@/lib/firebase/admin'
import { nanoid } from 'nanoid'

export async function createUploadUrl(
  ownerUid: string,
  vehicleId: string,
  fileName: string,
  contentType: string,
): Promise<{ uploadUrl: string; filePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `vehicles/${vehicleId}/${ownerUid}/${nanoid(8)}-${safeName}`
  const [uploadUrl] = await adminBucket.file(filePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
  })
  return { uploadUrl, filePath }
}

export async function createReadUrl(filePath: string): Promise<string> {
  const [url] = await adminBucket.file(filePath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000,
  })
  return url
}
```

- [ ] **Step 4: Endpoint de upload-url**

Create `app/api/documents/upload-url/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { getVehicle } from '@/lib/data/vehicles'
import { createUploadUrl } from '@/lib/storage/signedUrls'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { vehicleId, fileName, contentType } = await req.json()
  const v = await getVehicle(vehicleId)
  if (!v || v.ownerUid !== user.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { uploadUrl, filePath } = await createUploadUrl(user.uid, vehicleId, fileName, contentType)
  return NextResponse.json({ uploadUrl, filePath })
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test -- signedUrls`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/storage/ app/api/documents/upload-url/
git commit -m "feat: signed URLs de subida y lectura en Cloud Storage"
```

---

### Task 14: API de documentos + ficha privada del vehículo

**Files:**
- Create: `app/api/documents/route.ts` (POST crear)
- Create: `app/api/documents/[id]/route.ts` (PATCH, DELETE)
- Create: `app/(app)/vehiculos/[id]/page.tsx`
- Create: `components/DocumentList.tsx`
- Create: `components/DocumentForm.tsx`
- Create: `components/NfcTokenPanel.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`, `getVehicle`, `listDocuments`, `createDocument`, `updateDocument`, `deleteDocument`, `documentStatus`, `createReadUrl`, `DOCUMENT_TYPE_LABELS`.
- Produces: ficha `/vehiculos/[id]` con documentos (crear/editar/eliminar), estado por color y panel del enlace NFC.

- [ ] **Step 1: Endpoint crear documento**

Create `app/api/documents/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { getVehicle } from '@/lib/data/vehicles'
import { createDocument } from '@/lib/data/documents'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const { vehicleId, tipo, nombrePersonalizado, fechaVencimiento, fileUrl, filePath } = body
  const v = await getVehicle(vehicleId)
  if (!v || v.ownerUid !== user.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const doc = await createDocument(user.uid, {
    vehicleId,
    tipo,
    nombrePersonalizado: nombrePersonalizado ?? null,
    fechaVencimiento: fechaVencimiento || null,
    fileUrl: fileUrl ?? '',
    filePath: filePath ?? '',
  })
  return NextResponse.json(doc, { status: 201 })
}
```

- [ ] **Step 2: Endpoint editar/eliminar documento**

Create `app/api/documents/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { updateDocument, deleteDocument } from '@/lib/data/documents'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const patch = await req.json()
  // Si cambia la fecha de vencimiento, reiniciar recordatorios.
  if ('fechaVencimiento' in patch) patch.remindersSent = []
  try {
    await updateDocument(params.id, user.uid, patch)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    await deleteDocument(params.id, user.uid)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: DocumentForm (cliente, sube archivo y crea documento)**

Create `components/DocumentForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/lib/types'

const TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]

export default function DocumentForm({ vehicleId }: { vehicleId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<DocumentType>('permiso_circulacion')
  const [nombrePersonalizado, setNombre] = useState('')
  const [fechaVencimiento, setFecha] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      let fileUrl = ''
      let filePath = ''
      if (file) {
        const res = await fetch('/api/documents/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId, fileName: file.name, contentType: file.type }),
        })
        if (!res.ok) throw new Error('upload-url')
        const { uploadUrl, filePath: fp } = await res.json()
        const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!put.ok) throw new Error('upload')
        filePath = fp
        fileUrl = fp
      }
      const create = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId, tipo,
          nombrePersonalizado: tipo === 'otro' ? nombrePersonalizado : null,
          fechaVencimiento: fechaVencimiento || null,
          fileUrl, filePath,
        }),
      })
      if (!create.ok) throw new Error('create')
      setOpen(false)
      setFile(null); setFecha(''); setNombre('')
      router.refresh()
    } catch {
      setError('No se pudo agregar el documento.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded bg-blue-600 px-4 py-2 text-white">+ Agregar documento</button>
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
      <select className="w-full rounded border p-2" value={tipo} onChange={(e) => setTipo(e.target.value as DocumentType)}>
        {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {tipo === 'otro' && (
        <input className="w-full rounded border p-2" placeholder="Nombre del documento"
          value={nombrePersonalizado} onChange={(e) => setNombre(e.target.value)} required />
      )}
      <label className="block text-sm text-gray-600">Fecha de vencimiento (opcional)</label>
      <input type="date" className="w-full rounded border p-2" value={fechaVencimiento} onChange={(e) => setFecha(e.target.value)} />
      <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {loading ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border px-4 py-2">Cancelar</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: DocumentList (con botón eliminar)**

Create `components/DocumentList.tsx`:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import { DOCUMENT_TYPE_LABELS, type VehicleDocument } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'

type Item = VehicleDocument & { status: DocStatus; readUrl: string | null }

export default function DocumentList({ documents }: { documents: Item[] }) {
  const router = useRouter()

  async function remove(id: string) {
    if (!confirm('¿Eliminar este documento?')) return
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  if (documents.length === 0) return <p className="text-gray-500">Sin documentos.</p>

  return (
    <ul className="space-y-2">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center justify-between rounded border p-3">
          <div>
            <p className="font-medium">
              {d.tipo === 'otro' ? d.nombrePersonalizado : DOCUMENT_TYPE_LABELS[d.tipo]}
            </p>
            <p className="text-sm text-gray-600">
              {d.fechaVencimiento ? `Vence: ${d.fechaVencimiento}` : 'Sin vencimiento'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={d.status} />
            {d.readUrl && <a href={d.readUrl} target="_blank" className="text-sm text-blue-600">Ver</a>}
            <button onClick={() => remove(d.id)} className="text-sm text-red-600">Eliminar</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: NfcTokenPanel**

Create `components/NfcTokenPanel.tsx`:

```tsx
'use client'
import { useState } from 'react'

export default function NfcTokenPanel({ vehicleId, initialUrl }: { vehicleId: string; initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl)

  async function regenerate() {
    if (!confirm('Regenerar el enlace invalida el chip actual. ¿Continuar?')) return
    const res = await fetch(`/api/vehicles/${vehicleId}/token`, { method: 'POST' })
    if (res.ok) {
      const { publicToken } = await res.json()
      const base = url.replace(/\/v\/.*$/, '')
      setUrl(`${base}/v/${publicToken}`)
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-2 font-semibold">Enlace NFC</h3>
      <p className="break-all text-sm text-gray-600">{url}</p>
      <p className="mt-1 text-xs text-gray-500">Graba esta URL en el chip NFC del vehículo.</p>
      <div className="mt-2 flex gap-2">
        <button onClick={() => navigator.clipboard.writeText(url)} className="rounded border px-3 py-1 text-sm">Copiar</button>
        <button onClick={regenerate} className="rounded border px-3 py-1 text-sm text-red-600">Regenerar</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Página de ficha privada**

Create `app/(app)/vehiculos/[id]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { getVehicle } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { documentStatus } from '@/lib/documents/status'
import { createReadUrl } from '@/lib/storage/signedUrls'
import DocumentForm from '@/components/DocumentForm'
import DocumentList from '@/components/DocumentList'
import NfcTokenPanel from '@/components/NfcTokenPanel'

export const dynamic = 'force-dynamic'

export default async function VehiclePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const vehicle = await getVehicle(params.id)
  if (!vehicle || vehicle.ownerUid !== user.uid) notFound()

  const now = new Date()
  const docs = await listDocuments(vehicle.id)
  const items = await Promise.all(
    docs.map(async (d) => ({
      ...d,
      status: documentStatus(d.fechaVencimiento, now),
      readUrl: d.filePath ? await createReadUrl(d.filePath) : null,
    })),
  )

  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const publicUrl = `${base}/v/${vehicle.publicToken}`

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">{vehicle.patente}</h1>
        <p className="text-gray-600">{vehicle.marca} {vehicle.modelo} · {vehicle.anio} · {vehicle.color}</p>
      </div>
      <NfcTokenPanel vehicleId={vehicle.id} initialUrl={publicUrl} />
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Documentos</h2>
          <DocumentForm vehicleId={vehicle.id} />
        </div>
        <DocumentList documents={items} />
      </section>
    </main>
  )
}
```

- [ ] **Step 7: Verificar build**

Run: `npm run build`
Expected: build exitoso

- [ ] **Step 8: Commit**

```bash
git add app/api/documents/ "app/(app)/vehiculos" components/DocumentForm.tsx components/DocumentList.tsx components/NfcTokenPanel.tsx
git commit -m "feat: ficha privada del vehículo con CRUD de documentos y panel NFC"
```

---

## Fase 5 — Ficha pública NFC

### Task 15: Ficha pública por token (SSR)

**Files:**
- Create: `app/v/[token]/page.tsx`
- Create: `components/PublicVehicleView.tsx`

**Interfaces:**
- Consumes: `getVehicleByToken`, `listDocuments`, `documentStatus`, `createReadUrl`, `DOCUMENT_TYPE_LABELS`.
- Produces: página pública de solo lectura en `/v/[token]`, sin auth.

- [ ] **Step 1: PublicVehicleView**

Create `components/PublicVehicleView.tsx`:

```tsx
import StatusBadge from '@/components/StatusBadge'
import { DOCUMENT_TYPE_LABELS, type VehicleDocument, type Vehicle } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'

type Item = VehicleDocument & { status: DocStatus; readUrl: string | null }

export default function PublicVehicleView({ vehicle, documents }: { vehicle: Vehicle; documents: Item[] }) {
  return (
    <main className="mx-auto max-w-xl space-y-6 p-4">
      <div className="rounded-lg border p-4">
        <h1 className="text-2xl font-bold">{vehicle.patente}</h1>
        <p className="text-gray-600">{vehicle.marca} {vehicle.modelo} · {vehicle.anio} · {vehicle.color}</p>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Documentación</h2>
        {documents.length === 0 ? (
          <p className="text-gray-500">Este vehículo no tiene documentos cargados.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded border p-3">
                <div>
                  <p className="font-medium">
                    {d.tipo === 'otro' ? d.nombrePersonalizado : DOCUMENT_TYPE_LABELS[d.tipo]}
                  </p>
                  <p className="text-sm text-gray-600">
                    {d.fechaVencimiento ? `Vence: ${d.fechaVencimiento}` : 'Sin vencimiento'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={d.status} />
                  {d.readUrl && <a href={d.readUrl} target="_blank" className="text-sm text-blue-600">Ver</a>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-center text-xs text-gray-400">Ficha de fiscalización · solo lectura</p>
    </main>
  )
}
```

- [ ] **Step 2: Página pública**

Create `app/v/[token]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { documentStatus } from '@/lib/documents/status'
import { createReadUrl } from '@/lib/storage/signedUrls'
import PublicVehicleView from '@/components/PublicVehicleView'

export const dynamic = 'force-dynamic'

export default async function PublicPage({ params }: { params: { token: string } }) {
  const vehicle = await getVehicleByToken(params.token)
  if (!vehicle) notFound()

  const now = new Date()
  const docs = await listDocuments(vehicle.id)
  const items = await Promise.all(
    docs.map(async (d) => ({
      ...d,
      status: documentStatus(d.fechaVencimiento, now),
      readUrl: d.filePath ? await createReadUrl(d.filePath) : null,
    })),
  )

  return <PublicVehicleView vehicle={vehicle} documents={items} />
}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build exitoso

- [ ] **Step 4: Commit**

```bash
git add app/v/ components/PublicVehicleView.tsx
git commit -m "feat: ficha pública NFC por token (SSR, solo lectura)"
```

---

## Fase 6 — Recordatorios por email

### Task 16: Servicio de email (Resend)

**Files:**
- Create: `lib/email/resend.ts`
- Create: `lib/email/reminderEmail.ts`
- Test: `lib/email/__tests__/reminderEmail.test.ts`

**Interfaces:**
- Consumes: `Resend`, `DOCUMENT_TYPE_LABELS`.
- Produces:
  - `reminderSubject(milestone: string, label: string): string`
  - `reminderHtml(params): string`
  - `sendReminderEmail(to, params): Promise<void>`

- [ ] **Step 1: Test de copy del email**

Create `lib/email/__tests__/reminderEmail.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { reminderSubject, reminderHtml } from '@/lib/email/reminderEmail'

describe('reminderSubject', () => {
  it('hito 0 indica vencido/hoy', () => {
    expect(reminderSubject('0', 'SOAP')).toContain('SOAP')
    expect(reminderSubject('0', 'SOAP').toLowerCase()).toContain('vence hoy')
  })
  it('hito 30 indica 30 días', () => {
    expect(reminderSubject('30', 'Revisión Técnica')).toContain('30 días')
  })
})

describe('reminderHtml', () => {
  it('incluye patente, etiqueta y fecha', () => {
    const html = reminderHtml({ patente: 'ABCD12', label: 'SOAP', fechaVencimiento: '2026-07-27', milestone: '30' })
    expect(html).toContain('ABCD12')
    expect(html).toContain('SOAP')
    expect(html).toContain('2026-07-27')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- reminderEmail`
Expected: FAIL

- [ ] **Step 3: Implementar copy y cliente**

Create `lib/email/reminderEmail.ts`:

```ts
export function reminderSubject(milestone: string, label: string): string {
  if (milestone === '0') return `⚠️ Tu ${label} vence hoy o está vencido`
  if (milestone === '7') return `Tu ${label} vence en 7 días`
  return `Tu ${label} vence en 30 días`
}

export function reminderHtml(params: {
  patente: string
  label: string
  fechaVencimiento: string
  milestone: string
}): string {
  const { patente, label, fechaVencimiento, milestone } = params
  const urgencia = milestone === '0' ? 'vence hoy o ya está vencido' : `vence en ${milestone} días`
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Recordatorio de documentación vehicular</h2>
      <p>El documento <strong>${label}</strong> de tu vehículo <strong>${patente}</strong> ${urgencia}.</p>
      <p>Fecha de vencimiento: <strong>${fechaVencimiento}</strong></p>
      <p>Mantén tu documentación al día para evitar problemas en la fiscalización.</p>
    </div>
  `
}
```

Create `lib/email/resend.ts`:

```ts
import { Resend } from 'resend'
import { reminderSubject, reminderHtml } from '@/lib/email/reminderEmail'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendReminderEmail(
  to: string,
  params: { patente: string; label: string; fechaVencimiento: string; milestone: string },
): Promise<void> {
  await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: reminderSubject(params.milestone, params.label),
    html: reminderHtml(params),
  })
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- reminderEmail`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/
git commit -m "feat: servicio de email de recordatorios (Resend)"
```

---

### Task 17: Job de recordatorios + endpoint de cron

**Files:**
- Create: `lib/documents/runReminders.ts`
- Create: `app/api/cron/reminders/route.ts`
- Test: `lib/documents/__tests__/runReminders.test.ts`

**Interfaces:**
- Consumes: `dueReminder`, `sendReminderEmail`, `DOCUMENT_TYPE_LABELS`, capa de datos.
- Produces:
  - `processReminders(deps, now): Promise<{ sent: number }>` — función pura-ish con dependencias inyectadas (lista de documentos, lookup de email/patente, sender, marcador).
  - Endpoint `GET /api/cron/reminders` protegido por `CRON_SECRET`.

- [ ] **Step 1: Test de processReminders con dependencias inyectadas**

Create `lib/documents/__tests__/runReminders.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { processReminders } from '@/lib/documents/runReminders'
import type { VehicleDocument } from '@/lib/types'

const now = new Date('2026-06-27T12:00:00-04:00')

function doc(over: Partial<VehicleDocument>): VehicleDocument {
  return {
    id: 'd1', vehicleId: 'v1', ownerUid: 'u1', tipo: 'soap',
    nombrePersonalizado: null, fechaVencimiento: '2026-07-27',
    fileUrl: '', filePath: '', remindersSent: [], createdAt: '', ...over,
  }
}

describe('processReminders', () => {
  it('envía y marca el hito de 30 días', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const mark = vi.fn().mockResolvedValue(undefined)
    const deps = {
      allDocuments: async () => [doc({})],
      vehicleInfo: async () => ({ patente: 'ABCD12', email: 'a@b.cl' }),
      sendReminderEmail: send,
      markReminderSent: mark,
    }
    const res = await processReminders(deps, now)
    expect(res.sent).toBe(1)
    expect(send).toHaveBeenCalledWith('a@b.cl', expect.objectContaining({ patente: 'ABCD12', milestone: '30' }))
    expect(mark).toHaveBeenCalledWith('d1', 'u1', ['30'])
  })

  it('no envía si el hito ya fue enviado', async () => {
    const send = vi.fn()
    const deps = {
      allDocuments: async () => [doc({ remindersSent: ['30'] })],
      vehicleInfo: async () => ({ patente: 'ABCD12', email: 'a@b.cl' }),
      sendReminderEmail: send,
      markReminderSent: vi.fn(),
    }
    const res = await processReminders(deps, now)
    expect(res.sent).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('omite documentos sin fecha de vencimiento', async () => {
    const send = vi.fn()
    const deps = {
      allDocuments: async () => [doc({ fechaVencimiento: null })],
      vehicleInfo: async () => ({ patente: 'X', email: 'a@b.cl' }),
      sendReminderEmail: send,
      markReminderSent: vi.fn(),
    }
    expect((await processReminders(deps, now)).sent).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- runReminders`
Expected: FAIL

- [ ] **Step 3: Implementar processReminders**

Create `lib/documents/runReminders.ts`:

```ts
import { dueReminder } from '@/lib/documents/reminders'
import { DOCUMENT_TYPE_LABELS, type VehicleDocument } from '@/lib/types'

export interface ReminderDeps {
  allDocuments: () => Promise<VehicleDocument[]>
  vehicleInfo: (vehicleId: string) => Promise<{ patente: string; email: string } | null>
  sendReminderEmail: (
    to: string,
    params: { patente: string; label: string; fechaVencimiento: string; milestone: string },
  ) => Promise<void>
  markReminderSent: (documentId: string, ownerUid: string, remindersSent: string[]) => Promise<void>
}

export async function processReminders(deps: ReminderDeps, now: Date): Promise<{ sent: number }> {
  const docs = await deps.allDocuments()
  let sent = 0
  for (const d of docs) {
    const milestone = dueReminder(d.fechaVencimiento, d.remindersSent, now)
    if (!milestone) continue
    const info = await deps.vehicleInfo(d.vehicleId)
    if (!info?.email) continue
    const label = d.tipo === 'otro' ? d.nombrePersonalizado ?? 'Documento' : DOCUMENT_TYPE_LABELS[d.tipo]
    await deps.sendReminderEmail(info.email, {
      patente: info.patente,
      label,
      fechaVencimiento: d.fechaVencimiento!,
      milestone,
    })
    await deps.markReminderSent(d.id, d.ownerUid, [...d.remindersSent, milestone])
    sent++
  }
  return { sent }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- runReminders`
Expected: PASS

- [ ] **Step 5: Agregar helpers de datos para el job**

Modify `lib/data/documents.ts` — agregar al final:

```ts
export async function listAllDocuments(): Promise<VehicleDocument[]> {
  const snap = await adminDb.collection(COL).where('fechaVencimiento', '!=', null).get()
  return snap.docs.map((d) => toDoc(d.id, d.data()))
}
```

Modify `lib/data/vehicles.ts` — agregar al final:

```ts
import { adminAuth } from '@/lib/firebase/admin'

export async function vehicleInfoForReminder(
  vehicleId: string,
): Promise<{ patente: string; email: string } | null> {
  const v = await getVehicle(vehicleId)
  if (!v) return null
  try {
    const u = await adminAuth.getUser(v.ownerUid)
    return { patente: v.patente, email: u.email ?? '' }
  } catch {
    return { patente: v.patente, email: '' }
  }
}
```

> Nota: actualizar el import existente de `@/lib/firebase/admin` en `vehicles.ts` para
> incluir `adminAuth` junto a `adminDb` y `adminBucket`.

- [ ] **Step 6: Endpoint de cron**

Create `app/api/cron/reminders/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { processReminders } from '@/lib/documents/runReminders'
import { listAllDocuments, updateDocument } from '@/lib/data/documents'
import { vehicleInfoForReminder } from '@/lib/data/vehicles'
import { sendReminderEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await processReminders(
    {
      allDocuments: listAllDocuments,
      vehicleInfo: vehicleInfoForReminder,
      sendReminderEmail,
      markReminderSent: (id, ownerUid, remindersSent) => updateDocument(id, ownerUid, { remindersSent }),
    },
    new Date(),
  )
  return NextResponse.json(result)
}
```

- [ ] **Step 7: Verificar test y build**

Run: `npm test -- runReminders`
Expected: PASS

Run: `npm run build`
Expected: build exitoso

- [ ] **Step 8: Commit**

```bash
git add lib/documents/runReminders.ts lib/documents/__tests__/runReminders.test.ts app/api/cron/reminders/ lib/data/documents.ts lib/data/vehicles.ts
git commit -m "feat: job de recordatorios y endpoint de cron protegido"
```

---

## Fase 7 — E2E y cierre

### Task 18: Test E2E con Playwright (smoke del flujo público)

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/public-ficha.spec.ts`

**Interfaces:**
- Consumes: app corriendo en `NEXT_PUBLIC_APP_URL`.
- Produces: prueba E2E del flujo de ficha pública (token inexistente → 404).

> Nota: el flujo autenticado completo (login real con Firebase) requiere credenciales
> de prueba y emuladores; para v1 el E2E cubre la ruta pública, que no necesita auth.
> Ampliar a flujo autenticado con Firebase Auth Emulator es mejora futura.

- [ ] **Step 1: Config de Playwright**

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
```

- [ ] **Step 2: Test E2E**

Create `e2e/public-ficha.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('token inexistente muestra 404', async ({ page }) => {
  const res = await page.goto('/v/token-que-no-existe-000')
  expect(res?.status()).toBe(404)
})

test('login renderiza', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('Continuar con Google')).toBeVisible()
})
```

Agregar a `package.json`:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 3: Ejecutar E2E**

Run: `npx playwright install --with-deps chromium` (primera vez)
Run: `npm run test:e2e`
Expected: PASS (ambos tests; requiere `.env` configurado para que el server arranque)

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e/ package.json
git commit -m "test: E2E smoke de ruta pública y login"
```

---

### Task 19: Documentación de despliegue y configuración GCP

**Files:**
- Create: `README.md`
- Create: `apphosting.yaml`

**Interfaces:**
- Consumes: nada.
- Produces: instrucciones de setup (Firebase project, env vars, Cloud Scheduler) y config de Firebase App Hosting.

- [ ] **Step 1: README con setup**

Create `README.md` con: requisitos, creación de proyecto Firebase (Auth con Google+Email, Firestore, Storage), variables de entorno (copiar de `.env.example`), comandos (`npm run dev`, `npm test`, `npm run test:rules`, `npm run test:e2e`), despliegue de reglas (`firebase deploy --only firestore:rules`) y configuración de Cloud Scheduler:

```
Cloud Scheduler job (diario, 09:00 America/Santiago):
  - URL: https://<dominio>/api/cron/reminders
  - Método: GET
  - Header: Authorization: Bearer <CRON_SECRET>
```

- [ ] **Step 2: apphosting.yaml**

Create `apphosting.yaml`:

```yaml
runConfig:
  minInstances: 0
  maxInstances: 2
env:
  - variable: NEXT_PUBLIC_APP_URL
    value: https://tudominio.cl
    availability:
      - BUILD
      - RUNTIME
```

> Nota: las variables sensibles (claves) se configuran como secretos en Firebase App
> Hosting, no en este archivo.

- [ ] **Step 3: Commit**

```bash
git add README.md apphosting.yaml
git commit -m "docs: README de setup y config de Firebase App Hosting"
```

---

## Resumen de cobertura del spec

- §3 Stack → Tasks 1, 5
- §4 Modelo de datos → Tasks 2, 7
- §5 Tipos de documento → Task 2
- §6 Estado de documento → Task 3
- §7.1 Login → Panel → Tasks 9, 12
- §7.2 Ficha privada → Task 14
- §7.3 Ficha pública NFC → Task 15
- §7.4 Recordatorios → Tasks 4, 16, 17
- §9 Seguridad (reglas, token, signed URLs, cron) → Tasks 6, 8, 10, 13, 17
- §10 Testing (unit/integración/E2E) → Tasks 3, 4, 6, 7, 12, 16, 17, 18

## Notas de mejoras futuras (fuera de v1)

- Session cookies de larga duración (Firebase Admin `createSessionCookie`).
- Edición inline de datos del vehículo (UI; la API PATCH ya existe).
- Reemplazo de archivo al actualizar documento desde la UI.
- E2E autenticado con Firebase Auth Emulator.
- Grabado del chip vía Web NFC API.
