import Link from 'next/link'

type Entrante = { token: string; patente: string; deCompanyNombre: string }

/**
 * Red de seguridad del flujo de transferencia: quien cerró el correo o se
 * registró por su cuenta igual encuentra acá el vehículo que le ofrecieron.
 */
export default function TransferenciasEntrantes({ items }: { items: Entrante[] }) {
  if (items.length === 0) return null

  return (
    <div className="mb-6 space-y-2">
      {items.map((t) => (
        <div
          key={t.token}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-azul/30 bg-azul/5 px-4 py-3"
        >
          <p className="text-sm text-tinta">
            <strong>{t.deCompanyNombre || 'Otra empresa'}</strong> te quiere transferir el vehículo{' '}
            <strong>{t.patente}</strong>.
          </p>
          <Link
            href={`/transferencias/${t.token}`}
            className="shrink-0 rounded-lg bg-azul px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
          >
            Revisar
          </Link>
        </div>
      ))}
    </div>
  )
}
