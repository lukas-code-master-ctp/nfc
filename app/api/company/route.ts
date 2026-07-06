import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { saveCompany } from '@/lib/data/companies'
import { parseAvisoUsoHoras } from '@/lib/usages/prolongado'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  if (!body.company || typeof body.company !== 'object') {
    return NextResponse.json({ error: 'company inválido' }, { status: 400 })
  }

  const aviso = parseAvisoUsoHoras(body.avisoUsoHoras)
  if (aviso === 'invalid') {
    return NextResponse.json({ error: 'avisoUsoHoras inválido' }, { status: 400 })
  }

  await saveCompany(m.companyId, {
    company: sanitizeCompany(body.company),
    ...(aviso !== 'absent' ? { avisoUsoHoras: aviso } : {}),
  })
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
