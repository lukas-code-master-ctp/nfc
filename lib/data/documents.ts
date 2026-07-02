import { adminDb, adminBucket } from '@/lib/firebase/admin'
import type { VehicleDocument } from '@/lib/types'

const COL = 'documents'

type DocInput = Omit<VehicleDocument, 'id' | 'companyId' | 'createdByUid' | 'remindersSent' | 'createdAt'>

function toDoc(id: string, data: FirebaseFirestore.DocumentData): VehicleDocument {
  return {
    id,
    vehicleId: data.vehicleId,
    companyId: data.companyId,
    createdByUid: data.createdByUid ?? data.ownerUid ?? null,
    tipo: data.tipo,
    nombrePersonalizado: data.nombrePersonalizado ?? null,
    fechaVencimiento: data.fechaVencimiento ?? null,
    fileUrl: data.fileUrl,
    filePath: data.filePath,
    remindersSent: data.remindersSent ?? [],
    createdAt: data.createdAt,
  }
}

export async function createDocument(
  companyId: string,
  createdByUid: string,
  data: DocInput,
): Promise<VehicleDocument> {
  const createdAt = new Date().toISOString()
  const full = {
    ...data,
    companyId,
    createdByUid,
    remindersSent: [] as string[],
    createdAt,
  }
  const ref = await adminDb.collection(COL).add(full)
  return { id: ref.id, ...full }
}

export async function listDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  return snap.docs.map((d) => toDoc(d.id, d.data()))
}

export async function getDocument(documentId: string): Promise<VehicleDocument | null> {
  const doc = await adminDb.collection(COL).doc(documentId).get()
  return doc.exists ? toDoc(doc.id, doc.data()!) : null
}

async function assertCompany(documentId: string, companyId: string) {
  const d = await getDocument(documentId)
  if (!d || d.companyId !== companyId) throw new Error('forbidden')
  return d
}

export async function updateDocument(
  documentId: string,
  companyId: string,
  patch: Partial<DocInput> & { remindersSent?: string[] },
): Promise<void> {
  await assertCompany(documentId, companyId)
  await adminDb.collection(COL).doc(documentId).update(patch)
}

export async function deleteDocument(documentId: string, companyId: string): Promise<void> {
  const d = await assertCompany(documentId, companyId)
  if (d.filePath) {
    await adminBucket.file(d.filePath).delete({ ignoreNotFound: true })
  }
  await adminDb.collection(COL).doc(documentId).delete()
}

export async function listAllDocuments(): Promise<VehicleDocument[]> {
  const snap = await adminDb.collection(COL).where('fechaVencimiento', '!=', null).get()
  return snap.docs.map((d) => toDoc(d.id, d.data()))
}
