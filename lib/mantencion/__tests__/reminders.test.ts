import { describe, it, expect } from 'vitest'
import { hitoMantencion } from '@/lib/mantencion/reminders'

describe('hitoMantencion', () => {
  it('vencida no enviada → vencida', () => { expect(hitoMantencion('vencida', [])).toBe('vencida') })
  it('próxima no enviada → proxima', () => { expect(hitoMantencion('proxima', [])).toBe('proxima') })
  it('no repite un hito ya enviado', () => {
    expect(hitoMantencion('proxima', ['proxima'])).toBeNull()
    expect(hitoMantencion('vencida', ['vencida'])).toBeNull()
  })
  it('al día / sin pauta / sin registro → null', () => {
    expect(hitoMantencion('al_dia', [])).toBeNull()
    expect(hitoMantencion('sin_pauta', [])).toBeNull()
    expect(hitoMantencion('sin_registro', [])).toBeNull()
  })
})
