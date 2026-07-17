import type { ConsumoBencina } from '@/lib/types'

/**
 * Sanea los params de consumo del vehículo. Nunca confía en el cliente: cada
 * valor debe ser un número finito y > 0; si no, queda null. Si ambos quedan
 * null, no hay nada que guardar (devuelve null).
 */
export function sanitizeConsumo(raw: unknown): ConsumoBencina | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const rendimientoKmL = num(r.rendimientoKmL)
  const estanqueLitros = num(r.estanqueLitros)
  if (rendimientoKmL === null && estanqueLitros === null) return null
  return { rendimientoKmL, estanqueLitros }
}
