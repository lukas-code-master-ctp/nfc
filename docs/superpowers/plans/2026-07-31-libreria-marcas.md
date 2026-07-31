# Librería de marcas — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que al escribir la marca de un vehículo nuevo aparezcan sugerencias, y que la marca se guarde normalizada.

**Architecture:** Una librería pura (`lib/vehicles/marcas.ts`) con la lista canónica y dos funciones; un combobox propio que la consume en el modal de alta; la normalización aplicada **en el servidor**; y un script one-time para la flota existente, con un test que impide que su copia de la lista se desvíe.

**Tech Stack:** Next.js 16 (App Router), React client components, Vitest + Testing Library, firebase-admin para el script.

**Spec:** `docs/superpowers/specs/2026-07-31-libreria-marcas-design.md`

## Global Constraints

- La lista es **abierta**: sugiere, pero el usuario siempre puede escribir una marca que no esté.
- Las marcas **desconocidas conservan la escritura del usuario**. La forma canónica se aplica solo cuando el texto calza con la librería.
- La normalización corre **en el servidor** (`POST /api/vehicles`). El cliente solo sugiere; nunca se confía en lo que manda.
- `sugerirMarcas` devuelve **primero las que empiezan** con lo escrito y después las que lo contienen, ambas en el orden de `MARCAS`. Tope por defecto: **8** (en un celular una lista más larga tapa el formulario).
- Con la query vacía, `sugerirMarcas` devuelve `[]`.
- La comparación usa `normalizarBusqueda` de `lib/vehicles/buscar.ts` — ya existe y ya quita acentos.
- En el combobox, **seleccionar va en `onMouseDown`, no en `onClick`**: el `blur` del input dispara antes que el `click`.
- La lista de marcas del script debe ser **idéntica a `MARCAS`** (mismos elementos, mismo orden); hay un test que lo fija.
- **Fuera de alcance:** filtro por marca en el dashboard, editar la marca de un vehículo existente, librería de modelos, y sanear `patente`/`modelo`.
- Todo el código, UI, comentarios y mensajes en **español neutro (Chile)**, tratando de "tú".
- Tras cada tarea: `npx tsc --noEmit`, `npx eslint app components lib` (0 errores; los 6 warnings de `react-hooks/set-state-in-effect` son preexistentes) y `npm run build`.
- **NO** correr `npm test` completo: incluye `lib/firebase/__tests__/rules.test.ts`, que necesita el emulador de Firestore y falla siempre en local. Usar `npx vitest run app components lib`.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `lib/vehicles/marcas.ts` | La lista canónica + `sugerirMarcas` + `normalizarMarca` (puro) | 1 |
| `app/api/vehicles/route.ts` | Normalizar la marca antes de guardar | 1 |
| `components/vehicle/MarcaInput.tsx` | El combobox | 2 |
| `components/NewVehicleModal.tsx` | Montar el combobox en el campo `marca` | 2 |
| `scripts/normalizar-marcas.mjs` | Normalización one-time de la flota existente | 3 |

---

## Task 1: La librería y la normalización en el servidor

**Files:**
- Create: `lib/vehicles/marcas.ts`
- Create: `lib/vehicles/__tests__/marcas.test.ts`
- Create: `app/api/__tests__/vehicles-marca.test.ts`
- Modify: `app/api/vehicles/route.ts:35-41`

**Interfaces:**
- Consume: `normalizarBusqueda(s: string): string` de `lib/vehicles/buscar.ts`
- Produce: `MARCAS: readonly string[]`, `sugerirMarcas(query: string, limite?: number): string[]`, `normalizarMarca(raw: string): string`

- [ ] **Step 1: Escribir el test de la lógica pura**

