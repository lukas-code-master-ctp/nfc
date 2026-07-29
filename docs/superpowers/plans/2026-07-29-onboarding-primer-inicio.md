# Onboarding en el primer inicio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un usuario nuevo elija entre cuenta personal o de empresa en su primer ingreso y reciba, según esa elección, un checklist guiado de configuración en el dashboard.

**Architecture:** Un campo `onboarding` en `companies/{id}` guarda el tipo de cuenta, los pasos informativos reconocidos y las marcas de completado/descartado. El progreso de cada paso **no se guarda**: se deriva de los datos reales (¿hay vehículos?, ¿hay conductores?, ¿está llena la razón social?) mediante una función pura con las señales inyectadas. Un `completadoEn` engancha el final para dejar de pagar las consultas una vez terminado.

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript estricto, Firestore vía Admin SDK, Tailwind v4, Vitest.

## Global Constraints

- Todo el código, UI, comentarios y mensajes en **español neutro (Chile)**, tratando de "tú".
- El tipo de cuenta **no cambia la app**: Configuración sigue mostrando equipo, conductores, categorías y mantención a todos. `tipoCuenta` solo decide qué pasos se enseñan.
- El onboarding lo ve **solo quien tiene rol Administrador** (`can(role, 'billing:manage')`). Editor y Visor nunca lo ven ni pueden mutarlo.
- El progreso de los pasos se **deriva de los datos**, nunca se guarda por paso. Las dos únicas excepciones son los pasos informativos `chip` y `reportes`, que se guardan en `onboarding.vistos`.
- **Cuenta personal: cero consultas extra.** Las tres consultas adicionales (`countMembers`, `countPendingInvitations`, `listActiveDrivers`) son solo de cuenta empresa y solo mientras el onboarding sigue vivo.
- Los endpoints privados llaman `getMembership()` + `can(role, action)` y **nunca** confían en el `companyId` del cliente.
- Firestore Admin **rechaza `undefined`**: construir objetos sin claves undefined o usar `?? null`.
- Next 16: `params` y `searchParams` son `Promise` y hay que await-earlos; `cookies()` también es async.
- Tras cambios de código: `npx tsc --noEmit`, `npm run build` y `npx eslint app components lib`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `lib/types.ts` (modificar) | `TipoCuenta`, `Onboarding`, y `onboarding?` en `Company`. |
| `lib/onboarding/pasos.ts` (crear) | **Lógica pura, sin Firebase.** Ids de pasos, señales, `pasosDe`, `todosListos`, y los dos predicados de visibilidad. |
| `lib/onboarding/__tests__/pasos.test.ts` (crear) | Tests de la lógica pura. |
| `lib/onboarding/cargar.ts` (crear) | Carga las señales que no están en el render del dashboard. Toca Firestore. |
| `lib/onboarding/__tests__/cargar.test.ts` (crear) | Verifica que cuenta personal no dispare consultas. |
| `lib/data/companies.ts` (modificar) | Mapear `onboarding` en `getCompany` + `saveOnboarding`. |
| `lib/data/__tests__/onboarding-datos.test.ts` (crear) | Tests de `saveOnboarding`. |
| `app/api/onboarding/route.ts` (crear) | `PATCH` con `{ tipoCuenta?, visto?, descartado? }`. |
| `app/api/__tests__/onboarding-endpoint.test.ts` (crear) | Roles, validación y patch vacío. |
| `app/bienvenida/page.tsx` (crear) | Pantalla de elección, fuera del grupo `(app)`. |
| `components/onboarding/ElegirTipo.tsx` (crear) | Las dos tarjetas de elección (client). |
| `components/onboarding/TarjetaProgreso.tsx` (crear) | La tarjeta de progreso del dashboard (client). |
| `components/__tests__/TarjetaProgreso.test.tsx` (crear) | Render y llamadas al endpoint. |
| `app/(app)/dashboard/page.tsx` (modificar) | Portero, carga de señales y enganche de `completadoEn`. |
| `components/VehiclesBoard.tsx` (modificar) | Recibe los pasos y monta la tarjeta. |
| `app/(app)/configuracion/page.tsx` (modificar) | Anclas `id` + bloque para recuperar la tarjeta oculta. |
| `components/onboarding/RecuperarGuia.tsx` (crear) | Botón "Volver a mostrarla" (client). |
| `CLAUDE.md` (modificar) | Documentar el feature. |

---

### Task 1: Tipos y lógica pura de los pasos

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/onboarding/pasos.ts`
- Test: `lib/onboarding/__tests__/pasos.test.ts`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `TipoCuenta`, `Onboarding` (en `lib/types.ts`); `PasoId`, `Paso`, `Senales`, `PASOS_INFORMATIVOS`, `esPasoInformativo(id: string): boolean`, `pasosDe(tipoCuenta: TipoCuenta, s: Senales): Paso[]`, `todosListos(pasos: Paso[]): boolean`, `debeElegirTipo(o: Onboarding | undefined, puedeConfigurar: boolean): boolean`, `debeMostrarTarjeta(o: Onboarding | undefined, puedeConfigurar: boolean): boolean` (en `lib/onboarding/pasos.ts`).

- [ ] **Step 1: Agregar los tipos**

En `lib/types.ts`, justo antes de `export interface Company` (que hoy está alrededor de la línea 172), agrega:

```ts
export type TipoCuenta = 'personal' | 'empresa'

/**
 * Estado del onboarding de la empresa.
 *
 * Vive en la empresa y no en el usuario a propósito: un invitado (Editor o
 * Visor) no tiene permisos para casi ningún paso, así que el onboarding lo ve
 * solo el Administrador. Si viviera en `users/{uid}`, cada miembro arrastraría
 * su propio estado de un proceso que no le corresponde ejecutar.
 *
 * `tipoCuenta` ausente = esta cuenta todavía no eligió (dispara /bienvenida).
 * Por eso no hace falta migración: las cuentas que ya existen caen ahí solas.
 */
export interface Onboarding {
  tipoCuenta: TipoCuenta
  /** Ids de los pasos informativos reconocidos con "Entendido". */
  vistos: string[]
  /** Se estampa cuando todos los pasos quedan listos. Ver "el enganche del final". */
  completadoEn?: string | null
  descartadoEn?: string | null
}
```

Y dentro de `export interface Company`, después de `pautaMantencion?: PautaMantencion`, agrega:

```ts
  onboarding?: Onboarding
```

- [ ] **Step 2: Escribir los tests que fallan**

Crea `lib/onboarding/__tests__/pasos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  pasosDe,
  todosListos,
  esPasoInformativo,
  debeElegirTipo,
  debeMostrarTarjeta,
  type Senales,
} from '@/lib/onboarding/pasos'

// Cuenta recién creada: nada hecho todavía.
const VACIAS: Senales = {
  vehiculos: 0,
  documentos: 0,
  primerVehiculoId: null,
  razonSocial: '',
  categorias: 0,
  pautaConfigurada: false,
  miembros: 1,
  invitacionesPendientes: 0,
  conductores: 0,
  vistos: [],
}

const con = (parcial: Partial<Senales>): Senales => ({ ...VACIAS, ...parcial })
const listo = (pasos: ReturnType<typeof pasosDe>, id: string) =>
  pasos.find((p) => p.id === id)!.listo

describe('pasosDe — cuántos pasos según el tipo de cuenta', () => {
  it('personal tiene 3 pasos', () => {
    const pasos = pasosDe('personal', VACIAS)
    expect(pasos.map((p) => p.id)).toEqual(['vehiculo', 'documentos', 'chip'])
  })

  it('empresa tiene 9 pasos y empieza por los mismos 3', () => {
    const pasos = pasosDe('empresa', VACIAS)
    expect(pasos.map((p) => p.id)).toEqual([
      'vehiculo', 'documentos', 'chip',
      'empresa', 'categorias', 'mantencion', 'equipo', 'conductores', 'reportes',
    ])
  })

  it('el vehículo va primero incluso en cuenta de empresa', () => {
    expect(pasosDe('empresa', VACIAS)[0].id).toBe('vehiculo')
  })
})

