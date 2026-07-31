# Sesión persistente — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que la sesión de TapCar dure 14 días renovables en vez de una hora, se repare sola, y pueda cerrarse a distancia.

**Architecture:** La cookie deja de ser el ID token de Firebase (1 h de vida) y pasa a ser una *session cookie* de Firebase (14 días). Un componente cliente la re-emite en cada evento de token, montado en el layout de `(app)` y en `/login`. La revocación se apoya en un campo de `users/{uid}` comprobado dentro de `getMembership()`, que ya lee ese documento.

**Tech Stack:** Next.js 16 (App Router), firebase-admin (`createSessionCookie`/`verifySessionCookie`/`revokeRefreshTokens`), Firebase JS SDK (`onIdTokenChanged`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-31-sesion-persistente-design.md`

## Global Constraints

- Duración de la sesión: **14 días** (`SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000`). Es el máximo que permite Firebase.
- `verifySessionCookie` se llama **sin `checkRevoked`**: costaría una llamada de red a Firebase en cada carga de página.
- `getCurrentUser()` **no puede leer Firestore**: lo llama el layout de `(app)` en cada navegación.
- `POST /api/session/renovar` **no puede llamar a `ensureProvisioned`** ni mandar correos: corre en cada apertura de la app. Login provisiona; renovación no.
- `SESSION_MAX_AGE_MS` va en `lib/auth/constants.ts`, el archivo **sin imports**, porque `proxy.ts` corre en el edge runtime y no puede arrastrar firebase-admin.
- `<SesionViva />` **no** se monta en el layout raíz: ese envuelve también la ficha pública `/v/[token]`.
- `sesionesValidasDesde` se guarda **truncado al segundo**.
- Todo el código, UI, comentarios y mensajes en **español neutro (Chile)**, tratando de "tú".
- Tras cada tarea: `npx tsc --noEmit`, `npx eslint app components lib` (0 errores; los 6 warnings de `react-hooks/set-state-in-effect` son preexistentes y esperados) y `npm run build`.

> **Despliegue:** las tareas 1 y 2 deben salir **juntas** a producción. La tarea 1 sola invalida todas las cookies en circulación sin dejar nada que las re-emita, así que todos tendrían que escribir su contraseña de nuevo. Con la 2, rebotan al login y entran solos.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `lib/auth/constants.ts` | `SESSION_COOKIE` + `SESSION_MAX_AGE_MS`, sin imports (edge-safe) | 1 |
| `lib/firebase/admin.ts` | Envoltorios `createSessionCookie` / `verifySessionCookie` / `revokeRefreshTokens` | 1, 4 |
| `lib/auth/session.ts` | Leer y verificar la cookie; exponer `uid`/`email`/`authTime` | 1 |
| `app/api/session/route.ts` | Login: verificar ID token, provisionar, acuñar la cookie | 1 |
| `app/api/session/renovar/route.ts` | Renovar la cookie, sin provisionar | 2 |
| `components/auth/SesionViva.tsx` | Re-emitir la cookie ante cada evento de token | 2 |
| `lib/auth/revocacion.ts` | Lógica pura: `sesionRevocada` + `instanteDeCorte` | 3 |
| `lib/auth/membership.ts` | Resolver membresía y **comprobar revocación** | 3 |
| `app/api/session/revocar/route.ts` | Revocar tokens + estampar corte + borrar cookie | 4 |
| `lib/data/profile.ts` | `revocarSesiones(uid, corteIso)` | 4 |
| `components/profile/CerrarSesionesCard.tsx` | UI de revocación en `/perfil` | 4 |

---

## Task 1: La cookie deja de ser un ID token

**Files:**
- Modify: `lib/auth/constants.ts`
- Modify: `lib/firebase/admin.ts` (agregar al final, junto a `verifyIdToken`)
- Modify: `lib/auth/session.ts`
- Modify: `app/api/session/route.ts:46-54`
- Test: `app/api/__tests__/session-cookie.test.ts` (crear)
- Test: `lib/auth/__tests__/session.test.ts` (modificar: el mock apunta a `verifyIdToken`)
- Test: `app/api/__tests__/session-bienvenida.test.ts:82` (modificar: afirma que la cookie vale `'tok'`)

**Interfaces:**
- Produce: `SESSION_MAX_AGE_MS: number` (milisegundos) en `lib/auth/constants.ts`
- Produce: `createSessionCookie(idToken: string, expiresIn: number): Promise<string>` y `verifySessionCookie(cookie: string): Promise<DecodedIdToken>` en `lib/firebase/admin.ts`
- Produce: `getCurrentUser(): Promise<{ uid: string; email: string; authTime?: number } | null>` — `authTime` en **segundos** desde epoch

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/__tests__/session-cookie.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/constants'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  ensureProvisioned: vi.fn(),
  sendBienvenidaEmail: vi.fn(),
  after: vi.fn((cb: () => unknown) => { void cb() }),
}))

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: mocks.after,
}))
vi.mock('@/lib/firebase/admin', () => ({
  verifyIdToken: mocks.verifyIdToken,
  createSessionCookie: mocks.createSessionCookie,
}))
vi.mock('@/lib/data/companies', () => ({ ensureProvisioned: mocks.ensureProvisioned }))
vi.mock('@/lib/email/resend', () => ({ sendBienvenidaEmail: mocks.sendBienvenidaEmail }))

const { POST } = await import('@/app/api/session/route')

const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.after.mockImplementation((cb: () => unknown) => { void cb() })
  mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl' })
  mocks.ensureProvisioned.mockResolvedValue('ya_estaba')
  mocks.createSessionCookie.mockResolvedValue('cookie-de-sesion')
})

describe('qué guarda la cookie', () => {
  it('la session cookie de Firebase, no el ID token', async () => {
    const res = await POST(req({ idToken: 'tok' }))
    expect(mocks.createSessionCookie).toHaveBeenCalledWith('tok', SESSION_MAX_AGE_MS)
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe('cookie-de-sesion')
  })
})

describe('cuánto dura', () => {
  it('14 días, y el maxAge de la cookie va en segundos', async () => {
    const res = await POST(req({ idToken: 'tok' }))
    expect(res.cookies.get(SESSION_COOKIE)?.maxAge).toBe(14 * 24 * 60 * 60)
  })

  it('SESSION_MAX_AGE_MS está en milisegundos, como lo pide Firebase', () => {
    expect(SESSION_MAX_AGE_MS).toBe(14 * 24 * 60 * 60 * 1000)
  })
})

describe('sigue igual de protegida', () => {
  it('httpOnly y sameSite lax', async () => {
    const res = await POST(req({ idToken: 'tok' }))
    const c = res.cookies.get(SESSION_COOKIE)!
    expect(c.httpOnly).toBe(true)
    expect(c.sameSite).toBe('lax')
  })
})

describe('cuando no se puede acuñar', () => {
  it('responde 500 y NO deja una cookie a medias', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.createSessionCookie.mockRejectedValue(new Error('token vencido'))
    const res = await POST(req({ idToken: 'tok' }))
    expect(res.status).toBe(500)
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined()
    err.mockRestore()
  })

  it('el token inválido sigue dando 401 antes de acuñar nada', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('bad token'))
    const res = await POST(req({ idToken: 'malo' }))
    expect(res.status).toBe(401)
    expect(mocks.createSessionCookie).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run app/api/__tests__/session-cookie.test.ts`
Esperado: FALLA — `SESSION_MAX_AGE_MS` no existe todavía en `lib/auth/constants.ts`.

- [ ] **Step 3: Agregar la constante**

Reemplazar el contenido completo de `lib/auth/constants.ts`:

```ts
// Sin imports: seguro para edge runtime (proxy.ts) y server.
export const SESSION_COOKIE = 'session_token'

/**
 * Cuánto dura la sesión. 14 días es el máximo que acepta `createSessionCookie`
 * de Firebase. Vive acá y no en `session.ts` porque `proxy.ts` corre en el edge
 * runtime y no puede importar nada que arrastre firebase-admin.
 *
 * En MILISEGUNDOS: es lo que pide Firebase. El `maxAge` de la cookie va en
 * segundos, así que se divide en el punto de uso.
 */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
```

- [ ] **Step 4: Agregar los envoltorios del Admin SDK**

Agregar al final de `lib/firebase/admin.ts`, después de `verifyIdToken`:

```ts
/** Acuña la cookie de sesión. Requiere un ID token vigente; lanza si no lo es. */
export async function createSessionCookie(idToken: string, expiresIn: number) {
  return getAuth(adminApp()).createSessionCookie(idToken, { expiresIn })
}

/**
 * Verifica la cookie de sesión. **Sin `checkRevoked`** a propósito: esa opción
 * hace una llamada de red a Firebase en cada verificación, o sea en cada carga
 * de página. La revocación se comprueba contra Firestore en `getMembership()`,
 * que ya lee ese documento y por lo tanto no cuesta consultas extra.
 */
export async function verifySessionCookie(cookie: string) {
  return getAuth(adminApp()).verifySessionCookie(cookie)
}
```

- [ ] **Step 5: Acuñar la cookie en el login**

En `app/api/session/route.ts`, cambiar el import de la línea 4:

```ts
import { verifyIdToken, createSessionCookie } from '@/lib/firebase/admin'
```

y el import de la línea 3 para traer también la constante:

```ts
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/constants'
```

Reemplazar el bloque final del `POST` (hoy líneas 46-54) por:

```ts
  let sessionCookie: string
  try {
    sessionCookie = await createSessionCookie(idToken, SESSION_MAX_AGE_MS)
  } catch (e) {
    // Falla ruidosa: `LoginForm` distingue `ErrorSesion` por el status y lo
    // muestra. Enmascararlo dejaría al usuario en una pantalla colgada sin
    // ningún diagnóstico, que es el bug que ya se arregló una vez.
    console.error('createSessionCookie', e)
    return NextResponse.json({ error: 'session cookie' }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS / 1000, // el maxAge de una cookie va en segundos
  })
  return res
```

Nota: el import de la línea 3 hoy dice `from '@/lib/auth/session'`; cambiarlo a `'@/lib/auth/constants'` para no arrastrar `next/headers` a esta ruta.

- [ ] **Step 6: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run app/api/__tests__/session-cookie.test.ts`
Esperado: PASA (6 tests).

- [ ] **Step 7: Verificar la cookie con `verifySessionCookie`**

Reemplazar el contenido completo de `lib/auth/session.ts`:

```ts
import { cookies } from 'next/headers'
import { verifySessionCookie } from '@/lib/firebase/admin'
import { SESSION_COOKIE } from '@/lib/auth/constants'

export { SESSION_COOKIE }

export interface SesionActual {
  uid: string
  email: string
  /**
   * Instante del inicio de sesión original, en SEGUNDOS desde epoch. Lo consume
   * la revocación (`lib/auth/revocacion.ts`). Ojo: no es el momento en que se
   * acuñó la cookie — al renovar sigue siendo el del login original.
   */
  authTime?: number
}

/**
 * Quién está en sesión, o null. **No lee Firestore**: lo llama el layout de
 * `(app)` en cada navegación, así que una consulta acá sería un costo
 * permanente. La comprobación de revocación vive en `getMembership()`.
 */
export async function getCurrentUser(): Promise<SesionActual | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const decoded = await verifySessionCookie(token)
    return { uid: decoded.uid, email: decoded.email ?? '', authTime: decoded.auth_time }
  } catch {
    return null
  }
}
```

- [ ] **Step 8: Actualizar el test de `getCurrentUser`**

Reemplazar el contenido completo de `lib/auth/__tests__/session.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockVerify, mockCookieGet } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockCookieGet: vi.fn(),
}))
vi.mock('@/lib/firebase/admin', () => ({ verifySessionCookie: mockVerify }))
vi.mock('next/headers', () => ({ cookies: () => ({ get: mockCookieGet }) }))

