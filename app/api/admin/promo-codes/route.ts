import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { isAdminEmail } from '@/lib/auth/admin'
import { createPromoCode } from '@/lib/data/promoCodes'
import { normalizarCodigo } from '@/lib/promo/canje'
import { MAX_MESES_PROMO, MAX_VEHICULOS_PROMO } from '@/lib/types'

export const dynamic = 'force-dynamic'

// `getMembership()` y no `getCurrentUser()`: este endpoint MUTA, y
// `getCurrentUser()` por diseño no comprueba revocación de sesión.
export async function POST(req: NextRequest) {
  const me = await getMembership()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Admin de PLATAFORMA, no el rol 'admin' de empresa: crear códigos es del equipo.
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  const codigo = normalizarCodigo(typeof b.codigo === 'string' ? b.codigo : '')
  if (!codigo) return NextResponse.json({ error: 'codigo inválido' }, { status: 400 })

  const meses = Number(b.mesesGratis)
  const vehiculos = Number(b.vehiculosIncluidos)
  // Los dos campos son obligatorios (mínimo 1), no un OR/AND entre ellos: bajo
  // el modelo de tres fases (prueba → promo → plena), lo único que hace la
  // fase `promo` es descontar `vehiculosIncluidos` durante la ventana que
  // marca `mesesGratis`. Con `vehiculosIncluidos: 0` la ventana existe pero no
  // cubre nada (se cobra igual que sin canjear); con `mesesGratis: 0` la
  // ventana dura cero días (`aplicarCanje` calcula `hasta = desde + 0 meses`)
  // y la cobertura nunca llega a aplicarse. En ambos casos el código "otorga"
  // algo en la UI pero no cambia lo que se cobra: ver C1 de la revisión final.
  if (!Number.isFinite(meses) || meses < 1 || meses > MAX_MESES_PROMO) {
    return NextResponse.json(
      {
        error:
          `mesesGratis inválido: debe ser un número entre 1 y ${MAX_MESES_PROMO}. En 0 la ventana ` +
          'de promoción dura cero días y la cobertura de vehículos nunca se aplica.',
      },
      { status: 400 },
    )
  }
  if (!Number.isFinite(vehiculos) || vehiculos < 1 || vehiculos > MAX_VEHICULOS_PROMO) {
    return NextResponse.json(
      {
        error:
          `vehiculosIncluidos inválido: debe ser un número entre 1 y ${MAX_VEHICULOS_PROMO}. En 0 la ` +
          'promoción no cubre nada y la empresa paga exactamente igual que sin canjear.',
      },
      { status: 400 },
    )
  }

  const maxCanjes = b.maxCanjes == null || b.maxCanjes === '' ? null : Math.floor(Number(b.maxCanjes))
  if (maxCanjes != null && (!Number.isFinite(maxCanjes) || maxCanjes < 1)) {
    return NextResponse.json({ error: 'maxCanjes inválido' }, { status: 400 })
  }
  const expiraEn =
    typeof b.expiraEn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.expiraEn) ? b.expiraEn : null

  try {
    await createPromoCode(
      {
        codigo,
        descripcion: typeof b.descripcion === 'string' ? b.descripcion.slice(0, 200) : '',
        mesesGratis: Math.floor(meses),
        vehiculosIncluidos: Math.floor(vehiculos),
        expiraEn,
        maxCanjes,
      },
      me.uid,
    )
  } catch (err) {
    // `createPromoCode` usa `.create()`, que lanza con código gRPC 6
    // (ALREADY_EXISTS) si el código ya existe como documento. Solo ESE caso
    // se traduce a 409: cualquier otro error es un fallo real de Firestore
    // (500 + log), no lo enmascaramos como si el código ya existiera — ya
    // pasó antes en este proyecto un catch genérico ocultando un fallo real.
    if (esErrorYaExiste(err)) {
      return NextResponse.json({ error: 'codigo_existe' }, { status: 409 })
    }
    console.error('[promo-codes:crear]', err)
    return NextResponse.json({ error: 'No se pudo crear el código.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, codigo })
}

// Código gRPC 6 = ALREADY_EXISTS. `firebase-admin`/`@google-cloud/firestore`
// exponen el código del error como `.code` en el objeto lanzado.
function esErrorYaExiste(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 6
}
