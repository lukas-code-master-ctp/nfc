# Formato de fechas `dd/mm/aaaa` — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda fecha que ve una persona —cliente, administrador o carabinero— se muestra como `dd/mm/aaaa`, desde un único helper.

**Architecture:** Un módulo puro `lib/fecha.ts` con tres funciones y ningún estado. Se reemplazan los 13 puntos de la app que hoy formatean fechas por su cuenta, y un test de guardia impide que vuelvan a aparecer.

**Tech Stack:** TypeScript, `Intl.DateTimeFormat`, Vitest.

**Contexto:** Primer entregable de tres del spec [2026-08-06-pasarela-flow-design.md](../specs/2026-08-06-pasarela-flow-design.md) (§13). Va primero porque las pantallas nuevas de facturación muestran fechas y deben nacer usando el helper. Es autocontenido: no depende de los otros dos y se puede desplegar solo.

## Global Constraints

- Formato de fecha visible: **`dd/mm/aaaa`** con barras. Sin excepciones, incluidos los textos en prosa.
- Formato de hora visible: **24 horas**, `HH:mm`.
- Locale **`en-GB`** para formatear, no `es-CL`. `es-CL` produce `01-09-26` (guiones y año de dos dígitos).
- Zona horaria **`America/Santiago`** para todo instante.
- Una fecha calendario `YYYY-MM-DD` **nunca** se convierte a `Date`.
- Entrada nula, vacía o mal formada devuelve `''`, nunca lanza ni muestra `Invalid Date`.
- Los `toLocaleString('es-CL')` de **números** (kilometraje, montos) **no se tocan**.
- Todo el código, comentarios y UI en español neutro de Chile, tratando de "tú".
- Tras cambios: `npx tsc --noEmit`, `npm run build` y `npx eslint app components lib`.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `lib/fecha.ts` | **Nuevo.** Las tres funciones de formato. Único lugar del proyecto que sabe cómo se ve una fecha. |
| `lib/__tests__/fecha.test.ts` | **Nuevo.** Comportamiento de las tres funciones y sus bordes. |
| `lib/__tests__/fecha-guardia.test.ts` | **Nuevo.** Falla si alguien vuelve a formatear una fecha fuera de `lib/fecha.ts`. |
| 11 archivos de `app/` y `components/` | **Modificados.** Pasan a importar el helper. |
| `lib/admin/exportar.ts` | **Modificado.** Las cuatro columnas de fecha del CSV. |

---

### Task 1: El módulo `lib/fecha.ts`

**Files:**
- Create: `lib/fecha.ts`
- Test: `lib/__tests__/fecha.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `fechaCalendario(iso: string | null | undefined): string`, `fecha(iso: string | null | undefined): string`, `fechaHora(iso: string | null | undefined): string`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/__tests__/fecha.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fecha, fechaCalendario, fechaHora } from '@/lib/fecha'

describe('fechaCalendario', () => {
  it('reordena YYYY-MM-DD a dd/mm/aaaa', () => {
    expect(fechaCalendario('2026-09-01')).toBe('01/09/2026')
    expect(fechaCalendario('2026-12-31')).toBe('31/12/2026')
  })

  // El motivo de que no use `Date`: `new Date('2026-09-01')` es medianoche
  // UTC, y Chile va detrás de UTC, así que formatearlo en zona chilena
  // mostraría el 31/08. Este test es el que fija esa garantía.
  it('nunca corre el día hacia atrás', () => {
    expect(fechaCalendario('2026-01-01')).toBe('01/01/2026')
    expect(fechaCalendario('2026-03-01')).toBe('01/03/2026')
  })

  it('devuelve cadena vacía ante entrada inválida', () => {
    expect(fechaCalendario(null)).toBe('')
    expect(fechaCalendario(undefined)).toBe('')
    expect(fechaCalendario('')).toBe('')
    expect(fechaCalendario('2026-9-1')).toBe('')
    expect(fechaCalendario('mañana')).toBe('')
  })
})

describe('fecha', () => {
  it('formatea un instante en hora de Chile', () => {
    expect(fecha('2026-09-01T15:30:00Z')).toBe('01/09/2026')
  })

  // Chile va detrás de UTC: a las 23:30 UTC allá todavía es el día anterior.
  // Formatear en UTC mostraría el 02/09.
  it('respeta la zona horaria de Chile en el borde del día', () => {
    expect(fecha('2026-09-01T23:30:00Z')).toBe('01/09/2026')
  })

  it('devuelve cadena vacía ante entrada inválida', () => {
    expect(fecha(null)).toBe('')
    expect(fecha('')).toBe('')
    expect(fecha('no es una fecha')).toBe('')
  })
})

describe('fechaHora', () => {
  it('agrega la hora en 24 horas', () => {
    expect(fechaHora('2026-09-01T15:30:00Z')).toBe('01/09/2026 11:30')
  })

  // `hour12: false` produce '24:00' en algunas versiones de ICU. Este test es
  // el que obliga a usar `hourCycle: 'h23'`, y falla solo a medianoche —
  // o sea, en producción y de noche, si no estuviera.
  it('muestra la medianoche como 00:00 y no como 24:00', () => {
    expect(fechaHora('2026-09-01T04:00:00Z')).toBe('01/09/2026 00:00')
  })

  it('devuelve cadena vacía ante entrada inválida', () => {
    expect(fechaHora(null)).toBe('')
    expect(fechaHora('nada')).toBe('')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/__tests__/fecha.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/fecha"`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/fecha.ts`:

```ts
/**
 * El único lugar del proyecto que sabe cómo se ve una fecha.
 *
 * `es-CL` NO produce `dd/mm/aaaa`: con `dateStyle:'short'` da `01-09-26`
 * (guiones y año de dos dígitos) y sin opciones da `01-09-2026`. Se usa
 * `en-GB`, que garantiza `dd/mm/yyyy`, con el mismo criterio con que
 * `hoyEnChile` usa `en-CA` para obtener `YYYY-MM-DD`: el locale se elige por
 * el formato que garantiza, no por el país al que pertenece.
 */

