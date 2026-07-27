import { NextResponse } from 'next/server'
import { getTransferenciaByToken } from '@/lib/data/transferencias'
import { transferenciaVigente } from '@/lib/transferencias/estado'

export const dynamic = 'force-dynamic'

/**
 * Público a propósito: lo consume el banner de `/login`, donde el destinatario
 * todavía no tiene cuenta. Expone solo lo justo para que reconozca de qué se
 * trata — nunca identificadores internos.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTransferenciaByToken(token)
  if (!t || !transferenciaVigente(t, new Date().toISOString())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({
    patente: t.patente,
    deCompanyNombre: t.deCompanyNombre,
    paraEmail: t.paraEmail,
    status: t.status,
  })
}
