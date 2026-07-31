# Sesión persistente — Diseño

**Fecha:** 2026-07-31
**Historia:** Como usuario, quiero mantener mi sesión activa de forma automática sin desconectarme constantemente, para poder acceder rápidamente a la aplicación y evitar iniciar sesión repetidamente.

> Primera de las cuatro features del sprint (sesión → librería de marcas → OCR de documentos → código promocional). Cada una tiene su propio spec y su propio plan: no comparten datos, modelo ni UI, y así cada una entra a producción sola.

---

## 1. El problema

No es un ajuste de configuración: es un defecto de diseño en la autenticación.

`app/api/session/route.ts` guarda **el ID token de Firebase crudo** como cookie de sesión, con `maxAge` de 1 hora. `getCurrentUser()` lo valida con `verifyIdToken`, que rechaza un token vencido y devuelve `null` → el usuario cae al login.

El defecto real es lo que **no** existe: **ningún camino del código vuelve a emitir la cookie después del login**. `establishSession` solo se llama justo tras un inicio de sesión explícito (`signInWithPopup` / `signInWithEmailAndPassword` / `createUserWithEmailAndPassword`), y `AuthProvider` únicamente escucha `onAuthStateChanged` para el estado del cliente. La cookie vive una hora y muere.

Por eso se siente aleatorio: **la sesión de Firebase en el cliente no expira nunca** (vive en IndexedDB con el refresh token). Cuando la app te bota, tu navegador sigue perfectamente autenticado con Firebase — es solo el servidor el que perdió la cookie y nadie la vuelve a emitir. En el celular, donde se usa la app en ráfagas cortas y la pestaña se descarta seguido, la hora se agota entre una sesión de uso y la siguiente.

**Nota de diagnóstico:** durante el análisis se sospechó que la cookie podía nacer casi vencida porque `LoginForm` llama `user.getIdToken()` sin forzar refresco. Se descartó al leer el componente completo: `establishSession` solo corre inmediatamente después de autenticar, así que el token siempre está fresco y la cookie vive su hora completa. **Consecuencia práctica: `LoginForm` no necesita forzar el refresco del token.**

## 2. Decisiones de producto

| Decisión | Valor | Por qué |
|---|---|---|
| Duración de la sesión | **14 días, renovable en cada uso** | Es el máximo que permite Firebase. Al renovarse en cada apertura, quien usa la app con cierta frecuencia nunca vuelve a ver el login; solo desconecta tras 14 días seguidos sin abrirla. |
| Revocación a distancia | **Sí, botón en `/perfil`** | Es lo que vuelve segura la ventana de 14 días. Sin él, un teléfono perdido conserva acceso dos semanas y no hay forma de matarlo. |
| Verificación de revocación | **Campo en Firestore, no `checkRevoked`** | `getMembership()` ya lee `users/{uid}` en cada llamada privada, así que la comprobación no cuesta ninguna consulta extra. `verifySessionCookie(cookie, true)` costaría una llamada de red a Firebase en cada carga de página. |

**Trade-off aceptado explícitamente:** al renovar, la cookie nueva se acuña desde un ID token cuyo `auth_time` es el del inicio de sesión original, que puede tener días. Firebase recomienda exigir un `auth_time` reciente para acuñar sesiones largas; hacerlo aquí rompería precisamente la renovación que se pidió. La contención es la revocación de la sección 5.

## 3. Arquitectura

Dos mitades, porque el bug tiene dos causas. Cada una tapa el hueco de la otra:

1. **La cookie deja de expirar en una hora** → session cookie de Firebase, 14 días.
2. **Algo la vuelve a emitir** → un componente cliente que la renueva y la repara sola.

Solo (1) arreglaría la hora pero no sería renovable: a los 14 días exactos volverías al login aunque hubieras entrado ayer, y no se auto-repararía si algo falla. Solo (2) dejaría una carrera perdida en el caso móvil: en una apertura en frío pasada la hora, el servidor renderiza antes de que el cliente alcance a renovar, así que te rebota al login y recién después te arregla.

