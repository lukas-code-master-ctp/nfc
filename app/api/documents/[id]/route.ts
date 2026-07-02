import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { updateDocument, deleteDocument } from '@/lib/data/documents'
import { tipoTieneVencimiento, type DocumentType } from '@/lib/types'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const patch = await req.json()
  // Tipos sin vencimiento (Padrón) nunca llevan fecha.
  if (patch.tipo && !tipoTieneVencimiento(patch.tipo as DocumentType)) patch.fechaVencimiento = null
  // Si cambia la fecha de vencimiento, reiniciar recordatorios.
  if ('fechaVencimiento' in patch) patch.remindersSent = []
  try {
    await updateDocument(id, m.companyId, patch)
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
    await deleteDocument(id, m.companyId)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
