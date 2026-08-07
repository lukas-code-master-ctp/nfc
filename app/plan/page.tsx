import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { maxVehiculosDe } from '@/lib/plan'
import { hoyEnChile } from '@/lib/documents/status'
import SelectorPlan from '@/components/plan/SelectorPlan'
import { TapCarIsotipo, TapCarWordmark } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const m = await getMembership()
  if (!m) redirect('/login')
  // Un Editor o Visor no contrata nada.
  if (!can(m.role, 'billing:manage')) redirect('/dashboard')

  const company = await getCompany(m.companyId)
  // Guarda propia para no ser un callejón: quien ya eligió va a Facturación,
  // que es donde se piden los cambios de plan. Una cuenta anterior al selector
  // (periodicidad ausente) SÍ puede entrar acá voluntariamente.
  if (company?.plan?.periodicidad) redirect('/facturacion')

  // Cuenta nueva (`periodicidad === null`, sembrado por `createCompany`):
  // parte de la heurística por tipo de cuenta, todavía no hay cupo real que
  // respetar. Cuenta anterior al selector (`periodicidad` ausente): ya tiene
  // un `maxVehiculos` real, puesto por un admin de plataforma o acumulado con
  // el uso — partir de 3 la dejaría por debajo de su propio cupo (ver C1).
  const inicial =
    company?.plan?.periodicidad === null
      ? company?.onboarding?.tipoCuenta === 'personal'
        ? 1
        : 3
      : maxVehiculosDe(company?.plan)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <div className="w-full max-w-md py-8">
        <div className="mb-6 text-center">
          <TapCarIsotipo className="mx-auto mb-2 size-14" />
          <TapCarWordmark className="text-3xl" />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-tinta">Arma tu plan</h1>
          <p className="mt-1 text-sm text-acero">Puedes cambiarlo después desde Facturación.</p>
        </div>
        <SelectorPlan inicial={inicial} hoy={hoyEnChile(new Date())} />
      </div>
    </main>
  )
}
