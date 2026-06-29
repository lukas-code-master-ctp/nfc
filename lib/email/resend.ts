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

export async function sendBillingRequestEmail(
  to: string,
  p: { fromEmail: string; razonSocial: string; currentCupo: number; desiredVehicles: number; message: string },
): Promise<void> {
  const quien = p.razonSocial ? `${p.razonSocial} (${p.fromEmail})` : p.fromEmail
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    replyTo: p.fromEmail,
    subject: `TapCar · Solicitud de plan — ${quien}`,
    html: `
      <p><strong>${quien}</strong> solicita un cambio de plan.</p>
      <ul>
        <li>Cupo actual: <strong>${p.currentCupo}</strong> vehículos</li>
        <li>Cupo solicitado: <strong>${p.desiredVehicles}</strong> vehículos</li>
      </ul>
      ${p.message ? `<p>Mensaje:<br>${p.message.replace(/</g, '&lt;')}</p>` : ''}
    `,
  })
}
