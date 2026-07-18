# Mantención en el dashboard (reemplaza /mantenciones) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar el estado de mantención de cada vehículo como una pill en el dashboard (con filtro y orden), y eliminar la página `/mantenciones`.

**Architecture:** El dashboard (server) ya computa por vehículo su estado; se le suma el estado de mantención (misma `estadoMantencion` pura de hoy). La `VehicleCard` muestra una pill cuando la mantención está próxima/vencida (detalle en `title`), y su enlace lleva al panel de Mantención vía el hash `#mantencion`. `VehiclesBoard` gana un filtro y un orden de mantención. Se borra la ruta `/mantenciones` y su enlace del menú.

**Tech Stack:** Next.js 16 (App Router, server + client components), React, Tailwind v4.

## Global Constraints

- Español neutro (Chile), "tú". Sin emojis. Colores/hex ya usados: vencida rojo `bg-[#FCE7E7] text-[#C81E1E]`, próxima ámbar `bg-[#FDF1DC] text-[#B45309]`.
- **La lógica de mantención NO cambia:** `lib/mantencion/*`, `lib/data/mantenciones.ts`, el `MantencionPanel` de la ficha y el cron de recordatorios quedan idénticos. No hay endpoints nuevos, ni migración, ni cambios de datos.
- La pill aparece **solo** para `mantencion` `'proxima'`/`'vencida'` (los demás estados, sin pill). El detalle va en el `title` (tooltip nativo).
- La sección de filtro "Mantención" aparece **solo si hay ≥1 vehículo próximo o vencido** (patrón del filtro de categoría). Filtro combinable [AND] con Estado y Categoría.
- El hash `#mantencion` (ya existente) se mantiene.

---

### Task 1: Datos de mantención + pill en la card

**Files:**
- Modify: `app/(app)/dashboard/page.tsx` (computar mantención por vehículo)
- Modify: `components/VehiclesBoard.tsx` (tipo `Item` + reenviar props a `VehicleCard`)
- Modify: `components/VehicleCard.tsx` (props + pill + href)

**Interfaces:**
- Consumes: `ultimaMantencion` de `@/lib/data/mantenciones`; `estadoMantencion`, `type EstadoMantencion` de `@/lib/mantencion/status`.
- Produces: `Item`/`VehicleCard` con `mantencion: EstadoMantencion` + `mantencionDetalle: string`.

- [ ] **Step 1: Computar mantención por vehículo en el dashboard**

En `app/(app)/dashboard/page.tsx`, agregar los imports (junto a los otros):

```tsx
import { ultimaMantencion } from '@/lib/data/mantenciones'
import { estadoMantencion } from '@/lib/mantencion/status'
```

Dentro del `vehicles.map(async (v) => { ... })`, después de la línea `const uso = v.usoActual ?? null`, agregar el cómputo de mantención:

```tsx
      const pauta = v.pautaMantencion ?? company?.pautaMantencion ?? null
      const ultima = await ultimaMantencion(v.id)
      const em = estadoMantencion({ pauta, ultima, kmActual: v.kmActual ?? null, now })
      const mantPartes: string[] = []
      if (em.detalle.kmRestantes != null) mantPartes.push(em.detalle.kmRestantes <= 0 ? `pasada ${Math.abs(em.detalle.kmRestantes).toLocaleString('es-CL')} km` : `faltan ${em.detalle.kmRestantes.toLocaleString('es-CL')} km`)
      if (em.detalle.diasRestantes != null) mantPartes.push(em.detalle.diasRestantes < 0 ? `hace ${Math.abs(em.detalle.diasRestantes)} días` : `faltan ${em.detalle.diasRestantes} días`)
```

Y en el objeto retornado por el `map`, agregar (junto a `danoActivo`):

```tsx
        mantencion: em.estado,
        mantencionDetalle: mantPartes.join(' · '),
```

- [ ] **Step 2: Extender el tipo `Item` y reenviar los props en `VehiclesBoard`**

En `components/VehiclesBoard.tsx`, agregar el import de tipo (junto a los otros imports de tipo):

```tsx
import type { EstadoMantencion } from '@/lib/mantencion/status'
```

