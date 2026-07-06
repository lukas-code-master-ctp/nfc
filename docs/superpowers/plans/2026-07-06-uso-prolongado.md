# Aviso de uso prolongado en /flota — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar un aviso visual en `/flota` cuando un vehículo lleva más de N horas "en uso" sin entregarse, con N configurable por empresa (default 12h). Sin cron, sin alertas, sin email, sin auto-cierre.

**Architecture:** Cuatro cambios en capas: (1) lógica pura del cálculo + constante + validador; (2) persistencia del ajuste `avisoUsoHoras` en `companies/{id}` + endpoint; (3) UI de configuración (solo Administrador); (4) el badge en el panel `/flota`.

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript estricto, Firebase Admin SDK, Vitest 4, Tailwind v4.

## Global Constraints

- Idioma de todo el código/UI/copy: **español neutro (Chile)**, tratar de **"tú"**.
- **Firestore Admin rechaza `undefined`**: no escribir claves con valor `undefined` (omitir la clave).
- El endpoint privado valida `getMembership()` + `can(role, 'billing:manage')` antes de mutar; **nunca confiar en el cliente**.
- Colores por token existentes: el badge reutiliza el ámbar del badge "Sin entrega" actual → `bg-[#FDF1DC]` / `text-[#B45309]`.
- Umbral: default `DEFAULT_AVISO_USO_HORAS = 12`; mínimo **1**; límite **inclusivo** (`>=`).
- Antes de commitear cada task: `npx tsc --noEmit`, `npx vitest run <archivos de test tocados>` (si aplica), `npx eslint <archivos tocados>`, y en las tasks de UI/página también `npm run build`.

---

### Task 1: Lógica pura, constante y validador

**Files:**
- Modify: `lib/types.ts` (agregar campo opcional a `Company` + constante)
- Create: `lib/usages/prolongado.ts`
- Test: `lib/usages/__tests__/prolongado.test.ts`

**Interfaces:**
- Produces: `horasEnUso(tomadoEn: string, now: Date): number` — horas transcurridas (fraccional).
- Produces: `usoProlongado(tomadoEn: string, avisoUsoHoras: number, now: Date): boolean` — `horasEnUso >= avisoUsoHoras`.
- Produces: `parseAvisoUsoHoras(raw: unknown): number | 'invalid' | 'absent'` — `'absent'` si `undefined`/`null`; `'invalid'` si no es entero o `< 1`; el entero si es válido.
- Produces: `Company.avisoUsoHoras?: number` (campo opcional) y `DEFAULT_AVISO_USO_HORAS = 12` en `lib/types.ts` (consumidos por Tasks 2/3/4).

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/usages/__tests__/prolongado.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { horasEnUso, usoProlongado, parseAvisoUsoHoras } from '@/lib/usages/prolongado'

const now = new Date('2026-07-06T12:00:00.000Z')

describe('horasEnUso', () => {
  it('calcula las horas transcurridas', () => {
    expect(horasEnUso('2026-07-06T00:00:00.000Z', now)).toBe(12)
  })
})

describe('usoProlongado', () => {
  it('falso bajo el umbral', () => {
    expect(usoProlongado('2026-07-06T02:00:00.000Z', 12, now)).toBe(false) // 10h
  })
  it('verdadero justo en el umbral (inclusivo)', () => {
    expect(usoProlongado('2026-07-06T00:00:00.000Z', 12, now)).toBe(true) // 12h exactas
  })
  it('verdadero sobre el umbral', () => {
    expect(usoProlongado('2026-07-05T12:00:00.000Z', 12, now)).toBe(true) // 24h
  })
  it('usa el umbral recibido (config por empresa)', () => {
    expect(usoProlongado('2026-07-06T04:00:00.000Z', 6, now)).toBe(true) // 8h >= 6
    expect(usoProlongado('2026-07-06T04:00:00.000Z', 24, now)).toBe(false) // 8h < 24
  })
})

