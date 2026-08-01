import { Resend } from 'resend'
import { reminderSubject, reminderHtml } from '@/lib/email/reminderEmail'
import { invitationSubject, invitationHtml } from '@/lib/email/invitationEmail'
import { bienvenidaSubject, bienvenidaHtml } from '@/lib/email/bienvenidaEmail'
import { billingRequestSubject, billingRequestHtml } from '@/lib/email/billingEmail'
import { danoSubject, danoHtml } from '@/lib/email/danoEmail'
import { incidenciaSubject, incidenciaHtml } from '@/lib/email/incidenciaEmail'
import { mantencionSubject, mantencionHtml } from '@/lib/email/mantencionEmail'
import {
  transferenciaRecibidaSubject, transferenciaRecibidaHtml,
  transferenciaEnviadaSubject, transferenciaEnviadaHtml,
  transferenciaAceptadaSubject, transferenciaAceptadaHtml,
  transferenciaSinCuentaSubject, transferenciaSinCuentaHtml,
} from '@/lib/email/transferenciaEmail'
import type { Role } from '@/lib/auth/roles'

let _resend: Resend | undefined
function getResend() {
  _resend ??= new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export async function sendBienvenidaEmail(to: string): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: bienvenidaSubject(),
    html: bienvenidaHtml(),
  })
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

export async function sendIncidenciaEmail(
  to: string,
  p: { patente: string; vehicleId: string; driverNombre: string; nota?: string | null },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: incidenciaSubject(p.patente),
    html: incidenciaHtml(p),
  })
}

export async function sendMantencionEmail(
  to: string,
  p: { patente: string; vehicleId: string; estado: 'proxima' | 'vencida'; detalle: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: mantencionSubject(p.estado, p.patente),
    html: mantencionHtml(p),
  })
}

export async function sendTransferenciaRecibidaEmail(
  to: string,
  p: { patente: string; deCompanyNombre: string; deEmail: string; aceptarUrl: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: transferenciaRecibidaSubject(p.patente),
    html: transferenciaRecibidaHtml(p),
  })
}

export async function sendTransferenciaEnviadaEmail(
  to: string,
  p: { patente: string; paraEmail: string; vehicleId: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: transferenciaEnviadaSubject(p.patente),
    html: transferenciaEnviadaHtml(p),
  })
}

export async function sendTransferenciaSinCuentaEmail(
  to: string,
  p: { patente: string; deCompanyNombre: string; deEmail: string; paraEmail: string; registrarUrl: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: transferenciaSinCuentaSubject(p.patente),
    html: transferenciaSinCuentaHtml(p),
  })
}

export async function sendTransferenciaAceptadaEmail(
  to: string,
  p: { patente: string; paraEmail: string },
): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: transferenciaAceptadaSubject(p.patente),
    html: transferenciaAceptadaHtml(p),
  })
}

/** A quién le llegan las solicitudes de plan. `BILLING_EMAIL`, o el primer `ADMIN_EMAILS`. */
export function billingNotifyEmail(): string | null {
  const explicit = process.env.BILLING_EMAIL?.trim()
  if (explicit) return explicit
  const firstAdmin = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim()
  return firstAdmin || null
}
