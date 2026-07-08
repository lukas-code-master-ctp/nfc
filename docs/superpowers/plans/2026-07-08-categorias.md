# Categorías de vehículos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Categorías renombrables por empresa (id+nombre en el company doc), una por vehículo (`categoriaId`), gestionadas en Configuración, asignables en la página del vehículo, con filtro + chip en el dashboard.

**Architecture:** Las categorías viven en `companies/{id}.categorias` (sin colección nueva). El vehículo guarda `categoriaId`. Saneo puro server-side. La UI reutiliza los patrones existentes (cards de Configuración, filtros del dashboard, `PATCH /api/company` y `/api/vehicles/[id]`).

**Tech Stack:** Next.js 16 (App Router, server + client components), TypeScript estricto, Firebase Admin SDK, Vitest 4, Tailwind v4.

## Global Constraints

- Idioma de todo el código/UI/copy: **español neutro (Chile)**, "tú".
- **Firestore Admin rechaza `undefined`**: para quitar la categoría se escribe `null`, nunca `undefined`.
- Endpoints privados: `getMembership()` + `can(role, action)` (`billing:manage` para config de empresa; `vehicle:write` para asignar categoría al vehículo). Nunca confiar en el cliente.
- Tope **30** categorías por empresa; nombre trim + máx **40** chars; sin duplicados por nombre (case-insensitive).
- Antes de commitear cada task: `npx tsc --noEmit`, `npx vitest run <tests>` (si aplica), `npx eslint <archivos>`, y en tasks de UI/rutas `npm run build`.

---

### Task 1: Tipos + saneo puro

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/company/categorias.ts`
- Test: `lib/company/__tests__/categorias.test.ts`

**Interfaces:**
- Produces: `Categoria { id: string; nombre: string }`; `Company.categorias?: Categoria[]`; `Vehicle.categoriaId?: string | null`.
- Produces: `sanitizeCategorias(raw: unknown): Categoria[]`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/company/__tests__/categorias.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeCategorias } from '@/lib/company/categorias'

describe('sanitizeCategorias', () => {
  it('no-array → []', () => {
    expect(sanitizeCategorias(undefined)).toEqual([])
    expect(sanitizeCategorias('x')).toEqual([])
  })
  it('trim, descarta vacíos y conserva id', () => {
    const r = sanitizeCategorias([{ id: 'a', nombre: '  Camiones  ' }, { id: 'b', nombre: '  ' }])
    expect(r).toEqual([{ id: 'a', nombre: 'Camiones' }])
  })
  it('dedup por nombre case-insensitive (conserva el primero)', () => {
    const r = sanitizeCategorias([{ id: 'a', nombre: 'Reparto' }, { id: 'b', nombre: 'reparto' }])
    expect(r).toEqual([{ id: 'a', nombre: 'Reparto' }])
  })
  it('genera id si falta', () => {
    const r = sanitizeCategorias([{ nombre: 'Ejecutivos' }])
    expect(r).toHaveLength(1)
    expect(typeof r[0].id).toBe('string')
    expect(r[0].id.length).toBeGreaterThan(0)
    expect(r[0].nombre).toBe('Ejecutivos')
  })
  it('recorta el nombre a 40 y topea en 30 categorías', () => {
    const largo = 'x'.repeat(50)
    expect(sanitizeCategorias([{ id: '1', nombre: largo }])[0].nombre).toHaveLength(40)
    const muchas = Array.from({ length: 40 }, (_, i) => ({ id: String(i), nombre: `c${i}` }))
    expect(sanitizeCategorias(muchas)).toHaveLength(30)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/company/__tests__/categorias.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Crear `lib/company/categorias.ts`**

```ts
import { nanoid } from 'nanoid'
import type { Categoria } from '@/lib/types'

const MAX = 30
const MAX_NOMBRE = 40

