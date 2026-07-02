import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { createDocument } from '@/lib/data/documents'
import { tipoTieneVencimiento } from '@/lib/types'

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json()
  const { vehicleId, tipo, nombrePersonalizado, fechaVencimiento, fileUrl, filePath } = body
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const doc = await createDocument(m.companyId, m.uid, {
    vehicleId,
    tipo,
    nombrePersonalizado: nombrePersonalizado ?? null,
    // Tipos sin vencimiento (Padrón) nunca llevan fecha.
    fechaVencimiento: tipoTieneVencimiento(tipo) ? fechaVencimiento || null : null,
    fileUrl: fileUrl ?? '',
    filePath: filePath ?? '',
  })
  return NextResponse.json(doc, { status: 201 })
}
