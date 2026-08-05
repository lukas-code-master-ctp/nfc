import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { isAdminEmail } from '@/lib/auth/admin'
import { listAllCompanies } from '@/lib/data/admin'
import { construirCsv, nombreArchivo, type FilaExport } from '@/lib/admin/exportar'
import { hoyEnChile } from '@/lib/documents/status'

// `getMembership()` y no `getCurrentUser()`, aunque esto solo lea: el archivo
// se lleva el RUT, el teléfono, el correo y la facturación de TODOS los
// clientes de la plataforma en un solo request. `getCurrentUser()` por diseño
// no comprueba revocación, así que con él un admin que pierde el teléfono y
// cierra sesión en todos los dispositivos dejaría ese teléfono pudiendo
// descargar el padrón completo mientras la cookie siga viva.
export async function GET() {
  const me = await getMembership()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const hoy = hoyEnChile(new Date())
  const empresas = await listAllCompanies()
  const csv = construirCsv(empresas satisfies FilaExport[], hoy)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreArchivo(hoy)}"`,
      // El panel es una foto del momento: una descarga cacheada mostraría
      // cupos y cobros viejos sin que nada lo delate.
      'Cache-Control': 'no-store',
    },
  })
}
