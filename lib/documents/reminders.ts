import { daysUntil } from '@/lib/documents/status'
import { REMINDER_MILESTONES } from '@/lib/types'

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