Agregar los dos campos al type `Item`:

```tsx
  mantencion: EstadoMantencion
  mantencionDetalle: string
```

Y en el render de las cards, destructurar y pasar los props nuevos. Reemplazar el bloque:

```tsx
                  {paginados.map(({ vehicle, status, docCount, prolongado, horasUso, danoUsageId, categoriaNombre, danoActivo }) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} docCount={docCount} prolongado={prolongado} horasUso={horasUso} danoUsageId={danoUsageId} categoriaNombre={categoriaNombre} danoActivo={danoActivo} />
                  ))}
```

por:

```tsx
                  {paginados.map(({ vehicle, status, docCount, prolongado, horasUso, danoUsageId, categoriaNombre, danoActivo, mantencion, mantencionDetalle }) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} docCount={docCount} prolongado={prolongado} horasUso={horasUso} danoUsageId={danoUsageId} categoriaNombre={categoriaNombre} danoActivo={danoActivo} mantencion={mantencion} mantencionDetalle={mantencionDetalle} />
                  ))}
```

- [ ] **Step 3: Pill + href en `VehicleCard`**

En `components/VehicleCard.tsx`, agregar el import de tipo:

```tsx
import type { EstadoMantencion } from '@/lib/mantencion/status'
```

Agregar los props a la firma (con default, para no romper otros usos):

```tsx
export default function VehicleCard({
  vehicle, status, docCount = 0, prolongado = false, horasUso = 0, danoUsageId = null, categoriaNombre = null, danoActivo = false, mantencion = 'sin_pauta', mantencionDetalle = '',
}: {
  vehicle: Vehicle
  status: DocStatus
  docCount?: number
  prolongado?: boolean
  horasUso?: number
  danoUsageId?: string | null
  categoriaNombre?: string | null
  danoActivo?: boolean
  mantencion?: EstadoMantencion
  mantencionDetalle?: string
}) {
```

Reemplazar la línea del `href`:

```tsx
  const href = danoUsageId ? `/vehiculos/${vehicle.id}#uso-${danoUsageId}` : `/vehiculos/${vehicle.id}`
```

por (prioridad daño → mantención pendiente → ficha):

```tsx
  const href = danoUsageId
    ? `/vehiculos/${vehicle.id}#uso-${danoUsageId}`
    : mantencion === 'vencida' || mantencion === 'proxima'
      ? `/vehiculos/${vehicle.id}#mantencion`
      : `/vehiculos/${vehicle.id}`
```

Y en el grupo de pills (el `<div className="flex flex-wrap items-center gap-1.5 ...">`), agregar las pills de mantención justo **antes** de `<StatusBadge ... />`:

```tsx
          {mantencion === 'vencida' && (
            <span title={mantencionDetalle} className="whitespace-nowrap rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Mantención vencida</span>
          )}
          {mantencion === 'proxima' && (
            <span title={mantencionDetalle} className="whitespace-nowrap rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">Mantención próxima</span>
          )}
```

- [ ] **Step 4: Typecheck, lint y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint app components lib`
Expected: sin errores (3 warnings preexistentes de `set-state-in-effect` ajenos permitidos).

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" components/VehiclesBoard.tsx components/VehicleCard.tsx
git commit -m "feat(mantencion): pill de mantención en la card del dashboard"
```

---

### Task 2: Filtro y orden de mantención en `VehiclesBoard`

**Files:**
- Modify: `components/VehiclesBoard.tsx`

**Interfaces:**
- Consumes: `EstadoMantencion` (ya importado en Task 1) y los campos `mantencion` del `Item` (Task 1).
- Produces: nada nuevo.

- [ ] **Step 1: Constante de orden + opción de orden**

En `components/VehiclesBoard.tsx`, después de la constante `PRIORITY`, agregar el orden de urgencia de mantención:

```tsx
const ORDEN_MANT: Record<EstadoMantencion, number> = { vencida: 0, proxima: 1, al_dia: 2, sin_registro: 3, sin_pauta: 4 }
```

En el array `SORTS`, agregar la opción de orden por mantención (al final, antes del `] as const`):

```tsx
  { key: 'mantencion', label: 'Mantención' },
