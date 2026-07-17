# Columna "Consumo anormal" en el reporte por conductor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar al reporte "Responsabilidad por conductor" (`/reportes`) una columna "Consumo anormal" que cuenta, por conductor, cuántos de sus usos gatillan la señal de consumo anómalo de bencina.

**Architecture:** Conteo on-read: en la carga de `/reportes` se recorren todos los usos de la empresa (una query), se recalcula la misma señal pura `calcularConsumo` por uso (vs. su anterior del mismo vehículo) y se cuenta por `driverId`. No se persiste ningún contador (siempre refleja los params/lecturas actuales). La función que agrega es pura y testeable.

**Tech Stack:** Next.js 16 (App Router, server component), React, Firebase Admin (Firestore), Vitest.

## Global Constraints

- Todo el código, UI y comentarios en **español neutro (Chile)**, usando "tú".
- Sin emojis. Colores vía tokens/hex ya usados en la tabla: daños `#C81E1E` (rojo), sin entrega / consumo `#B45309` (ámbar); texto normal `text-tinta`.
- **Conteo on-read, sin contador guardado:** no se agrega ningún campo a Firestore ni a `drivers.stats`, ni migración, ni endpoint nuevo. Se reusa `calcularConsumo`.
- La señal se atribuye al conductor **del uso anómalo** (`driverId`).
- **Cero cambios** al flujo de tomar/entregar, a la IA, a la ficha pública, ni a la pill de la bitácora del vehículo.
- El "previo" de un uso es el uso anterior en el tiempo **del mismo vehículo** (orden desc por `tomadoEn` dentro del grupo del vehículo).

---

### Task 1: Función pura de conteo por conductor

**Files:**
- Modify: `lib/usages/consumo.ts` (agregar `contarConsumoAnomaloPorConductor`)
- Test: `lib/usages/__tests__/consumo.test.ts` (agregar casos)

**Interfaces:**
- Consumes: `calcularConsumo` y `ConsumoBencina` (ya en el módulo/`@/lib/types`).
- Produces:
  - `function contarConsumoAnomaloPorConductor(usos: { vehicleId: string; driverId: string; tomadoEn: string; km: number | null; bencina: string | null }[], paramsPorVehiculo: Map<string, ConsumoBencina | null>): Map<string, number>`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `lib/usages/__tests__/consumo.test.ts` (y agregar `contarConsumoAnomaloPorConductor` al import existente desde `@/lib/usages/consumo`):

```typescript
describe('contarConsumoAnomaloPorConductor', () => {
  const params = new Map([['v1', { rendimientoKmL: 10, estanqueLitros: 100 }]])

  it('cuenta un uso anómalo y lo atribuye al conductor de ese uso', () => {
    const usos = [
      { vehicleId: 'v1', driverId: 'd1', tomadoEn: '2026-01-02', km: 1250, bencina: '1/2' },
      { vehicleId: 'v1', driverId: 'd2', tomadoEn: '2026-01-01', km: 1000, bencina: 'Lleno' },
    ]
    const r = contarConsumoAnomaloPorConductor(usos, params)
    expect(r.get('d1')).toBe(1)
    expect(r.get('d2')).toBeUndefined()
  })

  it('suma las anomalías del mismo conductor a través de varios vehículos', () => {
    const params2 = new Map([
      ['v1', { rendimientoKmL: 10, estanqueLitros: 100 }],
      ['v2', { rendimientoKmL: 10, estanqueLitros: 100 }],
    ])
    const usos = [
      { vehicleId: 'v1', driverId: 'd1', tomadoEn: '2026-01-02', km: 1250, bencina: '1/2' },
      { vehicleId: 'v1', driverId: 'dx', tomadoEn: '2026-01-01', km: 1000, bencina: 'Lleno' },
      { vehicleId: 'v2', driverId: 'd1', tomadoEn: '2026-02-02', km: 2250, bencina: '1/2' },
      { vehicleId: 'v2', driverId: 'dy', tomadoEn: '2026-02-01', km: 2000, bencina: 'Lleno' },
    ]
    expect(contarConsumoAnomaloPorConductor(usos, params2).get('d1')).toBe(2)
  })

  it('no cuenta usos con consumo acorde ni el uso más antiguo (sin previo)', () => {
    const usos = [
      { vehicleId: 'v1', driverId: 'd1', tomadoEn: '2026-01-02', km: 1250, bencina: '3/4' }, // bajada acorde
      { vehicleId: 'v1', driverId: 'd2', tomadoEn: '2026-01-01', km: 1000, bencina: 'Lleno' }, // sin previo
    ]
    expect(contarConsumoAnomaloPorConductor(usos, params).size).toBe(0)
  })

  it('el previo es del mismo vehículo (no toma un uso de otro vehículo como base)', () => {
    // v1 tiene un solo uso -> sin previo -> no cuenta, aunque exista un uso en v2.
    const usos = [
      { vehicleId: 'v1', driverId: 'd1', tomadoEn: '2026-01-02', km: 1250, bencina: '1/2' },
      { vehicleId: 'v2', driverId: 'd2', tomadoEn: '2026-01-01', km: 1000, bencina: 'Lleno' },
    ]
    expect(contarConsumoAnomaloPorConductor(usos, params).size).toBe(0)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/usages/__tests__/consumo.test.ts`
