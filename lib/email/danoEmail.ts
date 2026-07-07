import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

export function danoSubject(patente: string): string {
  return `TapCar · Daño reportado — ${patente}`
}

export function danoHtml(p: {
  patente: string
  vehicleId: string
  usageId: string
  driverNombre: string
  nota?: string
}): string {
  return emailLayout({
    titulo: 'Daño reportado',
    contenidoHtml: `
      <p>Se reportó un daño en el vehículo <strong>${p.patente}</strong>.</p>
      <p>Lo reportó <strong>${p.driverNombre}</strong> al entregar.</p>
      ${p.nota ? `<p>Detalle:<br>${p.nota.replace(/</g, '&lt;')}</p>` : ''}
      ${ctaButton('Ver el daño', `${appUrl()}/vehiculos/${p.vehicleId}#uso-${p.usageId}`)}
    `,
    motivo: 'Recibes este correo porque tienes activados los avisos de tu flota en TapCar.',
  })
}
