# Sprint mejoras — Plan 1: Flota + Conductores (A+B+C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards de flota a ancho completo; PIN de conductor visible (recuperable) con ojito y "Actualizar PIN"; importación de conductores pegando filas desde Excel.

**Architecture:** El PIN se guarda recuperable (`pin`) junto al `pinHash` existente — la verificación scrypt no cambia; el campo solo se expone por el endpoint solo-Administrador (`driver:manage`). La importación usa un parser puro (`lib/drivers/importar.ts`) compartido conceptualmente entre la vista previa del cliente y la re-validación del servidor, con PINs generados en el cliente para que la vista previa coincida con lo creado.

**Tech Stack:** Next.js 16 (App Router, TS estricto), Firebase Admin SDK, Vitest 4, Tailwind v4.

## Global Constraints

- **Español neutro (Chile), "tú" no "vos"** en UI/copy/comentarios. Iconos SVG inline, sin emojis.
- **Next 16**: `params` de route handlers es `Promise` (`await params`).
- **No confiar en el cliente**: `/api/*` privados validan `getMembership()` + `can(role, 'driver:manage')`.
- **Firestore Admin rechaza `undefined`**: construir objetos sin claves undefined u `?? null`.
- **La verificación de PIN no cambia**: scrypt (`verifyDriverPin`) + bloqueo siguen igual; `pin` recuperable es solo para mostrar al admin.
- **Vitest 4**: mocks compartidos dentro de `vi.mock(...)` requieren `vi.hoisted(() => ({...}))`.
- Verificación antes de cada commit: `npx tsc --noEmit`, `npx eslint app components lib` (0 errores), tests de la tarea.

---

### Task 1: FlotaGrid a ancho completo (A)

**Files:**
- Modify: `components/flota/FlotaGrid.tsx:23`

**Interfaces:** ninguna (cambio visual puro).

- [ ] **Step 1: Cambiar la grilla a una columna**

En `components/flota/FlotaGrid.tsx`, reemplazar:

```tsx
        <ul className="grid gap-3 sm:grid-cols-2">
```

por:

```tsx
        <ul className="grid gap-3">
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npx eslint app components lib && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 3: Commit**

```bash
git add components/flota/FlotaGrid.tsx
git commit -m "feat(flota): cards de vehiculo a ancho completo"
```

---

### Task 2: PIN recuperable en modelo, data y API (B backend)

**Files:**
- Modify: `lib/types.ts` (interface `Driver`)
- Modify: `lib/data/drivers.ts` (`toDriver`, `createDriver`, `resetDriverPin`)
- Modify: `app/api/conductores/route.ts` (GET incluye `pin`)
- Test: `app/api/conductores/__tests__/route.test.ts` (crear)

**Interfaces:**
- Produces: `Driver` gana `pin?: string` (recuperable; ausente en conductores antiguos).
- Produces (HTTP): `GET /api/conductores` → cada driver incluye `pin: string | null`.
- Produces: `createDriver`/`resetDriverPin` persisten `pin` junto a `pinHash`.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/conductores/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/membership', () => ({ getMembership: (...a: unknown[]) => getMembership(...a) }))
const listDrivers = vi.hoisted(() => vi.fn())
const createDriver = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/drivers', () => ({
  listDrivers: (...a: unknown[]) => listDrivers(...a),
  createDriver: (...a: unknown[]) => createDriver(...a),
}))

import { GET, POST } from '@/app/api/conductores/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }

beforeEach(() => {
  getMembership.mockReset(); listDrivers.mockReset(); createDriver.mockReset()
  getMembership.mockResolvedValue({ uid: 'me', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  createDriver.mockResolvedValue({ id: 'd9' })
})

describe('GET /api/conductores', () => {
  it('incluye el pin recuperable (o null si es un conductor antiguo)', async () => {
    listDrivers.mockResolvedValue([
      { id: 'd1', nombre: 'Ana', rut: null, activo: true, createdAt: 't', pin: '1234' },
      { id: 'd2', nombre: 'Beto', rut: null, activo: true, createdAt: 't', pin: undefined },
    ])
    const res = await GET()
    const data = await res.json()
    expect(data.drivers[0].pin).toBe('1234')
    expect(data.drivers[1].pin).toBeNull()
  })
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ uid: 'me', email: 'a@b.cl', companyId: 'c1', role: 'editor' })
    expect((await GET()).status).toBe(403)
  })
})

describe('POST /api/conductores', () => {
  it('crea pasando el pin', async () => {
    const res = await POST(req({ nombre: 'Ana', pin: '1234' }))
    expect(res.status).toBe(200)
    expect(createDriver).toHaveBeenCalledWith('c1', 'me', { nombre: 'Ana', rut: undefined, pin: '1234' })
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run app/api/conductores/__tests__/route.test.ts`
Expected: FAIL — el test de GET falla porque la respuesta actual no incluye `pin`.

