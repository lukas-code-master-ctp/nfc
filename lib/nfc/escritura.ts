// Lógica pura de la escritura de chips NFC: traduce los errores del navegador a
// mensajes accionables en español. Sin DOM ni React, para poder testearla.

export type MensajeNfc = { titulo: string; detalle: string }

/** Estado del permiso 'nfc'. 'desconocido' = el navegador no permitió consultarlo. */
export type EstadoPermiso = 'granted' | 'denied' | 'prompt' | 'desconocido'

/** El corte por tiempo no viene de una excepción: lo decide el componente. */
export const MENSAJE_TIMEOUT: MensajeNfc = {
  titulo: 'No detectamos ningún chip',
  detalle: 'Vuelve a intentar y mantén el chip apoyado en la parte de arriba del teléfono.',
}

function nombreDe(err: unknown): string {
  return err instanceof Error ? err.name : ''
}

/**
 * El spec de Web NFC usa `NotAllowedError` para dos cosas distintas: permiso
 * denegado y «overwrite:false sobre un chip que ya tenía datos». El `name` no
 * alcanza para distinguirlas; si el permiso está concedido, solo pudo ser el chip.
 */
export function esChipConDatos(err: unknown, permiso: EstadoPermiso): boolean {
  return nombreDe(err) === 'NotAllowedError' && permiso === 'granted'
}

export function mensajeErrorNfc(err: unknown): MensajeNfc {
  switch (nombreDe(err)) {
    case 'NotAllowedError':
      return {
        titulo: 'Falta el permiso de NFC',
        detalle: 'Ábrelo desde el candado de la barra de direcciones y vuelve a intentar.',
      }
    case 'NotReadableError':
      return {
        titulo: 'El NFC del teléfono está apagado',
        detalle: 'Actívalo en los ajustes del teléfono y reintenta.',
      }
    case 'NotSupportedError':
      return {
        titulo: 'Este chip no se puede grabar',
        detalle: 'Puede estar bloqueado, sin espacio o ser de un tipo incompatible.',
      }
    case 'NetworkError':
      return {
        titulo: 'Se soltó el chip antes de terminar',
        detalle: 'Mantenlo apoyado hasta que aparezca el check verde.',
      }
    default:
      return {
        titulo: 'No pudimos grabar el chip',
        detalle: 'Vuelve a intentar. Si sigue fallando, graba el chip con la app NFC Tools.',
      }
  }
}
