import { cookies } from 'next/headers'
import { verifyIdToken } from '@/lib/firebase/admin'
import { SESSION_COOKIE } from '@/lib/auth/constants'

export { SESSION_COOKIE }

export async function getCurrentUser(): Promise<{ uid: string; email: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const decoded = await verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email ?? '' }
  } catch {
    return null
  }
}
