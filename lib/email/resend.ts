import { Resend } from 'resend'
import { reminderSubject, reminderHtml } from '@/lib/email/reminderEmail'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendReminderEmail(
  to: string,
  params: { patente: string; label: string; fechaVencimiento: string; milestone: string },
): Promise<void> {
  await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: reminderSubject(params.milestone, params.label),
    html: reminderHtml(params),
  })
}