describe('pasosDe — cada señal marca su propio paso y ningún otro', () => {
  it('con las señales vacías no hay ningún paso listo', () => {
    expect(pasosDe('empresa', VACIAS).some((p) => p.listo)).toBe(false)
  })

  it('un vehículo marca solo "vehiculo"', () => {
    const pasos = pasosDe('empresa', con({ vehiculos: 1, primerVehiculoId: 'v1' }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['vehiculo'])
  })

  it('un documento marca solo "documentos"', () => {
    const pasos = pasosDe('empresa', con({ documentos: 2 }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['documentos'])
  })

  it('la razón social marca solo "empresa", y en blanco no cuenta', () => {
    expect(listo(pasosDe('empresa', con({ razonSocial: 'Transportes SpA' })), 'empresa')).toBe(true)
    expect(listo(pasosDe('empresa', con({ razonSocial: '   ' })), 'empresa')).toBe(false)
  })

  it('una categoría marca solo "categorias"', () => {
    const pasos = pasosDe('empresa', con({ categorias: 1 }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['categorias'])
  })

  it('la pauta marca solo "mantencion"', () => {
    const pasos = pasosDe('empresa', con({ pautaConfigurada: true }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['mantencion'])
  })

  it('un conductor marca solo "conductores"', () => {
    const pasos = pasosDe('empresa', con({ conductores: 1 }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['conductores'])
  })
})

describe('pasosDe — el paso de equipo acepta dos señales distintas', () => {
  it('estar solo no basta', () => {
    expect(listo(pasosDe('empresa', con({ miembros: 1 })), 'equipo')).toBe(false)
  })

  it('un segundo miembro lo marca', () => {
    expect(listo(pasosDe('empresa', con({ miembros: 2 })), 'equipo')).toBe(true)
  })

  it('una invitación pendiente también lo marca, aunque nadie la haya aceptado', () => {
    expect(listo(pasosDe('empresa', con({ invitacionesPendientes: 1 })), 'equipo')).toBe(true)
  })
})

describe('pasosDe — los pasos informativos dependen solo de "vistos"', () => {
  it('el chip se marca al reconocerlo, sin importar los datos', () => {
    expect(listo(pasosDe('personal', VACIAS), 'chip')).toBe(false)
    expect(listo(pasosDe('personal', con({ vistos: ['chip'] })), 'chip')).toBe(true)
  })

  it('reportes se marca al reconocerlo', () => {
    expect(listo(pasosDe('empresa', con({ vistos: ['reportes'] })), 'reportes')).toBe(true)
  })

  it('reconocer un paso no marca ningún otro', () => {
    const pasos = pasosDe('empresa', con({ vistos: ['chip'] }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['chip'])
  })

  it('esPasoInformativo solo acepta los dos conocidos', () => {
    expect(esPasoInformativo('chip')).toBe(true)
    expect(esPasoInformativo('reportes')).toBe(true)
    expect(esPasoInformativo('vehiculo')).toBe(false)
    expect(esPasoInformativo('cualquier-cosa')).toBe(false)
  })
})

describe('pasosDe — los enlaces a la ficha necesitan un vehículo', () => {
  it('con vehículo apuntan a su ficha, en la pestaña correcta', () => {
    const pasos = pasosDe('personal', con({ vehiculos: 1, primerVehiculoId: 'abc' }))
    expect(pasos.find((p) => p.id === 'documentos')!.href).toBe('/vehiculos/abc#documentos')
    expect(pasos.find((p) => p.id === 'chip')!.href).toBe('/vehiculos/abc#ajustes')
  })

  it('sin vehículo caen al dashboard, que es donde se agrega uno', () => {
    const pasos = pasosDe('personal', VACIAS)
    expect(pasos.find((p) => p.id === 'documentos')!.href).toBe('/dashboard')
    expect(pasos.find((p) => p.id === 'chip')!.href).toBe('/dashboard')
  })
})

describe('todosListos — es lo que dispara el enganche de completadoEn', () => {
  it('es falso mientras quede un paso pendiente', () => {
    expect(todosListos(pasosDe('personal', con({ vehiculos: 1, documentos: 1, primerVehiculoId: 'v1' })))).toBe(false)
  })

  it('es verdadero con todos los pasos de cuenta personal listos', () => {
    const pasos = pasosDe('personal', con({
      vehiculos: 1, documentos: 1, primerVehiculoId: 'v1', vistos: ['chip'],
    }))
    expect(todosListos(pasos)).toBe(true)
  })

  it('es verdadero con todos los pasos de cuenta empresa listos', () => {
    const pasos = pasosDe('empresa', con({
      vehiculos: 1, documentos: 1, primerVehiculoId: 'v1',
      razonSocial: 'Transportes SpA', categorias: 1, pautaConfigurada: true,
      miembros: 2, conductores: 1, vistos: ['chip', 'reportes'],
    }))
    expect(todosListos(pasos)).toBe(true)
  })
})

describe('debeElegirTipo — el portero', () => {
  it('sin onboarding y siendo Administrador, hay que elegir', () => {
    expect(debeElegirTipo(undefined, true)).toBe(true)
  })

  it('sin onboarding pero sin permisos (Editor o Visor), no se le pregunta', () => {
    expect(debeElegirTipo(undefined, false)).toBe(false)
  })

  it('con tipo ya elegido, no se vuelve a preguntar', () => {
    expect(debeElegirTipo({ tipoCuenta: 'personal', vistos: [] }, true)).toBe(false)
  })
})

describe('debeMostrarTarjeta — cuándo se renderiza el checklist', () => {
  it('con tipo elegido y sin terminar, se muestra', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [] }, true)).toBe(true)
  })

  it('no se muestra a quien no puede configurar', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [] }, false)).toBe(false)
  })

  it('no se muestra sin onboarding: primero hay que elegir tipo', () => {
    expect(debeMostrarTarjeta(undefined, true)).toBe(false)
  })

  it('no se muestra una vez completado', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [], completadoEn: '2026-07-29T00:00:00.000Z' }, true)).toBe(false)
  })

  it('no se muestra si se descartó a mano', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [], descartadoEn: '2026-07-29T00:00:00.000Z' }, true)).toBe(false)
  })

  it('descartadoEn en null significa que se volvió a mostrar', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [], descartadoEn: null }, true)).toBe(true)
  })
})
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/onboarding/__tests__/pasos.test.ts`
Expected: FAIL — no se puede resolver `@/lib/onboarding/pasos`.

- [ ] **Step 4: Escribir la implementación**

Crea `lib/onboarding/pasos.ts`:

```ts
import type { Onboarding, TipoCuenta } from '@/lib/types'

export type PasoId =
  | 'vehiculo'
  | 'documentos'
  | 'chip'
  | 'empresa'
  | 'categorias'
  | 'mantencion'
  | 'equipo'
  | 'conductores'
  | 'reportes'

/**
 * Pasos que no dejan rastro en los datos y por eso se marcan con "Entendido".
 * El `publicToken` se crea junto con el vehículo, así que la app no tiene forma
 * de saber si el chip llegó a grabarse; y "Dashboard vs Reportes" es una
 * explicación, no una configuración.
 */
export const PASOS_INFORMATIVOS: readonly PasoId[] = ['chip', 'reportes']

export function esPasoInformativo(id: string): boolean {
  return (PASOS_INFORMATIVOS as readonly string[]).includes(id)
}

