import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { listVehicles, deleteVehicle } from '@/lib/data/vehicles'
import { deleteProfile } from '@/lib/data/profile'
import { adminDb, adminAuth } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

// Elimina la cuenta y TODOS sus datos (empresa, vehículos, documentos, archivos,
// perfil) y luego el usuario de Firebase Auth. El Admin SDK borra el usuario
// sin requerir reautenticación reciente del cliente.
// En esta base 1 empresa = 1 usuario, así que borrar la cuenta borra la
// empresa completa.
export async function DELETE() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const vehicles = await listVehicles(m.companyId)
  for (const v of vehicles) {
    await deleteVehicle(v.id, m.companyId) // cascada: borra documentos + archivos en Storage
  }
  await adminDb.collection('companies').doc(m.companyId).delete()
  await deleteProfile(m.uid)
  await adminAuth.deleteUser(m.uid)

  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
