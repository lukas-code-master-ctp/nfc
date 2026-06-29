'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Eliminar vehículo (borrado en cascada: documentos + archivos). Confirma
// antes de ejecutar y al terminar vuelve al dashboard.
export default function DeleteVehicleButton({ vehicleId, label }: { vehicleId: string; label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function del() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/vehicles/${vehicleId}`, { method: 'DELETE' })
    if (!res.ok) {
      setError('No se pudo eliminar el vehículo. Inténtalo de nuevo.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <section className="rounded-2xl border border-vencido/30 bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-vencido">Eliminar vehículo</h2>
      <p className="mt-1 text-sm text-acero">
        Borra de forma permanente <strong className="text-tinta">{label}</strong> y todos sus documentos y
        archivos. Esta acción no se puede deshacer.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-vencido/40 px-4 py-2.5 text-sm font-semibold text-vencido transition-colors hover:bg-[#FCE7E7]"
        >
          Eliminar vehículo
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-tinta">¿Seguro que quieres eliminar este vehículo?</p>
          {error && <p className="text-sm text-vencido">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={del}
              disabled={loading}
              className="rounded-lg bg-vencido px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
            >
              {loading ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
            <button
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
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
