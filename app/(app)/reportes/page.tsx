import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { listDrivers } from '@/lib/data/drivers'
import { listVehicles } from '@/lib/data/vehicles'
import { listUsagesByCompany } from '@/lib/data/usages'
import { contarConsumoAnomaloPorConductor } from '@/lib/usages/consumo'
import BackLink from '@/components/BackLink'
import ReporteConductores from '@/components/reportes/ReporteConductores'
import BitacoraFlota from '@/components/reportes/BitacoraFlota'

export const dynamic = 'force-dynamic'

export default async function ReportesPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  const [drivers, vehicles, usos] = await Promise.all([
    listDrivers(m.companyId),
    listVehicles(m.companyId),
    listUsagesByCompany(m.companyId),
  ])

  const paramsPorVehiculo = new Map(vehicles.map((v) => [v.id, v.consumo ?? null]))
  const consumoPorConductor = contarConsumoAnomaloPorConductor(
    usos.map((u) => ({ vehicleId: u.vehicleId, driverId: u.driverId, tomadoEn: u.tomadoEn, km: u.km ?? null, bencina: u.bencina ?? null })),
    paramsPorVehiculo,
  )

  const filas = drivers
    .map((d) => ({
      id: d.id,
      nombre: d.nombre,
      usos: d.stats?.usos ?? 0,
      danos: d.stats?.danos ?? 0,
      sinEntrega: d.stats?.sinEntrega ?? 0,
      consumoAnomalo: consumoPorConductor.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.danos - a.danos || b.sinEntrega - a.sinEntrega || b.consumoAnomalo - a.consumoAnomalo)

  const conductores = drivers.map((d) => ({ id: d.id, nombre: d.nombre }))
  const vehiculos = vehicles
    .map((v) => ({ id: v.id, patente: v.patente }))
    .sort((a, b) => a.patente.localeCompare(b.patente))

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-bold tracking-tight text-tinta">Reportes</h1>
      <ReporteConductores filas={filas} />
      <BitacoraFlota conductores={conductores} vehiculos={vehiculos} />
    </main>
  )
}
