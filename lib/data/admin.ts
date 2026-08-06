import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { DEFAULT_PLAN, type Periodicidad, type PromoAplicada, type TipoCuenta } from '@/lib/types'
import { maxVehiculosDe } from '@/lib/plan'
import { hoyEnChile } from '@/lib/documents/status'

/** Lo que la tabla del panel muestra y edita. */
export interface AdminCompanyResumen {
  companyId: string
  razonSocial: string
  ownerEmail: string
  vehicleCount: number
  maxVehiculos: number
}

/**
 * La ficha completa de una empresa. Solo la consume el export a Excel: la
 * tabla recibe el subconjunto de arriba, para no mandarle al navegador el RUT,
 * el teléfono y la última conexión de todos los clientes en una página que no
 * muestra ninguno de los tres.
 */
export interface AdminCompanyRow extends AdminCompanyResumen {
  rut: string
  telefono: string
  tipoCuenta: TipoCuenta | null
  periodicidad: Periodicidad | null
  gratisHasta: string | null
  promo: PromoAplicada | null
  createdAt: string | null
  /** `YYYY-MM-DD` en hora de Chile, o `null` si nadie entró nunca. */
  ultimaConexion: string | null
}

/** Tope de identificadores por llamada que acepta `getUsers`. */
const LOTE_AUTH = 100

/**
 * El instante más reciente en que un usuario tuvo la app abierta.
 *
 * **`lastRefreshTime` y no `lastSignInTime`**: por el diseño de sesión de
 * TapCar la sesión del cliente no expira nunca — `SesionViva` re-emite la
 * cookie con el refresh token — así que `lastSignInTime` solo cambia cuando
 * alguien vuelve a autenticarse de verdad, algo que un cliente activo puede
 * no hacer en meses. `lastRefreshTime` se actualiza cada vez que abren la app.
 * Queda `lastSignInTime` de respaldo para las cuentas que entraron una sola
 * vez y nunca refrescaron.
 */
function instanteDeActividad(meta: { lastRefreshTime?: string | null; lastSignInTime?: string }): number | null {
  const raw = meta.lastRefreshTime || meta.lastSignInTime
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Lista todas las empresas de la plataforma para el panel admin: cruza las
 * empresas con la cantidad de vehículos (agrupados por `companyId`), el correo
 * del dueño y la última conexión de **cualquiera** de sus miembros.
 *
 * La conexión se toma del miembro más reciente y no solo del dueño porque un
 * dueño que delega en su editor tendría una cuenta perfectamente viva
 * apareciendo como abandonada — y ese error se paga doble: llamas a quien no
 * corresponde y no llamas a quien sí se está yendo.
 *
 * MVP: sin paginación — suficiente por ahora.
 */
export async function listAllCompanies(): Promise<AdminCompanyRow[]> {
  const [companiesSnap, vehSnap, usersSnap] = await Promise.all([
    adminDb.collection('companies').get(),
    adminDb.collection('vehicles').get(),
    adminDb.collection('users').get(),
  ])

  const counts = new Map<string, number>()
  for (const d of vehSnap.docs) {
    const companyId = d.data().companyId as string | undefined
    if (companyId) counts.set(companyId, (counts.get(companyId) ?? 0) + 1)
  }

  // uid → empresa a la que pertenece. Incluye al dueño explícitamente: su
  // perfil siempre existe (lo crea `ensureProvisioned`), pero si alguna vez
  // faltara, sin esto la empresa se quedaría además sin correo.
  const empresaDeUid = new Map<string, string>()
  for (const d of usersSnap.docs) {
    const companyId = d.data().companyId as string | undefined
    if (companyId) empresaDeUid.set(d.id, companyId)
  }
  for (const d of companiesSnap.docs) {
    const ownerUid = d.data().ownerUid as string | undefined
    if (ownerUid && !empresaDeUid.has(ownerUid)) empresaDeUid.set(ownerUid, d.id)
  }

  // Una llamada por cada 100 uids en vez de una por empresa: además de traer
  // la actividad, resuelve de paso el correo de los dueños.
  const uids = [...empresaDeUid.keys()]
  const emails = new Map<string, string>()
  const actividad = new Map<string, number>()
  for (let i = 0; i < uids.length; i += LOTE_AUTH) {
    const lote = uids.slice(i, i + LOTE_AUTH).map((uid) => ({ uid }))
    let usuarios
    try {
      usuarios = (await adminAuth.getUsers(lote)).users
    } catch {
      // Un lote que falla deja esas cuentas sin correo ni actividad, pero el
      // panel se sigue renderizando: es información de apoyo, no la lista.
      continue
    }
    for (const u of usuarios) {
      if (u.email) emails.set(u.uid, u.email)
      const ms = instanteDeActividad(u.metadata)
      const companyId = empresaDeUid.get(u.uid)
      if (ms == null || !companyId) continue
      const previo = actividad.get(companyId)
      if (previo == null || ms > previo) actividad.set(companyId, ms)
    }
  }

  const rows = companiesSnap.docs.map((d) => {
    const data = d.data()
    const plan = { ...DEFAULT_PLAN, ...(data.plan ?? {}) }
    const ultimoMs = actividad.get(d.id)
    return {
      companyId: d.id,
      razonSocial: data.company?.razonSocial ?? '',
      ownerEmail: emails.get(data.ownerUid) ?? '',
      vehicleCount: counts.get(d.id) ?? 0,
      maxVehiculos: maxVehiculosDe(plan),
      rut: data.company?.rut ?? '',
      telefono: data.company?.telefono ?? '',
      tipoCuenta: (data.onboarding?.tipoCuenta as TipoCuenta | undefined) ?? null,
      periodicidad: plan.periodicidad ?? null,
      gratisHasta: plan.gratisHasta ?? null,
      promo: plan.promo ?? null,
      createdAt: data.createdAt ?? null,
      ultimaConexion: ultimoMs == null ? null : hoyEnChile(new Date(ultimoMs)),
    }
  })

  return rows.sort((a, b) => (a.razonSocial || a.ownerEmail).localeCompare(b.razonSocial || b.ownerEmail))
}
