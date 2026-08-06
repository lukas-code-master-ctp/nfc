import { resumirDocumentos } from '@/lib/documents/resumen'
import type { ResumenDocs, Vehicle, VehicleDocument } from '@/lib/types'

export type UltimaMantencion = { km: number | null; fecha: string } | null

/**
 * La última mantención del vehículo: la guardada si existe, o consultada.
 *
 * La distinción que hace todo el trabajo: **campo ausente** = nunca se calculó
 * (hay que consultar), `{ ultima: null }` = se calculó y no tiene mantenciones
 * (no hay nada que consultar). Vive acá y no repetida en cada llamador porque
 * es exactamente el ternario que alguien "simplifica" a `?.ultima ?? null`,
 * y con eso un vehículo sin resumen pasaría a reportar "sin mantenciones"
 * para siempre — es decir, dejaría de avisar que le toca mantención.
 */
export async function resolverUltimaMantencion(
  v: Pick<Vehicle, 'id' | 'resumenMantencion'>,
  cargar: (vehicleId: string) => Promise<UltimaMantencion>,
): Promise<UltimaMantencion> {
  return v.resumenMantencion ? v.resumenMantencion.ultima : cargar(v.id)
}

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
    resolverUltimaMantencion(v, cargas.cargarUltimaMantencion),
  ])
  return { docs, ultimaMantencion }
}
