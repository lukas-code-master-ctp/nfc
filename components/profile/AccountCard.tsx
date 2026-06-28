'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthProvider'

const PROVIDER_LABEL: Record<string, string> = {
  'google.com': 'Google',
  password: 'Correo y contraseña',
}

export default function AccountCard({ email, initialName }: { email: string; initialName: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const photo = user?.photoURL ?? null
  const initial = (email || '?').charAt(0).toUpperCase()
  const providerId = user?.providerData?.[0]?.providerId
  const providerLabel = providerId ? PROVIDER_LABEL[providerId] ?? providerId : '—'

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } else {
      setError('No se pudo guardar.')
    }
  }

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Tu cuenta</h2>

      <div className="mt-4 flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-azul/10 text-xl font-semibold text-azul">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="size-14 object-cover" referrerPolicy="no-referrer" />
          ) : (
            initial
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-tinta">{email}</p>
          <p className="mt-0.5 text-sm text-acero">
            Acceso con <span className="font-medium text-tinta">{providerLabel}</span>
          </p>
        </div>
      </div>

      <form onSubmit={save} className="mt-5 space-y-1.5">
        <label htmlFor="displayName" className="block text-sm font-medium text-acero">
          Nombre para mostrar
        </label>
        <div className="flex gap-2">
          <input
            id="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            className="w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
          />
          <button
            type="submit"
            disabled={saving}
            className="shrink-0 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        {saved && <p className="text-sm text-[#15803D]">Guardado ✓</p>}
        {error && <p className="text-sm text-vencido">{error}</p>}
      </form>
    </section>
  )
}
