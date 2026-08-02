import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { isAdminEmail } from '@/lib/auth/admin'
import { setPromoCodeActivo } from '@/lib/data/promoCodes'

export const dynamic = 'force-dynamic'

// Next 16: `params` es una Promise.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMembership()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const { activo } = body as Record<string, unknown>
  if (typeof activo !== 'boolean') return NextResponse.json({ error: 'activo requerido' }, { status: 400 })

  await setPromoCodeActivo(id, activo)
  return NextResponse.json({ ok: true })
}
