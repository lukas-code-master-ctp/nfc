import { describe, it, expect } from 'vitest'
import { buildFechaPrompt, parseFechaVision } from '@/lib/ai/documentoVision'

/** Instante fijo de referencia: el rango de cordura se mide desde acá. */
const AHORA = Date.parse('2026-07-31T12:00:00.000Z')

const respuesta = (vence: string | null) =>
  JSON.stringify({ vence })

describe('lo que sí es una fecha', () => {
  it('devuelve una fecha ISO válida', () => {
    expect(parseFechaVision(respuesta('2027-04-03'), AHORA)).toBe('2027-04-03')
  })

  it('acepta una fecha ya vencida: subir un documento viejo es legítimo', () => {
    expect(parseFechaVision(respuesta('2024-01-15'), AHORA)).toBe('2024-01-15')
  })

  it('extrae el JSON aunque venga con texto alrededor', () => {
    const raw = `Claro, acá está:\n${respuesta('2027-04-03')}\n¡Espero que sirva!`
    expect(parseFechaVision(raw, AHORA)).toBe('2027-04-03')
  })
})

describe('formatos que NO se aceptan', () => {
  // El proyecto ya tiene documentado el bug: una fechaVencimiento mal formada
  // hace que daysUntil dé NaN, documentStatus caiga a al_dia, y un documento
  // VENCIDO se pinte verde. Por eso acá no se acepta "casi".
  it('rechaza el ISO sin ceros a la izquierda', () => {
    expect(parseFechaVision(respuesta('2027-3-4'), AHORA)).toBeNull()
  })

  it('rechaza el formato chileno sin convertir', () => {
    expect(parseFechaVision(respuesta('03/04/2027'), AHORA)).toBeNull()
    expect(parseFechaVision(respuesta('03-04-2027'), AHORA)).toBeNull()
  })

  it('rechaza un ISO con hora', () => {
    expect(parseFechaVision(respuesta('2027-04-03T00:00:00Z'), AHORA)).toBeNull()
  })
})

describe('fechas que no existen en el calendario', () => {
  // El regex de formato sola las deja pasar: 2027-02-31 tiene la forma correcta.
  it('rechaza el 31 de febrero', () => {
    expect(parseFechaVision(respuesta('2027-02-31'), AHORA)).toBeNull()
  })

  it('rechaza el 31 de abril', () => {
    expect(parseFechaVision(respuesta('2027-04-31'), AHORA)).toBeNull()
  })

  it('rechaza el mes 13', () => {
    expect(parseFechaVision(respuesta('2027-13-01'), AHORA)).toBeNull()
  })
})

describe('fechas fuera de todo rango razonable', () => {
  // Alucinaciones típicas de un modelo leyendo una foto borrosa.
  it('rechaza un año muy pasado', () => {
    expect(parseFechaVision(respuesta('0207-04-03'), AHORA)).toBeNull()
  })

  it('rechaza un año muy futuro', () => {
    expect(parseFechaVision(respuesta('9999-12-31'), AHORA)).toBeNull()
  })
})

describe('respuestas que no traen fecha', () => {
  it('null explícito', () => {
    expect(parseFechaVision(respuesta(null), AHORA)).toBeNull()
  })

  it('respuesta vacía', () => {
    expect(parseFechaVision('', AHORA)).toBeNull()
  })

  it('texto sin JSON', () => {
    expect(parseFechaVision('No pude leer la fecha del documento.', AHORA)).toBeNull()
  })

  it('JSON roto', () => {
    expect(parseFechaVision('{"vence": ', AHORA)).toBeNull()
  })

  it('el campo no es texto', () => {
    expect(parseFechaVision('{"vence": 20270403}', AHORA)).toBeNull()
  })
})

describe('el prompt', () => {
  it('pide la respuesta en formato ISO', () => {
    expect(buildFechaPrompt()).toContain('AAAA-MM-DD')
  })

  it('advierte que en Chile se escribe DD-MM, o el modelo invierte día y mes', () => {
    expect(buildFechaPrompt()).toContain('DD-MM-AAAA')
  })

  it('pide la fecha de VENCIMIENTO, no la de emisión', () => {
    expect(buildFechaPrompt().toLowerCase()).toContain('emisión')
  })
})
