import Link from 'next/link'

interface VehiculoItem {
  id: string
  patente: string
  marca: string
  modelo: string
  usoActual: { driverNombre: string; tomadoEn: string } | null
  tiposAlerta: ('dano' | 'sin_entrega')[]
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

export default function FlotaGrid({ vehiculos }: { vehiculos: VehiculoItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-tinta">Vehículos</h2>
      {vehiculos.length === 0 ? (
        <p className="text-sm text-acero">Aún no hay vehículos.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {vehiculos.map((v) => (
            <li key={v.id}>
              <Link
                href={`/vehiculos/${v.id}`}
                className="block rounded-2xl border border-linea bg-superficie p-4 shadow-sm transition-colors hover:border-azul/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-tinta">{v.patente}</p>
                  <div className="flex gap-1">
                    {v.tiposAlerta.includes('dano') && (
                      <span className="rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Daño</span>
                    )}
                    {v.tiposAlerta.includes('sin_entrega') && (
                      <span className="rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">Sin entrega</span>
                    )}
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-acero">{v.marca} {v.modelo}</p>
                <p className="mt-2 text-sm">
                  {v.usoActual ? (
                    <span className="text-tinta">En uso por <span className="font-medium">{v.usoActual.driverNombre}</span> · desde {hora(v.usoActual.tomadoEn)}</span>
                  ) : (
                    <span className="text-[#15803D]">Disponible</span>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
