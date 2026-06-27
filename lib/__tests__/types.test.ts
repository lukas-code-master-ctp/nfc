import { describe, it, expect } from 'vitest'
import { DOCUMENT_TYPE_LABELS, REMINDER_MILESTONES } from '@/lib/types'

describe('tipos del dominio', () => {
  it('tiene etiqueta para cada tipo de documento', () => {
    expect(DOCUMENT_TYPE_LABELS.permiso_circulacion).toBe('Permiso de Circulación')
    expect(DOCUMENT_TYPE_LABELS.revision_tecnica).toBe('Revisión Técnica')
    expect(DOCUMENT_TYPE_LABELS.soap).toBe('SOAP')
    expect(DOCUMENT_TYPE_LABELS.certificado_gases).toBe('Certificado de Gases')
    expect(DOCUMENT_TYPE_LABELS.padron).toBe('Padrón')
    expect(DOCUMENT_TYPE_LABELS.otro).toBe('Otro')
  })

  it('define los hitos de recordatorio', () => {
    expect(REMINDER_MILESTONES).toEqual([30, 7, 0])
  })
})