Crear `lib/vehicles/__tests__/marcas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MARCAS, sugerirMarcas, normalizarMarca } from '@/lib/vehicles/marcas'

describe('la lista', () => {
  it('está ordenada alfabéticamente, ignorando acentos y mayúsculas', () => {
    const clave = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const ordenada = [...MARCAS].sort((a, b) => clave(a).localeCompare(clave(b), 'es'))
    expect([...MARCAS]).toEqual(ordenada)
  })

  it('no tiene repetidas ni espacios sobrantes', () => {
    expect(new Set(MARCAS).size).toBe(MARCAS.length)
    for (const m of MARCAS) expect(m).toBe(m.trim())
  })
})

describe('sugerirMarcas', () => {
  // El caso que motivó el feature. "Mitsubishi" también contiene "sub", pero
  // quien escribe "sub" busca Subaru: por eso el que EMPIEZA va primero, aunque
  // Mitsubishi aparezca antes en la lista alfabética.
  it('encuentra por el principio, y eso manda sobre el orden alfabético', () => {
    expect(sugerirMarcas('sub')).toEqual(['Subaru', 'Mitsubishi'])
  })

  it('también encuentra en medio de la palabra', () => {
    expect(sugerirMarcas('aru')).toEqual(['Subaru'])
  })

  // Lo que empieza con el texto va primero AUNQUE alfabéticamente vaya después:
  // Dodge y Peugeot contienen "ge", pero quien escribe "ge" busca Geely.
  it('prioriza las que empiezan con el texto sobre las que solo lo contienen', () => {
    expect(sugerirMarcas('ge')).toEqual(['Geely', 'Dodge', 'Peugeot', 'Volkswagen'])
  })

  it('ignora acentos en los dos sentidos', () => {
    expect(sugerirMarcas('citroen')).toEqual(['Citroën'])
    expect(sugerirMarcas('skoda')).toEqual(['Škoda'])
  })

  it('ignora mayúsculas y espacios alrededor', () => {
    expect(sugerirMarcas('  SUB  ')).toEqual(['Subaru', 'Mitsubishi'])
  })

  it('con la query vacía no sugiere nada: abrir el modal no debe llenarse de marcas', () => {
    expect(sugerirMarcas('')).toEqual([])
    expect(sugerirMarcas('   ')).toEqual([])
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(sugerirMarcas('zzzz')).toEqual([])
  })

  it('corta en 8 por defecto: una lista más larga tapa el formulario en un celular', () => {
    expect(sugerirMarcas('a').length).toBeLessThanOrEqual(8)
  })

  it('respeta un tope explícito', () => {
    expect(sugerirMarcas('a', 3)).toHaveLength(3)
  })
})

describe('normalizarMarca', () => {
  it('lleva a la forma canónica lo que calza con la librería', () => {
    expect(normalizarMarca('  subaru ')).toBe('Subaru')
    expect(normalizarMarca('MERCEDES-BENZ')).toBe('Mercedes-Benz')
  })

  it('recupera los acentos que el usuario no escribió', () => {
    expect(normalizarMarca('citroen')).toBe('Citroën')
  })

  it('colapsa espacios internos', () => {
    expect(normalizarMarca('great   wall')).toBe('Great Wall')
  })

  // Una lista abierta no puede imponerle una escritura a lo que no conoce.
  it('a una marca desconocida solo le saca los espacios, sin tocar su escritura', () => {
    expect(normalizarMarca('  JMC ')).toBe('JMC')
    expect(normalizarMarca('jmc')).toBe('jmc')
  })

  it('una cadena vacía sigue vacía', () => {
    expect(normalizarMarca('')).toBe('')
    expect(normalizarMarca('   ')).toBe('')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run lib/vehicles/__tests__/marcas.test.ts`
Esperado: FALLA — no se puede resolver `@/lib/vehicles/marcas`.

- [ ] **Step 3: Escribir la librería**

Crear `lib/vehicles/marcas.ts`:

