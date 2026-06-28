'use client'
import { useState } from 'react'
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  linkWithCredential,
} from 'firebase/auth'
import { useAuth } from '@/lib/auth/AuthProvider'

const inputCls =
  'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

function codeOf(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : ''
}

export default function SecurityCard() {
  const { user, loading } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading || !user) return null

  const hasPassword = user.providerData.some((p) => p.providerId === 'password')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (next !== confirm) return setError('Las contraseñas no coinciden.')
    if (next.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    setBusy(true)
    try {
      if (hasPassword) {
        const cred = EmailAuthProvider.credential(user!.email!, current)
        await reauthenticateWithCredential(user!, cred)
        await updatePassword(user!, next)
      } else {
        // Cuenta social (Google): vincular un proveedor de correo/contraseña.
        const cred = EmailAuthProvider.credential(user!.email!, next)
        try {
          await linkWithCredential(user!, cred)
        } catch (err) {
          if (codeOf(err) === 'auth/requires-recent-login') {
            await reauthenticateWithPopup(user!, new GoogleAuthProvider())
            await linkWithCredential(user!, cred)
          } else {
            throw err
          }
        }
      }
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      const code = codeOf(err)
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('La contraseña actual no es correcta.')
      } else {
        setError('No se pudo completar la acción. Inténtalo de nuevo.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Seguridad</h2>
      <p className="mt-1 text-sm text-acero">
        {hasPassword
          ? 'Cambia la contraseña de tu cuenta.'
          : 'Tu cuenta usa Google para iniciar sesión. Crea una contraseña para también poder entrar con tu correo.'}
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        {hasPassword && (
          <div className="space-y-1.5">
            <label htmlFor="cur" className="block text-sm font-medium text-acero">Contraseña actual</label>
            <input id="cur" type="password" autoComplete="current-password" className={inputCls}
              value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="new" className="block text-sm font-medium text-acero">
            {hasPassword ? 'Nueva contraseña' : 'Contraseña'}
          </label>
          <input id="new" type="password" autoComplete="new-password" className={inputCls}
            value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="conf" className="block text-sm font-medium text-acero">Confirmar contraseña</label>
          <input id="conf" type="password" autoComplete="new-password" className={inputCls}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-vencido">{error}</p>}
        {done && <p className="text-sm text-[#15803D]">{hasPassword ? 'Contraseña actualizada ✓' : 'Contraseña creada ✓'}</p>}
        <button type="submit" disabled={busy}
          className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
          {busy ? 'Guardando…' : hasPassword ? 'Cambiar contraseña' : 'Crear contraseña'}
        </button>
      </form>
    </section>
  )
}
