import { adminDb } from '@/lib/firebase/admin'
import { DEFAULT_PLAN, EMPTY_COMPANY, type Categoria, type Company, type CompanyData, type PlanData } from '@/lib/types'
import { findPendingInvitationByEmail, markInvitationAccepted } from '@/lib/data/invitations'

const COL = 'companies'

export async function getCompany(companyId: string): Promise<Company | null> {
  const doc = await adminDb.collection(COL).doc(companyId).get()
  if (!doc.exists) return null
  const d = doc.data()!
  return {
    id: doc.id,
    ownerUid: d.ownerUid,
    company: { ...EMPTY_COMPANY, ...(d.company ?? {}) },
    plan: { ...DEFAULT_PLAN, ...(d.plan ?? {}) },
    avisoUsoHoras: d.avisoUsoHoras,
    categorias: d.categorias ?? [],
    createdAt: d.createdAt ?? null,
  }
}

export async function createCompany(
  ownerUid: string,
  data: { company: CompanyData; plan: PlanData },
): Promise<string> {
  const ref = await adminDb.collection(COL).add({
    ownerUid,
    company: data.company,
    plan: { maxVehiculos: Math.max(1, Math.floor(data.plan.maxVehiculos)) },
    createdAt: new Date().toISOString(),
  })
  return ref.id
}

// Solo un Administrador de la empresa llama esto (validado en la capa /api).
export async function saveCompany(
  companyId: string,
  patch: { company?: CompanyData; plan?: PlanData; avisoUsoHoras?: number; categorias?: Categoria[] },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.company !== undefined) data.company = patch.company
  if (patch.plan !== undefined) data.plan = { maxVehiculos: Math.max(1, Math.floor(patch.plan.maxVehiculos)) }
  if (patch.avisoUsoHoras !== undefined) data.avisoUsoHoras = Math.max(1, Math.floor(patch.avisoUsoHoras))
  if (patch.categorias !== undefined) data.categorias = patch.categorias
  await adminDb.collection(COL).doc(companyId).set(data, { merge: true })
}

/**
 * Provisiona al usuario en su primer login: crea su empresa (o reutiliza una
 * ya existente a su nombre) y su doc en `users/{uid}` con companyId + role.
 * Idempotente: si el usuario ya tiene companyId, no hace nada (usuario
 * migrado o ya provisionado en un login anterior).
 */
export async function ensureProvisioned(uid: string, email: string): Promise<void> {
  const userRef = adminDb.collection('users').doc(uid)
  const userDoc = await userRef.get()
  if (userDoc.exists && userDoc.data()?.companyId) return

  // ¿Fue invitado? Unirlo a esa empresa con su rol en vez de crear una propia.
  const invite = email ? await findPendingInvitationByEmail(email) : null
  if (invite) {
    const patch: Record<string, unknown> = { email, companyId: invite.companyId, role: invite.role }
    if (!userDoc.exists) {
      patch.displayName = ''
      patch.createdAt = new Date().toISOString()
    }
    await userRef.set(patch, { merge: true })
    await markInvitationAccepted(invite.id, uid)
    return
  }

  let companyId: string
  const existing = await adminDb.collection(COL).where('ownerUid', '==', uid).limit(1).get()
  if (!existing.empty) {
    companyId = existing.docs[0].id
  } else {
    companyId = await createCompany(uid, { company: { ...EMPTY_COMPANY }, plan: { ...DEFAULT_PLAN } })
  }

  const patch: Record<string, unknown> = { email, companyId, role: 'admin' }
  if (!userDoc.exists) {
    patch.displayName = ''
    patch.createdAt = new Date().toISOString()
  }
  await userRef.set(patch, { merge: true })
}
