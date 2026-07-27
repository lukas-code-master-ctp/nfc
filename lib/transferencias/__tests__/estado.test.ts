import { describe, it, expect } from 'vitest'
import { transferenciaVigente, puedeAceptar } from '@/lib/transferencias/estado'
import type { Transferencia } from '@/lib/types'

const AHORA = '2026-07-27T12:00:00.000Z'
const FUTURO = '2026-08-03T12:00:00.000Z'
const PASADO = '2026-07-20T12:00:00.000Z'

const base: Transferencia = {
  id: 't1',
  vehicleId: 'v1',
  patente: 'ABCD-12',
  deCompanyId: 'c1',
  deCompanyNombre: 'Transportes Uno',
  paraEmail: 'nuevo@dueno.cl',
  token: 'tok',
  status: 'pendiente',
  creadaPorUid: 'u1',
  createdAt: PASADO,
  expiresAt: FUTURO,
}

const params = (over: Partial<Parameters<typeof puedeAceptar>[0]> = {}) => ({
  transferencia: base,
  emailSesion: 'nuevo@dueno.cl',
  role: 'admin' as const,
  vehiculosActuales: 2,
  maxVehiculos: 5,
  nowIso: AHORA,
  ...over,
})

describe('transferenciaVigente', () => {
  it('es true si está pendiente y no venció', () => {
    expect(transferenciaVigente(base, AHORA)).toBe(true)
  })
  it('es false si ya venció', () => {
    expect(transferenciaVigente({ ...base, expiresAt: PASADO }, AHORA)).toBe(false)
  })
  it('es false si ya fue aceptada o cancelada', () => {
    expect(transferenciaVigente({ ...base, status: 'aceptada' }, AHORA)).toBe(false)
    expect(transferenciaVigente({ ...base, status: 'cancelada' }, AHORA)).toBe(false)
  })
})

describe('puedeAceptar', () => {
  it('deja pasar el camino feliz', () => {
    expect(puedeAceptar(params())).toBeNull()
  })

  it('rechaza si no está pendiente', () => {
    expect(puedeAceptar(params({ transferencia: { ...base, status: 'cancelada' } }))).toBe('no_pendiente')
  })

  it('rechaza si venció', () => {
    expect(puedeAceptar(params({ transferencia: { ...base, expiresAt: PASADO } }))).toBe('expirada')
  })

  it('rechaza si el correo de la sesión no es el destinatario', () => {
    expect(puedeAceptar(params({ emailSesion: 'otro@dueno.cl' }))).toBe('otro_destinatario')
  })

  it('compara el correo sin distinguir mayúsculas ni espacios', () => {
    expect(puedeAceptar(params({ emailSesion: '  Nuevo@Dueno.CL ' }))).toBeNull()
  })

  it('rechaza a quien no puede gestionar vehículos', () => {
    expect(puedeAceptar(params({ role: 'editor' }))).toBe('sin_permiso')
    expect(puedeAceptar(params({ role: 'viewer' }))).toBe('sin_permiso')
  })

  it('rechaza si el plan del destinatario está lleno', () => {
    expect(puedeAceptar(params({ vehiculosActuales: 5, maxVehiculos: 5 }))).toBe('plan_limit')
    expect(puedeAceptar(params({ vehiculosActuales: 6, maxVehiculos: 5 }))).toBe('plan_limit')
  })

  it('acepta justo debajo del tope', () => {
    expect(puedeAceptar(params({ vehiculosActuales: 4, maxVehiculos: 5 }))).toBeNull()
  })
})