import { getCurrentUser } from '@/lib/auth/session'

beforeEach(() => {
  mockVerify.mockReset()
  mockCookieGet.mockReset()
})

describe('getCurrentUser', () => {
  it('null sin cookie', async () => {
    mockCookieGet.mockReturnValue(undefined)
    expect(await getCurrentUser()).toBeNull()
  })

  it('verifica la cookie de SESIÓN, no un ID token', async () => {
    mockCookieGet.mockReturnValue({ value: 'cookie' })
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', auth_time: 1000 })
    await getCurrentUser()
    expect(mockVerify).toHaveBeenCalledWith('cookie')
  })

  it('expone uid, email y authTime', async () => {
    mockCookieGet.mockReturnValue({ value: 'cookie' })
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', auth_time: 1755000000 })
    expect(await getCurrentUser()).toEqual({ uid: 'u1', email: 'a@b.cl', authTime: 1755000000 })
  })

  it('null si la cookie es inválida o venció', async () => {
    mockCookieGet.mockReturnValue({ value: 'bad' })
    mockVerify.mockRejectedValue(new Error('invalid'))
    expect(await getCurrentUser()).toBeNull()
  })
})
```

- [ ] **Step 9: Arreglar el test de bienvenida que afirmaba sobre el ID token**

En `app/api/__tests__/session-bienvenida.test.ts`:

1. Agregar `createSessionCookie: vi.fn(),` al objeto `vi.hoisted` (línea 5-12).
2. Cambiar el mock del módulo (línea 18) a:

```ts
vi.mock('@/lib/firebase/admin', () => ({
  verifyIdToken: mocks.verifyIdToken,
  createSessionCookie: mocks.createSessionCookie,
}))
```

3. Agregar en el `beforeEach`, después de `mocks.verifyIdToken.mockResolvedValue(...)`:

```ts
  mocks.createSessionCookie.mockResolvedValue('cookie-de-sesion')
