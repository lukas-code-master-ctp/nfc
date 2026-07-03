import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { hashPin, verifyPin, estaBloqueado, trasIntentoFallido } from '@/lib/drivers/pin'
import type { Driver } from '@/lib/types'

const COL = 'drivers'

function toDriver(id: string, d: FirebaseFirestore.DocumentData): Driver {
  return {
    id,
    companyId: d.companyId,
    nombre: d.nombre,
    rut: d.rut ?? undefined,
    pinHash: d.pinHash,
    activo: d.activo !== false,
    createdAt: d.createdAt,
    createdByUid: d.createdByUid ?? undefined,
    intentosFallidos: d.intentosFallidos ?? 0,
    bloqueadoHasta: d.bloqueadoHasta ?? null,
    stats: {
      usos: d.stats?.usos ?? 0,
      danos: d.stats?.danos ?? 0,
      sinEntrega: d.stats?.sinEntrega ?? 0,
    },
  }
}

export async function createDriver(
  companyId: string,
  createdByUid: string,
  input: { nombre: string; rut?: string; pin: string },
): Promise<{ id: string }> {
  const data = {
    companyId,
    nombre: input.nombre.trim(),
    rut: input.rut?.trim() || null,
    pinHash: hashPin(input.pin),
    activo: true,
    intentosFallidos: 0,
    bloqueadoHasta: null,
    createdByUid,
    createdAt: new Date().toISOString(),
  }
  const ref = await adminDb.collection(COL).add(data)
  return { id: ref.id }
}

export async function listDrivers(companyId: string): Promise<Driver[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.docs.map((d) => toDriver(d.id, d.data())).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

// Incremento best-effort de un contador del conductor (para el reporte de responsabilidad).
export async function incrementDriverStats(
  driverId: string,
  campo: 'usos' | 'danos' | 'sinEntrega',
): Promise<void> {
  await adminDb.collection(COL).doc(driverId).update({ [`stats.${campo}`]: FieldValue.increment(1) })
}

export async function listActiveDrivers(companyId: string): Promise<{ id: string; nombre: string }[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => (d as { activo?: boolean }).activo !== false)
    .map((d) => ({ id: d.id, nombre: (d as unknown as { nombre: string }).nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export async function getDriver(driverId: string): Promise<Driver | null> {
  const doc = await adminDb.collection(COL).doc(driverId).get()
  return doc.exists ? toDriver(doc.id, doc.data()!) : null
}

async function assertCompany(driverId: string, companyId: string) {
  const ref = adminDb.collection(COL).doc(driverId)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  return ref
}

export async function updateDriver(
  companyId: string,
  driverId: string,
  patch: { nombre?: string; rut?: string; activo?: boolean },
): Promise<void> {
  const ref = await assertCompany(driverId, companyId)
  const data: Record<string, unknown> = {}
  if (patch.nombre !== undefined) data.nombre = patch.nombre.trim()
  if (patch.rut !== undefined) data.rut = patch.rut.trim() || null
  if (patch.activo !== undefined) data.activo = patch.activo
  await ref.update(data)
}

export async function resetDriverPin(companyId: string, driverId: string, pin: string): Promise<void> {
  const ref = await assertCompany(driverId, companyId)
  await ref.update({ pinHash: hashPin(pin), intentosFallidos: 0, bloqueadoHasta: null })
}

export async function deleteDriver(companyId: string, driverId: string): Promise<void> {
  const ref = await assertCompany(driverId, companyId)
  await ref.delete()
}

export async function verifyDriverPin(
  companyId: string,
  driverId: string,
  pin: string,
): Promise<'ok' | 'bad_pin' | 'locked'> {
  const ref = adminDb.collection(COL).doc(driverId)
  const doc = await ref.get()
  if (!doc.exists) return 'bad_pin'
  const d = doc.data()!
  if (d.companyId !== companyId || d.activo === false) return 'bad_pin'
  const now = Date.now()
  if (estaBloqueado(d.bloqueadoHasta, now)) return 'locked'
  if (verifyPin(pin, d.pinHash)) {
    if (d.intentosFallidos) await ref.update({ intentosFallidos: 0, bloqueadoHasta: null })
    return 'ok'
  }
  const next = trasIntentoFallido(d.intentosFallidos ?? 0, now)
  await ref.update(next)
  return next.bloqueadoHasta ? 'locked' : 'bad_pin'
}
