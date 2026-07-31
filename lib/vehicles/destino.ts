import type { DocStatus } from '@/lib/documents/status'
import type { EstadoMantencion } from '@/lib/mantencion/status'

/**
 * A dónde lleva el clic en la tarjeta de un vehículo del dashboard.
 *
 * La tarjeta puede mostrar varias señales a la vez (documentos vencidos +
 * mantención próxima + un daño sin revisar) y el clic tiene un solo destino,
 * así que hay que ordenarlas. El criterio es **por gravedad primero**: lo que
 * ya pasó gana a lo que va a pasar. Antes se miraba solo la mantención, así que
 * una mantención *próxima* (ámbar, todavía no ocurre) le ganaba a documentos
 * *vencidos* (rojo, ya ocurrió): la jerarquía de color decía una cosa y el clic
 * hacía otra.
 *
 * A igual gravedad gana **Documentos**: es lo que revisa un carabinero en una
 * fiscalización, que es para lo que existe la app.
 */
export type SenalesDestino = {
  vehicleId: string
  /** Uso con un daño reportado sin revisar, si lo hay. */
  danoUsageId?: string | null
  documentos: DocStatus
  mantencion: EstadoMantencion
}

/** Sin vencimiento no es una alerta: el Padrón no vence y siempre está al día. */
const GRAVEDAD_DOC: Record<DocStatus, number> = {
  vencido: 2,
  por_vencer: 1,
  al_dia: 0,
  sin_vencimiento: 0,
}

const GRAVEDAD_MANT: Record<EstadoMantencion, number> = {
  vencida: 2,
  proxima: 1,
  al_dia: 0,
  sin_registro: 0,
  sin_pauta: 0,
}

export function destinoVehiculo({ vehicleId, danoUsageId, documentos, mantencion }: SenalesDestino): string {
  const ficha = `/vehiculos/${vehicleId}`
  // El daño va primero pase lo que pase: es lo único que pide una acción
  // explícita de alguien (marcarlo revisado) y no se apaga solo con el tiempo.
  if (danoUsageId) return `${ficha}#uso-${danoUsageId}`
  if (GRAVEDAD_MANT[mantencion] > GRAVEDAD_DOC[documentos]) return `${ficha}#mantencion`
  return `${ficha}#documentos`
}
