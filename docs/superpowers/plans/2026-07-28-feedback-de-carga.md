# Feedback de carga y dashboard sin consultas por vehículo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada clic de navegación muestre algo al instante, y que el dashboard deje de emitir consultas a Firestore por cada vehículo.

**Architecture:** Dos mitades independientes. (1) Cuatro `loading.tsx` con skeletons que calzan en tamaño con la página real, sobre dos primitivas compartidas. (2) Un resumen denormalizado en `vehicles/{id}` con las **fechas** de vencimiento y de última mantención — nunca el estado calculado — refrescado al escribir, con backfill y fallback a consulta en vivo.

**Tech Stack:** Next.js 16 (App Router), TypeScript estricto, React 19, Tailwind v4, Firebase Admin SDK, Vitest 4 + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-28-feedback-de-carga-design.md`

## Global Constraints

- Todo el código, UI, comentarios y mensajes en **español neutro (Chile)**, tratando de "tú".
- **Nunca guardar el estado calculado** (`al_dia`/`por_vencer`/`vencido`, `proxima`/`vencida`). Solo fechas y conteos. El estado cambia con el calendario, sin escrituras.
- `resumenDocs` / `resumenMantencion` **ausentes** significan "nunca calculado" → consultar en vivo. `resumenMantencion: { ultima: null }` significa "calculado, no hay mantenciones". Esa distinción es la razón del envoltorio: no la elimines.
- Los refrescadores son **best-effort**: capturan su propia excepción y hacen `console.error`. Un fallo del refresco nunca puede tumbar la escritura que ya se guardó.
- **Firestore Admin rechaza `undefined`**: construir los objetos sin claves `undefined` o usar `?? null`.
- Next 16: `params` y `searchParams` son `Promise` en páginas y route handlers dinámicos.
- Los skeletons deben **calzar en tamaño** con el contenido real. Un skeleton más bajo produce un salto al cargar, que molesta más que no haber puesto nada.
- Tokens de color: `tinta`, `acero`, `linea`, `lienzo`, `superficie`, `azul`, `azul-press`. Iconos SVG inline, sin emojis.
- Tests en `__tests__/` junto al módulo. Vitest 4: mocks compartidos con `vi.hoisted`.
- Al terminar: `npx tsc --noEmit`, `npm test`, `npx eslint app components lib`, `npm run build`.

## Estructura de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `components/skeleton/Skeleton.tsx` (nuevo) | Dos primitivas: `Bloque` y `Linea`. |
| `app/(app)/loading.tsx` (nuevo) | Skeleton genérico del grupo: cubre configuración, perfil, facturación, admin, reportes, transferencias. |
| `app/(app)/dashboard/loading.tsx` (nuevo) | Grilla de tarjetas fantasma. |
| `app/(app)/vehiculos/[id]/loading.tsx` (nuevo) | Encabezado + pestañas + bloque de contenido. |
| `app/v/[token]/loading.tsx` (nuevo) | Lockup + card del vehículo + botones del menú. |
| `lib/types.ts` (modificar) | `ResumenDocs`, `ResumenMantencion` y los dos campos en `Vehicle`. |
| `lib/documents/resumen.ts` (nuevo) | `resumirDocumentos`: **lógica pura**. Es el corazón de la denormalización. |
| `lib/vehicles/resumen.ts` (nuevo) | `resolverResumen`: decide resumen guardado vs consulta en vivo, con las cargas inyectadas. |
| `lib/data/documents.ts` (modificar) | `refreshResumenDocs`; `updateDocument`/`deleteDocument` devuelven el `vehicleId`. |
| `lib/data/mantenciones.ts` (modificar) | `refreshResumenMantencion`; `deleteMantencion` devuelve el `vehicleId`. |
| `lib/data/vehicles.ts` (modificar) | `toVehicle` mapea los dos campos nuevos. |
| `app/api/documents/route.ts`, `app/api/documents/[id]/route.ts` (modificar) | Refrescar tras crear, editar y borrar. |
| `app/api/mantenciones/route.ts`, `app/api/mantenciones/[id]/route.ts` (modificar) | Refrescar tras crear y borrar. |
| `app/(app)/dashboard/page.tsx` (modificar) | Usa `resolverResumen` en vez de consultar por vehículo. |
| `scripts/backfill-resumen.mjs` (nuevo) | Backfill one-time, dry-run sin `--apply`. |

**Orden:** los skeletons van primero porque son independientes de todo lo demás y entregan solos el valor que el usuario pidió.

---

### Task 1: Los cuatro skeletons

**Files:**
- Create: `components/skeleton/Skeleton.tsx`
- Create: `app/(app)/loading.tsx`
- Create: `app/(app)/dashboard/loading.tsx`
- Create: `app/(app)/vehiculos/[id]/loading.tsx`
- Create: `app/v/[token]/loading.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `Bloque({ className }: { className?: string })` y `Linea({ className }: { className?: string })`, ambos exports nombrados de `@/components/skeleton/Skeleton`.

**Sin tests automáticos.** Son marcado estático sin lógica; un test de "renderiza sin explotar" no atraparía lo único que puede fallar, que es que el skeleton no calce con el contenido real. Eso va en la verificación manual al final del plan.

- [ ] **Step 1: Crear las primitivas**

Crear `components/skeleton/Skeleton.tsx`:

```tsx
// Piezas grises que laten mientras el servidor arma la página. Van marcadas
// aria-hidden: quien usa lector de pantalla escucha el "Cargando" del contenedor,
// no una lista de rectángulos vacíos.

/** Un rectángulo. Para cards, iconos y bloques de contenido. */
export function Bloque({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-linea ${className}`} aria-hidden="true" />
}

/** Una línea de texto. Más baja y con las puntas redondeadas. */
export function Linea({ className = '' }: { className?: string }) {
  return <div className={`h-3 animate-pulse rounded-full bg-linea ${className}`} aria-hidden="true" />
}
```

- [ ] **Step 2: Skeleton genérico del grupo (app)**

Crear `app/(app)/loading.tsx`. El layout de `(app)` ya pinta el header sticky y renderiza `{children}`, así que este archivo reemplaza solo el cuerpo:

```tsx
import { Bloque, Linea } from '@/components/skeleton/Skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8" role="status" aria-label="Cargando">
      <Linea className="w-40" />
      <div className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <Linea className="w-1/3" />
        <Linea className="w-2/3" />
        <Linea className="w-1/2" />
      </div>
      <div className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <Linea className="w-1/4" />
        <Linea className="w-3/4" />
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Skeleton del dashboard**

