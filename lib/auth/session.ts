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