## 4. La cookie

### `lib/firebase/admin.ts`

Dos envoltorios nuevos junto a `verifyIdToken`:

```ts
export async function createSessionCookie(idToken: string, expiresIn: number) {
  return getAuth(adminApp()).createSessionCookie(idToken, { expiresIn })
}
export async function verifySessionCookie(cookie: string) {
  return getAuth(adminApp()).verifySessionCookie(cookie)
}
```

Sin `checkRevoked` (ver tabla de decisiones). Mantienen el patrón de init lazy vía `adminApp()`.

### `lib/auth/constants.ts`

```ts
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
```

Va en `constants.ts` y no en `session.ts` porque `proxy.ts` corre en el edge runtime y no puede importar nada que arrastre firebase-admin. `constants.ts` es el archivo sin imports que ya existe para esto.

### `POST /api/session`

Sigue verificando el ID token (para conservar el 401 de token inválido) y sigue llamando a `ensureProvisioned` + el correo de bienvenida en `after()`. Lo único que cambia es qué se guarda:

```ts
const sessionCookie = await createSessionCookie(idToken, SESSION_MAX_AGE_MS)
res.cookies.set(SESSION_COOKIE, sessionCookie, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_MAX_AGE_MS / 1000, // maxAge de cookie va en segundos
})
```

`createSessionCookie` puede lanzar (token vencido, proyecto mal configurado). Ese fallo debe responder con error, no en silencio: `LoginForm` ya distingue `ErrorSesion` y muestra el status, así que el usuario ve qué pasó en vez de quedarse en una pantalla colgada.

### `getCurrentUser()`

```ts
const decoded = await verifySessionCookie(token)
return { uid: decoded.uid, email: decoded.email ?? '', authTime: decoded.auth_time }
```

`authTime` es nuevo y viene en segundos desde epoch; lo consume la revocación. `getCurrentUser` **no** lee Firestore: el layout de `(app)` lo llama en cada navegación y agregar una lectura ahí sería un costo permanente (es el mismo criterio por el que el portero del onboarding vive en el dashboard y no en el layout).

## 5. Revocación

### Dato

`users/{uid}.sesionesValidasDesde?: string` — ISO, **truncado al segundo**. Ausente significa "todas las sesiones valen", así que no hace falta migración ni backfill.

### `POST /api/session/revocar`

Tres cosas, en este orden:

1. `adminAuth.revokeRefreshTokens(uid)` — el cliente del dispositivo perdido pierde la capacidad de emitir tokens nuevos, así que se auto-expulsa en cuanto necesite refrescar (≤ 1 h).
2. Escribe `sesionesValidasDesde` con el instante actual truncado al segundo — `new Date(Math.floor(Date.now() / 1000) * 1000).toISOString()`.
3. Borra la cookie del dispositivo que llamó.

El paso 3 no es un descuido: revocar te incluye a ti. La UI lo dice y pide confirmación.

**Y el cliente que llama debe hacer `signOut()` de Firebase**, no solo esperar la respuesta. Sin eso queda con sesión de Firebase viva pero sin cookie, y `<SesionViva />` se la vuelve a acuñar en la siguiente carga: revocarías todos los dispositivos menos el que apretó el botón. Con `signOut()`, el propio `onIdTokenChanged` recibe `null` y el componente completa la salida.

### `lib/auth/revocacion.ts` (puro, sin Firebase)

```ts
export function sesionRevocada(authTimeSegundos: number | undefined, validasDesde: string | undefined): boolean
```

Vive aparte porque mezcla dos unidades y ahí es donde se cometen los errores: `auth_time` viene en **segundos**, `sesionesValidasDesde` es un **ISO string**.

Y tiene un borde real que motiva el truncado: revocas a las 10:00:00.500 y vuelves a entrar a las 10:00:00.900. Tu `auth_time` se trunca a 10:00:00, que es *menor* que el instante de revocación, y quedarías fuera de inmediato tras haber iniciado sesión correctamente. Guardando `sesionesValidasDesde` truncado al segundo, la re-entrada da igualdad y pasa. La comparación es estricta:

