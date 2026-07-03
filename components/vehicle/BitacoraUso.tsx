interface UsageRow {
  id: string
  driverNombre: string
  tomadoEn: string
  entregadoEn: string | null
  estado: 'abierto' | 'cerrado'
  cierreForzado?: boolean
  entregadoPorNombre?: string
  dano?: { hay: boolean; nota?: string }
  fotoTableroUrl: string | null
  fotoCabinaUrl: string | null
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

export default function BitacoraUso({ usos }: { usos: UsageRow[] }) {
  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Bitácora de uso</h2>
      <p className="mt-1 text-sm text-acero">Quién usó el vehículo y en qué estado lo dejó.</p>

      {usos.length === 0 ? (
        <p className="mt-4 text-sm text-acero">Aún no hay registros de uso.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {usos.map((u) => (
            <li key={u.id} className="rounded-xl border border-linea p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-tinta">{u.driverNombre}</p>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {u.estado === 'abierto' && <span className="rounded-full bg-azul/10 px-2 py-0.5 text-xs font-medium text-azul">En uso</span>}
                  {u.cierreForzado && <span className="rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">Sin entrega formal</span>}
                  {u.dano?.hay && <span className="rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Daño reportado</span>}
                </div>
              </div>
              <p className="mt-1 text-xs text-acero">
                Tomó: {fecha(u.tomadoEn)}
                {u.entregadoEn ? ` · Entregó: ${fecha(u.entregadoEn)}` : ''}
                {u.entregadoPorNombre && u.entregadoPorNombre !== u.driverNombre ? ` (por ${u.entregadoPorNombre})` : ''}
              </p>
              {u.dano?.nota && <p className="mt-1 text-xs text-[#C81E1E]">Daño: {u.dano.nota}</p>}
              {(u.fotoTableroUrl || u.fotoCabinaUrl) && (
                <div className="mt-3 flex gap-2">
                  {u.fotoTableroUrl && (
                    <a href={u.fotoTableroUrl} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u.fotoTableroUrl} alt="Tablero" loading="lazy" className="h-20 w-28 rounded-lg border border-linea object-cover" />
                    </a>
                  )}
                  {u.fotoCabinaUrl && (
                    <a href={u.fotoCabinaUrl} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u.fotoCabinaUrl} alt="Cabina" loading="lazy" className="h-20 w-28 rounded-lg border border-linea object-cover" />
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
