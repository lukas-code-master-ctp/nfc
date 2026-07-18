import { notFound, redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { listUsages } from '@/lib/data/usages'
import { getCompany } from '@/lib/data/companies'
import { listMantenciones, ultimaMantencion } from '@/lib/data/mantenciones'
import { documentStatus } from '@/lib/documents/status'
import { estadoMantencion } from '@/lib/mantencion/status'
import { createReadUrl } from '@/lib/storage/signedUrls'
import BackLink from '@/components/BackLink'
import DocumentForm from '@/components/DocumentForm'
import DocumentList from '@/components/DocumentList'
import NfcTokenPanel from '@/components/NfcTokenPanel'
import VehicleInfoForm from '@/components/VehicleInfoForm'
import VehicleInfoView from '@/components/VehicleInfoView'
import DeleteVehicleButton from '@/components/DeleteVehicleButton'
import BitacoraUso from '@/components/vehicle/BitacoraUso'
import CategoriaSelector from '@/components/vehicle/CategoriaSelector'
import MantencionPanel from '@/components/vehicle/MantencionPanel'
import DanoActivoPanel from '@/components/vehicle/DanoActivoPanel'
import ConsumoBencinaPanel from '@/components/vehicle/ConsumoBencinaPanel'
import VehicleTabs from '@/components/vehicle/VehicleTabs'

export const dynamic = 'force-dynamic'

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) redirect('/login')
  const vehicle = await getVehicle(id)
  if (!vehicle || vehicle.companyId !== m.companyId) notFound()

  const canEditDocs = can(m.role, 'document:write')
  const canManageVehicle = can(m.role, 'vehicle:write')

  const company = await getCompany(m.companyId)
  const categorias = company?.categorias ?? []

  const now = new Date()
  const docs = await listDocuments(vehicle.id)
  const items = await Promise.all(
    docs.map(async (d) => ({
      ...d,
      status: documentStatus(d.fechaVencimiento, now),
      readUrl: d.filePath ? await createReadUrl(d.filePath) : null,
    })),
  )

  const usos = await Promise.all(
    (await listUsages(vehicle.id)).map(async (u) => ({
      id: u.id,
      driverNombre: u.driverNombre,
      tomadoEn: u.tomadoEn,
      entregadoEn: u.entregadoEn,
      estado: u.estado,
      cierreForzado: u.cierreForzado,
      entregadoPorNombre: u.entregadoPorNombre,
      dano: u.dano ? { hay: u.dano.hay, nota: u.dano.nota, revisadoPorNombre: u.dano.revisadoPorNombre, revisadoEn: u.dano.revisadoEn } : undefined,
      fotoTableroUrl: u.fotos?.tablero ? await createReadUrl(u.fotos.tablero) : null,
      fotoCabinaUrl: u.fotos?.cabina ? await createReadUrl(u.fotos.cabina) : null,
      bencina: u.bencina ?? null,
      km: u.km ?? null,
      limpieza: u.limpieza ?? null,
      iaAnalizadoEn: u.iaAnalizadoEn,
      datosConfirmados: u.datosConfirmados,
    })),
  )

  const [mantenciones, ultima] = await Promise.all([
    listMantenciones(vehicle.id),
    ultimaMantencion(vehicle.id),
  ])
  const mantencionesConUrl = await Promise.all(
    mantenciones.map(async (mt) => ({
      id: mt.id, fecha: mt.fecha, km: mt.km, nota: mt.nota ?? null,
      fileUrl: mt.filePath ? await createReadUrl(mt.filePath) : null,
    })),
  )
  const pautaEfectiva = vehicle.pautaMantencion ?? company?.pautaMantencion ?? null
  const esOverride = vehicle.pautaMantencion != null
  const estado = estadoMantencion({ pauta: pautaEfectiva, ultima, kmActual: vehicle.kmActual ?? null, now })

  const danoFotoUrl = vehicle.danoActivo?.fotoPath ? await createReadUrl(vehicle.danoActivo.fotoPath) : null

  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const publicUrl = `${base}/v/${vehicle.publicToken}`

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <BackLink />

      <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-7" aria-hidden="true">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
            <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
          </svg>
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-tinta">
            {vehicle.marca} {vehicle.modelo} · {vehicle.patente}
          </h1>
          <p className="text-sm text-acero">{vehicle.anio} · {vehicle.color}</p>
          {/* Sin lectura de km no se muestra nada (el espacio queda limpio). */}
          {typeof vehicle.kmActual === 'number' && (
            <p className="mt-0.5 text-sm text-acero">
              Kilometraje: <span className="font-medium text-tinta">{vehicle.kmActual.toLocaleString('es-CL')} km</span>
              {vehicle.kmActualizadoEn && (
                <span className="text-xs"> · actualizado el {new Date(vehicle.kmActualizadoEn).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}</span>
              )}
            </p>
          )}
          {categorias.length > 0 && (
            canManageVehicle ? (
              <div className="mt-2">
                <CategoriaSelector vehicleId={vehicle.id} categoriaId={vehicle.categoriaId ?? null} categorias={categorias} />
              </div>
            ) : (
              vehicle.categoriaId && categorias.find((c) => c.id === vehicle.categoriaId) && (
                <p className="mt-2 text-sm text-acero">Categoría: <span className="font-medium text-tinta">{categorias.find((c) => c.id === vehicle.categoriaId)!.nombre}</span></p>
              )
            )
          )}
        </div>
      </div>

      <VehicleTabs
        documentos={
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-tinta">Documentos</h2>
            {canEditDocs && <DocumentForm vehicleId={vehicle.id} />}
            <DocumentList documents={items} vehicleId={vehicle.id} canEdit={canEditDocs} />
          </section>
        }
        vehiculo={
          <div className="space-y-6">
            {canManageVehicle ? (
              <VehicleInfoForm vehicleId={vehicle.id} initial={vehicle.info ?? {}} />
            ) : (
              <VehicleInfoView info={vehicle.info ?? {}} />
            )}
            {/* Ancla para el enlace #mantencion desde la card del dashboard. */}
            <div id="mantencion" className="scroll-mt-20">
              <MantencionPanel
                vehicleId={vehicle.id}
                estado={estado.estado}
                detalle={estado.detalle}
                pautaEfectiva={pautaEfectiva}
                esOverride={esOverride}
                pautaEstandar={company?.pautaMantencion ?? null}
                kmActual={vehicle.kmActual ?? null}
                mantenciones={mantencionesConUrl}
                puedeRegistrar={canEditDocs}
                puedeConfigurar={canManageVehicle}
              />
            </div>
            <DanoActivoPanel
              vehicleId={vehicle.id}
              danoActivo={vehicle.danoActivo ?? null}
              danoFotoUrl={danoFotoUrl}
              puedeGestionar={canManageVehicle}
            />
            <ConsumoBencinaPanel
              vehicleId={vehicle.id}
              initial={vehicle.consumo ?? null}
              puedeEditar={canManageVehicle}
            />
          </div>
        }
        bitacora={<BitacoraUso usos={usos} puedeEditar={canEditDocs} consumoParams={vehicle.consumo ?? null} />}
        ajustes={
          <div className="space-y-6">
            <NfcTokenPanel vehicleId={vehicle.id} initialUrl={publicUrl} />
            {canManageVehicle && (
              <DeleteVehicleButton
                vehicleId={vehicle.id}
                label={`${vehicle.marca} ${vehicle.modelo} · ${vehicle.patente}`}
              />
            )}
          </div>
        }
      />
    </main>
  )
}
