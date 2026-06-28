export const dynamic = 'force-dynamic'

export default function FacturacionPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-tinta">Facturación</h1>
      <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-12 text-center">
        <p className="font-medium text-tinta">Próximamente</p>
        <p className="mt-1 text-sm text-acero">Aquí podrás gestionar tu plan y tus métodos de pago.</p>
      </div>
    </main>
  )
}