```ts
import { normalizarBusqueda } from '@/lib/vehicles/buscar'

/**
 * Marcas de vehículos para el autocompletado del alta.
 *
 * Pensada para **flota chilena**, no para autos particulares: por eso incluye
 * camiones (Hino, Isuzu, Iveco, Scania, Freightliner) y la ola china completa,
 * que ya es mayoría en flotas nuevas.
 *
 * Vive en código y no en Firestore: cambia una vez al año, y en Firestore
 * costaría una lectura cada vez que alguien abre el modal, para siempre.
 *
 * Ordenada alfabéticamente ignorando acentos (Škoda va entre Shineray y Smart).
 * Si agregas una marca, agrégala también en `scripts/normalizar-marcas.mjs`:
 * hay un test que falla si las dos listas se separan.
 */
export const MARCAS: readonly string[] = [
  'Alfa Romeo', 'Audi', 'BAIC', 'Bajaj', 'BMW', 'BYD', 'Cadillac', 'Changan',
  'Chery', 'Chevrolet', 'Chrysler', 'Citroën', 'DFSK', 'Dodge', 'Dongfeng',
  'DS', 'Fiat', 'Ford', 'Foton', 'Freightliner', 'Geely', 'GMC', 'Great Wall',
  'Haval', 'Hino', 'Honda', 'Hyundai', 'International', 'Isuzu', 'Iveco',
  'JAC', 'Jaecoo', 'Jaguar', 'Jeep', 'Jetour', 'Kawasaki', 'Kia', 'Land Rover',
  'Lexus', 'Mack', 'Mahindra', 'MAN', 'Maxus', 'Mazda', 'Mercedes-Benz', 'MG',
  'MINI', 'Mitsubishi', 'Nissan', 'Omoda', 'Opel', 'Peugeot', 'Porsche', 'RAM',
  'Renault', 'Scania', 'SEAT', 'Shineray', 'Škoda', 'Smart', 'SsangYong',
  'Subaru', 'Suzuki', 'Tata', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
  'Yamaha',
]

/** Ocho: en un celular una lista más larga tapa el formulario completo. */
const LIMITE_SUGERENCIAS = 8

/**
 * Marcas que calzan con lo que el usuario lleva escrito.
 *
 * Primero las que **empiezan** con el texto y después las que lo contienen en
 * cualquier parte, cada grupo en el orden de `MARCAS`. Quien escribe "ge" busca
 * Geely, no Dodge, aunque Dodge vaya antes alfabéticamente.
 *
 * Con la query vacía devuelve `[]`: abrir el modal y recibir ocho marcas
 * alfabéticas no ayuda a nadie.
 */
export function sugerirMarcas(query: string, limite: number = LIMITE_SUGERENCIAS): string[] {
  const q = normalizarBusqueda(query)
  if (!q) return []
  const empiezan: string[] = []
  const contienen: string[] = []
  for (const marca of MARCAS) {
    const n = normalizarBusqueda(marca)
    if (n.startsWith(q)) empiezan.push(marca)
    else if (n.includes(q)) contienen.push(marca)
  }
  return [...empiezan, ...contienen].slice(0, limite)
}

/**
 * La marca tal como debe guardarse: forma canónica si calza con la librería, y
 * si no, el texto con los espacios saneados **conservando la escritura del
 * usuario**. La lista es abierta, así que no puede imponerle un formato a una
 * marca que no conoce.
 */
export function normalizarMarca(raw: string): string {
  const limpio = raw.replace(/\s+/g, ' ').trim()
  if (!limpio) return ''
  const n = normalizarBusqueda(limpio)
  return MARCAS.find((m) => normalizarBusqueda(m) === n) ?? limpio
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run lib/vehicles/__tests__/marcas.test.ts`
Esperado: PASA (16 tests).

- [ ] **Step 5: Escribir el test del endpoint**

