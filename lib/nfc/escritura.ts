// Lógica pura de la escritura de chips NFC: traduce los errores del navegador a
// mensajes accionables en español. Sin DOM ni React, para poder testearla.

export type MensajeNfc = {
  titulo: string
  detalle: string
  /**
   * Si reintentar puede llegar a funcionar. Con el permiso **bloqueado** no:
   * el navegador no vuelve a preguntar, así que ofrecer «Reintentar» deja al
   * usuario en un callejón — toca el botón, sale el mismo error, y nada cambia.
   */
  reintentable: boolean
}

/** Estado del permiso 'nfc'. 'desconocido' = el navegador no permitió consultarlo. */
export type EstadoPermiso = 'granted' | 'denied' | 'prompt' | 'desconocido'

/** El corte por tiempo no viene de una excepción: lo decide el componente. */
export const MENSAJE_TIMEOUT: MensajeNfc = {
  titulo: 'No detectamos ningún chip',
  detalle: 'Vuelve a intentar y mantén el chip apoyado en la parte de arriba del teléfono.',
  reintentable: true,
}

const GENERICO: MensajeNfc = {
  titulo: 'No pudimos grabar el chip',
  detalle: 'Vuelve a intentar. Si sigue fallando, graba el chip con la app NFC Tools.',
  reintentable: true,
}

/**
 * El usuario cerró o descartó el diálogo del navegador sin responder. Reintentar
 * sí sirve: el navegador vuelve a preguntar.
 */
const PERMISO_SIN_RESPONDER: MensajeNfc = {
  titulo: 'Falta aceptar el permiso de NFC',
  detalle: 'Toca «Permitir» cuando el teléfono te lo pregunte y acerca el chip.',
  reintentable: true,
}

/**
 * El usuario tocó «Bloquear» (o lo bloqueó antes). Acá el navegador ya no vuelve
 * a preguntar: la única salida es cambiarlo a mano en los permisos del sitio.
 */
const PERMISO_BLOQUEADO: MensajeNfc = {
  titulo: 'El NFC está bloqueado para este sitio',
  detalle:
    'Toca el ícono que está a la izquierda de la dirección, entra a Permisos, activa NFC y recarga la página.',
  reintentable: false,
}

/**
 * No pudimos consultar el permiso, así que no sabemos si el NotAllowedError vino
 * del permiso o del chip. Nombramos las dos causas en vez de elegir una al azar.
 */
const PERMISO_INDETERMINADO: MensajeNfc = {
  titulo: 'No pudimos grabar el chip',
  detalle:
    'Puede que falte el permiso de NFC o que el chip ya tenga datos grabados. Vuelve a intentar y acepta el permiso si te lo pide.',
  reintentable: true,
}

/** El `name` de la excepción, para el pie de diagnóstico. */
export function nombreErrorNfc(err: unknown): string {
  return err instanceof Error ? err.name : 'desconocido'
}

/**
 * Traduce el `name` de la excepción. **`NotAllowedError` no se resuelve acá**:
 * necesita el estado del permiso para desambiguarse, y eso vive en
 * `resolverFalloNfc`.
 */
export function mensajeErrorNfc(err: unknown): MensajeNfc {
  switch (nombreErrorNfc(err)) {
    case 'NotReadableError':
      return {
        titulo: 'El NFC del teléfono está apagado',
        detalle: 'Actívalo en los ajustes del teléfono y reintenta.',
        reintentable: true,
      }
    case 'NotSupportedError':
      return {
        titulo: 'Este chip no se puede grabar',
        detalle: 'Puede estar bloqueado, sin espacio o ser de un tipo incompatible.',
        reintentable: true,
      }
    case 'NetworkError':
      return {
        titulo: 'Se soltó el chip antes de terminar',
        detalle: 'Mantenlo apoyado hasta que aparezca el check verde.',
        reintentable: true,
      }
    default:
      return GENERICO
  }
}

/** Qué hacer tras un `write()` fallido: pedir confirmación o mostrar un error. */
export type FalloNfc = { confirmar: true } | { confirmar: false; mensaje: MensajeNfc }

/**
 * Web NFC usa `NotAllowedError` para **tres** situaciones distintas y el `name`
 * no las separa: permiso sin responder, permiso bloqueado, y «overwrite:false
 * sobre un chip que ya tenía datos». Quien las desambigua es el estado del
 * permiso, porque `write()` no llega a tocar el chip sin permiso concedido:
 *
 * - `granted` → el permiso está, así que solo pudo ser el chip (salvo que ya
 *   veníamos con `overwrite`, donde un chip escrito no es motivo de rechazo).
 * - `prompt` → nunca respondió el diálogo; reintentar lo vuelve a mostrar.
 * - `denied` → lo bloqueó; reintentar no sirve.
 * - `desconocido` → no se puede saber; se nombran las dos causas.
 */
export function resolverFalloNfc(err: unknown, permiso: EstadoPermiso, overwrite: boolean): FalloNfc {
  if (nombreErrorNfc(err) !== 'NotAllowedError') {
    return { confirmar: false, mensaje: mensajeErrorNfc(err) }
  }
  switch (permiso) {
    case 'granted':
      return overwrite ? { confirmar: false, mensaje: GENERICO } : { confirmar: true }
    case 'prompt':
      return { confirmar: false, mensaje: PERMISO_SIN_RESPONDER }
    case 'denied':
      return { confirmar: false, mensaje: PERMISO_BLOQUEADO }
    default:
      return { confirmar: false, mensaje: PERMISO_INDETERMINADO }
  }
}