```

4. Cambiar la aserción de la línea 82 a:

```ts
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe('cookie-de-sesion')
```

- [ ] **Step 10: Correr todo y verificar**

Ejecutar: `npx vitest run app lib && npx tsc --noEmit && npx eslint app components lib`
Esperado: todos los tests pasan, tsc sin salida, eslint con `0 errors` (6 warnings preexistentes).

- [ ] **Step 11: Commit**

```bash
git add lib/auth/constants.ts lib/auth/session.ts lib/firebase/admin.ts app/api/session/route.ts lib/auth/__tests__/session.test.ts app/api/__tests__/session-cookie.test.ts app/api/__tests__/session-bienvenida.test.ts
git commit -m "feat(sesion): la cookie pasa a ser una session cookie de Firebase de 14 dias"
```

---

## Task 2: El re-emisor

**Files:**
- Create: `app/api/session/renovar/route.ts`
- Create: `components/auth/SesionViva.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(auth)/login/page.tsx`
- Test: `app/api/__tests__/session-renovar.test.ts` (crear)
- Test: `components/__tests__/SesionViva.test.tsx` (crear)

**Interfaces:**
- Consume: `SESSION_COOKIE`, `SESSION_MAX_AGE_MS` de `lib/auth/constants.ts`; `verifyIdToken`, `createSessionCookie` de `lib/firebase/admin.ts` (Task 1)
- Produce: `POST /api/session/renovar` — recibe `{ idToken: string }`, responde `{ ok: true }` + cookie, o 401
- Produce: `<SesionViva autoEntrar?: boolean />` (default `false`)

- [ ] **Step 1: Escribir el test del endpoint**

Crear `app/api/__tests__/session-renovar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/constants'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  ensureProvisioned: vi.fn(),
  sendBienvenidaEmail: vi.fn(),
}))

vi.mock('@/lib/firebase/admin', () => ({
  verifyIdToken: mocks.verifyIdToken,
  createSessionCookie: mocks.createSessionCookie,
}))
vi.mock('@/lib/data/companies', () => ({ ensureProvisioned: mocks.ensureProvisioned }))
vi.mock('@/lib/email/resend', () => ({ sendBienvenidaEmail: mocks.sendBienvenidaEmail }))

const { POST } = await import('@/app/api/session/renovar/route')

const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl' })
  mocks.createSessionCookie.mockResolvedValue('cookie-nueva')
})

describe('renovar', () => {
  it('acuña una cookie nueva con la misma duración que el login', async () => {
    const res = await POST(req({ idToken: 'tok' }))
    expect(mocks.createSessionCookie).toHaveBeenCalledWith('tok', SESSION_MAX_AGE_MS)
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe('cookie-nueva')
    expect(res.cookies.get(SESSION_COOKIE)?.maxAge).toBe(14 * 24 * 60 * 60)
  })

  it('rechaza un token inválido sin acuñar nada', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('bad'))
    const res = await POST(req({ idToken: 'malo' }))
    expect(res.status).toBe(401)
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined()
  })
})