Crear `app/api/__tests__/vehicles-marca.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  listVehicles: vi.fn(),
  createVehicle: vi.fn(),
  getCompany: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/data/vehicles', () => ({
  listVehicles: mocks.listVehicles,
  createVehicle: mocks.createVehicle,
}))
vi.mock('@/lib/data/companies', () => ({ getCompany: mocks.getCompany }))

const { POST } = await import('@/app/api/vehicles/route')

const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

const alta = (marca: string) => req({ patente: 'ABCD12', marca, modelo: 'Swift', anio: '2024' })

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  mocks.listVehicles.mockResolvedValue([])
  mocks.getCompany.mockResolvedValue({ plan: { maxVehiculos: 10 } })
  mocks.createVehicle.mockResolvedValue({ id: 'v1' })
})

/** La marca con la que se llamó a createVehicle. */
const marcaGuardada = () => (mocks.createVehicle.mock.calls[0][2] as { marca: string }).marca

describe('la marca se normaliza en el servidor', () => {
  // El combobox solo sugiere: nunca se confía en lo que manda el cliente, y así
  // queda cubierto también quien cree un vehículo por otra vía.
  it('lleva a la forma canónica lo que llega sucio', async () => {
    await POST(alta('  subaru '))
    expect(marcaGuardada()).toBe('Subaru')
  })

  it('a una marca desconocida solo le saca los espacios', async () => {
    await POST(alta('  JMC '))
    expect(marcaGuardada()).toBe('JMC')
  })
})

describe('lo que no cambia', () => {
  it('sigue exigiendo los campos obligatorios', async () => {
    const res = await POST(req({ patente: 'ABCD12', modelo: 'Swift' }))
    expect(res.status).toBe(400)
    expect(mocks.createVehicle).not.toHaveBeenCalled()
  })

  it('sigue respetando el cupo del plan', async () => {
    mocks.listVehicles.mockResolvedValue([{ id: 'x' }])
    mocks.getCompany.mockResolvedValue({ plan: { maxVehiculos: 1 } })
    const res = await POST(alta('Subaru'))
    expect(res.status).toBe(409)
    expect(mocks.createVehicle).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Correr el test y verificar que falla**

Ejecutar: `npx vitest run app/api/__tests__/vehicles-marca.test.ts`
Esperado: FALLAN los 2 tests de normalización — la marca se guarda tal cual (`'  subaru '` en vez de `'Subaru'`).

- [ ] **Step 7: Normalizar en el endpoint**

En `app/api/vehicles/route.ts`, agregar el import después de la línea 6:

```ts
import { normalizarMarca } from '@/lib/vehicles/marcas'
```

y en la llamada a `createVehicle` (líneas 35-41), cambiar la línea de `marca`:

```ts
  const vehicle = await createVehicle(m.companyId, m.uid, {
    patente,
    // En el servidor y no en el cliente: el combobox solo sugiere, y así queda
    // cubierto también quien cree un vehículo por otra vía.
    marca: normalizarMarca(marca),
    modelo,
    anio: Number(anio) || 0,
    color: color ?? '',
  })
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run app/api/__tests__/vehicles-marca.test.ts`
Esperado: PASA (4 tests).

- [ ] **Step 9: Verificar todo**

Ejecutar: `npx vitest run app components lib && npx tsc --noEmit && npx eslint app components lib`
Esperado: todos los tests pasan salvo `lib/firebase/__tests__/rules.test.ts` (necesita el emulador, falla siempre en local); tsc sin salida; eslint con `0 errors`.

- [ ] **Step 10: Commit**

```bash
git add lib/vehicles/marcas.ts lib/vehicles/__tests__/marcas.test.ts app/api/vehicles/route.ts app/api/__tests__/vehicles-marca.test.ts
git commit -m "feat(marcas): libreria de marcas y normalizacion en el servidor"
```

---

## Task 2: El combobox

**Files:**
- Create: `components/vehicle/MarcaInput.tsx`
- Create: `components/__tests__/MarcaInput.test.tsx`
- Modify: `components/NewVehicleModal.tsx:74-88`

**Interfaces:**
- Consume: `sugerirMarcas(query: string, limite?: number): string[]` de `lib/vehicles/marcas.ts` (Task 1)
- Produce: `<MarcaInput value={string} onChange={(v: string) => void} className?={string} required?={boolean} placeholder?={string} />`

- [ ] **Step 1: Escribir el test del componente**

Crear `components/__tests__/MarcaInput.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MarcaInput from '@/components/vehicle/MarcaInput'

/** Envoltorio controlado, como lo usa el modal de alta. */
function Campo({ inicial = '' }: { inicial?: string }) {
  const [v, setV] = useState(inicial)
  return <MarcaInput value={v} onChange={setV} placeholder="Marca" />
}

