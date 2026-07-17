import { adminDb, adminBucket } from '@/lib/firebase/admin'
import { nanoid } from 'nanoid'
import { listDocuments, deleteDocument } from '@/lib/data/documents'
import { deleteUsagesByVehicle } from '@/lib/data/usages'
import { deleteMantencionesByVehicle } from '@/lib/data/mantenciones'
import { getCompany } from '@/lib/data/companies'
import { alertRecipientEmails } from '@/lib/data/members'
import type { Vehicle, DanoActivo } from '@/lib/types'

const COL = 'vehicles'

type VehicleInput = Omit<Vehicle, 'id' | 'companyId' | 'createdByUid' | 'publicToken' | 'createdAt'>

function toVehicle(id: string, data: FirebaseFirestore.DocumentData): Vehicle {
  return {
    id,
    companyId: data.companyId,
    createdByUid: data.createdByUid ?? data.ownerUid ?? null,
    patente: data.patente,
    marca: data.marca,
    modelo: data.modelo,
    anio: data.anio,
    color: data.color,
    info: data.info ?? {},
    publicToken: data.publicToken,
    createdAt: data.createdAt,
    usoActual: data.usoActual ?? null,
    categoriaId: data.categoriaId ?? null,
    kmActual: data.kmActual ?? null,
    kmActualizadoEn: data.kmActualizadoEn ?? null,
    pautaMantencion: data.pautaMantencion ?? null,
    mantencionReminders: data.mantencionReminders ?? [],
    danoActivo: data.danoActivo ?? null,
  }
}

export async function createVehicle(
  companyId: string,
  createdByUid: string,
  data: VehicleInput,
): Promise<Vehicle> {
  const publicToken = nanoid(21)
  const createdAt = new Date().toISOString()
  const ref = await adminDb.collection(COL).add({ ...data, companyId, createdByUid, publicToken, createdAt })
  return { id: ref.id, companyId, createdByUid, publicToken, createdAt, ...data }
}

export async function listVehicles(companyId: string): Promise<Vehicle[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.docs.map((d) => toVehicle(d.id, d.data()))
}

export async function getVehicle(vehicleId: string): Promise<Vehicle | null> {
  const doc = await adminDb.collection(COL).doc(vehicleId).get()
  return doc.exists ? toVehicle(doc.id, doc.data()!) : null
}

export async function getVehicleByToken(publicToken: string): Promise<Vehicle | null> {
  const snap = await adminDb.collection(COL).where('publicToken', '==', publicToken).limit(1).get()
  if (snap.empty) return null
  const d = snap.docs[0]
  return toVehicle(d.id, d.data())
}

async function assertCompany(vehicleId: string, companyId: string) {
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== companyId) throw new Error('forbidden')
  return v
}

export async function updateVehicle(
  vehicleId: string,
  companyId: string,
  patch: Partial<VehicleInput>,
): Promise<void> {
  await assertCompany(vehicleId, companyId)
  await adminDb.collection(COL).doc(vehicleId).update(patch)
}

export async function setDanoActivo(vehicleId: string, companyId: string, dano: DanoActivo): Promise<void> {
  const v = await assertCompany(vehicleId, companyId)
  const anterior = v.danoActivo?.fotoPath
  if (anterior && anterior !== dano.fotoPath) {
    await adminBucket.file(anterior).delete({ ignoreNotFound: true })
  }
  await adminDb.collection(COL).doc(vehicleId).update({ danoActivo: dano })
}

export async function clearDanoActivo(vehicleId: string, companyId: string): Promise<void> {
  const v = await assertCompany(vehicleId, companyId)
  const foto = v.danoActivo?.fotoPath
  if (foto) await adminBucket.file(foto).delete({ ignoreNotFound: true })
  await adminDb.collection(COL).doc(vehicleId).update({ danoActivo: null })
}

export async function deleteVehicle(vehicleId: string, companyId: string): Promise<void> {
  await assertCompany(vehicleId, companyId)
  // Borrado en cascada: documentos hijos (+ sus archivos) y usos de bitácora (+ sus fotos)
  // en Storage antes del vehículo, para no dejar archivos huérfanos.
  const docs = await listDocuments(vehicleId)
  for (const d of docs) {
    await deleteDocument(d.id, companyId)
  }
  await deleteUsagesByVehicle(vehicleId)
  await deleteMantencionesByVehicle(vehicleId)
  const vActual = await getVehicle(vehicleId)
  if (vActual?.danoActivo?.fotoPath) {
    await adminBucket.file(vActual.danoActivo.fotoPath).delete({ ignoreNotFound: true })
  }
  await adminDb.collection(COL).doc(vehicleId).delete()
}

export async function regenerateToken(vehicleId: string, companyId: string): Promise<string> {
  await assertCompany(vehicleId, companyId)
  const publicToken = nanoid(21)
  await adminDb.collection(COL).doc(vehicleId).update({ publicToken })
  return publicToken
}

export async function vehicleInfoForReminder(
  vehicleId: string,
): Promise<{ patente: string; emails: string[] } | null> {
  const v = await getVehicle(vehicleId)
  if (!v || !v.companyId) return null
  try {
    const company = await getCompany(v.companyId)
    if (!company) return { patente: v.patente, emails: [] }
    const emails = await alertRecipientEmails(v.companyId, company.ownerUid)
    return { patente: v.patente, emails }
  } catch {
    return { patente: v.patente, emails: [] }
  }
}
