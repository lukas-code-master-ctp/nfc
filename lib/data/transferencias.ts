import { adminDb } from '@/lib/firebase/admin'
import { nanoid } from 'nanoid'
import type { Transferencia } from '@/lib/types'
import { transferenciaVigente } from '@/lib/transferencias/estado'
import { normalizeEmail } from '@/lib/data/invitations'

const COL = 'transferencias'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

function toTransferencia(id: string, d: FirebaseFirestore.DocumentData): Transferencia {
  return {
    id,
    vehicleId: d.vehicleId,
    patente: d.patente,
    deCompanyId: d.deCompanyId,
    deCompanyNombre: d.deCompanyNombre,
    paraEmail: d.paraEmail,
    token: d.token,
    status: d.status,
    creadaPorUid: d.creadaPorUid,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt,
    aceptadaPorUid: d.aceptadaPorUid ?? undefined,
    aceptadaEn: d.aceptadaEn ?? undefined,
  }
}

export async function createTransferencia(p: {
  vehicleId: string
  patente: string
  deCompanyId: string
  deCompanyNombre: string
  paraEmail: string
  creadaPorUid: string
}): Promise<Transferencia> {
  const now = new Date()
  const data = {
    ...p,
    token: nanoid(32),
    status: 'pendiente' as const,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
  }
  const ref = await adminDb.collection(COL).add(data)
  return { id: ref.id, ...data }
}

export async function getTransferenciaByToken(token: string): Promise<Transferencia | null> {
  const snap = await adminDb.collection(COL).where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return toTransferencia(snap.docs[0].id, snap.docs[0].data())
}

// Query de un solo campo + filtro en memoria (evita índices compuestos).
export async function getPendienteByVehicle(vehicleId: string): Promise<Transferencia | null> {
  const snap = await adminDb.collection(COL).where('vehicleId', '==', vehicleId).get()
  const nowIso = new Date().toISOString()
  const vigentes = snap.docs
    .map((d) => toTransferencia(d.id, d.data()))
    .filter((t) => transferenciaVigente(t, nowIso))
  return vigentes[0] ?? null
}

export async function cancelTransferencia(id: string, deCompanyId: string): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.deCompanyId !== deCompanyId) throw new Error('forbidden')
  await ref.update({ status: 'cancelada' })
}

/** Transferencias vigentes dirigidas a un correo (para el banner del dashboard). */
export async function listPendientesPara(email: string): Promise<Transferencia[]> {
  const snap = await adminDb.collection(COL).where('paraEmail', '==', normalizeEmail(email)).get()
  const nowIso = new Date().toISOString()
  return snap.docs
    .map((d) => toTransferencia(d.id, d.data()))
    .filter((t) => transferenciaVigente(t, nowIso))
}

/** Transferencias vigentes que envió una empresa (para la pill del dashboard). */
export async function listPendientesDe(companyId: string): Promise<Transferencia[]> {
  const snap = await adminDb.collection(COL).where('deCompanyId', '==', companyId).get()
  const nowIso = new Date().toISOString()
  return snap.docs
    .map((d) => toTransferencia(d.id, d.data()))
    .filter((t) => transferenciaVigente(t, nowIso))
}

export async function markAceptada(id: string, aceptadaPorUid: string): Promise<void> {
  await adminDb.collection(COL).doc(id).update({
    status: 'aceptada',
    aceptadaPorUid,
    aceptadaEn: new Date().toISOString(),
  })
}