/**
 * Todo lo que hace falta para saber qué pasos están listos. Van inyectadas
 * (y no consultadas acá) para que esta lógica se pruebe sin Firebase.
 */
export interface Senales {
  vehiculos: number
  documentos: number
  /** Para armar los enlaces a la ficha; null si todavía no hay ningún vehículo. */
  primerVehiculoId: string | null
  razonSocial: string
  categorias: number
  pautaConfigurada: boolean
  miembros: number
  invitacionesPendientes: number
  conductores: number
  vistos: string[]
}

export interface Paso {
  id: PasoId
  titulo: string
  detalle: string
  href: string
  listo: boolean
  informativo: boolean
}

/**
 * Devuelve los pasos del tipo de cuenta con su estado ya resuelto.
 *
 * El progreso se DERIVA de las señales y no se guarda por paso: así el
 * checklist no puede mentir, refleja lo que se hizo desde otro lugar de la app
 * (los formularios existían antes que el onboarding) y no se desincroniza si
 * alguien borra el dato.
 */
export function pasosDe(tipoCuenta: TipoCuenta, s: Senales): Paso[] {
  const visto = (id: PasoId) => s.vistos.includes(id)
  // Sin vehículo no hay ficha a la que ir: el dashboard es donde se agrega uno.
  const ficha = (hash: string) => (s.primerVehiculoId ? `/vehiculos/${s.primerVehiculoId}#${hash}` : '/dashboard')

  const comunes: Paso[] = [
    {
      id: 'vehiculo',
      titulo: 'Agrega tu primer vehículo',
      detalle: 'Con la patente, la marca y el modelo basta para partir.',
      href: '/dashboard',
      listo: s.vehiculos > 0,
      informativo: false,
    },
    {
      id: 'documentos',
      titulo: 'Sube sus documentos',
      detalle: 'Permiso de circulación, revisión técnica y SOAP. Te avisamos por correo antes de que venzan.',
      href: ficha('documentos'),
      listo: s.documentos > 0,
      informativo: false,
    },
    {
      id: 'chip',
      titulo: 'Vincula el chip NFC',
      detalle: 'Pégalo en el parabrisas: al acercarle un celular se abre la ficha del vehículo con sus documentos.',
      href: ficha('ajustes'),
      listo: visto('chip'),
      informativo: true,
    },
  ]

  if (tipoCuenta === 'personal') return comunes

  return [
    ...comunes,
    {
      id: 'empresa',
      titulo: 'Completa los datos de tu empresa',
      detalle: 'Razón social, RUT y giro. Los usamos para la facturación.',
      href: '/configuracion',
      listo: s.razonSocial.trim().length > 0,
      informativo: false,
    },
    {
      id: 'categorias',
      titulo: 'Crea tus categorías',
      detalle: 'Agrupa la flota como la piensas tú: camionetas, arriendo, reparto.',
      href: '/configuracion#categorias',
      listo: s.categorias > 0,
      informativo: false,
    },
    {
      id: 'mantencion',
      titulo: 'Define la pauta de mantención',
      detalle: 'Cada cuántos kilómetros o meses toca mantención. En esa misma página ajustas el aviso de uso prolongado.',
      href: '/configuracion#mantencion',
      listo: s.pautaConfigurada,
      informativo: false,
    },
    {
      id: 'equipo',
      titulo: 'Suma a tu equipo',
      detalle: 'Invita por correo con rol de Administrador, Editor o Visor. Hasta 5 miembros.',
      href: '/configuracion#equipo',
      listo: s.miembros >= 2 || s.invitacionesPendientes > 0,
      informativo: false,
    },
    {
      id: 'conductores',
      titulo: 'Registra a tus conductores',
      detalle: 'No necesitan cuenta: entran con un PIN de 4 dígitos para tomar y entregar vehículos.',
      href: '/configuracion#conductores',
      listo: s.conductores > 0,
      informativo: false,
    },
    {
      id: 'reportes',
      titulo: 'Dashboard y Reportes: en qué se diferencian',
      detalle: 'El Dashboard es el estado de hoy: qué vence, qué está en uso, qué tiene daño. Reportes es el historial: quién usó cada vehículo y con qué resultado.',
      href: '/reportes',
      listo: visto('reportes'),
      informativo: true,
    },
  ]
}

export function todosListos(pasos: Paso[]): boolean {
  return pasos.every((p) => p.listo)
}

/** ¿Hay que mandarlo a /bienvenida a elegir tipo de cuenta? */
export function debeElegirTipo(o: Onboarding | undefined, puedeConfigurar: boolean): boolean {
  return puedeConfigurar && !o?.tipoCuenta
}

/** ¿Se renderiza la tarjeta de progreso en el dashboard? */
export function debeMostrarTarjeta(o: Onboarding | undefined, puedeConfigurar: boolean): boolean {
  if (!puedeConfigurar || !o?.tipoCuenta) return false
  return !o.completadoEn && !o.descartadoEn
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/onboarding/__tests__/pasos.test.ts`
Expected: PASS, 31 tests.

- [ ] **Step 6: Typecheck y commit**

```bash
npx tsc --noEmit
git add lib/types.ts lib/onboarding/pasos.ts lib/onboarding/__tests__/pasos.test.ts
git commit -m "feat(onboarding): tipos y logica pura de los pasos"
```

---

### Task 2: Capa de datos

**Files:**
- Modify: `lib/data/companies.ts`
- Test: `lib/data/__tests__/onboarding-datos.test.ts`

**Interfaces:**
- Consumes: `Onboarding`, `TipoCuenta` de `lib/types.ts` (Task 1).
- Produces: `saveOnboarding(companyId: string, patch: { tipoCuenta?: TipoCuenta; agregarVisto?: string; descartadoEn?: string | null; completadoEn?: string | null }): Promise<void>` y el campo `onboarding` mapeado en `getCompany`.

- [ ] **Step 1: Escribir el test que falla**

Crea `lib/data/__tests__/onboarding-datos.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const set = vi.fn(() => Promise.resolve())
  const doc = vi.fn(() => ({ set }))
  const collection = vi.fn(() => ({ doc }))
  return { set, doc, collection, arrayUnion: vi.fn((v: string) => ({ __arrayUnion: v })) }
})

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: mocks.collection } }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { arrayUnion: mocks.arrayUnion } }))
// companies.ts importa invitations.ts (para ensureProvisioned); lo mockeamos
// para que cargar el módulo no arrastre esa cadena.
vi.mock('@/lib/data/invitations', () => ({
  findPendingInvitationByEmail: vi.fn(),
  markInvitationAccepted: vi.fn(),
}))

const { saveOnboarding } = await import('@/lib/data/companies')

beforeEach(() => {
  mocks.set.mockClear()
  mocks.doc.mockClear()
  mocks.collection.mockClear()
  mocks.arrayUnion.mockClear()
})

