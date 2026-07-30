import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { EMPTY_COMPANY, DEFAULT_AVISO_USO_HORAS } from '@/lib/types'
import BackLink from '@/components/BackLink'
import CompanyCard from '@/components/company/CompanyCard'
import PlataformaCard from '@/components/company/PlataformaCard'
import CategoriasCard from '@/components/company/CategoriasCard'
import PautaMantencionCard from '@/components/company/PautaMantencionCard'
import TeamCard from '@/components/company/TeamCard'
import DriversCard from '@/components/drivers/DriversCard'
import RecuperarGuia from '@/components/onboarding/RecuperarGuia'
import AvisosOnboarding from '@/components/onboarding/AvisosOnboarding'
import { debeMostrarTarjeta } from '@/lib/onboarding/pasos'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  const company = await getCompany(m.companyId)
  const esAdmin = can(m.role, 'billing:manage')
  // Cinco de los nueve pasos del onboarding se completan en esta página, y el
  // progreso solo se deriva en el render del dashboard: sin este aviso, guardar
  // acá no daba ninguna señal de haber avanzado. Se apaga con el onboarding
  // terminado u oculto, igual que la tarjeta.
  const onboardingActivo = debeMostrarTarjeta(company?.onboarding, esAdmin)
  const puedeGestionarConductores = can(m.role, 'driver:manage')

  return (
    <AvisosOnboarding activo={onboardingActivo}>
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

      {esAdmin && <PlataformaCard avisoUsoHoras={company?.avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS} />}
      {esAdmin && <div id="categorias" className="scroll-mt-20"><CategoriasCard initial={company?.categorias ?? []} /></div>}
      {esAdmin && <div id="mantencion" className="scroll-mt-20"><PautaMantencionCard initial={company?.pautaMantencion ?? {}} /></div>}

      {esAdmin && <div id="equipo" className="scroll-mt-20"><TeamCard currentUid={m.uid} /></div>}
      {puedeGestionarConductores && <div id="conductores" className="scroll-mt-20"><DriversCard /></div>}

      {/* La tarjeta del dashboard desaparece al completarse y el enlace para pasar
          a cuenta de empresa vive dentro de ella: esta card es la única salida que
          le queda a una cuenta personal ya terminada. Se renderiza si aplica al
          menos uno de sus dos bloques: "volver a mostrarla" (descartada y NO
          completa; completa no tiene nada que reaparecer) o "cambiar a empresa"
          (cuenta personal, completa o no). Un Administrador de una cuenta de
          empresa con el onboarding terminado no cae en ninguno: no ve nada. */}
      {esAdmin && (
        (company?.onboarding?.descartadoEn && !company?.onboarding?.completadoEn) ||
        company?.onboarding?.tipoCuenta === 'personal'
      ) && (
        <RecuperarGuia
          descartada={Boolean(company?.onboarding?.descartadoEn)}
          completada={Boolean(company?.onboarding?.completadoEn)}
          esPersonal={company?.onboarding?.tipoCuenta === 'personal'}
        />
      )}
    </main>
    </AvisosOnboarding>
  )
}
