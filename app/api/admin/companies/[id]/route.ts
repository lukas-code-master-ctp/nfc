import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { isAdminEmail } from '@/lib/auth/admin'
import { saveCompany } from '@/lib/data/companies'
import { deleteCompanyCascade } from '@/lib/data/deleteCompany'

// `getMembership()` y no `getCurrentUser()`: este endpoint MUTA (cambia el
// cupo de plan de cualquier empresa, o la borra por completo) y
// `getCurrentUser()` por diseño no comprueba revocación. Sin esto, un admin
// de plataforma que pierde el teléfono y cierra sesión en todos los
// dispositivos deja ese teléfono pudiendo destruir empresas de clientes
// mientras la cookie siga viva. `ensureProvisioned` siempre deja
// `companyId` + `role` en `users/{uid}`, así que `getMembership()` también
// resuelve bien a los admins de plataforma (que además son miembros de una
// empresa como cualquier usuario).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMembership()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const max = Number(body?.maxVehiculos)
  if (!Number.isFinite(max) || max < 1) {
    return NextResponse.json({ error: 'maxVehiculos inválido (mínimo 1)' }, { status: 400 })
  }

  await saveCompany(id, { plan: { maxVehiculos: Math.floor(max) } })
  return NextResponse.json({ ok: true, companyId: id, maxVehiculos: Math.floor(max) })
}

// Elimina la empresa COMPLETA (vehículos, documentos, archivos, conductores,
// usos, alertas, invitaciones, miembros + usuarios de Auth). Irreversible.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMembership()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  await deleteCompanyCascade(id)
  return NextResponse.json({ ok: true })
}
