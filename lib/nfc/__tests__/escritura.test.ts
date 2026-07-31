import { describe, it, expect } from 'vitest'
import {
  mensajeErrorNfc,
  resolverFalloNfc,
  nombreErrorNfc,
  MENSAJE_TIMEOUT,
  type EstadoPermiso,
  type FalloNfc,
} from '@/lib/nfc/escritura'

/** Arma un DOMException-like: lo que importa del error es su `name`. */
const errorCon = (name: string) => Object.assign(new Error('falló'), { name })

/** Extrae el mensaje de un fallo que no pide confirmación. */
function mensajeDe(fallo: FalloNfc) {
  if (fallo.confirmar) throw new Error('se esperaba un error, no una confirmación')
  return fallo.mensaje
}

describe('mensajeErrorNfc', () => {
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
    for (const name of ['NotReadableError', 'NotSupportedError', 'NetworkError', 'X']) {
      expect(mensajeErrorNfc(errorCon(name)).detalle.length).toBeGreaterThan(0)
    }
  })

  it('todos sus mensajes se pueden reintentar', () => {
    for (const name of ['NotReadableError', 'NotSupportedError', 'NetworkError', 'X']) {
      expect(mensajeErrorNfc(errorCon(name)).reintentable).toBe(true)
    }
  })

  it('el mensaje de timeout es propio y no viene de una excepción', () => {
    expect(MENSAJE_TIMEOUT.titulo).toBe('No detectamos ningún chip')
    expect(MENSAJE_TIMEOUT.reintentable).toBe(true)
  })
})

const PERMISOS: EstadoPermiso[] = ['granted', 'denied', 'prompt', 'desconocido']

describe('resolverFalloNfc', () => {
  it('no consulta el permiso para errores que no son NotAllowedError', () => {
    for (const permiso of PERMISOS) {
      expect(mensajeDe(resolverFalloNfc(errorCon('NotReadableError'), permiso, false)).titulo).toBe(
        'El NFC del teléfono está apagado',
      )
    }
  })

  it('con el permiso concedido, el NotAllowedError solo pudo venir del chip', () => {
    expect(resolverFalloNfc(errorCon('NotAllowedError'), 'granted', false)).toEqual({ confirmar: true })
  })

  it('pero ya no, si veníamos sobrescribiendo: un chip escrito no rechaza un overwrite', () => {
    const fallo = resolverFalloNfc(errorCon('NotAllowedError'), 'granted', true)
    expect(fallo.confirmar).toBe(false)
    expect(mensajeDe(fallo).titulo).toBe('No pudimos grabar el chip')
  })

  it('con el permiso sin responder, reintentar vuelve a mostrar el diálogo', () => {
    const mensaje = mensajeDe(resolverFalloNfc(errorCon('NotAllowedError'), 'prompt', false))
    expect(mensaje.titulo).toBe('Falta aceptar el permiso de NFC')
    expect(mensaje.reintentable).toBe(true)
  })

  it('con el permiso bloqueado NO se puede reintentar: hay que cambiarlo a mano', () => {
    const mensaje = mensajeDe(resolverFalloNfc(errorCon('NotAllowedError'), 'denied', false))
    expect(mensaje.titulo).toBe('El NFC está bloqueado para este sitio')
    expect(mensaje.reintentable).toBe(false)
  })

  it('sigue bloqueado aunque el intento fuera con overwrite', () => {
    expect(mensajeDe(resolverFalloNfc(errorCon('NotAllowedError'), 'denied', true)).reintentable).toBe(false)
  })

  it('sin poder consultar el permiso, nombra las dos causas en vez de elegir una', () => {
    const mensaje = mensajeDe(resolverFalloNfc(errorCon('NotAllowedError'), 'desconocido', false))
    expect(mensaje.detalle).toContain('permiso')
    expect(mensaje.detalle).toContain('datos')
    expect(mensaje.reintentable).toBe(true)
  })

  it('nunca pide confirmar sin permiso concedido: ahí el chip ni se tocó', () => {
    for (const permiso of ['denied', 'prompt', 'desconocido'] as EstadoPermiso[]) {
      expect(resolverFalloNfc(errorCon('NotAllowedError'), permiso, false).confirmar).toBe(false)
    }
  })
})

describe('nombreErrorNfc', () => {
  it('devuelve el name del error', () => {
    expect(nombreErrorNfc(errorCon('NotAllowedError'))).toBe('NotAllowedError')
  })

  it('tiene una etiqueta para lo que no es un Error', () => {
    expect(nombreErrorNfc('qué pasó')).toBe('desconocido')
  })
})
