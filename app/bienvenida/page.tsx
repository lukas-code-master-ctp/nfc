import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { debeElegirTipo } from '@/lib/onboarding/pasos'
import ElegirTipo from '@/components/onboarding/ElegirTipo'
import { TapCarIsotipo, TapCarWordmark } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

export default async function BienvenidaPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  // Quien ya eligió (o no le corresponde elegir, como un Editor invitado) no
  // tiene nada que hacer acá. Sin esta guarda la página sería un callejón.
  const company = await getCompany(m.companyId)
  if (!debeElegirTipo(company?.onboarding, can(m.role, 'billing:manage'))) redirect('/dashboard')

  return (
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <TapCarIsotipo className="mx-auto mb-2 size-14" />
          <TapCarWordmark className="text-3xl" />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-tinta">¿Cómo vas a usar TapCar?</h1>
          <p className="mt-1 text-sm text-acero">Con esto armamos tu guía de configuración.</p>
        </div>
        <ElegirTipo />
      </div>
    </main>
  )
}
