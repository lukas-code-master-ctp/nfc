# Sub-menús de la ficha del vehículo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar la ficha privada del vehículo (`/vehiculos/[id]`), hoy una sola columna muy larga, en 4 pestañas navegables por hash, sin tocar datos, endpoints ni roles.

**Architecture:** Un helper puro mapea el hash de la URL a la pestaña activa (con soporte de enlaces profundos `#uso-{id}`). Un componente cliente `VehicleTabs` recibe las 4 secciones ya renderizadas como slots (`ReactNode`), muestra la barra de pestañas y oculta las inactivas con CSS. El `page.tsx` sigue siendo server component y hace el mismo fetch de siempre; solo cambia el ensamblado final.

**Tech Stack:** Next.js 16 (App Router, server/client components), React, Tailwind v4 (tokens en `app/globals.css`), Vitest.

## Global Constraints

- Todo el código, UI y comentarios en **español neutro (Chile)**, usando "tú".
- Íconos SVG inline, **no emojis**. Colores vía tokens de la app (`azul`, `acero`, `tinta`, `linea`).
- **Cero cambios** en lógica de datos, route handlers, reglas de Firestore, roles/permisos ni en la ficha pública `app/v/[token]`. Es reorganización visual.
- Los slots ya vienen con su gating por rol resuelto en el server (`canEditDocs`, `canManageVehicle`); las pestañas no re-evalúan permisos.
- Pestaña inicial por defecto: **Documentos**. Enlaces `#uso-{id}` deben abrir **Bitácora** y hacer scroll al uso.
- La regla ESLint `react-hooks/set-state-in-effect` está bajada a `warn` a propósito en este repo; el patrón de sincronizar estado desde un `useEffect` en `VehicleTabs` producirá un **warning esperado**, no un error.

---

### Task 1: Helper puro `tabDesdeHash`

**Files:**
- Create: `lib/vehicles/tabs.ts`
- Test: `lib/vehicles/__tests__/tabs.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type TabFicha = 'documentos' | 'vehiculo' | 'bitacora' | 'ajustes'`
  - `function tabDesdeHash(hash: string): { tab: TabFicha; scrollA: string | null }`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/vehicles/__tests__/tabs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { tabDesdeHash } from '@/lib/vehicles/tabs'

