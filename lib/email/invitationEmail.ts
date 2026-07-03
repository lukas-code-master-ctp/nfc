import type { Role } from '@/lib/auth/roles'

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
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Te invitaron a ${empresa} en TapCar</h2>
      <p><strong>${inviterEmail}</strong> te invitó a unirte como <strong>${ROLE_LABELS[role]}</strong>.</p>
      <p style="margin: 20px 0;">
        <a href="${acceptUrl}" style="display:inline-block;background:#1D4ED8;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Aceptar invitación</a>
      </p>
      <p style="font-size:13px;color:#64748b;">O abre este enlace:<br>${acceptUrl}</p>
      <p style="font-size:13px;color:#64748b;">La invitación vence en 7 días. Si no esperabas este correo, puedes ignorarlo.</p>
    </div>
  `
}
