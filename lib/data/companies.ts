import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { DEFAULT_PLAN, EMPTY_COMPANY, type Categoria, type Company, type CompanyData, type PlanData, type PautaMantencion, type TipoCuenta } from '@/lib/types'
import { findPendingInvitationByEmail, markInvitationAccepted } from '@/lib/data/invitations'

const COL = 'companies'

export async function getCompany(companyId: string): Promise<Company | null> {
  const doc = await adminDb.collection(COL).doc(companyId).get()
  if (!doc.exists) return null
  const d = doc.data()!
  return {
    id: doc.id,
    ownerUid: d.ownerUid,
    company: { ...EMPTY_COMPANY, ...(d.company ?? {}) },
    plan: { ...DEFAULT_PLAN, ...(d.plan ?? {}) },
    avisoUsoHoras: d.avisoUsoHoras,
    categorias: d.categorias ?? [],
    pautaMantencion: d.pautaMantencion ?? undefined,
    onboarding: d.onboarding ?? undefined,
    createdAt: d.createdAt ?? null,
  }
}

export async function createCompany(
  ownerUid: string,
  data: { company: CompanyData; plan: PlanData },
): Promise<string> {
  const ref = await adminDb.collection(COL).add({
    ownerUid,
    company: data.company,
    // `periodicidad: null` explícito (y no ausente) es el marcador de "cuenta
    // nueva que todavía no eligió". Lo lee `debeElegirPlan` para mandarla a
    // /plan. Las cuentas anteriores al selector tienen el campo ausente y por
    // eso nunca se topan con esa pantalla.
    plan: { maxVehiculos: Math.max(1, Math.floor(data.plan.maxVehiculos)), periodicidad: null },
    createdAt: new Date().toISOString(),
  })
  return ref.id
}

// Solo un Administrador de la empresa llama esto (validado en la capa /api).
//
// OJO: la rama de `plan` reconstruye el mapa desde cero y descarta cualquier
// otro campo. Es deliberado y estrecho — su único llamador de `plan` es el
// panel admin, que solo cambia el cupo. Para escribir periodicidad o la fecha
// de la prueba usa `savePlan`, no esto.
export async function saveCompany(
  companyId: string,
  patch: { company?: CompanyData; plan?: PlanData; avisoUsoHoras?: number; categorias?: Categoria[]; pautaMantencion?: PautaMantencion },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.company !== undefined) data.company = patch.company
  if (patch.plan !== undefined) data.plan = { maxVehiculos: Math.max(1, Math.floor(patch.plan.maxVehiculos)) }
  if (patch.avisoUsoHoras !== undefined) data.avisoUsoHoras = Math.max(1, Math.floor(patch.avisoUsoHoras))
  if (patch.categorias !== undefined) data.categorias = patch.categorias
  if (patch.pautaMantencion !== undefined) data.pautaMantencion = patch.pautaMantencion
  await adminDb.collection(COL).doc(companyId).set(data, { merge: true })
}

/**
 * Escribe campos sueltos del plan sin pisar los demás.
 *
 * Firestore hace merge recursivo de mapas anidados con `{ merge: true }`, así
 * que escribir `{ plan: { periodicidad: 'anual' } }` conserva `maxVehiculos`
 * y `gratisHasta`. Por lo mismo, el PATCH del panel admin sigue siendo seguro:
 * cambiar el cupo no borra la periodicidad ni la fecha.
 */
export async function savePlan(companyId: string, patch: Partial<PlanData>): Promise<void> {
  const plan: Record<string, unknown> = {}
  if (patch.maxVehiculos !== undefined) plan.maxVehiculos = Math.max(1, Math.floor(patch.maxVehiculos))
  // `!== undefined` y no truthy: `periodicidad: null` y `gratisHasta: null`
  // son valores legítimos que hay que poder escribir.
  if (patch.periodicidad !== undefined) plan.periodicidad = patch.periodicidad
  if (patch.gratisHasta !== undefined) plan.gratisHasta = patch.gratisHasta
  if (patch.promo !== undefined) plan.promo = patch.promo
  if (Object.keys(plan).length === 0) return
  await adminDb.collection(COL).doc(companyId).set({ plan }, { merge: true })
}

