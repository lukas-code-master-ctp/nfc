import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { getProfile } from '@/lib/data/profile'
import BackLink from '@/components/BackLink'
import AccountCard from '@/components/profile/AccountCard'
import CompanyCard from '@/components/profile/CompanyCard'
import SecurityCard from '@/components/profile/SecurityCard'
import DangerCard from '@/components/profile/DangerCard'

export const dynamic = 'force-dynamic'

export default async function PerfilPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getProfile(user.uid, user.email)

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-bold tracking-tight text-tinta">Perfil</h1>
      <AccountCard email={profile.email} initialName={profile.displayName} />
      <CompanyCard initial={profile.company} />
      <SecurityCard />
      <DangerCard />
    </main>
  )
}
