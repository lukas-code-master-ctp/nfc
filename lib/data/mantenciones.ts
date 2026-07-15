import { adminDb, adminBucket } from '@/lib/firebase/admin'
import type { Mantencion } from '@/lib/types'

const COL = 'mantenciones'

function toMantencion(id: string, d: FirebaseFirestore.DocumentData): Mantencion {
  return {
    id,
    companyId: d.companyId,
    vehicleId: d.vehicleId,
    fecha: d.fecha,
    km: d.km ?? null,
    nota: d.nota ?? null,
    filePath: d.filePath ?? null,
    fileUrl: d.fileUrl ?? null,
    createdByUid: d.createdByUid ?? undefined,
    createdAt: d.createdAt,
  }
}

export async function createMantencion(
  companyId: string,
  createdByUid: string,
  input: { vehicleId: string; fecha: string; km: number | null; nota?: string | null; filePath?: string | null; fileUrl?: string | null },
): Promise<Mantencion> {
  const full = {
    companyId,
    vehicleId: input.vehicleId,
    fecha: input.fecha,
    km: input.km ?? null,
    nota: input.nota ?? null,
    filePath: input.filePath ?? null,
    fileUrl: input.fileUrl ?? null,
    createdByUid,
    createdAt: new Date().toISOString(),
  }
  const ref = await adminDb.collection(COL).add(full)
  // Resetea los hitos de email: tras registrar, el estado vuelve a "al día".
  try {
    await adminDb.collection('vehicles').doc(input.vehicleId).update({ mantencionReminders: [] })
  } catch {
    /* best-effort */
  }
  return { id: ref.id, ...full }
}

export async function listMantenciones(vehicleId: string): Promise<Mantencion[]> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  return snap.docs.map((d) => toMantencion(d.id, d.data())).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
}

export async function ultimaMantencion(vehicleId: string): Promise<{ km: number | null; fecha: string } | null> {
  const lista = await listMantenciones(vehicleId)
  if (lista.length === 0) return null
  return { km: lista[0].km, fecha: lista[0].fecha }
}

export async function deleteMantencion(id: string, companyId: string): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  const filePath = doc.data()?.filePath
  if (filePath) await adminBucket.file(filePath).delete({ ignoreNotFound: true })
  await ref.delete()
}

async function borrarDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<void> {
  for (const d of docs) {
    const filePath = d.data().filePath
    if (filePath) await adminBucket.file(filePath).delete({ ignoreNotFound: true })
    await d.ref.delete()
  }
}

export async function deleteMantencionesByVehicle(vehicleId: string): Promise<void> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  await borrarDocs(snap.docs)
}

export async function deleteMantencionesByCompany(companyId: string): Promise<void> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  await borrarDocs(snap.docs)
}
