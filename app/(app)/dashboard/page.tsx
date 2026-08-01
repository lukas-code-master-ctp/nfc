import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { listVehicles } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { getCompany } from '@/lib/data/companies'
import { documentStatus } from '@/lib/documents/status'
import { maxVehiculosDe, debeElegirPlan } from '@/lib/plan'
import VehiclesBoard from '@/components/VehiclesBoard'
import { listAlertas } from '@/lib/data/alertas'
import { listPendientesPara, listPendientesDe } from '@/lib/data/transferencias'
import { DEFAULT_AVISO_USO_HORAS } from '@/lib/types'
import { usoProlongado, horasEnUso } from '@/lib/usages/prolongado'
import type { Categoria } from '@/lib/types'
import { ultimaMantencion } from '@/lib/data/mantenciones'
import { estadoMantencion } from '@/lib/mantencion/status'
import { resolverResumen } from '@/lib/vehicles/resumen'
import { after } from 'next/server'
import { saveOnboarding } from '@/lib/data/companies'
import { cargarSenales } from '@/lib/onboarding/cargar'
import { debeElegirTipo, debeMostrarTarjeta, pasosDe, todosListos, type Paso } from '@/lib/onboarding/pasos'
import { estadoPrueba } from '@/lib/plan/prueba'

export const dynamic = 'force-dynamic'
// El `after()` que estampa `completadoEn` corre después de responder, pero sigue
// contando contra el límite de ejecución: por eso el tope va explícito, igual
// que en las rutas de tomar/entregar.
export const maxDuration = 30

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

  // El portero vive acá y no en el layout de (app) a propósito: el layout
  // envuelve las nueve páginas, así que la comprobación costaría una lectura
  // extra de Firestore en cada navegación, para siempre. El dashboard ya leyó
  // la empresa, así que acá sale gratis.
  const puedeConfigurar = can(m.role, 'billing:manage')
  if (debeElegirTipo(company?.onboarding, puedeConfigurar)) redirect('/bienvenida')

  // Segunda puerta, misma razón que la primera: acá la empresa ya está leída.
  // Solo aplica al Administrador y solo con `periodicidad === null` explícito,
  // así que ninguna cuenta anterior al selector se topa con esta pantalla.
  if (puedeConfigurar && debeElegirPlan(company?.plan)) redirect('/plan')

  const limit = maxVehiculosDe(company?.plan)
  const avisoUsoHoras = company?.avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS
  const categorias: Categoria[] = company?.categorias ?? []
  const nombrePorCategoria = new Map(categorias.map((c) => [c.id, c.nombre]))
  const danoPorVehiculo = new Map<string, string>() // vehicleId -> usageId
  for (const a of alertas) if (a.tipo === 'dano') danoPorVehiculo.set(a.vehicleId, a.usageId)
  const conTransferencia = new Set(salientes.map((t) => t.vehicleId))

  const now = new Date()
  // El destino depende de si la cuenta llegó a elegir plan alguna vez: una
  // anterior al selector todavía no tiene qué revisar en Facturación.
  const prueba = {
    ...estadoPrueba(company?.plan?.gratisHasta, now),
    destino: company?.plan?.periodicidad ? '/facturacion' : '/plan',
  }
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

  // El checklist se deriva de los datos, así que solo se calcula mientras el
  // onboarding sigue vivo. `completadoEn` engancha el final: sin él, estas
  // consultas se pagarían en cada carga del dashboard para siempre.
  let pasos: Paso[] | null = null
  const onboarding = company?.onboarding
  if (onboarding?.tipoCuenta && debeMostrarTarjeta(onboarding, puedeConfigurar)) {
    const senales = await cargarSenales({
      companyId: m.companyId,
      company,
      tipoCuenta: onboarding.tipoCuenta,
      vehiculos: vehicles.length,
      // De los items ya resueltos y NO de `v.resumenDocs` directo: un vehículo
      // creado antes del feature de resúmenes tiene el campo ausente, y es
      // `resolverResumen` quien cubre ese caso.
      documentos: items.reduce((n, i) => n + i.docCount, 0),
      primerVehiculoId: vehicles[0]?.id ?? null,
      vistos: onboarding.vistos ?? [],
    })
    pasos = pasosDe(onboarding.tipoCuenta, senales)
    if (todosListos(pasos)) {
      const companyId = m.companyId
      after(async () => {
        try {
          await saveOnboarding(companyId, { completadoEn: new Date().toISOString() })
        } catch (e) {
          // Best-effort, como los refrescos de resumen: si falla, la próxima
          // carga vuelve a calcular y lo intenta de nuevo.
          console.error('marcar onboarding completo', e)
        }
      })
    }
  }

  return (
    <VehiclesBoard
      items={items}
      limit={limit}
      canWrite={can(m.role, 'vehicle:write')}
      categorias={categorias}
      entrantes={entrantes.map((t) => ({ token: t.token, patente: t.patente, deCompanyNombre: t.deCompanyNombre }))}
      onboarding={pasos && onboarding?.tipoCuenta ? { pasos, tipoCuenta: onboarding.tipoCuenta } : null}
      prueba={prueba}
    />
  )
}