Expected: FAIL — `contarConsumoAnomaloPorConductor` no existe.

- [ ] **Step 3: Implementar la función**

Agregar al final de `lib/usages/consumo.ts`:

```typescript
type UsoConsumo = { vehicleId: string; driverId: string; tomadoEn: string; km: number | null; bencina: string | null }

/**
 * Cuenta, por conductor, cuántos usos gatillan la señal de consumo anómalo.
 * Agrupa los usos por vehículo, los ordena desc por `tomadoEn` (el previo de
 * grupo[i] es grupo[i+1]) y aplica `calcularConsumo` con los params de ese
 * vehículo. Devuelve un Map driverId -> cantidad (solo conductores con >= 1).
 */
export function contarConsumoAnomaloPorConductor(
  usos: UsoConsumo[],
  paramsPorVehiculo: Map<string, ConsumoBencina | null>,
): Map<string, number> {
  const porVehiculo = new Map<string, UsoConsumo[]>()
  for (const u of usos) {
    const arr = porVehiculo.get(u.vehicleId)
    if (arr) arr.push(u)
    else porVehiculo.set(u.vehicleId, [u])
  }
  const conteo = new Map<string, number>()
  for (const [vehicleId, grupo] of porVehiculo) {
    grupo.sort((a, b) => (a.tomadoEn < b.tomadoEn ? 1 : -1))
    const params = paramsPorVehiculo.get(vehicleId) ?? null
    for (let i = 0; i < grupo.length; i++) {
      const prev = grupo[i + 1] ?? null
      const calc = calcularConsumo(
        { km: grupo[i].km, bencina: grupo[i].bencina },
        prev ? { km: prev.km, bencina: prev.bencina } : null,
        params,
      )
      if (calc?.revisar) {
        conteo.set(grupo[i].driverId, (conteo.get(grupo[i].driverId) ?? 0) + 1)
      }
    }
  }
  return conteo
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/usages/__tests__/consumo.test.ts`
Expected: PASS (todos: sanitize + calcular + contar).

- [ ] **Step 5: Commit**

```bash
git add lib/usages/consumo.ts lib/usages/__tests__/consumo.test.ts
git commit -m "feat(consumo): conteo de consumo anómalo por conductor (puro)"
```

---

### Task 2: Query de usos por empresa + columna en el reporte

**Files:**
- Modify: `lib/data/usages.ts` (agregar `listUsagesByCompany`)
- Modify: `app/(app)/reportes/page.tsx` (cargar usos, calcular conteo, sumar a las filas)
- Modify: `components/reportes/ReporteConductores.tsx` (columna nueva)

**Interfaces:**
- Consumes: `contarConsumoAnomaloPorConductor` de `@/lib/usages/consumo` (Task 1).
- Produces: `function listUsagesByCompany(companyId: string): Promise<VehicleUsage[]>` (en `lib/data/usages.ts`).

- [ ] **Step 1: Agregar `listUsagesByCompany` en `lib/data/usages.ts`**

Después de `deleteUsagesByCompany` (que ya hace la misma query para borrar), agregar:

```typescript
/** Todos los usos de una empresa (para reportes agregados). Una sola query. */
export async function listUsagesByCompany(companyId: string): Promise<VehicleUsage[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.docs.map((d) => toUsage(d.id, d.data()))
}
```

- [ ] **Step 2: Cargar usos y calcular el conteo en la página**

En `app/(app)/reportes/page.tsx`:

(a) Agregar los imports (junto a los existentes):

```typescript
import { listUsagesByCompany } from '@/lib/data/usages'
import { contarConsumoAnomaloPorConductor } from '@/lib/usages/consumo'
```

