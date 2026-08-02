// Reglas del canje de un código promocional (puro, sin Firebase). Acá vive la
// seguridad del feature: el endpoint solo orquesta y traduce el motivo a un
// HTTP. Mismo patrón que `lib/transferencias/estado.ts`.
import { addMeses } from '@/lib/mantencion/status'
import type { PromoAplicada, PromoCode } from '@/lib/types'

export type MotivoRechazo = 'no_existe' | 'inactivo' | 'expirado' | 'agotado' | 'ya_canjeado'

const LARGO_MAX = 32

/**
 * Forma canónica de un código.
 *
 * Es más estricta de lo que parece necesario a propósito: el código es el **id
 * del documento** en Firestore, que prohíbe la barra, y una lista blanca evita
 * tener que razonar sobre espacios, tildes o emojis. De paso hace que
 * "tapcar-agosto", "TapCar Agosto" y el mismo texto pegado desde un correo no
 * sean tres códigos distintos.
 */
export function normalizarCodigo(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, LARGO_MAX)
}

export function puedeCanjear({
  code,
  promoActual,
  hoy,
}: {
  code: PromoCode | null
  promoActual?: PromoAplicada | null
  hoy: string
}): MotivoRechazo | null {
  // Antes que `no_existe` a propósito: a quien ya tiene promoción hay que
  // decirle eso, y no filtrarle de paso si el código que probó existe.
  if (promoActual) return 'ya_canjeado'
  if (!code) return 'no_existe'
  if (!code.activo) return 'inactivo'
  if (code.expiraEn && hoy > code.expiraEn) return 'expirado'
  if (code.maxCanjes != null && code.canjes >= code.maxCanjes) return 'agotado'
  return null
}

/**
 * Arma la promoción a guardar. **No toca `gratisHasta`**: la promo empieza
 * donde termina la prueba, o hoy si la prueba ya venció (si contara desde una
 * `gratisHasta` pasada, parte de la promoción se consumiría en el pasado).
 */
export function aplicarCanje({
  code,
  gratisHasta,
  hoy,
  ahoraIso,
}: {
  code: PromoCode
  gratisHasta?: string | null
  hoy: string
  ahoraIso: string
}): PromoAplicada {
  // Ambas son `YYYY-MM-DD`: el orden lexicográfico es el cronológico.
  const desde = gratisHasta && gratisHasta > hoy ? gratisHasta : hoy
  return {
    codigo: code.codigo,
    mesesGratis: code.mesesGratis,
    vehiculosIncluidos: code.vehiculosIncluidos,
    canjeadoEn: ahoraIso,
    hasta: addMeses(desde, code.mesesGratis),
  }
}