```

- [ ] **Step 2: Estado del filtro + conteos**

Junto a los otros `useState` (después de `const [q, setQ] = useState('')` y antes de `const [page, setPage] = useState(1)`), agregar:

```tsx
  const [mant, setMant] = useState<'todas' | 'proxima' | 'vencida'>('todas')
```

Junto a los otros handlers que resetean la página (después de `cambiarCategoria`), agregar:

```tsx
  const cambiarMant = (v: 'todas' | 'proxima' | 'vencida') => { setMant(v); setPage(1) }
```

Después del `useMemo` de `counts`, agregar los conteos de mantención:

```tsx
  const mantCounts = useMemo(() => {
    let proxima = 0, vencida = 0
    for (const it of items) { if (it.mantencion === 'proxima') proxima++; else if (it.mantencion === 'vencida') vencida++ }
    return { proxima, vencida }
  }, [items])
  const hayMant = mantCounts.proxima + mantCounts.vencida > 0
```

- [ ] **Step 3: Aplicar el filtro y el orden en `visible`**

En el `useMemo` de `visible`, insertar el filtro de mantención entre `porCategoria` y `porBusqueda`, y agregar el `case` de orden. Reemplazar el cuerpo del `useMemo` por:

```tsx
  const visible = useMemo(() => {
    const query = normalizarBusqueda(q)
    const list = filter === 'todos' ? items : items.filter((i) => i.status === filter)
    const porCategoria = list.filter((i) => categoria === 'todas' || i.categoriaId === categoria)
    const porMant = porCategoria.filter((i) => mant === 'todas' || i.mantencion === mant)
    const porBusqueda = porMant.filter((i) => coincideBusqueda(i.vehicle, query))
    return [...porBusqueda].sort((a, b) => {
      switch (sort) {
        case 'urgencia':
          return PRIORITY[a.status] - PRIORITY[b.status] || nombre(a).localeCompare(nombre(b), 'es')
        case 'marca':
          return nombre(a).localeCompare(nombre(b), 'es')
        case 'patente':
          return a.vehicle.patente.localeCompare(b.vehicle.patente, 'es')
        case 'documentos':
          return b.docCount - a.docCount
        case 'mantencion':
          return ORDEN_MANT[a.mantencion] - ORDEN_MANT[b.mantencion] || nombre(a).localeCompare(nombre(b), 'es')
        default:
          return 0
      }
    })
  }, [items, filter, sort, categoria, q, mant])