// Saneo de la lista de categorías que llega del cliente (PATCH /api/company).
export function sanitizeCategorias(raw: unknown): Categoria[] {
  if (!Array.isArray(raw)) return []
  const out: Categoria[] = []
  const vistos = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as { id?: unknown; nombre?: unknown }
    const nombre = String(r.nombre ?? '').trim().slice(0, MAX_NOMBRE)
    if (!nombre) continue
    const key = nombre.toLowerCase()
    if (vistos.has(key)) continue
    vistos.add(key)
    const id = typeof r.id === 'string' && r.id ? r.id : nanoid()
    out.push({ id, nombre })
    if (out.length >= MAX) break
  }
  return out
}
```

- [ ] **Step 4: Agregar los tipos en `lib/types.ts`**

Agregar la interfaz `Categoria` (cerca de `Company`), y los campos opcionales:

```ts
export interface Categoria {
  id: string
  nombre: string
}
```

En `Company` (después de `avisoUsoHoras?`):

```ts
  categorias?: Categoria[]
```

En `Vehicle` (después de `usoActual?`):

```ts
  categoriaId?: string | null
```

- [ ] **Step 5: Correr los tests, typecheck, lint, commit**

Run: `npx vitest run lib/company/__tests__/categorias.test.ts && npx tsc --noEmit && npx eslint lib/types.ts lib/company/categorias.ts lib/company/__tests__/categorias.test.ts`

```bash
git add lib/types.ts lib/company/categorias.ts lib/company/__tests__/categorias.test.ts
git commit -m "feat(categorias): tipos + saneo puro de categorias"
```

---

### Task 2: Persistencia + `PATCH /api/company`

**Files:**
- Modify: `lib/data/companies.ts` (`getCompany` lee, `saveCompany` persiste `categorias`)
- Modify: `app/api/company/route.ts` (acepta `categorias` saneadas)
- Test: `app/api/company/__tests__/route.test.ts` (crear si no existe)

**Interfaces:**
- Consumes: `sanitizeCategorias` (Task 1); `Categoria` (Task 1).
- Produces: `getCompany().categorias` (`[]` si no hay); `saveCompany(companyId, { …, categorias? })`; `PATCH /api/company` acepta `{ categorias }` (solo o junto a `company`/`avisoUsoHoras`).

- [ ] **Step 1: `getCompany` y `saveCompany`**

En `lib/data/companies.ts`:

(a) En el objeto que retorna `getCompany`, agregar (junto a `plan`/`avisoUsoHoras`):

```ts
    categorias: d.categorias ?? [],
```

(b) Extender la firma y el cuerpo de `saveCompany` (agregar `categorias`):

```ts
export async function saveCompany(
  companyId: string,
  patch: { company?: CompanyData; plan?: PlanData; avisoUsoHoras?: number; categorias?: Categoria[] },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.company !== undefined) data.company = patch.company
  if (patch.plan !== undefined) data.plan = { maxVehiculos: Math.max(1, Math.floor(patch.plan.maxVehiculos)) }
  if (patch.avisoUsoHoras !== undefined) data.avisoUsoHoras = Math.max(1, Math.floor(patch.avisoUsoHoras))
  if (patch.categorias !== undefined) data.categorias = patch.categorias
  await adminDb.collection(COL).doc(companyId).set(data, { merge: true })
}
```

Agregar `Categoria` al import de tipos existente en `companies.ts`.

- [ ] **Step 2: `PATCH /api/company` acepta `categorias`**

En `app/api/company/route.ts`, agregar el import y reescribir el cuerpo del `PATCH` (tras los guards de sesión/rol) para armar el patch de forma acumulativa:

```ts
import { sanitizeCategorias } from '@/lib/company/categorias'
```

```ts
  const body = await req.json()
  const patch: Parameters<typeof saveCompany>[1] = {}
  if (body.company && typeof body.company === 'object') patch.company = sanitizeCompany(body.company)
  const aviso = parseAvisoUsoHoras(body.avisoUsoHoras)
  if (aviso === 'invalid') {
    return NextResponse.json({ error: 'avisoUsoHoras inválido' }, { status: 400 })
  }
  if (aviso !== 'absent') patch.avisoUsoHoras = aviso
  if (body.categorias !== undefined) patch.categorias = sanitizeCategorias(body.categorias)

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 })
  }

  await saveCompany(m.companyId, patch)
  return NextResponse.json({ ok: true })
