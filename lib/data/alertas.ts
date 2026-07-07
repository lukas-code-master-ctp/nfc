import { adminDb } from '@/lib/firebase/admin'
import type { Alerta } from '@/lib/types'

const COL = 'alertas'

function toAlerta(id: string, d: FirebaseFirestore.DocumentData): Alerta {
  return {
    id,
    companyId: d.companyId,
    vehicleId: d.vehicleId,
    patente: d.patente,
    usageId: d.usageId,
    tipo: d.tipo,
    driverNombre: d.driverNombre,
    nota: d.nota ?? undefined,
    creadaEn: d.creadaEn,
  }
}

export async function createAlerta(input: {
  companyId: string
  vehicleId: string
  patente: string
  usageId: string
  tipo: 'dano' | 'sin_entrega'
  driverNombre: string
  nota?: string
}): Promise<void> {
  await adminDb.collection(COL).add({
    companyId: input.companyId,
    vehicleId: input.vehicleId,
    patente: input.patente,
    usageId: input.usageId,
    tipo: input.tipo,
    driverNombre: input.driverNombre,
    nota: input.nota ?? null,
    creadaEn: new Date().toISOString(),
  })
}

// Query de un solo campo; la colección solo contiene alertas ABIERTAS (las
// atendidas se borran), así que se mantiene chica sin importar el historial.
export async function listAlertas(companyId: string): Promise<Alerta[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.docs.map((d) => toAlerta(d.id, d.data())).sort((a, b) => (a.creadaEn < b.creadaEn ? 1 : -1))
}

export async function deleteAlerta(companyId: string, id: string): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  await ref.delete()
}

export async function deleteDanoAlertaByUsage(companyId: string, usageId: string): Promise<void> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  const borrar = snap.docs.filter((d) => d.data().tipo === 'dano' && d.data().usageId === usageId)
  await Promise.all(borrar.map((d) => d.ref.delete()))
}
