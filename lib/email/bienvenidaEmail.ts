import { emailLayout, ctaButton, appUrl } from '@/lib/email/layout'

export function bienvenidaSubject(): string {
  return 'Tu cuenta de TapCar está lista'
}

/**
 * Correo de bienvenida, al crear la cuenta.
 *
 * Los tres pasos que enumera son los mismos con los que abre el checklist del
 * dashboard (`lib/onboarding/pasos.ts`), a propósito: quien llega desde el
 * correo se encuentra con la misma lista y ya sabe qué sigue. Si esos pasos
 * cambian allá, este texto queda desalineado — hay un test que fija el orden.
 */
export function bienvenidaHtml(): string {
  const paso = (n: number, titulo: string, detalle: string) => `
    <tr>
      <td style="padding:0 10px 12px 0;vertical-align:top;">
        <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#eef2ff;color:#2952e6;border-radius:11px;font-weight:700;font-size:12px;">${n}</span>
      </td>
      <td style="padding:0 0 12px;vertical-align:top;">
        <strong>${titulo}</strong><br>
        <span style="color:#64748b;font-size:14px;">${detalle}</span>
      </td>
    </tr>`

  return emailLayout({
    titulo: 'Bienvenido a TapCar',
    contenidoHtml: `
      <p>Tu cuenta ya está creada. Con TapCar tienes los documentos de tus vehículos siempre a mano, y te avisamos por correo antes de que venzan.</p>
      <p style="margin:16px 0 4px;"><strong>Para partir:</strong></p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
        ${paso(1, 'Agrega tu primer vehículo', 'Con la patente, la marca y el modelo basta.')}
        ${paso(2, 'Sube sus documentos', 'Permiso de circulación, revisión técnica y SOAP.')}
        ${paso(3, 'Vincula el chip NFC', 'Va en el llavero del auto: al acercarle un celular se abre la ficha del vehículo con sus documentos.')}
      </table>
      ${ctaButton('Abrir TapCar', `${appUrl()}/dashboard`)}
      <p style="font-size:13px;color:#64748b;">Al entrar te espera una guía que va marcando estos pasos a medida que los completas.</p>
    `,
    motivo: 'Recibes este correo porque creaste una cuenta en TapCar.',
  })
}
