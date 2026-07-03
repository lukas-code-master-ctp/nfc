import { NextRequest, NextResponse } from 'next/server'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { verifyDriverPin } from '@/lib/data/drivers'
import { createUsagePhotoUrl } from '@/lib/storage/signedUrls'

export const dynamic = 'force-dynamic'

const TIPOS = ['tablero', 'cabina', 'dano']

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const vehicle = await getVehicleByToken(token)
  if (!vehicle) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const driverId = String(body?.driverId ?? '')
  const pin = String(body?.pin ?? '')
  const tipo = String(body?.tipo ?? '')
  const contentType = String(body?.contentType ?? 'image/jpeg')
  if (!TIPOS.includes(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })

  const estado = await verifyDriverPin(vehicle.companyId, driverId, pin)
  if (estado === 'locked') return NextResponse.json({ error: 'Demasiados intentos.' }, { status: 429 })
  if (estado !== 'ok') return NextResponse.json({ error: 'PIN incorrecto.' }, { status: 401 })

  const { uploadUrl, filePath } = await createUsagePhotoUrl(vehicle.id, tipo, contentType)
  return NextResponse.json({ uploadUrl, filePath })
}
