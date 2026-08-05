import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { isAdminEmail } from '@/lib/auth/admin'
import { listAllCompanies } from '@/lib/data/admin'
import { listPromoCodes } from '@/lib/data/promoCodes'
import { PRICE_PER_VEHICLE, cargoDe, formatCLP } from '@/lib/billing'
import BackLink from '@/components/BackLink'
import AdminCompaniesTable from '@/components/admin/AdminCompaniesTable'
import PromoCodesPanel from '@/components/admin/PromoCodesPanel'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  // Falla cerrado: si no es admin, la ruta no existe para él.
  if (!isAdminEmail(user.email)) notFound()

  const [companies, codigos] = await Promise.all([listAllCompanies(), listPromoCodes()])
  const totalVehiculos = companies.reduce((sum, c) => sum + c.maxVehiculos, 0)
  // Estimación a tarifa mensual: el panel no distingue periodicidad por empresa.
  const recaudacion = cargoDe({ vehiculos: totalVehiculos, periodicidad: 'mensual' }).monto

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <BackLink />
      <div className="mb-6 mt-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tinta">Administración</h1>
          <p className="mt-1 text-sm text-acero">
            {companies.length} {companies.length === 1 ? 'empresa' : 'empresas'} · configura el cupo de vehículos del plan de cada una.
          </p>
        </div>
        {/* Un enlace y no un botón con `fetch`: el navegador se encarga de la
            descarga, así que no hay estado de carga que se pueda quedar
            encendido si el servidor falla, ni un solo byte de JavaScript. */}
        <a
          href="/api/admin/export"
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Exportar a Excel
        </a>
      </div>

      <section className="mb-6 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <p className="text-sm text-acero">Recaudación mensual estimada</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-tinta">{formatCLP(recaudacion)}</p>
        <p className="mt-1 text-xs text-acero">
          {totalVehiculos} {totalVehiculos === 1 ? 'vehículo' : 'vehículos'} en planes × {formatCLP(PRICE_PER_VEHICLE)} / mes
        </p>
      </section>

      {/* Se recorta a lo que la tabla muestra: `listAllCompanies` ahora trae
          también el RUT, el teléfono y la última conexión para el export, y
          pasarlos enteros los mandaría al navegador en una página que no
          renderiza ninguno de los tres. */}
      <AdminCompaniesTable
        companies={companies.map(({ companyId, razonSocial, ownerEmail, vehicleCount, maxVehiculos }) => ({
          companyId,
          razonSocial,
          ownerEmail,
          vehicleCount,
          maxVehiculos,
        }))}
      />
      <PromoCodesPanel codigos={codigos} />
    </main>
  )
}