/** Qué hizo `ensureProvisioned`. Lo consume `POST /api/session` para decidir
 *  si corresponde el correo de bienvenida. */
export type ResultadoProvision = 'ya_estaba' | 'invitado' | 'creada'

/**
 * Provisiona al usuario en su primer login: crea su empresa (o reutiliza una
 * ya existente a su nombre) y su doc en `users/{uid}` con companyId + role.
 * Idempotente: si el usuario ya tiene companyId, no hace nada (usuario
 * migrado o ya provisionado en un login anterior).
 *
 * Devuelve cuál de los tres caminos tomó en vez de `void`: el correo de
 * bienvenida se manda desde la ruta y no desde acá, para que la capa de datos
 * no sepa de correos y para que ambos lados se puedan probar por separado.
 */
export async function ensureProvisioned(uid: string, email: string): Promise<ResultadoProvision> {
  const userRef = adminDb.collection('users').doc(uid)
  const userDoc = await userRef.get()
  if (userDoc.exists && userDoc.data()?.companyId) return 'ya_estaba'

  // ¿Fue invitado? Unirlo a esa empresa con su rol en vez de crear una propia.
  const invite = email ? await findPendingInvitationByEmail(email) : null
  if (invite) {
    const patch: Record<string, unknown> = { email, companyId: invite.companyId, role: invite.role }
    if (!userDoc.exists) {
      patch.displayName = ''
      patch.createdAt = new Date().toISOString()
    }
    await userRef.set(patch, { merge: true })
    await markInvitationAccepted(invite.id, uid)
    // Sin bienvenida: ya recibió el correo de invitación, y los pasos que
    // enumera la bienvenida son de quien administra su propia flota.
    return 'invitado'
  }

  let companyId: string
  const existing = await adminDb.collection(COL).where('ownerUid', '==', uid).limit(1).get()
  if (!existing.empty) {
    companyId = existing.docs[0].id
  } else {
    companyId = await createCompany(uid, { company: { ...EMPTY_COMPANY }, plan: { ...DEFAULT_PLAN } })
  }

  const patch: Record<string, unknown> = { email, companyId, role: 'admin' }
  if (!userDoc.exists) {
    patch.displayName = ''
    patch.createdAt = new Date().toISOString()
  }
  await userRef.set(patch, { merge: true })
  // Empresa reutilizada (`!existing.empty`) también cuenta como cuenta nueva:
  // el usuario no tenía `users/{uid}` con companyId, así que es su primer login.
  return 'creada'
}

/**
 * Actualiza el onboarding de la empresa. Solo un Administrador llega acá
 * (validado en la capa /api).
 *
 * Escribe con `set(..., { merge: true })` sobre el mapa `onboarding` para no
 * pisar los campos que no vienen en el patch, y usa `arrayUnion` para `vistos`
 * en vez de leer-modificar-escribir.
 */
export async function saveOnboarding(
  companyId: string,
  patch: {
    tipoCuenta?: TipoCuenta
    agregarVisto?: string
    descartadoEn?: string | null
    completadoEn?: string | null
  },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.tipoCuenta !== undefined) {
    data.tipoCuenta = patch.tipoCuenta
    // Elegir (o cambiar) el tipo reabre la evaluación: pasar de personal a
    // empresa suma seis pasos, así que ni completadoEn (marcaría "listo" con
    // pasos nuevos sin hacer) ni descartadoEn (la tarjeta seguiría oculta)
    // pueden quedar en pie.
    data.completadoEn = null
    data.descartadoEn = null
  }
  if (patch.agregarVisto !== undefined) data.vistos = FieldValue.arrayUnion(patch.agregarVisto)
  if (patch.descartadoEn !== undefined) data.descartadoEn = patch.descartadoEn
  if (patch.completadoEn !== undefined) data.completadoEn = patch.completadoEn
  if (Object.keys(data).length === 0) return
  await adminDb.collection(COL).doc(companyId).set({ onboarding: data }, { merge: true })
}

export async function listCompaniasParaMantencion(): Promise<{ id: string; ownerUid: string; pauta: PautaMantencion | null }[]> {
  const snap = await adminDb.collection(COL).get()
  return snap.docs.map((d) => ({ id: d.id, ownerUid: d.data().ownerUid, pauta: d.data().pautaMantencion ?? null }))
}
