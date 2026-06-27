import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { getVehicle } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { documentStatus } from '@/lib/documents/status'
import { createReadUrl } from '@/lib/storage/signedUrls'
import DocumentForm from '@/components/DocumentForm'
import DocumentList from '@/components/DocumentList'
import NfcTokenPanel from '@/components/NfcTokenPanel'

export const dynamic = 'force-dynamic'

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const vehicle = await getVehicle(id)
  if (!vehicle || vehicle.ownerUid !== user.uid) notFound()

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
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">{vehicle.patente}</h1>
        <p className="text-gray-600">{vehicle.marca} {vehicle.modelo} · {vehicle.anio} · {vehicle.color}</p>
      </div>
      <NfcTokenPanel vehicleId={vehicle.id} initialUrl={publicUrl} />
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Documentos</h2>
          <DocumentForm vehicleId={vehicle.id} />
        </div>
        <DocumentList documents={items} vehicleId={vehicle.id} />
      </section>
    </main>
  )
}
