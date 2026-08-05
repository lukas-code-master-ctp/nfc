import { describe, it, expect } from 'vitest'
import { tiposDisponibles } from '@/lib/documents/tipos'
import {
  DOCUMENT_TYPES_ELEGIBLES,
  DOCUMENT_TYPES_DESCONTINUADOS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES_SIN_VENCIMIENTO,
  esDocumentType,
  tipoTieneVencimiento,
} from '@/lib/types'

describe('el catálogo de tipos', () => {
  it('el Certificado de Gases ya no se ofrece al crear', () => {
    expect(DOCUMENT_TYPES_ELEGIBLES).not.toContain('certificado_gases')
  })

  // Se borra del selector pero NO del enum: los documentos ya cargados se
  // muestran con DOCUMENT_TYPE_LABELS en la ficha pública que ve un carabinero,
  // y sin la etiqueta ese label quedaría vacío.
  it('pero sigue teniendo etiqueta, para los que ya están cargados', () => {
    expect(DOCUMENT_TYPE_LABELS.certificado_gases).toBe('Certificado de Gases')
    expect(esDocumentType('certificado_gases')).toBe(true)
  })

  it('el Certificado de Homologación se ofrece y no vence', () => {
    expect(DOCUMENT_TYPES_ELEGIBLES).toContain('certificado_homologacion')
    expect(DOCUMENT_TYPES_SIN_VENCIMIENTO.has('certificado_homologacion')).toBe(true)
    expect(tipoTieneVencimiento('certificado_homologacion')).toBe(false)
  })

  it('un tipo inventado no pasa la guarda', () => {
    expect(esDocumentType('certificado_cualquier_cosa')).toBe(false)
    expect(esDocumentType(null)).toBe(false)
    expect(esDocumentType('toString')).toBe(false)
  })

  it('ningún descontinuado queda en la lista de elegibles', () => {
    for (const t of DOCUMENT_TYPES_DESCONTINUADOS) {
      expect(DOCUMENT_TYPES_ELEGIBLES).not.toContain(t)
    }
  })
})

describe('tiposDisponibles', () => {
  it('sin documentos cargados ofrece todos los elegibles', () => {
    expect(tiposDisponibles({ usados: [] })).toEqual(DOCUMENT_TYPES_ELEGIBLES)
  })

  it('saca de la lista el tipo que ya está cargado', () => {
    const r = tiposDisponibles({ usados: ['soap'] })
    expect(r).not.toContain('soap')
    expect(r).toContain('permiso_circulacion')
  })

  // `otro` es el cajón para todo lo demás: tiene que poder repetirse.
  it('"Otro" sigue disponible aunque ya haya uno cargado', () => {
    expect(tiposDisponibles({ usados: ['otro', 'otro'] })).toContain('otro')
  })

  it('con todos los tipos cargados solo queda "Otro"', () => {
    expect(tiposDisponibles({ usados: DOCUMENT_TYPES_ELEGIBLES })).toEqual(['otro'])
  })

  it('nunca devuelve una lista vacía: el selector siempre tiene algo', () => {
    expect(tiposDisponibles({ usados: [...DOCUMENT_TYPES_ELEGIBLES, 'certificado_gases'] }).length)
      .toBeGreaterThan(0)
  })

  describe('al editar un documento', () => {
    it('su propio tipo se sigue ofreciendo aunque esté usado', () => {
      expect(tiposDisponibles({ usados: ['soap'], incluir: 'soap' })).toContain('soap')
    })

    it('pero los tipos de los OTROS documentos no', () => {
      const r = tiposDisponibles({ usados: ['soap', 'padron'], incluir: 'soap' })
      expect(r).toContain('soap')
      expect(r).not.toContain('padron')
    })

    // Sin esto, abrir la edición de un documento de gases lo dejaría con el
    // select en blanco y guardar le cambiaría el tipo sin que nadie lo pidiera.
    it('un tipo descontinuado se ofrece si es el del documento que se edita', () => {
      const r = tiposDisponibles({ usados: ['certificado_gases'], incluir: 'certificado_gases' })
      expect(r).toContain('certificado_gases')
    })

    it('un descontinuado NO aparece si no es el del documento que se edita', () => {
      expect(tiposDisponibles({ usados: [], incluir: 'soap' })).not.toContain('certificado_gases')
    })
  })
})