const ZONA = 'America/Santiago'

// A nivel de módulo: construir un Intl.DateTimeFormat es caro y estos no
// dependen de nada. Son datos puros, así que no rompen el SSR.
const FMT_FECHA = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// `hourCycle: 'h23'` y NO `hour12: false`: este último produce '24:00' en
// algunas versiones de ICU, un bug que aparecería solo a medianoche.
const FMT_HORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `'2026-09-01'` → `'01/09/2026'`.
 *
 * **No usa `Date` a propósito.** `new Date('2026-09-01')` es medianoche UTC,
 * y como Chile va detrás de UTC, formatear eso en zona chilena muestra el día
 * ANTERIOR. Reordenando los tres números, ese bug no puede existir — y de
 * paso desaparece la necesidad de armar la fecha por componentes, que es lo
 * que hoy hacen `/facturacion` y `FranjaPrueba` para esquivarlo.
 */
export function fechaCalendario(iso: string | null | undefined): string {
  const m = CALENDARIO.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** `null` si la entrada no es un instante que se pueda formatear. */
function instante(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Instante ISO → `'01/09/2026'` en hora de Chile. */
export function fecha(iso: string | null | undefined): string {
  const d = instante(iso)
  return d ? FMT_FECHA.format(d) : ''
}

/** Instante ISO → `'01/09/2026 11:30'`, en 24 horas y hora de Chile. */
export function fechaHora(iso: string | null | undefined): string {
  const d = instante(iso)
  return d ? `${FMT_FECHA.format(d)} ${FMT_HORA.format(d)}` : ''
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/__tests__/fecha.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Verificar que los tests muerden**

Cambiar temporalmente `hourCycle: 'h23'` por `hour12: false` y correr el test. En un ICU donde el bug existe, falla el caso de medianoche. Después cambiar `fechaCalendario` para que use `new Date(iso)` y confirmar que falla "nunca corre el día hacia atrás". Revertir ambos cambios.

- [ ] **Step 6: Commit**

```bash
git add lib/fecha.ts lib/__tests__/fecha.test.ts && git commit -m "feat(fechas): un solo lugar que sabe como se ve una fecha"
```

---

### Task 2: Reemplazar los 13 puntos que formatean fechas

**Files:**
- Modify: `app/(app)/facturacion/page.tsx`, `app/(app)/vehiculos/[id]/page.tsx`
- Modify: `components/plan/FranjaPrueba.tsx`, `components/PublicVehicleView.tsx`, `components/DocumentList.tsx`, `components/VehicleCard.tsx`
- Modify: `components/reportes/BitacoraFlota.tsx`, `components/uso/UsoPanel.tsx`
- Modify: `components/vehicle/BitacoraUso.tsx`, `components/vehicle/DanoActivoPanel.tsx`, `components/vehicle/MantencionPanel.tsx`, `components/vehicle/TransferirVehiculoPanel.tsx`
- Modify: `lib/admin/exportar.ts`
- Test: `lib/__tests__/fecha-guardia.test.ts`

**Interfaces:**
- Consumes: `fechaCalendario`, `fecha`, `fechaHora` de `lib/fecha.ts` (Task 1).
- Produces: nada nuevo. Deja el proyecto con un solo formateador de fechas.

- [ ] **Step 1: Escribir el test de guardia que falla**

Crear `lib/__tests__/fecha-guardia.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Nada fuera de `lib/fecha.ts` puede formatear una fecha por su cuenta.
 *
 * Sin esta guardia, el próximo componente que muestre una fecha va a escribir
 * su propio `toLocaleDateString` —es lo que pasó trece veces— y vamos a
 * terminar otra vez con cinco formatos distintos conviviendo. El costo de
 * mantenerla es cero; el de descubrirlo es que un cliente vea `01-09-26`.
 */
const PROHIBIDO = /toLocaleDateString|toLocaleTimeString|dateStyle|timeStyle/

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p)
    return /\.tsx?$/.test(n) ? [p] : []
  })
}

describe('formato de fechas', () => {
  it('solo lib/fecha.ts sabe formatear fechas', () => {
    const infractores = ['app', 'components', 'lib']
      .flatMap((d) => archivos(d))
      .filter((p) => !p.endsWith(join('lib', 'fecha.ts')))
      .filter((p) => PROHIBIDO.test(readFileSync(p, 'utf8')))

    expect(infractores).toEqual([])
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/__tests__/fecha-guardia.test.ts`
Expected: FAIL — la lista de infractores trae los 11 archivos.

- [ ] **Step 3: Reemplazar los seis que muestran fecha y hora**

En `components/PublicVehicleView.tsx`, `components/reportes/BitacoraFlota.tsx`, `components/uso/UsoPanel.tsx`, `components/vehicle/BitacoraUso.tsx`, `components/vehicle/DanoActivoPanel.tsx` y `components/VehicleCard.tsx`, **borrar** la función local de formato, que en los seis es esta línea:

```ts
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
```

y reemplazar la función completa por el import:

```ts
import { fechaHora } from '@/lib/fecha'
```

Las funciones locales se llaman `fmt`, `fecha` o similar según el archivo: renombrar los usos a `fechaHora`. Estos seis mostraban `01-09-26, 11:30 a. m.` y pasan a `01/09/2026 11:30`.

- [ ] **Step 4: Reemplazar los que muestran solo la fecha**

`app/(app)/vehiculos/[id]/page.tsx` línea 124 — instante:

```tsx
<span className="text-xs"> · actualizado el {fecha(vehicle.kmActualizadoEn)}</span>
```

`components/vehicle/TransferirVehiculoPanel.tsx` línea 7 — instante. Borrar la función local y usar `fecha(...)`. **Gana el año**, que hoy no muestra.

`app/(app)/facturacion/page.tsx` líneas 24-36 y `components/plan/FranjaPrueba.tsx` líneas 12-19 — fecha calendario. **Borrar la función local `fechaCL` completa, incluido su comentario**: documentaba el bug de medianoche UTC, que con `fechaCalendario` ya no existe. Reemplazar sus usos por `fechaCalendario(...)`.

`components/vehicle/MantencionPanel.tsx` líneas 17-20 — borrar la función local `fecha`, que ya hace exactamente esto, e importar `fechaCalendario`. Renombrar sus usos.

- [ ] **Step 5: Arreglar las dos fechas crudas**

Estas dos no aparecían en el inventario original y son las peores: muestran `Vence el 2026-09-01`, y la segunda está **en la ficha pública que lee un carabinero**.

`components/DocumentList.tsx` línea 50:

```tsx
{d.fechaVencimiento ? `Vence el ${fechaCalendario(d.fechaVencimiento)}` : 'Sin vencimiento'}
```

`components/PublicVehicleView.tsx` línea 47: el mismo cambio.

- [ ] **Step 6: Las cuatro columnas de fecha del CSV**

En `lib/admin/exportar.ts`, borrar el helper local `soloFecha` (líneas 93-95) y usar el compartido. Las columnas "Fin de prueba", "Promoción hasta", "Fecha de alta" y "Última conexión" pasan a `dd/mm/aaaa`:

```ts
import { fecha, fechaCalendario } from '@/lib/fecha'
// …
    fechaCalendario(e.gratisHasta),      // Fin de prueba
    fechaCalendario(e.promo?.hasta),     // Promoción hasta
    fecha(e.createdAt),                  // Fecha de alta
    fecha(e.ultimaConexion),             // Última conexión
```

`fechaCalendario` para las dos primeras (son `YYYY-MM-DD`) y `fecha` para las dos últimas (son instantes ISO). En `dd/mm/aaaa` Excel las reconoce como fecha real y se pueden ordenar y filtrar, cosa que con `2026-09-01` no siempre hace.

- [ ] **Step 7: Actualizar los tests del CSV**

`lib/admin/__tests__/exportar.test.ts` afirma el formato de esas columnas. Actualizar los valores esperados a `dd/mm/aaaa`. **No cambiar nada más de ese archivo**: los tests de inyección de fórmulas y de separador siguen valiendo tal cual.

- [ ] **Step 8: Correr la suite completa**

Run: `npx vitest run`
Expected: PASS, incluido el test de guardia con lista vacía. Si algún test de componente afirmaba el formato viejo, actualizar el esperado — nunca relajar el test de guardia.

- [ ] **Step 9: Verificar tipos, build y lint**

```bash
npx tsc --noEmit && npm run build && npx eslint app components lib
```

- [ ] **Step 10: Verificar en el navegador**

Levantar el preview, abrir la ficha de un vehículo con bitácora y confirmar que las fechas se ven `01/09/2026 11:30`. Después abrir la ficha pública `/v/<token>` de ese vehículo y confirmar el "Vence el 01/09/2026". Son las dos pantallas donde el formato viejo era más visible.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "fix(fechas): toda fecha visible pasa a dd/mm/aaaa"
```

---

## Notas

**Fuera de alcance:** los `<input type="date">` de `DocumentForm` y `DocumentEditForm` — el navegador los dibuja en el locale del sistema operativo y no se pueden ni se deben formatear desde la app. Y `diasRestantes` en `TeamCard`, que calcula días y no muestra una fecha.
