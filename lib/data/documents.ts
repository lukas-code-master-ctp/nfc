import { adminDb, adminBucket } from '@/lib/firebase/admin'
import { resumirDocumentos } from '@/lib/documents/resumen'
import { ventanaRecordatorios } from '@/lib/documents/reminders'
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

/** Devuelve el vehicleId para que el llamador refresque su resumen. */
export async function updateDocument(
  documentId: string,
  companyId: string,
  patch: Partial<DocInput> & { remindersSent?: string[] },
): Promise<string> {
  const d = await assertCompany(documentId, companyId)
  await adminDb.collection(COL).doc(documentId).update(patch)
  return d.vehicleId
}

/** Devuelve el vehicleId para que el llamador refresque su resumen. */
export async function deleteDocument(documentId: string, companyId: string): Promise<string> {
  const d = await assertCompany(documentId, companyId)
  if (d.filePath) {
    await adminBucket.file(d.filePath).delete({ ignoreNotFound: true })
  }
  await adminDb.collection(COL).doc(documentId).delete()
  return d.vehicleId
}

/**
 * Los documentos que el cron diario tiene que evaluar: los que vencen dentro
 * de la ventana de recordatorios (ver `ventanaRecordatorios`).
 *
 * Antes esto era `listAllDocuments`, un barrido de la colección **completa**
 * todos los días. Como la mayoría de los documentos vence dentro de un año y
 * la ventana útil es de un mes, la enorme mayoría se leía a diario solo para
 * descartarla en memoria. Ese costo escalaba con toda la plataforma y se
 * pagaba aunque nadie abriera la app.
 *
 * El rango va sobre un **solo campo**, así que le basta el índice de campo
 * único que Firestore crea solo: no necesita índice compuesto. Y como en el
 * orden de Firestore `null` va antes que cualquier string, el borde inferior
 * ya excluye a los documentos sin vencimiento (el Padrón) sin filtro extra —
 * que es lo que hacía el `!= null` anterior.
 */
export async function listDocumentsPorVencer(now: Date): Promise<VehicleDocument[]> {
  const { desde, hasta } = ventanaRecordatorios(now)
  const snap = await adminDb
    .collection(COL)
    .where('fechaVencimiento', '>=', desde)
    .where('fechaVencimiento', '<=', hasta)
    .get()
  return snap.docs.map((d) => toDoc(d.id, d.data()))
}

/**
 * Recalcula el resumen de documentos del vehículo.
 *
 * Best-effort, igual que refreshVehicleKm: si esto falla, el documento que el
 * usuario acaba de subir ya está guardado y no queremos tumbarlo. El costo es un
 * badge desactualizado en la tarjeta del dashboard hasta la próxima escritura —
 * la ficha del vehículo y la ficha pública leen los documentos en vivo.
 */
export async function refreshResumenDocs(vehicleId: string): Promise<void> {
  try {
    const docs = await listDocuments(vehicleId)
    await adminDb.collection('vehicles').doc(vehicleId).update({
      resumenDocs: resumirDocumentos(docs),
    })
  } catch (err) {
    console.error('[refreshResumenDocs]', vehicleId, err)
  }
}
