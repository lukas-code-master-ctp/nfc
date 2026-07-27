import { describe, it, expect } from 'vitest'
import { mensajeErrorNfc, esChipConDatos, MENSAJE_TIMEOUT } from '@/lib/nfc/escritura'

/** Arma un DOMException-like: lo que importa del error es su `name`. */
const errorCon = (name: string) => Object.assign(new Error('falló'), { name })

describe('mensajeErrorNfc', () => {
  it('explica el permiso denegado', () => {
    expect(mensajeErrorNfc(errorCon('NotAllowedError')).titulo).toBe('Falta el permiso de NFC')
  })

  it('explica el NFC apagado', () => {
    expect(mensajeErrorNfc(errorCon('NotReadableError')).titulo).toBe('El NFC del teléfono está apagado')
  })

  it('explica el chip incompatible', () => {
    expect(mensajeErrorNfc(errorCon('NotSupportedError')).titulo).toBe('Este chip no se puede grabar')
  })

  it('explica que se soltó el chip a mitad de camino', () => {
    expect(mensajeErrorNfc(errorCon('NetworkError')).titulo).toBe('Se soltó el chip antes de terminar')
  })

  it('cae al mensaje genérico ante un error desconocido', () => {
    expect(mensajeErrorNfc(errorCon('BoomError')).titulo).toBe('No pudimos grabar el chip')
  })

  it('no explota si lo que llega no es un Error', () => {
    expect(mensajeErrorNfc('qué pasó').titulo).toBe('No pudimos grabar el chip')
  })

  it('siempre trae un detalle no vacío', () => {
    for (const name of ['NotAllowedError', 'NotReadableError', 'NotSupportedError', 'NetworkError', 'X']) {
      expect(mensajeErrorNfc(errorCon(name)).detalle.length).toBeGreaterThan(0)
    }
  })

  it('el mensaje de timeout es propio y no viene de una excepción', () => {
    expect(MENSAJE_TIMEOUT.titulo).toBe('No detectamos ningún chip')
  })
})

describe('esChipConDatos', () => {
  it('es true con NotAllowedError y el permiso concedido', () => {
    expect(esChipConDatos(errorCon('NotAllowedError'), 'granted')).toBe(true)
  })

  it('es false si el permiso no está concedido: ahí el NotAllowedError fue del permiso', () => {
    expect(esChipConDatos(errorCon('NotAllowedError'), 'prompt')).toBe(false)
    expect(esChipConDatos(errorCon('NotAllowedError'), 'denied')).toBe(false)
    expect(esChipConDatos(errorCon('NotAllowedError'), 'desconocido')).toBe(false)
  })

  it('es false para cualquier otro error aunque haya permiso', () => {
    expect(esChipConDatos(errorCon('NetworkError'), 'granted')).toBe(false)
    expect(esChipConDatos(null, 'granted')).toBe(false)
  })
})
