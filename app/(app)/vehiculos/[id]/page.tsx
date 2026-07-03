import { notFound, redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { documentStatus } from '@/lib/documents/status'
import { createReadUrl } from '@/lib/storage/signedUrls'
import BackLink from '@/components/BackLink'
import DocumentForm from '@/components/DocumentForm'
import DocumentList from '@/components/DocumentList'
import NfcTokenPanel from '@/components/NfcTokenPanel'
import VehicleInfoForm from '@/components/VehicleInfoForm'
import VehicleInfoView from '@/components/VehicleInfoView'
import DeleteVehicleButton from '@/components/DeleteVehicleButton'

export const dynamic = 'force-dynamic'

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) redirect('/login')
  const vehicle = await getVehicle(id)
  if (!vehicle || vehicle.companyId !== m.companyId) notFound()

  const canEditDocs = can(m.role, 'document:write')
  const canManageVehicle = can(m.role, 'vehicle:write')

  const now = new Date()
  const docs = await listDocuments(vehicle.id)
  const items = await Promise.all(
    docs.map(async (d) => ({
      ...d,
      status: documentStatus(d.fechaVencimiento, now),
      readUrl: d.filePath ? await createReadUrl(d.filePath) : null,
    })),
  )

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
        </div>
      </div>

      <NfcTokenPanel vehicleId={vehicle.id} initialUrl={publicUrl} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-tinta">Documentos</h2>
        {canEditDocs && <DocumentForm vehicleId={vehicle.id} />}
        <DocumentList documents={items} vehicleId={vehicle.id} canEdit={canEditDocs} />
      </section>

      {canManageVehicle ? (
        <VehicleInfoForm vehicleId={vehicle.id} initial={vehicle.info ?? {}} />
      ) : (
        <VehicleInfoView info={vehicle.info ?? {}} />
      )}

      {canManageVehicle && (
        <DeleteVehicleButton
          vehicleId={vehicle.id}
          label={`${vehicle.marca} ${vehicle.modelo} · ${vehicle.patente}`}
        />
      )}
    </main>
  )
}
