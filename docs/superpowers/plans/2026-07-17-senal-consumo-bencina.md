# Señal de consumo anómalo de bencina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar en la bitácora del vehículo los usos donde el estanque bajó mucho más de lo que los km recorridos justifican (posible consumo anómalo de bencina), como señal informativa para el Administrador.

**Architecture:** Función pura que, por cada uso cerrado, compara la bajada de estanque observada (respecto a la entrega anterior del mismo vehículo, cuyo nivel + km ya lee la IA) contra la esperada según km ÷ rendimiento ÷ capacidad. El vehículo gana dos datos numéricos (rendimiento km/L + capacidad L), configurables por el Admin. La señal se calcula al leer la bitácora y se muestra como una pill. Sin cambios al flujo de tomar/entregar ni a la IA.

**Tech Stack:** Next.js 16 (App Router, server + client components), React, Firebase Admin (Firestore), Vitest.

## Global Constraints

- Todo el código, UI y comentarios en **español neutro (Chile)**, usando "tú".
- Íconos SVG inline, **no emojis**. Colores vía tokens de la app (`azul`, `azul-press`, `acero`, `tinta`, `linea`, `superficie`, `vencido`) y los hex de estado ya usados (`#15803D`).
- **Nunca confiar en el cliente:** el `PATCH /api/vehicles/[id]` sanea los datos server-side (`sanitizeConsumo`) y sigue exigiendo `can(role, 'vehicle:write')` (Administrador).
- **Señal informativa:** sin email, sin alerta dura, sin bloqueo. Solo una pill en la bitácora del vehículo.
- **Cero cambios** al flujo de tomar/entregar, a la IA, a la ficha pública, ni a la subida de fotos.
- Mapa de niveles y umbrales exactos: `Lleno=1.0, 3/4=0.75, 1/2=0.5, 1/4=0.25, Reserva=0.1`; `UMBRAL_FRACCION=0.25`; `MIN_KM=20`.

---

### Task 1: Datos del vehículo — tipo, saneo, persistencia y PATCH

**Files:**
- Modify: `lib/types.ts` (agregar `ConsumoBencina` + `Vehicle.consumo`)
- Create: `lib/usages/consumo.ts` (`sanitizeConsumo`)
- Test: `lib/usages/__tests__/consumo.test.ts`
- Modify: `lib/data/vehicles.ts` (`toVehicle` mapea `consumo`)
- Modify: `app/api/vehicles/[id]/route.ts` (rama `consumo` en el PATCH)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface ConsumoBencina { rendimientoKmL: number | null; estanqueLitros: number | null }` (en `lib/types.ts`)
  - `Vehicle.consumo?: ConsumoBencina | null`
  - `function sanitizeConsumo(raw: unknown): ConsumoBencina | null` (en `lib/usages/consumo.ts`)

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/usages/__tests__/consumo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { sanitizeConsumo } from '@/lib/usages/consumo'

describe('sanitizeConsumo', () => {
  it('acepta números válidos', () => {
    expect(sanitizeConsumo({ rendimientoKmL: 10, estanqueLitros: 50 })).toEqual({ rendimientoKmL: 10, estanqueLitros: 50 })
  })
  it('parsea strings numéricos', () => {
    expect(sanitizeConsumo({ rendimientoKmL: '12.5', estanqueLitros: '60' })).toEqual({ rendimientoKmL: 12.5, estanqueLitros: 60 })
  })
  it('descarta valores <= 0 o no numéricos a null (por campo)', () => {
    expect(sanitizeConsumo({ rendimientoKmL: -5, estanqueLitros: 50 })).toEqual({ rendimientoKmL: null, estanqueLitros: 50 })
    expect(sanitizeConsumo({ rendimientoKmL: 10, estanqueLitros: 'abc' })).toEqual({ rendimientoKmL: 10, estanqueLitros: null })
  })
  it('devuelve null si no es objeto, o si ambos campos quedan null', () => {
    expect(sanitizeConsumo(null)).toBe(null)
    expect(sanitizeConsumo('x')).toBe(null)
    expect(sanitizeConsumo({})).toBe(null)
    expect(sanitizeConsumo({ rendimientoKmL: 0, estanqueLitros: 'abc' })).toBe(null)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/usages/__tests__/consumo.test.ts`