```

(Reemplaza el bloque actual que armaba el patch con `tieneCompany`; conserva los guards `getMembership()` + `can(m.role, 'billing:manage')` y la función `sanitizeCompany`.)

- [ ] **Step 3: Test del endpoint**

Crear `app/api/company/__tests__/route.test.ts` (si ya existe, agregar los casos):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const saveCompany = vi.fn()
vi.mock('@/lib/data/companies', () => ({ saveCompany: (...a: unknown[]) => saveCompany(...a) }))

import { PATCH } from '@/app/api/company/route'
function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }

beforeEach(() => {
  getMembership.mockReset(); saveCompany.mockReset()
  getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
})

describe('PATCH /api/company categorias', () => {
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
    expect((await PATCH(req({ categorias: [] }))).status).toBe(403)
  })
  it('guarda categorías saneadas sin company', async () => {
    const res = await PATCH(req({ categorias: [{ id: 'a', nombre: '  Camiones  ' }, { nombre: '' }] }))
    expect(res.status).toBe(200)
    expect(saveCompany).toHaveBeenCalledWith('c1', { categorias: [{ id: 'a', nombre: 'Camiones' }] })
  })
  it('400 si el body no trae nada que actualizar', async () => {
    expect((await PATCH(req({}))).status).toBe(400)
  })
})
```

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit && npx vitest run "app/api/company/__tests__/route.test.ts" && npx eslint lib/data/companies.ts "app/api/company/route.ts" "app/api/company/__tests__/route.test.ts" && npm run build`

```bash
git add lib/data/companies.ts "app/api/company/route.ts" "app/api/company/__tests__/route.test.ts"
git commit -m "feat(categorias): persistir y sanear categorias en PATCH /api/company"
```

---

### Task 3: UI de configuración — `CategoriasCard`

**Files:**
- Create: `components/company/CategoriasCard.tsx`
- Modify: `app/(app)/configuracion/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/company` con `{ categorias }` (Task 2); `Categoria`, `Company.categorias` (Task 1/2).
- Produces: `CategoriasCard({ initial: Categoria[] })`.

- [ ] **Step 1: Crear `components/company/CategoriasCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Categoria } from '@/lib/types'

