import { adminDb } from '@/lib/firebase/admin'
import type { VehicleUsage } from '@/lib/types'

const COL = 'usages'

function toUsage(id: string, d: FirebaseFirestore.DocumentData): VehicleUsage {
  return {
    id,
    companyId: d.companyId,
    vehicleId: d.vehicleId,
    driverId: d.driverId,
    driverNombre: d.driverNombre,
    tomadoEn: d.tomadoEn,
    entregadoEn: d.entregadoEn ?? null,
    estado: d.estado,
    cierreForzado: d.cierreForzado ?? undefined,
    entregadoPorDriverId: d.entregadoPorDriverId ?? undefined,
    entregadoPorNombre: d.entregadoPorNombre ?? undefined,
    fotos: d.fotos ?? undefined,
    dano: d.dano ?? undefined,
    bencina: d.bencina ?? undefined,
    km: d.km ?? undefined,
    limpieza: d.limpieza ?? undefined,
    createdAt: d.createdAt,
  }
}

export async function listUsages(vehicleId: string): Promise<VehicleUsage[]> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  return snap.docs
    .map((d) => toUsage(d.id, d.data()))
    .sort((a, b) => (a.tomadoEn < b.tomadoEn ? 1 : -1))
}

export async function getOpenUsage(vehicleId: string): Promise<VehicleUsage | null> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  const abierto = snap.docs.map((d) => toUsage(d.id, d.data())).find((u) => u.estado === 'abierto')
  return abierto ?? null
}

export async function openUsage(
  companyId: string,
  vehicleId: string,
  driver: { id: string; nombre: string },
): Promise<{ usage: VehicleUsage; forced: VehicleUsage | null }> {
  const existing = await getOpenUsage(vehicleId)
  let forced: VehicleUsage | null = null
  if (existing) {
    await adminDb.collection(COL).doc(existing.id).update({ estado: 'cerrado', cierreForzado: true })
    forced = { ...existing, estado: 'cerrado', cierreForzado: true }
  }
  const now = new Date().toISOString()
  const data = {
    companyId,
    vehicleId,
    driverId: driver.id,
    driverNombre: driver.nombre,
    tomadoEn: now,
    entregadoEn: null,
    estado: 'abierto' as const,
    createdAt: now,
  }
  const ref = await adminDb.collection(COL).add(data)
  return { usage: { id: ref.id, ...data }, forced }
}

export async function closeUsage(
  companyId: string,
  vehicleId: string,
  entregadoPor: { id: string; nombre: string },
  fotos: { tablero: string; cabina: string },
  dano?: { hay: boolean; nota?: string; fotoPath?: string },
): Promise<void> {
  const open = await getOpenUsage(vehicleId)
  if (!open || open.companyId !== companyId) throw new Error('no_open')
  await adminDb.collection(COL).doc(open.id).update({
    estado: 'cerrado',
    entregadoEn: new Date().toISOString(),
    entregadoPorDriverId: entregadoPor.id,
    entregadoPorNombre: entregadoPor.nombre,
    fotos,
    ...(dano ? { dano } : {}),
  })
}
