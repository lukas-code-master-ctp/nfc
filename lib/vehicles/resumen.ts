import { resumirDocumentos } from '@/lib/documents/resumen'
import type { ResumenDocs, Vehicle, VehicleDocument } from '@/lib/types'

type UltimaMantencion = { km: number | null; fecha: string } | null

export type CargasResumen = {
  cargarDocumentos: (vehicleId: string) => Promise<Pick<VehicleDocument, 'fechaVencimiento'>[]>
  cargarUltimaMantencion: (vehicleId: string) => Promise<UltimaMantencion>
}

export type ResumenResuelto = {
  docs: ResumenDocs
  ultimaMantencion: UltimaMantencion
}

/**
 * Devuelve el resumen del vehículo, usando lo guardado o consultando en vivo.
 *
 * Es la red de seguridad de la migración: un vehículo sin resumen (creado antes
 * del feature, saltado por el backfill, o con un refresco que falló) sigue dando
 * datos correctos, solo que pagando las consultas. Una flota a medio migrar nunca
 * muestra un dato malo; en el peor caso queda tan lenta como antes.
 *
 * Las cargas van inyectadas para poder probar esto sin Firebase.
 */
export async function resolverResumen(
  v: Pick<Vehicle, 'id' | 'resumenDocs' | 'resumenMantencion'>,
  cargas: CargasResumen,
): Promise<ResumenResuelto> {
  const [docs, ultimaMantencion] = await Promise.all([
    v.resumenDocs ?? cargas.cargarDocumentos(v.id).then(resumirDocumentos),
    // Ojo: `resumenMantencion` ausente = sin calcular; `{ ultima: null }` = no hay.
    v.resumenMantencion ? v.resumenMantencion.ultima : cargas.cargarUltimaMantencion(v.id),
  ])
  return { docs, ultimaMantencion }
}
