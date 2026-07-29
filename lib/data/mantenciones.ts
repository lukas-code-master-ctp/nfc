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
  return snap.docs.map((d) => toMantencion(d.id, d.data())).sort(
    // Comparador antisimétrico y determinista: por fecha descendente, y ante
    // empate por id descendente. El comparador anterior devolvía -1 en ambos
    // sentidos para fechas iguales, así que el orden dependía del algoritmo de
    // sort de V8 — y `ultimaMantencion` (que toma el primero) era arbitrario.
    (a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.id < b.id ? 1 : -1),
  )
}

export async function ultimaMantencion(vehicleId: string): Promise<{ km: number | null; fecha: string } | null> {
  const lista = await listMantenciones(vehicleId)
  if (lista.length === 0) return null
  return { km: lista[0].km, fecha: lista[0].fecha }
}

/** Devuelve el vehicleId para que el llamador refresque su resumen. */
export async function deleteMantencion(id: string, companyId: string): Promise<string> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  const vehicleId = doc.data()!.vehicleId as string
  const filePath = doc.data()?.filePath
  if (filePath) await adminBucket.file(filePath).delete({ ignoreNotFound: true })
  await ref.delete()
  return vehicleId
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

/**
 * Recalcula la última mantención denormalizada del vehículo.
 *
 * Best-effort, igual que refreshVehicleKm. El envoltorio `{ ultima }` es
 * deliberado: `{ ultima: null }` dice "calculado, no hay mantenciones", mientras
 * que el campo ausente dice "nunca se calculó" y dispara la consulta en vivo.
 */
export async function refreshResumenMantencion(vehicleId: string): Promise<void> {
  try {
    const ultima = await ultimaMantencion(vehicleId)
    await adminDb.collection('vehicles').doc(vehicleId).update({
      resumenMantencion: { ultima: ultima ?? null },
    })
  } catch (err) {
    console.error('[refreshResumenMantencion]', vehicleId, err)
  }
}
