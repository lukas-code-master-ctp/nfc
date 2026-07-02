import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { isAdminEmail } from '@/lib/auth/admin'
import { listAllCompanies } from '@/lib/data/admin'
import { PRICE_PER_VEHICLE, monthlyTotal, formatCLP } from '@/lib/billing'
import BackLink from '@/components/BackLink'
import AdminCompaniesTable from '@/components/admin/AdminCompaniesTable'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  // Falla cerrado: si no es admin, la ruta no existe para él.
  if (!isAdminEmail(user.email)) notFound()

  const companies = await listAllCompanies()
  const totalVehiculos = companies.reduce((sum, c) => sum + c.maxVehiculos, 0)
  const recaudacion = monthlyTotal(totalVehiculos)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <BackLink />
      <div className="mb-6 mt-5">
        <h1 className="text-2xl font-bold tracking-tight text-tinta">Administración</h1>
        <p className="mt-1 text-sm text-acero">
          {companies.length} {companies.length === 1 ? 'empresa' : 'empresas'} · configura el cupo de vehículos del plan de cada una.
        </p>
      </div>

      <section className="mb-6 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <p className="text-sm text-acero">Recaudación mensual estimada</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-tinta">{formatCLP(recaudacion)}</p>
        <p className="mt-1 text-xs text-acero">
          {totalVehiculos} {totalVehiculos === 1 ? 'vehículo' : 'vehículos'} en planes × {formatCLP(PRICE_PER_VEHICLE)} / mes
        </p>
      </section>

      <AdminCompaniesTable companies={companies} />
    </main>
  )
}
