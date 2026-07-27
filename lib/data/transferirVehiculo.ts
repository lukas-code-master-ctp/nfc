import { adminDb, adminBucket } from '@/lib/firebase/admin'
import { getVehicle } from '@/lib/data/vehicles'
import { getOpenUsage, forzarCierreUsage } from '@/lib/data/usages'

/**
 * Mueve un vehículo (con sus documentos y mantenciones) de una empresa a otra.
 *
 * NO viaja: la bitácora de usos —se queda con quien la generó—, el daño activo
 * ni la categoría. NO se tocan `publicToken` ni `kmActual`: el chip está pegado
 * al vehículo y el odómetro es del fierro, no de la empresa.
 *
 * Lanza `Error('ya_transferido')` si el vehículo desapareció o ya cambió de dueño.
 */
export async function transferirVehiculo(
  vehicleId: string,
  deCompanyId: string,
  aCompanyId: string,
): Promise<void> {
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== deCompanyId) throw new Error('ya_transferido')

  // 1. Cerrar el uso abierto: el conductor pertenece a la empresa que entrega.
  const abierto = await getOpenUsage(vehicleId)
  if (abierto) {
    try {
      await forzarCierreUsage(deCompanyId, abierto.id)
    } catch (err) {
      console.error('[transferirVehiculo] cierre forzado', vehicleId, err)
    }
  }

  // 2. Borrar alertas de daño abiertas: apuntan a un vehículo que el emisor ya no tiene.
  const alertas = await adminDb.collection('alertas').where('vehicleId', '==', vehicleId).get()
  await Promise.all(alertas.docs.map((d) => d.ref.delete()))

  // 3. Borrar la foto del daño activo, que no viaja.
  if (v.danoActivo?.fotoPath) {
    try {
      await adminBucket.file(v.danoActivo.fotoPath).delete({ ignoreNotFound: true })
    } catch (err) {
      console.error('[transferirVehiculo] foto de daño', vehicleId, err)
    }
  }

  // 4. Vehículo + documentos + mantenciones, atómico.
  const [docs, mants] = await Promise.all([
    adminDb.collection('documents').where('vehicleId', '==', vehicleId).get(),
    adminDb.collection('mantenciones').where('vehicleId', '==', vehicleId).get(),
  ])
  const batch = adminDb.batch()
  batch.update(adminDb.collection('vehicles').doc(vehicleId), {
    companyId: aCompanyId,
    categoriaId: null,
    danoActivo: null,
  })
  for (const d of docs.docs) batch.update(d.ref, { companyId: aCompanyId })
  for (const mt of mants.docs) batch.update(mt.ref, { companyId: aCompanyId })
  await batch.commit()
}
