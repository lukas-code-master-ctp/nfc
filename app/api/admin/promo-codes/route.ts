import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { isAdminEmail } from '@/lib/auth/admin'
import { createPromoCode } from '@/lib/data/promoCodes'
import { normalizarCodigo } from '@/lib/promo/canje'
import { MAX_MESES_PROMO, MAX_VEHICULOS_PROMO } from '@/lib/types'

export const dynamic = 'force-dynamic'

// `getMembership()` y no `getCurrentUser()`: este endpoint MUTA, y
// `getCurrentUser()` por diseño no comprueba revocación de sesión.
export async function POST(req: NextRequest) {
  const me = await getMembership()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Admin de PLATAFORMA, no el rol 'admin' de empresa: crear códigos es del equipo.
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  const codigo = normalizarCodigo(typeof b.codigo === 'string' ? b.codigo : '')
  if (!codigo) return NextResponse.json({ error: 'codigo inválido' }, { status: 400 })

  const meses = Number(b.mesesGratis)
  const vehiculos = Number(b.vehiculosIncluidos)
  if (!Number.isFinite(meses) || meses < 0 || meses > MAX_MESES_PROMO) {
    return NextResponse.json({ error: 'mesesGratis inválido' }, { status: 400 })
  }
  if (!Number.isFinite(vehiculos) || vehiculos < 0 || vehiculos > MAX_VEHICULOS_PROMO) {
    return NextResponse.json({ error: 'vehiculosIncluidos inválido' }, { status: 400 })
  }
  // Un código que no otorga nada es un error de captura, no una campaña.
  if (meses === 0 && vehiculos === 0) {
    return NextResponse.json({ error: 'el código no otorga nada' }, { status: 400 })
  }

  const maxCanjes = b.maxCanjes == null || b.maxCanjes === '' ? null : Math.floor(Number(b.maxCanjes))
  if (maxCanjes != null && (!Number.isFinite(maxCanjes) || maxCanjes < 1)) {
    return NextResponse.json({ error: 'maxCanjes inválido' }, { status: 400 })
  }
  const expiraEn =
    typeof b.expiraEn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.expiraEn) ? b.expiraEn : null

  await createPromoCode(
    {
      codigo,
      descripcion: typeof b.descripcion === 'string' ? b.descripcion.slice(0, 200) : '',
      mesesGratis: Math.floor(meses),
      vehiculosIncluidos: Math.floor(vehiculos),
      expiraEn,
      maxCanjes,
    },
    me.uid,
  )
  return NextResponse.json({ ok: true, codigo })
}
