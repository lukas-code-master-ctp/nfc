import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { updateDocument, deleteDocument, refreshResumenDocs } from '@/lib/data/documents'
import { tipoTieneVencimiento, type DocumentType } from '@/lib/types'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  // `fechaVencimiento` es opcional (el Padrón no vence; `null` la limpia y es
  // legítimo), pero si viene con valor debe ser un string 'YYYY-MM-DD':
  // `regex.test()` coacciona a texto, así que sin el `typeof` un array como
  // `["2026-09-01"]` pasaría el regex (se coacciona a ese mismo string) y se
  // guardaría tal cual — luego `documentStatus` truena al hacer `.split()`
  // sobre un array.
  if (
    body.fechaVencimiento &&
    (typeof body.fechaVencimiento !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.fechaVencimiento))
  ) {
    return NextResponse.json({ error: 'Formato de fecha inválido (usa AAAA-MM-DD).' }, { status: 400 })
  }
  // Whitelist: solo los campos que envían los formularios (DocumentForm/DocumentEditForm).
  // companyId/vehicleId nunca vienen del cliente: si se aceptaran tal cual, un miembro
  // con permiso de escritura podría plantar el documento en la ficha de otro vehículo.
  const patch: Record<string, unknown> = {}
  if (body.tipo !== undefined) patch.tipo = body.tipo
  if (body.nombrePersonalizado !== undefined) patch.nombrePersonalizado = body.nombrePersonalizado
  if (body.fechaVencimiento !== undefined) patch.fechaVencimiento = body.fechaVencimiento
  if (body.filePath !== undefined) patch.filePath = body.filePath
  if (body.fileUrl !== undefined) patch.fileUrl = body.fileUrl
  // Tipos sin vencimiento (Padrón) nunca llevan fecha.
  if (patch.tipo && !tipoTieneVencimiento(patch.tipo as DocumentType)) patch.fechaVencimiento = null
  // Si cambia la fecha de vencimiento, reiniciar recordatorios.
  if ('fechaVencimiento' in patch) patch.remindersSent = []
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 })
  try {
    const vehicleId = await updateDocument(id, m.companyId, patch)
    await refreshResumenDocs(vehicleId)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    const vehicleId = await deleteDocument(id, m.companyId)
    await refreshResumenDocs(vehicleId)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
