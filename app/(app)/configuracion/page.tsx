import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import BackLink from '@/components/BackLink'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <BackLink />
      <h1 className="mb-4 mt-5 text-2xl font-bold tracking-tight text-tinta">Configuración</h1>
      <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-12 text-center">
        <p className="font-medium text-tinta">Próximamente</p>
        <p className="mt-1 text-sm text-acero">Aquí podrás ajustar las preferencias de tu cuenta.</p>
      </div>
    </main>
  )
}
