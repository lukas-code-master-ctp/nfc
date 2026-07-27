import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

const GRIS = 'font-size:13px;color:#64748b;'

export function transferenciaRecibidaSubject(patente: string): string {
  return `Te quieren transferir el vehículo ${patente}`
}

export function transferenciaRecibidaHtml(p: {
  patente: string
  deCompanyNombre: string
  deEmail: string
  aceptarUrl: string
}): string {
  const empresa = p.deCompanyNombre.trim() || 'Otra empresa'
  return emailLayout({
    titulo: `Te quieren transferir el ${p.patente}`,
    contenidoHtml: `
      <p><strong>${empresa}</strong> (${p.deEmail}) quiere transferirte el vehículo <strong>${p.patente}</strong>.</p>
      <p>Si aceptas, el vehículo pasa a tu flota con sus documentos y su historial de mantenciones, y ocupará un cupo de tu plan.</p>
      ${ctaButton('Revisar la transferencia', p.aceptarUrl)}
      <p style="${GRIS}">O abre este enlace:<br>${p.aceptarUrl}</p>
      <p style="${GRIS}">La transferencia vence en 7 días.</p>
    `,
    motivo: 'Si no esperabas este correo, puedes ignorarlo: sin tu aceptación no pasa nada.',
  })
}

export function transferenciaEnviadaSubject(patente: string): string {
  return `Enviaste la transferencia del ${patente}`
}

export function transferenciaEnviadaHtml(p: {
  patente: string
  paraEmail: string
  vehicleId: string
}): string {
  return emailLayout({
    titulo: `Transferencia enviada: ${p.patente}`,
    contenidoHtml: `
      <p>Le ofreciste el vehículo <strong>${p.patente}</strong> a <strong>${p.paraEmail}</strong>.</p>
      <p>Sigue siendo tuyo hasta que la otra cuenta acepte. Puedes cancelarla desde la pestaña Ajustes del vehículo.</p>
      ${ctaButton('Ver el vehículo', `${appUrl()}/vehiculos/${p.vehicleId}`)}
      <p style="${GRIS}">La transferencia vence en 7 días.</p>
    `,
    motivo: 'Recibes este correo porque enviaste una transferencia en TapCar.',
  })
}

export function transferenciaAceptadaSubject(patente: string): string {
  return `${patente} ya es de su nuevo dueño`
}

export function transferenciaAceptadaHtml(p: { patente: string; paraEmail: string }): string {
  return emailLayout({
    titulo: `Transferencia completada: ${p.patente}`,
    contenidoHtml: `
      <p><strong>${p.paraEmail}</strong> aceptó la transferencia del vehículo <strong>${p.patente}</strong>.</p>
      <p>Ya no está en tu flota, junto con sus documentos y mantenciones. Tu bitácora de usos se mantiene.</p>
      ${ctaButton('Abrir TapCar', `${appUrl()}/dashboard`)}
    `,
    motivo: 'Recibes este correo porque transferiste un vehículo en TapCar.',
  })
}
