import { adminDb, adminBucket } from '@/lib/firebase/admin'
import { kmDeUsos } from '@/lib/usages/km'
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

/** Rutas en Storage de las fotos de un uso: tablero, cabina y foto de daño (omite las que falten). */
export function usagePhotoPaths(u: VehicleUsage): string[] {
  const paths: string[] = []
  if (u.fotos?.tablero) paths.push(u.fotos.tablero)
  if (u.fotos?.cabina) paths.push(u.fotos.cabina)
  if (u.dano?.fotoPath) paths.push(u.dano.fotoPath)
  return paths
}

// Borra los docs de uso + sus fotos en Storage (mismo criterio que deleteDocument: ignoreNotFound).
async function deleteUsageDocs(usages: VehicleUsage[]): Promise<void> {
  for (const u of usages) {
    for (const path of usagePhotoPaths(u)) {
      await adminBucket.file(path).delete({ ignoreNotFound: true })
    }
    await adminDb.collection(COL).doc(u.id).delete()
  }
}

/** Borra todos los usos de un vehículo y sus fotos en Storage. Cascada de deleteVehicle. */
export async function deleteUsagesByVehicle(vehicleId: string): Promise<void> {
  await deleteUsageDocs(await listUsages(vehicleId))
}

/** Borra todos los usos de una empresa y sus fotos en Storage. Backstop de deleteCompanyCascade. */
export async function deleteUsagesByCompany(companyId: string): Promise<void> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  await deleteUsageDocs(snap.docs.map((d) => toUsage(d.id, d.data())))
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
): Promise<{ id: string; entregaIrregular: boolean; driverOriginal: { id: string; nombre: string }; tomadoEn: string }> {
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
  return {
    id: open.id,
    entregaIrregular: entregadoPor.id !== open.driverId,
    driverOriginal: { id: open.driverId, nombre: open.driverNombre },
    tomadoEn: open.tomadoEn,
  }
}

export async function getUsage(id: string): Promise<VehicleUsage | null> {
  const doc = await adminDb.collection(COL).doc(id).get()
  return doc.exists ? toUsage(doc.id, doc.data()!) : null
}

/**
 * Cierre forzado manual de un uso abierto (botón "Forzar entrega"): lo marca
 * cerrado + `cierreForzado`, libera el vehículo y devuelve el `driverId` (para
 * sumarle `sinEntrega`). Espeja el force-close que hace `openUsage`.
 */
export async function forzarCierreUsage(companyId: string, usageId: string): Promise<{ driverId: string }> {
  const ref = adminDb.collection(COL).doc(usageId)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  const d = doc.data()!
  if (d.estado !== 'abierto') throw new Error('no_abierto')
  await ref.update({ estado: 'cerrado', cierreForzado: true })
  try {
    await adminDb.collection('vehicles').doc(d.vehicleId).update({ usoActual: null })
  } catch {
    /* best-effort: la denormalización no debe romper el cierre */
  }
  return { driverId: d.driverId }
}

export async function setUsageAnalysis(
  id: string,
  datos: { bencina: string | null; km: number | null; limpieza: string | null },
): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  await ref.update({
    bencina: datos.bencina,
    km: datos.km,
    limpieza: datos.limpieza,
    iaAnalizadoEn: new Date().toISOString(),
  })
  if (datos.km != null) {
    const vehicleId = (await ref.get()).data()?.vehicleId
    if (vehicleId) await refreshVehicleKm(vehicleId)
  }
}

/**
 * Recalcula el `kmActual` del vehículo a partir de sus usos (el máximo leído) y
 * lo denormaliza en `vehicles/{id}`. Best-effort: nunca lanza hacia afuera.
 */
export async function refreshVehicleKm(vehicleId: string): Promise<void> {
  try {
    const usos = await listUsages(vehicleId)
    const km = kmDeUsos(usos)
    if (!km) return
    await adminDb.collection('vehicles').doc(vehicleId).update({
      kmActual: km.km,
      kmActualizadoEn: km.fecha || null,
    })
  } catch (err) {
    console.error('[refreshVehicleKm]', vehicleId, err)
  }
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
  // Si se corrigió el km, reconcilia el km del vehículo (máximo entre sus usos).
  if (patch.km !== undefined) {
    const vehicleId = doc.data()?.vehicleId
    if (vehicleId) await refreshVehicleKm(vehicleId)
  }
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

export async function marcarDanoRevisado(
  companyId: string,
  usageId: string,
  revisor: { uid: string; nombre: string },
): Promise<void> {
  const ref = adminDb.collection(COL).doc(usageId)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  const dano = doc.data()?.dano
  if (!dano?.hay) throw new Error('no_dano')
  if (dano.revisadoPorUid) throw new Error('ya_revisado')
  await ref.update({
    'dano.revisadoPorUid': revisor.uid,
    'dano.revisadoPorNombre': revisor.nombre,
    'dano.revisadoEn': new Date().toISOString(),
  })
}