export default function CategoriasCard({ initial }: { initial: Categoria[] }) {
  const router = useRouter()
  const [cats, setCats] = useState<Categoria[]>(initial)
  const [nueva, setNueva] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function agregar() {
    const nombre = nueva.trim()
    if (!nombre) return
    if (cats.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) { setNueva(''); return }
    setCats([...cats, { id: crypto.randomUUID(), nombre }])
    setNueva('')
  }
  function renombrar(id: string, nombre: string) {
    setCats(cats.map((c) => (c.id === id ? { ...c, nombre } : c)))
  }
  function eliminar(id: string) {
    if (!confirm('¿Eliminar esta categoría? Los vehículos que la tengan quedarán sin categoría.')) return
    setCats(cats.filter((c) => c.id !== id))
  }

  async function guardar() {
    setSaving(true); setError(null); setSaved(false)
    const res = await fetch('/api/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categorias: cats.map((c) => ({ id: c.id, nombre: c.nombre.trim() })) }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2500) }
    else setError('No se pudo guardar.')
  }

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Categorías</h2>
      <p className="mt-1 text-sm text-acero">Agrupa tus vehículos (ej. Camiones, Reparto). Podrás filtrar por categoría en el panel.</p>

      <div className="mt-4 space-y-2">
        {cats.length === 0 && <p className="text-sm text-acero">Aún no hay categorías.</p>}
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input value={c.nombre} onChange={(e) => renombrar(c.id, e.target.value)} className={inputCls} />
            <button type="button" onClick={() => eliminar(c.id)} className="shrink-0 text-sm text-vencido hover:underline">Eliminar</button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
          placeholder="Nueva categoría"
          className={inputCls}
        />
        <button type="button" onClick={agregar} className="shrink-0 rounded-lg border border-linea px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
          Agregar
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={saving} className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {saved && <span className="text-sm text-[#15803D]">Guardado ✓</span>}
        {error && <span className="text-sm text-vencido">{error}</span>}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Renderizar en Configuración**

En `app/(app)/configuracion/page.tsx`:

(a) Import:

```ts
import CategoriasCard from '@/components/company/CategoriasCard'
```

(b) Dentro de la rama del Administrador, después de `<PlataformaCard .../>`, agregar:

```tsx
      {esAdmin && <CategoriasCard initial={company?.categorias ?? []} />}
```

(Colócalo junto a los otros `{esAdmin && ...}` / después de `PlataformaCard`.)

- [ ] **Step 3: Verificar y commit**

Run: `npx tsc --noEmit && npx eslint components/company/CategoriasCard.tsx "app/(app)/configuracion/page.tsx" && npm run build`

```bash
git add components/company/CategoriasCard.tsx "app/(app)/configuracion/page.tsx"
git commit -m "feat(categorias): card de Categorias en Configuracion (Administrador)"
```

---

### Task 4: Asignación en el vehículo (`categoriaId`)

**Files:**
- Modify: `lib/data/vehicles.ts` (`toVehicle` mapea `categoriaId`)
- Create: `components/vehicle/CategoriaSelector.tsx`
- Modify: `app/(app)/vehiculos/[id]/page.tsx`
- Test: `lib/data/__tests__/vehicles.test.ts` (agregar aserción de `categoriaId`)

**Interfaces:**
- Consumes: `getCompany().categorias` (Task 2); `Vehicle.categoriaId` (Task 1); `PATCH /api/vehicles/[id]` (existente, pasa el patch a `updateVehicle`).
- Produces: `CategoriaSelector({ vehicleId: string; categoriaId: string | null; categorias: Categoria[] })`.

- [ ] **Step 1: `toVehicle` mapea `categoriaId`**

En `lib/data/vehicles.ts`, en `toVehicle`, agregar (junto a `usoActual`):

```ts
    categoriaId: data.categoriaId ?? null,
```

(`Vehicle.categoriaId?: string | null`; `VehicleInput` lo hereda, así que `updateVehicle` acepta `{ categoriaId }` en el `Partial` sin cambios.)

- [ ] **Step 2: Test de `toVehicle`**

En `lib/data/__tests__/vehicles.test.ts`, agregar un caso que verifique que `toVehicle` (vía `getVehicle`/`listVehicles`, según cómo mockee el archivo) devuelve `categoriaId`. Ejemplo (adaptar al mock existente del archivo):

```ts
  it('mapea categoriaId (null si no está)', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'v1', data: () => ({ companyId: 'c1', patente: 'AA', marca: 'x', modelo: 'y', anio: 2020, color: 'rojo', categoriaId: 'cat1' }) },
      { id: 'v2', data: () => ({ companyId: 'c1', patente: 'BB', marca: 'x', modelo: 'y', anio: 2020, color: 'azul' }) },
    ] })
    const vs = await listVehicles('c1')
    expect(vs.find((v) => v.id === 'v1')?.categoriaId).toBe('cat1')
    expect(vs.find((v) => v.id === 'v2')?.categoriaId).toBeNull()
  })
```

> Nota: revisá cómo `vehicles.test.ts` mockea `adminDb`/`listVehicles` y adaptá el nombre del mock (`whereGet` u otro) al patrón del archivo.

- [ ] **Step 3: Crear `components/vehicle/CategoriaSelector.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Categoria } from '@/lib/types'

export default function CategoriaSelector({
  vehicleId, categoriaId, categorias,
}: {
  vehicleId: string
  categoriaId: string | null
  categorias: Categoria[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  async function cambiar(value: string) {
    setSaving(true); setError(false)
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoriaId: value || null }),
    })
    setSaving(false)
    if (res.ok) router.refresh()
    else setError(true)
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-acero">Categoría</span>
      <select
        value={categoriaId ?? ''}
        disabled={saving}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-lg border border-linea bg-superficie px-3 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20 disabled:opacity-50"
      >
        <option value="">Sin categoría</option>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      {error && <span className="text-xs text-vencido">No se pudo guardar.</span>}
    </label>
  )
}
```

- [ ] **Step 4: Página del vehículo — cargar categorías y mostrar el selector**

En `app/(app)/vehiculos/[id]/page.tsx`:

(a) Imports:

```ts
import { getCompany } from '@/lib/data/companies'
import CategoriaSelector from '@/components/vehicle/CategoriaSelector'
```

(b) Cargar la empresa (junto a las otras cargas, con `await`):

```ts
  const company = await getCompany(m.companyId)
  const categorias = company?.categorias ?? []
```

(c) En la card de encabezado del vehículo (el bloque con marca/modelo/patente), agregar debajo del `<p>` de año/color el selector o la vista de solo lectura según el rol. Dentro de `<div className="min-w-0">` (o justo después de ese bloque), agregar:

```tsx
          {categorias.length > 0 && (
            canManageVehicle ? (
              <div className="mt-2">
                <CategoriaSelector vehicleId={vehicle.id} categoriaId={vehicle.categoriaId ?? null} categorias={categorias} />
              </div>
            ) : (
              vehicle.categoriaId && categorias.find((c) => c.id === vehicle.categoriaId) && (
                <p className="mt-2 text-sm text-acero">Categoría: <span className="font-medium text-tinta">{categorias.find((c) => c.id === vehicle.categoriaId)!.nombre}</span></p>
              )
            )
          )}
```

(`canManageVehicle` ya existe en la página = `can(m.role, 'vehicle:write')`.)

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit && npx vitest run lib/data/__tests__/vehicles.test.ts && npx eslint lib/data/vehicles.ts components/vehicle/CategoriaSelector.tsx "app/(app)/vehiculos/[id]/page.tsx" lib/data/__tests__/vehicles.test.ts && npm run build`

```bash
git add lib/data/vehicles.ts components/vehicle/CategoriaSelector.tsx "app/(app)/vehiculos/[id]/page.tsx" lib/data/__tests__/vehicles.test.ts
git commit -m "feat(categorias): asignar categoria al vehiculo (selector en su pagina)"
```

---

### Task 5: Filtro + chip en el dashboard

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`, `components/VehiclesBoard.tsx`, `components/VehicleCard.tsx`

**Interfaces:**
- Consumes: `getCompany().categorias`, `Vehicle.categoriaId` (Tasks 1/2).
- Produces: `Item` gana `categoriaId: string | null` y `categoriaNombre: string | null`; `VehiclesBoard` recibe `categorias: Categoria[]`; `VehicleCard` recibe `categoriaNombre?: string | null`.

- [ ] **Step 1: `dashboard/page.tsx` resuelve nombre y pasa categorías**

En `app/(app)/dashboard/page.tsx`:

(a) Agregar `import type { Categoria } from '@/lib/types'` si hace falta y usar `company?.categorias`:

```ts
  const categorias = company?.categorias ?? []
  const nombrePorCategoria = new Map(categorias.map((c) => [c.id, c.nombre]))
```

(b) En el `.map` de `items`, agregar a cada item:

```ts
        categoriaId: v.categoriaId ?? null,
        categoriaNombre: v.categoriaId ? (nombrePorCategoria.get(v.categoriaId) ?? null) : null,
```

(c) Pasar `categorias` al board:

```tsx
  return <VehiclesBoard items={items} limit={limit} canWrite={can(m.role, 'vehicle:write')} categorias={categorias} />
```

- [ ] **Step 2: `VehiclesBoard` — filtro de categoría**

En `components/VehiclesBoard.tsx`:

(a) Extender el tipo `Item` con `categoriaId: string | null` y `categoriaNombre: string | null`; agregar la prop `categorias: Categoria[]` (import `Categoria` de `@/lib/types`) a la firma del componente.

(b) Nuevo estado: `const [categoria, setCategoria] = useState<string>('todas')`.

(c) En `visible` (el `useMemo`), filtrar además por categoría: partir de `filter === 'todos' ? items : items.filter(...)` y luego aplicar `.filter((i) => categoria === 'todas' || i.categoriaId === categoria)` antes del sort. Agregar `categoria` a las deps del `useMemo`.

(d) Un `<select>` de categoría reutilizable (defínelo como variable JSX en el cuerpo, se usa en desktop y mobile), que solo se muestra si `categorias.length > 0`:

```tsx
  const categoriaSelect = categorias.length > 0 && (
    <select
      aria-label="Categoría"
      value={categoria}
      onChange={(e) => setCategoria(e.target.value)}
      className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
    >
      <option value="todas">Todas las categorías</option>
      {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </select>
  )
```

(e) **Desktop (sidebar):** dentro del `<aside>`, después de la card de "Ordenar por", agregar una card de "Categoría" (solo si hay categorías):

```tsx
            {categorias.length > 0 && (
              <div className="rounded-2xl border border-linea bg-superficie p-3 shadow-sm">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-acero">Categoría</p>
                {categoriaSelect}
              </div>
            )}
```

(f) **Mobile (barra compacta):** en el `<div className="flex justify-end">` que contiene el select de orden, agregar el `categoriaSelect` antes del de orden y ajustar a `flex-wrap justify-end gap-2` para que quepan ambos. Ejemplo: envolver ambos selects en un contenedor `flex flex-wrap justify-end gap-2` — el de categoría (con `className` compacto, no `w-full`) y el de orden.

> Nota de implementación: para mobile, usar una variante compacta del select de categoría (sin `w-full`); podés inline el `<select>` en la barra mobile en vez de reutilizar `categoriaSelect` (que es `w-full` para el sidebar). Mantené las mismas opciones.

- [ ] **Step 3: `VehicleCard` — chip de categoría**

En `components/VehicleCard.tsx`:

(a) Agregar la prop `categoriaNombre?: string | null` a la firma.

(b) En el bloque de badges (el `<div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">`), agregar antes del daño/StatusBadge un chip neutro si hay categoría:

```tsx
          {categoriaNombre && (
            <span className="whitespace-nowrap rounded-full bg-[#EEF0F3] px-2 py-0.5 text-xs font-medium text-acero">{categoriaNombre}</span>
          )}
```

(c) En `VehiclesBoard`, pasar `categoriaNombre={categoriaNombre}` al `<VehicleCard>` en el `.map` de `visible` (desestructurar `categoriaNombre`).

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit && npx eslint "app/(app)/dashboard/page.tsx" components/VehiclesBoard.tsx components/VehicleCard.tsx && npm run build`

```bash
git add "app/(app)/dashboard/page.tsx" components/VehiclesBoard.tsx components/VehicleCard.tsx
git commit -m "feat(categorias): filtro por categoria + chip en el dashboard"
```

---

## Notas de cierre (tras las 5 tasks)

- Actualizar `CLAUDE.md`: documentar las **categorías** — `Company.categorias?: Categoria[]` (id+nombre, en el company doc, tope 30, saneadas por `lib/company/categorias.ts`), `Vehicle.categoriaId?`, la card `CategoriasCard` (Configuración, Administrador, vía `PATCH /api/company`), el `CategoriaSelector` en la página del vehículo (`vehicle:write`), y el filtro + chip de categoría en el dashboard. Mencionar que borrar una categoría no cascada (los vehículos quedan "sin categoría").
- Reglas Firestore / índices: sin cambios (todo en el company doc / vehicle, ya scopeado por `companyId`; el filtro es client-side sobre los vehículos ya cargados).
