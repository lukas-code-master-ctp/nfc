# Punto "en vivo" + pills clickeables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dos mejoras de UI frontend-puro: pills clickeables con tooltip en la bitácora de flota (`/reportes`), y un indicador "en uso" (punto verde animado + tooltip) en la card de vehículo del dashboard.

**Architecture:** Ambas features son solo frontend; los datos ya están disponibles (el endpoint `/api/reportes/usos` ya devuelve km/bencina/limpieza/daño; `VehicleCard` ya recibe `vehicle.usoActual`). Se agrega un componente reutilizable `PillTip` (pill clickeable con popover, patrón de `InfoTip`) y se anima el punto con CSS (`animate-ping`) para no convertir `VehicleCard` en client component.

**Tech Stack:** Next.js 16 (App Router, server + client components), TypeScript estricto, Tailwind CSS v4.

## Global Constraints

- Idioma de todo el código/UI/copy: **español neutro (Chile)**, tratar de **"tú"**.
- **Sin cambios de backend**: no se tocan endpoints, rutas ni la capa de datos.
- `components/VehicleCard.tsx` debe **seguir siendo server component** (no agregar `'use client'`; el punto es puro CSS + `title` nativo).
- `PillTip` replica el patrón de `components/InfoTip.tsx` (estado `open`, cierra con `mousedown` fuera y con `Escape`, `role="tooltip"`).
- Tokens de color existentes: verde de la app `#15803D`; pill roja de daño `bg-[#FCE7E7]`/`text-[#C81E1E]`; pill ámbar "Sin entrega" `bg-[#FDF1DC]`/`text-[#B45309]`; azul de marca vía `bg-azul/10 text-azul`.
- Formato de fecha/hora: `toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })`.
- Estas features son presentacionales: **sin tests unitarios nuevos**; verificar con `npx tsc --noEmit`, `npx eslint <archivos>` y `npm run build`.

---

### Task 1: Pills clickeables en la bitácora (PillTip + BitacoraFlota)

**Files:**
- Create: `components/PillTip.tsx`
- Modify: `components/reportes/BitacoraFlota.tsx`

**Interfaces:**
- Produces: `PillTip({ label: string; tono: 'azul' | 'rojo'; children: React.ReactNode })` — pill clickeable que abre/cierra un popover con `children`.
- Consumes: los campos que `GET /api/reportes/usos` ya devuelve por uso (`km?: number`, `bencina?: string`, `limpieza?: string`, `dano?: { hay: boolean; nota?: string }`).

- [ ] **Step 1: Crear `components/PillTip.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'

// Pill clickeable con popover. Click para abrir/cerrar; se cierra con click
// fuera o con Escape (mismo patrón que InfoTip, pero el disparador es una pill).
const TONOS = {
  azul: 'bg-azul/10 text-azul',
  rojo: 'bg-[#FCE7E7] text-[#C81E1E]',
} as const

export default function PillTip({
  label,
  tono,
  children,
}: {
  label: string
  tono: keyof typeof TONOS
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 ${TONOS[tono]}`}
      >
        {label}
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-6 z-30 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-linea bg-superficie p-3 text-left text-sm text-tinta shadow-lg"
        >
          {children}
        </div>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Extender la interfaz `Uso` en `BitacoraFlota.tsx`**

En `components/reportes/BitacoraFlota.tsx`, reemplazar la interfaz `Uso` (líneas ~6-14) por (agrega `km`/`bencina`/`limpieza` y `nota` en `dano`):

```ts
interface Uso {
  id: string
  vehicleId: string
  driverNombre: string
  tomadoEn: string
  entregadoEn: string | null
  cierreForzado?: boolean
  km?: number
  bencina?: string
  limpieza?: string
  dano?: { hay: boolean; nota?: string }
}
```

- [ ] **Step 3: Importar `PillTip` y renderizar las pills**

En `components/reportes/BitacoraFlota.tsx`:

(a) Agregar el import junto a los otros (arriba del archivo, tras `'use client'` y el import de React):

```ts
import PillTip from '@/components/PillTip'
```

