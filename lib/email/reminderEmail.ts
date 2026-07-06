import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

export function reminderSubject(milestone: string, label: string, patente: string): string {
  if (milestone === '0') return `TapCar · El ${label} de ${patente} venció o vence hoy`
  if (milestone === '7') return `TapCar · El ${label} de ${patente} vence en 7 días`
  return `TapCar · El ${label} de ${patente} vence en 30 días`
}

export function reminderHtml(params: {
  patente: string
  label: string
  fechaVencimiento: string
  milestone: string
  vehicleId: string
}): string {
  const { patente, label, fechaVencimiento, milestone, vehicleId } = params
  const urgencia = milestone === '0' ? 'vence hoy o ya está vencido' : `vence en ${milestone} días`
  return emailLayout({
    titulo: 'Recordatorio de documentación',
    contenidoHtml: `
      <p>El documento <strong>${label}</strong> del vehículo <strong>${patente}</strong> ${urgencia}.</p>
      <p>Fecha de vencimiento: <strong>${fechaVencimiento}</strong></p>
      <p>Renueva y actualiza el documento para que la ficha de fiscalización siga al día.</p>
      ${ctaButton('Actualizar en TapCar', `${appUrl()}/vehiculos/${vehicleId}`)}
    `,
    motivo: 'Recibes este correo porque tienes activados los avisos de tu flota en TapCar.',
  })
}
