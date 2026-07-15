import type { EstadoMantencion } from '@/lib/mantencion/status'

export function hitoMantencion(estado: EstadoMantencion, enviados: string[]): 'proxima' | 'vencida' | null {
  if (estado === 'vencida' && !enviados.includes('vencida')) return 'vencida'
  if (estado === 'proxima' && !enviados.includes('proxima')) return 'proxima'
  return null
}
