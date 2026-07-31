/**
 * Cierre de sesiones a distancia. Sin Firebase, para poder testearlo.
 *
 * Vive aparte porque mezcla dos unidades y ahí es donde se cometen los errores:
 * `auth_time` viene en SEGUNDOS desde epoch y `sesionesValidasDesde` es un ISO.
 */

/**
 * El instante de corte que se guarda al revocar, **truncado al segundo**.
 *
 * El truncado no es cosmético. Revocas a las 12:00:00.500 y vuelves a entrar a
 * las 12:00:00.900: tu `auth_time` se trunca a 12:00:00, que es *menor* que el
 * instante de revocación, y quedarías fuera justo después de haber iniciado
 * sesión bien. Con el corte truncado, la re-entrada da igualdad y la
 * comparación estricta la deja pasar.
 */
export function instanteDeCorte(ahoraMs: number): string {
  return new Date(Math.floor(ahoraMs / 1000) * 1000).toISOString()
}

/** ¿Esta sesión quedó fuera por una revocación posterior a su inicio? */
export function sesionRevocada(
  authTimeSegundos: number | undefined,
  validasDesde: string | undefined,
): boolean {
  if (!validasDesde) return false
  const corte = Date.parse(validasDesde)
  if (Number.isNaN(corte)) return false
  // Sin `authTime` se trata como NO revocada. Falla abierta a propósito: el
  // resto de las barreras sigue en pie, y fallar cerrada acá desconectaría a
  // todos los usuarios si el claim cambiara de nombre.
  if (authTimeSegundos === undefined) return false
  return authTimeSegundos * 1000 < corte
}
