// Lógica de plan (pura, sin Firebase). El cupo de vehículos vive en la empresa
// (`companies/{companyId}.plan.maxVehiculos`), lo configura un admin de la
// plataforma. Mientras no esté seteado, se usa el default. Mínimo 1 siempre.
import { DEFAULT_PLAN, type PlanData } from '@/lib/types'

export function maxVehiculosDe(plan: PlanData | undefined): number {
  const n = plan?.maxVehiculos ?? DEFAULT_PLAN.maxVehiculos
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

/**
 * ¿Esta empresa tiene que pasar por la pantalla de elección de plan?
 *
 * Solo con `periodicidad === null` explícito, que es lo que siembra
 * `createCompany`. El campo **ausente** es una cuenta anterior al selector y
 * NO se le fuerza ninguna pantalla: por eso la comparación es estricta contra
 * `null` y no un chequeo de falsy.
 */
export function debeElegirPlan(plan: PlanData | undefined): boolean {
  return plan?.periodicidad === null
}
