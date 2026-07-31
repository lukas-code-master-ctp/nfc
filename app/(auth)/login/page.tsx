import LoginForm from '@/components/LoginForm'
import InvitationBanner from '@/components/InvitationBanner'
import TransferenciaBanner from '@/components/transferencias/TransferenciaBanner'
import { TapCarIsotipo, TapCarWordmark } from '@/components/brand/Logo'
import SesionViva from '@/components/auth/SesionViva'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; transferencia?: string }>
}) {
  const { invite, transferencia } = await searchParams
  const destino = transferencia ? `/transferencias/${transferencia}` : undefined

  return (
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      {/* Con `?invite=<token>` no se auto-entra: una invitación exige
          autenticarse como un correo específico, y si el navegador ya tiene
          viva la sesión de Firebase de OTRA cuenta, la auto-entrada mandaría
          a esa cuenta al dashboard antes de que el usuario alcance a leer el
          `InvitationBanner` o a iniciar sesión con el correo invitado. */}
      <SesionViva autoEntrar={!invite} destino={destino} />
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <TapCarIsotipo className="mx-auto mb-2 size-14" />
          <TapCarWordmark className="text-3xl" />
          <p className="mt-2 text-sm text-acero">Ingresa para gestionar tu flota: documentos, uso y estado de cada vehículo.</p>
        </div>
        {invite && <InvitationBanner token={invite} />}
        {transferencia && <TransferenciaBanner token={transferencia} />}
        <div className="rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
          <LoginForm destino={destino} />
        </div>
      </div>
    </main>
  )
}
