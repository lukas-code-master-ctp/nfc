import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { saveOnboarding } from '@/lib/data/companies'
import { esPasoInformativo } from '@/lib/onboarding/pasos'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const patch: Parameters<typeof saveOnboarding>[1] = {}

  if (body.tipoCuenta !== undefined) {
    if (body.tipoCuenta !== 'personal' && body.tipoCuenta !== 'empresa') {
      return NextResponse.json({ error: 'tipoCuenta inválido' }, { status: 400 })
    }
    patch.tipoCuenta = body.tipoCuenta
  }

  if (body.visto !== undefined) {
    // Solo los pasos informativos se guardan; el resto se deriva de los datos.
    if (typeof body.visto !== 'string' || !esPasoInformativo(body.visto)) {
      return NextResponse.json({ error: 'paso desconocido' }, { status: 400 })
    }
    patch.agregarVisto = body.visto
  }

  if (body.descartado !== undefined) {
    if (typeof body.descartado !== 'boolean') {
      return NextResponse.json({ error: 'descartado inválido' }, { status: 400 })
    }
    patch.descartadoEn = body.descartado ? new Date().toISOString() : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 })
  }

  await saveOnboarding(m.companyId, patch)
  return NextResponse.json({ ok: true })
}
