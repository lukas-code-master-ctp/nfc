import { describe, it, expect } from 'vitest'
import { invitationSubject, invitationHtml, ROLE_LABELS } from '@/lib/email/invitationEmail'

describe('invitationSubject', () => {
  it('incluye el nombre de la empresa', () => {
    expect(invitationSubject('Transportes Sur')).toContain('Transportes Sur')
  })
  it('tolera empresa sin nombre', () => {
    expect(invitationSubject('')).toContain('TapCar')
  })
})

describe('invitationHtml', () => {
  it('incluye rol, quién invita y el enlace', () => {
    const html = invitationHtml({
      companyName: 'Transportes Sur',
      role: 'editor',
      inviterEmail: 'jefe@sur.cl',
      acceptUrl: 'https://app.tapcar.cl/login?invite=abc',
    })
    expect(html).toContain('Transportes Sur')
    expect(html).toContain(ROLE_LABELS.editor)
    expect(html).toContain('jefe@sur.cl')
    expect(html).toContain('https://app.tapcar.cl/login?invite=abc')
  })
})
