import type { DocStatus } from '@/lib/documents/status'

const MAP: Record<DocStatus, { label: string; cls: string }> = {
  al_dia: { label: 'Al día', cls: 'bg-green-100 text-green-800' },
  por_vencer: { label: 'Por vencer', cls: 'bg-yellow-100 text-yellow-800' },
  vencido: { label: 'Vencido', cls: 'bg-red-100 text-red-800' },
  sin_vencimiento: { label: 'Sin vencimiento', cls: 'bg-gray-100 text-gray-700' },
}

export default function StatusBadge({ status }: { status: DocStatus }) {
  const { label, cls } = MAP[status]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}
