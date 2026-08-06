import { daysUntil, hoyEnChile } from '@/lib/documents/status'
import { REMINDER_MILESTONES } from '@/lib/types'

const MS_DIA = 24 * 60 * 60 * 1000

/**
 * Hasta cuántos días hacia adelante mira el cron. El hito más lejano es 30
 * días (`REMINDER_MILESTONES`); el día extra es holgura para que un desfase
 * de zona horaria no deje un documento fuera justo el día que le tocaba.
 */
export const VENTANA_ADELANTE_DIAS = 31

/**
 * Cuántos días hacia atrás sigue mirando.
 *
 * Un documento **ya vencido** sigue siendo elegible para el hito `0` mientras
 * no se le haya enviado (ver `dueReminder`), así que la ventana no puede
 * cortar en hoy: un documento cargado ya vencido, o uno que quedó sin avisar
 * porque el cron falló, no volvería a mirarse **nunca**. Un año es el punto
 * donde el aviso deja de tener sentido: nadie necesita enterarse hoy de un
 * permiso que venció hace trece meses.
 */
export const VENTANA_ATRAS_DIAS = 365

/**
 * El rango de `fechaVencimiento` que el cron necesita leer, como fechas
 * `YYYY-MM-DD` de Chile.
 *
 * Existe porque el cron leía la colección **entera** de documentos todos los
 * días. Como la mayoría vence dentro de un año y la ventana útil es de un mes,
 * eso hacía que ~11 de cada 12 documentos se leyeran a diario para descartarlos
 * en memoria — un costo que crece con toda la plataforma y que se paga aunque
 * nadie abra la app.
 *
 * Los dos bordes van sobre el **mismo campo**, así que a Firestore le basta su
 * índice de campo único automático: esto no necesita índice compuesto.
 */
export function ventanaRecordatorios(now: Date): { desde: string; hasta: string } {
  return {
    desde: hoyEnChile(new Date(now.getTime() - VENTANA_ATRAS_DIAS * MS_DIA)),
    hasta: hoyEnChile(new Date(now.getTime() + VENTANA_ADELANTE_DIAS * MS_DIA)),
  }
}

// Devuelve el hito más urgente ya alcanzado y aún no enviado, o null.
// Un hito M está "alcanzado" cuando díasRestantes <= M.
export function dueReminder(
  fechaVencimiento: string | null,
  remindersSent: string[],
  now: Date,
): string | null {
  const d = daysUntil(fechaVencimiento, now)
  if (d === null) return null
  // De menor a mayor urgencia: 0 (vencido/hoy) es lo más urgente.
  const sorted = [...REMINDER_MILESTONES].sort((a, b) => a - b) // [0, 7, 30]
  for (const m of sorted) {
    if (d <= m && !remindersSent.includes(String(m))) {
      return String(m)
    }
  }
  return null
}