Expected: FAIL — no existe el módulo `@/lib/usages/consumo`.

- [ ] **Step 3: Agregar el tipo en `lib/types.ts`**

Después de la interfaz `PautaMantencion` (cerca del inicio de los tipos del dominio), agregar:

```typescript
export interface ConsumoBencina {
  rendimientoKmL: number | null // km por litro
  estanqueLitros: number | null // capacidad del estanque en litros
}
```

Y dentro de la interfaz `Vehicle` (junto a `pautaMantencion?`/`danoActivo?`), agregar el campo:

```typescript
  consumo?: ConsumoBencina | null
```

- [ ] **Step 4: Crear `lib/usages/consumo.ts` con `sanitizeConsumo`**

```typescript
import type { ConsumoBencina } from '@/lib/types'

/**
 * Sanea los params de consumo del vehículo. Nunca confía en el cliente: cada
 * valor debe ser un número finito y > 0; si no, queda null. Si ambos quedan
 * null, no hay nada que guardar (devuelve null).
 */
export function sanitizeConsumo(raw: unknown): ConsumoBencina | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const rendimientoKmL = num(r.rendimientoKmL)
  const estanqueLitros = num(r.estanqueLitros)
  if (rendimientoKmL === null && estanqueLitros === null) return null
  return { rendimientoKmL, estanqueLitros }
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run lib/usages/__tests__/consumo.test.ts`
Expected: PASS.

- [ ] **Step 6: Mapear `consumo` en `toVehicle`**

En `lib/data/vehicles.ts`, dentro de la función `toVehicle`, junto a las otras líneas del objeto retornado (ej. después de `danoActivo: data.danoActivo ?? null,`), agregar:

```typescript
    consumo: data.consumo ?? null,
```

- [ ] **Step 7: Agregar la rama `consumo` en el PATCH**

En `app/api/vehicles/[id]/route.ts`, agregar el import arriba (junto a `import { sanitizePauta } from '@/lib/mantencion/status'`):

```typescript
import { sanitizeConsumo } from '@/lib/usages/consumo'
```

Y dentro de `PATCH`, junto a las otras ramas de la whitelist (después de la de `info`), agregar:

```typescript
  if (body.consumo !== undefined) {
    patch.consumo = body.consumo === null ? null : sanitizeConsumo(body.consumo)
  }
```