const campo = () => screen.getByPlaceholderText('Marca') as HTMLInputElement
const escribir = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })
const opciones = () => screen.queryAllByRole('option')

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('sugerencias', () => {
  it('al escribir aparecen las marcas que calzan', () => {
    render(<Campo />)
    escribir('sub')
    expect(opciones().map((o) => o.textContent)).toEqual(['Subaru'])
  })

  it('sin escribir nada no hay lista', () => {
    render(<Campo />)
    expect(opciones()).toHaveLength(0)
  })

  it('sin coincidencias tampoco: una lista vacía no aporta', () => {
    render(<Campo />)
    escribir('zzzz')
    expect(opciones()).toHaveLength(0)
  })
})

describe('elegir con el mouse', () => {
  // El clic va en onMouseDown y no en onClick: el blur del input dispara ANTES
  // que el click, así que con onClick la lista se cierra antes de que la opción
  // reciba el evento y el clic no hace nada.
  it('el clic en una opción la escribe en el campo y cierra la lista', () => {
    render(<Campo />)
    escribir('sub')
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Subaru' }))
    expect(campo().value).toBe('Subaru')
    expect(opciones()).toHaveLength(0)
  })
})

describe('elegir con el teclado', () => {
  it('flecha abajo y Enter eligen', () => {
    render(<Campo />)
    escribir('ge')
    fireEvent.keyDown(campo(), { key: 'ArrowDown' })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(campo().value).toBe('Dodge') // la segunda: Geely, Dodge, Peugeot, Volkswagen
  })

  it('Enter sin mover elige la primera', () => {
    render(<Campo />)
    escribir('ge')
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(campo().value).toBe('Geely')
  })

  it('flecha arriba desde la primera va a la última', () => {
    render(<Campo />)
    escribir('ge')
    fireEvent.keyDown(campo(), { key: 'ArrowUp' })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(campo().value).toBe('Volkswagen')
  })

  it('Escape cierra la lista y CONSERVA lo escrito', () => {
    render(<Campo />)
    escribir('sub')
    fireEvent.keyDown(campo(), { key: 'Escape' })
    expect(opciones()).toHaveLength(0)
    expect(campo().value).toBe('sub')
  })
})

describe('la lista es abierta', () => {
  // Es lo que la distingue de un <select> disfrazado.
  it('se puede escribir una marca que no está en la librería', () => {
    render(<Campo />)
    escribir('Marca Rara SpA')
    expect(campo().value).toBe('Marca Rara SpA')
  })
})

