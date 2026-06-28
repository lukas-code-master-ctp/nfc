import type { DocStatus } from '@/lib/documents/status'

const STYLES: Record<DocStatus, string> = {
  al_dia: 'bg-[#E7F6EC] text-[#15803D]',
  por_vencer: 'bg-[#FDF1DC] text-[#B45309]',
  vencido: 'bg-[#FCE7E7] text-[#C81E1E]',
  sin_vencimiento: 'bg-[#EEF0F3] text-acero',
}

const LABELS: Record<'document' | 'vehicle', Record<DocStatus, string>> = {
  // Estado de un documento individual
  document: {
    al_dia: 'Vigente',
    por_vencer: 'Por vencer',
    vencido: 'Vencido',
    sin_vencimiento: 'Sin vencimiento',
  },
  // Estado resumido de un vehículo (peor estado de sus documentos)
  vehicle: {
    al_dia: 'Al día',
    por_vencer: 'Documentos por vencer',
    vencido: 'Documentos vencidos',
    sin_vencimiento: 'Sin vencimientos',
  },
}

export default function StatusBadge({
  status,
  variant = 'document',
}: {
  status: DocStatus
  variant?: 'document' | 'vehicle'
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      {LABELS[variant][status]}
    </span>
  )
}