describe('tabDesdeHash', () => {
  it('resuelve cada hash de pestaña (con y sin #)', () => {
    expect(tabDesdeHash('#documentos')).toEqual({ tab: 'documentos', scrollA: null })
    expect(tabDesdeHash('vehiculo')).toEqual({ tab: 'vehiculo', scrollA: null })
    expect(tabDesdeHash('#bitacora')).toEqual({ tab: 'bitacora', scrollA: null })
    expect(tabDesdeHash('ajustes')).toEqual({ tab: 'ajustes', scrollA: null })
  })

  it('un hash uso-{id} abre la bitácora y pide scroll a ese uso', () => {
    expect(tabDesdeHash('#uso-abc123')).toEqual({ tab: 'bitacora', scrollA: 'uso-abc123' })
    expect(tabDesdeHash('uso-XYZ')).toEqual({ tab: 'bitacora', scrollA: 'uso-XYZ' })
  })

  it('vacío o desconocido cae en documentos', () => {
    expect(tabDesdeHash('')).toEqual({ tab: 'documentos', scrollA: null })
    expect(tabDesdeHash('#')).toEqual({ tab: 'documentos', scrollA: null })
    expect(tabDesdeHash('#loquesea')).toEqual({ tab: 'documentos', scrollA: null })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/vehicles/__tests__/tabs.test.ts`
Expected: FAIL — no existe el módulo `@/lib/vehicles/tabs`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/vehicles/tabs.ts`:

```typescript
export type TabFicha = 'documentos' | 'vehiculo' | 'bitacora' | 'ajustes'

/** Orden de las pestañas en la ficha del vehículo. */
export const TABS_FICHA: readonly TabFicha[] = ['documentos', 'vehiculo', 'bitacora', 'ajustes']

/**
 * Resuelve la pestaña activa (y un posible destino de scroll) a partir del hash
 * de la URL. Un hash `uso-{id}` (enlace profundo a un uso desde la pill del
 * dashboard o el email de daño) abre la Bitácora y pide scroll a ese uso.
 * Cualquier hash vacío o desconocido cae en Documentos.
 */
export function tabDesdeHash(hash: string): { tab: TabFicha; scrollA: string | null } {
  const limpio = hash.replace(/^#/, '')
  if ((TABS_FICHA as readonly string[]).includes(limpio)) {
    return { tab: limpio as TabFicha, scrollA: null }
  }
  if (limpio.startsWith('uso-')) {
    return { tab: 'bitacora', scrollA: limpio }
  }
  return { tab: 'documentos', scrollA: null }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/vehicles/__tests__/tabs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/vehicles/tabs.ts lib/vehicles/__tests__/tabs.test.ts
git commit -m "feat(ficha): helper puro tabDesdeHash para sub-menús"
```

---

### Task 2: Componente cliente `VehicleTabs`

**Files:**
- Create: `components/vehicle/VehicleTabs.tsx`

**Interfaces:**
- Consumes: `tabDesdeHash`, `type TabFicha`, `TABS_FICHA` de `@/lib/vehicles/tabs` (Task 1).
- Produces: `export default function VehicleTabs(props: { documentos: ReactNode; vehiculo: ReactNode; bitacora: ReactNode; ajustes: ReactNode }): JSX.Element` — consumido por `page.tsx` (Task 3).

- [ ] **Step 1: Escribir el componente**

Crear `components/vehicle/VehicleTabs.tsx`:

```tsx
'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { tabDesdeHash, TABS_FICHA, type TabFicha } from '@/lib/vehicles/tabs'

const LABELS: Record<TabFicha, string> = {
  documentos: 'Documentos',
  vehiculo: 'Vehículo',
  bitacora: 'Bitácora',
  ajustes: 'Ajustes',
}

export default function VehicleTabs({
  documentos,
  vehiculo,
  bitacora,
  ajustes,
}: {
  documentos: ReactNode
  vehiculo: ReactNode
  bitacora: ReactNode
  ajustes: ReactNode
}) {
  const [activa, setActiva] = useState<TabFicha>('documentos')

  // Sincroniza la pestaña con el hash de la URL: al montar y ante atrás/adelante
  // del navegador (evento `hashchange`). Un hash `uso-{id}` abre la Bitácora y
  // hace scroll al <li id="uso-{id}"> una vez que es visible.
  useEffect(() => {
    function sync() {
      const { tab, scrollA } = tabDesdeHash(window.location.hash)
      setActiva(tab)
      if (scrollA) {
        requestAnimationFrame(() => document.getElementById(scrollA)?.scrollIntoView())
      }
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  // Cambiar el hash dispara `hashchange` → sync() actualiza la pestaña y suma una
  // entrada al historial, así atrás/adelante navegan entre pestañas.
  function irA(tab: TabFicha) {
    window.location.hash = tab
  }

  const slots: Record<TabFicha, ReactNode> = { documentos, vehiculo, bitacora, ajustes }

  return (
    <div className="space-y-6">
      <nav
        className="flex gap-1 overflow-x-auto border-b border-linea"
        role="tablist"
        aria-label="Secciones del vehículo"
      >
        {TABS_FICHA.map((id) => {
          const sel = id === activa
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={sel}
              onClick={() => irA(id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                sel ? 'border-azul text-azul' : 'border-transparent text-acero hover:text-tinta'
              }`}
            >
              {LABELS[id]}
            </button>
          )
        })}
      </nav>
      {TABS_FICHA.map((id) => (
        <div key={id} role="tabpanel" hidden={id !== activa}>
          {slots[id]}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck y lint**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint components lib`
Expected: sin errores. Puede aparecer un **warning** `react-hooks/set-state-in-effect` en `VehicleTabs.tsx` (esperado; ver Global Constraints). Warnings no bloquean.

- [ ] **Step 3: Commit**

```bash
git add components/vehicle/VehicleTabs.tsx
git commit -m "feat(ficha): shell de pestañas VehicleTabs (hash + slots)"
```

---

### Task 3: Ensamblar la ficha con las pestañas

**Files:**
- Modify: `app/(app)/vehiculos/[id]/page.tsx` (solo el `return`/JSX, desde la línea 88; el fetch de datos de arriba no cambia)

**Interfaces:**
- Consumes: `VehicleTabs` de `@/components/vehicle/VehicleTabs` (Task 2). Todas las variables ya calculadas en el cuerpo de la función (`items`, `usos`, `mantencionesConUrl`, `estado`, `pautaEfectiva`, `esOverride`, `danoFotoUrl`, `publicUrl`, `canEditDocs`, `canManageVehicle`, `categorias`) se mantienen intactas.
- Produces: nada nuevo (es la página final).

- [ ] **Step 1: Importar `VehicleTabs`**

En `app/(app)/vehiculos/[id]/page.tsx`, junto a los otros imports de componentes (después de la línea `import DanoActivoPanel from '@/components/vehicle/DanoActivoPanel'`), agregar:

```tsx
import VehicleTabs from '@/components/vehicle/VehicleTabs'
```

- [ ] **Step 2: Reemplazar el JSX de retorno**

Reemplazar TODO el bloque `return ( ... )` actual (desde `return (` en la línea ~88 hasta el `)` de cierre antes del `}` final de la función) por este. El encabezado (`<div className="flex items-center gap-4 ...">`) queda **idéntico**; lo que cambia es que las secciones ahora se pasan como slots a `VehicleTabs` en vez de apilarse:

```tsx
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <BackLink />

      <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-7" aria-hidden="true">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
            <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
          </svg>
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-tinta">
            {vehicle.marca} {vehicle.modelo} · {vehicle.patente}
          </h1>
          <p className="text-sm text-acero">{vehicle.anio} · {vehicle.color}</p>
          {/* Sin lectura de km no se muestra nada (el espacio queda limpio). */}
          {typeof vehicle.kmActual === 'number' && (
            <p className="mt-0.5 text-sm text-acero">
              Kilometraje: <span className="font-medium text-tinta">{vehicle.kmActual.toLocaleString('es-CL')} km</span>
              {vehicle.kmActualizadoEn && (
                <span className="text-xs"> · actualizado el {new Date(vehicle.kmActualizadoEn).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}</span>
              )}
            </p>
          )}
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
        </div>
      </div>

      <VehicleTabs
        documentos={
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-tinta">Documentos</h2>
            {canEditDocs && <DocumentForm vehicleId={vehicle.id} />}
            <DocumentList documents={items} vehicleId={vehicle.id} canEdit={canEditDocs} />
          </section>
        }
        vehiculo={
          <div className="space-y-6">
            {canManageVehicle ? (
              <VehicleInfoForm vehicleId={vehicle.id} initial={vehicle.info ?? {}} />
            ) : (
              <VehicleInfoView info={vehicle.info ?? {}} />
            )}
            <MantencionPanel
              vehicleId={vehicle.id}
              estado={estado.estado}
              detalle={estado.detalle}
              pautaEfectiva={pautaEfectiva}
              esOverride={esOverride}
              pautaEstandar={company?.pautaMantencion ?? null}
              kmActual={vehicle.kmActual ?? null}
              mantenciones={mantencionesConUrl}
              puedeRegistrar={canEditDocs}
              puedeConfigurar={canManageVehicle}
            />
            <DanoActivoPanel
              vehicleId={vehicle.id}
              danoActivo={vehicle.danoActivo ?? null}
              danoFotoUrl={danoFotoUrl}
              puedeGestionar={canManageVehicle}
            />
          </div>
        }
        bitacora={<BitacoraUso usos={usos} puedeEditar={canEditDocs} />}
        ajustes={
          <div className="space-y-6">
            <NfcTokenPanel vehicleId={vehicle.id} initialUrl={publicUrl} />
            {canManageVehicle && (
              <DeleteVehicleButton
                vehicleId={vehicle.id}
                label={`${vehicle.marca} ${vehicle.modelo} · ${vehicle.patente}`}
              />
            )}
          </div>
        }
      />
    </main>
  )
```

- [ ] **Step 3: Typecheck, lint y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint app components lib`
Expected: sin errores (warning esperado de `react-hooks/set-state-in-effect` en `VehicleTabs.tsx`).

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación manual (checklist para el revisor humano)**

- Abrir `/vehiculos/{id}`: se ve el encabezado + barra con 4 pestañas; arranca en **Documentos**.
- Cambiar de pestaña: el hash de la URL cambia (`#vehiculo`, `#bitacora`, `#ajustes`); atrás/adelante del navegador saltan entre pestañas; recargar mantiene la pestaña.
- Desde el dashboard, clic en la pill **"Daño reportado"** de un vehículo (o el botón del email de daño) → aterriza en `/vehiculos/{id}#uso-{id}`, abre **Bitácora** y hace scroll al uso.
- Roles: como Editor/Visor, las secciones respetan lo de siempre (sin `DocumentForm`, sin `DeleteVehicleButton`, Información en solo lectura).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/vehiculos/[id]/page.tsx"
git commit -m "feat(ficha): ficha del vehículo en sub-menús (Documentos/Vehículo/Bitácora/Ajustes)"
```

---

## Notas de verificación final

Antes del merge: `npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (el nuevo `tabs.test.ts` incluido; `rules.test.ts` requiere emulador de Firestore y se salta en local). Recordar que merge a `master` **auto-despliega a producción** — confirmar antes de pushear.
