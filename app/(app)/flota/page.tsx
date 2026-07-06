import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { listVehicles } from '@/lib/data/vehicles'
import { listAlertas } from '@/lib/data/alertas'
import { getCompany } from '@/lib/data/companies'
import { DEFAULT_AVISO_USO_HORAS } from '@/lib/types'
import { usoProlongado, horasEnUso } from '@/lib/usages/prolongado'
import BackLink from '@/components/BackLink'
import FlotaGrid from '@/components/flota/FlotaGrid'
import AlertasBandeja from '@/components/flota/AlertasBandeja'

export const dynamic = 'force-dynamic'

export default async function FlotaPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  const [vehicles, alertas, company] = await Promise.all([
    listVehicles(m.companyId),
    listAlertas(m.companyId),
    getCompany(m.companyId),
  ])
  const avisoUsoHoras = company?.avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS
  const now = new Date()
  const puedeAtender = can(m.role, 'document:write')

  const alertasPorVehiculo = new Map<string, ('dano' | 'sin_entrega')[]>()
  for (const a of alertas) {
    const arr = alertasPorVehiculo.get(a.vehicleId) ?? []
    arr.push(a.tipo)
    alertasPorVehiculo.set(a.vehicleId, arr)
  }

  const vehiculos = vehicles
    .slice()
    .sort((a, b) => a.patente.localeCompare(b.patente))
    .map((v) => {
      const uso = v.usoActual ?? null
      return {
        id: v.id,
        patente: v.patente,
        marca: v.marca,
        modelo: v.modelo,
        usoActual: uso,
        tiposAlerta: alertasPorVehiculo.get(v.id) ?? [],
        prolongado: uso ? usoProlongado(uso.tomadoEn, avisoUsoHoras, now) : false,
        horasUso: uso ? Math.floor(horasEnUso(uso.tomadoEn, now)) : 0,
      }
    })

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-bold tracking-tight text-tinta">Flota</h1>
      <FlotaGrid vehiculos={vehiculos} />
      <AlertasBandeja alertas={alertas} puedeAtender={puedeAtender} />
    </main>
  )
}
