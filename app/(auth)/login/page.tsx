import LoginForm from '@/components/LoginForm'
import InvitationBanner from '@/components/InvitationBanner'
import TransferenciaBanner from '@/components/transferencias/TransferenciaBanner'
import { TapCarIsotipo, TapCarWordmark } from '@/components/brand/Logo'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; transferencia?: string }>
}) {
  const { invite, transferencia } = await searchParams

  return (
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <TapCarIsotipo className="mx-auto mb-2 size-14" />
          <TapCarWordmark className="text-3xl" />
          <p className="mt-2 text-sm text-acero">Ingresa para gestionar tu flota: documentos, uso y estado de cada vehículo.</p>
        </div>
        {invite && <InvitationBanner token={invite} />}
        {transferencia && <TransferenciaBanner token={transferencia} />}
        <div className="rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
          <LoginForm destino={transferencia ? `/transferencias/${transferencia}` : undefined} />
        </div>
      </div>
    </main>
  )
}
