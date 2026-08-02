import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { canjearPromo } from '@/lib/data/promoCodes'
import { normalizarCodigo } from '@/lib/promo/canje'
import { hoyEnChile } from '@/lib/documents/status'

export const dynamic = 'force-dynamic'

/**
 * Canjea un código. Canjear cambia lo que la empresa paga, así que es cosa del
 * Administrador. La revalidación de si el código sirve ocurre DENTRO de la
 * transacción de `canjearPromo`, no acá: entre esta comprobación y la escritura
 * el código puede agotarse.
 */
export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const { codigo } = body as Record<string, unknown>
  if (typeof codigo !== 'string') return NextResponse.json({ error: 'codigo requerido' }, { status: 400 })

  const ahora = new Date()
  const res = await canjearPromo({
    companyId: m.companyId,
    codigo: normalizarCodigo(codigo),
    hoy: hoyEnChile(ahora),
    ahoraIso: ahora.toISOString(),
  })
  if (!res.ok) return NextResponse.json({ error: res.motivo }, { status: 409 })
  return NextResponse.json({ ok: true, promo: res.promo })
}
