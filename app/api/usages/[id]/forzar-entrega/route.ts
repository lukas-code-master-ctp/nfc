import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { forzarCierreUsage } from '@/lib/data/usages'
import { incrementDriverStats } from '@/lib/data/drivers'

export const dynamic = 'force-dynamic'

// Editor/Administrador fuerza la entrega (cierre forzado) de un uso abierto que
// quedó colgado: cierra el uso, libera el vehículo y suma sinEntrega al conductor.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params

  let driverId: string
  try {
    const r = await forzarCierreUsage(m.companyId, id)
    driverId = r.driverId
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'no_abierto') return NextResponse.json({ error: 'El uso ya está cerrado.' }, { status: 409 })
    if (msg === 'forbidden') return NextResponse.json({ error: 'No encontrado.' }, { status: 404 })
    console.error('[forzar-entrega]', e)
    return NextResponse.json({ error: 'No se pudo forzar la entrega.' }, { status: 500 })
  }

  try { await incrementDriverStats(driverId, 'sinEntrega') } catch { /* best-effort */ }
  return NextResponse.json({ ok: true })
}
