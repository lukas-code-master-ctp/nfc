import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { listUsagesPage } from '@/lib/data/usages'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const driverId = p.get('driverId') || undefined
  const vehicleId = p.get('vehicleId') || undefined
  if (driverId && vehicleId) {
    return NextResponse.json({ error: 'Filtra por conductor o por vehículo, no ambos.' }, { status: 400 })
  }
  const desde = p.get('desde') || undefined
  const hasta = p.get('hasta') || undefined
  const cursor = p.get('cursor') || undefined

  try {
    const { items, nextCursor } = await listUsagesPage(m.companyId, { driverId, vehicleId, desde, hasta, cursor })
    return NextResponse.json({ items, nextCursor })
  } catch {
    // Típicamente falta un índice compuesto (Firestore FAILED_PRECONDITION).
    return NextResponse.json(
      { error: 'No se pudo cargar el reporte. Puede faltar configurar los índices de Firestore.' },
      { status: 503 },
    )
  }
}
