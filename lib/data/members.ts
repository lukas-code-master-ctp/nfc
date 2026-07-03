import { adminDb, adminAuth } from '@/lib/firebase/admin'
import type { Role } from '@/lib/auth/roles'

export interface Member {
  uid: string
  email: string
  displayName: string
  role: Role
  isOwner: boolean
}

const COL = 'users'

export async function listMembers(companyId: string, ownerUid: string): Promise<Member[]> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  const members: Member[] = []
  for (const d of snap.docs) {
    const data = d.data()
    let email: string = data.email ?? ''
    if (!email) {
      try {
        email = (await adminAuth.getUser(d.id)).email ?? ''
      } catch {
        email = ''
      }
    }
    members.push({
      uid: d.id,
      email,
      displayName: data.displayName ?? '',
      role: data.role,
      isOwner: d.id === ownerUid,
    })
  }
  return members
}

export async function countMembers(companyId: string): Promise<number> {
  const snap = await adminDb.collection(COL).where('companyId', '==', companyId).get()
  return snap.size
}

async function assertSameCompany(targetUid: string, companyId: string) {
  const ref = adminDb.collection(COL).doc(targetUid)
  const doc = await ref.get()
  if (!doc.exists || doc.data()?.companyId !== companyId) throw new Error('forbidden')
  return ref
}

export async function changeMemberRole(companyId: string, targetUid: string, role: Role): Promise<void> {
  const ref = await assertSameCompany(targetUid, companyId)
  await ref.update({ role })
}

export async function removeMember(companyId: string, targetUid: string): Promise<void> {
  const ref = await assertSameCompany(targetUid, companyId)
  await ref.delete()
}
