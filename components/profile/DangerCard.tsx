'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

export default function DangerCard() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function del() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/account', { method: 'DELETE' })
    if (!res.ok) {
      setError('No se pudo eliminar la cuenta. Inténtalo de nuevo.')
      setLoading(false)
      return
    }
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }
    router.push('/login')
    router.refresh()
  }

  return (
    <section className="rounded-2xl border border-vencido/30 bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-vencido">Zona de peligro</h2>
      <p className="mt-1 text-sm text-acero">
        Eliminar tu cuenta borra de forma permanente tu perfil y <strong>todos</strong> tus vehículos,
        documentos y archivos. Esta acción no se puede deshacer.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-vencido/40 px-4 py-2.5 text-sm font-semibold text-vencido transition-colors hover:bg-[#FCE7E7]"
        >
          Eliminar mi cuenta
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label htmlFor="confirmDelete" className="block text-sm text-acero">
            Escribe <span className="font-semibold text-tinta">ELIMINAR</span> para confirmar.
          </label>
          <input
            id="confirmDelete"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ELIMINAR"
            className="w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-vencido focus:outline-none focus:ring-2 focus:ring-vencido/20"
          />
          {error && <p className="text-sm text-vencido">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={del}
              disabled={text !== 'ELIMINAR' || loading}
              className="rounded-lg bg-vencido px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
            >
              {loading ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
            <button
              onClick={() => { setOpen(false); setText(''); setError(null) }}
              className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