(b) Reemplazar el contenedor de pills de cada fila (hoy `<div className="flex shrink-0 gap-1">…</div>`, líneas ~100-103) por:

```tsx
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                {(u.km != null || u.bencina) && (
                  <PillTip label="Tablero" tono="azul">
                    {u.km != null && <p>Kilometraje: {u.km.toLocaleString('es-CL')} km</p>}
                    {u.bencina && <p>Bencina: {u.bencina}</p>}
                  </PillTip>
                )}
                {u.limpieza && (
                  <PillTip label="Limpieza" tono="azul">
                    <p>Limpieza: {u.limpieza}</p>
                  </PillTip>
                )}
                {u.dano?.hay && (
                  <PillTip label="Daño" tono="rojo">
                    <p>{u.dano.nota || 'Sin nota'}</p>
                  </PillTip>
                )}
                {u.cierreForzado && (
                  <span className="rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">Sin entrega</span>
                )}
              </div>
```

- [ ] **Step 4: Typecheck, lint y build**

Run: `npx tsc --noEmit && npx eslint components/PillTip.tsx components/reportes/BitacoraFlota.tsx && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 5: Commit**

```bash
git add components/PillTip.tsx components/reportes/BitacoraFlota.tsx
git commit -m "feat(reportes): pills clickeables con tooltip en la bitacora de flota"
```

---

### Task 2: Punto "en vivo" en la card del dashboard

**Files:**
- Modify: `components/VehicleCard.tsx`

**Interfaces:**
- Consumes: `vehicle.usoActual` — tipado en `Vehicle` como `{ driverId: string; driverNombre: string; tomadoEn: string } | null | undefined` (denormalizado; solo se usan `driverNombre` y `tomadoEn`).
- Produces: nada (feature terminal).

- [ ] **Step 1: Agregar el helper de hora y el punto animado**

En `components/VehicleCard.tsx`:

(a) Agregar un helper de formato de hora arriba del componente (después del import de tipos y antes de `function CarIcon`):

```tsx
function horaUso(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}
```

(b) Reemplazar el `<span>` del ícono del auto (hoy `<span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul"><CarIcon className="size-6" /></span>`) por una versión con `relative` y el punto de presencia:

```tsx
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
        <CarIcon className="size-6" />
        {vehicle.usoActual && (
          <span
            className="absolute -right-1 -top-1 flex size-3"
            title={`En uso por ${vehicle.usoActual.driverNombre} · desde ${horaUso(vehicle.usoActual.tomadoEn)}`}
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15803D] opacity-60" />
            <span className="relative inline-flex size-3 rounded-full border-2 border-superficie bg-[#15803D]" />
          </span>
        )}
      </span>
```

(No agregar `'use client'`: el punto es puro CSS (`animate-ping`) y el tooltip es `title` nativo.)

- [ ] **Step 2: Typecheck, lint y build**

Run: `npx tsc --noEmit && npx eslint components/VehicleCard.tsx && npm run build`
Expected: sin errores; build compila. (Si tsc se queja de que `usoActual` no existe en `Vehicle`, revisar el tipo en `lib/types.ts` — debe existir por la denormalización; no cambiar el tipo salvo que falte.)

- [ ] **Step 3: Verificación visual rápida (opcional, manual)**

Confirmar en el dashboard que un vehículo con uso abierto muestra el punto verde animado con su tooltip, y que la card sigue navegando al vehículo al hacer click.

- [ ] **Step 4: Commit**

```bash
git add components/VehicleCard.tsx
git commit -m "feat(dashboard): indicador en vivo del vehiculo en uso en la card"
```

---

## Notas de cierre (tras las 2 tasks)

- Actualizar `CLAUDE.md` (sección de componentes reutilizables): mencionar `PillTip` (pill clickeable con popover, hermano de `InfoTip`) y que la card del dashboard (`VehicleCard`) muestra un punto "en vivo" cuando el vehículo tiene `usoActual`.
- El tercer ítem del lote original (estados de miembros en Equipo) se descartó: no era bug (los datos de prod confirman que el panel es correcto).
