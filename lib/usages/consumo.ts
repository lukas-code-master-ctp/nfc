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

/** Fracción de estanque por nivel de bencina (los 5 niveles que lee la IA). */
export const NIVEL_FRACCION: Record<string, number> = {
  Lleno: 1,
  '3/4': 0.75,
  '1/2': 0.5,
  '1/4': 0.25,
  Reserva: 0.1,
}

/** Se marca "revisar" cuando la bajada observada supera a la esperada por al
 *  menos esta fracción de estanque (un nivel completo). */
export const UMBRAL_FRACCION = 0.25
/** Viajes más cortos que esto (km) no se evalúan: puro ruido. */
export const MIN_KM = 20

export interface ConsumoCalc {
  kmRecorridos: number
  litrosEsperados: number
  litrosObservados: number
  fraccionEsperada: number
  fraccionObservada: number
  revisar: boolean
}

type LecturaUso = { km: number | null; bencina: string | null }

/**
 * Compara la bajada de estanque observada (respecto a la entrega anterior)
 * contra la esperada por los km recorridos. Devuelve null cuando no se puede o
 * no corresponde evaluar: sin params, sin uso previo, lecturas faltantes, nivel
 * desconocido, recarga (la bencina subió), o viaje demasiado corto.
 */
export function calcularConsumo(
  actual: LecturaUso,
  previo: LecturaUso | null,
  params: ConsumoBencina | null,
): ConsumoCalc | null {
  if (!params || !params.rendimientoKmL || !params.estanqueLitros) return null
  if (!previo) return null
  if (actual.km == null || previo.km == null) return null
  if (actual.bencina == null || previo.bencina == null) return null
  const fracActual = NIVEL_FRACCION[actual.bencina]
  const fracPrevio = NIVEL_FRACCION[previo.bencina]
  if (fracActual === undefined || fracPrevio === undefined) return null
  const kmRecorridos = actual.km - previo.km
  if (kmRecorridos < MIN_KM) return null
  const fraccionObservada = fracPrevio - fracActual
  if (fraccionObservada <= 0) return null // recarga o sin bajada
  const litrosEsperados = kmRecorridos / params.rendimientoKmL
  const fraccionEsperada = litrosEsperados / params.estanqueLitros
  const litrosObservados = fraccionObservada * params.estanqueLitros
  const revisar = fraccionObservada - fraccionEsperada >= UMBRAL_FRACCION
  return { kmRecorridos, litrosEsperados, litrosObservados, fraccionEsperada, fraccionObservada, revisar }
}
