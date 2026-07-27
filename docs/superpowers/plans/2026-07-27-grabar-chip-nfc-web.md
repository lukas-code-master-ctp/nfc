# Grabar el chip NFC desde la web app — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para el seguimiento.

**Goal:** Que un administrador pueda grabar la URL pública del vehículo en un chip NFC desde la ficha → pestaña Ajustes, sin salir de TapCar ni usar NFC Tools.

**Architecture:** Todo ocurre en el navegador con la API Web NFC (`NDEFReader`). Cero cambios de servidor: no hay endpoints, ni campos de Firestore, ni tipos de dominio nuevos — escribir un chip solo copia al chip una URL que ya está en pantalla. La lógica traducible a mensajes vive pura en `lib/nfc/escritura.ts`; el componente `GrabarChip` maneja la máquina de estados y el hardware.

**Tech Stack:** Next 16 (App Router), React client components, TypeScript estricto, Tailwind v4 con los tokens de `app/globals.css`, Vitest + @testing-library/react (jsdom).

**Spec:** [`docs/superpowers/specs/2026-07-27-grabar-chip-nfc-web-design.md`](../specs/2026-07-27-grabar-chip-nfc-web-design.md)

## Global Constraints

- **Idioma:** todo el código, UI, comentarios y mensajes en español neutro (Chile). Usa "tú", nunca "vos".
- **Soporte:** Web NFC existe solo en Android (Chrome 89+, Samsung Internet 15+, Opera Mobile 64+). En iPhone y escritorio **no existe**: el botón simplemente no se renderiza y el `InfoTip` con las instrucciones de NFC Tools queda como única vía.
- **Detección de soporte:** siempre dentro de un `useEffect` (`'NDEFReader' in window`), nunca en el render — rompería la hidratación del SSR.
- **Record a escribir:** exactamente `{ recordType: 'url', data: <url pública> }`. Con `text` en vez de `url` el iPhone no abre el enlace al acercarlo.
- **Primer intento siempre con `overwrite: false`.** Nunca se pisa un chip sin confirmación del usuario.
- **`NotAllowedError` está sobrecargado** en el spec de Web NFC: es "permiso denegado" Y "`overwrite:false` sobre chip con datos". Solo se desambigua consultando `navigator.permissions.query({ name: 'nfc' })`. Si la consulta falla, se asume permiso denegado (nunca sobrescribir a ciegas).
- **No enmascarar errores desconocidos** como uno específico: cada rama del mapeo es explícita y el resto cae al genérico con `console.error` del error crudo.
- **Estilo visual:** tokens de `app/globals.css` (`tinta`, `acero`, `linea`, `lienzo`, `superficie`, `azul`, `vigente`, `vencido`). Iconos SVG inline, nunca emojis.
- **Tests:** en `__tests__/` junto al módulo. Vitest los toma con `**/__tests__/**/*.test.{ts,tsx}`. No existe `@testing-library/user-event` en el proyecto: usa `fireEvent` de `@testing-library/react`.
- **Antes de cada commit:** `npx tsc --noEmit` y `npm test`. Antes del commit final además `npm run build` y `npx eslint app components lib`.
- **Mensajes de commit** en español, terminados con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `types/web-nfc.d.ts` (crear) | Declaración global mínima de `NDEFReader`. TypeScript no la trae en `lib.dom.d.ts`. |
| `lib/nfc/escritura.ts` (crear) | Lógica pura: traducir errores del navegador a mensajes en español y detectar el caso "chip con datos". Sin DOM ni React. |
| `lib/nfc/__tests__/escritura.test.ts` (crear) | Tests de la lógica pura. |
| `components/nfc/GrabarChip.tsx` (crear) | Client component: botón + hoja de grabado a pantalla completa. Máquina de 5 estados. |
| `components/nfc/__tests__/GrabarChip.test.tsx` (crear) | Tests del componente con un `NDEFReader` falso. |
| `components/NfcTokenPanel.tsx` (modificar) | Monta `GrabarChip` y acepta la nueva prop `patente`. |
| `components/__tests__/NfcTokenPanel.test.tsx` (crear) | Test de que sin soporte NFC el panel queda como hoy. |
| `app/(app)/vehiculos/[id]/page.tsx:175` (modificar) | Pasa `patente` al panel. |

