import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { getVehicle } from '@/lib/data/vehicles'
import { createDocument } from '@/lib/data/documents'
import { tipoTieneVencimiento } from '@/lib/types'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const { vehicleId, tipo, nombrePersonalizado, fechaVencimiento, fileUrl, filePath } = body
  const v = await getVehicle(vehicleId)
  if (!v || v.ownerUid !== user.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const doc = await createDocument(user.uid, {
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