- [ ] **Step 3: Agregar `pin` al tipo `Driver`**

En `lib/types.ts`, en `interface Driver`, agregar tras `pinHash: string`:

```ts
  /** PIN recuperable para mostrarlo al Administrador (decisión de producto).
   *  Ausente en conductores creados antes de este campo. La verificación usa pinHash. */
  pin?: string
```

- [ ] **Step 4: Persistir y leer `pin` en `lib/data/drivers.ts`**

En `toDriver`, agregar tras `pinHash: d.pinHash,`:

```ts
    pin: d.pin ?? undefined,
```

En `createDriver`, en el objeto `data`, agregar tras `pinHash: hashPin(input.pin),`:

```ts
    pin: input.pin,
```

En `resetDriverPin`, reemplazar el `update` por:

```ts
  await ref.update({ pinHash: hashPin(pin), pin, intentosFallidos: 0, bloqueadoHasta: null })
```

- [ ] **Step 5: Exponer `pin` en el GET**

En `app/api/conductores/route.ts`, reemplazar la línea del map del GET por:

```ts
    drivers: drivers.map((d) => ({ id: d.id, nombre: d.nombre, rut: d.rut ?? null, activo: d.activo, createdAt: d.createdAt, pin: d.pin ?? null })),
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run app/api/conductores/__tests__/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/data/drivers.ts app/api/conductores/route.ts app/api/conductores/__tests__/route.test.ts
git commit -m "feat(conductores): PIN recuperable en modelo y API (solo admin)"
```

---

### Task 3: DriversCard — PIN con ojito + "Actualizar PIN" (B UI)

**Files:**
- Modify: `components/drivers/DriversCard.tsx` (reescritura completa)

**Interfaces:**
- Consumes (HTTP): `GET /api/conductores` (drivers con `pin: string | null`), `PATCH /api/conductores/[id]` con `{ pin }`.
- Produces: el componente completo de abajo — Task 6 agrega la importación **sobre este código exacto**.

- [ ] **Step 1: Reescribir el componente**

Reemplazar `components/drivers/DriversCard.tsx` completo por:

