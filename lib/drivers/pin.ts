import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const MAX_INTENTOS = 5
export const BLOQUEO_MS = 15 * 60 * 1000

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = (stored ?? '').split(':')
  if (!salt || !hash) return false
  const computed = scryptSync(pin, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return computed.length === expected.length && timingSafeEqual(computed, expected)
}

export function estaBloqueado(bloqueadoHasta: string | null | undefined, nowMs: number): boolean {
  if (!bloqueadoHasta) return false
  return new Date(bloqueadoHasta).getTime() > nowMs
}

export function trasIntentoFallido(
  intentosFallidos: number,
  nowMs: number,
): { intentosFallidos: number; bloqueadoHasta: string | null } {
  const next = intentosFallidos + 1
  if (next >= MAX_INTENTOS) {
    return { intentosFallidos: next, bloqueadoHasta: new Date(nowMs + BLOQUEO_MS).toISOString() }
  }
  return { intentosFallidos: next, bloqueadoHasta: null }
}
