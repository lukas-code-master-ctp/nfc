import type { ResumenDocs, VehicleDocument } from '@/lib/types'

/**
 * Resume los documentos de un vehículo en lo mínimo que necesita el dashboard.
 *
 * La fecha más próxima basta para reproducir el badge: `worstStatus` ordena
 * vencido > por vencer > al día > sin vencimiento, y `documentStatus` es monótono
 * en los días restantes, así que el documento que vence primero siempre manda.
 */
export function resumirDocumentos(docs: Pick<VehicleDocument, 'fechaVencimiento'>[]): ResumenDocs {
  let proximoVencimiento: string | null = null
  for (const d of docs) {
    // Las fechas son ISO 'YYYY-MM-DD': comparar como texto ordena igual que por calendario.
    if (d.fechaVencimiento && (proximoVencimiento === null || d.fechaVencimiento < proximoVencimiento)) {
      proximoVencimiento = d.fechaVencimiento
    }
  }
  return { total: docs.length, proximoVencimiento }
}