```tsx
'use client'
import { useEffect, useState } from 'react'

interface Driver { id: string; nombre: string; rut: string | null; activo: boolean; pin: string | null }

function OjoIcon({ tachado }: { tachado: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
      {tachado ? (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </>
      ) : (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

export default function DriversCard() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [rut, setRut] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Fila con el PIN revelado y fila en edición de PIN (una a la vez).
  const [pinVisibleDe, setPinVisibleDe] = useState<string | null>(null)
  const [editandoPinDe, setEditandoPinDe] = useState<string | null>(null)
  const [nuevoPin, setNuevoPin] = useState('')

  async function load() {
    const res = await fetch('/api/conductores')
    if (res.ok) setDrivers((await res.json()).drivers)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/conductores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, rut: rut || undefined, pin }),
    })
    setBusy(false)
    if (res.ok) { setNombre(''); setRut(''); setPin(''); load() }
    else setError((await res.json().catch(() => ({}))).error ?? 'No se pudo agregar.')
  }

  async function toggleActivo(d: Driver) {
    await fetch(`/api/conductores/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !d.activo }),
    })
    load()
  }
  async function guardarPin(d: Driver) {
    setError(null)
    const res = await fetch(`/api/conductores/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: nuevoPin }),
    })
    if (res.ok) { setEditandoPinDe(null); setNuevoPin(''); load() }
    else setError((await res.json().catch(() => ({}))).error ?? 'El PIN debe ser de 4 dígitos.')
  }
  async function eliminar(d: Driver) {
    if (!confirm(`¿Eliminar a ${d.nombre} del padrón? Su historial de usos se conserva.`)) return
    await fetch(`/api/conductores/${d.id}`, { method: 'DELETE' })
    load()
  }

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Conductores</h2>
      <p className="mt-1 text-sm text-acero">Padrón de quienes usan la flota. Cada uno confirma con su PIN al tomar o entregar un vehículo.</p>

      {loading ? (
        <p className="mt-4 text-sm text-acero">Cargando…</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {drivers.map((d) => (
              <li key={d.id} className="rounded-lg border border-linea px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-tinta">{d.nombre} {!d.activo && <span className="text-xs text-acero">(inactivo)</span>}</p>
                    {d.rut && <span className="text-xs text-acero">{d.rut}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex items-center gap-1 font-mono text-sm text-tinta">
                      {d.pin ? (pinVisibleDe === d.id ? d.pin : '••••') : <span title="PIN asignado antes de este cambio; actualízalo para verlo" className="text-acero">—</span>}
                      {d.pin && (
                        <button
                          type="button"
                          onClick={() => setPinVisibleDe(pinVisibleDe === d.id ? null : d.id)}
                          aria-label={pinVisibleDe === d.id ? 'Ocultar PIN' : 'Ver PIN'}
                          className="text-acero hover:text-tinta"
                        >
                          <OjoIcon tachado={pinVisibleDe === d.id} />
                        </button>
                      )}
                    </span>
                    <button onClick={() => { setEditandoPinDe(editandoPinDe === d.id ? null : d.id); setNuevoPin(''); setError(null) }} className="text-azul hover:underline">
                      Actualizar PIN
                    </button>
                    <button onClick={() => toggleActivo(d)} className="text-acero hover:underline">{d.activo ? 'Desactivar' : 'Activar'}</button>
                    <button onClick={() => eliminar(d)} className="text-vencido hover:underline">Eliminar</button>
                  </div>
                </div>
                {editandoPinDe === d.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={nuevoPin}
                      onChange={(e) => setNuevoPin(e.target.value)}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Nuevo PIN (4 dígitos)"
                      className="w-44 rounded-lg border border-linea bg-superficie px-3 py-1.5 text-sm text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none"
                    />
                    <button onClick={() => guardarPin(d)} className="rounded-lg bg-azul px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press">Guardar</button>
                    <button onClick={() => { setEditandoPinDe(null); setNuevoPin('') }} className="rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">Cancelar</button>
                  </div>
                )}
              </li>
            ))}
            {drivers.length === 0 && <li className="text-sm text-acero">Aún no hay conductores.</li>}
          </ul>

          <form onSubmit={agregar} className="mt-4 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Nombre" className={inputCls} />
              <input value={rut} onChange={(e) => setRut(e.target.value)} placeholder="RUT (opcional)" className={inputCls} />
              <input value={pin} onChange={(e) => setPin(e.target.value)} required inputMode="numeric" maxLength={4} placeholder="PIN (4 dígitos)" className={inputCls} />
              <button type="submit" disabled={busy} className="shrink-0 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
                {busy ? 'Agregando…' : 'Agregar'}
              </button>
            </div>
            {error && <p className="text-sm text-vencido">{error}</p>}
          </form>
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npx eslint app components lib && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 3: Verificación manual (describir en el reporte)**

Con `npm run dev`, como Administrador en Configuración: cada conductor con PIN recuperable muestra `••••` + ojito que lo revela; conductores antiguos muestran `—`; "Actualizar PIN" abre el input inline, guarda y el nuevo PIN queda visible con el ojito.

- [ ] **Step 4: Commit**

```bash
git add components/drivers/DriversCard.tsx
git commit -m "feat(conductores): PIN con ojito y edicion inline Actualizar PIN"
```

---

### Task 4: Parser de importación (C — lógica pura)

**Files:**
- Create: `lib/drivers/importar.ts`
- Test: `lib/drivers/__tests__/importar.test.ts` (crear)

**Interfaces:**
- Produces:
  ```ts
  export interface FilaImport {
    nombre: string
    rut?: string
    pin: string          // el PIN final (dado o generado); '' en filas con error
    pinGenerado: boolean
    estado: 'ok' | 'sin_nombre' | 'pin_invalido' | 'duplicado'
  }
  export function parseImportacion(
    texto: string,
    nombresExistentes: string[],
    genPin?: () => string,
  ): FilaImport[]
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/drivers/__tests__/importar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseImportacion } from '@/lib/drivers/importar'

const gen = () => '9999'

describe('parseImportacion', () => {
  it('parsea filas tab-separadas (nombre, rut, pin)', () => {
    const filas = parseImportacion('Ana Pérez\t11.111.111-1\t1234\nBeto\t\t5678', [], gen)
    expect(filas).toEqual([
      { nombre: 'Ana Pérez', rut: '11.111.111-1', pin: '1234', pinGenerado: false, estado: 'ok' },
      { nombre: 'Beto', rut: undefined, pin: '5678', pinGenerado: false, estado: 'ok' },
    ])
  })
  it('acepta ; y , como separador cuando no hay tab', () => {
    expect(parseImportacion('Ana;;1234', [], gen)[0].estado).toBe('ok')
    expect(parseImportacion('Ana,,1234', [], gen)[0].estado).toBe('ok')
  })
  it('genera PIN de 4 dígitos cuando viene vacío', () => {
    const [f] = parseImportacion('Ana', [], gen)
    expect(f).toMatchObject({ pin: '9999', pinGenerado: true, estado: 'ok' })
  })
  it('marca sin_nombre y pin_invalido', () => {
    const filas = parseImportacion('\t\t1234\nBeto\t\t12', [], gen)
    expect(filas[0].estado).toBe('sin_nombre')
    expect(filas[1].estado).toBe('pin_invalido')
  })
  it('marca duplicados contra el padrón y dentro del pegado (case-insensitive)', () => {
    const filas = parseImportacion('ana\t\t1234\nBeto\t\t5678\nBETO\t\t1111', ['Ana'], gen)
    expect(filas[0].estado).toBe('duplicado')
    expect(filas[1].estado).toBe('ok')
    expect(filas[2].estado).toBe('duplicado')
  })
  it('ignora líneas vacías', () => {
    expect(parseImportacion('\n\nAna\t\t1234\n\n', [], gen)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/drivers/__tests__/importar.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el parser**

Crear `lib/drivers/importar.ts`:

```ts
import { isValidPinFormat } from '@/lib/drivers/pin'

export interface FilaImport {
  nombre: string
  rut?: string
  pin: string
  pinGenerado: boolean
  estado: 'ok' | 'sin_nombre' | 'pin_invalido' | 'duplicado'
}

function pinAleatorio(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

function separar(linea: string): string[] {
  const sep = linea.includes('\t') ? '\t' : linea.includes(';') ? ';' : ','
  return linea.split(sep).map((c) => c.trim())
}

/**
 * Parsea filas pegadas desde Excel/Sheets (`nombre ⇥ rut ⇥ pin`; rut y pin
 * opcionales). PIN vacío → se genera uno de 4 dígitos. Duplicado = nombre ya
 * en el padrón o repetido antes en el mismo pegado (case-insensitive).
 */
export function parseImportacion(
  texto: string,
  nombresExistentes: string[],
  genPin: () => string = pinAleatorio,
): FilaImport[] {
  const vistos = new Set(nombresExistentes.map((n) => n.trim().toLowerCase()))
  const filas: FilaImport[] = []
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue
    const [nombre = '', rut = '', pinDado = ''] = separar(linea)
    if (!nombre) {
      filas.push({ nombre: '', rut: undefined, pin: '', pinGenerado: false, estado: 'sin_nombre' })
      continue
    }
    if (pinDado && !isValidPinFormat(pinDado)) {
      filas.push({ nombre, rut: rut || undefined, pin: '', pinGenerado: false, estado: 'pin_invalido' })
      continue
    }
    const clave = nombre.toLowerCase()
    if (vistos.has(clave)) {
      filas.push({ nombre, rut: rut || undefined, pin: '', pinGenerado: false, estado: 'duplicado' })
      continue
    }
    vistos.add(clave)
    filas.push({
      nombre,
      rut: rut || undefined,
      pin: pinDado || genPin(),
      pinGenerado: !pinDado,
      estado: 'ok',
    })
  }
  return filas
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/drivers/__tests__/importar.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/drivers/importar.ts lib/drivers/__tests__/importar.test.ts
git commit -m "feat(conductores): parser puro de importacion pegada desde Excel"
```

---

### Task 5: Endpoint de importación (C backend)

**Files:**
- Create: `app/api/conductores/import/route.ts`
- Test: `app/api/conductores/import/__tests__/route.test.ts` (crear)

**Interfaces:**
- Consumes: `createDriver`, `listDrivers` (lib/data/drivers), `isValidPinFormat`, `getMembership`, `can`.
- Produces (HTTP): `POST /api/conductores/import` con body `{ filas: { nombre: string; rut?: string; pin: string }[] }` → `200 { creados: number, omitidos: number }` | `400` sin filas o >100 | `401/403`.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/conductores/import/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/membership', () => ({ getMembership: (...a: unknown[]) => getMembership(...a) }))
const listDrivers = vi.hoisted(() => vi.fn())
const createDriver = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/drivers', () => ({
  listDrivers: (...a: unknown[]) => listDrivers(...a),
  createDriver: (...a: unknown[]) => createDriver(...a),
}))

import { POST } from '@/app/api/conductores/import/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }

beforeEach(() => {
  getMembership.mockReset(); listDrivers.mockReset(); createDriver.mockReset()
  getMembership.mockResolvedValue({ uid: 'me', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  listDrivers.mockResolvedValue([{ id: 'd1', nombre: 'Ana' }])
  createDriver.mockResolvedValue({ id: 'nuevo' })
})

describe('POST /api/conductores/import', () => {
  it('crea las filas válidas y omite duplicados/inválidas', async () => {
    const res = await POST(req({ filas: [
      { nombre: 'Beto', pin: '1234' },
      { nombre: 'ana', pin: '5678' },            // duplicado contra el padrón
      { nombre: '', pin: '1111' },               // sin nombre
      { nombre: 'Carla', rut: '1-9', pin: '22' } // pin inválido
    ] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ creados: 1, omitidos: 3 })
    expect(createDriver).toHaveBeenCalledTimes(1)
    expect(createDriver).toHaveBeenCalledWith('c1', 'me', { nombre: 'Beto', rut: undefined, pin: '1234' })
  })
  it('400 si no vienen filas o son más de 100', async () => {
    expect((await POST(req({}))).status).toBe(400)
    const muchas = Array.from({ length: 101 }, (_, i) => ({ nombre: `n${i}`, pin: '1234' }))
    expect((await POST(req({ filas: muchas }))).status).toBe(400)
  })
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ uid: 'me', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
    expect((await POST(req({ filas: [{ nombre: 'X', pin: '1234' }] }))).status).toBe(403)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run app/api/conductores/import/__tests__/route.test.ts`
Expected: FAIL (la ruta no existe).

- [ ] **Step 3: Implementar la ruta**

Crear `app/api/conductores/import/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { createDriver, listDrivers } from '@/lib/data/drivers'
import { isValidPinFormat } from '@/lib/drivers/pin'

export const dynamic = 'force-dynamic'

const MAX_FILAS = 100

// Importación masiva: re-valida en el servidor (nunca confía en la vista previa
// del cliente): nombre requerido, PIN de 4 dígitos, sin duplicados contra el
// padrón ni dentro del lote (case-insensitive).
export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const filas = Array.isArray(body?.filas) ? body.filas : null
  if (!filas || filas.length === 0 || filas.length > MAX_FILAS) {
    return NextResponse.json({ error: `Debes enviar entre 1 y ${MAX_FILAS} filas.` }, { status: 400 })
  }

  const existentes = await listDrivers(m.companyId)
  const vistos = new Set(existentes.map((d) => d.nombre.trim().toLowerCase()))

  let creados = 0
  let omitidos = 0
  for (const f of filas) {
    const nombre = String(f?.nombre ?? '').trim()
    const rut = f?.rut ? String(f.rut).trim() : undefined
    const pin = String(f?.pin ?? '')
    const clave = nombre.toLowerCase()
    if (!nombre || !isValidPinFormat(pin) || vistos.has(clave)) {
      omitidos++
      continue
    }
    vistos.add(clave)
    await createDriver(m.companyId, m.uid, { nombre, rut, pin })
    creados++
  }
  return NextResponse.json({ creados, omitidos })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run app/api/conductores/import/__tests__/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/conductores/import/
git commit -m "feat(conductores): endpoint de importacion masiva con re-validacion"
```

---

### Task 6: Panel "Importar" en DriversCard (C UI)

**Files:**
- Modify: `components/drivers/DriversCard.tsx` (el código exacto que dejó Task 3)

**Interfaces:**
- Consumes: `parseImportacion`/`FilaImport` de `@/lib/drivers/importar` (Task 4); `POST /api/conductores/import` (Task 5).

- [ ] **Step 1: Agregar imports y estado**

En `components/drivers/DriversCard.tsx`, reemplazar:

```tsx
'use client'
import { useEffect, useState } from 'react'
```

por:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { parseImportacion } from '@/lib/drivers/importar'
```

Y agregar, tras la línea `const [nuevoPin, setNuevoPin] = useState('')`:

```tsx
  const [importando, setImportando] = useState(false)
  const [textoImport, setTextoImport] = useState('')
  const [resumenImport, setResumenImport] = useState<string | null>(null)
```

- [ ] **Step 2: Agregar la vista previa y el handler**

Tras la función `eliminar(d)`, agregar:

```tsx
  const filasImport = useMemo(
    () => parseImportacion(textoImport, drivers.map((d) => d.nombre)),
    [textoImport, drivers],
  )
  const filasOk = filasImport.filter((f) => f.estado === 'ok')

  async function importar() {
    setBusy(true); setError(null); setResumenImport(null)
    const res = await fetch('/api/conductores/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filas: filasOk.map((f) => ({ nombre: f.nombre, rut: f.rut, pin: f.pin })) }),
    })
    setBusy(false)
    if (res.ok) {
      const data = await res.json()
      setResumenImport(`${data.creados} conductor${data.creados === 1 ? '' : 'es'} creado${data.creados === 1 ? '' : 's'}${data.omitidos ? `, ${data.omitidos} omitido${data.omitidos === 1 ? '' : 's'}` : ''}.`)
      setTextoImport('')
      setImportando(false)
      load()
    } else {
      setError((await res.json().catch(() => ({}))).error ?? 'No se pudo importar.')
    }
  }

  const ESTADO_LABEL: Record<string, string> = {
    ok: 'Se creará',
    sin_nombre: 'Falta el nombre',
    pin_invalido: 'PIN inválido (4 dígitos)',
    duplicado: 'Ya existe — se omitirá',
  }
```

- [ ] **Step 3: Agregar el botón y el panel de importación**

Reemplazar el cierre del formulario de agregar:

```tsx
            {error && <p className="text-sm text-vencido">{error}</p>}
          </form>
        </>
      )}
```

por:

```tsx
            {error && <p className="text-sm text-vencido">{error}</p>}
          </form>

          <div className="mt-3">
            {!importando ? (
              <div className="flex items-center gap-3">
                <button onClick={() => { setImportando(true); setResumenImport(null) }} className="text-sm font-medium text-azul hover:underline">
                  Importar desde Excel
                </button>
                {resumenImport && <span className="text-sm text-[#15803D]">{resumenImport}</span>}
              </div>
            ) : (
              <div className="rounded-xl border border-linea p-3">
                <p className="text-sm font-medium text-tinta">Importar conductores</p>
                <p className="mt-1 text-xs text-acero">
                  Copia las filas desde Excel o Sheets y pégalas aquí. Columnas: nombre, RUT (opcional) y PIN (opcional — si falta, se genera uno de 4 dígitos).
                </p>
                <textarea
                  value={textoImport}
                  onChange={(e) => setTextoImport(e.target.value)}
                  rows={5}
                  placeholder={'Juan Soto\t11.111.111-1\t1234\nMaría Rojas'}
                  className="mt-2 w-full rounded-lg border border-linea bg-superficie px-3 py-2 font-mono text-sm text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none"
                />
                {filasImport.length > 0 && (
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                    {filasImport.map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded border border-linea px-2 py-1">
                        <span className="truncate text-tinta">{f.nombre || '(sin nombre)'}{f.rut ? ` · ${f.rut}` : ''}{f.estado === 'ok' ? ` · PIN ${f.pin}${f.pinGenerado ? ' (generado)' : ''}` : ''}</span>
                        <span className={f.estado === 'ok' ? 'shrink-0 text-[#15803D]' : 'shrink-0 text-vencido'}>{ESTADO_LABEL[f.estado]}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={importar}
                    disabled={busy || filasOk.length === 0}
                    className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
                  >
                    {busy ? 'Importando…' : `Crear ${filasOk.length} conductor${filasOk.length === 1 ? '' : 'es'}`}
                  </button>
                  <button onClick={() => { setImportando(false); setTextoImport('') }} className="rounded-lg border border-linea px-4 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx eslint app components lib && npm run build && npx vitest run lib/drivers/__tests__/importar.test.ts`
Expected: sin errores; tests pasan.

- [ ] **Step 5: Verificación manual (describir en el reporte)**

Con `npm run dev`: pegar 2-3 filas (una duplicada, una sin PIN) → la vista previa marca estados y muestra el PIN generado; "Crear N conductores" los agrega y aparecen en la lista con su PIN visible vía ojito.

- [ ] **Step 6: Commit**

```bash
git add components/drivers/DriversCard.tsx
git commit -m "feat(conductores): importar pegando filas desde Excel con vista previa"
```

---

### Task 7: Documentación + verificación final

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Actualizar CLAUDE.md**

En la sección "Bitácora de uso de flota", en la línea del padrón de conductores, agregar: que `drivers/{id}` ahora guarda también `pin` **recuperable** (solo visible para el Administrador vía `GET /api/conductores`; la verificación sigue usando `pinHash` con scrypt; conductores previos no lo tienen hasta actualizar su PIN), que existe `POST /api/conductores/import` (importación pegada desde Excel, tope 100 filas, re-valida en servidor) con parser puro en `lib/drivers/importar.ts` (`parseImportacion`), y que en `DriversCard` el PIN se ve con ojito + "Actualizar PIN" + botón "Importar desde Excel". En la línea del panel `/flota`, anotar que la grilla es de una columna (cards a todo el ancho).

- [ ] **Step 2: Verificación completa**

Run: `npx tsc --noEmit && npx eslint app components lib && npm test && npm run build`
Expected: typecheck OK; 0 errores de eslint; todos los tests pasan (salvo `rules.test.ts` sin emulador, preexistente); build compila.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: PIN recuperable + importacion de conductores + flota una columna"
```

---

## Self-Review (hecho por el autor del plan)

- **Cobertura del spec (A+B+C):** A → Task 1; B (modelo/data/API) → Task 2, (UI ojito + Actualizar PIN) → Task 3, sin migración con `—` → Task 3; C (parser + PIN generado + duplicados + separadores) → Task 4, (endpoint re-valida + tope 100) → Task 5, (UI pegar + vista previa + resumen) → Task 6; docs → Task 7. D y E quedan para el Plan 2.
- **Tipos consistentes:** `FilaImport`/`parseImportacion(texto, nombresExistentes, genPin?)` definidos en Task 4 y consumidos igual en Task 6; `pin: string | null` en GET (Task 2) consumido por la interface `Driver` local de Task 3; el body de import `{ filas: {nombre, rut?, pin}[] }` coincide entre Task 5 y Task 6.
- **Sin placeholders:** cada step de código trae el código completo; Task 6 ancla sus edits sobre el código exacto que Task 3 deja escrito.
- **Gotchas respetados:** `rut: rut || undefined` nunca llega a Firestore como undefined (createDriver ya normaliza `?? null`); parser puro sin Firebase; mocks con `vi.hoisted`.
