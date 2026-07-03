'use client'

import { useEffect, useState } from 'react'

type Role = 'admin' | 'editor' | 'viewer'

type InvitationInfo = {
  companyName: string
  role: Role
  email: string
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visor',
}

export default function InvitationBanner({ token }: { token: string }) {
  const [info, setInfo] = useState<InvitationInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/invitations/' + encodeURIComponent(token))
        if (!res.ok) return
        const data = (await res.json()) as InvitationInfo
        if (!cancelled) setInfo(data)
      } catch {
        // sin conexión o error de red: no mostramos el aviso
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  if (!info) return null

  return (
    <div className="mb-4 rounded-lg border border-azul/30 bg-azul/5 px-4 py-3 text-sm text-tinta">
      Te invitaron a <strong>{info.companyName || 'un equipo'}</strong> como{' '}
      <strong>{ROLE_LABELS[info.role]}</strong>. Inicia sesión con <strong>{info.email}</strong> para
      aceptar.
    </div>
  )
}
