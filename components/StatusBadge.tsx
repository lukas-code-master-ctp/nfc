import type { DocStatus } from '@/lib/documents/status'

const MAP: Record<DocStatus, { label: string; cls: string }> = {
  al_dia: { label: 'Vigente', cls: 'bg-[#E7F6EC] text-[#15803D]' },
  por_vencer: { label: 'Por vencer', cls: 'bg-[#FDF1DC] text-[#B45309]' },
  vencido: { label: 'Vencido', cls: 'bg-[#FCE7E7] text-[#C81E1E]' },
  sin_vencimiento: { label: 'Sin vencimiento', cls: 'bg-[#EEF0F3] text-acero' },
}

export default function StatusBadge({ status }: { status: DocStatus }) {
  const { label, cls } = MAP[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
  )
}
