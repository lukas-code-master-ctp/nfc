import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

// Correo interno: notifica al equipo TapCar (BILLING_EMAIL / primer ADMIN_EMAILS)
// que una empresa pidió un cambio de plan desde /facturacion.

export function billingRequestSubject(p: { fromEmail: string; razonSocial: string }): string {
  const quien = p.razonSocial ? `${p.razonSocial} (${p.fromEmail})` : p.fromEmail
  return `TapCar · Solicitud de plan — ${quien}`
}

export function billingRequestHtml(p: {
  fromEmail: string
  razonSocial: string
  currentCupo: number
  desiredVehicles: number
  message: string
}): string {
  const quien = p.razonSocial ? `${p.razonSocial} (${p.fromEmail})` : p.fromEmail
  return emailLayout({
    titulo: 'Solicitud de cambio de plan',
    contenidoHtml: `
      <p><strong>${quien}</strong> solicita un cambio de plan.</p>
      <ul>
        <li>Cupo actual: <strong>${p.currentCupo}</strong> vehículos</li>
        <li>Cupo solicitado: <strong>${p.desiredVehicles}</strong> vehículos</li>
      </ul>
      ${p.message ? `<p>Mensaje:<br>${p.message.replace(/</g, '&lt;')}</p>` : ''}
      ${ctaButton('Abrir el panel', `${appUrl()}/admin`)}
    `,
    motivo: 'Solicitud enviada desde el formulario de facturación de TapCar.',
  })
}
