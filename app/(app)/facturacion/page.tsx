import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { getProfile } from '@/lib/data/profile'
import { listVehicles } from '@/lib/data/vehicles'
import { maxVehiculos } from '@/lib/plan'
import {
  PRICE_PER_VEHICLE,
  TAG_PRICE,
  FREE_TAG_THRESHOLD,
  monthlyTotal,
  tagIncluded,
  formatCLP,
} from '@/lib/billing'
import BackLink from '@/components/BackLink'
import BillingRequestForm from '@/components/billing/BillingRequestForm'

export const dynamic = 'force-dynamic'

export default async function FacturacionPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [vehicles, profile] = await Promise.all([
    listVehicles(user.uid),
    getProfile(user.uid, user.email),
  ])
  const cupo = maxVehiculos(profile)
  const used = vehicles.length
  const total = monthlyTotal(cupo)
  const tagFree = tagIncluded(cupo)

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
      <BackLink />
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-tinta">Facturación</h1>

      <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-tinta">Tu plan</h2>
            <p className="mt-0.5 text-sm text-acero">Suscripción por vehículo</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight text-tinta">{formatCLP(total)}</p>
            <p className="text-xs text-acero">/ mes</p>
          </div>
        </div>

        <dl className="mt-4 space-y-2 border-t border-linea pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-acero">Vehículos en tu plan</dt>
            <dd className="font-medium text-tinta tabular-nums">{cupo}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-acero">En uso</dt>
            <dd className="font-medium text-tinta tabular-nums">{used} de {cupo}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-acero">Valor por vehículo</dt>
            <dd className="font-medium text-tinta tabular-nums">{formatCLP(PRICE_PER_VEHICLE)} / mes</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-tinta">Tag NFC</h2>
        {tagFree ? (
          <p className="mt-1 text-sm text-acero">
            Tu plan ({cupo} vehículos) <strong className="text-tinta">incluye el tag NFC</strong>. Al sumar un
            vehículo, pagas solo el envío.
          </p>
        ) : (
          <p className="mt-1 text-sm text-acero">
            En planes de menos de {FREE_TAG_THRESHOLD} vehículos, cada tag NFC cuesta{' '}
            <strong className="text-tinta">{formatCLP(TAG_PRICE)} + envío</strong>. Desde {FREE_TAG_THRESHOLD}{' '}
            vehículos el tag va incluido (pagas solo el envío).
          </p>
        )}
      </section>

      <p className="rounded-xl bg-azul/5 px-4 py-3 text-sm text-acero">
        Estamos en marcha blanca: por ahora coordinamos el pago y la <strong className="text-tinta">factura
        electrónica</strong> contigo directamente. Envíanos tu solicitud y te contactamos.
      </p>

      <BillingRequestForm currentCupo={cupo} />
    </main>
  )
}
