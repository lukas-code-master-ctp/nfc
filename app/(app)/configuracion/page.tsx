import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { EMPTY_COMPANY } from '@/lib/types'
import BackLink from '@/components/BackLink'
import CompanyCard from '@/components/company/CompanyCard'
import TeamCard from '@/components/company/TeamCard'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  const company = await getCompany(m.companyId)
  const esAdmin = can(m.role, 'billing:manage')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <BackLink />
      <h1 className="mb-4 mt-5 text-2xl font-bold tracking-tight text-tinta">Configuración</h1>

      {esAdmin ? (
        <CompanyCard initial={company?.company ?? EMPTY_COMPANY} />
      ) : (
        <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-tinta">Datos de la empresa</h2>
          <p className="mt-1 text-sm text-acero">
            Solo un administrador de la empresa puede editar estos datos.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-acero">Razón social</dt>
              <dd className="font-medium text-tinta">{company?.company.razonSocial || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-acero">RUT</dt>
              <dd className="font-medium text-tinta">{company?.company.rut || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-acero">Giro</dt>
              <dd className="font-medium text-tinta">{company?.company.giro || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-acero">Dirección</dt>
              <dd className="font-medium text-tinta">{company?.company.direccion || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-acero">Teléfono</dt>
              <dd className="font-medium text-tinta">{company?.company.telefono || '—'}</dd>
            </div>
          </dl>
        </section>
      )}

      {esAdmin && <TeamCard />}
    </main>
  )
}