describe('lo que NO debe hacer', () => {
  // Regresión de costo: este endpoint corre en CADA apertura de la app.
  // `ensureProvisioned` lee Firestore; meterlo acá sería una lectura por
  // apertura, para siempre. Login provisiona; renovación no.
  it('no provisiona: eso costaría una lectura de Firestore por apertura', async () => {
    await POST(req({ idToken: 'tok' }))
    expect(mocks.ensureProvisioned).not.toHaveBeenCalled()
  })

  it('no manda correos', async () => {
    await POST(req({ idToken: 'tok' }))
    expect(mocks.sendBienvenidaEmail).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run app/api/__tests__/session-renovar.test.ts`
Esperado: FALLA — no se puede resolver `@/app/api/session/renovar/route`.

- [ ] **Step 3: Escribir el endpoint**

Crear `app/api/session/renovar/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/constants'
import { verifyIdToken, createSessionCookie } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

/**
 * Renueva la cookie de sesión desde un ID token vigente del cliente.
 *
 * Es un endpoint aparte de `POST /api/session` a propósito: ese llama a
 * `ensureProvisioned` (que lee Firestore) y manda el correo de bienvenida.
 * Este corre en CADA apertura de la app, así que reusarlo pagaría una lectura
 * extra para siempre. **Login provisiona; renovación no.**
 *
 * Tampoco comprueba la revocación, por el mismo costo: eso vive en
 * `getMembership()`. El bucle que eso podría causar se corta en el cliente
 * (`SesionViva`, un solo intento de auto-entrada por carga).
 */
export async function POST(req: NextRequest) {
  const { idToken } = await req.json()
  try {
    await verifyIdToken(idToken)
    const cookie = await createSessionCookie(idToken, SESSION_MAX_AGE_MS)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run app/api/__tests__/session-renovar.test.ts`
Esperado: PASA (4 tests).

- [ ] **Step 5: Escribir el test del componente**

Crear `components/__tests__/SesionViva.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  onIdTokenChanged: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('firebase/auth', () => ({ onIdTokenChanged: mocks.onIdTokenChanged }))
vi.mock('@/lib/firebase/client', () => ({ auth: {} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))

import SesionViva from '@/components/auth/SesionViva'

/** Captura el callback que registra el componente, para dispararlo a mano. */
let emitir: (u: unknown) => void

const usuario = { getIdToken: () => Promise.resolve('tok') }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
  mocks.replace.mockReset()
  mocks.onIdTokenChanged.mockReset()
  mocks.onIdTokenChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
    emitir = cb
    return () => {}
  })
})

describe('con usuario de Firebase', () => {
  it('renueva la cookie del servidor', async () => {
    render(<SesionViva />)
    emitir(usuario)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/session/renovar',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('no navega a ningún lado si no se le pidió auto-entrada', async () => {
    render(<SesionViva />)
    emitir(usuario)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

describe('auto-entrada en el login', () => {
  it('entra al dashboard después de renovar', async () => {
    render(<SesionViva autoEntrar />)
    emitir(usuario)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'))
  })

  // El test del bucle: sin este corte, una sesión revocada renueva la cookie,
  // el dashboard rebota al login, y el componente vuelve a renovar. Para
  // siempre. El ID token cacheado sigue siendo válido hasta una hora después de
  // revocar, así que el bucle es real.
  it('SOLO una vez por carga, aunque el token cambie varias veces', async () => {
    render(<SesionViva autoEntrar />)
    emitir(usuario)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1))
    emitir(usuario)
    emitir(usuario)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(mocks.replace).toHaveBeenCalledTimes(1)
  })

  it('no entra si la renovación falló', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401 } as Response)))
    render(<SesionViva autoEntrar />)
    emitir(usuario)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

describe('sin usuario de Firebase', () => {
  it('borra la cookie del servidor', async () => {
    render(<SesionViva />)
    emitir(null)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/session',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
  })

  it('no intenta renovar', async () => {
    render(<SesionViva />)
    emitir(null)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(fetch).not.toHaveBeenCalledWith('/api/session/renovar', expect.anything())
  })
})

describe('cuando la red falla', () => {
  it('no explota: es best-effort', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))))
    render(<SesionViva autoEntrar />)
    expect(() => emitir(usuario)).not.toThrow()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Correr el test y verificar que falla**

Ejecutar: `npx vitest run components/__tests__/SesionViva.test.tsx`
Esperado: FALLA — no se puede resolver `@/components/auth/SesionViva`.

- [ ] **Step 7: Escribir el componente**

Crear `components/auth/SesionViva.tsx`:

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { onIdTokenChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

/**
 * Mantiene viva la cookie de sesión del servidor.
 *
 * La sesión de Firebase en el CLIENTE no expira nunca (vive en IndexedDB con el
 * refresh token); la del servidor sí. Sin este componente nada vuelve a emitir
 * la cookie después del login: vive 14 días y muere, y el usuario termina
 * expulsado mientras su navegador sigue perfectamente autenticado. Ese era el
 * bug original, cuando la cookie duraba una hora.
 *
 * `onIdTokenChanged` dispara al montar, al iniciar y cerrar sesión, y cada vez
 * que Firebase refresca el token (~cada hora). Así la cookie se renueva sola
 * mientras la app está abierta, y cada apertura corre la ventana de 14 días
 * hacia adelante.
 *
 * `autoEntrar` se usa solo en `/login`: si llegas ahí con una sesión de Firebase
 * viva, te acuña la cookie y entras sin escribir nada.
 */
export default function SesionViva({ autoEntrar = false }: { autoEntrar?: boolean }) {
  const router = useRouter()
  // Un solo intento de auto-entrada por carga. Sin esto, una sesión revocada
  // entra en bucle: renovamos la cookie, el dashboard rebota al login, y el
  // componente vuelve a renovar. El ID token ya cacheado del cliente sigue
  // siendo válido hasta una hora después de revocar, así que el bucle es real,
  // no hipotético.
  const yaEntro = useRef(false)

  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (!user) {
          // Sin usuario de Firebase (cerró sesión, o le revocaron el refresh
          // token): el servidor no debe conservar una cookie viva.
          await fetch('/api/session', { method: 'DELETE' }).catch(() => {})
          return
        }
        try {
          const idToken = await user.getIdToken()
          const res = await fetch('/api/session/renovar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          })
          if (!res.ok) return
          if (autoEntrar && !yaEntro.current) {
            yaEntro.current = true
            router.replace('/dashboard')
          }
        } catch {
          // Best-effort: una renovación fallida no puede sacar al usuario ni
          // romper la pantalla. Se reintenta en el próximo evento de token o en
          // la próxima carga.
        }
      }),
    [autoEntrar, router],
  )

  return null
}
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run components/__tests__/SesionViva.test.tsx`
Esperado: PASA (8 tests).

- [ ] **Step 9: Montarlo en el layout de la app**

En `app/(app)/layout.tsx`, agregar el import:

```tsx
import SesionViva from '@/components/auth/SesionViva'
```

y agregarlo como primer hijo del `<div className="min-h-dvh">`, antes del `<header>`:

```tsx
    <div className="min-h-dvh">
      <SesionViva />
      <header className="sticky top-0 z-20 border-b border-linea bg-superficie/80 backdrop-blur">
```

- [ ] **Step 10: Montarlo en el login, con auto-entrada**

En `app/(auth)/login/page.tsx`, agregar el import:

```tsx
import SesionViva from '@/components/auth/SesionViva'
```

y agregarlo como primer hijo del `<main>`:

```tsx
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <SesionViva autoEntrar />
      <div className="w-full max-w-sm">
```

**No** montarlo en `app/layout.tsx` (el raíz): ese envuelve también la ficha pública `/v/[token]`, donde no debe dispararse nada de autenticación.

- [ ] **Step 11: Verificar todo**

Ejecutar: `npx vitest run app components lib && npx tsc --noEmit && npx eslint app components lib && npm run build`
Esperado: todos los tests pasan, tsc sin salida, eslint con `0 errors`, build exitoso.

- [ ] **Step 12: Commit**

```bash
git add app/api/session/renovar components/auth/SesionViva.tsx app/\(app\)/layout.tsx app/\(auth\)/login/page.tsx app/api/__tests__/session-renovar.test.ts components/__tests__/SesionViva.test.tsx
git commit -m "feat(sesion): re-emisor que renueva la cookie y entra solo al login"
```

---

## Task 3: Revocación — lógica pura y comprobación

**Files:**
- Create: `lib/auth/revocacion.ts`
- Create: `lib/auth/__tests__/revocacion.test.ts`
- Modify: `lib/auth/membership.ts`
- Modify: `app/api/profile/route.ts:13-15`
- Modify: `lib/types.ts:208-217` (interfaz `UserProfile`)
- Modify: `lib/data/profile.ts:14-20` (`getProfile` devuelve el campo nuevo)
- Test: `lib/auth/__tests__/membership.test.ts` (crear)

**Interfaces:**
- Consume: `getCurrentUser(): Promise<{ uid, email, authTime? } | null>` (Task 1)
- Produce: `sesionRevocada(authTimeSegundos: number | undefined, validasDesde: string | undefined): boolean`
- Produce: `instanteDeCorte(ahoraMs: number): string` — ISO truncado al segundo
- Produce: `UserProfile.sesionesValidasDesde?: string`

- [ ] **Step 1: Escribir el test de la lógica pura**

Crear `lib/auth/__tests__/revocacion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sesionRevocada, instanteDeCorte } from '@/lib/auth/revocacion'

/** 2026-07-31T12:00:00Z en segundos, como viene `auth_time`. */
const SEG = Math.floor(Date.parse('2026-07-31T12:00:00.000Z') / 1000)

describe('sin revocación registrada', () => {
  it('nada está revocado: el campo ausente es el caso normal', () => {
    expect(sesionRevocada(SEG, undefined)).toBe(false)
  })

  it('una fecha basura tampoco desconecta a nadie', () => {
    expect(sesionRevocada(SEG, 'no-es-una-fecha')).toBe(false)
  })
})

describe('con revocación registrada', () => {
  it('una sesión anterior al corte queda fuera', () => {
    expect(sesionRevocada(SEG, '2026-07-31T13:00:00.000Z')).toBe(true)
  })

  it('una sesión posterior al corte sigue válida', () => {
    expect(sesionRevocada(SEG, '2026-07-31T11:00:00.000Z')).toBe(false)
  })

  // Las unidades son distintas a propósito: authTime en segundos, el corte en
  // ISO. Comparar sin convertir daría siempre "revocada".
  it('compara segundos contra ISO, no números crudos', () => {
    expect(sesionRevocada(SEG, '2026-07-31T11:59:59.000Z')).toBe(false)
  })
})

describe('el borde del segundo', () => {
  // Revocas a las 12:00:00.500 y vuelves a entrar a las 12:00:00.900: tu
  // authTime se trunca a 12:00:00. Si el corte guardara los milisegundos,
  // quedarías fuera justo después de haber iniciado sesión bien.
  it('quien vuelve a entrar dentro del mismo segundo NO queda fuera', () => {
    const corte = instanteDeCorte(Date.parse('2026-07-31T12:00:00.500Z'))
    expect(sesionRevocada(SEG, corte)).toBe(false)
  })

  it('instanteDeCorte trunca los milisegundos', () => {
    expect(instanteDeCorte(Date.parse('2026-07-31T12:00:00.999Z'))).toBe('2026-07-31T12:00:00.000Z')
  })
})

describe('sin authTime', () => {
  // Falla ABIERTA a propósito: el resto de las barreras sigue en pie, y fallar
  // cerrada acá desconectaría a todos si el claim cambiara de nombre.
  it('se trata como no revocada', () => {
    expect(sesionRevocada(undefined, '2026-07-31T13:00:00.000Z')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run lib/auth/__tests__/revocacion.test.ts`
Esperado: FALLA — no se puede resolver `@/lib/auth/revocacion`.

- [ ] **Step 3: Escribir la lógica pura**

Crear `lib/auth/revocacion.ts`:

```ts
/**
 * Cierre de sesiones a distancia. Sin Firebase, para poder testearlo.
 *
 * Vive aparte porque mezcla dos unidades y ahí es donde se cometen los errores:
 * `auth_time` viene en SEGUNDOS desde epoch y `sesionesValidasDesde` es un ISO.
 */

/**
 * El instante de corte que se guarda al revocar, **truncado al segundo**.
 *
 * El truncado no es cosmético. Revocas a las 12:00:00.500 y vuelves a entrar a
 * las 12:00:00.900: tu `auth_time` se trunca a 12:00:00, que es *menor* que el
 * instante de revocación, y quedarías fuera justo después de haber iniciado
 * sesión bien. Con el corte truncado, la re-entrada da igualdad y la
 * comparación estricta la deja pasar.
 */
export function instanteDeCorte(ahoraMs: number): string {
  return new Date(Math.floor(ahoraMs / 1000) * 1000).toISOString()
}

/** ¿Esta sesión quedó fuera por una revocación posterior a su inicio? */
export function sesionRevocada(
  authTimeSegundos: number | undefined,
  validasDesde: string | undefined,
): boolean {
  if (!validasDesde) return false
  const corte = Date.parse(validasDesde)
  if (Number.isNaN(corte)) return false
  // Sin `authTime` se trata como NO revocada. Falla abierta a propósito: el
  // resto de las barreras sigue en pie, y fallar cerrada acá desconectaría a
  // todos los usuarios si el claim cambiara de nombre.
  if (authTimeSegundos === undefined) return false
  return authTimeSegundos * 1000 < corte
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run lib/auth/__tests__/revocacion.test.ts`
Esperado: PASA (8 tests).

- [ ] **Step 5: Escribir el test de `getMembership`**

Crear `lib/auth/__tests__/membership.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  get: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: mocks.get }) }) },
}))

