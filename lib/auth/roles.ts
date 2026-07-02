// Roles de un miembro DENTRO de una empresa (distinto del admin de plataforma).
export type Role = 'admin' | 'editor' | 'viewer'
export type Action = 'read' | 'document:write' | 'vehicle:write' | 'billing:manage' | 'team:manage'

const MATRIX: Record<Role, Set<Action>> = {
  viewer: new Set<Action>(['read']),
  editor: new Set<Action>(['read', 'document:write']),
  admin: new Set<Action>(['read', 'document:write', 'vehicle:write', 'billing:manage', 'team:manage']),
}

export function can(role: Role, action: Action): boolean {
  return MATRIX[role]?.has(action) ?? false
}