describe('parseAvisoUsoHoras', () => {
  it('acepta enteros >= 1', () => {
    expect(parseAvisoUsoHoras(8)).toBe(8)
    expect(parseAvisoUsoHoras('24')).toBe(24)
  })
  it('marca ausente cuando es undefined/null', () => {
    expect(parseAvisoUsoHoras(undefined)).toBe('absent')
    expect(parseAvisoUsoHoras(null)).toBe('absent')
  })
  it('marca inválido cuando es < 1 o no entero', () => {
    expect(parseAvisoUsoHoras(0)).toBe('invalid')
    expect(parseAvisoUsoHoras(-3)).toBe('invalid')
    expect(parseAvisoUsoHoras(2.5)).toBe('invalid')
    expect(parseAvisoUsoHoras('abc')).toBe('invalid')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/usages/__tests__/prolongado.test.ts`
Expected: FAIL — `@/lib/usages/prolongado` no existe todavía.

- [ ] **Step 3: Crear `lib/usages/prolongado.ts`**

```ts
// Lógica pura del aviso de "uso prolongado" (sin Firebase, testeable).

export function horasEnUso(tomadoEn: string, now: Date): number {
  return (now.getTime() - new Date(tomadoEn).getTime()) / 3_600_000
}

export function usoProlongado(tomadoEn: string, avisoUsoHoras: number, now: Date): boolean {
  return horasEnUso(tomadoEn, now) >= avisoUsoHoras
}

/**
 * Valida el `avisoUsoHoras` que llega en el body del PATCH de empresa.
 * `'absent'` = no vino (no tocar); `'invalid'` = no es entero o < 1 (400);
 * el número si es un entero >= 1.
 */
export function parseAvisoUsoHoras(raw: unknown): number | 'invalid' | 'absent' {
  if (raw === undefined || raw === null) return 'absent'
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return 'invalid'
  return n
}
```

- [ ] **Step 4: Agregar el campo y la constante en `lib/types.ts`**

En la interfaz `Company` (junto a `plan`), agregar el campo opcional:

```ts
export interface Company {
  id: string
  ownerUid: string // Administrador que la creó
  company: CompanyData
  plan: PlanData
  avisoUsoHoras?: number // horas antes de avisar "uso sin entregar" en /flota
  createdAt: string | null
}
```

Y justo después de `export const DEFAULT_PLAN: PlanData = { maxVehiculos: 3 }`, agregar:

```ts
/** Horas por default antes de avisar que un vehículo lleva mucho en uso sin entregar. */
export const DEFAULT_AVISO_USO_HORAS = 12
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run lib/usages/__tests__/prolongado.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Typecheck y lint**

Run: `npx tsc --noEmit && npx eslint lib/usages/prolongado.ts lib/usages/__tests__/prolongado.test.ts lib/types.ts`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/usages/prolongado.ts lib/usages/__tests__/prolongado.test.ts lib/types.ts
git commit -m "feat(usos): logica pura de uso prolongado + avisoUsoHoras en tipos"
```

---

### Task 2: Persistencia del ajuste + endpoint

**Files:**
- Modify: `lib/data/companies.ts` (`getCompany` lee, `saveCompany` persiste `avisoUsoHoras`)
- Modify: `app/api/company/route.ts` (acepta y valida `avisoUsoHoras`)

**Interfaces:**
- Consumes: `parseAvisoUsoHoras` (Task 1); `Company.avisoUsoHoras?` (Task 1).
- Produces: `getCompany` retorna `avisoUsoHoras` cuando el doc lo tiene; `saveCompany(companyId, { ..., avisoUsoHoras? })` lo persiste clampeado a `>= 1`; `PATCH /api/company` acepta `avisoUsoHoras` opcional en el body (400 `avisoUsoHoras inválido` si es inválido, ignora si ausente).

- [ ] **Step 1: `getCompany` devuelve `avisoUsoHoras`**

En `lib/data/companies.ts`, en el objeto que retorna `getCompany`, agregar la línea `avisoUsoHoras`:

```ts
  return {
    id: doc.id,
    ownerUid: d.ownerUid,
    company: { ...EMPTY_COMPANY, ...(d.company ?? {}) },
    plan: { ...DEFAULT_PLAN, ...(d.plan ?? {}) },
    avisoUsoHoras: d.avisoUsoHoras,
    createdAt: d.createdAt ?? null,
  }
```

(Si el doc no tiene el campo, `d.avisoUsoHoras` es `undefined` y el campo opcional queda sin valor; los consumidores aplican `?? DEFAULT_AVISO_USO_HORAS`.)

- [ ] **Step 2: `saveCompany` persiste `avisoUsoHoras`**

En `lib/data/companies.ts`, extender la firma y el cuerpo de `saveCompany`:

```ts
export async function saveCompany(
  companyId: string,
  patch: { company?: CompanyData; plan?: PlanData; avisoUsoHoras?: number },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.company !== undefined) data.company = patch.company
  if (patch.plan !== undefined) data.plan = { maxVehiculos: Math.max(1, Math.floor(patch.plan.maxVehiculos)) }
  if (patch.avisoUsoHoras !== undefined) data.avisoUsoHoras = Math.max(1, Math.floor(patch.avisoUsoHoras))
  await adminDb.collection(COL).doc(companyId).set(data, { merge: true })
}
```

- [ ] **Step 3: El endpoint acepta y valida `avisoUsoHoras`**

En `app/api/company/route.ts`, agregar el import y ajustar el `PATCH`:

```ts
import { parseAvisoUsoHoras } from '@/lib/usages/prolongado'
```

Dentro de `PATCH`, después de validar `body.company` y antes de `saveCompany`:

```ts
  const aviso = parseAvisoUsoHoras(body.avisoUsoHoras)
  if (aviso === 'invalid') {
    return NextResponse.json({ error: 'avisoUsoHoras inválido' }, { status: 400 })
  }

  await saveCompany(m.companyId, {
    company: sanitizeCompany(body.company),
    ...(aviso !== 'absent' ? { avisoUsoHoras: aviso } : {}),
  })
  return NextResponse.json({ ok: true })
```

(Reemplaza la llamada `await saveCompany(...)` + `return` actuales.)

- [ ] **Step 4: Typecheck, lint y build**

Run: `npx tsc --noEmit && npx eslint lib/data/companies.ts "app/api/company/route.ts" && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 5: Commit**

```bash
git add lib/data/companies.ts "app/api/company/route.ts"
git commit -m "feat(empresa): persistir y validar avisoUsoHoras en PATCH /api/company"
```

---

### Task 3: UI de configuración (solo Administrador)

**Files:**
- Modify: `components/company/CompanyCard.tsx` (nueva prop + campo numérico + enviarlo en el PATCH)
- Modify: `app/(app)/configuracion/page.tsx` (pasar la prop + línea de solo lectura para no-Administrador)

**Interfaces:**
- Consumes: `PATCH /api/company` con `{ company, avisoUsoHoras }` (Task 2); `DEFAULT_AVISO_USO_HORAS` (Task 1); `Company.avisoUsoHoras?` (Task 1).
- Produces: el Administrador puede ver/editar el umbral; los demás roles lo ven en solo lectura.

- [ ] **Step 1: `CompanyCard` recibe y edita el umbral**

En `components/company/CompanyCard.tsx`:

(a) Cambiar la firma del componente para recibir la prop:

```ts
export default function CompanyCard({ initial, avisoUsoHoras }: { initial: CompanyData; avisoUsoHoras: number }) {
```

(b) Agregar estado junto a los otros `useState`:

```ts
  const [horas, setHoras] = useState<number>(avisoUsoHoras)
```

(c) En `save`, incluir `avisoUsoHoras` en el body (clampeado a entero >= 1):

```ts
    body: JSON.stringify({ company, avisoUsoHoras: Math.max(1, Math.floor(Number(horas) || 12)) }),
```

(d) En el `<form>`, después del `.map(FIELDS...)` y antes del `<div className="flex items-center gap-3 pt-1">`, agregar el campo:

```tsx
        <div className="space-y-1.5">
          <label htmlFor="avisoUsoHoras" className="block text-sm font-medium text-acero">
            Avisar uso sin entregar (horas)
          </label>
          <input
            id="avisoUsoHoras"
            type="number"
            min={1}
            value={horas}
            onChange={(e) => setHoras(Number(e.target.value))}
            className="w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
          />
          <p className="text-xs text-acero">
            Un vehículo que lleve más de estas horas &quot;en uso&quot; sin entregar se marcará en Flota.
          </p>
        </div>
```

- [ ] **Step 2: La página de Configuración pasa la prop y muestra el valor a no-Administradores**

En `app/(app)/configuracion/page.tsx`:

(a) Agregar `DEFAULT_AVISO_USO_HORAS` al import de `@/lib/types`:

```ts
import { EMPTY_COMPANY, DEFAULT_AVISO_USO_HORAS } from '@/lib/types'
```

(b) Pasar la prop al `CompanyCard`:

```tsx
        <CompanyCard
          initial={company?.company ?? EMPTY_COMPANY}
          avisoUsoHoras={company?.avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS}
        />
```

(c) En el `<dl>` de solo lectura (rama no-Administrador), agregar una fila al final, después de la de "Teléfono":

```tsx
            <div className="flex justify-between gap-4">
              <dt className="text-acero">Aviso de uso sin entregar</dt>
              <dd className="font-medium text-tinta">{company?.avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS} horas</dd>
            </div>
```

- [ ] **Step 3: Typecheck, lint y build**

Run: `npx tsc --noEmit && npx eslint components/company/CompanyCard.tsx "app/(app)/configuracion/page.tsx" && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 4: Commit**

```bash
git add components/company/CompanyCard.tsx "app/(app)/configuracion/page.tsx"
git commit -m "feat(config): editar avisoUsoHoras en Configuracion (solo Administrador)"
```

---

### Task 4: El badge en /flota

**Files:**
- Modify: `app/(app)/flota/page.tsx` (cargar empresa + calcular prolongado por vehículo)
- Modify: `components/flota/FlotaGrid.tsx` (recibir y mostrar el badge)

**Interfaces:**
- Consumes: `usoProlongado`, `horasEnUso` (Task 1); `getCompany().avisoUsoHoras`, `DEFAULT_AVISO_USO_HORAS` (Tasks 1/2).
- Produces: cada card de vehículo en uso prolongado muestra un badge "Sin entregar hace Xh".

- [ ] **Step 1: `/flota` carga la empresa y calcula el flag por vehículo**

En `app/(app)/flota/page.tsx`:

(a) Agregar imports:

```ts
import { getCompany } from '@/lib/data/companies'
import { DEFAULT_AVISO_USO_HORAS } from '@/lib/types'
import { usoProlongado, horasEnUso } from '@/lib/usages/prolongado'
```

(b) Cambiar el `Promise.all` para traer también la empresa, y calcular el umbral y `now`:

```ts
  const [vehicles, alertas, company] = await Promise.all([
    listVehicles(m.companyId),
    listAlertas(m.companyId),
    getCompany(m.companyId),
  ])
  const avisoUsoHoras = company?.avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS
  const now = new Date()
```

(c) En el `.map((v) => ({...}))` que arma `vehiculos`, calcular `prolongado`/`horasUso` a partir del uso actual:

```ts
    .map((v) => {
      const uso = v.usoActual ?? null
      return {
        id: v.id,
        patente: v.patente,
        marca: v.marca,
        modelo: v.modelo,
        usoActual: uso,
        tiposAlerta: alertasPorVehiculo.get(v.id) ?? [],
        prolongado: uso ? usoProlongado(uso.tomadoEn, avisoUsoHoras, now) : false,
        horasUso: uso ? Math.floor(horasEnUso(uso.tomadoEn, now)) : 0,
      }
    })
```

- [ ] **Step 2: `FlotaGrid` muestra el badge**

En `components/flota/FlotaGrid.tsx`:

(a) Agregar los dos campos a la interfaz `VehiculoItem`:

```ts
interface VehiculoItem {
  id: string
  patente: string
  marca: string
  modelo: string
  usoActual: { driverNombre: string; tomadoEn: string } | null
  tiposAlerta: ('dano' | 'sin_entrega')[]
  prolongado: boolean
  horasUso: number
}
```

(b) En la línea de estado (el `<p className="mt-2 text-sm">`), agregar el badge inline dentro de la rama "En uso", después del texto "desde …":

```tsx
                <p className="mt-2 text-sm">
                  {v.usoActual ? (
                    <span className="text-tinta">
                      En uso por <span className="font-medium">{v.usoActual.driverNombre}</span> · desde {hora(v.usoActual.tomadoEn)}
                      {v.prolongado && (
                        <span className="ml-2 whitespace-nowrap rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">
                          Sin entregar hace {v.horasUso}h
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[#15803D]">Disponible</span>
                  )}
                </p>
```

- [ ] **Step 3: Typecheck, lint y build**

Run: `npx tsc --noEmit && npx eslint "app/(app)/flota/page.tsx" components/flota/FlotaGrid.tsx && npm run build`
Expected: sin errores; build compila.

- [ ] **Step 4: Suite completa para confirmar que nada se rompió**

Run: `npx vitest run lib/usages`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/flota/page.tsx" components/flota/FlotaGrid.tsx
git commit -m "feat(flota): badge de uso prolongado sin entregar"
```

---

## Notas de cierre (tras las 4 tasks)

- Actualizar `CLAUDE.md`: en la sección de flota/alertas y/o modelo de datos, dejar constancia de `avisoUsoHoras` (ajuste por empresa en `companies/{id}`, default `DEFAULT_AVISO_USO_HORAS = 12`, editable por el Administrador en Configuración) y del badge visual "Sin entregar hace Xh" en `/flota` (lógica pura en `lib/usages/prolongado.ts`; sin cron/alerta/email/auto-cierre).
- Este plan cierra la **brecha 2** del diseño de detección de entrega. La brecha 1 (entrega irregular) ya está en producción.
