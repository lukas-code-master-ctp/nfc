// Estado del período de prueba (puro, sin Firebase). La fecha de término vive
// en `plan.gratisHasta` como fecha calendario `YYYY-MM-DD`, así que reusa el
// `daysUntil` de documentos y hereda la zona horaria de Chile ya resuelta.
import { daysUntil } from '@/lib/documents/status'

export type EstadoPrueba = 'sin_prueba' | 'activa' | 'por_terminar' | 'vencida'

// El mismo hito que ya usan los recordatorios de documentos: dos umbrales
// distintos para "se te acaba el tiempo" en la misma app sería incoherencia.
export const UMBRAL_POR_TERMINAR = 7

/**
 * Último día sin cobro de la promoción de lanzamiento, **inclusive**.
 *
 * Reemplaza a la prueba de 30 días por cuenta, que tenía un defecto de
 * origen: la ventana de regalo nunca se cerraba, porque cada alta nueva la
 * corría un mes más hacia adelante. Con una fecha fija, todos terminan el
 * mismo día — que es lo que una promoción de lanzamiento debe hacer.
 */
export const LANZAMIENTO_HASTA = '2026-09-01'

/**
 * Qué `gratisHasta` corresponde a una cuenta que se da de alta hoy.
 *
 * Devuelve `null` pasada la ventana, y eso no es un detalle: estampar una
 * fecha ya vencida haría que `estadoPrueba` respondiera `'vencida'` y la
 * franja le dijera "tu prueba terminó" a un cliente que acaba de registrarse.
 * Ambas son cadenas `YYYY-MM-DD`, así que el orden lexicográfico es el
 * cronológico y el borde es inclusivo, igual que en `faseDelPlan`.
 */
export function gratisHastaDeAlta(hoy: string): string | null {
  return hoy <= LANZAMIENTO_HASTA ? LANZAMIENTO_HASTA : null
}

/** `YYYY-MM-DD` + días, sobre fecha calendario. */
export function addDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(t.getUTCDate()).padStart(2, '0')
  return `${t.getUTCFullYear()}-${mm}-${dd}`
}

export function estadoPrueba(
  gratisHasta: string | null | undefined,
  ahora: Date,
): { estado: EstadoPrueba; diasRestantes: number | null } {
  const dias = daysUntil(gratisHasta ?? null, ahora)
  // Sin fecha no se muestra nada. Es lo que ve una cuenta anterior a la que
  // todavía no le corrió el backfill: falla en silencio, no con una franja
  // mintiendo sobre un plazo que nadie fijó.
  if (dias === null) return { estado: 'sin_prueba', diasRestantes: null }
  if (dias < 0) return { estado: 'vencida', diasRestantes: dias }
  if (dias <= UMBRAL_POR_TERMINAR) return { estado: 'por_terminar', diasRestantes: dias }
  return { estado: 'activa', diasRestantes: dias }
}
