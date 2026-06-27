import { dueReminder } from '@/lib/documents/reminders'
import { DOCUMENT_TYPE_LABELS, type VehicleDocument } from '@/lib/types'

export interface ReminderDeps {
  allDocuments: () => Promise<VehicleDocument[]>
  vehicleInfo: (vehicleId: string) => Promise<{ patente: string; email: string } | null>
  sendReminderEmail: (
    to: string,
    params: { patente: string; label: string; fechaVencimiento: string; milestone: string },
  ) => Promise<void>
  markReminderSent: (documentId: string, ownerUid: string, remindersSent: string[]) => Promise<void>
}

export async function processReminders(deps: ReminderDeps, now: Date): Promise<{ sent: number }> {
  const docs = await deps.allDocuments()
  let sent = 0
  for (const d of docs) {
    const milestone = dueReminder(d.fechaVencimiento, d.remindersSent, now)
    if (!milestone) continue
    const info = await deps.vehicleInfo(d.vehicleId)
    if (!info?.email) continue
    const label = d.tipo === 'otro' ? d.nombrePersonalizado ?? 'Documento' : DOCUMENT_TYPE_LABELS[d.tipo]
    await deps.sendReminderEmail(info.email, {
      patente: info.patente,
      label,
      fechaVencimiento: d.fechaVencimiento!,
      milestone,
    })
    await deps.markReminderSent(d.id, d.ownerUid, [...d.remindersSent, milestone])
    sent++
  }
  return { sent }
}