import { getMembership } from '@/lib/auth/membership'

/** 2026-07-31T12:00:00Z en segundos. */
const SEG = Math.floor(Date.parse('2026-07-31T12:00:00.000Z') / 1000)

const docCon = (data: Record<string, unknown>) => ({ exists: true, data: () => data })
const MIEMBRO = { companyId: 'c1', role: 'admin' }

beforeEach(() => {
  mocks.getCurrentUser.mockReset()
  mocks.get.mockReset()
  mocks.getCurrentUser.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl', authTime: SEG })
})

describe('camino normal', () => {
  it('devuelve la membresía', async () => {
    mocks.get.mockResolvedValue(docCon(MIEMBRO))
    expect(await getMembership()).toEqual({
      uid: 'u1', email: 'ana@flota.cl', companyId: 'c1', role: 'admin',
    })
  })

  it('null sin sesión', async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    expect(await getMembership()).toBeNull()
  })

  it('null si el perfil no existe', async () => {
    mocks.get.mockResolvedValue({ exists: false })
    expect(await getMembership()).toBeNull()
  })
})

describe('sesión revocada', () => {
  it('no da membresía, aunque el perfil esté completo', async () => {
    mocks.get.mockResolvedValue(docCon({ ...MIEMBRO, sesionesValidasDesde: '2026-07-31T13:00:00.000Z' }))
    expect(await getMembership()).toBeNull()
  })

  it('una sesión iniciada DESPUÉS del corte sí pasa', async () => {
    mocks.get.mockResolvedValue(docCon({ ...MIEMBRO, sesionesValidasDesde: '2026-07-31T11:00:00.000Z' }))
    expect(await getMembership()).not.toBeNull()
  })
})