```
revocada  ⟺  validasDesde existe  ∧  authTime * 1000 < Date.parse(validasDesde)
```

Sin `authTime` (no debería ocurrir con `verifySessionCookie`) se trata como **no revocada**: el resto de las barreras sigue en pie y fallar cerrado aquí desconectaría a todos si algún día el claim cambiara de nombre.

### Dónde se comprueba

En `getMembership()`, que ya tiene el documento del usuario en la mano: cero consultas extra. Si la sesión está revocada devuelve `null`, igual que cuando no hay membresía.

### Cambio de alcance deliberado

`/api/profile` PATCH pasa de `getCurrentUser()` a `getMembership()`. Es el único **mutador** que quedaría fuera del alcance de la revocación; moverlo lo cierra por el costo de una lectura en un endpoint que casi no se usa. Es seguro porque `ensureProvisioned` garantiza `companyId` + `role` desde el primer login.

### Residuo conocido, solo de lectura

Tres superficies usan `getCurrentUser()` directo y no ven la revocación al instante:

| Superficie | Qué alcanza a ver |
|---|---|
| `app/(app)/layout.tsx` | La barra de navegación |
| `/perfil` | Su propio nombre |
| `/admin` | Además exige `isAdminEmail` |

Ningún vehículo, documento ni dato de empresa: todo eso pasa por `getMembership()`. Cerrarlo del todo exigiría una lectura de Firestore en cada navegación, para siempre. Se acepta el residuo.

### UI

Card en `/perfil`: "Cerrar sesión en todos los dispositivos", con confirmación que advierte que también cierra la sesión actual.

## 6. El re-emisor

`components/auth/SesionViva.tsx` — componente cliente que escucha `onIdTokenChanged` de Firebase:

- **Con usuario** → postea el token a `POST /api/session/renovar`.
- **Sin usuario** → borra la cookie (`DELETE /api/session`) y va al login.

Ese evento dispara al montar, al iniciar sesión, al cerrarla y **cada vez que Firebase refresca el token** (~cada hora). Mientras la app esté abierta la cookie se renueva sola; cada apertura corre la ventana de 14 días hacia adelante.

### `POST /api/session/renovar`

Verifica el ID token y acuña la cookie. **No** llama a `ensureProvisioned` ni manda correos.

Es un endpoint aparte y no un reuso de `/api/session` justamente por eso: `ensureProvisioned` lee Firestore, así que reusarlo pagaría una lectura extra en cada apertura de la app, para siempre. **Login provisiona; renovación no.** Hay un test de regresión que fija esto.

Tampoco comprueba la revocación, por el mismo motivo de costo. El bucle que eso podría causar se corta en el cliente (sección 7).

### Dónde se monta

En **`app/(app)/layout.tsx`** (mantiene viva la sesión mientras se usa la app) y en la **página de login**.

Lo segundo es lo que responde al título de la historia, *inicio de sesión automático*: si llegas al login con una sesión de Firebase viva, te acuña la cookie y entras **sin escribir nada**.

**No** se monta en el layout raíz a propósito: ese envuelve también la ficha pública `/v/[token]`, donde no debe dispararse nada de autenticación.

## 7. Casos borde

### Bucle de redirección en el login (el importante)

`<SesionViva />` acuña la cookie y te manda al dashboard. Si la sesión está **revocada**, el dashboard rebota al login → el componente vuelve a acuñar → rebota otra vez. Bucle infinito.

No es hipotético: tras `revokeRefreshTokens`, el ID token ya cacheado del cliente sigue siendo criptográficamente válido hasta una hora, así que sí puede acuñar cookies con un `auth_time` viejo durante esa ventana.

**Corte: un solo intento de auto-entrada por carga de página** (un `useRef` en el componente). En el peor caso hay un rebote extra y el usuario se queda en el formulario de login, que es lo correcto. Pasada la hora, el refresco falla y el dispositivo se auto-expulsa del todo.