describe('accesibilidad', () => {
  it('el campo se anuncia como combobox y dice si está desplegado', () => {
    render(<Campo />)
    const input = screen.getByRole('combobox')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    escribir('sub')
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('true')
  })

  it('la opción resaltada se apunta con aria-activedescendant', () => {
    render(<Campo />)
    escribir('ge')
    const activa = campo().getAttribute('aria-activedescendant')
    expect(activa).toBeTruthy()
    expect(document.getElementById(activa!)?.textContent).toBe('Geely')
  })

  it('la lista es un listbox', () => {
    render(<Campo />)
    escribir('sub')
    expect(screen.getByRole('listbox')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run components/__tests__/MarcaInput.test.tsx`
Esperado: FALLA — no se puede resolver `@/components/vehicle/MarcaInput`.

- [ ] **Step 3: Escribir el componente**

Crear `components/vehicle/MarcaInput.tsx`:

```tsx
'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { sugerirMarcas } from '@/lib/vehicles/marcas'

/**
 * Campo de marca con sugerencias. **Lista abierta**: sugiere lo que conoce,
 * pero siempre deja escribir una marca que no está — en una flota chilena hay
 * importados y vehículos de trabajo que no van a estar en ninguna lista.
 *
 * Es un combobox propio y no un `<datalist>` nativo porque el nativo no se
 * puede estilizar (la lista la dibuja el sistema operativo) y su filtrado varía
 * por navegador. La app se usa sobre todo desde el celular, y un desplegable
 * del sistema en medio del único formulario de alta desentona con el resto.
 *
 * Controlado por el padre, como `SelectorPaginas`.
 */
export default function MarcaInput({
  value,
  onChange,
  className,
  required,
  placeholder,
}: {
  value: string
  onChange: (valor: string) => void
  className?: string
  required?: boolean
  placeholder?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [resaltada, setResaltada] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const idLista = useId()

  const sugerencias = abierto ? sugerirMarcas(value) : []
  const desplegada = sugerencias.length > 0

  useEffect(() => {
    if (!abierto) return
    function alTocarFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alTocarFuera)
    return () => document.removeEventListener('mousedown', alTocarFuera)
  }, [abierto])

  function elegir(marca: string) {
    onChange(marca)
    setAbierto(false)
  }

  function alEscribir(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    // Volver al principio de la lista: la anterior ya no corresponde a estas
    // sugerencias y el índice podría quedar apuntando fuera.
    setResaltada(0)
    setAbierto(true)
  }

  function alPresionar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setAbierto(false)
      return
    }
    if (!desplegada) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltada((i) => (i + 1) % sugerencias.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltada((i) => (i - 1 + sugerencias.length) % sugerencias.length)
    } else if (e.key === 'Enter') {
      // Sin esto, Enter enviaría el formulario del modal en vez de elegir.
      e.preventDefault()
      elegir(sugerencias[resaltada])
    } else if (e.key === 'Tab') {
      setAbierto(false)
    }
  }

  const idOpcion = (i: number) => `${idLista}-${i}`

  return (
    <div ref={ref} className="relative">
      <input
        role="combobox"
        aria-expanded={desplegada}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={desplegada ? idOpcion(resaltada) : undefined}
        autoComplete="off"
        className={className}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={alEscribir}
        onKeyDown={alPresionar}
      />
      {desplegada && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-linea bg-superficie py-1 shadow-lg"
        >
          {sugerencias.map((marca, i) => (
            <li
              key={marca}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === resaltada}
              // onMouseDown y no onClick: el blur del input dispara ANTES que el
              // click, así que con onClick la lista se cierra antes de que la
              // opción reciba el evento y el clic no hace nada.
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(marca)
              }}
              onMouseEnter={() => setResaltada(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === resaltada ? 'bg-azul/10 text-azul' : 'text-tinta'
              }`}
            >
              {marca}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run components/__tests__/MarcaInput.test.tsx`
Esperado: PASA (12 tests).

- [ ] **Step 5: Montarlo en el modal de alta**

En `components/NewVehicleModal.tsx`, agregar el import después de la línea 3:

```tsx
import MarcaInput from '@/components/vehicle/MarcaInput'
```

y reemplazar el bloque del `map` (líneas 74-88) por:

```tsx
          {(['patente', 'marca', 'modelo', 'anio', 'color'] as const).map((f) => (
            <div key={f} className="space-y-1.5">
              <label className="block text-sm font-medium text-acero">
                {LABELS[f]}
                {f === 'color' && <span className="font-normal text-acero/70"> (opcional)</span>}
              </label>
              {f === 'marca' ? (
                <MarcaInput
                  className={inputCls}
                  placeholder={LABELS[f]}
                  required
                  value={form.marca}
                  onChange={(marca) => setForm({ ...form, marca })}
                />
              ) : (
                <input
                  className={inputCls}
                  placeholder={LABELS[f]}
                  value={form[f]}
                  onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                  required={f !== 'color'}
                />
              )}
            </div>
          ))}
```

- [ ] **Step 6: Verificar todo**

Ejecutar: `npx vitest run app components lib && npx tsc --noEmit && npx eslint app components lib && npm run build`
Esperado: todos los tests pasan salvo `rules.test.ts`; tsc sin salida; eslint con `0 errors`; build exitoso.

- [ ] **Step 7: Commit**

```bash
git add components/vehicle/MarcaInput.tsx components/__tests__/MarcaInput.test.tsx components/NewVehicleModal.tsx
git commit -m "feat(marcas): combobox de marca en el alta de vehiculo"
```

---

## Task 3: El script y la guarda anti-deriva

**Files:**
- Create: `scripts/normalizar-marcas.mjs`
- Modify: `lib/vehicles/__tests__/marcas.test.ts` (agregar el bloque anti-deriva)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consume: `MARCAS` de `lib/vehicles/marcas.ts` (Task 1), para el test anti-deriva

- [ ] **Step 1: Escribir el test anti-deriva**

En `lib/vehicles/__tests__/marcas.test.ts`, agregar el import **arriba del todo**, junto a los que ya están:

```ts
import { readFileSync } from 'node:fs'
```

y este bloque al final del archivo:

```ts
/**
 * Los scripts son `.mjs` y no pueden importar el TypeScript de `lib/`, así que
 * `scripts/normalizar-marcas.mjs` DUPLICA esta lista. El proyecto ya pisó esta
 * trampa: el comparador de orden de `backfill-resumen.mjs` se desvió del de la
 * app. Si las listas se separan, el script normaliza a valores que la app no
 * reconoce y nadie se entera.
 */
describe('el script no puede desviarse de la librería', () => {
  it('su lista de marcas es idéntica, en el mismo orden', () => {
    const fuente = readFileSync('scripts/normalizar-marcas.mjs', 'utf8')
    const bloque = fuente.match(/const MARCAS = \[([\s\S]*?)\n\]/)
    expect(bloque, 'no se encontró `const MARCAS = [...]` en el script').toBeTruthy()
    const delScript = [...bloque![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(delScript).toEqual([...MARCAS])
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run lib/vehicles/__tests__/marcas.test.ts`
Esperado: FALLA — `scripts/normalizar-marcas.mjs` no existe (`ENOENT`).

- [ ] **Step 3: Escribir el script**

Crear `scripts/normalizar-marcas.mjs`:

```js
// Normalización one-time de las marcas de la flota existente.
//
// Hasta ahora la marca se guardaba tal cual la escribía el usuario, sin ni
// siquiera un trim, así que conviven "subaru", "Subaru" y " Subaru " como
// valores distintos. Esto las lleva a la forma canónica de la librería.
//
// SEGURO POR DEFECTO: dry-run (solo lista). Para escribir hay que pasar --apply.
// Idempotente: correrlo dos veces no hace nada la segunda.
//
// Uso:
//   node --env-file=.env.local scripts/normalizar-marcas.mjs           # dry-run
//   node --env-file=.env.local scripts/normalizar-marcas.mjs --apply   # escribe
//
// OJO: la lista y la función de abajo son una COPIA de `lib/vehicles/marcas.ts`,
// que es la fuente de verdad. Los scripts son .mjs y no pueden importar el
// TypeScript de lib/. Hay un test que falla si las dos listas se separan
// (`lib/vehicles/__tests__/marcas.test.ts`); si agregas una marca acá, agrégala
// también allá.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const MARCAS = [
  'Alfa Romeo', 'Audi', 'BAIC', 'Bajaj', 'BMW', 'BYD', 'Cadillac', 'Changan',
  'Chery', 'Chevrolet', 'Chrysler', 'Citroën', 'DFSK', 'Dodge', 'Dongfeng',
  'DS', 'Fiat', 'Ford', 'Foton', 'Freightliner', 'Geely', 'GMC', 'Great Wall',
  'Haval', 'Hino', 'Honda', 'Hyundai', 'International', 'Isuzu', 'Iveco',
  'JAC', 'Jaecoo', 'Jaguar', 'Jeep', 'Jetour', 'Kawasaki', 'Kia', 'Land Rover',
  'Lexus', 'Mack', 'Mahindra', 'MAN', 'Maxus', 'Mazda', 'Mercedes-Benz', 'MG',
  'MINI', 'Mitsubishi', 'Nissan', 'Omoda', 'Opel', 'Peugeot', 'Porsche', 'RAM',
  'Renault', 'Scania', 'SEAT', 'Shineray', 'Škoda', 'Smart', 'SsangYong',
  'Subaru', 'Suzuki', 'Tata', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
  'Yamaha',
]

// Copia de `normalizarBusqueda` + `normalizarMarca` de lib/. Ver el aviso de arriba.
const clave = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

function normalizarMarca(raw) {
  const limpio = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!limpio) return ''
  const n = clave(limpio)
  return MARCAS.find((m) => clave(m) === n) ?? limpio
}

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

const vehiculos = await db.collection('vehicles').get()
let cambiados = 0

for (const v of vehiculos.docs) {
  const d = v.data()
  const actual = d.marca ?? ''
  const nueva = normalizarMarca(actual)
  if (nueva === actual) continue
  console.log(`  ${d.patente ?? v.id} (${d.companyId ?? 's/empresa'}): "${actual}" → "${nueva}"`)
  cambiados++
  if (APPLY) await v.ref.update({ marca: nueva })
}

console.log(`\nVehículos: ${vehiculos.size} · por normalizar: ${cambiados}`)
console.log(APPLY ? '\nNormalización aplicada. ✅' : '\n[DRY-RUN] No se escribió nada. Corre con --apply para aplicar.')
process.exit(0)
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run lib/vehicles/__tests__/marcas.test.ts`
Esperado: PASA (17 tests).

- [ ] **Step 5: Comprobar que la guarda muerde**

Edita `scripts/normalizar-marcas.mjs` y cambia `'Subaru'` por `'Subarú'` dentro de `const MARCAS`. Ejecutar:

`npx vitest run lib/vehicles/__tests__/marcas.test.ts`

Esperado: FALLA el test "su lista de marcas es idéntica, en el mismo orden".
Después **deshaz el cambio** y vuelve a correrlo: debe pasar.

- [ ] **Step 6: Documentar en CLAUDE.md**

En `CLAUDE.md`, en la lista de scripts de operación, agregar después de la línea de `backfill-resumen.mjs`:

```
node --env-file=.env.local scripts/normalizar-marcas.mjs [--apply]  # normaliza las marcas de los vehículos contra la librería (dry-run sin --apply)
```

En la sección de `lib/`, agregar después de la línea de `lib/vehicles/destino.ts`:

```
- `lib/vehicles/marcas.ts` — **librería de marcas de vehículos** (pura): `MARCAS` (69 marcas pensadas para flota chilena: incluye camiones y la ola china), `sugerirMarcas(query, limite = 8)` (primero las que **empiezan** con el texto, después las que lo contienen; query vacía → `[]`; el tope de 8 es para que la lista no tape el formulario en un celular) y `normalizarMarca(raw)` (forma canónica si calza con la librería; si no, `trim` + espacios colapsados **conservando la escritura del usuario**, porque la lista es abierta). Compara con `normalizarBusqueda` de `buscar.ts`, así que "citroen" encuentra "Citroën". La consume `components/vehicle/MarcaInput.tsx` (el combobox del alta) y **`POST /api/vehicles`, que es donde se normaliza de verdad**: el combobox solo sugiere. `scripts/normalizar-marcas.mjs` **duplica** la lista porque los `.mjs` no pueden importar TypeScript; hay un test que falla si las dos se separan.
```

En la sección de `components/`, dentro de la descripción de Vehículo, agregar la mención del componente nuevo junto a `NewVehicleModal`:

```
`NewVehicleModal` (alta; el campo Marca es `vehicle/MarcaInput`, un combobox propio con la librería de marcas — lista **abierta**, siempre se puede escribir una marca que no esté)
```

- [ ] **Step 7: Verificar todo**

Ejecutar: `npx vitest run app components lib && npx tsc --noEmit && npx eslint app components lib && npm run build`
Esperado: todos los tests pasan salvo `rules.test.ts`; tsc sin salida; eslint con `0 errors`; build exitoso.

- [ ] **Step 8: Commit**

```bash
git add scripts/normalizar-marcas.mjs lib/vehicles/__tests__/marcas.test.ts CLAUDE.md
git commit -m "feat(marcas): script de normalizacion de la flota existente"
```

---

## Verificación manual

**En el navegador** (lo hace quien implementa, con el viewport de móvil a 375px):

1. Abrir el dashboard, tocar "Nuevo vehículo", escribir "sub" en Marca. Debe aparecer Subaru en una lista con los colores de la app.
2. Que la lista **no tape** los campos de abajo de forma que no se pueda seguir llenando el formulario.
3. Elegir con el teclado (↓ + Enter) y con clic.
4. Escribir una marca que no está y guardar: debe dejarte.

**En un celular real** (lo confirma el usuario): cómo se comporta la lista sobre el teclado virtual. Es lo único que el viewport del escritorio no reproduce.

**El script**, contra producción:

```bash
node --env-file=.env.local scripts/normalizar-marcas.mjs
```

Revisar el listado de cambios propuestos antes de correrlo con `--apply`.
