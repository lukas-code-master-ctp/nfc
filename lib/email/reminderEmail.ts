export function reminderSubject(milestone: string, label: string): string {
  if (milestone === '0') return `⚠️ Tu ${label} vence hoy o está vencido`
  if (milestone === '7') return `Tu ${label} vence en 7 días`
  return `Tu ${label} vence en 30 días`
}

export function reminderHtml(params: {
  patente: string
  label: string
  fechaVencimiento: string
  milestone: string
}): string {
  const { patente, label, fechaVencimiento, milestone } = params
  const urgencia = milestone === '0' ? 'vence hoy o ya está vencido' : `vence en ${milestone} días`
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Recordatorio de documentación vehicular</h2>
      <p>El documento <strong>${label}</strong> de tu vehículo <strong>${patente}</strong> ${urgencia}.</p>
      <p>Fecha de vencimiento: <strong>${fechaVencimiento}</strong></p>
      <p>Mantén tu documentación al día para evitar problemas en la fiscalización.</p>
    </div>
  `
}
