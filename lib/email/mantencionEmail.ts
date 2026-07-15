import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

export function mantencionSubject(estado: 'proxima' | 'vencida', patente: string): string {
  return `TapCar · Mantención ${estado === 'vencida' ? 'vencida' : 'próxima'} — ${patente}`
}

export function mantencionHtml(p: { patente: string; vehicleId: string; estado: 'proxima' | 'vencida'; detalle: string }): string {
  return emailLayout({
    titulo: p.estado === 'vencida' ? 'Mantención vencida' : 'Mantención próxima',
    contenidoHtml: `
      <p>La mantención del vehículo <strong>${p.patente}</strong> está <strong>${p.estado === 'vencida' ? 'vencida' : 'próxima'}</strong> (${p.detalle}).</p>
      ${ctaButton('Ver el vehículo', `${appUrl()}/vehiculos/${p.vehicleId}`)}
    `,
    motivo: 'Recibes este correo porque tienes activados los avisos de tu flota en TapCar.',
  })
}
