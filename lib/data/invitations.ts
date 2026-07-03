import { adminDb } from '@/lib/firebase/admin'
import { nanoid } from 'nanoid'
import type { Invitation } from '@/lib/types'
import type { Role } from '@/lib/auth/roles'

const COL = 'invitations'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toInvitation(id: string, d: FirebaseFirestore.DocumentData): Invitation {
  return {
    id,
    companyId: d.companyId,
    email: d.email,
    role: d.role,
    token: d.token,
    status: d.status,
    invitedByUid: d.invitedByUid,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt,
    acceptedByUid: d.acceptedByUid ?? undefined,
    acceptedAt: d.acceptedAt ?? undefined,
  }
}

function vigente(inv: Invitation, nowIso: string): boolean {
  return inv.status === 'pending' && inv.expiresAt > nowIso
}

export async function createInvitation(p: {
  companyId: string
  email: string
  role: Role
  invitedByUid: string
}): Promise<Invitation> {
  const now = new Date()
  const data = {
    companyId: p.companyId,
    email: normalizeEmail(p.email),
    role: p.role,
    token: nanoid(32),
    status: 'pending' as const,
    invitedByUid: p.invitedByUid,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
  }
  const ref = await adminDb.collection(COL).add(data)
  return { id: ref.id, ...data }
}

// Query de un solo campo + filtro en memoria (evita índices compuestos).
export async function listPendingInvitations(companyId: string): Promise<Invitation[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  const nowIso = new Date().toISOString()
  return snap.docs.map((d) => toInvitation(d.id, d.data())).filter((i) => vigente(i, nowIso))
}

export async function countPendingInvitations(companyId: string): Promise<number> {
  return (await listPendingInvitations(companyId)).length
}

export async function hasPendingInvitation(companyId: string, email: string): Promise<boolean> {
  const e = normalizeEmail(email)
  return (await listPendingInvitations(companyId)).some((i) => i.email === e)
}

export async function findPendingInvitationByEmail(email: string): Promise<Invitation | null> {
  const e = normalizeEmail(email)
  const snap = await adminDb.collection(COL).where('email', '==', e).get()
  const nowIso = new Date().toISOString()
  const vigentes = snap.docs.map((d) => toInvitation(d.id, d.data())).filter((i) => vigente(i, nowIso))
  if (vigentes.length === 0) return null
  vigentes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return vigentes[0]
}

export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const snap = await adminDb.collection(COL).where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return toInvitation(snap.docs[0].id, snap.docs[0].data())
}

export async function revokeInvitation(id: string, companyId: string): Promise<void> {
  const ref = adminDb.collection(COL).doc(id)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  await ref.update({ status: 'revoked' })
}

export async function markInvitationAccepted(id: string, acceptedByUid: string): Promise<void> {
  await adminDb.collection(COL).doc(id).update({
    status: 'accepted',
    acceptedByUid,
    acceptedAt: new Date().toISOString(),
  })
}