Crear `app/(app)/dashboard/loading.tsx`. El `main` real de `VehiclesBoard` es `mx-auto max-w-4xl px-4 py-8`, la grilla con sidebar es `grid gap-6 sm:grid-cols-[210px_1fr]`, y cada `VehicleCard` es un `flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-4 shadow-sm` con un icono `size-11`. Esto lo replica para que nada salte:

```tsx
import { Bloque, Linea } from '@/components/skeleton/Skeleton'

function TarjetaFantasma() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
      <Bloque className="size-11 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Linea className="w-40" />
        <Linea className="w-24" />
      </div>
      <Bloque className="h-6 w-20 shrink-0 rounded-full" />
    </div>
  )
}

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8" role="status" aria-label="Cargando los vehículos">
      <div className="grid gap-6 sm:grid-cols-[210px_1fr]">
        <aside className="hidden space-y-4 sm:block">
          <Bloque className="h-40 w-full" />
          <Bloque className="h-24 w-full" />
        </aside>
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, i) => <TarjetaFantasma key={i} />)}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Skeleton de la ficha del vehículo**

Crear `app/(app)/vehiculos/[id]/loading.tsx`. La página real es `mx-auto max-w-2xl space-y-6 px-4 py-8`, con un `BackLink`, una card de encabezado `flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-5 shadow-sm` con icono `size-12`, y debajo la fila de 4 pestañas:

```tsx
import { Bloque, Linea } from '@/components/skeleton/Skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8" role="status" aria-label="Cargando el vehículo">
      <Linea className="w-24" />

      <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <Bloque className="size-12 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Linea className="h-4 w-3/5" />
          <Linea className="w-2/5" />
        </div>
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => <Bloque key={i} className="h-9 flex-1 rounded-lg" />)}
      </div>

      <Bloque className="h-48 w-full rounded-2xl" />
    </main>
  )
}
```

- [ ] **Step 5: Skeleton de la ficha pública**

Crear `app/v/[token]/loading.tsx`. Es la pantalla que abre un carabinero con datos móviles. La real es `mx-auto min-h-dvh max-w-xl space-y-6 px-4 py-10`, con el lockup centrado, una card de encabezado `p-6` con icono `size-14`, y los botones del menú:

```tsx
import { Bloque, Linea } from '@/components/skeleton/Skeleton'
import { TapCarLockup } from '@/components/brand/Logo'

export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-6 px-4 py-10" role="status" aria-label="Cargando el vehículo">
      {/* El logo se pinta de verdad: es lo único que ya sabemos, y ancla la pantalla. */}
      <div className="flex justify-center">
        <TapCarLockup iconClassName="size-6" wordClassName="text-lg" />
      </div>

      <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
        <Bloque className="size-14 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Linea className="h-4 w-3/5" />
          <Linea className="w-2/5" />
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => <Bloque key={i} className="h-20 w-full rounded-2xl" />)}
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Verificar que compila y que el prefetch se activó**

Run: `npx tsc --noEmit`
Expected: sin salida.

Run: `npm run build`
Expected: build exitoso. En la salida, las rutas `/dashboard`, `/vehiculos/[id]` y `/v/[token]` deben seguir apareciendo como dinámicas (`ƒ`), no romperse.

- [ ] **Step 7: Commit**

```bash
git add components/skeleton "app/(app)/loading.tsx" "app/(app)/dashboard/loading.tsx" "app/(app)/vehiculos/[id]/loading.tsx" "app/v/[token]/loading.tsx"
git commit -m "feat(ui): skeletons de carga en las rutas dinamicas"
```

---

### Task 2: Tipos y el resumen puro de documentos

**Files:**
- Modify: `lib/types.ts` (agregar dos interfaces y dos campos a `Vehicle`)
- Create: `lib/documents/resumen.ts`
- Test: `lib/documents/__tests__/resumen.test.ts`

**Interfaces:**
- Consumes: `VehicleDocument` de `@/lib/types`; `documentStatus`, `worstStatus` de `@/lib/documents/status` (solo en el test).
- Produces: `interface ResumenDocs { total: number; proximoVencimiento: string | null }`; `interface ResumenMantencion { ultima: { km: number | null; fecha: string } | null }`; ambos en `@/lib/types`, más los campos opcionales `Vehicle.resumenDocs?: ResumenDocs` y `Vehicle.resumenMantencion?: ResumenMantencion`. Y `resumirDocumentos(docs: Pick<VehicleDocument, 'fechaVencimiento'>[]): ResumenDocs` en `@/lib/documents/resumen`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/documents/__tests__/resumen.test.ts`. El primer bloque es el test **keystone**: toda la denormalización descansa en que el badge derivado de `proximoVencimiento` sea idéntico al que hoy sale de `worstStatus`.

```ts
import { describe, it, expect } from 'vitest'
import { resumirDocumentos } from '@/lib/documents/resumen'
import { documentStatus, worstStatus, type DocStatus } from '@/lib/documents/status'

const AHORA = new Date('2026-07-28T12:00:00-04:00')

function doc(fechaVencimiento: string | null) {
  return { fechaVencimiento }
}

// Cada caso es una lista de documentos de un vehículo.
const CASOS: { nombre: string; docs: { fechaVencimiento: string | null }[] }[] = [
  { nombre: 'sin documentos', docs: [] },
  { nombre: 'solo el padrón, que no vence', docs: [doc(null)] },
  { nombre: 'todos al día', docs: [doc('2027-01-15'), doc('2026-12-01')] },
  { nombre: 'uno por vencer entre varios al día', docs: [doc('2027-01-15'), doc('2026-08-10')] },
  { nombre: 'uno vencido arrastra el resto', docs: [doc('2027-01-15'), doc('2026-01-01')] },
  { nombre: 'padrón sin fecha junto a uno vencido', docs: [doc(null), doc('2026-01-01')] },
  { nombre: 'padrón sin fecha junto a uno al día', docs: [doc(null), doc('2027-01-15')] },
]

