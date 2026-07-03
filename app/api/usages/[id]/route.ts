import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { updateUsageDatos } from '@/lib/data/usages'

export const dynamic = 'force-dynamic'

const NIVELES = ['Lleno', '3/4', '1/2', '1/4', 'Reserva']
const LIMPIEZAS = ['limpio', 'aceptable', 'sucio']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const patch: { bencina?: string; km?: number; limpieza?: string } = {}
  if (body?.bencina !== undefined) {
    if (typeof body.bencina !== 'string' || !NIVELES.includes(body.bencina)) {
      return NextResponse.json({ error: 'Nivel de bencina inválido.' }, { status: 400 })
    }
    patch.bencina = body.bencina
  }
  if (body?.km !== undefined) {
    const n = Number(body.km)
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: 'Kilometraje inválido.' }, { status: 400 })
    }
    patch.km = n
  }
  if (body?.limpieza !== undefined) {
    if (typeof body.limpieza !== 'string' || !LIMPIEZAS.includes(body.limpieza)) {
      return NextResponse.json({ error: 'Estado de limpieza inválido.' }, { status: 400 })
    }
    patch.limpieza = body.limpieza
  }

  try {
    await updateUsageDatos(m.companyId, id, patch)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