describe('costo', () => {
  it('lee el perfil UNA sola vez: la revocación no agrega consultas', async () => {
    mocks.get.mockResolvedValue(docCon(MIEMBRO))
    await getMembership()
    expect(mocks.get).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 6: Correr el test y verificar que falla**

Ejecutar: `npx vitest run lib/auth/__tests__/membership.test.ts`
Esperado: FALLAN los 2 tests de "sesión revocada" (el primero devuelve la membresía en vez de null).

- [ ] **Step 7: Comprobar la revocación en `getMembership`**

Reemplazar el contenido completo de `lib/auth/membership.ts`:

```ts
import { getCurrentUser } from '@/lib/auth/session'
import { adminDb } from '@/lib/firebase/admin'
import { sesionRevocada } from '@/lib/auth/revocacion'
import type { Role } from '@/lib/auth/roles'

export interface Membership {
  uid: string
  email: string
  companyId: string
  role: Role
}

export async function getMembership(): Promise<Membership | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const doc = await adminDb.collection('users').doc(user.uid).get()
  if (!doc.exists) return null
  const d = doc.data()!
  // La revocación se comprueba ACÁ y no en `getCurrentUser()` porque este
  // documento ya se está leyendo: no cuesta ninguna consulta extra. En
  // `getCurrentUser()` costaría una lectura en cada navegación, para siempre,
  // porque lo llama el layout de `(app)`.
  if (sesionRevocada(user.authTime, d.sesionesValidasDesde)) return null
  if (!d.companyId || !d.role) return null
  return { uid: user.uid, email: user.email, companyId: d.companyId, role: d.role as Role }
}
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run lib/auth/__tests__/membership.test.ts`
Esperado: PASA (6 tests).

- [ ] **Step 9: Cerrar el único mutador fuera de alcance**

En `app/api/profile/route.ts`, cambiar el import de la línea 2:

```ts
import { getMembership } from '@/lib/auth/membership'
```

y reemplazar el `PATCH` completo (líneas 13-24):

```ts
export async function PATCH(req: NextRequest) {
  // `getMembership()` y no `getCurrentUser()`: es el único MUTADOR que quedaría
  // fuera del alcance de la revocación, y moverlo lo cierra por el costo de una
  // lectura en un endpoint que casi no se usa. Es seguro porque
  // `ensureProvisioned` garantiza companyId + role desde el primer login.
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: { displayName?: string } = {}

  if (typeof body.displayName === 'string') patch.displayName = body.displayName.trim()

  await saveProfile(m.uid, m.email, patch)
  return NextResponse.json({ ok: true })
}
```

El `GET` sigue con `getCurrentUser()`: es solo lectura del propio perfil y está dentro del residuo aceptado en el spec.

- [ ] **Step 10: Escribir el test de que la revocación alcanza al mutador**

Crear `app/api/__tests__/profile-revocado.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  saveProfile: vi.fn(),
  getProfile: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock('@/lib/data/profile', () => ({ saveProfile: mocks.saveProfile, getProfile: mocks.getProfile }))

const { PATCH } = await import('@/app/api/profile/route')

const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.saveProfile.mockResolvedValue(undefined)
})

describe('PATCH /api/profile', () => {
  it('con membresía vigente guarda el nombre', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl', companyId: 'c1', role: 'admin' })
    const res = await PATCH(req({ displayName: '  Ana  ' }))
    expect(res.status).toBe(200)
    expect(mocks.saveProfile).toHaveBeenCalledWith('u1', 'ana@flota.cl', { displayName: 'Ana' })
  })

  // `getMembership()` devuelve null cuando la sesión está revocada. Es el único
  // MUTADOR que quedaría fuera del alcance de la revocación si usara
  // `getCurrentUser()`, que no comprueba nada.
  it('una sesión revocada no puede cambiar el nombre', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await PATCH(req({ displayName: 'Intruso' }))
    expect(res.status).toBe(401)
    expect(mocks.saveProfile).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 11: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run app/api/__tests__/profile-revocado.test.ts`
Esperado: PASA (2 tests). Si el `PATCH` todavía usara `getCurrentUser()`, el segundo test fallaría con un 200.

- [ ] **Step 12: Declarar el campo en el tipo**

En `lib/types.ts`, dentro de la interfaz `UserProfile` (líneas 208-217), agregar antes del cierre:

```ts
  /** Corte de revocación: las sesiones iniciadas antes de este instante no valen.
   *  Ausente = ninguna revocación, que es el caso normal. Ver lib/auth/revocacion.ts. */
  sesionesValidasDesde?: string
```

En `lib/data/profile.ts`, dentro del objeto que devuelve `getProfile` (líneas 14-20), agregar:

```ts
    sesionesValidasDesde: d.sesionesValidasDesde ?? undefined,
```

- [ ] **Step 13: Verificar todo**

Ejecutar: `npx vitest run app components lib && npx tsc --noEmit && npx eslint app components lib`
Esperado: todos los tests pasan, tsc sin salida, eslint con `0 errors`.

- [ ] **Step 14: Commit**

```bash
git add lib/auth/revocacion.ts lib/auth/membership.ts lib/auth/__tests__/revocacion.test.ts lib/auth/__tests__/membership.test.ts app/api/profile/route.ts app/api/__tests__/profile-revocado.test.ts lib/types.ts lib/data/profile.ts
git commit -m "feat(sesion): comprobar revocacion en getMembership, sin consultas extra"
```

---

## Task 4: Cerrar sesión en todos los dispositivos

**Files:**
- Create: `app/api/session/revocar/route.ts`
- Create: `components/profile/CerrarSesionesCard.tsx`
- Modify: `lib/firebase/admin.ts` (agregar al final)
- Modify: `lib/data/profile.ts` (agregar `revocarSesiones`)
- Modify: `app/(app)/perfil/page.tsx`
- Test: `app/api/__tests__/session-revocar.test.ts` (crear)
- Test: `components/__tests__/CerrarSesionesCard.test.tsx` (crear)

**Interfaces:**
- Consume: `instanteDeCorte(ahoraMs: number): string` (Task 3); `getMembership()` (Task 3)
- Produce: `revokeRefreshTokens(uid: string): Promise<void>` en `lib/firebase/admin.ts`
- Produce: `revocarSesiones(uid: string, corteIso: string): Promise<void>` en `lib/data/profile.ts`
- Produce: `POST /api/session/revocar` — sin cuerpo, responde `{ ok: true }` y borra la cookie

- [ ] **Step 1: Escribir el test del endpoint**

Crear `app/api/__tests__/session-revocar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SESSION_COOKIE } from '@/lib/auth/constants'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  revokeRefreshTokens: vi.fn(),
  revocarSesiones: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/firebase/admin', () => ({ revokeRefreshTokens: mocks.revokeRefreshTokens }))
vi.mock('@/lib/data/profile', () => ({ revocarSesiones: mocks.revocarSesiones }))

const { POST } = await import('@/app/api/session/revocar/route')

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl', companyId: 'c1', role: 'admin' })
  mocks.revokeRefreshTokens.mockResolvedValue(undefined)
  mocks.revocarSesiones.mockResolvedValue(undefined)
})

describe('revocar', () => {
  it('mata los refresh tokens para que el dispositivo perdido se auto-expulse', async () => {
    await POST()
    expect(mocks.revokeRefreshTokens).toHaveBeenCalledWith('u1')
  })

  it('estampa el corte truncado al segundo', async () => {
    await POST()
    const corte = mocks.revocarSesiones.mock.calls[0][1] as string
    expect(corte).toMatch(/\.000Z$/)
    expect(Number.isNaN(Date.parse(corte))).toBe(false)
  })

  it('borra la cookie de quien apretó el botón: revocar te incluye a ti', async () => {
    const res = await POST()
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe('')
  })
})

describe('sin sesión', () => {
  it('responde 401 y no revoca nada', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    expect(mocks.revokeRefreshTokens).not.toHaveBeenCalled()
    expect(mocks.revocarSesiones).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `npx vitest run app/api/__tests__/session-revocar.test.ts`
Esperado: FALLA — no se puede resolver `@/app/api/session/revocar/route`.

- [ ] **Step 3: Agregar el envoltorio del Admin SDK**

Agregar al final de `lib/firebase/admin.ts`:

```ts
/**
 * Invalida los refresh tokens del usuario. El cliente del dispositivo perdido
 * pierde la capacidad de emitir ID tokens nuevos, así que se auto-expulsa en
 * cuanto necesite refrescar (≤ 1 h).
 */
export async function revokeRefreshTokens(uid: string): Promise<void> {
  await getAuth(adminApp()).revokeRefreshTokens(uid)
}
```

- [ ] **Step 4: Agregar la escritura del corte**

Agregar al final de `lib/data/profile.ts`, antes de `deleteProfile`:

```ts
/** Corta todas las sesiones abiertas del usuario. Ver `lib/auth/revocacion.ts`. */
export async function revocarSesiones(uid: string, corteIso: string): Promise<void> {
  await adminDb.collection(COL).doc(uid).set({ sesionesValidasDesde: corteIso }, { merge: true })
}
```

- [ ] **Step 5: Escribir el endpoint**

Crear `app/api/session/revocar/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { getMembership } from '@/lib/auth/membership'
import { revokeRefreshTokens } from '@/lib/firebase/admin'
import { revocarSesiones } from '@/lib/data/profile'
import { instanteDeCorte } from '@/lib/auth/revocacion'

export const dynamic = 'force-dynamic'

/**
 * Cierra todas las sesiones del usuario, en todos sus dispositivos.
 *
 * Es lo que vuelve segura la ventana de 14 días: sin esto, un teléfono perdido
 * conserva acceso dos semanas y no hay forma de matarlo.
 */
export async function POST() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 1) El dispositivo perdido pierde la capacidad de emitir tokens nuevos.
  await revokeRefreshTokens(m.uid)
  // 2) Barrera inmediata para los datos: `getMembership()` la comprueba.
  await revocarSesiones(m.uid, instanteDeCorte(Date.now()))

  // 3) Revocar te incluye a ti. El cliente además hace signOut() de Firebase.
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run app/api/__tests__/session-revocar.test.ts`
Esperado: PASA (4 tests).

- [ ] **Step 7: Escribir el test de la card**

Crear `components/__tests__/CerrarSesionesCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('firebase/auth', () => ({ signOut: mocks.signOut }))
vi.mock('@/lib/firebase/client', () => ({ auth: {} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))

import CerrarSesionesCard from '@/components/profile/CerrarSesionesCard'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.signOut.mockResolvedValue(undefined)
})

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión en todos/i }))
const confirmar = () => fireEvent.click(screen.getByRole('button', { name: /Sí, cerrar todas/i }))