---

### Task 1: Lógica pura de errores + tipos de Web NFC

**Files:**
- Create: `types/web-nfc.d.ts`
- Create: `lib/nfc/escritura.ts`
- Test: `lib/nfc/__tests__/escritura.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type MensajeNfc = { titulo: string; detalle: string }`
  - `type EstadoPermiso = 'granted' | 'denied' | 'prompt' | 'desconocido'`
  - `const MENSAJE_TIMEOUT: MensajeNfc`
  - `function mensajeErrorNfc(err: unknown): MensajeNfc`
  - `function esChipConDatos(err: unknown, permiso: EstadoPermiso): boolean`
  - Global: `class NDEFReader` con `write(message: NDEFMessageInit, options?: NDEFWriteOptions): Promise<void>`, y `Window.NDEFReader?: typeof NDEFReader`.

- [ ] **Step 1: Escribir el test que falla**

Crea `lib/nfc/__tests__/escritura.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mensajeErrorNfc, esChipConDatos, MENSAJE_TIMEOUT } from '@/lib/nfc/escritura'

/** Arma un DOMException-like: lo que importa del error es su `name`. */
const errorCon = (name: string) => Object.assign(new Error('falló'), { name })

describe('mensajeErrorNfc', () => {
  it('explica el permiso denegado', () => {
    expect(mensajeErrorNfc(errorCon('NotAllowedError')).titulo).toBe('Falta el permiso de NFC')
  })

  it('explica el NFC apagado', () => {
    expect(mensajeErrorNfc(errorCon('NotReadableError')).titulo).toBe('El NFC del teléfono está apagado')
  })

  it('explica el chip incompatible', () => {
    expect(mensajeErrorNfc(errorCon('NotSupportedError')).titulo).toBe('Este chip no se puede grabar')
  })

  it('explica que se soltó el chip a mitad de camino', () => {
    expect(mensajeErrorNfc(errorCon('NetworkError')).titulo).toBe('Se soltó el chip antes de terminar')
  })

  it('cae al mensaje genérico ante un error desconocido', () => {
    expect(mensajeErrorNfc(errorCon('BoomError')).titulo).toBe('No pudimos grabar el chip')
  })

  it('no explota si lo que llega no es un Error', () => {
    expect(mensajeErrorNfc('qué pasó').titulo).toBe('No pudimos grabar el chip')
  })

  it('siempre trae un detalle no vacío', () => {
    for (const name of ['NotAllowedError', 'NotReadableError', 'NotSupportedError', 'NetworkError', 'X']) {
      expect(mensajeErrorNfc(errorCon(name)).detalle.length).toBeGreaterThan(0)
    }
  })

  it('el mensaje de timeout es propio y no viene de una excepción', () => {
    expect(MENSAJE_TIMEOUT.titulo).toBe('No detectamos ningún chip')
  })
})

describe('esChipConDatos', () => {
  it('es true con NotAllowedError y el permiso concedido', () => {
    expect(esChipConDatos(errorCon('NotAllowedError'), 'granted')).toBe(true)
  })

  it('es false si el permiso no está concedido: ahí el NotAllowedError fue del permiso', () => {
    expect(esChipConDatos(errorCon('NotAllowedError'), 'prompt')).toBe(false)
    expect(esChipConDatos(errorCon('NotAllowedError'), 'denied')).toBe(false)
    expect(esChipConDatos(errorCon('NotAllowedError'), 'desconocido')).toBe(false)
  })

  it('es false para cualquier otro error aunque haya permiso', () => {
    expect(esChipConDatos(errorCon('NetworkError'), 'granted')).toBe(false)
    expect(esChipConDatos(null, 'granted')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/nfc
```

Esperado: FAIL — `Failed to resolve import "@/lib/nfc/escritura"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crea `lib/nfc/escritura.ts`:

```ts
// Lógica pura de la escritura de chips NFC: traduce los errores del navegador a
// mensajes accionables en español. Sin DOM ni React, para poder testearla.

