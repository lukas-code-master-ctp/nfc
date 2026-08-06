import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { createDocument, refreshResumenDocs } from '@/lib/data/documents'
import { tipoTieneVencimiento, esDocumentType, DOCUMENT_TYPES_DESCONTINUADOS } from '@/lib/types'

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json()
  const { vehicleId, tipo, nombrePersonalizado, fechaVencimiento, fileUrl, filePath } = body
  // Hasta acá el `tipo` no se validaba: cualquier string quedaba guardado y
  // después se mostraba VACÍO en la lista, en el correo de recordatorio y en la
  // ficha pública que ve un carabinero, porque `DOCUMENT_TYPE_LABELS[tipo]` da
  // `undefined`. Los descontinuados se rechazan solo al CREAR: los documentos
  // que ya los tienen se siguen pudiendo editar (ver el PATCH).
  if (!esDocumentType(tipo) || DOCUMENT_TYPES_DESCONTINUADOS.has(tipo)) {
    return NextResponse.json({ error: 'Tipo de documento inválido.' }, { status: 400 })
  }
  // `fechaVencimiento` es opcional (el Padrón no vence, `null` es legítimo),
  // pero si viene debe ser un string 'YYYY-MM-DD': `regex.test()` coacciona a
  // texto, así que sin el `typeof` un array como `["2026-09-01"]` pasaría el
  // regex (el array de un solo elemento se coacciona a ese mismo string) y se
  // guardaría tal cual — luego `documentStatus` truena al hacer `.split()`
  // sobre un array.
  if (fechaVencimiento && (typeof fechaVencimiento !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaVencimiento))) {
    return NextResponse.json({ error: 'Formato de fecha inválido (usa AAAA-MM-DD).' }, { status: 400 })
  }
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
  await refreshResumenDocs(doc.vehicleId)
  return NextResponse.json(doc, { status: 201 })
}
