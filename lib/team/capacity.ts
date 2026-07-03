import { MAX_MIEMBROS_EQUIPO } from '@/lib/types'

/** Cupos disponibles: 5 − miembros activos − invitaciones pendientes (nunca < 0). */
export function remainingSlots(activeMembers: number, pendingInvites: number): number {
  return Math.max(0, MAX_MIEMBROS_EQUIPO - activeMembers - pendingInvites)
}

export function canInvite(activeMembers: number, pendingInvites: number): boolean {
  return remainingSlots(activeMembers, pendingInvites) > 0
}