describe('equivalencia con worstStatus (el test que sostiene la denormalización)', () => {
  for (const caso of CASOS) {
    it(`coincide: ${caso.nombre}`, () => {
      const statuses: DocStatus[] = caso.docs.map((d) => documentStatus(d.fechaVencimiento, AHORA))
      const viaLista = worstStatus(statuses)
      const viaResumen = documentStatus(resumirDocumentos(caso.docs).proximoVencimiento, AHORA)
      expect(viaResumen).toBe(viaLista)
    })
  }
})

describe('resumirDocumentos', () => {
  it('cuenta todos los documentos, incluidos los que no vencen', () => {
    expect(resumirDocumentos([doc(null), doc('2027-01-15')]).total).toBe(2)
  })
  it('elige la fecha más próxima, sin importar el orden de la lista', () => {
    expect(resumirDocumentos([doc('2027-01-15'), doc('2026-08-10'), doc('2026-12-01')]).proximoVencimiento)
      .toBe('2026-08-10')
  })
  it('ignora los documentos sin fecha al elegir la más próxima', () => {
    expect(resumirDocumentos([doc(null), doc('2027-01-15')]).proximoVencimiento).toBe('2027-01-15')
  })
  it('sin documentos que venzan, la fecha es null', () => {
    expect(resumirDocumentos([doc(null), doc(null)])).toEqual({ total: 2, proximoVencimiento: null })
  })
  it('sin documentos, total 0 y fecha null', () => {
    expect(resumirDocumentos([])).toEqual({ total: 0, proximoVencimiento: null })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- documents/__tests__/resumen`
Expected: FAIL — `Failed to resolve import "@/lib/documents/resumen"`.

- [ ] **Step 3: Agregar los tipos**

En `lib/types.ts`, agregar estas dos interfaces **arriba** de `export interface Vehicle`:

```ts
/**
 * Resumen de los documentos del vehículo, denormalizado para el dashboard.
 *
 * `proximoVencimiento` es la fecha más próxima entre los documentos que vencen
 * (null si ninguno vence). Guardamos la FECHA y no el estado a propósito: un
 * documento pasa de "al día" a "por vencer" a la medianoche, sin que nadie
 * escriba nada. Con la fecha, el estado se calcula en cada render contra el
 * reloj de ese momento; con el estado guardado, el dashboard mostraría badges
 * verdes de documentos ya vencidos.
 */
export interface ResumenDocs {
  total: number
  proximoVencimiento: string | null
}

/**
 * Última mantención del vehículo, denormalizada.
 *
 * El envoltorio existe para distinguir dos cosas distintas: el campo AUSENTE
 * significa "nunca se calculó" (hay que consultar en vivo), mientras que
 * `{ ultima: null }` significa "calculado, este vehículo no tiene mantenciones".
 */
export interface ResumenMantencion {
  ultima: { km: number | null; fecha: string } | null
}
```

Y dentro de `export interface Vehicle`, después de `consumo?: ConsumoBencina | null`:

```ts
  // Resúmenes denormalizados que alimentan la tarjeta del dashboard. Ausentes
  // = nunca calculados; el dashboard cae a consultar en vivo ese vehículo.
  resumenDocs?: ResumenDocs
  resumenMantencion?: ResumenMantencion
```

- [ ] **Step 4: Escribir la implementación mínima**

Crear `lib/documents/resumen.ts`:

```ts
import type { ResumenDocs, VehicleDocument } from '@/lib/types'

/**
 * Resume los documentos de un vehículo en lo mínimo que necesita el dashboard.
 *
 * La fecha más próxima basta para reproducir el badge: `worstStatus` ordena
 * vencido > por vencer > al día > sin vencimiento, y `documentStatus` es monótono
 * en los días restantes, así que el documento que vence primero siempre manda.
 */
export function resumirDocumentos(docs: Pick<VehicleDocument, 'fechaVencimiento'>[]): ResumenDocs {
  let proximoVencimiento: string | null = null
  for (const d of docs) {
    // Las fechas son ISO 'YYYY-MM-DD': comparar como texto ordena igual que por calendario.
    if (d.fechaVencimiento && (proximoVencimiento === null || d.fechaVencimiento < proximoVencimiento)) {
      proximoVencimiento = d.fechaVencimiento
    }
  }
  return { total: docs.length, proximoVencimiento }
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- documents/__tests__/resumen`
Expected: PASS, 12 tests.

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/documents/resumen.ts lib/documents/__tests__/resumen.test.ts
git commit -m "feat(dashboard): resumen puro de documentos y tipos denormalizados"
```

---

### Task 3: El resolvedor con fallback

**Files:**
- Create: `lib/vehicles/resumen.ts`
- Test: `lib/vehicles/__tests__/resumen.test.ts`

**Interfaces:**
- Consumes: `Vehicle`, `VehicleDocument`, `ResumenDocs` de `@/lib/types`; `resumirDocumentos` de `@/lib/documents/resumen` (Task 2).
- Produces: en `@/lib/vehicles/resumen`:
  ```ts
  type CargasResumen = {
    cargarDocumentos: (vehicleId: string) => Promise<Pick<VehicleDocument, 'fechaVencimiento'>[]>
    cargarUltimaMantencion: (vehicleId: string) => Promise<{ km: number | null; fecha: string } | null>
  }
  type ResumenResuelto = { docs: ResumenDocs; ultimaMantencion: { km: number | null; fecha: string } | null }
  function resolverResumen(v: Pick<Vehicle, 'id' | 'resumenDocs' | 'resumenMantencion'>, cargas: CargasResumen): Promise<ResumenResuelto>
  ```

Las cargas van **inyectadas** para que esto sea testeable sin Firebase, al estilo de `lib/documents/runReminders.ts`. Sin eso, la red de seguridad quedaría enterrada en un server component y sin cobertura.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/vehicles/__tests__/resumen.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolverResumen } from '@/lib/vehicles/resumen'

const ULTIMA = { km: 30000, fecha: '2026-05-01' }

function cargas(docs = [{ fechaVencimiento: '2026-09-01' }], ultima = ULTIMA) {
  return {
    cargarDocumentos: vi.fn().mockResolvedValue(docs),
    cargarUltimaMantencion: vi.fn().mockResolvedValue(ultima),
  }
}

describe('resolverResumen', () => {
  it('con ambos resúmenes guardados no consulta nada', async () => {
    const c = cargas()
    const r = await resolverResumen(
      {
        id: 'v1',
        resumenDocs: { total: 3, proximoVencimiento: '2026-08-10' },
        resumenMantencion: { ultima: ULTIMA },
      },
      c,
    )
    expect(c.cargarDocumentos).not.toHaveBeenCalled()
    expect(c.cargarUltimaMantencion).not.toHaveBeenCalled()
    expect(r).toEqual({ docs: { total: 3, proximoVencimiento: '2026-08-10' }, ultimaMantencion: ULTIMA })
  })

  it('sin resumen de documentos los consulta y los resume', async () => {
    const c = cargas([{ fechaVencimiento: '2026-09-01' }, { fechaVencimiento: '2026-08-10' }])
    const r = await resolverResumen({ id: 'v1', resumenMantencion: { ultima: null } }, c)
    expect(c.cargarDocumentos).toHaveBeenCalledWith('v1')
    expect(r.docs).toEqual({ total: 2, proximoVencimiento: '2026-08-10' })
  })

  it('sin resumen de mantención la consulta', async () => {
    const c = cargas()
    const r = await resolverResumen({ id: 'v1', resumenDocs: { total: 0, proximoVencimiento: null } }, c)
    expect(c.cargarUltimaMantencion).toHaveBeenCalledWith('v1')
    expect(r.ultimaMantencion).toEqual(ULTIMA)
  })

  it('distingue "no hay mantenciones" de "no se ha calculado"', async () => {
    const c = cargas()
    const r = await resolverResumen(
      { id: 'v1', resumenDocs: { total: 0, proximoVencimiento: null }, resumenMantencion: { ultima: null } },
      c,
    )
    // El envoltorio con ultima: null significa "calculado, no hay": no debe consultar.
    expect(c.cargarUltimaMantencion).not.toHaveBeenCalled()
    expect(r.ultimaMantencion).toBeNull()
  })

  it('sin ningún resumen consulta las dos cosas', async () => {
    const c = cargas()
    await resolverResumen({ id: 'v1' }, c)
    expect(c.cargarDocumentos).toHaveBeenCalledWith('v1')
    expect(c.cargarUltimaMantencion).toHaveBeenCalledWith('v1')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- vehicles/__tests__/resumen`
Expected: FAIL — `Failed to resolve import "@/lib/vehicles/resumen"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/vehicles/resumen.ts`:

```ts
import { resumirDocumentos } from '@/lib/documents/resumen'
import type { ResumenDocs, Vehicle, VehicleDocument } from '@/lib/types'

type UltimaMantencion = { km: number | null; fecha: string } | null

export type CargasResumen = {
  cargarDocumentos: (vehicleId: string) => Promise<Pick<VehicleDocument, 'fechaVencimiento'>[]>
  cargarUltimaMantencion: (vehicleId: string) => Promise<UltimaMantencion>
}

export type ResumenResuelto = {
  docs: ResumenDocs
  ultimaMantencion: UltimaMantencion
}

/**
 * Devuelve el resumen del vehículo, usando lo guardado o consultando en vivo.
 *
 * Es la red de seguridad de la migración: un vehículo sin resumen (creado antes
 * del feature, saltado por el backfill, o con un refresco que falló) sigue dando
 * datos correctos, solo que pagando las consultas. Una flota a medio migrar nunca
 * muestra un dato malo; en el peor caso queda tan lenta como antes.
 *
 * Las cargas van inyectadas para poder probar esto sin Firebase.
 */
export async function resolverResumen(
  v: Pick<Vehicle, 'id' | 'resumenDocs' | 'resumenMantencion'>,
  cargas: CargasResumen,
): Promise<ResumenResuelto> {
  const [docs, ultimaMantencion] = await Promise.all([
    v.resumenDocs ?? cargas.cargarDocumentos(v.id).then(resumirDocumentos),
    // Ojo: `resumenMantencion` ausente = sin calcular; `{ ultima: null }` = no hay.
    v.resumenMantencion ? v.resumenMantencion.ultima : cargas.cargarUltimaMantencion(v.id),
  ])
  return { docs, ultimaMantencion }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- vehicles/__tests__/resumen`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/vehicles/resumen.ts lib/vehicles/__tests__/resumen.test.ts
git commit -m "feat(dashboard): resolvedor de resumen con fallback a consulta en vivo"
```

---

### Task 4: Refrescadores en la capa de datos

**Files:**
- Modify: `lib/data/documents.ts` (agregar `refreshResumenDocs`; `updateDocument` y `deleteDocument` devuelven el `vehicleId`)
- Modify: `lib/data/mantenciones.ts` (agregar `refreshResumenMantencion`; `deleteMantencion` devuelve el `vehicleId`)
- Modify: `lib/data/vehicles.ts` (`toVehicle` mapea los campos nuevos)
- Test: `lib/data/__tests__/resumen-refresh.test.ts`

**Interfaces:**
- Consumes: `resumirDocumentos` de `@/lib/documents/resumen` (Task 2); `listDocuments`, `ultimaMantencion` ya existentes.
- Produces: `refreshResumenDocs(vehicleId: string): Promise<void>` en `@/lib/data/documents`; `refreshResumenMantencion(vehicleId: string): Promise<void>` en `@/lib/data/mantenciones`; `updateDocument(...)` y `deleteDocument(...)` pasan de `Promise<void>` a `Promise<string>` (el `vehicleId`); `deleteMantencion(...)` idem.

Los dos refrescadores siguen el patrón exacto de `refreshVehicleKm` (`lib/data/usages.ts:196`): try/catch con `console.error`, sin propagar.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/data/__tests__/resumen-refresh.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const update = vi.fn().mockResolvedValue(undefined)
  const doc = vi.fn(() => ({ update }))
  const get = vi.fn()
  const where = vi.fn(() => ({ get }))
  const collection = vi.fn(() => ({ doc, where, get }))
  return { update, doc, get, where, collection }
})

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mocks.collection },
  adminBucket: { file: vi.fn(() => ({ delete: vi.fn() })) },
}))

const { refreshResumenDocs } = await import('@/lib/data/documents')
const { refreshResumenMantencion } = await import('@/lib/data/mantenciones')

function snapshot(docs: Record<string, unknown>[]) {
  return { docs: docs.map((d, i) => ({ id: `d${i}`, data: () => d })) }
}

beforeEach(() => {
  mocks.update.mockClear().mockResolvedValue(undefined)
  mocks.doc.mockClear()
  mocks.get.mockReset()
  mocks.collection.mockClear()
})

describe('refreshResumenDocs', () => {
  it('escribe el total y la fecha más próxima', async () => {
    mocks.get.mockResolvedValue(snapshot([
      { vehicleId: 'v1', fechaVencimiento: '2027-01-15' },
      { vehicleId: 'v1', fechaVencimiento: '2026-08-10' },
      { vehicleId: 'v1', fechaVencimiento: null },
    ]))
    await refreshResumenDocs('v1')
    expect(mocks.doc).toHaveBeenCalledWith('v1')
    expect(mocks.update).toHaveBeenCalledWith({
      resumenDocs: { total: 3, proximoVencimiento: '2026-08-10' },
    })
  })

  it('un vehículo sin documentos queda en total 0', async () => {
    mocks.get.mockResolvedValue(snapshot([]))
    await refreshResumenDocs('v1')
    expect(mocks.update).toHaveBeenCalledWith({
      resumenDocs: { total: 0, proximoVencimiento: null },
    })
  })

  it('si Firestore falla no propaga: la escritura ya guardada no se pierde', async () => {
    mocks.get.mockRejectedValue(new Error('firestore caido'))
    await expect(refreshResumenDocs('v1')).resolves.toBeUndefined()
  })
})

describe('refreshResumenMantencion', () => {
  it('guarda la última mantención envuelta', async () => {
    mocks.get.mockResolvedValue(snapshot([
      { vehicleId: 'v1', fecha: '2026-05-01', km: 30000, companyId: 'c1', createdAt: '2026-05-01' },
    ]))
    await refreshResumenMantencion('v1')
    expect(mocks.update).toHaveBeenCalledWith({
      resumenMantencion: { ultima: { km: 30000, fecha: '2026-05-01' } },
    })
  })

  it('sin mantenciones guarda ultima: null, que NO es lo mismo que no haber calculado', async () => {
    mocks.get.mockResolvedValue(snapshot([]))
    await refreshResumenMantencion('v1')
    expect(mocks.update).toHaveBeenCalledWith({ resumenMantencion: { ultima: null } })
  })

  it('si Firestore falla no propaga', async () => {
    mocks.get.mockRejectedValue(new Error('firestore caido'))
    await expect(refreshResumenMantencion('v1')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- resumen-refresh`
Expected: FAIL — `refreshResumenDocs is not a function` (o error de import).

- [ ] **Step 3: Agregar `refreshResumenDocs` y devolver el vehicleId**

En `lib/data/documents.ts`, agregar el import arriba:

```ts
import { resumirDocumentos } from '@/lib/documents/resumen'
```

Reemplazar `updateDocument` y `deleteDocument` por estas versiones, que devuelven el `vehicleId` (el endpoint solo recibe el id del documento y necesita saber qué vehículo refrescar):

```ts
/** Devuelve el vehicleId para que el llamador refresque su resumen. */
export async function updateDocument(
  documentId: string,
  companyId: string,
  patch: Partial<DocInput> & { remindersSent?: string[] },
): Promise<string> {
  const d = await assertCompany(documentId, companyId)
  await adminDb.collection(COL).doc(documentId).update(patch)
  return d.vehicleId
}

/** Devuelve el vehicleId para que el llamador refresque su resumen. */
export async function deleteDocument(documentId: string, companyId: string): Promise<string> {
  const d = await assertCompany(documentId, companyId)
  if (d.filePath) {
    await adminBucket.file(d.filePath).delete({ ignoreNotFound: true })
  }
  await adminDb.collection(COL).doc(documentId).delete()
  return d.vehicleId
}
```

Y agregar al final del archivo:

```ts
/**
 * Recalcula el resumen de documentos del vehículo.
 *
 * Best-effort, igual que refreshVehicleKm: si esto falla, el documento que el
 * usuario acaba de subir ya está guardado y no queremos tumbarlo. El costo es un
 * badge desactualizado en la tarjeta del dashboard hasta la próxima escritura —
 * la ficha del vehículo y la ficha pública leen los documentos en vivo.
 */
export async function refreshResumenDocs(vehicleId: string): Promise<void> {
  try {
    const docs = await listDocuments(vehicleId)
    await adminDb.collection('vehicles').doc(vehicleId).update({
      resumenDocs: resumirDocumentos(docs),
    })
  } catch (err) {
    console.error('[refreshResumenDocs]', vehicleId, err)
  }
}
```

- [ ] **Step 4: Agregar `refreshResumenMantencion` y devolver el vehicleId**

En `lib/data/mantenciones.ts`, reemplazar `deleteMantencion` por:

```ts
/** Devuelve el vehicleId para que el llamador refresque su resumen. */
export async function deleteMantencion(id: string, companyId: string): Promise<string> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  const vehicleId = doc.data()!.vehicleId as string
  const filePath = doc.data()?.filePath
  if (filePath) await adminBucket.file(filePath).delete({ ignoreNotFound: true })
  await ref.delete()
  return vehicleId
}
```

Y agregar al final del archivo:

```ts
/**
 * Recalcula la última mantención denormalizada del vehículo.
 *
 * Best-effort, igual que refreshVehicleKm. El envoltorio `{ ultima }` es
 * deliberado: `{ ultima: null }` dice "calculado, no hay mantenciones", mientras
 * que el campo ausente dice "nunca se calculó" y dispara la consulta en vivo.
 */
export async function refreshResumenMantencion(vehicleId: string): Promise<void> {
  try {
    const ultima = await ultimaMantencion(vehicleId)
    await adminDb.collection('vehicles').doc(vehicleId).update({
      resumenMantencion: { ultima: ultima ?? null },
    })
  } catch (err) {
    console.error('[refreshResumenMantencion]', vehicleId, err)
  }
}
```

- [ ] **Step 5: Mapear los campos en `toVehicle`**

En `lib/data/vehicles.ts`, dentro de `toVehicle`, agregar después de `consumo: data.consumo ?? null,`:

```ts
    // OJO: `?? undefined`, NO `?? null`. La ausencia del campo es información:
    // significa "nunca calculado" y dispara el fallback a consulta en vivo.
    resumenDocs: data.resumenDocs ?? undefined,
    resumenMantencion: data.resumenMantencion ?? undefined,
```

- [ ] **Step 6: Correr los tests**

Run: `npm test -- resumen-refresh`
Expected: PASS, 6 tests.

Run: `npm test`
Expected: toda la suite verde salvo `rules.test.ts`, que necesita el emulador de Firestore con Java (fallo de entorno preexistente). Si algún test existente de `documents` o `mantenciones` falla por el cambio de `Promise<void>` a `Promise<string>`, ajústalo.

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add lib/data/documents.ts lib/data/mantenciones.ts lib/data/vehicles.ts lib/data/__tests__/resumen-refresh.test.ts
git commit -m "feat(dashboard): refrescadores del resumen denormalizado"
```

---

### Task 5: Cablear los cinco endpoints

**Files:**
- Modify: `app/api/documents/route.ts` (tras `createDocument`)
- Modify: `app/api/documents/[id]/route.ts` (tras `updateDocument` y tras `deleteDocument`)
- Modify: `app/api/mantenciones/route.ts` (tras `createMantencion`)
- Modify: `app/api/mantenciones/[id]/route.ts` (tras `deleteMantencion`)
- Test: `app/api/__tests__/resumen-endpoints.test.ts`

**Interfaces:**
- Consumes: `refreshResumenDocs` de `@/lib/data/documents` y `refreshResumenMantencion` de `@/lib/data/mantenciones` (Task 4); `updateDocument`/`deleteDocument`/`deleteMantencion` ahora devuelven el `vehicleId`.
- Produces: nada para tareas posteriores.

El refresco va **después** de la escritura y **antes** de la respuesta. Como es best-effort por dentro (no lanza), no hace falta envolverlo en try/catch en el endpoint.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/__tests__/resumen-endpoints.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  can: vi.fn(() => true),
  getVehicle: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  refreshResumenDocs: vi.fn(),
  createMantencion: vi.fn(),
  listMantenciones: vi.fn(),
  deleteMantencion: vi.fn(),
  refreshResumenMantencion: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/auth/roles', () => ({ can: mocks.can }))
vi.mock('@/lib/data/vehicles', () => ({ getVehicle: mocks.getVehicle }))
vi.mock('@/lib/data/documents', () => ({
  createDocument: mocks.createDocument,
  updateDocument: mocks.updateDocument,
  deleteDocument: mocks.deleteDocument,
  refreshResumenDocs: mocks.refreshResumenDocs,
}))
vi.mock('@/lib/data/mantenciones', () => ({
  createMantencion: mocks.createMantencion,
  listMantenciones: mocks.listMantenciones,
  deleteMantencion: mocks.deleteMantencion,
  refreshResumenMantencion: mocks.refreshResumenMantencion,
}))

const docs = await import('@/app/api/documents/route')
const docsId = await import('@/app/api/documents/[id]/route')
const mants = await import('@/app/api/mantenciones/route')
const mantsId = await import('@/app/api/mantenciones/[id]/route')

function req(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest
}
const sinBody = () => ({}) as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.can.mockReturnValue(true)
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  mocks.getVehicle.mockResolvedValue({ id: 'v1', companyId: 'c1' })
  mocks.createDocument.mockResolvedValue({ id: 'd1', vehicleId: 'v1' })
  mocks.updateDocument.mockResolvedValue('v1')
  mocks.deleteDocument.mockResolvedValue('v1')
  mocks.createMantencion.mockResolvedValue({ id: 'm1' })
  mocks.deleteMantencion.mockResolvedValue('v1')
})

describe('refresco del resumen de documentos', () => {
  it('al crear un documento', async () => {
    await docs.POST(req({ vehicleId: 'v1', tipo: 'permiso_circulacion', fechaVencimiento: '2026-09-01' }))
    expect(mocks.refreshResumenDocs).toHaveBeenCalledWith('v1')
  })

  it('al editar un documento, porque puede cambiar la fecha de vencimiento', async () => {
    await docsId.PATCH(req({ fechaVencimiento: '2027-01-01' }), { params: Promise.resolve({ id: 'd1' }) })
    expect(mocks.refreshResumenDocs).toHaveBeenCalledWith('v1')
  })

  it('al borrar un documento', async () => {
    await docsId.DELETE(sinBody(), { params: Promise.resolve({ id: 'd1' }) })
    expect(mocks.refreshResumenDocs).toHaveBeenCalledWith('v1')
  })

  it('no refresca si la escritura fue rechazada por permisos', async () => {
    mocks.can.mockReturnValue(false)
    await docsId.DELETE(sinBody(), { params: Promise.resolve({ id: 'd1' }) })
    expect(mocks.refreshResumenDocs).not.toHaveBeenCalled()
  })
})

describe('refresco del resumen de mantención', () => {
  it('al registrar una mantención', async () => {
    await mants.POST(req({ vehicleId: 'v1', fecha: '2026-07-01', km: 30000 }))
    expect(mocks.refreshResumenMantencion).toHaveBeenCalledWith('v1')
  })

  it('al borrar una mantención', async () => {
    await mantsId.DELETE(sinBody(), { params: Promise.resolve({ id: 'm1' }) })
    expect(mocks.refreshResumenMantencion).toHaveBeenCalledWith('v1')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- resumen-endpoints`
Expected: FAIL — `refreshResumenDocs` no fue llamado.

- [ ] **Step 3: Cablear los endpoints de documentos**

En `app/api/documents/route.ts`, cambiar el import de `@/lib/data/documents` a:

```ts
import { createDocument, refreshResumenDocs } from '@/lib/data/documents'
```

y reemplazar la línea `return NextResponse.json(doc, { status: 201 })` por:

```ts
  await refreshResumenDocs(doc.vehicleId)
  return NextResponse.json(doc, { status: 201 })
```

En `app/api/documents/[id]/route.ts`, cambiar el import a:

```ts
import { updateDocument, deleteDocument, refreshResumenDocs } from '@/lib/data/documents'
```

En el `PATCH`, cambiar `await updateDocument(id, m.companyId, patch)` por:

```ts
    const vehicleId = await updateDocument(id, m.companyId, patch)
    await refreshResumenDocs(vehicleId)
```

En el `DELETE`, cambiar `await deleteDocument(id, m.companyId)` por:

```ts
    const vehicleId = await deleteDocument(id, m.companyId)
    await refreshResumenDocs(vehicleId)
```

En ambos casos las líneas van **dentro** del `try` existente: si la escritura fue rechazada, el `catch` responde 403 y no se refresca nada.

- [ ] **Step 4: Cablear los endpoints de mantenciones**

En `app/api/mantenciones/route.ts`, cambiar el import a:

```ts
import { createMantencion, listMantenciones, refreshResumenMantencion } from '@/lib/data/mantenciones'
```

y reemplazar `return NextResponse.json({ ok: true, id: mant.id })` por:

```ts
  await refreshResumenMantencion(vehicleId)
  return NextResponse.json({ ok: true, id: mant.id })
```

En `app/api/mantenciones/[id]/route.ts`, cambiar el import a:

```ts
import { deleteMantencion, refreshResumenMantencion } from '@/lib/data/mantenciones'
```

y dentro del `try`, cambiar `await deleteMantencion(id, m.companyId)` por:

```ts
    const vehicleId = await deleteMantencion(id, m.companyId)
    await refreshResumenMantencion(vehicleId)
```

- [ ] **Step 5: Correr los tests**

Run: `npm test -- resumen-endpoints`
Expected: PASS, 6 tests.

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add "app/api/documents/route.ts" "app/api/documents/[id]/route.ts" "app/api/mantenciones/route.ts" "app/api/mantenciones/[id]/route.ts" "app/api/__tests__/resumen-endpoints.test.ts"
git commit -m "feat(dashboard): refrescar el resumen en los cinco puntos de escritura"
```

---

### Task 6: El dashboard usa el resumen

**Files:**
- Modify: `app/(app)/dashboard/page.tsx:40-66` (el `Promise.all` sobre `vehicles`)

**Interfaces:**
- Consumes: `resolverResumen` de `@/lib/vehicles/resumen` (Task 3); `listDocuments` de `@/lib/data/documents` y `ultimaMantencion` de `@/lib/data/mantenciones`, ahora solo como fallback.
- Produces: nada para tareas posteriores.

Los campos que `VehiclesBoard` recibe (`status`, `docCount`, `mantencion`, `mantencionDetalle`, …) **no cambian**: cambia solo de dónde salen los insumos. No toques `VehiclesBoard` ni `VehicleCard`.

- [ ] **Step 1: Reemplazar el bloque de consultas por vehículo**

En `app/(app)/dashboard/page.tsx`, agregar el import:

```ts
import { resolverResumen } from '@/lib/vehicles/resumen'
```

Reemplazar el bloque que hoy empieza en `const items = await Promise.all(` y termina antes de `return (`, por:

```ts
  // Las cargas del fallback: solo se ejecutan para los vehículos que todavía no
  // tienen resumen guardado (creados antes del feature o saltados por el backfill).
  const cargas = {
    cargarDocumentos: listDocuments,
    cargarUltimaMantencion: ultimaMantencion,
  }

  const items = await Promise.all(
    vehicles.map(async (v) => {
      const { docs, ultimaMantencion: ultima } = await resolverResumen(v, cargas)
      const uso = v.usoActual ?? null
      const pauta = v.pautaMantencion ?? company?.pautaMantencion ?? null
      const em = estadoMantencion({ pauta, ultima, kmActual: v.kmActual ?? null, now })
      const mantPartes: string[] = []
      if (em.detalle.kmRestantes != null) mantPartes.push(em.detalle.kmRestantes <= 0 ? `pasada ${Math.abs(em.detalle.kmRestantes).toLocaleString('es-CL')} km` : `faltan ${em.detalle.kmRestantes.toLocaleString('es-CL')} km`)
      if (em.detalle.diasRestantes != null) mantPartes.push(em.detalle.diasRestantes < 0 ? `hace ${Math.abs(em.detalle.diasRestantes)} días` : `faltan ${em.detalle.diasRestantes} días`)
      return {
        vehicle: v,
        status: documentStatus(docs.proximoVencimiento, now),
        docCount: docs.total,
        prolongado: uso ? usoProlongado(uso.tomadoEn, avisoUsoHoras, now) : false,
        horasUso: uso ? Math.floor(horasEnUso(uso.tomadoEn, now)) : 0,
        danoUsageId: danoPorVehiculo.get(v.id) ?? null,
        categoriaId: v.categoriaId ?? null,
        categoriaNombre: v.categoriaId ? (nombrePorCategoria.get(v.categoriaId) ?? null) : null,
        danoActivo: v.danoActivo != null,
        mantencion: em.estado,
        mantencionDetalle: mantPartes.join(' · '),
        transferenciaPendiente: conTransferencia.has(v.id),
      }
    }),
  )
```

- [ ] **Step 2: Limpiar los imports que quedaron sin uso**

El import de `worstStatus` y el tipo `DocStatus` ya no se usan en esta página (el badge sale de `documentStatus` sobre una sola fecha). Cambiar la línea de import de `@/lib/documents/status` a:

```ts
import { documentStatus } from '@/lib/documents/status'
```

Mantener los imports de `listDocuments` y `ultimaMantencion`: ahora alimentan el fallback.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sin salida.

Run: `npx eslint app components lib`
Expected: 0 errores. Si aparece un error de import sin usar, quítalo.

Run: `npm test`
Expected: la suite verde salvo `rules.test.ts` (necesita emulador).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): leer el resumen denormalizado en vez de consultar por vehiculo"
```

---

### Task 7: Script de backfill

**Files:**
- Create: `scripts/backfill-resumen.mjs`

**Interfaces:**
- Consumes: nada del código de la app (los scripts de operación usan el Admin SDK directo, como `scripts/backfill-km.mjs`).
- Produces: nada para tareas posteriores.

Sigue la estructura de `scripts/backfill-km.mjs`: mismas credenciales, mismo dry-run por defecto,
mismo formato de reporte. El script es `.mjs` sin el alias `@`, así que repite la lógica de
`resumirDocumentos` en vez de importarla.

- [ ] **Step 1: Escribir el script**

Crear `scripts/backfill-resumen.mjs`:

```js
// Backfill one-time de los resúmenes denormalizados del vehículo
// (`resumenDocs` / `resumenMantencion`), que alimentan la tarjeta del dashboard
// sin consultar documentos ni mantenciones por vehículo.
//
// Guarda FECHAS, nunca el estado calculado: el estado cambia solo al pasar la
// medianoche y quedaría viejo apenas se escribe.
//
// SEGURO POR DEFECTO: dry-run (solo lista). Para escribir hay que pasar --apply.
// Idempotente: recalcula desde los datos, se puede correr varias veces.
//
// Uso:
//   node --env-file=.env.local scripts/backfill-resumen.mjs           # dry-run
//   node --env-file=.env.local scripts/backfill-resumen.mjs --apply   # escribe
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
if (!projectId || !clientEmail || !privateKey) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
const db = getFirestore()

// Mismo criterio que lib/documents/resumen.ts: las fechas son ISO 'YYYY-MM-DD',
// así que compararlas como texto ordena igual que por calendario.
function resumirDocumentos(docs) {
  let proximoVencimiento = null
  for (const doc of docs) {
    const f = doc.data().fechaVencimiento ?? null
    if (f && (proximoVencimiento === null || f < proximoVencimiento)) proximoVencimiento = f
  }
  return { total: docs.length, proximoVencimiento }
}

// La mantención más reciente por fecha, igual que ultimaMantencion().
function ultimaMantencion(docs) {
  let mejor = null
  for (const doc of docs) {
    const d = doc.data()
    if (!d.fecha) continue
    if (!mejor || d.fecha > mejor.fecha) mejor = { km: d.km ?? null, fecha: d.fecha }
  }
  return mejor
}

const vehiculos = await db.collection('vehicles').get()
let escritos = 0

for (const v of vehiculos.docs) {
  const [docs, mants] = await Promise.all([
    db.collection('documents').where('vehicleId', '==', v.id).get(),
    db.collection('mantenciones').where('vehicleId', '==', v.id).get(),
  ])
  const resumenDocs = resumirDocumentos(docs.docs)
  const resumenMantencion = { ultima: ultimaMantencion(mants.docs) }
  const patente = v.data().patente ?? v.id

  console.log(
    `  ${patente}: ${resumenDocs.total} doc(s), vence ${resumenDocs.proximoVencimiento ?? '—'}` +
      ` · mantención ${resumenMantencion.ultima ? resumenMantencion.ultima.fecha : '—'}`,
  )
  escritos++
  if (APPLY) {
    await v.ref.update({ resumenDocs, resumenMantencion })
  }
}

console.log(`\nVehículos: ${vehiculos.size} · resúmenes a escribir: ${escritos}`)
console.log(APPLY ? '\nBackfill aplicado. ✅' : '\n[DRY-RUN] No se escribió nada. Corre con --apply para aplicar.')
process.exit(0)
```

- [ ] **Step 2: Correr el dry-run contra producción**

Run: `node --env-file=.env.local scripts/backfill-resumen.mjs`
Expected: lista los vehículos con lo que escribiría y termina con el resumen. **No** debe escribir nada — verificar que el mensaje final diga que fue dry-run.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-resumen.mjs
git commit -m "chore: script de backfill del resumen denormalizado"
```

---

## Verificación final

Correr, en este orden:

```bash
npx tsc --noEmit
```
Expected: sin salida.

```bash
npm test
```
Expected: toda la suite verde salvo `rules.test.ts` (necesita el emulador de Firestore con Java; fallo de entorno preexistente).

```bash
npx eslint app components lib
```
Expected: 0 errores. Los warnings de `react-hooks/set-state-in-effect` y `no-img-element` son preexistentes y están bajados a `warn` a propósito.

```bash
npm run build
```
Expected: build exitoso.

## Verificación manual

Los skeletons no tienen tests: lo único que puede fallar en ellos es que no calcen con el contenido real, y eso se ve mirando.

- [ ] Navegar Dashboard → ficha de un vehículo → Reportes → Configuración. En **cada** clic debe aparecer algo de inmediato.
- [ ] Al llegar el contenido real, **nada debe saltar de lugar** respecto del skeleton. Mirar especialmente la altura de las tarjetas del dashboard y la del encabezado de la ficha.
- [ ] Abrir `/v/<token>` desde el celular con datos móviles (no wifi): el logo y la silueta deben aparecer antes que los datos.
- [ ] **Antes** de correr el backfill con `--apply`: subir un documento a un vehículo cualquiera. Ese vehículo queda con resumen; los demás no. Confirmar que **todas** las tarjetas del dashboard muestran el mismo badge y el mismo conteo que antes del cambio — esa es la prueba de que el fallback funciona.
- [ ] Correr el backfill con `--apply` y confirmar que el dashboard sigue mostrando exactamente lo mismo.
- [ ] Subir un documento vencido a un vehículo y confirmar que su tarjeta pasa a rojo sin recargar nada más.
- [ ] Borrar ese documento y confirmar que la tarjeta vuelve a su estado anterior.
