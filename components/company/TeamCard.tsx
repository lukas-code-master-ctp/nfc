'use client'
import { useEffect, useState } from 'react'

type Role = 'admin' | 'editor' | 'viewer'
const ROLE_LABELS: Record<Role, string> = { admin: 'Administrador', editor: 'Editor', viewer: 'Visor' }
const ROLE_OPTIONS: Role[] = ['viewer', 'editor', 'admin']

interface Member { uid: string; email: string; displayName: string; role: Role; isOwner: boolean; recibeAlertas: boolean }
interface Invitation { id: string; email: string; role: Role; expiresAt: string }

function diasRestantes(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export default function TeamCard({ currentUid }: { currentUid: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLink, setLastLink] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/company/team')
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members)
      setInvitations(data.invitations)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const total = members.length + invitations.length
  const lleno = total >= 5

  async function invitar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setLastLink(null)
    const res = await fetch('/api/company/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    setBusy(false)
    if (res.ok) {
      const data = await res.json()
      setLastLink(data.acceptUrl)
      setEmail('')
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo invitar.')
    }
  }

  async function cancelar(id: string) {
    await fetch(`/api/company/invitations/${id}`, { method: 'DELETE' })
    load()
  }
  async function cambiarRol(uid: string, nuevo: Role) {
    const res = await fetch(`/api/company/members/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nuevo }),
    })
    if (res.ok) {
      setError(null)
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo cambiar el rol.')
      load()
    }
  }
  async function toggleNotif(uid: string, value: boolean) {
    const res = await fetch(`/api/company/members/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recibeAlertas: value }),
    })
    if (res.ok) {
      setError(null)
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo cambiar las notificaciones.')
      load()
    }
  }
  async function quitar(uid: string) {
    if (!confirm('¿Quitar a este miembro del equipo?')) return
    const res = await fetch(`/api/company/members/${uid}`, { method: 'DELETE' })
    if (res.ok) {
      setError(null)
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo quitar al miembro.')
      load()
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-tinta">Equipo</h2>
        <span className="text-sm text-acero">{total} de 5 miembros</span>
      </div>
      <p className="mt-1 text-sm text-acero">Invita personas y define qué pueden hacer con tu flota.</p>

      {loading ? (
        <p className="mt-4 text-sm text-acero">Cargando…</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {members.map((mem) => (
              <li key={mem.uid} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tinta">{mem.email || mem.displayName || mem.uid}</p>
                  {mem.isOwner && <span className="text-xs text-acero">Dueño</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleNotif(mem.uid, !mem.recibeAlertas)}
                    aria-pressed={mem.recibeAlertas}
                    title={mem.recibeAlertas ? 'Recibe notificaciones por email' : 'No recibe notificaciones'}
                    className={
                      mem.recibeAlertas
                        ? 'flex items-center gap-1 rounded-full border border-azul/30 bg-azul/10 px-2.5 py-1 text-xs font-medium text-azul'
                        : 'flex items-center gap-1 rounded-full border border-linea px-2.5 py-1 text-xs font-medium text-acero hover:text-tinta'
                    }
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    Avisos
                  </button>
                  {mem.isOwner || mem.uid === currentUid ? (
                    <span className="rounded-full bg-lienzo px-2.5 py-1 text-xs font-medium text-acero">{ROLE_LABELS[mem.role]}</span>
                  ) : (
                    <>
                      <select
                        value={mem.role}
                        onChange={(e) => cambiarRol(mem.uid, e.target.value as Role)}
                        className="rounded-lg border border-linea bg-superficie px-2 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none"
                      >
                        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      <button onClick={() => quitar(mem.uid)} className="text-sm text-vencido hover:underline">Quitar</button>
                    </>
                  )}
                </div>
              </li>
            ))}

            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-linea px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tinta">{inv.email}</p>
                  <span className="text-xs text-acero">Invitación pendiente · {ROLE_LABELS[inv.role]} · expira en {diasRestantes(inv.expiresAt)} días</span>
                </div>
                <button onClick={() => cancelar(inv.id)} className="text-sm text-vencido hover:underline">Cancelar</button>
              </li>
            ))}
          </ul>

          {members.length > 0 && members.every((m) => !m.recibeAlertas) && (
            <p className="mt-3 rounded-lg bg-[#FEF3C7] px-3 py-2 text-xs text-[#92400E]">
              Nadie recibirá las notificaciones de vencimiento ni las alertas de flota.
            </p>
          )}

          {lleno ? (
            <p className="mt-4 text-sm text-acero">Alcanzaste el máximo de 5 miembros.</p>
          ) : (
            <form onSubmit={invitar} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@empresa.cl"
                className="flex-1 rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta focus:border-azul focus:outline-none"
              >
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
              >
                {busy ? 'Invitando…' : 'Invitar'}
              </button>
            </form>
          )}

          {error && <p className="mt-2 text-sm text-vencido">{error}</p>}
          {lastLink && (
            <p className="mt-2 text-sm text-acero">
              Invitación creada. Si el correo no llega, comparte este enlace:{' '}
              <button
                onClick={() => navigator.clipboard?.writeText(lastLink)}
                className="font-medium text-azul hover:underline"
              >
                copiar enlace
              </button>
            </p>
          )}
        </>
      )}
    </section>
  )
}
