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
