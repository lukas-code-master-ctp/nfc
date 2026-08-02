import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { getPromoCode } from '@/lib/data/promoCodes'
import { normalizarCodigo, puedeCanjear } from '@/lib/promo/canje'
import { hoyEnChile } from '@/lib/documents/status'

export const dynamic = 'force-dynamic'

/**
 * Vista previa de un código, SOLO LECTURA: no muta nada y no incrementa el
 * contador de canjes. Alimenta lo que el usuario ve mientras escribe.
 *
 * Exige sesión y rol Administrador porque cuesta una lectura por pulsación
 * potencial, y porque canjear es cosa del Administrador de todas formas.
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

  const canonico = normalizarCodigo(codigo)
  // Un código que queda vacío tras normalizar no se busca: no existe y punto.
  if (!canonico) return NextResponse.json({ valido: false, motivo: 'no_existe' })

  const [code, company] = await Promise.all([getPromoCode(canonico), getCompany(m.companyId)])
  const motivo = puedeCanjear({
    code,
    promoActual: company?.plan?.promo ?? null,
    hoy: hoyEnChile(new Date()),
  })
  if (motivo) return NextResponse.json({ valido: false, motivo })

  return NextResponse.json({
    valido: true,
    mesesGratis: code!.mesesGratis,
    vehiculosIncluidos: code!.vehiculosIncluidos,
  })
}