describe('saveOnboarding', () => {
  it('escribe el tipo de cuenta anidado bajo "onboarding", con merge', () => {
    return saveOnboarding('c1', { tipoCuenta: 'empresa' }).then(() => {
      expect(mocks.collection).toHaveBeenCalledWith('companies')
      expect(mocks.doc).toHaveBeenCalledWith('c1')
      const [data, opts] = mocks.set.mock.calls[0]
      expect(data).toEqual({ onboarding: { tipoCuenta: 'empresa', completadoEn: null } })
      expect(opts).toEqual({ merge: true })
    })
  })

  it('elegir tipo limpia completadoEn, porque cambiar de personal a empresa suma pasos', async () => {
    await saveOnboarding('c1', { tipoCuenta: 'empresa' })
    const [data] = mocks.set.mock.calls[0] as [{ onboarding: Record<string, unknown> }]
    expect(data.onboarding.completadoEn).toBeNull()
  })

  it('agrega un visto con arrayUnion, para no pisar los que ya estaban', async () => {
    await saveOnboarding('c1', { agregarVisto: 'chip' })
    expect(mocks.arrayUnion).toHaveBeenCalledWith('chip')
    const [data] = mocks.set.mock.calls[0] as [{ onboarding: Record<string, unknown> }]
    expect(data.onboarding.vistos).toEqual({ __arrayUnion: 'chip' })
  })

  it('acepta null explícito para volver a mostrar la tarjeta', async () => {
    await saveOnboarding('c1', { descartadoEn: null })
    const [data] = mocks.set.mock.calls[0] as [{ onboarding: Record<string, unknown> }]
    expect(data.onboarding).toEqual({ descartadoEn: null })
  })

  it('no escribe nada con un patch vacío', async () => {
    await saveOnboarding('c1', {})
    expect(mocks.set).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/data/__tests__/onboarding-datos.test.ts`
Expected: FAIL — `saveOnboarding` no está exportada.

- [ ] **Step 3: Implementar**

En `lib/data/companies.ts`, agrega el import de `FieldValue` arriba (junto a los demás imports) y suma `Onboarding` y `TipoCuenta` a los tipos importados de `@/lib/types`:

```ts
import { FieldValue } from 'firebase-admin/firestore'
```

En `getCompany`, dentro del objeto que retorna, después de `pautaMantencion: d.pautaMantencion ?? undefined,` agrega:

```ts
    onboarding: d.onboarding ?? undefined,
```

Y al final del archivo, después de `saveCompany`, agrega:

```ts
/**
 * Actualiza el onboarding de la empresa. Solo un Administrador llega acá
 * (validado en la capa /api).
 *
 * Escribe con `set(..., { merge: true })` sobre el mapa `onboarding` para no
 * pisar los campos que no vienen en el patch, y usa `arrayUnion` para `vistos`
 * en vez de leer-modificar-escribir.
 */
export async function saveOnboarding(
  companyId: string,
  patch: {
    tipoCuenta?: TipoCuenta
    agregarVisto?: string
    descartadoEn?: string | null
    completadoEn?: string | null
  },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.tipoCuenta !== undefined) {
    data.tipoCuenta = patch.tipoCuenta
    // Elegir (o cambiar) el tipo reabre la evaluación: pasar de personal a
    // empresa suma seis pasos, y dejarlo marcado como completo los ocultaría.
    data.completadoEn = null
  }
  if (patch.agregarVisto !== undefined) data.vistos = FieldValue.arrayUnion(patch.agregarVisto)
  if (patch.descartadoEn !== undefined) data.descartadoEn = patch.descartadoEn
  if (patch.completadoEn !== undefined) data.completadoEn = patch.completadoEn
  if (Object.keys(data).length === 0) return
  await adminDb.collection(COL).doc(companyId).set({ onboarding: data }, { merge: true })
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/data/__tests__/onboarding-datos.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck y commit**

```bash
npx tsc --noEmit
git add lib/data/companies.ts lib/data/__tests__/onboarding-datos.test.ts
git commit -m "feat(onboarding): saveOnboarding y mapeo en getCompany"
```

---

### Task 3: Endpoint PATCH /api/onboarding

**Files:**
- Create: `app/api/onboarding/route.ts`
- Test: `app/api/__tests__/onboarding-endpoint.test.ts`

**Interfaces:**
- Consumes: `saveOnboarding` (Task 2), `esPasoInformativo` (Task 1).
- Produces: `PATCH /api/onboarding` que acepta `{ tipoCuenta?: 'personal' | 'empresa', visto?: string, descartado?: boolean }`.

- [ ] **Step 1: Escribir el test que falla**

Crea `app/api/__tests__/onboarding-endpoint.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  can: vi.fn(() => true),
  saveOnboarding: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/auth/roles', () => ({ can: mocks.can }))
vi.mock('@/lib/data/companies', () => ({ saveOnboarding: mocks.saveOnboarding }))

const { PATCH } = await import('@/app/api/onboarding/route')

function req(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.can.mockReturnValue(true)
  mocks.saveOnboarding.mockResolvedValue(undefined)
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
})

describe('permisos', () => {
  it('401 sin sesión', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await PATCH(req({ tipoCuenta: 'personal' }))
    expect(res.status).toBe(401)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })

  it('403 a quien no puede configurar la empresa (Editor o Visor)', async () => {
    mocks.can.mockReturnValue(false)
    const res = await PATCH(req({ tipoCuenta: 'personal' }))
    expect(res.status).toBe(403)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })

  it('usa el companyId de la sesión y nunca el del cliente', async () => {
    await PATCH(req({ tipoCuenta: 'empresa', companyId: 'otra-empresa' }))
    expect(mocks.saveOnboarding).toHaveBeenCalledWith('c1', { tipoCuenta: 'empresa' })
  })
})

describe('tipoCuenta', () => {
  it('acepta personal y empresa', async () => {
    expect((await PATCH(req({ tipoCuenta: 'personal' }))).status).toBe(200)
    expect((await PATCH(req({ tipoCuenta: 'empresa' }))).status).toBe(200)
  })

  it('400 con un valor desconocido', async () => {
    const res = await PATCH(req({ tipoCuenta: 'freelance' }))
    expect(res.status).toBe(400)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })
})

describe('visto', () => {
  it('acepta los pasos informativos', async () => {
    await PATCH(req({ visto: 'chip' }))
    expect(mocks.saveOnboarding).toHaveBeenCalledWith('c1', { agregarVisto: 'chip' })
  })

  it('400 con un paso que no es informativo, para no inflar el arreglo con basura', async () => {
    const res = await PATCH(req({ visto: 'vehiculo' }))
    expect(res.status).toBe(400)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })

  it('400 con un paso inventado', async () => {
    expect((await PATCH(req({ visto: 'lo-que-sea' }))).status).toBe(400)
  })
})

describe('descartado', () => {
  it('true estampa una fecha', async () => {
    await PATCH(req({ descartado: true }))
    const patch = mocks.saveOnboarding.mock.calls[0][1] as { descartadoEn: string | null }
    expect(typeof patch.descartadoEn).toBe('string')
  })

  it('false lo limpia, para volver a mostrar la tarjeta', async () => {
    await PATCH(req({ descartado: false }))
    expect(mocks.saveOnboarding).toHaveBeenCalledWith('c1', { descartadoEn: null })
  })

  it('400 si no es booleano', async () => {
    expect((await PATCH(req({ descartado: 'si' }))).status).toBe(400)
  })
})

describe('patch vacío', () => {
  it('400 si no viene ningún campo válido', async () => {
    const res = await PATCH(req({}))
    expect(res.status).toBe(400)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run app/api/__tests__/onboarding-endpoint.test.ts`
Expected: FAIL — no se puede resolver `@/app/api/onboarding/route`.

- [ ] **Step 3: Implementar**

Crea `app/api/onboarding/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { saveOnboarding } from '@/lib/data/companies'
import { esPasoInformativo } from '@/lib/onboarding/pasos'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const patch: Parameters<typeof saveOnboarding>[1] = {}

  if (body.tipoCuenta !== undefined) {
    if (body.tipoCuenta !== 'personal' && body.tipoCuenta !== 'empresa') {
      return NextResponse.json({ error: 'tipoCuenta inválido' }, { status: 400 })
    }
    patch.tipoCuenta = body.tipoCuenta
  }

  if (body.visto !== undefined) {
    // Solo los pasos informativos se guardan; el resto se deriva de los datos.
    if (typeof body.visto !== 'string' || !esPasoInformativo(body.visto)) {
      return NextResponse.json({ error: 'paso desconocido' }, { status: 400 })
    }
    patch.agregarVisto = body.visto
  }

  if (body.descartado !== undefined) {
    if (typeof body.descartado !== 'boolean') {
      return NextResponse.json({ error: 'descartado inválido' }, { status: 400 })
    }
    patch.descartadoEn = body.descartado ? new Date().toISOString() : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 })
  }

  await saveOnboarding(m.companyId, patch)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run app/api/__tests__/onboarding-endpoint.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck y commit**

```bash
npx tsc --noEmit
git add app/api/onboarding app/api/__tests__/onboarding-endpoint.test.ts
git commit -m "feat(onboarding): endpoint PATCH /api/onboarding"
```

---

### Task 4: Pantalla de elección /bienvenida

**Files:**
- Create: `app/bienvenida/page.tsx`
- Create: `components/onboarding/ElegirTipo.tsx`

**Interfaces:**
- Consumes: `debeElegirTipo` (Task 1), `getCompany` (existente), `PATCH /api/onboarding` (Task 3).
- Produces: la ruta `/bienvenida`.

**Contexto:** va **fuera** del grupo `(app)` a propósito. `app/(app)/layout.tsx` monta la barra de navegación y el menú de usuario, que acá estorban; y si la página viviera dentro del grupo, el dashboard que redirige hacia ella podría redirigirse a sí mismo. Los tokens de color (`tinta`, `acero`, `linea`, `lienzo`, `superficie`, `azul`) vienen de `app/globals.css`.

- [ ] **Step 1: Crear el componente cliente de elección**

Crea `components/onboarding/ElegirTipo.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TipoCuenta } from '@/lib/types'

function AutoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
    </svg>
  )
}

function FlotaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="9" height="6" rx="1.5" />
      <rect x="13" y="6" width="9" height="6" rx="1.5" />
      <rect x="2" y="15" width="9" height="6" rx="1.5" />
      <rect x="13" y="15" width="9" height="6" rx="1.5" />
    </svg>
  )
}

