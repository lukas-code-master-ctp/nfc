// Lógica de facturación (pura, sin Firebase). Modelo: suscripción por
// vehículo, mensual o anual. El tag NFC va incluido en planes de 5+ (pagas
// solo el envío); bajo ese umbral, cada tag cuesta TAG_PRICE + envío.
import type { Periodicidad } from '@/lib/types'

export const PRICE_PER_VEHICLE = 2990 // CLP / vehículo / mes
/** El plan anual, expresado por mes para poder mostrarlo comparable. */
export const PRICE_PER_VEHICLE_ANUAL_MES = 1944 // −35% sobre el mensual
export const MESES_ANUAL = 12
export const FREE_TAG_THRESHOLD = 5 // planes de 5+ vehículos → tag incluido
export const TAG_PRICE = 1000 // CLP por tag cuando el plan es < umbral
/** Sobre este tope el alta no aplica cupo sola: deriva a Facturación. */
export const MAX_VEHICULOS_SELF_SERVICE = 30

export interface Cargo {
  /** Lo que se cobra en un ciclo. */
  monto: number
  /** Valor unitario en la unidad del ciclo. */
  porVehiculo: number
  unidad: 'mes' | 'año'
}

function sanear(vehiculos: number): number {
  return Math.max(0, Math.floor(vehiculos))
}

export function cargoDe({
  vehiculos,
  periodicidad,
}: {
  vehiculos: number
  periodicidad: Periodicidad
}): Cargo {
  const v = sanear(vehiculos)
  const porVehiculo =
    periodicidad === 'anual' ? PRICE_PER_VEHICLE_ANUAL_MES * MESES_ANUAL : PRICE_PER_VEHICLE
  return {
    monto: v * porVehiculo,
    porVehiculo,
    unidad: periodicidad === 'anual' ? 'año' : 'mes',
  }
}

/** Cuánto se ahorra al año pagando anual en vez de mensual. */
export function ahorroAnual(vehiculos: number): number {
  return sanear(vehiculos) * (PRICE_PER_VEHICLE - PRICE_PER_VEHICLE_ANUAL_MES) * MESES_ANUAL
}

export function tagIncluded(vehiculos: number): boolean {
  return Math.floor(vehiculos) >= FREE_TAG_THRESHOLD
}

export function formatCLP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CL')
}
