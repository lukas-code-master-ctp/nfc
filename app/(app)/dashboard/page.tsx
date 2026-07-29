import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { listVehicles } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { getCompany } from '@/lib/data/companies'
import { documentStatus } from '@/lib/documents/status'
import { maxVehiculosDe } from '@/lib/plan'
import VehiclesBoard from '@/components/VehiclesBoard'
import { listAlertas } from '@/lib/data/alertas'
import { listPendientesPara, listPendientesDe } from '@/lib/data/transferencias'
import { DEFAULT_AVISO_USO_HORAS } from '@/lib/types'
import { usoProlongado, horasEnUso } from '@/lib/usages/prolongado'
import type { Categoria } from '@/lib/types'
import { ultimaMantencion } from '@/lib/data/mantenciones'
import { estadoMantencion } from '@/lib/mantencion/status'
import { resolverResumen } from '@/lib/vehicles/resumen'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  const [vehicles, company, alertas, entrantes, salientes] = await Promise.all([
    listVehicles(m.companyId),
    getCompany(m.companyId),
    listAlertas(m.companyId),
    listPendientesPara(m.email),
    listPendientesDe(m.companyId),
  ])
  const limit = maxVehiculosDe(company?.plan)
  const avisoUsoHoras = company?.avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS
  const categorias: Categoria[] = company?.categorias ?? []
  const nombrePorCategoria = new Map(categorias.map((c) => [c.id, c.nombre]))
  const danoPorVehiculo = new Map<string, string>() // vehicleId -> usageId
  for (const a of alertas) if (a.tipo === 'dano') danoPorVehiculo.set(a.vehicleId, a.usageId)
  const conTransferencia = new Set(salientes.map((t) => t.vehicleId))

  const now = new Date()
  // Las cargas del fallback: solo se ejecutan para los vehículos que todavía no
  // tienen resumen guardado (creados antes del feature o saltados por el backfill).
  const cargas = {
    cargarDocumentos: listDocuments,
    cargarUltimaMantencion: ultimaMantencion,
  }

  const items = await Promise.all(
    vehicles.map(async (v) => {
      const { docs, ultimaMantencion: ultima } = await resolverResumen(v, cargas)
      const uso = v.usoActual ?? null
      const pauta = v.pautaMantencion ?? company?.pautaMantencion ?? null
      const em = estadoMantencion({ pauta, ultima, kmActual: v.kmActual ?? null, now })
      const mantPartes: string[] = []
      if (em.detalle.kmRestantes != null) mantPartes.push(em.detalle.kmRestantes <= 0 ? `pasada ${Math.abs(em.detalle.kmRestantes).toLocaleString('es-CL')} km` : `faltan ${em.detalle.kmRestantes.toLocaleString('es-CL')} km`)
      if (em.detalle.diasRestantes != null) mantPartes.push(em.detalle.diasRestantes < 0 ? `hace ${Math.abs(em.detalle.diasRestantes)} días` : `faltan ${em.detalle.diasRestantes} días`)
      return {
        vehicle: v,
        status: documentStatus(docs.proximoVencimiento, now),
        docCount: docs.total,
        prolongado: uso ? usoProlongado(uso.tomadoEn, avisoUsoHoras, now) : false,
        horasUso: uso ? Math.floor(horasEnUso(uso.tomadoEn, now)) : 0,
        danoUsageId: danoPorVehiculo.get(v.id) ?? null,
        categoriaId: v.categoriaId ?? null,
        categoriaNombre: v.categoriaId ? (nombrePorCategoria.get(v.categoriaId) ?? null) : null,
        danoActivo: v.danoActivo != null,
        mantencion: em.estado,
        mantencionDetalle: mantPartes.join(' · '),
        transferenciaPendiente: conTransferencia.has(v.id),
      }
    }),
  )

  return (
    <VehiclesBoard
      items={items}
      limit={limit}
      canWrite={can(m.role, 'vehicle:write')}
      categorias={categorias}
      entrantes={entrantes.map((t) => ({ token: t.token, patente: t.patente, deCompanyNombre: t.deCompanyNombre }))}
    />
  )
}
