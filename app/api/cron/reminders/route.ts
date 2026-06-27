import { NextRequest, NextResponse } from 'next/server'
import { processReminders } from '@/lib/documents/runReminders'
import { listAllDocuments, updateDocument } from '@/lib/data/documents'
import { vehicleInfoForReminder } from '@/lib/data/vehicles'
import { sendReminderEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await processReminders(
    {
      allDocuments: listAllDocuments,
      vehicleInfo: vehicleInfoForReminder,
      sendReminderEmail,
      markReminderSent: (id, ownerUid, remindersSent) => updateDocument(id, ownerUid, { remindersSent }),
    },
    new Date(),
  )
  return NextResponse.json(result)
}
