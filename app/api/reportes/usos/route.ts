import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { listUsagesPage } from '@/lib/data/usages'

export const dynamic = 'force-dynamic'

// `tomadoEn` se guarda como datetime ISO completo, pero el filtro de fecha de la UI
// (<input type="date">) manda solo la fecha (YYYY-MM-DD). Si se compara tal cual,
// "hasta" excluye todo el día final (ej. '2026-07-03T14:30...Z' <= '2026-07-03' es falso).
// Normalizamos la fecha "pelada" al límite del día correspondiente (UTC) antes de filtrar.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function normFecha(v: string | null, finDelDia: boolean): string | undefined {
  if (!v) return undefined
  return DATE_RE.test(v) ? `${v}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}Z` : v
}

export async function GET(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const driverId = p.get('driverId') || undefined
  const vehicleId = p.get('vehicleId') || undefined
  if (driverId && vehicleId) {
    return NextResponse.json({ error: 'Filtra por conductor o por vehículo, no ambos.' }, { status: 400 })
  }
  const desde = normFecha(p.get('desde'), false)
  const hasta = normFecha(p.get('hasta'), true)
  const cursor = p.get('cursor') || undefined

  try {
    const { items, nextCursor } = await listUsagesPage(m.companyId, { driverId, vehicleId, desde, hasta, cursor })
    return NextResponse.json({ items, nextCursor })
  } catch (e) {
    // Típicamente falta un índice compuesto (Firestore FAILED_PRECONDITION), pero
    // logueamos el error real para no dejar pasar un bug genuino sin rastro.
    console.error('[reportes/usos]', e)
    return NextResponse.json(
      { error: 'No se pudo cargar el reporte. Puede faltar configurar los índices de Firestore.' },
      { status: 503 },
    )
  }
}
