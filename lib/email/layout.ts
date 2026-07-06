// Layout compartido de los correos de TapCar (puro, testeable). Todos los
// correos salen brandeados: wordmark en texto (los clientes de correo bloquean
// imágenes), tarjeta blanca con el contenido, botón CTA y pie con el motivo.

const AZUL = '#2952e6' // --color-azul del theme
const TINTA = '#0f172a'
const ACERO = '#64748b'

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://app.tapcar.cl'
}

export function ctaButton(texto: string, href: string): string {
  return `<p style="margin:24px 0 8px;"><a href="${href}" style="display:inline-block;background:${AZUL};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">${texto}</a></p>`
}

export function emailLayout(p: { titulo: string; contenidoHtml: string; motivo: string }): string {
  return `
  <div style="background:#f4f5fb;padding:24px 12px;">
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;">
      <p style="text-align:center;font-size:22px;font-weight:700;color:${TINTA};margin:0 0 16px;">Tap<span style="color:${AZUL};">Car</span></p>
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;color:${TINTA};font-size:15px;line-height:1.5;">
        <h2 style="margin:0 0 12px;font-size:18px;color:${TINTA};">${p.titulo}</h2>
        ${p.contenidoHtml}
      </div>
      <p style="text-align:center;font-size:12px;color:${ACERO};margin:16px 0 0;">
        ${p.motivo}<br>
        Enviado por TapCar · <a href="${appUrl()}" style="color:${ACERO};">app.tapcar.cl</a>
      </p>
    </div>
  </div>`
}
