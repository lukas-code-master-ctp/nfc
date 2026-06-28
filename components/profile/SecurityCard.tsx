'use client'
import { useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { useAuth } from '@/lib/auth/AuthProvider'

const inputCls =
  'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

export default function SecurityCard() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Solo cuentas con proveedor correo/contraseña pueden cambiar la contraseña.
  const isPassword = user?.providerData?.some((p) => p.providerId === 'password')
  if (!isPassword) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (next !== confirm) return setError('Las contraseñas nuevas no coinciden.')
    if (next.length < 6) return setError('La nueva contraseña debe tener al menos 6 caracteres.')
    setLoading(true)
    try {
      const cred = EmailAuthProvider.credential(user!.email!, current)
      await reauthenticateWithCredential(user!, cred)
      await updatePassword(user!, next)
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch {
      setError('No se pudo cambiar. Revisa que la contraseña actual sea correcta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Seguridad</h2>
      <p className="mt-1 text-sm text-acero">Cambia la contraseña de tu cuenta.</p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="cur" className="block text-sm font-medium text-acero">Contraseña actual</label>
          <input id="cur" type="password" autoComplete="current-password" className={inputCls}
            value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="new" className="block text-sm font-medium text-acero">Nueva contraseña</label>
          <input id="new" type="password" autoComplete="new-password" className={inputCls}
            value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="conf" className="block text-sm font-medium text-acero">Confirmar nueva contraseña</label>
          <input id="conf" type="password" autoComplete="new-password" className={inputCls}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-vencido">{error}</p>}
        {done && <p className="text-sm text-[#15803D]">Contraseña actualizada ✓</p>}
        <button type="submit" disabled={loading}
          className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
          {loading ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </section>
  )
}
