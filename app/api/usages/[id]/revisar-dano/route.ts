import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { getProfile } from '@/lib/data/profile'
import { marcarDanoRevisado } from '@/lib/data/usages'
import { deleteDanoAlertaByUsage } from '@/lib/data/alertas'

export const dynamic = 'force-dynamic'

// Cualquier miembro de la empresa (Visor/Editor/Administrador) puede marcar un
// daño como revisado. Estampa quién lo revisó y borra la alerta (pill del dashboard).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const profile = await getProfile(m.uid, m.email)
  const nombre = profile.displayName || m.email

  try {
    await marcarDanoRevisado(m.companyId, id, { uid: m.uid, nombre })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'ya_revisado') return NextResponse.json({ error: 'Ya estaba revisado.' }, { status: 409 })
    if (msg === 'forbidden' || msg === 'no_dano') return NextResponse.json({ error: 'No encontrado.' }, { status: 404 })
    console.error('[revisar-dano]', e)
    return NextResponse.json({ error: 'No se pudo registrar la revisión.' }, { status: 500 })
  }

  try { await deleteDanoAlertaByUsage(m.companyId, id) } catch { /* best-effort */ }
  return NextResponse.json({ ok: true })
}