export default function ElegirTipo() {
  const router = useRouter()
  const [guardando, setGuardando] = useState<TipoCuenta | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function elegir(tipoCuenta: TipoCuenta) {
    setGuardando(tipoCuenta)
    setError(null)
    const res = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoCuenta }),
    })
    if (!res.ok) {
      setGuardando(null)
      setError('No se pudo guardar. Inténtalo de nuevo.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  const opcion = (
    tipo: TipoCuenta,
    Icono: (p: { className?: string }) => React.ReactElement,
    titulo: string,
    detalle: string,
  ) => (
    <button
      type="button"
      onClick={() => elegir(tipo)}
      disabled={guardando !== null}
      className="flex w-full items-start gap-4 rounded-2xl border border-linea bg-superficie p-5 text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
        <Icono className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-tinta">{titulo}</span>
        <span className="mt-1 block text-sm text-acero">{detalle}</span>
        {guardando === tipo && <span className="mt-2 block text-sm text-azul">Preparando tu cuenta…</span>}
      </span>
    </button>
  )

  return (
    <div className="space-y-3">
      {opcion('personal', AutoIcon, 'Un vehículo particular', 'Guarda tus documentos y recibe avisos antes de que venzan.')}
      {opcion('empresa', FlotaIcon, 'Una flota de la empresa', 'Además: equipo, conductores con PIN, bitácora de uso y pauta de mantención.')}
      {error && <p className="text-sm text-vencido">{error}</p>}
      <p className="text-center text-sm text-acero">Puedes cambiarlo después.</p>
    </div>
  )
}
```

- [ ] **Step 2: Crear la página**

Crea `app/bienvenida/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { debeElegirTipo } from '@/lib/onboarding/pasos'
import ElegirTipo from '@/components/onboarding/ElegirTipo'
import { TapCarIsotipo, TapCarWordmark } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

