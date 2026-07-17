import { notFound } from 'next/navigation'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { documentStatus } from '@/lib/documents/status'
import { createReadUrl } from '@/lib/storage/signedUrls'
import { getOpenUsage } from '@/lib/data/usages'
import { listActiveDrivers } from '@/lib/data/drivers'
import PublicVehicleView from '@/components/PublicVehicleView'

export const dynamic = 'force-dynamic'

export default async function PublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const vehicle = await getVehicleByToken(token)
  if (!vehicle) notFound()

  const now = new Date()
  const docs = await listDocuments(vehicle.id)
  const items = await Promise.all(
    docs.map(async (d) => ({
      ...d,
      status: documentStatus(d.fechaVencimiento, now),
      readUrl: d.filePath ? await createReadUrl(d.filePath) : null,
    })),
  )

  const [openUsage, drivers] = await Promise.all([
    getOpenUsage(vehicle.id),
    listActiveDrivers(vehicle.companyId),
  ])
  const enUso = openUsage ? { driverNombre: openUsage.driverNombre, tomadoEn: openUsage.tomadoEn } : null
  const danoFotoUrl = vehicle.danoActivo?.fotoPath ? await createReadUrl(vehicle.danoActivo.fotoPath) : null

  return (
    <PublicVehicleView
      vehicle={vehicle}
      documents={items}
      token={token}
      drivers={drivers}
      enUso={enUso}
      danoFotoUrl={danoFotoUrl}
    />
  )
}
