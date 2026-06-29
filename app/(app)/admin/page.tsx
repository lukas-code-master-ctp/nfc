import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { isAdminEmail } from '@/lib/auth/admin'
import { listAllUsers } from '@/lib/data/admin'
import { PRICE_PER_VEHICLE, monthlyTotal, formatCLP } from '@/lib/billing'
import BackLink from '@/components/BackLink'
import AdminUsersTable from '@/components/admin/AdminUsersTable'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  // Falla cerrado: si no es admin, la ruta no existe para él.
  if (!isAdminEmail(user.email)) notFound()

  const users = await listAllUsers()
  const totalVehiculos = users.reduce((sum, u) => sum + u.maxVehiculos, 0)
  const recaudacion = monthlyTotal(totalVehiculos)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <BackLink />
      <div className="mb-6 mt-5">
        <h1 className="text-2xl font-bold tracking-tight text-tinta">Administración</h1>
        <p className="mt-1 text-sm text-acero">
          {users.length} {users.length === 1 ? 'usuario' : 'usuarios'} · configura el cupo de vehículos del plan de cada uno.
        </p>
      </div>

      <section className="mb-6 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <p className="text-sm text-acero">Recaudación mensual estimada</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-tinta">{formatCLP(recaudacion)}</p>
        <p className="mt-1 text-xs text-acero">
          {totalVehiculos} {totalVehiculos === 1 ? 'vehículo' : 'vehículos'} en planes × {formatCLP(PRICE_PER_VEHICLE)} / mes
        </p>
      </section>

      <AdminUsersTable users={users} />
    </main>
  )
}
