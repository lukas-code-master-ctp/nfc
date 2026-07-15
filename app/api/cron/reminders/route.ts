import { NextRequest, NextResponse } from 'next/server'
import { processReminders } from '@/lib/documents/runReminders'
import { listAllDocuments, updateDocument } from '@/lib/data/documents'
import { vehicleInfoForReminder, listVehicles, updateVehicle } from '@/lib/data/vehicles'
import { sendReminderEmail, sendMantencionEmail } from '@/lib/email/resend'
import { processMantencionReminders } from '@/lib/mantencion/runReminders'
import { listCompaniasParaMantencion } from '@/lib/data/companies'
import { ultimaMantencion } from '@/lib/data/mantenciones'
import { alertRecipientEmails } from '@/lib/data/members'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await processReminders(
    {
      allDocuments: listAllDocuments,
      vehicleInfo: vehicleInfoForReminder,
      sendReminderEmail,
      markReminderSent: (id, companyId, remindersSent) => updateDocument(id, companyId, { remindersSent }),
    },
    new Date(),
  )
  const mant = await processMantencionReminders(
    {
      allCompanies: listCompaniasParaMantencion,
      vehiclesOf: listVehicles,
      ultimaMantencion,
      recipients: alertRecipientEmails,
      sendMantencionEmail,
      markHito: (vehicleId, companyId, hitos) =>
        updateVehicle(vehicleId, companyId, { mantencionReminders: hitos as ('proxima' | 'vencida')[] }),
    },
    new Date(),
  )
  return NextResponse.json({ documentos: result, mantenciones: mant })
}
