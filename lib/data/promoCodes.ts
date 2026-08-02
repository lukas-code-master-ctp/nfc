import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { puedeCanjear, aplicarCanje, type MotivoRechazo } from '@/lib/promo/canje'
import type { PromoAplicada, PromoCode } from '@/lib/types'

const COL = 'promoCodes'
const COL_COMPANIES = 'companies'

// El id del documento ES el código: da unicidad gratis y permite leerlo por id
// dentro de la transacción de canje, sin resolver una query ahí adentro.
function toPromoCode(id: string, d: FirebaseFirestore.DocumentData): PromoCode {
  return {
    codigo: id,
    descripcion: d.descripcion ?? '',
    mesesGratis: d.mesesGratis ?? 0,
    vehiculosIncluidos: d.vehiculosIncluidos ?? 0,
    activo: d.activo ?? false,
    expiraEn: d.expiraEn ?? null,
    maxCanjes: d.maxCanjes ?? null,
    canjes: d.canjes ?? 0,
    createdAt: d.createdAt ?? null,
    createdByUid: d.createdByUid,
  }
}

export async function createPromoCode(
  input: {
    codigo: string
    descripcion: string
    mesesGratis: number
    vehiculosIncluidos: number
    expiraEn: string | null
    maxCanjes: number | null
  },
  createdByUid: string,
): Promise<void> {
  // `.create()` y NO `.set()`: el id del documento ES el código, así que un
  // `.set()` sobre un código que ya existe lo pisa en silencio — reinicia
  // `canjes` a 0 y pierde `createdAt`/`createdByUid` originales, lo que relaja
  // `maxCanjes` para una campaña que ya venía canjeándose. `.create()` lanza
  // (código Firestore `ALREADY_EXISTS`) si el documento ya existe, que es
  // justo lo que queremos: fallar ruidoso en vez de pisar. No "simplificar"
  // esto de vuelta a `.set()`.
  await adminDb.collection(COL).doc(input.codigo).create({
    descripcion: input.descripcion,
    mesesGratis: input.mesesGratis,
    vehiculosIncluidos: input.vehiculosIncluidos,
    activo: true,
    expiraEn: input.expiraEn,
    maxCanjes: input.maxCanjes,
    canjes: 0,
    createdAt: new Date().toISOString(),
    createdByUid,
  })
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const snap = await adminDb.collection(COL).get()
  return snap.docs
    .map((d) => toPromoCode(d.id, d.data()))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

export async function getPromoCode(codigo: string): Promise<PromoCode | null> {
  if (!codigo) return null
  const doc = await adminDb.collection(COL).doc(codigo).get()
  return doc.exists ? toPromoCode(doc.id, doc.data()!) : null
}

export async function setPromoCodeActivo(codigo: string, activo: boolean): Promise<void> {
  await adminDb.collection(COL).doc(codigo).update({ activo })
}

export type ResultadoCanje =
  | { ok: true; promo: PromoAplicada }
  | { ok: false; motivo: MotivoRechazo }

/**
 * Canjea un código para una empresa.
 *
 * Va en transacción y eso NO es opcional: `maxCanjes` es lo que hace que "los
 * primeros 50" signifique algo, y sin transacción dos canjes simultáneos leen
 * el mismo contador y ambos pasan — que es exactamente el escenario de una
 * campaña, donde la gente entra al mismo tiempo.
 */
export async function canjearPromo({
  companyId,
  codigo,
  hoy,
  ahoraIso,
}: {
  companyId: string
  codigo: string
  hoy: string
  ahoraIso: string
}): Promise<ResultadoCanje> {
  if (!codigo) return { ok: false, motivo: 'no_existe' }
  const codeRef = adminDb.collection(COL).doc(codigo)
  const companyRef = adminDb.collection(COL_COMPANIES).doc(companyId)

  return adminDb.runTransaction(async (tx) => {
    // Todas las lecturas antes de cualquier escritura: Firestore lo exige.
    const [codeSnap, companySnap] = await Promise.all([tx.get(codeRef), tx.get(companyRef)])
    const code = codeSnap.exists ? toPromoCode(codeSnap.id, codeSnap.data()!) : null
    const plan = (companySnap.data()?.plan ?? {}) as { promo?: PromoAplicada | null; gratisHasta?: string | null }

    const motivo = puedeCanjear({ code, promoActual: plan.promo ?? null, hoy })
    if (motivo) return { ok: false, motivo }

    const promo = aplicarCanje({ code: code!, gratisHasta: plan.gratisHasta ?? null, hoy, ahoraIso })
    tx.update(codeRef, { canjes: FieldValue.increment(1) })
    // `merge: true` para no pisar maxVehiculos/periodicidad/gratisHasta.
    tx.set(companyRef, { plan: { promo } }, { merge: true })
    return { ok: true, promo }
  })
}
