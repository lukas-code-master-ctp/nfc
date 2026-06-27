import { Resend } from 'resend'
import { reminderSubject, reminderHtml } from '@/lib/email/reminderEmail'

let _resend: Resend | undefined
function getResend() {
  _resend ??= new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export async function sendReminderEmail(
  to: string,
  params: { patente: string; label: string; fechaVencimiento: string; milestone: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: reminderSubject(params.milestone, params.label),
    html: reminderHtml(params),
  })
}
