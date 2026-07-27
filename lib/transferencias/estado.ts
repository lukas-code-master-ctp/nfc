// Reglas puras de una transferencia de vehículo (sin Firebase). Acá vive la
// seguridad del feature: el endpoint solo orquesta y responde lo que diga esto.
import type { Transferencia } from '@/lib/types'
import { can, type Role } from '@/lib/auth/roles'

export type MotivoRechazo =
  | 'no_pendiente'
  | 'expirada'
  | 'otro_destinatario'
  | 'sin_permiso'
  | 'plan_limit'

export function transferenciaVigente(t: Transferencia, nowIso: string): boolean {
  return t.status === 'pendiente' && t.expiresAt > nowIso
}

/**
 * Devuelve el motivo por el que NO se puede aceptar, o `null` si se puede.
 * Recibe los datos ya leídos para no tocar Firestore desde acá.
 */
export function puedeAceptar(p: {
  transferencia: Transferencia
  emailSesion: string
  role: Role
  vehiculosActuales: number
  maxVehiculos: number
  nowIso: string
}): MotivoRechazo | null {
  const { transferencia: t, emailSesion, role, vehiculosActuales, maxVehiculos, nowIso } = p
  if (t.status !== 'pendiente') return 'no_pendiente'
  if (t.expiresAt <= nowIso) return 'expirada'
  // El token no basta: un enlace reenviado no puede servir para quedarse con el vehículo.
  if (emailSesion.trim().toLowerCase() !== t.paraEmail) return 'otro_destinatario'
  if (!can(role, 'vehicle:write')) return 'sin_permiso'
  if (vehiculosActuales >= maxVehiculos) return 'plan_limit'
  return null
}
