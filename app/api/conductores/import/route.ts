import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { createDriver, listDrivers } from '@/lib/data/drivers'
import { isValidPinFormat } from '@/lib/drivers/pin'

export const dynamic = 'force-dynamic'

const MAX_FILAS = 100

// Importación masiva: re-valida en el servidor (nunca confía en la vista previa
// del cliente): nombre requerido, PIN de 4 dígitos, sin duplicados contra el
// padrón ni dentro del lote (case-insensitive).
export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const filas = Array.isArray(body?.filas) ? body.filas : null
  if (!filas || filas.length === 0 || filas.length > MAX_FILAS) {
    return NextResponse.json({ error: `Debes enviar entre 1 y ${MAX_FILAS} filas.` }, { status: 400 })
  }

  const existentes = await listDrivers(m.companyId)
  const vistos = new Set(existentes.map((d) => d.nombre.trim().toLowerCase()))

  let creados = 0
  let omitidos = 0
  for (const f of filas) {
    const nombre = String(f?.nombre ?? '').trim()
    const rut = f?.rut ? String(f.rut).trim() : undefined
    const pin = String(f?.pin ?? '')
    const clave = nombre.toLowerCase()
    if (!nombre || !isValidPinFormat(pin) || vistos.has(clave)) {
      omitidos++
      continue
    }
    vistos.add(clave)
    await createDriver(m.companyId, m.uid, { nombre, rut, pin })
    creados++
  }
  return NextResponse.json({ creados, omitidos })
}
