import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { getCompany } from '@/lib/data/companies'
import { deleteCompanyCascade } from '@/lib/data/deleteCompany'
import { deleteProfile } from '@/lib/data/profile'
import { adminAuth } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

// Dueño de la empresa: borra la empresa COMPLETA (cascade: vehículos, documentos,
// archivos, conductores, usos, alertas, invitaciones, miembros + sus usuarios de
// Auth). Miembro no-dueño: borra SOLO su perfil y su usuario de Auth — la empresa
// y los demás miembros quedan intactos.
export async function DELETE() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const company = await getCompany(m.companyId)
  if (company && company.ownerUid === m.uid) {
    await deleteCompanyCascade(m.companyId)
  } else {
    await deleteProfile(m.uid)
    await adminAuth.deleteUser(m.uid)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