describe('confirmación', () => {
  it('no hace nada hasta confirmar: también cierra tu sesión actual', () => {
    render(<CerrarSesionesCard />)
    abrir()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('al confirmar', () => {
  it('llama al endpoint', async () => {
    render(<CerrarSesionesCard />)
    abrir()
    confirmar()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/session/revocar', expect.objectContaining({ method: 'POST' })),
    )
  })

  // Sin el signOut quedas con sesión de Firebase viva pero sin cookie, y
  // SesionViva te la vuelve a acuñar en la siguiente carga: habrías revocado
  // todos los dispositivos MENOS el que apretó el botón.
  it('también cierra la sesión de Firebase en este dispositivo', async () => {
    render(<CerrarSesionesCard />)
    abrir()
    confirmar()
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
  })

  it('lleva al login', async () => {
    render(<CerrarSesionesCard />)
    abrir()
    confirmar()
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login'))
  })
})

describe('si el endpoint falla', () => {
  it('avisa y NO cierra la sesión local', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)))
    render(<CerrarSesionesCard />)
    abrir()
    confirmar()
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 8: Correr el test y verificar que falla**

Ejecutar: `npx vitest run components/__tests__/CerrarSesionesCard.test.tsx`
Esperado: FALLA — no se puede resolver `@/components/profile/CerrarSesionesCard`.

- [ ] **Step 9: Escribir la card**

Crear `components/profile/CerrarSesionesCard.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

/**
 * Cierra las sesiones del usuario en todos sus dispositivos. Es la salida de
 * emergencia de la sesión de 14 días: un teléfono perdido se queda afuera.
 */
export default function CerrarSesionesCard() {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cerrar() {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/session/revocar', { method: 'POST' }).catch(() => null)
    if (!res?.ok) {
      setError('No se pudieron cerrar las sesiones. Inténtalo de nuevo.')
      setBusy(false)
      return
    }
    // Sin este signOut quedarías con sesión de Firebase viva pero sin cookie, y
    // `SesionViva` te la volvería a acuñar en la siguiente carga: habrías
    // revocado todos los dispositivos MENOS el que apretó el botón.
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }
    router.push('/login')
    router.refresh()
  }

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Sesiones activas</h2>
      <p className="mt-1 text-sm text-acero">
        Tu sesión se mantiene abierta hasta 14 días en cada dispositivo donde entres. Si perdiste
        un teléfono o entraste en un computador prestado, ciérralas todas desde acá.
      </p>

      {!confirmando ? (
        <button
          onClick={() => setConfirmando(true)}
          className="mt-4 rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-semibold text-tinta transition-colors hover:bg-lienzo"
        >
          Cerrar sesión en todos los dispositivos
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-tinta">
            Esto también cierra <strong>tu sesión actual</strong>: vas a tener que volver a entrar.
          </p>
          {error && (
            <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={cerrar}
              disabled={busy}
              className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
            >
              {busy ? 'Cerrando…' : 'Sí, cerrar todas'}
            </button>
            <button
              onClick={() => {
                setConfirmando(false)
                setError(null)
              }}
              className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 10: Correr el test y verificar que pasa**

Ejecutar: `npx vitest run components/__tests__/CerrarSesionesCard.test.tsx`
Esperado: PASA (5 tests).

- [ ] **Step 11: Montarla en Perfil**

En `app/(app)/perfil/page.tsx`, agregar el import:

```tsx
import CerrarSesionesCard from '@/components/profile/CerrarSesionesCard'
```

y agregarla entre `<SecurityCard />` y `<DangerCard />`:

```tsx
      <AccountCard email={profile.email} initialName={profile.displayName} />
      <SecurityCard />
      <CerrarSesionesCard />
      <DangerCard />
```

- [ ] **Step 12: Verificar todo**

Ejecutar: `npx vitest run app components lib && npx tsc --noEmit && npx eslint app components lib && npm run build`
Esperado: todos los tests pasan, tsc sin salida, eslint con `0 errors`, build exitoso.

- [ ] **Step 13: Actualizar la documentación**

En `CLAUDE.md`, en la lista de `lib/auth/`, reemplazar la línea existente por:

```
- `lib/auth/` — `constants.ts` (`SESSION_COOKIE` + `SESSION_MAX_AGE_MS`, sin imports para el edge), `session.ts` (`getCurrentUser`, verifica la **session cookie de Firebase** y expone `authTime`; **no lee Firestore**), `revocacion.ts` (`sesionRevocada`/`instanteDeCorte`, puro), `admin.ts` (`isAdminEmail`, allowlist por env — admin de **plataforma**), `roles.ts` (`can(role, action)`, roles **de empresa**), `membership.ts` (`getMembership()`, que además **comprueba la revocación** sin consultas extra), `AuthProvider.tsx` (contexto cliente).
```

Y agregar a la sección de Gotchas:

```
- **La cookie de sesión NO es el ID token de Firebase**: los ID tokens viven 1 hora, y guardarlos como cookie fue el bug que desconectaba a todos —peor en móvil, donde la app se usa en ráfagas cortas. Ahora es una **session cookie** de Firebase (`createSessionCookie`, 14 días, `SESSION_MAX_AGE_MS`). El detalle que hay que entender antes de tocar esto: **la sesión de Firebase en el CLIENTE no expira nunca** (vive en IndexedDB con el refresh token), así que cuando el servidor perdía la cookie el navegador seguía perfectamente autenticado y nadie la volvía a emitir. Eso lo resuelve `components/auth/SesionViva.tsx`, montado en el layout de `(app)` y en `/login` (ahí con `autoEntrar`, que es el "inicio de sesión automático"): escucha `onIdTokenChanged` y re-emite la cookie vía `POST /api/session/renovar`. **`renovar` no puede llamar a `ensureProvisioned`** (corre en cada apertura de la app y eso costaría una lectura de Firestore para siempre; hay un test de regresión) y **`SesionViva` solo intenta auto-entrar una vez por carga**, o una sesión revocada entra en bucle infinito entre el login y el dashboard. NO montarlo en el layout raíz: ese envuelve la ficha pública `/v/[token]`.
```

- [ ] **Step 14: Commit**

```bash
git add app/api/session/revocar components/profile/CerrarSesionesCard.tsx lib/firebase/admin.ts lib/data/profile.ts app/\(app\)/perfil/page.tsx app/api/__tests__/session-revocar.test.ts components/__tests__/CerrarSesionesCard.test.tsx CLAUDE.md
git commit -m "feat(sesion): cerrar sesion en todos los dispositivos desde Perfil"
```

---

## Verificación manual tras el despliegue

No se puede automatizar: depende del ciclo de vida real de la pestaña en un dispositivo.

1. En un celular, entra a app.tapcar.cl. **Esperado:** rebotas al login una vez (tu cookie vieja es un ID token) y entras solo, sin escribir nada.
2. Cierra el navegador por completo, ábrelo de nuevo y entra. **Esperado:** sigues dentro.
3. Vuelve al día siguiente. **Esperado:** sigues dentro.
4. En Perfil → Sesiones activas, cierra todas. **Esperado:** vuelves al login, y el otro dispositivo queda afuera en cuanto refresque su token.
