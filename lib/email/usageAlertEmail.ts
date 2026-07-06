import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

export function usageAlertSubject(patente: string): string {
  return `TapCar · Uso sin entrega formal — ${patente}`
}

export function usageAlertHtml(p: { patente: string; driverNombre: string; tomadoEn: string }): string {
  const fecha = new Date(p.tomadoEn).toLocaleString('es-CL', { timeZone: 'America/Santiago' })
  return emailLayout({
    titulo: 'Uso sin entrega formal',
    contenidoHtml: `
      <p>El vehículo <strong>${p.patente}</strong> se volvió a tomar sin que el uso anterior se cerrara con la entrega.</p>
      <p>Uso anterior: <strong>${p.driverNombre}</strong>, tomado el ${fecha}.</p>
      ${ctaButton('Ver la flota', `${appUrl()}/flota`)}
    `,
    motivo: 'Recibes este correo porque tienes activados los avisos de tu flota en TapCar.',
  })
}