(b) Cambiar la carga de datos para incluir los usos:

```typescript
  const [drivers, vehicles, usos] = await Promise.all([
    listDrivers(m.companyId),
    listVehicles(m.companyId),
    listUsagesByCompany(m.companyId),
  ])
```

(c) Después de esa línea, calcular el conteo por conductor:

```typescript
  const paramsPorVehiculo = new Map(vehicles.map((v) => [v.id, v.consumo ?? null]))
  const consumoPorConductor = contarConsumoAnomaloPorConductor(
    usos.map((u) => ({ vehicleId: u.vehicleId, driverId: u.driverId, tomadoEn: u.tomadoEn, km: u.km ?? null, bencina: u.bencina ?? null })),
    paramsPorVehiculo,
  )
```

(d) Reemplazar el `const filas = ...` actual por esta versión (agrega `consumoAnomalo` y lo suma al orden):

```typescript
  const filas = drivers
    .map((d) => ({
      id: d.id,
      nombre: d.nombre,
      usos: d.stats?.usos ?? 0,
      danos: d.stats?.danos ?? 0,
      sinEntrega: d.stats?.sinEntrega ?? 0,
      consumoAnomalo: consumoPorConductor.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.danos - a.danos || b.sinEntrega - a.sinEntrega || b.consumoAnomalo - a.consumoAnomalo)
```

- [ ] **Step 3: Agregar la columna en `ReporteConductores`**

En `components/reportes/ReporteConductores.tsx`:

(a) Agregar el campo a la interfaz `Fila`:

```typescript
interface Fila {
  id: string
  nombre: string
  usos: number
  danos: number
  sinEntrega: number
  consumoAnomalo: number
}
```

(b) Reemplazar el `<thead>...</thead>` por (la columna "Sin entrega" pasa a llevar `pr-4` porque ya no es la última; se agrega "Consumo anormal" como última):

```tsx
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-acero">
                <th className="py-2 pr-4 font-medium">Conductor</th>
                <th className="py-2 pr-4 font-medium">Usos</th>
                <th className="py-2 pr-4 font-medium">Daños</th>
                <th className="py-2 pr-4 font-medium">Sin entrega</th>
                <th className="py-2 font-medium">Consumo anormal</th>
              </tr>
            </thead>
```

(c) Reemplazar el `<tbody>...</tbody>` por (la celda "Sin entrega" pasa a `py-2 pr-4`; se agrega la celda de consumo, en ámbar y negrita solo si es > 0):

```tsx
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-linea/60">
                  <td className="py-2 pr-4 font-medium text-tinta">{f.nombre}</td>
                  <td className="py-2 pr-4 text-tinta">{f.usos}</td>
                  <td className={`py-2 pr-4 ${f.danos > 0 ? 'font-semibold text-[#C81E1E]' : 'text-tinta'}`}>{f.danos}</td>
                  <td className={`py-2 pr-4 ${f.sinEntrega > 0 ? 'font-semibold text-[#B45309]' : 'text-tinta'}`}>{f.sinEntrega}</td>
                  <td className={`py-2 ${f.consumoAnomalo > 0 ? 'font-semibold text-[#B45309]' : 'text-tinta'}`}>{f.consumoAnomalo}</td>
                </tr>
              ))}
            </tbody>
```

- [ ] **Step 4: Typecheck, lint y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint app components lib`
Expected: sin errores (3 warnings preexistentes de `set-state-in-effect` ajenos permitidos).

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 5: Verificación manual (checklist para el revisor humano)**

- En `/reportes`, la tabla "Responsabilidad por conductor" muestra la columna **"Consumo anormal"** al final.
- Un conductor con un uso que dispara la pill "Revisar consumo" en la bitácora aparece con ≥ 1 en esa columna (en ámbar/negrita).
- Un conductor sin anomalías (o vehículos sin rendimiento/capacidad configurados) muestra 0.

- [ ] **Step 6: Commit**

```bash
git add lib/data/usages.ts "app/(app)/reportes/page.tsx" components/reportes/ReporteConductores.tsx
git commit -m "feat(consumo): columna 'Consumo anormal' en el reporte por conductor"
```

---

## Notas de verificación final

Antes del merge: `npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (incluye los nuevos tests de `consumo.ts`; `rules.test.ts` requiere emulador y se salta en local). Recordar que merge a `master` **auto-despliega a producción**.