- [ ] **Step 8: Typecheck, lint y test**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint app components lib`
Expected: sin errores (3 warnings preexistentes de `set-state-in-effect` ajenos).

Run: `npx vitest run lib/usages/__tests__/consumo.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/usages/consumo.ts lib/usages/__tests__/consumo.test.ts lib/data/vehicles.ts "app/api/vehicles/[id]/route.ts"
git commit -m "feat(consumo): datos de consumo del vehículo (tipo + saneo + PATCH)"
```

---

### Task 2: Cálculo puro de la señal de consumo

**Files:**
- Modify: `lib/usages/consumo.ts` (agregar `calcularConsumo` + constantes)
- Test: `lib/usages/__tests__/consumo.test.ts` (agregar casos de `calcularConsumo`)

**Interfaces:**
- Consumes: `ConsumoBencina` de `@/lib/types` (ya importado en el módulo, Task 1).
- Produces:
  - `const NIVEL_FRACCION: Record<string, number>`, `const UMBRAL_FRACCION`, `const MIN_KM`
  - `interface ConsumoCalc { kmRecorridos: number; litrosEsperados: number; litrosObservados: number; fraccionEsperada: number; fraccionObservada: number; revisar: boolean }`
  - `function calcularConsumo(actual: { km: number | null; bencina: string | null }, previo: { km: number | null; bencina: string | null } | null, params: ConsumoBencina | null): ConsumoCalc | null`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `lib/usages/__tests__/consumo.test.ts` (y agregar `calcularConsumo` al import existente: `import { sanitizeConsumo, calcularConsumo } from '@/lib/usages/consumo'`):

```typescript
describe('calcularConsumo', () => {
  const params = { rendimientoKmL: 10, estanqueLitros: 100 }

  it('marca cuando la bajada observada supera a la esperada por >= 1/4 de estanque', () => {
    // 250 km / 10 km/L = 25 L esperados = 0.25 del estanque; observado Lleno->1/2 = 0.5. Discrepancia 0.25.
    const r = calcularConsumo({ km: 1250, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, params)
    expect(r).not.toBeNull()
    expect(r!.revisar).toBe(true)
    expect(r!.kmRecorridos).toBe(250)
    expect(r!.litrosEsperados).toBeCloseTo(25)
    expect(r!.litrosObservados).toBeCloseTo(50)
  })

  it('no marca cuando la bajada es acorde a los km', () => {
    // Lleno->3/4 = 0.25 observado, esperado 0.25. Discrepancia 0.
    const r = calcularConsumo({ km: 1250, bencina: '3/4' }, { km: 1000, bencina: 'Lleno' }, params)
    expect(r).not.toBeNull()
    expect(r!.revisar).toBe(false)
  })

  it('devuelve null sin uso previo', () => {
    expect(calcularConsumo({ km: 1250, bencina: '1/2' }, null, params)).toBe(null)
  })

  it('devuelve null si falta una lectura (km o bencina)', () => {
    expect(calcularConsumo({ km: null, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, params)).toBe(null)
    expect(calcularConsumo({ km: 1250, bencina: null }, { km: 1000, bencina: 'Lleno' }, params)).toBe(null)
    expect(calcularConsumo({ km: 1250, bencina: '1/2' }, { km: 1000, bencina: null }, params)).toBe(null)
  })

  it('devuelve null si hubo recarga (la bencina subió)', () => {
    expect(calcularConsumo({ km: 1250, bencina: 'Lleno' }, { km: 1000, bencina: '1/2' }, params)).toBe(null)
  })

  it('devuelve null en viajes demasiado cortos (< 20 km)', () => {
    expect(calcularConsumo({ km: 1010, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, params)).toBe(null)
  })

  it('devuelve null sin params del vehículo', () => {
    expect(calcularConsumo({ km: 1250, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, null)).toBe(null)
    expect(calcularConsumo({ km: 1250, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, { rendimientoKmL: null, estanqueLitros: 100 })).toBe(null)
  })

  it('devuelve null si un nivel de bencina no es reconocido', () => {
    expect(calcularConsumo({ km: 1250, bencina: 'Medio' }, { km: 1000, bencina: 'Lleno' }, params)).toBe(null)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/usages/__tests__/consumo.test.ts`
Expected: FAIL — `calcularConsumo` no existe.

- [ ] **Step 3: Implementar `calcularConsumo` y las constantes**

Agregar al final de `lib/usages/consumo.ts`:

```typescript
/** Fracción de estanque por nivel de bencina (los 5 niveles que lee la IA). */
export const NIVEL_FRACCION: Record<string, number> = {
  Lleno: 1,
  '3/4': 0.75,
  '1/2': 0.5,
  '1/4': 0.25,
  Reserva: 0.1,
}

/** Se marca "revisar" cuando la bajada observada supera a la esperada por al
 *  menos esta fracción de estanque (un nivel completo). */
export const UMBRAL_FRACCION = 0.25
/** Viajes más cortos que esto (km) no se evalúan: puro ruido. */
export const MIN_KM = 20

export interface ConsumoCalc {
  kmRecorridos: number
  litrosEsperados: number
  litrosObservados: number
  fraccionEsperada: number
  fraccionObservada: number
  revisar: boolean
}

type LecturaUso = { km: number | null; bencina: string | null }

/**
 * Compara la bajada de estanque observada (respecto a la entrega anterior)
 * contra la esperada por los km recorridos. Devuelve null cuando no se puede o
 * no corresponde evaluar: sin params, sin uso previo, lecturas faltantes, nivel
 * desconocido, recarga (la bencina subió), o viaje demasiado corto.
 */
export function calcularConsumo(
  actual: LecturaUso,
  previo: LecturaUso | null,
  params: ConsumoBencina | null,
): ConsumoCalc | null {
  if (!params || !params.rendimientoKmL || !params.estanqueLitros) return null
  if (!previo) return null
  if (actual.km == null || previo.km == null) return null
  if (actual.bencina == null || previo.bencina == null) return null
  const fracActual = NIVEL_FRACCION[actual.bencina]
  const fracPrevio = NIVEL_FRACCION[previo.bencina]
  if (fracActual === undefined || fracPrevio === undefined) return null
  const kmRecorridos = actual.km - previo.km
  if (kmRecorridos < MIN_KM) return null
  const fraccionObservada = fracPrevio - fracActual
  if (fraccionObservada <= 0) return null // recarga o sin bajada
  const litrosEsperados = kmRecorridos / params.rendimientoKmL
  const fraccionEsperada = litrosEsperados / params.estanqueLitros
  const litrosObservados = fraccionObservada * params.estanqueLitros
  const revisar = fraccionObservada - fraccionEsperada >= UMBRAL_FRACCION
  return { kmRecorridos, litrosEsperados, litrosObservados, fraccionEsperada, fraccionObservada, revisar }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/usages/__tests__/consumo.test.ts`
Expected: PASS (todos, sanitize + calcular).

- [ ] **Step 5: Commit**

```bash
git add lib/usages/consumo.ts lib/usages/__tests__/consumo.test.ts
git commit -m "feat(consumo): cálculo puro de la señal de consumo anómalo"
```

---

### Task 3: Panel de configuración en la pestaña Vehículo

**Files:**
- Create: `components/vehicle/ConsumoBencinaPanel.tsx`
- Modify: `app/(app)/vehiculos/[id]/page.tsx` (montar el panel en el slot `vehiculo`)

**Interfaces:**
- Consumes: `ConsumoBencina` de `@/lib/types`; `PATCH /api/vehicles/[id]` con `{ consumo }` (Task 1).
- Produces: `export default function ConsumoBencinaPanel(props: { vehicleId: string; initial: ConsumoBencina | null; puedeEditar: boolean }): JSX.Element`.

- [ ] **Step 1: Crear el componente**

Crear `components/vehicle/ConsumoBencinaPanel.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ConsumoBencina } from '@/lib/types'

// Configuración (Administrador) de los datos de consumo del vehículo. Con
// rendimiento + capacidad, la bitácora marca los usos con posible consumo
// anómalo. Para Editor/Visor se muestra en solo lectura.
export default function ConsumoBencinaPanel({
  vehicleId,
  initial,
  puedeEditar,
}: {
  vehicleId: string
  initial: ConsumoBencina | null
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [rendimiento, setRendimiento] = useState(initial?.rendimientoKmL != null ? String(initial.rendimientoKmL) : '')
  const [estanque, setEstanque] = useState(initial?.estanqueLitros != null ? String(initial.estanqueLitros) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!puedeEditar) {
    return (
      <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-tinta">Consumo de bencina</h2>
        <p className="mt-1 text-sm text-acero">Se usa para detectar consumo anómalo en la bitácora.</p>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-acero">Rendimiento:</dt>
            <dd className="font-medium text-tinta">{initial?.rendimientoKmL != null ? `${initial.rendimientoKmL} km/L` : '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-acero">Capacidad del estanque:</dt>
            <dd className="font-medium text-tinta">{initial?.estanqueLitros != null ? `${initial.estanqueLitros} L` : '—'}</dd>
          </div>
        </dl>
      </section>
    )
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const consumo = {
      rendimientoKmL: rendimiento.trim() ? Number(rendimiento) : null,
      estanqueLitros: estanque.trim() ? Number(estanque) : null,
    }
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumo }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } else {
      setError('No se pudo guardar.')
    }
  }

  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Consumo de bencina</h2>
      <p className="mt-1 text-sm text-acero">Con estos datos, la bitácora marca los usos con posible consumo anómalo.</p>
      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="cb-rendimiento" className="block text-sm font-medium text-acero">Rendimiento (km por litro)</label>
          <input id="cb-rendimiento" type="number" inputMode="decimal" step="0.1" min="0" value={rendimiento} onChange={(e) => setRendimiento(e.target.value)} placeholder="10" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cb-estanque" className="block text-sm font-medium text-acero">Capacidad del estanque (litros)</label>
          <input id="cb-estanque" type="number" inputMode="decimal" step="1" min="0" value={estanque} onChange={(e) => setEstanque(e.target.value)} placeholder="50" className={inputCls} />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {saved && <span className="text-sm text-[#15803D]">Guardado ✓</span>}
          {error && <span className="text-sm text-vencido">{error}</span>}
        </div>
      </form>
    </section>
  )
}
```

- [ ] **Step 2: Montar el panel en la pestaña Vehículo**

En `app/(app)/vehiculos/[id]/page.tsx`, agregar el import junto a los otros de `components/vehicle` (después de `import DanoActivoPanel from '@/components/vehicle/DanoActivoPanel'`):

```tsx
import ConsumoBencinaPanel from '@/components/vehicle/ConsumoBencinaPanel'
```

Dentro del slot `vehiculo={ ... }` del `<VehicleTabs>`, después del `<DanoActivoPanel ... />`, agregar:

```tsx
            <ConsumoBencinaPanel
              vehicleId={vehicle.id}
              initial={vehicle.consumo ?? null}
              puedeEditar={canManageVehicle}
            />
```

- [ ] **Step 3: Typecheck y lint**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint app components lib`
Expected: sin errores (warnings preexistentes ajenos permitidos).

- [ ] **Step 4: Commit**

```bash
git add components/vehicle/ConsumoBencinaPanel.tsx "app/(app)/vehiculos/[id]/page.tsx"
git commit -m "feat(consumo): panel de configuración en la pestaña Vehículo"
```

---

### Task 4: Pill "Revisar consumo" en la bitácora

**Files:**
- Modify: `components/vehicle/BitacoraUso.tsx` (prop `consumoParams` + cálculo + pill)
- Modify: `app/(app)/vehiculos/[id]/page.tsx` (pasar `consumoParams` a `<BitacoraUso>`)

**Interfaces:**
- Consumes: `calcularConsumo` de `@/lib/usages/consumo` (Task 2); `ConsumoBencina` de `@/lib/types`; `PillTip` de `@/components/PillTip` (`{ label: string; tono: 'azul' | 'rojo'; children: ReactNode }`).
- Produces: nada nuevo.

- [ ] **Step 1: Actualizar `BitacoraUso` con el prop, el cálculo y la pill**

En `components/vehicle/BitacoraUso.tsx`:

(a) Agregar imports arriba:

```tsx
import PillTip from '@/components/PillTip'
import { calcularConsumo } from '@/lib/usages/consumo'
import type { ConsumoBencina } from '@/lib/types'
```

(b) Cambiar la firma del componente para recibir `consumoParams`:

```tsx
export default function BitacoraUso({ usos, puedeEditar, consumoParams }: { usos: UsageRow[]; puedeEditar: boolean; consumoParams: ConsumoBencina | null }) {
```

(c) Cambiar el `.map((u) => (` por `.map((u, i) => {` para tener el índice, calcular la señal, y devolver el `<li>`. Reemplazar el bloque que hoy va desde `{usos.map((u) => (` hasta el `))}` de cierre del map por:

```tsx
          {usos.map((u, i) => {
            // El uso previo en el tiempo es el siguiente en la lista (orden desc por tomadoEn).
            const prev = usos[i + 1]
            const consumo = calcularConsumo(
              { km: u.km ?? null, bencina: u.bencina ?? null },
              prev ? { km: prev.km ?? null, bencina: prev.bencina ?? null } : null,
              consumoParams,
            )
            return (
            <li key={u.id} id={`uso-${u.id}`} className="scroll-mt-20 rounded-xl border border-linea p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-tinta">{u.driverNombre}</p>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {u.estado === 'abierto' && <span className="rounded-full bg-azul/10 px-2 py-0.5 text-xs font-medium text-azul">En uso</span>}
                  {u.cierreForzado && <span className="rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">Sin entrega formal</span>}
                  {u.dano?.hay && <span className="rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Daño reportado</span>}
                  {consumo?.revisar && (
                    <PillTip label="Revisar consumo" tono="rojo">
                      Esperabas gastar ~{Math.round(consumo.litrosEsperados)} L en {consumo.kmRecorridos.toLocaleString('es-CL')} km, pero el estanque bajó ~{Math.round(consumo.litrosObservados)} L. Revisa un posible consumo anómalo.
                    </PillTip>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-acero">
                Tomó: {fecha(u.tomadoEn)}
                {u.entregadoEn ? ` · Entregó: ${fecha(u.entregadoEn)}` : ''}
                {u.entregadoPorNombre && u.entregadoPorNombre !== u.driverNombre ? ` (por ${u.entregadoPorNombre})` : ''}
              </p>
              {u.estado === 'abierto' && puedeEditar && <ForzarEntregaButton usageId={u.id} />}
              {u.dano?.nota && <p className="mt-1 text-xs text-[#C81E1E]">Daño: {u.dano.nota}</p>}
              {u.dano?.hay && (
                u.dano.revisadoPorNombre
                  ? <p className="mt-2 text-xs text-acero">Daño registrado por <span className="font-medium text-tinta">{u.dano.revisadoPorNombre}</span></p>
                  : <RevisarDanoButton usageId={u.id} />
              )}
              {(u.fotoTableroUrl || u.fotoCabinaUrl) && (
                <div className="mt-3 flex gap-2">
                  {u.fotoTableroUrl && (
                    <a href={u.fotoTableroUrl} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u.fotoTableroUrl} alt="Tablero" loading="lazy" className="h-20 w-28 rounded-lg border border-linea object-cover" />
                    </a>
                  )}
                  {u.fotoCabinaUrl && (
                    <a href={u.fotoCabinaUrl} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u.fotoCabinaUrl} alt="Cabina" loading="lazy" className="h-20 w-28 rounded-lg border border-linea object-cover" />
                    </a>
                  )}
                </div>
              )}
              {(u.bencina || u.km != null || u.limpieza || u.iaAnalizadoEn) && (
                <div className="mt-3 border-t border-linea pt-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-acero">
                    <span>Bencina: <span className="font-medium text-tinta">{u.bencina ?? '—'}</span></span>
                    <span>Kilometraje: <span className="font-medium text-tinta">{u.km != null ? u.km.toLocaleString('es-CL') : '—'}</span></span>
                    <span>Limpieza: <span className="font-medium text-tinta">{u.limpieza ?? '—'}</span></span>
                    {u.iaAnalizadoEn && !u.datosConfirmados && (
                      <span className="rounded-full bg-azul/10 px-2 py-0.5 font-medium text-azul">estimado por IA</span>
                    )}
                  </div>
                  {puedeEditar && (
                    <UsageDatosEditor usageId={u.id} bencina={u.bencina ?? null} km={u.km ?? null} limpieza={u.limpieza ?? null} />
                  )}
                </div>
              )}
            </li>
            )
          })}
```

(Nota: el único cambio funcional es el bloque `const prev … const consumo …` y la pill `{consumo?.revisar && …}` dentro del div de badges; el resto del `<li>` es idéntico al actual, reproducido para que quede completo tras cambiar `(u) =>` por `(u, i) => { … return ( … ) }`.)

- [ ] **Step 2: Pasar `consumoParams` desde la página**

En `app/(app)/vehiculos/[id]/page.tsx`, en el slot `bitacora={ ... }` del `<VehicleTabs>`, cambiar:

```tsx
        bitacora={<BitacoraUso usos={usos} puedeEditar={canEditDocs} />}
```

por:

```tsx
        bitacora={<BitacoraUso usos={usos} puedeEditar={canEditDocs} consumoParams={vehicle.consumo ?? null} />}
```

- [ ] **Step 3: Typecheck, lint y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint app components lib`
Expected: sin errores (warnings preexistentes ajenos permitidos).

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación manual (checklist para el revisor humano)**

- En un vehículo **con** rendimiento + capacidad configurados y con al menos dos usos consecutivos con lecturas, un uso donde la bajada de estanque supera claramente lo esperado muestra la pill roja "Revisar consumo"; al tocarla, el popover explica esperado vs. observado.
- Un uso con consumo acorde **no** muestra la pill.
- En un vehículo **sin** consumo configurado, ningún uso muestra la pill.

- [ ] **Step 5: Commit**

```bash
git add components/vehicle/BitacoraUso.tsx "app/(app)/vehiculos/[id]/page.tsx"
git commit -m "feat(consumo): pill 'Revisar consumo' en la bitácora del vehículo"
```

---

## Notas de verificación final

Antes del merge: `npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (incluye los nuevos tests de `consumo.ts`; `rules.test.ts` requiere emulador y se salta en local). Recordar que merge a `master` **auto-despliega a producción**.
