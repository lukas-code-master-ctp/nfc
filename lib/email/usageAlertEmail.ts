export function usageAlertSubject(patente: string): string {
  return `TapCar · Uso sin entrega formal — ${patente}`
}

export function usageAlertHtml(p: { patente: string; driverNombre: string; tomadoEn: string }): string {
  const fecha = new Date(p.tomadoEn).toLocaleString('es-CL', { timeZone: 'America/Santiago' })
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Uso sin entrega formal</h2>
      <p>El vehículo <strong>${p.patente}</strong> se volvió a tomar sin que el uso anterior se cerrara con la entrega.</p>
      <p>Uso anterior: <strong>${p.driverNombre}</strong>, tomado el ${fecha}.</p>
      <p>Revisa la bitácora del vehículo en TapCar para hacer el seguimiento.</p>
    </div>
  `
}
