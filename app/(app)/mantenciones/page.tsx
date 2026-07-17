import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMembership } from '@/lib/auth/membership'
import { listVehicles } from '@/lib/data/vehicles'
import { getCompany } from '@/lib/data/companies'
import { ultimaMantencion } from '@/lib/data/mantenciones'
import { estadoMantencion, type EstadoMantencion } from '@/lib/mantencion/status'
import BackLink from '@/components/BackLink'

export const dynamic = 'force-dynamic'

const ORDEN: Record<EstadoMantencion, number> = { vencida: 0, proxima: 1, al_dia: 2, sin_registro: 3, sin_pauta: 4 }
const BADGE: Record<EstadoMantencion, { label: string; cls: string }> = {
  vencida: { label: 'Vencida', cls: 'bg-[#FCE7E7] text-[#C81E1E]' },
  proxima: { label: 'Próxima', cls: 'bg-[#FDF1DC] text-[#B45309]' },
  al_dia: { label: 'Al día', cls: 'bg-[#E6F4EA] text-[#15803D]' },
  sin_registro: { label: 'Sin registro', cls: 'bg-[#EEF0F3] text-acero' },
  sin_pauta: { label: 'Sin pauta', cls: 'bg-[#EEF0F3] text-acero' },
}

export default async function MantencionesPage() {
  const m = await getMembership()
  if (!m) redirect('/login')
  const [vehicles, company] = await Promise.all([listVehicles(m.companyId), getCompany(m.companyId)])
  const now = new Date()

  const filas = await Promise.all(
    vehicles.map(async (v) => {
      const pauta = v.pautaMantencion ?? company?.pautaMantencion ?? null
      const ultima = await ultimaMantencion(v.id)
      const { estado, detalle } = estadoMantencion({ pauta, ultima, kmActual: v.kmActual ?? null, now })
      const partes: string[] = []
      if (detalle.kmRestantes != null) partes.push(detalle.kmRestantes <= 0 ? `pasada ${Math.abs(detalle.kmRestantes).toLocaleString('es-CL')} km` : `faltan ${detalle.kmRestantes.toLocaleString('es-CL')} km`)
      if (detalle.diasRestantes != null) partes.push(detalle.diasRestantes < 0 ? `hace ${Math.abs(detalle.diasRestantes)} días` : `faltan ${detalle.diasRestantes} días`)
      return { id: v.id, patente: v.patente, marca: v.marca, modelo: v.modelo, estado, detalle: partes.join(' · ') }
    }),
  )
  filas.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.patente.localeCompare(b.patente, 'es'))

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <BackLink />
      <h1 className="mb-4 mt-5 text-2xl font-bold tracking-tight text-tinta">Mantención de la flota</h1>
      <div className="space-y-2">
        {filas.map((f) => (
          <Link key={f.id} href={`/vehiculos/${f.id}#mantencion`} className="flex items-center justify-between gap-3 rounded-2xl border border-linea bg-superficie p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="min-w-0">
              <p className="truncate font-semibold text-tinta">{f.marca} {f.modelo} · {f.patente}</p>
              {f.detalle && <p className="truncate text-sm text-acero">{f.detalle}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[f.estado].cls}`}>{BADGE[f.estado].label}</span>
          </Link>
        ))}
        {filas.length === 0 && <p className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-10 text-center text-sm text-acero">Aún no hay vehículos.</p>}
      </div>
    </main>
  )
}
