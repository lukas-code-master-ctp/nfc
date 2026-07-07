import { Resend } from 'resend'
import { reminderSubject, reminderHtml } from '@/lib/email/reminderEmail'
import { invitationSubject, invitationHtml } from '@/lib/email/invitationEmail'
import { billingRequestSubject, billingRequestHtml } from '@/lib/email/billingEmail'
import { danoSubject, danoHtml } from '@/lib/email/danoEmail'
import type { Role } from '@/lib/auth/roles'

let _resend: Resend | undefined
function getResend() {
  _resend ??= new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export async function sendReminderEmail(
  to: string,
  params: { patente: string; label: string; fechaVencimiento: string; milestone: string; vehicleId: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: reminderSubject(params.milestone, params.label, params.patente),
    html: reminderHtml(params),
  })
}

export async function sendBillingRequestEmail(
  to: string,
  p: { fromEmail: string; razonSocial: string; currentCupo: number; desiredVehicles: number; message: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    replyTo: p.fromEmail,
    subject: billingRequestSubject(p),
    html: billingRequestHtml(p),
  })
}

export async function sendInvitationEmail(
  to: string,
  params: { companyName: string; role: Role; inviterEmail: string; acceptUrl: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: invitationSubject(params.companyName),
    html: invitationHtml(params),
  })
}

export async function sendDanoEmail(
  to: string,
  p: { patente: string; vehicleId: string; usageId: string; driverNombre: string; nota?: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: danoSubject(p.patente),
    html: danoHtml(p),
  })
}
