import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { listVehicles, deleteVehicle } from '@/lib/data/vehicles'
import { deleteUsagesByCompany } from '@/lib/data/usages'
import { deleteMantencionesByCompany } from '@/lib/data/mantenciones'

// Colecciones de nivel superior scopeadas por companyId (además de vehicles/documents/usages/mantenciones,
// que se borran aparte para cascadear también sus archivos/fotos en Storage).
const COLECCIONES_POR_EMPRESA = ['drivers', 'alertas', 'invitations', 'billingRequests']

async function deleteByCompany(col: string, companyId: string): Promise<void> {
  const snap = await adminDb.collection(col).where('companyId', '==', companyId).get()
  for (const d of snap.docs) await d.ref.delete()
}

/**
 * Borra una empresa COMPLETA: vehículos (cascada: documentos + archivos + mantenciones),
 * conductores, usos, alertas, invitaciones, solicitudes de facturación,
 * perfiles de los miembros + sus usuarios de Firebase Auth (best-effort por
 * usuario), y el doc de la empresa. Irreversible. Solo llamar server-side
 * tras validar admin de plataforma o dueño de la empresa.
 */
export async function deleteCompanyCascade(companyId: string): Promise<void> {
  const vehicles = await listVehicles(companyId)
  for (const v of vehicles) await deleteVehicle(v.id, companyId)

  // Backstop: usos huérfanos (de vehículos ya borrados) + sus fotos en Storage.
  await deleteUsagesByCompany(companyId)
  await deleteMantencionesByCompany(companyId)

  for (const col of COLECCIONES_POR_EMPRESA) await deleteByCompany(col, companyId)

  const users = await adminDb.collection('users').where('companyId', '==', companyId).get()
  for (const u of users.docs) {
    await u.ref.delete()
    try {
      await adminAuth.deleteUser(u.id)
    } catch {
      /* best-effort: el usuario de Auth puede no existir o fallar; el perfil ya se borró */
    }
  }

  await adminDb.collection('companies').doc(companyId).delete()
}
