import { notFound, redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { getTransferenciaByToken } from '@/lib/data/transferencias'
import { transferenciaVigente } from '@/lib/transferencias/estado'
import BackLink from '@/components/BackLink'
import AceptarTransferencia from '@/components/transferencias/AceptarTransferencia'

export const dynamic = 'force-dynamic'

export default async function TransferenciaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const m = await getMembership()
  if (!m) redirect('/login')

  const t = await getTransferenciaByToken(token)
  if (!t) notFound()

  const vigente = transferenciaVigente(t, new Date().toISOString())
  const esParaMi = m.email.trim().toLowerCase() === t.paraEmail
  const empresa = t.deCompanyNombre.trim() || 'Otra empresa'

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <BackLink href="/dashboard" label="Volver al dashboard" />

      <div className="rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-tinta">Transferencia de vehículo</h1>
        <p className="mt-2 text-base text-acero">
          <strong className="text-tinta">{empresa}</strong> quiere transferirte el vehículo{' '}
          <strong className="text-tinta">{t.patente}</strong>.
        </p>

        {!vigente ? (
          <p className="mt-4 rounded-lg bg-lienzo px-4 py-3 text-sm text-acero">
            {t.status === 'aceptada'
              ? 'Esta transferencia ya fue aceptada.'
              : t.status === 'cancelada'
                ? 'Esta transferencia fue cancelada por quien la envió.'
                : 'Esta transferencia venció. Pídele al dueño que la envíe de nuevo.'}
          </p>
        ) : !esParaMi ? (
          <p className="mt-4 rounded-lg bg-lienzo px-4 py-3 text-sm text-acero">
            Esta transferencia es para <strong className="text-tinta">{t.paraEmail}</strong> y tu sesión es{' '}
            <strong className="text-tinta">{m.email}</strong>. Entra con la cuenta correcta para aceptarla.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-acero">
              Al aceptar, el vehículo pasa a tu flota con sus documentos y su historial de mantenciones, y ocupa
              un cupo de tu plan. La bitácora de usos se queda con el dueño anterior.
            </p>
            <div className="mt-5">
              <AceptarTransferencia token={token} />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