```

- [ ] **Step 4: Renderer del filtro (botón) + select mobile**

Después de la función `filterChip` (o junto a los renderers de filtro), agregar el renderer del filtro de mantención (botón estilo sidebar):

```tsx
  const mantOption = (key: 'todas' | 'proxima' | 'vencida', label: string, count: number | null) => {
    const active = mant === key
    return (
      <button
        key={key}
        onClick={() => cambiarMant(key)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
          active ? 'bg-azul/10 font-semibold text-azul' : 'text-tinta hover:bg-lienzo'
        }`}
      >
        <span>{label}</span>
        {count != null && <span className="tabular-nums text-xs text-acero">{count}</span>}
      </button>
    )
  }
```

- [ ] **Step 5: Sección "Mantención" en el sidebar (desktop)**

En el `<aside>` del sidebar, después del bloque de Categoría (el `{categorias.length > 0 && (...)}`), agregar el bloque de Mantención (solo si `hayMant`):

```tsx
            {hayMant && (
              <div className="rounded-2xl border border-linea bg-superficie p-3 shadow-sm">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-acero">Mantención</p>
                <div className="space-y-0.5">
                  {mantOption('todas', 'Todas', null)}
                  {mantCounts.proxima > 0 && mantOption('proxima', 'Próxima', mantCounts.proxima)}
                  {mantCounts.vencida > 0 && mantOption('vencida', 'Vencida', mantCounts.vencida)}
                </div>
              </div>
            )}
```

- [ ] **Step 6: Select de mantención en la barra compacta (mobile)**

En el bloque mobile (`<div className="mb-3 space-y-2 sm:hidden">`), dentro del `<div className="flex flex-wrap justify-end gap-2">` que tiene los selects de categoría y orden, agregar **antes** del select de orden un select de mantención (solo si `hayMant`):

```tsx
                {hayMant && (
                  <select
                    aria-label="Mantención"
                    value={mant}
                    onChange={(e) => cambiarMant(e.target.value as 'todas' | 'proxima' | 'vencida')}
                    className="rounded-lg border border-linea bg-superficie px-3 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
                  >
                    <option value="todas">Mantención: todas</option>
                    {mantCounts.proxima > 0 && <option value="proxima">Próxima ({mantCounts.proxima})</option>}
                    {mantCounts.vencida > 0 && <option value="vencida">Vencida ({mantCounts.vencida})</option>}
                  </select>
                )}
```

- [ ] **Step 7: No mostrar fantasmas/pie cuando el filtro de mantención está activo**

Las dos condiciones que dibujan los slots fantasma y el pie del plan hoy son `enUltimaPagina && canWrite && filter === 'todos' && !buscando`. Agregarles `&& mant === 'todas'` (para no mostrarlos en una vista filtrada por mantención). Buscar las **dos** ocurrencias y reemplazar:

```tsx
{enUltimaPagina && canWrite && filter === 'todos' && !buscando && ghostsBlock}
```
por
```tsx
{enUltimaPagina && canWrite && filter === 'todos' && mant === 'todas' && !buscando && ghostsBlock}
```
y
```tsx
{enUltimaPagina && canWrite && filter === 'todos' && !buscando && footerBlock}
```
por
```tsx
{enUltimaPagina && canWrite && filter === 'todos' && mant === 'todas' && !buscando && footerBlock}
```

- [ ] **Step 8: Typecheck, lint y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint app components lib`
Expected: sin errores (warnings preexistentes ajenos permitidos).

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 9: Verificación manual (checklist para el revisor humano)**

- La sección "Mantención" del filtro aparece solo si hay ≥1 vehículo próximo/vencido.
- Filtrar Próxima/Vencida acota la lista; combinable con Estado y Categoría; en mobile funciona el select.
- El orden "Mantención" pone las vencidas arriba.
- Con el filtro de mantención activo no se dibujan los slots fantasma ni el pie del plan.

- [ ] **Step 10: Commit**

```bash
git add components/VehiclesBoard.tsx
git commit -m "feat(mantencion): filtro y orden de mantención en el dashboard"
```

---

### Task 3: Eliminar la página /mantenciones y su enlace del menú

**Files:**
- Delete: `app/(app)/mantenciones/page.tsx`
- Modify: `components/AppNav.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Borrar la ruta**

```bash
git rm "app/(app)/mantenciones/page.tsx"
```

(Si queda vacía la carpeta `app/(app)/mantenciones/`, git la deja de rastrear automáticamente al no tener archivos.)

- [ ] **Step 2: Quitar el enlace del menú**

En `components/AppNav.tsx`, eliminar la línea del array `LINKS`:

```tsx
  { href: '/mantenciones', label: 'Mantención' },
```

El array queda con Dashboard y Reportes:

```tsx
const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/reportes', label: 'Reportes' },
]
```

- [ ] **Step 3: Typecheck, lint y build**

Run: `npx tsc --noEmit`
Expected: sin errores (nadie más importa la página borrada).

Run: `npx eslint app components lib`
Expected: sin errores.

Run: `npm run build`
Expected: build exitoso; la ruta `/mantenciones` ya no aparece en el listado de rutas.

- [ ] **Step 4: Verificación manual (checklist para el revisor humano)**

- El menú superior ya no muestra "Mantención" (solo Dashboard · Reportes).
- `/mantenciones` responde 404.

- [ ] **Step 5: Commit**

```bash
git add components/AppNav.tsx "app/(app)/mantenciones/page.tsx"
git commit -m "feat(mantencion): eliminar la página /mantenciones y su enlace del menú"
```

---

## Notas de verificación final

Antes del merge: `npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (sin tests nuevos; `rules.test.ts` requiere emulador y se salta en local). Recordar que merge a `master` **auto-despliega a producción**.
