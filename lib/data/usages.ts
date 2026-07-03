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
    iaAnalizadoEn: d.iaAnalizadoEn ?? undefined,
    datosConfirmados: d.datosConfirmados ?? undefined,
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
  try {
    await adminDb.collection('vehicles').doc(vehicleId).update({
      usoActual: { driverId: driver.id, driverNombre: driver.nombre, tomadoEn: now },
    })
  } catch {
    /* best-effort: la denormalización no debe romper el flujo del conductor */
  }
  return { usage: { id: ref.id, ...data }, forced }
}

export async function closeUsage(
  companyId: string,
  vehicleId: string,
  entregadoPor: { id: string; nombre: string },
  fotos: { tablero: string; cabina: string },
  dano?: { hay: boolean; nota?: string; fotoPath?: string },
): Promise<string> {
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
  try {
    await adminDb.collection('vehicles').doc(vehicleId).update({ usoActual: null })
  } catch {
    /* best-effort: la denormalización no debe romper el flujo del conductor */
  }
  return open.id
}

export async function getUsage(id: string): Promise<VehicleUsage | null> {
  const doc = await adminDb.collection(COL).doc(id).get()
  return doc.exists ? toUsage(doc.id, doc.data()!) : null
}

export async function setUsageAnalysis(
  id: string,
  datos: { bencina: string | null; km: number | null; limpieza: string | null },
): Promise<void> {
  await adminDb.collection(COL).doc(id).update({
    bencina: datos.bencina,
    km: datos.km,
    limpieza: datos.limpieza,
    iaAnalizadoEn: new Date().toISOString(),
  })
}

export async function updateUsageDatos(
  companyId: string,
  id: string,
  patch: { bencina?: string; km?: number; limpieza?: string },
): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  await ref.update({ ...patch, datosConfirmados: true })
}

export async function listUsagesPage(
  companyId: string,
  filtros: { driverId?: string; vehicleId?: string; desde?: string; hasta?: string; cursor?: string },
  pageSize = 20,
): Promise<{ items: VehicleUsage[]; nextCursor: string | null }> {
  let q: FirebaseFirestore.Query = adminDb.collection(COL).where('companyId', '==', companyId)
  if (filtros.driverId) q = q.where('driverId', '==', filtros.driverId)
  else if (filtros.vehicleId) q = q.where('vehicleId', '==', filtros.vehicleId)
  if (filtros.desde) q = q.where('tomadoEn', '>=', filtros.desde)
  if (filtros.hasta) q = q.where('tomadoEn', '<=', filtros.hasta)
  q = q.orderBy('tomadoEn', 'desc')
  if (filtros.cursor) q = q.startAfter(filtros.cursor)
  q = q.limit(pageSize)
  const snap = await q.get()
  const items = snap.docs.map((d) => toUsage(d.id, d.data()))
  const nextCursor = items.length === pageSize ? items[items.length - 1].tomadoEn : null
  return { items, nextCursor }
}
