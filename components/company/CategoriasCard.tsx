'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Categoria } from '@/lib/types'

export default function CategoriasCard({ initial }: { initial: Categoria[] }) {
  const router = useRouter()
  const [cats, setCats] = useState<Categoria[]>(initial)
  const [nueva, setNueva] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function agregar() {
    const nombre = nueva.trim()
    if (!nombre) return
    if (cats.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) { setNueva(''); return }
    setCats([...cats, { id: crypto.randomUUID(), nombre }])
    setNueva('')
  }
  function renombrar(id: string, nombre: string) {
    setCats(cats.map((c) => (c.id === id ? { ...c, nombre } : c)))
  }
  function eliminar(id: string) {
    if (!confirm('¿Eliminar esta categoría? Los vehículos que la tengan quedarán sin categoría.')) return
    setCats(cats.filter((c) => c.id !== id))
  }

  async function guardar() {
    setSaving(true); setError(null); setSaved(false)
    const res = await fetch('/api/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categorias: cats.map((c) => ({ id: c.id, nombre: c.nombre.trim() })) }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2500) }
    else setError('No se pudo guardar.')
  }

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Categorías</h2>
      <p className="mt-1 text-sm text-acero">Agrupa tus vehículos (ej. Camiones, Reparto). Podrás filtrar por categoría en el panel.</p>

      <div className="mt-4 space-y-2">
        {cats.length === 0 && <p className="text-sm text-acero">Aún no hay categorías.</p>}
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input value={c.nombre} onChange={(e) => renombrar(c.id, e.target.value)} className={inputCls} />
            <button type="button" onClick={() => eliminar(c.id)} className="shrink-0 text-sm text-vencido hover:underline">Eliminar</button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
          placeholder="Nueva categoría"
          className={inputCls}
        />
        <button type="button" onClick={agregar} className="shrink-0 rounded-lg border border-linea px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
          Agregar
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={saving} className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {saved && <span className="text-sm text-[#15803D]">Guardado ✓</span>}
        {error && <span className="text-sm text-vencido">{error}</span>}
      </div>
    </section>
  )
}
