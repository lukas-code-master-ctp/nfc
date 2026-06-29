// Allowlist de admins de la plataforma por variable de entorno
// (ADMIN_EMAILS, correos separados por coma). Nadie puede auto-promoverse
// desde la app. Falla cerrado: sin la variable, no hay admins.

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmails().has(email.trim().toLowerCase())
}
