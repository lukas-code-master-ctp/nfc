import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { listVehicles, deleteVehicle } from '@/lib/data/vehicles'
import { deleteProfile } from '@/lib/data/profile'
import { adminAuth } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

// Elimina la cuenta y TODOS sus datos (vehículos, documentos, archivos, perfil)
// y luego el usuario de Firebase Auth. El Admin SDK borra el usuario sin requerir
// reautenticación reciente del cliente.
export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const vehicles = await listVehicles(user.uid)
  for (const v of vehicles) {
    await deleteVehicle(v.id, user.uid) // cascada: borra documentos + archivos en Storage
  }
  await deleteProfile(user.uid)
  await adminAuth.deleteUser(user.uid)

  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