export type MensajeNfc = { titulo: string; detalle: string }

/** Estado del permiso 'nfc'. 'desconocido' = el navegador no permitió consultarlo. */
export type EstadoPermiso = 'granted' | 'denied' | 'prompt' | 'desconocido'

/** El corte por tiempo no viene de una excepción: lo decide el componente. */
export const MENSAJE_TIMEOUT: MensajeNfc = {
  titulo: 'No detectamos ningún chip',
  detalle: 'Vuelve a intentar y mantén el chip apoyado en la parte de arriba del teléfono.',
}

function nombreDe(err: unknown): string {
  return err instanceof Error ? err.name : ''
}

/**
 * El spec de Web NFC usa `NotAllowedError` para dos cosas distintas: permiso
 * denegado y «overwrite:false sobre un chip que ya tenía datos». El `name` no
 * alcanza para distinguirlas; si el permiso está concedido, solo pudo ser el chip.
 */
export function esChipConDatos(err: unknown, permiso: EstadoPermiso): boolean {
  return nombreDe(err) === 'NotAllowedError' && permiso === 'granted'
}

export function mensajeErrorNfc(err: unknown): MensajeNfc {
  switch (nombreDe(err)) {
    case 'NotAllowedError':
      return {
        titulo: 'Falta el permiso de NFC',
        detalle: 'Ábrelo desde el candado de la barra de direcciones y vuelve a intentar.',
      }
    case 'NotReadableError':
      return {
        titulo: 'El NFC del teléfono está apagado',
        detalle: 'Actívalo en los ajustes del teléfono y reintenta.',
      }
    case 'NotSupportedError':
      return {
        titulo: 'Este chip no se puede grabar',
        detalle: 'Puede estar bloqueado, sin espacio o ser de un tipo incompatible.',
      }
    case 'NetworkError':
      return {
        titulo: 'Se soltó el chip antes de terminar',
        detalle: 'Mantenlo apoyado hasta que aparezca el check verde.',
      }
    default:
      return {
        titulo: 'No pudimos grabar el chip',
        detalle: 'Vuelve a intentar. Si sigue fallando, graba el chip con la app NFC Tools.',
      }
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npx vitest run lib/nfc
```

Esperado: PASS, 11 tests.

- [ ] **Step 5: Declarar los tipos de Web NFC**

Crea `types/web-nfc.d.ts`. **No pongas `import` ni `export` en este archivo**: debe quedar como declaración global. El `tsconfig.json` ya lo incluye vía `**/*.ts`.

```ts
// Web NFC no está en lib.dom.d.ts. Declaramos solo lo que usamos.
// Soporte real: Android Chrome 89+. Ver docs/superpowers/specs/2026-07-27-grabar-chip-nfc-web-design.md

interface NDEFRecordInit {
  recordType: string
  mediaType?: string
  id?: string
  data?: unknown
}

interface NDEFMessageInit {
  records: NDEFRecordInit[]
}

interface NDEFWriteOptions {
  overwrite?: boolean
  signal?: AbortSignal
}

declare class NDEFReader {
  constructor()
  write(message: NDEFMessageInit, options?: NDEFWriteOptions): Promise<void>
}

interface Window {
  /** Solo existe en Android/Chrome. Se accede vía `window.NDEFReader` para poder falsearlo en tests. */
  NDEFReader?: typeof NDEFReader
}
```

- [ ] **Step 6: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: sin salida (éxito).

- [ ] **Step 7: Commit**

```bash
git add types/web-nfc.d.ts lib/nfc/escritura.ts lib/nfc/__tests__/escritura.test.ts
git commit -m "feat(nfc): logica pura de errores de grabado + tipos de Web NFC"
```

---

### Task 2: Componente GrabarChip

**Files:**
- Create: `components/nfc/GrabarChip.tsx`
- Test: `components/nfc/__tests__/GrabarChip.test.tsx`

**Interfaces:**
- Consumes de Task 1: `mensajeErrorNfc`, `esChipConDatos`, `MENSAJE_TIMEOUT`, `MensajeNfc`, `EstadoPermiso`, y el global `Window.NDEFReader`.
- Produces: `export default function GrabarChip({ url, patente }: { url: string; patente: string })`. Devuelve `null` si el navegador no soporta NFC.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `components/nfc/__tests__/GrabarChip.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import GrabarChip from '@/components/nfc/GrabarChip'

const URL_CHIP = 'https://app.tapcar.cl/v/abc123'
const errorCon = (name: string) => Object.assign(new Error('falló'), { name })

let write: ReturnType<typeof vi.fn>

/** Instala un NDEFReader falso; sin esto el componente se considera no soportado. */
function conSoporteNfc() {
  window.NDEFReader = class {
    write = write
  } as unknown as typeof window.NDEFReader
}

function conPermiso(state: string) {
  Object.defineProperty(navigator, 'permissions', {
    value: { query: vi.fn().mockResolvedValue({ state }) },
    configurable: true,
  })
}

const pintar = () => render(<GrabarChip url={URL_CHIP} patente="ABCD-12" />)
const botonGrabar = () => screen.getByRole('button', { name: /grabar chip/i })

beforeEach(() => {
  write = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete (window as { NDEFReader?: unknown }).NDEFReader
  vi.restoreAllMocks()
})

describe('GrabarChip', () => {
  it('no renderiza nada si el navegador no soporta NFC', () => {
    pintar()
    expect(screen.queryByRole('button', { name: /grabar chip/i })).toBeNull()
  })

  it('escribe la URL como record de tipo url, sin sobrescribir', async () => {
    conSoporteNfc()
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))

    await waitFor(() => expect(screen.getByText('Chip grabado')).toBeDefined())
    expect(write).toHaveBeenCalledWith(
      { records: [{ recordType: 'url', data: URL_CHIP }] },
      expect.objectContaining({ overwrite: false }),
    )
    expect(screen.getByText('ABCD-12')).toBeDefined()
  })

  it('pide confirmación si el chip ya tenía datos y recién ahí sobrescribe', async () => {
    conSoporteNfc()
    conPermiso('granted')
    write.mockRejectedValueOnce(errorCon('NotAllowedError'))
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))

    await waitFor(() => expect(screen.getByText(/ya tiene información grabada/i)).toBeDefined())
    expect(write).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /sobrescribir/i }))
    await waitFor(() => expect(screen.getByText('Chip grabado')).toBeDefined())
    expect(write).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ overwrite: true }))
  })

  it('con el permiso denegado muestra el error de permiso, no la confirmación', async () => {
    conSoporteNfc()
    conPermiso('prompt')
    write.mockRejectedValueOnce(errorCon('NotAllowedError'))
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))

    await waitFor(() => expect(screen.getByText('Falta el permiso de NFC')).toBeDefined())
    expect(screen.queryByRole('button', { name: /sobrescribir/i })).toBeNull()
  })

  it('traduce un error del navegador a su mensaje', async () => {
    conSoporteNfc()
    write.mockRejectedValueOnce(errorCon('NotReadableError'))
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))

    await waitFor(() => expect(screen.getByText('El NFC del teléfono está apagado')).toBeDefined())
  })

  it('cancelar aborta la escritura y vuelve al panel sin error', async () => {
    conSoporteNfc()
    write.mockImplementation((_msg: unknown, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(errorCon('AbortError')))
      }),
    )
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))
    await waitFor(() => expect(screen.getByText(/acerca el chip/i)).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(screen.queryByText(/acerca el chip/i)).toBeNull())
    expect(screen.queryByText(/no pudimos grabar/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
npx vitest run components/nfc
```

Esperado: FAIL — `Failed to resolve import "@/components/nfc/GrabarChip"`.

- [ ] **Step 3: Escribir el componente**

Crea `components/nfc/GrabarChip.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import {
  mensajeErrorNfc,
  esChipConDatos,
  MENSAJE_TIMEOUT,
  type MensajeNfc,
  type EstadoPermiso,
} from '@/lib/nfc/escritura'

type Estado = 'idle' | 'esperando' | 'confirmar' | 'ok' | 'error'

/** Si en un minuto no apareció ningún chip, cortamos y avisamos. */
const TIMEOUT_MS = 60_000

async function estadoPermisoNfc(): Promise<EstadoPermiso> {
  try {
    const st = await navigator.permissions.query({ name: 'nfc' as PermissionName })
    return st.state
  } catch {
    return 'desconocido'
  }
}

export default function GrabarChip({ url, patente }: { url: string; patente: string }) {
  const [soportado, setSoportado] = useState(false)
  const [estado, setEstado] = useState<Estado>('idle')
  const [error, setError] = useState<MensajeNfc | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Cancelar y timeout abortan con el mismo controller y ambos lanzan AbortError:
  // el motivo se lleva acá, no en el name de la excepción.
  const motivoRef = useRef<'cancelado' | 'timeout' | null>(null)

  useEffect(() => {
    setSoportado('NDEFReader' in window)
  }, [])

  async function grabar(overwrite: boolean) {
    setError(null)
    setEstado('esperando')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    motivoRef.current = null
    const timer = setTimeout(() => {
      motivoRef.current = 'timeout'
      ctrl.abort()
    }, TIMEOUT_MS)

    try {
      const lector = new window.NDEFReader!()
      await lector.write({ records: [{ recordType: 'url', data: url }] }, { overwrite, signal: ctrl.signal })
      setEstado('ok')
    } catch (err) {
      if (motivoRef.current === 'cancelado') {
        setEstado('idle')
        return
      }
      if (motivoRef.current === 'timeout') {
        setError(MENSAJE_TIMEOUT)
        setEstado('error')
        return
      }
      if (!overwrite && esChipConDatos(err, await estadoPermisoNfc())) {
        setEstado('confirmar')
        return
      }
      console.error('nfc_write', err)
      setError(mensajeErrorNfc(err))
      setEstado('error')
    } finally {
      clearTimeout(timer)
      abortRef.current = null
    }
  }

  function cancelar() {
    motivoRef.current = 'cancelado'
    abortRef.current?.abort()
    setEstado('idle')
  }

  if (!soportado) return null

  return (
    <>
      <button
        type="button"
        onClick={() => grabar(false)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <rect x="3.5" y="3" width="9.5" height="18" rx="2.2" />
          <path d="M16.5 9.5a5 5 0 0 1 0 5" />
          <path d="M19.2 7.3a9 9 0 0 1 0 9.4" />
        </svg>
        Grabar chip
      </button>

      {estado !== 'idle' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Grabar chip NFC"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-lienzo/95 px-8 text-center backdrop-blur-sm"
        >
          {estado === 'esperando' && (
            <>
              <span className="relative flex size-20 items-center justify-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-azul/30" />
                <span className="relative flex size-20 items-center justify-center rounded-full bg-azul/10 text-azul">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-9" aria-hidden="true">
                    <rect x="3.5" y="3" width="9.5" height="18" rx="2.2" />
                    <path d="M16.5 9.5a5 5 0 0 1 0 5" />
                    <path d="M19.2 7.3a9 9 0 0 1 0 9.4" />
                  </svg>
                </span>
              </span>
              <p className="text-lg font-semibold text-tinta">Acerca el chip a la parte de arriba del teléfono</p>
              <p className="text-sm text-acero">Mantenlo apoyado hasta que aparezca el check.</p>
              <button type="button" onClick={cancelar} className="text-sm font-medium text-acero hover:underline">
                Cancelar
              </button>
            </>
          )}

          {estado === 'confirmar' && (
            <>
              <p className="text-lg font-semibold text-tinta">Este chip ya tiene información grabada</p>
              <p className="text-sm text-acero">
                Si pertenece a otro vehículo, ese vehículo se quedará sin chip.
              </p>
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => grabar(true)}
                  className="rounded-lg bg-azul px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
                >
                  Sobrescribir
                </button>
                <button type="button" onClick={() => setEstado('idle')} className="text-sm font-medium text-acero hover:underline">
                  Cancelar
                </button>
              </div>
            </>
          )}

          {estado === 'ok' && (
            <>
              <span className="flex size-20 items-center justify-center rounded-full bg-vigente/10 text-vigente">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-10" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <p className="text-lg font-semibold text-tinta">Chip grabado</p>
              <p className="text-2xl font-bold tracking-tight text-tinta">{patente}</p>
              <button
                type="button"
                onClick={() => setEstado('idle')}
                className="rounded-lg bg-azul px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
              >
                Listo
              </button>
            </>
          )}

          {estado === 'error' && error && (
            <>
              <span className="flex size-20 items-center justify-center rounded-full bg-[#FCE7E7] text-vencido">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-9" aria-hidden="true">
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
              </span>
              <p className="text-lg font-semibold text-tinta">{error.titulo}</p>
              <p className="text-sm text-acero">{error.detalle}</p>
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => grabar(false)}
                  className="rounded-lg bg-azul px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
                >
                  Reintentar
                </button>
                <button type="button" onClick={() => setEstado('idle')} className="text-sm font-medium text-acero hover:underline">
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
npx vitest run components/nfc
```

Esperado: PASS, 6 tests.

- [ ] **Step 5: Verificar tipos y lint**

```bash
npx tsc --noEmit && npx eslint components/nfc
```

Esperado: sin salida. Si ESLint reclama `react-hooks/set-state-in-effect`, es **warning** a propósito en este proyecto (ver `eslint.config.mjs`): no lo "arregles" moviendo la detección al render — rompería la hidratación.

- [ ] **Step 6: Commit**

```bash
git add components/nfc
git commit -m "feat(nfc): componente para grabar el chip con hoja de estado"
```

---

### Task 3: Montarlo en el panel y verificar con hardware real

**Files:**
- Modify: `components/NfcTokenPanel.tsx`
- Modify: `app/(app)/vehiculos/[id]/page.tsx:175`
- Test: `components/__tests__/NfcTokenPanel.test.tsx`

**Interfaces:**
- Consumes de Task 2: `GrabarChip({ url, patente })`.
- Produces: `NfcTokenPanel({ vehicleId, initialUrl, patente })` — la prop `patente` es nueva y obligatoria.

- [ ] **Step 1: Escribir el test que falla**

Crea `components/__tests__/NfcTokenPanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NfcTokenPanel from '@/components/NfcTokenPanel'

const URL_CHIP = 'https://app.tapcar.cl/v/abc123'

describe('NfcTokenPanel', () => {
  it('muestra la URL pública del vehículo', () => {
    render(<NfcTokenPanel vehicleId="v1" initialUrl={URL_CHIP} patente="ABCD-12" />)
    expect(screen.getByText(URL_CHIP)).toBeDefined()
  })

  it('sin soporte de Web NFC no ofrece grabar y mantiene las instrucciones', () => {
    render(<NfcTokenPanel vehicleId="v1" initialUrl={URL_CHIP} patente="ABCD-12" />)
    expect(screen.queryByRole('button', { name: /grabar chip/i })).toBeNull()
    expect(screen.getByRole('button', { name: /cómo grabar el chip/i })).toBeDefined()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run components/__tests__/NfcTokenPanel.test.tsx
```

Esperado: FAIL — TypeScript/React se queja de la prop `patente` que aún no existe.

- [ ] **Step 3: Montar GrabarChip en el panel**

En `components/NfcTokenPanel.tsx`:

1. Agrega el import arriba, junto a los otros:

```tsx
import GrabarChip from '@/components/nfc/GrabarChip'
```

2. Cambia la firma para recibir `patente`:

```tsx
export default function NfcTokenPanel({
  vehicleId,
  initialUrl,
  patente,
}: {
  vehicleId: string
  initialUrl: string
  patente: string
}) {
```

3. Justo **después** del `</div>` que cierra el bloque de la URL (el `div` con `bg-lienzo`) y **antes** del `<p className="mt-2 ...">` de las instrucciones, inserta:

```tsx
      <GrabarChip url={url} patente={patente} />
```

Ojo: pasa `url` (el estado), no `initialUrl` — así al regenerar el token el botón graba el enlace nuevo.

4. Ajusta la primera línea del `InfoTip` para que las instrucciones de NFC Tools se lean como la alternativa y no como el camino principal. Reemplaza:

```tsx
          <p className="mt-1 text-xs text-acero">
            Recomendamos la app gratuita <strong className="text-tinta">NFC Tools</strong> (Android e iPhone).
          </p>
```

por:

```tsx
          <p className="mt-1 text-xs text-acero">
            Desde un Android con Chrome puedes usar el botón <strong className="text-tinta">Grabar chip</strong>.
            En iPhone no se puede grabar desde el navegador: usa la app gratuita{' '}
            <strong className="text-tinta">NFC Tools</strong>.
          </p>
```

- [ ] **Step 4: Pasar la patente desde la página del vehículo**

En `app/(app)/vehiculos/[id]/page.tsx`, línea 175, reemplaza:

```tsx
            <NfcTokenPanel vehicleId={vehicle.id} initialUrl={publicUrl} />
```

por:

```tsx
            <NfcTokenPanel vehicleId={vehicle.id} initialUrl={publicUrl} patente={vehicle.patente} />
```

- [ ] **Step 5: Correr toda la suite**

```bash
npm test
```

Esperado: PASS, incluidos los 2 tests nuevos de `NfcTokenPanel` y los 6 de `GrabarChip`. Ningún test previo roto.

- [ ] **Step 6: Verificación completa antes de commitear**

```bash
npx tsc --noEmit && npm run build && npx eslint app components lib
```

Esperado: los tres sin errores.

- [ ] **Step 7: Commit**

```bash
git add components/NfcTokenPanel.tsx components/__tests__/NfcTokenPanel.test.tsx "app/(app)/vehiculos/[id]/page.tsx"
git commit -m "feat(nfc): boton para grabar el chip en el panel del vehiculo"
```

- [ ] **Step 8: Verificación manual con un chip real**

Esto **no** lo puede hacer un agente: requiere un Android con Chrome, NFC encendido y un chip. Correr contra el deploy de Vercel (o `npm run dev` con HTTPS; Web NFC exige contexto seguro y `localhost` cuenta como seguro solo en el propio dispositivo).

1. Chip virgen → «Grabar chip» → aparece la hoja → acercar el chip → check verde con la patente correcta.
2. Retirar el chip del teléfono y volver a acercarlo → abre la ficha pública del vehículo correcto.
3. Repetir sobre el mismo chip → debe aparecer «Este chip ya tiene información grabada» → Sobrescribir → check verde.
4. Empezar a grabar y tocar Cancelar sin acercar nada → vuelve al panel, sin mensaje de error.
5. Apagar el NFC del teléfono e intentar → «El NFC del teléfono está apagado».
6. Denegar el permiso de NFC en el prompt de Chrome → «Falta el permiso de NFC».
7. Abrir la misma ficha en un iPhone → el panel se ve como siempre, sin botón, con el `InfoTip` mencionando NFC Tools.

Si algo del 1 al 6 falla, **no** cierres la tarea: anota el `console.error('nfc_write', ...)` que quedó en la consola de Chrome (chrome://inspect desde el escritorio) y arréglalo antes de dar por terminado.

---

## Notas de implementación

- **No agregues `@types/w3c-web-nfc`**: `types/web-nfc.d.ts` cubre lo que usamos y evita una dependencia por tres métodos.
- **No uses `NDEFReader` global directo** en el componente (`new NDEFReader()`): usa `window.NDEFReader` para que los tests puedan falsearlo.
- **No agregues E2E de Playwright**: no hay emulación de NFC y el hardware no existe en CI. Un test así sería teatro.
- **Fuera de alcance** (decidido en el spec, no lo agregues por iniciativa propia): leer/verificar chips, `makeReadOnly()`, grabado en serie, grabar desde el modal de alta, y cualquier camino para iPhone.
