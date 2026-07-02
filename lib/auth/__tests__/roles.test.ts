import { describe, it, expect } from 'vitest'
import { can } from '@/lib/auth/roles'

describe('can', () => {
  it('viewer solo lee', () => {
    expect(can('viewer', 'read')).toBe(true)
    expect(can('viewer', 'document:write')).toBe(false)
    expect(can('viewer', 'vehicle:write')).toBe(false)
    expect(can('viewer', 'billing:manage')).toBe(false)
  })
  it('editor lee y escribe documentos, no vehículos ni facturación', () => {
    expect(can('editor', 'read')).toBe(true)
    expect(can('editor', 'document:write')).toBe(true)
    expect(can('editor', 'vehicle:write')).toBe(false)
    expect(can('editor', 'billing:manage')).toBe(false)
    expect(can('editor', 'team:manage')).toBe(false)
  })
  it('admin puede todo', () => {
    for (const a of ['read', 'document:write', 'vehicle:write', 'billing:manage', 'team:manage'] as const) {
      expect(can('admin', a)).toBe(true)
    }
  })
})