La alternativa —comprobar la revocación en `renovar`— costaría una lectura de Firestore en cada apertura de la app, que es justo lo que este diseño evita.

### Día del despliegue

Las cookies en circulación son ID tokens y `verifySessionCookie` las rechaza. **Todos los usuarios rebotan al login una vez.** Como `<SesionViva />` está montado ahí y su sesión de Firebase sigue viva, vuelven a entrar solos sin escribir contraseña. Por eso no se agrega código transitorio que acepte ambos formatos de cookie.

### Los demás

- **`renovar` falla** (red caída, 500): es best-effort. No puede sacar al usuario ni romper la pantalla; se reintenta en el próximo evento de token o en la próxima carga. Un intento por evento, sin reintentos en bucle.
- **Varias pestañas abiertas**: cada una dispara su renovación. Acuñar es idempotente, no hay daño.
- **El proxy no cambia**: sigue mirando solo si la cookie existe. Una cookie inválida lo pasa y la rechaza la página; es el comportamiento actual.
- **`/v/[token]` y el cron no se tocan**: la ficha pública no tiene sesión.

## 8. Archivos

**Crear**
- `lib/auth/revocacion.ts` — `sesionRevocada` (puro)
- `app/api/session/renovar/route.ts` — acuña la cookie, sin provisionar
- `app/api/session/revocar/route.ts` — revoca tokens + estampa + borra cookie
- `components/auth/SesionViva.tsx` — el re-emisor
- `components/profile/CerrarSesionesCard.tsx` — la card de `/perfil`

**Modificar**
- `lib/firebase/admin.ts` — `createSessionCookie` / `verifySessionCookie`
- `lib/auth/constants.ts` — `SESSION_MAX_AGE_MS`
- `lib/auth/session.ts` — verificar con session cookie, exponer `authTime`
- `lib/auth/membership.ts` — comprobar revocación
- `app/api/session/route.ts` — acuñar session cookie
- `app/api/profile/route.ts` — PATCH pasa a `getMembership()`
- `app/(app)/layout.tsx` — montar `<SesionViva />`
- `app/(auth)/login/page.tsx` — montar `<SesionViva />`
- `app/(app)/perfil/page.tsx` — montar la card
- `lib/types.ts` — `sesionesValidasDesde` en el perfil

## 9. Testing

**Puro** — `sesionRevocada`: campo ausente, unidades mezcladas (segundos vs ISO), el borde de igualdad al segundo, y `authTime` ausente.

**Endpoints con mocks**
- `/api/session` acuña a 14 días y setea el `maxAge` correcto en segundos.
- `getCurrentUser` verifica con `verifySessionCookie` y expone `authTime`.
- `getMembership` devuelve `null` con una sesión revocada.
- **Regresión de costo:** `/api/session/renovar` **no** llama a `ensureProvisioned`.
- `/api/session/revocar` llama a `revokeRefreshTokens`, escribe el campo truncado al segundo y borra la cookie.
- Una sesión revocada no puede cambiar el nombre vía `/api/profile`.

**Componente** — `<SesionViva />`: postea al recibir usuario, borra la cookie al recibir `null`, y **no reintenta más de una vez por carga** (el test del bucle).

**Card de revocación** — que llame al endpoint **y** a `signOut()`: sin lo segundo, el dispositivo que aprieta el botón es el único que no queda revocado.

**Manual, en un celular real, tras el despliegue** — que la sesión sobreviva a cerrar y reabrir el navegador, y al día siguiente. No hay forma de automatizar esto: depende del ciclo de vida real de la pestaña en el dispositivo.

## 10. Fuera de alcance

- Cambiar el proxy para que valide la cookie (no puede: edge runtime sin firebase-admin).
- Revocar sesiones al quitar a un miembro del equipo — ya funciona hoy, porque se borra su `users/{uid}` y `getMembership()` falla.
- Recordar el destino al que ibas cuando la sesión expira (`?next=`).
- Las otras tres features del sprint.
