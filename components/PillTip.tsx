'use client'
import Popover from '@/components/Popover'

// Pill clickeable con popover. El comportamiento (abrir/cerrar, click fuera,
// Escape) vive en `Popover`, compartido con `InfoTip`; acá solo van los tonos.
const TONOS = {
  azul: 'bg-azul/10 text-azul',
  rojo: 'bg-[#FCE7E7] text-[#C81E1E]',
  ambar: 'bg-[#FDF1DC] text-[#B45309]',
} as const

export default function PillTip({
  label,
  tono,
  alineacion,
  children,
}: {
  label: string
  tono: keyof typeof TONOS
  alineacion?: 'derecha' | 'izquierda'
  children: React.ReactNode
}) {
  return (
    <Popover
      etiqueta={label}
      alineacion={alineacion}
      claseBoton={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul ${TONOS[tono]}`}
    >
      {children}
    </Popover>
  )
}
