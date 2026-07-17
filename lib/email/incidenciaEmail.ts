import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

export function incidenciaSubject(patente: string): string {
  return `TapCar · Daño reportado al tomar — ${patente}`
}

export function incidenciaHtml(p: { patente: string; vehicleId: string; driverNombre: string; nota?: string | null }): string {
  return emailLayout({
    titulo: 'Daño reportado al tomar',
    contenidoHtml: `
      <p><strong>${p.driverNombre}</strong> reportó un daño preexistente en el vehículo <strong>${p.patente}</strong> al tomarlo.</p>
      ${p.nota ? `<p>Detalle:<br>${p.nota.replace(/</g, '&lt;')}</p>` : ''}
      ${ctaButton('Ver el vehículo', `${appUrl()}/vehiculos/${p.vehicleId}`)}
    `,
    motivo: 'Recibes este correo porque tienes activados los avisos de tu flota en TapCar.',
  })
}
