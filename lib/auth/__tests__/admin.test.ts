import { describe, it, expect, afterEach } from 'vitest'
import { isAdminEmail } from '@/lib/auth/admin'

const original = process.env.ADMIN_EMAILS

afterEach(() => {
  process.env.ADMIN_EMAILS = original
})

describe('isAdminEmail', () => {
  it('reconoce un correo de la allowlist (case-insensitive, con espacios)', () => {
    process.env.ADMIN_EMAILS = 'a@x.cl, B@X.cl'
    expect(isAdminEmail('a@x.cl')).toBe(true)
    expect(isAdminEmail('  A@X.CL ')).toBe(true)
    expect(isAdminEmail('b@x.cl')).toBe(true)
  })

  it('rechaza correos fuera de la lista', () => {
    process.env.ADMIN_EMAILS = 'a@x.cl'
    expect(isAdminEmail('otro@x.cl')).toBe(false)
  })

  it('falla cerrado: sin variable o sin correo, nadie es admin', () => {
    delete process.env.ADMIN_EMAILS
    expect(isAdminEmail('a@x.cl')).toBe(false)
    process.env.ADMIN_EMAILS = 'a@x.cl'
    expect(isAdminEmail('')).toBe(false)
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
  })
})
