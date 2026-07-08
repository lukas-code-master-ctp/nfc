import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { saveCompany } from '@/lib/data/companies'
import { parseAvisoUsoHoras } from '@/lib/usages/prolongado'
import { sanitizeCategorias } from '@/lib/company/categorias'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const patch: Parameters<typeof saveCompany>[1] = {}
  if (body.company && typeof body.company === 'object') patch.company = sanitizeCompany(body.company)
  const aviso = parseAvisoUsoHoras(body.avisoUsoHoras)
  if (aviso === 'invalid') {
    return NextResponse.json({ error: 'avisoUsoHoras inválido' }, { status: 400 })
  }
  if (aviso !== 'absent') patch.avisoUsoHoras = aviso
  if (body.categorias !== undefined) patch.categorias = sanitizeCategorias(body.categorias)

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 })
  }

  await saveCompany(m.companyId, patch)
  return NextResponse.json({ ok: true })
}

function sanitizeCompany(c: Record<string, unknown>) {
  const s = (v: unknown) => String(v ?? '').trim()
  return {
    razonSocial: s(c.razonSocial),
    rut: s(c.rut),
    giro: s(c.giro),
    direccion: s(c.direccion),
    telefono: s(c.telefono),
  }
}
