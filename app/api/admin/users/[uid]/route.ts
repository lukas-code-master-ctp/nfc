import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { isAdminEmail } from '@/lib/auth/admin'
import { saveCompany } from '@/lib/data/companies'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

// NOTA: este endpoint identifica empresas por el uid de su usuario (base
// 1 empresa = 1 usuario). Se reemplazará por `/api/admin/companies/[id]`
// en una tarea posterior cuando el panel admin liste empresas directamente.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { uid } = await params
  const body = await req.json()
  const max = Number(body?.maxVehiculos)
  if (!Number.isFinite(max) || max < 1) {
    return NextResponse.json({ error: 'maxVehiculos inválido (mínimo 1)' }, { status: 400 })
  }

  try {
    await adminAuth.getUser(uid)
  } catch {
    return NextResponse.json({ error: 'usuario no existe' }, { status: 404 })
  }

  const userDoc = await adminDb.collection('users').doc(uid).get()
  const companyId = userDoc.data()?.companyId as string | undefined
  if (!companyId) {
    return NextResponse.json({ error: 'usuario sin empresa asociada' }, { status: 404 })
  }

  await saveCompany(companyId, { plan: { maxVehiculos: Math.floor(max) } })
  return NextResponse.json({ ok: true, uid, maxVehiculos: Math.floor(max) })
}
