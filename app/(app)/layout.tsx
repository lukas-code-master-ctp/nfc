import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import UserMenu from '@/components/UserMenu'
import { TapCarIsotipo, TapCarWordmark } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-linea bg-superficie/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2" aria-label="TapCar — ir al inicio">
            <TapCarIsotipo className="size-8" />
            <TapCarWordmark className="hidden text-xl sm:inline" />
          </Link>
          <UserMenu email={user.email} />
        </div>
      </header>
      {children}
    </div>
  )
}
