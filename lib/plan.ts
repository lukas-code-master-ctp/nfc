// Lógica de plan (pura, sin Firebase). El cupo de vehículos vive en el perfil
// del usuario (`plan.maxVehiculos`), lo configura un admin de la plataforma.
// Mientras no esté seteado, se usa el default. Mínimo 1 siempre.
import { DEFAULT_PLAN, type UserProfile } from '@/lib/types'

export function maxVehiculos(profile: Pick<UserProfile, 'plan'>): number {
  const n = profile.plan?.maxVehiculos ?? DEFAULT_PLAN.maxVehiculos
  return Math.max(1, Math.floor(n))
}

/** Resumen de capacidad para la UI. */
export function planCapacity(used: number, limit: number) {
  const safeLimit = Math.max(1, Math.floor(limit))
  const remaining = Math.max(0, safeLimit - used)
  return {
    used,
    limit: safeLimit,
    remaining,
    atCapacity: used >= safeLimit,
    ratio: Math.min(1, used / safeLimit),
  }
}
