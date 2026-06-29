import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { isAdminEmail } from '@/lib/auth/admin'
import { listAllUsers } from '@/lib/data/admin'
import BackLink from '@/components/BackLink'
import AdminUsersTable from '@/components/admin/AdminUsersTable'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  // Falla cerrado: si no es admin, la ruta no existe para él.
  if (!isAdminEmail(user.email)) notFound()

  const users = await listAllUsers()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <BackLink />
      <div className="mb-6 mt-5">
        <h1 className="text-2xl font-bold tracking-tight text-tinta">Administración</h1>
        <p className="mt-1 text-sm text-acero">
          {users.length} {users.length === 1 ? 'usuario' : 'usuarios'} · configura el cupo de vehículos del plan de cada uno.
        </p>
      </div>
      <AdminUsersTable users={users} />
    </main>
  )
}