export default async function BienvenidaPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  // Quien ya eligió (o no le corresponde elegir, como un Editor invitado) no
  // tiene nada que hacer acá. Sin esta guarda la página sería un callejón.
  const company = await getCompany(m.companyId)
  if (!debeElegirTipo(company?.onboarding, can(m.role, 'billing:manage'))) redirect('/dashboard')

  return (
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <TapCarIsotipo className="mx-auto mb-2 size-14" />
          <TapCarWordmark className="text-3xl" />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-tinta">¿Cómo vas a usar TapCar?</h1>
          <p className="mt-1 text-sm text-acero">Con esto armamos tu guía de configuración.</p>
        </div>
        <ElegirTipo />
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verificar que compila y que la suite sigue verde**

```bash
npx tsc --noEmit
npx eslint app components lib
npm test
```
Expected: sin errores; la suite completa pasa.

- [ ] **Step 4: Commit**

```bash
git add app/bienvenida components/onboarding/ElegirTipo.tsx
git commit -m "feat(onboarding): pantalla de eleccion /bienvenida"
```

---

### Task 5: La tarjeta de progreso

**Files:**
- Create: `components/onboarding/TarjetaProgreso.tsx`
- Test: `components/__tests__/TarjetaProgreso.test.tsx`

**Interfaces:**
- Consumes: `Paso`, `TipoCuenta` (Task 1), `PATCH /api/onboarding` (Task 3).
- Produces: `<TarjetaProgreso pasos={Paso[]} tipoCuenta={TipoCuenta} />`.

**Contexto de tests:** el proyecto usa Vitest con jsdom y `@testing-library/react` con `fireEvent` (no hay `@testing-library/user-event` instalado). Mira `components/__tests__/DocumentForm.test.tsx` como referencia del setup.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `components/__tests__/TarjetaProgreso.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TarjetaProgreso from '@/components/onboarding/TarjetaProgreso'
import type { Paso } from '@/lib/onboarding/pasos'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const paso = (over: Partial<Paso> & Pick<Paso, 'id'>): Paso => ({
  titulo: `Título ${over.id}`,
  detalle: 'Detalle',
  href: '/dashboard',
  listo: false,
  informativo: false,
  ...over,
})

const PASOS: Paso[] = [
  paso({ id: 'vehiculo', listo: true }),
  paso({ id: 'documentos' }),
  paso({ id: 'chip', informativo: true }),
]

beforeEach(() => {
  refresh.mockClear()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
})

describe('render', () => {
  it('muestra cuántos pasos van de cuántos', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    expect(screen.getByText('1 de 3')).toBeTruthy()
  })

  it('lista todos los pasos por su título', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    for (const p of PASOS) expect(screen.getByText(p.titulo)).toBeTruthy()
  })

  it('el paso pendiente enlaza a su destino', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    const enlace = screen.getByRole('link', { name: /Título documentos/ })
    expect(enlace.getAttribute('href')).toBe('/dashboard')
  })

  it('un paso informativo pendiente ofrece "Entendido"', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    expect(screen.getAllByRole('button', { name: 'Entendido' })).toHaveLength(1)
  })

  it('un paso informativo ya reconocido no lo ofrece', () => {
    const listos = PASOS.map((p) => (p.id === 'chip' ? { ...p, listo: true } : p))
    render(<TarjetaProgreso pasos={listos} tipoCuenta="personal" />)
    expect(screen.queryByRole('button', { name: 'Entendido' })).toBeNull()
  })

  it('un paso pendiente que NO es informativo tampoco lo ofrece', () => {
    render(<TarjetaProgreso pasos={[paso({ id: 'documentos' })]} tipoCuenta="personal" />)
    expect(screen.queryByRole('button', { name: 'Entendido' })).toBeNull()
  })
})

describe('acciones', () => {
  it('"Entendido" marca ese paso como visto', async () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ visto: 'chip' }),
      }))
    })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('"Ocultar" descarta la tarjeta', async () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({
        body: JSON.stringify({ descartado: true }),
      }))
    })
  })

  it('en cuenta personal ofrece cambiar a flota, y eso cambia el tipo', async () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="personal" />)
    fireEvent.click(screen.getByRole('button', { name: /administro una flota/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({
        body: JSON.stringify({ tipoCuenta: 'empresa' }),
      }))
    })
  })

  it('en cuenta de empresa no ofrece cambiar a flota: ya lo es', () => {
    render(<TarjetaProgreso pasos={PASOS} tipoCuenta="empresa" />)
    expect(screen.queryByRole('button', { name: /administro una flota/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run components/__tests__/TarjetaProgreso.test.tsx`
Expected: FAIL — no se puede resolver `@/components/onboarding/TarjetaProgreso`.

- [ ] **Step 3: Implementar**

Crea `components/onboarding/TarjetaProgreso.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Paso } from '@/lib/onboarding/pasos'
import type { TipoCuenta } from '@/lib/types'

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export default function TarjetaProgreso({ pasos, tipoCuenta }: { pasos: Paso[]; tipoCuenta: TipoCuenta }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const hechos = pasos.filter((p) => p.listo).length

  async function patch(body: Record<string, unknown>) {
    setOcupado(true)
    const res = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setOcupado(false)
    if (res.ok) router.refresh()
  }

  return (
    <section className="mb-6 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-tinta">Configura tu cuenta</h2>
          <p className="mt-0.5 text-sm text-acero">
            <span className="font-medium text-tinta">{hechos} de {pasos.length}</span> · Puedes hacerlo cuando quieras.
          </p>
        </div>
        <button
          type="button"
          onClick={() => patch({ descartado: true })}
          disabled={ocupado}
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-acero hover:bg-lienzo disabled:opacity-60"
        >
          Ocultar
        </button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-lienzo" aria-hidden="true">
        <div className="h-full rounded-full bg-azul transition-all" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
      </div>

      <ul className="mt-4 space-y-1">
        {pasos.map((p) => (
          <li key={p.id} className="flex items-start gap-3 rounded-xl px-2 py-2">
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                p.listo ? 'border-vigente bg-vigente text-white' : 'border-linea text-transparent'
              }`}
              aria-hidden="true"
            >
              <CheckIcon className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              {p.listo ? (
                <p className="text-sm font-medium text-acero line-through">{p.titulo}</p>
              ) : (
                <>
                  <Link href={p.href} className="text-sm font-medium text-azul hover:underline">
                    {p.titulo}
                  </Link>
                  <p className="mt-0.5 text-sm text-acero">{p.detalle}</p>
                  {p.informativo && (
                    <button
                      type="button"
                      onClick={() => patch({ visto: p.id })}
                      disabled={ocupado}
                      className="mt-1.5 rounded-lg border border-linea px-2.5 py-1 text-xs font-medium text-acero hover:bg-lienzo disabled:opacity-60"
                    >
                      Entendido
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {tipoCuenta === 'personal' && (
        <button
          type="button"
          onClick={() => patch({ tipoCuenta: 'empresa' })}
          disabled={ocupado}
          className="mt-3 text-sm text-acero underline hover:text-tinta disabled:opacity-60"
        >
          En realidad administro una flota
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run components/__tests__/TarjetaProgreso.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck y commit**

```bash
npx tsc --noEmit
git add components/onboarding/TarjetaProgreso.tsx components/__tests__/TarjetaProgreso.test.tsx
git commit -m "feat(onboarding): tarjeta de progreso del dashboard"
```

---

### Task 6: Cablear el dashboard

**Files:**
- Create: `lib/onboarding/cargar.ts`
- Test: `lib/onboarding/__tests__/cargar.test.ts`
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `components/VehiclesBoard.tsx`

**Interfaces:**
- Consumes: `debeElegirTipo`, `debeMostrarTarjeta`, `pasosDe`, `todosListos`, `Senales`, `Paso` (Task 1); `saveOnboarding` (Task 2); `TarjetaProgreso` (Task 5); `countMembers` de `@/lib/data/members`, `countPendingInvitations` de `@/lib/data/invitations`, `listActiveDrivers` de `@/lib/data/drivers` (existentes).
- Produces: `cargarSenales(args): Promise<Senales>`; la prop `onboarding` de `VehiclesBoard`.

- [ ] **Step 1: Escribir el test que falla**

Crea `lib/onboarding/__tests__/cargar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Company } from '@/lib/types'

const mocks = vi.hoisted(() => ({
  countMembers: vi.fn(() => Promise.resolve(3)),
  countPendingInvitations: vi.fn(() => Promise.resolve(1)),
  listActiveDrivers: vi.fn(() => Promise.resolve([{ id: 'd1', nombre: 'Ana' }])),
}))

vi.mock('@/lib/data/members', () => ({ countMembers: mocks.countMembers }))
vi.mock('@/lib/data/invitations', () => ({ countPendingInvitations: mocks.countPendingInvitations }))
vi.mock('@/lib/data/drivers', () => ({ listActiveDrivers: mocks.listActiveDrivers }))

const { cargarSenales } = await import('@/lib/onboarding/cargar')

const COMPANY = {
  id: 'c1',
  ownerUid: 'u1',
  company: { razonSocial: 'Transportes SpA', rut: '', giro: '', direccion: '', telefono: '' },
  plan: { maxVehiculos: 3 },
  categorias: [{ id: 'a', nombre: 'Camionetas' }],
  pautaMantencion: { cadaKm: 10000, cadaMeses: null },
  createdAt: null,
} as Company

const base = {
  companyId: 'c1',
  company: COMPANY,
  vehiculos: 2,
  documentos: 5,
  primerVehiculoId: 'v1',
  vistos: ['chip'],
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockClear()
})

describe('cuenta personal: cero consultas extra', () => {
  it('no consulta miembros, invitaciones ni conductores', async () => {
    await cargarSenales({ ...base, tipoCuenta: 'personal' })
    expect(mocks.countMembers).not.toHaveBeenCalled()
    expect(mocks.countPendingInvitations).not.toHaveBeenCalled()
    expect(mocks.listActiveDrivers).not.toHaveBeenCalled()
  })

  it('igual devuelve las señales que sí sirven en cuenta personal', async () => {
    const s = await cargarSenales({ ...base, tipoCuenta: 'personal' })
    expect(s.vehiculos).toBe(2)
    expect(s.documentos).toBe(5)
    expect(s.primerVehiculoId).toBe('v1')
    expect(s.vistos).toEqual(['chip'])
  })
})

describe('cuenta empresa: consulta lo que no está en el render', () => {
  it('consulta las tres, con el companyId de la sesión', async () => {
    await cargarSenales({ ...base, tipoCuenta: 'empresa' })
    expect(mocks.countMembers).toHaveBeenCalledWith('c1')
    expect(mocks.countPendingInvitations).toHaveBeenCalledWith('c1')
    expect(mocks.listActiveDrivers).toHaveBeenCalledWith('c1')
  })

  it('traduce los resultados a señales', async () => {
    const s = await cargarSenales({ ...base, tipoCuenta: 'empresa' })
    expect(s.miembros).toBe(3)
    expect(s.invitacionesPendientes).toBe(1)
    expect(s.conductores).toBe(1)
  })
})

describe('señales que salen de la empresa', () => {
  it('toma razón social y categorías', async () => {
    const s = await cargarSenales({ ...base, tipoCuenta: 'empresa' })
    expect(s.razonSocial).toBe('Transportes SpA')
    expect(s.categorias).toBe(1)
  })

  it('la pauta cuenta con km, con meses, o con ambos', async () => {
    const km = await cargarSenales({ ...base, tipoCuenta: 'empresa' })
    expect(km.pautaConfigurada).toBe(true)

    const meses = await cargarSenales({
      ...base, tipoCuenta: 'empresa',
      company: { ...COMPANY, pautaMantencion: { cadaKm: null, cadaMeses: 6 } },
    })
    expect(meses.pautaConfigurada).toBe(true)
  })

  it('una pauta vacía o ausente no cuenta como configurada', async () => {
    const vacia = await cargarSenales({
      ...base, tipoCuenta: 'empresa',
      company: { ...COMPANY, pautaMantencion: { cadaKm: null, cadaMeses: null } },
    })
    expect(vacia.pautaConfigurada).toBe(false)

    const ausente = await cargarSenales({
      ...base, tipoCuenta: 'empresa',
      company: { ...COMPANY, pautaMantencion: undefined },
    })
    expect(ausente.pautaConfigurada).toBe(false)
  })

  it('sin empresa cargada no explota', async () => {
    const s = await cargarSenales({ ...base, tipoCuenta: 'empresa', company: null })
    expect(s.razonSocial).toBe('')
    expect(s.categorias).toBe(0)
    expect(s.pautaConfigurada).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/onboarding/__tests__/cargar.test.ts`
Expected: FAIL — no se puede resolver `@/lib/onboarding/cargar`.

- [ ] **Step 3: Implementar el cargador**

Crea `lib/onboarding/cargar.ts`:

```ts
import { countMembers } from '@/lib/data/members'
import { countPendingInvitations } from '@/lib/data/invitations'
import { listActiveDrivers } from '@/lib/data/drivers'
import type { Company, TipoCuenta } from '@/lib/types'
import type { Senales } from '@/lib/onboarding/pasos'

/**
 * Completa las señales del onboarding con lo que el render del dashboard no
 * tiene a mano.
 *
 * En cuenta personal no consulta nada: sus tres pasos se resuelven con los
 * vehículos y los documentos que el dashboard ya cargó. Las tres consultas
 * extra son solo de cuenta empresa, y desaparecen al completarse el onboarding
 * (ver `completadoEn`).
 */
export async function cargarSenales(args: {
  companyId: string
  company: Company | null
  tipoCuenta: TipoCuenta
  vehiculos: number
  documentos: number
  primerVehiculoId: string | null
  vistos: string[]
}): Promise<Senales> {
  const [miembros, invitacionesPendientes, conductores] =
    args.tipoCuenta === 'empresa'
      ? await Promise.all([
          countMembers(args.companyId),
          countPendingInvitations(args.companyId),
          listActiveDrivers(args.companyId).then((d) => d.length),
        ])
      : [0, 0, 0]

  const pauta = args.company?.pautaMantencion
  return {
    vehiculos: args.vehiculos,
    documentos: args.documentos,
    primerVehiculoId: args.primerVehiculoId,
    razonSocial: args.company?.company.razonSocial ?? '',
    categorias: args.company?.categorias?.length ?? 0,
    pautaConfigurada: Boolean(pauta && ((pauta.cadaKm ?? 0) > 0 || (pauta.cadaMeses ?? 0) > 0)),
    miembros,
    invitacionesPendientes,
    conductores,
    vistos: args.vistos,
  }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/onboarding/__tests__/cargar.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Enganchar el dashboard**

En `app/(app)/dashboard/page.tsx`, agrega estos imports arriba:

```ts
import { after } from 'next/server'
import { saveOnboarding } from '@/lib/data/companies'
import { cargarSenales } from '@/lib/onboarding/cargar'
import { debeElegirTipo, debeMostrarTarjeta, pasosDe, todosListos, type Paso } from '@/lib/onboarding/pasos'
```

Justo **después** del `Promise.all` que carga `[vehicles, company, alertas, entrantes, salientes]` y **antes** de `const limit = maxVehiculosDe(...)`, inserta el portero:

```ts
  // El portero vive acá y no en el layout de (app) a propósito: el layout
  // envuelve las nueve páginas, así que la comprobación costaría una lectura
  // extra de Firestore en cada navegación, para siempre. El dashboard ya leyó
  // la empresa, así que acá sale gratis.
  const puedeConfigurar = can(m.role, 'billing:manage')
  if (debeElegirTipo(company?.onboarding, puedeConfigurar)) redirect('/bienvenida')
```

Después del bloque `const items = await Promise.all(...)`, y antes del `return`, agrega:

```ts
  // El checklist se deriva de los datos, así que solo se calcula mientras el
  // onboarding sigue vivo. `completadoEn` engancha el final: sin él, estas
  // consultas se pagarían en cada carga del dashboard para siempre.
  let pasos: Paso[] | null = null
  const onboarding = company?.onboarding
  if (onboarding?.tipoCuenta && debeMostrarTarjeta(onboarding, puedeConfigurar)) {
    const senales = await cargarSenales({
      companyId: m.companyId,
      company,
      tipoCuenta: onboarding.tipoCuenta,
      vehiculos: vehicles.length,
      // De los items ya resueltos y NO de `v.resumenDocs` directo: un vehículo
      // creado antes del feature de resúmenes tiene el campo ausente, y es
      // `resolverResumen` quien cubre ese caso.
      documentos: items.reduce((n, i) => n + i.docCount, 0),
      primerVehiculoId: vehicles[0]?.id ?? null,
      vistos: onboarding.vistos ?? [],
    })
    pasos = pasosDe(onboarding.tipoCuenta, senales)
    if (todosListos(pasos)) {
      const companyId = m.companyId
      after(async () => {
        try {
          await saveOnboarding(companyId, { completadoEn: new Date().toISOString() })
        } catch (e) {
          // Best-effort, como los refrescos de resumen: si falla, la próxima
          // carga vuelve a calcular y lo intenta de nuevo.
          console.error('marcar onboarding completo', e)
        }
      })
    }
  }
```

Y en el `return`, agrega la prop a `VehiclesBoard`:

```tsx
      onboarding={pasos && onboarding?.tipoCuenta ? { pasos, tipoCuenta: onboarding.tipoCuenta } : null}
```

- [ ] **Step 6: Montar la tarjeta en el board**

En `components/VehiclesBoard.tsx`, agrega los imports:

```ts
import TarjetaProgreso from '@/components/onboarding/TarjetaProgreso'
import type { Paso } from '@/lib/onboarding/pasos'
import type { TipoCuenta } from '@/lib/types'
```

Agrega la prop a la firma del componente (junto a `entrantes`), con su tipo en la lista de props:

```ts
  onboarding = null,
```
```ts
  onboarding?: { pasos: Paso[]; tipoCuenta: TipoCuenta } | null
```

Y en el JSX, **arriba** de `<TransferenciasEntrantes items={entrantes} />` (hoy alrededor de la línea 339):

```tsx
      {onboarding && <TarjetaProgreso pasos={onboarding.pasos} tipoCuenta={onboarding.tipoCuenta} />}
```

- [ ] **Step 7: Verificar la suite completa**

```bash
npx tsc --noEmit
npx eslint app components lib
npm test
```
Expected: sin errores; toda la suite pasa.

- [ ] **Step 8: Commit**

```bash
git add lib/onboarding/cargar.ts lib/onboarding/__tests__/cargar.test.ts "app/(app)/dashboard/page.tsx" components/VehiclesBoard.tsx
git commit -m "feat(onboarding): portero y checklist en el dashboard"
```

---

### Task 7: Anclas en Configuración, recuperar la tarjeta y documentar

**Files:**
- Create: `components/onboarding/RecuperarGuia.tsx`
- Modify: `app/(app)/configuracion/page.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `PATCH /api/onboarding` (Task 3), `getCompany` (existente).
- Produces: las anclas `#categorias`, `#mantencion`, `#equipo`, `#conductores` en `/configuracion`.

- [ ] **Step 1: Crear el botón para recuperar la guía**

Crea `components/onboarding/RecuperarGuia.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RecuperarGuia() {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)

  async function mostrar() {
    setOcupado(true)
    const res = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descartado: false }),
    })
    setOcupado(false)
    if (res.ok) router.push('/dashboard')
  }

  return (
    <section className="mt-4 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Guía de configuración</h2>
      <p className="mt-1 text-sm text-acero">La ocultaste del dashboard. Puedes volver a verla cuando quieras.</p>
      <button
        type="button"
        onClick={mostrar}
        disabled={ocupado}
        className="mt-3 rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta hover:bg-lienzo disabled:opacity-60"
      >
        {ocupado ? 'Mostrando…' : 'Volver a mostrarla'}
      </button>
    </section>
  )
}
```

- [ ] **Step 2: Agregar anclas y el bloque de recuperación**

En `app/(app)/configuracion/page.tsx`, agrega el import:

```ts
import RecuperarGuia from '@/components/onboarding/RecuperarGuia'
```

Envuelve las cards que son destino de un paso, para que los enlaces con hash lleguen al lugar correcto (los `id` van en el envoltorio y no dentro de cada componente: son cuatro líneas en un archivo en vez de cuatro archivos tocados). Reemplaza las líneas 63-67 actuales por:

```tsx
      {esAdmin && <div id="categorias"><CategoriasCard initial={company?.categorias ?? []} /></div>}
      {esAdmin && <div id="mantencion"><PautaMantencionCard initial={company?.pautaMantencion ?? {}} /></div>}

      {esAdmin && <div id="equipo"><TeamCard currentUid={m.uid} /></div>}
      {puedeGestionarConductores && <div id="conductores"><DriversCard /></div>}
```

Y al final, justo antes de cerrar el `</main>`, agrega:

```tsx
      {esAdmin && company?.onboarding?.descartadoEn && <RecuperarGuia />}
```

- [ ] **Step 3: Verificar que la app compila y la suite sigue verde**

```bash
npx tsc --noEmit
npx eslint app components lib
npm test
npm run build
```
Expected: sin errores en ninguno.

- [ ] **Step 4: Documentar en CLAUDE.md**

En la sección **Arquitectura**, agrega un bullet después del de `lib/mantencion/`:

```markdown
- `lib/onboarding/` — **onboarding del primer inicio**, ramificado entre cuenta personal y de empresa. `pasos.ts` (**lógica pura, sin Firebase**: `PasoId`, `Senales`, `Paso`, `PASOS_INFORMATIVOS` + `esPasoInformativo`, `pasosDe(tipoCuenta, senales)` [personal → 3 pasos, empresa → 9], `todosListos`, y los dos predicados de visibilidad `debeElegirTipo`/`debeMostrarTarjeta`) y `cargar.ts` (`cargarSenales`, que completa lo que el render del dashboard no tiene a mano). **El progreso se DERIVA de los datos reales** (¿hay vehículos?, ¿hay conductores?, ¿está llena la razón social?) y **nunca se guarda por paso**: así el checklist no puede mentir, refleja lo hecho desde otro lugar de la app (los formularios existían antes que el onboarding) y no se desincroniza si alguien borra el dato. Las dos excepciones son los pasos **informativos** (`chip` y `reportes`), que no dejan rastro en los datos y se guardan en `onboarding.vistos` — el endpoint valida el id contra `esPasoInformativo` para que nadie infle el arreglo. **El enganche del final** (`completadoEn`) existe porque derivar todo es circular: para saber que el onboarding terminó hay que hacer las consultas, así que sin él las tres lecturas extra de cuenta empresa (`countMembers`, `countPendingInvitations`, `listActiveDrivers`) se pagarían en cada carga del dashboard para siempre; se estampa best-effort con `after()`. **Cuenta personal no dispara ninguna consulta extra**: sus tres pasos salen de los vehículos y documentos que el dashboard ya cargó (la señal de documentos se toma de los `items` ya resueltos por `resolverResumen` y **no** de `v.resumenDocs` directo, que está ausente en vehículos previos al feature de resúmenes). **El portero vive en el dashboard y no en el layout de `(app)`**: el layout envuelve las nueve páginas, así que la comprobación costaría una lectura de Firestore en cada navegación para siempre; el dashboard ya lee la empresa. El precio aceptado es que entrar por URL directa a otra página saltea la pantalla de elección. UI: `app/bienvenida/page.tsx` (fuera del grupo `(app)`, con su propia guarda para no ser un callejón) + `components/onboarding/ElegirTipo.tsx`, `TarjetaProgreso.tsx` (en el dashboard, sobre `TransferenciasEntrantes`) y `RecuperarGuia.tsx` (en Configuración, solo si se descartó).
```

En la sección **Modelo de datos (Firestore)**, dentro del bullet de `companies/{companyId}`, agrega al final de la enumeración de campos:

```markdown
 + `onboarding?: Onboarding` (`{ tipoCuenta: 'personal'|'empresa', vistos: string[], completadoEn?, descartadoEn? }`, el estado del onboarding — ver `lib/onboarding/`). Vive en la **empresa** y no en el usuario porque un invitado (Editor/Visor) no tiene permisos para casi ningún paso: **el onboarding lo ve solo el Administrador** (`can(role, 'billing:manage')`). `tipoCuenta` **ausente es el disparador** de `/bienvenida`, así que las cuentas que ya existían en producción caen ahí solas y **no hizo falta migración**. El tipo de cuenta **no cambia la app**: Configuración sigue mostrando equipo, conductores, categorías y mantención a todos; solo decide qué pasos se enseñan (por eso pasar de personal a empresa es cambiar un campo, sin tocar ningún dato — y `saveOnboarding` limpia `completadoEn` al hacerlo, o los seis pasos nuevos quedarían ocultos). Endpoint: `PATCH /api/onboarding` (`{ tipoCuenta?, visto?, descartado? }`, todos opcionales, 400 si el patch queda vacío)
```

En la lista de rutas de `app/api/*`, agrega `onboarding` junto a las demás.

- [ ] **Step 5: Commit**

```bash
git add components/onboarding/RecuperarGuia.tsx "app/(app)/configuracion/page.tsx" CLAUDE.md
git commit -m "feat(onboarding): anclas en configuracion, recuperar la guia y documentacion"
```

---

## Verificación manual

Lo que ningún test automático cubre: **si el onboarding sirve**. Se verifica creando una cuenta nueva de verdad y recorriéndola entera, preferentemente en celular.

- [ ] Crear una cuenta nueva con un correo sin usar. Tras autenticar debe caer en `/bienvenida`, sin barra de navegación.
- [ ] Elegir **personal**: el dashboard muestra la tarjeta con 3 pasos, 0 hechos.
- [ ] Agregar un vehículo: el paso 1 se marca solo, sin recargar a mano.
- [ ] Subir un documento: el paso 2 se marca y los enlaces de "documentos" y "chip" ahora apuntan a la ficha de ese vehículo.
- [ ] Dar "Entendido" en el chip: la tarjeta desaparece (los 3 pasos listos).
- [ ] Recargar el dashboard: la tarjeta sigue sin aparecer (quedó `completadoEn`).
- [ ] En otra cuenta nueva, elegir **empresa**: 9 pasos. Recorrer cada enlace y confirmar que **cada ancla cae en la card correcta** de Configuración.
- [ ] Probar "Ocultar" y recuperarla desde Configuración.
- [ ] Con una cuenta personal a medio configurar, tocar "En realidad administro una flota": deben aparecer los 6 pasos extra, con los ya cumplidos marcados.
- [ ] Iniciar sesión con una **cuenta que ya existía** en producción: debe ver `/bienvenida` una vez y después el checklist.
- [ ] Iniciar sesión como **miembro invitado** (Editor o Visor): **nunca** debe ver `/bienvenida` ni la tarjeta. Entrar a `/bienvenida` a mano debe rebotar al dashboard.
