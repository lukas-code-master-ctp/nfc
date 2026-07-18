import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { listVehicles } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { getCompany } from '@/lib/data/companies'
import { documentStatus, worstStatus, type DocStatus } from '@/lib/documents/status'
import { maxVehiculosDe } from '@/lib/plan'
import VehiclesBoard from '@/components/VehiclesBoard'
import { listAlertas } from '@/lib/data/alertas'
import { DEFAULT_AVISO_USO_HORAS } from '@/lib/types'
import { usoProlongado, horasEnUso } from '@/lib/usages/prolongado'
import type { Categoria } from '@/lib/types'
import { ultimaMantencion } from '@/lib/data/mantenciones'
import { estadoMantencion } from '@/lib/mantencion/status'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  const [vehicles, company, alertas] = await Promise.all([
    listVehicles(m.companyId),
    getCompany(m.companyId),
    listAlertas(m.companyId),
  ])
  const limit = maxVehiculosDe(company?.plan)
  const avisoUsoHoras = company?.avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS
  const categorias: Categoria[] = company?.categorias ?? []
  const nombrePorCategoria = new Map(categorias.map((c) => [c.id, c.nombre]))
  const danoPorVehiculo = new Map<string, string>() // vehicleId -> usageId
  for (const a of alertas) if (a.tipo === 'dano') danoPorVehiculo.set(a.vehicleId, a.usageId)

  const now = new Date()
  const items = await Promise.all(
    vehicles.map(async (v) => {
      const docs = await listDocuments(v.id)
      const statuses: DocStatus[] = docs.map((d) => documentStatus(d.fechaVencimiento, now))
      const uso = v.usoActual ?? null
      const pauta = v.pautaMantencion ?? company?.pautaMantencion ?? null
      const ultima = await ultimaMantencion(v.id)
      const em = estadoMantencion({ pauta, ultima, kmActual: v.kmActual ?? null, now })
      const mantPartes: string[] = []
      if (em.detalle.kmRestantes != null) mantPartes.push(em.detalle.kmRestantes <= 0 ? `pasada ${Math.abs(em.detalle.kmRestantes).toLocaleString('es-CL')} km` : `faltan ${em.detalle.kmRestantes.toLocaleString('es-CL')} km`)
      if (em.detalle.diasRestantes != null) mantPartes.push(em.detalle.diasRestantes < 0 ? `hace ${Math.abs(em.detalle.diasRestantes)} días` : `faltan ${em.detalle.diasRestantes} días`)
      return {
        vehicle: v,
        status: worstStatus(statuses),
        docCount: docs.length,
        prolongado: uso ? usoProlongado(uso.tomadoEn, avisoUsoHoras, now) : false,
        horasUso: uso ? Math.floor(horasEnUso(uso.tomadoEn, now)) : 0,
        danoUsageId: danoPorVehiculo.get(v.id) ?? null,
        categoriaId: v.categoriaId ?? null,
        categoriaNombre: v.categoriaId ? (nombrePorCategoria.get(v.categoriaId) ?? null) : null,
        danoActivo: v.danoActivo != null,
        mantencion: em.estado,
        mantencionDetalle: mantPartes.join(' · '),
      }
    }),
  )

  return <VehiclesBoard items={items} limit={limit} canWrite={can(m.role, 'vehicle:write')} categorias={categorias} />
}
