import { daysUntil } from '@/lib/documents/status'
import type { PautaMantencion } from '@/lib/types'

export type EstadoMantencion = 'sin_pauta' | 'sin_registro' | 'al_dia' | 'proxima' | 'vencida'

export const UMBRAL_KM_PROXIMA = 1000
export const UMBRAL_DIAS_PROXIMA = 30

/** Sanea la pauta: cadaKm/cadaMeses enteros ≥ 1, o null. */
export function sanitizePauta(raw: unknown): PautaMantencion {
  const r = (raw ?? {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : null)
  return { cadaKm: num(r.cadaKm), cadaMeses: num(r.cadaMeses) }
}

export function pautaVacia(p: PautaMantencion | null | undefined): boolean {
  return !p || (p.cadaKm == null && p.cadaMeses == null)
}

/** Suma `meses` a una fecha YYYY-MM-DD, recortando al último día del mes destino. */
export function addMeses(fechaISO: string, meses: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const total = (m - 1) + meses
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12 // 0-11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const RANK: Record<'al_dia' | 'proxima' | 'vencida', number> = { al_dia: 0, proxima: 1, vencida: 2 }

export interface EstadoInput {
  pauta: PautaMantencion | null
  ultima: { km: number | null; fecha: string } | null
  kmActual: number | null
  now: Date
}
export interface EstadoResult {
  estado: EstadoMantencion
  detalle: { kmRestantes?: number; diasRestantes?: number; proximaKm?: number; proximaFecha?: string }
}

export function estadoMantencion(input: EstadoInput): EstadoResult {
  const { pauta, ultima, kmActual, now } = input
  if (pautaVacia(pauta)) return { estado: 'sin_pauta', detalle: {} }
  if (!ultima) return { estado: 'sin_registro', detalle: {} }

  const detalle: EstadoResult['detalle'] = {}
  const criterios: ('al_dia' | 'proxima' | 'vencida')[] = []

  if (pauta!.cadaKm != null && ultima.km != null && kmActual != null) {
    const proximaKm = ultima.km + pauta!.cadaKm
    const kmRestantes = proximaKm - kmActual
    detalle.proximaKm = proximaKm
    detalle.kmRestantes = kmRestantes
    criterios.push(kmRestantes <= 0 ? 'vencida' : kmRestantes <= UMBRAL_KM_PROXIMA ? 'proxima' : 'al_dia')
  }

  if (pauta!.cadaMeses != null) {
    const proximaFecha = addMeses(ultima.fecha, pauta!.cadaMeses)
    const dias = daysUntil(proximaFecha, now)
    detalle.proximaFecha = proximaFecha
    if (dias != null) {
      detalle.diasRestantes = dias
      criterios.push(dias < 0 ? 'vencida' : dias <= UMBRAL_DIAS_PROXIMA ? 'proxima' : 'al_dia')
    }
  }

  if (criterios.length === 0) return { estado: 'sin_registro', detalle }
  const estado = criterios.reduce<'al_dia' | 'proxima' | 'vencida'>(
    (worst, c) => (RANK[c] > RANK[worst] ? c : worst),
    'al_dia',
  )
  return { estado, detalle }
}
