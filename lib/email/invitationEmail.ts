import type { Role } from '@/lib/auth/roles'
import { emailLayout, ctaButton } from '@/lib/email/layout'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visor',
}

export function invitationSubject(companyName: string): string {
  const empresa = companyName.trim() || 'tu equipo'
  return `Te invitaron a ${empresa} en TapCar`
}

export function invitationHtml(params: {
  companyName: string
  role: Role
  inviterEmail: string
  acceptUrl: string
}): string {
  const { companyName, role, inviterEmail, acceptUrl } = params
  const empresa = companyName.trim() || 'un equipo'
  return emailLayout({
    titulo: `Te invitaron a ${empresa}`,
    contenidoHtml: `
      <p><strong>${inviterEmail}</strong> te invitó a unirte como <strong>${ROLE_LABELS[role]}</strong>.</p>
      ${ctaButton('Aceptar invitación', acceptUrl)}
      <p style="font-size:13px;color:#64748b;">O abre este enlace:<br>${acceptUrl}</p>
      <p style="font-size:13px;color:#64748b;">La invitación vence en 7 días.</p>
    `,
    motivo: 'Si no esperabas este correo, puedes ignorarlo.',
  })
}
