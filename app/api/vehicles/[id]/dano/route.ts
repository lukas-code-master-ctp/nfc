import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { setDanoActivo, clearDanoActivo } from '@/lib/data/vehicles'
import { buildDanoActivo } from '@/lib/usages/danoActivo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const notaRaw = typeof body?.nota === 'string' ? body.nota.trim() : ''
  const fotoRaw = typeof body?.fotoPath === 'string' ? body.fotoPath : ''
  if (!notaRaw && !fotoRaw) {
    return NextResponse.json({ error: 'Agrega un comentario o una foto del daño.' }, { status: 400 })
  }
  const dano = buildDanoActivo(
    { nota: notaRaw || null, fotoPath: fotoRaw || null },
    'admin', null, new Date().toISOString(),
  )
  try {
    await setDanoActivo(id, m.companyId, dano)
  } catch (e) {
    if (e instanceof Error && e.message === 'forbidden') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    console.error('[dano POST]', e)
    return NextResponse.json({ error: 'No se pudo actualizar el daño.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    await clearDanoActivo(id, m.companyId)
  } catch (e) {
    if (e instanceof Error && e.message === 'forbidden') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    console.error('[dano DELETE]', e)
    return NextResponse.json({ error: 'No se pudo actualizar el daño.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
