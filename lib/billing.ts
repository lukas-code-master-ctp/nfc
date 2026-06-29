// Lógica de facturación (pura, sin Firebase). Modelo: suscripción por
// vehículo. El tag NFC va incluido en planes de 5+ (pagas solo el envío);
// bajo ese umbral, cada tag cuesta TAG_PRICE + envío.
export const PRICE_PER_VEHICLE = 2990 // CLP / vehículo / mes
export const FREE_TAG_THRESHOLD = 5 // planes de 5+ vehículos → tag incluido
export const TAG_PRICE = 1000 // CLP por tag cuando el plan es < umbral

export function monthlyTotal(vehiculos: number): number {
  return Math.max(0, Math.floor(vehiculos)) * PRICE_PER_VEHICLE
}

export function tagIncluded(vehiculos: number): boolean {
  return Math.floor(vehiculos) >= FREE_TAG_THRESHOLD
}

export function formatCLP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CL')
}
