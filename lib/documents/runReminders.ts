import { dueReminder } from '@/lib/documents/reminders'
import { DOCUMENT_TYPE_LABELS, type VehicleDocument } from '@/lib/types'

export interface ReminderDeps {
  allDocuments: () => Promise<VehicleDocument[]>
  vehicleInfo: (vehicleId: string) => Promise<{ patente: string; emails: string[] } | null>
  sendReminderEmail: (
    to: string,
    params: { patente: string; label: string; fechaVencimiento: string; milestone: string; vehicleId: string },
  ) => Promise<void>
  markReminderSent: (documentId: string, companyId: string, remindersSent: string[]) => Promise<void>
}

export async function processReminders(deps: ReminderDeps, now: Date): Promise<{ sent: number }> {
  const docs = await deps.allDocuments()
  let sent = 0
  for (const d of docs) {
    const milestone = dueReminder(d.fechaVencimiento, d.remindersSent, now)
    if (!milestone) continue
    const info = await deps.vehicleInfo(d.vehicleId)
    if (!info || info.emails.length === 0) continue
    const label = d.tipo === 'otro' ? d.nombrePersonalizado ?? 'Documento' : DOCUMENT_TYPE_LABELS[d.tipo]
    for (const email of info.emails) {
      await deps.sendReminderEmail(email, {
        patente: info.patente,
        label,
        fechaVencimiento: d.fechaVencimiento!,
        milestone,
        vehicleId: d.vehicleId,
      })
    }
    await deps.markReminderSent(d.id, d.companyId, [...d.remindersSent, milestone])
    sent++
  }
  return { sent }
}
